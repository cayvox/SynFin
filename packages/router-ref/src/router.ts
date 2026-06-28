import {
  Decimal,
  assetEquals,
  checkRoutePlan,
  compareByWorstCase,
  computeWorstCaseReceiveNet,
  type AssetId,
  type NoViableRouteReason,
  type Quote,
  type RouteLeg,
  type RoutePlan,
  type RouteResult,
  type Router,
  type SwapIntent,
} from '@synfin/spec';

/**
 * `@synfin/router-ref` — the open reference implementation of the SQSS `Router`
 * port (ADR-0005, ADR-0007). A **correct, deterministic, depth-aware baseline**,
 * NOT the optimizer: heavy numerical optimization lives behind the same port in
 * the closed optimizer (ADR-0004).
 *
 * Allocation (ADR-0007; SPEC §4.2, §4.3, §4.4). From the eligible quotes
 * (assets match the intent, unexpired at `now`, venue allowed) the router builds
 * two candidate plans and returns the better of them by worst-case receive:
 *
 *  1. **Best single-venue fill** — the one quote that can cover the whole give
 *     at the best net receipt (the single-venue baseline).
 *  2. **Greedy multi-venue split** — allocate `min(quote.give, remaining)`
 *     across venues by best net rate, one leg per venue (each venue represented
 *     by its deepest bucket), splitting the remainder onto the next-best venue.
 *
 * Returning the better of the two guarantees the result is never worse than the
 * single-venue baseline (the monotonicity property, TESTING.md §2). Partial-fill
 * receipts are scaled down proportionally and rounded in the taker's favour
 * (never above the referenced quote). Every returned plan is self-validated with
 * `checkRoutePlan`; if none meets `minReceive`/`maxSlippageBps`, a typed
 * no-viable-route result is returned — never a constraint-violating plan.
 *
 * Determinism (ARCHITECTURE.md §1 invariant #5): pure; no clock, I/O, or
 * randomness. `now` is a per-call parameter (RFC-0002); ties break by a stable
 * rule (higher net rate, then lower `venueId`, then larger `give`, then lower
 * `quoteId`), so identical inputs yield identical output.
 *
 * It returns the standard {@link RouteResult} (SPEC §4.5; RFC-0002): a
 * self-validated plan, or a typed no-route reason. It never throws for
 * control flow. The reference router introduces zero extra slippage
 * (`slippageBps = 0`), so it only ever returns `'no-eligible-quotes'` or
 * `'min-receive-unreachable'` — never `'slippage-exceeded'` (that reason is
 * part of the port contract for routers that model slippage).
 */

interface Candidate {
  readonly venueId: string;
  readonly quoteId: string;
  readonly give: Decimal;
  readonly receive: Decimal;
  /** The source quote's networkFee, carried through unchanged (RFC-0005 §6). */
  readonly networkFee?: Quote['networkFee'];
}

function min(a: Decimal, b: Decimal): Decimal {
  return a.lte(b) ? a : b;
}

/** Compare two candidates best-first by net rate, with the documented stable tie-break. */
function compareCandidates(a: Candidate, b: Candidate): number {
  // Net rate a vs b without division: receive_a/give_a ? receive_b/give_b
  // <=> receive_a*give_b ? receive_b*give_a.
  const byRate = a.receive.mul(b.give).compare(b.receive.mul(a.give));
  if (byRate !== 0) return -byRate; // higher rate first
  if (a.venueId !== b.venueId) return a.venueId < b.venueId ? -1 : 1;
  const byGive = a.give.compare(b.give);
  if (byGive !== 0) return -byGive; // larger give (more capacity) first
  if (a.quoteId !== b.quoteId) return a.quoteId < b.quoteId ? -1 : 1;
  return 0;
}

function eligibleCandidates(
  intent: SwapIntent,
  quotes: readonly Quote[],
  now: Date,
): Candidate[] {
  const nowMs = now.getTime();
  const allow = intent.constraints?.venueAllowList;
  const allowed = allow ? new Set(allow) : undefined;
  const candidates: Candidate[] = [];
  for (const q of quotes) {
    if (!assetEquals(q.give.asset, intent.give.asset)) continue;
    if (!assetEquals(q.receive.asset, intent.want.asset)) continue;
    if (nowMs > new Date(q.validUntil).getTime()) continue; // expired
    if (allowed && !allowed.has(q.venueId)) continue;
    const give = Decimal.parse(q.give.amount);
    const receive = Decimal.parse(q.receive.amount);
    if (give === undefined || receive === undefined) continue;
    if (!give.isPositive() || !receive.isPositive()) continue;
    candidates.push({
      venueId: q.venueId,
      quoteId: q.quoteId,
      give,
      receive,
      ...(q.networkFee !== undefined ? { networkFee: q.networkFee } : {}),
    });
  }
  return candidates;
}

