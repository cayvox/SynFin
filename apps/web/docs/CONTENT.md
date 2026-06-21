# Synfin — Website Content & Copy

Section-by-section site map with **final copy**. Use this copy verbatim (light polish allowed).
It is deliberately honest and specific — match it. Do **not** invent metrics, partners, or
"first/only" claims. Structure follows the partylayer.xyz logic: a focused, dev-oriented,
single-page protocol site.

> **Positioning (read first).** Synfin is the open, neutral **best-execution aggregation layer** for
> Canton — like 1inch on EVM or Jupiter on Solana — built **on top of** Canton's token standard
> (CIP-0056 and the V2 batch-settlement in CIP-0112). **It is not a venue, and not a competing
> settlement standard.** Settlement happens through the token standard's allocation / batch-settlement
> flow, which Synfin **adopts** (and contributes to as an early implementer). Synfin's value is
> routing quality, breadth, openness, and proven per-leg-private execution — not owning a spec.

Page `<title>`: `Synfin — Best execution for Canton`
Meta description: `The open, neutral best-execution aggregation layer for the Canton Network: aggregate quotes across venues, route to the best price, and settle atomically with per-leg privacy — built on Canton's token standard (CIP-0056/0112).`
Canonical: `https://synfin.xyz` (domain pending — keep configurable).

---

## 1 — Hero  (product-led)

- Eyebrow: `Open best-execution layer · Canton`
- Headline (display): **Best execution, *native* to Canton.**
- Subhead: *Synfin gathers quotes across Canton's venues, routes to the best price, and settles the split in one atomic transaction, with proven per-leg privacy. The open, neutral aggregation layer for Canton — built on the token standard, not a venue.*
- Primary CTA: `Read the specification` → (spec). Secondary: `View on GitHub` → repo.
- Proof row: `Open · Apache-2.0` · `Built on CIP-0056 & 0112` · `8/8 on-ledger settlement tests`
- Centerpiece: the **routing constellation** (see DESIGN.md §6/§8). Venue nodes around the periphery,
  with quotes (CC/USDCx): CantonSwap `124.81` · OneSwap `124.63` · CompassSwap `124.55` · Cantex `124.72`
  · RFQ desk `125.04`. Thin ember lines from the three best-route venues (CantonSwap + OneSwap + RFQ desk)
  converge to a low-center marker: `● best route · +47.8 bps`.
- Bottom band: left `01 / 03 · SCROLL`; right proof tag `● built on CIP-0056 / 0112 · 8/8 on-ledger settlement tests`.
- The detailed best-execution **RouterCard** does NOT live in the hero — it moves to §4 (Proof bento).

> These figures are an **illustrative demo**, not measured production numbers. Do not label them
> as live/measured anywhere.

---

## 2 — The problem  (eyebrow: `01 — The problem`)

Heading: **Canton has a token standard. It doesn't have a best-execution layer — yet.**

Body (2–3 short paragraphs):
- Canton's token standard (CIP-0056/0112) gave the network a common settlement rail: any compliant
  asset can settle atomically via allocations. Liquidity is now arriving — AMMs, order books, RFQ desks.
- But there is **no neutral way to compare prices across venues**, and **no standard quote interface**:
  CIP-0056/0112 standardize tokens, transfers, and *settlement* — not *quotes* or *routing*. A taker
  who hits one venue leaves price on the table.
- On every other chain, the answer to fragmentation is the same: an **aggregation / best-execution
  layer** on top of the settlement rail. Canton doesn't have one yet.

Pull-stat (optional, mono): `1 token standard, 0 best-execution layers` / `no standard quote interface`.

---

## 3 — What Synfin does  (eyebrow: `02 — How it works`)  — renders as the ORBITAL (DESIGN §12 governs layout)

Heading: **One engine. The whole market.** ("The whole market." muted.)
Intro: *Synfin scans every Canton venue at once, locks the best route — one venue or a split across several — and settles it atomically, with per-leg privacy.*

Renders as the router orbital (see DESIGN.md §12 §3 + `reference/synfin-orbital.png`): the orbital tells
the story (scan venues → lock best route 46/33/21 → settle atomically → +47.8 bps), and a left-column
4-row step list carries the words. The five underlying stages (use for the step copy):
1. **Intent.** You express a swap intent — what you give, what you want, your limits (min receive, slippage, deadline).
2. **Quote.** Synfin gathers quotes across every connected venue through one normalized interface.
3. **Route.** A deterministic router finds the best execution — a single venue or a split across several — net of fees.
4. **Settle.** The split settles in **one atomic transaction** via Canton's token standard (CIP-0056/0112): all legs or none.
5. **Edge.** You see exactly what aggregation earned you, to the basis point, versus the best single venue.

Left-column list collapses these to 4 rows: 01 Intent · 02 Quote · 03 **Route & settle** (active) · 04 Edge.

---

## 4 — The proof  (eyebrow: `03 — Already delivered`)  — lead with substance

Heading: **Proven, not promised.**

Body:
- Synfin settles through **Canton's token standard** — CIP-0056, and the privacy-preserving
  batch-settlement (`SettlementFactory_SettleBatch`) introduced in **CIP-0112 (Token Standard V2)**.
  A multi-venue split settles in a **single atomic transaction**, enforcing conservation, min-receive,
  slippage floor, single-use allocations, and all-or-nothing.
- We built and proved this end-to-end: **8/8 on-ledger settlement tests pass**, including a test that proves
  **one venue cannot see another venue's leg**. We are early implementers of the V2 batch-settlement
  flow — and we contribute that real-world experience back to the standard.
