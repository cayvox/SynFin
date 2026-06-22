# @synfin/conformance

[![npm](https://img.shields.io/npm/v/@synfin/conformance/next)](https://www.npmjs.com/package/@synfin/conformance) [![provenance](https://img.shields.io/badge/provenance-attested-brightgreen)](https://www.npmjs.com/package/@synfin/conformance) [![license](https://img.shields.io/npm/l/@synfin/conformance)](https://github.com/cayvox/SynFin/blob/main/LICENSE)

> **Pre-alpha.** The API is unstable and may change without notice. Not for production use. Published under the `next` dist-tag.

The Synfin conformance suite. Any venue, adapter, or wallet runs it to check that an implementation behaves to the standard before claiming Synfin conformance. The runners are property-based and throw on the first violation, so they drop into any test runner.

## Install

```sh
npm install @synfin/conformance@next
```

## Usage

```js
import { referenceRouter } from '@synfin/router-ref';
import { runRouterConformance } from '@synfin/conformance';

// throws on the first violation; passes for a conforming Router
runRouterConformance(referenceRouter);
```

It also exports `runAdapterConformance` to check a `VenueAdapter` implementation.

## Links

- [Specification](https://github.com/cayvox/SynFin/blob/main/docs/spec/SPECIFICATION.md)
- [Repository](https://github.com/cayvox/SynFin)

Synfin is ESM only and targets Node 20 or newer.

## License

Apache-2.0
