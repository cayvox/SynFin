import type { Quote, RoutePlan, SwapIntent } from '../generated/types.js';

/**
 * Why a {@link Router} could not produce a viable plan (SPEC §4.5; RFC-0002).
 * Part of the port contract — a small, stable, privacy-safe union.
 */
export type NoViableRouteReason =
  /** No supplied quote matched the intent's assets, was unexpired at `now`, or was an allowed venue. */
  | 'no-eligible-quotes'
  /** No plan reaches the taker's `minReceive` floor (includes insufficient depth to fill the give). */
  | 'min-receive-unreachable'
  /** The best plan would exceed the intent's `maxSlippageBps`. */
  | 'slippage-exceeded';

/**
 * The result of a routing attempt (SPEC §4.5; RFC-0002): either a successful
 * {@link RoutePlan} or a typed no-viable-route outcome. A `RouteResult` is an
 * off-ledger interface type — it is not a wire message and has no JSON Schema.
 */
export type RouteResult =
  | { readonly ok: true; readonly plan: RoutePlan }
  | { readonly ok: false; readonly reason: NoViableRouteReason };

/**
 * Port: the routing brain (ARCHITECTURE.md §2; SPEC §2, §4.4, §4.5).
 *
 * A `Router` selects and splits {@link Quote}s into a {@link RoutePlan}. The
 * open reference implementation ships in `@synfin/router-ref`; a proprietary
 * optimizer is an alternative implementation of *this exact port* — the system
 * runs fully without it (GOVERNANCE.md §3; open/closed boundary).
 *
 * Contract:
 *
 * - **Pure & deterministic.** `route` is synchronous and pure-by-contract: it
 *   performs no I/O, reads no clock, and — given the same intent, quote set, and
 *   `now` — returns the same result (ARCHITECTURE.md §1 invariant #5).
 * - **Per-call `now`.** The evaluation time is a parameter, never bound to a
 *   long-lived instance, so the time-dependent no-overstatement rule (§4.4) is
 *   enforced against the actual call time (RFC-0002).
 * - **Typed no-route.** A Router signals the absence of a viable plan by
 *   returning `{ ok: false, reason }` — it MUST NOT throw for control flow, and
 *   MUST NOT return a plan that violates §4.4. When `ok` is `true` the `plan`
 *   MUST satisfy conservation, `worstCaseReceive >= minReceive`, the slippage
 *   bound, `maxVenues`/`venueAllowList`, quote linkage, and no-overstatement
 *   (SPEC §4.4, RFC-0001). Use `checkRoutePlan` (which takes the source quotes
 *   and `now`) to enforce this.
 * - **Monotonicity.** Given more or strictly better quotes, the result MUST NOT
 *   be worse (by worst-case receive) than a viable single-venue baseline
 *   (TESTING.md §2).
 *
 * Callers MUST validate quotes (e.g. `validateQuote`) before routing; the
 * router treats its inputs as already shape-valid.
 */
export interface Router {
  /**
   * Produce a {@link RouteResult} for `intent` from the candidate `quotes`,
   * evaluated at `now` (SPEC §4.5; RFC-0002).
   */
  route(intent: SwapIntent, quotes: readonly Quote[], now: Date): RouteResult;
}
