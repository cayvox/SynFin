import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import {
  assetEquals,
  computeWorstCaseReceiveNet,
  checkAggregateConsistency,
  checkConservation,
  checkNetConsistency,
  checkNoOverstatement,
  checkQuoteLinkage,
  checkRoutePlan,
  checkSlippageBound,
  checkVenueConstraints,
  checkWorstCaseFloor,
  compareByWorstCase,
  isAtomicRoute,
  checkAtomicallySettleable,
  Decimal,
} from '../src/index.js';
import type { AssetId, RouteLeg, RoutePlan, SwapIntent } from '../src/index.js';
import {
  BTC,
  NOW,
  PAST,
  USD,
  validIntent,
  validIndicativeQuote,
  validQuotesForPlan,
  validRoutePlan,
} from './fixtures.js';

const code0 = (errs: { code: string }[]): string | undefined => errs[0]?.code;

describe('assetEquals (RFC-0001 Decision A)', () => {
  it('compares registry, instrumentId and decimals', () => {
    expect(assetEquals(USD, { ...USD })).toBe(true);
    expect(assetEquals(USD, { ...USD, registry: 'other' })).toBe(false);
    expect(assetEquals(USD, { ...USD, instrumentId: 'EUR' })).toBe(false);
    expect(assetEquals(USD, { ...USD, decimals: 6 })).toBe(false);
  });
});

describe('checkConservation (SPEC §4.4)', () => {
  it('passes when leg gives sum to the intent give', () => {
    expect(checkConservation(validRoutePlan(), validIntent())).toEqual([]);
  });

  it('flags a sum mismatch', () => {
    const plan = validRoutePlan({
      legs: [
        { ...validRoutePlan().legs[0], give: { asset: USD, amount: '90.00' } },
      ],
    });
    expect(code0(checkConservation(plan, validIntent()))).toBe('conservation');
  });

  it('flags a leg whose give asset differs from the intent', () => {
    const plan = validRoutePlan({
      legs: [
        {
          ...validRoutePlan().legs[0],
          give: { asset: BTC, amount: '100.00' },
        },
      ],
    });
    expect(code0(checkConservation(plan, validIntent()))).toBe(
      'asset_mismatch',
    );
  });

  it('flags an unparseable leg amount', () => {
    const plan = validRoutePlan({
      legs: [
        { ...validRoutePlan().legs[0], give: { asset: USD, amount: 'abc' } },
      ],
    });
    expect(code0(checkConservation(plan, validIntent()))).toBe(
      'invalid_decimal',
    );
  });
});

describe('worst-case floor, slippage and venue constraints', () => {
  it('checkWorstCaseFloor enforces minReceive', () => {
    expect(checkWorstCaseFloor(validRoutePlan(), validIntent())).toEqual([]);
    expect(
      code0(
        checkWorstCaseFloor(
          validRoutePlan({ worstCaseReceive: '0.00000001' }),
          validIntent(),
        ),
      ),
    ).toBe('below_min_receive');
  });

  it('checkWorstCaseFloor surfaces an unparseable amount', () => {
    expect(
      code0(
        checkWorstCaseFloor(
          validRoutePlan({ worstCaseReceive: 'abc' }),
          validIntent(),
        ),
      ),
    ).toBe('invalid_decimal');
  });

  it('checkSlippageBound enforces maxSlippageBps', () => {
    expect(checkSlippageBound(validRoutePlan(), validIntent())).toEqual([]);
    expect(
      code0(
        checkSlippageBound(
          validRoutePlan({ slippageBps: 9999 }),
          validIntent(),
        ),
      ),
    ).toBe('slippage_exceeded');
  });

  it('checkVenueConstraints respects maxVenues and venueAllowList', () => {
    expect(checkVenueConstraints(validRoutePlan(), validIntent())).toEqual([]);
    expect(
      code0(
        checkVenueConstraints(
          validRoutePlan(),
          validIntent({ constraints: { maxVenues: 0 } }),
        ),
      ),
    ).toBe('max_venues_exceeded');
    expect(
      code0(
        checkVenueConstraints(
          validRoutePlan(),
          validIntent({ constraints: { venueAllowList: ['other-venue'] } }),
        ),
      ),
    ).toBe('venue_not_allowed');
    expect(
      checkVenueConstraints(
        validRoutePlan(),
        validIntent({ constraints: { venueAllowList: ['venue-1'] } }),
      ),
    ).toEqual([]);
  });
});

