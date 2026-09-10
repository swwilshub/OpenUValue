import { describe, expect, it } from 'vitest';
import { calculateUValue, layersOnlyResistanceM2KPerW } from '../uvalue.js';
import { roundResistanceForReporting, roundUValueForReporting } from '../rounding.js';
import { InvalidInputError } from '../errors.js';
import {
  CONCRETE_MEDIUM,
  FILLED_CAVITY_WALL,
  SINGLE_LAYER_CONCRETE_WALL,
  element,
  solid,
} from './fixtures.js';

describe('calculateUValue, homogeneous elements (BS EN ISO 6946)', () => {
  it('computes a single-layer wall', () => {
    // 100 mm medium-density concrete, lambda = 1.15 W/(m*K), heat flow horizontal.
    //
    //   R      = d / lambda = 0.100 / 1.15 = 0.0869565217 m^2*K/W
    //   RT     = Rsi + R + Rse
    //          = 0.13 + 0.0869565217 + 0.04
    //          = 0.2569565217 m^2*K/W
    //   U      = 1 / RT = 1 / 0.2569565217 = 3.8917090 W/(m^2*K)
    //
    // Check on the reciprocal: 0.2569565217 * 3.8917 = 0.9999977, short of 1 by
    // 0.0000023, and 0.0000023 / 0.2569565 = 0.0000090, so U = 3.8917090.
    const result = calculateUValue(SINGLE_LAYER_CONCRETE_WALL);
    expect(result.layers[0]?.resistanceM2KPerW).toBeCloseTo(0.0869565217, 9);
    expect(result.totalResistanceM2KPerW).toBeCloseTo(0.2569565217, 9);
    expect(result.uValueWPerM2K).toBeCloseTo(3.8917090, 6);
    expect(result.method).toBe('homogeneous');
    // A homogeneous element has coincident limits, so no combined-method uncertainty.
    expect(result.upperToLowerLimitRatio).toBeCloseTo(1, 12);
    expect(result.maxRelativeErrorPercent).toBeCloseTo(0, 12);
    expect(result.outOfScopeReasons).toEqual([]);
  });

  it('computes a filled-cavity masonry wall', () => {
    // Internal -> external, heat flow horizontal:
    //   12.5 mm plasterboard     R = 0.0125 / 0.25  = 0.0500000000
    //   100 mm aircrete block    R = 0.1000 / 0.15  = 0.6666666667
    //   100 mm mineral wool      R = 0.1000 / 0.035 = 2.8571428571
    //   102.5 mm brick           R = 0.1025 / 0.77  = 0.1331168831
    //
    //   sum of layers = 0.0500000000 + 0.6666666667 = 0.7166666667
    //                 + 2.8571428571                = 3.5738095238
    //                 + 0.1331168831                = 3.7069264069 m^2*K/W
    //   RT = 0.13 + 3.7069264069 + 0.04 = 3.8769264069 m^2*K/W
    //   U  = 1 / 3.8769264069 = 0.2579362900 W/(m^2*K)
    //
    // Check: 3.8769264069 * 0.25793629 = 1.0000000.
    const result = calculateUValue(FILLED_CAVITY_WALL);
    expect(layersOnlyResistanceM2KPerW(result)).toBeCloseTo(3.7069264069, 9);
    expect(result.totalResistanceM2KPerW).toBeCloseTo(3.8769264069, 9);
    expect(result.uValueWPerM2K).toBeCloseTo(0.25793629, 8);
    // Reported to BR 443 precision this is a 0.26 W/(m^2*K) wall.
    expect(roundUValueForReporting(result.uValueWPerM2K)).toBe(0.26);
  });

  it('changes only Rsi when the same layers are rotated to a floor', () => {
    // Same 100 mm concrete, heat flow downward: Rsi becomes 0.17, Rse stays 0.04.
    //   RT = 0.17 + 0.0869565217 + 0.04 = 0.2969565217 m^2*K/W
    //   U  = 1 / 0.2969565217
    // Reciprocal by hand: 0.2969565217 * 3.3675 = 1.0000011, which overshoots 1 by
    // 0.0000011, so U = 3.3675 - 0.0000011/0.2969565 = 3.367496 W/(m^2*K).
    const floor = element(SINGLE_LAYER_CONCRETE_WALL.layers, { heatFlowDirection: 'downward' });
    const result = calculateUValue(floor);
    expect(result.rsiM2KPerW).toBe(0.17);
    expect(result.rseM2KPerW).toBe(0.04);
    expect(result.totalResistanceM2KPerW).toBeCloseTo(0.2969565217, 9);
    expect(result.uValueWPerM2K).toBeCloseTo(3.367496, 6);
  });

  it('is invariant under layer reordering, because series resistances commute', () => {
    const reversed = element([...FILLED_CAVITY_WALL.layers].reverse());
    expect(calculateUValue(reversed).totalResistanceM2KPerW).toBeCloseTo(
      calculateUValue(FILLED_CAVITY_WALL).totalResistanceM2KPerW,
      12,
    );
  });

  it('treats a zero-thickness layer as contributing exactly nothing', () => {
    const withZeroLayer = element([
      solid('paint', 'Paint film', 0, CONCRETE_MEDIUM),
      ...SINGLE_LAYER_CONCRETE_WALL.layers,
    ]);
    // Compared against the element without it, so the assertion is exact rather
    // than limited by how many digits of 0.1/1.15 are written out here.
    expect(calculateUValue(withZeroLayer).totalResistanceM2KPerW).toBe(
      calculateUValue(SINGLE_LAYER_CONCRETE_WALL).totalResistanceM2KPerW,
    );
  });

  it('throws on invalid input rather than returning a warning', () => {
    // A non-positive conductivity or a negative thickness is a caller error: there is
    // no physically meaningful result to degrade to.
    expect(() =>
      calculateUValue(element([solid('bad', 'Bad', 0.1, { lambdaWPerMK: 0 })])),
    ).toThrow(InvalidInputError);
    expect(() =>
      calculateUValue(element([solid('bad', 'Bad', -0.1, CONCRETE_MEDIUM)])),
    ).toThrow(InvalidInputError);
  });
});

describe('reporting precision', () => {
  it('rounds resistances to three decimal places and U-values to two', () => {
    expect(roundResistanceForReporting(3.8769265)).toBe(3.877);
    expect(roundUValueForReporting(0.2579363)).toBe(0.26);
    expect(roundUValueForReporting(3.891697)).toBe(3.89);
  });

  it('passes a null U-value through unchanged, so out-of-scope stays out of scope', () => {
    expect(roundUValueForReporting(null)).toBeNull();
  });
});
