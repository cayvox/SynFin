import type {
  AssetId,
  Quote,
  QuoteRequest,
  RoutePlan,
  SwapIntent,
} from '../src/index.js';

/** Valid, reusable fixtures for the SQSS wire types (SPEC §4, RFC-0001). */

export const USD: AssetId = {
  registry: 'reg::usd',
  instrumentId: 'USD',
  decimals: 2,
};
export const BTC: AssetId = {
  registry: 'reg::btc',
  instrumentId: 'BTC',
  decimals: 8,
};

export const FUTURE = '2099-01-01T00:00:00Z';
export const PAST = '2000-01-01T00:00:00Z';
/** A clock before FUTURE and after PAST, for expiry checks. */
export const NOW = new Date('2030-01-01T00:00:00Z');

export function validIntent(overrides: Partial<SwapIntent> = {}): SwapIntent {
  return {
    intentId: 'intent-1',
    taker: 'taker::party',
    give: { asset: USD, amount: '100.00' },
    want: { asset: BTC, minReceive: '0.00100000' },
    maxSlippageBps: 50,
    deadline: FUTURE,
    ...overrides,
  };
}

export function validQuoteRequest(
  overrides: Partial<QuoteRequest> = {},
): QuoteRequest {
  return {
    intentRef: 'intent-1',
    give: { asset: USD, amount: '100.00' },
    want: { asset: BTC },
    deadline: FUTURE,
    nonce: 'nonce-1',
    ...overrides,
  };
}

export function validIndicativeQuote(overrides: Partial<Quote> = {}): Quote {
  return {
    quoteId: 'quote-1',
    venueId: 'venue-1',
    give: { asset: USD, amount: '100.00' },
    receive: { asset: BTC, amount: '0.00120000' },
    feeBps: 10,
    sourceKind: 'AMM',
    settlementMode: 'atomic-allocation',
    firmness: 'indicative',
    validUntil: FUTURE,
    ...overrides,
  };
}

export function validFirmQuote(overrides: Partial<Quote> = {}): Quote {
  return {
    ...validIndicativeQuote(),
    firmness: 'firm',
    commitment: 'commitment-1',
    signature: 'signature-1',
    ...overrides,
  };
}

export function validRoutePlan(overrides: Partial<RoutePlan> = {}): RoutePlan {
  return {
    intentRef: 'intent-1',
    legs: [
      {
        venueId: 'venue-1',
        give: { asset: USD, amount: '100.00' },
        receive: { asset: BTC, amount: '0.00120000' },
        quoteRef: 'quote-1',
      },
    ],
    aggregateReceive: '0.00120000',
    worstCaseReceive: '0.00110000',
    slippageBps: 20,
    ...overrides,
  };
}

/** The source quotes the default {@link validRoutePlan} is built from. */
export function validQuotesForPlan(): Quote[] {
  return [validIndicativeQuote({ quoteId: 'quote-1' })];
}
