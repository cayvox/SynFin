# ADR‑0002: Quote/RFQ model because Canton has no global state

- **Status:** Accepted
- **Date:** 2026‑06‑17
- **Deciders:** Cayvox Labs (steward)
- **Spec impact:** requires RFC for any change to the quote interface

## Context

On EVM/Solana, aggregators read public pool reserves to compute routes. **Canton has no global shared state and contracts are private to their stakeholders**, so reserves are not readable. Any aggregation must obtain pricing another way.

## Decision

Synfin is **quote/RFQ‑based**: routers obtain pricing by requesting quotes from venues (indicative or firm), optionally at multiple sizes ("buckets"), rather than reading reserves. The quote interface is part of the normative spec (SPECIFICATION.md §4.3, §5).

## Consequences

- Positive: works with Canton's privacy model; natural fit for intent‑based execution; a real barrier to entry (not a forkable router contract).
- Negative: depth estimation relies on venue cooperation and quote quality; requires an adapter per venue.
- Follow‑ups: define firm‑quote commitments and conformance; build the mock‑venue harness for tests.

## Alternatives considered

- Reading reserves — impossible on Canton by design.
- A single mandated AMM math — rejected: not neutral, and venues differ (AMM/CLOB/RFQ).
