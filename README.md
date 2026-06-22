<div align="center">

# Synfin

**The open, neutral best-execution and liquidity-routing standard for the Canton Network.**

*Find the best price across every Canton venue: split optimally, settle atomically, leak nothing.*

[Specification](docs/spec/SPECIFICATION.md) · [Architecture](ARCHITECTURE.md) · [Governance](GOVERNANCE.md) · [Security](SECURITY.md) · [Contributing](CONTRIBUTING.md)

[![npm @next](https://img.shields.io/npm/v/@synfin/spec/next)](https://www.npmjs.com/package/@synfin/spec) [![provenance](https://img.shields.io/badge/provenance-attested-brightgreen)](https://www.npmjs.com/package/@synfin/spec) [![license](https://img.shields.io/npm/l/@synfin/spec)](LICENSE)

`Status: pre-alpha, interfaces are unstable until v1.0.0`

</div>

---

## What Synfin is

Canton's DeFi liquidity is fragmenting across many venues (AMMs, order books, RFQ desks). Because Canton has no global shared state and every contract is private to its stakeholders, **you cannot read pool reserves** the way you can on Ethereum or Solana: price discovery is structurally blind. There is no neutral layer that gathers quotes across venues, routes an order to the best price, and settles atomically.

Synfin fills exactly that gap. It is two things at once:

1. **An open standard (a CIP candidate).** A vendor-neutral way to express a swap *intent*, request *quotes* from any venue, and compose an *atomic, all-or-nothing settlement* on top of the Canton Network Token Standard (CIP-0056).
2. **An Apache-2.0 reference implementation.** Venue adapters, an open reference router, a conformance suite, a CLI, and an on-ledger atomic split-execution Daml library, that anyone (wallets, portfolio tools, venues, institutions) can build on without licensing anything. A unified client SDK and a reference comparison UI are planned for a future release.

Synfin is **not a venue** and holds no liquidity of its own. It sits *above* existing venues and finds the best route through them. It is not a competing standard: it builds on the Canton Token Standard (CIP-0056/0112).

## Packages

Five Apache-2.0 packages are published to npm under the `next` dist-tag, with provenance:

| Package | What it is | Use it when |
| --- | --- | --- |
| [`@synfin/spec`](packages/spec) | The SQSS wire types, validators, exact decimals, and the three ports | You need the standard's types, or want to validate intents and quotes |
| [`@synfin/adapters`](packages/adapters) | Venue adapters that normalize native quotes into SQSS Quotes | You are integrating a Canton venue, or need mock quotes for tests |
| [`@synfin/router-ref`](packages/router-ref) | The open reference Router: deterministic, depth-aware split routing | You want to route an intent across quotes into a RoutePlan |
| [`@synfin/conformance`](packages/conformance) | The conformance suite for adapters and routers | You are claiming Synfin conformance for an implementation |
| [`@synfin/cli`](packages/cli) | The reference CLI: cross-venue quote aggregation and a settlement demo | You want to try Synfin from the terminal |

Install any with the `next` tag, for example `npm install @synfin/spec@next`.

## The open / closed boundary

Synfin draws a deliberate line. Everything in **this repository is open source (Apache-2.0)** and is common-good infrastructure. The proprietary value-capture layer (the routing optimizer, hosted execution, the RFQ network, institutional reporting) lives **outside** this repo and is never required to use the standard.

| Open (this repo, Apache-2.0) | Closed (separate, proprietary) |
| --- | --- |
| Quote and Swap-Intent specification (CIP) | Routing/SOR optimizer (the "brain") |
| Venue adapters (quote normalization) | Hosted execution service plus SLA |
| Atomic split-execution Daml library | RFQ network operation |
| Reference router and conformance suite | Institutional TCA and best-execution reporting |
| Reference CLI | Selective-disclosure reporting infrastructure |
| Phase-0 price-divergence monitor | |

The open `Router` port ships with a simple, fully open **reference router**. A proprietary optimizer is just an alternative implementation of the same port: the standard works completely without it.

## Why this is defensible on Canton

- **No global state, so a quote/RFQ model.** Aggregation must be built from venue quotes and an RFQ network, not from reading reserves. This is the natural home for an intent-based design, and a real barrier to entry (it is not a forkable router contract).
- **Atomic composition (CIP-0056), so split execution in one transaction.** Multiple legs across different venues settle in a single Daml transaction, all-or-nothing. No partial fills at the protocol layer.
- **Privacy, so structural MEV immunity.** Each venue sees only its own leg. The taker's total order, size and strategy are never disclosed to any party. Private smart-order-routing is the default, not an add-on.

## Architecture at a glance

```
            Synfin reference pipeline
  ┌────────────────────────────────────────────┐
  │ 1 Intent  -> 2 Quotes (RFQ) -> 3 Route -> 4 Atomic settle -> 5 Report
  │   [open]      [open]            [pluggable]   [open]            [closed]
  └────────────────────────────────────────────┘
        adapters         Router port        Daml lib (CIP-0056)
```

See [ARCHITECTURE.md](ARCHITECTURE.md) for components, trust boundaries and the monorepo layout.

## Repository layout

```
synfin/
├── docs/spec/SPECIFICATION.md   # the normative standard (SQSS)
├── docs/decisions/              # Architecture Decision Records (ADRs)
├── packages/                    # spec, adapters, router-ref, conformance, cli (npm)
├── daml/                        # atomic split-execution Daml library
├── apps/web/                    # the Synfin website
├── tools/price-monitor/         # Phase-0 price-divergence monitor
├── ARCHITECTURE.md  ENGINEERING.md  TESTING.md  THREAT_MODEL.md
├── GOVERNANCE.md    SECURITY.md     CONTRIBUTING.md  CODE_OF_CONDUCT.md
├── GLOSSARY.md      CHANGELOG.md
└── LICENSE
```

## Quickstart

Try the CLI without installing anything:

```sh
npx @synfin/cli@next --help
```

Use the standard and the reference router programmatically:

```sh
npm install @synfin/spec@next @synfin/router-ref@next @synfin/adapters@next
```

```js
import { route } from '@synfin/router-ref';

// build a SwapIntent and gather a few Quotes (see packages/router-ref), then:
const result = route(intent, quotes, new Date());
if (result.ok) {
  console.log(result.plan.legs, result.plan.aggregateReceive);
}
```

Build the repo from source:

```sh
# prerequisites: Node >= 20, pnpm >= 9, Daml SDK (see CONTRIBUTING.md)
pnpm install
pnpm build
pnpm test
```

## Status and stability

Pre-alpha. The specification and all package interfaces follow [Semantic Versioning](https://semver.org). Nothing is considered stable until `v1.0.0`; breaking changes to the spec require an RFC (see [GOVERNANCE.md](GOVERNANCE.md)). Packages are published under the `next` dist-tag.

## Contributing, security, license

- New here? Read [CONTRIBUTING.md](CONTRIBUTING.md) and [ENGINEERING.md](ENGINEERING.md).
- Found a vulnerability? Follow [SECURITY.md](SECURITY.md). Please do **not** open a public issue.
- Licensed under **Apache-2.0** (see [LICENSE](LICENSE)). The standard text is free for anyone to implement.

Stewarded by **Cayvox Labs** as neutral infrastructure for the Canton ecosystem.
