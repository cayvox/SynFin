import fc from 'fast-check';
import {
  Decimal,
  checkRoutePlan,
  isAtomicRoute,
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
          settlementMode: 'atomic-allocation',
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
      settlementMode: 'atomic-allocation',
      firmness: 'indicative',
      validUntil: FAR_FUTURE,
    };
    return { intent: baseIntent(giveTotal), quotes: [cover] };
  });

/**
 * Routable scenarios whose single covering venue settles via `managed-deposit`
 * (RFC-0004, SPEC §6): the intent is still satisfiable, but any plan over these
 * quotes references a non-atomic leg and so MUST NOT be treated as atomically
 * settleable.
 */
const managedScenarioArbitrary: fc.Arbitrary<Scenario> = fc
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
      settlementMode: 'managed-deposit',
      firmness: 'indicative',
      validUntil: FAR_FUTURE,
    };
    return { intent: baseIntent(giveTotal), quotes: [cover] };
  });

/**
 * Network-fee scenarios (RFC-0005). 1 to 3 venues, each a single quote covering
 * the whole give, each with an optional give-asset (USD) `networkFee` (0 means no
 * fee). The router must rank these on the net (RFC-0005 §3) and emit a
 * net-consistent plan. Since every venue covers the whole give, a plan must
 * always exist (must-route).
 */
const feeScenarioArbitrary: fc.Arbitrary<Scenario> = fc
  .record({
    giveTotal: fc.integer({ min: 1, max: 100_000 }),
    venues: fc.array(
      fc.record({
        sats: fc.bigInt({ min: 1n, max: 10n ** 11n }),
        fee: fc.integer({ min: 0, max: 1000 }),
      }),
      { minLength: 1, maxLength: 3 },
    ),
  })
  .map(({ giveTotal, venues }): Scenario => {
    const quotes: Quote[] = venues.map((v, vi) => ({
      quoteId: `v${vi}`,
      venueId: `v${vi}`,
      give: { asset: USD, amount: String(giveTotal) },
      receive: { asset: BTC, amount: satsToBtc(v.sats) },
      feeBps: 0,
      sourceKind: 'AMM',
      settlementMode: 'managed-deposit',
      firmness: 'indicative',
      validUntil: FAR_FUTURE,
      ...(v.fee > 0
        ? { networkFee: { asset: USD, amount: String(v.fee) } }
        : {}),
    }));
    return { intent: baseIntent(giveTotal), quotes };
  });

/**
 * The taker net value a router ranks on (RFC-0005 §3): `worstCaseReceiveNet` when
 * present, else the gross `worstCaseReceive`. A fee-free plan omits
 * `worstCaseReceiveNet`, so this reads the gross and is identical to ranking on
 * `worstCaseReceive` (the pre-RFC behavior).
 */
