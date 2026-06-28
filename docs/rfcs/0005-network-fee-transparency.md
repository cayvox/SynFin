# RFC-0005: Network-fee transparency: gross receipts, a separate network fee, and net-value routing

- **Status:** Proposed
- **Date:** 2026-06-28
- **Author / Steward:** Cayvox Labs (steward)
- **Targets spec version:** SQSS `0.6.0`
- **Review window:** GOVERNANCE.md section 5 minimum 14-day window waived under the single-steward governance fallback (GOVERNANCE.md section 4).
- **Related:** [RFC-0004](0004-settlement-mode-capability.md) (the capability-on-the-quote pattern this reuses); [RFC-0001](0001-assetid-minreceive-quote-linkage.md) (the no-overstatement and quote-linkage contracts amended here); [RFC-0002](0002-router-port-now-and-result.md) (the `Router` contract that ranks); [ADR-0007](../decisions/0007-reference-router-scope.md) (reference-router scope); SPEC sections 4.3, 4.4, 4.5.

## Summary

Today the `Quote` schema defines `receive` as "the offered output, with all fees already reflected," and `feeBps` as the fee already inside `receive`. That assumption holds only when every cost a venue charges can be expressed as a reduction of the receive asset. It breaks for a flat or differently-denominated cost, the on-ledger equivalent of gas.

