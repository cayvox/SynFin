# RFC‑0004: Settlement‑mode capability — declaring atomic vs managed‑deposit venues

- **Status:** Accepted
- **Date:** 2026‑06‑18
- **Author / Steward:** Cayvox Labs (steward)
- **Targets spec version:** SQSS `0.5.0`
- **Review window:** GOVERNANCE.md §5 minimum 14‑day window **waived** under the single‑steward
  governance fallback (GOVERNANCE.md §4).
- **Related:** [ADR‑0009](../decisions/0009-venue-integration-dual-architecture.md) (the dual venue
  architecture this capability surfaces); [ADR‑0005](../decisions/0005-ports-and-adapters.md) (the
  `VenueAdapter` port the capability is added to); [RFC‑0002](0002-router-port-now-and-result.md)
  (the `Router` contract that consumes quotes); SPEC §4.3, §4.4, §5, §6.

## Summary

[ADR‑0009](../decisions/0009-venue-integration-dual-architecture.md) established that real Canton
venues fall into two integration shapes:

- **Mode A — `atomic-allocation`:** the venue settles via a CIP‑0056 allocation, so its leg can be
  one input to the single atomic, all‑or‑nothing settlement transaction (SPEC §6, RFC‑0003).
- **Mode B — `managed-deposit`:** the venue settles out of band against a managed deposit/balance,
  so its leg **cannot** be co‑settled inside that one Daml transaction.

Until now SQSS implicitly assumed every venue was Mode A. That assumption is unsafe: a router or
coordinator that treats a Mode‑B leg as atomically settleable would either build a settlement that
cannot execute or, worse, imply an all‑or‑nothing guarantee the route cannot keep. This RFC makes
the distinction **explicit and machine‑checkable** by adding a `settlementMode` capability to the
Venue contract, carried on every `Quote`, with a single normative rule:

> **Atomic settlement (SPEC §6) is valid if and only if every leg of the route is
> `atomic-allocation`.**

This RFC adds **only the capability and the rule.** It does **not** define how a `managed-deposit`
venue is actually executed (no `ManagedExecution` interface, no Mode‑B settlement path) and ships
**no real venue adapters** — those are deferred to follow‑up tasks. The point of this change is to
put the contract in place so that work can build on a spec that already knows the difference.

## Motivation

- **Invariant #3 (atomicity).** "Multi‑leg settlement is one Daml transaction, all‑or‑nothing.
  Never introduce protocol‑level partial fills." A Mode‑B leg silently mixed into an atomic plan
  breaks this — the only safe behaviour is to *know*, before settlement, that a leg cannot be
  co‑settled atomically and refuse to treat the route as atomic.
- **Invariant #2 (quote/RFQ model).** The router operates on `Quote`s, not on a global view of
  venues. So the capability has to travel **on the quote**, or the router cannot see it without an
  out‑of‑band venue lookup that the architecture does not provide.
- **Zero‑assumption rule.** ADR‑0009 named the two modes but the wire types and the spec did not
  encode them. Encoding the distinction now (before real adapters exist) prevents a later silent
  assumption that "every quote is atomic."

## Decision

### 1. `settlementMode` on the Venue and on every `Quote`

A Venue declares a settlement‑mode capability with values:

```
settlementMode = "atomic-allocation" | "managed-deposit"
```

- It is a property of the **venue**, not of a request: a conformant venue MUST NOT vary it per
  quote (SPEC §5).
- Every `Quote` the venue issues MUST carry that same `settlementMode` (SPEC §4.3). It is carried on
  the quote — alongside `sourceKind` — specifically so a `Router` operating on `Quote[]` (§4.5,
  RFC‑0002) can determine each leg's mode without a separate venue lookup.
- In `@synfin/spec`, `settlementMode` is added to the `Quote` JSON Schema (the single source of
  truth) and therefore to the generated `Quote` type; the `VenueAdapter` port gains a
  `readonly settlementMode` field, and `SettlementMode` is exported as `Quote['settlementMode']` so
  the port and the wire type cannot drift.

### 2. The all‑atomic‑allocation rule (normative)

