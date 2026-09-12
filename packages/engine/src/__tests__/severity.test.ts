import { describe, expect, it } from 'vitest';
import { CONDITION_RANK, condensationMarkers } from '../condensation/severity.js';
import type { InterstitialAssessment } from '../condensation/iso13788.js';
import { assessInterstitialCondensation } from '../condensation/iso13788.js';
import { calculateTemperatureProfile } from '../temperatureProfile.js';
import type { GlaserNodeResult } from '../condensation/glaser.js';
import type { ProfileNode, ProfileSection, TemperatureProfile } from '../types.js';
import { FILLED_CAVITY_WALL, STANDARD_CONDITIONS, TIMBER_FRAME_WALL } from './fixtures.js';

/**
 * The classification is a mapping from (screen, vapour rate) to a label, so most of it
 * is tested on constructed inputs where both sides are controlled outright. That is the
 * same approach glaser.test.ts takes with hand-specified nodes: it tests this reduction
 * rather than re-testing the heat and vapour calculations feeding it.
 */

// Dew point of the internal air at the fixtures' 20 C / 50 % RH, from
// dewPointFromAirStateC(20, 50) = 9.2690 C.
const DEW_POINT_C = 9.269;

function node(
  kind: ProfileNode['kind'],
  label: string,
  temperatureC: number,
  worstCaseTemperatureC = temperatureC,
): ProfileNode {
  return {
    kind,
    label,
    positionM: 0,
    cumulativeResistanceM2KPerW: 0,
    temperatureC,
    saturationVapourPressurePa: 0,
    dewPointTemperatureC: DEW_POINT_C,
    worstCaseTemperatureC,
    worstCasePathId: 'unbridged',
    isBelowInternalDewPoint: worstCaseTemperatureC <= DEW_POINT_C,
    cumulativeSdM: 0,
  };
}

function profileOf(nodes: readonly ProfileNode[]): TemperatureProfile {
  return {
    section: 'unbridged',
    totalResistanceM2KPerW: 1,
    heatFluxWPerM2: 20,
    sdFollowsUnbridgedConvention: true,
    internalDewPointTemperatureC: DEW_POINT_C,
    nodes,
    warnings: [],
  };
}

/** An assessment carrying nothing but the per-plane rates the classifier reads. */
function assessmentOf(
  rates: readonly number[],
  overrides: { surfaceCondensation?: boolean } = {},
): InterstitialAssessment {
  const glaserNodes: GlaserNodeResult[] = rates.map((rateKgPerM2S, boundaryIndex) => ({
    boundaryIndex,
    label: `b${boundaryIndex}`,
    cumulativeSdM: 0,
    temperatureC: 0,
    saturationVapourPressurePa: 0,
    actualVapourPressurePa: 0,
    condensationOccurs: rateKgPerM2S > 0,
    rateKgPerM2S,
  }));
  const assessment = {
    nodes: glaserNodes,
    internalVapourPressurePa: 1169,
    externalVapourPressurePa: 549,
    condensationPlaneIndices: glaserNodes
      .filter((glaserNode) => glaserNode.rateKgPerM2S > 0)
      .map((glaserNode) => glaserNode.boundaryIndex),
    totalCondensationRateKgPerM2S: rates.filter((rate) => rate > 0).reduce((a, b) => a + b, 0),
    surfaceCondensation: overrides.surfaceCondensation ?? false,
    vapourFlowDirection: 'outward' as const,
    warnings: [],
  };
  const path = { pathId: 'unbridged', label: 'Between studs', assessment };
  return {
    standard: 'BS EN ISO 13788',
    perPath: [path],
    worst: path,
    condenses: assessment.condensationPlaneIndices.length > 0,
    totalCondensationRateKgPerM2S: assessment.totalCondensationRateKgPerM2S,
    warnings: [],
  };
}

