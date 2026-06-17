import fc from 'fast-check';
import {
  Decimal,
  checkRoutePlan,
  type AssetId,
  type Quote,
  type RoutePlan,
  type Router,
  type SwapIntent,
} from '@synfin/spec';
import { equal, ok } from './assert.js';

/**
 * Reusable **router conformance** runner (TESTING.md §2, §5; SPEC §4.4, §4.5).
 * Given any {@link Router}, it generates intents + quote sets and asserts the
 * §4.4/§4.5 invariants on the output:
 *
 *  - the result is a typed {@link import('@synfin/spec').RouteResult} (the runner
 *    calls `route`; the port never throws for control flow);
 *  - when `ok`, the plan passes `checkRoutePlan` (conservation, per-leg
 *    no-overstatement vs the referenced quotes, slippage bound, quote linkage,
 *    aggregate consistency) and `plan.intentRef` matches the intent;
 *  - **monotonicity** — the plan is never worse (by worst-case receive) than the
 *    best single-venue baseline, computed by running the same router on each
 *    venue's quotes alone; and if any single venue suffices, a plan must exist;
 *  - **must-route (RFC-0002)** — given a quote set that demonstrably satisfies the
 *    intent (a single venue covering the whole give, unexpired, assets match,
 *    within slippage), the router MUST return `{ ok: true, … }`.
 */

const USD: AssetId = { registry: 'reg::usd', instrumentId: 'USD', decimals: 2 };
const BTC: AssetId = { registry: 'reg::btc', instrumentId: 'BTC', decimals: 8 };
const CONFORMANCE_NOW = new Date('2030-01-01T00:00:00Z');
const FAR_FUTURE = '2999-01-01T00:00:00Z';
const TINY_FLOOR = '0.00000001';
const HUGE_SLIPPAGE = 1_000_000;

/** Format an integer number of satoshis as an 8-decimal BTC string. */
function satsToBtc(sats: bigint): string {
  const s = sats.toString().padStart(9, '0');
  return `${s.slice(0, -8)}.${s.slice(-8)}`;
}

interface Scenario {
  readonly intent: SwapIntent;
  readonly quotes: readonly Quote[];
}

function baseIntent(giveTotal: number): SwapIntent {
  return {
    intentId: 'conformance-intent',
    taker: 'taker::conf',
    give: { asset: USD, amount: String(giveTotal) },
    want: { asset: BTC, minReceive: TINY_FLOOR },
    maxSlippageBps: HUGE_SLIPPAGE,
    deadline: FAR_FUTURE,
  };
}

/** General scenarios: arbitrary venues/buckets — may or may not be routable. */
const scenarioArbitrary: fc.Arbitrary<Scenario> = fc
  .record({
    giveTotal: fc.integer({ min: 1, max: 100_000 }),
    venues: fc.array(
      fc.array(
        fc.record({
          give: fc.integer({ min: 1, max: 150_000 }),
          sats: fc.bigInt({ min: 1n, max: 10n ** 11n }),
        }),
        { minLength: 1, maxLength: 3 },
      ),
      { minLength: 1, maxLength: 4 },
    ),
  })
  .map(({ giveTotal, venues }): Scenario => {
    const quotes: Quote[] = [];
    venues.forEach((buckets, vi) => {
      buckets.forEach((b, bi) => {
        quotes.push({
          quoteId: `v${vi}-b${bi}`,
          venueId: `v${vi}`,
          give: { asset: USD, amount: String(b.give) },
          receive: { asset: BTC, amount: satsToBtc(b.sats) },
          feeBps: 0,
          sourceKind: 'AMM',
          firmness: 'indicative',
          validUntil: FAR_FUTURE,
        });
      });
    });
    return { intent: baseIntent(giveTotal), quotes };
  });

/** Routable scenarios: always include a single venue covering the whole give. */
const routableScenarioArbitrary: fc.Arbitrary<Scenario> = fc
  .record({
    giveTotal: fc.integer({ min: 1, max: 100_000 }),
    coverSats: fc.bigInt({ min: 1n, max: 10n ** 11n }),
  })
  .map(({ giveTotal, coverSats }): Scenario => {
    const cover: Quote = {
      quoteId: 'cover',
      venueId: 'v-cover',
      give: { asset: USD, amount: String(giveTotal) },
      receive: { asset: BTC, amount: satsToBtc(coverSats) },
      feeBps: 0,
      sourceKind: 'AMM',
      firmness: 'indicative',
      validUntil: FAR_FUTURE,
    };
    return { intent: baseIntent(giveTotal), quotes: [cover] };
  });

function worstOf(plan: RoutePlan): Decimal {
  return Decimal.parse(plan.worstCaseReceive) ?? Decimal.zero();
}

export interface RouterConformanceOptions {
  /** Number of generated scenarios per property (default 200). */
  readonly runs?: number;
}

export function runRouterConformance(
  router: Router,
  options: RouterConformanceOptions = {},
): void {
  const runs = options.runs ?? 200;
  const now = CONFORMANCE_NOW;

  // 1. General invariants: validity + monotonicity.
  fc.assert(
    fc.property(scenarioArbitrary, ({ intent, quotes }) => {
      const full = router.route(intent, quotes, now);

      const venueIds = [...new Set(quotes.map((q) => q.venueId))];
      const baselines: RoutePlan[] = [];
      for (const v of venueIds) {
        const r = router.route(
          intent,
          quotes.filter((q) => q.venueId === v),
          now,
        );
        if (r.ok) baselines.push(r.plan);
      }

      if (baselines.length > 0) {
        ok(
          full.ok,
          'monotonicity: a viable single-venue baseline exists, so a plan must too',
        );
      }

      if (full.ok) {
        ok(
          checkRoutePlan(full.plan, intent, quotes, now).ok,
          'router output must satisfy checkRoutePlan',
        );
        equal(
          full.plan.intentRef,
          intent.intentId,
          'plan.intentRef must match',
        );
        const fullWorst = worstOf(full.plan);
        for (const b of baselines) {
          ok(
            fullWorst.gte(worstOf(b)),
            'monotonicity: plan must not be worse than the single-venue baseline',
          );
        }
      }
    }),
    { numRuns: runs },
  );

  // 2. Positive must-route invariant (RFC-0002): a demonstrably satisfiable
  //    intent MUST route.
  fc.assert(
    fc.property(routableScenarioArbitrary, ({ intent, quotes }) => {
      const result = router.route(intent, quotes, now);
      ok(
        result.ok,
        'must-route: a quote set that satisfies the intent must yield a plan',
      );
    }),
    { numRuns: runs },
  );
}
