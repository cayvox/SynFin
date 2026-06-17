/**
 * `@synfin/conformance` — the reusable SQSS conformance harness (TESTING.md §5).
 *
 * Import these runners to assert that a `VenueAdapter` or `Router` conforms to
 * the standard. The runners are framework-agnostic (they throw via
 * `node:assert` on the first violation) so they drop into any test runner.
 */
export {
  runAdapterConformance,
  type AdapterConformanceOptions,
} from './adapter-conformance.js';
export {
  runRouterConformance,
  type RouterConformanceOptions,
  type ConformanceRouteFn,
  type ConformanceRouteResult,
} from './router-conformance.js';
