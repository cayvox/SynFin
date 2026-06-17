/**
 * The three Synfin ports (hexagonal architecture, ADR-0005; ARCHITECTURE.md §2).
 * Interfaces only — implementations live in `@synfin/adapters`,
 * `@synfin/router-ref`, and `daml/synfin-settlement`.
 */
export type { VenueAdapter, QuoteRejection } from './venue-adapter.js';
export { isQuoteRejection } from './venue-adapter.js';
export type { Router } from './router.js';
export type {
  Settlement,
  AllocationRequest,
  SettlementOutcome,
} from './settlement.js';
