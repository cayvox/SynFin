# @synfin/price-monitor — Phase-0 price-divergence monitor

A small, dependency-light tool that collects **read-only** quotes for the same
pairs across Canton venues (CantonSwap, OneSwap) over time and quantifies the
**cross-venue spread (bps)** — the evidence the Phase-0 decision gate rests on
(`ROADMAP.md`). **No funds, no settlement, no side effects** — it only requests
quotes via the existing `@synfin/adapters`.

## What it records

Each sampling round appends one **observation** per (venue × pair × size) to an
append-only JSONL store (`data/observations.jsonl`):

```
timestamp, source(live|fixture), venueId, pair, giveSymbol, wantSymbol,
size, receive, rate, feeBps, rejectionCode
```

Responses are treated as untrusted and normalized through the adapters; a venue
that doesn't quote is recorded as a typed `rejectionCode` (never a fabricated
number). Every row is labelled **`live`** or **`fixture`** so the dataset is
honest.

## Spread

For each (pair, size) the monitor compares each venue's **most recent** quote
(so it compares contemporaneous quotes) and reports best vs worst normalized
receive and the **spread in bps**, using the spec's exact-decimal helper (no
floats). A (pair, size) with fewer than two quoting venues reports `n/a`.

## Usage (live, read-only, local)

```bash
pnpm --filter @synfin/price-monitor build

# one sampling round -> append to data/ and (re)write the report
node tools/price-monitor/dist/main.js collect

# sample on an interval (e.g. 12 rounds, 5 min apart) for a time series
node tools/price-monitor/dist/main.js collect --rounds 12 --interval 300

# recompute data/report.md + data/report.csv from the recorded store
node tools/price-monitor/dist/main.js report

# offline: use the recorded golden fixtures instead of live calls
node tools/price-monitor/dist/main.js collect --fixtures
```

- **CantonSwap** needs no API key (public read-only `POST /nswap/quote`).
- **OneSwap** quoting needs `ONESWAP_API_KEY` (+ `ONESWAP_BASE_URL`) in the
  environment (read-only price preview); without them that venue is skipped. See
  the repo `.env.example`. Keys are **never logged or committed**.
- The live `data/` directory is **git-ignored** (generated, possibly large). For
  a schedule, drive `collect` from cron / a timer, or use `--rounds/--interval`.

## Sample dataset + report

A committed, deterministic example lives under [`sample/`](sample/), generated
from [`fixtures/observations.sample.jsonl`](fixtures/observations.sample.jsonl)
(recorded sample data, clearly labelled — **not live**). It shows a meaningful
cross-venue spread (tens of bps), which is the Phase-0 evidence.

## Tests

`pnpm --filter @synfin/price-monitor test` — deterministic unit tests over the
spread/report/collection logic using golden fixtures. **No live network calls in
CI.**

Apache-2.0. Pre-alpha.
