import type { Quote, RoutePlan, SwapIntent } from '../generated/types.js';

/**
 * Port: the routing brain (ARCHITECTURE.md §2; SPEC §2, §4.4).
 *
 * A `Router` selects and splits {@link Quote}s into a {@link RoutePlan}. The
 * open reference implementation ships in `@synfin/router-ref`; a proprietary
 * optimizer is an alternative implementation of *this exact port* — the system
 * runs fully without it (GOVERNANCE.md §3; open/closed boundary).
 *
 * Contract:
 *
 * - **Pure & deterministic.** `route` is synchronous and pure-by-contract: it
 *   performs no I/O and, given the same intent and quote set, returns the same
 *   plan (ARCHITECTURE.md §1 invariant #5).
 * - **Honors §4 constraints.** A returned plan MUST satisfy conservation,
 *   `worstCaseReceive >= minReceive`, the slippage bound, and
 *   `maxVenues`/`venueAllowList` (SPEC §4.4). Use the predicates in
 *   `constraints.ts` to enforce this.
 * - **Quote linkage.** Every `RouteLeg.quoteRef` MUST equal the `quoteId` of one
 *   of the supplied quotes (SPEC §4.3, §4.4; RFC-0001 Decision C).
 * - **No overstatement.** For each leg, `leg.receive` MUST NOT exceed the
 *   referenced quote's `receive`, that quote MUST be unexpired at
 *   plan-construction time, and its assets MUST match the leg; additionally a
 *   plan's `aggregateReceive` MUST NOT exceed Σ leg receipts, and rounding MUST
 *   never favor the protocol (SPEC §3, §4.4; RFC-0001 Decision C). Use
 *   `checkRoutePlan`/`checkNoOverstatement`, which take the source quote set, to
 *   enforce this.
 * - **Monotonicity.** Given more or strictly better quotes, the result MUST NOT
 *   be worse (by worst-case receive) than a viable single-venue baseline
 *   (TESTING.md §2).
 *
 * Callers MUST validate quotes (e.g. `validateQuote`) before routing; the
 * router treats its inputs as already shape-valid.
 */
export interface Router {
  /**
   * Produce a {@link RoutePlan} for `intent` from the candidate `quotes`.
   *
   * Implementations SHOULD signal "no viable plan" via a typed result rather
   * than returning a plan that violates the intent's bounds; this port returns
   * a plan and relies on the caller to reject via `checkRoutePlan` when an
   * implementation cannot guarantee bounds. (The reference router's exact
   * no-plan signaling is defined in `@synfin/router-ref`.)
   */
  route(intent: SwapIntent, quotes: readonly Quote[]): RoutePlan;
}
