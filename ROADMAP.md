# Roadmap

Synfin is built in deliberate phases. The open‑source layer (this repository) is delivered first; the proprietary value‑capture layers build on top of it. Milestones M1–M3 correspond to the Canton Protocol Development Fund grant; acceptance criteria are framed as **ecosystem value (adoption)**, not artifact delivery.

## Phase 0 — Price‑divergence monitor (evidence)

**Goal:** prove the need with data and seed the project.

- Read‑only tool that collects quotes for the same pairs across reachable venues over ~30 days.
- Output: a public dataset and a simple dashboard quantifying cross‑venue spread by size and time.
- **Decision gate:** if spreads are consistently meaningful (e.g., > 20–30 bps on relevant sizes), the need is demonstrated and the data becomes the evidence section of the grant proposal. If negligible, we have cheaply avoided a wrong turn and still own a useful Canton price dataset.

## M1 — Standard + foundations (≈ weeks 1–7)

- `docs/spec/SPECIFICATION.md` drafted to RFC quality and aligned with CIP‑0056; submitted on the CIP track.
- Daml interface definitions for swap intent and settlement composition.
- `@synfin/spec` (normative types/schemas) and a quote/inventory SDK skeleton.
- **2 venue adapters** for the most liquid venues, passing the conformance suite.
- **Acceptance:** spec published; ≥ 2 conformant adapters; types consumed by the SDK in an integration test.

## M2 — Atomic split‑execution (≈ weeks 8–16)

- The on‑ledger **atomic split‑execution Daml library** on top of CIP‑0056 allocation/DvP: compose N legs into a single all‑or‑nothing Daml transaction.
- End‑to‑end demo on Canton **testnet**: a real split swap across two venues.
- **2 more adapters.**
- **Acceptance:** testnet e2e atomic split swap; all‑or‑nothing and abort/expiry paths covered by Daml Script tests.

## M3 — SDK, reference UI, adoption (≈ weeks 17–24)

- `@synfin/sdk` (TypeScript client) and the **reference comparison UI**.
- Full documentation and conformance guide.
- **At least one live integration** with a venue or dApp.
- **Acceptance:** SDK integrated by ≥ 1 external wallet/app; reference UI live; docs complete.

> An expanded grant option adds an **M4** (independent security audit + RFQ groundwork + maintained public infrastructure + a second live integration). See the strategy brief and [GOVERNANCE.md](GOVERNANCE.md).

## Beyond the grant (proprietary layers, separate repos)

- **Layer 1 — Retail meta‑swap + Edge panel** (hosted).
- **Layer 2 — RFQ network** with market makers.
- **Layer 3 — Institutional SOR + TCA + provable best‑execution** (primary revenue).

These build on the open standard and never alter the open/closed boundary.

## Pre‑mainnet gate

No component is deployed to Canton mainnet before an **independent third‑party security audit** of the Daml library and allocation handling (see [SECURITY.md](SECURITY.md)).
