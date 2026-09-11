import { describe, expect, it } from 'vitest';
import { DEFAULT_PERIOD_S, calculateDynamicProperties } from '../dynamic.js';
import { InvalidInputError } from '../errors.js';
import type { BuildingElement, MaterialProperties } from '../types.js';
import { MINERAL_WOOL, element, solid } from './fixtures.js';

/**
 * The dynamic method is a complex matrix product, so most composite results cannot be
 * worked out by hand in a comment. These tests therefore pin it down in three ways that
 * do not depend on running the code first:
 *
 *   1. exact cases small enough to calculate by hand (a massless element; one layer
 *      exactly one penetration depth thick);
 *   2. analytic limits the physics requires (a thin slab stores rho*c*d/2, a very thick
 *      one saturates at rho*c*delta/sqrt(2), the semi-infinite solid result);
 *   3. invariants that must hold for any real construction, used where the arithmetic
 *      is too long to write out.
 */

/** lambda 1, rho 1000, c 1000 — chosen so the penetration depth is easy to work with. */
const UNIT_MATERIAL: MaterialProperties = {
  lambdaWPerMK: 1,
  densityKgPerM3: 1000,
  specificHeatCapacityJPerKgK: 1000,
};

const DENSE_CONCRETE: MaterialProperties = {
  lambdaWPerMK: 1,
  densityKgPerM3: 2000,
  specificHeatCapacityJPerKgK: 1000,
};

/** No films, so the element matrix is exactly the layer matrix. */
function bare(layers: BuildingElement['layers']): BuildingElement {
  return element(layers, { rsiOverrideM2KPerW: 0, rseOverrideM2KPerW: 0 });
}

describe('a massless element reduces to its steady-state behaviour', () => {
  it('passes the whole swing through, undelayed, storing nothing', () => {
    // A layer with no density is a pure resistance, so every matrix in the product is
    // [[1, -R], [0, 1]] and the product is [[1, -R_total], [0, 1]].
    //   R = 0.1 / 0.5 = 0.2; with Rsi 0.13 and Rse 0.04, R_total = 0.37
    //   U = 1 / 0.37 = 2.7027027...
    //   Y = -1 / Z12 = -1 / -0.37 = 2.7027027..., so the decrement factor is exactly 1
    //   Z11 - 1 = 0, so kappa is exactly 0 on both faces
    //   Z12 is real and negative, so arg(Y) = 0 and there is no time shift
    const result = calculateDynamicProperties(
      element([solid('layer', 'No density', 0.1, { lambdaWPerMK: 0.5 })]),
    );

    expect(result.main.uValueWPerM2K).toBeCloseTo(2.7027027027, 9);
    expect(result.main.periodicThermalTransmittanceWPerM2K).toBeCloseTo(2.7027027027, 9);
    expect(result.main.decrementFactor).toBeCloseTo(1, 12);
    expect(result.main.timeShiftHours).toBeCloseTo(0, 12);
    expect(result.main.internalArealHeatCapacityKJPerM2K).toBeCloseTo(0, 12);
    expect(result.main.externalArealHeatCapacityKJPerM2K).toBeCloseTo(0, 12);
  });

  it('says which layers it could not give mass to', () => {
    const result = calculateDynamicProperties(
      element([solid('layer', 'No density', 0.1, { lambdaWPerMK: 0.5 })]),
    );
    expect(result.layersTreatedAsMassless).toEqual(['layer']);
    expect(result.warnings.some((w) => w.message.includes('storing no heat'))).toBe(true);
  });

  it('treats an air cavity as massless without calling it missing data', () => {
    const result = calculateDynamicProperties(
      element([
        solid('concrete', 'Concrete', 0.1, DENSE_CONCRETE),
        { kind: 'air', id: 'cavity', label: 'Cavity', thicknessM: 0.05, ventilation: 'unventilated' },
      ]),
    );
    // The cavity genuinely stores no heat; that is physics, not a gap in the catalogue.
    expect(result.layersTreatedAsMassless).toEqual([]);
  });
});

