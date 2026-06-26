import {
  Decimal,
  roundTakerFavorable,
  type AssetId,
  type Quote,
  type QuoteRejection,
  type QuoteRequest,
  type VenueAdapter,
} from '@synfin/spec';
import { fetchJson, type Fetcher } from './http.js';

/**
 * `TradecraftAdapter`: a **real** {@link VenueAdapter} for Tradecraft's public
 * AMM quote API (SPEC §5; ADR-0009; RFC-0004).
 *
 * **Quote layer only.** Tradecraft is a **Mode B (`managed-deposit`)** venue
 * (ADR-0009): a swap is settled by depositing to a Pool Address and the on-chain
 * trade only starts after that deposit, so a leg from this venue CANNOT be
 * atomically co-settled. This adapter declares
 * `settlementMode = 'managed-deposit'` and produces a price-only {@link Quote};
 * the deposit/execution details belong to the deferred managed-execution path
 * (RFC-0004), not to a quote.
 *
 * Real quote semantics (Tradecraft AMM HTTP API; docs.tradecraft.fi):
 * - `GET /quoteForFixedInput/{tokenA}/{tokenB}?givingAmount=X` returns
 *   `{ user_gets: number }`, where `tokenA` is the give and `tokenB` the want.
 *   No API key, no auth. Obtaining a quote is read-only and fundless.
 * - `user_gets` is already net of the double-sided constant-product fees, so
 *   `feeBps` is reported as `0` and the net `receive` (floored to the want
 *   instrument's precision, taker-favorable) already reflects fees.
 * - The response carries ONLY `user_gets`: no pair echo, no rate, no validity.
 *   Quotes are explicitly ESTIMATES (the realized price can drift, since the
 *   trade only begins after the deposit), so the adapter reports the
 *   non-binding `firmness = 'indicative'` and stamps a conservative TTL.
 * - The token PATH segments are Tradecraft SYMBOLS (CC, USDCx, CBTC, ...), which
 *   differ from the SQSS `instrumentId` (CC's `instrumentId` is `Amulet`), so a
 *   catalog maps `instrumentId` to its symbol and decimals.
 *
 * The class performs only the impure fetch; {@link normalizeTradecraftQuote} is
 * a pure, deterministic function of `(raw response, request, receivedAt)` and is
 * unit-tested against golden fixtures without a network (ARCHITECTURE.md §1
 * invariant #5).
 */

/** Default public API base URL (docs.tradecraft.fi). */
const DEFAULT_BASE_URL = 'https://api.tradecraft.fi/v1';
/** Conservative validity window: the venue exposes none. */
const DEFAULT_TTL_SECONDS = 30;

/**
 * Token catalog (SQSS `instrumentId` to Tradecraft symbol + decimals). Unlike
 * cantonswap/oneswap, the Tradecraft path segment is a SYMBOL that differs from
 * the `instrumentId` (CC's `instrumentId` is `Amulet`), so the symbol is kept
 * here and used to build the request path. Decimals are cross-referenced from
 * CantonSwap's live `GET /nswap/tokens` (CC/Amulet = 10, USDCx = 6, CBTC = 8).
 * CETH and HANDL are intentionally omitted until their `instrumentId` and
 * decimals are confirmed from a live `/tokens` capture: precision is never
 * guessed (SPEC §3).
 */
const TRADECRAFT_TOKENS: Readonly<
  Record<string, { readonly symbol: string; readonly decimals: number }>
> = {
  Amulet: { symbol: 'CC', decimals: 10 },
  USDCx: { symbol: 'USDCx', decimals: 6 },
  CBTC: { symbol: 'CBTC', decimals: 8 },
};

