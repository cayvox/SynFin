# Architecture Decision Records (ADRs)

We record significant architecture decisions as ADRs so the *why* is never lost and so no decision is made silently (the zero‑assumption rule). ADRs are immutable once accepted; to change a decision, write a new ADR that supersedes the old one.

- Use `0000-adr-template.md` as the starting point.
- Number ADRs sequentially.
- Status: `Proposed` → `Accepted` → (later) `Superseded by ADR‑NNNN`.
- Decisions that affect the **normative spec** also require an RFC (see GOVERNANCE.md §5).

## Index

| ADR | Title | Status |
| --- | --- | --- |
| [0001](0001-monorepo-and-tooling.md) | Monorepo and tooling | Accepted |
| [0002](0002-quote-rfq-model.md) | Quote/RFQ model because Canton has no global state | Accepted |
| [0003](0003-atomic-split-execution-on-cip56.md) | Atomic split execution on CIP‑0056 | Accepted |
| [0004](0004-open-closed-boundary.md) | The open/closed boundary | Accepted |
| [0005](0005-ports-and-adapters.md) | Ports & adapters (hexagonal) architecture | Accepted |