describe('checkAggregateConsistency (SPEC §4.4, §3)', () => {
  it('passes a self-consistent plan', () => {
    expect(checkAggregateConsistency(validRoutePlan())).toEqual([]);
  });

  it('flags aggregateReceive exceeding the sum of leg receipts', () => {
    expect(
      code0(
        checkAggregateConsistency(
          validRoutePlan({ aggregateReceive: '0.00130000' }),
        ),
      ),
    ).toBe('overstated_receive');
  });

  it('flags worstCaseReceive exceeding aggregateReceive', () => {
    expect(
      code0(
        checkAggregateConsistency(
          validRoutePlan({ worstCaseReceive: '0.00130000' }),
        ),
      ),
    ).toBe('worst_above_aggregate');
  });

  it('returns early on an unparseable amount', () => {
    expect(
      code0(
        checkAggregateConsistency(validRoutePlan({ aggregateReceive: 'abc' })),
      ),
    ).toBe('invalid_decimal');
  });
});

describe('quote linkage + per-leg no-overstatement (RFC-0001 Decision C)', () => {
  it('checkQuoteLinkage rejects a leg whose quoteRef is unknown', () => {
    expect(checkQuoteLinkage(validRoutePlan(), validQuotesForPlan())).toEqual(
      [],
    );
    expect(
      code0(
        checkQuoteLinkage(
          validRoutePlan({
            legs: [{ ...validRoutePlan().legs[0], quoteRef: 'nope' }],
          }),
          validQuotesForPlan(),
        ),
      ),
    ).toBe('unresolved_quote_ref');
  });

  it('checkNoOverstatement accepts a leg within its referenced quote', () => {
    expect(
      checkNoOverstatement(validRoutePlan(), validQuotesForPlan(), NOW),
    ).toEqual([]);
  });

  it('rejects a leg whose receive exceeds its referenced quote', () => {
    const plan = validRoutePlan({
      legs: [
        {
          ...validRoutePlan().legs[0],
          receive: { asset: BTC, amount: '0.00130000' }, // quote offers 0.00120000
        },
      ],
    });
    expect(code0(checkNoOverstatement(plan, validQuotesForPlan(), NOW))).toBe(
      'leg_exceeds_quote',
    );
  });

  it('rejects a leg referencing an expired quote', () => {
    const quotes = [
      validIndicativeQuote({ quoteId: 'quote-1', validUntil: PAST }),
    ];
    expect(code0(checkNoOverstatement(validRoutePlan(), quotes, NOW))).toBe(
      'quote_expired',
    );
  });

  it('rejects a leg whose assets mismatch the referenced quote', () => {
    const quotes = [
      validIndicativeQuote({
        quoteId: 'quote-1',
        receive: { asset: USD, amount: '0.00120000' }, // wrong receive asset
      }),
    ];
    expect(code0(checkNoOverstatement(validRoutePlan(), quotes, NOW))).toBe(
      'leg_quote_asset_mismatch',
    );
  });

  it('skips unresolved legs (left to checkQuoteLinkage)', () => {
    const plan = validRoutePlan({
      legs: [{ ...validRoutePlan().legs[0], quoteRef: 'nope' }],
    });
    expect(checkNoOverstatement(plan, validQuotesForPlan(), NOW)).toEqual([]);
  });

  it('flags an unparseable leg/quote amount', () => {
    const quotes = [
      validIndicativeQuote({
        quoteId: 'quote-1',
        receive: { asset: BTC, amount: 'abc' },
      }),
    ];
    expect(code0(checkNoOverstatement(validRoutePlan(), quotes, NOW))).toBe(
      'invalid_decimal',
    );
  });
});

