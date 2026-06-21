# RFC‑0001: Lock the `AssetId`, `minReceive`, and quote↔leg contracts

- **Status:** Accepted
- **Date:** 2026‑06‑17
- **Author / Steward:** Cayvox Labs (steward)
- **Targets spec version:** SQSS `0.2.0` (from `0.1.0`)
- **Review window:** The GOVERNANCE.md §5 minimum 14‑day review window is **waived**
  under the current single‑steward governance fallback (GOVERNANCE.md §4). The waiver is
  recorded here explicitly; it applies only while the project has a single steward and is
  expected to lapse once a broader council exists.
- **Related:** SPEC §3, §4.1, §4.3, §4.4, Appendix A.

## Summary

Task 001, which built `@synfin/spec`, deliberately surfaced three under‑specified contracts
rather than inventing behaviour (the zero‑assumption rule). This RFC turns those
three into normative decisions so that downstream work (adapters, the reference router, the
Daml settlement library) binds to a stable contract. It is a normative change and therefore
bumps SQSS to `0.2.0`.

The three decisions (A, B, C) are made by the maintainer; this RFC records them and the spec
+ `@synfin/spec` are updated to match. No contract change beyond A–C is introduced.

---

## Decision A — `AssetId` field shape

### Problem
SPEC §3 required a "registry‑qualified instrument identifier consistent with CIP‑0056" but
never defined the concrete shape of `AssetId`. Task 001 modelled it as
`{ registry, id, decimals }` and flagged `decimals` as pending confirmation: carrying an
instrument's precision in the identifier conflates identity with metadata, yet Canton has no
global readable state (ARCHITECTURE.md §1, invariant #2), so off‑ledger validation needs the
precision to travel with the asset reference.

### Decision
`AssetId` is normatively defined with exactly these fields:

- `registry` — the issuing registry / token administrator identifier (the authority).
- `instrumentId` — the instrument identifier within that registry.
- `decimals` — a non‑negative integer, the instrument's precision.

`decimals` is **not authoritative on its own**: it MUST be consistent with the precision the
issuing registry reports via the CIP‑0056 **token metadata API**. It is carried in `AssetId`
only so that off‑ledger validation works without global readable state. The registry remains
the source of truth; `decimals` is its off‑ledger echo.

- Implementations SHOULD verify `decimals` against the registry's token metadata when that
  metadata is available.
- Implementations MUST reject quotes/intents whose amounts are inconsistent with the stated
  `decimals` (an amount MUST NOT carry more fractional digits than `decimals`).

> Note: this renames the Task‑001 working field `id` to `instrumentId` to match CIP‑0056
> terminology. This is a breaking shape change, captured by the `0.2.0` bump.

### Compatibility impact
Breaking for any `0.1.0` consumer (field rename `id` → `instrumentId`). Pre‑alpha: interfaces
are unstable until `v1.0.0`, so this is permitted under SemVer with a MINOR bump while < 1.0.

### Conformance‑test impact
Validation MUST reject: missing `registry`/`instrumentId`/`decimals`; negative `decimals`;
amounts whose fractional precision exceeds `decimals`. The adapter conformance suite
(TESTING.md §5) gains golden cases for the renamed field and the precision check.

---

## Decision B — `minReceive` must be strictly positive

### Problem
SPEC §4.1 made `minReceive` the authoritative floor but did not state a lower bound. A floor
of `0` (or negative) offers no protection and is almost certainly an error; Task 001 rejected
non‑positive amounts but the rule was not normative.

### Decision
SPEC §4.1: `SwapIntent.want.minReceive` **MUST be strictly greater than 0**. A non‑positive
floor is invalid and MUST be rejected at validation.

### Compatibility impact
Tightening only. Any previously‑accepted intent with `minReceive <= 0` was already
economically meaningless; such inputs now fail validation explicitly.

### Conformance‑test impact
Validation MUST reject `minReceive == 0` and `minReceive < 0`.

---

## Decision C — quote↔leg linkage and redefined no‑overstatement

### Problem
`RouteLeg.quoteRef` was documented as "the Quote this leg is built from", but `Quote` carried
no identifier, so a leg could not be tied back to a specific quote. Task 001 therefore could
only check plan self‑consistency (`aggregateReceive <= Σ leg receipts`) and explicitly noted
it could not verify that a leg's promised receipt was actually backed by a live quote. That is
a real safety gap: a `RoutePlan` could advertise receipts no venue ever quoted, or receipts
from a quote that has already expired.

### Decision
1. **Add `quoteId: string` to `Quote`** — a unique identifier for that quote, set by the
   venue/adapter, unique within the scope of an intent's quote‑gathering round.
2. **`RouteLeg.quoteRef` MUST equal the `quoteId` of an actual `Quote`** that was returned for
   the same intent. A `RoutePlan` MUST NOT contain a leg whose `quoteRef` does not resolve to a
   known quote.
3. **Redefine no‑overstatement (SPEC §4.4).** For every leg, all of the following MUST hold
   against the quote the leg references:
   - `leg.receive.amount` MUST NOT exceed that quote's `receive.amount`;
   - the referenced quote MUST be unexpired at plan‑construction time (`now <= quote.validUntil`);
   - the quote's `give.asset` and `receive.asset` MUST match the leg's.
   The previous plan‑self‑consistency invariant (`aggregateReceive <= Σ leg receipts`) is
   **kept as an additional invariant**, not replaced.

Because constructing or checking a `RoutePlan` now requires the set of source quotes (and the
current time), that set is threaded through the relevant constraint predicates and the
documented `Router` contract. No `Router` implementation is provided in this task; only
interface/TSDoc surfaces change.

### Compatibility impact
Breaking for `Quote` (adds required `quoteId`) and for any code constructing a `RoutePlan`
without retaining its source quotes. Captured by the `0.2.0` bump.

### Conformance‑test impact
Validation/constraint suites MUST reject a plan that: references an unknown `quoteId`; has a
leg whose `receive` exceeds its referenced quote; references an expired quote; or whose leg
assets do not match the referenced quote. The aggregate‑consistency invariant remains.

---

## Consequences

- **Positive:** the three contracts are now stable; adapters, router, and settlement can bind
  to them. The no‑overstatement gap is closed — a plan can no longer promise receipts no live
  quote backs.
- **Negative / trade‑offs:** breaking changes versus `0.1.0` (field rename, new required
  field, predicate signatures that need the quote set). Acceptable pre‑1.0.
- **Open/closed boundary:** preserved — all changes are to open types/validation; nothing here
  requires the proprietary optimizer or any hosted service (GOVERNANCE.md §3).
- **Follow‑ups:** multi‑hop routing remains a FUTURE spec extension and is out of
  scope here.

## Alternatives considered

- **Keep `decimals` out of `AssetId` and look it up on‑ledger.** Rejected: violates the
  no‑global‑readable‑state constraint for off‑ledger validation; the registry stays the source
  of truth, with `decimals` as its echo (Decision A).
- **Identify the leg's quote structurally (by venue + size) instead of an explicit id.**
  Rejected: ambiguous when a venue returns multiple quotes for the same size; an explicit
  `quoteId` is unambiguous (Decision C).
- **Replace the aggregate‑consistency check with the per‑leg check.** Rejected: they catch
  different faults; both are kept (Decision C).
