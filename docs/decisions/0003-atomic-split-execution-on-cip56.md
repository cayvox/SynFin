# ADR‑0003: Atomic split execution on CIP‑0056

- **Status:** Accepted
- **Date:** 2026‑06‑17
- **Deciders:** Cayvox Labs (steward)
- **Spec impact:** requires RFC for any change to settlement semantics

## Context

A route splits one order across multiple venues. Those legs must settle together or not at all, with no partial fills and no counterparty risk between legs.

## Decision

Compose settlement using **CIP‑0056 allocation/DvP**: create allocation requests per leg, then settle **all legs in a single Daml transaction** (all‑or‑nothing). Enforce `minReceive`, `maxSlippageBps`, and `deadline` **on‑ledger**. Require all inputs on the **same synchronizer**; reject cross‑synchronizer atomic routes. Allocations are single‑use and expiring; settlement is idempotent via `intentId`. See SPECIFICATION.md §6.

## Consequences

- Positive: protocol‑level atomicity; a lying quote can only cause a safe abort; reuses a proven CIP‑0056 pattern (e.g., the first cross‑issuer atomic swap, Oct 2025).
- Negative: bound by the same‑synchronizer constraint; multi‑synchronizer routes are out until/unless the platform supports cross‑synchronizer atomicity.
- Follow‑ups: Daml Script tests for all‑or‑nothing, abort/expiry, single‑use, bound enforcement; pre‑mainnet audit of the library.

## Alternatives considered

- Sequential per‑venue settlement — rejected: introduces partial‑fill and settlement risk.
- Off‑ledger netting — rejected: weakens atomicity and trust guarantees.
