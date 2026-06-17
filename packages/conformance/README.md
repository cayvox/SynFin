# @synfin/conformance

The reusable **SQSS conformance harness** (TESTING.md §5). It provides runners
that any `VenueAdapter` or `Router` implementation imports to claim conformance
to the standard.

The runners are framework-agnostic — they throw (via `node:assert`) on the first
violation, so they drop into any test runner.

## Adapter conformance

```ts
import { runAdapterConformance } from '@synfin/conformance';

await runAdapterConformance(adapter, { requests, now });
```

Asserts a `VenueAdapter`'s quotes are spec-valid, **deterministic** for identical
requests, echo the requested size, respect `validUntil`, and never overstate
receipts; plus a fast-check fuzz pass (malformed requests → no crash, only a
typed rejection or a valid quote).

## Router conformance

```ts
import { runRouterConformance } from '@synfin/conformance';
import { route } from '@synfin/router-ref';

runRouterConformance(route); // route(intent, quotes, now) => { ok, plan } | { ok: false }
```

Generates intents + quote sets and asserts the SPEC §4.4 invariants on the
router's output: `checkRoutePlan` passes (conservation, per-leg no-overstatement
vs the referenced quotes, slippage bound, quote linkage, aggregate consistency),
and **monotonicity** — the plan is never worse than the best single-venue
baseline (computed by running the same router per venue).

> The router runner takes a `now`-aware route function because RFC-0001 made
> no-overstatement time-dependent; a bare `Router` port can be adapted by binding
> `now` (see `createReferenceRouter` in `@synfin/router-ref`).

Apache-2.0. Pre-alpha.
