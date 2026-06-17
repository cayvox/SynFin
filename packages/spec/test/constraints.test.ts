import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import {
  assetEquals,
  checkAggregateConsistency,
  checkConservation,
  checkRoutePlan,
  checkSlippageBound,
  checkVenueConstraints,
  checkWorstCaseFloor,
  compareByWorstCase,
} from '../src/index.js';
import type { AssetId, RouteLeg, RoutePlan, SwapIntent } from '../src/index.js';
import { BTC, USD, validIntent, validRoutePlan } from './fixtures.js';

const code0 = (errs: { code: string }[]): string | undefined => errs[0]?.code;

describe('assetEquals', () => {
  it('compares registry, id and decimals', () => {
    expect(assetEquals(USD, { ...USD })).toBe(true);
    expect(assetEquals(USD, { ...USD, registry: 'other' })).toBe(false);
    expect(assetEquals(USD, { ...USD, id: 'EUR' })).toBe(false);
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

describe('checkRoutePlan + compareByWorstCase', () => {
  it('accepts a valid plan and rejects a violating one', () => {
    expect(checkRoutePlan(validRoutePlan(), validIntent()).ok).toBe(true);
    expect(
      checkRoutePlan(validRoutePlan({ slippageBps: 9999 }), validIntent()).ok,
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

// --- Property-based invariants (TESTING.md §2) -----------------------------

const ASSET0: AssetId = { registry: 'r::give', id: 'GIVE', decimals: 0 };
const ASSET_OUT: AssetId = { registry: 'r::want', id: 'WANT', decimals: 0 };

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
