import { describe, expect, it } from 'vitest';
import {
  validateAssetId,
  validateIntentConstraints,
  validateSwapIntent,
  validateQuoteRequest,
  validateQuote,
  validateRouteLeg,
  validateRoutePlan,
} from '../src/index.js';
import {
  checkAmount,
  checkNonNegativeDecimal,
  isExpired,
} from '../src/validation/validators.js';
import { getValidator, toValidationErrors } from '../src/validation/ajv.js';
import {
  BTC,
  FUTURE,
  PAST,
  USD,
  validFirmQuote,
  validIndicativeQuote,
  validIntent,
  validQuoteRequest,
  validRoutePlan,
} from './fixtures.js';

const codes = (r: { ok: false; errors: { code: string }[] }): string[] =>
  r.errors.map((e) => e.code);

describe('Result helpers', () => {
  it('err accepts a single error or an array', async () => {
    const { err, ok } = await import('../src/index.js');
    expect(err({ code: 'x', message: 'm' }).ok).toBe(false);
    const single = err({ code: 'x', message: 'm' });
    if (!single.ok) expect(single.errors).toHaveLength(1);
    expect(ok(1)).toEqual({ ok: true, value: 1 });
  });
});

describe('ajv helpers', () => {
  it('getValidator throws for an unknown schema id', () => {
    expect(() => getValidator('does-not-exist.json')).toThrow();
  });

  it('toValidationErrors handles null and empty error lists', () => {
    expect(toValidationErrors(null)).toEqual([
      { code: 'schema', message: 'schema validation failed' },
    ]);
    expect(toValidationErrors([])).toEqual([
      { code: 'schema', message: 'schema validation failed' },
    ]);
  });

  it('toValidationErrors maps both root and nested ajv errors', () => {
    // Root-level type error -> instancePath '' becomes '/'.
    const rootFail = validateSwapIntent(42);
    expect(rootFail.ok).toBe(false);
    if (!rootFail.ok) {
      expect(rootFail.errors[0]?.message.startsWith('/')).toBe(true);
    }
    // Nested error -> non-empty instancePath retained.
    const nestedFail = validateSwapIntent(validIntent({ taker: '' }));
    expect(nestedFail.ok).toBe(false);
    if (!nestedFail.ok) {
      expect(nestedFail.errors.some((e) => e.path === '/taker')).toBe(true);
    }
  });
});

describe('internal amount checks', () => {
  it('checkAmount flags malformed, non-positive and over-precise amounts', () => {
    expect(checkAmount('abc', 2, '/a')[0]?.code).toBe('invalid_decimal');
    expect(checkAmount('-1.00', 2, '/a')[0]?.code).toBe('non_positive_amount');
    expect(checkAmount('0.00', 2, '/a')[0]?.code).toBe('non_positive_amount');
    expect(checkAmount('1.234', 2, '/a')[0]?.code).toBe('excess_precision');
    expect(checkAmount('-1.234', 2, '/a').map((e) => e.code)).toEqual([
      'non_positive_amount',
      'excess_precision',
    ]);
    expect(checkAmount('1.00', 2, '/a')).toEqual([]);
  });

  it('checkNonNegativeDecimal flags malformed and negative values', () => {
    expect(checkNonNegativeDecimal('abc', '/a')[0]?.code).toBe(
      'invalid_decimal',
    );
    expect(checkNonNegativeDecimal('-1', '/a')[0]?.code).toBe(
      'negative_amount',
    );
    expect(checkNonNegativeDecimal('0', '/a')).toEqual([]);
    expect(checkNonNegativeDecimal('5', '/a')).toEqual([]);
  });

  it('isExpired compares against an optional clock', () => {
    expect(isExpired(PAST, undefined)).toBe(false);
    expect(isExpired(PAST, new Date('2001-01-01T00:00:00Z'))).toBe(true);
    expect(isExpired(FUTURE, new Date('2001-01-01T00:00:00Z'))).toBe(false);
  });
});

describe('validateAssetId / validateIntentConstraints (RFC-0001 Decision A)', () => {
  it('accepts valid and rejects invalid', () => {
    expect(validateAssetId(USD).ok).toBe(true);
    // missing decimals
    expect(validateAssetId({ registry: 'r', instrumentId: 'X' }).ok).toBe(
      false,
    );
    // missing instrumentId
    expect(validateAssetId({ registry: 'r', decimals: 2 }).ok).toBe(false);
    // negative decimals
    expect(
      validateAssetId({ registry: 'r', instrumentId: 'X', decimals: -1 }).ok,
    ).toBe(false);
    expect(validateIntentConstraints({ maxVenues: 2 }).ok).toBe(true);
    expect(validateIntentConstraints({ maxVenues: 0 }).ok).toBe(false); // minimum 1
  });
});

