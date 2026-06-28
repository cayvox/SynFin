import {
  Decimal,
  type AssetId,
  type Quote,
  type QuoteRejection,
  type QuoteRequest,
  type VenueAdapter,
} from '@synfin/spec';
import { fetchJson, type Fetcher } from './http.js';

/**
 * `CantexAdapter`: a **real** {@link VenueAdapter} for Cantex's (CaviarNine)
 * PUBLIC pool quote API (SPEC §5; ADR-0009; RFC-0004).
 *
 * **Quote layer only.** This adapter uses only the PUBLIC, no-auth, no-account
 * endpoint that the cantex.io front page calls before sign-in
 * (`POST /v1/public/pools/quote`); it never touches the authenticated SDK
 * `/v2/pools/quote` path. Cantex settles its own swaps atomically on-ledger, but
 * the public quote path does not expose CIP-0056 allocation composition, so this
 * adapter honestly declares `settlementMode = 'managed-deposit'` (Mode B), not
 * `atomic-allocation`, and produces a price-only {@link Quote}.
 *
 * Real quote semantics (verified against the live public endpoint):
 * - Request body, all decimal STRINGS:
 *   `{ sellAmount, sellInstrumentId, sellInstrumentAdmin, buyInstrumentId,
 *   buyInstrumentAdmin }`. The instrument id + admin are Cantex registry values
 *   that differ from the SQSS request asset, so a catalog supplies them.
 * - Response: nested QuoteLeg objects `{ amount, instrument_id, instrument_admin }`
 *   with all numbers as strings. `returned.amount` (the buy asset) is already net
 *   of the 5 bps POOL fee, so `feeBps` is reported as `0`.
 * - `fees.network_fee` is a FLAT per-swap amount denominated in the SELL asset
 *   (CC/Amulet), charged ON TOP of the give (the AMM consumes the full
 *   `sellAmount`), and WAIVED for `sellAmount >= 500` (network_fee = 0). The flat
 *   amount can change over time, so it is read from each response, never
 *   hardcoded. It is modeled as a taker-favorable haircut on `receive` (see
 *   {@link normalizeCantexQuote}).
 * - The endpoint exposes no validity, so quotes are `firmness = 'indicative'`
 *   and the adapter stamps a conservative TTL.
 *
 * The class performs only the impure fetch; {@link normalizeCantexQuote} is a
 * pure, deterministic function of `(raw response, request, receivedAt)` and is
 * unit-tested against golden fixtures without a network (ARCHITECTURE.md §1
 * invariant #5).
 */

/** Default PUBLIC API base URL (no auth, no account). */
const DEFAULT_BASE_URL = 'https://api.cantex.io/v1/public';
/** Conservative validity window: the venue exposes none. */
const DEFAULT_TTL_SECONDS = 30;

/**
 * Token catalog (SQSS `instrumentId` to the Cantex registry instrument id +
 * admin + decimals). The Cantex id/admin are sent in the request body, not the
 * SQSS request asset's registry (which may be a placeholder). The full real
 * values were captured from the live public `GET /v1/public/tokens/info`.
 * Decimals are cross-referenced from CantonSwap's live `GET /nswap/tokens`
 * (CC/Amulet = 10, USDCx = 6). Only the confirmed CC/USDCx pool is listed; other
 * tokens are omitted until their real admin and decimals are captured (precision
 * is never guessed, SPEC §3).
 */
const CANTEX_TOKENS: Readonly<
  Record<
    string,
    {
      readonly instrumentId: string;
      readonly instrumentAdmin: string;
      readonly decimals: number;
    }
  >
> = {
  Amulet: {
    instrumentId: 'Amulet',
    instrumentAdmin:
      'DSO::1220b1431ef217342db44d516bb9befde802be7d8899637d290895fa58880f19accc',
    decimals: 10,
  },
  USDCx: {
    instrumentId: 'USDCx',
    instrumentAdmin:
      'decentralized-usdc-interchain-rep::12208115f1e168dd7e792320be9c4ca720c751a02a3053c7606e1c1cd3dad9bf60ef',
    decimals: 6,
  },
};

/** Configuration for a {@link CantexAdapter}. */
export interface CantexConfig {
  /** Base URL (default {@link DEFAULT_BASE_URL}). */
  readonly baseUrl?: string;
  /** Injected transport (default {@link fetchJson}; tests inject fixtures). */
  readonly fetcher?: Fetcher;
  /** Clock for `validUntil` (default `() => new Date()`; tests inject a fixed clock). */
  readonly now?: () => Date;
  /** Validity window for issued quotes, seconds (default 30). */
  readonly ttlSeconds?: number;
}

