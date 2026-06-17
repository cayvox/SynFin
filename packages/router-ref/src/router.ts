import {
  Decimal,
  assetEquals,
  checkRoutePlan,
  type Quote,
  type Router,
  type RouteLeg,
  type RoutePlan,
  type SwapIntent,
  type ValidationError,
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
 * randomness. `now` is supplied by the caller; ties break by a stable rule
 * (higher net rate, then lower `venueId`, then larger `give`, then lower
 * `quoteId`), so identical inputs yield identical output.
 */

/** Why the reference router could not produce a viable plan. */
export type NoRouteReason =
  /** No supplied quote matched the intent's assets / was unexpired / allowed. */
  | 'no_eligible_quotes'
  /** Eligible quotes exist but cannot fill the full give within maxVenues/allow-list. */
  | 'insufficient_depth'
  /** A plan was assembled but its receipt is below the intent's minReceive. */
  | 'min_receive_unmet'
  /** Defensive: the assembled plan failed self-validation (should not happen). */
  | 'constraint_violation';

/** The result of a routing attempt: a self-validated plan, or a typed no-route. */
export type RouteResult =
  | { readonly ok: true; readonly plan: RoutePlan }
  | {
      readonly ok: false;
      readonly reason: NoRouteReason;
      readonly errors?: readonly ValidationError[];
    };

/** Thrown by the {@link Router}-port adapter ({@link createReferenceRouter}) when no route exists. */
export class NoViableRouteError extends Error {
  constructor(readonly reason: NoRouteReason) {
    super(`reference router: no viable route (${reason})`);
    this.name = 'NoViableRouteError';
  }
}

interface Candidate {
  readonly venueId: string;
  readonly quoteId: string;
  readonly give: Decimal;
  readonly receive: Decimal;
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
    candidates.push({ venueId: q.venueId, quoteId: q.quoteId, give, receive });
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
  return {
    leg: {
      venueId: cand.venueId,
      give: { asset: ctx.giveAsset, amount: giveAmt.toString() },
      receive: { asset: ctx.wantAsset, amount: receive.toString() },
      quoteRef: cand.quoteId,
    },
    receive,
  };
}

/** Assemble a plan from legs whose receipts sum to `worst` (= aggregate). */
function planFromLegs(
  legs: RouteLeg[],
  worst: Decimal,
  ctx: RouteContext,
): RoutePlan {
  return {
    intentRef: ctx.intentRef,
    legs: legs as [RouteLeg, ...RouteLeg[]],
    aggregateReceive: worst.toString(),
    // Reference router commits to the quoted receipts as the basis: worst case
    // equals the aggregate and it introduces no extra slippage. A firmness-aware
    // haircut model is left to the optimizer (ADR-0007).
    worstCaseReceive: worst.toString(),
    slippageBps: 0,
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
    // Prefer higher receipt; break ties by lower venueId, then lower quoteId,
    // so the choice is independent of input order (determinism).
    const better =
      best === undefined ||
      bestCand === undefined ||
      receive.gt(best.worst) ||
      (receive.eq(best.worst) &&
        (cand.venueId < bestCand.venueId ||
          (cand.venueId === bestCand.venueId &&
            cand.quoteId < bestCand.quoteId)));
    if (better) {
      best = { plan: planFromLegs([leg], receive, ctx), worst: receive };
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
  return { plan: planFromLegs(legs, worst, ctx), worst };
}

/** Choose the better plan candidate: higher worst-case, then fewer legs. */
function preferred(a: PlanCandidate, b: PlanCandidate): PlanCandidate {
  if (a.worst.gt(b.worst)) return a;
  if (b.worst.gt(a.worst)) return b;
  return a.plan.legs.length <= b.plan.legs.length ? a : b;
}

/**
 * Produce a {@link RouteResult} for `intent` from the gathered `quotes`,
 * evaluated at `now`. This is the reference router's primary, richer API: it
 * returns a typed no-viable-route rather than throwing.
 */
export function route(
  intent: SwapIntent,
  quotes: readonly Quote[],
  now: Date,
): RouteResult {
  const candidates = eligibleCandidates(intent, quotes, now);
  if (candidates.length === 0) {
    return { ok: false, reason: 'no_eligible_quotes' };
  }

  const total = Decimal.parse(intent.give.amount);
  const minReceive = Decimal.parse(intent.want.minReceive);
  if (total === undefined || minReceive === undefined) {
    return { ok: false, reason: 'constraint_violation' };
  }
  const ctx: RouteContext = {
    giveAsset: intent.give.asset,
    wantAsset: intent.want.asset,
    wantDecimals: intent.want.asset.decimals,
    total,
    intentRef: intent.intentId,
  };

  const filled = [
    bestSingleVenue(candidates, ctx),
    greedySplit(candidates, intent, ctx),
  ].filter((c): c is PlanCandidate => c !== undefined);
  if (filled.length === 0) {
    return { ok: false, reason: 'insufficient_depth' };
  }

  const meeting = filled.filter((c) => c.worst.gte(minReceive));
  if (meeting.length === 0) {
    return { ok: false, reason: 'min_receive_unmet' };
  }
  const best = meeting.reduce(preferred);

  const checked = checkRoutePlan(best.plan, intent, quotes, now);
  if (!checked.ok) {
    return {
      ok: false,
      reason: 'constraint_violation',
      errors: checked.errors,
    };
  }
  return { ok: true, plan: checked.value };
}

/**
 * Adapt the reference router to the synchronous {@link Router} port by binding
 * `now`. The port's `route` returns a `RoutePlan`; since that type cannot carry
 * a no-route outcome, this adapter throws {@link NoViableRouteError} when no
 * viable plan exists. Prefer the richer {@link route} for a typed result.
 *
 * `now` is bound explicitly (not read from a clock) so the resulting `Router`
 * stays pure and deterministic.
 */
export function createReferenceRouter(now: Date): Router {
  return {
    route(intent: SwapIntent, quotes: readonly Quote[]): RoutePlan {
      const result = route(intent, quotes, now);
      if (!result.ok) throw new NoViableRouteError(result.reason);
      return result.plan;
    },
  };
}
