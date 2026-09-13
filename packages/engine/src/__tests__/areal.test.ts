import { describe, expect, it } from 'vitest';
import { arealQuantities } from '../areal.js';
import {
  FILLED_CAVITY_WALL,
  PLASTERBOARD,
  TIMBER_FRAME_WALL,
  element,
  solid,
} from './fixtures.js';

/**
 * Every expectation here is the arithmetic written out. These are sums over the layers,
 * so a hand calculation is the whole of the check.
 */

describe('arealQuantities', () => {
  it('adds thickness, mass, heat capacity and Sd over a timber-frame wall', () => {
    const areal = arealQuantities(TIMBER_FRAME_WALL);

    // 12.5 mm plasterboard + 140 mm mineral wool + 9 mm OSB
    //   = 0.0125 + 0.14 + 0.009 = 0.1615 m
    expect(areal.totalThicknessM).toBeCloseTo(0.1615, 10);

    // Only the plasterboard carries a density in the fixtures:
    //   900 kg/m^3 x 0.0125 m = 11.25 kg/m^2
    expect(areal.massPerAreaKgPerM2).toBeCloseTo(11.25, 10);

    // 11.25 kg/m^2 x 1000 J/(kg*K) = 11 250 J/(m^2*K) = 11.25 kJ/(m^2*K)
    expect(areal.totalHeatCapacityKJPerM2K).toBeCloseTo(11.25, 10);

    // Sd = mu x d, summed:
    //   plasterboard 10 x 0.0125 = 0.125
    //   mineral wool  1 x 0.14   = 0.14
    //   OSB          50 x 0.009  = 0.45
    //   total                    = 0.715 m
    expect(areal.totalSdM).toBeCloseTo(0.715, 10);
  });

  it('names the layers it could not weigh rather than dropping them silently', () => {
    const areal = arealQuantities(TIMBER_FRAME_WALL);

    // The mineral wool and OSB fixtures carry lambda and mu but no density, so they
    // contribute nothing to either total. Saying which ones is the point: a mass that
    // quietly omits 149 mm of a 161.5 mm wall would be worse than no mass at all.
    expect(areal.layersMissingDensity).toEqual(['insulation', 'osb']);
    expect(areal.layersMissingHeatCapacity).toEqual(['insulation', 'osb']);
    expect(areal.layersMissingMu).toEqual([]);
  });

  it('reports layers whose mu is unknown, since they contribute nothing to Sd', () => {
    const areal = arealQuantities(FILLED_CAVITY_WALL);

    // 0.0125 + 0.1 + 0.1 + 0.1025 = 0.315 m
    expect(areal.totalThicknessM).toBeCloseTo(0.315, 10);
    // Sd: plasterboard 10 x 0.0125 = 0.125; block unknown -> 0; mineral wool
    //     1 x 0.1 = 0.1; brick unknown -> 0. Total 0.225 m.
    expect(areal.totalSdM).toBeCloseTo(0.225, 10);
    expect(areal.layersMissingMu).toEqual(['block', 'brick']);
  });

  it('treats an air layer as weightless but vapour-open, and not as missing data', () => {
    // mu of still air is 1 by definition, so Sd equals the thickness.
    const wall = element([
      solid('pb', 'Plasterboard', 0.0125, PLASTERBOARD),
      { kind: 'air', id: 'cavity', label: 'Cavity', thicknessM: 0.05, ventilation: 'unventilated' },
    ]);
    const areal = arealQuantities(wall);

    expect(areal.totalThicknessM).toBeCloseTo(0.0625, 10);
    expect(areal.massPerAreaKgPerM2).toBeCloseTo(11.25, 10);
    // 10 x 0.0125 + 1 x 0.05 = 0.125 + 0.05 = 0.175 m
    expect(areal.totalSdM).toBeCloseTo(0.175, 10);
    // The cavity genuinely has no mass; that is physics, not a gap in the data.
    expect(areal.layersMissingDensity).toEqual([]);
    expect(areal.layersMissingHeatCapacity).toEqual([]);
    expect(areal.layersMissingMu).toEqual([]);
  });

  it('treats a declared-resistance product as unknown on every count', () => {
    const wall = element([
      solid('pb', 'Plasterboard', 0.0125, PLASTERBOARD),
      {
        kind: 'fixed-resistance',
        id: 'product',
        label: 'Declared product',
        thicknessM: 0.002,
        resistanceM2KPerW: 0.1,
      },
    ]);
    const areal = arealQuantities(wall);

    // Thickness still counts: it is drawn to scale whatever else is unknown.
    expect(areal.totalThicknessM).toBeCloseTo(0.0145, 10);
    expect(areal.massPerAreaKgPerM2).toBeCloseTo(11.25, 10);
    expect(areal.layersMissingDensity).toEqual(['product']);
    expect(areal.layersMissingHeatCapacity).toEqual(['product']);
    expect(areal.layersMissingMu).toEqual(['product']);
  });

  it('returns zeroes for an element with no layers', () => {
    const areal = arealQuantities(element([]));
    expect(areal.totalThicknessM).toBe(0);
    expect(areal.massPerAreaKgPerM2).toBe(0);
    expect(areal.totalHeatCapacityKJPerM2K).toBe(0);
    expect(areal.totalSdM).toBe(0);
  });
});

