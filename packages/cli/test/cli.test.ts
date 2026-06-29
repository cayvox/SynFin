import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CantexAdapter, TradecraftAdapter } from '@synfin/adapters';
import { Decimal } from '@synfin/spec';
import type {
  AssetId,
  Quote,
  QuoteRejection,
  QuoteRequest,
  SwapIntent,
  VenueAdapter,
} from '@synfin/spec';
import {
  aggregateQuotes,
  buildIntent,
  formatReport,
  formatSettleDemoReport,
  minUnit,
  resolveToken,
  runSettleDemo,
} from '../src/index.js';
import { edgeBps, pickBestSingle } from '../src/aggregate.js';
import type { AggregateResult, DemoRunResult } from '../src/index.js';

const CC: AssetId = {
  registry: 'DSO::1220sample',
  instrumentId: 'Amulet',
  decimals: 10,
};
const USDCx: AssetId = {
  registry: 'usdc::1220sample',
  instrumentId: 'USDCx',
  decimals: 6,
};
const NOW = new Date('2030-01-01T00:00:00Z');
const FUTURE = '2099-01-01T00:00:00Z';

/** A stub adapter that returns a fixed receive (or a rejection) for any request. */
function stubVenue(
  venueId: string,
  receive: string | null,
  code = 'pair_unsupported',
): VenueAdapter {
  return {
    venueId,
    settlementMode: 'managed-deposit',
    quote(request: QuoteRequest): Promise<Quote | QuoteRejection> {
      if (receive === null) {
        return Promise.resolve({ venueId, code });
      }
      const quote: Quote = {
        quoteId: `${venueId}:${request.nonce}`,
        venueId,
        give: { asset: request.give.asset, amount: request.give.amount },
        receive: { asset: request.want.asset, amount: receive },
        feeBps: 0,
        sourceKind: 'AMM',
        settlementMode: 'managed-deposit',
        firmness: 'indicative',
        validUntil: FUTURE,
      };
      return Promise.resolve(quote);
    },
  };
}

/**
 * A stub venue with a give-asset networkFee (RFC-0005). `fee` null means no fee.
 */
function feeVenue(
  venueId: string,
  receive: string,
  fee: string | null,
): VenueAdapter {
  return {
    venueId,
    settlementMode: 'managed-deposit',
    quote(request: QuoteRequest): Promise<Quote | QuoteRejection> {
      const quote: Quote = {
        quoteId: `${venueId}:${request.nonce}`,
        venueId,
        give: { asset: request.give.asset, amount: request.give.amount },
        receive: { asset: request.want.asset, amount: receive },
        feeBps: 0,
        sourceKind: 'AMM',
        settlementMode: 'managed-deposit',
        firmness: 'indicative',
        validUntil: FUTURE,
        ...(fee !== null
          ? { networkFee: { asset: request.give.asset, amount: fee } }
          : {}),
      };
      return Promise.resolve(quote);
    },
  };
}

/** A venue whose quote() rejects the promise (transport failure). */
function throwingVenue(venueId: string): VenueAdapter {
  return {
    venueId,
    settlementMode: 'managed-deposit',
    quote(): Promise<Quote | QuoteRejection> {
      return Promise.reject(new Error('connection refused'));
    },
  };
}

function intent(amount = '100'): SwapIntent {
  return buildIntent({
    give: CC,
    want: USDCx,
    amount,
    slippageBps: 50,
    deadline: FUTURE,
  });
}

describe('tokens + intent helpers', () => {
  it('resolveToken maps known symbols and rejects unknown', () => {
    expect(resolveToken('CC')?.instrumentId).toBe('Amulet');
    expect(resolveToken('USDCx')?.decimals).toBe(6);
    expect(resolveToken('NOPE')).toBeUndefined();
  });

  it('minUnit returns the smallest positive unit at a precision', () => {
    expect(minUnit(6)).toBe('0.000001');
    expect(minUnit(0)).toBe('1');
    expect(minUnit(2)).toBe('0.01');
  });

  it('buildIntent sets a permissive minReceive and carries slippage', () => {
    const i = intent();
    expect(i.want.minReceive).toBe('0.000001');
    expect(i.maxSlippageBps).toBe(50);
    expect(i.give).toEqual({ asset: CC, amount: '100' });
  });
});

