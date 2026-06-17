# ADR‑0005: Ports & adapters (hexagonal) architecture

- **Status:** Accepted
- **Date:** 2026‑06‑17
- **Deciders:** Cayvox Labs (steward)
- **Spec impact:** none

## Context

Venues are heterogeneous and numerous; the routing brain may be open (reference) or proprietary; the core domain must stay clean, testable, and neutral.

## Decision

Adopt **hexagonal architecture**. The core domain (intent, quoting, routing, settlement composition) depends only on **ports**: `VenueAdapter`, `Router`, and `Settlement`. External systems plug in as adapters. Adapters are pure/deterministic; the reference `Router` is open and a proprietary optimizer is an alternative implementation of the same port. Dependencies point inward.

## Consequences

- Positive: testability (mock adapters), neutrality (swappable router), clean boundaries, easy addition of venues.
- Negative: more interfaces/indirection up front.
- Follow‑ups: define the three ports in `@synfin/spec`; provide a mock‑venue adapter for tests; ship `@synfin/router-ref`.

## Alternatives considered

- Layered/monolithic core with direct venue calls — rejected: couples the core to venue specifics and to a single router.