describe('a bridged layer weighs what both its sections weigh', () => {
  const QUILT = { lambdaWPerMK: 0.035, densityKgPerM3: 20, specificHeatCapacityJPerKgK: 1030 };
  const TIMBER = { lambdaWPerMK: 0.13, densityKgPerM3: 500, specificHeatCapacityJPerKgK: 1600 };
  const DABS = { lambdaWPerMK: 0.43, densityKgPerM3: 1300, specificHeatCapacityJPerKgK: 840 };

  it('area-weights a stud through insulation', () => {
    /*
     * 140 mm of quilt at 20 kg/m3, bridged 15 % by softwood at 500:
     *   0.85 * 20 * 0.14  = 2.38 kg/m2
     *   0.15 * 500 * 0.14 = 10.50 kg/m2
     *                     = 12.88 kg/m2
     * Counting only the quilt would give 2.80 — the timber is most of the weight of a
     * timber-framed wall's insulation layer, not a rounding error on it.
     */
    const result = arealQuantities(
      element([
        solid('ins', 'Quilt', 0.14, QUILT, {
          label: 'Stud',
          areaFraction: 0.15,
          material: TIMBER,
        }),
      ]),
    );
    expect(result.massPerAreaKgPerM2).toBeCloseTo(12.88, 10);
    // 0.85 * 20 * 0.14 * 1030 + 0.15 * 500 * 0.14 * 1600 = 2451.4 + 16800 = 19251.4 J
    expect(result.totalHeatCapacityKJPerM2K).toBeCloseTo(19.2514, 10);
  });

  it('gives a dabbed cavity the weight of its dabs', () => {
    /*
     * The case that makes this matter: the unbridged section is air, so counting only
     * that gives the layer no mass at all. 15 mm of cavity dabbed 20 % at 1300 kg/m3:
     *   0.20 * 1300 * 0.015 = 3.90 kg/m2
     */
    const result = arealQuantities(
      element([
        {
          kind: 'air',
          id: 'cav',
          label: 'Cavity',
          thicknessM: 0.015,
          ventilation: 'unventilated',
          bridging: { label: 'Plaster dabs', areaFraction: 0.2, material: DABS },
        },
      ]),
    );
    expect(result.massPerAreaKgPerM2).toBeCloseTo(3.9, 10);
    // 0.20 * 1300 * 0.015 * 840 = 3276 J -> 3.276 kJ
    expect(result.totalHeatCapacityKJPerM2K).toBeCloseTo(3.276, 10);
    expect(result.layersMissingDensity).toEqual([]);
  });

  it('still counts an empty cavity as weightless rather than as a gap', () => {
    const result = arealQuantities(
      element([
        {
          kind: 'air',
          id: 'cav',
          label: 'Cavity',
          thicknessM: 0.05,
          ventilation: 'unventilated',
        },
      ]),
    );
    expect(result.massPerAreaKgPerM2).toBe(0);
    expect(result.layersMissingDensity).toEqual([]);
  });

  it('reports a member with no density as a gap, not as nothing', () => {
    const result = arealQuantities(
      element([
        {
          kind: 'air',
          id: 'cav',
          label: 'Cavity',
          thicknessM: 0.05,
          ventilation: 'unventilated',
          bridging: {
            label: 'Unknown member',
            areaFraction: 0.1,
            material: { lambdaWPerMK: 0.2 },
          },
        },
      ]),
    );
    expect(result.massPerAreaKgPerM2).toBe(0);
    expect(result.layersMissingDensity).toEqual(['cav']);
  });
});
