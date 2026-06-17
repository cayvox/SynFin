# ADR‑0001: Monorepo and tooling

- **Status:** Accepted
- **Date:** 2026‑06‑17
- **Deciders:** Cayvox Labs (steward)
- **Spec impact:** none

## Context

Synfin has tightly coupled artifacts that must version and test together: a normative schema, venue adapters, a reference router, an SDK, an on‑ledger Daml library, a reference UI, and a Phase‑0 tool. They share types and a conformance suite.

## Decision

Use a single **pnpm‑workspaces monorepo**. TypeScript (strict, ESM, Node >= 20) for off‑ledger code; **Daml** for on‑ledger code with a pinned SDK in `daml.yaml`. JSON Schema is the source of truth for off‑ledger wire types (TS types generated from it); OpenAPI describes venue HTTP quote APIs. ESLint + Prettier and `daml fmt` enforced in CI. Packages and the spec are versioned independently with SemVer.

## Consequences

- Positive: atomic cross‑package changes, one conformance suite, shared types, simpler CI.
- Negative: monorepo tooling overhead; must keep package boundaries disciplined.
- Follow‑ups: scaffold `packages/`, `daml/`, `apps/`, `tools/` during M1.

## Alternatives considered

- Polyrepo — rejected: cross‑artifact changes and shared types become painful.
- JS bundler monorepos (nx/turbo) — viable; pnpm workspaces chosen for minimal surface; may revisit if build orchestration needs grow.
