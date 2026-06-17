# Requests for Comments (RFCs)

Normative changes to the specification (`docs/spec/SPECIFICATION.md`) are made through RFCs,
per GOVERNANCE.md §5. An RFC records the problem, the decision, and the compatibility and
conformance‑test impact, so no normative change is made silently (the zero‑assumption rule).

- Architecture decisions that do **not** change the wire format are recorded as ADRs instead
  (see [`../decisions/`](../decisions/)).
- Number RFCs sequentially.
- Status: `Proposed` → `Accepted` → (later) `Superseded by RFC‑NNNN`.
- An accepted RFC that changes the spec drives a SemVer bump of the spec version.

## Index

| RFC | Title | Status | Spec version |
| --- | --- | --- | --- |
| [0001](0001-assetid-minreceive-quote-linkage.md) | Lock the `AssetId`, `minReceive`, and quote↔leg contracts | Accepted | 0.2.0 |
