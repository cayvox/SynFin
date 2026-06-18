import type { Quote, QuoteRequest, VenueId } from '../generated/types.js';

/**
 * How a venue settles (SPEC §4.3, §5; RFC-0004; ADR-0009). Derived from the
 * generated `Quote` type so the venue capability and the quote field cannot
 * drift apart (the JSON Schema is the single source of truth).
 *
 * - `atomic-allocation` (Mode A): settles via a CIP-0056 allocation, so a leg
 *   from this venue CAN be part of a single atomic Daml transaction (SPEC §6).
 * - `managed-deposit` (Mode B): settles via the venue's own
 *   deposit/detect/execute flow, so a leg from this venue CANNOT be atomically
 *   co-settled and is executed via the managed path (not defined here — RFC-0004
 *   defers `ManagedExecution`).
 */
export type SettlementMode = Quote['settlementMode'];

/**
 * A typed rejection returned by a venue instead of a {@link Quote} (SPEC §5:
 * `POST /quote` returns a Quote "or a typed rejection"). Rejections are
 * first-class so adapters never throw to signal "no quote" and never invent a
 * degraded quote.
 */
export interface QuoteRejection {
  /** The venue that declined to quote. */
  readonly venueId: VenueId;
  /**
   * Stable, privacy-safe reason code (e.g. `insufficient_liquidity`,
   * `pair_unsupported`, `rate_limited`, `expired_request`). MUST NOT leak the
   * taker's intent or any cross-leg correlation (SPEC §7).
   */
  readonly code: string;
  /** Optional human-readable, privacy-safe detail. */
  readonly message?: string;
}

/** Type guard distinguishing a {@link QuoteRejection} from a {@link Quote}. */
export function isQuoteRejection(
  value: Quote | QuoteRejection,
): value is QuoteRejection {
  return (
    typeof (value as QuoteRejection).code === 'string' && !('receive' in value)
  );
}

/**
 * Port: a liquidity venue's quote interface (ARCHITECTURE.md §2; SPEC §5).
 *
 * One adapter wraps one venue, normalizing that venue's native quote semantics
 * into the standard {@link Quote} type. An adapter:
 *
 * - MUST be pure/deterministic in its normalization (ARCHITECTURE.md §1
 *   invariant #5; SPEC §5 note) — given the same {@link QuoteRequest} and the
 *   same underlying venue response it MUST produce the same result.
 * - MUST treat the venue's response as untrusted and validate it before
 *   producing a {@link Quote} (ARCHITECTURE.md §1 invariant #7).
 * - MUST NOT be able to derive, nor leak, the taker's total intent from a
 *   single request (SPEC §4.2, §7); a request carries only one size bucket.
 * - MUST respect {@link QuoteRequest.deadline}; a response produced after it is
 *   ignored by the consumer (SPEC §5).
 *
 * This is the port contract only; concrete adapters live in `@synfin/adapters`
 * and must pass the conformance suite (SPEC §10, TESTING.md §5).
 */
export interface VenueAdapter {
  /** Stable identifier of the venue this adapter serves. */
  readonly venueId: VenueId;

  /**
   * How this venue settles (RFC-0004; ADR-0009). Lets the router/coordinator
   * decide whether the venue can be an atomic leg (`atomic-allocation`) or must
   * be executed via the managed deposit path (`managed-deposit`). Every
   * {@link Quote} the adapter returns MUST carry this same `settlementMode`.
   */
  readonly settlementMode: SettlementMode;

  /**
   * Quote a single size bucket. Resolves to a {@link Quote} or a typed
   * {@link QuoteRejection}; it does not throw to signal a business "no".
   * Transport/timeout failures surface as rejected promises and are the
   * caller's concern (ARCHITECTURE.md §6).
   */
  quote(request: QuoteRequest): Promise<Quote | QuoteRejection>;
}
