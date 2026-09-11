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
