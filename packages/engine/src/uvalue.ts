import { type CalculationVariant, resolveAssembly } from './assembly.js';
import {
  COMBINED_METHOD_MAX_ERROR_PERCENT,
  COMBINED_METHOD_MAX_UPPER_TO_LOWER_RATIO,
} from './constants.js';
import {
  hasInhomogeneousLayer,
  lowerLimitTotalResistanceM2KPerW,
  metalBridgedLayerIds,
  upperLimitTotalResistanceM2KPerW,
} from './inhomogeneous.js';
import { layerSectionResistances, vapourDiffusionThicknessSdM } from './resistance.js';
import type {
  BuildingElement,
  LayerResistance,
  OutOfScopeReason,
  UValueResult,
} from './types.js';
import type { SquareMetreKelvinPerWatt } from './units.js';
import { type Warning, mergeWarnings, warning } from './warnings.js';

/** Weighted mean of a quantity across the element's calculation variants. */
function weightedSum(
  variants: readonly CalculationVariant[],
  quantity: (variant: CalculationVariant) => number,
): number {
  return variants.reduce((total, variant) => total + variant.weight * quantity(variant), 0);
}

/**
 * BS EN ISO 6946 total thermal resistance and thermal transmittance.
 *
 *   RT = (R'T + R''T) / 2        and       U = 1 / RT
 *
 * For a homogeneous element the two limits coincide, RT is the plain series sum, and
 * the error estimate is exactly zero.
 *
 * The combined method has an applicability limit: R'T/R''T must not exceed 1.5, and
 * the method does not apply where metal penetrates the insulation. When either is
 * breached, `uValueWPerM2K` is null and the figure is confined to
 * `provisionalUValueWPerM2K`, so a caller cannot present an invalid U-value without
 * having handled the null.
 */
export function calculateUValue(element: BuildingElement): UValueResult {
  const assembly = resolveAssembly(element);
  const variants = assembly.variants;
  const direction = element.heatFlowDirection;

  const upperLimit = weightedSum(variants, (variant) =>
    upperLimitTotalResistanceM2KPerW(element, variant),
  );
  const lowerLimit = weightedSum(variants, (variant) =>
    lowerLimitTotalResistanceM2KPerW(element, variant),
  );
  const totalResistance = (upperLimit + lowerLimit) / 2;

  const isInhomogeneous = variants.some((variant) => hasInhomogeneousLayer(element, variant));
  // For a homogeneous element the limits are equal; guard the division anyway so a
  // degenerate zero-resistance element reports a ratio of 1 rather than NaN.
  const ratio = lowerLimit === 0 ? 1 : upperLimit / lowerLimit;
  const errorPercent =
    totalResistance === 0 ? 0 : ((upperLimit - lowerLimit) / (2 * totalResistance)) * 100;

  const outOfScopeReasons: OutOfScopeReason[] = [];
  const warnings: Warning[] = [];

  if (ratio > COMBINED_METHOD_MAX_UPPER_TO_LOWER_RATIO) {
    outOfScopeReasons.push('upper-lower-ratio-exceeds-limit');
    warnings.push(
      warning(
        'combined-method-ratio-exceeds-limit',
        `The ratio of the upper to the lower limit of total thermal resistance is ` +
          `${ratio.toFixed(3)}, above the limit of ` +
          `${COMBINED_METHOD_MAX_UPPER_TO_LOWER_RATIO} (an error estimate of ` +
          `${errorPercent.toFixed(1)} % against a limit of ` +
          `${COMBINED_METHOD_MAX_ERROR_PERCENT} %). The BS EN ISO 6946 combined method ` +
          `does not apply to this build-up; it needs numerical calculation to ` +
          `BS EN ISO 10211. No U-value is reported.`,
      ),
    );
  }

  for (const layerId of variants.flatMap((variant) => metalBridgedLayerIds(element, variant))) {
    if (!outOfScopeReasons.includes('metal-bridging')) {
      outOfScopeReasons.push('metal-bridging');
    }
    warnings.push(
      warning(
        'metal-bridging-out-of-scope',
        `This layer is bridged by a highly conductive (metallic) material. ` +
          `BS EN ISO 6946 excludes such elements from the combined method; they need ` +
          `BS EN ISO 10211, or a point thermal bridge correction for discrete ` +
          `fasteners. No U-value is reported.`,
        layerId,
      ),
    );
  }

  const provisionalUValue = totalResistance === 0 ? Number.POSITIVE_INFINITY : 1 / totalResistance;

  const layers: LayerResistance[] = element.layers.map((layer, index) => {
    const sections = layerSectionResistances(layer, direction);
    const sd = vapourDiffusionThicknessSdM(layer);
    const base = {
      layerId: layer.id,
      label: layer.label,
      thicknessM: layer.thicknessM,
      resistanceM2KPerW: sections.unbridgedM2KPerW,
      combinedResistanceM2KPerW: sections.unbridgedM2KPerW,
      vapourDiffusionThicknessSdM: sd.sdM,
      includedInCalculation: index < assembly.includedLayerCount,
    };
    const bridged = sections.bridgedM2KPerW;
    if (bridged === undefined) {
      return base;
    }
    const fraction = sections.bridgingAreaFraction;
    const conductance =
      (1 - fraction) / sections.unbridgedM2KPerW + fraction / (bridged === 0 ? Infinity : bridged);
    return {
      ...base,
      bridgingResistanceM2KPerW: bridged,
      combinedResistanceM2KPerW: conductance === 0 ? 0 : 1 / conductance,
    };
  });

  const layerWarnings = element.layers
    .slice(0, assembly.includedLayerCount)
    .flatMap((layer) => layerSectionResistances(layer, direction).warnings);

  return {
    rsiM2KPerW: variants[0]?.rsiM2KPerW ?? 0,
    rseM2KPerW: weightedSum(variants, (variant) => variant.rseM2KPerW),
    layers,
    method: isInhomogeneous ? 'iso6946-combined' : 'homogeneous',
    totalResistanceUpperLimitM2KPerW: upperLimit,
    totalResistanceLowerLimitM2KPerW: lowerLimit,
    totalResistanceM2KPerW: totalResistance,
    upperToLowerLimitRatio: ratio,
    maxRelativeErrorPercent: errorPercent,
    uValueWPerM2K: outOfScopeReasons.length === 0 ? provisionalUValue : null,
    provisionalUValueWPerM2K: provisionalUValue,
    outOfScopeReasons,
    warnings: mergeWarnings(assembly.warnings, layerWarnings, warnings),
  };
}

/** Series sum of the layer resistances only, without the surface resistances. */
export function layersOnlyResistanceM2KPerW(result: UValueResult): SquareMetreKelvinPerWatt {
  return result.totalResistanceM2KPerW - result.rsiM2KPerW - result.rseM2KPerW;
}
