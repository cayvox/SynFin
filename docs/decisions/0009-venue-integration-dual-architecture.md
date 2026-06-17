# ADR‑0009: Venue integration — dual architecture (atomic CIP‑0056 + managed deposit)

- **Status:** Accepted
- **Date:** 2026‑06‑17
- **Deciders:** Cayvox Labs (steward)
- **Spec impact:** proposes a §5 `settlementMode` capability (flagged below; **applied later via RFC**, not in this ADR)

## Context

Before writing any venue adapter (Task 005), we confirmed — from real venue docs / testnet, not
assumptions — what quote APIs and settlement models today's accessible Canton venues actually use.
The pivotal finding: **the accessible retail DEXs settle by deposit** (send funds to a venue
party/address with a reference; the venue detects the deposit and executes), which is **not** the
CIP‑0056 co‑signed atomic‑allocation model our `daml/synfin-settlement` library (Task 003.6) uses.

**Maintainer decision (implemented here, not relitigated): keep BOTH architectures.** The atomic
split‑execution library stays as‑is for CIP‑0056‑allocation counterparties; alongside it we define
a second integration path for deposit‑based venues. The `VenueAdapter` port accommodates both.
This ADR **decides and documents** the dual design; Task 005 implements it.

## Step 1 — Findings (evidence)

| Venue | Quote API | Settlement model | Accessible now? | Evidence |
| --- | --- | --- | --- | --- |
| **CantonSwap** | REST: `POST /nswap/quote` (`fromToken`,`toToken`,`amount`,`recipient`,`slippageTolerance?`) → `fromAmount`,`toAmount`,`minOutAmount`,`rate`,`priceImpact`,`memo`,`swapAddress`,`magicAddress?`; token catalog `GET /nswap/tokens`. Firm‑ish executable route, fees embedded in `rate`/`minOutAmount`; no explicit `validUntil` ("refresh quote before swap"). | **Deposit‑based.** Settle by transferring to `swapAddress` **with** the quote `memo`, or to `magicAddress` **without** memo. Explicitly "not a co‑signed atomic Daml transaction." | Yes — mainnet RPC `mainnet.rpc.canton.nightly.app`; docs with curl examples. | [cantonswap.nightly.app/docs](https://cantonswap.nightly.app/docs); [canton.network/ecosystem/cantonswap](https://www.canton.network/ecosystem/cantonswap) |
| **OneSwap** | Intent‑based, constant‑product AMM (x·y=k). Computes expected output incl. fees + price impact; slippage tolerance default 1% (range 0.1–50%); pairs **CC (Amulet) + USDCx** (expanding). SDK + developer portal. | **Deposit‑based.** Create swap intent → returns a **pool swap party address + unique transfer reference**; deposit input to the pool party with the reference in Canton's reason/reference field (24h to deposit or the intent expires); OneSwap detects, executes, returns output to the same party. Auto‑cancel + refund if price moves beyond tolerance. Not CIP‑0056 atomic. | Yes — **beta**; `oneswap.cc`, `docs.oneswap.cc`. | [docs.oneswap.cc](https://docs.oneswap.cc); [OneSwap on Canton (technical write‑up)](https://sisipepper.medium.com/what-defi-looks-like-when-the-infrastructure-gets-serious-canton-network-and-oneswap-571145d7ea28) |
| **CompassSwap** | Intent‑based asynchronous model (RWA/DeFi). Public API shape not yet documented. | Intent/async (details not public); not confirmed CIP‑0056‑atomic. | **Limited preview** — not full public access. | [swap.compasspost.live](https://swap.compasspost.live/); [canton.wiki DeFi ecosystem](https://canton.wiki/learn/canton-network-defi) |
| **Cantex** (CaviarNine) | SDK quote: `get_swap_quote(...)` → `SwapQuote` (price, slippage, admin/liquidity/network fees, per‑pool breakdown). AMM pools; `swap()` / `swap_and_confirm()`. | **Venue‑internal intent/atomic** via its own "intent trading account" + on‑ledger `swap_and_confirm` — **no public CIP‑0056 allocation / DvP interface** to co‑settle as an external leg. From an integrator's view: quote + execute via its own flow. | Yes — testnet API `api.testnet.cantex.io`; SDK. | [github.com/caviarnine/cantex_sdk](https://github.com/caviarnine/cantex_sdk); `https://api.testnet.cantex.io` |

Gaps flagged honestly: CompassSwap's API shape is not public (preview); CantonSwap exposes no
explicit quote‑expiry field; Cantex's on‑ledger settlement is "atomic within the venue" but exposes
**no** CIP‑0056 allocation interface for external atomic co‑settlement, so its internal atomicity
does not make it co‑settleable as a leg in *our* transaction. We did read‑only doc review only (no
funds moved, no testnet execution).

## Step 2 — Classification (Mode A vs Mode B)

- **Mode A — atomic‑split‑capable** (settles via CIP‑0056 allocations → can be a leg in our
  single‑transaction atomic settlement, Task 003.6): **none of the accessible retail venues today.**
  Mode A counterparties are CIP‑0056‑native: RFQ market makers / institutional venues that expose
  the `Allocation`/`AllocationRequest` interfaces, and **our own CIP‑0056 test venue** (the
  `TestAmuletTokenDvP`/per‑leg model proven in Task 003 / 003.6).
- **Mode B — quote‑only / deposit‑based** (usable quote; settles via the venue's own
  deposit/detect/execute flow): **CantonSwap, OneSwap** (confirmed); **CompassSwap** (preview,
  intent/async — provisionally B); **Cantex** (quote + venue‑internal execute; B for integration
  purposes — not externally co‑settleable).

**Honest implication.** Atomic, all‑or‑nothing multi‑venue split **across today's accessible retail
DEXs is not currently possible** — they do not expose CIP‑0056 allocation co‑settlement. Atomic
split therefore targets Mode A counterparties (RFQ MMs / CIP‑0056‑native venues / our test venue).
Mode B venues are integrated as **quote sources executed via a managed, non‑atomic path.**

## Step 3 — Dual‑architecture design (decision)

Two execution paths coexist behind one adapter interface; **nothing is removed.**

### Atomic path (Mode A) — unchanged

The existing `daml/synfin-settlement` per‑leg‑authorization + executor‑only‑coordinator atomic
split (Task 003.6; RFC‑0003). Multiple Mode A legs settle in **one** Daml transaction,
all‑or‑nothing, with on‑ledger `minReceive`/`maxSlippageBps`/`deadline` enforcement and per‑leg
confidentiality. No change.

### Managed/deposit path (Mode B) — conceptual design

A Mode B leg cannot be a leg in the atomic transaction (the venue owns execution). It is executed
by a **managed executor** the taker authorizes, per venue, as a separate (non‑atomic) flow:

1. **Quote** via the venue adapter (normalized `Quote`).
2. **Deposit** the input to the venue's settlement target — `swapAddress`+`memo` / `magicAddress`
   (CantonSwap) or pool party + transfer reference (OneSwap) — by transferring from the taker's
   party with the venue‑supplied reference.
3. **Detect/confirm**: poll the venue / ledger for execution and the returned output to the taker's
   party; record the outcome.

Protections, given the venue owns execution:
- **Slippage:** rely on the venue's own `minOutAmount`/`slippageTolerance` (CantonSwap `minOutAmount`;
  OneSwap tolerance with auto‑cancel + refund). The managed executor sets these to the taker's bound
  and treats a fill below it as a venue‑side cancel (refund), not a Synfin guarantee.
- **Expiry / refund:** bounded by the venue's intent window (e.g. OneSwap's 24h → auto‑refund on
  expiry/over‑slippage). The managed path tracks the deadline and reconciles the refund.
