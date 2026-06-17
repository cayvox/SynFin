# synfin-settlement (Daml)

The on‑ledger heart of Synfin: composes an N‑leg route into a **single atomic Daml
transaction** on the real Canton Network Token Standard (CIP‑0056) allocation interfaces —
all‑or‑nothing, with the taker's economic bounds enforced on‑ledger (SPEC §6; ADR‑0008).

> Not a re‑implementation of token transfer: it **composes** the standard's `Allocation` /
> `AllocationRequest` interfaces (from `hyperledger-labs/splice`), depended on as DARs.

## What it does

It uses the **per‑leg‑authorization + executor‑only‑coordinator** privacy model (RFC‑0003;
SPEC §7) so the route settles atomically **and** each venue stays blind to the other legs:

- **`LegAuth`** — a per‑leg authorization co‑signed by that leg's **sender + receiver** only,
  referencing **only that leg**. It carries the leg's authority to the executor.
- **`SwapSettlement`** — the coordinator, signed by **executor + taker only** (never the
  venues), carrying the route `legs` plus the Synfin intent layer (`minReceive`,
  `maxSlippageBps`, `referenceReceive`, `deadline`, `giveAmount`, `intentId`). Its
  `SwapSettlement_Settle` choice (controller `executor`) exercises each leg's `LegAuth` —
  which supplies that leg's sender+receiver authority for `Allocation_ExecuteTransfer`
  (controllers `[executor, sender, receiver]`) — in **one** transaction, and enforces
  on‑ledger: `now < deadline`, conservation (Σ give‑legs == `giveAmount`),
  `delivered ≥ minReceive`, and the slippage floor. Any failure aborts the whole transaction
  (no leg settles). Allocations are single‑use; `intentId` makes settlement idempotent.

Privacy result (SPEC §7): only the **taker** and **executor** see the aggregate route; a
**venue** is a stakeholder of only the leg(s) it participates in and never observes another
venue's allocation or `LegAuth`. The `testPerLegVisibility` Daml Script asserts this (and fails
if aggregate visibility regresses). See ADR‑0008 (updated) and RFC‑0003 for the model and the
same‑synchronizer property (deferred for multi‑synchronizer testing).

## Build & test

Requires a JDK 17 and the Daml SDK pinned in `daml.yaml`
(`3.3.0-snapshot.20250507.0`); the CIP‑0056 DARs are vendored in
[`../dars/`](../dars/) (regenerate with [`../scripts/build-splice-dars.sh`](../scripts/build-splice-dars.sh)).

```bash
# from this directory:
daml build                       # builds the library against the real CIP-0056 DARs
# the test matrix lives in ../synfin-settlement-test (it data-depends on this DAR):
cd ../synfin-settlement-test && daml build && daml test
```

The Daml Script matrix (`Synfin.Tests.Settlement`) proves: happy‑path N‑leg split in one
transaction, **per‑leg confidentiality** (`testPerLegVisibility` — a venue cannot see another
venue's leg), all‑or‑nothing, abort on expired deadline, executor‑only authorization,
no‑double‑spend, and `minReceive`/`maxSlippageBps` bound enforcement (TESTING.md §3),
using Amulet as the test token.

Apache‑2.0. Pre‑alpha.
