import { describe, expect, it } from 'vitest';
import {
  Decimal,
  checkRoutePlan,
  isAtomicRoute,
  type AssetId,
  type Quote,
  type SwapIntent,
} from '@synfin/spec';
import { referenceRouter, route } from '../src/index.js';

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
    settlementMode: 'atomic-allocation',
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

describe('reference router — no viable route (typed reasons, no throwing)', () => {
  it("returns 'no-eligible-quotes' (empty / asset mismatch / expired / disallowed)", () => {
    const empty = route(intent(), [], NOW);
    expect(empty.ok).toBe(false);
    if (!empty.ok) expect(empty.reason).toBe('no-eligible-quotes');

    expect(
      route(intent(), [quote({ receive: { asset: EUR, amount: '1.00' } })], NOW)
        .ok,
    ).toBe(false);
    const expired = route(intent(), [quote({ validUntil: PAST })], NOW);
    expect(expired.ok).toBe(false);
    if (!expired.ok) expect(expired.reason).toBe('no-eligible-quotes');
    const disallowed = route(
      intent({ constraints: { venueAllowList: ['other'] } }),
      [quote()],
      NOW,
    );
    expect(disallowed.ok).toBe(false);
    if (!disallowed.ok) expect(disallowed.reason).toBe('no-eligible-quotes');
  });

  it("returns 'min-receive-unreachable' when the give cannot be fully allocated", () => {
    const r = route(
      intent(),
      [quote({ give: { asset: USD, amount: '50' } })],
      NOW,
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('min-receive-unreachable');
  });

  it("returns 'min-receive-unreachable' when the best plan is below the floor", () => {
    const r = route(
      intent({ want: { asset: BTC, minReceive: '9.00000000' } }),
      [quote()],
      NOW,
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('min-receive-unreachable');
  });

  it('never returns slippage-exceeded: a tight maxSlippageBps=0 still routes', () => {
    // The reference router adds zero slippage, so a 0 bound is always satisfied.
    const r = route(intent({ maxSlippageBps: 0 }), [quote()], NOW);
    expect(r.ok).toBe(true);
  });

  it('returns a typed result (does not throw) on a malformed intent amount', () => {
    const r = route(
      intent({ give: { asset: USD, amount: 'abc' } }),
      [quote()],
      NOW,
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('min-receive-unreachable');
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

describe('referenceRouter (Router port value, RFC-0002)', () => {
  it('routes via the per-call port signature route(intent, quotes, now)', () => {
    const r = referenceRouter.route(intent(), [quote()], NOW);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.plan.legs).toHaveLength(1);
  });

  it('returns a typed no-route result (never throws)', () => {
    const r = referenceRouter.route(intent(), [], NOW);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('no-eligible-quotes');
  });
});

describe('reference router — settlement mode (RFC-0004, SPEC §6)', () => {
  // The reference router selects purely on economics; settlement mode does not
  // change its output. Atomicity is asserted downstream via `isAtomicRoute`, so
  // these tests prove that a plan built over managed-deposit liquidity is never
  // mistaken for an atomically-settleable route — without the router needing a
  // mode-specific code path.
  it('still routes a managed-deposit venue, but the plan is not atomic', () => {
    const quotes = [quote({ settlementMode: 'managed-deposit' })];
    const r = route(intent(), quotes, NOW);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(isAtomicRoute(r.plan, quotes)).toBe(false);
  });

  it('flags an all-atomic-allocation route as atomic', () => {
    const quotes = [quote({ settlementMode: 'atomic-allocation' })];
    const r = route(intent(), quotes, NOW);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(isAtomicRoute(r.plan, quotes)).toBe(true);
  });

  it('treats a mixed route (one managed leg) as non-atomic', () => {
    const intentBig = intent({ give: { asset: USD, amount: '100' } });
    // Two venues each cover part; one settles managed-deposit.
    const quotes = [
      quote({
        quoteId: 'qa',
        venueId: 'va',
        give: { asset: USD, amount: '60' },
        receive: { asset: BTC, amount: '0.00072000' },
        settlementMode: 'atomic-allocation',
      }),
      quote({
        quoteId: 'qb',
        venueId: 'vb',
        give: { asset: USD, amount: '40' },
        receive: { asset: BTC, amount: '0.00048000' },
        settlementMode: 'managed-deposit',
      }),
    ];
    const r = route(intentBig, quotes, NOW);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    // Whatever legs the router picks, if any referenced quote is managed-deposit
    // the route must not be atomic.
    const usesManaged = r.plan.legs.some(
      (l) =>
        quotes.find((q) => q.quoteId === l.quoteRef)?.settlementMode ===
        'managed-deposit',
    );
    if (usesManaged) expect(isAtomicRoute(r.plan, quotes)).toBe(false);
  });
});