- **Idempotency:** the venue **transfer reference / memo** (one per intent) is the idempotency key —
  re‑sending the same reference must not double‑execute; the managed executor records
  reference→outcome and never re‑deposits a settled/expired reference. (`intentId` maps to the
  reference.)

**Trade‑off (stated honestly):** the managed path is **not atomic across venues**. Mode B legs
execute **independently/sequentially**, each with venue‑side cancel‑and‑refund as the failure mode —
there is **no all‑or‑nothing across Mode B legs** (a multi‑Mode‑B route can partially fill: some legs
execute, others refund). Synfin does not (and must not claim to) make deposit‑based venues atomic.

### `VenueAdapter` port — capability declaration (interface‑level only)

The port must let the router/coordinator know whether a venue can settle atomically. Proposed
minimal addition (TSDoc/interface design only — **not implemented here**):

```ts
type SettlementMode =
  | 'atomic-allocation' // Mode A: CIP-0056 allocation; can be an atomic leg
  | 'managed-deposit';  // Mode B: quote only; executed via the managed deposit path

interface VenueAdapter {
  readonly venueId: VenueId;
  readonly settlementMode: SettlementMode; // NEW: declared capability
  quote(request: QuoteRequest): Promise<Quote | QuoteRejection>;
}
```

Mode B adapters additionally implement a separate, optional `ManagedExecution` interface (design
sketch; Task 005): `depositInstructions(quote) -> { target, reference }` and
`observeExecution(reference) -> Settled | Refunded | Pending`. Mode A adapters expose the allocation
hooks the settlement library already uses. The `quote` surface is common to both.

