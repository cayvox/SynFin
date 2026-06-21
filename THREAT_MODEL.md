# Threat Model

This is a living document. It uses a STRIDE lens over Synfin's components and trust boundaries (see ARCHITECTURE.md §5). It informs design, review, and the pre‑mainnet audit scope.

## Assets to protect

1. **Taker funds** — assets being swapped.
2. **Settlement atomicity** — the all‑or‑nothing guarantee.
3. **Intent privacy** — the taker's total order, size, route, and strategy.
4. **Quote integrity** — protection against acting on false or stale prices.
5. **Standard neutrality** — no implementation gains an unfair structural advantage.

## Trust boundaries

- **Taker side (trusted):** the SDK and routing run in the taker's environment.
- **Venues & network (untrusted):** quote responses and transport are adversarial until validated.
- **Ledger (trusted):** the Canton synchronizer and CIP‑0056 registries; final settlement happens here and enforces economic bounds on‑ledger.

## STRIDE summary

| Threat | Example | Mitigation |
| --- | --- | --- |
| **Spoofing** | A fake "venue" returns attractive quotes | Adapter allowlist + registry‑qualified asset IDs; firm quotes require signature/commitment; bounds enforced on‑ledger so a spoofed quote can at worst cause an abort, not a bad fill |
| **Tampering** | Quote altered in transit | Transport integrity (TLS); firm‑quote signatures; on‑ledger enforcement of `minReceive`/`maxSlippageBps` |
| **Repudiation** | Venue denies a firm quote | Firm quotes are commitments referenced on‑ledger; settlement either honors them or aborts |
| **Information disclosure** | Venue/observer infers taker's full order | Each venue sees only its leg; no component exposes cross‑leg correlation; logs redact intent/route; selective disclosure only to authorized auditors |
| **Denial of service** | Slow venues, spam/fake quotes, allocation‑lock griefing | Bounded concurrent quote gathering with deadlines; drop slow venues; allocation expiry releases locked funds; rate‑limit/penalize unreliable quote sources |
| **Elevation of privilege** | Unauthorized party allocates/settles or reuses an allocation | Daml authorization model; allocations single‑use and expiring; Daml Script tests assert no double‑spend |

## Specific risks & responses

- **Lying / stale quotes.** Indicative quotes are non‑binding; the **on‑ledger settlement enforces the taker's bounds**, so the worst outcome of a bad quote is a safe abort, not a loss. Stale quotes are rejected via `validUntil` + nonce/deadline replay protection.
- **Atomicity violation.** Partial fills are impossible at the protocol layer: settlement is a single Daml transaction (all‑or‑nothing). Same‑synchronizer requirement is enforced; cross‑synchronizer legs are rejected rather than settled non‑atomically.
- **MEV / front‑running.** **Structurally mitigated** by Canton's privacy: the order, size and route are not visible in a public mempool. This is a core property, not an add‑on — but we still avoid leaking intent through timing/side channels.
- **Decimal/rounding exploits.** Exact decimal math; rounding direction tested to never favor the protocol; overflow/precision covered by property tests.
- **Allocation‑lock DoS / griefing.** Expiry bounds how long funds can be locked; unreliable counterparties are de‑prioritized; settlement deadlines enforced on‑ledger.
- **Supply‑chain compromise.** Pinned deps, signed tags, SBOM, npm provenance, minimal dependency surface (see ENGINEERING.md §5).
- **Key/secret exposure.** Strict secrets doctrine (ENGINEERING.md §6); agents never read/print/persist secrets.
- **Privacy leakage via observability.** Telemetry is aggregate and non‑identifying; redaction enforced; reviewed as part of Definition of Done.

## Residual risk & audit

- Compromised taker devices and compromised Canton validators are out of scope.
- An **independent third‑party security audit** of the Daml library and allocation handling is **required before mainnet** (SECURITY.md). This threat model defines the audit's starting scope.