describe('separating the screen from the vapour verdict', () => {
  it('calls an interface below the dew point dry when no vapour reaches it', () => {
    // Both interfaces are colder than the 9.26 C dew point, so the screen flags both.
    // The vapour calculation puts no water at either. This is the case that makes the
    // old all-red drawing useless, and both must come back 'below-dew-point'.
    const profile = profileOf([
      node('internal-air', 'Internal air', 20),
      node('internal-surface', 'Internal surface', 19.2),
      node('interface', 'Insulation / Sheathing', 2.0),
      node('external-surface', 'External surface', 0.3),
      node('external-air', 'External air', 0),
    ]);
    const markers = condensationMarkers(profile, assessmentOf([0, 0, 0]));

    expect(markers.markers.map((marker) => marker.condition)).toEqual([
      'dry', // internal surface at 19.2 C, well above the dew point
      'below-dew-point',
      'below-dew-point',
    ]);
    expect(markers.anyCondensation).toBe(false);
    expect(markers.worstCondition).toBe('below-dew-point');
  });

  it('promotes only the plane the vapour calculation actually wets', () => {
    const profile = profileOf([
      node('internal-air', 'Internal air', 20),
      node('internal-surface', 'Internal surface', 19.2),
      node('interface', 'Insulation / Sheathing', 2.0),
      node('external-surface', 'External surface', 0.3),
      node('external-air', 'External air', 0),
    ]);
    // 1e-7 kg/(m2*s) at the middle plane only.
    const markers = condensationMarkers(profile, assessmentOf([0, 1e-7, 0]));

    expect(markers.markers.map((marker) => marker.condition)).toEqual([
      'dry',
      'condensing',
      'below-dew-point',
    ]);
    expect(markers.anyCondensation).toBe(true);
    expect(markers.worstCondition).toBe('condensing');
  });

  it('reports a drying plane as evaporating rather than as condensation', () => {
    const profile = profileOf([
      node('internal-air', 'Internal air', 20),
      node('internal-surface', 'Internal surface', 19.2),
      node('interface', 'Insulation / Sheathing', 2.0),
      node('external-surface', 'External surface', 0.3),
      node('external-air', 'External air', 0),
    ]);
    const markers = condensationMarkers(profile, assessmentOf([0, -4e-8, 0]));

    expect(markers.markers[1]?.condition).toBe('evaporating');
    // A negative rate is not condensation and must not be counted as any.
    expect(markers.anyCondensation).toBe(false);
    expect(markers.totalRatePerDayGPerM2).toBe(0);
    expect(markers.peakRatePerDayGPerM2).toBe(0);
  });
});

describe('the room-side face', () => {
  it('is surface condensation when the screen flags it, whatever the vapour side says', () => {
    // No vapour resistance stands between the internal air and this face, so the
    // temperature criterion is the criterion there.
    const profile = profileOf([
      node('internal-air', 'Internal air', 20),
      node('internal-surface', 'Internal surface', 8.0),
      node('external-surface', 'External surface', 0.3),
      node('external-air', 'External air', 0),
    ]);
    const markers = condensationMarkers(profile, assessmentOf([0, 0]));

    expect(markers.markers[0]?.condition).toBe('surface-condensation');
    // 9.269 - 8.0 = 1.269 K below the dew point.
    expect(markers.markers[0]?.belowDewPointK).toBeCloseTo(1.269, 10);
    expect(markers.worstCondition).toBe('surface-condensation');
  });

  it('is surface condensation when the Glaser run reports it but the screen does not', () => {
    const profile = profileOf([
      node('internal-air', 'Internal air', 20),
      node('internal-surface', 'Internal surface', 19.2),
      node('external-surface', 'External surface', 0.3),
      node('external-air', 'External air', 0),
    ]);
    const markers = condensationMarkers(
      profile,
      assessmentOf([0, 0], { surfaceCondensation: true }),
    );

    expect(markers.markers[0]?.condition).toBe('surface-condensation');
  });

  it('outranks an interstitial plane in the headline', () => {
    expect(CONDITION_RANK['surface-condensation']).toBeGreaterThan(CONDITION_RANK.condensing);
    expect(CONDITION_RANK.condensing).toBeGreaterThan(CONDITION_RANK.evaporating);
    expect(CONDITION_RANK.evaporating).toBeGreaterThan(CONDITION_RANK['below-dew-point']);
    expect(CONDITION_RANK['below-dew-point']).toBeGreaterThan(CONDITION_RANK.dry);
  });
});