**Proposed SPEC §5 edit (follow‑up RFC — do NOT apply now):** §5 currently defines only the quote
endpoint. Add that a Venue/adapter MUST declare its `settlementMode` (`atomic-allocation` |
`managed-deposit`); atomic split (§6) applies only to `atomic-allocation` venues; `managed-deposit`
venues are quote sources executed via the managed path, which is explicitly non‑atomic across venues
(§7 quote‑time privacy and MEV immunity still hold; settlement‑time per‑leg confidentiality is a
property of the atomic path). This is flagged as a future RFC, consistent with the zero‑assumption
rule.

### Routing implications (no hand‑waving)

- The reference `Router` (`@synfin/router-ref`) produces a `RoutePlan`; only **Mode A** legs may be
  co‑settled atomically by `daml/synfin-settlement`.
- A route is **homogeneous by settlement mode for atomic settlement**: the atomic coordinator accepts
  only `atomic-allocation` legs. **Mode B legs are never placed in the atomic transaction.**
- A **mixed** route is handled by **partitioning**: Mode A legs (if any) settle atomically in one
  transaction; each Mode B leg executes via its own managed deposit flow. Because Mode B is
  non‑atomic, the SDK/coordinator MUST surface this (the overall execution is best‑effort across the
  Mode B portion, with per‑leg refund on failure) — or, when the taker requires strict
  all‑or‑nothing, **restrict the route to Mode A only**. The router SHOULD expose the modes in the
  plan so the caller chooses; it MUST NOT present a Mode‑B‑containing route as atomic.
- Until a Mode A counterparty is integrated, multi‑venue execution across today's accessible venues
  is **managed (non‑atomic)**; atomic split is demonstrated against a Mode A test venue.

## Step 4 — Honest positioning

> Synfin provides a **unified quote layer** across heterogeneous Canton venues; **atomic,
> all‑or‑nothing split settlement** for CIP‑0056‑allocation counterparties (RFQ MMs /
> CIP‑0056‑native venues); and a **managed execution path** for deposit‑based venues
> (CantonSwap, OneSwap, …) — all behind one `VenueAdapter` interface. Quote‑time privacy and
> MEV immunity (no public mempool) hold for every venue; **per‑leg‑confidential atomic
> settlement** is a property of the atomic path, not of deposit‑based venues. We do **not** claim
> atomic split across venues that do not support CIP‑0056 allocations.

## Task‑005 adapter plan

- **Two Mode B adapters** against real quote APIs, no funds: **CantonSwap** (`POST /nswap/quote`,
  `GET /nswap/tokens`) and **OneSwap** (intent/quote via `docs.oneswap.cc` / SDK). Normalize each to
  the standard `Quote`; declare `settlementMode = 'managed-deposit'`. Tested with **recorded/golden
  fixtures** captured from the real quote responses + a deterministic mock harness, run through the
  existing adapter conformance suite (spec‑valid, deterministic, never overstates).
- **One Mode A demonstration:** atomic settlement against a **CIP‑0056 Mode A counterparty** — our
  own CIP‑0056 test venue (the `TestAmuletTokenDvP`/per‑leg pattern) — proving an atomic split leg
  end‑to‑end on the local sandbox / testnet (no real funds).
- The managed‑deposit execution flow (deposit → detect → reconcile/refund) is built and tested
  against recorded fixtures; live testnet deposit execution is deferred (Task 005 scope decision).

## Consequences

- Positive: a single adapter surface spans every accessible Canton venue today (all Mode B) while
  preserving the atomic CIP‑0056 capability for when Mode A counterparties are available; claims
  match reality.
- Negative / trade‑offs: multi‑venue execution across today's venues is non‑atomic (managed); the
  atomic differentiator depends on Mode A counterparties existing. A `settlementMode` capability is
  new surface (proposed, not yet applied).
- Open/closed + neutrality preserved: no proprietary dependency; both paths are open.
- Follow‑ups: the §5 `settlementMode` RFC; Task 005 adapters; revisit venue modes as CompassSwap
  exits preview and CIP‑0056‑native venues/RFQ MMs come online.

## Alternatives considered

- **Drop the atomic model and build only deposit‑based integration.** Rejected by the maintainer:
  the CIP‑0056 atomic split is the core differentiator and must remain for Mode A counterparties.
- **Force deposit‑based venues into the atomic transaction.** Rejected: impossible — they expose no
  CIP‑0056 allocation interface; claiming otherwise would be false.
- **Quote‑only (no execution) for Mode B.** Rejected: a usable product needs the managed execution
  path; we design it honestly as non‑atomic rather than omit it.