Atomic settlement (SPEC §6) is valid **if and only if every leg's referenced quote is
`atomic-allocation`.** A route containing any `managed-deposit` leg is a *valid plan* but is **not**
atomically settleable; it MUST NOT be submitted for the single‑transaction settlement of §6, and a
coordinator MUST reject (never silently partial‑settle) a mixed‑mode route. This is added to
SPEC §4.4 (atomic‑settleability) and §6 (the precondition on the settlement transaction).

### 3. An enforceable predicate

`@synfin/spec` adds two pure functions over `(plan, quotes)`:

- `isAtomicRoute(plan, quotes) → boolean` — `true` iff every leg resolves to an
  `atomic-allocation` quote (a missing/unresolvable quote ⇒ `false`).
- `checkAtomicallySettleable(plan, quotes) → Result<RoutePlan>` — the `Result`‑returning form that
  reports the offending leg paths (error code `not_atomically_settleable`).

These are **deliberately separate** from `checkRoutePlan` (RFC‑0001/§4.4 economic validity). A
`managed-deposit` route is an economically valid plan — it is just not atomically settleable. Mixing
the two concerns would force callers that only care about economics to reason about settlement mode,
and vice‑versa. The atomicity check is asserted **downstream** of routing, over the quotes.

### 4. What is intentionally NOT decided here

- **No `ManagedExecution` interface and no Mode‑B settlement path.** How a `managed-deposit` venue
  is actually executed (deposit/withdraw lifecycle, partial‑fill semantics outside the atomic
  transaction, custody) is **out of scope** and deferred to a future RFC. This RFC only lets the
  system *recognise* a Mode‑B leg and refuse to treat it as atomic.
- **No real adapters.** No CantonSwap/OneSwap (or any live‑network) adapter is added. The reference
  `MockVenueAdapter` gains a configurable `settlementMode` (default `atomic-allocation`) so both
  modes can be exercised in tests.

## Reference‑implementation impact

- **`@synfin/spec`** — `settlementMode` added to `quote.schema.json` (required) → regenerated
  `Quote` type; `VenueAdapter.settlementMode` + exported `SettlementMode`; `isAtomicRoute` /
  `checkAtomicallySettleable` predicates; validators reject a missing/unknown mode (schema `enum`).
- **`@synfin/adapters`** — `MockVenueAdapter` declares `settlementMode` (configurable; default
  `atomic-allocation`) and stamps it on every quote.
- **`@synfin/router-ref`** — **no algorithm change.** The reference router selects purely on
  economics; atomicity is asserted downstream via `isAtomicRoute`. Tests prove that a route over a
  `managed-deposit` (or mixed) quote set is never flagged atomic, and an all‑Mode‑A route is.
- **`@synfin/conformance`** — adapter conformance now asserts the adapter declares a valid mode and
  that every issued quote echoes it; router conformance adds an invariant that `isAtomicRoute` is
  `true` exactly when all legs are `atomic-allocation`, and that a managed‑covered route is never
  atomic.
- **`daml/synfin-settlement`** — **unchanged.** The on‑ledger library already settles only
  CIP‑0056 allocations (Mode A); this RFC adds an off‑ledger capability and a normative precondition,
  not a new on‑ledger path.

## Compatibility

`settlementMode` is a **new required field** on `Quote`, so this is a wire change and drives the
SQSS spec bump to `0.5.0` and a minor bump of `@synfin/spec`. Per SPEC §9, consumers ignore unknown
optional fields, but this field is required: a quote that omits it is non‑conformant and MUST be
rejected (a producer that has not been updated will fail validation rather than be silently treated
as atomic — the safe failure direction).

## Conformance‑test impact

Covered by the suites above: `validateQuote` rejects a missing/unknown `settlementMode`;
`isAtomicRoute`/`checkAtomicallySettleable` are unit‑tested for all‑Mode‑A (true) and any‑Mode‑B
(false, with the offending leg path); adapter + router conformance enforce the capability and the
all‑atomic‑allocation rule.

## Follow‑up plan

1. **Mode‑B execution RFC** — define the `managed-deposit` execution path (`ManagedExecution`
   interface, deposit lifecycle, how a managed leg composes with — or is sequenced around — an
   atomic core). Not started.
2. **Real adapters** — implement and conformance‑test concrete venue adapters that declare their
   true `settlementMode`. Not started.
