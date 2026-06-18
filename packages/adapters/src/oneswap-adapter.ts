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
 * `OneSwapAdapter` — a **real** {@link VenueAdapter} for OneSwap's read-only
 * quote API (SPEC §5; ADR-0009; RFC-0004).
 *
 * **Quote layer only.** OneSwap is a **Mode B (`managed-deposit`)** venue
 * (ADR-0009): a swap is settled by creating an intent and depositing to a pool
 * party with a transfer reference (a 24h, fundless-until-deposited intent), not
 * via a CIP-0056 atomic allocation. This adapter declares
 * `settlementMode = 'managed-deposit'` and uses only the **read-only price
 * preview** — `client.quotes.get(...)`, which "returns a price quote without
 * creating intents or deposits" (docs.oneswap.cc/reference/sdk-methods). It
 * never calls `swaps.create` (the funded path) — that is the deferred
 * managed-execution path (RFC-0004).
 *
 * Real quote semantics (docs: <https://docs.oneswap.cc>):
 * - Constant-product AMM. The `Quote` carries `outputAmount` (net of pool +
 *   platform + network fees), `rate`, `priceImpact`, `expiresIn` (validity in
 *   seconds), and `settlementSafety` (non-null ⇒ the swap would be blocked).
 * - Quoting requires an **API key** (`apiKey: 'os_live_…'`); it is read-only and
 *   moves no funds. The key is supplied via config (the CLI reads it from
 *   `ONESWAP_API_KEY`); it is never logged or persisted by this adapter.
 * - Quotes are **indicative** (an AMM preview; the fill is subject to slippage
 *   at deposit time). `feeBps` is reported as `0` because the fees are already
 *   reflected in `outputAmount` (a per-component breakdown exists on the raw
 *   response but belongs to the deferred managed-execution path).
 *
 * The class performs only the impure fetch; {@link normalizeOneSwapQuote} is a
 * pure, deterministic function unit-tested against golden fixtures without a
 * network (ARCHITECTURE.md §1 invariant #5).
 */

/** Default validity window if the venue omits `expiresIn`. */
const DEFAULT_TTL_SECONDS = 30;

/**
 * Token catalog (SQSS `instrumentId` → OneSwap symbol + decimals). OneSwap
 * trades the same Canton-native instruments as CantonSwap; decimals are
 * cross-referenced from CantonSwap's live `GET /nswap/tokens` (CC/Amulet = 10,
 * USDCx = 6). In SDK code "use `Amulet` when you mean CC (Amulet)"
 * (docs.oneswap.cc/quickstart).
 */
const ONESWAP_TOKENS: Readonly<Record<string, { readonly decimals: number }>> =
  {
    Amulet: { decimals: 10 },
    USDCx: { decimals: 6 },
  };

/** Configuration for a {@link OneSwapAdapter}. */
export interface OneSwapConfig {
  /** Base URL of the quote backend (required for live use; the CLI wires this). */
  readonly baseUrl?: string;
  /** OneSwap API key (read from env by the CLI; never logged/persisted). */
  readonly apiKey?: string;
  /** Injected transport (default {@link fetchJson}; tests inject fixtures). */
  readonly fetcher?: Fetcher;
  /** Clock for `validUntil` (default `() => new Date()`; tests inject a fixed clock). */
  readonly now?: () => Date;
  /** Fallback validity window in seconds when `expiresIn` is absent (default 30). */
  readonly ttlSeconds?: number;
}

/** Context for the pure normalizer. */
export interface OneSwapNormalizeContext {
  readonly venueId: string;
  readonly request: QuoteRequest;
  readonly receivedAt: Date;
  /** Fallback validity window if the response omits `expiresIn`. */
  readonly ttlSeconds: number;
}

function asString(v: unknown): string | undefined {
  return typeof v === 'string' ? v : undefined;
}
function asFiniteNumber(v: unknown): number | undefined {
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
}

/**
 * Pure, deterministic normalizer: a raw OneSwap `Quote` → a spec-valid
 * {@link Quote} or a typed {@link QuoteRejection}. Untrusted input: malformed
 * shapes, mismatched assets, non-positive/over-precise amounts, and a non-null
 * `settlementSafety` all become typed rejections; never throws.
 */
export function normalizeOneSwapQuote(
  raw: unknown,
  ctx: OneSwapNormalizeContext,
): Quote | QuoteRejection {
  const { venueId, request, receivedAt, ttlSeconds } = ctx;
  const reject = (code: string, message?: string): QuoteRejection =>
    message === undefined ? { venueId, code } : { venueId, code, message };

  if (typeof raw !== 'object' || raw === null) {
    return reject('invalid_response', 'venue response was not a JSON object');
  }
  const r = raw as Record<string, unknown>;

  // A non-null settlementSafety means the venue would block the swap.
  const safety = r['settlementSafety'];
  if (safety !== null && typeof safety === 'object' && safety !== undefined) {
    const code = asString((safety as Record<string, unknown>)['code']);
    return reject(
      'settlement_blocked',
      code ?? 'venue flagged settlement safety',
    );
  }

  const inputToken = asString(r['inputToken']);
  const outputToken = asString(r['outputToken']);
  const outputAmountRaw = asString(r['outputAmount']);
  if (
    inputToken === undefined ||
    outputToken === undefined ||
    outputAmountRaw === undefined
  ) {
    return reject(
      'invalid_response',
      'missing inputToken/outputToken/outputAmount',
    );
  }

  if (
    inputToken !== request.give.asset.instrumentId ||
    outputToken !== request.want.asset.instrumentId
  ) {
    return reject('invalid_response', 'venue echoed a different pair');
  }

  const gross = Decimal.parse(outputAmountRaw);
  if (gross === undefined) {
    return reject('invalid_response', 'outputAmount is not a valid decimal');
  }
  if (!gross.isPositive()) {
    return reject(
      'insufficient_liquidity',
      'venue quoted a non-positive output',
    );
  }

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

  // Validity from the venue's expiresIn (seconds); fall back to a conservative TTL.
  const expiresIn = asFiniteNumber(r['expiresIn']);
  const ttl = expiresIn !== undefined && expiresIn > 0 ? expiresIn : ttlSeconds;
  const validUntil = new Date(receivedAt.getTime() + ttl * 1000).toISOString();

  return {
    quoteId: `${venueId}:${request.nonce}`,
    venueId,
    give: { asset: request.give.asset, amount: request.give.amount },
    receive: { asset: request.want.asset, amount: receive.toString() },
    feeBps: 0, // fees embedded in outputAmount; receive is already net
    sourceKind: 'AMM',
    settlementMode: 'managed-deposit',
    firmness: 'indicative',
    validUntil,
  };
}

export class OneSwapAdapter implements VenueAdapter {
  readonly venueId = 'oneswap';
  readonly settlementMode = 'managed-deposit' as const;

  readonly #baseUrl: string | undefined;
  readonly #apiKey: string | undefined;
  readonly #fetcher: Fetcher;
  readonly #now: () => Date;
  readonly #ttlSeconds: number;

  constructor(config: OneSwapConfig = {}) {
    this.#baseUrl = config.baseUrl?.replace(/\/+$/, '');
    this.#apiKey = config.apiKey;
    this.#fetcher = config.fetcher ?? fetchJson();
    this.#now = config.now ?? ((): Date => new Date());
    this.#ttlSeconds = config.ttlSeconds ?? DEFAULT_TTL_SECONDS;
  }

  #resolveToken(asset: AssetId): { code: string } | { ok: true } {
    const known = ONESWAP_TOKENS[asset.instrumentId];
    if (known === undefined) return { code: 'pair_unsupported' };
    if (known.decimals !== asset.decimals)
      return { code: 'asset_decimals_mismatch' };
    return { ok: true };
  }

  async quote(request: QuoteRequest): Promise<Quote | QuoteRejection> {
    const reject = (code: string, message?: string): QuoteRejection =>
      message === undefined
        ? { venueId: this.venueId, code }
        : { venueId: this.venueId, code, message };

    const give = this.#resolveToken(request.give.asset);
    if (!('ok' in give))
      return reject(give.code, 'give asset not supported by venue');
    const want = this.#resolveToken(request.want.asset);
    if (!('ok' in want))
      return reject(want.code, 'want asset not supported by venue');

    // Reject a malformed/over-precise/non-positive give before any network call.
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

    if (this.#baseUrl === undefined || this.#apiKey === undefined) {
      // No live endpoint/key configured: the caller (e.g. the CLI) is expected
      // to fall back to fixtures. We never invent a quote.
      return reject('not_configured', 'OneSwap baseUrl/apiKey not configured');
    }

    const params = new URLSearchParams({
      from: request.give.asset.instrumentId,
      to: request.want.asset.instrumentId,
      amount: request.give.amount,
    });
    const res = await this.#fetcher({
      url: `${this.#baseUrl}/quotes?${params.toString()}`,
      method: 'GET',
      headers: { authorization: `Bearer ${this.#apiKey}` },
    });

    if (res.status >= 500)
      return reject('venue_error', `venue returned status ${res.status}`);
    if (res.status === 401 || res.status === 403) {
      return reject('unauthorized', 'OneSwap rejected the API key');
    }
    if (res.status >= 400) {
      return reject(
        'invalid_request',
        `venue rejected request (status ${res.status})`,
      );
    }

    return normalizeOneSwapQuote(res.body, {
      venueId: this.venueId,
      request,
      receivedAt: this.#now(),
      ttlSeconds: this.#ttlSeconds,
    });
  }
}
