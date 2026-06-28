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
  CantexAdapter,
  normalizeCantexQuote,
  type Fetcher,
} from '../src/index.js';

const CC: AssetId = {
  registry: 'DSO::1220sample',
  instrumentId: 'Amulet',
  decimals: 10,
};
const USDCx: AssetId = {
  registry: 'usdc::1220sample',
  instrumentId: 'USDCx',
  decimals: 6,
};
// The real Cantex registry values the adapter must send (from the catalog).
const CC_ADMIN =
  'DSO::1220b1431ef217342db44d516bb9befde802be7d8899637d290895fa58880f19accc';
const USDCX_ADMIN =
  'decentralized-usdc-interchain-rep::12208115f1e168dd7e792320be9c4ca720c751a02a3053c7606e1c1cd3dad9bf60ef';

const FUTURE = '2099-01-01T00:00:00Z';
const NOW = new Date('2030-01-01T00:00:00Z');
const clock = (): Date => NOW;

function loadFixture(rel: string): unknown {
  return JSON.parse(
    readFileSync(new URL(`../fixtures/${rel}`, import.meta.url), 'utf8'),
  );
}
// Real captures from api.cantex.io public endpoint (see fixtures/cantex/).
const QUOTE100 = loadFixture('cantex/quote-cc-usdcx-100.json');
const QUOTE500 = loadFixture('cantex/quote-cc-usdcx-500.json');