/** Context for the pure normalizer. */
export interface CantexNormalizeContext {
  readonly venueId: string;
  readonly request: QuoteRequest;
  /** When the response was received (drives `validUntil`). */
  readonly receivedAt: Date;
  /** Validity window in seconds. */
  readonly ttlSeconds: number;
  /**
   * The Cantex sell-side instrument id (e.g. `Amulet`). A flat `network_fee`, if
   * present, MUST be denominated in this asset; otherwise the response is
   * rejected rather than guessed.
   */
  readonly giveInstrumentId: string;
}

/** Narrow an unknown to a string. */
function asString(v: unknown): string | undefined {
  return typeof v === 'string' ? v : undefined;
}
/** Narrow an unknown to a plain object. */
function asRecord(v: unknown): Record<string, unknown> | undefined {
  return typeof v === 'object' && v !== null
    ? (v as Record<string, unknown>)
    : undefined;
}

/**
 * Pure, deterministic normalizer: a raw Cantex public quote response to a
 * spec-valid {@link Quote} or a typed {@link QuoteRejection}. The venue response
 * is untrusted input (ARCHITECTURE.md §1 invariant #7); this function never
 * throws.
 *
 * Fee modeling (never overstates the receipt, SPEC §3):
 * - The 5 bps POOL fee is already inside `returned.amount`, so `feeBps` is `0`.
 * - The flat CC `network_fee` is charged on top of the give. Rather than inflate
 *   the give (which would make the router mis-scale this leg), it is reflected as
 *   a taker-favorable haircut on `receive`: `effectiveGive = give - networkFee`,
 *   then `receive = returned * effectiveGive / give` floored to the want
 *   precision. This equals `returned` (floored) when the fee is `0`, and because
 *   AMM output is concave in input, the linear scaling under-estimates the true
 *   `returned(give - fee)`: it never overstates. The Quote's `give` stays pinned
 *   to the intent's give so cross-venue `assetEquals` and routing are consistent.
 */
export function normalizeCantexQuote(
  raw: unknown,
  ctx: CantexNormalizeContext,
): Quote | QuoteRejection {
  const { venueId, request, receivedAt, ttlSeconds, giveInstrumentId } = ctx;
  const reject = (code: string, message?: string): QuoteRejection =>
    message === undefined ? { venueId, code } : { venueId, code, message };

  const r = asRecord(raw);
  if (r === undefined) {
    return reject('invalid_response', 'venue response was not a JSON object');
  }

  // returned: nested QuoteLeg { amount, instrument_id, instrument_admin }, the
  // buy-asset output already net of the pool fee.
  const returned = asRecord(r['returned']);
  const returnedAmountStr =
    returned !== undefined ? asString(returned['amount']) : undefined;
  if (returnedAmountStr === undefined) {
    return reject('invalid_response', 'missing returned.amount');
  }
  const grossReturned = Decimal.parse(returnedAmountStr);
  if (grossReturned === undefined) {
    return reject('invalid_response', 'returned.amount is not a valid decimal');
  }
  if (!grossReturned.isPositive()) {
    return reject(
      'insufficient_liquidity',
      'venue quoted a non-positive output',
    );
  }

  // network_fee: a FLAT per-swap amount in the SELL asset, charged on top of the
  // give. Absent (or waived) means 0.
  let networkFee = Decimal.zero();
  const fees = asRecord(r['fees']);
  const nf = fees !== undefined ? asRecord(fees['network_fee']) : undefined;
  if (nf !== undefined) {
    const nfAmountStr = asString(nf['amount']);
    if (nfAmountStr === undefined) {
      return reject('invalid_response', 'network_fee.amount is missing');
    }
    const parsed = Decimal.parse(nfAmountStr);
    if (parsed === undefined || parsed.isNegative()) {
      return reject('invalid_response', 'network_fee.amount is not valid');
    }
    // A non-zero flat fee must be in the sell asset; if it is in a different
    // asset we cannot net it against the give, so reject rather than guess.
    if (
      parsed.isPositive() &&
      asString(nf['instrument_id']) !== giveInstrumentId
    ) {
      return reject(
        'invalid_response',
        'network_fee is in an unexpected asset',
      );
    }
    networkFee = parsed;
  }

  // The give comes from the intent (already validated by quote()); re-parse
  // defensively so the pure normalizer never throws on bad input.
  const giveAmount = Decimal.parse(request.give.amount);
  if (giveAmount === undefined || !giveAmount.isPositive()) {
    return reject(
      'invalid_request',
      'give amount is not a valid positive decimal',
    );
  }

  // Taker-favorable haircut for the flat CC network fee (see the doc comment).
  const effectiveGive = giveAmount.sub(networkFee);
  if (!effectiveGive.isPositive()) {
    return reject(
      'insufficient_liquidity',
      'network fee meets or exceeds the give; uneconomical at this size',
    );
  }

  // receive = returned * effectiveGive / give, floored to want precision. Equals
  // returned (floored) when networkFee is 0. Mirrors router-ref buildLeg.
  const receive = grossReturned
    .mul(effectiveGive)
    .divide(giveAmount, request.want.asset.decimals, 'floor');
  if (!receive.isPositive()) {
    return reject(
      'insufficient_liquidity',
      'output rounds to zero at instrument precision',
    );
  }

  const validUntil = new Date(
    receivedAt.getTime() + ttlSeconds * 1000,
  ).toISOString();

  return {
    quoteId: `${venueId}:${request.nonce}`,
    venueId,
    give: { asset: request.give.asset, amount: request.give.amount },
    receive: { asset: request.want.asset, amount: receive.toString() },
    feeBps: 0, // 5 bps pool fee already inside returned; flat CC fee haircuts receive
    sourceKind: 'AMM',
    settlementMode: 'managed-deposit',
    firmness: 'indicative',
    validUntil,
  };
}

