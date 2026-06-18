/**
 * `@synfin/cli` — the Synfin reference CLI. A unified quote layer across Canton
 * venues, with atomic settlement, presented as a two-demo proof of work:
 *
 *   - Demo 1 (`quote`): cross-venue quote aggregation against the real Mode B
 *     (managed-deposit) venues (CantonSwap, OneSwap). Read-only; no funds.
 *   - Demo 2 (`settle-demo`): atomic, per-leg-private split settlement against
 *     our own CIP-0056 test venue (Amulet) on a local ledger — it drives the
 *     proven `daml/synfin-settlement` library (no settlement logic in the CLI).
 *
 * The pure aggregation/orchestration/formatting logic is exported here for
 * testing; the bin entry lives in `main.ts`.
 */
export { aggregateQuotes } from './aggregate.js';
export type { AggregateResult, VenueOutcome } from './aggregate.js';
export { formatReport } from './format.js';
export type { RunMode } from './format.js';
export { buildIntent, minUnit } from './intent.js';
export type { BuildIntentParams } from './intent.js';
export { TOKENS, resolveToken } from './tokens.js';
export { runSettleDemo, formatSettleDemoReport } from './settle-demo.js';
export type {
  DemoRunResult,
  DemoRunner,
  SettleDemoOutcome,
} from './settle-demo.js';
