# @synfin/cli

The Synfin reference CLI — a unified quote layer across Canton venues, with
atomic settlement, presented as a **two-demo proof of work**:

- **Demo 1 — `quote`**: unified quote aggregation across **real** venues
  (CantonSwap, OneSwap). **Works today.** Read-only, no funds.
- **Demo 2 — `settle-demo`**: atomic, per-leg-private split **settlement**
  against our **own CIP-0056 test venue (Amulet)** on a local ledger. The
  **architecture is proven**; it **awaits Mode-A venues** as the network matures
  (ADR-0009). No funds, no mainnet.

The honest framing matters: today's accessible third-party venues are **Mode B**
(managed-deposit / quote-only — ADR-0009), so atomic, all-or-nothing settlement
is demonstrated against our own Mode-A (CIP-0056) test venue, not claimed against
live venues.

## Demo 1 — `quote`

```bash
synfin quote <FROM> <TO> <AMOUNT> [--slippage-bps N] [--fixtures]

synfin quote CC USDCx 125
synfin quote CC USDCx 125 --slippage-bps 50
synfin quote CC USDCx 125 --fixtures   # force recorded sample data
```

Tokens: `CC` (Amulet), `USDCx`, `CBTC`. It calls both venue adapters, runs
`@synfin/router-ref` over the returned quotes, and prints each venue's normalized
quote, the chosen route, and the **edge** (improvement vs the best single venue).

**Live + golden fallback (always labelled).** It first attempts **live,
read-only** quotes (CantonSwap needs no key; OneSwap quoting needs
`ONESWAP_API_KEY` / `ONESWAP_BASE_URL` — see `.env.example`; the key is never
logged or committed). On any failure it falls back to the **committed golden
fixtures** and labels the output **`RECORDED SAMPLE DATA … (NOT live)`**. The
`quote` command only requests quotes — it never deposits, settles, or creates a
funded commitment.

## Demo 2 — `settle-demo`

```bash
synfin settle-demo
```

Drives the **proven** `daml/synfin-settlement` library (unchanged) via the demo
Daml Script `Synfin.Demo.AtomicSettlement` on a **local in-memory ledger**, and
narrates what it verifies for a 2-venue, 4-leg split over Amulet:

- **Atomic** — all 4 legs settle in **one** Daml transaction (all-or-nothing);
- **On-ledger bounds** — conservation, `minReceive`, slippage, deadline;
- **Single-use allocations** — none remain after settlement (no double-spend);
- **Per-leg privacy** — venue A does **not** see venue B's leg (and vice-versa);
  the taker + executor see the aggregate route (SPEC §7).

The CLI contains **no settlement logic** — it orchestrates the Daml library/script.

**Prerequisite:** the Daml SDK toolchain (`daml`) + JDK on `PATH` — the same
setup the `daml build && daml test` gate uses (see `daml/dars/README.md` and the
CI Daml job). If the toolchain is absent, `settle-demo` **fails gracefully** with
a clear message and **does not fabricate a result**. Local ledger only — **no
funds, no mainnet**.

Apache-2.0. Pre-alpha: interfaces are unstable until `v1.0.0`.
