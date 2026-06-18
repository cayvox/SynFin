import fc from 'fast-check';
import {
  assetEquals,
  isQuoteRejection,
  validateQuote,
  type QuoteRequest,
  type VenueAdapter,
} from '@synfin/spec';
import { equal, jsonEqual, ok } from './assert.js';

/**
 * Reusable **adapter conformance** runner (TESTING.md §5; SPEC §5). Given any
 * {@link VenueAdapter}, asserts that its quotes are spec-valid, deterministic
 * for identical requests, respect `validUntil`, echo the requested size, and
 * never overstate receipts (enforced by `validateQuote`'s precision/positivity
 * checks). Includes a fast-check fuzz pass: malformed/adversarial requests must
 * never crash — only yield a typed rejection or a spec-valid quote.
 *
 * Throws (via `node:assert`) on the first violation, so it can be dropped into
 * any test runner. Future real adapters import this to claim conformance.
 */
export interface AdapterConformanceOptions {
  /** Representative valid requests covering the adapter's supported pairs. */
  readonly requests: readonly QuoteRequest[];
  /** A time at which issued quotes are expected to be valid (unexpired). */
  readonly now: Date;
  /** Number of fuzz iterations (default 50). */
  readonly fuzzRuns?: number;
}

function fuzzRequestArbitrary(base: QuoteRequest): fc.Arbitrary<QuoteRequest> {
  // Adversarial amounts (including malformed decimals) and assets. The adapter
  // must never throw — only reject or return a valid quote.
  const amount = fc.oneof(
    fc.string(),
    fc.constantFrom('0', '-1', '1.5', '100', '', '1.234567890123', 'NaN'),
  );
  const asset = fc.oneof(
    fc.constant(base.give.asset),
    fc.record({
      registry: fc.string({ minLength: 1 }),
      instrumentId: fc.string({ minLength: 1 }),
      decimals: fc.nat(38),
    }),
  );
  return fc.record({ amount, asset, nonce: fc.string({ minLength: 1 }) }).map(
    (r): QuoteRequest => ({
      ...base,
      give: { asset: r.asset, amount: r.amount },
      nonce: r.nonce,
    }),
  );
}

export async function runAdapterConformance(
  adapter: VenueAdapter,
  options: AdapterConformanceOptions,
): Promise<void> {
  // The adapter must declare a settlement mode the spec recognises (RFC-0004,
  // SPEC §5). This capability is what a router/coordinator reads to decide
  // whether a route can be settled atomically (SPEC §6).
  ok(
    adapter.settlementMode === 'atomic-allocation' ||
      adapter.settlementMode === 'managed-deposit',
    'adapter must declare a valid settlementMode',
  );

  for (const req of options.requests) {
    const r1 = await adapter.quote(req);
    const r2 = await adapter.quote(req);
    jsonEqual(r1, r2, 'adapter.quote must be deterministic');

    if (isQuoteRejection(r1)) {
      equal(typeof r1.code, 'string', 'rejection must carry a code');
      equal(r1.venueId, adapter.venueId, 'rejection venueId must match');
      continue;
    }

    const quote = r1;
    ok(
      validateQuote(quote, { now: options.now }).ok,
      'issued quote must be spec-valid and unexpired at now',
    );
    equal(quote.venueId, adapter.venueId, 'quote venueId must match adapter');
    equal(
      quote.settlementMode,
      adapter.settlementMode,
      'quote settlementMode must match the adapter capability',
    );
    ok(
      assetEquals(quote.give.asset, req.give.asset) &&
        quote.give.amount === req.give.amount,
      'quote must echo the requested give size',
    );
    ok(
      assetEquals(quote.receive.asset, req.want.asset),
      'quote receive asset must match the request want',
    );
    // Respect validUntil: the quote MUST be rejected once its validity passes.
    const afterValidity = new Date(new Date(quote.validUntil).getTime() + 1000);
    ok(
      !validateQuote(quote, { now: afterValidity }).ok,
      'quote must be invalid after validUntil',
    );
  }

  const base = options.requests[0];
  if (base !== undefined) {
    await fc.assert(
      fc.asyncProperty(fuzzRequestArbitrary(base), async (req) => {
        const r = await adapter.quote(req);
        if (isQuoteRejection(r)) {
          equal(typeof r.code, 'string', 'fuzzed rejection must carry a code');
        } else {
          ok(
            validateQuote(r).ok,
            'a fuzzed request must never yield an invalid quote',
          );
        }
      }),
      { numRuns: options.fuzzRuns ?? 50 },
    );
  }
}
