import {
  Decimal,
  assetEquals,
  roundTakerFavorable,
  type AssetId,
  type Quote,
  type QuoteRejection,
  type QuoteRequest,
  type VenueAdapter,
} from '@synfin/spec';

/**
 * `MockVenueAdapter` — a deterministic in-memory {@link VenueAdapter} for
 * development and tests (SPEC §5; TESTING.md §4–5). **Not a real venue.**
 *
 * Everything is driven by explicit config — no hidden state, no clock, no I/O,
 * no randomness — so identical requests yield identical quotes (ARCHITECTURE.md
 * §1 invariant #5). Pricing uses a simple convex price-impact curve so that
 * quotes gathered at different sizes (buckets) are meaningful inputs to a
 * depth-aware router (SPEC §4.2):
 *
 *   grossReceive(g) = rate0 · g · liquidity / (liquidity + g)
 *
 * The average rate `rate0 · liquidity / (liquidity + g)` decreases as size `g`
 * grows (larger fills price worse). A fee in bps is then applied and the result
 * is rounded **in the taker's favour** (floored to the want instrument's
 * precision) so receipts are never overstated (SPEC §3).
 */

/** A supported pair and its deterministic price curve. */
export interface MockPair {
  /** The asset the taker gives. */
  readonly give: AssetId;
  /** The asset the taker wants. */
  readonly want: AssetId;
  /** Want-units per 1 give-unit at (near) zero size, as a decimal string. */
  readonly rate0: string;
  /**
   * Depth constant in give-units (decimal string): larger = deeper liquidity =
   * less price impact. Must be > 0.
   */
  readonly liquidity: string;
}

/** Configuration for a {@link MockVenueAdapter} instance. */
export interface MockVenueConfig {
  readonly venueId: string;
  readonly pairs: readonly MockPair[];
  /** Fee in basis points already reflected in `receive` (default 0). */
  readonly feeBps?: number;
  /** Quote firmness (default 'indicative'). Firm quotes carry commitment+signature. */
  readonly firmness?: Quote['firmness'];
  /** Liquidity source kind (default 'AMM'). */
  readonly sourceKind?: Quote['sourceKind'];
  /**
   * How this mock venue settles (default `atomic-allocation`, i.e. a CIP-0056
   * Mode-A venue usable in atomic settlement; RFC-0004). Set to
   * `managed-deposit` to model a Mode-B deposit-based venue.
   */
  readonly settlementMode?: Quote['settlementMode'];
  /** Absolute `validUntil` for issued quotes (ISO 8601). Default far future. */
  readonly quoteValidUntil?: string;
  /** Optional per-request size cap (give-units); larger requests are rejected. */
  readonly maxGive?: string;
  /** If set, the adapter always rejects with this code (to exercise error paths). */
  readonly forceReject?: { readonly code: string; readonly message?: string };
}

const DEFAULT_VALID_UNTIL = '2999-01-01T00:00:00Z';
const BPS_DENOM = Decimal.parse('10000') as Decimal;

export class MockVenueAdapter implements VenueAdapter {
  readonly venueId: string;
  readonly settlementMode: Quote['settlementMode'];
  readonly #config: MockVenueConfig;

  constructor(config: MockVenueConfig) {
    this.venueId = config.venueId;
    this.settlementMode = config.settlementMode ?? 'atomic-allocation';
    this.#config = config;
  }

  #reject(code: string, message?: string): QuoteRejection {
    return message === undefined
      ? { venueId: this.venueId, code }
      : { venueId: this.venueId, code, message };
  }

  #findPair(request: QuoteRequest): MockPair | undefined {
    return this.#config.pairs.find(
      (p) =>
        assetEquals(p.give, request.give.asset) &&
        assetEquals(p.want, request.want.asset),
    );
  }

  /** Deterministic net receipt for a give size on a pair (taker-favourable). */
  #priceReceive(pair: MockPair, give: Decimal, wantDecimals: number): Decimal {
    const rate0 = Decimal.parse(pair.rate0) as Decimal;
    const liquidity = Decimal.parse(pair.liquidity) as Decimal;
    // High intermediate precision; final result floored to want precision.
    const scale = wantDecimals + 12;
    const gross = rate0
      .mul(give)
      .mul(liquidity)
      .divide(liquidity.add(give), scale, 'floor');
    const feeBps = this.#config.feeBps ?? 0;
    const net = gross
      .mul(Decimal.parse(String(10000 - feeBps)) as Decimal)
      .divide(BPS_DENOM, scale, 'floor');
    return roundTakerFavorable(net, wantDecimals, 'receive');
  }

  quote(request: QuoteRequest): Promise<Quote | QuoteRejection> {
    const cfg = this.#config;
    if (cfg.forceReject) {
      return Promise.resolve(
        this.#reject(cfg.forceReject.code, cfg.forceReject.message),
      );
    }
    const pair = this.#findPair(request);
    if (!pair) {
      return Promise.resolve(this.#reject('pair_unsupported'));
    }
    const give = Decimal.parse(request.give.amount);
    if (
      give === undefined ||
      !give.isPositive() ||
      give.scale > pair.give.decimals // more precision than the instrument allows
    ) {
      return Promise.resolve(this.#reject('invalid_request'));
    }
    if (cfg.maxGive !== undefined) {
      const cap = Decimal.parse(cfg.maxGive);
      if (cap !== undefined && give.gt(cap)) {
        return Promise.resolve(this.#reject('insufficient_liquidity'));
      }
    }
    const receive = this.#priceReceive(pair, give, pair.want.decimals);
    if (!receive.isPositive()) {
      return Promise.resolve(this.#reject('insufficient_liquidity'));
    }

    const quoteId = `${this.venueId}:${request.nonce}`;
    const base: Quote = {
      quoteId,
      venueId: this.venueId,
      give: { asset: pair.give, amount: request.give.amount },
      receive: { asset: pair.want, amount: receive.toString() },
      feeBps: cfg.feeBps ?? 0,
      sourceKind: cfg.sourceKind ?? 'AMM',
      settlementMode: this.settlementMode, // every quote carries the venue's mode
      firmness: cfg.firmness ?? 'indicative',
      validUntil: cfg.quoteValidUntil ?? DEFAULT_VALID_UNTIL,
    };
    if (base.firmness === 'firm') {
      return Promise.resolve({
        ...base,
        commitment: `${quoteId}:commit`,
        signature: `${quoteId}:sig`,
      });
    }
    return Promise.resolve(base);
  }
}
