import { describe, expect, it } from 'vitest';
import { isQuoteRejection } from '../src/index.js';
import type { QuoteRejection } from '../src/index.js';
import { validIndicativeQuote } from './fixtures.js';

describe('isQuoteRejection (port type guard)', () => {
  it('distinguishes a rejection from a quote', () => {
    const rejection: QuoteRejection = {
      venueId: 'venue-1',
      code: 'insufficient_liquidity',
    };
    expect(isQuoteRejection(rejection)).toBe(true);
    expect(isQuoteRejection(validIndicativeQuote())).toBe(false);
  });
});
