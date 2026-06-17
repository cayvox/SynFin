import { describe, it } from 'vitest';
import { MockVenueAdapter } from '@synfin/adapters';
import { referenceRouter } from '@synfin/router-ref';
import type { AssetId, QuoteRequest } from '@synfin/spec';
import { runAdapterConformance, runRouterConformance } from '../src/index.js';

const USD: AssetId = { registry: 'reg::usd', instrumentId: 'USD', decimals: 2 };
const BTC: AssetId = { registry: 'reg::btc', instrumentId: 'BTC', decimals: 8 };

function request(amount: string, nonce: string): QuoteRequest {
  return {
    intentRef: 'intent-1',
    give: { asset: USD, amount },
    want: { asset: BTC },
    deadline: '2999-01-01T00:00:00Z',
    nonce,
  };
}

describe('adapter conformance (MockVenueAdapter is the first subject)', () => {
  it('MockVenueAdapter passes the adapter conformance suite', async () => {
    const adapter = new MockVenueAdapter({
      venueId: 'mock-a',
      pairs: [{ give: USD, want: BTC, rate0: '0.000016', liquidity: '100000' }],
      feeBps: 10,
    });
    await runAdapterConformance(adapter, {
      requests: [
        request('100', 'n1'),
        request('5000', 'n2'),
        request('50000', 'n3'),
        // An unsupported pair must produce a typed rejection (exercises that path).
        {
          ...request('100', 'n4'),
          want: {
            asset: { registry: 'reg::eur', instrumentId: 'EUR', decimals: 2 },
          },
        },
      ],
      now: new Date('2030-01-01T00:00:00Z'),
    });
  });

  it('a firm adapter also conforms', async () => {
    const adapter = new MockVenueAdapter({
      venueId: 'mock-firm',
      pairs: [{ give: USD, want: BTC, rate0: '0.000016', liquidity: '500000' }],
      firmness: 'firm',
      sourceKind: 'RFQ',
    });
    await runAdapterConformance(adapter, {
      requests: [request('250', 'f1')],
      now: new Date('2030-01-01T00:00:00Z'),
    });
  });
});

describe('router conformance (the reference router is the first subject)', () => {
  it('@synfin/router-ref passes the router conformance suite', () => {
    runRouterConformance(referenceRouter, { runs: 300 });
  });
});
