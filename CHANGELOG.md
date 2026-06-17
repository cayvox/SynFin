# Changelog

All notable changes to this project are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html). Packages and the specification
are versioned independently; each release records the spec version it targets.

## [Unreleased]

### Added
- **`daml/synfin-settlement` — on-ledger atomic multi-leg settlement (ADR-0008).** Composes an
  N-leg route into a SINGLE atomic Daml transaction on the **real CIP-0056** token-standard
  allocation interfaces (`hyperledger-labs/splice@canton-3.4`, depended on as DARs — not
  stubs): all-or-nothing, single-use allocations, expiry, idempotency by `intentId`, and
  on-ledger enforcement of `minReceive`/`maxSlippageBps`/`deadline`/conservation (SPEC §6).
  Full Daml Script matrix green against Amulet (happy path 2-venue/4-leg, all-or-nothing,
  abort/expiry, executor-only authorization, no-double-spend, bound enforcement; TESTING.md §3).
  Real CIP-0056 DARs vendored in `daml/dars/` (provenance + regenerate script). Daml CI job
  activated (JDK 17 + pinned SDK `3.3.0-snapshot.20250507.0`). ADR-0008 records the design and
  a known per-venue-privacy limitation (SPEC §7) as a candidate RFC.
- Foundational documentation set: README, ARCHITECTURE, SPECIFICATION (SQSS draft),
  ENGINEERING, TESTING, THREAT_MODEL, GOVERNANCE, SECURITY, CONTRIBUTING, CODE_OF_CONDUCT,
  GLOSSARY, ROADMAP, CLAUDE.
- Initial Architecture Decision Records (ADR 0001–0005).
- GitHub issue and pull‑request templates.
- **Monorepo scaffold:** pnpm workspaces, strict TypeScript base config (ESM, Node ≥ 20),
  type‑aware ESLint + Prettier, and a blocking CI workflow (install → build → gen‑sync →
  lint+format → typecheck → tests+coverage); Daml/conformance/e2e jobs stubbed.
- **`@synfin/spec` (0.1.0):** JSON Schemas as the source of truth for the SQSS wire types
  (`AssetId`, `SwapIntent`, `IntentConstraints`, `QuoteRequest`, `Quote`, `RoutePlan`,
  `RouteLeg`, and shared primitives — SPEC §4); TypeScript types generated from them with a
  CI drift check; Ajv‑based runtime validators (`validateX → Result`, SPEC §4/§8); an exact
  BigInt decimal helper with taker‑favorable rounding (SPEC §3); cross‑field constraint
  predicates (conservation, worst‑case floor, slippage bound, venue limits, aggregate
  consistency — SPEC §4.4); and the three ports `VenueAdapter`, `Router`, `Settlement`
  (interfaces only — ADR‑0005). Unit + property tests (fast‑check) at 100% coverage on the
  decimal and validation paths.
- ADR‑0006: competitive design study (1inch, Jupiter, CoW, ParaSwap/Odos) — Accepted.

- **`@synfin/router-ref` (0.1.0):** open reference implementation of the `Router` port
  ([ADR‑0007](docs/decisions/0007-reference-router-scope.md)) — a correct, deterministic,
  depth‑aware baseline (not the optimizer). Single‑hop multi‑venue split; ranks by net
  `receive` rate; returns the better of a best‑single‑venue fill and a greedy split;
  self‑validates with `checkRoutePlan`; returns a typed no‑viable‑route result rather than a
  constraint‑violating plan. `createReferenceRouter(now)` adapts it to the `Router` port.
- **`@synfin/adapters` (0.1.0):** `MockVenueAdapter` — a deterministic, config‑driven
  `VenueAdapter` for development/tests (convex price‑impact curve, fees, firmness, expiry,
  rejections), with receipts rounded in the taker's favour. Not a real venue.
- **`@synfin/conformance` (0.1.0):** reusable conformance harness (TESTING.md §5) — adapter
  and router runners that any implementation imports to claim conformance. Run in CI against
  `MockVenueAdapter` and `@synfin/router-ref`.
- **`@synfin/spec`:** added `Decimal.divide` (exact value‑math helper for proportional
  receipts; rounding stays centralized per SPEC §3). Additive only — no wire/normative/spec
  change.
- ADR‑0007: reference router scope & competitive grounding — Accepted.

### Changed
- **SQSS bumped to `0.3.0`, driven by [RFC‑0002](docs/rfcs/0002-router-port-now-and-result.md)** (Accepted; 14‑day review window waived under single‑steward governance, GOVERNANCE.md §5): the `Router` port becomes `route(intent, quotes, now): RouteResult` (SPEC §4.5, §10).
  - **Per‑call `now`** — the evaluation time is a parameter, not bound to a long‑lived instance or an internal clock; keeps routing pure and able to enforce the time‑dependent no‑overstatement rule.
  - **Typed `RouteResult`** — `{ ok: true, plan } | { ok: false, reason: NoViableRouteReason }`; no throwing for control flow. `NoViableRouteReason` = `'no-eligible-quotes' | 'min-receive-unreachable' | 'slippage-exceeded'`.
  - **`@synfin/spec` → `0.3.0`:** added `Router`/`RouteResult`/`NoViableRouteReason` (TS interface types only — no wire/JSON‑Schema/validator/generated‑type change; `gen:check` confirms).
  - **`@synfin/router-ref` → `0.2.0`:** implements the corrected port directly; **removed** `createReferenceRouter(now)` binding and the `NoViableRouteError` throwing path; exports `referenceRouter: Router` and `route`. Allocation algorithm unchanged.
  - **`@synfin/conformance` → `0.2.0`:** the router runner takes a `Router` directly and adds the positive **must‑route** invariant (a demonstrably satisfiable intent MUST route), closing the Task‑002b gap where a never‑routing router was uncatchable.
- **SQSS bumped to `0.2.0`, driven by [RFC‑0001](docs/rfcs/0001-assetid-minreceive-quote-linkage.md)** (Accepted; 14‑day review window waived under single‑steward governance, GOVERNANCE.md §5):
  - **AssetId (Decision A):** normatively `{ registry, instrumentId, decimals }`. The Task‑001 working field `id` is renamed to `instrumentId`. `decimals` is the off‑ledger echo of the CIP‑0056 token‑metadata precision (registry remains the source of truth); amounts inconsistent with `decimals` are rejected (SPEC §3, Appendix A).
  - **minReceive (Decision B):** `SwapIntent.want.minReceive` MUST be strictly > 0; non‑positive floors are rejected (SPEC §4.1).
  - **Quote↔leg linkage + no‑overstatement (Decision C):** `Quote` gains a required `quoteId`; each `RouteLeg.quoteRef` MUST resolve to a supplied quote; each leg's `receive` MUST NOT exceed its referenced quote's `receive`, which MUST be unexpired and asset‑matched. The prior `aggregateReceive ≤ Σ leg receipts` invariant is kept. `checkRoutePlan`/`checkNoOverstatement`/`checkQuoteLinkage` now take the source quote set (and `now`) (SPEC §4.3, §4.4).
- **`@synfin/spec` → `0.2.0`** implementing RFC‑0001: schemas, generated types, validators, and constraint predicates updated; new edge‑case tests; coverage gates held (100% on validation/decimal paths).

### Notes
- Pre‑alpha. All interfaces are unstable until `v1.0.0`. Spec changes follow the RFC process
  in GOVERNANCE.md.
- Multi‑hop routing remains a FUTURE spec extension (ADR‑0006) requiring its own RFC.

[Unreleased]: https://example.com/synfin/commits/main
