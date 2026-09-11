import { describe, expect, it } from 'vitest';
import {
  MOULD_CRITICAL_SURFACE_HUMIDITY_PERCENT,
  assessOverPeriods,
  surfaceRelativeHumidityPercent,
} from '../condensation/periodAssessment.js';
import { element, solid } from './fixtures.js';

const PLASTERBOARD = { lambdaWPerMK: 0.25, vapourResistanceFactorMu: 10 };
const WOOL = { lambdaWPerMK: 0.035, vapourResistanceFactorMu: 1 };
const BRICK = { lambdaWPerMK: 0.77, vapourResistanceFactorMu: 10 };
const POLYTHENE = { lambdaWPerMK: 0.33, vapourResistanceFactorMu: 100000 };

/** The solid wall insulated on the inside, which is the one that gets wet. */
const INTERNAL_INSULATION = element([
  solid('pb', 'Plasterboard', 0.0125, PLASTERBOARD),
  solid('ins', 'Mineral wool', 0.1, WOOL),
  solid('brk', 'Solid brick', 0.215, BRICK),
]);

const WINTER = {
  label: 'Winter',
  days: 90,
  conditions: {
    internalAirTemperatureC: 20,
    internalRelativeHumidityPercent: 50,
    externalAirTemperatureC: 0,
    externalRelativeHumidityPercent: 90,
  },
};

/** Warm and similar either side: the drive reverses and the wall gives water back. */
const SUMMER = {
  label: 'Summer',
  days: 90,
  conditions: {
    internalAirTemperatureC: 20,
    internalRelativeHumidityPercent: 50,
    externalAirTemperatureC: 18,
    externalRelativeHumidityPercent: 55,
  },
};

describe('accumulation over a wetting period', () => {
  const result = assessOverPeriods(INTERNAL_INSULATION, WINTER, SUMMER);

  it('accumulates rate times duration at the condensing plane', () => {
    // The single-condition assessment gives 34.7 g/m2 per day at this junction
    // (checked by hand in glaser.test.ts). Over 90 days that is
    //   34.7 g/m2/day * 90 days = 3123 g/m2 = 3.12 kg/m2.
    // Conditions are held constant, so the construction does not move and the rate is
    // constant: the amount really is a simple product.
    expect(result.totalAccumulatedKgPerM2).toBeGreaterThan(3.0);
    expect(result.totalAccumulatedKgPerM2).toBeLessThan(3.3);
    expect(result.planes).toHaveLength(1);
    expect(result.planes[0]?.label).toContain('Mineral wool');
  });

  it('scales linearly with the length of the period', () => {
    const halfLength = assessOverPeriods(
      INTERNAL_INSULATION,
      { ...WINTER, days: 45 },
      SUMMER,
    );
    expect(halfLength.totalAccumulatedKgPerM2).toBeCloseTo(
      result.totalAccumulatedKgPerM2 / 2,
      8,
    );
  });
});

describe('drying period', () => {
  it('reports what is left and how long clearing would take', () => {
    const result = assessOverPeriods(INTERNAL_INSULATION, WINTER, SUMMER);
    const plane = result.planes[0];
    expect(plane).toBeDefined();
    // Either it clears within the period and nothing is left, or it does not and the
    // remainder is the shortfall. Both are consistent statements about the same run.
    if (result.driesOut) {
      expect(plane?.remainingKgPerM2).toBe(0);
      expect(plane?.daysToDry ?? Infinity).toBeLessThanOrEqual(SUMMER.days);
    } else {
      expect(plane?.remainingKgPerM2).toBeGreaterThan(0);
      expect(plane?.daysToDry ?? Infinity).toBeGreaterThan(SUMMER.days);
    }
  });

  it('never dries when the drying period repeats the wetting conditions', () => {
    // Same conditions in both periods: the plane keeps condensing rather than
    // evaporating, so it cannot clear and the run says so.
    const result = assessOverPeriods(INTERNAL_INSULATION, WINTER, { ...WINTER, label: 'Also winter' });
    expect(result.driesOut).toBe(false);
    expect(result.totalRemainingKgPerM2).toBeGreaterThan(0);
    expect(result.warnings.map((w) => w.code)).toContain('value-needs-verification');
  });
});

describe('a build-up that never wets in the first place', () => {
  it('accumulates nothing and trivially dries out', () => {
    const withBarrier = element([
      solid('pb', 'Plasterboard', 0.0125, PLASTERBOARD),
      solid('vcl', 'Polythene', 0.0002, POLYTHENE),
      solid('ins', 'Mineral wool', 0.1, WOOL),
      solid('brk', 'Solid brick', 0.215, BRICK),
    ]);
    const result = assessOverPeriods(withBarrier, WINTER, SUMMER);
    expect(result.planes).toHaveLength(0);
    expect(result.totalAccumulatedKgPerM2).toBe(0);
    expect(result.driesOut).toBe(true);
  });
});

describe('surface humidity for the mould check', () => {
  it('equals the room humidity when the surface is at room temperature', () => {
    // Same temperature both sides: the same vapour pressure is the same fraction of
    // the same saturation pressure.
    expect(surfaceRelativeHumidityPercent(20, 50, 20)).toBeCloseTo(50, 8);
  });

  it('rises as the surface gets colder than the room', () => {
    // Room air at 20 C / 50 % carries p = 0.5 * p_sat(20) = 1169.6 Pa. Against a 15 C
    // surface, p_sat(15) = 1704 Pa, so the surface sees 1169.6/1704 = 68.6 %.
    expect(surfaceRelativeHumidityPercent(20, 50, 15)).toBeCloseTo(68.6, 1);
    // Against a 12.6 C surface it reaches the 80 % mould threshold.
    const atThreshold = surfaceRelativeHumidityPercent(20, 50, 12.6);
    expect(atThreshold).toBeGreaterThan(79);
    expect(atThreshold).toBeLessThan(81);
  });

  it('is capped at saturation rather than reporting more than 100 %', () => {
    // Below the dew point the air cannot hold what it has; the surplus condenses. The
    // figure stops at 100 rather than reporting an impossible humidity.
    expect(surfaceRelativeHumidityPercent(20, 50, 2)).toBe(100);
  });

  it('uses a threshold that is flagged for checking', () => {
    expect(MOULD_CRITICAL_SURFACE_HUMIDITY_PERCENT).toBe(80);
  });
});
