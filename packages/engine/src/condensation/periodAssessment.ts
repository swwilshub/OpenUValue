import { saturationVapourPressurePa, vapourPressurePa } from '../psychrometrics.js';
import { calculateTemperatureProfile } from '../temperatureProfile.js';
import type { BuildingElement, EnvironmentConditions } from '../types.js';
import type { DegreesCelsius, Metres } from '../units.js';
import { type Warning, warning } from '../warnings.js';
import { assessGlaser } from './glaser.js';
import type { GlaserNode } from './glaser.js';

/**
 * Condensation accumulated over a wetting period, and whether a drying period gets rid
 * of it again.
 *
 * The single-condition assessment in iso13788.ts answers "does this condense right
 * now, and how fast". That is not the question a construction is judged on. What
 * matters is whether the water that collects over a winter leaves again over a summer,
 * because a build-up that gains a little each year and never gives it back will fail
 * eventually however small the rate looks.
 *
 * The method here is the fixed-period form: hold one set of conditions for a wetting
 * period, accumulate at the rate the Glaser construction gives; then hold a second set
 * for a drying period, with the wet planes pinned to saturation so they can evaporate,
 * and see what is left. Both periods and both sets of conditions are **inputs**, not
 * constants baked in here.
 *
 * That last point is deliberate. BS EN ISO 13788 evaluates twelve months of real
 * climate; DIN 4108-3 uses fixed periods and fixed boundary conditions instead. This
 * function implements the shape of the fixed-period method and takes the numbers from
 * the caller, because OpenUValue cannot at present attribute a particular pair of
 * periods, a particular pair of boundary conditions, or a particular limit on the
 * accumulated amount to a clause of either standard. Supplying them as arguments keeps
 * the arithmetic honest and puts the citation where it belongs: with whoever sets them.
 * See VERIFY.md.
 */

export interface AssessmentPeriod {
  readonly label: string;
  readonly days: number;
  readonly conditions: EnvironmentConditions;
}

export interface PlaneAccumulation {
  readonly boundaryIndex: number;
  readonly label: string;
  readonly cumulativeSdM: Metres;
  readonly temperatureC: DegreesCelsius;
  /** Water gained over the wetting period, kg/m^2. */
  readonly accumulatedKgPerM2: number;
  /** Water still present at the end of the drying period, kg/m^2. */
  readonly remainingKgPerM2: number;
  /**
   * Days of the drying period needed to clear this plane, or undefined where it never
   * clears because nothing evaporates from it.
   */
  readonly daysToDry?: number;
}

export interface PeriodAssessment {
  readonly wettingPeriod: AssessmentPeriod;
  readonly dryingPeriod: AssessmentPeriod;
  readonly planes: readonly PlaneAccumulation[];
  /** Total gained over the wetting period, kg/m^2. */
  readonly totalAccumulatedKgPerM2: number;
  /** Total still present at the end of the drying period, kg/m^2. */
  readonly totalRemainingKgPerM2: number;
  /** True where every plane clears within the drying period. */
  readonly driesOut: boolean;
  readonly warnings: readonly Warning[];
}

const SECONDS_PER_DAY = 60 * 60 * 24;

/**
 * Nodes for the construction, at one set of conditions. The Sd values do not depend on
 * the conditions, but the temperatures do, so this is rebuilt per period.
 */
function nodesAt(
  element: BuildingElement,
  conditions: EnvironmentConditions,
): readonly GlaserNode[] {
  const profile = calculateTemperatureProfile(element, conditions, 'unbridged');
  const nodes: GlaserNode[] = [];
  let boundaryIndex = 0;
  for (const node of profile.nodes) {
    if (node.kind === 'internal-air' || node.kind === 'external-air') {
      continue;
    }
    nodes.push({
      boundaryIndex,
      label: node.label,
      cumulativeSdM: node.cumulativeSdM,
      temperatureC: node.temperatureC,
    });
    boundaryIndex += 1;
  }
  return nodes;
}