describe('checkRoutePlan + compareByWorstCase', () => {
  it('accepts a valid plan and rejects a violating one', () => {
    expect(
      checkRoutePlan(validRoutePlan(), validIntent(), validQuotesForPlan(), NOW)
        .ok,
    ).toBe(true);
    expect(
      checkRoutePlan(
        validRoutePlan({ slippageBps: 9999 }),
        validIntent(),
        validQuotesForPlan(),
        NOW,
      ).ok,
    ).toBe(false);
  });

  it('rejects a plan whose leg quoteRef is not in the supplied quote set', () => {
    expect(
      checkRoutePlan(
        validRoutePlan({
          legs: [{ ...validRoutePlan().legs[0], quoteRef: 'nope' }],
        }),
        validIntent(),
        validQuotesForPlan(),
        NOW,
      ).ok,
    ).toBe(false);
  });

  it('compareByWorstCase orders by worst-case receive', () => {
    const lo = validRoutePlan({ worstCaseReceive: '0.00100000' });
    const hi = validRoutePlan({ worstCaseReceive: '0.00200000' });
    expect(compareByWorstCase(lo, hi)).toBe(-1);
    expect(compareByWorstCase(hi, lo)).toBe(1);
    expect(compareByWorstCase(lo, lo)).toBe(0);
  });

  it('compareByWorstCase throws on an unparseable plan', () => {
    expect(() =>
      compareByWorstCase(
        validRoutePlan({ worstCaseReceive: 'abc' }),
        validRoutePlan(),
      ),
    ).toThrow();
  });
});

describe('isAtomicRoute + checkAtomicallySettleable (RFC-0004, SPEC §6)', () => {
  const leg = (quoteRef: string): RouteLeg => ({
    venueId: 'venue-1',
    give: { asset: USD, amount: '100.00' },
    receive: { asset: BTC, amount: '0.00120000' },
    quoteRef,
  });

  it('is atomic only when every leg references an atomic-allocation quote', () => {
    const plan = validRoutePlan({ legs: [leg('q-a'), leg('q-b')] });
    const allAtomic = [
      validIndicativeQuote({
        quoteId: 'q-a',
        settlementMode: 'atomic-allocation',
      }),
      validIndicativeQuote({
        quoteId: 'q-b',
        settlementMode: 'atomic-allocation',
      }),
    ];
    expect(isAtomicRoute(plan, allAtomic)).toBe(true);
    expect(checkAtomicallySettleable(plan, allAtomic).ok).toBe(true);
  });

  it('is NOT atomic when any leg references a managed-deposit quote', () => {
    const plan = validRoutePlan({ legs: [leg('q-a'), leg('q-b')] });
    const mixed = [
      validIndicativeQuote({
        quoteId: 'q-a',
        settlementMode: 'atomic-allocation',
      }),
      validIndicativeQuote({
        quoteId: 'q-b',
        settlementMode: 'managed-deposit',
      }),
    ];
    expect(isAtomicRoute(plan, mixed)).toBe(false);
    const r = checkAtomicallySettleable(plan, mixed);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(code0(r.errors)).toBe('not_atomically_settleable');
      expect(r.errors[0]?.path).toBe('/legs/1');
    }
  });

  it('is NOT atomic when a leg references a quote absent from the set', () => {
    const plan = validRoutePlan({ legs: [leg('ghost')] });
    const quotes = [
      validIndicativeQuote({
        quoteId: 'q-a',
        settlementMode: 'atomic-allocation',
      }),
    ];
    expect(isAtomicRoute(plan, quotes)).toBe(false);
    expect(checkAtomicallySettleable(plan, quotes).ok).toBe(false);
  });
});

// --- Property-based invariants (TESTING.md §2) -----------------------------

const ASSET0: AssetId = {
  registry: 'r::give',
  instrumentId: 'GIVE',
  decimals: 0,
};
const ASSET_OUT: AssetId = {
  registry: 'r::want',
  instrumentId: 'WANT',
  decimals: 0,
};

function planFrom(
  gives: number[],
  receives: number[],
  extra: Partial<RoutePlan> = {},
): RoutePlan {
  const legs = gives.map<RouteLeg>((g, i) => ({
    venueId: `v${i}`,
    give: { asset: ASSET0, amount: String(g) },
    receive: { asset: ASSET_OUT, amount: String(receives[i] ?? 1) },
    quoteRef: `q${i}`,
  }));
  return {
    intentRef: 'i',
    legs: legs as [RouteLeg, ...RouteLeg[]],
    aggregateReceive: String(receives.reduce((a, b) => a + b, 0)),
    worstCaseReceive: '0',
    slippageBps: 0,
    ...extra,
  };
}

