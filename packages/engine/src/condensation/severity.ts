import type { DegreesCelsius } from '../units.js';
import type { ProfileNode, TemperatureProfile } from '../types.js';
import { type InterstitialAssessment, ratePerDayGPerM2 } from './iso13788.js';

/**
 * Classifies each interface for display, so that a drawing can distinguish the two
 * very different things it currently has only one marker for.
 *
 * `ProfileNode.isBelowInternalDewPoint` is a **screening indicator**: it says an
 * interface is colder than the dew point of the internal air, which is necessary for
 * condensation but not sufficient. Whether vapour actually arrives at saturation
 * depends on the Sd of the layers inboard of it. As types.ts puts it, expect the
 * screen to flag interfaces a proper assessment would clear — "a well-insulated
 * element has most of its thickness below the internal dew point by design".
 *
 * Marking all of those identically is what makes a drawing unreadable: in a good
 * build-up nearly every interface is flagged, so the flag carries no information and
 * the one interface that is actually wet does not stand out. Running the screen and
 * the BS EN ISO 13788 vapour calculation together separates them:
 *
 *   - `'condensing'` — the vapour calculation puts liquid water at this plane, and
 *     quantifies how much. This is a finding, not a warning.
 *   - `'evaporating'` — a plane that holds water is drying at these conditions.
 *     Reported, because seeing where a build-up dries is as useful as seeing where it
 *     wets, and because a negative rate presented as condensation would be a lie.
 *   - `'surface-condensation'` — condensation on the room-side face. Ranked above the
 *     interstitial cases because it is the one the occupants meet: it is the mould
 *     criterion, it is always a defect, and there is no vapour resistance in the way
 *     to clear it.
 *   - `'below-dew-point'` — colder than the internal dew point, but the vapour
 *     calculation finds no condensation here. Expected, and drawn quietly.
 *   - `'dry'` — neither.
 *
 * **This does not depend on the displayed section.** The screen is already worst-case
 * across paths (`ProfileNode.worstCaseTemperatureC`), and the vapour side is read from
 * the assessment's worst path. Both are display-independent, which is what the rule in
 * CLAUDE.md — display mode must never change a safety verdict — requires. The drawing
 * says which path the wet planes belong to when that is not the one on screen.
 */
export type InterfaceCondition =
  | 'surface-condensation'
  | 'condensing'
  | 'evaporating'
  | 'below-dew-point'
  | 'dry';

/** Display prominence, worst first. Used to order and to pick a single headline. */
export const CONDITION_RANK: Readonly<Record<InterfaceCondition, number>> = {
  'surface-condensation': 4,
  condensing: 3,
  evaporating: 2,
  'below-dew-point': 1,
  dry: 0,
};

export interface InterfaceMarker {
  /** 0 is the internal surface; the last index is the external surface. */
  readonly boundaryIndex: number;
  /** Index into `TemperatureProfile.nodes`, so a caller can place it without counting. */
  readonly nodeIndex: number;
  readonly label: string;
  readonly condition: InterfaceCondition;
  /** Temperature on the **displayed** path, for the label beside the marker. */
  readonly displayedTemperatureC: DegreesCelsius;
  /** Coldest temperature at this interface over every path: what the screen judges. */
  readonly worstCaseTemperatureC: DegreesCelsius;
  /**
   * How far the worst-case temperature sits below the internal dew point, in kelvin.
   * Zero where it is at or above it. This is the number that makes "too cold" concrete:
   * a marker 0.2 K under is a different problem from one 6 K under.
   */
  readonly belowDewPointK: number;
  /** Net rate at this plane, kg/(m^2*s). Positive condensing, negative evaporating. */
  readonly rateKgPerM2S: number;
  /** The same rate in the unit a person can picture. Signed, as above. */
  readonly ratePerDayGPerM2: number;
}

