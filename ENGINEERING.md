# Engineering Standards

These standards make Synfin safe for institutions to depend on. They are enforced in CI and in review. "We'll fix it later" is not a plan.

## 1. Languages & tooling

- **TypeScript** (strict mode, `"strict": true`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`). Target Node >= 20. ESM.
- **Daml** for on‑ledger code, pinned SDK version in `daml.yaml`.
- **pnpm** workspaces monorepo. Lockfile committed and required.
- **Lint/format:** ESLint + Prettier for TS; `daml fmt` for Daml. Formatting is not a review topic — CI enforces it.
- **Typecheck and lint are blocking** in CI.

## 2. Code style & design principles

- Favor pure functions and explicit data flow; isolate side effects at the edges (ports).
- Small, single‑responsibility modules; dependencies point inward (hexagonal — see ARCHITECTURE.md).
- No implicit `any`. Validate all external data at the boundary (schema + runtime checks); types alone are not validation.
- Money/amounts: use exact decimal handling (no floats for value math). Define and test rounding direction explicitly (never overstate taker receipts).
- Errors are typed and meaningful; never swallow errors or fall back in a way that changes economic outcome.
- Public APIs are documented with TSDoc; the spec is the source of truth for wire semantics.

## 3. Commits, branches, reviews

- **Conventional Commits** (`feat`, `fix`, `docs`, `refactor`, `test`, `chore`, `spec`). Drives changelog + SemVer.
- **Trunk‑based**, short‑lived branches. **No direct pushes to `main`** — everything via PR (agents included).
- **DCO sign‑off** (`git commit -s`) on every commit.
- Review: ≥ 1 maintainer approval + green CI. Spec‑affecting changes require an accepted RFC (GOVERNANCE.md §5). High‑sensitivity changes (Daml settlement, allocation handling) require a maintainer with ledger expertise.

## 4. Definition of Done

A change is Done only when all hold:

- [ ] Implements a documented spec section or an accepted ADR/RFC (no undocumented behaviour).
- [ ] Tests added/updated; coverage gates met (see TESTING.md); settlement‑critical paths have Daml Script tests.
- [ ] Lint, format, typecheck, unit + property tests, Daml tests, and conformance suite pass in CI.
- [ ] Public API documented (TSDoc) and `CHANGELOG.md` updated.
- [ ] No secrets, no PII/intent leakage in logs, no new unvetted dependency.
- [ ] Open/closed boundary preserved; neutrality respected.
- [ ] Backward compatibility considered; breaking changes flagged and versioned.

## 5. Dependencies & supply chain

- Add dependencies sparingly and deliberately; each new dependency is justified in the PR. Prefer the standard library and small, audited packages.
- **Pin versions**; commit lockfiles. Automated update PRs (e.g., Renovate) are reviewed like any change.
- **Provenance & integrity:** signed git tags for releases; generate an **SBOM** at release; enable npm provenance on publish.
- No postinstall scripts from untrusted packages; review transitive additions.

## 6. Secrets handling (strict)

- **No secrets in the repository, ever.** Only `.env.example` with placeholder keys.
- Runtime secrets come from the environment / a secrets manager, never hard‑coded.
- **npm publish doctrine:** publish tokens are provided directly in the terminal at publish time and scrubbed immediately afterward; they are never written to disk in the repo, never echoed, never committed. Automated agents must never read, print, or persist tokens.
- Logs must never contain secrets, tokens, private keys, or a taker's full intent/route.

## 7. Releases & versioning

- **Semantic Versioning** for every package and for the spec, versioned independently.
- Use a changeset‑style flow: each user‑facing change records a version bump intent; releases aggregate them.
- Release steps (once code lands): green CI on `main` → tag (signed) → build → `pnpm -r publish` (with provenance) → SBOM → GitHub release notes from the changelog. The targeted **spec version is recorded in the release notes**.
- Deprecations: announce in `CHANGELOG.md`, keep one MINOR cycle where feasible, document migration.

## 8. CI gates (blocking)

`build` · `lint+format` · `typecheck` · `unit+property tests` · `daml test` · `conformance suite` · `coverage thresholds` · `dependency audit`. A red gate blocks merge. No overrides without a maintainer‑approved, documented exception.

## 9. Documentation as a deliverable

Docs are part of Done, not an afterthought. The spec, ADRs, and TSDoc are kept in sync with code. If behaviour and docs disagree, that is a bug.
