# Synfin website copy — v2 (voice rework)

Full rewrite of the site copy in a new, public-ready voice. Visuals, layout, and structure are
unchanged: this is COPY only. Studied against Jupiter, 1inch, LI.FI, and Titan.

## Voice
Confident, plain, outcome-first, lightly institutional but accessible. Lead with what the reader gains
(best price, best execution, atomic and private settlement), not internal mechanics. Name the problem
like a human. Trust stated plainly (open, neutral, holds no liquidity, no mempool). Proof comes from the
outcome and the real capability, not from internal metrics.

## Global copy rules
- NO em dashes or en dashes anywhere. Use a colon, a comma, a middle dot (·), or split into two
  sentences. Never use a hyphen to mimic a dash. Hyphens are fine only inside compound modifiers
  (best-execution, per-leg, on-ledger, real-time) and inside names (CIP-0056, @synfin/sdk, musd-kit).
- Eyebrow separator is a middle dot, not a dash: "01 · The problem" (not "01 — The problem").
- Outcome first, plain words, short confident sentences. Vary sentence length.
- Any demo number is labelled illustrative. Never imply live or measured results.
- Do not headline test counts or CIP numbers. Lead with the capability or the gain; keep standard
  references small and factual.

---

## Nav
Logo (Synfin seal + wordmark) · links: How it works · Proof · Open · Build · [Read the spec ↗] [GitHub]

## Meta / OpenGraph
- Title: `Synfin: best execution for Canton`
- Description: `The open, neutral routing layer that finds the best price across every Canton venue, then
  settles it in one atomic, private transaction.`
- OG card line: `Best execution, native to Canton.`

---

## 1 · Hero
- Headline (tonal): **Best execution,** / `native to Canton.` (kept: already outcome-first and strong)
- Subline: `The open, neutral layer that routes every trade across all of Canton's liquidity for the best
  price, then settles it in one atomic, private transaction.`
- Buttons: `Read the spec ↗` · `View on GitHub`
- Constellation marker (unchanged): `● best route · +47.8 bps`

## 2 · The problem  (eyebrow `01 · The problem`)
- Heading (tonal): **Every venue** / `prices it differently.`
- Lead: `Canton's liquidity is spreading across AMMs, order books, and RFQ desks. Each one quotes the
  same pair at a different price, and there is no neutral layer comparing them. So every trade risks the
  wrong venue, and every team rebuilds the same routing logic. Synfin is that layer.`
- Pull line (replaces the "1 · 0" gimmick): **One standard for tokens. No standard for getting the best
  price.** with a quiet second line: `That is the layer Synfin builds.`
  (If you prefer to keep a stat, use `1 · 0` with label `one token standard · zero best-execution
  layers` — still dash-free.)

## 3 · How it works  (eyebrow `02 · How it works`)
- Heading (tonal): **One call.** / `The whole market.`
- Lead: `Tell Synfin what you want to trade. It quotes every venue, splits your order for the best price,
  and settles the whole thing in one transaction.`
- Step list (4 rows; step 4 is the active/ember one):
  1. **Quote** · `pull live prices from every venue`
  2. **Compare** · `find the best execution across all of them`
  3. **Split** · `route the order to the venues that fill it best`
  4. **Route & settle** · `execute the split as one atomic, private transaction`

## 4 · Proof  (eyebrow `03 · Proof`)  — leads with the gain, not the test count
- Heading (tonal): **Proven,** / `not promised.` (kept)
- RouterCard (illustrative):
  - header: `Best execution` · `CC → USDCx`
  - figure: `You route 250,000 CC` · `slippage 0.30%`
  - split bars: `CantonSwap 46% · 18,372` / `OneSwap 33% · 13,181` / `RFQ desk 21% · 8,387`
  - edge (hero number): **+47.8 bps better than the best single venue** · `≈ +191 USDCx more, you
    receive 39,940`
  - settle row: `Settles atomically. Every leg in one transaction, each venue sees only its own.`
  - caption: `Illustrative example. Not live or measured data.`
- Supporting cells (NOTE: the old "8/8 tests" cell is replaced by capability, per the brief):
  - edge stat: **+47.8 bps** · `better than the best single venue`
  - settlement cell (was "8/8 tests"): **Atomic, on-ledger settlement** · `every leg in one transaction,
    proven on Canton`
  - privacy mini: **Per-leg privacy** · `each venue sees only its own leg`
  - standard cell (small, quiet): `Built on Canton's token standard` · `CIP-0056 / 0112`
  - split chart: `Venue split · 46 / 33 / 21`

## 5 · Per-leg privacy  (eyebrow `04 · Privacy`)
- Heading (tonal): **Each venue sees** / `only its own leg.`
- Lead: `Synfin settles the split so every venue verifies and executes only its own leg. The executor
  coordinates the whole atomic transaction, and no venue sees the others. With no public mempool, there
  is nothing to front-run.`
- Caveat: `Per-leg privacy is not anonymity to your own counterparty. A venue does not see other venues'
  legs, but it does see its own.`
- Diagram labels (unchanged): executor `250,000 CC → 39,940 USDCx`; OneSwap "your leg" visible with
  `33% · 82,500 CC · 13,181 USDCx`; CantonSwap and RFQ desk `sealed · hidden from you`.

