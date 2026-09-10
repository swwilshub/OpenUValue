import { METAL_DETECTION_MIN_LAMBDA_W_PER_MK } from './constants.js';
import { InvalidInputError } from './errors.js';
import { layerSectionResistances } from './resistance.js';
import type { CalculationVariant } from './assembly.js';
import type { BuildingElement, HeatFlowDirection, Layer, SectionPath } from './types.js';
import type { Fraction, SquareMetreKelvinPerWatt } from './units.js';

/** One section of a layer as seen by the combined method. */
export interface LayerSection {
  readonly areaFraction: Fraction;
  readonly resistanceM2KPerW: SquareMetreKelvinPerWatt;
  readonly isBridging: boolean;
}

/**
 * Refuse to enumerate an absurd number of paths. Every inhomogeneous layer doubles
 * the count, so this caps the element at 12 bridged layers, far beyond any real
 * build-up, and turns a pathological input into a clear error rather than a hang.
 */
const MAX_SECTION_PATHS = 4096;

/**
 * The one or two sections of a layer, with their area fractions. An area fraction of
 * exactly 0 or 1 collapses to a single homogeneous section: a "0 % bridged" layer is
 * not inhomogeneous, and a "100 % bridged" layer is simply made of the bridging
 * material. Collapsing here means the combined method is never invoked for an element
 * that is not genuinely inhomogeneous, so its error estimate stays exactly zero.
 */
export function layerSections(layer: Layer, direction: HeatFlowDirection): readonly LayerSection[] {
  const sections = layerSectionResistances(layer, direction);
  const bridged = sections.bridgedM2KPerW;
  const fraction = sections.bridgingAreaFraction;
  if (bridged === undefined || fraction <= 0) {
    return [{ areaFraction: 1, resistanceM2KPerW: sections.unbridgedM2KPerW, isBridging: false }];
  }
  if (fraction >= 1) {
    return [{ areaFraction: 1, resistanceM2KPerW: bridged, isBridging: true }];
  }
  return [
    { areaFraction: 1 - fraction, resistanceM2KPerW: sections.unbridgedM2KPerW, isBridging: false },
    { areaFraction: fraction, resistanceM2KPerW: bridged, isBridging: true },
  ];
}

/**
 * Area-weighted parallel combination of the sections of one layer, as used by the
 * BS EN ISO 6946 lower limit (the isothermal planes assumption):
 *
 *   1 / R_layer = sum over sections a of ( f_a / R_a )
 *
 * A section of zero resistance short-circuits the layer, so the combination is zero.
 */
export function parallelResistanceM2KPerW(
  sections: readonly { readonly areaFraction: Fraction; readonly resistanceM2KPerW: number }[],
): SquareMetreKelvinPerWatt {
  let conductanceSum = 0;
  for (const section of sections) {
    if (section.areaFraction <= 0) {
      continue;
    }
    if (section.resistanceM2KPerW === 0) {
      return 0;
    }
    conductanceSum += section.areaFraction / section.resistanceM2KPerW;
  }
  return conductanceSum === 0 ? 0 : 1 / conductanceSum;
}

/**
 * Every 1D path through the element, one per combination of layer sections. For n
 * inhomogeneous layers there are 2^n paths, whose area fractions are the products of
 * the chosen sections' fractions and therefore sum to 1.
 *
 * Used twice: by the upper limit below, and by the condensation assessment, which
 * takes the worst result at each interface over all of these paths.
 */
export function enumerateSectionPaths(
  element: BuildingElement,
  variant: CalculationVariant,
): readonly SectionPath[] {
  const direction = element.heatFlowDirection;
  const includedLayers = element.layers.slice(0, variant.includedLayerCount);
  const perLayerSections = includedLayers.map((layer) => layerSections(layer, direction));

  const inhomogeneousCount = perLayerSections.filter((sections) => sections.length > 1).length;
  if (2 ** inhomogeneousCount > MAX_SECTION_PATHS) {
    throw new InvalidInputError(
      'layers',
      `${inhomogeneousCount} inhomogeneous layers would require ${2 ** inhomogeneousCount} ` +
        `section paths, above the limit of ${MAX_SECTION_PATHS}`,
    );
  }

  let paths: {
    resistances: SquareMetreKelvinPerWatt[];
    areaFraction: Fraction;
    bridgingChoices: boolean[];
  }[] = [{ resistances: [], areaFraction: 1, bridgingChoices: [] }];

  for (const sections of perLayerSections) {
    const next: typeof paths = [];
    for (const path of paths) {
      for (const section of sections) {
        next.push({
          resistances: [...path.resistances, section.resistanceM2KPerW],
          areaFraction: path.areaFraction * section.areaFraction,
          bridgingChoices:
            sections.length > 1
              ? [...path.bridgingChoices, section.isBridging]
              : path.bridgingChoices,
        });
      }
    }
    paths = next;
  }

  return paths.map((path) => {
    const isAllUnbridged = path.bridgingChoices.every((isBridging) => !isBridging);
    const isAllBridged = path.bridgingChoices.every((isBridging) => isBridging);
    const id =
      path.bridgingChoices.length === 0
        ? 'unbridged'
        : isAllUnbridged
          ? 'unbridged'
          : isAllBridged
            ? 'bridged'
            : `mixed:${path.bridgingChoices.map((isBridging) => (isBridging ? '1' : '0')).join('')}`;
    const label =
      id === 'unbridged'
        ? 'Unbridged section'
        : id === 'bridged'
          ? 'Bridging section'
          : 'Mixed section';
    return {
      id,
      label,
      areaFraction: path.areaFraction,
      isAllUnbridged,
      isAllBridged,
      layerResistancesM2KPerW: path.resistances,
      totalResistanceM2KPerW:
        variant.rsiM2KPerW +
        path.resistances.reduce((total, resistance) => total + resistance, 0) +
        variant.rseM2KPerW,
    };
  });
}

