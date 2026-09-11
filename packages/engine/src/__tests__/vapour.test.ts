import { describe, expect, it } from 'vitest';
import {
  AIR_VAPOUR_PERMEABILITY_KG_PER_M_S_PA,
  equivalentAirLayerThicknessM,
  vapourClassForSd,
  vapourPermeabilityKgPerMSPa,
  vapourResistanceMNsPerG,
} from '../vapour.js';
import { InvalidInputError } from '../errors.js';

describe('vapour permeability', () => {
  it('gives still air its own permeability at mu = 1', () => {
    // mu is the ratio to still air, so a material as permeable as air has mu = 1.
    expect(vapourPermeabilityKgPerMSPa(1)).toBe(AIR_VAPOUR_PERMEABILITY_KG_PER_M_S_PA);
  });

  it('halves the permeability when mu doubles', () => {
    // delta = delta_air / mu, so mu = 2 gives 2.0e-10 / 2 = 1.0e-10 kg/(m*s*Pa).
    expect(vapourPermeabilityKgPerMSPa(2)).toBeCloseTo(1.0e-10, 20);
  });

  it('makes a polythene sheet five orders of magnitude tighter than air', () => {
    // mu = 100 000:  delta = 2.0e-10 / 1e5 = 2.0e-15 kg/(m*s*Pa).
    expect(vapourPermeabilityKgPerMSPa(100000)).toBeCloseTo(2.0e-15, 20);
  });

  it('rejects a non-positive mu', () => {
    // mu = 0 would be infinitely permeable, which is not a material.
    expect(() => vapourPermeabilityKgPerMSPa(0)).toThrow(InvalidInputError);
    expect(() => vapourPermeabilityKgPerMSPa(-5)).toThrow(InvalidInputError);
  });
});

describe('equivalent air layer thickness', () => {
  it('is mu times the thickness', () => {
    // 0.2 mm polythene at mu = 100 000:  1e5 * 0.0002 = 20 m of still air.
    expect(equivalentAirLayerThicknessM(100000, 0.0002)).toBeCloseTo(20, 10);
    // 100 mm mineral wool at mu = 1 is just its own thickness.
    expect(equivalentAirLayerThicknessM(1, 0.1)).toBeCloseTo(0.1, 10);
    // 12.5 mm plasterboard at mu = 10:  10 * 0.0125 = 0.125 m.
    expect(equivalentAirLayerThicknessM(10, 0.0125)).toBeCloseTo(0.125, 10);
  });
});

describe('vapour resistance in UK units', () => {
  it('gives 5 MN*s/g per metre of Sd', () => {
    // Sd / (delta_air * 1e9) = 1 / (2.0e-10 * 1e9) = 1 / 0.2 = 5 MN*s/g per metre.
    // This reproduces the conventional 5 MN*s/(g*m) resistivity of still air, which
    // is the cross-check that the 2.0e-10 permeability is the right figure.
    expect(vapourResistanceMNsPerG(1)).toBeCloseTo(5, 10);
  });

  it('converts a polythene sheet to the figure on its datasheet', () => {
    // Sd 20 m -> 20 * 5 = 100 MN*s/g, the order of magnitude quoted for 1000 gauge
    // polythene.
    expect(vapourResistanceMNsPerG(20)).toBeCloseTo(100, 10);
  });
});

describe('vapour class (a presentation aid, not a standard classification)', () => {
  it('bands by Sd', () => {
    expect(vapourClassForSd(0.1)).toBe('vapour-open');
    expect(vapourClassForSd(0.49)).toBe('vapour-open');
    expect(vapourClassForSd(0.5)).toBe('vapour-retarding');
    expect(vapourClassForSd(9.99)).toBe('vapour-retarding');
    expect(vapourClassForSd(10)).toBe('vapour-barrier');
    expect(vapourClassForSd(20)).toBe('vapour-barrier');
  });
});
