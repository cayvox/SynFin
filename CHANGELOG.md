# Changelog

All notable changes to this project are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html). Packages and the specification
are versioned independently; each release records the spec version it targets.

## [Unreleased]

### Added
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

### Notes
- Pre‑alpha. All interfaces are unstable until `v1.0.0`. Spec changes follow the RFC process
  in GOVERNANCE.md.
- `@synfin/spec` carries the instrument's `decimals` on `AssetId` so amounts can be
  validated off‑ledger without global state (ARCHITECTURE.md §1 #2); this is a modeling
  decision pending confirmation. Multi‑hop routing remains a FUTURE spec extension
  (ADR‑0006) requiring its own RFC.

[Unreleased]: https://example.com/synfin/commits/main
