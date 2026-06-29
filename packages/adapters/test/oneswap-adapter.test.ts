import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { readFileSync } from 'node:fs';
import {
  Decimal,
  roundTakerFavorable,
  isQuoteRejection,
  validateQuote,
  type AssetId,
  type Quote,
  type QuoteRejection,
  type QuoteRequest,
} from '@synfin/spec';
import {
  OneSwapAdapter,
  normalizeOneSwapQuote,
  type Fetcher,
} from '../src/index.js';

const CC: AssetId = {
  registry:
    'DSO::1220b1431ef217342db44d516bb9befde802be7d8899637d290895fa58880f19accc',
  instrumentId: 'Amulet',
  decimals: 10,
};
const USDCx: AssetId = {
  registry:
    'decentralized-usdc-interchain-rep::12208115f1e168dd7e792320be9c4ca720c751a02a3053c7606e1c1cd3dad9bf60ef',
  instrumentId: 'USDCx',
  decimals: 6,
};
const FUTURE = '2099-01-01T00:00:00Z';
const NOW = new Date('2030-01-01T00:00:00Z');
const clock = (): Date => NOW;

function loadFixture(rel: string): Record<string, unknown> {
  return JSON.parse(
    readFileSync(new URL(`../fixtures/${rel}`, import.meta.url), 'utf8'),
  ) as Record<string, unknown>;
}
// Real captures from the live api.oneswap.cc GET /api/v1/quote endpoint.
const QUOTE10 = loadFixture('oneswap/quote-cc-usdcx-10.json');
const QUOTE100 = loadFixture('oneswap/quote-cc-usdcx-100.json');
const QUOTE1000 = loadFixture('oneswap/quote-cc-usdcx-1000.json');

/** The delivered receive: outputAmount floored to the want precision. */
function flooredOutput(outputAmount: string, decimals: number): string {
  return roundTakerFavorable(
    Decimal.parse(outputAmount)!,
    decimals,
    'receive',
  ).toString();
}

function request(overrides: Partial<QuoteRequest> = {}): QuoteRequest {
  return {
    intentRef: 'intent-1',
    give: { asset: CC, amount: '100' },
    want: { asset: USDCx },
    deadline: FUTURE,
    nonce: 'nonce-1',
    ...overrides,
  };
}

function fetcherReturning(body: unknown, status = 200): Fetcher {
  return () => Promise.resolve({ status, body });
}

/** A configured (live-capable) adapter wired to a fixture fetcher. */
function adapter(fetcher: Fetcher): OneSwapAdapter {
  return new OneSwapAdapter({
    fetcher,
    now: clock,
    baseUrl: 'https://example.invalid',
    apiKey: 'test-key-not-a-secret',
  });
}

async function asQuote(p: Promise<Quote | QuoteRejection>): Promise<Quote> {
  const v = await p;
  if (isQuoteRejection(v)) throw new Error(`unexpected rejection: ${v.code}`);
  return v;
}
async function asRejection(
  p: Promise<Quote | QuoteRejection>,
): Promise<QuoteRejection> {
  const v = await p;
  if (!isQuoteRejection(v)) throw new Error('expected a rejection');
  return v;
}

describe('OneSwapAdapter: capability', () => {
  it('declares venueId and managed-deposit settlement (ADR-0009, RFC-0004)', () => {
    const a = adapter(fetcherReturning(QUOTE100));
    expect(a.venueId).toBe('oneswap');
    expect(a.settlementMode).toBe('managed-deposit');
  });
});

