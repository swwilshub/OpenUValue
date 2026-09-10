import { unventilatedAirLayerResistanceM2KPerW } from './airLayer.js';
import { assertFraction, assertNonNegative, assertPositive } from './errors.js';
import type { HeatFlowDirection, Layer } from './types.js';
import type { Metres, SquareMetreKelvinPerWatt, WattsPerMetreKelvin } from './units.js';
import { type Warning, mergeWarnings } from './warnings.js';

/**
 * Thermal resistance of a homogeneous solid layer, BS EN ISO 6946: R = d / lambda.
 * A zero-thickness layer has zero resistance; lambda must be strictly positive,
 * since a zero or negative conductivity is a caller error rather than a limit case.
 */
export function solidLayerResistanceM2KPerW(
  thicknessM: Metres,
  lambdaWPerMK: WattsPerMetreKelvin,
): SquareMetreKelvinPerWatt {
  assertNonNegative(thicknessM, 'thicknessM');
  assertPositive(lambdaWPerMK, 'lambdaWPerMK');
  return thicknessM / lambdaWPerMK;
}

export interface LayerSectionResistances {
  /** The unbridged section, or the whole layer when it is homogeneous. */
  readonly unbridgedM2KPerW: SquareMetreKelvinPerWatt;
  /** The bridging section, when the layer is inhomogeneous. */
  readonly bridgedM2KPerW?: SquareMetreKelvinPerWatt;
  readonly bridgingAreaFraction: number;
  readonly warnings: readonly Warning[];
}

/**
 * Resistances of the one or two sections of a single layer. An air layer is not
 * treated as bridgeable in this model: a stud crossing a cavity divides it into
 * separate cavities, which is a different build-up rather than a bridged air layer.
 */
export function layerSectionResistances(
  layer: Layer,
  direction: HeatFlowDirection,
): LayerSectionResistances {
  switch (layer.kind) {
    case 'solid': {
      const unbridged = solidLayerResistanceM2KPerW(layer.thicknessM, layer.material.lambdaWPerMK);
      const bridging = layer.bridging;
      if (bridging === undefined) {
        return { unbridgedM2KPerW: unbridged, bridgingAreaFraction: 0, warnings: [] };
      }
      assertFraction(bridging.areaFraction, `layer[${layer.id}].bridging.areaFraction`);
      return {
        unbridgedM2KPerW: unbridged,
        bridgedM2KPerW: solidLayerResistanceM2KPerW(
          layer.thicknessM,
          bridging.material.lambdaWPerMK,
        ),
        bridgingAreaFraction: bridging.areaFraction,
        warnings: [],
      };
    }
    case 'air': {
      // A slightly ventilated layer takes the unventilated table value here; its
      // ventilation is resolved at assembly level (see assembly.ts). A well
      // ventilated layer is disregarded there and never reaches this function.
      const air = unventilatedAirLayerResistanceM2KPerW(layer.thicknessM, direction, layer.id);
      return {
        unbridgedM2KPerW: air.resistanceM2KPerW,
        bridgingAreaFraction: 0,
        warnings: air.warnings,
      };
    }
    case 'fixed-resistance': {
      assertNonNegative(layer.resistanceM2KPerW, `layer[${layer.id}].resistanceM2KPerW`);
      return {
        unbridgedM2KPerW: layer.resistanceM2KPerW,
        bridgingAreaFraction: 0,
        warnings: [],
      };
    }
  }
}

/**
 * Equivalent air layer thickness Sd = mu * d, metres, on the unbridged section.
 *
 * Air has mu = 1 by definition, so an air layer's Sd is its thickness. A layer whose
 * mu is unknown contributes zero rather than a guessed value, and the caller is told
 * so it can flag the vapour result as incomplete.
 */
export function vapourDiffusionThicknessSdM(layer: Layer): {
  readonly sdM: Metres;
  readonly muIsKnown: boolean;
} {
  switch (layer.kind) {
    case 'solid': {
      const mu = layer.material.vapourResistanceFactorMu;
      if (mu === undefined) {
        return { sdM: 0, muIsKnown: false };
      }
      assertNonNegative(mu, `layer[${layer.id}].material.vapourResistanceFactorMu`);
      return { sdM: mu * layer.thicknessM, muIsKnown: true };
    }
    case 'air':
      // BS EN ISO 13788 / BS EN ISO 10456: mu of still air is 1 by definition.
      return { sdM: layer.thicknessM, muIsKnown: true };
    case 'fixed-resistance':
      return { sdM: 0, muIsKnown: false };
  }
}

/** Sum the warnings of every layer in a stack, for callers that only need the list. */
export function collectLayerWarnings(
  layers: readonly Layer[],
  direction: HeatFlowDirection,
): readonly Warning[] {
  return mergeWarnings(...layers.map((layer) => layerSectionResistances(layer, direction).warnings));
}