describe('aggregateQuotes', () => {
  it('gathers quotes, routes, picks best single venue, computes edge', async () => {
    const result = await aggregateQuotes(
      [stubVenue('cantonswap', '16.30'), stubVenue('oneswap', '16.50')],
      intent(),
      NOW,
    );
    expect(result.quotes).toHaveLength(2);
    expect(result.route.ok).toBe(true);
    expect(result.bestSingle?.venueId).toBe('oneswap');
    expect(result.bestSingle?.receive).toBe('16.50');
    // Both venues quote the full size; the router picks the best single, so the
    // routed receipt equals the best single venue -> 0 bps edge.
    expect(result.edgeBps).toBe(0);
  });

  it('captures rejections as typed outcomes without dropping the run', async () => {
    const result = await aggregateQuotes(
      [
        stubVenue('cantonswap', '16.30'),
        stubVenue('oneswap', null, 'not_configured'),
      ],
      intent(),
      NOW,
    );
    expect(result.quotes).toHaveLength(1);
    const oneswap = result.outcomes.find((o) => o.venueId === 'oneswap');
    expect(oneswap?.rejection?.code).toBe('not_configured');
  });

  it('turns a transport failure into a transport_error outcome (never throws)', async () => {
    const result = await aggregateQuotes(
      [throwingVenue('cantonswap'), stubVenue('oneswap', '16.50')],
      intent(),
      NOW,
    );
    const canton = result.outcomes.find((o) => o.venueId === 'cantonswap');
    expect(canton?.rejection?.code).toBe('transport_error');
    expect(result.quotes).toHaveLength(1);
  });

  it('reports no route and null edge when no venue quotes', async () => {
    const result = await aggregateQuotes(
      [stubVenue('cantonswap', null), stubVenue('oneswap', null)],
      intent(),
      NOW,
    );
    expect(result.quotes).toHaveLength(0);
    expect(result.route.ok).toBe(false);
    expect(result.bestSingle).toBeNull();
    expect(result.edgeBps).toBeNull();
  });
});

describe('Tradecraft venue integration (bundled fixture)', () => {
  it('quotes end to end from the committed Tradecraft fixture', async () => {
    // Load the fixture the same way main.ts does (relative to this file).
    const body: unknown = JSON.parse(
      readFileSync(
        new URL(
          '../fixtures/tradecraft/quote-cc-usdcx-100.json',
          import.meta.url,
        ),
        'utf8',
      ),
    );
    const tradecraft = new TradecraftAdapter({
      fetcher: () => Promise.resolve({ status: 200, body }),
      // Stamp validUntil from the fixed test clock so the quote is valid at NOW.
      now: () => NOW,
    });
    const result = await aggregateQuotes([tradecraft], intent('100'), NOW);

    const outcome = result.outcomes.find((o) => o.venueId === 'tradecraft');
    expect(outcome?.quote).not.toBeNull();
    expect(outcome?.quote?.settlementMode).toBe('managed-deposit');
    expect(outcome?.quote?.firmness).toBe('indicative');
    expect(result.route.ok).toBe(true);
    expect(result.bestSingle?.venueId).toBe('tradecraft');
  });
});

describe('net-aware best single + edge (RFC-0005)', () => {
  it('ranks the best single venue and the route on NET, not gross', async () => {
    // H has a higher gross but a give-asset fee; L has a lower gross and no fee.
    // Net: H 15.50 * 100/105 = 14.761904, below L 15.00. The give is 100 CC.
    const high = feeVenue('high', '15.50', '5');
    const low = feeVenue('low', '15.00', null);
    const result = await aggregateQuotes([high, low], intent('100'), NOW);

    // Best single by NET is L, even though H has the higher gross.
    expect(result.bestSingle?.venueId).toBe('low');
    // The router also picks L on net, and the chosen plan is net-consistent.
    expect(result.route.ok).toBe(true);
    if (result.route.ok) {
      expect(result.route.plan.legs[0]?.venueId).toBe('low');
    }
    // pickBestSingle agrees: highest NET, not highest gross.
    const quotes = result.outcomes
      .map((o) => o.quote)
      .filter((q): q is Quote => q !== null);
    expect(pickBestSingle(quotes, intent('100'))?.venueId).toBe('low');

    // The report shows H's network-fee line and its net below its gross.
    const report = formatReport(result, 'live');
    expect(report).toContain('5 Amulet network fee');
    expect(report).toContain('net 14.761904');
  });
});

describe('Cantex venue integration (bundled fixture, RFC-0005)', () => {
  it('quotes a gross receive with a CC networkFee and a net below the gross', async () => {
    const body: unknown = JSON.parse(
      readFileSync(
        new URL('../fixtures/cantex/quote-cc-usdcx-100.json', import.meta.url),
        'utf8',
      ),
    );
    const cantex = new CantexAdapter({
      fetcher: () => Promise.resolve({ status: 200, body }),
      now: () => NOW,
    });
    const result = await aggregateQuotes([cantex], intent('100'), NOW);

    const outcome = result.outcomes.find((o) => o.venueId === 'cantex');
    expect(outcome?.quote).not.toBeNull();
    // The flat CC fee is surfaced as networkFee in the give asset (Amulet).
    expect(outcome?.quote?.networkFee?.asset.instrumentId).toBe('Amulet');
    // netReceive is below the gross receive.
    const gross = Decimal.parse(outcome!.quote!.receive.amount)!;
    const net = Decimal.parse(outcome!.netReceive!)!;
    expect(net.lt(gross)).toBe(true);
  });
});

