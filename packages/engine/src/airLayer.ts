import {
  LOW_EMISSIVITY_AIR_LAYER_M2K_PER_W,
  LOW_EMISSIVITY_AIR_LAYER_WALL_TABLE,
  LOW_EMISSIVITY_FULL_THICKNESS_M,
  SLIGHTLY_VENTILATED_MIN_OPENING_AREA_MM2_PER_M,
  UNVENTILATED_AIR_LAYER_TABLE,
  WELL_VENTILATED_MIN_OPENING_AREA_MM2_PER_M,
} from './constants.js';
import { InvalidInputError, assertNonNegative } from './errors.js';
import type { AirLayer, AirLayerEmissivity, HeatFlowDirection } from './types.js';
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
  emissivity: AirLayerEmissivity = 'high',
): AirLayerResistance {
  assertNonNegative(thicknessM, 'thicknessM');
  if (emissivity === 'low') {
    return lowEmissivityAirLayerResistanceM2KPerW(thicknessM, direction, layerId);
  }
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
 * Thermal resistance of an unventilated air layer with a low-emissivity surface facing
 * it, per BR 443 (2019) 4.7.2.
 *
 * At or above 25 mm the value is flat with thickness, which the standard states directly.
 * Below that it falls away, and BR 443 gives figures only for **wall** applications, so
 * only walls are interpolated. A thin low-emissivity cavity in a roof or a floor has no
 * published figure, so it falls back to the ordinary high-emissivity resistance with a
 * warning: that under-states what the foil is doing, which is the safe direction for a
 * U-value, and is honest about the fact that we cannot say how much it is worth.
 */
export function lowEmissivityAirLayerResistanceM2KPerW(
  thicknessM: number,
  direction: HeatFlowDirection,
  layerId?: string,
): AirLayerResistance {
  assertNonNegative(thicknessM, 'thicknessM');

  if (thicknessM >= LOW_EMISSIVITY_FULL_THICKNESS_M) {
    return {
      resistanceM2KPerW: LOW_EMISSIVITY_AIR_LAYER_M2K_PER_W[direction],
      warnings: [],
    };
  }

  if (direction !== 'horizontal') {
    const fallback = unventilatedAirLayerResistanceM2KPerW(thicknessM, direction, layerId, 'high');
    return {
      resistanceM2KPerW: fallback.resistanceM2KPerW,
      warnings: [
        ...fallback.warnings,
        warning(
          'value-needs-verification',
          `A low-emissivity cavity thinner than ` +
            `${(LOW_EMISSIVITY_FULL_THICKNESS_M * 1000).toFixed(0)} mm has no published ` +
            'resistance for this heat flow direction. BR 443 (2019) 4.7.2 tabulates the ' +
            'thin case for walls only. The ordinary high-emissivity resistance has been ' +
            'used instead, which under-states what the reflective surface is worth.',
          layerId,
        ),
      ],
    };
  }

  const table = LOW_EMISSIVITY_AIR_LAYER_WALL_TABLE;
  const first = table[0];
  if (first === undefined) {
    throw new InvalidInputError('LOW_EMISSIVITY_AIR_LAYER_WALL_TABLE', 'table is empty');
  }
  if (thicknessM <= first.thicknessM) {
    // Below the thinnest tabulated gap, scaled down to zero at zero thickness: a cavity
    // of no thickness has no resistance however reflective its faces are. BR 443 notes
    // that "very thin air gaps have very small resistances, therefore making the benefits
    // of low emissivity surface negligible".
    const fraction = first.thicknessM === 0 ? 0 : thicknessM / first.thicknessM;
    return { resistanceM2KPerW: first.horizontal * fraction, warnings: [] };
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
      return {
        resistanceM2KPerW: lower.horizontal + position * (upper.horizontal - lower.horizontal),
        warnings: [],
      };
    }
  }

  return { resistanceM2KPerW: LOW_EMISSIVITY_AIR_LAYER_M2K_PER_W[direction], warnings: [] };
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
