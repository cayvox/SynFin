import { describe, expect, it } from 'vitest';
import { parseJsonl, toJsonl, type Observation } from '../src/index.js';

const obs: Observation = {
  timestamp: '2026-06-18T09:00:00.000Z',
  source: 'fixture',
  venueId: 'cantonswap',
  pair: 'CC/USDCx',
  giveSymbol: 'CC',
  wantSymbol: 'USDCx',
  size: '125',
  receive: '20.40',
  rate: '0.1632',
  feeBps: 0,
  rejectionCode: null,
};

describe('observation JSONL store', () => {
  it('round-trips observations through toJsonl/parseJsonl', () => {
    const text = toJsonl([
      obs,
      { ...obs, venueId: 'oneswap', receive: null, rejectionCode: 'x' },
    ]);
    const back = parseJsonl(text);
    expect(back).toHaveLength(2);
    expect(back[0]).toEqual(obs);
    expect(back[1]?.rejectionCode).toBe('x');
  });

  it('skips blank lines and malformed JSON without throwing', () => {
    const text = `${JSON.stringify(obs)}\n\n  \nnot-json\n{"partial":true}`;
    const back = parseJsonl(text);
    expect(back).toHaveLength(1);
    expect(back[0]?.venueId).toBe('cantonswap');
  });

  it('rejects objects missing required fields', () => {
    expect(parseJsonl('{"timestamp":"t","source":"live"}')).toHaveLength(0);
    expect(parseJsonl('42')).toHaveLength(0);
    expect(parseJsonl('null')).toHaveLength(0);
  });
});
