# Synfin Quote & Swap‑Intent Standard (SQSS)

`Spec version: 0.5.0 (draft)` · `Status: working draft — RFC required for normative changes`

> Changes in `0.5.0` are driven by [RFC‑0004](../rfcs/0004-settlement-mode-capability.md): a Venue
> declares a `settlementMode` capability (`atomic-allocation` | `managed-deposit`) that is carried on
> every `Quote` (§4.3) and on the Venue interface (§5); atomic settlement (§6) is normatively valid
> **only when every leg is `atomic-allocation`**.
>
> Changes in `0.4.0` are driven by [RFC‑0003](../rfcs/0003-privacy-model.md): §7 is scoped to the
> per‑leg‑authorization + executor‑only‑coordinator settlement model (per‑leg confidentiality), the
> co‑signed `OTCTrade` pattern is declared non‑conformant for multi‑venue routing, and MEV immunity
> is distinguished from per‑leg confidentiality.
>
> Changes in `0.3.0` are driven by [RFC‑0002](../rfcs/0002-router-port-now-and-result.md): the
> `Router` contract takes a per‑call `now` and returns a typed `RouteResult` (§4.5, §10) instead
> of a bare `RoutePlan`.
>
> Changes in `0.2.0` are driven by [RFC‑0001](../rfcs/0001-assetid-minreceive-quote-linkage.md):
> the `AssetId` shape (§3), `minReceive > 0` (§4.1), the `Quote.quoteId` field (§4.3), and the
> redefined no‑overstatement + quote‑linkage rules (§4.4).

This is the **normative** specification. The key words MUST, MUST NOT, SHOULD, SHOULD NOT, and MAY are to be interpreted as in RFC 2119. This document builds directly on the **Canton Network Token Standard (CIP‑0056)** and does not redefine anything CIP‑0056 already provides; it composes it.

> Non‑normative material is marked *(note)*. Everything else is normative.

## 1. Scope & goals

SQSS defines a vendor‑neutral way to:

1. express a **swap intent** (what a taker wants),
2. request and represent **quotes** from venues, and
3. compose an **atomic, all‑or‑nothing settlement** of a multi‑leg route on Canton.

SQSS does **not** define: the routing optimization algorithm (pluggable; MAY be proprietary), pricing/oracles, custody, or any hosted service.

*(note)* The optimizer is intentionally out of scope so the standard stays neutral; an open reference router is provided in `@synfin/router-ref`.

## 2. Roles

- **Taker** — expresses a `SwapIntent`.
- **Venue** — a liquidity source that answers `QuoteRequest`s with `Quote`s and, for firm quotes, participates in settlement via CIP‑0056 allocations.
- **Router** — selects/splits quotes into a `RoutePlan`, returning a typed `RouteResult` (§4.5). Implements the `Router` port. The reference router is open; alternatives MAY be proprietary but MUST consume/produce the standard types.
- **Settlement coordinator** — the Daml application that drives the single atomic settlement transaction using CIP‑0056 allocation APIs.

## 3. Conventions

