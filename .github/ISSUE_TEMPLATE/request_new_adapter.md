---
name: Request a new venue adapter
about: Propose support for a new Canton venue
title: "adapter: <venue name>"
labels: ["adapter"]
---

**Venue**
Name, links, registry/instrument details (CIP‑0056 qualified).

**Quote semantics**
- Quote source kind: AMM / CLOB / RFQ
- Indicative or firm? If firm, how are commitments/signatures provided?
- Fee model and how fees are reflected
- Decimals/precision per instrument

**API**
How does the venue expose quotes today (endpoint/SDK/OpenAPI)?

**Conformance**
- [ ] I understand the adapter must be pure/deterministic and pass the conformance suite (TESTING.md §5)
- [ ] Rounding will never overstate taker receipts
