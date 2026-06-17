import type {
  RouteLeg,
  RoutePlan,
  SwapIntent,
  Timestamp,
} from '../generated/types.js';

/**
 * Descriptor for one CIP-0056 allocation request the settlement coordinator
 * must put in place for a leg (SPEC §6 step 1). This is the SQSS-level
 * descriptor; its on-ledger realization (the concrete CIP-0056 allocation
 * request / Daml contract) is defined by the `Settlement` implementation and
 * the `daml/synfin-settlement` library — out of scope for `@synfin/spec`.
 */
export interface AllocationRequest {
  /** The originating intent (SPEC §4.4 RoutePlan.intentRef). */
  readonly intentRef: string;
  /** The leg this allocation realizes. */
  readonly leg: RouteLeg;
  /**
   * Validity window for the allocation; an expired allocation MUST be released
   * and MUST NOT settle (SPEC §6). MUST NOT be later than the intent deadline.
   */
  readonly expiresAt: Timestamp;
}

/** Terminal outcome of a settlement attempt (SPEC §6). */
export interface SettlementOutcome {
  /**
   * `settled` iff the single atomic transaction committed all legs; otherwise
   * `aborted` and no leg settled (SPEC §6 step 4; ARCHITECTURE.md §1
   * invariant #3 — no protocol-level partial fills).
   */
  readonly status: 'settled' | 'aborted';
  /** Privacy-safe reason when `aborted` (e.g. `below_min_receive`, `expired`, `allocation_missing`). */
  readonly reason?: string;
}

/**
 * Port: turns a {@link RoutePlan} into CIP-0056 allocation requests and drives a
 * single atomic settlement (ARCHITECTURE.md §2; SPEC §6).
 *
 * Contract:
 *
 * - **Atomic or nothing.** Settlement executes as one Daml transaction; either
 *   all legs settle or none do (SPEC §6 steps 2–4; invariant #3).
 * - **On-ledger bounds.** `minReceive`, `maxSlippageBps` and `deadline` are
 *   enforced on-ledger, so a lying quote causes an abort, not a loss (SPEC §6
 *   step 3; ARCHITECTURE.md §5).
 * - **Same synchronizer.** All input contracts MUST be on one synchronizer; a
 *   route spanning synchronizers MUST be rejected, not partially settled
 *   (SPEC §6).
 * - **Single-use & idempotent.** An allocation MUST NOT be reusable across
 *   settlements, and `intentId` makes settlement idempotent — a retry MUST NOT
 *   settle twice (SPEC §6, §8; invariant #5).
 * - **Privacy.** Each venue learns only its own leg; the coordinator MUST NOT
 *   disclose the aggregate intent or route to any venue (SPEC §7).
 *
 * Method signatures and semantics only; the Daml realization is delivered in a
 * later task (`daml/synfin-settlement`).
 */
export interface Settlement {
  /**
   * Deterministically derive the per-leg allocation requests for a plan
   * (SPEC §6 step 1). Pure: no I/O, no ledger interaction, same inputs →
   * same requests (invariant #5).
   */
  prepareAllocations(
    plan: RoutePlan,
    intent: SwapIntent,
  ): readonly AllocationRequest[];

  /**
   * Drive the single atomic settlement once all allocations are in place
   * (SPEC §6 steps 2–4). Idempotent on `intent.intentId`: a retry of an
   * already-settled intent MUST NOT settle again. Resolves with the terminal
   * {@link SettlementOutcome}; it does not throw to signal a business abort.
   */
  settle(
    plan: RoutePlan,
    intent: SwapIntent,
    allocations: readonly AllocationRequest[],
  ): Promise<SettlementOutcome>;
}