export class CantexAdapter implements VenueAdapter {
  readonly venueId = 'cantex';
  readonly settlementMode = 'managed-deposit' as const;

  readonly #baseUrl: string;
  readonly #fetcher: Fetcher;
  readonly #now: () => Date;
  readonly #ttlSeconds: number;

  constructor(config: CantexConfig = {}) {
    this.#baseUrl = (config.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, '');
    this.#fetcher = config.fetcher ?? fetchJson();
    this.#now = config.now ?? ((): Date => new Date());
    this.#ttlSeconds = config.ttlSeconds ?? DEFAULT_TTL_SECONDS;
  }

  /** Resolve a SQSS asset to its Cantex instrument id + admin, validating decimals. */
  #resolveToken(
    asset: AssetId,
  ): { code: string } | { instrumentId: string; instrumentAdmin: string } {
    const known = CANTEX_TOKENS[asset.instrumentId];
    if (known === undefined) return { code: 'pair_unsupported' };
    if (known.decimals !== asset.decimals) {
      return { code: 'asset_decimals_mismatch' };
    }
    return {
      instrumentId: known.instrumentId,
      instrumentAdmin: known.instrumentAdmin,
    };
  }

  async quote(request: QuoteRequest): Promise<Quote | QuoteRejection> {
    const reject = (code: string, message?: string): QuoteRejection =>
      message === undefined
        ? { venueId: this.venueId, code }
        : { venueId: this.venueId, code, message };

    const give = this.#resolveToken(request.give.asset);
    if (!('instrumentId' in give))
      return reject(give.code, 'give asset not supported by venue');
    const want = this.#resolveToken(request.want.asset);
    if (!('instrumentId' in want))
      return reject(want.code, 'want asset not supported by venue');

    // Reject a malformed/over-precise/non-positive give before any network call
    // (untrusted input; keeps the adapter from ever issuing an invalid quote).
    const giveAmount = Decimal.parse(request.give.amount);
    if (
      giveAmount === undefined ||
      !giveAmount.isPositive() ||
      giveAmount.scale > request.give.asset.decimals
    ) {
      return reject(
        'invalid_request',
        'give amount is not a valid in-precision positive decimal',
      );
    }

    // Body uses the Cantex catalog id/admin, NOT request.asset.registry.
    const body: Record<string, unknown> = {
      sellAmount: request.give.amount,
      sellInstrumentId: give.instrumentId,
      sellInstrumentAdmin: give.instrumentAdmin,
      buyInstrumentId: want.instrumentId,
      buyInstrumentAdmin: want.instrumentAdmin,
    };

    const res = await this.#fetcher({
      url: `${this.#baseUrl}/pools/quote`,
      method: 'POST',
      body,
    });

    if (res.status >= 500) {
      return reject('venue_error', `venue returned status ${res.status}`);
    }
    if (res.status >= 400) {
      // Surface the venue's { error } message when present.
      const errBody = asRecord(res.body);
      const msg =
        errBody !== undefined ? asString(errBody['error']) : undefined;
      return reject(
        'invalid_request',
        msg ?? `venue rejected request (status ${res.status})`,
      );
    }

    return normalizeCantexQuote(res.body, {
      venueId: this.venueId,
      request,
      receivedAt: this.#now(),
      ttlSeconds: this.#ttlSeconds,
      giveInstrumentId: give.instrumentId,
    });
  }
}
