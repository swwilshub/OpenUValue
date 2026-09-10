import { type CalculationVariant, resolveAssembly } from './assembly.js';
import {
  combinedLayerResistancesM2KPerW,
  enumerateSectionPaths,
  lowerLimitTotalResistanceM2KPerW,
  upperLimitTotalResistanceM2KPerW,
} from './inhomogeneous.js';
import { dewPointFromAirStateC, saturationVapourPressurePa } from './psychrometrics.js';
import { vapourDiffusionThicknessSdM } from './resistance.js';
import { calculateUValue } from './uvalue.js';
import type {
  BuildingElement,
  EnvironmentConditions,
  ProfileNode,
  ProfileNodeKind,
  ProfileSection,
  SectionPath,
  TemperatureProfile,
} from './types.js';
import type { DegreesCelsius, Metres, SquareMetreKelvinPerWatt } from './units.js';
import { type Warning, mergeWarnings, warning } from './warnings.js';

/**
 * Steady-state temperature at a boundary, from the fraction of the total resistance
 * lying inboard of it:
 *
 *   theta(b) = theta_i - (R_inboard(b) / RT) * (theta_i - theta_e)
 *
 * which is just Fourier's law in series form, q = (theta_i - theta_e)/RT being
 * constant through the element.
 */
function temperatureAtBoundaryC(
  cumulativeResistanceM2KPerW: SquareMetreKelvinPerWatt,
  totalResistanceM2KPerW: SquareMetreKelvinPerWatt,
  internalAirTemperatureC: DegreesCelsius,
  externalAirTemperatureC: DegreesCelsius,
): DegreesCelsius {
  if (totalResistanceM2KPerW === 0) {
    return externalAirTemperatureC;
  }
  const drop = internalAirTemperatureC - externalAirTemperatureC;
  return internalAirTemperatureC - (cumulativeResistanceM2KPerW / totalResistanceM2KPerW) * drop;
}

/** Cumulative resistances at each boundary of a path: [Rsi, Rsi+R1, ..., Rsi+sum(R)]. */
function cumulativeResistances(
  rsiM2KPerW: SquareMetreKelvinPerWatt,
  layerResistancesM2KPerW: readonly SquareMetreKelvinPerWatt[],
): readonly SquareMetreKelvinPerWatt[] {
  const out: SquareMetreKelvinPerWatt[] = [rsiM2KPerW];
  let running = rsiM2KPerW;
  for (const resistance of layerResistancesM2KPerW) {
    running += resistance;
    out.push(running);
  }
  return out;
}

/**
 * The in-house 'combined' scaling factor of Revision 2.2:
 *
 *   k = (RT - Rsi - Rse) / (R''T - Rsi - Rse)
 *
 * The parallel-combined layer resistances sum to R''T - Rsi - Rse, the isothermal
 * planes lower bound. Scaling them by k makes the drawn profile sum to the reported
 * RT = (R'T + R''T)/2 instead, so the profile and the U-value beside it imply the
 * same heat flux. Surface resistances are deliberately left unscaled: they are not
 * part of the bridging uncertainty. k >= 1 always, and k = 1 exactly when the element
 * is homogeneous.
 *
 * This is an OpenUValue convention, not a method from BS EN ISO 6946, which defines
 * no temperature profile through a bridged element.
 */
export function combinedScalingFactor(
  totalResistanceM2KPerW: SquareMetreKelvinPerWatt,
  lowerLimitM2KPerW: SquareMetreKelvinPerWatt,
  rsiM2KPerW: SquareMetreKelvinPerWatt,
  rseM2KPerW: SquareMetreKelvinPerWatt,
): number {
  const lowerLimitLayersOnly = lowerLimitM2KPerW - rsiM2KPerW - rseM2KPerW;
  if (lowerLimitLayersOnly <= 0) {
    // No material layers (or all of zero resistance): nothing to scale.
    return 1;
  }
  return (totalResistanceM2KPerW - rsiM2KPerW - rseM2KPerW) / lowerLimitLayersOnly;
}

function pickDisplayPath(
  paths: readonly SectionPath[],
  section: ProfileSection,
): SectionPath | undefined {
  if (section === 'bridged') {
    return paths.find((path) => path.isAllBridged && !path.isAllUnbridged) ?? paths[0];
  }
  return paths.find((path) => path.isAllUnbridged) ?? paths[0];
}

/** The variant carrying the most weight, which is the one the profile is drawn for. */
function dominantVariant(variants: readonly CalculationVariant[]): CalculationVariant {
  let best = variants[0];
  if (best === undefined) {
    throw new Error('unreachable: resolveAssembly always returns at least one variant');
  }
  for (const variant of variants) {
    if (variant.weight > best.weight) {
      best = variant;
    }
  }
  return best;
}

