/**
 * `@synfin/router-ref` — open reference implementation of the SQSS `Router`
 * port (ADR-0005, ADR-0007). A correct, deterministic, depth-aware baseline —
 * **not** the optimizer. See the package README.
 */
export { route, referenceRouter } from './router.js';
// Re-export the standard result types for convenience (defined in @synfin/spec).
export type { RouteResult, NoViableRouteReason } from '@synfin/spec';
