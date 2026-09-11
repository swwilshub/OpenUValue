import { describe, expect, it } from 'vitest';
import {
  AIR_GAP_LEVELS,
  DEFAULT_AIR_GAP_LEVEL,
  DELTA_U_NEGLIGIBLE_FRACTION,
  airGapLevel,
  computeCorrections,
} from '../corrections.js';

describe('air gap levels (BR 443 (2019) 4.8.1)', () => {
  it('carries the three levels the standard recognises', () => {
    expect(AIR_GAP_LEVELS.map((level) => level.deltaUWPerM2K)).toEqual([0.0, 0.01, 0.04]);
    expect(airGapLevel('level-0').deltaUWPerM2K).toBe(0);
    expect(airGapLevel('level-1').deltaUWPerM2K).toBe(0.01);
    expect(airGapLevel('level-2').deltaUWPerM2K).toBe(0.04);
  });

  it('defaults to level 1, which is what BR 443 instructs', () => {
    expect(DEFAULT_AIR_GAP_LEVEL).toBe('level-1');
  });
});

describe('air gap correction', () => {
  it('scales by the square of the insulation share of the resistance', () => {
    // A wall where the insulation is most of the resistance:
    //   R_insulation / R_total = 2.857 / 3.877 = 0.73690
    //   ratio^2                                = 0.54302
    //   dU = 0.01 x 0.54302                    = 0.0054302 W/(m2K)
    const result = computeCorrections({
      uncorrectedUValueWPerM2K: 0.258,
      heatFlowDirection: 'horizontal',
      airGapLevel: 'level-1',
      totalResistanceM2KPerW: 3.877,
      insulationResistanceM2KPerW: 2.857,
    });
    const ratio = 2.857 / 3.877;
    expect(result.airGapDeltaUWPerM2K).toBeCloseTo(0.01 * ratio * ratio, 10);
    expect(result.airGapDeltaUWPerM2K).toBeCloseTo(0.00543, 5);
  });

  it('is larger at level 2 in the same proportion', () => {
    const at = (level: 'level-1' | 'level-2'): number =>
      computeCorrections({
        uncorrectedUValueWPerM2K: 0.258,
        heatFlowDirection: 'horizontal',
        airGapLevel: level,
        totalResistanceM2KPerW: 3.877,
        insulationResistanceM2KPerW: 2.857,
      }).airGapDeltaUWPerM2K;
    // 0.04 / 0.01 = 4, and the scaling is the same, so the ratio carries straight through.
    expect(at('level-2')).toBeCloseTo(at('level-1') * 4, 10);
  });

  it('is zero at level 0', () => {
    const result = computeCorrections({
      uncorrectedUValueWPerM2K: 0.258,
      heatFlowDirection: 'horizontal',
      airGapLevel: 'level-0',
      totalResistanceM2KPerW: 3.877,
      insulationResistanceM2KPerW: 2.857,
    });
    expect(result.airGapDeltaUWPerM2K).toBe(0);
    expect(result.correctedUValueWPerM2K).toBe(0.258);
  });

  it('is not applied to a floor', () => {
    // BR 443 4.8.1: the correction applies to walls and roofs but not floors, because
    // convection is suppressed when heat flows downwards.
    const result = computeCorrections({
      uncorrectedUValueWPerM2K: 0.2,
      heatFlowDirection: 'downward',
      airGapLevel: 'level-2',
      totalResistanceM2KPerW: 5,
      insulationResistanceM2KPerW: 4,
    });
    expect(result.airGapDeltaUWPerM2K).toBe(0);
    expect(result.warnings.map((w) => w.code)).toContain('in-house-convention');
  });

  it('falls back to the unscaled figure, with a warning, when no insulation is named', () => {
    const result = computeCorrections({
      uncorrectedUValueWPerM2K: 0.258,
      heatFlowDirection: 'horizontal',
      airGapLevel: 'level-1',
      totalResistanceM2KPerW: 3.877,
    });
    expect(result.airGapDeltaUWPerM2K).toBe(0.01);
    expect(result.warnings.map((w) => w.code)).toContain('value-needs-verification');
  });
});

describe('the 3 % threshold', () => {
  it('omits a correction smaller than 3 % of the uncorrected U-value', () => {
    // dU 0.00543 against U 0.258: 0.00543 / 0.258 = 2.1 %, under the threshold.
    const result = computeCorrections({
      uncorrectedUValueWPerM2K: 0.258,
      heatFlowDirection: 'horizontal',
      airGapLevel: 'level-1',
      totalResistanceM2KPerW: 3.877,
      insulationResistanceM2KPerW: 2.857,
    });
    expect(result.isNegligible).toBe(true);
    expect(result.correctedUValueWPerM2K).toBe(0.258);
    // Reported even when omitted, so a caller can say what was left out.
    expect(result.totalDeltaUWPerM2K).toBeGreaterThan(0);
  });

  it('applies a correction larger than 3 %', () => {
    // Level 2 on the same wall: 4 x 0.00543 = 0.0217, which is 8.4 % of 0.258.
    const result = computeCorrections({
      uncorrectedUValueWPerM2K: 0.258,
      heatFlowDirection: 'horizontal',
      airGapLevel: 'level-2',
      totalResistanceM2KPerW: 3.877,
      insulationResistanceM2KPerW: 2.857,
    });
    expect(result.isNegligible).toBe(false);
    expect(result.correctedUValueWPerM2K).toBeCloseTo(0.258 + result.totalDeltaUWPerM2K, 10);
    expect(result.correctedUValueWPerM2K).toBeGreaterThan(0.27);
  });

  it('uses a threshold of 3 %', () => {
    expect(DELTA_U_NEGLIGIBLE_FRACTION).toBe(0.03);
  });
});
