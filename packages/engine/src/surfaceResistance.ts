import { SURFACE_RESISTANCES_M2K_PER_W } from './constants.js';
import { assertNonNegative } from './errors.js';
import type { BuildingElement, HeatFlowDirection } from './types.js';
import type { SquareMetreKelvinPerWatt } from './units.js';

export interface SurfaceResistances {
  readonly rsiM2KPerW: SquareMetreKelvinPerWatt;
  readonly rseM2KPerW: SquareMetreKelvinPerWatt;
}

/**
 * Tabulated internal and external surface resistances for a direction of heat flow.
 * BS EN ISO 6946, adopted unchanged by BR 443 for UK U-value work. See constants.ts.
 */
export function surfaceResistances(direction: HeatFlowDirection): SurfaceResistances {
  return SURFACE_RESISTANCES_M2K_PER_W[direction];
}

/**
 * Surface resistances for an element, honouring any explicit override. An override is
 * how a caller applies a convention this engine does not model, such as an element
 * adjacent to an unheated space, so it is taken as given rather than second-guessed.
 */
export function resolveSurfaceResistances(element: BuildingElement): SurfaceResistances {
  const tabulated = surfaceResistances(element.heatFlowDirection);
  const rsiOverride = element.rsiOverrideM2KPerW;
  const rseOverride = element.rseOverrideM2KPerW;
  if (rsiOverride !== undefined) {
    assertNonNegative(rsiOverride, 'rsiOverrideM2KPerW');
  }
  if (rseOverride !== undefined) {
    assertNonNegative(rseOverride, 'rseOverrideM2KPerW');
  }
  return {
    rsiM2KPerW: rsiOverride ?? tabulated.rsiM2KPerW,
    rseM2KPerW: rseOverride ?? tabulated.rseM2KPerW,
  };
}
