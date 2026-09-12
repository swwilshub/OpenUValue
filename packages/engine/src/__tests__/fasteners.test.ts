import { describe, expect, it } from 'vitest';
import {
  BR443_TIE_CONDUCTIVITY_W_PER_MK,
  BR443_WALL_TIE_DENSITY_PER_M2,
  BR443_WALL_TIE_TYPES,
  RECESSED_FIXING_EXEMPTION_MAX_PER_M2,
  approximateFastenerCorrection,
  assessFasteners,
} from '../fasteners.js';
import { computeCorrections } from '../corrections.js';
import { InvalidInputError } from '../errors.js';

/**
 * The arithmetic is one multiplication, so these tests are mostly about the three
 * different things that can happen — a correction, an exemption, and an element the
 * method does not cover — and about the units, which are the check that BR 443's
 * sentence really does specify the whole calculation.
 */

describe('the detailed route, BR 443 (2019) 4.8.3(a)', () => {
  it('multiplies the point thermal transmittance by the fastener density', () => {
    // chi = 0.004 W/K per fastener, 5 fasteners per m2:
    //   0.004 W/K x 5 /m2 = 0.02 W/(m2*K)
    // The units are the point: W/K per fastener times fasteners per m2 is W/(m2*K),
    // which is a thermal transmittance, so no other factor is missing.
    const assessment = assessFasteners({
      pointThermalTransmittanceWPerK: 0.004,
      fastenersPerM2: 5,
    });

    expect(assessment.outcome).toBe('corrected');
    expect(assessment.deltaUWPerM2K).toBeCloseTo(0.02, 12);
  });

  it('scales linearly with each input', () => {
    // Doubling either input doubles the correction; there is nothing else in the formula.
    const base = assessFasteners({ pointThermalTransmittanceWPerK: 0.003, fastenersPerM2: 4 });
    const twiceChi = assessFasteners({ pointThermalTransmittanceWPerK: 0.006, fastenersPerM2: 4 });
    const twiceDensity = assessFasteners({
      pointThermalTransmittanceWPerK: 0.003,
      fastenersPerM2: 8,
    });

    // 0.003 x 4 = 0.012
    expect(base.deltaUWPerM2K).toBeCloseTo(0.012, 12);
    expect(twiceChi.deltaUWPerM2K).toBeCloseTo(2 * base.deltaUWPerM2K, 12);
    expect(twiceDensity.deltaUWPerM2K).toBeCloseTo(2 * base.deltaUWPerM2K, 12);
  });

  it('gives no correction when there are no fasteners', () => {
    expect(
      assessFasteners({ pointThermalTransmittanceWPerK: 0.004, fastenersPerM2: 0 })
        .deltaUWPerM2K,
    ).toBe(0);
  });

  it('refuses negative or non-finite inputs rather than returning nonsense', () => {
    expect(() =>
      assessFasteners({ pointThermalTransmittanceWPerK: -0.001, fastenersPerM2: 5 }),
    ).toThrow(InvalidInputError);
    expect(() =>
      assessFasteners({ pointThermalTransmittanceWPerK: 0.004, fastenersPerM2: -1 }),
    ).toThrow(InvalidInputError);
    expect(() =>
      assessFasteners({
        pointThermalTransmittanceWPerK: Number.NaN,
        fastenersPerM2: 5,
      }),
    ).toThrow(InvalidInputError);
  });
});