/**
 * Steady-state temperature profile through the element, plus a condensation-risk
 * verdict at every boundary.
 *
 * The `section` argument selects **only what is drawn**. The verdict is always taken
 * as the worst (coldest) result at each boundary over every section path, because the
 * conservative path differs along the element: the bridging path carries the higher
 * heat flux, so it is colder at the internal surface but *warmer* through the outer
 * layers, including the sheathing where interstitial condensation usually forms.
 * Picking one path up front would therefore under-report risk somewhere.
 *
 * Sd values follow the unbridged path throughout, including in 'combined' mode:
 * area-weighting mu*d across a stud layer has no clean physical meaning. This is part
 * of the same in-house convention as the scaling factor above.
 */
export function calculateTemperatureProfile(
  element: BuildingElement,
  conditions: EnvironmentConditions,
  section: ProfileSection = 'combined',
): TemperatureProfile {
  const assembly = resolveAssembly(element);
  const variant = dominantVariant(assembly.variants);
  const uValue = calculateUValue(element);
  const warnings: Warning[] = [];

  if (assembly.variants.length > 1) {
    warnings.push(
      warning(
        'slightly-ventilated-interpolated',
        `This build-up resolves into ${assembly.variants.length} weighted calculation ` +
          `variants because of a slightly ventilated air layer. The profile is drawn ` +
          `for the dominant variant (weight ${variant.weight.toFixed(2)}), so it does ` +
          `not correspond exactly to the interpolated U-value.`,
      ),
    );
  }

  const includedLayers = element.layers.slice(0, variant.includedLayerCount);
  const paths = enumerateSectionPaths(element, variant);

  // Resistances used for the *displayed* line.
  let displayLayerResistances: readonly SquareMetreKelvinPerWatt[];
  let displayTotalResistance: SquareMetreKelvinPerWatt;
  let scalingFactor: number | undefined;

  if (section === 'combined') {
    // The variant's own limits, so the identity Rsi + k*sum + Rse === RT holds
    // exactly for the profile that is drawn.
    const upperLimit = upperLimitTotalResistanceM2KPerW(element, variant);
    const lowerLimit = lowerLimitTotalResistanceM2KPerW(element, variant);
    const variantTotal = (upperLimit + lowerLimit) / 2;
    scalingFactor = combinedScalingFactor(
      variantTotal,
      lowerLimit,
      variant.rsiM2KPerW,
      variant.rseM2KPerW,
    );
    displayLayerResistances = combinedLayerResistancesM2KPerW(element, variant).map(
      (resistance) => resistance * (scalingFactor ?? 1),
    );
    displayTotalResistance = variantTotal;
    if (scalingFactor !== 1) {
      warnings.push(
        warning(
          'in-house-convention',
          `The combined profile is an OpenUValue convention: BS EN ISO 6946 defines no ` +
            `temperature profile through a bridged element. The parallel-combined layer ` +
            `resistances are scaled by k = ${scalingFactor.toFixed(4)} so that the ` +
            `profile sums to the reported total resistance rather than to the lower ` +
            `limit R''T. Sd values follow the unbridged path.`,
        ),
      );
    }
  } else {
    const path = pickDisplayPath(paths, section);
    if (path === undefined) {
      throw new Error('unreachable: enumerateSectionPaths always returns at least one path');
    }
    if (section === 'bridged' && !path.isAllBridged) {
      warnings.push(
        warning(
          'in-house-convention',
          `This element has no bridged layers, so the bridged profile is identical to ` +
            `the unbridged one.`,
        ),
      );
    }
    displayLayerResistances = path.layerResistancesM2KPerW;
    displayTotalResistance = path.totalResistanceM2KPerW;
  }

  const { internalAirTemperatureC, externalAirTemperatureC } = conditions;
  const temperatureDrop = internalAirTemperatureC - externalAirTemperatureC;
  const heatFlux = displayTotalResistance === 0 ? 0 : temperatureDrop / displayTotalResistance;
  const internalDewPoint = dewPointFromAirStateC(
    internalAirTemperatureC,
    conditions.internalRelativeHumidityPercent,
  );

  const displayCumulative = cumulativeResistances(variant.rsiM2KPerW, displayLayerResistances);

  // Worst case at each boundary over every section path (R2.4). Boundaries align
  // across paths because bridging happens *within* a layer, so all paths share the
  // same layer boundaries.
  const pathCumulatives = paths.map((path) => ({
    id: path.id,
    cumulative: cumulativeResistances(variant.rsiM2KPerW, path.layerResistancesM2KPerW),
    totalResistanceM2KPerW: path.totalResistanceM2KPerW,
  }));

  function worstCaseAtBoundary(boundaryIndex: number): {
    temperatureC: DegreesCelsius;
    pathId: string;
  } {
    let worstTemperature = Number.POSITIVE_INFINITY;
    let worstPathId = 'unbridged';
    for (const path of pathCumulatives) {
      const cumulative = path.cumulative[boundaryIndex];
      if (cumulative === undefined) {
        continue;
      }
      const temperature = temperatureAtBoundaryC(
        cumulative,
        path.totalResistanceM2KPerW,
        internalAirTemperatureC,
        externalAirTemperatureC,
      );
      if (temperature < worstTemperature) {
        worstTemperature = temperature;
        worstPathId = path.id;
      }
    }
    return { temperatureC: worstTemperature, pathId: worstPathId };
  }

  // Cumulative Sd on the unbridged path (R2.5), one entry per boundary.
  const cumulativeSd: Metres[] = [0];
  let runningSd = 0;
  for (const layer of includedLayers) {
    runningSd += vapourDiffusionThicknessSdM(layer).sdM;
    cumulativeSd.push(runningSd);
  }

  const nodes: ProfileNode[] = [];

  function makeNode(
    kind: ProfileNodeKind,
    label: string,
    positionM: Metres,
    cumulativeResistanceM2KPerW: SquareMetreKelvinPerWatt,
    temperatureC: DegreesCelsius,
    boundaryIndex: number | null,
    sdM: Metres,
  ): ProfileNode {
    const worst =
      boundaryIndex === null
        ? { temperatureC, pathId: 'n/a' }
        : worstCaseAtBoundary(boundaryIndex);
    return {
      kind,
      label,
      positionM,
      cumulativeResistanceM2KPerW,
      temperatureC,
      saturationVapourPressurePa: saturationVapourPressurePa(temperatureC),
      dewPointTemperatureC: internalDewPoint,
      worstCaseTemperatureC: worst.temperatureC,
      worstCasePathId: worst.pathId,
      isBelowInternalDewPoint: worst.temperatureC <= internalDewPoint,
      cumulativeSdM: sdM,
    };
  }

  const totalThicknessM = includedLayers.reduce((total, layer) => total + layer.thicknessM, 0);

  nodes.push(
    makeNode('internal-air', 'Internal air', 0, 0, internalAirTemperatureC, null, 0),
  );

  let positionM = 0;
  for (let boundaryIndex = 0; boundaryIndex < displayCumulative.length; boundaryIndex += 1) {
    const cumulative = displayCumulative[boundaryIndex];
    if (cumulative === undefined) {
      continue;
    }
    const temperature = temperatureAtBoundaryC(
      cumulative,
      displayTotalResistance,
      internalAirTemperatureC,
      externalAirTemperatureC,
    );
    const isFirst = boundaryIndex === 0;
    const isLast = boundaryIndex === displayCumulative.length - 1;
    const kind: ProfileNodeKind = isFirst
      ? 'internal-surface'
      : isLast
        ? 'external-surface'
        : 'interface';
    const label = isFirst
      ? 'Internal surface'
      : isLast
        ? 'External surface'
        : `${includedLayers[boundaryIndex - 1]?.label ?? '?'} / ${
            includedLayers[boundaryIndex]?.label ?? '?'
          }`;
    if (boundaryIndex > 0) {
      positionM += includedLayers[boundaryIndex - 1]?.thicknessM ?? 0;
    }
    nodes.push(
      makeNode(
        kind,
        label,
        positionM,
        cumulative,
        temperature,
        boundaryIndex,
        cumulativeSd[boundaryIndex] ?? runningSd,
      ),
    );
  }

  nodes.push(
    makeNode(
      'external-air',
      variant.usesStillAirOnOuterFace ? 'Ventilated cavity air' : 'External air',
      totalThicknessM,
      displayTotalResistance,
      externalAirTemperatureC,
      null,
      runningSd,
    ),
  );

  return {
    section,
    totalResistanceM2KPerW: displayTotalResistance,
    heatFluxWPerM2: heatFlux,
    ...(scalingFactor === undefined ? {} : { combinedScalingFactor: scalingFactor }),
    sdFollowsUnbridgedConvention: true,
    internalDewPointTemperatureC: internalDewPoint,
    nodes,
    warnings: mergeWarnings(uValue.warnings, warnings),
  };
}
