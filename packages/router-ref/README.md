# @synfin/router-ref

> **Pre-alpha.** The API is unstable and may change without notice. Not for production use. Published under the `next` dist-tag.

The open reference implementation of the SQSS Router port: a correct, deterministic, depth-aware baseline that selects and splits quotes into a RoutePlan. It is the reference, not the optimizer. Given the same intent, quotes, and time it always returns the same result.

## Install

```sh
npm install @synfin/router-ref@next
```

## Spec

See the [Synfin specification](https://github.com/cayvox/SynFin/blob/main/docs/spec/SPECIFICATION.md). Synfin is ESM only and targets Node 20 or newer.

## License

Apache-2.0
