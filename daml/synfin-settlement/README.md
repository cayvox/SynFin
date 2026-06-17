# synfin-settlement (Daml)

The on‑ledger heart of Synfin: composes an N‑leg route into a **single atomic Daml
transaction** on the real Canton Network Token Standard (CIP‑0056) allocation interfaces —
all‑or‑nothing, with the taker's economic bounds enforced on‑ledger (SPEC §6; ADR‑0008).

> Not a re‑implementation of token transfer: it **composes** the standard's `Allocation` /
> `AllocationRequest` interfaces (from `hyperledger-labs/splice`), depended on as DARs.

## What it does

`Synfin.Settlement.SwapSettlement` is a co‑signed agreement carrying the route `legs` plus the
Synfin intent layer (`minReceive`, `maxSlippageBps`, `referenceReceive`, `deadline`,
`giveAmount`, `intentId`). Its `SwapSettlement_Settle` choice (controller `executor`)
exercises `Allocation_ExecuteTransfer` on every leg's allocation in one transaction and
enforces, on‑ledger: `now < deadline`, conservation (Σ give‑legs == `giveAmount`),
`delivered ≥ minReceive`, and the slippage floor. Any failure aborts the whole transaction
(no leg settles). Allocations are single‑use; `intentId` makes settlement idempotent.

See ADR‑0008 for the model, the same‑synchronizer property, and the **privacy limitation**
(the co‑signed agreement currently reveals the route to its signatories — per‑venue leg
privacy is a documented follow‑up).

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
transaction, all‑or‑nothing, abort on expired deadline, executor‑only authorization,
no‑double‑spend, and `minReceive`/`maxSlippageBps` bound enforcement (TESTING.md §3),
using Amulet as the test token.

Apache‑2.0. Pre‑alpha.