/** Configuration for a {@link TradecraftAdapter}. */
export interface TradecraftConfig {
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
export interface TradecraftNormalizeContext {
  readonly venueId: string;
  readonly request: QuoteRequest;
  /** When the response was received (drives `validUntil`). */
  readonly receivedAt: Date;
  /** Validity window in seconds. */
  readonly ttlSeconds: number;
}

/** Narrow an unknown to a string. */
function asString(v: unknown): string | undefined {
  return typeof v === 'string' ? v : undefined;
}
/** Narrow an unknown to a finite number. */
function asFiniteNumber(v: unknown): number | undefined {
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
}

/**
 * Coerce the venue's `user_gets` to a canonical, non-exponent decimal string.
 * A JSON double is clamped to [0, 100] and rendered with `toFixed` (fixed
 * notation, no exponent) at well over the want precision, so the venue's float
 * precision is inherited but bounded and parseable. A numeric STRING is accepted
 * defensively and validated by {@link Decimal.parse}. Anything else yields
 * `undefined` so the caller can reject it.
 */
function userGetsToDecimalString(
  value: unknown,
  wantDecimals: number,
): string | undefined {
  const n = asFiniteNumber(value);
  if (n !== undefined) {
    const clamped = Math.min(Math.max(n, 0), 100);
    return clamped.toFixed(wantDecimals + 8);
  }
  return asString(value);
}

/**
 * Pure, deterministic normalizer: a raw Tradecraft quote response to a spec-valid
 * {@link Quote} or a typed {@link QuoteRejection}. The venue response is
 * untrusted input (ARCHITECTURE.md §1 invariant #7): malformed shapes, a
 * non-numeric or non-positive `user_gets`, and the venue's `{ error }` body all
 * become typed rejections. This function never throws. There is no "echoed a
 * different pair" check, since Tradecraft does not echo the pair (it is fixed by
 * the requested path).
 */
export function normalizeTradecraftQuote(
  raw: unknown,
  ctx: TradecraftNormalizeContext,
): Quote | QuoteRejection {
  const { venueId, request, receivedAt, ttlSeconds } = ctx;
  const reject = (code: string, message?: string): QuoteRejection =>
    message === undefined ? { venueId, code } : { venueId, code, message };

  if (typeof raw !== 'object' || raw === null) {
    return reject('invalid_response', 'venue response was not a JSON object');
  }
  const r = raw as Record<string, unknown>;

  // The venue's documented error body: { error: "..." } with no quote field.
  // Surface as a typed venue error, never a crash.
  const errMsg = asString(r['error']);
  if (errMsg !== undefined && r['user_gets'] === undefined) {
    return reject('venue_error', errMsg);
  }

  const grossStr = userGetsToDecimalString(
    r['user_gets'],
    request.want.asset.decimals,
  );
  if (grossStr === undefined) {
    return reject('invalid_response', 'missing or non-numeric user_gets');
  }

  const gross = Decimal.parse(grossStr);
  if (gross === undefined) {
    return reject('invalid_response', 'user_gets is not a valid decimal');
  }
  if (!gross.isPositive()) {
    return reject(
      'insufficient_liquidity',
      'venue quoted a non-positive output',
    );
  }

  // Floor to the want instrument's precision, in the taker's favour (SPEC §3):
  // a normalizer must never overstate the receipt.
  const receive = roundTakerFavorable(
    gross,
    request.want.asset.decimals,
    'receive',
  );
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
    feeBps: 0, // fees already reflected in user_gets; receive is already net
    sourceKind: 'AMM',
    settlementMode: 'managed-deposit',
    firmness: 'indicative',
    validUntil,
  };
}

export class TradecraftAdapter implements VenueAdapter {
  readonly venueId = 'tradecraft';
  readonly settlementMode = 'managed-deposit' as const;

  readonly #baseUrl: string;
  readonly #fetcher: Fetcher;
  readonly #now: () => Date;
  readonly #ttlSeconds: number;

  constructor(config: TradecraftConfig = {}) {
    this.#baseUrl = (config.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, '');
    this.#fetcher = config.fetcher ?? fetchJson();
    this.#now = config.now ?? ((): Date => new Date());
    this.#ttlSeconds = config.ttlSeconds ?? DEFAULT_TTL_SECONDS;
  }

  /** Resolve a SQSS asset to its Tradecraft symbol, validating decimals. */
  #resolveToken(asset: AssetId): { code: string } | { symbol: string } {
    const known = TRADECRAFT_TOKENS[asset.instrumentId];
    if (known === undefined) return { code: 'pair_unsupported' };
    if (known.decimals !== asset.decimals) {
      return { code: 'asset_decimals_mismatch' };
    }
    return { symbol: known.symbol };
  }

  async quote(request: QuoteRequest): Promise<Quote | QuoteRejection> {
    const reject = (code: string, message?: string): QuoteRejection =>
      message === undefined
        ? { venueId: this.venueId, code }
        : { venueId: this.venueId, code, message };

    const give = this.#resolveToken(request.give.asset);
    if (!('symbol' in give))
      return reject(give.code, 'give asset not supported by venue');
    const want = this.#resolveToken(request.want.asset);
    if (!('symbol' in want))
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

    // tokenA = give, tokenB = want; both are Tradecraft symbols (URL-encoded).
    const params = new URLSearchParams({ givingAmount: request.give.amount });
    const url =
      `${this.#baseUrl}/quoteForFixedInput/` +
      `${encodeURIComponent(give.symbol)}/${encodeURIComponent(want.symbol)}` +
      `?${params.toString()}`;
    const res = await this.#fetcher({ url, method: 'GET' });

    if (res.status >= 500) {
      return reject('venue_error', `venue returned status ${res.status}`);
    }
    if (res.status >= 400) {
      // Surface the venue's { error } message when present.
      const body = res.body;
      const msg =
        typeof body === 'object' && body !== null
          ? asString((body as Record<string, unknown>)['error'])
          : undefined;
      return reject(
        'invalid_request',
        msg ?? `venue rejected request (status ${res.status})`,
      );
    }

    return normalizeTradecraftQuote(res.body, {
      venueId: this.venueId,
      request,
      receivedAt: this.#now(),
      ttlSeconds: this.#ttlSeconds,
    });
  }
}
