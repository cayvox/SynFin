# @synfin/spec

The single source of truth for the **Synfin Quote & Swap‑Intent Standard (SQSS)** —
see [`docs/spec/SPECIFICATION.md`](../../docs/spec/SPECIFICATION.md). This package
ships **no business logic** (no adapter/router/settlement bodies); only the
contracts everything else depends on.

It provides:

- **Wire types** for the off‑ledger SQSS messages (SPEC §4), generated from the
  JSON Schemas in [`schemas/`](./schemas) — the authoritative shapes. Run
  `pnpm --filter @synfin/spec gen` to regenerate; CI fails on drift.
- **Runtime validators** (`validateSwapIntent`, `validateQuote`, …) returning a
  `Result` — types are not validation; venue input is adversarial (SPEC §4, §8).
- **Exact decimals** (`Decimal`, `roundTakerFavorable`) — no binary floats for
  value math; rounding never overstates receipts nor understates spend (SPEC §3).
- **Cross‑field constraint predicates** (`checkRoutePlan`, `checkConservation`, …)
  for the `RoutePlan` invariants (SPEC §4.4).
- **The three ports** — `VenueAdapter`, `Router`, `Settlement` (interfaces only;
  ADR‑0005). Implementations live in `@synfin/adapters`, `@synfin/router-ref`,
  and `daml/synfin-settlement`.

```ts
import { validateQuote, checkRoutePlan, Decimal } from '@synfin/spec';

const result = validateQuote(untrustedQuote, { now: new Date() });
if (!result.ok) {
  // result.errors: structured, privacy-safe ValidationError[]
}
```

Apache‑2.0. Pre‑alpha: interfaces are unstable until `v1.0.0`.
