# @synfin/spec

[![npm](https://img.shields.io/npm/v/@synfin/spec/next)](https://www.npmjs.com/package/@synfin/spec) [![provenance](https://img.shields.io/badge/provenance-attested-brightgreen)](https://www.npmjs.com/package/@synfin/spec) [![license](https://img.shields.io/npm/l/@synfin/spec)](https://github.com/cayvox/SynFin/blob/main/LICENSE)

> **Pre-alpha.** The API is unstable and may change without notice. Not for production use. Published under the `next` dist-tag.

The single source of truth for the Synfin Quote and Swap-Intent Standard (SQSS). It ships the off-ledger wire types, runtime validators, exact-decimal helpers, the cross-field constraint predicates, and the three ports (VenueAdapter, Router, Settlement). It contains no business logic: only the contracts the rest of Synfin depends on.

## Install

```sh
npm install @synfin/spec@next
```

## Usage

```js
import { Decimal, validateSwapIntent } from '@synfin/spec';

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

console.log(validateSwapIntent(intent).ok); // true

// exact decimal math, no floating point drift
console.log(Decimal.parse('250000').add(Decimal.parse('1500')).toString()); // '251500'
```

It also exports the SQSS types (`SwapIntent`, `Quote`, `RoutePlan`, `AssetId`), the per-field validators, and the cross-field constraint predicates (including `isAtomicRoute`).

## Links

- [Specification](https://github.com/cayvox/SynFin/blob/main/docs/spec/SPECIFICATION.md)
- [Repository](https://github.com/cayvox/SynFin)

Synfin is ESM only and targets Node 20 or newer.

## License

Apache-2.0
