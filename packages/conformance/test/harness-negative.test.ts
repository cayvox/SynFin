import { describe, expect, it } from 'vitest';
import type {
  AssetId,
  Quote,
  QuoteRejection,
  QuoteRequest,
  RoutePlan,
  Router,
  SwapIntent,
  VenueAdapter,
} from '@synfin/spec';
import { runAdapterConformance, runRouterConformance } from '../src/index.js';

const USD: AssetId = { registry: 'reg::usd', instrumentId: 'USD', decimals: 2 };
const BTC: AssetId = { registry: 'reg::btc', instrumentId: 'BTC', decimals: 8 };
const now = new Date('2030-01-01T00:00:00Z');

const req: QuoteRequest = {
  intentRef: 'i',
  give: { asset: USD, amount: '100' },
  want: { asset: BTC },
  deadline: '2999-01-01T00:00:00Z',
  nonce: 'n1',
};

/** The harness must REJECT non-conformant subjects — this proves it has teeth. */
describe('harness catches non-conformant adapters', () => {
  it('rejects a non-deterministic adapter', async () => {
    let n = 0;
    const flaky: VenueAdapter = {
      venueId: 'flaky',
      quote(): Promise<Quote> {
        n += 1;
        return Promise.resolve({
          quoteId: `q${n}`, // changes between identical calls
          venueId: 'flaky',
          give: { asset: USD, amount: '100' },
          receive: { asset: BTC, amount: '0.00100000' },
          feeBps: 0,
          sourceKind: 'AMM',
          firmness: 'indicative',
          validUntil: '2999-01-01T00:00:00Z',
        });
      },
    };
    await expect(
      runAdapterConformance(flaky, { requests: [req], now }),
    ).rejects.toThrow(/deterministic/);
  });

  it('rejects an adapter whose quote is not spec-valid', async () => {
    const bad: VenueAdapter = {
      venueId: 'bad',
      quote(): Promise<Quote> {
        return Promise.resolve({
          quoteId: 'q1',
          venueId: 'bad',
          give: { asset: USD, amount: '100' },
          receive: { asset: USD, amount: '0.00100000' }, // wrong receive asset
          feeBps: 0,
          sourceKind: 'AMM',
          firmness: 'indicative',
          validUntil: '2999-01-01T00:00:00Z',
        });
      },
    };
    await expect(
      runAdapterConformance(bad, { requests: [req], now, fuzzRuns: 1 }),
    ).rejects.toThrow();
  });

  it('rejects an adapter rejection that carries the wrong venueId', async () => {
    const bad: VenueAdapter = {
      venueId: 'bad',
      quote(): Promise<QuoteRejection> {
        return Promise.resolve({ venueId: 'someone-else', code: 'nope' });
      },
    };
    await expect(
      runAdapterConformance(bad, { requests: [req], now, fuzzRuns: 1 }),
    ).rejects.toThrow();
  });
});

describe('harness catches non-conformant routers', () => {
  it('rejects a router whose plan fails checkRoutePlan', () => {
    // Always returns a plan referencing a non-existent quote -> linkage fails.
    const badRouter: Router = {
      route(intent: SwapIntent) {
        const plan: RoutePlan = {
          intentRef: intent.intentId,
          legs: [
            {
              venueId: 'ghost',
              give: { asset: USD, amount: intent.give.amount },
              receive: { asset: BTC, amount: '999.00000000' },
              quoteRef: 'does-not-exist',
            },
          ],
          aggregateReceive: '999.00000000',
          worstCaseReceive: '999.00000000',
          slippageBps: 0,
        };
        return { ok: true, plan };
      },
    };
    expect(() => runRouterConformance(badRouter, { runs: 5 })).toThrow();
  });

  it('rejects a router that never routes (now caught by the must-route invariant)', () => {
    const neverRoutes: Router = {
      route: () => ({ ok: false, reason: 'no-eligible-quotes' }),
    };
    expect(() => runRouterConformance(neverRoutes, { runs: 25 })).toThrow();
  });
});