describe('the recessed flat-roof exemption, BR 443 (2019) 4.8.3', () => {
  const recessedRoof = {
    pointThermalTransmittanceWPerK: 0.004,
    isFlatRoof: true,
    metalRecessedAtLeastHalf: true,
  };

  it('needs no correction at or below 15 fixings per square metre', () => {
    expect(RECESSED_FIXING_EXEMPTION_MAX_PER_M2).toBe(15);

    const atTheLimit = assessFasteners({ ...recessedRoof, fastenersPerM2: 15 });
    expect(atTheLimit.outcome).toBe('exempt-recessed-flat-roof');
    expect(atTheLimit.deltaUWPerM2K).toBe(0);
    // "does not exceed 15" includes 15, so the limit itself is exempt.
  });

  it('corrects again above 15 fixings per square metre', () => {
    const over = assessFasteners({ ...recessedRoof, fastenersPerM2: 16 });
    expect(over.outcome).toBe('corrected');
    // 0.004 x 16 = 0.064
    expect(over.deltaUWPerM2K).toBeCloseTo(0.064, 12);
  });

  it('needs all three conditions, not any of them', () => {
    // Flat roof and low density, but the metal is not recessed.
    expect(
      assessFasteners({
        pointThermalTransmittanceWPerK: 0.004,
        fastenersPerM2: 10,
        isFlatRoof: true,
      }).outcome,
    ).toBe('corrected');

    // Recessed and low density, but not a flat roof: BR 443 grants the exemption to
    // flat roofs specifically, so a wall or a pitched roof still gets corrected.
    expect(
      assessFasteners({
        pointThermalTransmittanceWPerK: 0.004,
        fastenersPerM2: 10,
        metalRecessedAtLeastHalf: true,
      }).outcome,
    ).toBe('corrected');
  });
});

describe('elements the method does not cover', () => {
  it('refuses to correct a fixing with both ends in metal sheets', () => {
    const assessment = assessFasteners({
      pointThermalTransmittanceWPerK: 0.004,
      fastenersPerM2: 5,
      bothEndsInMetalSheets: true,
    });

    expect(assessment.outcome).toBe('out-of-scope-metal-sheets');
    expect(assessment.deltaUWPerM2K).toBe(0);
    // A zero here must never read as "no correction needed": it means the method does
    // not apply, so it has to be warned about.
    expect(assessment.warnings.map((w) => w.code)).toContain('metal-bridging-out-of-scope');
  });

  it('puts the metal-sheet rule ahead of the recess exemption', () => {
    // An element that satisfies both descriptions is out of scope, not exempt: the
    // exemption says no correction is needed, which would be the wrong thing to tell
    // someone whose element the method cannot handle at all.
    const assessment = assessFasteners({
      pointThermalTransmittanceWPerK: 0.004,
      fastenersPerM2: 10,
      isFlatRoof: true,
      metalRecessedAtLeastHalf: true,
      bothEndsInMetalSheets: true,
    });
    expect(assessment.outcome).toBe('out-of-scope-metal-sheets');
    expect(assessment.warnings).toHaveLength(1);
  });
});

describe('BR 443 (2019) 4.8.2 reference data', () => {
  it('carries the tie conductivities the convention quotes', () => {
    expect(BR443_TIE_CONDUCTIVITY_W_PER_MK.mildSteel).toBe(50);
    expect(BR443_TIE_CONDUCTIVITY_W_PER_MK.stainlessSteel).toBe(17);
  });

  it('carries the two tie cross-sections, converted from mm² to m²', () => {
    // 12.5 mm² = 12.5e-6 m²; 80 mm² = 80e-6 m².
    expect(BR443_WALL_TIE_TYPES.map((tie) => tie.crossSectionalAreaM2)).toEqual([
      12.5e-6, 80e-6,
    ]);
  });

  it('carries the density at 900 by 450 mm centres', () => {
    // 1 / (0.9 x 0.45) = 2.469..., which BR 443 quotes rounded to 2.5 per m².
    expect(BR443_WALL_TIE_DENSITY_PER_M2).toBe(2.5);
    expect(1 / (0.9 * 0.45)).toBeCloseTo(2.47, 2);
  });
});

