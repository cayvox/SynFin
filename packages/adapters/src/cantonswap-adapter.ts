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
 * `CantonSwapAdapter` — a **real** {@link VenueAdapter} for CantonSwap's public
 * quote API (SPEC §5; ADR-0009; RFC-0004).
 *
 * **Quote layer only.** CantonSwap is a **Mode B (`managed-deposit`)** venue
 * (ADR-0009): it settles by depositing to a venue address (`swapAddress`+`memo`)
 * that its quote returns, *not* via a CIP-0056 atomic allocation. This adapter
 * therefore declares `settlementMode = 'managed-deposit'` and produces a
 * price-only {@link Quote}. The deposit/execution details (`memo`,
 * `swapAddress`, `magicAddress`) are **intentionally dropped** — they belong to
 * the deferred managed-execution path (RFC-0004), not to a quote.
 *
 * Real quote semantics (docs: <https://cantonswap.nightly.app/docs>):
 * - `POST /nswap/quote` → `{ fromAmount, toAmount, minOutAmount, rate,
 *   priceImpact, memo, swapAddress, magicAddress? }`. No API key/auth. Obtaining
 *   a quote is **read-only and fundless** (it computes a route; it moves no
 *   funds and creates no on-chain commitment).
 * - Fees are embedded in the venue's `toAmount`; there is no separate bps field,
 *   so `feeBps` is reported as `0` and the net `receive` (= `toAmount`, floored
 *   to the want instrument's precision, taker-favorable) already reflects fees.
 * - The API exposes no `validUntil` ("refresh quote before swap"), so quotes are
 *   **indicative** and the adapter stamps a conservative TTL.
 *
 * The class only performs the impure fetch; {@link normalizeCantonSwapQuote} is
 * a pure, deterministic function of `(raw response, request, receivedAt)` and is
 * unit-tested against golden fixtures without a network (ARCHITECTURE.md §1
 * invariant #5).
 */

/** Default mainnet RPC base URL (docs). */
const DEFAULT_BASE_URL = 'https://mainnet.rpc.canton.nightly.app';
/** Conservative validity window when the venue exposes none. */
const DEFAULT_TTL_SECONDS = 30;

/**
 * Token catalog (SQSS `instrumentId` → CantonSwap token + decimals), mirroring
 * the live `GET /nswap/tokens` response captured 2026-06-18 (see
 * `fixtures/cantonswap/tokens.json`). CantonSwap's `fromToken`/`toToken` request
 * fields use these `instrumentId` strings. Kept as a small documented map so the
 * adapter is pure (no catalog fetch on the quote path); refresh from the live
 * endpoint if the venue adds instruments.
 */
const CANTONSWAP_TOKENS: Readonly<
  Record<string, { readonly decimals: number }>
> = {
  Amulet: { decimals: 10 },
  USDCx: { decimals: 6 },
  CBTC: { decimals: 8 },
};

/** Configuration for a {@link CantonSwapAdapter}. */
export interface CantonSwapConfig {
  /** Base URL (default mainnet RPC). */
  readonly baseUrl?: string;
  /** Injected transport (default {@link fetchJson}; tests inject fixtures). */
  readonly fetcher?: Fetcher;
  /** Clock for `validUntil` (default `() => new Date()`; tests inject a fixed clock). */
  readonly now?: () => Date;
  /** Validity window for issued quotes, seconds (default 30). */
  readonly ttlSeconds?: number;
  /** Optional slippage tolerance forwarded to the venue (informational only here). */
  readonly slippageTolerance?: number;
}

/** Context for the pure normalizer. */
export interface CantonSwapNormalizeContext {
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

/**
 * Pure, deterministic normalizer: a raw CantonSwap quote response → a
 * spec-valid {@link Quote} or a typed {@link QuoteRejection}. The venue response
 * is untrusted input (ARCHITECTURE.md §1 invariant #7): malformed shapes,
 * mismatched assets, non-positive or over-precise amounts, and the venue's
 * maintenance/error body all become typed rejections — this function never
 * throws.
 */
export function normalizeCantonSwapQuote(
  raw: unknown,
  ctx: CantonSwapNormalizeContext,
): Quote | QuoteRejection {
  const { venueId, request, receivedAt, ttlSeconds } = ctx;
  const reject = (code: string, message?: string): QuoteRejection =>
    message === undefined ? { venueId, code } : { venueId, code, message };

  if (typeof raw !== 'object' || raw === null) {
    return reject('invalid_response', 'venue response was not a JSON object');
  }
  const r = raw as Record<string, unknown>;

  // The venue's documented error/maintenance body: { message: "..." } with no
  // quote fields. Surface as a typed venue error, never a crash.
  if (
    asString(r['toAmount']) === undefined &&
    asString(r['message']) !== undefined
  ) {
    return reject('venue_error', asString(r['message']));
  }

  const toToken = asString(r['toToken']);
  const fromToken = asString(r['fromToken']);
  const toAmountRaw = asString(r['toAmount']);
  if (
    fromToken === undefined ||
    toToken === undefined ||
    toAmountRaw === undefined
  ) {
    return reject('invalid_response', 'missing fromToken/toToken/toAmount');
  }

  // The venue must answer for the assets we asked about.
  if (
    fromToken !== request.give.asset.instrumentId ||
    toToken !== request.want.asset.instrumentId
  ) {
    return reject('invalid_response', 'venue echoed a different pair');
  }

  const gross = Decimal.parse(toAmountRaw);
  if (gross === undefined) {
    return reject('invalid_response', 'toAmount is not a valid decimal');
  }
  if (!gross.isPositive()) {
    return reject(
      'insufficient_liquidity',
      'venue quoted a non-positive output',
    );
  }

  // Floor to the want instrument's precision, in the taker's favour (SPEC §3) —
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
    feeBps: 0, // fees embedded in the venue's toAmount; receive is already net
    sourceKind: 'AMM',
    settlementMode: 'managed-deposit',
    firmness: 'indicative',
    validUntil,
  };
}

export class CantonSwapAdapter implements VenueAdapter {
  readonly venueId = 'cantonswap';
  readonly settlementMode = 'managed-deposit' as const;

  readonly #baseUrl: string;
  readonly #fetcher: Fetcher;
  readonly #now: () => Date;
  readonly #ttlSeconds: number;
  readonly #slippageTolerance: number | undefined;

  constructor(config: CantonSwapConfig = {}) {
    this.#baseUrl = (config.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, '');
    this.#fetcher = config.fetcher ?? fetchJson();
    this.#now = config.now ?? ((): Date => new Date());
    this.#ttlSeconds = config.ttlSeconds ?? DEFAULT_TTL_SECONDS;
    this.#slippageTolerance = config.slippageTolerance;
  }

  /** Resolve a SQSS asset to its CantonSwap token, validating decimals. */
  #resolveToken(asset: AssetId): { code: string } | { ok: true } {
    const known = CANTONSWAP_TOKENS[asset.instrumentId];
    if (known === undefined) return { code: 'pair_unsupported' };
    if (known.decimals !== asset.decimals) {
      return { code: 'asset_decimals_mismatch' };
    }
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

    const body: Record<string, unknown> = {
      fromToken: request.give.asset.instrumentId,
      toToken: request.want.asset.instrumentId,
      amount: request.give.amount,
      // A recipient is required by the API to compute an executable route; it is
      // not the taker's real party and no funds move. The quote layer ignores
      // the returned deposit instructions entirely.
      recipient: 'synfin-quote-only',
    };
    if (this.#slippageTolerance !== undefined) {
      body['slippageTolerance'] = this.#slippageTolerance;
    }

    const res = await this.#fetcher({
      url: `${this.#baseUrl}/nswap/quote`,
      method: 'POST',
      body,
    });

    if (res.status >= 500) {
      return reject('venue_error', `venue returned status ${res.status}`);
    }
    if (res.status >= 400) {
      return reject(
        'invalid_request',
        `venue rejected request (status ${res.status})`,
      );
    }

    return normalizeCantonSwapQuote(res.body, {
      venueId: this.venueId,
      request,
      receivedAt: this.#now(),
      ttlSeconds: this.#ttlSeconds,
    });
  }
}
