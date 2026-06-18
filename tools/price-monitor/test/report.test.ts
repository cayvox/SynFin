import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { computeSpread, parseJsonl, toCsv, toMarkdown } from '../src/index.js';

const SAMPLE = parseJsonl(
  readFileSync(
    new URL('../fixtures/observations.sample.jsonl', import.meta.url),
    'utf8',
  ),
);
const ROWS = computeSpread(SAMPLE);

describe('toMarkdown', () => {
  it('labels a fixture report as NOT live and shows the max spread', () => {
    const md = toMarkdown(ROWS, {
      source: 'fixture',
      totalObservations: SAMPLE.length,
    });
    expect(md).toContain('RECORDED FIXTURE data (NOT live)');
    expect(md).toContain('CC/USDCx');
    expect(md).toContain('Max cross-venue spread observed: **61.72 bps**');
  });

  it('labels a live report as live', () => {
    const md = toMarkdown(ROWS, { source: 'live', totalObservations: 1 });
    expect(md).toContain('LIVE venue quotes');
  });

  it('handles the no-measurable-spread case', () => {
    const md = toMarkdown(
      [
        {
          pair: 'CC/USDCx',
          size: '1',
          observations: 1,
          quotedVenues: 1,
          bestVenue: 'cantonswap',
          bestReceive: '0.1',
          worstVenue: 'cantonswap',
          worstReceive: '0.1',
          spreadBps: null,
          firstSeen: 't',
          lastSeen: 't',
        },
      ],
      { source: 'live', totalObservations: 1 },
    );
    expect(md).toContain('no spread could be measured');
  });
});

const NULL_ROW = {
  pair: 'CC/CBTC',
  size: '500',
  observations: 0,
  quotedVenues: 0,
  bestVenue: null,
  bestReceive: null,
  worstVenue: null,
  worstReceive: null,
  spreadBps: null,
  firstSeen: null,
  lastSeen: null,
} as const;

describe('toMarkdown — empty / unquoted rows', () => {
  it('renders dashes for a row with no quotes and no window', () => {
    const md = toMarkdown([NULL_ROW], {
      source: 'fixture',
      totalObservations: 0,
    });
    expect(md).toContain('| CC/CBTC | 500 | 0 | — | — | n/a | 0 | — |');
  });
});

describe('toCsv', () => {
  it('emits a header and one row per (pair, size)', () => {
    const csv = toCsv(ROWS);
    const lines = csv.split('\n');
    expect(lines[0]).toBe(
      'pair,size,quotedVenues,bestVenue,bestReceive,worstVenue,worstReceive,spreadBps,observations,firstSeen,lastSeen',
    );
    expect(lines).toHaveLength(1 + ROWS.length);
    expect(csv).toContain(
      'CC/USDCx,125,2,cantonswap,20.447269,oneswap,20.350000,47.79,4',
    );
  });

  it('emits empty cells for null fields', () => {
    const csv = toCsv([NULL_ROW]);
    expect(csv.split('\n')[1]).toBe('CC/CBTC,500,0,,,,,,0,,');
  });
});