describe('amounts', () => {
  it('converts kg/(m2*s) to g/(m2*day) by 1000 * 86400', () => {
    const profile = profileOf([
      node('internal-air', 'Internal air', 20),
      node('internal-surface', 'Internal surface', 19.2),
      node('interface', 'A / B', 2.0),
      node('external-surface', 'External surface', 0.3),
      node('external-air', 'External air', 0),
    ]);
    // 1e-7 kg/(m2*s) * 1000 g/kg * 86400 s/day = 8.64 g/(m2*day).
    const markers = condensationMarkers(profile, assessmentOf([0, 1e-7, 0]));
    expect(markers.markers[1]?.ratePerDayGPerM2).toBeCloseTo(8.64, 10);
    expect(markers.totalRatePerDayGPerM2).toBeCloseTo(8.64, 10);
    expect(markers.peakRatePerDayGPerM2).toBeCloseTo(8.64, 10);
  });

  it('totals every wet plane but peaks at the largest single one', () => {
    const profile = profileOf([
      node('internal-air', 'Internal air', 20),
      node('internal-surface', 'Internal surface', 19.2),
      node('interface', 'A / B', 8.0),
      node('interface', 'B / C', 2.0),
      node('external-surface', 'External surface', 0.3),
      node('external-air', 'External air', 0),
    ]);
    // 1e-7 and 3e-7 kg/(m2*s): total 4e-7 -> 34.56 g/(m2*day), peak 3e-7 -> 25.92.
    const markers = condensationMarkers(profile, assessmentOf([0, 1e-7, 3e-7, 0]));
    expect(markers.totalRatePerDayGPerM2).toBeCloseTo(34.56, 10);
    expect(markers.peakRatePerDayGPerM2).toBeCloseTo(25.92, 10);
  });

  it('measures the shortfall against the worst path, not the displayed one', () => {
    // Displayed 12 C, but some other path runs this interface down to 7 C. The screen
    // judges the worst path, so the shortfall is 9.269 - 7 = 2.269 K, not zero.
    const profile = profileOf([
      node('internal-air', 'Internal air', 20),
      node('internal-surface', 'Internal surface', 19.2),
      node('interface', 'A / B', 12, 7),
      node('external-surface', 'External surface', 0.3),
      node('external-air', 'External air', 0),
    ]);
    const markers = condensationMarkers(profile, assessmentOf([0, 0, 0]));
    expect(markers.markers[1]?.belowDewPointK).toBeCloseTo(2.269, 10);
    expect(markers.markers[1]?.displayedTemperatureC).toBe(12);
    expect(markers.markers[1]?.condition).toBe('below-dew-point');
  });

  it('reports no shortfall for an interface above the dew point', () => {
    const profile = profileOf([
      node('internal-air', 'Internal air', 20),
      node('internal-surface', 'Internal surface', 19.2),
      node('external-surface', 'External surface', 15),
      node('external-air', 'External air', 14),
    ]);
    const markers = condensationMarkers(profile, assessmentOf([0, 0]));
    expect(markers.markers.every((marker) => marker.belowDewPointK === 0)).toBe(true);
    expect(markers.worstCondition).toBe('dry');
  });
});

describe('on real elements', () => {
  it('marks every interface and no air node', () => {
    const profile = calculateTemperatureProfile(
      FILLED_CAVITY_WALL,
      STANDARD_CONDITIONS,
      'unbridged',
    );
    const assessment = assessInterstitialCondensation(FILLED_CAVITY_WALL, STANDARD_CONDITIONS);
    const markers = condensationMarkers(profile, assessment);

    // Four layers -> five boundaries: internal surface, three interfaces, external.
    expect(markers.markers).toHaveLength(5);
    // Boundary indices run 0..4 without gaps, and each marker points back at the node
    // it came from, so a caller can place it without re-deriving the offset.
    markers.markers.forEach((marker, index) => {
      expect(marker.boundaryIndex).toBe(index);
      expect(profile.nodes[marker.nodeIndex]?.label).toBe(marker.label);
      expect(profile.nodes[marker.nodeIndex]?.kind).not.toBe('internal-air');
      expect(profile.nodes[marker.nodeIndex]?.kind).not.toBe('external-air');
    });
  });

  it('gives the same verdict whichever section is on display', () => {
    // CLAUDE.md: display mode must never change a safety verdict. The screen is already
    // worst-case across paths and the vapour side comes from the worst path, so all
    // three displays must agree on every condition and every rate.
    const assessment = assessInterstitialCondensation(TIMBER_FRAME_WALL, STANDARD_CONDITIONS);
    const sections: readonly ProfileSection[] = ['unbridged', 'bridged', 'combined'];
    const perSection = sections.map((section) =>
      condensationMarkers(
        calculateTemperatureProfile(TIMBER_FRAME_WALL, STANDARD_CONDITIONS, section),
        assessment,
      ),
    );

    const [first] = perSection;
    expect(first).toBeDefined();
    for (const markers of perSection) {
      expect(markers.markers.map((marker) => marker.condition)).toEqual(
        first?.markers.map((marker) => marker.condition),
      );
      expect(markers.markers.map((marker) => marker.ratePerDayGPerM2)).toEqual(
        first?.markers.map((marker) => marker.ratePerDayGPerM2),
      );
      expect(markers.worstCondition).toBe(first?.worstCondition);
      expect(markers.pathId).toBe(first?.pathId);
    }
  });
});