- Two honest demonstrations:
  - **Quote aggregation** against real Canton venues (CantonSwap, OneSwap) — works today.
  - **Atomic split settlement** against our own CIP-0056 test venue — the architecture is proven and
    moves to native V2 batch settlement as the standard rolls out.

Proof chips (mono): `Built on CIP-0056 / 0112` · `Atomic settlement 8/8` · `2 live venue adapters` · `Apache-2.0`.

**RouterCard (the bento centerpiece — dark-glass, see DESIGN.md §5):** the canonical illustrative demo —
route `250,000 CC` → receive `39,940 USDCx`, slippage `0.30%`, pair `CC → USDCx`; split CantonSwap `46%`
`18,372 USDCx` · OneSwap `33%` `13,181 USDCx` · RFQ desk `21%` `8,387 USDCx`; edge `+47.8 bps` vs the best
single venue (`≈ +191 USDCx`); `Atomic settlement. All legs in one transaction — per-leg private.`
(Illustrative demo — never label as measured/live.) Sits in the bento alongside the +47.8 edge stat, a
per-leg-privacy mini-diagram, 8/8 on-ledger settlement tests, a CIP-0056/0112 badge, and a 46/33/21 venue-split chart.

> Honesty: the settlement demo runs against our own CIP-0056 test venue (no mainnet funds). Say so.

---

## 5 — Per-leg privacy  (eyebrow: `04 — Confidentiality`)

Heading: **Each venue sees only its own leg.**

Body:
- Synfin settles a split so that **each venue can verify and execute its own leg without seeing the
  others**. This is exactly the privacy model the token standard's V2 batch settlement
  (CIP-0112) is built for: the coordinator (executor) submits the whole atomic transaction; per-leg
  authorizations keep each leg's details compartmentalized.
- Because settlement happens without a public mempool, there is **no front-running surface** — MEV is
  structurally prevented at settlement.
- Honest caveat (state it plainly): **MEV-immunity and per-leg confidentiality are different
  guarantees.** Per-leg confidentiality means a venue does not see *other* venues' legs; it does not
  make your own leg anonymous to your own counterparty.

(Interactive in premium pass: hover a venue to reveal it sees only its own leg.)

---

## 6 — How venues plug in  (eyebrow: `05 — Architecture`)

Heading: **Two settlement modes. One adapter interface.**

Body:
- Every venue adapter declares a `settlementMode`:
  - **`atomic-allocation` (Mode A):** the venue co-settles via the token standard's allocation /
    batch-settlement flow (CIP-0056/0112) — eligible for Synfin's atomic, per-leg-private settlement.
  - **`managed-deposit` (Mode B):** quote-and-deposit venues; execution is deferred and non-atomic.
- A normative rule: **atomic settlement is valid only when every leg is Mode A.** The router enforces it.
- Honest status (state it): **most accessible Canton venues today are Mode B**, and CIP-0112's native
  batch settlement is rolling out. Synfin's quote aggregation works against venues now; the atomic
  path is proven and turns on as venues adopt the V2 settlement flow.

Two-column compare: Mode A (atomic-allocation, via CIP-0056/0112) vs Mode B (managed-deposit), what each guarantees.

---

## 7 — Open by design  (eyebrow: `06 — Open & neutral`)

Heading: **An aggregation layer, not a new standard.**

Body (the 1inch / Jupiter precedent):
- The winning answer to fragmented liquidity is always an aggregation layer on top of the settlement
  rail — **1inch on EVM, Jupiter on Solana**. Neither is a token standard; both are neutral routers
  that became default infrastructure. **Synfin is that layer for Canton.**
- We **build on** Canton's token standard, we don't compete with it. Synfin **adopts** CIP-0056/0112
  for settlement and **contributes** to its evolution as an early real-world implementer.
- **Open (Apache-2.0, grant-funded):** the reference aggregator / router, the venue adapters, the
  TypeScript SDK, an off-ledger quote / swap-intent interoperability spec, a reference UI, and a
  conformance program. Anyone can build on it; no lock-in.
- **Built on top (Cayvox):** routing / optimization at scale, hosted execution, an RFQ network, and
  institutional best-execution / TCA reporting.

One line: *Synfin holds no liquidity and favors no venue. It is neutral infrastructure on top of the token standard.*

---

## 8 — For the ecosystem  (eyebrow: `07 — Who it's for`)

Heading: **Built for everyone routing on Canton.**

Three audience cards:
- **Venues** — implement one adapter; become reachable through every Synfin integration.
- **Wallets & apps** — one SDK for best-execution swaps across all of Canton's liquidity.
- **Institutions** — best execution with settlement atomicity and per-leg confidentiality, on neutral, open infrastructure.

Canton context line (honest, no overclaiming): *Canton is where regulated, institutional liquidity is
moving on-chain — on a common token standard. Synfin is the neutral best-execution layer on top of it.*

---

## 9 — Footer

- Left: seal mark + `Synfin` · `stewarded by Cayvox Labs`
- Links: `Specification` · `GitHub` · `npm` · `Docs` · `Cayvox`
- Right: `info@cayvox.com` · `Open · Apache-2.0`
- (Optional) the ledger ticker sits just above the footer.

---

## Global copy rules
- Honest and specific. No "first/only", no invented metrics or partners, no hype, no emoji.
- "Proven" only where literally proven (8/8 tests). Otherwise "designed to" / "turns on as".
- **We are an aggregation layer on top of CIP-0056/0112 — never a venue, never a competing standard.**
  We adopt and contribute to the token standard; we don't reinvent settlement.
- We are complementary to venues, never their competitor in copy.
- Numbers are illustrative unless explicitly from tests/spec; never imply measured production data.
