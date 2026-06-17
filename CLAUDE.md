# CLAUDE.md — Operating guide for Claude Code in this repository

This file tells automated coding agents (Claude Code) how to work in the Synfin repo. Read it before doing anything. Humans should read it too — it encodes the rules of the project.

## Mission (one sentence)

Build and maintain Synfin: an **open, neutral** best‑execution and liquidity‑routing **standard + Apache‑2.0 reference implementation** for the Canton Network. See `README.md` and `ARCHITECTURE.md`.

## The non‑negotiable invariants

Never violate these. If a task seems to require violating one, stop and surface it instead of proceeding.

1. **Open/closed boundary.** Everything in this repo is Apache‑2.0 and must work without any proprietary component. Never add a dependency on, or a hard requirement for, the closed optimizer/hosted service. (GOVERNANCE.md §3)
2. **Quote/RFQ model.** Do not assume global state or readable venue reserves. Pricing comes from venue quotes/RFQ. (ARCHITECTURE.md §1)
3. **Atomicity.** Multi‑leg settlement is one Daml transaction, all‑or‑nothing. Never introduce protocol‑level partial fills.
4. **Privacy.** Each venue sees only its leg. Never log, persist, or expose a taker's full intent, size, or route. No cross‑leg correlation.
5. **Determinism & idempotency.** Adapters and settlement construction are pure given inputs; retries never double‑settle.
6. **On‑ledger enforcement of economic bounds.** `minReceive`/`maxSlippageBps`/`deadline` are enforced in Daml, so a bad quote causes an abort, not a loss.

## Zero‑assumption rule

- If behaviour is not defined in `docs/spec/SPECIFICATION.md` or an accepted ADR, **do not invent it silently.** Propose an ADR (architecture) or an RFC (normative spec), or ask. Reference the spec section you implement in your PR.
- Prefer the smallest change that satisfies the requirement. Do not refactor unrelated code in the same PR.

## Workflow (strict)

- **Work on a short‑lived branch and open a Pull Request. NEVER push to `main`.** A human (Anıl) reviews and merges. After working, report what you changed, why, and what you did not do.
- Use **Conventional Commits** and **DCO sign‑off** (`git commit -s`). (CONTRIBUTING.md, ENGINEERING.md)
- **Every PR MUST have a complete, professional description following `.github/PULL_REQUEST_TEMPLATE.md`.** At minimum: a one‑paragraph summary of *what changed and why*; the spec section / ADR / RFC it implements; the key design decisions and any surfaced limitations; *how it was tested* (exact commands + results); and the **filled Definition‑of‑Done checklist**. A terse or templated‑but‑empty description is not acceptable.
- **No Claude / AI attribution anywhere** — not in the PR title or body, not in commit messages, trailers, or co‑authors. Commits carry only the DCO `Signed‑off‑by`. (See also the `commit-msg` hook that strips such trailers.)
- Every behavioural change ships with tests. Settlement‑critical paths require Daml Script tests. Do not lower coverage gates. (TESTING.md)
- Satisfy the **Definition of Done** (ENGINEERING.md §4) before marking work complete.

## Secrets doctrine (hard rule)

- **Never read, print, echo, log, or commit secrets, tokens, or private keys.** There are no secrets in this repo; only `.env.example` placeholders.
- npm publish tokens are handed to the terminal at publish time by the human and scrubbed immediately. Do not attempt to read or persist them. Do not run publish unless explicitly instructed.

## Where things live

- Normative standard: `docs/spec/SPECIFICATION.md`
- Decisions/rationale: `docs/decisions/` (ADRs)
- TS packages: `packages/spec`, `packages/adapters`, `packages/router-ref`, `packages/sdk`
- On‑ledger library: `daml/synfin-settlement`
- Reference UI: `apps/reference-ui`; Phase‑0 tool: `tools/price-monitor`

## Commands

```bash
pnpm install          # install workspaces
pnpm build            # build all packages
pnpm test             # unit + property tests
pnpm -w lint          # eslint + prettier (must pass)
daml build && daml test   # build + Daml Script tests (settlement library)
```

## Do‑not list

- Do not push to `main` or force‑push shared branches.
- Do not add unvetted or heavyweight dependencies (justify any new dependency in the PR).
- Do not change the spec or wire formats without an accepted RFC.
- Do not log PII, intent totals, or routes.
- Do not weaken a CI gate or coverage threshold to make something pass.
- Do not use browser storage (localStorage/sessionStorage) in the reference UI; keep state in memory/React state.
- Do not break the open/closed boundary or the neutrality charter.

## When unsure

State the assumption you would have to make, propose an ADR/RFC, and ask. Surfacing a blocker early is always preferred over guessing.
