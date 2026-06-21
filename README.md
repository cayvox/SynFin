<div align="center">

# Synfin

**The open, neutral best‑execution and liquidity‑routing standard for the Canton Network.**

*Find the best price across every Canton venue — split optimally, settle atomically, leak nothing.*

[Specification](docs/spec/SPECIFICATION.md) · [Architecture](ARCHITECTURE.md) · [Governance](GOVERNANCE.md) · [Security](SECURITY.md) · [Contributing](CONTRIBUTING.md)

`Status: pre‑alpha — interfaces are unstable until v1.0.0`

</div>

---

## What Synfin is

Canton's DeFi liquidity is fragmenting across many venues (AMMs, order books, RFQ desks). Because Canton has no global shared state and every contract is private to its stakeholders, **you cannot read pool reserves** the way you can on Ethereum or Solana — price discovery is structurally blind. There is no neutral layer that gathers quotes across venues, routes an order to the best price, and settles atomically.

Synfin fills exactly that gap. It is two things at once:

1. **An open standard (a CIP candidate)** — a vendor‑neutral way to express a swap *intent*, request *quotes* from any venue, and compose an *atomic, all‑or‑nothing settlement* on top of the Canton Network Token Standard (CIP‑0056).
2. **An Apache‑2.0 reference implementation** — venue adapters, an on‑ledger atomic split‑execution Daml library, a TypeScript SDK, and a reference UI that anyone (wallets, portfolio tools, venues, institutions) can build on without licensing anything.

Synfin is **not a venue** and holds no liquidity of its own. It sits *above* existing venues and finds the best route through them.

## The open / closed boundary

Synfin draws a deliberate line. Everything in **this repository is open source (Apache‑2.0)** and is common‑good infrastructure. The proprietary value‑capture layer (the routing optimizer, hosted execution, the RFQ network, institutional reporting) lives **outside** this repo and is never required to use the standard.

| Open (this repo, Apache‑2.0) | Closed (separate, proprietary) |
| --- | --- |
| Quote & Swap‑Intent specification (CIP) | Routing/SOR optimizer (the "brain") |
| Venue adapters (quote normalization) | Hosted execution service + SLA |
| Atomic split‑execution Daml library | RFQ network operation |
| TypeScript client SDK | Institutional TCA & best‑execution reporting |
| Reference comparison UI | Selective‑disclosure reporting infrastructure |
| Phase‑0 price‑divergence monitor | |

The open `Router` port ships with a simple, fully open **reference router**. A proprietary optimizer is just an alternative implementation of the same port — the standard works completely without it.

## Why this is defensible on Canton

- **No global state → a quote/RFQ model.** Aggregation must be built from venue quotes and an RFQ network, not from reading reserves. This is the natural home for an intent‑based design — and a real barrier to entry (it is not a forkable router contract).
- **Atomic composition (CIP‑0056) → split execution in one transaction.** Multiple legs across different venues settle in a single Daml transaction, all‑or‑nothing. No partial fills at the protocol layer.
- **Privacy → structural MEV immunity.** Each venue sees only its own leg. The taker's total order, size and strategy are never disclosed to any party. Private smart‑order‑routing is the default, not an add‑on.

## Architecture at a glance

```
            Synfin reference pipeline
  ┌────────────────────────────────────────────┐
  │ 1 Intent  → 2 Quotes (RFQ) → 3 Route → 4 Atomic settle → 5 Report
  │   [open]      [open]         [pluggable]   [open]            [closed]
  └────────────────────────────────────────────┘
        adapters         Router port        Daml lib (CIP‑0056)
```

See [ARCHITECTURE.md](ARCHITECTURE.md) for components, trust boundaries and the monorepo layout.

## Repository layout

```
synfin/
├── docs/spec/SPECIFICATION.md   # the normative standard (SQSS)
├── docs/decisions/              # Architecture Decision Records (ADRs)
├── packages/                    # (code) spec types, adapters, sdk
├── daml/                        # (code) atomic split-execution library
├── apps/reference-ui/           # (code) reference comparison UI
├── tools/price-monitor/         # (code) Phase-0 evidence tool
├── ARCHITECTURE.md  ENGINEERING.md  TESTING.md  THREAT_MODEL.md
├── GOVERNANCE.md    SECURITY.md     CONTRIBUTING.md  CODE_OF_CONDUCT.md
├── GLOSSARY.md      CHANGELOG.md
└── LICENSE
```

> Directories marked `(code)` are scaffolded in later milestones. This bundle establishes the documentation, contracts and engineering rules first, by design.

## Quickstart (will be populated as code lands)

```bash
# prerequisites: Node >= 20, pnpm >= 9, Daml SDK (see CONTRIBUTING.md)
pnpm install
pnpm build
pnpm test
```

## Status & stability

Pre‑alpha. The specification and all package interfaces follow [Semantic Versioning](https://semver.org). Nothing is considered stable until `v1.0.0`; breaking changes to the spec require an RFC (see [GOVERNANCE.md](GOVERNANCE.md)).

## Contributing, security, license

- New here? Read [CONTRIBUTING.md](CONTRIBUTING.md) and [ENGINEERING.md](ENGINEERING.md).
- Found a vulnerability? Follow [SECURITY.md](SECURITY.md) — please do **not** open a public issue.
- Licensed under **Apache‑2.0** (see [LICENSE](LICENSE)). The standard text is free for anyone to implement.

Stewarded by **Cayvox Labs** as neutral infrastructure for the Canton ecosystem.