interface RouteContext {
  readonly giveAsset: SwapIntent['give']['asset'];
  readonly wantAsset: SwapIntent['want']['asset'];
  readonly wantDecimals: number;
  readonly total: Decimal;
  readonly intentRef: string;
}

/** Build a leg giving `giveAmt` against a candidate, with taker-favourable receipt. */
function buildLeg(
  cand: Candidate,
  giveAmt: Decimal,
  ctx: RouteContext,
): { leg: RouteLeg; receive: Decimal } {
  const receive = giveAmt.eq(cand.give)
    ? cand.receive
    : cand.receive.mul(giveAmt).divide(cand.give, ctx.wantDecimals, 'floor');
  // A split leg carries its source quote's networkFee unchanged (RFC-0005 §6,
  // the conservative choice). No quote fee means no leg fee.
  const leg: RouteLeg = {
    venueId: cand.venueId,
    give: { asset: ctx.giveAsset, amount: giveAmt.toString() },
    receive: { asset: ctx.wantAsset, amount: receive.toString() },
    quoteRef: cand.quoteId,
    ...(cand.networkFee !== undefined ? { networkFee: cand.networkFee } : {}),
  };
  return { leg, receive };
}

/**
 * Assemble a plan from legs whose receipts sum to `worst` (= aggregate). Returns
 * `undefined` when a plan is not constructible (RFC-0005): legs carrying network
 * fees in differing assets cannot be summed, and the net helper supports only a
 * give-or-receive-asset fee. That case does not occur with the current venues
 * (all fee in the give asset); it is skipped rather than guessed.
 */
function planFromLegs(
  legs: RouteLeg[],
  worst: Decimal,
  ctx: RouteContext,
): RoutePlan | undefined {
  const base: RoutePlan = {
    intentRef: ctx.intentRef,
    legs: legs as [RouteLeg, ...RouteLeg[]],
    aggregateReceive: worst.toString(),
    // Reference router commits to the quoted receipts as the basis: worst case
    // equals the aggregate and it introduces no extra slippage. A firmness-aware
    // haircut model is left to the optimizer (ADR-0007).
    worstCaseReceive: worst.toString(),
    slippageBps: 0,
  };

  // Aggregate the per-leg network fees (RFC-0005 §6): each leg carries its source
  // quote's fee unchanged, so the plan fee is their sum in a single asset.
  let feeAsset: AssetId | undefined;
  let feeSum = Decimal.zero();
  let hasFee = false;
  for (const leg of legs) {
    const f = leg.networkFee;
    if (f === undefined) continue;
    hasFee = true;
    if (feeAsset === undefined) {
      feeAsset = f.asset;
    } else if (!assetEquals(f.asset, feeAsset)) {
      return undefined; // mixed-asset fees: not summable, not constructible here.
    }
    const amount = Decimal.parse(f.amount);
    if (amount === undefined) return undefined; // defensive: amount is shape-valid.
    feeSum = feeSum.add(amount);
  }
  // Fee-free: omit networkFee and worstCaseReceiveNet, byte-for-byte as before.
  if (!hasFee || feeAsset === undefined) return base;

  // Net-value (RFC-0005 §3): the figure the router ranks on. worstCaseReceive
  // stays the gross buy-asset floor; the net re-bases it against the total give
  // outlay, per the intent's give.
  const net = computeWorstCaseReceiveNet(
    worst,
    { asset: ctx.giveAsset, amount: ctx.total },
    ctx.wantAsset,
    { asset: feeAsset, amount: feeSum },
  );
  if (!net.ok) return undefined; // unsupported fee asset (should not occur).

  return {
    ...base,
    networkFee: { asset: feeAsset, amount: feeSum.toString() },
    worstCaseReceiveNet: net.value.toString(),
  };
}

interface PlanCandidate {
  readonly plan: RoutePlan;
  readonly worst: Decimal;
}

/** Candidate 1: the best single quote that can cover the whole give. */
function bestSingleVenue(
  candidates: readonly Candidate[],
  ctx: RouteContext,
): PlanCandidate | undefined {
  let best: PlanCandidate | undefined;
  let bestCand: Candidate | undefined;
  for (const cand of candidates) {
    if (cand.give.lt(ctx.total)) continue; // cannot cover the whole give alone
    const { leg, receive } = buildLeg(cand, ctx.total, ctx);
    const plan = planFromLegs([leg], receive, ctx);
    if (plan === undefined) continue; // not constructible (mixed/unsupported fee)
    if (best === undefined || bestCand === undefined) {
      best = { plan, worst: receive };
      bestCand = cand;
      continue;
    }
    // Rank by NET (compareByWorstCase ranks on worstCaseReceiveNet when present,
    // else the gross worstCaseReceive, so fee-free quotes rank exactly as before).
    // Break ties by lower venueId, then lower quoteId, so the choice is
    // independent of input order (determinism).
    const cmp = compareByWorstCase(plan, best.plan);
    const better =
      cmp > 0 ||
      (cmp === 0 &&
        (cand.venueId < bestCand.venueId ||
          (cand.venueId === bestCand.venueId &&
            cand.quoteId < bestCand.quoteId)));
    if (better) {
      best = { plan, worst: receive };
      bestCand = cand;
    }
  }
  return best;
}

