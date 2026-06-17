# @synfin/router-ref

The **open reference** implementation of the SQSS `Router` port (ADR-0005,
[ADR-0007](../../docs/decisions/0007-reference-router-scope.md)).

> This is a **correct, deterministic, depth-aware baseline — not the optimizer.**
> Heavy numerical optimization (full marginal-curve depth models, global optima)
> is out of scope and lives behind the *same* `Router` port in the separate,
> closed optimizer (ADR-0004). Because they share the port, the optimizer is a
> drop-in replacement; the system runs fully on this open baseline alone
> (open/closed boundary, GOVERNANCE.md §3).

## What it does (SPEC §4.2–§4.4, ADR-0007)

- Single-hop, multi-venue split (multi-hop is a future RFC).
- Considers only quotes whose assets match the intent, that are unexpired at the
  supplied `now`, and whose venue is allowed by `venueAllowList`.
- Ranks eligible quotes by **net `receive`** rate (fees already reflected in
  `Quote.receive`), compared exactly by cross-multiplication (no floating point).
- Allocates greedily, **one leg per venue**, splitting the remainder onto the
  next-best venue; the final leg may be a partial fill whose receipt is rounded
  **in the taker's favour** (never above the referenced quote).
- **Self-validates** every plan with `checkRoutePlan(plan, intent, quotes, now)`;
  if `minReceive`/`maxSlippageBps` cannot be met it returns a typed
  **no-viable-route** result instead of a constraint-violating plan.

### Tie-breaking (deterministic)

Higher net rate first; then lower `venueId`; then larger `give` (more capacity);
then lower `quoteId`. Identical inputs (including `now`) always yield identical
output — no clock, I/O, or randomness.

## Usage

```ts
import { route, createReferenceRouter } from '@synfin/router-ref';

// Primary API — typed result:
const result = route(intent, quotes, new Date());
if (result.ok) {
  // result.plan is guaranteed to pass checkRoutePlan
} else {
  // result.reason: 'no_eligible_quotes' | 'insufficient_depth' | 'min_receive_unmet' | ...
}

// Router-port adapter (binds `now`); throws NoViableRouteError on no route:
const router = createReferenceRouter(new Date());
const plan = router.route(intent, quotes);
```

Apache-2.0. Pre-alpha: interfaces are unstable until `v1.0.0`.