describe('fasteners inside the whole correction', () => {
  const base = {
    uncorrectedUValueWPerM2K: 0.25,
    heatFlowDirection: 'horizontal' as const,
    totalResistanceM2KPerW: 4,
    insulationResistanceM2KPerW: 3,
  };

  it('adds ΔU_f to ΔU_g and tests the 3 % threshold against the sum', () => {
    // ΔU_g at level 1 is 0.01 scaled by (3/4)^2 = 0.5625, so 0.005625.
    // On its own that is 2.25 % of 0.25 and would be omitted.
    const gapsOnly = computeCorrections({ ...base, airGapLevel: 'level-1' });
    expect(gapsOnly.airGapDeltaUWPerM2K).toBeCloseTo(0.005625, 12);
    expect(gapsOnly.isNegligible).toBe(true);

    // Add fasteners at 0.004 x 5 = 0.02. The sum is 0.025625, which is 10.25 % of 0.25,
    // so now nothing is omitted. BR 443 4.8: "The 3% relates to the total corrections."
    const both = computeCorrections({
      ...base,
      airGapLevel: 'level-1',
      fasteners: { pointThermalTransmittanceWPerK: 0.004, fastenersPerM2: 5 },
    });
    expect(both.fastenerDeltaUWPerM2K).toBeCloseTo(0.02, 12);
    expect(both.totalDeltaUWPerM2K).toBeCloseTo(0.025625, 12);
    expect(both.isNegligible).toBe(false);
    // 0.25 + 0.025625 = 0.275625
    expect(both.correctedUValueWPerM2K).toBeCloseTo(0.275625, 12);
  });

  it('reports zero and no assessment when no fasteners are given', () => {
    const result = computeCorrections({ ...base, airGapLevel: 'level-1' });
    expect(result.fastenerDeltaUWPerM2K).toBe(0);
    expect(result.fasteners).toBeUndefined();
  });

  it('carries the fastener warning up into the correction result', () => {
    const result = computeCorrections({
      ...base,
      fasteners: {
        pointThermalTransmittanceWPerK: 0.004,
        fastenersPerM2: 5,
        bothEndsInMetalSheets: true,
      },
    });
    expect(result.fastenerDeltaUWPerM2K).toBe(0);
    expect(result.warnings.map((w) => w.code)).toContain('metal-bridging-out-of-scope');
  });
});

