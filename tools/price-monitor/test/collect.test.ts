import { describe, expect, it } from 'vitest';
import type {
  Quote,
  QuoteRejection,
  QuoteRequest,
  VenueAdapter,
} from '@synfin/spec';
import { collectObservations, pairSpec } from '../src/index.js';

const NOW = new Date('2026-06-18T10:00:00.000Z');
const SPEC = pairSpec('CC', 'USDCx', '125')!;

function quoting(venueId: string, receive: string): VenueAdapter {
  return {
    venueId,
    settlementMode: 'managed-deposit',
    quote(req: QuoteRequest): Promise<Quote> {
      return Promise.resolve({
        quoteId: `${venueId}:${req.nonce}`,
        venueId,
        give: { asset: req.give.asset, amount: req.give.amount },
        receive: { asset: req.want.asset, amount: receive },
        feeBps: 7,
        sourceKind: 'AMM',
        settlementMode: 'managed-deposit',
        firmness: 'indicative',
        validUntil: '2999-01-01T00:00:00Z',
      });
    },
  };
}
function rejecting(venueId: string, code: string): VenueAdapter {
  return {
    venueId,
    settlementMode: 'managed-deposit',
    quote(): Promise<QuoteRejection> {
      return Promise.resolve({ venueId, code });
    },
  };
}
function throwing(venueId: string): VenueAdapter {
  return {
    venueId,
    settlementMode: 'managed-deposit',
    quote(): Promise<Quote> {
      return Promise.reject(new Error('connection refused'));
    },
  };
}

describe('collectObservations', () => {
  it('normalizes a quote into an observation with rate, fee, and shared timestamp', async () => {
    const [o] = await collectObservations(
      [quoting('cantonswap', '20.40')],
      [SPEC],
      NOW,
      'live',
    );
    expect(o?.timestamp).toBe('2026-06-18T10:00:00.000Z');
    expect(o?.source).toBe('live');
    expect(o?.pair).toBe('CC/USDCx');
    expect(o?.size).toBe('125');
    expect(o?.receive).toBe('20.40');
    expect(o?.feeBps).toBe(7);
    // rate = 20.40 / 125 = 0.1632 (floored to 12 dp)
    expect(o?.rate).toBe('0.163200000000');
    expect(o?.rejectionCode).toBeNull();
  });

  it('records a typed rejection as a null-receive observation', async () => {
    const [o] = await collectObservations(
      [rejecting('oneswap', 'not_configured')],
      [SPEC],
      NOW,
      'live',
    );
    expect(o?.receive).toBeNull();
    expect(o?.rate).toBeNull();
    expect(o?.rejectionCode).toBe('not_configured');
  });

  it('turns a transport failure into a transport_error observation (never throws)', async () => {
    const [o] = await collectObservations(
      [throwing('cantonswap')],
      [SPEC],
      NOW,
      'live',
    );
    expect(o?.receive).toBeNull();
    expect(o?.rejectionCode).toContain('transport_error');
  });

  it('records a null rate when the size is not a positive decimal', async () => {
    const zeroSpec = pairSpec('CC', 'USDCx', '0')!;
    const [o] = await collectObservations(
      [quoting('cantonswap', '0.00')],
      [zeroSpec],
      NOW,
      'live',
    );
    expect(o?.receive).toBe('0.00');
    expect(o?.rate).toBeNull();
  });

  it('produces one observation per (adapter × spec)', async () => {
    const specB = pairSpec('CC', 'USDCx', '500')!;
    const out = await collectObservations(
      [quoting('cantonswap', '20.40'), rejecting('oneswap', 'x')],
      [SPEC, specB],
      NOW,
      'fixture',
    );
    expect(out).toHaveLength(4);
    expect(out.every((o) => o.source === 'fixture')).toBe(true);
  });
});
