/**
 * `@synfin/spec` — the single source of truth for SQSS (SPECIFICATION.md).
 *
 * Exposes the generated wire types, runtime validators, exact-decimal helpers,
 * the cross-field constraint predicates, and the three ports. This package
 * ships no business logic (no adapter/router/settlement bodies).
 */

// Generated wire types (source of truth: schemas/*.schema.json, SPEC §4).
export type {
  AssetId,
  SwapIntent,
  IntentConstraints,
  QuoteRequest,
  Quote,
  RoutePlan,
  RouteLeg,
} from './generated/types.js';

// Result type used by validation and value math.
export type { Result, ValidationError } from './result.js';
export { ok, err } from './result.js';

// Exact-decimal helpers (SPEC §3).
export { Decimal, roundTakerFavorable } from './decimal.js';
export type { RoundingMode, AmountSide } from './decimal.js';

// Runtime validators (SPEC §4, §8).
export {
  validateAssetId,
  validateIntentConstraints,
  validateSwapIntent,
  validateQuoteRequest,
  validateQuote,
  validateRouteLeg,
  validateRoutePlan,
} from './validation/validators.js';
export type { TimeOptions } from './validation/validators.js';

// Cross-field constraint predicates (SPEC §4.4).
export {
  assetEquals,
  computeWorstCaseReceiveNet,
  checkConservation,
  checkWorstCaseFloor,
  checkSlippageBound,
  checkVenueConstraints,
  checkQuoteLinkage,
  checkNoOverstatement,
  checkAggregateConsistency,
  checkNetConsistency,
  checkRoutePlan,
  compareByWorstCase,
  isAtomicRoute,
  checkAtomicallySettleable,
} from './constraints.js';
export type { NetValueResult } from './constraints.js';

// The three ports (ADR-0005).
export type {
  VenueAdapter,
  QuoteRejection,
  SettlementMode,
  Router,
  RouteResult,
  NoViableRouteReason,
  Settlement,
  AllocationRequest,
  SettlementOutcome,
} from './ports/index.js';
export { isQuoteRejection } from './ports/index.js';
