import { vapourPressurePa } from '../psychrometrics.js';
import { calculateTemperatureProfile } from '../temperatureProfile.js';
import type { BuildingElement, EnvironmentConditions, ProfileSection } from '../types.js';
import { type Warning, mergeWarnings, warning } from '../warnings.js';
import { type GlaserAssessment, type GlaserNode, assessGlaser } from './glaser.js';

/**
 * BS EN ISO 13788 interstitial condensation, applied at one set of conditions.
 *
 * This is the assessment that answers the question Phase 1 could not: an interface
 * being colder than the internal dew point is necessary for condensation but not
 * sufficient, because vapour also has to reach it. Here the vapour side is calculated,
 * so a build-up whose temperature check flags an interface can be *cleared* on the
 * grounds that a vapour control layer keeps the moisture away from it.
 *
 * **What this is not.** BS EN ISO 13788's full assessment runs the construction for
 * each of the twelve months of a design year, accumulates the condensate month by
 * month, and passes the element only if everything that condenses in winter evaporates
 * again within the year. That needs monthly climate data — mean external temperature
 * and humidity for the location — which OpenUValue does not ship and will not invent.
 * What is calculated here is a single set of conditions, the ones on screen, which is
 * the same construction and the same equations applied to one period rather than
 * twelve. It tells you whether the build-up condenses **at these conditions** and how
 * fast; it does not tell you whether the element dries out over a year.
 * See ROADMAP.md.
 */

export interface PathAssessment {
  readonly pathId: string;
  readonly label: string;
  readonly assessment: GlaserAssessment;
}

export interface InterstitialAssessment {
  readonly standard: string;
  /** One assessment per section path assessed; see the note on worst-case below. */
  readonly perPath: readonly PathAssessment[];
  /**
   * The path that condenses fastest, or where none condenses, the one that comes
   * closest to it. Reported rather than a per-interface merge because the Glaser
   * profile is a single connected construction: mixing interfaces from different
   * paths would produce a line that is not a vapour pressure profile of anything.
   */
  readonly worst: PathAssessment;
  readonly condenses: boolean;
  /** Total rate on the worst path, kg/(m^2*s). */
  readonly totalCondensationRateKgPerM2S: number;
  readonly warnings: readonly Warning[];
}

/**
 * Turn a temperature profile into the nodes the construction works on. Glaser runs
 * between the two surfaces: the air nodes either side carry the driving pressures and
 * are not part of the element, and surface vapour resistances are neglected.
 */
function nodesFromProfile(
  element: BuildingElement,
  conditions: EnvironmentConditions,
  section: ProfileSection,
): { readonly nodes: readonly GlaserNode[]; readonly warnings: readonly Warning[] } {
  const profile = calculateTemperatureProfile(element, conditions, section);
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
  return { nodes, warnings: profile.warnings };
}

/**
 * Run the construction on every section path that is a real 1D path through the
 * element, and report the worst.
 *
 * Only 'unbridged' and 'bridged' are assessed, not the in-house 'combined' profile.
 * Combined is a display convention with no single vapour path behind it — its Sd
 * values already follow the unbridged path by convention — so running a condensation
 * verdict on it would give a number that belongs to no actual slice of the wall.
 */
export function assessInterstitialCondensation(
  element: BuildingElement,
  conditions: EnvironmentConditions,
): InterstitialAssessment {
  const internalVapourPressurePa = vapourPressurePa(
    conditions.internalAirTemperatureC,
    conditions.internalRelativeHumidityPercent,
  );
  const externalVapourPressurePa = vapourPressurePa(
    conditions.externalAirTemperatureC,
    conditions.externalRelativeHumidityPercent,
  );

  const hasBridging = element.layers.some(
    (layer) =>
      (layer.kind === 'solid' || layer.kind === 'air') &&
      layer.bridging !== undefined &&
      layer.bridging.areaFraction > 0 &&
      layer.bridging.areaFraction < 1,
  );
  const sections: readonly ProfileSection[] = hasBridging
    ? ['unbridged', 'bridged']
    : ['unbridged'];

  const collected: Warning[] = [];
  const perPath: PathAssessment[] = sections.map((section) => {
    const { nodes, warnings } = nodesFromProfile(element, conditions, section);
    collected.push(...warnings);
    const assessment = assessGlaser({
      nodes,
      internalVapourPressurePa,
      externalVapourPressurePa,
    });
    collected.push(...assessment.warnings);
    return {
      pathId: section,
      label: section === 'bridged' ? 'Through the bridging member' : 'Through the layers',
      assessment,
    };
  });

  /*
   * Sd through a stud is not the same as Sd through the insulation beside it — timber
   * at mu 50 is far tighter than mineral wool at mu 1 — but the engine's Sd figures
   * come from each layer's own material, so the bridged path here reuses them. The
   * temperatures are the bridged path's own.
   * TODO(verify): whether BS EN ISO 13788 expects the vapour path through a bridging
   * member to be assessed with that member's own mu, and if so, thread the bridging
   * material's mu through SectionPath.
   */
  if (hasBridging) {
    collected.push(
      warning(
        'value-needs-verification',
        'The bridged path is assessed with the temperatures of a slice through the ' +
          'bridging member but the vapour resistances of the layers beside it. A ' +
          'timber stud is much tighter to vapour than the insulation it interrupts, ' +
          'so treat the bridged path as indicative.',
      ),
    );
  }

  const worst =
    [...perPath].sort(
      (a, b) =>
        b.assessment.totalCondensationRateKgPerM2S -
        a.assessment.totalCondensationRateKgPerM2S,
    )[0] ?? perPath[0];

  if (worst === undefined) {
    throw new Error('unreachable: at least one section path is always assessed');
  }

  return {
    standard: 'BS EN ISO 13788 (Glaser construction, at the stated conditions)',
    perPath,
    worst,
    condenses: worst.assessment.condensationPlaneIndices.length > 0,
    totalCondensationRateKgPerM2S: worst.assessment.totalCondensationRateKgPerM2S,
    warnings: mergeWarnings(collected),
  };
}

/** Condensation rate in the unit a person can picture: grams per m^2 per day. */
export function ratePerDayGPerM2(rateKgPerM2S: number): number {
  return rateKgPerM2S * 1000 * 60 * 60 * 24;
}
