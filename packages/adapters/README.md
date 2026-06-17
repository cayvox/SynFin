# @synfin/adapters

Venue adapters implementing the SQSS `VenueAdapter` port (ADR-0005; SPEC §5).
One adapter wraps one venue, normalizing its native quote semantics into the
standard `Quote` type.

## `MockVenueAdapter`

A **deterministic, config-driven** adapter for development and tests — **not a
real venue**. No hidden state, clock, I/O, or randomness, so identical requests
yield identical quotes (ARCHITECTURE.md §1 invariant #5).

- Configurable supported pairs, each with a convex price-impact curve
  (`grossReceive(g) = rate0 · g · liquidity / (liquidity + g)`), so bucketed
  quotes at different sizes are meaningful for a depth-aware router (SPEC §4.2).
- Optional fee (bps, reflected in `receive`), firmness (`indicative`/`firm`,
  firm quotes carry commitment+signature), source kind, and `validUntil`.
- Receipts are rounded **in the taker's favour** via the `@synfin/spec` decimal
  helper, so they are never overstated (SPEC §3).
- Can return typed rejections (`pair_unsupported`, `insufficient_liquidity`,
  `forceReject`, …) and past `validUntil` values to exercise router/validation
  paths.

```ts
import { MockVenueAdapter } from '@synfin/adapters';

const venue = new MockVenueAdapter({
  venueId: 'mock-a',
  pairs: [{ give: USD, want: BTC, rate0: '0.000016', liquidity: '100000' }],
  feeBps: 10,
});
const quoteOrRejection = await venue.quote(request);
```

Apache-2.0. Pre-alpha: interfaces are unstable until `v1.0.0`.
