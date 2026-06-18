import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { readFileSync } from 'node:fs';
import {
  Decimal,
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
    'DSO::1220sample0000000000000000000000000000000000000000000000000000000000',
  instrumentId: 'Amulet',
  decimals: 10,
};
const USDCx: AssetId = {
  registry:
    'decentralized-usdc-interchain-rep::1220sample00000000000000000000000000000000000000000000000000000000',
  instrumentId: 'USDCx',
  decimals: 6,
};
const FUTURE = '2099-01-01T00:00:00Z';
const NOW = new Date('2030-01-01T00:00:00Z');
const clock = (): Date => NOW;

function loadFixture(rel: string): unknown {
  return JSON.parse(
    readFileSync(new URL(`../fixtures/${rel}`, import.meta.url), 'utf8'),
  );
}
const QUOTE = loadFixture('oneswap/quote-amulet-usdcx-100.json');
const BLOCKED = loadFixture('oneswap/quote-blocked.json');

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

describe('OneSwapAdapter — capability', () => {
  it('declares venueId and managed-deposit settlement (ADR-0009, RFC-0004)', () => {
    const a = adapter(fetcherReturning(QUOTE));
    expect(a.venueId).toBe('oneswap');
    expect(a.settlementMode).toBe('managed-deposit');
  });
});

describe('normalizeOneSwapQuote — golden fixture (pure)', () => {
  it('maps the documented Quote to a spec-valid managed-deposit Quote', () => {
    const q = normalizeOneSwapQuote(QUOTE, {
      venueId: 'oneswap',
      request: request(),
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
    // validUntil derives from the venue's expiresIn (30s)
    expect(q.validUntil).toBe('2030-01-01T00:00:30.000Z');
  });

  it('never overstates: receive floored to the want precision (SPEC §3)', () => {
    const raw = { ...(QUOTE as object), outputAmount: '16.3412009999' };
    const q = normalizeOneSwapQuote(raw, {
      venueId: 'oneswap',
      request: request(),
      receivedAt: NOW,
      ttlSeconds: 30,
    });
    if (isQuoteRejection(q)) throw new Error('unexpected rejection');
    expect(q.receive.amount).toBe('16.341200');
    expect(
      Decimal.parse(q.receive.amount)!.lte(Decimal.parse('16.3412009999')!),
    ).toBe(true);
  });

  it('falls back to the TTL when expiresIn is absent', () => {
    const raw = { ...(QUOTE as Record<string, unknown>) };
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
});

describe('OneSwapAdapter — end to end with fixture fetcher', () => {
  it('returns a spec-valid quote for a supported pair', async () => {
    const q = await asQuote(adapter(fetcherReturning(QUOTE)).quote(request()));
    expect(validateQuote(q, { now: NOW }).ok).toBe(true);
    expect(q.quoteId).toBe('oneswap:nonce-1');
  });

  it('is deterministic for identical requests', async () => {
    const a = adapter(fetcherReturning(QUOTE));
    expect(await a.quote(request())).toEqual(await a.quote(request()));
  });
});

describe('OneSwapAdapter — typed rejections', () => {
  it('settlementSafety non-null -> settlement_blocked', async () => {
    const r = await asRejection(
      adapter(fetcherReturning(BLOCKED)).quote(request()),
    );
    expect(r.code).toBe('settlement_blocked');
  });

  it('missing baseUrl/apiKey -> not_configured (caller falls back to fixtures)', async () => {
    const a = new OneSwapAdapter({
      fetcher: fetcherReturning(QUOTE),
      now: clock,
    });
    const r = await asRejection(a.quote(request()));
    expect(r.code).toBe('not_configured');
  });

  it('401 -> unauthorized', async () => {
    const r = await asRejection(
      adapter(fetcherReturning({ error: 'bad key' }, 401)).quote(request()),
    );
    expect(r.code).toBe('unauthorized');
  });

  it('unsupported asset -> pair_unsupported', async () => {
    const FOO: AssetId = { registry: 'r', instrumentId: 'FOO', decimals: 2 };
    const r = await asRejection(
      adapter(fetcherReturning(QUOTE)).quote(request({ want: { asset: FOO } })),
    );
    expect(r.code).toBe('pair_unsupported');
  });

  it('malformed response -> invalid_response', async () => {
    const r = await asRejection(
      adapter(fetcherReturning({ foo: 1 })).quote(request()),
    );
    expect(r.code).toBe('invalid_response');
  });

  it('5xx -> venue_error', async () => {
    const r = await asRejection(
      adapter(fetcherReturning({ message: 'down' }, 502)).quote(request()),
    );
    expect(r.code).toBe('venue_error');
  });

  it('other 4xx -> invalid_request', async () => {
    const r = await asRejection(
      adapter(fetcherReturning({ message: 'bad' }, 400)).quote(request()),
    );
    expect(r.code).toBe('invalid_request');
  });

  it('decimals inconsistent with the instrument -> asset_decimals_mismatch', async () => {
    const badCC: AssetId = { ...CC, decimals: 8 };
    const r = await asRejection(
      adapter(fetcherReturning(QUOTE)).quote(
        request({ give: { asset: badCC, amount: '100' } }),
      ),
    );
    expect(r.code).toBe('asset_decimals_mismatch');
  });

  it('over-precise give amount -> invalid_request', async () => {
    const r = await asRejection(
      adapter(fetcherReturning(QUOTE)).quote(
        request({ give: { asset: CC, amount: '1.23456789012' } }),
      ),
    );
    expect(r.code).toBe('invalid_request');
  });

  it('non-positive output -> insufficient_liquidity', async () => {
    const zero = { ...(QUOTE as object), outputAmount: '0' };
    const r = await asRejection(
      adapter(fetcherReturning(zero)).quote(request()),
    );
    expect(r.code).toBe('insufficient_liquidity');
  });

  it('output rounds to zero at instrument precision -> insufficient_liquidity', async () => {
    const tiny = { ...(QUOTE as object), outputAmount: '0.0000001' };
    const r = await asRejection(
      adapter(fetcherReturning(tiny)).quote(request()),
    );
    expect(r.code).toBe('insufficient_liquidity');
  });

  it('non-object response -> invalid_response', async () => {
    const r = await asRejection(adapter(fetcherReturning(42)).quote(request()));
    expect(r.code).toBe('invalid_response');
  });
});

describe('normalizeOneSwapQuote — fuzz (never throws; typed result)', () => {
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
