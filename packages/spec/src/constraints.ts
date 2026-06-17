import { Decimal } from './decimal.js';
import { type Result, type ValidationError, ok, err } from './result.js';
import type { AssetId, RoutePlan, SwapIntent } from './generated/types.js';

/**
 * Reusable predicates for the SQSS cross-field constraints on a {@link RoutePlan}
 * (SPECIFICATION.md §4.4):
 *
 * - **Conservation** — Σ legs[].give.amount == intent.give.amount, same asset.
 * - **Worst-case floor** — worstCaseReceive >= intent.want.minReceive.
 * - **Slippage bound** — plan.slippageBps <= intent.maxSlippageBps.
 * - **Venue constraints** — legs respect `maxVenues` and `venueAllowList`.
 * - **Aggregate consistency** — worstCaseReceive <= aggregateReceive <= Σ legs
 *   receive (no overstatement of what the taker receives, SPEC §4.4 / §3).
 *
 * Each predicate is pure and returns `ValidationError[]` (empty = satisfied).
 * {@link checkRoutePlan} composes them into a single {@link Result}. These
 * operate on already shape-valid data; pass plans through
 * `validateRoutePlan` first.
 */

/** Structural equality of two asset references (SPEC §3). */
export function assetEquals(a: AssetId, b: AssetId): boolean {
  return (
    a.registry === b.registry && a.id === b.id && a.decimals === b.decimals
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

/**
 * Compose all {@link RoutePlan} cross-field constraints against the originating
 * {@link SwapIntent}. A plan that fails any constraint MUST NOT be submitted for
 * settlement (SPEC §4.4, §6).
 */
export function checkRoutePlan(
  plan: RoutePlan,
  intent: SwapIntent,
): Result<RoutePlan> {
  const errors: ValidationError[] = [
    ...checkConservation(plan, intent),
    ...checkWorstCaseFloor(plan, intent),
    ...checkSlippageBound(plan, intent),
    ...checkVenueConstraints(plan, intent),
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
