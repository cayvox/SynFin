# Glossary

Zero‑assumption definitions for Canton and Synfin terms. If a term used in code or docs is missing here, add it.

| Term | Definition |
| --- | --- |
| **Aggregator** | A layer that gathers liquidity/quotes from multiple venues and routes an order to the best price. |
| **Best execution** | The obligation to obtain the best possible result for a client order (e.g., MiFID II Art. 27). Synfin's institutional layer targets *provable* best execution. |
| **SOR (Smart Order Routing)** | Logic that selects and splits an order across venues for best execution. In Synfin this is the `Router` port (open reference impl; proprietary optimizer pluggable). |
| **RFQ (Request for Quote)** | A model where the taker requests firm/indicative prices from market makers or pools for a specific size. |
| **TCA (Transaction Cost Analysis)** | Analysis quantifying execution quality; part of institutional best‑execution evidence (closed layer). |
| **Taker** | The party expressing a swap intent (a user, wallet, app, or institution). |
| **Venue** | A liquidity source on Canton (AMM, CLOB, RFQ desk) exposing quotes. |
| **Quote** | A normalized price response from a venue for a given size: indicative (non‑binding) or firm (committed). |
| **Swap intent** | A taker's desired swap: give/want assets, `minReceive`/`maxSlippageBps`, `deadline`. |
| **Route plan** | The chosen set of legs across venues, with aggregate and worst‑case receive and slippage. |
| **CIP‑0056** | The Canton Network Token Standard. Defines six APIs (token metadata, holdings, transfer instruction, allocation, allocation request, allocation instruction). Synfin builds on its allocation/DvP workflows. |
| **DvP (Delivery vs Payment)** | Exchange of asset and payment legs in one atomic transaction — all‑or‑nothing. |
| **FOP (Free of Payment)** | A direct transfer with no payment leg. |
| **Allocation** | Committing asset holdings to a settlement request so that a settlement app can execute all transfers atomically. The basis of Synfin's split execution. |
| **UTXO / Holding** | Canton uses a UTXO model: each active contract implementing the `Holding` interface is a UTXO. |
| **Synchronizer / Global Synchronizer** | Canton's shared ordering/consensus domain. All input contracts in one Daml transaction must be on the same synchronizer; the Global Synchronizer is the expected common ground for cross‑venue atomic settlement. |
| **Daml** | Canton's smart‑contract language. |
| **App rewards** | Canton Coin rewards distributed to applications per activity; reward cross‑app connections (a swap aggregator generates these by design). |
| **MEV** | Value extracted from transaction ordering (e.g., front‑running). Structurally mitigated on Canton by privacy. |
| **Selective disclosure** | Making a transaction visible only to authorized parties (e.g., an auditor/regulator), not the public. |
| **Conformance** | Meeting the standard's requirements such that an implementation interoperates; verified by the conformance suite. |
| **SQSS** | Synfin Quote & Swap‑Intent Standard — the normative spec in `docs/spec/SPECIFICATION.md`. |
| **Port / Adapter** | Hexagonal architecture: a *port* is an interface owned by the core; an *adapter* is an external implementation that plugs into it. |
