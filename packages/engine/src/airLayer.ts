import {
  SLIGHTLY_VENTILATED_MIN_OPENING_AREA_MM2_PER_M,
  UNVENTILATED_AIR_LAYER_TABLE,
  WELL_VENTILATED_MIN_OPENING_AREA_MM2_PER_M,
} from './constants.js';
import { InvalidInputError, assertNonNegative } from './errors.js';
import type { AirLayer, HeatFlowDirection } from './types.js';
import type { SquareMetreKelvinPerWatt } from './units.js';
import { type Warning, warning } from './warnings.js';

export interface AirLayerResistance {
  readonly resistanceM2KPerW: SquareMetreKelvinPerWatt;
  readonly warnings: readonly Warning[];
}

/**
 * Thermal resistance of an unventilated air layer, interpolated linearly on
 * thickness within the BS EN ISO 6946 table (see UNVENTILATED_AIR_LAYER_TABLE).
 *
 * Outside the tabulated range the value is clamped to the nearest tabulated point
 * and a warning is raised: extrapolating a table that plateaus by design would be
 * meaningless above 300 mm, and below 5 mm the table already reaches down to zero.
 */
export function unventilatedAirLayerResistanceM2KPerW(
  thicknessM: number,
  direction: HeatFlowDirection,
  layerId?: string,
): AirLayerResistance {
  assertNonNegative(thicknessM, 'thicknessM');
  const table = UNVENTILATED_AIR_LAYER_TABLE;
  const first = table[0];
  const last = table[table.length - 1];
  if (first === undefined || last === undefined) {
    throw new InvalidInputError('UNVENTILATED_AIR_LAYER_TABLE', 'table is empty');
  }

  if (thicknessM > last.thicknessM) {
    return {
      resistanceM2KPerW: last[direction],
      warnings: [
        warning(
          'air-layer-thickness-out-of-table',
          `Air layer of ${(thicknessM * 1000).toFixed(0)} mm exceeds the tabulated ` +
            `range (max ${(last.thicknessM * 1000).toFixed(0)} mm); the resistance was ` +
            `clamped to the largest tabulated value.`,
          layerId,
        ),
      ],
    };
  }

  for (let index = 1; index < table.length; index += 1) {
    const lower = table[index - 1];
    const upper = table[index];
    if (lower === undefined || upper === undefined) {
      continue;
    }
    if (thicknessM <= upper.thicknessM) {
      const span = upper.thicknessM - lower.thicknessM;
      const position = span === 0 ? 0 : (thicknessM - lower.thicknessM) / span;
      const resistance = lower[direction] + position * (upper[direction] - lower[direction]);
      return { resistanceM2KPerW: resistance, warnings: [] };
    }
  }

  return { resistanceM2KPerW: last[direction], warnings: [] };
}

/**
 * Which ventilation class an air layer falls into. The class may be stated directly
 * on the layer, or implied by its opening area; where both are given the opening area
 * is checked for consistency and the stated class wins with a warning if they differ.
 */
export function ventilationClassFromOpeningArea(
  openingAreaMm2PerM: number,
): AirLayer['ventilation'] {
  assertNonNegative(openingAreaMm2PerM, 'openingAreaMm2PerM');
  if (openingAreaMm2PerM >= WELL_VENTILATED_MIN_OPENING_AREA_MM2_PER_M) {
    return 'well-ventilated';
  }
  if (openingAreaMm2PerM >= SLIGHTLY_VENTILATED_MIN_OPENING_AREA_MM2_PER_M) {
    return 'slightly-ventilated';
  }
  return 'unventilated';
}

/**
 * Interpolation weight for a slightly ventilated air layer: 0 at the slightly
 * ventilated threshold (treat as unventilated), 1 at the well-ventilated threshold
 * (treat as well ventilated), linear in opening area between the two.
 *
 * Where the opening area is not stated, the midpoint (0.5) is used, which is the
 * only defensible choice given no further information, and a warning is raised.
 *
 * TODO(verify): BS EN ISO 6946's actual treatment of slightly ventilated air layers.
 * This linear interpolation between the two bounding treatments is the approach
 * planned for OpenUValue, but the standard may instead specify taking half the
 * tabulated unventilated resistance with the resistance of the layers outboard of the
 * cavity capped at 0.15 m^2*K/W. Both candidates are recorded in VERIFY.md; whichever
 * the standard specifies must replace this.
 */
export function slightlyVentilatedInterpolationWeight(layer: AirLayer): {
  readonly weight: number;
  readonly warnings: readonly Warning[];
} {
  const openingArea = layer.openingAreaMm2PerM;
  if (openingArea === undefined) {
    return {
      weight: 0.5,
      warnings: [
        warning(
          'slightly-ventilated-interpolated',
          `Air layer "${layer.label}" is slightly ventilated but states no opening ` +
            `area; the midpoint between the unventilated and well-ventilated ` +
            `treatments was used.`,
          layer.id,
        ),
      ],
    };
  }
  assertNonNegative(openingArea, 'openingAreaMm2PerM');
  const span =
    WELL_VENTILATED_MIN_OPENING_AREA_MM2_PER_M - SLIGHTLY_VENTILATED_MIN_OPENING_AREA_MM2_PER_M;
  const raw = (openingArea - SLIGHTLY_VENTILATED_MIN_OPENING_AREA_MM2_PER_M) / span;
  return { weight: Math.min(1, Math.max(0, raw)), warnings: [] };
}
