import { describe, expect, it } from 'vitest';
import { defaultPairSpecs, pairSpec, TOKENS } from '../src/index.js';

describe('tokens', () => {
  it('pairSpec resolves known symbols and rejects unknown ones', () => {
    const spec = pairSpec('CC', 'USDCx', '125');
    expect(spec?.give.instrumentId).toBe('Amulet');
    expect(spec?.want.instrumentId).toBe('USDCx');
    expect(spec?.size).toBe('125');
    expect(pairSpec('CC', 'NOPE', '1')).toBeUndefined();
    expect(pairSpec('NOPE', 'USDCx', '1')).toBeUndefined();
  });

  it('defaultPairSpecs samples CC->USDCx at three sizes', () => {
    const specs = defaultPairSpecs();
    expect(specs).toHaveLength(3);
    expect(specs.map((s) => s.size)).toEqual(['125', '500', '1000']);
    expect(
      specs.every((s) => s.giveSymbol === 'CC' && s.wantSymbol === 'USDCx'),
    ).toBe(true);
  });

  it('exposes the token catalog with decimals', () => {
    expect(TOKENS['CC']?.decimals).toBe(10);
    expect(TOKENS['USDCx']?.decimals).toBe(6);
  });
});