export interface CondensationMarkers {
  /** The path the vapour results come from — the worst one, not the displayed one. */
  readonly pathId: string;
  readonly pathLabel: string;
  readonly markers: readonly InterfaceMarker[];
  readonly anyCondensation: boolean;
  /** Sum of the positive rates, g/(m^2*day). */
  readonly totalRatePerDayGPerM2: number;
  /**
   * The largest single positive rate, g/(m^2*day). A drawing that scales a drop by the
   * amount needs one number to normalise against, and it must be the same for every
   * drop or the sizes would not be comparable with each other.
   */
  readonly peakRatePerDayGPerM2: number;
  /** The worst condition present anywhere, for a one-line verdict. */
  readonly worstCondition: InterfaceCondition;
}

/**
 * Interfaces only: the air nodes either side are not part of the element and carry no
 * boundary index in the vapour calculation.
 */
function isInterfaceNode(node: ProfileNode): boolean {
  return node.kind !== 'internal-air' && node.kind !== 'external-air';
}

export function condensationMarkers(
  profile: TemperatureProfile,
  assessment: InterstitialAssessment,
): CondensationMarkers {
  const worst = assessment.worst;
  const glaser = worst.assessment;

  // Rates by boundary index. Every node the construction produced is present, so a
  // missing index means the profile and the assessment disagree about the build-up,
  // which is a caller error rather than something to paper over with a zero.
  const rateByBoundary = new Map<number, number>();
  for (const node of glaser.nodes) {
    rateByBoundary.set(node.boundaryIndex, node.rateKgPerM2S);
  }

  const markers: InterfaceMarker[] = [];
  let boundaryIndex = 0;
  let peakRateKgPerM2S = 0;
  let totalRateKgPerM2S = 0;

  profile.nodes.forEach((node, nodeIndex) => {
    if (!isInterfaceNode(node)) {
      return;
    }
    const thisBoundary = boundaryIndex;
    boundaryIndex += 1;

    const rateKgPerM2S = rateByBoundary.get(thisBoundary) ?? 0;
    const isInternalSurface = node.kind === 'internal-surface';

    let condition: InterfaceCondition;
    if (isInternalSurface && (glaser.surfaceCondensation || node.isBelowInternalDewPoint)) {
      // At the room-side face the screen *is* the criterion — nothing stands between
      // the internal air and the surface to hold vapour back — so either route to it
      // is the same finding.
      condition = 'surface-condensation';
    } else if (rateKgPerM2S > 0) {
      condition = 'condensing';
    } else if (rateKgPerM2S < 0) {
      condition = 'evaporating';
    } else if (node.isBelowInternalDewPoint) {
      condition = 'below-dew-point';
    } else {
      condition = 'dry';
    }

    if (rateKgPerM2S > 0) {
      totalRateKgPerM2S += rateKgPerM2S;
      peakRateKgPerM2S = Math.max(peakRateKgPerM2S, rateKgPerM2S);
    }

    const belowDewPointK = Math.max(0, node.dewPointTemperatureC - node.worstCaseTemperatureC);

    markers.push({
      boundaryIndex: thisBoundary,
      nodeIndex,
      label: node.label,
      condition,
      displayedTemperatureC: node.temperatureC,
      worstCaseTemperatureC: node.worstCaseTemperatureC,
      belowDewPointK,
      rateKgPerM2S,
      ratePerDayGPerM2: ratePerDayGPerM2(rateKgPerM2S),
    });
  });

  let worstCondition: InterfaceCondition = 'dry';
  for (const marker of markers) {
    if (CONDITION_RANK[marker.condition] > CONDITION_RANK[worstCondition]) {
      worstCondition = marker.condition;
    }
  }

  return {
    pathId: worst.pathId,
    pathLabel: worst.label,
    markers,
    anyCondensation: markers.some((marker) => marker.condition === 'condensing'),
    totalRatePerDayGPerM2: ratePerDayGPerM2(totalRateKgPerM2S),
    peakRatePerDayGPerM2: ratePerDayGPerM2(peakRateKgPerM2S),
    worstCondition,
  };
}
