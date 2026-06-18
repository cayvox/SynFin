/**
 * `@synfin/price-monitor` — Phase-0 price-divergence monitor.
 *
 * Read-only collection of cross-venue quotes (CantonSwap, OneSwap) over time and
 * the cross-venue spread (bps) per pair/size — the evidence the Phase-0 decision
 * gate rests on. No funds, no settlement. The pure collection/spread/report/store
 * logic is exported here for testing; the bin entry lives in `main.ts`.
 */
export type { Observation, Provenance } from './observation.js';
export { toJsonl, parseJsonl } from './observation.js';
export { computeSpread } from './spread.js';
export type { SpreadRow } from './spread.js';
export { toMarkdown, toCsv } from './report.js';
export type { ReportMeta } from './report.js';
export { collectObservations } from './collect.js';
export { TOKENS, pairSpec, defaultPairSpecs } from './tokens.js';
export type { PairSpec } from './tokens.js';