interface CantexLike {
  returned: { amount: string };
  fees: { network_fee: { amount: string } };
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

function ctx(req: QuoteRequest = request()): {
  venueId: string;
  request: QuoteRequest;
  receivedAt: Date;
  ttlSeconds: number;
  giveInstrumentId: string;
} {
  return {
    venueId: 'cantex',
    request: req,
    receivedAt: NOW,
    ttlSeconds: 30,
    giveInstrumentId: 'Amulet',
  };
}

/** Expected receive: returned * (give - networkFee) / give, floored to 6 dp. */
function expectedReceive(
  returnedAmount: string,
  networkFee: string,
  give: string,
): string {
  const ret = Decimal.parse(returnedAmount)!;
  const g = Decimal.parse(give)!;
  const fee = Decimal.parse(networkFee)!;
  return ret.mul(g.sub(fee)).divide(g, 6, 'floor').toString();
}

function fetcherReturning(body: unknown, status = 200): Fetcher {
  return () => Promise.resolve({ status, body });
}
function adapter(fetcher: Fetcher): CantexAdapter {
  return new CantexAdapter({ fetcher, now: clock });
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

describe('CantexAdapter: capability', () => {
  it('declares venueId and managed-deposit settlement (ADR-0009, RFC-0004)', () => {
    const a = adapter(fetcherReturning(QUOTE100));
    expect(a.venueId).toBe('cantex');
    expect(a.settlementMode).toBe('managed-deposit');
  });
});

describe('normalizeCantexQuote: golden fixtures (pure)', () => {
  it('maps the size-100 quote to a spec-valid managed-deposit Quote with the fee haircut', () => {
    const q = normalizeCantexQuote(QUOTE100, ctx());
    expect(isQuoteRejection(q)).toBe(false);
    if (isQuoteRejection(q)) return;
    expect(validateQuote(q, { now: NOW }).ok).toBe(true);
    expect(q.settlementMode).toBe('managed-deposit');
    expect(q.sourceKind).toBe('AMM');
    expect(q.firmness).toBe('indicative');
    expect(q.feeBps).toBe(0);
    expect(q.venueId).toBe('cantex');
    expect(q.give).toEqual({ asset: CC, amount: '100' });
    expect(q.receive.asset).toEqual(USDCx);
    const fx = QUOTE100 as CantexLike;
    expect(q.receive.amount).toBe(
      expectedReceive(fx.returned.amount, fx.fees.network_fee.amount, '100'),
    );
    // The flat fee is non-zero here, so receive is strictly below returned.
    expect(
      Decimal.parse(q.receive.amount)!.lt(Decimal.parse(fx.returned.amount)!),
    ).toBe(true);
    expect(q.validUntil).toBe('2030-01-01T00:00:30.000Z');
  });

  it('no-haircut branch: size-500 (network_fee 0) returns the floored returned exactly', () => {
    const req = request({ give: { asset: CC, amount: '500' } });
    const q = normalizeCantexQuote(QUOTE500, ctx(req));
    if (isQuoteRejection(q)) throw new Error('unexpected rejection');
    const fx = QUOTE500 as CantexLike;
    // network_fee is 0, so receive == floor(returned, 6).
    expect(q.receive.amount).toBe(
      expectedReceive(fx.returned.amount, '0', '500'),
    );
    const flooredReturned = Decimal.parse(fx.returned.amount)!
      .mul(Decimal.parse('1')!)
      .divide(Decimal.parse('1')!, 6, 'floor')
      .toString();
    expect(q.receive.amount).toBe(flooredReturned);
  });

  it('never overstates: a large network_fee strictly lowers receive (and never exceeds returned)', () => {
    const raw = {
      returned: { amount: '15.000000', instrument_id: 'USDCx' },
      fees: { network_fee: { amount: '10', instrument_id: 'Amulet' } },
    };
    const q = normalizeCantexQuote(raw, ctx());
    if (isQuoteRejection(q)) throw new Error('unexpected rejection');
    // 15 * (100 - 10) / 100 = 13.5
    expect(q.receive.amount).toBe('13.500000');
    expect(
      Decimal.parse(q.receive.amount)!.lt(Decimal.parse('15.000000')!),
    ).toBe(true);
  });
});

describe('CantexAdapter: end to end with fixture fetcher', () => {
  it('returns a spec-valid quote for a supported pair', async () => {
    const q = await asQuote(
      adapter(fetcherReturning(QUOTE100)).quote(request()),
    );
    expect(validateQuote(q, { now: NOW }).ok).toBe(true);
    expect(q.quoteId).toBe('cantex:nonce-1');
  });

  it('is deterministic for identical requests', async () => {
    const a = adapter(fetcherReturning(QUOTE100));
    expect(await a.quote(request())).toEqual(await a.quote(request()));
  });

  it('POSTs to /v1/public/pools/quote with the real CC/USDCx admins and the give amount', async () => {
    let captured: { url: string; method: string; body: unknown } | null = null;
    const fetcher: Fetcher = (req) => {
      captured = { url: req.url, method: req.method, body: req.body };
      return Promise.resolve({ status: 200, body: QUOTE100 });
    };
    await new CantexAdapter({ fetcher, now: clock }).quote(request());
    expect(captured).not.toBeNull();
    const c = captured!;
    expect(c.url).toBe('https://api.cantex.io/v1/public/pools/quote');
    expect(c.method).toBe('POST');
    const body = c.body as Record<string, string>;
    expect(body['sellAmount']).toBe('100');
    expect(body['sellInstrumentId']).toBe('Amulet');
    expect(body['sellInstrumentAdmin']).toBe(CC_ADMIN);
    expect(body['buyInstrumentId']).toBe('USDCx');
    expect(body['buyInstrumentAdmin']).toBe(USDCX_ADMIN);
  });
});

describe('CantexAdapter: typed rejections (never throws for control flow)', () => {
  it('network_fee in a foreign asset -> invalid_response', () => {
    const raw = {
      returned: { amount: '15', instrument_id: 'USDCx' },
      fees: { network_fee: { amount: '0.5', instrument_id: 'USDCx' } },
    };
    const r = normalizeCantexQuote(raw, ctx());
    if (!isQuoteRejection(r)) throw new Error('expected a rejection');
    expect(r.code).toBe('invalid_response');
  });

  it('network_fee meets or exceeds the give -> insufficient_liquidity', () => {
    const raw = {
      returned: { amount: '15', instrument_id: 'USDCx' },
      fees: { network_fee: { amount: '150', instrument_id: 'Amulet' } },
    };
    const r = normalizeCantexQuote(raw, ctx());
    if (!isQuoteRejection(r)) throw new Error('expected a rejection');
    expect(r.code).toBe('insufficient_liquidity');
  });

  it('non-positive returned -> insufficient_liquidity', () => {
    const raw = { returned: { amount: '0', instrument_id: 'USDCx' } };
    const r = normalizeCantexQuote(raw, ctx());
    if (!isQuoteRejection(r)) throw new Error('expected a rejection');
    expect(r.code).toBe('insufficient_liquidity');
  });

  it('returned that rounds to zero at want precision -> insufficient_liquidity', () => {
    const raw = { returned: { amount: '0.0000001', instrument_id: 'USDCx' } };
    const r = normalizeCantexQuote(raw, ctx());
    if (!isQuoteRejection(r)) throw new Error('expected a rejection');
    expect(r.code).toBe('insufficient_liquidity');
  });

  it('network_fee object without an amount -> invalid_response', () => {
    const raw = {
      returned: { amount: '15', instrument_id: 'USDCx' },
      fees: { network_fee: { instrument_id: 'Amulet' } },
    };
    const r = normalizeCantexQuote(raw, ctx());
    if (!isQuoteRejection(r)) throw new Error('expected a rejection');
    expect(r.code).toBe('invalid_response');
  });

  it('negative network_fee amount -> invalid_response', () => {
    const raw = {
      returned: { amount: '15', instrument_id: 'USDCx' },
      fees: { network_fee: { amount: '-1', instrument_id: 'Amulet' } },
    };
    const r = normalizeCantexQuote(raw, ctx());
    if (!isQuoteRejection(r)) throw new Error('expected a rejection');
    expect(r.code).toBe('invalid_response');
  });

  it('an unparseable give amount in the normalizer -> invalid_request', () => {
    const req = request({ give: { asset: CC, amount: 'not-a-number' } });
    const r = normalizeCantexQuote(QUOTE100, ctx(req));
    if (!isQuoteRejection(r)) throw new Error('expected a rejection');
    expect(r.code).toBe('invalid_request');
  });

  it('4xx with a non-object body -> invalid_request (fallback message)', async () => {
    const r = await asRejection(
      adapter(fetcherReturning('nope', 400)).quote(request()),
    );
    expect(r.code).toBe('invalid_request');
  });

  it('missing returned.amount -> invalid_response', () => {
    const r = normalizeCantexQuote({ fees: {} }, ctx());
    if (!isQuoteRejection(r)) throw new Error('expected a rejection');
    expect(r.code).toBe('invalid_response');
  });

  it('non-object response -> invalid_response', async () => {
    const r = await asRejection(
      adapter(fetcherReturning('plain text')).quote(request()),
    );
    expect(r.code).toBe('invalid_response');
  });

  it('5xx status -> venue_error', async () => {
    const r = await asRejection(
      adapter(fetcherReturning({ error: 'boom' }, 503)).quote(request()),
    );
    expect(r.code).toBe('venue_error');
  });

  it('4xx status -> invalid_request (surfaces the message)', async () => {
    const r = await asRejection(
      adapter(fetcherReturning({ error: 'bad pair' }, 422)).quote(request()),
    );
    expect(r.code).toBe('invalid_request');
    expect(r.message).toBe('bad pair');
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

describe('normalizeCantexQuote: fuzz (never throws; typed result)', () => {
  it('returns a Quote or a coded rejection for arbitrary JSON', () => {
    fc.assert(
      fc.property(fc.jsonValue(), (raw) => {
        const out = normalizeCantexQuote(raw, ctx());
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
