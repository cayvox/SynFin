# Venue golden fixtures (provenance)

These JSON files are **recorded/sample venue responses** used to drive deterministic,
reproducible adapter tests and the CLI's offline fallback. **No live network calls are made in
CI** — every adapter test runs against these fixtures.

No secrets, API keys, or PII are stored here. Party identifiers are sanitized to
`…::1220sample…` placeholders (the real values are public DSO/registry party IDs, not secrets, but
are not needed to exercise the normalizers).

The adapters treat every venue response as **untrusted input** (ARCHITECTURE.md §1 invariant #7):
the fixtures only need to reproduce the venue's documented wire *shape*; the normalizer validates
and may reject them.

## CantonSwap — `cantonswap/`

- **Base URL:** `https://mainnet.rpc.canton.nightly.app`
- **Docs:** <https://cantonswap.nightly.app/docs>
- **Quote mechanism:** `POST /nswap/quote` (`fromToken`, `toToken`, `amount`, `recipient`,
  `slippageTolerance?`) → `SwapQuote` (`fromAmount`, `toAmount`, `minOutAmount`, `rate`,
  `priceImpact`, `memo`, `swapAddress`, `magicAddress?`). No API key/auth. Read-only and fundless:
  obtaining a quote computes a route and returns deposit *instructions* but **moves no funds and
  creates no on-chain commitment**. Settlement (out of scope here) would be a deposit to
  `swapAddress`+`memo` — Mode B (`managed-deposit`).
- **Firmness:** indicative — docs do not classify the quote as firm and expose no `validUntil`
  ("refresh quote before swap"); the adapter applies a conservative TTL.

| File | What it is | Provenance |
| --- | --- | --- |
| `tokens.json` | `GET /nswap/tokens` catalog (token → decimals / admin). | **Real live capture, 2026-06-18** from `https://mainnet.rpc.canton.nightly.app/nswap/tokens`. Party IDs sanitized. |
| `quote-amulet-usdcx-125.json` | A `SwapQuote` for 125 CC → USDCx. | **Reconstructed** from the verbatim documented `SwapQuote` schema (cantonswap.nightly.app/docs, 2026-06-18) with values consistent with the live token prices, because the live `POST /nswap/quote` endpoint returned `{"message":"Service under maintenance."}` at capture time (2026-06-18). |
| `maintenance.json` | The venue's error body. | **Real live capture, 2026-06-18** — the exact body returned by `POST /nswap/quote` while under maintenance. Drives the `venue_error` rejection test. |

## OneSwap — `oneswap/`

- **Docs:** <https://docs.oneswap.cc> (SDK `@oneswap/sdk`).
- **Quote mechanism:** `client.quotes.get({ from, to, amount, receiverParty?, … })` → `Quote`
  (`outputAmount`, `rate`, `priceImpact`, `fee`, `expiresIn`, `settlementSafety`, …). It is
  **read-only and purely computational** — "returns a price quote without creating intents or
  deposits" (docs.oneswap.cc/reference/sdk-methods). Quoting requires an **API key**
  (`apiKey: 'os_live_…'`); the CLI reads it from `ONESWAP_API_KEY` and never commits/logs it.
  Creating a funded swap intent (`swaps.create`, 24h deposit window) is **out of scope** — Mode B
  (`managed-deposit`).
- **Firmness:** indicative — an AMM price preview; the fill is subject to slippage at deposit time.
  Validity comes from the quote's `expiresIn` (seconds).

| File | What it is | Provenance |
| --- | --- | --- |
| `quote-amulet-usdcx-100.json` | A `Quote` for 100 CC → USDCx. | **Constructed** from the verbatim documented `Quote` TypeScript interface (docs.oneswap.cc/reference/types, 2026-06-18); no live capture was possible without an API key. Token decimals (CC/Amulet = 10, USDCx = 6) cross-referenced from CantonSwap's live `tokens.json` (same Canton-native instruments). |
| `quote-blocked.json` | A `Quote` whose `settlementSafety` is non-null. | **Constructed** from the documented type to drive the `settlement_blocked` rejection test. |

## Tradecraft: `tradecraft/`

- **Base URL:** `https://api.tradecraft.fi/v1`
- **Docs:** <https://docs.tradecraft.fi>
- **Quote mechanism:** `GET /quoteForFixedInput/{tokenA}/{tokenB}?givingAmount=X` (tokenA = give,
  tokenB = want; the path segments are Tradecraft **symbols**, e.g. `CC`, not the SQSS
  `instrumentId` `Amulet`) returns `{ user_gets: number }`, already net of the double-sided
  constant-product fees. No API key, no auth. Read-only and fundless. Settlement (out of scope
  here) is a deposit to a Pool Address: Mode B (`managed-deposit`).
- **Firmness:** indicative. The response is explicitly an ESTIMATE (the on-chain trade only starts
  after the taker deposits, so the realized price can drift) and carries no validity field, so the
  adapter applies a conservative 30s TTL.

| File | What it is | Provenance |
| --- | --- | --- |
| `quote-cc-usdcx-100.json` | `{ user_gets }` for 100 CC → USDCx. | **Real live capture, 2026-06-26** from `GET https://api.tradecraft.fi/v1/quoteForFixedInput/CC/USDCx?givingAmount=100`. |
| `error-amm-not-found.json` | The venue's `{ error }` body for an unknown pair. | **Real live capture, 2026-06-26** from `GET .../quoteForFixedInput/CC/NOPE?givingAmount=100` (HTTP 400). Drives the `venue_error` and `invalid_request` rejection tests. |