describe('the approximate route, ISO/DIS 6946:2015 Annex F.3.2', () => {
  /*
   * A stainless steel double-triangle wall tie through 100 mm of cavity insulation, with
   * the tie data BR 443 (2019) 4.8.2 gives for when the exact details are not known:
   *   lambda_f = 17 W/(m*K), A_f = 12.5 mm^2 = 12.5e-6 m^2, n_f = 2.5 per m^2
   * through mineral wool at lambda 0.035, so R_1 = 0.1 / 0.035 = 2.857 m^2K/W, in an
   * element whose unbridged total is 3.887 m^2K/W.
   */
  const tie = {
    fastenerConductivityWPerMK: 17,
    crossSectionalAreaM2: 12.5e-6,
    fastenersPerM2: 2.5,
    penetratedLengthM: 0.1,
    insulationThicknessM: 0.1,
    insulationResistanceM2KPerW: 0.1 / 0.035,
    totalResistanceIgnoringBridgingM2KPerW: 3.887,
  };

  it('works the formula through for a stainless steel wall tie', () => {
    // alpha = 0.8, since the tie goes right through.
    // lambda_f * A_f * n_f = 17 x 12.5e-6 x 2.5 = 5.312500e-4
    //   divided by d_1 = 0.1                    = 5.312500e-3
    // R_1 = 0.1 / 0.035                         = 2.857142857
    // R_1 / R_T,h = 2.857142857 / 3.887         = 0.735050902
    //   squared                                 = 0.540299829
    // dU_f = 0.8 x 5.3125e-3 x 0.540299829      = 0.0022962743 W/(m^2*K)
    const result = approximateFastenerCorrection(tie);
    expect(result.outcome).toBe('corrected');
    expect(result.deltaUWPerM2K).toBeCloseTo(0.0022962743, 9);
  });

  it('halves alpha for a fastener recessed half way', () => {
    // alpha = 0.8 x d_1/d_0 = 0.8 x 0.05/0.1 = 0.4. But d_1 is also the divisor, and it
    // has halved too, so the lambda*A*n/d_1 term doubles — the two cancel exactly:
    //   0.4 x (5.312500e-4 / 0.05) x 0.540299829 = 0.0022962743
    // Which is worth knowing: recessing a fastener does not help unless the insulation
    // resistance R_1 it sees falls with it, as the standard's NOTE 1 says it does.
    const recessed = approximateFastenerCorrection({ ...tie, penetratedLengthM: 0.05 });
    expect(recessed.deltaUWPerM2K).toBeCloseTo(0.0022962743, 9);
  });

  it('still counts a fastener that passes through at an angle', () => {
    // The standard's NOTE 1: d_1 can exceed the layer thickness where the fastener goes
    // through at an angle. It has still fully penetrated, so alpha stays at 0.8.
    const angled = approximateFastenerCorrection({ ...tie, penetratedLengthM: 0.12 });
    // 0.8 x (5.312500e-4 / 0.12) x 0.540299829 = 0.0019135619
    expect(angled.deltaUWPerM2K).toBeCloseTo(0.0019135619, 9);
  });

  it('scales with the square of the insulation share', () => {
    // Halving R_1/R_T,h quarters the correction.
    const half = approximateFastenerCorrection({
      ...tie,
      totalResistanceIgnoringBridgingM2KPerW: 3.887 * 2,
    });
    // 0.0022962743 / 4 = 0.0005740686
    expect(half.deltaUWPerM2K).toBeCloseTo(0.0005740686, 9);
  });

  it('applies no correction to ties across an empty cavity', () => {
    // "No correction shall be applied ... where there are wall ties across an empty cavity"
    const result = approximateFastenerCorrection({ ...tie, acrossEmptyCavity: true });
    expect(result.outcome).toBe('exempt-empty-cavity');
    expect(result.deltaUWPerM2K).toBe(0);
    expect(result.warnings).toHaveLength(0);
  });

  it('applies no correction below 1 W/(m·K)', () => {
    // "...when the thermal conductivity of the fastener is less than 1 W/(m·K)."
    // BR 443 4.8.2 calls these specialist ties.
    const result = approximateFastenerCorrection({
      ...tie,
      fastenerConductivityWPerMK: 0.9,
    });
    expect(result.outcome).toBe('exempt-low-conductivity');
    expect(result.deltaUWPerM2K).toBe(0);

    // Exactly 1 is not "less than 1", so it is corrected.
    expect(
      approximateFastenerCorrection({ ...tie, fastenerConductivityWPerMK: 1 }).outcome,
    ).toBe('corrected');
  });

  it('is out of scope, not exempt, with both ends in metal sheets', () => {
    const result = approximateFastenerCorrection({ ...tie, bothEndsInMetalSheets: true });
    expect(result.outcome).toBe('out-of-scope-metal-sheets');
    expect(result.warnings.map((w) => w.code)).toContain('metal-bridging-out-of-scope');
  });

  it('gives a wall tie a correction small enough to be dropped by the 3 % rule', () => {
    // 0.0023 against a U of about 0.257 is 0.9 %, under the 3 % threshold — which is why
    // BR 443 4.8.2 says the effect "may be negligible". The tool still has to calculate it
    // to find that out, which BR 443 4.8 also says in as many words.
    const result = approximateFastenerCorrection(tie);
    expect(result.deltaUWPerM2K / (1 / 3.887)).toBeLessThan(0.03);
  });

  it('refuses impossible geometry rather than dividing by zero', () => {
    expect(() =>
      approximateFastenerCorrection({ ...tie, penetratedLengthM: 0 }),
    ).toThrow(InvalidInputError);
    expect(() =>
      approximateFastenerCorrection({ ...tie, fastenersPerM2: -1 }),
    ).toThrow(InvalidInputError);
  });
});
