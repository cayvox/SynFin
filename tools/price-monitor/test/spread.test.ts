import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { computeSpread, parseJsonl, type SpreadRow } from '../src/index.js';

const SAMPLE = parseJsonl(
  readFileSync(
    new URL('../fixtures/observations.sample.jsonl', import.meta.url),
    'utf8',
  ),
);

function rowFor(rows: readonly SpreadRow[], size: string): SpreadRow {
  const r = rows.find((x) => x.size === size);
  if (r === undefined) throw new Error(`no row for size ${size}`);
  return r;
}

describe('computeSpread (golden fixtures)', () => {
  const rows = computeSpread(SAMPLE);

  it("uses each venue's LATEST observation per (pair, size)", () => {
    const r = rowFor(rows, '125');
    // 09:05 values win over 09:00: cantonswap 20.447269 (not 20.40).
    expect(r.bestVenue).toBe('cantonswap');
    expect(r.bestReceive).toBe('20.447269');
    expect(r.worstVenue).toBe('oneswap');
    expect(r.worstReceive).toBe('20.350000');
    expect(r.observations).toBe(4); // 2 venues x 2 timestamps
    expect(r.quotedVenues).toBe(2);
  });

  it('computes a positive cross-venue spread in bps (exact decimal math)', () => {
    expect(rowFor(rows, '125').spreadBps).toBe(47.79);
    expect(rowFor(rows, '500').spreadBps).toBe(61.72);
  });

  it('reports null spread when only one venue quoted (size 1000)', () => {
    const r = rowFor(rows, '1000');
    expect(r.quotedVenues).toBe(1);
    expect(r.spreadBps).toBeNull();
    expect(r.observations).toBe(2); // one quote + one rejection
  });

  it('produces a stable, sorted set of rows', () => {
    expect(computeSpread(SAMPLE)).toEqual(rows);
    expect(rows).toHaveLength(3);
  });

  it('handles an empty observation set', () => {
    expect(computeSpread([])).toEqual([]);
  });

  it('yields null best/worst/spread for a (pair, size) where no venue quoted', () => {
    const rejected = (venueId: string) => ({
      timestamp: '2026-06-18T09:00:00.000Z',
      source: 'fixture' as const,
      venueId,
      pair: 'CC/CBTC',
      giveSymbol: 'CC',
      wantSymbol: 'CBTC',
      size: '999',
      receive: null,
      rate: null,
      feeBps: null,
      rejectionCode: 'pair_unsupported',
    });
    const [r] = computeSpread([rejected('cantonswap'), rejected('oneswap')]);
    expect(r?.quotedVenues).toBe(0);
    expect(r?.bestVenue).toBeNull();
    expect(r?.bestReceive).toBeNull();
    expect(r?.worstVenue).toBeNull();
    expect(r?.spreadBps).toBeNull();
    expect(r?.observations).toBe(2);
  });

  it('ignores non-positive or unparseable receive values when ranking', () => {
    const mk = (venueId: string, receive: string | null) => ({
      timestamp: '2026-06-18T09:00:00.000Z',
      source: 'fixture' as const,
      venueId,
      pair: 'CC/USDCx',
      giveSymbol: 'CC',
      wantSymbol: 'USDCx',
      size: '10',
      receive,
      rate: null,
      feeBps: null,
      rejectionCode: null,
    });
    // 'oops' unparseable and '0' non-positive are skipped; only the valid one counts.
    const [r] = computeSpread([mk('a', 'oops'), mk('b', '0'), mk('c', '1.5')]);
    expect(r?.quotedVenues).toBe(1);
    expect(r?.bestVenue).toBe('c');
    expect(r?.spreadBps).toBeNull();
  });
});
