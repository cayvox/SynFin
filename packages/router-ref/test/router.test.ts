import { describe, expect, it } from 'vitest';
import {
  Decimal,
  checkRoutePlan,
  type AssetId,
  type Quote,
  type SwapIntent,
} from '@synfin/spec';
import {
  NoViableRouteError,
  createReferenceRouter,
  route,
} from '../src/index.js';

const USD: AssetId = { registry: 'reg::usd', instrumentId: 'USD', decimals: 2 };
const BTC: AssetId = { registry: 'reg::btc', instrumentId: 'BTC', decimals: 8 };
const EUR: AssetId = { registry: 'reg::eur', instrumentId: 'EUR', decimals: 2 };
const FUTURE = '2099-01-01T00:00:00Z';
const PAST = '2000-01-01T00:00:00Z';
const NOW = new Date('2030-01-01T00:00:00Z');

function quote(overrides: Partial<Quote> = {}): Quote {
  return {
    quoteId: 'q1',
    venueId: 'v1',
    give: { asset: USD, amount: '100' },
    receive: { asset: BTC, amount: '0.00120000' },
    feeBps: 0,
    sourceKind: 'AMM',
    firmness: 'indicative',
    validUntil: FUTURE,
    ...overrides,
  };
}

function intent(overrides: Partial<SwapIntent> = {}): SwapIntent {
  return {
    intentId: 'intent-1',
    taker: 'taker::p',
    give: { asset: USD, amount: '100' },
    want: { asset: BTC, minReceive: '0.00000001' },
    maxSlippageBps: 100_000,
    deadline: FUTURE,
    ...overrides,
  };
}

describe('reference router — happy paths', () => {
  it('fills the whole give from a single covering venue', () => {
    const r = route(intent(), [quote()], NOW);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.plan.legs).toHaveLength(1);
    expect(r.plan.legs[0]?.quoteRef).toBe('q1');
    expect(r.plan.legs[0]?.give.amount).toBe('100');
    expect(r.plan.aggregateReceive).toBe('0.00120000');
    expect(r.plan.slippageBps).toBe(0);
    expect(checkRoutePlan(r.plan, intent(), [quote()], NOW).ok).toBe(true);
  });

  it('picks the best net rate among single-venue covering quotes', () => {
    const worse = quote({
      quoteId: 'qa',
      venueId: 'va',
      receive: { asset: BTC, amount: '0.00110000' },
    });
    const better = quote({
      quoteId: 'qb',
      venueId: 'vb',
      receive: { asset: BTC, amount: '0.00130000' },
    });
    const r = route(intent(), [worse, better], NOW);
    expect(r.ok && r.plan.legs[0]?.quoteRef).toBe('qb');
  });

  it('splits across venues when no single quote covers the give', () => {
    const a = quote({
      quoteId: 'qa',
      venueId: 'va',
      give: { asset: USD, amount: '60' },
      receive: { asset: BTC, amount: '0.00072000' },
    });
    const b = quote({
      quoteId: 'qb',
      venueId: 'vb',
      give: { asset: USD, amount: '60' },
      receive: { asset: BTC, amount: '0.00072000' },
    });
    const r = route(intent(), [a, b], NOW);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.plan.legs.length).toBe(2);
    const sumGive = r.plan.legs.reduce(
      (acc, l) => acc.add(Decimal.parse(l.give.amount)!),
      Decimal.zero(),
    );
    expect(sumGive.eq(Decimal.parse('100')!)).toBe(true); // conservation
    expect(checkRoutePlan(r.plan, intent(), [a, b], NOW).ok).toBe(true);
  });

  it('a partial leg never overstates the referenced quote receipt', () => {
    // Single venue, two buckets: deepest (give 60) used partially for 100? No —
    // 60 < 100 so split needs a second venue. Use one venue give 150 partial to 100.
    const big = quote({
      quoteId: 'qa',
      venueId: 'va',
      give: { asset: USD, amount: '150' },
      receive: { asset: BTC, amount: '0.00150000' },
    });
    const r = route(intent(), [big], NOW);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    // proportional: 0.0015 * 100/150 = 0.001 floor → 0.00100000, <= quote receive
    expect(r.plan.legs[0]?.receive.amount).toBe('0.00100000');
    expect(checkRoutePlan(r.plan, intent(), [big], NOW).ok).toBe(true);
  });
});

