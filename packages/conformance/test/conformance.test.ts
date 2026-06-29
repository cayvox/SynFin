import { describe, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  CantexAdapter,
  CantonSwapAdapter,
  MockVenueAdapter,
  OneSwapAdapter,
  TradecraftAdapter,
  type Fetcher,
} from '@synfin/adapters';
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

// --- Real Mode B (managed-deposit) venue adapters, run against golden fixtures.
//     No live network call: a fixture-backed Fetcher + a fixed clock make the
//     runs deterministic (TESTING.md §5; ADR-0009; RFC-0004).
const CC: AssetId = {
  registry:
    'DSO::1220sample0000000000000000000000000000000000000000000000000000000000',
  instrumentId: 'Amulet',
  decimals: 10,
};
const USDCx: AssetId = {
  registry:
    'decentralized-usdc-interchain-rep::1220sample00000000000000000000000000000000000000000000000000000000',
  instrumentId: 'USDCx',
  decimals: 6,
};
const NOW = new Date('2030-01-01T00:00:00Z');

function ccRequest(amount: string, nonce: string): QuoteRequest {
  return {
    intentRef: 'intent-1',
    give: { asset: CC, amount },
    want: { asset: USDCx },
    deadline: '2999-01-01T00:00:00Z',
    nonce,
  };
}
function loadFixture(rel: string): unknown {
  return JSON.parse(
    readFileSync(
      new URL(`../../adapters/fixtures/${rel}`, import.meta.url),
      'utf8',
    ),
  );
}
function fixtureFetcher(body: unknown): Fetcher {
  return () => Promise.resolve({ status: 200, body });
}

describe('real venue adapters pass adapter conformance (fixture-backed)', () => {
  it('CantonSwapAdapter conforms', async () => {
    const adapter = new CantonSwapAdapter({
      fetcher: fixtureFetcher(
        loadFixture('cantonswap/quote-amulet-usdcx-125.json'),
      ),
      now: () => NOW,
    });
    await runAdapterConformance(adapter, {
      requests: [ccRequest('125', 'c1'), ccRequest('500', 'c2')],
      now: NOW,
    });
  });

  it('OneSwapAdapter conforms', async () => {
    const adapter = new OneSwapAdapter({
      baseUrl: 'https://example.invalid',
      apiKey: 'test-key-not-a-secret',
      fetcher: fixtureFetcher(
        loadFixture('oneswap/quote-amulet-usdcx-100.json'),
      ),
      now: () => NOW,
    });
    await runAdapterConformance(adapter, {
      requests: [ccRequest('100', 'o1'), ccRequest('250', 'o2')],
      now: NOW,
    });
  });

  it('CantexAdapter conforms with a give-asset networkFee (size 100)', async () => {
    // The size-100 capture carries a positive CC network fee, exercising the
    // give-or-receive-asset rule in the adapter conformance check (RFC-0005 §2).
    const adapter = new CantexAdapter({
      fetcher: fixtureFetcher(loadFixture('cantex/quote-cc-usdcx-100.json')),
      now: () => NOW,
    });
    await runAdapterConformance(adapter, {
      requests: [ccRequest('100', 'cx1')],
      now: NOW,
    });
  });

  it('CantexAdapter conforms with a waived networkFee (size 500)', async () => {
    // The size-500 capture has network_fee 0 (waived), so the quote omits
    // networkFee; it must still conform.
    const adapter = new CantexAdapter({
      fetcher: fixtureFetcher(loadFixture('cantex/quote-cc-usdcx-500.json')),
      now: () => NOW,
    });
    await runAdapterConformance(adapter, {
      requests: [ccRequest('500', 'cx2')],
      now: NOW,
    });
  });

  it('TradecraftAdapter conforms (no networkFee)', async () => {
    const adapter = new TradecraftAdapter({
      fetcher: fixtureFetcher(
        loadFixture('tradecraft/quote-cc-usdcx-100.json'),
      ),
      now: () => NOW,
    });
    await runAdapterConformance(adapter, {
      requests: [ccRequest('100', 'tc1')],
      now: NOW,
    });
  });
});

describe('router conformance (the reference router is the first subject)', () => {
  it('@synfin/router-ref passes the router conformance suite', () => {
    runRouterConformance(referenceRouter, { runs: 300 });
  });
});