describe('edgeBps + pickBestSingle (edge cases)', () => {
  it('edgeBps is null on null inputs, non-positive base, or unparseable values', () => {
    expect(edgeBps(null, '16')).toBeNull();
    expect(edgeBps('16', null)).toBeNull();
    expect(edgeBps('16', '0')).toBeNull(); // non-positive base
    expect(edgeBps('xx', '16')).toBeNull(); // unparseable routed
    expect(edgeBps('16', 'yy')).toBeNull(); // unparseable base
  });

  it('edgeBps is positive when the routed receipt beats the base', () => {
    expect(edgeBps('16.50', '16.00')).toBeGreaterThan(0);
  });

  it('pickBestSingle skips quotes with an unparseable receive', () => {
    const mk = (venueId: string, amount: string): Quote => ({
      quoteId: `${venueId}:q`,
      venueId,
      give: { asset: CC, amount: '100' },
      receive: { asset: USDCx, amount },
      feeBps: 0,
      sourceKind: 'AMM',
      settlementMode: 'managed-deposit',
      firmness: 'indicative',
      validUntil: FUTURE,
    });
    const best = pickBestSingle(
      [mk('a', 'not-a-number'), mk('b', '16.50')],
      intent(),
    );
    expect(best?.venueId).toBe('b');
    expect(pickBestSingle([], intent())).toBeNull();
  });
});

describe('formatReport', () => {
  it('labels live runs and shows venue quotes + route + edge', async () => {
    const result = await aggregateQuotes(
      [stubVenue('cantonswap', '16.30'), stubVenue('oneswap', '16.50')],
      intent(),
      NOW,
    );
    const report = formatReport(result, 'live');
    expect(report).toContain('LIVE venue quotes');
    expect(report).toContain('cantonswap [managed-deposit]');
    expect(report).toContain('oneswap [managed-deposit]');
    expect(report).toContain('Best route:');
    expect(report).toContain('Edge vs best single venue (net): 0 bps');
    expect(report).toContain('Tradecraft');
    expect(report).toContain('Cantex');
    expect(report).toContain('net receipt');
    expect(report).toContain('quote layer only');
  });

  it('clearly labels fixture runs as recorded sample data', async () => {
    const result = await aggregateQuotes(
      [stubVenue('cantonswap', '16.30')],
      intent(),
      NOW,
    );
    const report = formatReport(result, 'fixtures');
    expect(report).toContain('RECORDED SAMPLE DATA');
    expect(report).toContain('NOT live');
  });

  it('renders a no-route result with the typed reason', async () => {
    const result = await aggregateQuotes(
      [stubVenue('cantonswap', null)],
      intent(),
      NOW,
    );
    const report = formatReport(result, 'live');
    expect(report).toContain('Best route: none (');
    expect(report).toContain('no quote (pair_unsupported)');
  });

  it('falls back to "no_quote" when an outcome has neither quote nor rejection', () => {
    const synthetic: AggregateResult = {
      intent: intent(),
      outcomes: [
        {
          venueId: 'ghost',
          settlementMode: 'managed-deposit',
          quote: null,
          rejection: null,
          netReceive: null,
        },
      ],
      quotes: [],
      route: { ok: false, reason: 'no-eligible-quotes' },
      bestSingle: null,
      edgeBps: null,
    };
    const report = formatReport(synthetic, 'live');
    expect(report).toContain('no quote (no_quote)');
  });
});

describe('settle-demo (Demo 2) orchestration', () => {
  const runnerReturning = (r: DemoRunResult) => () => Promise.resolve(r);

  it('always states the honest framing (own CIP-0056 test venue, not live venues)', () => {
    const report = formatSettleDemoReport({
      available: true,
      exitCode: 0,
      output: '',
    });
    expect(report).toContain('our OWN CIP-0056 test venue');
    expect(report).toContain('atomic settlement against live');
    expect(report).toContain('UNCHANGED');
  });

  it('reports PASS and the proven guarantees on a clean run', async () => {
    const { report, ok } = await runSettleDemo(
      runnerReturning({ available: true, exitCode: 0, output: 'demo: ok' }),
    );
    expect(ok).toBe(true);
    expect(report).toContain(
      'Atomic: all 4 legs settled in ONE Daml transaction',
    );
    expect(report).toContain('Per-leg privacy');
    expect(report).toContain('DEMO 2 RESULT: PASS');
  });

  it('fails gracefully (no fabricated result) when the Daml toolchain is absent', async () => {
    const { report, ok } = await runSettleDemo(
      runnerReturning({ available: false, exitCode: null, output: '' }),
    );
    expect(ok).toBe(false);
    expect(report).toContain('Daml SDK toolchain (`daml`) was not found');
    expect(report).not.toContain('DEMO 2 RESULT: PASS');
  });

  it('surfaces the Daml output and a FAILED verdict on a non-zero run', async () => {
    const { report, ok } = await runSettleDemo(
      runnerReturning({
        available: true,
        exitCode: 1,
        output: 'demoAtomicSettlement: FAILED assertion',
      }),
    );
    expect(ok).toBe(false);
    expect(report).toContain('DEMO 2 RESULT: FAILED');
    expect(report).toContain('FAILED assertion');
  });

  it('handles empty output on failure without crashing', async () => {
    const { report } = await runSettleDemo(
      runnerReturning({ available: true, exitCode: 2, output: '   ' }),
    );
    expect(report).toContain('(no output captured)');
  });
});
