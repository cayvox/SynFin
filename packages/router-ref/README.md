# @synfin/router-ref

[![npm](https://img.shields.io/npm/v/@synfin/router-ref)](https://www.npmjs.com/package/@synfin/router-ref) [![provenance](https://img.shields.io/badge/provenance-attested-brightgreen)](https://www.npmjs.com/package/@synfin/router-ref) [![license](https://img.shields.io/npm/l/@synfin/router-ref)](https://github.com/cayvox/SynFin/blob/main/LICENSE)

> **Pre-alpha.** The API is unstable and may change without notice. Not for production use.

The open reference implementation of the SQSS Router port: a correct, deterministic, depth-aware baseline that selects and splits quotes into a `RoutePlan`. It is the reference, not the optimizer. Given the same intent, quotes, and time it always returns the same result.

## Install

```sh
npm install @synfin/router-ref
```

## Usage

```js
import { route } from '@synfin/router-ref';

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

const q = (quoteId, venueId, give, receive) => ({
  quoteId, venueId,
  give: { asset: CC, amount: give },
  receive: { asset: USDCx, amount: receive },
  feeBps: 0, sourceKind: 'AMM', settlementMode: 'atomic-allocation',
  firmness: 'firm', validUntil: '2099-01-01T00:00:00Z',
});

const result = route(intent, [q('q1', 'CantonSwap', '250000', '39800'), q('q2', 'OneSwap', '150000', '24150')], new Date());

if (result.ok) {
  // splits across venues to maximize net receive
  console.log(result.plan.legs, result.plan.aggregateReceive);
} else {
  // a typed reason, for example 'min-receive-unreachable' or 'no-eligible-quotes'
  console.log('no route:', result.reason);
}
```

`route(intent, quotes, now)` returns `{ ok: true, plan }` or `{ ok: false, reason }`. `referenceRouter` is the same logic wrapped as a `Router` port.

## Links

- [Specification](https://github.com/cayvox/SynFin/blob/main/docs/spec/SPECIFICATION.md)
- [Repository](https://github.com/cayvox/SynFin)

Synfin is ESM only and targets Node 20 or newer.

## License

Apache-2.0
