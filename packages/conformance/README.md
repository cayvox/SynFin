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
import { referenceRouter } from '@synfin/router-ref';

runRouterConformance(referenceRouter); // any Router: route(intent, quotes, now) => RouteResult
```

Generates intents + quote sets and asserts the SPEC §4.4/§4.5 invariants on the
router's output: `checkRoutePlan` passes (conservation, per-leg no-overstatement
vs the referenced quotes, slippage bound, quote linkage, aggregate consistency),
**monotonicity** (never worse than the best single-venue baseline, computed by
running the same router per venue), and the positive **must-route** invariant —
a quote set that demonstrably satisfies the intent MUST yield a plan (RFC-0002).

> The runner takes a `Router` directly. Per RFC-0002 the port is
> `route(intent, quotes, now): RouteResult` — `now` is per-call and no-route is a
> typed value, so the runner needs no adapter.

Apache-2.0. Pre-alpha.
