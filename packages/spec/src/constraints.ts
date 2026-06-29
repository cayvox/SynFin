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

/** Result of {@link computeWorstCaseReceiveNet}. */
export type NetValueResult =
  | { readonly ok: true; readonly value: Decimal }
  | { readonly ok: false; readonly reason: 'unsupported_fee_asset' };

/**
 * Pure, total net-value helper (RFC-0005 §3). Re-bases the gross worst-case
 * receipt to the taker's worst-case NET value, in the receive asset, per the
 * intent's give, after charging the plan's network fee.
 *
 * - No fee (absent or zero amount): the net equals the gross.
 * - `deducted_from_give` fee (RFC-0006 §2, §3): the fee MUST be in the give asset
 *   (otherwise `unsupported_fee_asset`). The fee was already taken from the input
 *   before the output was priced, so the delivered receive already equals the net;
 *   the helper returns the gross unchanged and does NOT re-base.
 * - `on_top` fee (the default when `appliedTo` is absent, RFC-0005 behavior):
 *   - Fee in the give asset: `gross * give / (give + fee)`, floored to the receive
 *     asset's precision. This re-bases the receipt to "received per unit of total
 *     give-asset outlay", which is exact (no rate conversion) and taker-favorable.
 *     It mirrors the router's `buildLeg` `mul(...).divide(..., scale, 'floor')`
 *     pattern.
 *   - Fee in the receive asset: `gross - fee` (already at receive precision; may be
 *     non-positive, which the caller decides how to handle).
 *   - Fee in a third asset: not valued here (RFC-0005 §2 restricts the asset to the
 *     give or receive asset); returns `{ ok: false, reason: 'unsupported_fee_asset' }`.
 *
 * Inputs are {@link Decimal} so the function stays pure: call sites parse the
 * wire strings first.
 */
