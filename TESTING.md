# Testing Strategy

Synfin coordinates settlement of value. Testing is proportional to that risk: the closer code is to moving assets, the heavier the testing burden.

## Test pyramid

```
            e2e (Canton testnet)            ← few, high-value: real atomic split swap
        integration (mock venues)           ← adapters + SDK + settlement wiring
   property-based + conformance             ← invariants, fuzzing, venue/adapter conformance
        unit (pure functions)               ← many, fast
```

## 1. Unit tests

- Cover all pure logic: quote normalization, route construction, decimal/rounding math, validation.
- Deterministic and fast. Run on every commit.

## 2. Property‑based tests

Use property testing (e.g., `fast-check` for TS) to assert **invariants**, not examples:

- **Conservation:** the sum of leg `give` amounts equals the intent `give`; no leg exceeds the intent.
- **No overstatement:** aggregate expected receive never exceeds the sum of quoted receives; rounding never favors the protocol over the taker.
- **Monotonicity:** more/better quotes never produce a worse `RoutePlan` than a single‑venue baseline.
- **Slippage bound:** a `RoutePlan` that violates `maxSlippageBps` is never returned.
- **Adapter parser fuzzing:** malformed/adversarial venue responses never crash and never produce an invalid `Quote` (they are rejected).

## 3. Daml Script tests (settlement‑critical — mandatory)

The atomic split‑execution library must have Daml Script tests proving:

- **All‑or‑nothing:** if any leg cannot settle, the whole transaction fails and no leg settles.
- **Happy path:** N‑leg split across multiple registries settles in a single transaction.
- **Abort/expiry:** expired allocations release and never settle; deadlines enforced on‑ledger.
- **Authorization:** only the intended parties can allocate/settle; no allocation can be reused (no double‑spend).
- **Bound enforcement:** settlement rejects fills below `minReceive` / above `maxSlippageBps`.

These tests are required for any change touching `daml/synfin-settlement` or allocation handling.

## 4. Integration tests

- Adapters + SDK + reference router + a **mock venue harness** (and the Daml library against a local Canton sandbox).
- Cover timeouts, slow/failing venues (dropped, not awaited), idempotent retries (no double settlement).

## 5. Conformance suite

- A reusable suite (in the spirit of `splice-token-standard-test`) that any venue/adapter/wallet runs to claim **Synfin conformance**.
- Golden tests for quote normalization + fuzzed inputs; settlement‑interface conformance for venues that expose firm quotes.

## 6. End‑to‑end (Canton testnet)

- At least one e2e test performing a **real atomic split swap across two venues on testnet** (M2 acceptance).
- Runs in CI on a schedule / pre‑release (not necessarily every PR, due to network cost), and is required before any release.

## 7. Coverage & quality gates

- Coverage thresholds enforced in CI. Suggested: **>= 90%** lines on core packages, **100%** on settlement‑critical and validation code paths. Gates may rise but never silently fall.
- Mutation testing (e.g., Stryker) is encouraged on the core to validate test strength.
- Performance smoke checks for quote‑gathering concurrency and route construction.

## 8. What we do not do

- We do not test against mainnet. We do not use real funds in automated tests. We do not weaken a gate to make a PR pass — we fix the code or the test.
