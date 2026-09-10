import { describe, expect, it } from 'vitest';
import {
  dewPointFromAirStateC,
  dewPointTemperatureC,
  relativeHumidityPercent,
  saturationVapourPressurePa,
  vapourPressurePa,
} from '../psychrometrics.js';
import { InvalidInputError } from '../errors.js';

describe('saturationVapourPressurePa (BS EN ISO 13788 Annex E)', () => {
  it('returns exactly the reference pressure at 0 C', () => {
    // p_sat = 610.5 * exp(17.269 * 0 / (237.3 + 0)) = 610.5 * exp(0) = 610.5 Pa.
    expect(saturationVapourPressurePa(0)).toBe(610.5);
  });

  it('is continuous where the two branches meet at 0 C', () => {
    // Above:  610.5 * exp(17.269 * theta / (237.3 + theta))
    // Below:  610.5 * exp(21.875 * theta / (265.5 + theta))
    // Both tend to 610.5 as theta -> 0, so the join has no step in it.
    const justBelow = saturationVapourPressurePa(-1e-9);
    const justAbove = saturationVapourPressurePa(1e-9);
    expect(Math.abs(justAbove - justBelow)).toBeLessThan(1e-6);
  });

  it('gives about 2337 Pa at 20 C', () => {
    // Hand calculation:
    //   17.269 * 20 = 345.38
    //   237.3 + 20  = 257.3
    //   345.38 / 257.3 = 1.3423245
    //   exp(1.3423245) = e^1.3 * e^0.0423245
    //                  = 3.6692967 * 1.0432328 = 3.8279307
    //   p_sat = 610.5 * 3.8279307 = 2336.9507 Pa
    expect(saturationVapourPressurePa(20)).toBeCloseTo(2336.9507, 3);
  });

  it('gives about 259.3 Pa at -10 C, on the sub-zero branch', () => {
    // Hand calculation, below-zero branch:
    //   21.875 * -10 = -218.75
    //   265.5 - 10   = 255.5
    //   -218.75 / 255.5 = -0.8561644
    //   exp(0.8561644) = e^0.85 * e^0.0061644 = 2.339647 * 1.0061834 = 2.354114
    //   exp(-0.8561644) = 1 / 2.354114 = 0.4247885
    //   p_sat = 610.5 * 0.4247885 = 259.333 Pa
    expect(saturationVapourPressurePa(-10)).toBeCloseTo(259.333, 2);
  });

  it('rejects a non-finite temperature', () => {
    expect(() => saturationVapourPressurePa(Number.NaN)).toThrow(InvalidInputError);
  });
});

describe('dewPointTemperatureC (BS EN ISO 13788 Annex E)', () => {
  it('gives about 9.27 C for air at 20 C and 50 % RH', () => {
    // Hand calculation:
    //   p_sat(20 C) = 2336.9507 Pa   (worked above)
    //   p = 0.50 * 2336.9507 = 1168.4753 Pa
    //   p / 610.5 = 1.9139645
    //   ln(1.9139645) = ln(2) + ln(0.95698225)
    //                 = 0.6931472 - 0.0439704 = 0.6491768
    //   theta = 237.3 * 0.6491768 / (17.269 - 0.6491768)
    //         = 154.04965 / 16.6198232
    //         = 9.26903 C
    expect(dewPointFromAirStateC(20, 50)).toBeCloseTo(9.26903, 4);
  });

  it('returns the air temperature itself at 100 % RH', () => {
    // At saturation the dew point is the air temperature by definition, so this is a
    // round trip through both equations and pins their inverse relationship.
    for (const temperatureC of [-10, 0, 10, 25]) {
      expect(dewPointTemperatureC(vapourPressurePa(temperatureC, 100))).toBeCloseTo(
        temperatureC,
        9,
      );
    }
  });

  it('rejects a non-positive vapour pressure', () => {
    // ln(0) is -Infinity; a zero or negative partial pressure is a caller error.
    expect(() => dewPointTemperatureC(0)).toThrow(InvalidInputError);
    expect(() => dewPointTemperatureC(-1)).toThrow(InvalidInputError);
  });
});

describe('vapourPressurePa and relativeHumidityPercent', () => {
  it('are inverses of one another', () => {
    // p = phi * p_sat(theta), so phi = p / p_sat(theta).
    const pressure = vapourPressurePa(21, 65);
    expect(relativeHumidityPercent(pressure, 21)).toBeCloseTo(65, 9);
  });

  it('rejects a relative humidity outside 0..100 %', () => {
    expect(() => vapourPressurePa(20, -1)).toThrow(InvalidInputError);
    expect(() => vapourPressurePa(20, 101)).toThrow(InvalidInputError);
  });
});
