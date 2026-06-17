# ADR‑0004: The open/closed boundary

- **Status:** Accepted
- **Date:** 2026‑06‑17
- **Deciders:** Cayvox Labs (steward)
- **Spec impact:** none (but governs neutrality)

## Context

Synfin must be neutral, grant‑fundable common‑good infrastructure, while leaving room for a sustainable business. Closed incumbents already occupy parts of the institutional space; the open standard is the defensible, fundable, non‑duplicative layer.

## Decision

Everything in this repository is **Apache‑2.0** and must function without any proprietary component: the spec, venue adapters, the atomic split‑execution Daml library, the SDK, the reference UI, the Phase‑0 tool, and an **open reference `Router`**. The proprietary value‑capture layer (routing optimizer, hosted execution, RFQ network operation, institutional TCA/reporting) lives in **separate repositories** and is **never required** to use the standard. No change may make the standard depend on a closed component (enforced by GOVERNANCE.md §3 and CI/neutrality review).

## Consequences

- Positive: fundable as common good; trustable by the whole ecosystem; clear business surface for Cayvox.
- Negative: open adapters benefit competitors too; the moat is standard authorship, speed, and the quality of the (closed) optimizer/service.
- Follow‑ups: keep the `Router` port and reference router as the neutral baseline; document conformance so closed and open routers are interchangeable.

## Alternatives considered

- Fully open (including optimizer) — viable (CoW‑style), but removes the primary revenue mechanism; revisit if a solver‑market model is chosen.
- Closed product with thin open SDK — rejected: not grant‑fundable, not neutral, weaker ecosystem trust.
