/**
 * `@synfin/adapters` — venue adapters implementing the SQSS `VenueAdapter` port
 * (ADR-0005; SPEC §5).
 *
 * - `MockVenueAdapter` — deterministic in-memory venue for development/tests.
 * - `CantonSwapAdapter`, `OneSwapAdapter` — **real** quote adapters for the
 *   Mode B (`managed-deposit`) Canton venues (ADR-0009; RFC-0004). Quote layer
 *   only — no settlement/deposit. Each separates an injectable HTTP `Fetcher`
 *   from a pure, deterministic normalizer.
 */
export { MockVenueAdapter } from './mock-venue-adapter.js';
export type { MockVenueConfig, MockPair } from './mock-venue-adapter.js';

export { fetchJson } from './http.js';
export type { Fetcher, HttpRequest, HttpResponse } from './http.js';

export {
  CantonSwapAdapter,
  normalizeCantonSwapQuote,
} from './cantonswap-adapter.js';
export type {
  CantonSwapConfig,
  CantonSwapNormalizeContext,
} from './cantonswap-adapter.js';

export { OneSwapAdapter, normalizeOneSwapQuote } from './oneswap-adapter.js';
export type {
  OneSwapConfig,
  OneSwapNormalizeContext,
} from './oneswap-adapter.js';