describe('normalizeOneSwapQuote: real golden fixtures (pure)', () => {
  it('size 100: maps to a deducted_from_give networkFee and a net receive (RFC-0006)', () => {
    const q = normalizeOneSwapQuote(QUOTE100, {
      venueId: 'oneswap',
      request: request({ give: { asset: CC, amount: '100' } }),
      receivedAt: NOW,
      ttlSeconds: 30,
    });
    if (isQuoteRejection(q)) throw new Error(`unexpected rejection: ${q.code}`);
    expect(validateQuote(q, { now: NOW }).ok).toBe(true);
    expect(q.settlementMode).toBe('managed-deposit');
    expect(q.sourceKind).toBe('AMM');
    expect(q.firmness).toBe('indicative');
    expect(q.feeBps).toBe(0);
    expect(q.give).toEqual({ asset: CC, amount: '100' });
    expect(q.receive.asset).toEqual(USDCx);
    // receive is outputAmount floored to 6 dp, already net of the deducted fee.
    expect(q.receive.amount).toBe(
      flooredOutput(QUOTE100['outputAmount'] as string, 6),
    );
    // The flat CC network fee is surfaced verbatim, deducted from within the give.
    expect(q.networkFee).toEqual({
      asset: CC,
      amount: QUOTE100['networkFeeAmount'],
      appliedTo: 'deducted_from_give',
    });
    // validUntil derives from the venue's expiresIn (30s).
    expect(q.validUntil).toBe('2030-01-01T00:00:30.000Z');
  });

  it('size 10: a valid quote where the flat fee dominates (no waiver)', () => {
    // The flat ~8.27 CC fee is most of a 10 CC deposit, so the output is tiny but
    // still positive: the quote is valid and the networkFee is still present.
    const q = normalizeOneSwapQuote(QUOTE10, {
      venueId: 'oneswap',
      request: request({ give: { asset: CC, amount: '10' } }),
      receivedAt: NOW,
      ttlSeconds: 30,
    });
    if (isQuoteRejection(q)) throw new Error(`unexpected rejection: ${q.code}`);
    expect(validateQuote(q, { now: NOW }).ok).toBe(true);
    expect(q.receive.amount).toBe(
      flooredOutput(QUOTE10['outputAmount'] as string, 6),
    );
    expect(q.networkFee).toEqual({
      asset: CC,
      amount: QUOTE10['networkFeeAmount'],
      appliedTo: 'deducted_from_give',
    });
  });

  it('size 1000: a larger floored output with the same flat networkFee', () => {
    const q = normalizeOneSwapQuote(QUOTE1000, {
      venueId: 'oneswap',
      request: request({ give: { asset: CC, amount: '1000' } }),
      receivedAt: NOW,
      ttlSeconds: 30,
    });
    if (isQuoteRejection(q)) throw new Error(`unexpected rejection: ${q.code}`);
    expect(q.receive.amount).toBe(
      flooredOutput(QUOTE1000['outputAmount'] as string, 6),
    );
    expect(q.networkFee).toEqual({
      asset: CC,
      amount: QUOTE1000['networkFeeAmount'],
      appliedTo: 'deducted_from_give',
    });
    // The flat fee is the same across sizes (a fixed per-swap cost).
    expect(QUOTE1000['networkFeeAmount']).toBe(QUOTE100['networkFeeAmount']);
  });

  it('never overstates: receive floored to the want precision (SPEC §3)', () => {
    const raw = { ...QUOTE100, outputAmount: '13.2629239999' };
    const q = normalizeOneSwapQuote(raw, {
      venueId: 'oneswap',
      request: request(),
      receivedAt: NOW,
      ttlSeconds: 30,
    });
    if (isQuoteRejection(q)) throw new Error('unexpected rejection');
    expect(q.receive.amount).toBe('13.262923');
    expect(
      Decimal.parse(q.receive.amount)!.lte(Decimal.parse('13.2629239999')!),
    ).toBe(true);
  });

  it('falls back to the TTL when expiresIn is absent', () => {
    const raw = { ...QUOTE100 };
    delete raw['expiresIn'];
    const q = normalizeOneSwapQuote(raw, {
      venueId: 'oneswap',
      request: request(),
      receivedAt: NOW,
      ttlSeconds: 45,
    });
    if (isQuoteRejection(q)) throw new Error('unexpected rejection');
    expect(q.validUntil).toBe('2030-01-01T00:00:45.000Z');
  });

  it('prefers a networkFeePolicy chargedNetworkFeeAmount when present (a key discount)', () => {
    const raw = {
      ...QUOTE100,
      networkFeePolicy: { chargedNetworkFeeAmount: '4.0000000000' },
    };
    const q = normalizeOneSwapQuote(raw, {
      venueId: 'oneswap',
      request: request(),
      receivedAt: NOW,
      ttlSeconds: 30,
    });
    if (isQuoteRejection(q)) throw new Error('unexpected rejection');
    expect(q.networkFee?.amount).toBe('4.0000000000');
    expect(q.networkFee?.appliedTo).toBe('deducted_from_give');
  });
});

describe('OneSwapAdapter: end to end with fixture fetcher', () => {
  it('builds GET /api/v1/quote with token names, the give amount, and X-API-Key', async () => {
    let captured: {
      url: string;
      method: string;
      headers: Readonly<Record<string, string>> | undefined;
    } | null = null;
    const fetcher: Fetcher = (req) => {
      captured = { url: req.url, method: req.method, headers: req.headers };
      return Promise.resolve({ status: 200, body: QUOTE100 });
    };
    await new OneSwapAdapter({
      fetcher,
      now: clock,
      baseUrl: 'https://api.oneswap.cc',
      apiKey: 'test-key-not-a-secret',
    }).quote(request());
    expect(captured).not.toBeNull();
    const c = captured!;
    expect(c.url).toBe(
      'https://api.oneswap.cc/api/v1/quote?from=Amulet&to=USDCx&amount=100',
    );
    expect(c.method).toBe('GET');
    expect(c.headers?.['X-API-Key']).toBe('test-key-not-a-secret');
  });

  it('returns a spec-valid quote for a supported pair', async () => {
    const q = await asQuote(
      adapter(fetcherReturning(QUOTE100)).quote(request()),
    );
    expect(validateQuote(q, { now: NOW }).ok).toBe(true);
    expect(q.quoteId).toBe('oneswap:nonce-1');
  });

  it('is deterministic for identical requests', async () => {
    const a = adapter(fetcherReturning(QUOTE100));
    expect(await a.quote(request())).toEqual(await a.quote(request()));
  });
});