function intentFrom(
  giveTotal: number,
  extra: Partial<SwapIntent> = {},
): SwapIntent {
  return {
    intentId: 'i',
    taker: 't::p',
    give: { asset: ASSET0, amount: String(giveTotal) },
    want: { asset: ASSET_OUT, minReceive: '0' },
    maxSlippageBps: 0,
    deadline: '2099-01-01T00:00:00Z',
    ...extra,
  };
}

describe('property: conservation', () => {
  it('holds iff leg gives sum to the intent give', () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: 1, max: 1_000_000 }), {
          minLength: 1,
          maxLength: 6,
        }),
        (gives) => {
          const total = gives.reduce((a, b) => a + b, 0);
          const receives = gives.map(() => 1);
          expect(
            checkConservation(planFrom(gives, receives), intentFrom(total)),
          ).toEqual([]);
          expect(
            checkConservation(planFrom(gives, receives), intentFrom(total + 1)),
          ).not.toEqual([]);
        },
      ),
    );
  });
});

describe('property: no overstatement (SPEC §4.4)', () => {
  it('aggregateReceive must not exceed the sum of leg receipts', () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: 1, max: 1_000_000 }), {
          minLength: 1,
          maxLength: 6,
        }),
        (receives) => {
          const sum = receives.reduce((a, b) => a + b, 0);
          const gives = receives.map(() => 1);
          expect(
            checkAggregateConsistency(
              planFrom(gives, receives, { aggregateReceive: String(sum) }),
            ),
          ).toEqual([]);
          expect(
            checkAggregateConsistency(
              planFrom(gives, receives, { aggregateReceive: String(sum + 1) }),
            ).map((e) => e.code),
          ).toContain('overstated_receive');
        },
      ),
    );
  });
});

describe('property: slippage bound (SPEC §4.4)', () => {
  it('is satisfied exactly when slippageBps <= maxSlippageBps', () => {
    fc.assert(
      fc.property(fc.nat(10_000), fc.nat(10_000), (planSlip, maxSlip) => {
        const errs = checkSlippageBound(
          planFrom([1], [1], { slippageBps: planSlip }),
          intentFrom(1, { maxSlippageBps: maxSlip }),
        );
        expect(errs.length === 0).toBe(planSlip <= maxSlip);
      }),
    );
  });
});

describe('property: monotonicity (TESTING.md §2)', () => {
  it('a plan with a higher worst-case receive is never ranked worse', () => {
    fc.assert(
      fc.property(fc.nat(1_000_000), fc.nat(1_000_000), (base, delta) => {
        const baseline = planFrom([1], [1], { worstCaseReceive: String(base) });
        const better = planFrom([1], [1], {
          worstCaseReceive: String(base + delta),
        });
        // "better" (more/better quotes) must not be worse than the baseline.
        expect(compareByWorstCase(better, baseline)).not.toBe(-1);
      }),
    );
  });
});

// ---- RFC-0005: network-fee transparency + net-value ranking ----------------

const CC: AssetId = { registry: 'reg::cc', instrumentId: 'CC', decimals: 10 };
const USDCx: AssetId = {
  registry: 'reg::usdcx',
  instrumentId: 'USDCx',
  decimals: 6,
};
const D = (s: string): Decimal => Decimal.parse(s)!;
const codes = (errs: { code: string }[]): string[] => errs.map((e) => e.code);

/** A leg in the default USD -> BTC shape, optionally carrying a networkFee. */
function legWithFee(fee?: { asset: AssetId; amount: string }): RouteLeg {
  return {
    venueId: 'venue-1',
    give: { asset: USD, amount: '100.00' },
    receive: { asset: BTC, amount: '0.00120000' },
    quoteRef: 'quote-1',
    ...(fee ? { networkFee: fee } : {}),
  };
}

