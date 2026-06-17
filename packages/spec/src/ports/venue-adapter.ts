import type { Quote, QuoteRequest, VenueId } from '../generated/types.js';

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
   * Quote a single size bucket. Resolves to a {@link Quote} or a typed
   * {@link QuoteRejection}; it does not throw to signal a business "no".
   * Transport/timeout failures surface as rejected promises and are the
   * caller's concern (ARCHITECTURE.md §6).
   */
  quote(request: QuoteRequest): Promise<Quote | QuoteRejection>;
}