describe('OneSwapAdapter: typed rejections', () => {
  it('missing apiKey -> not_configured (caller falls back to fixtures)', async () => {
    const a = new OneSwapAdapter({
      fetcher: fetcherReturning(QUOTE100),
      now: clock,
    });
    const r = await asRejection(a.quote(request()));
    expect(r.code).toBe('not_configured');
  });

  it('malformed response (missing outputAmount) -> invalid_response', async () => {
    const raw = { ...QUOTE100 };
    delete raw['outputAmount'];
    const r = await asRejection(
      adapter(fetcherReturning(raw)).quote(request()),
    );
    expect(r.code).toBe('invalid_response');
  });

  it('totalInputAmount != the requested amount -> invalid_response', async () => {
    // The deposit must equal the requested give; a mismatch breaks the
    // deducted-from-within assumption (RFC-0006 §3).
    const raw = { ...QUOTE100, totalInputAmount: '99.0000000000' };
    const r = await asRejection(
      adapter(fetcherReturning(raw)).quote(request()),
    );
    expect(r.code).toBe('invalid_response');
  });

  it('non-positive output -> insufficient_liquidity', async () => {
    const raw = { ...QUOTE100, outputAmount: '0' };
    const r = await asRejection(
      adapter(fetcherReturning(raw)).quote(request()),
    );
    expect(r.code).toBe('insufficient_liquidity');
  });

  it('output rounds to zero at instrument precision -> insufficient_liquidity', async () => {
    const raw = { ...QUOTE100, outputAmount: '0.0000001' };
    const r = await asRejection(
      adapter(fetcherReturning(raw)).quote(request()),
    );
    expect(r.code).toBe('insufficient_liquidity');
  });

  it('5xx -> venue_error', async () => {
    const r = await asRejection(
      adapter(fetcherReturning({ message: 'down' }, 502)).quote(request()),
    );
    expect(r.code).toBe('venue_error');
  });

  it('4xx (including an ambiguous-pool error) -> invalid_request', async () => {
    const r = await asRejection(
      adapter(fetcherReturning({ error: 'ambiguous_pool_pair' }, 400)).quote(
        request(),
      ),
    );
    expect(r.code).toBe('invalid_request');
    expect(r.message).toBe('ambiguous_pool_pair');
  });

  it('non-object response -> invalid_response', async () => {
    const r = await asRejection(adapter(fetcherReturning(42)).quote(request()));
    expect(r.code).toBe('invalid_response');
  });

  it('unsupported asset -> pair_unsupported', async () => {
    const FOO: AssetId = { registry: 'r', instrumentId: 'FOO', decimals: 2 };
    const r = await asRejection(
      adapter(fetcherReturning(QUOTE100)).quote(
        request({ want: { asset: FOO } }),
      ),
    );
    expect(r.code).toBe('pair_unsupported');
  });

  it('decimals inconsistent with the instrument -> asset_decimals_mismatch', async () => {
    const badCC: AssetId = { ...CC, decimals: 8 };
    const r = await asRejection(
      adapter(fetcherReturning(QUOTE100)).quote(
        request({ give: { asset: badCC, amount: '100' } }),
      ),
    );
    expect(r.code).toBe('asset_decimals_mismatch');
  });

  it('over-precise give amount -> invalid_request', async () => {
    const r = await asRejection(
      adapter(fetcherReturning(QUOTE100)).quote(
        request({ give: { asset: CC, amount: '1.23456789012' } }),
      ),
    );
    expect(r.code).toBe('invalid_request');
  });
});

describe('normalizeOneSwapQuote: fuzz (never throws; typed result)', () => {
  it('returns a Quote or a coded rejection for arbitrary JSON', () => {
    fc.assert(
      fc.property(fc.jsonValue(), (raw) => {
        const out = normalizeOneSwapQuote(raw, {
          venueId: 'oneswap',
          request: request(),
          receivedAt: NOW,
          ttlSeconds: 30,
        });
        if (isQuoteRejection(out)) {
          expect(typeof out.code).toBe('string');
        } else {
          expect(validateQuote(out, { now: NOW }).ok).toBe(true);
        }
      }),
      { numRuns: 200 },
    );
  });
});
