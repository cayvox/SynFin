# ADR‑0008: On‑ledger atomic multi‑leg settlement on real CIP‑0056 interfaces

- **Status:** Accepted
- **Date:** 2026‑06‑17
- **Deciders:** Cayvox Labs (steward)
- **Spec impact:** none (realizes SPEC §6/§7; surfaces one privacy limitation noted below)

## Context

SPEC §6 requires that a multi‑leg route settle in a **single atomic Daml transaction**,
all‑or‑nothing, with the taker's economic bounds enforced **on‑ledger**, composing the
Canton Network Token Standard (CIP‑0056). This ADR records the design of
`daml/synfin-settlement` and the decision to build on the **real** Splice token‑standard
interfaces rather than stubs.

## Decision

### 1. Depend on the real CIP‑0056 DARs (not stubs)

We depend on the official Splice token‑standard interface DARs as Daml
`data-dependencies`, and test against **Amulet** via the `splice-token-standard-test`
harness. Zero‑assumption rule: we bind to the real standard and prove our library against
it, so a passing `daml test` is evidence the design works against what venues will actually
implement.

**Pinned environment (recorded for reproducibility):**

| Item | Value |
| --- | --- |
| Splice repo | `hyperledger-labs/splice`, branch **`canton-3.4`**, commit `2dbbab8ab8a5d65e906f2565ba5a460c8125720a` |
| Token‑standard pinned SDK (upstream) | `3.3.0-snapshot.20250502.13767.0.v2fc6c7e2` |
| SDK used to build | **`3.3.0-snapshot.20250507.0`** (see note) |
| Daml assistant present | `3.4.10` |
| JVM | Temurin **JDK 17.0.19** (user‑local; the env had no JRE) |
| Interface DAR versions | `splice-api-token-{metadata,holding,transfer-instruction,allocation,allocation-request,allocation-instruction}-v1` `1.0.0` |
| Other test DARs | `splice-amulet 0.1.14`, `splice-util 0.1.4`, `splice-api-featured-app-v1 1.0.0` |

> **SDK note (honest deviation):** the exact internal snapshot the token‑standard pins
> (`…20250502.13767.0.v2fc6c7e2`) is an Artifactory/DPM build and is **not published as an
> installable GitHub‑release SDK** (the legacy `daml install` 404s on it). The nearest
> public snapshot on the same `3.3.0` line, `3.3.0-snapshot.20250507.0`, builds the
> token‑standard sources unchanged and is what we pin. The built interface DARs are vendored
> under `daml/dars/` (provenance in `daml/dars/README.md`) with a regenerate script.

**Branch:** the task referenced `canton-3.3`; both `canton-3.3` and `canton-3.4` exist and
carry the same standard interfaces. We chose **`canton-3.4`** (the actively‑maintained line)
after confirming its package layout from source; the interfaces are identical in shape.

### 2. Settlement model (how N legs become one atomic transaction)