/**
 * R'T, the upper limit of total thermal resistance. BS EN ISO 6946 combined method:
 *
 *   1 / R'T = sum over paths j of ( f_j / R_Tj )
 *
 * where R_Tj is the total resistance of path j including both surface resistances.
 * This is the "no lateral heat flow" assumption: each path conducts independently.
 */
export function upperLimitTotalResistanceM2KPerW(
  element: BuildingElement,
  variant: CalculationVariant,
): SquareMetreKelvinPerWatt {
  const paths = enumerateSectionPaths(element, variant);
  return parallelResistanceM2KPerW(
    paths.map((path) => ({
      areaFraction: path.areaFraction,
      resistanceM2KPerW: path.totalResistanceM2KPerW,
    })),
  );
}

/**
 * R''T, the lower limit of total thermal resistance. BS EN ISO 6946 combined method:
 * each inhomogeneous layer is first reduced to a single equivalent resistance by
 * parallel combination, then the layers are added in series with the surface
 * resistances. This is the "isothermal planes" assumption: lateral heat flow within
 * each layer is unrestricted.
 */
export function lowerLimitTotalResistanceM2KPerW(
  element: BuildingElement,
  variant: CalculationVariant,
): SquareMetreKelvinPerWatt {
  const direction = element.heatFlowDirection;
  const includedLayers = element.layers.slice(0, variant.includedLayerCount);
  const layerTotal = includedLayers.reduce(
    (total, layer) => total + parallelResistanceM2KPerW(layerSections(layer, direction)),
    0,
  );
  return variant.rsiM2KPerW + layerTotal + variant.rseM2KPerW;
}

/**
 * Per-layer parallel-combined resistances, in element order. These are the layer
 * resistances that sum (with the surface resistances) to R''T, and the basis of the
 * in-house 'combined' temperature profile once scaled - see temperatureProfile.ts.
 */
export function combinedLayerResistancesM2KPerW(
  element: BuildingElement,
  variant: CalculationVariant,
): readonly SquareMetreKelvinPerWatt[] {
  const direction = element.heatFlowDirection;
  return element.layers
    .slice(0, variant.includedLayerCount)
    .map((layer) => parallelResistanceM2KPerW(layerSections(layer, direction)));
}

/** True when the element has at least one genuinely inhomogeneous layer. */
export function hasInhomogeneousLayer(
  element: BuildingElement,
  variant: CalculationVariant,
): boolean {
  const direction = element.heatFlowDirection;
  return element.layers
    .slice(0, variant.includedLayerCount)
    .some((layer) => layerSections(layer, direction).length > 1);
}

/**
 * Detect metal in an inhomogeneous layer, which BS EN ISO 6946 excludes from the
 * combined method. The lambda threshold is our own heuristic, not a figure from the
 * standard - see METAL_DETECTION_MIN_LAMBDA_W_PER_MK.
 */
export function metalBridgedLayerIds(
  element: BuildingElement,
  variant: CalculationVariant,
): readonly string[] {
  const ids: string[] = [];
  for (const layer of element.layers.slice(0, variant.includedLayerCount)) {
    if (layer.kind !== 'solid') {
      continue;
    }
    const bridging = layer.bridging;
    if (bridging === undefined || bridging.areaFraction <= 0) {
      continue;
    }
    const isMetal =
      bridging.material.lambdaWPerMK >= METAL_DETECTION_MIN_LAMBDA_W_PER_MK ||
      layer.material.lambdaWPerMK >= METAL_DETECTION_MIN_LAMBDA_W_PER_MK;
    if (isMetal) {
      ids.push(layer.id);
    }
  }
  return ids;
}
