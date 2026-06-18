import { describe, expect, it } from 'vitest';
import {
  Decimal,
  isQuoteRejection,
  validateQuote,
  type AssetId,
  type Quote,
  type QuoteRejection,
  type QuoteRequest,
} from '@synfin/spec';
import { MockVenueAdapter, type MockVenueConfig } from '../src/index.js';

const USD: AssetId = { registry: 'reg::usd', instrumentId: 'USD', decimals: 2 };
const BTC: AssetId = { registry: 'reg::btc', instrumentId: 'BTC', decimals: 8 };
const EUR: AssetId = { registry: 'reg::eur', instrumentId: 'EUR', decimals: 2 };
const FUTURE = '2099-01-01T00:00:00Z';
const PAST = '2000-01-01T00:00:00Z';

function adapter(overrides: Partial<MockVenueConfig> = {}): MockVenueAdapter {
  return new MockVenueAdapter({
    venueId: 'mock-a',
    pairs: [{ give: USD, want: BTC, rate0: '0.000016', liquidity: '100000' }],
    ...overrides,
  });
}

function request(overrides: Partial<QuoteRequest> = {}): QuoteRequest {
  return {
    intentRef: 'intent-1',
    give: { asset: USD, amount: '100' },
    want: { asset: BTC },
    deadline: FUTURE,
    nonce: 'nonce-1',
    ...overrides,
  };
}

async function asQuote(r: Promise<Quote | QuoteRejection>): Promise<Quote> {
  const v = await r;
  if (isQuoteRejection(v)) throw new Error(`unexpected rejection: ${v.code}`);
  return v;
}

describe('MockVenueAdapter', () => {
  it('returns a spec-valid quote that echoes the give and sets quoteId', async () => {
    const q = await asQuote(adapter().quote(request()));
    expect(validateQuote(q, { now: new Date('2030-01-01T00:00:00Z') }).ok).toBe(
      true,
    );
    expect(q.venueId).toBe('mock-a');
    expect(q.quoteId).toBe('mock-a:nonce-1');
    expect(q.give).toEqual({ asset: USD, amount: '100' });
    expect(q.receive.asset).toEqual(BTC);
    expect(Decimal.parse(q.receive.amount)?.isPositive()).toBe(true);
  });

  it('defaults to atomic-allocation settlement and echoes it on quotes (RFC-0004)', async () => {
    const a = adapter();
    expect(a.settlementMode).toBe('atomic-allocation');
    const q = await asQuote(a.quote(request()));
    expect(q.settlementMode).toBe('atomic-allocation');
  });

  it('can be configured as a managed-deposit venue (RFC-0004)', async () => {
    const a = adapter({ settlementMode: 'managed-deposit' });
    expect(a.settlementMode).toBe('managed-deposit');
    const q = await asQuote(a.quote(request()));
    expect(q.settlementMode).toBe('managed-deposit');
  });

  it('is deterministic for identical requests', async () => {
    const a = adapter({ feeBps: 10 });
    expect(await a.quote(request())).toEqual(await a.quote(request()));
  });

  it('prices convex impact: larger sizes get a worse average rate', async () => {
    const a = adapter();
    const small = await asQuote(
      a.quote(request({ give: { asset: USD, amount: '100' } })),
    );
    const large = await asQuote(
      a.quote(request({ give: { asset: USD, amount: '50000' } })),
    );
    // rate = receive/give; small rate > large rate  <=>  rS*gL > rL*gS.
    const rS = Decimal.parse(small.receive.amount)!;
    const rL = Decimal.parse(large.receive.amount)!;
    const gS = Decimal.parse(small.give.amount)!;
    const gL = Decimal.parse(large.give.amount)!;
    expect(rS.mul(gL).gt(rL.mul(gS))).toBe(true);
  });

  it('a fee reduces the receipt (never overstated)', async () => {
    const noFee = await asQuote(adapter().quote(request()));
    const withFee = await asQuote(adapter({ feeBps: 100 }).quote(request()));
    expect(
      Decimal.parse(withFee.receive.amount)!.lte(
        Decimal.parse(noFee.receive.amount)!,
      ),
    ).toBe(true);
    expect(withFee.feeBps).toBe(100);
  });

  it('emits firm quotes with commitment + signature', async () => {
    const q = await asQuote(adapter({ firmness: 'firm' }).quote(request()));
    expect(q.firmness).toBe('firm');
    expect(q.commitment).toBe('mock-a:nonce-1:commit');
    expect(q.signature).toBe('mock-a:nonce-1:sig');
    expect(validateQuote(q).ok).toBe(true);
  });

  it('honours a configured (past) validUntil', async () => {
    const q = await asQuote(
      adapter({ quoteValidUntil: PAST }).quote(request()),
    );
    expect(q.validUntil).toBe(PAST);
    expect(validateQuote(q, { now: new Date('2030-01-01T00:00:00Z') }).ok).toBe(
      false,
    );
  });

  it('rejects unsupported pairs, oversize, malformed precision, and forceReject', async () => {
    const unsupported = await adapter().quote(
      request({ want: { asset: EUR } }),
    );
    expect(isQuoteRejection(unsupported) && unsupported.code).toBe(
      'pair_unsupported',
    );

    const oversize = await adapter({ maxGive: '1000' }).quote(
      request({ give: { asset: USD, amount: '5000' } }),
    );
    expect(isQuoteRejection(oversize) && oversize.code).toBe(
      'insufficient_liquidity',
    );

    const badPrecision = await adapter().quote(
      request({ give: { asset: USD, amount: '100.001' } }), // USD has 2 decimals
    );
    expect(isQuoteRejection(badPrecision) && badPrecision.code).toBe(
      'invalid_request',
    );

    const malformed = await adapter().quote(
      request({ give: { asset: USD, amount: 'abc' } }),
    );
    expect(isQuoteRejection(malformed) && malformed.code).toBe(
      'invalid_request',
    );

    const forced = await adapter({
      forceReject: { code: 'rate_limited', message: 'slow down' },
    }).quote(request());
    expect(isQuoteRejection(forced) && forced.code).toBe('rate_limited');
  });

  it('rejects a within-precision but oversize give cap correctly', async () => {
    const ok = await adapter({ maxGive: '1000' }).quote(
      request({ give: { asset: USD, amount: '1000' } }),
    );
    expect(isQuoteRejection(ok)).toBe(false);
  });
});