describe('one layer exactly one penetration depth thick', () => {
  /*
   * delta = sqrt(lambda * T / (pi * rho * c))
   *       = sqrt(1 * 86400 / (pi * 1000 * 1000))
   *       = sqrt(0.0275021...) = 0.1658371917 m
   * Setting d = delta makes xi = 1, so every hyperbolic and trigonometric term is taken
   * at 1 radian and the matrix can be written out:
   *
   *   cosh 1 = 1.5430806348   cos 1 = 0.5403023059
   *   sinh 1 = 1.1752011936   sin 1 = 0.8414709848
   *
   *   Z11 = cosh1*cos1 + j*sinh1*sin1
   *       = 0.8337300251 + 0.9888977058 j
   *
   *   s = sinh1*cos1 = 0.6349639148      k = cosh1*sin1 = 1.2984575814
   *   s + k = 1.9334214962               k - s = 0.6634936666
   *   delta / (2*lambda) = 0.0829185959
   *   Z12 = -0.0829185959 * (1.9334214962 + 0.6634936666 j)
   *       = -0.1603165957 - 0.0550159632 j
   */
  const PENETRATION_DEPTH_M = Math.sqrt((1 * DEFAULT_PERIOD_S) / (Math.PI * 1000 * 1000));

  it('has the penetration depth the formula gives', () => {
    expect(PENETRATION_DEPTH_M).toBeCloseTo(0.1658371917, 9);
  });

  it('gives the periodic transmittance the matrix implies', () => {
    const result = calculateDynamicProperties(
      bare([solid('slab', 'Slab', PENETRATION_DEPTH_M, UNIT_MATERIAL)]),
    );

    // |Z12| = sqrt(0.1603165957^2 + 0.0550159632^2)
    //       = sqrt(0.0257014 + 0.0030268) = sqrt(0.0287282) = 0.1694940
    // |Y|   = 1 / 0.1694940 = 5.8999189
    expect(result.main.periodicThermalTransmittanceWPerM2K).toBeCloseTo(5.8999189, 6);

    // arg(Y) = arg(-1 / Z12). Z12 lies in the third quadrant, so -1/Z12 has argument
    //   -atan2(0.0550159632, 0.1603165957) = -0.3305779 rad
    // A full period spans 2*pi radians over 24 h, so 0.3305779 rad is
    //   0.3305779 / (2*pi) * 24 = 1.262715 h of delay.
    expect(result.main.timeShiftHours).toBeCloseTo(1.262715, 5);
  });

  it('gives the areal heat capacity the matrix implies', () => {
    const result = calculateDynamicProperties(
      bare([solid('slab', 'Slab', PENETRATION_DEPTH_M, UNIT_MATERIAL)]),
    );

    // Z11 - 1 = -0.1662699749 + 0.9888977058 j
    // |Z11 - 1| = sqrt(0.0276457 + 0.9779188) = sqrt(1.0055645) = 1.0027784
    // |(Z11 - 1) / Z12| = 1.0027784 / 0.1694940 = 5.9162184
    // T / (2*pi) = 86400 / 6.2831853 = 13751.0439 s
    // kappa = 13751.0439 * 5.9162184 = 81355 J/(m2*K) = 81.355 kJ/(m2*K)
    expect(result.main.internalArealHeatCapacityKJPerM2K).toBeCloseTo(81.355, 2);

    // A single layer's matrix has Z11 = Z22, so both faces see the same capacity.
    expect(result.main.externalArealHeatCapacityKJPerM2K).toBeCloseTo(
      result.main.internalArealHeatCapacityKJPerM2K,
      9,
    );
  });
});

describe('analytic limits', () => {
  it('stores rho*c*d/2 when the layer is much thinner than the penetration depth', () => {
    /*
     * Quasi-statically, with the far face held steady, the temperature through a thin
     * slab is a straight line from the swing to zero, so its mean is half the swing and
     * only half the heat capacity takes part:
     *   rho*c*d/2 = 2000 * 1000 * 0.004 / 2 = 4000 J/(m2*K) = 4 kJ/(m2*K)
     */
    const result = calculateDynamicProperties(
      bare([solid('thin', 'Thin slab', 0.004, DENSE_CONCRETE)]),
    );
    expect(result.main.internalArealHeatCapacityKJPerM2K).toBeCloseTo(4, 3);
  });

  it('saturates at rho*c*delta/sqrt(2) once the layer is very thick', () => {
    /*
     * Past a few penetration depths the far face stops mattering and the layer behaves
     * as a semi-infinite solid, whose areal heat capacity is rho*c*delta/sqrt(2):
     *   delta = sqrt(1 * 86400 / (pi * 2000 * 1000)) = 0.1172706 m
     *   2000 * 1000 * 0.1172706 / sqrt(2) = 165845 J/(m2*K) = 165.85 kJ/(m2*K)
     * Adding more material beyond that changes nothing, which is the whole reason a
     * thick wall is not proportionally better at damping a daily swing.
     */
    const deep = calculateDynamicProperties(bare([solid('deep', 'Deep', 2, DENSE_CONCRETE)]));
    const deeper = calculateDynamicProperties(bare([solid('deep', 'Deep', 4, DENSE_CONCRETE)]));

    expect(deep.main.internalArealHeatCapacityKJPerM2K).toBeCloseTo(165.85, 1);
    expect(deeper.main.internalArealHeatCapacityKJPerM2K).toBeCloseTo(165.85, 1);
  });
});

