/**
 * A small, dependency-free `Result` type used throughout `@synfin/spec`.
 *
 * Validation and value math return `Result` rather than throwing, so callers
 * must handle the failure path explicitly. This realizes the engineering
 * principle that types alone are not validation and that errors are typed and
 * meaningful (ENGINEERING.md §2).
 */
export type Result<T, E = ValidationError[]> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly errors: E };

/** A single, structured validation/constraint failure. */
export interface ValidationError {
  /**
   * Stable machine code for the failure (e.g. `schema`, `expired`,
   * `non_positive_amount`, `conservation`, `slippage_exceeded`). Never contains
   * taker intent totals, routes, or other privacy-sensitive data (CLAUDE.md §4).
   */
  readonly code: string;
  /** Human-readable, privacy-safe description of the failure. */
  readonly message: string;
  /** Optional JSON Pointer-style path to the offending field. */
  readonly path?: string;
}

/** Construct a successful result. */
export function ok<T>(value: T): Result<T> {
  return { ok: true, value };
}

/** Construct a failed result from one or more errors. */
export function err<T>(errors: ValidationError[] | ValidationError): Result<T> {
  return { ok: false, errors: Array.isArray(errors) ? errors : [errors] };
}
