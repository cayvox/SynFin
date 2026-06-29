# RFC-0006: Network-fee application direction: on-top versus deducted-from-give

- **Status:** Proposed
- **Date:** 2026-06-29
- **Author / Steward:** Cayvox Labs (steward)
- **Targets spec version:** SQSS `0.7.0`
- **Review window:** GOVERNANCE.md section 5 minimum 14-day window waived under the single-steward governance fallback (GOVERNANCE.md section 4).
- **Related:** [RFC-0005](0005-network-fee-transparency.md) (the `networkFee` field and net-value routing this extends); [RFC-0004](0004-settlement-mode-capability.md) (the capability-on-the-quote pattern); [RFC-0001](0001-assetid-minreceive-quote-linkage.md) (the no-overstatement and conservation contracts); [ADR-0007](../decisions/0007-reference-router-scope.md); SPEC sections 4.3, 4.4.

## Summary

RFC-0005 added an optional `networkFee` to the quote and ranked routes on the taker's net receipt. For a fee denominated in the give asset, RFC-0005's net formula re-bases by the total give the taker parts with, `gross * give / (give + fee)`. That formula is correct only when the fee is paid ON TOP of the give, the way Cantex charges it (the taker sends `give` plus the fee, and Cantex waives it at or above 500 CC).

A second live Mode-B venue disproves the assumption that this is the only shape. OneSwap (Sats Terminal) was probed live against its own published SDK surface, and its arithmetic was confirmed to 1e-10: OneSwap charges a flat network fee that is DEDUCTED from within the deposit. The taker sends exactly the requested amount, OneSwap subtracts a flat per-swap network fee (the Canton traffic cost, about 8.27 CC at the time of writing) from that deposit, then takes the 0.3% pool fee on the remainder, and prices the swap on what is left. There is no waiver. This is the opposite direction from Cantex: the fee is inside the give, not on top of it, and the delivered output is already net of it.

Applying RFC-0005's on-top re-base to OneSwap would double-count the fee (once in the already-reduced output, once in the re-basing) and structurally penalize the venue. This RFC adds an optional `appliedTo` discriminator to `networkFee` (`on_top`, the default, or `deducted_from_give`), branches the net-value computation on it, and clarifies that `receive` is the delivered buy asset in both cases: gross of an on-top fee, net of a deducted fee. Cantex stays `on_top`; OneSwap is `deducted_from_give`. The field is optional and defaulted, so every existing quote and plan is unchanged; this drives the SQSS bump to `0.7.0`.

## Motivation

- **Correct net selection (RFC-0001, ADR-0007).** A router must rank venues on a net basis that does not penalize a venue for the shape of its fee. Re-basing a deducted fee by `give + fee` understates that venue's net (the output already reflects the deduction), so the router could pass over a venue that is actually competitive. Branching the net formula on the real application direction is the only way to keep selection correct across the two live venues.
- **Zero-assumption rule.** RFC-0005's give-asset `networkFee` silently assumed the fee is on top. OneSwap, verified live with the numbers reconciled exactly, shows a deducted fee with no waiver. Encoding the direction now, with two real venues of opposite structure, removes the silent assumption rather than carrying it forward.
- **Transparency.** OneSwap's flat fee can dominate a small swap: at a 10 CC deposit the roughly 8.27 CC fee is 82.7% of the input, so only about 1.72 CC actually trades. The standard should surface that cost, not bury it inside a small output. Surfacing it also lets a consumer see why OneSwap is uncompetitive at small sizes and competitive at large ones (the flat fee amortizes away).
- **Prior art (verified against primary sources).** Both leading aggregators show both directions, so the distinction is real, not a OneSwap quirk:
  - A cost paid separately, on top, in a token the taker also provides: 1inch gas and Jupiter's signature and prioritization fees (paid in ETH and SOL respectively, in addition to the swap). Cantex's network fee is this shape, in the give asset.
  - A fee deducted from the traded amount: Jupiter's `platformFee`, whose `feeMint` is restricted to the input or output mint and which is taken out of that side. OneSwap's network fee is this shape, deducted from the input (give) side.
  RFC-0005 already covers the deducted-from-output case implicitly (the proportional pool fee declared by `feeBps`, reflected in `receive`). RFC-0006 makes the on-top-versus-deducted axis explicit for the flat `networkFee`.

## Decision

### 1. Add `appliedTo` to `NetworkFee`

```
networkFee = { asset: AssetId, amount: Decimal, appliedTo?: 'on_top' | 'deducted_from_give' }
```

`appliedTo` is OPTIONAL. Absent means `on_top`, which is exactly RFC-0005's behavior, so every existing producer and consumer is unchanged and the Cantex adapter keeps working with no edit. `on_top` means the taker pays the fee in addition to the give. `deducted_from_give` means the fee is taken from within the give before the swap is priced.

### 2. `deducted_from_give` is a give-asset fee

When `appliedTo` is `deducted_from_give`, `networkFee.asset` MUST equal the quote's `give.asset`: a fee can only be deducted from what the taker actually sends. A `deducted_from_give` fee in any other asset is non-conformant. (`on_top` keeps RFC-0005's rule: the asset MUST equal the give or the receive asset.)

### 3. Net-value computation branches on `appliedTo`

Let `gross = worstCaseReceive` (the delivered buy-asset floor), `give = intent.give.amount`, `fee = networkFee.amount`.

- `on_top`, fee in the give asset: `worstCaseReceiveNet = floor( gross * give / (give + fee) , receiveDecimals )`. Unchanged from RFC-0005: the taker parts with `give + fee`, so the receipt is re-based onto total outlay.
- `on_top`, fee in the receive asset: `worstCaseReceiveNet = gross - fee`. Unchanged from RFC-0005.
- `deducted_from_give` (give asset): `worstCaseReceiveNet = gross`. The fee was already taken from the input before the output was priced, so `gross` (which equals `receive`) is already the net. The fee does not reduce the net a second time; it explains why `receive` is lower. The taker parts with exactly `give`, so total outlay equals `give` and the net per intent give is the delivered receipt itself.

