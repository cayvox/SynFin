# @synfin/adapters

[![npm](https://img.shields.io/npm/v/@synfin/adapters)](https://www.npmjs.com/package/@synfin/adapters) [![provenance](https://img.shields.io/badge/provenance-attested-brightgreen)](https://www.npmjs.com/package/@synfin/adapters) [![license](https://img.shields.io/npm/l/@synfin/adapters)](https://github.com/cayvox/SynFin/blob/main/LICENSE)

> **Pre-alpha.** The API is unstable and may change without notice. Not for production use.

Venue adapters for Synfin. Each adapter wraps one Canton venue and normalizes its native quote into the standard SQSS `Quote` type, so the router can compare every venue on equal terms. Ships `CantonSwapAdapter` and `OneSwapAdapter` for live venues, plus `MockVenueAdapter` for tests and local development.

## Install

```sh
npm install @synfin/adapters
```

## Usage

```js
import { MockVenueAdapter } from '@synfin/adapters';

const CC = { registry: 'cc::reg', instrumentId: 'CC', decimals: 10 };
const USDCx = { registry: 'usdc::reg', instrumentId: 'USDCx', decimals: 6 };

const venue = new MockVenueAdapter({
  venueId: 'MockSwap',
  pairs: [{ give: CC, want: USDCx, rate0: '0.16', liquidity: '1000000' }],
});

const quote = await venue.quote({
  intentRef: 'demo-1',
  give: { asset: CC, amount: '250000' },
  want: { asset: USDCx },
  deadline: '2099-01-01T00:00:00Z',
  nonce: 'n1',
});
// quote is a normalized SQSS Quote (or a typed QuoteRejection)
console.log(quote);
```

The live adapters (`CantonSwapAdapter`, `OneSwapAdapter`) take an injectable HTTP fetcher and the same `quote(request)` shape.

## Links

- [Specification](https://github.com/cayvox/SynFin/blob/main/docs/spec/SPECIFICATION.md)
- [Repository](https://github.com/cayvox/SynFin)

Synfin is ESM only and targets Node 20 or newer.

## License

Apache-2.0
