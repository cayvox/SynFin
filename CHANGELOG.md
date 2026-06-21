# Changelog

All notable changes to this project are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html). Packages and the specification
are versioned independently; each release records the spec version it targets.

## [Unreleased]

### Added
- **Phase-0 price-divergence monitor (`tools/price-monitor`, `@synfin/price-monitor`).** A
  read-only tool that collects cross-venue quotes (CantonSwap, OneSwap) for the same pairs/sizes
  over time and quantifies the **cross-venue spread (bps)** — the evidence the Phase-0 decision gate
  rests on. **No funds, no settlement, no side effects** (reuses `@synfin/adapters`' read-only quote
  path; injectable fetcher). Observations are appended to a dependency-light JSONL store
  (timestamp, source `live`/`fixture`, venue, pair, size, receive, rate, fee, rejection); each row
  is labelled live vs fixture and untrusted responses are normalized (a non-quoting venue records a
  typed rejection, never a fabricated number). Spread is computed with the spec's exact-decimal
  helper (best vs worst per venue's most recent quote). Ships a `collect`/`report` CLI (cron- or
  `--rounds/--interval`-driven; `--fixtures` for offline), a Markdown + CSV report, and a committed
  deterministic **sample dataset + report** (`sample/`, from golden fixtures) showing a meaningful
  spread. Deterministic fixture tests; **no live calls in CI**. (`tools/*` added to the pnpm
  workspace.)
- **Demo 2 — atomic, per-leg-private split settlement (`synfin settle-demo`).** A narrated,
  end-to-end demonstration of the hardest piece: atomic, all-or-nothing, per-leg-confidential split
  **settlement** (SPEC §6, §7; ADR-0008; RFC-0003), run against our **own CIP-0056 test venue
  (Amulet)** on a local in-memory ledger. It **reuses the `daml/synfin-settlement` library
  unchanged** (the model proven by the Task-003.6 matrix) — no new settlement logic. A new demo
  Daml Script `Synfin.Demo.AtomicSettlement` (in `synfin-settlement-test`, reusing the existing
  test setup helpers) verifies, in one run: a 2-venue/4-leg split settles in **one transaction**
  (all-or-nothing), on-ledger bound enforcement (conservation / minReceive / slippage / deadline),
  single-use allocations, **and per-leg privacy** (venue A cannot see venue B's leg; taker +
  executor see the aggregate). The `@synfin/cli` `settle-demo` command drives this script via the
  Daml toolchain and prints a clean, **honestly-labelled** result — explicitly *our own Mode-A test
  venue on a local ledger / no funds / no mainnet*, **not** a claim of atomic settlement against
  live third-party venues (ADR-0009: today's accessible venues are Mode B). It fails gracefully if
  the Daml SDK is absent (no fabricated result). The CLI holds **no settlement logic** — it
  orchestrates the Daml library/script. This completes the **two-demo proof of work** (Demo 1 =
  quote aggregation vs real venues; Demo 2 = atomic settlement vs our CIP-0056 test venue).
- **Real venue quote adapters — `CantonSwapAdapter` + `OneSwapAdapter`** (`@synfin/adapters`;
  ADR-0009; RFC-0004). Both are **Mode B (`managed-deposit`)** venues — **quote layer only**, no
  settlement/deposit/funds. Each separates an injectable HTTP `Fetcher` from a **pure, deterministic
  normalizer** (`normalizeCantonSwapQuote` / `normalizeOneSwapQuote`) that turns the venue's real
  response into a spec-valid `Quote` (taker-favorable rounding, `settlementMode='managed-deposit'`,
  indicative firmness, typed `QuoteRejection`s, deposit details intentionally dropped — they belong
  to the deferred managed-execution path). Verified read-only/fundless from live docs:
  CantonSwap `POST /nswap/quote` (no auth); OneSwap `quotes.get` (read-only price preview, API key
  via env). Tested against **committed golden fixtures** (`@synfin/adapters/fixtures`, sanitized,
  with provenance) plus fuzz, and run through the `@synfin/conformance` adapter suite — **no live
  network calls in CI**.
- **`@synfin/cli` — Demo 1: cross-venue quote aggregation.** `synfin quote <FROM> <TO> <AMOUNT>`
  gathers live read-only quotes from both venues, runs `@synfin/router-ref`, and prints each venue's
  normalized quote, the chosen route, and the **edge vs the best single venue**. **Live + golden
  fallback:** on any failure (unreachable / unconfigured / rate-limited) it falls back to the
  committed fixtures and labels the output **RECORDED SAMPLE DATA (NOT live)**. Read-only and
  fundless — it never deposits or settles. OneSwap's API key is read from `ONESWAP_API_KEY` (see
  `.env.example`); never logged or committed.