describe('computeWorstCaseReceiveNet (RFC-0005 §3)', () => {
  it('re-bases a give-asset fee by total give outlay, floored taker-favorably', () => {
    // RFC-0005 §3 formula: gross * give / (give + fee), floored to 6 dp.
    // 15.2228400389 * 100 / 100.7948 = 15.102802... -> 15.102802.
    const r = computeWorstCaseReceiveNet(
      D('15.2228400389'),
      { asset: CC, amount: D('100') },
      USDCx,
      { asset: CC, amount: D('0.7948') },
    );
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.toString()).toBe('15.102802');
  });

  it('subtracts a receive-asset fee', () => {
    const r = computeWorstCaseReceiveNet(
      D('15.000000'),
      { asset: CC, amount: D('100') },
      USDCx,
      { asset: USDCx, amount: D('0.5') },
    );
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.toString()).toBe('14.500000');
  });

  it('returns the gross when the fee is absent or zero', () => {
    const gross = D('15.000000');
    const give = { asset: CC, amount: D('100') };
    const noFee = computeWorstCaseReceiveNet(gross, give, USDCx);
    const zeroFee = computeWorstCaseReceiveNet(gross, give, USDCx, {
      asset: CC,
      amount: D('0'),
    });
    expect(noFee.ok && noFee.value.eq(gross)).toBe(true);
    expect(zeroFee.ok && zeroFee.value.eq(gross)).toBe(true);
  });

  it('rejects a third-asset fee (RFC-0005 §2)', () => {
    const third: AssetId = {
      registry: 'reg::eth',
      instrumentId: 'ETH',
      decimals: 18,
    };
    const r = computeWorstCaseReceiveNet(
      D('15'),
      { asset: CC, amount: D('100') },
      USDCx,
      { asset: third, amount: D('0.001') },
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('unsupported_fee_asset');
  });

  it('a give-asset net never overstates the gross (property)', () => {
    const gross = D('15.000000');
    fc.assert(
      fc.property(fc.nat(1_000_000), fc.nat(1_000_000), (g, f) => {
        const r = computeWorstCaseReceiveNet(
          gross,
          { asset: CC, amount: D(String(g + 1)) },
          USDCx,
          { asset: CC, amount: D(String(f)) },
        );
        expect(r.ok).toBe(true);
        if (r.ok) expect(r.value.lte(gross)).toBe(true);
      }),
    );
  });
});

describe('checkNoOverstatement: network-fee no-understatement (RFC-0005 §5)', () => {
  it('flags a leg that omits a fee its quote declares (fee_understated)', () => {
    const quotes = [
      validIndicativeQuote({
        quoteId: 'quote-1',
        networkFee: { asset: USD, amount: '1.00' },
      }),
    ];
    const errs = checkNoOverstatement(validRoutePlan(), quotes, NOW);
    expect(codes(errs)).toContain('fee_understated');
  });

  it('flags a leg whose fee is below the quote fee (fee_understated)', () => {
    const quotes = [
      validIndicativeQuote({
        quoteId: 'quote-1',
        networkFee: { asset: USD, amount: '1.00' },
      }),
    ];
    const plan = validRoutePlan({
      legs: [legWithFee({ asset: USD, amount: '0.50' })],
    });
    expect(codes(checkNoOverstatement(plan, quotes, NOW))).toContain(
      'fee_understated',
    );
  });

  it('flags a leg whose fee is in a different asset than the quote fee (fee_understated)', () => {
    const quotes = [
      validIndicativeQuote({
        quoteId: 'quote-1',
        networkFee: { asset: USD, amount: '1.00' },
      }),
    ];
    const plan = validRoutePlan({
      legs: [legWithFee({ asset: BTC, amount: '1.00000000' })],
    });
    expect(codes(checkNoOverstatement(plan, quotes, NOW))).toContain(
      'fee_understated',
    );
  });

  it('accepts a leg whose fee matches the asset and meets the amount', () => {
    const quotes = [
      validIndicativeQuote({
        quoteId: 'quote-1',
        networkFee: { asset: USD, amount: '1.00' },
      }),
    ];
    const plan = validRoutePlan({
      legs: [legWithFee({ asset: USD, amount: '1.00' })],
    });
    expect(checkNoOverstatement(plan, quotes, NOW)).toEqual([]);
  });

  it('flags a quote fee in neither the give nor receive asset (unsupported_fee_asset)', () => {
    const quotes = [
      validIndicativeQuote({
        quoteId: 'quote-1',
        networkFee: { asset: CC, amount: '1' },
      }),
    ];
    const plan = validRoutePlan({
      legs: [legWithFee({ asset: CC, amount: '1' })],
    });
    expect(codes(checkNoOverstatement(plan, quotes, NOW))).toContain(
      'unsupported_fee_asset',
    );
  });
});