The live Cantex public quote is the concrete case. Selling 100 CC to USDCx returns a gross USDCx amount that is net of the 5 bps proportional pool fee, plus a separate flat network fee charged in CC (the give asset), waived at or above 500 CC. There is no way to fold a CC-denominated cost into a USDCx `receive` without converting it through a rate, which is exactly what the shipped `CantexAdapter` does (it haircuts `receive`). That haircut is safe (it never overstates the taker's receipt), but it puts Cantex's `receive` on a different basis from every other adapter: Tradecraft, CantonSwap, and OneSwap report `receive` net of their pool fee only, with no network fee modeled at all. The router ranks on `receive` (via `worstCaseReceive`), so it compares unlike bases and structurally penalizes the one venue that discloses its network fee. This is the precise failure mode that 1inch (gas-aware ranking) and Jupiter (best-executed over best-quoted) were built to avoid: a net-value comparison is only correct on a consistent basis.

This RFC makes the cost explicit and the comparison consistent. It (1) redefines `receive` as gross of any separately-denominated network fee, net of the in-receive-asset proportional fee only; (2) adds an optional `networkFee` field to `Quote`, `RouteLeg`, and `RoutePlan` carrying the flat or gas-like cost in its native asset; and (3) adds a net-value figure to `RoutePlan` so the router ranks on the taker's net, computed the same way for every venue. The economic floor and conservation invariants stay on the delivered buy asset and the give principal, unchanged.

## Motivation

- **No-overstatement (RFC-0001, SPEC section 4.4).** The router must never present a number the taker cannot realize. Folding a give-asset fee into the receive asset is one safe way to avoid overstatement, but it is lossy: it discards the gross receipt and the fee's true asset, so a consumer can no longer see what is actually delivered versus what it costs. Carrying the cost as a separate, typed field preserves both and keeps overstatement checkable on each part.
- **Monotonicity and correct selection (ADR-0007, TESTING.md).** A router given more or better quotes must not produce a worse outcome than a single-venue baseline. If two venues' `receive` values are on different fee bases, the ranking can pick the worse net venue. Ranking on a consistently-computed net value is the only way to keep selection correct across heterogeneous venues.
- **Zero-assumption rule.** The current `receive` semantics silently assume all fees are proportional and in the receive asset. Cantex disproves that assumption with verified live data. Encoding network fees explicitly now, with one real Mode-B venue that has them, prevents a later silent assumption that "receive already nets everything."
- **Generality.** Any future venue with a flat settlement charge, a relayer fee, or a gas-like cost in a third asset needs the same field. Solving it once, in the spec, is cheaper than re-deriving a per-adapter haircut each time.

### Prior art (verified against primary sources, 2026-06-28)

This design mirrors how the two leading aggregators handle the same problem, confirmed from their own documentation and APIs:

- **1inch Pathfinder** selects the route that maximizes the output amount net of all fees AND gas costs, and is explicitly gas-aware: when splitting across more venues would cost more gas than the price improvement it buys, it uses fewer venues, and it routes a small trade through a single pool when the extra gas exceeds the slippage saving. The cost is netted against output, not folded into it.
- **Jupiter's quote API** reports `outAmount` as the output net of platform and DEX fees but excluding gas; carries the proportional `platformFee` as a separate object whose fee asset is restricted to the input or output mint; carries the gas-like signature and prioritization fees as separate lamport (SOL) amounts with their own payer field; computes the minimum-received threshold (`otherAmountThreshold`) on `outAmount` (gas-exclusive); and attaches USD values so a fee in neither the input nor the output asset can be valued.

The mapping is one to one: our `receive` is their `outAmount` (net of the proportional in-output-asset fee, gross of the gas-like cost); our `networkFee` is their separate gas/signature fee in its native asset; our net-value ranking is their gas-aware net selection; our floor on the gross buy asset is their minimum-received computed on `outAmount`; our `networkFee` give-or-receive-asset restriction is their `platformFee` input-or-output-mint restriction; and our deferred third-asset case is their USD-value numeraire approach. The one simplification: because the live Cantex fee is in the give asset, we re-base by total give outlay (exact, no price oracle) instead of converting through a numeraire; the numeraire path is the deferred follow-up for a true third-asset fee.

## Decision

### 1. Redefine `receive` (semantic change, no shape change)

`Quote.receive` is the offered output net of the in-receive-asset proportional fee only (the fee declared by `feeBps`). Costs that are flat, or denominated in an asset other than the receive asset, are NOT folded into `receive`; they are carried in `networkFee` (below). `feeBps` keeps its meaning: the proportional, in-receive-asset fee already reflected in `receive`.

For a venue that discloses no separate network fee (CantonSwap, OneSwap, Tradecraft today), `receive` is unchanged in value: their pool fee is proportional and embedded, and they declare no flat cost. Only Cantex's reported `receive` changes value, from the current haircut figure to the gross figure; that is an adapter change covered in section 6.

### 2. `networkFee` on `Quote`, `RouteLeg`, and `RoutePlan`

A new OPTIONAL field:

```
networkFee = { asset: AssetId, amount: Decimal }   // optional
```

- On `Quote`: the flat or gas-like cost the taker bears in addition to `give`, for this quote, in its native asset. Absent means the venue discloses no separate network fee. `amount` is non-negative.
- On `RouteLeg`: the network fee attributable to that leg.
- On `RoutePlan`: the aggregate network fee for the plan (see the homogeneity rule below).
- Normative constraint for `0.6.0`: `networkFee.asset` MUST equal the quote's `give.asset` or its `receive.asset`. A network fee denominated in a third asset requires an external price to value it and is deferred to a follow-up RFC. Cantex's fee is in the give asset (CC), so this covers the live case exactly.

`networkFee` is added to `quote.schema.json`, `route-leg.schema.json`, and `route-plan.schema.json` (the single source of truth) and therefore to the generated types. Because it is optional, every existing quote, leg, and plan remains shape-valid (SPEC section 9: consumers ignore absent optional fields).

### 3. Net-value figure on `RoutePlan` and the ranking rule

`RoutePlan` gains an OPTIONAL field:

```
worstCaseReceiveNet : Decimal   // optional; absent is read as equal to worstCaseReceive
```

It is the taker's worst-case net value, expressed in the receive asset, per the intent's give, after charging the plan's network fee. It is what the router ranks on.

Computation (taker-favorable, floored to the receive asset's precision):

- Let `gross = worstCaseReceive` (the buy-asset floor, unchanged), `give = intent.give.amount`, and `fee = plan.networkFee.amount` (0 if absent).
- If `networkFee` is absent or `fee == 0`: `worstCaseReceiveNet = gross`.
- If `networkFee.asset == intent.give.asset`: `worstCaseReceiveNet = floor( gross * give / (give + fee) , receiveDecimals )`. This re-bases the receipt to the output received per unit of total give-asset outlay: the gross output divided by the total give the taker parts with (give plus fee), scaled back to the intent give. It is exact (no price oracle needed), floors in the taker's favor, and stays well behaved as the fee grows (it tends to zero and never goes negative, unlike valuing the fee at the trade average rate and subtracting, which can go negative for a large fee). This is the gas-aware net in the spirit of 1inch and Jupiter, achieved here by re-basing on total outlay because the fee shares the give asset, rather than by subtracting a separately-priced gas value (the third-asset case in section 2).
- If `networkFee.asset == intent.want.asset` (the receive asset): `worstCaseReceiveNet = gross - fee` (and if that is not positive the plan is not viable).

The ranking function `compareByWorstCase(a, b)` is amended to compare `worstCaseReceiveNet` (treating an absent value as equal to `worstCaseReceive`). Two plans with no network fee rank exactly as before, so this is backward compatible. Selecting the plan with the greater `worstCaseReceiveNet` is the net-value selection that keeps the taker on the correct venue.

### 4. The floor and conservation invariants stay on gross and on the principal

- **Worst-case floor (SPEC section 4.4).** `worstCaseReceive` (gross, the delivered buy-asset amount) MUST still satisfy `intent.want.minReceive`. The network fee is in the give asset and does not reduce the delivered buy asset, so the floor is checked on what is actually delivered, not on the net figure. `minReceive` remains a guarantee on the buy asset.
- **Conservation (SPEC section 4.4).** The network fee is charged ON TOP of the give principal (verified for Cantex: the full `sellAmount` is swapped, `pools.sell == sellAmount`). So `Sigma legs[].give.amount` MUST still equal `intent.give.amount`; the network fee is a separate, additional give-asset outlay and is NOT part of the conserved principal. The taker's total give-asset outlay is `intent.give.amount + Sigma networkFee` when the fee is in the give asset; this is surfaced (the `networkFee` field), not hidden, but it does not alter conservation.

### 5. No-understatement of cost (amended no-overstatement, RFC-0001)

`checkNoOverstatement` is extended so a plan cannot hide or understate a disclosed cost:

- For each leg, if the referenced quote carries a `networkFee`, the leg MUST carry a `networkFee` with the same asset and an `amount` greater than or equal to the quote's (the plan may not claim a cheaper cost than the quote it is built from). A leg omitting a fee that its quote declares is an understatement error.
- `checkAggregateConsistency` adds: `worstCaseReceiveNet <= worstCaseReceive` (net never exceeds gross, since the fee is non-negative), and, when the plan carries a `networkFee`, `worstCaseReceiveNet` MUST equal the section 3 computation against `intent.give` (verified inside `checkRoutePlan`, which already has the intent). The existing buy-asset checks (`aggregateReceive <= Sigma leg receive`, `worstCaseReceive <= aggregateReceive`, per-leg `leg.receive <= quote.receive`) are unchanged.

### 6. Reference-implementation behavior, including the split-plus-flat-fee scope

- **Adapters.** `CantexAdapter` stops haircutting `receive`: it sets `receive` to the gross `returned` (net of the pool fee, consistent with the other adapters) and sets `networkFee = { asset: give asset (CC), amount: fees.network_fee.amount }`, read from each response (0 at or above 500 CC, never hardcoded). The other adapters (CantonSwap, OneSwap, Tradecraft) leave `networkFee` absent, since they disclose no separate flat cost; their `receive` is unchanged.
- **Router.** `buildLeg` carries the quote's `networkFee` onto the leg. `planFromLegs` sets the plan's aggregate `networkFee` and computes `worstCaseReceiveNet` per section 3, then ranks candidates by `compareByWorstCase` (now net-aware). The single-venue path is exact: one leg, `leg.networkFee == quote.networkFee`.
- **Split plus flat fee (scoped, not silently wrong).** A flat `networkFee` is quoted at the requested size. When the router splits across venues, each leg carries its source quote's `networkFee` unchanged. This is conservative: it does not reduce the flat fee for a smaller leg, so the net is never overstated. It is not exact, because a flat fee can depend on leg size (Cantex waives it at or above 500 CC), and the per-leg size is not what was quoted. Precise per-leg flat-fee modeling (re-quoting each candidate leg at its own size) is deferred to a follow-up; the reference router's single-venue selection is exact and it prefers the better net plan, so no incorrect number is produced, only a possibly conservative split net.

## Reference-implementation impact

- **`@synfin/spec`** — `networkFee` added to `quote.schema.json`, `route-leg.schema.json`, `route-plan.schema.json` (optional) and `worstCaseReceiveNet` to `route-plan.schema.json` (optional); regenerated types. `constraints.ts`: `checkNoOverstatement` gains the cost no-understatement check; `checkAggregateConsistency` gains the net bounds; `checkRoutePlan` verifies the net computation against the intent; `compareByWorstCase` ranks on `worstCaseReceiveNet`. A small pure helper computes the net figure from `(gross, give, networkFee)` and is shared by the router and the validators so they cannot drift.
- **`@synfin/adapters`** — `CantexAdapter` reverts the receive haircut to gross receipt plus an explicit `networkFee`; its fixtures and tests update (receive becomes the gross `returned`; a `networkFee` of the CC amount; the at-or-above-500 fixture has `networkFee` absent or zero). The other adapters are unchanged (absent `networkFee` is the default).
- **`@synfin/router-ref`** — produces `networkFee` and `worstCaseReceiveNet`; ranks on net. Tests prove a single-venue plan is exact, that a venue with a disclosed network fee is ranked on net (so a higher gross can lose to a lower-fee venue), and monotonicity holds on net.
- **`@synfin/conformance`** — vectors for: a quote carrying `networkFee` validates; the give-or-receive-asset-only rule; the net-ranking flip (gross winner loses on net); the cost no-understatement rejection; backward compatibility (plans without the fields rank by gross unchanged).
- **CLI (`@synfin/cli`)** — the formatter shows a per-venue network-fee line and ranks the report by net, the way 1inch shows a gas line; Cantex is then wired into the live and fixture adapter sets, producing a real two-venue best-execution result whose edge is the net difference.
- **`daml/synfin-settlement`** — unchanged. This is an off-ledger transparency and ranking change; no on-ledger path is added or altered.

## Compatibility

`networkFee` (on quote, leg, plan) and `worstCaseReceiveNet` (on plan) are new OPTIONAL fields, so this is an additive wire change: every existing quote and plan remains shape-valid, and a plan without `worstCaseReceiveNet` is ranked by `worstCaseReceive` exactly as today. This drives the SQSS spec bump to `0.6.0` and a minor bump of `@synfin/spec`. The redefinition of `receive` is a semantic clarification with no shape change and no value change for any venue that discloses no network fee; the one value change (Cantex's `receive`, from haircut to gross) is contained in the `CantexAdapter` update and is the safe direction (the gross is the real delivered amount, and the cost is now explicit rather than blended in). Producers and consumers that never emit or read `networkFee` are unaffected.

## Conformance-test impact

Covered by the suites above: `validateQuote` accepts a `networkFee` and enforces the give-or-receive-asset rule; `checkNoOverstatement` rejects a leg that understates or omits a disclosed fee; `checkRoutePlan` rejects a plan whose `worstCaseReceiveNet` does not match the section 3 computation or exceeds `worstCaseReceive`; `compareByWorstCase` is unit-tested so a higher-gross, higher-fee plan ranks below a lower-gross, no-fee plan when the net favors the latter; and existing vectors (no network fee) continue to pass unchanged, proving backward compatibility.

## Follow-up plan

1. **Third-asset network-fee pricing RFC** — define how a `networkFee` denominated in neither the give nor the receive asset is valued for net ranking (a reference-price source), lifting the section 2 restriction. Not started.
2. **Per-leg flat-fee modeling for splits** — let the router re-quote or re-evaluate a flat fee at each candidate leg's size so split nets are exact, not just conservative. Not started.
3. **Managed-deposit execution** (still open from RFC-0004) — when the Mode-B execution path is defined, the network fee becomes a real settlement input, not just a ranking input.