describe('reference router — no viable route', () => {
  it('no eligible quotes (asset mismatch / expired / disallowed)', () => {
    expect(route(intent(), [], NOW).ok).toBe(false);
    expect(
      route(intent(), [quote({ receive: { asset: EUR, amount: '1.00' } })], NOW)
        .ok,
    ).toBe(false);
    expect(route(intent(), [quote({ validUntil: PAST })], NOW).ok).toBe(false);
    const disallowed = route(
      intent({ constraints: { venueAllowList: ['other'] } }),
      [quote()],
      NOW,
    );
    expect(disallowed.ok).toBe(false);
  });

  it('insufficient depth when the give cannot be fully allocated', () => {
    const r = route(
      intent(),
      [quote({ give: { asset: USD, amount: '50' } })],
      NOW,
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('insufficient_depth');
  });

  it('min_receive_unmet when the best plan is below the floor', () => {
    const r = route(
      intent({ want: { asset: BTC, minReceive: '9.00000000' } }),
      [quote()],
      NOW,
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('min_receive_unmet');
  });

  it('constraint_violation on a malformed intent amount', () => {
    const r = route(
      intent({ give: { asset: USD, amount: 'abc' } }),
      [quote()],
      NOW,
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('constraint_violation');
  });

  it('respects maxVenues: a split that needs 2 venues fails at maxVenues=1', () => {
    const a = quote({
      quoteId: 'qa',
      venueId: 'va',
      give: { asset: USD, amount: '60' },
      receive: { asset: BTC, amount: '0.00072000' },
    });
    const b = quote({
      quoteId: 'qb',
      venueId: 'vb',
      give: { asset: USD, amount: '60' },
      receive: { asset: BTC, amount: '0.00072000' },
    });
    const r = route(intent({ constraints: { maxVenues: 1 } }), [a, b], NOW);
    expect(r.ok).toBe(false);
  });
});

describe('reference router — determinism & tie-breaking', () => {
  it('is deterministic for identical inputs', () => {
    const quotes = [
      quote({ quoteId: 'qa', venueId: 'va' }),
      quote({ quoteId: 'qb', venueId: 'vb' }),
    ];
    expect(route(intent(), quotes, NOW)).toEqual(route(intent(), quotes, NOW));
  });

  it('breaks rate ties by lower venueId', () => {
    const a = quote({ quoteId: 'qa', venueId: 'vb' });
    const b = quote({ quoteId: 'qb', venueId: 'va' }); // same rate, lower venueId
    const r = route(intent(), [a, b], NOW);
    expect(r.ok && r.plan.legs[0]?.venueId).toBe('va');
  });

  it('breaks single-venue ties by lower quoteId within a venue', () => {
    const first = quote({ quoteId: 'qb', venueId: 'va' });
    const second = quote({ quoteId: 'qa', venueId: 'va' }); // same venue+receipt, lower quoteId
    const r = route(intent(), [first, second], NOW);
    expect(r.ok && r.plan.legs[0]?.quoteRef).toBe('qa');
  });

  it('filters malformed and non-positive quotes out of eligibility', () => {
    expect(
      route(intent(), [quote({ give: { asset: USD, amount: 'abc' } })], NOW).ok,
    ).toBe(false);
    expect(
      route(intent(), [quote({ give: { asset: USD, amount: '0' } })], NOW).ok,
    ).toBe(false);
    expect(
      route(
        intent(),
        [quote({ receive: { asset: BTC, amount: '0.00000000' } })],
        NOW,
      ).ok,
    ).toBe(false);
  });

  it('represents a venue by its deepest bucket in a split', () => {
    // Venue va has a small high-rate bucket and a deep bucket; vb covers the rest.
    const small = quote({
      quoteId: 'qa1',
      venueId: 'va',
      give: { asset: USD, amount: '10' },
      receive: { asset: BTC, amount: '0.00013000' },
    });
    const deep = quote({
      quoteId: 'qa2',
      venueId: 'va',
      give: { asset: USD, amount: '70' },
      receive: { asset: BTC, amount: '0.00084000' },
    });
    const b = quote({
      quoteId: 'qb',
      venueId: 'vb',
      give: { asset: USD, amount: '70' },
      receive: { asset: BTC, amount: '0.00084000' },
    });
    const r = route(intent(), [small, deep, b], NOW);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    // va represented by its deepest bucket qa2 (give 70), not qa1.
    const vaLeg = r.plan.legs.find((l) => l.venueId === 'va');
    expect(vaLeg?.quoteRef).toBe('qa2');
  });
});

describe('createReferenceRouter (Router port adapter)', () => {
  it('returns a plan for a viable intent', () => {
    const router = createReferenceRouter(NOW);
    expect(router.route(intent(), [quote()]).legs).toHaveLength(1);
  });

  it('throws NoViableRouteError when no route exists', () => {
    const router = createReferenceRouter(NOW);
    expect(() => router.route(intent(), [])).toThrow(NoViableRouteError);
  });
});
