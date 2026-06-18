import { Decimal } from './decimal.js';
import { type Result, type ValidationError, ok, err } from './result.js';
import type {
  AssetId,
  Quote,
  RoutePlan,
  SwapIntent,
} from './generated/types.js';

/**
 * Reusable predicates for the SQSS cross-field constraints on a {@link RoutePlan}
 * (SPECIFICATION.md §4.4):
 *
 * - **Conservation** — Σ legs[].give.amount == intent.give.amount, same asset.
 * - **Worst-case floor** — worstCaseReceive >= intent.want.minReceive.
 * - **Slippage bound** — plan.slippageBps <= intent.maxSlippageBps.
 * - **Venue constraints** — legs respect `maxVenues` and `venueAllowList`.
 * - **Quote linkage** — every leg's `quoteRef` resolves to a supplied quote
 *   (SPEC §4.4, RFC-0001 Decision C).
 * - **No overstatement (per leg)** — each leg's `receive` does not exceed its
 *   referenced quote's `receive`, that quote is unexpired, and its assets match
 *   the leg (SPEC §4.4, RFC-0001 Decision C).
 * - **Aggregate consistency** — worstCaseReceive <= aggregateReceive <= Σ legs
 *   receive (kept as an additional invariant, SPEC §4.4 / §3).
 *
 * Each predicate is pure and returns `ValidationError[]` (empty = satisfied).
 * The quote-linkage and per-leg no-overstatement checks need the set of source
 * quotes (and the current time) the plan was built from. {@link checkRoutePlan}
 * composes them into a single {@link Result}. These operate on already
 * shape-valid data; pass plans/quotes through `validateRoutePlan`/`validateQuote`
 * first.
 */

/** Structural equality of two asset references (SPEC §3, RFC-0001 Decision A). */
export function assetEquals(a: AssetId, b: AssetId): boolean {
  return (
    a.registry === b.registry &&
    a.instrumentId === b.instrumentId &&
    a.decimals === b.decimals
  );
}

function parseAmount(
  value: string,
  path: string,
  errors: ValidationError[],
): Decimal | null {
  const parsed = Decimal.parse(value);
  if (parsed === undefined) {
    errors.push({
      code: 'invalid_decimal',
      message: 'not a valid decimal',
      path,
    });
    return null;
  }
  return parsed;
}

/** Σ legs[].give.amount MUST equal intent.give.amount, all in the give asset. */
export function checkConservation(
  plan: RoutePlan,
  intent: SwapIntent,
): ValidationError[] {
  const errors: ValidationError[] = [];
  let sum = Decimal.zero();
  plan.legs.forEach((leg, i) => {
    if (!assetEquals(leg.give.asset, intent.give.asset)) {
      errors.push({
        code: 'asset_mismatch',
        message: 'leg give asset differs from intent give asset',
        path: `/legs/${i}/give/asset`,
      });
    }
    const amount = parseAmount(
      leg.give.amount,
      `/legs/${i}/give/amount`,
      errors,
    );
    if (amount !== null) sum = sum.add(amount);
  });
  const intentGive = parseAmount(intent.give.amount, '/give/amount', errors);
  if (intentGive !== null && errors.length === 0 && !sum.eq(intentGive)) {
    errors.push({
      code: 'conservation',
      message: 'sum of leg give amounts does not equal intent give amount',
      path: '/legs',
    });
  }
  return errors;
}

/** worstCaseReceive MUST be >= intent.want.minReceive (SPEC §4.4, §6). */
export function checkWorstCaseFloor(
  plan: RoutePlan,
  intent: SwapIntent,
): ValidationError[] {
  const errors: ValidationError[] = [];
  const worst = parseAmount(plan.worstCaseReceive, '/worstCaseReceive', errors);
  const floor = parseAmount(intent.want.minReceive, '/want/minReceive', errors);
  if (worst !== null && floor !== null && worst.lt(floor)) {
    errors.push({
      code: 'below_min_receive',
      message: 'worstCaseReceive is below the intent minReceive floor',
      path: '/worstCaseReceive',
    });
  }
  return errors;
}

/** plan.slippageBps MUST satisfy intent.maxSlippageBps (SPEC §4.4). */
export function checkSlippageBound(
  plan: RoutePlan,
  intent: SwapIntent,
): ValidationError[] {
  if (plan.slippageBps > intent.maxSlippageBps) {
    return [
      {
        code: 'slippage_exceeded',
        message: 'plan slippage exceeds intent maxSlippageBps',
        path: '/slippageBps',
      },
    ];
  }
  return [];
}