## 6 · Settlement modes  (eyebrow `05 · Settlement`)
- Heading (tonal): **Two settlement modes.** / `One adapter interface.`
- Mode A — **Atomic allocation** (badge `atomic`):
  - sub: `The venue co-settles through the token standard's allocation flow. Eligible for Synfin's
    atomic, per-leg-private settlement.`
  - checks: `Atomic co-settlement: all legs in one transaction.` / `Per-leg privacy: each venue sees
    only its leg.` / `All or nothing: settles via CIP-0056 / 0112.`
  - chip: `settlementMode: 'atomic-allocation'`
- Mode B — **Managed deposit** (badge `deferred`):
  - sub: `Quote-and-deposit venues. Synfin still aggregates their quotes, but execution is deferred and
    settles separately.`
  - rows: `Quote and deposit: included in routing.` / `Deferred execution: not same-transaction.` /
    `Non-atomic: outside the all-or-nothing guarantee.`
  - chip: `settlementMode: 'managed-deposit'`
- Honest note: `Atomic settlement is valid only when every leg is Mode A, and the router enforces it.
  Most accessible Canton venues today are managed-deposit, and CIP-0112's native batch settlement is
  rolling out. Quote aggregation works across both now, and the atomic path turns on as venues adopt the
  allocation flow.`

## 7 · Open by design  (eyebrow `06 · Open & neutral`)
- Heading (tonal): **An aggregation layer,** / `not a new standard.`
- Lead: `The winning answer to fragmented liquidity is always an aggregation layer on top of the
  settlement rail: 1inch on EVM, Jupiter on Solana. Neither is a token standard. Both are neutral routers
  that became default infrastructure. Synfin is that layer for Canton. It adopts CIP-0056 / 0112 for
  settlement and contributes to it as an early implementer.`
- Chips: `Open · Apache-2.0` / `Neutral: no venue of our own` / `Self-hostable` / `Adopts and
  contributes to CIP-0056 / 0112`
- One-liner: `Synfin holds no liquidity and favors no venue. It is neutral infrastructure on top of the
  token standard.`
- Stack diagram caption: `1inch · EVM    Jupiter · Solana    Synfin · Canton`
- Layer labels (unchanged): `Synfin` aggregation layer "settles via" `Canton Network` token standard.

## 8 · Ecosystem  (eyebrow `07 · Who it's for`)
- Heading (tonal): **Built for everyone** / `routing on Canton.`
- Venues: `Implement one adapter and become reachable through every Synfin integration. More flow, no new
  counterparties to chase.` · meta `one adapter · every integration`
- Wallets & apps: `One SDK for best-execution swaps across all of Canton's liquidity. Drop it in and
  route every trade to the best price.` · meta `one SDK · all of Canton`
- Institutions: `Best execution with settlement atomicity and per-leg confidentiality, provable to the
  basis point, on neutral open infrastructure.` · meta `provable best-ex · per-leg private`
- Context line: `Canton is where regulated, institutional liquidity is moving on-chain, on a common token
  standard. Synfin is the neutral best-execution layer on top of it.`

## 9 · Build  (eyebrow `08 · Build`)
- Heading (tonal): **From quote to settled,** / `in a few lines.`
- Lead: `One SDK call routes across every venue, splits for the best price, and settles the whole thing
  atomically, with per-leg privacy. No routing logic to rebuild.`
- Ticks: `One call: quote, route, settle.` / `Best price across all of Canton's liquidity.` / `Atomic
  and per-leg-private settlement.`
- Code: the real @synfin API (unchanged; CC keeps it). Comment lines must be dash-free.
- Captions: `Illustrative example output.` / `Routing and atomicity shown. On-ledger settlement via the
  token standard (CIP-0056 / 0112).`

## Final CTA
- Heading (tonal): **Build best execution into Canton.** / `Start with the spec.`
- Sub: `Open, neutral, and built on the token standard. Read the specification, or pull the SDK and route
  your first trade.`
- Buttons: `Read the spec ↗` · `View on GitHub`

## Footer
- Brand: `Synfin` · `The open, neutral best-execution layer for Canton. Stewarded by Cayvox Labs.`
- Meta dot (was "8/8 on-ledger tests"; test count removed): `built on CIP-0056 / 0112 · atomic,
  on-ledger settlement`
- Protocol column: `Specification ↗` · `GitHub ↗` · `npm ↗` · `Documentation ↗`
- More column: `Open & neutral` · `How it works` · `Cayvox Labs ↗` · `Contact`
- Bottom bar: `© 2026 Cayvox Labs · info@cayvox.com` · chips `Apache-2.0` · `Open source`

---

## What changed vs v1 (summary for the implementer)
1. Every em/en dash removed site-wide (prose, eyebrows, chips, captions, layer/analogy captions, the
   modes note, the privacy caveat). Replaced with colons, commas, middle dots, or split sentences.
2. Eyebrow separator changed from "—" to "·".
3. Test-count framing removed from user-facing copy: the Proof "8/8 tests" cell becomes "Atomic,
   on-ledger settlement · proven on Canton"; the footer/hero "8/8 on-ledger tests" becomes "atomic,
   on-ledger settlement". (This supersedes the 8/8-vs-pass wording question: the site no longer leads
   with a count.) The on-ledger settlement + per-leg-privacy capability is still stated, because it is
   real.
4. Problem section reframed from a clever line to plain user pain. How-it-works reframed to action verbs.
   Sublines and leads rewritten to lead with the gain.
5. Headings keep the tonal ink/muted two-clause design device (unchanged visual treatment); only the
   words are grounded and made more concrete.
6. Numbers and the "illustrative example" framing kept; honesty preserved.
