import { Decimal } from '../decimal.js';
import { type Result, type ValidationError, ok, err } from '../result.js';
import type {
  AssetId,
  IntentConstraints,
  Quote,
  QuoteRequest,
  RouteLeg,
  RoutePlan,
  SwapIntent,
} from '../generated/types.js';
import { getValidator, toValidationErrors } from './ajv.js';

/**
 * Runtime validation for the SQSS wire types (SPECIFICATION.md §4).
 *
 * Each `validateX` runs the JSON Schema (shape, enums, formats, required
 * fields, and the firm-quote commitment/signature rule) and then the semantic
 * checks that JSON Schema cannot express on decimal strings: positivity,
 * instrument precision (SPEC §3), and time-based expiry (SPEC §4.3, §8).
 *
 * Types are not validation (ENGINEERING.md §2): always validate untrusted input
 * (venue quotes are adversarial — ARCHITECTURE.md §1 invariant #7) before use.
 *
 * Forward compatibility (SPEC §9): unknown OPTIONAL fields are ignored, since
 * the schemas do not set `additionalProperties: false`.
 */

/** Time reference for expiry checks. Omit to skip the time-based checks. */
export interface TimeOptions {
  /** Current instant; quotes/requests at or before their validity are accepted. */
  now?: Date;
}

interface AmountedAsset {
  asset: Pick<AssetId, 'decimals'>;
  amount: string;
}

/**
 * Validate a positive decimal amount against an instrument's precision.
 * Amounts MUST be positive and MUST NOT carry more fractional digits than the
 * instrument's `decimals` (SPEC §3).
 *
 * @internal Exported for unit testing of defensive branches; not part of the
 * public API.
 */
export function checkAmount(
  amount: string,
  decimals: number,
  path: string,
): ValidationError[] {
  const value = Decimal.parse(amount);
  if (value === undefined) {
    return [{ code: 'invalid_decimal', message: 'not a valid decimal', path }];
  }
  const errors: ValidationError[] = [];
  if (!value.isPositive()) {
    errors.push({ code: 'non_positive_amount', message: 'must be > 0', path });
  }
  if (value.scale > decimals) {
    errors.push({
      code: 'excess_precision',
      message: `exceeds instrument precision of ${decimals}`,
      path,
    });
  }
  return errors;
}

function checkMoney(money: AmountedAsset, path: string): ValidationError[] {
  return checkAmount(money.amount, money.asset.decimals, `${path}/amount`);
}

/**
 * Validate a non-negative decimal whose instrument precision is not known here.
 *
 * @internal Exported for unit testing; not part of the public API.
 */
export function checkNonNegativeDecimal(
  value: string,
  path: string,
): ValidationError[] {
  const parsed = Decimal.parse(value);
  if (parsed === undefined) {
    return [{ code: 'invalid_decimal', message: 'not a valid decimal', path }];
  }
  if (parsed.isNegative()) {
    return [{ code: 'negative_amount', message: 'must be >= 0', path }];
  }
  return [];
}

/** @internal Exported for unit testing; not part of the public API. */
export function isExpired(timestamp: string, now: Date | undefined): boolean {
  if (now === undefined) return false;
  return now.getTime() > new Date(timestamp).getTime();
}

/** Validate an {@link AssetId} (SPEC §3). */
export function validateAssetId(input: unknown): Result<AssetId> {
  const validate = getValidator('primitives.schema.json#/$defs/AssetId');
  if (!validate(input)) return err(toValidationErrors(validate.errors));
  return ok(input as AssetId);
}

/** Validate {@link IntentConstraints} (SPEC §4.1). */
export function validateIntentConstraints(
  input: unknown,
): Result<IntentConstraints> {
  const validate = getValidator('intent-constraints.schema.json');
  if (!validate(input)) return err(toValidationErrors(validate.errors));
  return ok(input as IntentConstraints);
}

/** Validate a {@link SwapIntent} (SPEC §4.1). */
export function validateSwapIntent(input: unknown): Result<SwapIntent> {
  const validate = getValidator('swap-intent.schema.json');
  if (!validate(input)) return err(toValidationErrors(validate.errors));
  const intent = input as SwapIntent;
  const errors: ValidationError[] = [
    ...checkMoney(intent.give, '/give'),
    ...checkAmount(
      intent.want.minReceive,
      intent.want.asset.decimals,
      '/want/minReceive',
    ),
  ];
  return errors.length > 0 ? err(errors) : ok(intent);
}

/** Validate a {@link QuoteRequest} (SPEC §4.2). */
export function validateQuoteRequest(
  input: unknown,
  options: TimeOptions = {},
): Result<QuoteRequest> {
  const validate = getValidator('quote-request.schema.json');
  if (!validate(input)) return err(toValidationErrors(validate.errors));
  const req = input as QuoteRequest;
  const errors: ValidationError[] = [...checkMoney(req.give, '/give')];
  if (isExpired(req.deadline, options.now)) {
    errors.push({
      code: 'expired',
      message: 'deadline has passed',
      path: '/deadline',
    });
  }
  return errors.length > 0 ? err(errors) : ok(req);
}

/**
 * Validate a {@link Quote} (SPEC §4.3, §8). Consumers MUST reject expired
 * quotes; pass `options.now` to enforce `validUntil`. The firm-quote
 * commitment/signature requirement is enforced by the schema.
 */
export function validateQuote(
  input: unknown,
  options: TimeOptions = {},
): Result<Quote> {
  const validate = getValidator('quote.schema.json');
  if (!validate(input)) return err(toValidationErrors(validate.errors));
  const quote = input as Quote;
  const errors: ValidationError[] = [
    ...checkMoney(quote.give, '/give'),
    ...checkMoney(quote.receive, '/receive'),
  ];
  if (isExpired(quote.validUntil, options.now)) {
    errors.push({
      code: 'expired',
      message: 'validUntil has passed',
      path: '/validUntil',
    });
  }
  return errors.length > 0 ? err(errors) : ok(quote);
}

/** Validate a {@link RouteLeg} (SPEC §4.4). */
export function validateRouteLeg(input: unknown): Result<RouteLeg> {
  const validate = getValidator('route-leg.schema.json');
  if (!validate(input)) return err(toValidationErrors(validate.errors));
  const leg = input as RouteLeg;
  const errors: ValidationError[] = [
    ...checkMoney(leg.give, '/give'),
    ...checkMoney(leg.receive, '/receive'),
  ];
  return errors.length > 0 ? err(errors) : ok(leg);
}

/**
 * Validate a {@link RoutePlan}'s shape and per-field sanity (SPEC §4.4). The
 * cross-field invariants that need the originating intent and quotes
 * (conservation, `worstCaseReceive >= minReceive`, slippage bound,
 * `maxVenues`/`venueAllowList`) live in `constraints.ts`.
 */
export function validateRoutePlan(input: unknown): Result<RoutePlan> {
  const validate = getValidator('route-plan.schema.json');
  if (!validate(input)) return err(toValidationErrors(validate.errors));
  const plan = input as RoutePlan;
  const errors: ValidationError[] = [];
  plan.legs.forEach((leg, i) => {
    errors.push(...checkMoney(leg.give, `/legs/${i}/give`));
    errors.push(...checkMoney(leg.receive, `/legs/${i}/receive`));
  });
  errors.push(
    ...checkNonNegativeDecimal(plan.aggregateReceive, '/aggregateReceive'),
    ...checkNonNegativeDecimal(plan.worstCaseReceive, '/worstCaseReceive'),
  );
  return errors.length > 0 ? err(errors) : ok(plan);
}