/** Legs MUST respect `maxVenues` and `venueAllowList` (SPEC §4.1, §4.4). */
export function checkVenueConstraints(
  plan: RoutePlan,
  intent: SwapIntent,
): ValidationError[] {
  const errors: ValidationError[] = [];
  const constraints = intent.constraints;
  if (!constraints) return errors;
  if (
    constraints.maxVenues !== undefined &&
    plan.legs.length > constraints.maxVenues
  ) {
    errors.push({
      code: 'max_venues_exceeded',
      message: 'plan has more legs than maxVenues allows',
      path: '/legs',
    });
  }
  const allow = constraints.venueAllowList;
  if (allow !== undefined) {
    const allowed = new Set(allow);
    plan.legs.forEach((leg, i) => {
      if (!allowed.has(leg.venueId)) {
        errors.push({
          code: 'venue_not_allowed',
          message: 'leg venue is not in venueAllowList',
          path: `/legs/${i}/venueId`,
        });
      }
    });
  }
  return errors;
}

/**
 * worstCaseReceive <= aggregateReceive <= Σ legs[].receive.amount. The plan's
 * advertised receipts must never overstate the sum of its legs (SPEC §4.4, §3).
 */
export function checkAggregateConsistency(plan: RoutePlan): ValidationError[] {
  const errors: ValidationError[] = [];
  let sumReceive = Decimal.zero();
  plan.legs.forEach((leg, i) => {
    const amount = parseAmount(
      leg.receive.amount,
      `/legs/${i}/receive/amount`,
      errors,
    );
    if (amount !== null) sumReceive = sumReceive.add(amount);
  });
  const aggregate = parseAmount(
    plan.aggregateReceive,
    '/aggregateReceive',
    errors,
  );
  const worst = parseAmount(plan.worstCaseReceive, '/worstCaseReceive', errors);
  if (errors.length > 0) return errors;
  if (aggregate!.gt(sumReceive)) {
    errors.push({
      code: 'overstated_receive',
      message: 'aggregateReceive exceeds the sum of leg receipts',
      path: '/aggregateReceive',
    });
  }
  if (worst!.gt(aggregate!)) {
    errors.push({
      code: 'worst_above_aggregate',
      message: 'worstCaseReceive exceeds aggregateReceive',
      path: '/worstCaseReceive',
    });
  }
  return errors;
}

/** Index a quote set by `quoteId` for resolution (SPEC §4.3). */
function indexByQuoteId(quotes: readonly Quote[]): Map<string, Quote> {
  const byId = new Map<string, Quote>();
  for (const q of quotes) byId.set(q.quoteId, q);
  return byId;
}

/**
 * Every `RouteLeg.quoteRef` MUST equal the `quoteId` of a supplied quote
 * (SPEC §4.4, RFC-0001 Decision C). A plan referencing an unknown quote is
 * rejected.
 */
export function checkQuoteLinkage(
  plan: RoutePlan,
  quotes: readonly Quote[],
): ValidationError[] {
  const byId = indexByQuoteId(quotes);
  const errors: ValidationError[] = [];
  plan.legs.forEach((leg, i) => {
    if (!byId.has(leg.quoteRef)) {
      errors.push({
        code: 'unresolved_quote_ref',
        message: 'leg quoteRef does not resolve to a supplied quote',
        path: `/legs/${i}/quoteRef`,
      });
    }
  });
  return errors;
}

/**
 * No overstatement, per leg (SPEC §4.4, RFC-0001 Decision C). For each leg,
 * against the quote it references: `leg.receive.amount` MUST NOT exceed the
 * quote's `receive.amount`; the quote MUST be unexpired at `now`
 * (`now <= validUntil`); and the quote's give/receive assets MUST match the
 * leg's. Legs whose `quoteRef` does not resolve are skipped here — that is
 * reported by {@link checkQuoteLinkage}.
 */
