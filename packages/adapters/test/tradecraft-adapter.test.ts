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
  TradecraftAdapter,
  normalizeTradecraftQuote,
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

function loadFixture(rel: string): unknown {
  return JSON.parse(
    readFileSync(new URL(`../fixtures/${rel}`, import.meta.url), 'utf8'),
  );
}
// Real captures from api.tradecraft.fi (see fixtures/tradecraft/).
const QUOTE = loadFixture('tradecraft/quote-cc-usdcx-100.json');
const ERROR = loadFixture('tradecraft/error-amm-not-found.json');

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

/** A fetcher that always returns the given body/status (fixture-backed). */
function fetcherReturning(body: unknown, status = 200): Fetcher {
  return () => Promise.resolve({ status, body });
}

function adapter(fetcher: Fetcher): TradecraftAdapter {
  return new TradecraftAdapter({ fetcher, now: clock });
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

describe('TradecraftAdapter: capability', () => {
  it('declares venueId and managed-deposit settlement (ADR-0009, RFC-0004)', () => {
    const a = adapter(fetcherReturning(QUOTE));
    expect(a.venueId).toBe('tradecraft');
    expect(a.settlementMode).toBe('managed-deposit');
  });
});

describe('normalizeTradecraftQuote: golden fixture (pure)', () => {
  it('maps the recorded user_gets to a spec-valid managed-deposit Quote', () => {
    const q = normalizeTradecraftQuote(QUOTE, {
      venueId: 'tradecraft',
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
    expect(q.venueId).toBe('tradecraft');
    expect(q.give).toEqual({ asset: CC, amount: '100' });
    expect(q.receive.asset).toEqual(USDCx);
    // 6-dp floor of the captured user_gets (14.887162959697779).
    expect(q.receive.amount).toBe('14.887162');
    // validUntil = receivedAt + 30s.
    expect(q.validUntil).toBe('2030-01-01T00:00:30.000Z');
  });

  it('never overstates: an over-precise user_gets floors down (SPEC §3)', () => {
    const q = normalizeTradecraftQuote(
      { user_gets: 20.4472699999 },
      {
        venueId: 'tradecraft',
        request: request(),
        receivedAt: NOW,
        ttlSeconds: 30,
      },
    );
    if (isQuoteRejection(q)) throw new Error('unexpected rejection');
    // 6-dp floor of 20.4472699999.
    expect(q.receive.amount).toBe('20.447269');
    const floored = Decimal.parse(q.receive.amount)!;
    const raw = Decimal.parse('20.4472699999')!;
    expect(floored.lte(raw)).toBe(true);
  });

  it('accepts a numeric STRING user_gets defensively', () => {
    const q = normalizeTradecraftQuote(
      { user_gets: '14.887162959697779' },
      {
        venueId: 'tradecraft',
        request: request(),
        receivedAt: NOW,
        ttlSeconds: 30,
      },
    );
    if (isQuoteRejection(q)) throw new Error('unexpected rejection');
    expect(q.receive.amount).toBe('14.887162');
    expect(validateQuote(q, { now: NOW }).ok).toBe(true);
  });
});

describe('TradecraftAdapter: end to end with fixture fetcher', () => {
  it('returns a spec-valid quote for a supported pair', async () => {
    const q = await asQuote(adapter(fetcherReturning(QUOTE)).quote(request()));
    expect(validateQuote(q, { now: NOW }).ok).toBe(true);
    expect(q.quoteId).toBe('tradecraft:nonce-1');
  });

  it('is deterministic for identical requests', async () => {
    const a = adapter(fetcherReturning(QUOTE));
    expect(await a.quote(request())).toEqual(await a.quote(request()));
  });

  it('requests the Tradecraft symbol path (Amulet maps to CC) with givingAmount', async () => {
    let captured = '';
    const fetcher: Fetcher = (req) => {
      captured = req.url;
      return Promise.resolve({ status: 200, body: QUOTE });
    };
    await new TradecraftAdapter({ fetcher, now: clock }).quote(request());
    expect(captured).toContain('/quoteForFixedInput/CC/USDCx');
    expect(captured).not.toContain('Amulet');
    expect(captured).toContain('givingAmount=100');
  });
});

describe('TradecraftAdapter: typed rejections (never throws for control flow)', () => {
  it('{ error } body at status 200 -> venue_error (message surfaced)', async () => {
    const r = await asRejection(
      adapter(fetcherReturning(ERROR)).quote(request()),
    );
    expect(r.code).toBe('venue_error');
    expect(r.venueId).toBe('tradecraft');
    expect(r.message).toBe('No AMM with id TC CC/NOPE LP');
  });

  it('5xx status -> venue_error', async () => {
    const r = await asRejection(
      adapter(fetcherReturning({ error: 'boom' }, 503)).quote(request()),
    );
    expect(r.code).toBe('venue_error');
  });

  it('4xx with { error } -> invalid_request surfacing the message', async () => {
    const r = await asRejection(
      adapter(fetcherReturning(ERROR, 400)).quote(request()),
    );
    expect(r.code).toBe('invalid_request');
    expect(r.message).toBe('No AMM with id TC CC/NOPE LP');
  });

  it('4xx with a non-object body -> invalid_request', async () => {
    const r = await asRejection(
      adapter(fetcherReturning('nope', 422)).quote(request()),
    );
    expect(r.code).toBe('invalid_request');
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

  it('malformed body (no user_gets, no error) -> invalid_response', async () => {
    const r = await asRejection(
      adapter(fetcherReturning({ foo: 1 })).quote(request()),
    );
    expect(r.code).toBe('invalid_response');
  });

  it('non-numeric string user_gets -> invalid_response', async () => {
    const r = await asRejection(
      adapter(fetcherReturning({ user_gets: 'abc' })).quote(request()),
    );
    expect(r.code).toBe('invalid_response');
  });

  it('non-positive output -> insufficient_liquidity', async () => {
    const r = await asRejection(
      adapter(fetcherReturning({ user_gets: 0 })).quote(request()),
    );
    expect(r.code).toBe('insufficient_liquidity');
  });

  it('output rounds to zero at instrument precision -> insufficient_liquidity', async () => {
    const r = await asRejection(
      adapter(fetcherReturning({ user_gets: 0.0000001 })).quote(request()),
    );
    expect(r.code).toBe('insufficient_liquidity');
  });

  it('non-object response -> invalid_response', async () => {
    const r = await asRejection(
      adapter(fetcherReturning('plain text')).quote(request()),
    );
    expect(r.code).toBe('invalid_response');
  });
});

describe('normalizeTradecraftQuote: fuzz (never throws; typed result)', () => {
  it('returns a Quote or a coded rejection for arbitrary JSON', () => {
    fc.assert(
      fc.property(fc.jsonValue(), (raw) => {
        const out = normalizeTradecraftQuote(raw, {
          venueId: 'tradecraft',
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