export function assessOverPeriods(
  element: BuildingElement,
  wettingPeriod: AssessmentPeriod,
  dryingPeriod: AssessmentPeriod,
): PeriodAssessment {
  const warnings: Warning[] = [];

  /* ------------------------------------------------------------- wetting ---- */

  const wettingNodes = nodesAt(element, wettingPeriod.conditions);
  const wetting = assessGlaser({
    nodes: wettingNodes,
    internalVapourPressurePa: vapourPressurePa(
      wettingPeriod.conditions.internalAirTemperatureC,
      wettingPeriod.conditions.internalRelativeHumidityPercent,
    ),
    externalVapourPressurePa: vapourPressurePa(
      wettingPeriod.conditions.externalAirTemperatureC,
      wettingPeriod.conditions.externalRelativeHumidityPercent,
    ),
  });
  warnings.push(...wetting.warnings);

  // With the conditions held constant the construction does not move, so the rate is
  // constant and the amount is simply rate x duration. It is the fixed conditions that
  // make this true; a month-by-month assessment would have to re-run it each step.
  const wettingSeconds = wettingPeriod.days * SECONDS_PER_DAY;
  const accumulated = new Map<number, number>();
  for (const node of wetting.nodes) {
    if (node.rateKgPerM2S > 0) {
      accumulated.set(node.boundaryIndex, node.rateKgPerM2S * wettingSeconds);
    }
  }

  /* -------------------------------------------------------------- drying ---- */

  const dryingNodes = nodesAt(element, dryingPeriod.conditions);
  const wetIndices = [...accumulated.keys()];
  const drying = assessGlaser({
    nodes: dryingNodes,
    internalVapourPressurePa: vapourPressurePa(
      dryingPeriod.conditions.internalAirTemperatureC,
      dryingPeriod.conditions.internalRelativeHumidityPercent,
    ),
    externalVapourPressurePa: vapourPressurePa(
      dryingPeriod.conditions.externalAirTemperatureC,
      dryingPeriod.conditions.externalRelativeHumidityPercent,
    ),
    wetBoundaryIndices: wetIndices,
  });
  warnings.push(...drying.warnings);

  const dryingSeconds = dryingPeriod.days * SECONDS_PER_DAY;
  const planes: PlaneAccumulation[] = [];
  for (const index of wetIndices) {
    const gained = accumulated.get(index) ?? 0;
    const dryingNode = drying.nodes[index];
    const wettingNode = wetting.nodes[index];
    /*
     * A negative rate is evaporation; a positive one means this plane keeps wetting
     * even in the drying period, which happens whenever the "drying" conditions still
     * drive vapour outwards. Both cases are the same arithmetic - the net rate over the
     * period, applied to what the plane already held - and taking only the evaporating
     * half of it would report a plane that is still filling as though it had merely
     * failed to empty.
     */
    const dryingRateKgPerM2S = dryingNode?.rateKgPerM2S ?? 0;
    const evaporationRate = -dryingRateKgPerM2S;
    const remaining = Math.max(0, gained + dryingRateKgPerM2S * dryingSeconds);
    const daysToDry =
      evaporationRate > 0 ? gained / evaporationRate / SECONDS_PER_DAY : undefined;
    planes.push({
      boundaryIndex: index,
      label: wettingNode?.label ?? dryingNode?.label ?? `Interface ${index}`,
      cumulativeSdM: wettingNode?.cumulativeSdM ?? 0,
      temperatureC: wettingNode?.temperatureC ?? 0,
      accumulatedKgPerM2: gained,
      remainingKgPerM2: remaining,
      ...(daysToDry === undefined ? {} : { daysToDry }),
    });
  }

  const totalRemaining = planes.reduce((total, plane) => total + plane.remainingKgPerM2, 0);
  if (planes.some((plane) => plane.daysToDry === undefined && plane.accumulatedKgPerM2 > 0)) {
    warnings.push(
      warning(
        'value-needs-verification',
        'At least one interface gains water in the wetting period and loses none in ' +
          'the drying period, so it never clears under these conditions. Check that ' +
          'the drying period conditions are the ones you intend.',
      ),
    );
  }

  return {
    wettingPeriod,
    dryingPeriod,
    planes,
    totalAccumulatedKgPerM2: planes.reduce(
      (total, plane) => total + plane.accumulatedKgPerM2,
      0,
    ),
    totalRemainingKgPerM2: totalRemaining,
    driesOut: totalRemaining <= 0,
    warnings,
  };
}

/* ----------------------------------------------------------- surface mould ---- */

/**
 * Relative humidity of the air right at the internal surface.
 *
 * The room air carries a fixed amount of water vapour. Against a cold surface that
 * same vapour pressure is a larger fraction of what the air can hold there, so the
 * humidity at the surface is higher than the humidity in the room. That is why mould
 * grows in corners and behind furniture long before the room feels damp.
 */
export function surfaceRelativeHumidityPercent(
  internalAirTemperatureC: DegreesCelsius,
  internalRelativeHumidityPercent: number,
  surfaceTemperatureC: DegreesCelsius,
): number {
  const actual = vapourPressurePa(internalAirTemperatureC, internalRelativeHumidityPercent);
  const saturationAtSurface = saturationVapourPressurePa(surfaceTemperatureC);
  if (saturationAtSurface <= 0) {
    return 100;
  }
  return Math.min(100, (actual / saturationAtSurface) * 100);
}

/**
 * Surface humidity above which mould growth is treated as a risk, percent.
 *
 * Mould germinates well below the 100 % needed for liquid condensation, so the surface
 * criterion is a humidity limit rather than a dew point one.
 *
 * TODO(verify): the threshold and its clause. BS EN ISO 13788 is understood to set a
 * critical surface humidity of 80 % for mould, and to express the requirement as a
 * temperature factor f_Rsi derived from it; BS 5250 and BRE IP 1/06 are understood to
 * give a UK f_Rsi of 0.75 for dwellings. Neither the 80 % nor the 0.75 has been
 * checked against a printed copy, and f_Rsi is not implemented here at all.
 */
export const MOULD_CRITICAL_SURFACE_HUMIDITY_PERCENT = 80;
