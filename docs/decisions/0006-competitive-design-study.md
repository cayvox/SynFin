# ADR‑0006: Competitive design study (what Synfin adopts and rejects)

- **Status:** Accepted
- **Date:** 2026‑06‑17
- **Deciders:** Cayvox Labs (steward)
- **Spec impact:** none (records rationale only; any normative change still requires an RFC)

## Context

Synfin is a best‑execution and liquidity‑routing standard for the Canton Network.
Routing, quoting, intent expression and atomic multi‑venue settlement are not new
problems — they have mature designs on EVM and Solana. Before committing the
`@synfin/spec` shapes and the three ports (ADR‑0005), we studied the incumbents so
our decisions are deliberate rather than accidental, and so the open/closed
boundary (ADR‑0004, GOVERNANCE.md §3) and the Canton constraints (no global state,
private contracts, same‑synchronizer atomicity — ADR‑0002, ARCHITECTURE.md §1) are
respected.

The forces at play:

- **Canton is not an EVM/Solana chain.** There is no public mempool, no globally
  readable AMM reserves, and contracts are private. Designs that depend on reading
  pool state or on a public orderflow do not port directly (ARCHITECTURE.md §1
  invariants #2, #4).
- **Neutrality.** Synfin must run fully open; any optimizer is a pluggable
  alternative behind the `Router` port, never a requirement (GOVERNANCE.md §3).
- **Atomicity is a ledger primitive here.** CIP‑0056 gives us real multi‑leg DvP
  in one transaction (ADR‑0003), which several incumbents only approximate.

This ADR documents what we **adopt** and **reject** from each incumbent and why it
maps (or does not) to Canton. Citations are to public documentation/protocol
descriptions; where a mechanism is well known it is described rather than quoted.

## Decision

We adopt the design elements below and reject the ones noted, mapping each to the
Synfin architecture. These choices are realized by the `@synfin/spec` types and
ports built in this milestone; none of them change the normative wire format.

### 1inch (Pathfinder; Fusion)

- **Pathfinder split routing** across venues and intermediate tokens.
  - **Adopt:** order *splitting* across venues. Our `RoutePlan` is explicitly a set
    of legs whose `give` amounts sum to the intent (SPEC §4.4 conservation), and the
    `Router` port is free to split across venues. The reference router optimizes net
    `receive` (see ParaSwap/Odos below).
  - **Defer (FUTURE spec extension):** multi‑hop routing through *intermediate*
    tokens. SQSS today is single‑hop (each leg is give→want for the same pair).
    Multi‑hop is noted as a future extension and **must be its own ADR/RFC** before
    any wire change (zero‑assumption rule). We did not encode it now.
- **Fusion intent + competing‑resolver (Dutch‑auction) model.**
  - **Adopt (direction):** the intent/RFQ direction — the taker expresses *what they
    want*, not *how to execute it*. This is our `SwapIntent` + Layer‑2 RFQ
    (`QuoteRequest`/`Quote`) with a pluggable `Router` (SPEC §4.1–4.3; ADR‑0002,
    ADR‑0005). A competing‑resolver market is *possible* because the `Router` is
    solver‑pluggable (see CoW below), but the auction mechanism itself is out of
    scope for the standard.
  - **Reject as unnecessary:** Fusion's bolt‑on **MEV protection**. Under Canton
    there is no public mempool and routes/amounts are private (SPEC §7), so
    front‑running/MEV is **structurally** mitigated rather than needing a protocol
    add‑on. We must still avoid leaking intent via timing/side channels (SPEC §7),
    which our privacy invariants already require.

### Jupiter (Metis; quote/build split; SDK‑as‑distribution)

- **Metis real‑time routing.**
  - **Adopt (shape):** routing consumes freshly gathered quotes rather than a static
    snapshot; quote gathering is concurrent and bounded by the deadline
    (ARCHITECTURE.md §8). The algorithm itself stays pluggable.
- **First‑class quote API separate from a transaction‑build API.**
  - **Adopt:** we mirror the **`quote → route → build atomic settlement`** split.
    `VenueAdapter.quote` gathers quotes, `Router.route` produces a plan, and
    `Settlement.prepareAllocations`/`settle` build and drive the atomic transaction
    (ports in this milestone; SPEC §5, §6). Keeping these as distinct ports is a
    direct lift of Jupiter's separation of "price discovery" from "transaction
    construction".
- **SDK as the primary distribution channel.**
  - **Adopt:** keep `@synfin/sdk` first‑class (ARCHITECTURE.md §3, §4). The SDK is
    the surface takers integrate; it composes the three ports. (Built in a later
    milestone; the ports it depends on are defined here.)

### CoW Protocol (batch auctions; competing solvers; uniform clearing price; CoWs)

- **Competing solvers behind a single settlement.**
  - **Adopt:** keep the `Router` **solver‑pluggable** so a competing‑solver market
    remains possible (ADR‑0004 already leaves this door open; ADR‑0005). The
    intent‑on‑ledger / solve‑off‑ledger / settle‑atomically split is exactly our
    architecture (SPEC §4 intent, §5 off‑ledger quotes, §6 on‑ledger atomic DvP).
- **Batch auctions, uniform clearing price, coincidence‑of‑wants.**
  - **Note / do not adopt now:** these are *solver/market* mechanisms, not interface
    requirements. The standard neither mandates nor forbids them; a solver MAY
    implement them as long as it consumes/produces the standard types and respects
    the §4 constraints. We deliberately keep them out of the normative spec to stay
    neutral (SPEC §1, §12). Batching also interacts with privacy and with
    same‑synchronizer atomicity (SPEC §6) and would need its own ADR/RFC.

### ParaSwap / Odos (gas/fee‑aware; optimize on NET output)

- **Optimize on net output, fees included.**
  - **Adopt:** the reference router optimizes **net `receive`** — fees are already
    reflected in `Quote.receive` and declared via `feeBps` for transparency
    (SPEC §4.3). Our constraint predicates compare against `worstCaseReceive` and the
    taker's `minReceive` floor (SPEC §4.4), and rounding is always taker‑favorable
    (SPEC §3, `roundTakerFavorable`). Synfin has no gas token, but the *principle* —
    rank by what the taker actually nets, not nominal output — is adopted directly.

## Consequences

- **Positive:**
  - Our types/ports are justified against the state of the art; reviewers can see
    what was intentionally taken and intentionally left out.
  - Splitting, intent/RFQ, the quote→route→settle separation, solver‑pluggability,
    and net‑output optimization are all expressible *today* with the shapes built in
    this milestone, with no proprietary dependency (open/closed boundary preserved).
- **Negative / trade‑offs:**
  - We explicitly forgo features that are valuable on other chains (multi‑hop,
    batch auctions, MEV‑protection add‑ons) for now. Some of these are genuinely
    useful and may return as RFCs; until then Synfin is comparatively minimal.
- **Follow‑ups:**
  - **Multi‑hop routing** as a FUTURE spec extension — its own ADR/RFC before any
    wire change. SQSS is single‑hop today.
  - **Competing‑solver / batch‑auction market** mechanics — optional, solver‑side;
    requires an ADR/RFC if it ever touches the wire format or settlement.
  - Revisit MEV/timing side‑channel guidance in the threat model as adapters land.

## Alternatives considered

- **Adopt multi‑hop now (1inch‑style intermediate tokens).** Rejected for this
  milestone: it expands the wire format and the settlement graph (more legs, more
  synchronizer constraints) and is undefined in the current spec; doing it silently
  would violate the zero‑assumption rule. Deferred to a dedicated RFC.
- **Bake a batch‑auction/uniform‑clearing market into the standard (CoW‑style).**
  Rejected: it is a market mechanism, not an interface; mandating it would break
  neutrality (GOVERNANCE.md §3) and constrain implementers. Left possible via the
  pluggable `Router`.
- **Add explicit MEV‑protection machinery (Fusion‑style).** Rejected as
  unnecessary on Canton: privacy + no public mempool make it structurally moot
  (SPEC §7); we keep only the timing/side‑channel cautions already in the spec.