### Changed
- **SQSS bumped to `0.5.0`, driven by [RFC-0004](docs/rfcs/0004-settlement-mode-capability.md):** a
  Venue now declares a `settlementMode` capability — `atomic-allocation` | `managed-deposit` — that
  is **required** on every `Quote` (SPEC §4.3) and on the Venue interface (§5). Atomic settlement
  (§6) is normatively valid **only when every leg is `atomic-allocation`**; a route with any
  `managed-deposit` leg is a valid plan but MUST NOT be treated as atomic or submitted for the
  single-transaction settlement (§4.4). `@synfin/spec` is bumped to `0.4.0` for the wire change.
  This adds **only the capability and the rule** — it does **not** define a Mode-B (`ManagedExecution`)
  settlement path and ships **no real venue adapters** (both deferred).

### Added
- **RFC-0004 — settlement-mode capability.** Surfaces the ADR-0009 dual architecture in the
  contract: `settlementMode` on the `Quote` schema (regenerated type) and the `VenueAdapter` port
  (`SettlementMode = Quote['settlementMode']`, so port and wire cannot drift); pure predicates
  `isAtomicRoute(plan, quotes)` and `checkAtomicallySettleable(plan, quotes)` (kept separate from
  `checkRoutePlan` — a managed route is economically valid, just not atomically settleable);
  `validateQuote` rejects a missing/unknown mode. `MockVenueAdapter` gains a configurable
  `settlementMode` (default `atomic-allocation`). The reference router needs **no algorithm change**
  — atomicity is asserted downstream via `isAtomicRoute`; tests prove a managed/mixed route is never
  flagged atomic and an all-Mode-A route is. Conformance now checks adapters declare a valid mode and
  echo it on quotes, and that `isAtomicRoute` holds exactly when all legs are `atomic-allocation`.
  `daml/synfin-settlement` unchanged (it already settles only Mode-A allocations).
- **ADR-0009 — venue integration dual architecture (research + decision).** Confirmed from real
  venue docs/testnet (read-only, no funds) that today's accessible Canton retail DEXs are
  **deposit-based** (Mode B): **CantonSwap** (`POST /nswap/quote`; settle via `swapAddress`+`memo` /
  `magicAddress`) and **OneSwap** (intent → pool party + transfer reference → deposit/detect/execute;
  constant-product AMM, CC/USDCx, beta); CompassSwap is in limited preview; Cantex quotes + executes
  via its own intent flow with no external CIP-0056 allocation interface. None are atomic-split
  (Mode A) today. Decision (maintainer): **keep BOTH** — the CIP-0056 atomic split (Task 003.6,
  unchanged) for Mode A counterparties, plus a **managed deposit path** for Mode B venues, behind one
  `VenueAdapter`. ADR-0009 designs both, proposes a `settlementMode` capability (SPEC §5 edit flagged
  as a follow-up RFC, not applied), states routing implications honestly (Mode B legs are not
  co-settled atomically), and sets the Task-005 adapter plan. No production code/spec changed.

### Changed
- **SQSS bumped to `0.4.0`, driven by [RFC-0003](docs/rfcs/0003-privacy-model.md):** the
  settlement library `daml/synfin-settlement` is refactored from the co-signed `OTCTrade`-style
  pattern to the **per-leg-authorization + executor-only-coordinator** model — each leg is
  co-signed only by its sender+receiver (`LegAuth`); the `SwapSettlement` coordinator is signed by
  **executor + taker only** and settles by exercising each `LegAuth` in one atomic transaction.
  This delivers **per-leg confidentiality** (a venue is a stakeholder of only its own leg and never
  sees another venue's leg or the aggregate) while retaining every economic/atomicity guarantee
  (deadline, conservation, minReceive, slippage, single-use, idempotency, all-or-nothing). New
  `testPerLegVisibility` Daml Script proves it (and fails if aggregate visibility regresses); the
  full prior matrix stays green. **SPEC §7** is scoped to this model and declares the co-signed
  pattern **non-conformant** for multi-venue routing, distinguishing MEV immunity from per-leg
  confidentiality. ADR-0008 updated; superseded Task-003.5 spike removed.

### Added
- **RFC-0003 — privacy model (spike).** Established with experiments against the real CIP-0056
  interfaces + Amulet (`spikes/privacy-model`, all `daml test` green) that **per-leg settlement
  confidentiality is achievable**: each leg is authorized only by its own sender+receiver
  (`LegAuth`) and executed atomically by an executor-only coordinator — no aggregate co-sign, so a
  venue never sees another venue's leg or the route. Separates the properties Synfin provides
  (quote-time privacy + MEV immunity, held in all models; per-leg confidentiality via the
  recommended model). Resolves the ADR-0008 limitation (cross-linked); proposes honest SPEC §7
  edits (→ 0.4.0, applied in a follow-up) and recommends the production library adopt the model.
  No production code changed in this spike.
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
- Multi‑hop routing remains a FUTURE spec extension requiring its own RFC.

[Unreleased]: https://example.com/synfin/commits/main