describe('which side the insulation is on', () => {
  /*
   * The element matrix is not symmetric once it has more than one layer, and this is the
   * case that proves the layers are being multiplied in the right order. Insulating a
   * masonry wall on the inside puts the insulation between the room and the mass, so the
   * room loses access to it; insulating outside leaves the mass exposed to the room.
   * The U-value is identical either way, which is exactly why a U-value does not settle
   * the summer question.
   */
  const masonry = solid('masonry', 'Masonry', 0.2, DENSE_CONCRETE);
  const insulation = solid('insulation', 'Insulation', 0.1, MINERAL_WOOL);

  it('gives the internally insulated wall far less usable mass', () => {
    const insideInsulated = calculateDynamicProperties(element([insulation, masonry]));
    const outsideInsulated = calculateDynamicProperties(element([masonry, insulation]));

    expect(insideInsulated.main.uValueWPerM2K).toBeCloseTo(
      outsideInsulated.main.uValueWPerM2K,
      12,
    );
    expect(insideInsulated.main.internalArealHeatCapacityKJPerM2K).toBeLessThan(
      0.25 * outsideInsulated.main.internalArealHeatCapacityKJPerM2K,
    );
  });

  it('mirrors the two faces when the build-up is reversed and the films match', () => {
    // With equal surface resistances, reversing the layers must swap the two kappas
    // exactly. Nothing else in the calculation can produce that symmetry by accident.
    const films = { rsiOverrideM2KPerW: 0.13, rseOverrideM2KPerW: 0.13 };
    const forward = calculateDynamicProperties(element([insulation, masonry], films));
    const reversed = calculateDynamicProperties(element([masonry, insulation], films));

    expect(forward.main.internalArealHeatCapacityKJPerM2K).toBeCloseTo(
      reversed.main.externalArealHeatCapacityKJPerM2K,
      9,
    );
    expect(forward.main.externalArealHeatCapacityKJPerM2K).toBeCloseTo(
      reversed.main.internalArealHeatCapacityKJPerM2K,
      9,
    );
  });

  it('gives a symmetric build-up the same capacity on both faces', () => {
    const symmetric = calculateDynamicProperties(
      element([masonry, insulation, masonry], {
        rsiOverrideM2KPerW: 0.13,
        rseOverrideM2KPerW: 0.13,
      }),
    );
    expect(symmetric.main.internalArealHeatCapacityKJPerM2K).toBeCloseTo(
      symmetric.main.externalArealHeatCapacityKJPerM2K,
      9,
    );
  });
});

describe('invariants any real construction must satisfy', () => {
  const wall = element([
    solid('pb', 'Plasterboard', 0.0125, {
      lambdaWPerMK: 0.21,
      densityKgPerM3: 700,
      specificHeatCapacityJPerKgK: 840,
    }),
    solid('block', 'Aircrete block', 0.1, {
      lambdaWPerMK: 0.15,
      densityKgPerM3: 600,
      specificHeatCapacityJPerKgK: 840,
    }),
    solid('insulation', 'Mineral wool', 0.1, MINERAL_WOOL),
    solid('brick', 'Brick', 0.1025, {
      lambdaWPerMK: 0.77,
      densityKgPerM3: 1700,
      specificHeatCapacityJPerKgK: 840,
    }),
  ]);

  it('damps the swing and delays it, never the reverse', () => {
    const result = calculateDynamicProperties(wall);

    // A construction cannot amplify a daily swing, and cannot respond before it is
    // excited: 0 < f < 1 and the shift is a delay.
    expect(result.main.decrementFactor).toBeGreaterThan(0);
    expect(result.main.decrementFactor).toBeLessThan(1);
    expect(result.main.timeShiftHours).toBeGreaterThan(0);
    // Half a period would mean the inside peak lands when the outside is coldest;
    // beyond a full period the result is aliased and meaningless.
    expect(result.main.timeShiftHours).toBeLessThan(24);
  });

  it('never claims more stored heat than the materials contain', () => {
    const result = calculateDynamicProperties(wall);

    // Total rho*c*d over the whole wall, in kJ/(m2*K):
    //   plasterboard 700*840*0.0125   =   7 350
    //   aircrete     600*840*0.1      =  50 400
    //   mineral wool no density       =       0
    //   brick       1700*840*0.1025   = 146 370
    //                                   -------
    //                                   204 120 J/(m2*K) = 204.12 kJ/(m2*K)
    // Neither face can have access to more heat than the wall physically holds.
    const totalKJPerM2K = 204.12;
    expect(result.main.internalArealHeatCapacityKJPerM2K).toBeLessThan(totalKJPerM2K);
    expect(result.main.externalArealHeatCapacityKJPerM2K).toBeLessThan(totalKJPerM2K);
  });

  it('gives the outer leaf more exposed mass than the inner one', () => {
    // The insulation sits between the aircrete inner leaf and the heavier brick outer
    // leaf, so the outside face reaches more mass than the inside face does.
    const result = calculateDynamicProperties(wall);
    expect(result.main.externalArealHeatCapacityKJPerM2K).toBeGreaterThan(
      result.main.internalArealHeatCapacityKJPerM2K,
    );
  });

  it('damps less as the period lengthens towards a steady state', () => {
    // A slower cycle penetrates further, so more of the swing gets through. In the limit
    // of a very long period the element is in steady state and f approaches 1.
    const daily = calculateDynamicProperties(wall, { periodS: DEFAULT_PERIOD_S });
    const weekly = calculateDynamicProperties(wall, { periodS: 7 * DEFAULT_PERIOD_S });

    expect(weekly.main.decrementFactor).toBeGreaterThan(daily.main.decrementFactor);
    expect(weekly.main.decrementFactor).toBeLessThan(1);
  });
});

