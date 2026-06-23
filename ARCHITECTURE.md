# Architecture

This document describes Synfin's system architecture, the components, the trust boundaries, and the engineering invariants every contributor (human or agent) must preserve. It is the companion to the normative [specification](docs/spec/SPECIFICATION.md).

## 1. Design goals & invariants

These are **invariants**, not aspirations. A change that violates one is rejected.

1. **Neutral & open.** The standard and reference implementation never require a proprietary component (see GOVERNANCE.md §3).
2. **Quote/RFQ‑based.** Canton has no global shared state and contracts are private; we never assume we can read venue reserves. All pricing comes from venue quotes / RFQ responses.
3. **Atomic or nothing.** Multi‑leg settlement executes in a **single Daml transaction**; either all legs settle or none do. There are no protocol‑level partial fills.
4. **Privacy‑preserving.** Each venue sees only its own leg. The taker's full intent, total size and route are never disclosed to any venue. Cross‑leg correlation must not be exposed.
5. **Deterministic & idempotent.** Adapters and settlement construction are pure given their inputs; retries never double‑settle.
6. **Same‑synchronizer atomicity.** Atomic cross‑venue settlement requires all input contracts on one synchronizer (the Global Synchronizer is the expected common ground). This constraint is explicit, not hidden.
7. **Untrusted inputs.** Venue quotes and network responses are adversarial until validated.

## 2. Pattern: Ports & Adapters (Hexagonal)

Synfin's core domain (intent, quoting, routing, settlement composition) is isolated from the outside world behind **ports**. External systems plug in as **adapters**. This keeps the standard clean and lets venues and optimizers be swapped without touching the core.

```
                      ┌─────────────────────────────┐
   Venue APIs ──▶ [VenueAdapter port] ──▶          │
                      │        Synfin core domain    │ ──▶ [Settlement port] ──▶ Canton (Daml / CIP-0056)
   Optimizer  ──▶ [Router port]       ──▶          │
                      └─────────────────────────────┘
                                  ▲
                          [SDK / API surface]
                                  ▲
                       takers: wallets, apps, institutions
```

- **`VenueAdapter` port** — `quote(request) -> Quote`. One adapter per venue. Pure normalization of that venue's quote semantics into the standard `Quote` type. Open source.
- **`Router` port** — `route(intent, quotes[]) -> RoutePlan`. Selects and splits across quotes. Ships with an **open reference router** (deterministic, e.g., greedy best‑price with size buckets). A proprietary optimizer is an alternative implementation of this exact port — the system runs fully without it.
- **`Settlement` port** — turns a `RoutePlan` into CIP‑0056 allocation requests and drives the single atomic Daml transaction. Open source.

## 3. Components (monorepo)

```
synfin/
├── packages/
│   ├── spec/            @synfin/spec   — normative TS types + JSON Schemas, generated from the spec; single source of truth
│   ├── adapters/        @synfin/adapters — one module per venue implementing VenueAdapter
│   ├── router-ref/      @synfin/router-ref — open reference Router implementation
│   └── sdk/             @synfin/sdk    — client SDK: gather quotes → route → build & submit atomic settlement
├── daml/
│   └── synfin-settlement/             — Daml library: SwapIntent + atomic split-execution on CIP-0056 allocation/DvP
├── apps/
│   └── reference-ui/                  — reference comparison UI (read + execute)
├── tools/
│   └── price-monitor/                 — Phase-0 cross-venue spread monitor (evidence dataset)
└── docs/
    ├── spec/SPECIFICATION.md          — the standard (SQSS)
    └── decisions/                     — ADRs
```

### Technology choices (see ADRs for rationale)

