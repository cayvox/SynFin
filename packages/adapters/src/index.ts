/**
 * `@synfin/adapters` — venue adapters implementing the SQSS `VenueAdapter` port
 * (ADR-0005; SPEC §5). Ships a deterministic `MockVenueAdapter` for development
 * and tests (not a real venue).
 */
export { MockVenueAdapter } from './mock-venue-adapter.js';
export type { MockVenueConfig, MockPair } from './mock-venue-adapter.js';