function netWorstOf(plan: RoutePlan): Decimal {
  return (
    Decimal.parse(plan.worstCaseReceiveNet ?? plan.worstCaseReceive) ??
    Decimal.zero()
  );
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
        const fullNet = netWorstOf(full.plan);
        for (const b of baselines) {
          ok(
            fullNet.gte(netWorstOf(b)),
            'net monotonicity: plan net must not be worse than the single-venue baseline net',
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

  // 3. Settlement-mode invariant (RFC-0004, SPEC §6): the atomicity of a plan is
  //    determined solely by its legs' settlement modes. `isAtomicRoute` must be
  //    true exactly when every referenced quote is `atomic-allocation`. In
  //    particular, a route covered by a `managed-deposit` venue must NEVER be
  //    flagged atomic — atomicity is asserted downstream over the quotes, so the
  //    router needs no algorithm change for this to hold.
  fc.assert(
    fc.property(managedScenarioArbitrary, ({ intent, quotes }) => {
      const result = router.route(intent, quotes, now);
      if (result.ok) {
        ok(
          !isAtomicRoute(result.plan, quotes),
          'a route over a managed-deposit venue must not be atomic',
        );
      }
    }),
    { numRuns: runs },
  );
  fc.assert(
    fc.property(routableScenarioArbitrary, ({ intent, quotes }) => {
      const result = router.route(intent, quotes, now);
      if (result.ok) {
        const allAtomic = result.plan.legs.every((leg) => {
          const q = quotes.find((x) => x.quoteId === leg.quoteRef);
          return q?.settlementMode === 'atomic-allocation';
        });
        equal(
          isAtomicRoute(result.plan, quotes),
          allAtomic,
          'isAtomicRoute must be true exactly when all legs are atomic-allocation',
        );
      }
    }),
    { numRuns: runs },
  );

  // 4. Network-fee invariants (RFC-0005): a fee scenario must route, satisfy
  //    checkRoutePlan (which now includes net-consistency), and hold net
  //    monotonicity vs each single-venue baseline.
  fc.assert(
    fc.property(feeScenarioArbitrary, ({ intent, quotes }) => {
      const full = router.route(intent, quotes, now);
      // Each venue covers the whole give, so a plan must exist (must-route).
      ok(
        full.ok,
        'fee scenario: each venue covers the give, so a plan must exist',
      );
      if (!full.ok) return;
      ok(
        checkRoutePlan(full.plan, intent, quotes, now).ok,
        'fee plan must satisfy checkRoutePlan, including net-consistency',
      );
      equal(full.plan.intentRef, intent.intentId, 'plan.intentRef must match');

      const venueIds = [...new Set(quotes.map((q) => q.venueId))];
      const fullNet = netWorstOf(full.plan);
      for (const v of venueIds) {
        const b = router.route(
          intent,
          quotes.filter((q) => q.venueId === v),
          now,
        );
        if (b.ok) {
          ok(
            fullNet.gte(netWorstOf(b.plan)),
            'net monotonicity: plan net must not be worse than a single-venue baseline net',
          );
        }
      }
    }),
    { numRuns: runs },
  );

  // 5. Deterministic net-ranking flip (RFC-0005 §3), not fuzz. give = 1000 USD.
  //    X has a higher gross but a give-asset fee that lowers its net below Y's.
  //    Ranking on gross alone would pick X (0.00120000 > 0.00118000), but X's net
  //    is below Y's net, so a conformant net-ranking router must not return a plan
  //    whose net is below Y's net (Y has no fee, so Y net == Y gross). The check
  //    is router-agnostic: it asserts only the net bound, not a winning venueId.
  {
    const intent = baseIntent(1000);
    const x: Quote = {
      quoteId: 'qx',
      venueId: 'vx',
      give: { asset: USD, amount: '1000' },
      receive: { asset: BTC, amount: '0.00120000' },
      feeBps: 0,
      sourceKind: 'AMM',
      settlementMode: 'managed-deposit',
      firmness: 'indicative',
      validUntil: FAR_FUTURE,
      networkFee: { asset: USD, amount: '50' },
    };
    const y: Quote = {
      quoteId: 'qy',
      venueId: 'vy',
      give: { asset: USD, amount: '1000' },
      receive: { asset: BTC, amount: '0.00118000' },
      feeBps: 0,
      sourceKind: 'AMM',
      settlementMode: 'managed-deposit',
      firmness: 'indicative',
      validUntil: FAR_FUTURE,
    };
    const r = router.route(intent, [x, y], now);
    ok(r.ok, 'net-flip: a plan must exist');
    if (r.ok) {
      ok(
        netWorstOf(r.plan).gte(Decimal.parse('0.00118000') ?? Decimal.zero()),
        'net-flip: the chosen plan net must be at least Y net (0.00118000)',
      );
    }
  }

  // 6. Deterministic floor on the gross buy asset (RFC-0005 §4), not fuzz. The
  //    minReceive floor is checked on the delivered gross (worstCaseReceive), not
  //    on the net. Venue Z has gross 0.00120000 and a give-asset fee that drops
  //    its net to about 0.00109, below minReceive 0.00115000 (itself below the
  //    gross). A plan MUST still exist, because the floor is on the gross.
  {
    const intent: SwapIntent = {
      intentId: 'conformance-floor-intent',
      taker: 'taker::conf',
      give: { asset: USD, amount: '1000' },
      want: { asset: BTC, minReceive: '0.00115000' },
      maxSlippageBps: HUGE_SLIPPAGE,
      deadline: FAR_FUTURE,
    };
    const z: Quote = {
      quoteId: 'qz',
      venueId: 'vz',
      give: { asset: USD, amount: '1000' },
      receive: { asset: BTC, amount: '0.00120000' },
      feeBps: 0,
      sourceKind: 'AMM',
      settlementMode: 'managed-deposit',
      firmness: 'indicative',
      validUntil: FAR_FUTURE,
      networkFee: { asset: USD, amount: '100' },
    };
    const r = router.route(intent, [z], now);
    ok(
      r.ok,
      'floor-on-gross: minReceive is checked on the gross worstCaseReceive, so a plan must exist',
    );
  }
}
