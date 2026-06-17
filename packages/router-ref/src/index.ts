/**
 * `@synfin/router-ref` — open reference implementation of the SQSS `Router`
 * port (ADR-0005, ADR-0007). A correct, deterministic, depth-aware baseline —
 * **not** the optimizer. See the package README.
 */
export { route, createReferenceRouter, NoViableRouteError } from './router.js';
export type { RouteResult, NoRouteReason } from './router.js';
