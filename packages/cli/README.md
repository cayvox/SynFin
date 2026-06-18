# @synfin/cli

The Synfin reference CLI. **Demo 1** (`quote`): cross-venue quote aggregation
against the real Mode B (`managed-deposit`) Canton venues — **CantonSwap** and
**OneSwap**. Read-only; **no funds, no settlement**.

## Usage

```bash
synfin quote <FROM> <TO> <AMOUNT> [--slippage-bps N] [--fixtures]

# examples
synfin quote CC USDCx 125
synfin quote CC USDCx 125 --slippage-bps 50
synfin quote CC USDCx 125 --fixtures   # force recorded sample data
```

Tokens: `CC` (Amulet), `USDCx`, `CBTC`.

It calls both venue adapters, runs `@synfin/router-ref` over the returned
quotes, and prints each venue's normalized quote, the chosen route, and the
**edge** (improvement of the routed receipt over the best single venue).

## Live + golden fallback (always labelled)

- It first attempts **live, read-only** quotes. CantonSwap needs no key; OneSwap
  quoting needs `ONESWAP_API_KEY` (and `ONESWAP_BASE_URL`) — see `.env.example`.
  The key is read from the environment and is **never logged or committed**.
- On any failure (venue unreachable / under maintenance / unconfigured /
  rate-limited / no live quote), it falls back to the **committed golden
  fixtures** and labels the output **`RECORDED SAMPLE DATA … (NOT live)`**. The
  header always states which mode it ran in.

## Read-only and fundless

The `quote` command only requests quotes. It **never** deposits, settles,
creates a funded commitment, or performs any irreversible side effect. CantonSwap
and OneSwap are managed-deposit venues; their execution path is out of scope here
(deferred — RFC-0004).

Apache-2.0. Pre-alpha: interfaces are unstable until `v1.0.0`.