export function checkNoOverstatement(
  plan: RoutePlan,
  quotes: readonly Quote[],
  now: Date,
): ValidationError[] {
  const byId = indexByQuoteId(quotes);
  const errors: ValidationError[] = [];
  plan.legs.forEach((leg, i) => {
    const quote = byId.get(leg.quoteRef);
    if (quote === undefined) return; // linkage owns the unresolved case.
    if (now.getTime() > new Date(quote.validUntil).getTime()) {
      errors.push({
        code: 'quote_expired',
        message: 'leg references a quote that has expired',
        path: `/legs/${i}/quoteRef`,
      });
    }
    if (
      !assetEquals(leg.give.asset, quote.give.asset) ||
      !assetEquals(leg.receive.asset, quote.receive.asset)
    ) {
      errors.push({
        code: 'leg_quote_asset_mismatch',
        message: 'leg assets do not match the referenced quote',
        path: `/legs/${i}`,
      });
    }
    const legReceive = parseAmount(
      leg.receive.amount,
      `/legs/${i}/receive/amount`,
      errors,
    );
    const quoteReceive = parseAmount(
      quote.receive.amount,
      `/legs/${i}/quoteRef`,
      errors,
    );
    if (
      legReceive !== null &&
      quoteReceive !== null &&
      legReceive.gt(quoteReceive)
    ) {
      errors.push({
        code: 'leg_exceeds_quote',
        message: 'leg receive exceeds the referenced quote receive',
        path: `/legs/${i}/receive/amount`,
      });
    }
  });
  return errors;
}

/**
 * Compose all {@link RoutePlan} cross-field constraints against the originating
 * {@link SwapIntent} and the set of source quotes the plan was built from. A
 * plan that fails any constraint MUST NOT be submitted for settlement
 * (SPEC §4.4, §6). `now` is used for the quote-expiry check (RFC-0001
 * Decision C).
 */
export function checkRoutePlan(
  plan: RoutePlan,
  intent: SwapIntent,
  quotes: readonly Quote[],
  now: Date,
): Result<RoutePlan> {
  const errors: ValidationError[] = [
    ...checkConservation(plan, intent),
    ...checkWorstCaseFloor(plan, intent),
    ...checkSlippageBound(plan, intent),
    ...checkVenueConstraints(plan, intent),
    ...checkQuoteLinkage(plan, quotes),
    ...checkNoOverstatement(plan, quotes, now),
    ...checkAggregateConsistency(plan),
  ];
  return errors.length > 0 ? err(errors) : ok(plan);
}

/**
 * Compare two plans by their worst-case receive (the taker's guaranteed floor).
 * Returns -1 if `a` is worse than `b`, 0 if equal, 1 if better. Used to express
 * the monotonicity property: a router given more/better quotes MUST NOT produce
 * a plan worse than a single-venue baseline (TESTING.md §2).
 */
export function compareByWorstCase(a: RoutePlan, b: RoutePlan): -1 | 0 | 1 {
  const aw = Decimal.parse(a.worstCaseReceive);
  const bw = Decimal.parse(b.worstCaseReceive);
  if (aw === undefined || bw === undefined) {
    throw new Error(
      'compareByWorstCase: plans must have valid decimal receipts',
    );
  }
  return aw.compare(bw);
}

/**
 * Whether a plan may be settled atomically (SPEC §6; RFC-0004; ADR-0009): TRUE
 * iff **every** leg's referenced quote settles via `atomic-allocation`. A single
 * `managed-deposit` leg makes the route non-atomic — it must be executed via the
 * managed path, never co-settled in one Daml transaction. An unresolved
 * `quoteRef` (a quote not in the supplied set) is treated as non-atomic (it
 * cannot be proven atomic); use `checkQuoteLinkage` to surface that separately.
 */
export function isAtomicRoute(
  plan: RoutePlan,
  quotes: readonly Quote[],
): boolean {
  const byId = indexByQuoteId(quotes);
  return plan.legs.every((leg) => {
    const quote = byId.get(leg.quoteRef);
    return quote !== undefined && quote.settlementMode === 'atomic-allocation';
  });
}

/**
 * Settlement-eligibility check for the atomic path: a plan is only eligible for
 * atomic settlement (`daml/synfin-settlement`) when {@link isAtomicRoute} holds.
 * This is intentionally separate from {@link checkRoutePlan} (which validates
 * §4.4 economic constraints): a route containing `managed-deposit` legs is a
 * perfectly valid plan, it just cannot be settled atomically (RFC-0004).
 */
export function checkAtomicallySettleable(
  plan: RoutePlan,
  quotes: readonly Quote[],
): Result<RoutePlan> {
  const byId = indexByQuoteId(quotes);
  const errors: ValidationError[] = [];
  plan.legs.forEach((leg, i) => {
    const quote = byId.get(leg.quoteRef);
    if (quote === undefined || quote.settlementMode !== 'atomic-allocation') {
      errors.push({
        code: 'not_atomically_settleable',
        message:
          'leg is not atomic-allocation; the route cannot be settled atomically',
        path: `/legs/${i}`,
      });
    }
  });
  return errors.length > 0 ? err(errors) : ok(plan);
}
