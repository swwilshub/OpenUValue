import { describe, expect, it } from 'vitest';
import {
  slightlyVentilatedInterpolationWeight,
  unventilatedAirLayerResistanceM2KPerW,
  ventilationClassFromOpeningArea,
} from '../airLayer.js';
import { calculateUValue } from '../uvalue.js';
import type { AirLayer } from '../types.js';
import { MINERAL_WOOL, PLASTERBOARD, BRICK_OUTER_LEAF, element, solid } from './fixtures.js';

function cavity(ventilation: AirLayer['ventilation'], openingAreaMm2PerM?: number): AirLayer {
  return openingAreaMm2PerM === undefined
    ? { kind: 'air', id: 'cavity', label: 'Cavity', thicknessM: 0.05, ventilation }
    : { kind: 'air', id: 'cavity', label: 'Cavity', thicknessM: 0.05, ventilation, openingAreaMm2PerM };
}

describe('unventilatedAirLayerResistanceM2KPerW (BS EN ISO 6946 table)', () => {
  it('reproduces the tabulated points exactly', () => {
    // Spot checks straight off the table in constants.ts.
    expect(unventilatedAirLayerResistanceM2KPerW(0.005, 'horizontal').resistanceM2KPerW).toBe(0.11);
    expect(unventilatedAirLayerResistanceM2KPerW(0.01, 'upward').resistanceM2KPerW).toBe(0.15);
    expect(unventilatedAirLayerResistanceM2KPerW(0.025, 'horizontal').resistanceM2KPerW).toBe(0.18);
    expect(unventilatedAirLayerResistanceM2KPerW(0.025, 'downward').resistanceM2KPerW).toBe(0.19);
    expect(unventilatedAirLayerResistanceM2KPerW(0.1, 'downward').resistanceM2KPerW).toBe(0.22);
    expect(unventilatedAirLayerResistanceM2KPerW(0.1, 'upward').resistanceM2KPerW).toBe(0.16);
  });

  it('interpolates linearly on thickness between tabulated points', () => {
    // 20 mm horizontal sits midway between the 15 mm and 25 mm rows:
    //   position = (20 - 15) / (25 - 15) = 0.5
    //   R = 0.17 + 0.5 * (0.18 - 0.17) = 0.175 m^2*K/W
    expect(unventilatedAirLayerResistanceM2KPerW(0.02, 'horizontal').resistanceM2KPerW).toBeCloseTo(
      0.175,
      12,
    );
    // 20 mm downward, between the 0.17 and 0.19 rows:
    //   R = 0.17 + 0.5 * (0.19 - 0.17) = 0.18 m^2*K/W
    expect(unventilatedAirLayerResistanceM2KPerW(0.02, 'downward').resistanceM2KPerW).toBeCloseTo(
      0.18,
      12,
    );
  });

  it('reaches zero resistance at zero thickness', () => {
    expect(unventilatedAirLayerResistanceM2KPerW(0, 'horizontal').resistanceM2KPerW).toBe(0);
  });

  it('clamps above the tabulated range and says so', () => {
    // The table plateaus by design (convection sets in), so extrapolating past
    // 300 mm would be meaningless. Clamp and warn instead.
    const result = unventilatedAirLayerResistanceM2KPerW(0.5, 'horizontal', 'cavity');
    expect(result.resistanceM2KPerW).toBe(0.18);
    expect(result.warnings.map((w) => w.code)).toContain('air-layer-thickness-out-of-table');
  });
});

describe('ventilation classes', () => {
  it('classifies by opening area against the two thresholds', () => {
    expect(ventilationClassFromOpeningArea(0)).toBe('unventilated');
    expect(ventilationClassFromOpeningArea(499)).toBe('unventilated');
    expect(ventilationClassFromOpeningArea(500)).toBe('slightly-ventilated');
    expect(ventilationClassFromOpeningArea(1499)).toBe('slightly-ventilated');
    expect(ventilationClassFromOpeningArea(1500)).toBe('well-ventilated');
  });

  it('interpolates a slightly ventilated cavity linearly on opening area', () => {
    // weight = (area - 500) / (1500 - 500), clamped to 0..1.
    //   area = 500  -> 0.0   (treat as unventilated)
    //   area = 1000 -> 0.5
    //   area = 1500 -> 1.0   (treat as well ventilated)
    expect(slightlyVentilatedInterpolationWeight(cavity('slightly-ventilated', 500)).weight).toBe(0);
    expect(slightlyVentilatedInterpolationWeight(cavity('slightly-ventilated', 1000)).weight).toBe(
      0.5,
    );
    expect(slightlyVentilatedInterpolationWeight(cavity('slightly-ventilated', 1500)).weight).toBe(
      1,
    );
  });

  it('falls back to the midpoint and warns when no opening area is stated', () => {
    const result = slightlyVentilatedInterpolationWeight(cavity('slightly-ventilated'));
    expect(result.weight).toBe(0.5);
    expect(result.warnings.map((w) => w.code)).toContain('slightly-ventilated-interpolated');
  });
});

describe('well-ventilated air layer (BS EN ISO 6946)', () => {
  it('disregards the cavity and everything outboard of it, with still air outside', () => {
    // Rear-ventilated cladding, internal -> external:
    //   12.5 mm plasterboard   R = 0.0125 / 0.25  = 0.05
    //   100 mm mineral wool    R = 0.100  / 0.035 = 2.8571429
    //   50 mm well-ventilated cavity        -> disregarded
    //   102.5 mm brick cladding             -> disregarded
    //
    // Rse is replaced by the still-air internal value for the same direction, so
    //   RT = Rsi + 0.05 + 2.8571429 + Rsi
    //      = 0.13 + 2.9071429 + 0.13
    //      = 3.1671429 m^2*K/W
    //   U  = 1 / 3.1671429 = 0.315742 W/(m^2*K)
    const wall = element([
      solid('pb', 'Plasterboard', 0.0125, PLASTERBOARD),
      solid('insulation', 'Mineral wool', 0.1, MINERAL_WOOL),
      cavity('well-ventilated'),
      solid('brick', 'Brick cladding', 0.1025, BRICK_OUTER_LEAF),
    ]);
    const result = calculateUValue(wall);
    expect(result.totalResistanceM2KPerW).toBeCloseTo(3.1671429, 6);
    expect(result.uValueWPerM2K).toBeCloseTo(0.315742, 6);
    expect(result.rseM2KPerW).toBe(0.13);
    expect(result.warnings.map((w) => w.code)).toContain('well-ventilated-outer-layers-ignored');
    // The disregarded layers are still reported, so the UI can draw them greyed out.
    expect(result.layers.map((l) => l.includedInCalculation)).toEqual([true, true, false, false]);
  });
});
