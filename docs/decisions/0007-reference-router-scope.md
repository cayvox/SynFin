# ADR‑0007: Reference router scope & competitive grounding

- **Status:** Accepted
- **Date:** 2026‑06‑17
- **Deciders:** Cayvox Labs (steward)
- **Spec impact:** none (implementation of an existing port; no wire/normative change)

## Context

`@synfin/spec` (v0.2.0) froze the `Router` port and the `RoutePlan` constraints
(SPEC §4.4, RFC‑0001). We now ship the first **open** implementation of that port,
`@synfin/router-ref`. The competitive study (ADR‑0006: 1inch Pathfinder, Jupiter
Metis/Iris, Titan) and Canton's constraints (no readable reserves — ARCHITECTURE.md §1
invariant #2; private contracts; same‑synchronizer atomicity) bound what the *open
reference* router should do versus what belongs to the separate, proprietary optimizer
(ADR‑0004, GOVERNANCE.md §3).

The reference router must be a **correct, deterministic, depth‑aware baseline** — not a
numerical optimizer. It is the neutral yardstick conformance is measured against.

## Decision

1. **Single‑hop, multi‑venue split.** The reference router splits one `give` asset into one
   `want` asset across multiple venues in a single hop. **Multi‑hop / intermediate‑token
   routing is deferred to a future RFC.** On Canton reserves are not readable (invariant #2),
   so each additional hop would require further RFQ round‑trips — a combinatorial blow‑up in
   quote cost and latency. Incumbents (1inch, Jupiter) also introduced multi‑hop only as a
   later/V2 capability, not in the first cut.
2. **Depth‑aware via size buckets (SPEC §4.2).** The router reasons about price impact from
   quotes gathered at multiple sizes (buckets) and the **net rate** each bucket implies, never
   by reading pool reserves. Larger buckets that price worse are naturally deprioritized.
3. **Optimize net `receive`.** Fees are already reflected in `Quote.receive` (SPEC §4.3); the
   router ranks and allocates by net receipt, not nominal output (the ParaSwap/Odos principle
   from ADR‑0006).
4. **Deterministic greedy / marginal‑net allocation.** The reference router allocates the
   `give` greedily to the best net‑rate venue buckets, one leg per venue, splitting the
   remainder onto the next‑best venue (see *Allocation* below). It is pure and deterministic;
   ties break by a stable documented rule. **Advanced numerical optimization
   (golden‑section/Brent‑style search, full convex‑hull marginal curves, cross‑venue global
   optima) is out of scope and belongs to the closed optimizer** (ADR‑0004). Because the
   optimizer implements the *same* `Router` port, it is a drop‑in replacement.
5. **Atomic all‑or‑nothing.** The router produces a plan for atomic settlement; we do **not**
   implement partial‑fill‑and‑return (a deliberate divergence from 1inch's Classic flow). If a
   viable plan cannot meet `minReceive`/`maxSlippageBps`, the router returns a typed
   **no‑viable‑route** result rather than a degraded or constraint‑violating plan. Our
   settlement guarantee (one Daml transaction, invariant #3) is stronger and simpler.
6. **Self‑validation.** Every plan the router returns MUST pass
   `checkRoutePlan(plan, intent, quotes, now)` from `@synfin/spec`. The router never emits a
   plan that violates the §4.4 constraints.
7. **Meta‑aggregation later.** The `VenueAdapter` port is generic enough to wrap another
   aggregator (meta‑aggregation, Titan‑style) without core changes. Not built now.

### Allocation (reference baseline, plain terms)

- Keep only quotes whose assets match the intent and that are unexpired at the supplied `now`
  (reuse `@synfin/spec` predicates; do not reimplement validation), and whose venue is allowed
  by `venueAllowList`.
- Rank the eligible quotes by **net rate** (`receive / give`, fees included), compared exactly
  by cross‑multiplication (no floating point). Tie‑break: higher net rate first, then **lower
  `venueId`** (lexicographic), then **larger `give`** (more capacity), then **lower `quoteId`**.
- Walk the ranking, **one leg per venue** (a venue's best‑rate bucket is used; its other
  buckets are skipped to avoid double‑counting the same liquidity). Allocate
  `min(quote.give, remaining)` to each venue; the final (marginal) leg may be a partial fill,
  whose receipt is the quote's receipt scaled down proportionally and rounded **in the taker's
  favour** (never above the referenced quote). Stop at `maxVenues` legs.
- If the full `give` cannot be allocated within `maxVenues`/the allow‑list, or the resulting
  receipt is below `minReceive`, return **no viable route**.

### Why this is "depth‑aware" but still a baseline

Splitting across the best net‑rate buckets of multiple venues *is* the price‑impact‑aware
behaviour buckets exist for: a single venue's larger bucket prices worse and loses to a better
bucket elsewhere, so the router spreads. A full per‑venue marginal **curve** (convex‑hull of all
buckets, multi‑leg per venue) would extract more, and is exactly the kind of numerical work we
deliberately leave to the optimizer (Decision 4).

## Consequences

- Positive: a neutral, correct, deterministic open baseline that any optimizer must beat on the
  same port; conformance has a concrete subject.
- Negative / trade‑offs: the baseline leaves receipt on the table versus a full marginal‑curve
  optimizer (intended — that is the optimizer's job). Single‑hop only for now.
- Implementation note (no spec/wire change): proportional sub‑bucket receipts require exact
  decimal division, added as `Decimal.divide` in `@synfin/spec`'s value‑math helper (rounding
  centralised per SPEC §3). This is an additive library helper; the wire types, validators,
  predicates and the normative specification are unchanged.
- Follow‑ups: multi‑hop RFC; richer marginal‑curve depth model in the optimizer;
  meta‑aggregation adapter.

## Alternatives considered

- **Full marginal‑curve (convex‑hull) global optimizer in the open package.** Rejected:
  crosses the open/closed boundary (ADR‑0004) — heavy optimization is the proprietary
  optimizer's role; the open package stays a clear baseline.
- **Multi‑hop now.** Rejected: combinatorial RFQ cost/latency under no‑readable‑reserves; defer
  to an RFC (matches incumbent V2 timing).
- **Partial‑fill‑and‑return (1inch Classic style).** Rejected: incompatible with our atomic
  all‑or‑nothing settlement (invariant #3); we return no‑viable‑route instead.
