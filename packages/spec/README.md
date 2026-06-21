# @synfin/spec

> **Pre-alpha.** The API is unstable and may change without notice. Not for production use. Published under the `next` dist-tag.

The single source of truth for the Synfin Quote and Swap-Intent Standard (SQSS). It ships the off-ledger wire types, runtime validators, exact-decimal helpers, the cross-field constraint predicates, and the three ports (VenueAdapter, Router, Settlement). It contains no business logic: only the contracts the rest of Synfin depends on.

## Install

```sh
npm install @synfin/spec@next
```

## Spec

See the [Synfin specification](https://github.com/cayvox/SynFin/blob/main/docs/spec/SPECIFICATION.md). Synfin is ESM only and targets Node 20 or newer.

## License

Apache-2.0