The canonical CIP‑0056 DvP pattern (proven by Splice's `OTCTrade`) is: a coordinating
agreement is co‑signed by the parties; each leg's sender creates a CIP‑0056 `Allocation`
(reserving/locking their funds for that leg against a shared `SettlementInfo`); the
coordinator then exercises `Allocation_ExecuteTransfer` on **every** leg's allocation inside
a **single transaction**.

`Synfin.Settlement.SwapSettlement` is the Synfin coordinator:

- It carries the route `legs : TextMap Leg` (give‑legs taker→venue in the give asset;
  receive‑legs venue→taker in the want asset) plus the **Synfin intent layer above
  CIP‑0056**: `intentId`, `taker`, give/want instruments, `giveAmount`, `minReceive`,
  `maxSlippageBps`, `referenceReceive`, `prepareUntil` (= `allocateBefore`), `deadline`
  (= `settleBefore`).
- It implements the standard `AllocationRequest` interface, so the request is expressed in
  the standard's terms.
- `SwapSettlement_Settle` (controller `executor`) fetches each leg's `Allocation`, checks it
  matches the expected `AllocationSpecification`, and exercises `Allocation_ExecuteTransfer`
  on all of them in one transaction → atomic.

### 3. On‑ledger enforcement (SPEC §6 step 3)

`SwapSettlement_Settle` enforces, before executing any leg:

- `now < deadline` (no settlement after the deadline);
- **conservation:** Σ give‑legs from the taker == `giveAmount`;
- **minReceive:** total delivered to the taker in the want instrument ≥ `minReceive`;
- **slippage:** delivered ≥ `referenceReceive · (10000 − maxSlippageBps) / 10000`
  (the agreed reference, SPEC §4.1).

A `minReceive > 0` / `giveAmount > 0` / `maxSlippageBps ≥ 0` / `prepareUntil ≤ deadline`
template `ensure` guards construction. Thus a lying/short quote produces a plan that fails
these checks and the transaction **aborts** — the taker cannot be made worse off than
`minReceive` (THREAT_MODEL; SPEC §6).

### 4. Atomicity, abort, single‑use, expiry, idempotency

- **All‑or‑nothing:** every leg executes in one transaction; any failure (timing, bound,
  missing/mismatched allocation, an expired lock) rolls the whole transaction back — no leg
  settles.
- **Single‑use:** `Allocation_ExecuteTransfer` consumes each allocation; they cannot be
  reused. `SwapSettlement_Settle` is consuming, so the settlement runs at most once.
- **Expiry:** allocations lock funds until `settleBefore`; an expired allocation cannot be
  executed (and may be released/withdrawn via `Allocation_Cancel`/`Allocation_Withdraw`).
- **Idempotency:** `intentId` is the CIP‑0056 settlement reference; a retry finds the
  settlement already consumed (SPEC §6, §8).

### 5. Same‑synchronizer

CIP‑0056 requires all input contracts of the atomic transaction to be on **one
synchronizer**. This is a design property: the off‑ledger router/SDK MUST NOT construct a
route whose legs would span synchronizers, and such a route is rejected upstream (it cannot
be settled atomically). The template settles whatever allocations are presented, which by
construction are co‑located. **Full cross‑synchronizer behaviour cannot be exercised on a
single‑domain sandbox and is deferred** (honest scope limit); it will be covered when
multi‑synchronizer testnet testing lands (Task 005).

### 6. Privacy (SPEC §7) — known limitation, candidate RFC

SPEC §7 wants each venue to see **only its own leg**. The atomic execution of the per‑leg
allocations requires **each leg sender's authority in the settling transaction**; the proven
standard pattern provides this by **co‑signing** the agreement with all parties (we
confirmed empirically that an `executor`+`taker`‑only signing fails with a missing‑authority
error when executing a venue's allocation). Consequently:

- Each **registry's transfer mechanics** stay private to that registry (the allocation
  model); selective disclosure carries only the per‑leg context to the executor at
  settlement.
- **But** the aggregate route (`legs`) is visible to the agreement's signatories — i.e. the
  venues co‑see the other legs. So this reference template **does not yet achieve per‑venue
  leg privacy.**

Achieving SPEC §7 fully needs sub‑transaction privacy / explicit‑disclosure features or a
different authority model (e.g. allocations executable by the executor alone without
re‑gathering sender authority). This is recorded as a **known limitation and a candidate
RFC**, rather than claimed as solved. It does not affect the economic‑safety guarantees,
which are the core of this milestone.

## Consequences

- Positive: the central M0 claim — split across venues, settle in ONE atomic transaction,
  all‑or‑nothing, with on‑ledger bounds — is proven against the real CIP‑0056 standard with
  a green `daml test` matrix (happy path, all‑or‑nothing, abort/expiry, authorization /
  no‑double‑spend, bound enforcement).
- Negative / trade‑offs: per‑venue privacy (§7) is not yet achieved (above); cross‑synchronizer
  atomicity is asserted as a property and deferred for testnet; we vendor third‑party DARs.
- Open/closed: everything here is open and Apache‑2.0; it depends only on the open
  token‑standard, no proprietary component (GOVERNANCE.md §3).
- Follow‑ups: privacy RFC; cross‑synchronizer e2e (Task 005); the off‑ledger `Settlement` TS
  port + SDK↔Daml wiring (Task 004).

## Alternatives considered

- **Stub the CIP‑0056 interfaces.** Rejected: defeats the purpose (prove against the real
  standard); the task forbids it without approval.
- **`executor`+`taker`‑only signing for privacy.** Rejected for now: fails to authorize the
  atomic execution of venues' allocations on the real interfaces (empirically). Kept as the
  privacy target for a future RFC.
- **Reimplement token transfer mechanics.** Rejected: we compose the standard's
  `Allocation`/`AllocationRequest`, never re‑implement holdings/transfers.