### 4. `receive` is the delivered buy asset in both directions

`receive` is always the amount of the buy asset the taker actually receives.

- Under `on_top`, `receive` is gross of the network fee: the fee is paid separately in its own asset, so it does not reduce the delivered output. (Cantex: `receive` is the pool-fee-net `returned`, and the CC fee is surfaced separately.)
- Under `deducted_from_give`, `receive` is net of the network fee: the fee was subtracted from the input before pricing, so the delivered output already reflects it. (OneSwap: `receive` is `outputAmount`, and the deducted CC fee is surfaced separately for transparency.)

In both directions, conservation holds on the give principal: `Sigma legs[].give.amount` MUST equal `intent.give.amount`. An on-top fee is an additional give-asset outlay, surfaced in `networkFee`; a deducted fee is taken from within the give principal, surfaced in `networkFee`. Neither alters the conserved principal.

### 5. The worst-case floor stays on the delivered receipt

`worstCaseReceive` (the delivered buy-asset amount: gross under `on_top`, net under `deducted_from_give`) MUST still satisfy `intent.want.minReceive`. The floor is a guarantee on the buy asset the taker receives, unchanged from RFC-0005 and SPEC section 4.4. The net figure is for ranking only.

### 6. Reference-implementation behavior

- **Cantex** declares `appliedTo: 'on_top'` explicitly (the default already covers it; the explicit value documents intent). Its waiver at or above 500 CC is unchanged: when the fee is zero the `networkFee` is omitted.
- **OneSwap** is integrated with a new adapter matching its verified live surface: `GET /api/v1/quote` with the `X-API-Key` header (no wallet token and no party are required for a quote), the response output field `outputAmount`, and a flat give-asset network fee deducted from within the deposit. The adapter sets `receive = outputAmount` (net of the deducted fee, the constant-product price of `(amount - networkFee) * (1 - poolFee)`), `feeBps` per the pool fee disclosure, and `networkFee = { asset: give (CC), amount: networkFeeAmount, appliedTo: 'deducted_from_give' }`, reading the fee from each response (OneSwap exposes no waiver and a per-key discount policy can apply, so the amount is never hardcoded). OneSwap settles by direct-party deposit detection and exposes no CIP-0056 allocation on the quote path, so its settlement mode is managed-deposit.

## Reference-implementation impact

- **`@synfin/spec`**: add the optional `appliedTo` enum to the `NetworkFee` schema definition (default `on_top`) and regenerate the types. Branch `computeWorstCaseReceiveNet` on `appliedTo` (the `deducted_from_give` give-asset case returns the gross unchanged), and extend `checkNetConsistency` and the no-overstatement checks so a `deducted_from_give` fee is validated as a give-asset fee whose net equals the gross. The helper stays the single source the router and the validators share.
- **`@synfin/adapters`**: the Cantex adapter sets `appliedTo: 'on_top'`; a new OneSwap adapter replaces the previous research-only one, matching the verified surface, with fixtures captured from the live `GET /api/v1/quote` responses. The other adapters are unchanged.
- **`@synfin/router-ref`**: no algorithm change. The router already carries `networkFee` onto legs and computes `worstCaseReceiveNet` through the shared helper, which now honors `appliedTo`. A `deducted_from_give` plan carries the fee for transparency and a net equal to its gross.
- **`@synfin/conformance`**: add a `deducted_from_give` scenario (net equals gross equals receive), the give-asset-only rule for `deducted_from_give`, and the OneSwap adapter to the fixture-backed adapter conformance runs.
- **CLI (`@synfin/cli`)**: the formatter distinguishes a deducted fee ("X CC deducted from the deposit") from an on-top fee ("plus X CC network fee"); OneSwap is wired into the live and fixture adapter sets, producing a real three-venue report. The net-aware aggregation needs no change: OneSwap's net equals its receive, so it ranks correctly alongside Tradecraft and Cantex.
- **`daml/synfin-settlement`**: unchanged. This is an off-ledger transparency and ranking change.

## Compatibility

`appliedTo` is a new OPTIONAL field that defaults to `on_top`, which is RFC-0005's existing behavior. Every existing quote, plan, adapter, and conformance vector is unchanged: Cantex, Tradecraft, and CantonSwap are unaffected, and a consumer that never reads or writes `appliedTo` sees no difference. This is an additive wire change driving the SQSS bump to `0.7.0` and a minor `@synfin/spec` bump. The one behavioral addition (a `deducted_from_give` fee whose net equals the gross) affects only a venue that declares it, currently OneSwap.

## Conformance-test impact

Covered by the suites above: a `deducted_from_give` `networkFee` validates and yields `worstCaseReceiveNet == worstCaseReceive == receive`; a `deducted_from_give` fee whose asset is not the give asset is rejected; the OneSwap adapter passes the fixture-backed adapter conformance suite (give-asset deducted fee accepted, no waiver); and all RFC-0005 vectors (absent `appliedTo`, treated as `on_top`) continue to pass unchanged, proving backward compatibility.

## Follow-up plan

1. **Deducted-from-receive direction** if a venue charges a flat fee taken from the output rather than the input or as a separate outlay. Not needed by either live venue today.
2. **Third-asset network-fee pricing** (carried over from RFC-0005): valuing a fee denominated in neither the give nor the receive asset.
3. **Per-leg flat-fee modeling for splits** (carried over from RFC-0005): exact, not conservative, net for a split that crosses a flat-fee venue.
