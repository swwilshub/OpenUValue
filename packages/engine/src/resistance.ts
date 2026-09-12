import { unventilatedAirLayerResistanceM2KPerW } from './airLayer.js';
import { assertFraction, assertNonNegative, assertPositive } from './errors.js';
import type { HeatFlowDirection, Layer } from './types.js';
import type { Metres, SquareMetreKelvinPerWatt, WattsPerMetreKelvin } from './units.js';
import { type Warning, mergeWarnings, warning } from './warnings.js';

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
 * BR 443 (2006) 4.8.1: an airspace counts as an air layer while "the thickness (in the
 * heat flow direction) is less than one-tenth of its width or height". Below that it is
 * an air void, which the standard resolves differently, and this model does not yet
 * implement - VERIFY.md row V27.
 */
export const AIR_LAYER_MAX_THICKNESS_TO_WIDTH_RATIO = 0.1;

/**
 * Checks a bridged cavity against the test above, and against the one combination that
 * does nothing.
 *
 * The width test runs only when the caller supplies the clear span between members: a
 * guessed spacing would produce a warning about a wall nobody described. Note that
 * BR 443's wording is "its width **or** height", and a batten or stud usually runs the
 * full storey height, so a pocket that fails on width may still pass on height. The
 * warning therefore reports what failed rather than declaring the layer wrong.
 */
function bridgedAirLayerWarnings(
  layerId: string,
  label: string,
  thicknessM: Metres,
  bridging: { readonly areaFraction: number; readonly clearWidthM?: Metres },
): readonly Warning[] {
  const clearWidthM = bridging.clearWidthM;
  if (clearWidthM === undefined || clearWidthM <= 0) {
    return [];
  }
  if (thicknessM < clearWidthM * AIR_LAYER_MAX_THICKNESS_TO_WIDTH_RATIO) {
    return [];
  }
  return [
    warning(
      'value-needs-verification',
      `Cavity "${label}" is ${(thicknessM * 1000).toFixed(0)} mm deep with only ` +
        `${(clearWidthM * 1000).toFixed(0)} mm clear between the members crossing it. ` +
        `BR 443 (2006) 4.8.1 treats an airspace as an air layer while its thickness is ` +
        `less than a tenth of its width or height, and this fails on width. It may ` +
        `still pass on height, since a member running the full storey height leaves a ` +
        `tall pocket — but if it does not, the space is an air void and takes a ` +
        `different resistance from the one used here.`,
      layerId,
    ),
  ];
}

/**
 * Resistances of the one or two sections of a single layer.
 *
 * An air layer **is** bridgeable. This used to be refused on the grounds that a member
 * crossing a cavity divides it into separate cavities rather than bridging one, but
 * BR 443 (2006) 4.8.1 settles it the other way: "An airspace for which the thickness
 * (in the heat flow direction) is less than one-tenth of its width or height is also
 * treated as an air layer; examples include the space between the battens in a
 * dry-lined wall". The pockets between the members are air layers in their own right,
 * so the layer is inhomogeneous in the ordinary way and the combined method resolves
 * it. Where that test fails the pocket is an air void instead, which is a different
 * calculation - see VERIFY.md row V27 - and a warning says so rather than the number
 * quietly being the wrong one.
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
      const air = unventilatedAirLayerResistanceM2KPerW(
        layer.thicknessM,
        direction,
        layer.id,
        layer.emissivity ?? 'high',
      );
      const bridging = layer.bridging;
      if (bridging === undefined) {
        return {
          unbridgedM2KPerW: air.resistanceM2KPerW,
          bridgingAreaFraction: 0,
          warnings: air.warnings,
        };
      }
      assertFraction(bridging.areaFraction, `layer[${layer.id}].bridging.areaFraction`);
      return {
        unbridgedM2KPerW: air.resistanceM2KPerW,
        // The member spans the cavity, so its section is a solid layer of the cavity's
        // own thickness. A dab or a batten thinner than the cavity is a different
        // build-up, not a thinner bridge: the plasterboard would have nothing to bear on.
        bridgedM2KPerW: solidLayerResistanceM2KPerW(
          layer.thicknessM,
          bridging.material.lambdaWPerMK,
        ),
        bridgingAreaFraction: bridging.areaFraction,
        warnings: [
          ...air.warnings,
          ...bridgedAirLayerWarnings(layer.id, layer.label, layer.thicknessM, bridging),
        ],
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
