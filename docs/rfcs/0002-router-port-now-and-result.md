# RFC‑0002: Fix the `Router` port — per‑call `now` and a typed `RouteResult`

- **Status:** Accepted
- **Date:** 2026‑06‑17
- **Author / Steward:** Cayvox Labs (steward)
- **Targets spec version:** SQSS `0.3.0` (from `0.2.0`)
- **Review window:** The GOVERNANCE.md §5 minimum 14‑day review window is **waived** under the
  current single‑steward governance fallback (GOVERNANCE.md §4), recorded here explicitly. It
  applies only while the project has a single steward.
- **Related:** [RFC‑0001](0001-assetid-minreceive-quote-linkage.md) (time‑dependent
  no‑overstatement), [ADR‑0005](../decisions/0005-ports-and-adapters.md) (ports & adapters),
  [ADR‑0007](../decisions/0007-reference-router-scope.md) (reference router). SPEC §2, §4.4,
  §4.5 (new), §10.

## Summary

RFC‑0001 made no‑overstatement **time‑dependent** (a leg's referenced quote must be unexpired
at plan‑construction time). But the `Router` port frozen in Task 001 was
`route(intent, quotes): RoutePlan` — it carried no time and could not express "no viable
route." Task 002b worked around this in `@synfin/router-ref` by exposing a richer internal
`route(intent, quotes, now)` and wrapping it in a port adapter that (a) bound `now` at
construction time and (b) **threw** on the no‑route case.

Both are smells. A `now` bound to a long‑lived router instance goes stale (quotes silently treated
as live after they expire); and "no viable route" is a **normal** outcome, not an exception. The
port is foundational — every implementation, including third parties and the proprietary
optimizer, inherits it — so we fix the port itself now, while it is cheap.

## Decision

The `Router` port becomes:

```ts
route(intent: SwapIntent, quotes: readonly Quote[], now: Date): RouteResult
```

- **`now` is a per‑call parameter** — no construction‑time binding, no internal clock. The router
  stays pure and deterministic (ARCHITECTURE.md §1 invariant #5: identical inputs *including
  `now`* yield identical output) while being able to enforce the time‑dependent no‑overstatement
  rule (RFC‑0001; SPEC §4.4).
- **`RouteResult` is a typed discriminated union**, never an exception:

  ```ts
  type RouteResult =
    | { readonly ok: true;  readonly plan: RoutePlan }
    | { readonly ok: false; readonly reason: NoViableRouteReason };
  ```

  No throwing for control flow. A returned `plan` MUST satisfy the §4.4 constraints (the router
  self‑validates with `checkRoutePlan`).
- **`NoViableRouteReason`** is a small, documented union — part of the port contract:

  ```ts
  type NoViableRouteReason =
    | 'no-eligible-quotes'       // no supplied quote matched the intent's assets / was unexpired / allowed
    | 'min-receive-unreachable'  // no plan reaches the taker's minReceive floor (incl. insufficient depth)
    | 'slippage-exceeded';       // the best plan would exceed the intent's maxSlippageBps
  ```

This removes the `createReferenceRouter(now)` construction‑time binding and the
`NoViableRouteError` throwing path from `@synfin/router-ref` (RFC‑0002 supersedes that part of
ADR‑0007's implementation note). The **allocation algorithm is unchanged** — only the
return/signature shape changes.

## Compatibility impact

Breaking change to the `Router` port (added `now` parameter; return type changed from
`RoutePlan` to `RouteResult`). Under pre‑1.0 SemVer this is a MINOR bump of the spec to
**`0.3.0`**. `@synfin/spec` and `@synfin/router-ref`/`@synfin/conformance` bump accordingly.

This is a **TS interface / type change only**. `RouteResult` and `NoViableRouteReason` do **not**
cross the wire (they are not CIP‑0056 messages and have no JSON Schema), so there is **no JSON
Schema, generated‑type, validator, or wire‑format change**. The wire types (`SwapIntent`,
`Quote`, `RoutePlan`, …) are untouched.

## Conformance‑suite impact

- The router conformance runner takes a `Router` (now‑aware) directly and asserts results.
- A **positive "must‑route" invariant** is added: given a quote set that demonstrably satisfies
  the intent (sufficient depth, unexpired, assets match, within slippage), a conformant router
  MUST return `{ ok: true, … }` — it MUST NOT return a no‑route. This closes the gap noted in
  Task 002b, where a router that *never* routes was uncatchable.
- All existing invariants remain: conservation, no‑overstatement vs the referenced quotes,
  slippage bound, monotonicity, and plan self‑consistency; plus the negative tests proving the
  harness rejects non‑conformant routers.

> Note: the reference router introduces zero extra slippage (it commits to the quoted receipts,
> `slippageBps = 0`), so it never returns `slippage-exceeded`. That reason is part of the port
> contract for routers that model price slippage; the reference router emits only
> `no-eligible-quotes` and `min-receive-unreachable`.

## Consequences

- Positive: the port is honest — `now` cannot go stale, no‑route is a value not an exception, and
  the contract is uniform for all implementations (reference, third‑party, optimizer).
- Negative / trade‑offs: a breaking change to a foundational interface; acceptable pre‑1.0 and
  far cheaper now than after adoption.
- Open/closed boundary: preserved — the change is to the open port and open reference code; no
  proprietary dependency (GOVERNANCE.md §3).

## Alternatives considered

- **Keep `now` bound at construction.** Rejected: a long‑lived router would treat expired quotes
  as live; correctness requires the evaluation time per call.
- **Throw on no‑route.** Rejected: no‑route is a normal business outcome; exceptions for control
  flow are error‑prone and easy to forget to catch.
- **Leave the port as `RoutePlan` and validate downstream.** Rejected: the port could not encode
  the time the no‑overstatement rule needs, and would force every caller to re‑validate to learn
  it failed.
