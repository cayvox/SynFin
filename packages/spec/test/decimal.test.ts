import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { Decimal, roundTakerFavorable } from '../src/index.js';

/** Build a canonical decimal string from a sign, integer part and fraction digits. */
const decimalArb = fc
  .record({
    neg: fc.boolean(),
    intPart: fc.bigInt({ min: 0n, max: 10n ** 18n }),
    frac: fc.array(fc.integer({ min: 0, max: 9 }), { maxLength: 12 }),
  })
  .map(({ neg, intPart, frac }) => {
    const fracStr = frac.join('');
    const body = intPart.toString() + (fracStr ? `.${fracStr}` : '');
    const isZero = intPart === 0n && /^0*$/.test(fracStr);
    return neg && !isZero ? `-${body}` : body;
  });

function dec(s: string): Decimal {
  const d = Decimal.parse(s);
  if (d === undefined) throw new Error(`bad fixture decimal: ${s}`);
  return d;
}

describe('Decimal.parse', () => {
  it('accepts canonical decimals', () => {
    expect(dec('0').toString()).toBe('0');
    expect(dec('5').toString()).toBe('5');
    expect(dec('-5').toString()).toBe('-5');
    expect(dec('0.05').toString()).toBe('0.05');
    expect(dec('-0.05').toString()).toBe('-0.05');
    expect(dec('123.450').toString()).toBe('123.450'); // trailing zero preserved
  });

  it('normalizes negative zero to zero', () => {
    expect(dec('-0').toString()).toBe('0');
    expect(dec('-0').isZero()).toBe(true);
    expect(dec('-0.00').toString()).toBe('0.00');
  });

  it.each(['', 'abc', '1.', '.5', '01', '1e5', '--1', '1.2.3', ' 1'])(
    'rejects malformed input %j',
    (bad) => {
      expect(Decimal.parse(bad)).toBeUndefined();
    },
  );
});

describe('Decimal arithmetic', () => {
  it('adds, subtracts and multiplies exactly across scales', () => {
    expect(dec('1.5').add(dec('0.25')).toString()).toBe('1.75');
    expect(dec('1.5').sub(dec('0.25')).toString()).toBe('1.25');
    expect(dec('1.5').mul(dec('0.2')).toString()).toBe('0.30');
  });

  it('sums a list, with the empty list summing to zero', () => {
    expect(Decimal.sum([]).toString()).toBe('0');
    expect(
      Decimal.sum([dec('1.10'), dec('2.20'), dec('0.70')]).toString(),
    ).toBe('4.00');
  });

  it('compares values regardless of scale', () => {
    expect(dec('1.5').compare(dec('1.50'))).toBe(0);
    expect(dec('1.5').compare(dec('1.6'))).toBe(-1);
    expect(dec('1.6').compare(dec('1.5'))).toBe(1);
    expect(dec('1.5').eq(dec('1.50'))).toBe(true);
    expect(dec('1.5').lt(dec('1.6'))).toBe(true);
    expect(dec('1.5').lte(dec('1.5'))).toBe(true);
    expect(dec('1.6').gt(dec('1.5'))).toBe(true);
    expect(dec('1.5').gte(dec('1.5'))).toBe(true);
    expect(dec('1.6').lt(dec('1.5'))).toBe(false);
  });

  it('reports sign and negation', () => {
    expect(dec('0').isZero()).toBe(true);
    expect(dec('1').isPositive()).toBe(true);
    expect(dec('-1').isNegative()).toBe(true);
    expect(dec('1.5').neg().toString()).toBe('-1.5');
  });
});