describe('validateSwapIntent (SPEC §4.1)', () => {
  it('accepts a valid intent', () => {
    expect(validateSwapIntent(validIntent()).ok).toBe(true);
  });

  it('rejects a missing required field', () => {
    const { taker, ...rest } = validIntent();
    void taker;
    expect(validateSwapIntent(rest).ok).toBe(false);
  });

  it('rejects a non-positive give amount', () => {
    const r = validateSwapIntent(
      validIntent({ give: { asset: USD, amount: '0.00' } }),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(codes(r)).toContain('non_positive_amount');
  });

  it('rejects minReceive == 0 and < 0 (RFC-0001 Decision B)', () => {
    const zero = validateSwapIntent(
      validIntent({ want: { asset: BTC, minReceive: '0.00000000' } }),
    );
    expect(zero.ok).toBe(false);
    if (!zero.ok) expect(codes(zero)).toContain('non_positive_amount');
    const neg = validateSwapIntent(
      validIntent({ want: { asset: BTC, minReceive: '-0.00000001' } }),
    );
    expect(neg.ok).toBe(false);
    if (!neg.ok) expect(codes(neg)).toContain('non_positive_amount');
  });

  it('rejects an amount with more fractional digits than the asset decimals', () => {
    const r = validateSwapIntent(
      validIntent({ give: { asset: USD, amount: '100.001' } }), // USD has 2 decimals
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(codes(r)).toContain('excess_precision');
  });

  it('ignores unknown optional fields (forward compatibility, SPEC §9)', () => {
    const r = validateSwapIntent({ ...validIntent(), futureField: 'ok' });
    expect(r.ok).toBe(true);
  });
});

describe('validateQuoteRequest (SPEC §4.2)', () => {
  it('accepts a valid request and rejects schema violations', () => {
    expect(validateQuoteRequest(validQuoteRequest()).ok).toBe(true);
    expect(validateQuoteRequest({ ...validQuoteRequest(), nonce: '' }).ok).toBe(
      false,
    );
  });

  it('rejects a request past its deadline when a clock is supplied', () => {
    const r = validateQuoteRequest(validQuoteRequest({ deadline: PAST }), {
      now: new Date('2001-01-01T00:00:00Z'),
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(codes(r)).toContain('expired');
  });
});

describe('validateQuote (SPEC §4.3, §8)', () => {
  it('accepts indicative and firm quotes', () => {
    expect(validateQuote(validIndicativeQuote()).ok).toBe(true);
    expect(validateQuote(validFirmQuote()).ok).toBe(true);
  });

  it('rejects a quote missing quoteId (RFC-0001 Decision C)', () => {
    const { quoteId, ...rest } = validIndicativeQuote();
    void quoteId;
    expect(validateQuote(rest).ok).toBe(false);
  });

  it('rejects a firm quote without commitment+signature', () => {
    const r = validateQuote(validFirmQuote({ commitment: undefined as never }));
    expect(r.ok).toBe(false);
  });

  it('rejects an expired quote when a clock is supplied', () => {
    const r = validateQuote(validIndicativeQuote({ validUntil: PAST }), {
      now: new Date('2001-01-01T00:00:00Z'),
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(codes(r)).toContain('expired');
  });

  it('rejects non-positive receive amounts', () => {
    const r = validateQuote(
      validIndicativeQuote({ receive: { asset: BTC, amount: '0.00000000' } }),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(codes(r)).toContain('non_positive_amount');
  });
});

describe('validateRouteLeg / validateRoutePlan (SPEC §4.4)', () => {
  it('accepts valid shapes', () => {
    expect(validateRoutePlan(validRoutePlan()).ok).toBe(true);
    expect(validateRouteLeg(validRoutePlan().legs[0]).ok).toBe(true);
  });

  it('rejects a leg with a missing field or a non-positive amount', () => {
    const leg = validRoutePlan().legs[0];
    const { venueId, ...noVenue } = leg;
    void venueId;
    expect(validateRouteLeg(noVenue).ok).toBe(false);
    const r = validateRouteLeg({
      ...leg,
      receive: { asset: BTC, amount: '0.00000000' },
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(codes(r)).toContain('non_positive_amount');
  });

  it('rejects an empty leg list', () => {
    expect(validateRoutePlan(validRoutePlan({ legs: [] as never })).ok).toBe(
      false,
    );
  });

  it('rejects a leg with a non-positive amount', () => {
    const plan = validRoutePlan();
    const r = validateRoutePlan({
      ...plan,
      legs: [{ ...plan.legs[0], give: { asset: USD, amount: '0.00' } }],
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(codes(r)).toContain('non_positive_amount');
  });

  it('rejects a negative aggregateReceive', () => {
    const r = validateRoutePlan(
      validRoutePlan({ aggregateReceive: '-0.00000001' }),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(codes(r)).toContain('negative_amount');
  });
});
