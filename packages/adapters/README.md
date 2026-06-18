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

## Real venue adapters — `CantonSwapAdapter`, `OneSwapAdapter`

Adapters for two **real** Canton venues. Both are **Mode B (`managed-deposit`)**
(ADR-0009): they settle via the venue's own deposit/detect/execute flow, not a
CIP-0056 atomic allocation — so each declares `settlementMode = 'managed-deposit'`.
This is the **quote layer only**: no settlement, deposit, or funds; the venues'
deposit/execution details (`memo`/`swapAddress`, pool party/reference) are
intentionally **not** placed on the `Quote` (they belong to the deferred
managed-execution path, RFC-0004).

Design (both): an injectable HTTP **`Fetcher`** separates the impure network call
from a **pure, deterministic normalizer** (`normalizeCantonSwapQuote`,
`normalizeOneSwapQuote`). The normalizer treats the venue response as untrusted
input, floors receipts in the taker's favour (SPEC §3), and returns either a
spec-valid `Quote` or a typed `QuoteRejection` — it never throws. This is what
lets the same adapter run live (default `fetchJson`) and against golden fixtures
in tests (`fixtures/`, with provenance) with **no live network call in CI**.

| Venue | Quote mechanism (read-only, fundless) | Firmness | Auth |
| --- | --- | --- | --- |
| CantonSwap | `POST /nswap/quote` → `toAmount`, … (fees embedded) | indicative (TTL) | none |
| OneSwap | `quotes.get` read-only price preview → `outputAmount`, `expiresIn` | indicative | API key (env) |

```ts
import { CantonSwapAdapter, OneSwapAdapter, fetchJson } from '@synfin/adapters';

const cantonswap = new CantonSwapAdapter(); // live, read-only; no key
const oneswap = new OneSwapAdapter({
  baseUrl: process.env.ONESWAP_BASE_URL,
  apiKey: process.env.ONESWAP_API_KEY, // read-only quoting; never logged
});
const quoteOrRejection = await cantonswap.quote(request);
```

Apache-2.0. Pre-alpha: interfaces are unstable until `v1.0.0`.