describe('Decimal.quantize', () => {
  it('rounds positive values per mode', () => {
    expect(dec('1.25').quantize(1, 'floor').toString()).toBe('1.2');
    expect(dec('1.25').quantize(1, 'ceil').toString()).toBe('1.3');
    expect(dec('1.25').quantize(1, 'trunc').toString()).toBe('1.2');
    expect(dec('1.25').quantize(1, 'away').toString()).toBe('1.3');
  });

  it('rounds negative values per mode', () => {
    expect(dec('-1.25').quantize(1, 'floor').toString()).toBe('-1.3');
    expect(dec('-1.25').quantize(1, 'ceil').toString()).toBe('-1.2');
    expect(dec('-1.25').quantize(1, 'trunc').toString()).toBe('-1.2');
    expect(dec('-1.25').quantize(1, 'away').toString()).toBe('-1.3');
  });

  it('is exact when no digits are discarded', () => {
    expect(dec('1.20').quantize(1, 'floor').toString()).toBe('1.2');
    expect(dec('1.2').quantize(3, 'floor').toString()).toBe('1.200');
  });

  it('throws on a negative target scale', () => {
    expect(() => dec('1').quantize(-1, 'floor')).toThrow(RangeError);
  });
});

describe('Decimal.divide', () => {
  it('divides exactly when it terminates', () => {
    expect(dec('1').divide(dec('4'), 2, 'floor').toString()).toBe('0.25');
    expect(dec('1.00').divide(dec('2'), 2, 'floor').toString()).toBe('0.50');
    expect(dec('6').divide(dec('3'), 0, 'floor').toString()).toBe('2');
  });

  it('rounds the discarded digit per mode (positive)', () => {
    expect(dec('1').divide(dec('3'), 2, 'floor').toString()).toBe('0.33');
    expect(dec('1').divide(dec('3'), 2, 'ceil').toString()).toBe('0.34');
    expect(dec('1').divide(dec('3'), 2, 'trunc').toString()).toBe('0.33');
    expect(dec('1').divide(dec('3'), 2, 'away').toString()).toBe('0.34');
  });

  it('rounds the discarded digit per mode (negative)', () => {
    expect(dec('-1').divide(dec('3'), 2, 'floor').toString()).toBe('-0.34');
    expect(dec('-1').divide(dec('3'), 2, 'ceil').toString()).toBe('-0.33');
    expect(dec('-1').divide(dec('3'), 2, 'away').toString()).toBe('-0.34');
    expect(dec('-1').divide(dec('3'), 2, 'trunc').toString()).toBe('-0.33');
  });

  it('throws on division by zero or a negative scale', () => {
    expect(() => dec('1').divide(dec('0'), 2, 'floor')).toThrow(RangeError);
    expect(() => dec('1').divide(dec('2'), -1, 'floor')).toThrow(RangeError);
  });

  it('property: floor quotient never exceeds the true quotient', () => {
    fc.assert(
      fc.property(
        fc.bigInt({ min: 0n, max: 10n ** 12n }),
        fc.bigInt({ min: 1n, max: 10n ** 12n }),
        fc.nat(6),
        (a, b, scale) => {
          const q = dec(a.toString()).divide(dec(b.toString()), scale, 'floor');
          // q <= a/b  <=>  q*b <= a
          expect(q.mul(dec(b.toString())).lte(dec(a.toString()))).toBe(true);
        },
      ),
    );
  });
});

describe('roundTakerFavorable (SPEC §3)', () => {
  it('rounds receive down and give up at instrument precision', () => {
    expect(roundTakerFavorable(dec('1.259'), 2, 'receive').toString()).toBe(
      '1.25',
    );
    expect(roundTakerFavorable(dec('1.251'), 2, 'give').toString()).toBe(
      '1.26',
    );
  });

  it('property: never overstates receive nor understates give', () => {
    fc.assert(
      fc.property(decimalArb, fc.nat(8), (s, scale) => {
        const v = dec(s);
        const recv = roundTakerFavorable(v, scale, 'receive');
        const give = roundTakerFavorable(v, scale, 'give');
        // Receive is rounded toward -inf (<= v); give toward +inf (>= v).
        expect(recv.lte(v)).toBe(true);
        expect(give.gte(v)).toBe(true);
      }),
    );
  });

  it('property: floor <= trunc-ish <= ceil ordering holds', () => {
    fc.assert(
      fc.property(decimalArb, fc.nat(8), (s, scale) => {
        const v = dec(s);
        const floor = v.quantize(scale, 'floor');
        const ceil = v.quantize(scale, 'ceil');
        expect(floor.lte(ceil)).toBe(true);
        expect(floor.lte(v)).toBe(true);
        expect(ceil.gte(v)).toBe(true);
      }),
    );
  });
});
