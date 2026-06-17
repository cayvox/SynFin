import fc from 'fast-check';
import {
  Decimal,
  checkRoutePlan,
  type AssetId,
  type Quote,
  type RoutePlan,
  type SwapIntent,
} from '@synfin/spec';
import { equal, ok } from './assert.js';

/**
 * Reusable **router conformance** runner (TESTING.md §2, §5; SPEC §4.4). Given
 * any router (as a `now`-aware route function), it generates intents + quote
 * sets and asserts the §4.4 invariants on the output:
 *
 *  - the plan passes `checkRoutePlan` (conservation, per-leg no-overstatement vs
 *    the referenced quotes, slippage bound, quote linkage, aggregate
 *    consistency);
 *  - `plan.intentRef` matches the intent;
 *  - **monotonicity** — the plan is never worse (by worst-case receive) than the
 *    best single-venue baseline, computed by running the same router on each
 *    venue's quotes alone; and if any single venue suffices, a plan must exist.
 *
 * The function takes a `now`-aware route function because RFC-0001 made
 * no-overstatement time-dependent; a bare `Router` port implementation can be
 * adapted to this shape by binding `now`.
 */
export type ConformanceRouteResult =
  | { readonly ok: true; readonly plan: RoutePlan }
  | { readonly ok: false };

export type ConformanceRouteFn = (
  intent: SwapIntent,
  quotes: readonly Quote[],
  now: Date,
) => ConformanceRouteResult;

const USD: AssetId = { registry: 'reg::usd', instrumentId: 'USD', decimals: 2 };
const BTC: AssetId = { registry: 'reg::btc', instrumentId: 'BTC', decimals: 8 };
const CONFORMANCE_NOW = new Date('2030-01-01T00:00:00Z');
const FAR_FUTURE = '2999-01-01T00:00:00Z';

/** Format an integer number of satoshis as an 8-decimal BTC string. */
function satsToBtc(sats: bigint): string {
  const s = sats.toString().padStart(9, '0');
  return `${s.slice(0, -8)}.${s.slice(-8)}`;
}

interface Scenario {
  readonly intent: SwapIntent;
  readonly quotes: readonly Quote[];
  readonly now: Date;
}

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
    const intent: SwapIntent = {
      intentId: 'conformance-intent',
      taker: 'taker::conf',
      give: { asset: USD, amount: String(giveTotal) },
      want: { asset: BTC, minReceive: '0.00000001' },
      maxSlippageBps: 100_000,
      deadline: FAR_FUTURE,
    };
    return { intent, quotes, now: CONFORMANCE_NOW };
  });

function worstOf(plan: RoutePlan): Decimal {
  return Decimal.parse(plan.worstCaseReceive) ?? Decimal.zero();
}

export interface RouterConformanceOptions {
  /** Number of generated scenarios (default 200). */
  readonly runs?: number;
}

export function runRouterConformance(
  routeFn: ConformanceRouteFn,
  options: RouterConformanceOptions = {},
): void {
  fc.assert(
    fc.property(scenarioArbitrary, ({ intent, quotes, now }) => {
      const full = routeFn(intent, quotes, now);

      // Best single-venue baseline, computed via the same router per venue.
      const venueIds = [...new Set(quotes.map((q) => q.venueId))];
      const baselines: RoutePlan[] = [];
      for (const v of venueIds) {
        const r = routeFn(
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
        const checked = checkRoutePlan(full.plan, intent, quotes, now);
        ok(checked.ok, 'router output must satisfy checkRoutePlan');
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
    { numRuns: options.runs ?? 200 },
  );
}
