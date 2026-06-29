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
 * `OneSwapAdapter`: a **real** {@link VenueAdapter} for OneSwap's (Sats Terminal)
 * read-only quote API (SPEC §5; ADR-0009; RFC-0004; RFC-0006 §6).
 *
 * **Quote layer only.** OneSwap is a **Mode B (`managed-deposit`)** venue
 * (ADR-0009): a swap settles by direct-party deposit detection (the taker sends a
 * deposit and the trade begins after it lands), not via a CIP-0056 atomic
 * allocation, so a leg from this venue CANNOT be atomically co-settled. This
 * adapter declares `settlementMode = 'managed-deposit'` and uses only the
 * read-only quote endpoint; it never creates a swap or a deposit (that is the
 * deferred managed-execution path, RFC-0004).
 *
 * Verified live surface (from the official `@oneswap/sdk` and a live read-only
 * probe; treat as the contract):
 * - `GET {baseUrl}/api/v1/quote?from=<name>&to=<name>&amount=<decimal>` with the
 *   header `X-API-Key: <key>`. No wallet token and no party are needed for a
 *   quote. `from`/`to` are token NAMES (`Amulet` for CC, `USDCx`), and `amount`
 *   is in DECIMAL human units (100 means 100 CC), not base units.
 * - Response fields used: `outputAmount` (decimal, what the taker receives,
 *   already net of BOTH the deducted network fee and the 0.3% pool fee),
 *   `totalInputAmount` (decimal, equals the requested amount, the deposit the
 *   taker sends), `networkFeeAmount` (decimal, the FLAT per-swap network fee in
 *   the give asset CC, deducted from WITHIN the deposit), and `expiresIn`.
 * - Fee model (confirmed to 1e-10): deposit = totalInputAmount = amount; the flat
 *   networkFeeAmount is deducted from within it; the 0.3% pool fee is taken on the
 *   remainder; outputAmount is the constant-product price of
 *   `(amount - networkFeeAmount) * (1 - 0.003)`. So the taker sends exactly the
 *   amount, the fee is inside it, and outputAmount is already net of both fees.
 *
 * Fee modeling (RFC-0005 §1, §2; RFC-0006 §2, §3, §6): the network fee is a flat
 * give-asset cost deducted from within the deposit, so it is surfaced as a
 * `networkFee` with `appliedTo: 'deducted_from_give'` in the give asset (CC), and
 * `receive` (`outputAmount`) is already net of it. `feeBps` is `0` because the
 * 0.3% pool fee is already embedded in `outputAmount`, the same convention the
 * Cantex and Tradecraft adapters use for an embedded pool fee. There is no waiver:
 * the network fee is always present and positive. OneSwap returns an EMPTY admin
 * for CC, so the adapter never trusts `inputTokenAdmin`: it echoes the request
 * asset and keys on the token NAME from its catalog.
 *
 * The class performs only the impure fetch; {@link normalizeOneSwapQuote} is a
 * pure, deterministic function of `(raw response, request, receivedAt)` and is
 * unit-tested against real golden fixtures without a network (ARCHITECTURE.md §1
 * invariant #5).
 */

/** Default mainnet base URL (devnet is https://devnet.api.oneswap.cc). */
const DEFAULT_BASE_URL = 'https://api.oneswap.cc';
/** Default validity window if the venue omits `expiresIn`. */
const DEFAULT_TTL_SECONDS = 30;

/**
 * Token catalog (SQSS `instrumentId` to the OneSwap token NAME + decimals). The
 * quote endpoint takes token names: CC is `Amulet`, plus `USDCx` and `CBTC`.
 * Decimals are the confirmed Canton-native precisions (CC/Amulet = 10, USDCx = 6,
 * CBTC = 8), matching the other adapters. Precision is never guessed (SPEC §3).
 */
const ONESWAP_TOKENS: Readonly<
  Record<string, { readonly name: string; readonly decimals: number }>
> = {
  Amulet: { name: 'Amulet', decimals: 10 },
  USDCx: { name: 'USDCx', decimals: 6 },
  CBTC: { name: 'CBTC', decimals: 8 },
};

/** Configuration for a {@link OneSwapAdapter}. */
export interface OneSwapConfig {
  /** Base URL (default {@link DEFAULT_BASE_URL}; devnet overrides it). */
  readonly baseUrl?: string;
  /**
   * OneSwap API key, sent as `X-API-Key` (read from env by the CLI; never logged
   * or persisted). Optional so the CLI can construct the adapter before knowing
   * whether a key is configured; a quote without a key returns `not_configured`.
   */
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
  /** When the response was received (drives `validUntil`). */
  readonly receivedAt: Date;
  /** Fallback validity window if the response omits `expiresIn`. */
  readonly ttlSeconds: number;
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
/** Narrow an unknown to a finite number. */
function asFiniteNumber(v: unknown): number | undefined {
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
}

/**
 * The network fee actually charged, as a decimal string. A `networkFeePolicy`
 * (e.g. a per-key discount) may carry a distinct `chargedNetworkFeeAmount`; when
 * present it wins, otherwise the flat `networkFeeAmount` is used. The amount is
 * always read from the response, never hardcoded.
 */
function chargedNetworkFee(r: Record<string, unknown>): string | undefined {
  const policy = asRecord(r['networkFeePolicy']);
  if (policy !== undefined) {
    const charged = asString(policy['chargedNetworkFeeAmount']);
    if (charged !== undefined) return charged;
  }
  return asString(r['networkFeeAmount']);
}

/**
 * Pure, deterministic normalizer: a raw OneSwap quote response to a spec-valid
 * {@link Quote} or a typed {@link QuoteRejection}. The venue response is
 * untrusted input (ARCHITECTURE.md §1 invariant #7); this function never throws.
 *
 * Fee modeling (RFC-0006 §2, §3): the flat `networkFeeAmount` is a give-asset fee
 * deducted from within the deposit, surfaced as `networkFee` with
 * `appliedTo: 'deducted_from_give'`. `receive` is `outputAmount`, floored to the
 * want precision in the taker's favor, and is ALREADY net of the deducted fee and
 * the embedded pool fee, so `feeBps` is `0`. The deposit (`totalInputAmount`) MUST
 * equal the requested give amount: that equality is what makes the fee a
 * deduction from within (not on top), so a mismatch is rejected rather than
 * mislabeled.
 */
export function normalizeOneSwapQuote(
  raw: unknown,
  ctx: OneSwapNormalizeContext,
): Quote | QuoteRejection {
  const { venueId, request, receivedAt, ttlSeconds } = ctx;
  const reject = (code: string, message?: string): QuoteRejection =>
    message === undefined ? { venueId, code } : { venueId, code, message };

  const r = asRecord(raw);
  if (r === undefined) {
    return reject('invalid_response', 'venue response was not a JSON object');
  }

  const outputAmountRaw = asString(r['outputAmount']);
  const totalInputRaw = asString(r['totalInputAmount']);
  const networkFeeRaw = chargedNetworkFee(r);
  if (
    outputAmountRaw === undefined ||
    totalInputRaw === undefined ||
    networkFeeRaw === undefined
  ) {
    return reject(
      'invalid_response',
      'missing outputAmount/totalInputAmount/networkFeeAmount',
    );
  }

  // The deposit MUST equal the requested give amount: the flat network fee is
  // deducted from WITHIN this deposit (RFC-0006 §3). If they differ, the
  // deducted-from-within assumption is broken, so reject rather than proceed.
  const totalInput = Decimal.parse(totalInputRaw);
  const giveAmount = Decimal.parse(request.give.amount);
  if (
    totalInput === undefined ||
    giveAmount === undefined ||
    !totalInput.eq(giveAmount)
  ) {
    return reject(
      'invalid_response',
      'totalInputAmount does not equal the requested give amount',
    );
  }

  const networkFee = Decimal.parse(networkFeeRaw);
  if (networkFee === undefined || networkFee.isNegative()) {
    return reject(
      'invalid_response',
      'networkFeeAmount is not a valid non-negative decimal',
    );
  }

  const gross = Decimal.parse(outputAmountRaw);
  if (gross === undefined) {
    return reject('invalid_response', 'outputAmount is not a valid decimal');
  }
  if (!gross.isPositive()) {
    // A non-positive output: e.g. the amount is at or below the flat network fee,
    // so nothing meaningful trades.
    return reject(
      'insufficient_liquidity',
      'venue quoted a non-positive output',
    );
  }

  // receive: the delivered output, floored to the want precision in the taker's
  // favor. It is already net of the deducted network fee and the embedded pool
  // fee (RFC-0006 §3), so it is NOT reduced again here.
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
    feeBps: 0, // the 0.3% pool fee is already inside outputAmount
    sourceKind: 'AMM',
    settlementMode: 'managed-deposit',
    firmness: 'indicative',
    validUntil,
    // A flat give-asset fee deducted from within the deposit (RFC-0006 §2, §3),
    // read from the response (no waiver). The asset is the give asset, so it
    // satisfies the deducted_from_give give-asset rule.
    networkFee: {
      asset: request.give.asset,
      amount: networkFeeRaw,
      appliedTo: 'deducted_from_give' as const,
    },
  };
}

export class OneSwapAdapter implements VenueAdapter {
  readonly venueId = 'oneswap';
  readonly settlementMode = 'managed-deposit' as const;

  readonly #baseUrl: string;
  readonly #apiKey: string | undefined;
  readonly #fetcher: Fetcher;
  readonly #now: () => Date;
  readonly #ttlSeconds: number;

  constructor(config: OneSwapConfig = {}) {
    this.#baseUrl = (config.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, '');
    this.#apiKey = config.apiKey;
    this.#fetcher = config.fetcher ?? fetchJson();
    this.#now = config.now ?? ((): Date => new Date());
    this.#ttlSeconds = config.ttlSeconds ?? DEFAULT_TTL_SECONDS;
  }

  /** Resolve a SQSS asset to its OneSwap token name, validating decimals. */
  #resolveToken(asset: AssetId): { code: string } | { name: string } {
    const known = ONESWAP_TOKENS[asset.instrumentId];
    if (known === undefined) return { code: 'pair_unsupported' };
    if (known.decimals !== asset.decimals) {
      return { code: 'asset_decimals_mismatch' };
    }
    return { name: known.name };
  }

  async quote(request: QuoteRequest): Promise<Quote | QuoteRejection> {
    const reject = (code: string, message?: string): QuoteRejection =>
      message === undefined
        ? { venueId: this.venueId, code }
        : { venueId: this.venueId, code, message };

    const give = this.#resolveToken(request.give.asset);
    if (!('name' in give))
      return reject(give.code, 'give asset not supported by venue');
    const want = this.#resolveToken(request.want.asset);
    if (!('name' in want))
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

    if (this.#apiKey === undefined) {
      // No key configured: the caller (e.g. the CLI) is expected to fall back to
      // fixtures. We never invent a quote.
      return reject('not_configured', 'OneSwap apiKey not configured');
    }

    // from/to are token NAMES; amount is decimal human units. No fromAdmin/toAdmin
    // are sent: the probe confirmed the quote works without them, and OneSwap
    // returns an empty admin for CC.
    const params = new URLSearchParams({
      from: give.name,
      to: want.name,
      amount: request.give.amount,
    });
    const res = await this.#fetcher({
      url: `${this.#baseUrl}/api/v1/quote?${params.toString()}`,
      method: 'GET',
      headers: { 'X-API-Key': this.#apiKey },
    });

    if (res.status >= 500) {
      return reject('venue_error', `venue returned status ${res.status}`);
    }
    if (res.status >= 400) {
      // Surface the venue's { error } message when present. An ambiguous-pool
      // error for the pair arrives here as a coded rejection; we never guess a
      // poolId.
      const errBody = asRecord(res.body);
      const msg =
        errBody !== undefined ? asString(errBody['error']) : undefined;
      return reject(
        'invalid_request',
        msg ?? `venue rejected request (status ${res.status})`,
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
