# Contributing to Synfin

Thank you for helping build neutral infrastructure for the Canton ecosystem. This guide gets you productive and explains the non‑negotiables.

## Ground rules

- **Zero assumptions.** If a behaviour is not specified in `docs/spec/SPECIFICATION.md` or decided in an ADR, do not invent it silently. Open an RFC/ADR or ask. Cite the spec section your change implements.
- **Never break the open/closed boundary.** Nothing in this repo may depend on a proprietary component, and no change may make the standard require one. See [GOVERNANCE.md](GOVERNANCE.md) §3.
- **Tests ship with code.** Every behavioural change includes tests. Settlement‑critical paths require Daml Script tests. Do not lower coverage gates. See [TESTING.md](TESTING.md).
- **Security first.** Treat all venue quotes and network input as untrusted. Never log a taker's full intent or route. See [THREAT_MODEL.md](THREAT_MODEL.md).

## Development environment

Prerequisites:

- **Node.js >= 20** and **pnpm >= 9** (`corepack enable`)
- **Daml SDK** pinned to `3.3.0-snapshot.20250507.0` (the Splice token‑standard's `3.3.0`
  line; ADR‑0008): `daml install 3.3.0-snapshot.20250507.0`
- **JDK 17** — `daml test`/`daml sandbox` need a JVM (`daml build` alone does not)
- `git` with commit signing recommended (DCO sign‑off required — see below)

```bash
git clone <repo>
cd synfin
pnpm install         # JS/TS workspaces
pnpm build           # build all packages
pnpm test            # unit + property tests
pnpm -w lint         # eslint + prettier check
```

### On‑ledger (Daml) — `daml/synfin-settlement`

The settlement library builds against the **real CIP‑0056** token‑standard DARs, vendored in
[`daml/dars/`](daml/dars/) (provenance + regenerate script in
[`daml/dars/README.md`](daml/dars/README.md)). With JDK 17 and the pinned SDK on `PATH`:

```bash
cd daml/synfin-settlement       && daml build          # library (real CIP-0056 data-deps)
cd ../synfin-settlement-test    && daml build && daml test   # Daml Script matrix (Amulet)
```

To rebuild the vendored DARs from source: `daml/scripts/build-splice-dars.sh`.

## Repository layout

See [ARCHITECTURE.md](ARCHITECTURE.md) §Repository layout. In short: `docs/spec` is the normative standard; `packages/*` are the TS spec types, adapters and SDK; `daml/*` is the on‑ledger library; `apps/` and `tools/` hold the reference UI and the Phase‑0 monitor.

## Branching & commits

- **Trunk‑based.** Short‑lived feature branches off `main`. Branch names: `feat/...`, `fix/...`, `docs/...`, `chore/...`, `spec/...`.
- **Conventional Commits** are required: `feat(adapter): add Cantex quote adapter`, `fix(daml): reject expired allocation`. This drives the changelog and SemVer.
- **No direct pushes to `main`.** All changes land via pull request. This applies to automated agents too.
- **DCO sign‑off:** add `Signed-off-by: Name <email>` to every commit (`git commit -s`).

## Pull requests

A PR must:

1. Reference the issue/RFC/ADR it implements.
2. State which spec section(s) it affects, if any.
3. Pass CI (build, lint, unit + property tests, Daml tests, conformance suite).
4. Include tests and docs for the change.
5. Satisfy the **Definition of Done** in [ENGINEERING.md](ENGINEERING.md).

Review: at least one maintainer approval and green CI. Spec‑affecting PRs require an accepted RFC first (see GOVERNANCE.md §5).

## Proposing design or spec changes

- **Architecture decision** (tooling, structure, patterns): add an ADR under `docs/decisions/` using `0000-adr-template.md`.
- **Normative spec change** (wire formats, interfaces, conformance): open an RFC issue; follow GOVERNANCE.md §5.

## Adding a venue adapter

Adapters are the most common contribution. An adapter MUST:

- Implement the `VenueAdapter` port exactly (see SPECIFICATION.md §Venue interface).
- Be **pure and deterministic** in its quote normalization (no hidden network state beyond the documented quote call).
- Pass the **conformance suite** for adapters (golden tests + fuzzed parser inputs).
- Round conservatively (never in a way that overstates what the taker receives).
- Document the venue's quote semantics (indicative vs firm, fee model, decimals).

Use the `request-new-adapter` issue template to propose one.

## Reporting bugs & security issues

- Functional bugs: use the bug report issue template.
- **Security vulnerabilities: do NOT open a public issue.** Follow [SECURITY.md](SECURITY.md).

## License of contributions

By contributing you agree your contributions are licensed under **Apache‑2.0** and that you have the right to submit them (asserted via DCO sign‑off).
