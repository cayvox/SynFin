# RFC‑0003: Synfin privacy model — what is real, and how to settle privately

- **Status:** Accepted
- **Date:** 2026‑06‑17
- **Author / Steward:** Cayvox Labs (steward)
- **Targets spec version:** SQSS `0.4.0` (proposed §7 edits applied in a follow‑up task)
- **Review window:** GOVERNANCE.md §5 minimum 14‑day window **waived** under the single‑steward
  governance fallback (GOVERNANCE.md §4).
- **Related:** [ADR‑0008](../decisions/0008-atomic-multileg-settlement.md) (known privacy
  limitation this RFC resolves); SPEC §6, §7; THREAT_MODEL.md.

## Summary

Task 003 (ADR‑0008) shipped atomic multi‑leg settlement using the proven CIP‑0056 `OTCTrade`
pattern, which **co‑signs all parties** — so every venue could see the whole route, contradicting
SPEC §7. This spike establishes, **with experiments against the real CIP‑0056 interfaces +
Amulet**, exactly which privacy properties Synfin can provide, and finds that **per‑leg
confidentiality IS achievable** without giving up atomicity. It recommends a concrete settlement
model (per‑leg authorizations + executor‑only coordinator) and proposes honest SPEC §7 wording.

The experiments were first run in a throwaway spike (`spikes/privacy-model`, all three `daml test`
scripts passing); that spike has since been **removed** and the model is now the production
implementation in `daml/synfin-settlement` (Task 003.6), proven by the `daml test` matrix incl.
`testPerLegVisibility`.

## Privacy properties Synfin actually provides

Two distinct properties — kept separate to avoid overclaiming:

| Property | What it means | Status |
| --- | --- | --- |
| **Quote‑time privacy** | A venue answering an RFQ sees only the single bucket it is asked to price, never the taker's total intent or route (SPEC §4.2, §7). | **Held** in all models (off‑ledger RFQ; unchanged by this spike). |
| **MEV immunity** | No front‑running/sandwiching, because Canton has no public mempool and transactions are visible only to their stakeholders. | **Held** in all models — a structural property of Canton, independent of the settlement template. |
| **Settlement‑time per‑leg confidentiality** | At settlement, a venue sees only its own leg(s), not other venues' legs or the aggregate route. | **Achievable** with the recommended per‑leg model (proven below); **NOT** provided by the co‑signed `OTCTrade`/ADR‑0008 model. |

> MEV immunity and per‑leg confidentiality are **different**. The co‑signed model already gives
> MEV immunity (no mempool) and quote‑time privacy; it does **not** give settlement‑time per‑leg
> confidentiality. The recommended model adds the third.

## Findings (research questions)

### RQ1 — Sub‑transaction privacy: can each venue be a stakeholder of only its own leg? **Yes. (High confidence.)**

Canton scopes contract visibility to each contract's stakeholders; CIP‑56's headline property is
sub‑transaction privacy — "information about asset holdings and transfers is shared on a
need‑to‑know basis." **Evidence (experiment `experimentPerLegVisibility`):** with a taker (alice)
and two venues (bob, charlie), after all four leg allocations are created, `queryInterface
@Allocation bob` returns **only bob's own** allocation, `charlie`'s returns only charlie's, and the
executor (an observer of every leg) sees all four. The concrete `AmuletAllocation` is
`signatory dso, sender; observer executor` — so a venue is a stakeholder only of allocations it
created. A venue is never a stakeholder of another venue's leg.

### RQ2 — Executor‑only authority: can the executor settle a pre‑authorized leg without the parties co‑signing the settling transaction? **Partly — and enough. (High confidence.)**

The real `Allocation` interface fixes
`allocationControllers = [settlement.executor, transferLeg.sender, transferLeg.receiver]`, and
`Allocation_ExecuteTransfer`'s `controller allocationControllers (view this)`. So **executing a
leg needs executor + sender + receiver authority in the enclosing context.** A pure executor‑only
model is impossible:

