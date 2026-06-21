// Type-resolution proof: a downstream TS consumer importing the public types and
// using them. Compiled with moduleResolution bundler AND node16 (see the script).
import { route, type RouteResult } from '@synfin/router-ref';
import { isAtomicRoute } from '@synfin/spec';
import type { SwapIntent, Quote, RoutePlan, AssetId } from '@synfin/spec';

const CC: AssetId = { registry: 'cc::reg', instrumentId: 'CC', decimals: 10 };
const USDCx: AssetId = { registry: 'usdc::reg', instrumentId: 'USDCx', decimals: 6 };
const intent: SwapIntent = {
  intentId: 'demo',
  taker: 'alice::party',
  give: { asset: CC, amount: '250000' },
  want: { asset: USDCx, minReceive: '39000' },
  maxSlippageBps: 50,
  deadline: '2099-01-01T00:00:00Z',
};
const quotes: Quote[] = [];
const r: RouteResult = route(intent, quotes, new Date());
if (r.ok) {
  const plan: RoutePlan = r.plan;
  const atomic: boolean = isAtomicRoute(plan, quotes);
  console.log(plan.aggregateReceive, atomic);
}
