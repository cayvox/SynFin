/**
 * Exact decimal arithmetic for value math (SPECIFICATION.md §3).
 *
 * Implementations MUST NOT use binary floating point for value math, so this
 * module represents a decimal as a signed BigInt coefficient at a fixed
 * `scale` (number of fractional digits): value = coefficient / 10^scale. All
 * arithmetic is exact; rounding is explicit and centralized here.
 *
 * Rounding rule (SPEC §3): rounding MUST never overstate what the taker
 * receives or understate what the taker gives. {@link roundTakerFavorable}
 * encodes that direction so call sites never have to reason about it.
 *
 * This is a deliberately small, dependency-free helper rather than a general
 * big-decimal library (ENGINEERING.md §5: prefer the standard library and
 * small audited code; no heavyweight dependency).
 */

/** Rounding direction used by {@link Decimal.quantize}. */
export type RoundingMode =
  /** Toward negative infinity. */
  | 'floor'
  /** Toward positive infinity. */
  | 'ceil'
  /** Toward zero (truncate). */
  | 'trunc'
  /** Away from zero. */
  | 'away';

/** Whether a rounded amount is delivered to (receive) or spent by (give) the taker. */
export type AmountSide = 'receive' | 'give';

const DECIMAL_RE = /^-?(0|[1-9][0-9]*)(\.[0-9]+)?$/;

function pow10(n: number): bigint {
  return 10n ** BigInt(n);
}

/** An exact decimal value at a fixed scale. Immutable. */
export class Decimal {
  /** Signed coefficient; the value is `coefficient / 10^scale`. */
  readonly #coefficient: bigint;
  /** Number of fractional digits (>= 0). */
  readonly #scale: number;

  private constructor(coefficient: bigint, scale: number) {
    // Normalize negative zero to positive zero.
    this.#coefficient = coefficient === 0n ? 0n : coefficient;
    this.#scale = scale;
  }

  /**
   * Parse a canonical decimal string (see the `Decimal` primitive schema). Does
   * not throw; malformed input yields `undefined` so callers can reject it.
   */
  static parse(input: string): Decimal | undefined {
    if (!DECIMAL_RE.test(input)) return undefined;
    const negative = input.startsWith('-');
    const body = negative ? input.slice(1) : input;
    const dot = body.indexOf('.');
    let digits: string;
    let scale: number;
    if (dot === -1) {
      digits = body;
      scale = 0;
    } else {
      digits = body.slice(0, dot) + body.slice(dot + 1);
      scale = body.length - dot - 1;
    }
    const magnitude = BigInt(digits);
    return new Decimal(negative ? -magnitude : magnitude, scale);
  }

  /** The additive identity at scale 0. */
  static zero(): Decimal {
    return new Decimal(0n, 0);
  }

  /** Exact sum of a list (empty list sums to zero). */
  static sum(values: readonly Decimal[]): Decimal {
    return values.reduce((acc, v) => acc.add(v), Decimal.zero());
  }

  /** Number of fractional digits this value carries. */
  get scale(): number {
    return this.#scale;
  }

  /** Align two values to a common scale, returning their coefficients. */
  #align(other: Decimal): { a: bigint; b: bigint; scale: number } {
    const scale = Math.max(this.#scale, other.#scale);
    const a = this.#coefficient * pow10(scale - this.#scale);
    const b = other.#coefficient * pow10(scale - other.#scale);
    return { a, b, scale };
  }

  add(other: Decimal): Decimal {
    const { a, b, scale } = this.#align(other);
    return new Decimal(a + b, scale);
  }

  sub(other: Decimal): Decimal {
    const { a, b, scale } = this.#align(other);
    return new Decimal(a - b, scale);
  }

  mul(other: Decimal): Decimal {
    return new Decimal(
      this.#coefficient * other.#coefficient,
      this.#scale + other.#scale,
    );
  }

  /** -1 if this < other, 0 if equal in value, 1 if this > other. */
  compare(other: Decimal): -1 | 0 | 1 {
    const { a, b } = this.#align(other);
    if (a < b) return -1;
    if (a > b) return 1;
    return 0;
  }

  eq(other: Decimal): boolean {
    return this.compare(other) === 0;
  }
  lt(other: Decimal): boolean {
    return this.compare(other) === -1;
  }
  lte(other: Decimal): boolean {
    return this.compare(other) !== 1;
  }
  gt(other: Decimal): boolean {
    return this.compare(other) === 1;
  }
  gte(other: Decimal): boolean {
    return this.compare(other) !== -1;
  }

  isZero(): boolean {
    return this.#coefficient === 0n;
  }
  isPositive(): boolean {
    return this.#coefficient > 0n;
  }
  isNegative(): boolean {
    return this.#coefficient < 0n;
  }

  neg(): Decimal {
    return new Decimal(-this.#coefficient, this.#scale);
  }

  /**
   * Round to `targetScale` fractional digits using the given mode. Increasing
   * the scale is exact; reducing it applies the rounding mode to the discarded
   * digits.
   */
  quantize(targetScale: number, mode: RoundingMode): Decimal {
    if (targetScale < 0) {
      throw new RangeError('targetScale must be >= 0');
    }
    if (targetScale >= this.#scale) {
      const scaled = this.#coefficient * pow10(targetScale - this.#scale);
      return new Decimal(scaled, targetScale);
    }
    const factor = pow10(this.#scale - targetScale);
    const q = this.#coefficient / factor; // BigInt division truncates toward zero.
    const r = this.#coefficient % factor;
    if (r === 0n) return new Decimal(q, targetScale);

    let adjusted = q;
    switch (mode) {
      case 'floor':
        if (this.#coefficient < 0n) adjusted = q - 1n;
        break;
      case 'ceil':
        if (this.#coefficient > 0n) adjusted = q + 1n;
        break;
      case 'away':
        adjusted = this.#coefficient < 0n ? q - 1n : q + 1n;
        break;
      case 'trunc':
        break;
    }
    return new Decimal(adjusted, targetScale);
  }

  /** Canonical string form, preserving the value's scale (trailing zeros kept). */
  toString(): string {
    const negative = this.#coefficient < 0n;
    const digits = (
      negative ? -this.#coefficient : this.#coefficient
    ).toString();
    if (this.#scale === 0) {
      return negative ? `-${digits}` : digits;
    }
    const padded = digits.padStart(this.#scale + 1, '0');
    const cut = padded.length - this.#scale;
    const intPart = padded.slice(0, cut);
    const fracPart = padded.slice(cut);
    return `${negative ? '-' : ''}${intPart}.${fracPart}`;
  }
}

/**
 * Round a value to an instrument's precision in the direction that is safe for
 * the taker (SPEC §3): receive amounts round down (never overstate what the
 * taker receives); give amounts round up (never understate what the taker
 * gives). Centralizing this here guarantees no call site rounds in the
 * protocol's favor.
 */
export function roundTakerFavorable(
  value: Decimal,
  targetScale: number,
  side: AmountSide,
): Decimal {
  return value.quantize(targetScale, side === 'receive' ? 'floor' : 'ceil');
}