/** Candidate 2: greedy multi-venue split, one leg per venue (deepest bucket). */
function greedySplit(
  candidates: readonly Candidate[],
  intent: SwapIntent,
  ctx: RouteContext,
): PlanCandidate | undefined {
  // Represent each venue by its deepest bucket (max give; tie: max receive, then quoteId).
  const repByVenue = new Map<string, Candidate>();
  for (const c of candidates) {
    const cur = repByVenue.get(c.venueId);
    if (
      cur === undefined ||
      c.give.gt(cur.give) ||
      (c.give.eq(cur.give) &&
        (c.receive.gt(cur.receive) ||
          (c.receive.eq(cur.receive) && c.quoteId < cur.quoteId)))
    ) {
      repByVenue.set(c.venueId, c);
    }
  }
  const offers = [...repByVenue.values()].sort(compareCandidates);

  const maxVenues = intent.constraints?.maxVenues;
  let remaining = ctx.total;
  let worst = Decimal.zero();
  const legs: RouteLeg[] = [];
  for (const cand of offers) {
    if (remaining.isZero()) break;
    if (maxVenues !== undefined && legs.length >= maxVenues) break;
    const giveAmt = min(cand.give, remaining);
    const { leg, receive } = buildLeg(cand, giveAmt, ctx);
    legs.push(leg);
    remaining = remaining.sub(giveAmt);
    worst = worst.add(receive);
  }
  if (!remaining.isZero() || legs.length === 0) return undefined;
  const plan = planFromLegs(legs, worst, ctx);
  if (plan === undefined) return undefined; // not constructible (mixed/unsupported fee)
  return { plan, worst };
}

/**
 * Choose the better plan candidate: higher worst-case NET, then fewer legs.
 * Ranks via {@link compareByWorstCase}, which uses `worstCaseReceiveNet` when
 * present and falls back to the gross `worstCaseReceive`, so two fee-free plans
 * are ordered exactly as before (RFC-0005 §3).
 */
function preferred(a: PlanCandidate, b: PlanCandidate): PlanCandidate {
  const cmp = compareByWorstCase(a.plan, b.plan);
  if (cmp > 0) return a;
  if (cmp < 0) return b;
  return a.plan.legs.length <= b.plan.legs.length ? a : b;
}

/**
 * Produce a {@link RouteResult} for `intent` from the gathered `quotes`,
 * evaluated at `now` (the SQSS `Router` contract, SPEC §4.5; RFC-0002). Returns
 * a typed no-viable-route rather than throwing.
 */
export function route(
  intent: SwapIntent,
  quotes: readonly Quote[],
  now: Date,
): RouteResult {
  const candidates = eligibleCandidates(intent, quotes, now);
  if (candidates.length === 0) {
    return { ok: false, reason: 'no-eligible-quotes' };
  }

  const total = Decimal.parse(intent.give.amount);
  const minReceive = Decimal.parse(intent.want.minReceive);
  if (total === undefined || minReceive === undefined) {
    // Defensive: a shape-valid intent always has parseable amounts.
    return { ok: false, reason: 'min-receive-unreachable' };
  }
  const ctx: RouteContext = {
    giveAsset: intent.give.asset,
    wantAsset: intent.want.asset,
    wantDecimals: intent.want.asset.decimals,
    total,
    intentRef: intent.intentId,
  };

  // No fillable plan (insufficient depth) or none reaching the floor both mean
  // the taker's minReceive is unreachable from these quotes.
  const filled = [
    bestSingleVenue(candidates, ctx),
    greedySplit(candidates, intent, ctx),
  ].filter((c): c is PlanCandidate => c !== undefined);
  const meeting = filled.filter((c) => c.worst.gte(minReceive));
  if (meeting.length === 0) {
    return { ok: false, reason: 'min-receive-unreachable' };
  }
  const best = meeting.reduce(preferred);

  const checked = checkRoutePlan(best.plan, intent, quotes, now);
  if (!checked.ok) {
    // Defensive: the router self-validates, so this is unreachable for the
    // current algorithm (which adds no slippage). Map a slippage failure to the
    // contract reason, anything else to min-receive-unreachable.
    const reason: NoViableRouteReason = checked.errors.some(
      (e) => e.code === 'slippage_exceeded',
    )
      ? 'slippage-exceeded'
      : 'min-receive-unreachable';
    return { ok: false, reason };
  }
  return { ok: true, plan: checked.value };
}

/**
 * The reference router as a {@link Router} port value (SPEC §4.5). Pure: `now`
 * is passed per call (RFC-0002), never bound here.
 */
export const referenceRouter: Router = { route };
