import { describe, expect, it } from 'vitest';
import { assessSurfaceCondensation } from '../condensation/surfaceAssessment.js';
import { calculateUValue } from '../uvalue.js';
import { ISO13788_SURFACE_ASSESSMENT_RSI_M2K_PER_W } from '../constants.js';
import { element, solid, STANDARD_CONDITIONS, TIMBER_FRAME_WALL } from './fixtures.js';

const BRICK = { lambdaWPerMK: 0.77 };

/**
 * A bare 215 mm solid brick wall, chosen because every resistance in it is checkable:
 *   R_brick = 0.215 / 0.77 = 0.279220779221
 *   Rsi 0.13, Rse 0.04  ->  R_T = 0.449220779221
 */
const SOLID_BRICK = element([solid('brk', 'Brick', 0.215, BRICK)]);

describe('the resistance the assessment is required to use', () => {
  it('is 0.25, whatever the U-value is using', () => {
    const result = assessSurfaceCondensation(SOLID_BRICK, STANDARD_CONDITIONS);
    expect(result.rsiM2KPerW).toBe(ISO13788_SURFACE_ASSESSMENT_RSI_M2K_PER_W);
    expect(result.rsiM2KPerW).toBe(0.25);
    // The U-value keeps the ISO 6946 tabulated figure, as BR 443 requires.
    expect(result.uValueRsiM2KPerW).toBeCloseTo(0.13, 10);
    expect(result.differsFromUValueRsi).toBe(true);
  });

  it('reports a colder surface than the U-value resistance would give', () => {
    /*
     * With Rsi 0.13:  R_T = 0.13 + 0.279220779221 + 0.04 = 0.449220779221
     *   theta_si = 20 - (0.13 / 0.449220779221) * 20 = 20 - 5.787800... = 14.212200...
     *
     * With the required Rsi 0.25 the element beyond the surface is unchanged, so
     *   R_T = 0.25 + 0.279220779221 + 0.04 = 0.569220779221
     *   theta_si = 20 - (0.25 / 0.569220779221) * 20 = 20 - 8.783938... = 11.216062...
     *
     * A thicker film of still air against the wall means a colder surface, which is the
     * whole reason the standard asks for the higher figure here.
     */
    const result = assessSurfaceCondensation(SOLID_BRICK, STANDARD_CONDITIONS);
    expect(result.temperatureC).toBeCloseTo(11.216062, 6);

    const uValue = calculateUValue(SOLID_BRICK);
    const displayedSurfaceC =
      20 - (uValue.rsiM2KPerW / uValue.totalResistanceM2KPerW) * 20;
    expect(displayedSurfaceC).toBeCloseTo(14.2122, 4);
    expect(result.temperatureC).toBeLessThan(displayedSurfaceC);
  });

  it('gives the temperature factor in the form the criterion is usually quoted in', () => {
    // f_Rsi = (11.216062 - 0) / (20 - 0) = 0.560803
    const result = assessSurfaceCondensation(SOLID_BRICK, STANDARD_CONDITIONS);
    expect(result.temperatureFactor).toBeCloseTo(0.560803, 6);
  });

  it('has no temperature factor when there is no temperature difference to divide by', () => {
    const result = assessSurfaceCondensation(SOLID_BRICK, {
      ...STANDARD_CONDITIONS,
      externalAirTemperatureC: 20,
    });
    expect(result.temperatureFactor).toBeUndefined();
  });
});

describe('the verdict does not depend on what is on display', () => {
  it('takes the coldest path, not the displayed one', () => {
    // The bridged path has the lower resistance and so the colder internal surface.
    const result = assessSurfaceCondensation(TIMBER_FRAME_WALL, STANDARD_CONDITIONS);
    expect(result.pathId).toBe('bridged');
  });

  it('is the same whether or not the element is bridged at all', () => {
    // An unbridged element has one path, and it must be reported as that one.
    const result = assessSurfaceCondensation(SOLID_BRICK, STANDARD_CONDITIONS);
    expect(result.pathId).toBe('unbridged');
  });
});

describe('what the surface temperature then means', () => {
  it('flags mould before it flags condensation', () => {
    /*
     * Mould needs damp air against the surface, not liquid water, so it is reached
     * first: the humidity criterion bites above the dew point rather than at it.
     */
    /*
     * At the 11.216 C surface, p_sat is 1330.97 Pa. The room at 20 C / 50 % carries
     * 1168.5 Pa, so the air against the wall sits at 1168.5 / 1330.97 = 87.8 % - damp
     * enough for mould, and still short of the 100 % that would mean liquid water.
     * The gap is narrow: 60 % indoors puts the surface at 105 % and both are flagged.
     */
    const result = assessSurfaceCondensation(SOLID_BRICK, STANDARD_CONDITIONS);
    expect(result.surfaceRelativeHumidityPercent).toBeCloseTo(87.79, 1);
    expect(result.mouldRisk).toBe(true);
    expect(result.condensationRisk).toBe(false);
  });

  it('flags condensation once the surface reaches the dew point', () => {
    const result = assessSurfaceCondensation(SOLID_BRICK, {
      ...STANDARD_CONDITIONS,
      internalRelativeHumidityPercent: 60,
    });
    /*
     * 60 % indoors puts the air at the surface past saturation - 105.4 % on the raw
     * ratio - and the reported figure is capped at 100, because air cannot hold more
     * than saturation: the surplus is the condensation being flagged.
     */
    expect(result.surfaceRelativeHumidityPercent).toBe(100);
    expect(result.condensationRisk).toBe(true);
    expect(result.mouldRisk).toBe(true);
    // 20 C at 60 % RH has a dew point of about 12.0 C, just above the 11.2 C surface.
    expect(result.dewPointC).toBeGreaterThan(result.temperatureC);
  });

  it('clears a well-insulated wall that the old user-chosen figure would also clear', () => {
    const result = assessSurfaceCondensation(TIMBER_FRAME_WALL, STANDARD_CONDITIONS);
    expect(result.condensationRisk).toBe(false);
    expect(result.mouldRisk).toBe(false);
  });
});