export function computeWorstCaseReceiveNet(
  grossWorstCase: Decimal,
  give: { asset: AssetId; amount: Decimal },
  receiveAsset: AssetId,
  networkFee?: {
    asset: AssetId;
    amount: Decimal;
    appliedTo?: 'on_top' | 'deducted_from_give';
  },
): NetValueResult {
  if (networkFee === undefined || networkFee.amount.isZero()) {
    return { ok: true, value: grossWorstCase };
  }
  const applied = networkFee.appliedTo ?? 'on_top';
  if (applied === 'deducted_from_give') {
    // RFC-0006 §2: a deducted_from_give fee MUST be denominated in the give asset.
    if (!assetEquals(networkFee.asset, give.asset)) {
      return { ok: false, reason: 'unsupported_fee_asset' };
    }
    // RFC-0006 §3: the fee was taken from within the give before pricing, so the
    // delivered receive is already net. Do NOT re-base; the net equals the gross.
    return { ok: true, value: grossWorstCase };
  }
  // on_top (the default): RFC-0005 behavior, unchanged.
  if (assetEquals(networkFee.asset, give.asset)) {
    const value = grossWorstCase
      .mul(give.amount)
      .divide(
        give.amount.add(networkFee.amount),
        receiveAsset.decimals,
        'floor',
      );
    return { ok: true, value };
  }
  if (assetEquals(networkFee.asset, receiveAsset)) {
    return { ok: true, value: grossWorstCase.sub(networkFee.amount) };
  }
  return { ok: false, reason: 'unsupported_fee_asset' };
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
  // Net never exceeds gross, since a network fee is non-negative (RFC-0005 §5).
  const net =
    plan.worstCaseReceiveNet !== undefined
      ? parseAmount(plan.worstCaseReceiveNet, '/worstCaseReceiveNet', errors)
      : null;
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
  if (net !== null && net.gt(worst!)) {
    errors.push({
      code: 'net_above_gross',
      message: 'worstCaseReceiveNet exceeds worstCaseReceive',
      path: '/worstCaseReceiveNet',
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

    // No-understatement of a disclosed cost (RFC-0005 §5). If the quote carries a
    // networkFee, the leg may not hide or understate it.
    const quoteFee = quote.networkFee;
    if (quoteFee !== undefined) {
      // The quote's fee MUST be in the quote's give or receive asset (RFC-0005 §2).
      if (
        !assetEquals(quoteFee.asset, quote.give.asset) &&
        !assetEquals(quoteFee.asset, quote.receive.asset)
      ) {
        errors.push({
          code: 'unsupported_fee_asset',
          message:
            'quote networkFee asset is neither the give nor the receive asset',
          path: `/legs/${i}/quoteRef`,
        });
      }
      const legFee = leg.networkFee;
      if (legFee === undefined) {
        errors.push({
          code: 'fee_understated',
          message: 'leg omits a networkFee that its quote declares',
          path: `/legs/${i}/networkFee`,
        });
      } else if (!assetEquals(legFee.asset, quoteFee.asset)) {
        errors.push({
          code: 'fee_understated',
          message:
            'leg networkFee asset differs from the quote networkFee asset',
          path: `/legs/${i}/networkFee/asset`,
        });
      } else {
        // The leg MUST carry the same fee direction as its quote (RFC-0006 §2);
        // a mismatch misrepresents whether the fee is on top of or deducted from
        // the give. Absent reads as on_top on both sides.
        if (
          (legFee.appliedTo ?? 'on_top') !== (quoteFee.appliedTo ?? 'on_top')
        ) {
          errors.push({
            code: 'fee_applied_to_mismatch',
            message:
              'leg networkFee appliedTo differs from the quote networkFee appliedTo',
            path: `/legs/${i}/networkFee/appliedTo`,
          });
        }
        const legFeeAmt = parseAmount(
          legFee.amount,
          `/legs/${i}/networkFee/amount`,
          errors,
        );
        const quoteFeeAmt = parseAmount(
          quoteFee.amount,
          `/legs/${i}/quoteRef`,
          errors,
        );
        if (
          legFeeAmt !== null &&
          quoteFeeAmt !== null &&
          legFeeAmt.lt(quoteFeeAmt)
        ) {
          errors.push({
            code: 'fee_understated',
            message:
              'leg networkFee is less than the referenced quote networkFee',
            path: `/legs/${i}/networkFee/amount`,
          });
        }
      }
    }
  });
  return errors;
}

/**
 * Net-value consistency (RFC-0005 §3, §5). Recomputes the expected net via
 * {@link computeWorstCaseReceiveNet} against the intent's give and verifies the
 * plan's stated `worstCaseReceiveNet`:
 *
 * - If the plan's `networkFee` is in neither the give nor the receive asset, the
 *   net cannot be valued: `unsupported_fee_asset`.
 * - If the plan carries a network fee with a positive amount, `worstCaseReceiveNet`
 *   MUST be present and exactly equal the computed value, else `net_mismatch`.
 * - If the plan has no network fee (or a zero amount), a present `worstCaseReceiveNet`
 *   MUST equal `worstCaseReceive` (the computed net equals the gross); an absent
 *   one is read as equal to the gross, which is fine.
 */
export function checkNetConsistency(
  plan: RoutePlan,
  intent: SwapIntent,
): ValidationError[] {
  const errors: ValidationError[] = [];
  const gross = parseAmount(plan.worstCaseReceive, '/worstCaseReceive', errors);
  const give = parseAmount(intent.give.amount, '/give/amount', errors);
  const fee = plan.networkFee;
  const feeAmount =
    fee !== undefined
      ? parseAmount(fee.amount, '/networkFee/amount', errors)
      : null;
  if (gross === null || give === null) return errors;
  if (fee !== undefined && feeAmount === null) return errors;

  const computed = computeWorstCaseReceiveNet(
    gross,
    { asset: intent.give.asset, amount: give },
    intent.want.asset,
    fee !== undefined && feeAmount !== null
      ? {
          asset: fee.asset,
          amount: feeAmount,
          // Forward the fee direction so the helper, the single source, branches
          // on it (RFC-0006 §3). Absent stays absent (read as on_top).
          ...(fee.appliedTo !== undefined ? { appliedTo: fee.appliedTo } : {}),
        }
      : undefined,
  );
  if (!computed.ok) {
    errors.push({
      code: 'unsupported_fee_asset',
      message:
        'plan networkFee asset is neither the give nor the receive asset',
      path: '/networkFee/asset',
    });
    return errors;
  }

  const hasPositiveFee =
    fee !== undefined && feeAmount !== null && feeAmount.isPositive();
  if (hasPositiveFee && plan.worstCaseReceiveNet === undefined) {
    errors.push({
      code: 'net_mismatch',
      message: 'plan carries a network fee but omits worstCaseReceiveNet',
      path: '/worstCaseReceiveNet',
    });
    return errors;
  }
  if (plan.worstCaseReceiveNet !== undefined) {
    const stated = parseAmount(
      plan.worstCaseReceiveNet,
      '/worstCaseReceiveNet',
      errors,
    );
    // computed.value equals the gross when there is no fee, so this one check
    // covers both the fee and the no-fee case.
    if (stated !== null && !stated.eq(computed.value)) {
      errors.push({
        code: 'net_mismatch',
        message: 'worstCaseReceiveNet does not equal the computed net value',
        path: '/worstCaseReceiveNet',
      });
    }
  }
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
    ...checkNetConsistency(plan, intent),
  ];
  return errors.length > 0 ? err(errors) : ok(plan);
}

/**
 * Compare two plans by the taker's worst-case NET value, the figure the router
 * ranks on (RFC-0005 §3). Each plan ranks on `worstCaseReceiveNet` when present,
 * otherwise on `worstCaseReceive` (an absent net reads as equal to the gross), so
 * two plans with no network fee rank exactly as before (backward compatible).
 * Returns -1 if `a` is worse than `b`, 0 if equal, 1 if better. Used to express
 * the monotonicity property: a router given more/better quotes MUST NOT produce
 * a plan worse than a single-venue baseline (TESTING.md §2).
 */
export function compareByWorstCase(a: RoutePlan, b: RoutePlan): -1 | 0 | 1 {
  const aw = Decimal.parse(a.worstCaseReceiveNet ?? a.worstCaseReceive);
  const bw = Decimal.parse(b.worstCaseReceiveNet ?? b.worstCaseReceive);
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
