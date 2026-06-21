// No-network smoke for a downstream consumer of the published @synfin packages:
// build a SwapIntent, route over a few mock Quotes, assert a sane RoutePlan.
import { route } from '@synfin/router-ref';
import assert from 'node:assert/strict';

const CC = { registry: 'cc::reg', instrumentId: 'CC', decimals: 10 };
const USDCx = { registry: 'usdc::reg', instrumentId: 'USDCx', decimals: 6 };
const intent = {
  intentId: 'demo-1',
  taker: 'alice::party',
  give: { asset: CC, amount: '250000' },
  want: { asset: USDCx, minReceive: '39000' },
  maxSlippageBps: 50,
  deadline: '2099-01-01T00:00:00Z',
};
const mk = (quoteId, venueId, give, receive) => ({
  quoteId, venueId,
  give: { asset: CC, amount: give },
  receive: { asset: USDCx, amount: receive },
  feeBps: 0, sourceKind: 'AMM', settlementMode: 'atomic-allocation',
  firmness: 'firm', validUntil: '2099-01-01T00:00:00Z',
});
const quotes = [
  mk('q1', 'CantonSwap', '250000', '39800'),
  mk('q2', 'OneSwap', '150000', '24150'),
  mk('q3', 'RFQ desk', '150000', '24100'),
];

const result = route(intent, quotes, new Date('2026-06-21T00:00:00Z'));
assert.equal(result.ok, true, 'route should produce a viable plan');
const { plan } = result;
assert.ok(plan.legs.length >= 1, 'plan has >= 1 leg');
assert.equal(plan.intentRef, 'demo-1');
assert.equal(plan.legs.reduce((s, l) => s + Number(l.give.amount), 0), 250000, 'conservation');
assert.ok(Number(plan.worstCaseReceive) >= Number(intent.want.minReceive), 'worstCaseReceive >= minReceive');
for (const l of plan.legs) assert.ok(l.venueId && l.give && l.receive && l.quoteRef);
console.log('  ESM smoke: PASS (' + plan.legs.map((l) => l.venueId).join(' + ') + ', receive ' + plan.aggregateReceive + ')');
