/**
 * Tiny framework-agnostic assertions for the conformance runners. They throw a
 * plain `Error` on failure, so the runners work under any test runner (and any
 * thrown error fails a surrounding fast-check property) without depending on
 * `node:assert` types or a test framework.
 */

export function ok(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`conformance: ${message}`);
}

export function equal<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) {
    throw new Error(
      `conformance: ${message} (got ${String(actual)}, expected ${String(expected)})`,
    );
  }
}

/** Structural equality via canonical JSON (sufficient for plain wire objects). */
export function jsonEqual(a: unknown, b: unknown, message: string): void {
  if (JSON.stringify(a) !== JSON.stringify(b)) {
    throw new Error(`conformance: ${message}`);
  }
}