- **On‑ledger:** Daml (Canton's smart‑contract language); builds on the CIP‑0056 Token Standard interfaces, and tracks CIP‑0112 (Token Standard V2, the successor to CIP‑0056) as it rolls out across the network.
- **Off‑ledger:** TypeScript (Node >= 20) for adapters, SDK and UI. `pnpm` workspaces monorepo.
- **Schemas:** JSON Schema is the source of truth for off‑ledger wire types; TypeScript types are generated from it. Venue HTTP quote APIs are described with OpenAPI, mirroring CIP‑0056's "Daml interface + OpenAPI" convention.
- **UI:** a thin reference app; no business logic that belongs in the SDK.

## 4. End‑to‑end data flow

Mapping the five stages to components and the open/closed line:

| # | Stage | Component | Open/closed |
| --- | --- | --- | --- |
| 1 | Intent capture | `@synfin/sdk` + `SwapIntent` (Daml) | open |
| 2 | Quote gathering (RFQ) | `@synfin/adapters` via `VenueAdapter` | open |
| 3 | Routing / split | `Router` port — `@synfin/router-ref` (open) or proprietary optimizer | pluggable |
| 4 | Atomic settlement | `Settlement` port → `daml/synfin-settlement` (CIP‑0056) | open |
| 5 | Reporting / Edge / TCA | consumer of settlement results | closed (separate) |

Sequence (happy path):

1. Taker expresses a `SwapIntent` (give/want, `maxSlippageBps`, `deadline`).
2. SDK fans out `QuoteRequest`s to venue adapters for one or more size buckets; adapters return normalized `Quote`s (indicative or firm).
3. The `Router` produces a `RoutePlan` (legs + aggregate/worst‑case receive + slippage).
4. The `Settlement` component creates CIP‑0056 allocation requests for each leg; once all allocations are in place, a single Daml transaction settles all legs atomically.
5. Results feed reporting (Edge panel; institutional TCA — closed layer).

## 5. Trust boundaries

```
  TRUSTED (taker side)            │ UNTRUSTED                    │ TRUSTED (ledger)
  ───────────────────────────────┼──────────────────────────────┼───────────────────────────
  SDK, intent, route plan         │ venue quote responses         │ Canton synchronizer + Daml
  (runs in taker's environment)   │ network transport             │ CIP-0056 registries
                                  │ (adversarial; validate all)   │ (atomic settlement here)
```

- Quotes are validated for: schema, decimals/units, expiry (`validUntil`), non‑negativity, sane bounds, and (for firm/RFQ) signature/commitment.
- The settlement transaction enforces the taker's `minReceive`/`maxSlippageBps` and `deadline` **on‑ledger**, so a lying quote cannot cause a bad fill — at worst the settlement aborts.
- Logs and telemetry must never contain a taker's full intent or route (privacy invariant #4).

## 6. Error handling, idempotency, expiry

- Every external call has explicit timeouts and typed errors; no silent fallbacks that change economic outcome.
- Settlement is **idempotent**: a unique intent/settlement identifier prevents double execution on retry.
- Allocations carry expiry; expired allocations are released and never settle. Deadlines are enforced on‑ledger.
- Abort semantics: any leg that cannot be satisfied aborts the whole settlement (invariant #3).

## 7. Observability

- Structured, leveled logging with explicit redaction of sensitive fields (intent totals, routes, party identifiers beyond what a component legitimately needs).
- Metrics: quote latency per venue, route quality (achieved vs worst single‑venue), settlement success/abort rates. Metrics must be aggregate and non‑identifying.

## 8. Performance considerations

- Quote gathering is concurrent and bounded by `deadline`; slow venues are dropped, not awaited indefinitely.
- The reference router is deterministic and O(legs × buckets); heavy optimization lives in the (closed) optimizer behind the same port.
- The settlement path minimizes on‑ledger contract churn (UTXO/`Holding` count) per CIP‑0056 cost guidance.

## 9. What is explicitly out of scope here

Pricing/oracles, custody, the routing optimization algorithm itself (pluggable, may be proprietary), and any hosted service. The repo defines the **interfaces** these plug into and provides open reference behaviour.