- **Evidence (`experimentExecutorOnlyFails`):** the executor alone exercising a leg's
  `Allocation_ExecuteTransfer` fails — `missing authorization from '<receiver>'`.
- A receiver‑only delegation is also insufficient — it then fails `missing authorization from
  '<sender>'`, because the allocation being *signed by* the sender does **not** authorize its own
  choice *exercise* (signatory authority is available inside a choice body, not for authorizing the
  exercise itself).

**But** the missing authority can be carried by a **per‑leg authorization co‑signed by exactly the
leg's two parties** (sender + receiver), which the executor then exercises:

- **Evidence (`experimentDelegatedExecutorSettle`):** two pre‑funded allocations
  (alice→bob, bob→alice) settle **atomically in one transaction submitted by the executor ALONE**,
  via a per‑leg `LegAuth` (signed by that leg's sender + receiver) exercised inside an
  executor‑signed coordinator. No aggregate contract is co‑signed. **It passes.**

So the parties authorize *only their own legs* (at allocation‑/auth‑creation time); the executor
alone submits the atomic settlement. That is sufficient for per‑leg confidentiality.

### RQ3 — What do existing Canton venues do? **Bilateral; no public multi‑party per‑leg‑blind routing. (Medium‑high confidence.)**

CIP‑56 explicitly supports sub‑transaction privacy and "receivers control from whom they receive
assets" (matching RQ2). The canonical reference (`splice-token-standard-test`'s `OTCTrade`)
co‑signs all parties — counterparties see the whole trade. CantonSwap's first cross‑issuer atomic
swap (Coin↔CBTC, Oct 2025) is **bilateral**: each counterparty sees its side, which *is* the whole
2‑party trade. We found no public app doing multi‑venue routing where a venue is blind to the other
legs. Synfin's per‑leg model (RQ2) extends the standard's sub‑transaction privacy to multi‑venue
routing — a differentiator, built only from standard interfaces.

### RQ4 — MEV reality under Canton. **Structurally prevented in all models. (High confidence.)**

There is no public mempool, and transactions are visible only to stakeholders; routes and amounts
are never broadcast. So front‑running/sandwiching is structurally prevented **even in the co‑signed
model**. This is distinct from per‑leg confidentiality: MEV immunity is about *outsiders/ordering*;
per‑leg confidentiality is about *what a participating venue learns*. Synfin has MEV immunity
regardless; the recommended model additionally denies a participating venue sight of the rest of the
route.

### RQ5 — Strongest honest position. **Adopt the per‑leg model (RQ2) — real and maximally private.**

Of the options: (a) co‑signed (settlement‑time route visible to venues) — what ADR‑0008 ships;
(b) executor‑only authority — impossible per RQ2; (c) per‑leg authorizations + executor coordinator
— **proven, atomic, and per‑leg confidential.** We recommend (c).

## Recommended model (for the production settlement library)

**Per‑leg authorizations with an executor‑only coordinator.**

1. **Allocate per leg.** Each sender creates its CIP‑0056 `Allocation` for its single leg (already
   the standard; sees only its leg).
2. **Authorize per leg.** Each leg's two parties (sender + receiver) co‑sign a small `LegAuth`
   contract that references **only that leg** (its parties + the settlement reference) and grants
   the `executor` the right to execute it. No party ever co‑signs an aggregate that lists other
   legs.
3. **Settle atomically, executor‑only.** An executor‑signed coordinator exercises every leg's
   `LegAuth` in **one** Daml transaction; each `LegAuth_Execute` supplies its leg's sender+receiver
   authority so `Allocation_ExecuteTransfer` (controllers `[executor, sender, receiver]`) succeeds.
   All‑or‑nothing is preserved (one transaction); the executor is the only party with the full
   route.

The taker is a party to all of its own legs (it is the taker), so it sees its whole route — correct.
Each **venue** is a party only to the legs it participates in, so it never sees another venue's leg
or the aggregate — SPEC §7 satisfied for venues. On‑ledger economic‑bound enforcement
(`minReceive`/`maxSlippageBps`/`deadline`, ADR‑0008) is retained on the coordinator.

Concrete Daml mechanism (validated in the spike): `LegAuth { sender, receiver, executor,
settlementRef }` with `signatory sender, receiver` and a `nonconsuming choice LegAuth_Execute`
(`controller executor`) that validates the allocation matches the leg and exercises
`Allocation_ExecuteTransfer`; plus a `SpikeCoordinator`‑style `SwapSettlement` signed by the
executor alone whose settle choice folds over the per‑leg `LegAuth`s.

## Proposed SPEC §7 edits (applied in a follow‑up; no overclaiming)

Today §7 asserts per‑venue privacy unconditionally. Proposed wording so the spec states what is
*achievable and implemented*:

- Keep: "A Venue MUST learn only its own leg … MUST NOT learn the aggregate intent, other legs, or
  the route." — **but scope it to the recommended settlement model** and add:
  - *"Per‑leg confidentiality at settlement is achieved by per‑leg authorization: each leg is
    authorized only by its own sender and receiver and executed by the coordinator in a single
    atomic transaction; no party co‑signs an aggregate that reveals other legs. A reference
    settlement that co‑signs all parties (e.g. the CIP‑0056 `OTCTrade` pattern) does NOT meet this
    requirement and is non‑conformant for multi‑venue routing."*
  - *"MEV immunity (no public mempool; stakeholder‑only visibility) and quote‑time privacy (§4.2)
    hold independently of the settlement template."*
- Add a note distinguishing **MEV immunity** from **per‑leg confidentiality** (they are different
  properties), mirroring this RFC.

## Honest narrative framing (for positioning / grant claims)

> Synfin routes orders privately on Canton. Because Canton has no public mempool and shares data
> only with a transaction's stakeholders, Synfin is **structurally immune to front‑running/MEV**,
> and venues pricing an RFQ see only the slice they're asked to quote — never the taker's full
> intent. At settlement, Synfin uses **per‑leg authorizations** so each venue sees and signs only
> its own leg while the whole route still settles **atomically, all‑or‑nothing**, in a single
> transaction. No venue learns the rest of the route; only the taker and the settlement coordinator
> see the aggregate. This is built entirely on the open CIP‑0056 token standard — no proprietary
> component.

Claims to avoid: do **not** say venues are blind to their counterparty *identity* on their own leg
(the leg's two parties co‑sign it); do not imply the *co‑signed reference* in ADR‑0008 already
provides per‑leg confidentiality (it does not — this RFC is the fix).

## Follow‑up plan

1. ~~**Production library task:** refactor `daml/synfin-settlement` to the per‑leg `LegAuth` +
   executor‑only coordinator model; add a 3‑party visibility test.~~ **Done (Task 003.6):** the
   production library now implements this model; `testPerLegVisibility` proves per‑leg
   confidentiality; the full prior matrix stays green.
2. ~~**SPEC task (→ 0.4.0):** apply the §7 edits.~~ **Done (Task 003.6):** SPEC §7 updated to 0.4.0.
3. ADR‑0008's note is cross‑linked to this RFC (and updated to reflect the implemented model).

## Evidence index

- The model was first proven in a throwaway spike (since removed) and is now the production
  implementation: `daml/synfin-settlement` + the `daml test` matrix in `daml/synfin-settlement-test`
  (`Synfin.Tests.Settlement`), including `testPerLegVisibility` (a venue cannot see another venue's
  leg) and the delegated executor‑only atomic settlement in `testHappyPath`.
- Real interface: `splice-api-token-allocation-v1` `allocationControllers` /
  `Allocation_ExecuteTransfer`; `splice-amulet` `AmuletAllocation` signatory.
- External: CIP‑0056 (canton/GSF), Canton Network "What is CIP‑56", Splice token‑standard docs,
  CantonSwap Oct‑2025 atomic swap.
