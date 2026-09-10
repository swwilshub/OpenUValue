import { slightlyVentilatedInterpolationWeight } from './airLayer.js';
import { resolveSurfaceResistances } from './surfaceResistance.js';
import type { BuildingElement, Layer } from './types.js';
import type { SquareMetreKelvinPerWatt } from './units.js';
import { type Warning, mergeWarnings, warning } from './warnings.js';

/**
 * One weighted variant of the element to be calculated. Ventilated air layers make a
 * single build-up resolve into more than one calculation:
 *
 *  - A **well ventilated** air layer is disregarded along with every layer outboard
 *    of it, and Rse is replaced by Rsi (still air on both faces). BS EN ISO 6946.
 *  - A **slightly ventilated** air layer sits between that treatment and the
 *    unventilated one, so the element resolves into two weighted variants whose
 *    resistances are interpolated on opening area. This interpolation is an
 *    OpenUValue decision - see slightlyVentilatedInterpolationWeight for the
 *    TODO(verify) on what the standard actually specifies.
 */
export interface CalculationVariant {
  /** Interpolation weight; weights across an element's variants sum to 1. */
  readonly weight: number;
  /** Layers 0..includedLayerCount-1 take part; the rest are disregarded. */
  readonly includedLayerCount: number;
  readonly rsiM2KPerW: SquareMetreKelvinPerWatt;
  readonly rseM2KPerW: SquareMetreKelvinPerWatt;
  /** True when Rse has been replaced by Rsi because of a ventilated cavity. */
  readonly usesStillAirOnOuterFace: boolean;
}

export interface ResolvedAssembly {
  readonly variants: readonly CalculationVariant[];
  /** Layers taking part in at least one variant, i.e. those that carry a temperature. */
  readonly includedLayerCount: number;
  readonly warnings: readonly Warning[];
}

function firstVentilatedIndex(layers: readonly Layer[], startIndex: number): number {
  for (let index = startIndex; index < layers.length; index += 1) {
    const layer = layers[index];
    if (layer !== undefined && layer.kind === 'air' && layer.ventilation !== 'unventilated') {
      return index;
    }
  }
  return -1;
}

/**
 * Resolve an element into weighted calculation variants, working outwards from the
 * innermost ventilated cavity. Recursion handles the case of more than one ventilated
 * cavity: the "treat as unventilated" side of a slightly ventilated layer may still
 * contain a further ventilated cavity outboard of it.
 */
export function resolveAssembly(element: BuildingElement): ResolvedAssembly {
  const { rsiM2KPerW, rseM2KPerW } = resolveSurfaceResistances(element);
  const layers = element.layers;

  function resolve(startIndex: number): ResolvedAssembly {
    const ventilatedIndex = firstVentilatedIndex(layers, startIndex);
    if (ventilatedIndex === -1) {
      return {
        variants: [
          {
            weight: 1,
            includedLayerCount: layers.length,
            rsiM2KPerW,
            rseM2KPerW,
            usesStillAirOnOuterFace: false,
          },
        ],
        includedLayerCount: layers.length,
        warnings: [],
      };
    }

    const ventilatedLayer = layers[ventilatedIndex];
    if (ventilatedLayer === undefined || ventilatedLayer.kind !== 'air') {
      throw new Error('unreachable: firstVentilatedIndex returned a non-air layer');
    }

    // The well-ventilated treatment: stop at the cavity, still air on the outer face.
    const wellVentilatedVariant: CalculationVariant = {
      weight: 1,
      includedLayerCount: ventilatedIndex,
      rsiM2KPerW,
      // BS EN ISO 6946: for a well ventilated air layer, use an external surface
      // resistance equal to the internal (still air) value for the same direction.
      rseM2KPerW: rsiM2KPerW,
      usesStillAirOnOuterFace: true,
    };

    if (ventilatedLayer.ventilation === 'well-ventilated') {
      return {
        variants: [wellVentilatedVariant],
        includedLayerCount: ventilatedIndex,
        warnings: [
          warning(
            'well-ventilated-outer-layers-ignored',
            `Air layer "${ventilatedLayer.label}" is well ventilated, so it and the ` +
              `${layers.length - ventilatedIndex - 1} layer(s) outboard of it are ` +
              `disregarded, and the external surface resistance is replaced by the ` +
              `still-air internal value (BS EN ISO 6946).`,
            ventilatedLayer.id,
          ),
        ],
      };
    }

    // Slightly ventilated: interpolate between the two bounding treatments.
    const { weight, warnings: weightWarnings } =
      slightlyVentilatedInterpolationWeight(ventilatedLayer);
    const unventilatedSide = resolve(ventilatedIndex + 1);
    const variants: CalculationVariant[] = [
      ...unventilatedSide.variants.map((variant) => ({
        ...variant,
        weight: variant.weight * (1 - weight),
      })),
      { ...wellVentilatedVariant, weight },
    ];
    return {
      variants: variants.filter((variant) => variant.weight > 0),
      includedLayerCount: Math.max(unventilatedSide.includedLayerCount, ventilatedIndex),
      warnings: mergeWarnings(unventilatedSide.warnings, weightWarnings, [
        warning(
          'slightly-ventilated-interpolated',
          `Air layer "${ventilatedLayer.label}" is slightly ventilated; the total ` +
            `thermal resistance was interpolated between the unventilated and well ` +
            `ventilated treatments with a weight of ${weight.toFixed(2)} on the well ` +
            `ventilated side.`,
          ventilatedLayer.id,
        ),
      ]),
    };
  }

  return resolve(0);
}