- **Asset identification.** An asset MUST be identified by a registry‑qualified instrument identifier consistent with CIP‑0056 (the issuing registry plus the instrument), never by symbol alone. An `AssetId` has exactly three fields:
  - `registry` — the issuing registry / token administrator identifier (the authority).
  - `instrumentId` — the instrument identifier within that registry.
  - `decimals` — a non‑negative integer, the instrument's precision.
  - `decimals` is **not authoritative on its own**: it MUST be consistent with the precision the issuing registry reports via the CIP‑0056 **token metadata API** (Appendix A). It is carried in `AssetId` only so off‑ledger validation works without global readable state (ARCHITECTURE.md §1, invariant #2); the registry remains the source of truth and `decimals` is its off‑ledger echo. Implementations SHOULD verify `decimals` against the registry's token metadata when available, and MUST reject quotes/intents whose amounts are inconsistent with the stated `decimals`.
- **Amounts** are exact decimals with the instrument's defined precision. Implementations MUST NOT use binary floating point for value math. An amount MUST NOT carry more fractional digits than its asset's `decimals`.
- **Rounding** MUST never overstate what the taker receives or understate what the taker gives. Where rounding is required, it MUST be applied in the taker's favor or rejected.
- **Time** is UTC. Deadlines and validity are absolute timestamps.
- **Basis points (bps):** 1 bps = 0.01%.

## 4. Data model (normative shapes)

*(note)* Types are shown in TypeScript‑like form for clarity. The authoritative schemas are JSON Schema in `@synfin/spec`; on‑ledger shapes are Daml interfaces. Off‑ledger HTTP shapes are described with OpenAPI, mirroring CIP‑0056's "Daml interface + OpenAPI" convention.

### 4.1 SwapIntent

```
SwapIntent {
  intentId:        string         // unique; replay/idempotency key
  taker:           PartyId        // Canton party
  give:            { asset: AssetId, amount: Decimal }
  want:            { asset: AssetId, minReceive: Decimal }   // floor the taker accepts; MUST be > 0
  maxSlippageBps:  integer        // additional protection vs reference; >= 0
  deadline:        Timestamp      // absolute expiry; settlement MUST NOT occur after
  constraints?:    IntentConstraints
}
IntentConstraints {
  maxVenues?:      integer        // optional cap on number of legs
  venueAllowList?: VenueId[]      // optional restriction
  privacy?:        "strict"       // default strict: no leg may learn the aggregate
}
```

- `minReceive` is authoritative and MUST be strictly greater than 0; a non‑positive floor is invalid and MUST be rejected at validation (RFC‑0001 Decision B). `maxSlippageBps` is an additional guard relative to an agreed reference; it MUST NOT relax `minReceive`.
- A settlement that would deliver less than `minReceive` MUST fail.

### 4.2 QuoteRequest

```
QuoteRequest {
  intentRef:   string        // intentId
  give:        { asset: AssetId, amount: Decimal }   // size for THIS request (a bucket)
  want:        { asset: AssetId }
  deadline:    Timestamp
  nonce:       string        // replay protection
}
```

- A Router MAY issue multiple `QuoteRequest`s per intent at different sizes ("buckets") to estimate depth. A Venue MUST treat each request independently.
- A Venue MUST NOT be able to derive the taker's total intent from a single `QuoteRequest` (privacy, §7).

### 4.3 Quote

```
Quote {
  quoteId:     string             // unique id set by the venue/adapter; unique within an intent's quote round
  venueId:     VenueId
  give:        { asset: AssetId, amount: Decimal }   // echoes requested size
  receive:     { asset: AssetId, amount: Decimal }   // offered output
  feeBps:      integer            // fees already reflected in `receive`; declared for transparency
  sourceKind:  "AMM" | "CLOB" | "RFQ"
  settlementMode: "atomic-allocation" | "managed-deposit"   // how the venue settles (§5, §6; RFC‑0004)
  firmness:    "indicative" | "firm"
  validUntil:  Timestamp
  commitment?: CommitmentRef      // REQUIRED if firmness == "firm"
  signature?:  Signature          // REQUIRED if firmness == "firm"
}
```

- `quoteId` MUST be present and unique within the scope of an intent's quote‑gathering round; it is the identifier a `RouteLeg.quoteRef` resolves to (§4.4, RFC‑0001 Decision C).
- An **indicative** quote is non‑binding. A **firm** quote MUST be backed by a `commitment` that can be honored on‑ledger during settlement, and MUST be signed by the venue.
- `settlementMode` MUST be present and MUST equal the issuing Venue's declared settlement mode (§5). It states how this leg settles (RFC‑0004): `atomic-allocation` means the venue settles via a CIP‑0056 allocation, so the leg MAY be part of a single atomic Daml transaction (§6); `managed-deposit` means the venue settles out of band (e.g. against a managed deposit/balance), so the leg MUST NOT be co‑settled atomically with other legs. It is carried on the `Quote` (alongside `sourceKind`) so a Router operating on quotes (§4.5) can determine each leg's settlement mode without separate venue lookup.
- Consumers MUST reject quotes where `validUntil` has passed, where amounts are non‑positive, where decimals/units are inconsistent with the instrument, where `settlementMode` is absent or unrecognized, or (for firm) where the signature/commitment does not verify.

### 4.4 RoutePlan

```
RoutePlan {
  intentRef:        string
  legs:             RouteLeg[]
  aggregateReceive: Decimal       // sum of expected leg receipts
  worstCaseReceive: Decimal       // lower bound given quote firmness/slippage
  slippageBps:      integer       // vs reference; MUST satisfy intent.maxSlippageBps
}
RouteLeg {
  venueId:  VenueId
  give:     { asset: AssetId, amount: Decimal }
  receive:  { asset: AssetId, amount: Decimal }
  quoteRef: string               // MUST equal the quoteId of a Quote returned for this intent
}
```

- The sum of `legs[].give.amount` MUST equal `intent.give.amount` (conservation).
- No `RouteLeg` may reference a venue excluded by `venueAllowList`, and `legs.length` MUST respect `maxVenues`.
- A `RoutePlan` whose `worstCaseReceive` < `intent.want.minReceive` MUST NOT be submitted for settlement.
- **Quote linkage (RFC‑0001 Decision C).** Each `RouteLeg.quoteRef` MUST equal the `quoteId` of an actual `Quote` returned for the same intent. A `RoutePlan` MUST NOT contain a leg whose `quoteRef` does not resolve to a known quote.
- **No overstatement (RFC‑0001 Decision C).** For every leg, against the quote it references:
  - `leg.receive.amount` MUST NOT exceed that quote's `receive.amount`;
  - the referenced quote MUST be unexpired at plan‑construction time (`now <= quote.validUntil`);
  - the quote's `give.asset` and `receive.asset` MUST match the leg's.
  In addition (kept from prior versions), `aggregateReceive` MUST NOT exceed the sum of `legs[].receive.amount`, and rounding MUST never favor the protocol over the taker (§3). Checking these requires access to the set of source quotes and the current time.
- **Atomic settleability (RFC‑0004).** A `RoutePlan` is atomically settleable (§6) **if and only if** every leg's referenced quote has `settlementMode == "atomic-allocation"`. A plan containing any `managed-deposit` leg is a valid plan but MUST NOT be presented or treated as an atomic route, and MUST NOT be submitted for the single‑transaction settlement of §6. Determining this requires the source quotes (the modes are carried there, §4.3).

### 4.5 Router contract and RouteResult (RFC‑0002)

A `Router` consumes a `SwapIntent`, the `Quote`s gathered for it, and the current time, and produces either a `RoutePlan` or a typed no‑viable‑route outcome:

```
route(intent: SwapIntent, quotes: Quote[], now: Timestamp) -> RouteResult

RouteResult =
  | { ok: true,  plan: RoutePlan }
  | { ok: false, reason: NoViableRouteReason }

NoViableRouteReason =
  | "no-eligible-quotes"       // no quote matched the intent's assets / was unexpired at now / allowed
  | "min-receive-unreachable"  // no plan reaches want.minReceive (includes insufficient depth)
  | "slippage-exceeded"        // the best plan would exceed intent.maxSlippageBps
```

- `now` MUST be a **per‑call** parameter. A Router MUST NOT bind the evaluation time to a long‑lived instance or read an internal clock; this keeps routing pure and deterministic (ARCHITECTURE.md §1 invariant #5) and lets it enforce the time‑dependent no‑overstatement rule of §4.4 (a leg's referenced quote MUST be unexpired at `now`).
- A Router MUST signal the absence of a viable plan by returning `{ ok: false, reason }`. It MUST NOT throw to signal no‑route, and it MUST NOT return a `RoutePlan` that violates the §4.4 constraints. When `ok` is `true`, the `plan` MUST satisfy every §4.4 constraint.
- `RouteResult` and `NoViableRouteReason` are off‑ledger interface types; they are **not** wire messages and are not defined by JSON Schema. *(note)* `RouteResult` is expressed as a TypeScript type in `@synfin/spec`.

## 5. Off‑ledger quote API (Venue interface)

A Venue exposes a quote endpoint. Normatively:

- `POST /quote` accepts a `QuoteRequest` and returns a `Quote` (or a typed rejection).
- Responses MUST be returned before `QuoteRequest.deadline`; late responses MUST be ignored by the consumer.
- The endpoint MUST be stateless with respect to taker identity beyond what is required to price the requested size.
- A Venue MUST declare a **settlement mode** capability — `atomic-allocation` or `managed-deposit` (RFC‑0004) — and every `Quote` it issues MUST carry that same `settlementMode` (§4.3). The mode is a property of the venue, not of an individual request: a conformant Venue MUST NOT vary it per quote. This is the capability a Router/coordinator reads to decide whether a route can be settled atomically (§4.4, §6).

*(note)* `atomic-allocation` venues participate in the CIP‑0056 allocation settlement of §6; `managed-deposit` venues settle out of band and are integrated by a different (managed) execution path, which this version does not specify. Adapters in `@synfin/adapters` wrap each venue's native API into this interface, expose its `settlementMode`, and MUST be pure/deterministic in normalization and pass the conformance suite.

## 6. On‑ledger settlement (atomic split execution)

Settlement composes the route into CIP‑0056 allocation workflows.

- **Atomic settlement requires all‑atomic‑allocation legs (RFC‑0004).** The single‑transaction settlement described here is valid **only when every leg of the route is `atomic-allocation`** (§4.3, §4.4). If any leg is `managed-deposit`, the coordinator MUST NOT attempt the atomic settlement below; such a leg is settled by a separate managed‑execution path, which this version of the spec does **not** define (it is deferred to a future RFC). A coordinator MUST reject — never silently partial‑settle — a route that mixes settlement modes.

1. For each `RouteLeg`, the settlement coordinator creates an **allocation request** (CIP‑0056 `allocation request` API) for the taker's `give` on that leg and for the venue's corresponding `receive`.
2. Once **all** allocations for all legs are in place, the coordinator executes a **single Daml transaction** that settles every leg (CIP‑0056 DvP). Either all legs settle or none do.
3. The settlement transaction MUST enforce, on‑ledger:
   - total delivered to the taker ≥ `intent.want.minReceive`;
   - `intent.maxSlippageBps` not exceeded;
   - current time ≤ `intent.deadline`.
4. If any condition fails or any allocation is missing/expired, the transaction MUST abort and no leg settles.

Constraints:

- **Same synchronizer.** All input contracts in the settlement transaction MUST be on the same synchronizer (CIP‑0056 requirement). A route that would require legs on different synchronizers MUST NOT be settled atomically; it MUST be rejected.
- **Allocation expiry.** Allocations carry a validity window; expired allocations MUST be released and MUST NOT settle.
- **Single‑use.** An allocation MUST NOT be reusable across settlements (no double‑spend).
- **Idempotency.** `intentId` makes settlement idempotent; a retry MUST NOT cause a second settlement.

*(note)* This mirrors the proven pattern from CIP‑0056 (e.g., CantonSwap's first cross‑issuer atomic swap, Oct 2025) — SQSS generalizes it to N legs across multiple venues.

## 7. Privacy model (normative)

SQSS provides two **distinct** privacy properties (RFC‑0003); implementations and claims MUST NOT conflate them:

1. **MEV immunity** — because Canton has no public mempool and a transaction is visible only to its stakeholders, routes and amounts are never broadcast, so front‑running/sandwiching is structurally prevented. This holds for any conformant settlement, independent of the template. Implementations still MUST avoid leaking intent via timing or side channels.
2. **Per‑leg confidentiality** — at settlement, a Venue MUST learn only its own leg(s); it MUST NOT learn the aggregate intent, other legs, or the route.

Normative requirements for per‑leg confidentiality:

- **Quote time.** A Venue answering a `QuoteRequest` MUST see only the single bucket it is asked to price (§4.2), never the taker's total intent or route.
- **Settlement time.** Per‑leg confidentiality MUST be achieved by **per‑leg authorization**: each leg is authorized only by its own sender and receiver (a per‑leg authorization contract referencing only that leg), and the settlement is executed by an **executor‑only coordinator** in a single atomic transaction (§6). No party co‑signs an aggregate that reveals other legs. Only the **taker** and the **executor** may see the aggregate route; each **Venue** MUST be a stakeholder of only the leg(s) it participates in.
- A reference settlement that **co‑signs all parties** (e.g. the CIP‑0056 `OTCTrade` pattern) makes the whole route visible to every venue and is therefore **NON‑CONFORMANT** for multi‑venue routing.
- Implementations MUST NOT expose cross‑leg correlation to any venue or third party.
- Settlement details MAY be disclosed to authorized parties (auditor/regulator) via **selective disclosure**; they MUST NOT be public.
- *(note)* Per‑leg confidentiality is **not** counterparty anonymity on one's own leg: the two parties to a leg co‑authorize it and therefore see that leg's parties and amount. It hides *other* legs and the aggregate from a venue, not the venue's own leg from itself.

## 8. Firmness, validity, replay

- Consumers MUST enforce `validUntil` and reject stale quotes.
- `QuoteRequest.nonce` and `SwapIntent.intentId` provide replay protection; settlement MUST reject a replayed intent.
- Firm quotes MUST be honored during their validity or the settlement aborts; a venue that fails to honor a firm commitment MUST be de‑prioritized by conformant routers *(note: enforcement/penalty policy is implementation‑defined)*.

## 9. Versioning & capability negotiation

- SQSS is versioned with SemVer. Wire messages carry the spec MAJOR.MINOR they target.
- Consumers MUST ignore unknown optional fields (forward compatibility) and MUST NOT require fields introduced in a later MINOR.
- Breaking changes (MAJOR) follow the RFC process (GOVERNANCE.md §5).

## 10. Conformance

An implementation is **SQSS‑conformant** if:

- (Venue/adapter) it implements §5 and §4.3 and passes the adapter conformance suite (golden + fuzz);
- (Router) it implements the §4.5 contract — `route(intent, quotes, now)` returning a typed `RouteResult` — consuming §4.3 quotes and producing §4.4 plans that honor all §4 constraints, and signaling no‑viable‑route as a typed value (never by throwing). It MUST route when a quote set demonstrably satisfies the intent;
- (Settlement) it implements §6 and passes the Daml Script settlement suite (§ all‑or‑nothing, abort/expiry, single‑use, bound enforcement);
- (Wallet) it can create allocations per CIP‑0056 in response to SQSS allocation requests.

Conformance is verified by the suite described in TESTING.md §5.

## 11. Security considerations

See [THREAT_MODEL.md](../../THREAT_MODEL.md). Summary of normative requirements: validate all quotes as untrusted input; enforce economic bounds on‑ledger; guarantee atomicity and single‑use allocations; preserve privacy; reject cross‑synchronizer atomic routes; protect against replay via nonce/intentId.

## 12. Out of scope

Routing optimization algorithm, pricing/oracles, custody, hosted services, and any non‑Canton settlement. SQSS defines the interfaces these integrate with and the open reference behaviour only.

---

### Appendix A — Relationship to CIP‑0056

SQSS uses, and does not replace, CIP‑0056's six APIs — chiefly **holdings** (inventory), **allocation**, **allocation request**, and **allocation instruction** (atomic DvP). It also relies on CIP‑0056's **token metadata API** as the source of truth for an instrument's precision: an `AssetId.decimals` (§3) is the off‑ledger echo of that metadata and MUST be consistent with it. SQSS adds the **quote/intent** layer above these and the **multi‑leg atomic composition** pattern. Any conflict between this document and CIP‑0056 is resolved in favor of CIP‑0056, and is a bug in this spec to be fixed via RFC.
