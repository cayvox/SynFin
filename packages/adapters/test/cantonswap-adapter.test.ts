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
  CantonSwapAdapter,
  normalizeCantonSwapQuote,
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
const QUOTE = loadFixture('cantonswap/quote-amulet-usdcx-125.json');
const MAINTENANCE = loadFixture('cantonswap/maintenance.json');

function request(overrides: Partial<QuoteRequest> = {}): QuoteRequest {
  return {
    intentRef: 'intent-1',
    give: { asset: CC, amount: '125' },
    want: { asset: USDCx },
    deadline: FUTURE,
    nonce: 'nonce-1',
    ...overrides,
  };
}

/** A fetcher that always returns the given body/status (fixture-backed). */
function fetcherReturning(body: unknown, status = 200): Fetcher {
  return () => Promise.resolve({ status, body });
}

function adapter(fetcher: Fetcher): CantonSwapAdapter {
  return new CantonSwapAdapter({ fetcher, now: clock });
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

describe('CantonSwapAdapter — capability', () => {
  it('declares venueId and managed-deposit settlement (ADR-0009, RFC-0004)', () => {
    const a = adapter(fetcherReturning(QUOTE));
    expect(a.venueId).toBe('cantonswap');
    expect(a.settlementMode).toBe('managed-deposit');
  });
});

describe('normalizeCantonSwapQuote — golden fixture (pure)', () => {
  it('maps the recorded SwapQuote to a spec-valid managed-deposit Quote', () => {
    const q = normalizeCantonSwapQuote(QUOTE, {
      venueId: 'cantonswap',
      request: request(),
      receivedAt: NOW,
      ttlSeconds: 30,
    });
    expect(isQuoteRejection(q)).toBe(false);
    if (isQuoteRejection(q)) return;
    expect(validateQuote(q, { now: NOW }).ok).toBe(true);
    expect(q.settlementMode).toBe('managed-deposit');
    expect(q.sourceKind).toBe('AMM');
    expect(q.firmness).toBe('indicative');
    expect(q.feeBps).toBe(0);
    expect(q.venueId).toBe('cantonswap');
    expect(q.give).toEqual({ asset: CC, amount: '125' });
    expect(q.receive.asset).toEqual(USDCx);
    // validUntil = receivedAt + 30s
    expect(q.validUntil).toBe('2030-01-01T00:00:30.000Z');
  });

  it('never overstates: receive is floored to the want precision (SPEC §3)', () => {
    const raw = { ...(QUOTE as object), toAmount: '20.4472699999' };
    const q = normalizeCantonSwapQuote(raw, {
      venueId: 'cantonswap',
      request: request(),
      receivedAt: NOW,
      ttlSeconds: 30,
    });
    if (isQuoteRejection(q)) throw new Error('unexpected rejection');
    // 6-dp floor of 20.4472699999
    expect(q.receive.amount).toBe('20.447269');
    const raw2 = Decimal.parse('20.4472699999')!;
    const got = Decimal.parse(q.receive.amount)!;
    expect(got.lte(raw2)).toBe(true);
  });
});

describe('CantonSwapAdapter — end to end with fixture fetcher', () => {
  it('returns a spec-valid quote for a supported pair', async () => {
    const q = await asQuote(adapter(fetcherReturning(QUOTE)).quote(request()));
    expect(validateQuote(q, { now: NOW }).ok).toBe(true);
    expect(q.quoteId).toBe('cantonswap:nonce-1');
  });

  it('is deterministic for identical requests', async () => {
    const a = adapter(fetcherReturning(QUOTE));
    expect(await a.quote(request())).toEqual(await a.quote(request()));
  });
});

describe('CantonSwapAdapter — typed rejections (never throws for control flow)', () => {
  it('venue maintenance body -> venue_error', async () => {
    const r = await asRejection(
      adapter(fetcherReturning(MAINTENANCE)).quote(request()),
    );
    expect(r.code).toBe('venue_error');
    expect(r.venueId).toBe('cantonswap');
  });

  it('5xx status -> venue_error', async () => {
    const r = await asRejection(
      adapter(fetcherReturning({ message: 'boom' }, 503)).quote(request()),
    );
    expect(r.code).toBe('venue_error');
  });

  it('unsupported asset -> pair_unsupported', async () => {
    const FOO: AssetId = { registry: 'r', instrumentId: 'FOO', decimals: 2 };
    const r = await asRejection(
      adapter(fetcherReturning(QUOTE)).quote(request({ want: { asset: FOO } })),
    );
    expect(r.code).toBe('pair_unsupported');
  });

  it('decimals inconsistent with the instrument -> asset_decimals_mismatch', async () => {
    const badCC: AssetId = { ...CC, decimals: 8 };
    const r = await asRejection(
      adapter(fetcherReturning(QUOTE)).quote(
        request({ give: { asset: badCC, amount: '125' } }),
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

  it('malformed response -> invalid_response', async () => {
    const r = await asRejection(
      adapter(fetcherReturning({ foo: 1 })).quote(request()),
    );
    expect(r.code).toBe('invalid_response');
  });

  it('venue echoes a different pair -> invalid_response', async () => {
    const wrong = { ...(QUOTE as object), toToken: 'CBTC' };
    const r = await asRejection(
      adapter(fetcherReturning(wrong)).quote(request()),
    );
    expect(r.code).toBe('invalid_response');
  });

  it('non-positive output -> insufficient_liquidity', async () => {
    const zero = { ...(QUOTE as object), toAmount: '0' };
    const r = await asRejection(
      adapter(fetcherReturning(zero)).quote(request()),
    );
    expect(r.code).toBe('insufficient_liquidity');
  });

  it('output rounds to zero at instrument precision -> insufficient_liquidity', async () => {
    const tiny = { ...(QUOTE as object), toAmount: '0.0000001' }; // < 1e-6 USDCx
    const r = await asRejection(
      adapter(fetcherReturning(tiny)).quote(request()),
    );
    expect(r.code).toBe('insufficient_liquidity');
  });

  it('4xx status -> invalid_request', async () => {
    const r = await asRejection(
      adapter(fetcherReturning({ message: 'bad' }, 422)).quote(request()),
    );
    expect(r.code).toBe('invalid_request');
  });

  it('non-object response -> invalid_response', async () => {
    const r = await asRejection(
      adapter(fetcherReturning('plain text')).quote(request()),
    );
    expect(r.code).toBe('invalid_response');
  });
});

describe('CantonSwapAdapter — forwards slippageTolerance to the venue', () => {
  it('includes slippageTolerance in the request body when configured', async () => {
    let captured: unknown;
    const fetcher: Fetcher = (req) => {
      captured = req.body;
      return Promise.resolve({ status: 200, body: QUOTE });
    };
    const a = new CantonSwapAdapter({
      fetcher,
      now: clock,
      slippageTolerance: 0.5,
    });
    await a.quote(request());
    expect((captured as Record<string, unknown>)['slippageTolerance']).toBe(
      0.5,
    );
    expect((captured as Record<string, unknown>)['fromToken']).toBe('Amulet');
  });
});

describe('normalizeCantonSwapQuote — fuzz (never throws; typed result)', () => {
  it('returns a Quote or a coded rejection for arbitrary JSON', () => {
    fc.assert(
      fc.property(fc.jsonValue(), (raw) => {
        const out = normalizeCantonSwapQuote(raw, {
          venueId: 'cantonswap',
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