describe('checkAggregateConsistency: net never exceeds gross (RFC-0005 §5)', () => {
  it('flags worstCaseReceiveNet > worstCaseReceive (net_above_gross)', () => {
    // The default gross is 0.00110000.
    const plan = validRoutePlan({ worstCaseReceiveNet: '0.00120000' });
    expect(codes(checkAggregateConsistency(plan))).toContain('net_above_gross');
  });

  it('accepts a net at or below the gross', () => {
    const plan = validRoutePlan({ worstCaseReceiveNet: '0.00100000' });
    expect(checkAggregateConsistency(plan)).toEqual([]);
  });
});

describe('checkNetConsistency (RFC-0005 §3, §5)', () => {
  const intent = validIntent(); // give USD 100.00, want BTC

  it('accepts a give-asset fee with the correct worstCaseReceiveNet', () => {
    const expected = computeWorstCaseReceiveNet(
      D('0.00110000'),
      { asset: USD, amount: D('100.00') },
      BTC,
      { asset: USD, amount: D('1.00') },
    );
    expect(expected.ok).toBe(true);
    if (!expected.ok) return;
    const plan = validRoutePlan({
      networkFee: { asset: USD, amount: '1.00' },
      worstCaseReceiveNet: expected.value.toString(),
    });
    expect(checkNetConsistency(plan, intent)).toEqual([]);
  });

  it('flags a wrong worstCaseReceiveNet (net_mismatch)', () => {
    const plan = validRoutePlan({
      networkFee: { asset: USD, amount: '1.00' },
      worstCaseReceiveNet: '0.00110000', // equals gross, but a fee should lower it
    });
    expect(codes(checkNetConsistency(plan, intent))).toContain('net_mismatch');
  });

  it('flags a network fee with no worstCaseReceiveNet (net_mismatch)', () => {
    const plan = validRoutePlan({ networkFee: { asset: USD, amount: '1.00' } });
    expect(codes(checkNetConsistency(plan, intent))).toContain('net_mismatch');
  });

  it('flags a third-asset fee (unsupported_fee_asset)', () => {
    const plan = validRoutePlan({
      networkFee: { asset: CC, amount: '1' },
      worstCaseReceiveNet: '0.00110000',
    });
    expect(codes(checkNetConsistency(plan, intent))).toContain(
      'unsupported_fee_asset',
    );
  });

  it('accepts a plan with no networkFee and no worstCaseReceiveNet', () => {
    expect(checkNetConsistency(validRoutePlan(), intent)).toEqual([]);
  });
});

describe('compareByWorstCase: net-value ranking (RFC-0005 §3)', () => {
  it('ranks a higher-gross fee-bearing plan below a lower-gross fee-free plan when the net favors the latter', () => {
    const feeBearing = validRoutePlan({
      worstCaseReceive: '0.00120000',
      networkFee: { asset: USD, amount: '5.00' },
      worstCaseReceiveNet: '0.00100000',
    });
    const feeFree = validRoutePlan({ worstCaseReceive: '0.00110000' }); // no net field, ranks on gross
    // Net: feeBearing 0.00100000 < feeFree 0.00110000, so feeBearing is worse.
    expect(compareByWorstCase(feeBearing, feeFree)).toBe(-1);
    expect(compareByWorstCase(feeFree, feeBearing)).toBe(1);
  });

  it('ranks two fee-free plans by gross exactly as before (backward compatible)', () => {
    const lo = validRoutePlan({ worstCaseReceive: '0.00100000' });
    const hi = validRoutePlan({ worstCaseReceive: '0.00120000' });
    expect(compareByWorstCase(lo, hi)).toBe(-1);
    expect(compareByWorstCase(hi, lo)).toBe(1);
    expect(compareByWorstCase(lo, lo)).toBe(0);
  });
});
