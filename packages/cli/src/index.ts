/**
 * `@synfin/cli` — the Synfin reference CLI.
 *
 * Demo 1 (`quote`): cross-venue quote aggregation against the real Mode B
 * (managed-deposit) Canton venues (CantonSwap, OneSwap). Read-only; no funds,
 * no settlement. The pure aggregation + formatting logic is exported here for
 * testing; the bin entry lives in `main.ts`.
 */
export { aggregateQuotes } from './aggregate.js';
export type { AggregateResult, VenueOutcome } from './aggregate.js';
export { formatReport } from './format.js';
export type { RunMode } from './format.js';
export { buildIntent, minUnit } from './intent.js';
export type { BuildIntentParams } from './intent.js';
export { TOKENS, resolveToken } from './tokens.js';
