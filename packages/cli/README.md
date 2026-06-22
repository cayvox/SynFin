# @synfin/cli

[![npm](https://img.shields.io/npm/v/@synfin/cli)](https://www.npmjs.com/package/@synfin/cli) [![provenance](https://img.shields.io/badge/provenance-attested-brightgreen)](https://www.npmjs.com/package/@synfin/cli) [![license](https://img.shields.io/npm/l/@synfin/cli)](https://github.com/cayvox/SynFin/blob/main/LICENSE)

> **Pre-alpha.** The API is unstable and may change without notice. Not for production use.

The Synfin reference CLI: a unified quote layer across Canton venues, with an atomic settlement demo. Read-only for quotes: it moves no funds.

## Run

Try it without installing:

```sh
npx @synfin/cli --help
npx @synfin/cli quote CC USDCx 125
```

`quote` tries live, read-only venue quotes first (CantonSwap needs no key; OneSwap needs `ONESWAP_API_KEY` and `ONESWAP_BASE_URL`). If live venues are unavailable, or when you pass `--fixtures`, it uses recorded sample data bundled with the CLI, so it runs offline from a clean install. It moves no funds.

```sh
# force the offline recorded-sample path
npx @synfin/cli quote CC USDCx 125 --fixtures

# widen the slippage guard
npx @synfin/cli quote CC USDCx 125 --slippage-bps 50
```

Or install it:

```sh
npm install @synfin/cli
synfin --help
```

## Commands

- `synfin quote <FROM> <TO> <AMOUNT> [--slippage-bps N] [--fixtures]`: gather cross-venue quotes (CantonSwap, OneSwap) and print the best route. Read-only. Tokens: CC, USDCx, CBTC.
- `synfin settle-demo`: atomic, per-leg-private split settlement against the project's own CIP-0056 test venue (Amulet). Needs the Daml SDK.

## Links

- [Specification](https://github.com/cayvox/SynFin/blob/main/docs/spec/SPECIFICATION.md)
- [Repository](https://github.com/cayvox/SynFin)

Synfin is ESM only and targets Node 20 or newer.

## License

Apache-2.0