describe('bridged elements', () => {
  const timberFrame = element([
    solid('pb', 'Plasterboard', 0.0125, {
      lambdaWPerMK: 0.21,
      densityKgPerM3: 700,
      specificHeatCapacityJPerKgK: 840,
    }),
    solid('insulation', 'Mineral wool', 0.14, MINERAL_WOOL, {
      label: 'Softwood stud',
      areaFraction: 0.15,
      material: {
        lambdaWPerMK: 0.13,
        densityKgPerM3: 500,
        specificHeatCapacityJPerKgK: 1600,
      },
    }),
  ]);

  it('reports both sections rather than combining them', () => {
    const result = calculateDynamicProperties(timberFrame);

    expect(result.perPath.map((path) => path.pathId)).toEqual(['unbridged', 'bridged']);
    expect(result.perPath[0]?.areaFraction).toBeCloseTo(0.85, 12);
    expect(result.perPath[1]?.areaFraction).toBeCloseTo(0.15, 12);
    // The headline is the section between the studs.
    expect(result.main.pathId).toBe('unbridged');
  });

  it('flags the combination as our convention, not the standard', () => {
    const result = calculateDynamicProperties(timberFrame);
    expect(result.warnings.some((w) => w.code === 'in-house-convention')).toBe(true);
  });

  it('gives the stud section more stored heat than the insulation section', () => {
    // Softwood at 500 * 1600 = 800 kJ/(m3*K) against mineral wool at 20 * 1450 = 29.
    const result = calculateDynamicProperties(timberFrame);
    const unbridged = result.perPath[0];
    const bridged = result.perPath[1];
    expect(bridged?.internalArealHeatCapacityKJPerM2K).toBeGreaterThan(
      unbridged?.internalArealHeatCapacityKJPerM2K ?? 0,
    );
  });

  it('produces one path when nothing is bridged', () => {
    const result = calculateDynamicProperties(
      element([solid('slab', 'Slab', 0.1, DENSE_CONCRETE)]),
    );
    expect(result.perPath).toHaveLength(1);
    expect(result.warnings.some((w) => w.code === 'in-house-convention')).toBe(false);
  });
});

describe('input validation', () => {
  it('refuses a period that is not a positive number', () => {
    const wall = element([solid('slab', 'Slab', 0.1, DENSE_CONCRETE)]);
    expect(() => calculateDynamicProperties(wall, { periodS: 0 })).toThrow(InvalidInputError);
    expect(() => calculateDynamicProperties(wall, { periodS: -1 })).toThrow(InvalidInputError);
    expect(() =>
      calculateDynamicProperties(wall, { periodS: Number.POSITIVE_INFINITY }),
    ).toThrow(InvalidInputError);
  });

  it('defaults to a 24 hour cycle', () => {
    const result = calculateDynamicProperties(
      element([solid('slab', 'Slab', 0.1, DENSE_CONCRETE)]),
    );
    expect(result.periodS).toBe(86400);
    expect(result.standard).toBe('BS EN ISO 13786');
  });
});
