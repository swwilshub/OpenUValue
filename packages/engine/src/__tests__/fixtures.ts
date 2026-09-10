import type { BuildingElement, EnvironmentConditions, Layer, MaterialProperties } from '../types.js';

/**
 * Test fixtures. The lambda values here are the ones used in the hand calculations in
 * the tests, chosen to make the arithmetic checkable rather than to assert anything
 * about a real product. Material provenance lives in @openuvalue/materials.
 */
export const PLASTERBOARD: MaterialProperties = {
  lambdaWPerMK: 0.25,
  densityKgPerM3: 900,
  specificHeatCapacityJPerKgK: 1000,
  vapourResistanceFactorMu: 10,
};
export const AIRCRETE_BLOCK: MaterialProperties = { lambdaWPerMK: 0.15 };
export const MINERAL_WOOL: MaterialProperties = {
  lambdaWPerMK: 0.035,
  vapourResistanceFactorMu: 1,
};
export const BRICK_OUTER_LEAF: MaterialProperties = { lambdaWPerMK: 0.77 };
export const SOFTWOOD: MaterialProperties = {
  lambdaWPerMK: 0.13,
  vapourResistanceFactorMu: 50,
};
export const OSB: MaterialProperties = { lambdaWPerMK: 0.13, vapourResistanceFactorMu: 50 };
export const CONCRETE_MEDIUM: MaterialProperties = { lambdaWPerMK: 1.15 };
export const STEEL: MaterialProperties = { lambdaWPerMK: 50 };

export function solid(
  id: string,
  label: string,
  thicknessM: number,
  material: MaterialProperties,
  bridging?: { label: string; areaFraction: number; material: MaterialProperties },
): Layer {
  return bridging === undefined
    ? { kind: 'solid', id, label, thicknessM, material }
    : { kind: 'solid', id, label, thicknessM, material, bridging };
}

export function element(layers: readonly Layer[], overrides: Partial<BuildingElement> = {}): BuildingElement {
  return {
    id: 'test',
    name: 'Test element',
    heatFlowDirection: 'horizontal',
    layers,
    ...overrides,
  };
}

/** 100 mm medium-density concrete, the simplest element used by several tests. */
export const SINGLE_LAYER_CONCRETE_WALL = element([
  solid('concrete', 'Concrete', 0.1, CONCRETE_MEDIUM),
]);

/**
 * Filled-cavity masonry wall, homogeneous, internal -> external:
 *   12.5 mm plasterboard, 100 mm aircrete block, 100 mm mineral wool, 102.5 mm brick.
 */
export const FILLED_CAVITY_WALL = element([
  solid('pb', 'Plasterboard', 0.0125, PLASTERBOARD),
  solid('block', 'Aircrete block', 0.1, AIRCRETE_BLOCK),
  solid('insulation', 'Mineral wool', 0.1, MINERAL_WOOL),
  solid('brick', 'Brick outer leaf', 0.1025, BRICK_OUTER_LEAF),
]);

/**
 * Timber-frame wall, internal -> external:
 *   12.5 mm plasterboard, 140 mm mineral wool bridged 15 % by softwood studs,
 *   9 mm OSB sheathing.
 * This is the worked example behind most of the combined-method tests.
 */
export const TIMBER_FRAME_WALL = element([
  solid('pb', 'Plasterboard', 0.0125, PLASTERBOARD),
  solid('insulation', 'Mineral wool', 0.14, MINERAL_WOOL, {
    label: 'Softwood stud',
    areaFraction: 0.15,
    material: SOFTWOOD,
  }),
  solid('osb', 'OSB sheathing', 0.009, OSB),
]);

/** 20 C / 50 % RH inside, 0 C / 90 % RH outside. */
export const STANDARD_CONDITIONS: EnvironmentConditions = {
  internalAirTemperatureC: 20,
  internalRelativeHumidityPercent: 50,
  externalAirTemperatureC: 0,
  externalRelativeHumidityPercent: 90,
};
