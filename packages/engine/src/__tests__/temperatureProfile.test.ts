import { describe, expect, it } from 'vitest';
import { calculateTemperatureProfile, combinedScalingFactor } from '../temperatureProfile.js';
import { calculateUValue } from '../uvalue.js';
import { dewPointFromAirStateC } from '../psychrometrics.js';
import type { ProfileNode, ProfileSection } from '../types.js';
import {
  MINERAL_WOOL,
  SINGLE_LAYER_CONCRETE_WALL,
  SOFTWOOD,
  STANDARD_CONDITIONS,
  TIMBER_FRAME_WALL,
  element,
  solid,
} from './fixtures.js';

const nodeAt = (nodes: readonly ProfileNode[], index: number): ProfileNode => {
  const node = nodes[index];
  if (node === undefined) {
    throw new Error(`no node at index ${index}`);
  }
  return node;
};

describe('calculateTemperatureProfile, homogeneous element', () => {
  it('emits one node per boundary plus both air nodes', () => {
    // For n layers there are n+1 boundaries in the solid stack (internal surface,
    // n-1 interfaces between layers, external surface), plus the two air nodes,
    // giving n+3 nodes in total.
    const profile = calculateTemperatureProfile(TIMBER_FRAME_WALL, STANDARD_CONDITIONS);
    expect(profile.nodes).toHaveLength(TIMBER_FRAME_WALL.layers.length + 3);
    expect(profile.nodes.map((node) => node.kind)).toEqual([
      'internal-air',
      'internal-surface',
      'interface',
      'interface',
      'external-surface',
      'external-air',
    ]);
  });

  it('computes every temperature in a single-layer wall by hand', () => {
    // 100 mm concrete, lambda 1.15, horizontal, 20 C inside and 0 C outside.
    //   R  = 0.100 / 1.15 = 0.0869565217
    //   RT = 0.13 + 0.0869565217 + 0.04 = 0.2569565217 m^2*K/W
    //   q  = (20 - 0) / 0.2569565217 = 20 * 3.8917090 = 77.8341794 W/m^2
    //
    //   theta_si = 20 - q * Rsi = 20 - 77.8341794 * 0.13 = 20 - 10.1184433 = 9.8815567 C
    //   theta_se =  0 + q * Rse =  0 + 77.8341794 * 0.04 =                   3.1133672 C
    //
    // Cross-check on theta_se via the resistance fraction:
    //   (Rsi + R)/RT = 0.2169565217 / 0.2569565217 = 0.8443316
    //   theta_se = 20 - 0.8443316 * 20 = 3.113368 C, agreeing to rounding.
    const profile = calculateTemperatureProfile(
      SINGLE_LAYER_CONCRETE_WALL,
      STANDARD_CONDITIONS,
    );
    expect(profile.heatFluxWPerM2).toBeCloseTo(77.8341794, 6);
    expect(nodeAt(profile.nodes, 0).temperatureC).toBe(20);
    expect(nodeAt(profile.nodes, 1).temperatureC).toBeCloseTo(9.8815567, 6);
    expect(nodeAt(profile.nodes, 2).temperatureC).toBeCloseTo(3.1133672, 6);
    expect(nodeAt(profile.nodes, 3).temperatureC).toBe(0);
  });

  it('places nodes at their true positions through the thickness', () => {
    const profile = calculateTemperatureProfile(TIMBER_FRAME_WALL, STANDARD_CONDITIONS);
    // 12.5 mm plasterboard, then 140 mm insulation, then 9 mm OSB. Compared with a
    // tolerance because summing 0.0125 + 0.14 + 0.009 in binary floating point does
    // not land on 0.1615 exactly.
    const expectedPositions = [0, 0, 0.0125, 0.1525, 0.1615, 0.1615];
    for (const [index, expected] of expectedPositions.entries()) {
      expect(nodeAt(profile.nodes, index).positionM).toBeCloseTo(expected, 12);
    }
  });

  it('falls monotonically from inside to outside when it is warmer inside', () => {
    const profile = calculateTemperatureProfile(TIMBER_FRAME_WALL, STANDARD_CONDITIONS);
    const temperatures = profile.nodes.map((node) => node.temperatureC);
    for (let index = 1; index < temperatures.length; index += 1) {
      expect(nodeAt(profile.nodes, index).temperatureC).toBeLessThanOrEqual(
        nodeAt(profile.nodes, index - 1).temperatureC + 1e-12,
      );
    }
  });

  it('screens every node against the internal air dew point', () => {
    // 20 C / 50 % RH inside gives a dew point of 9.26903 C (see the psychrometrics
    // tests), which sits just below the internal surface temperature of 9.88156 C in
    // the bare concrete wall - so that wall is marginally clear of surface
    // condensation, by 0.61 K, and every colder node beyond it is at risk.
    const dewPoint = dewPointFromAirStateC(20, 50);
    const profile = calculateTemperatureProfile(SINGLE_LAYER_CONCRETE_WALL, STANDARD_CONDITIONS);
    expect(profile.internalDewPointTemperatureC).toBeCloseTo(9.26903, 4);
    expect(nodeAt(profile.nodes, 1).temperatureC).toBeGreaterThan(dewPoint);
    expect(nodeAt(profile.nodes, 1).isBelowInternalDewPoint).toBe(false);
    expect(nodeAt(profile.nodes, 2).isBelowInternalDewPoint).toBe(true);
    // At the internal surface this is the real surface-condensation criterion. Deeper
    // in, it is a screening indicator only: it says nothing about whether vapour
    // actually reaches that interface at saturation, which needs the Sd distribution
    // and a BS EN ISO 13788 or Glaser calculation (Phase 3).
    //
    // This fixture's concrete states no mu, so its Sd is reported as zero rather than
    // guessed - which is exactly why the flag above cannot stand as a condensation
    // verdict on its own.
    expect(nodeAt(profile.nodes, 2).cumulativeSdM).toBe(0);
  });
});

describe('the bridging path is not conservative everywhere (Revision 2.1)', () => {
  it('runs colder at the internal surface but warmer at the sheathing', () => {
    // Timber-frame wall, 20 C inside and 0 C outside. The two paths in isolation:
    //
    //   unbridged: R_T1 = 4.2892308,  q1 = 20 * 0.2331420 =  4.6628407 W/m^2
    //   bridging:  R_T2 = 1.3661538,  q2 = 20 * 0.7319820 = 14.6396390 W/m^2
    //
    // Internal surface, theta = 20 - q * Rsi:
    //   unbridged: 20 -  4.6628407 * 0.13 = 20 - 0.6061693 = 19.3938307 C
    //   bridging:  20 - 14.6396390 * 0.13 = 20 - 1.9031531 = 18.0968469 C
    //   -> the stud path is 1.30 K COLDER here, because it conducts more heat.
    //
    // Sheathing inner face (the usual condensation plane), theta = 0 + q * (Rse + R_osb)
    // with Rse + R_osb = 0.04 + 0.0692308 = 0.1092308:
    //   unbridged:  4.6628407 * 0.1092308 = 0.5093257 C
    //   bridging:  14.6396390 * 0.1092308 = 1.5990990 C
    //   -> the stud path is 1.09 K WARMER here.
    //
    // Same element, opposite inequalities. The crossover is why a single chosen path
    // cannot be the conservative one: the stud path carries more heat, which cools the
    // inner face and warms everything beyond the insulation.
    const unbridged = calculateTemperatureProfile(
      TIMBER_FRAME_WALL,
      STANDARD_CONDITIONS,
      'unbridged',
    );
    const bridged = calculateTemperatureProfile(
      TIMBER_FRAME_WALL,
      STANDARD_CONDITIONS,
      'bridged',
    );
    expect(nodeAt(unbridged.nodes, 1).temperatureC).toBeCloseTo(19.3938307, 6);
    expect(nodeAt(bridged.nodes, 1).temperatureC).toBeCloseTo(18.0968469, 6);
    expect(nodeAt(bridged.nodes, 1).temperatureC).toBeLessThan(
      nodeAt(unbridged.nodes, 1).temperatureC,
    );

    // Node 3 is the insulation / OSB interface, i.e. the sheathing inner face.
    expect(nodeAt(unbridged.nodes, 3).temperatureC).toBeCloseTo(0.5093257, 6);
    expect(nodeAt(bridged.nodes, 3).temperatureC).toBeCloseTo(1.5990990, 6);
    expect(nodeAt(bridged.nodes, 3).temperatureC).toBeGreaterThan(
      nodeAt(unbridged.nodes, 3).temperatureC,
    );

    // Hence the worst case at the sheathing comes from the UNBRIDGED path, which is
    // exactly what a 'bridged' default would have under-reported.
    expect(nodeAt(bridged.nodes, 3).worstCasePathId).toBe('unbridged');
    expect(nodeAt(bridged.nodes, 3).worstCaseTemperatureC).toBeCloseTo(0.5093257, 6);
  });
});

describe('the combined profile sums to the reported RT (Revision 2.2)', () => {
  it('scales the material layers so Rsi + k*sum(R) + Rse === RT', () => {
    // Timber-frame wall. From the combined-method working:
    //   R''T = 3.1318704,  RT = 3.1894804,  Rsi + Rse = 0.17
    //
    // The parallel-combined layer resistances are
    //   0.05 + 2.8426396 + 0.0692308 = 2.9618704
    // which is R''T - 0.17 exactly: summing them unscaled would draw the ISOTHERMAL
    // PLANES LOWER BOUND, not the reported RT. That is the bug this test pins.
    //
    //   k = (RT - Rsi - Rse) / (R''T - Rsi - Rse)
    //     = (3.1894804 - 0.17) / (3.1318704 - 0.17)
    //     = 3.0194804 / 2.9618704
    //     = 1.0194505
    //
    // Scaled: 2.9618704 * 1.0194505 = 3.0194804 = RT - 0.17, so
    //   Rsi + k*sum + Rse = 0.13 + 3.0194804 + 0.04 = 3.1894804 = RT, exactly.
    const uValue = calculateUValue(TIMBER_FRAME_WALL);
    const profile = calculateTemperatureProfile(TIMBER_FRAME_WALL, STANDARD_CONDITIONS, 'combined');

    expect(profile.combinedScalingFactor).toBeCloseTo(1.0194505, 6);
    expect(profile.totalResistanceM2KPerW).toBeCloseTo(uValue.totalResistanceM2KPerW, 12);

    // The last boundary's cumulative resistance is Rsi + sum(scaled layers); adding
    // Rse must land on RT to within floating-point noise.
    const externalSurface = nodeAt(profile.nodes, profile.nodes.length - 2);
    expect(externalSurface.cumulativeResistanceM2KPerW + uValue.rseM2KPerW).toBeCloseTo(
      uValue.totalResistanceM2KPerW,
      12,
    );

    // And the heat flux implied by the drawn profile matches the reported U-value:
    //   q = dT / RT = 20 / 3.1894804 = 6.2706 W/m^2, and q * RT = dT.
    expect(profile.heatFluxWPerM2 * profile.totalResistanceM2KPerW).toBeCloseTo(20, 10);
    expect(profile.heatFluxWPerM2).toBeCloseTo(20 * (uValue.uValueWPerM2K ?? 0), 10);
  });

  it('never scales below 1, and is exactly 1 for a homogeneous element', () => {
    // k = (RT - Rsi - Rse)/(R''T - Rsi - Rse) and RT >= R''T always, so k >= 1. For a
    // homogeneous element the limits coincide, so k is exactly 1 and the profile is
    // the plain series calculation.
    const homogeneous = calculateTemperatureProfile(
      SINGLE_LAYER_CONCRETE_WALL,
      STANDARD_CONDITIONS,
      'combined',
    );
    expect(homogeneous.combinedScalingFactor).toBe(1);
    const bridgedProfile = calculateTemperatureProfile(
      TIMBER_FRAME_WALL,
      STANDARD_CONDITIONS,
      'combined',
    );
    expect(bridgedProfile.combinedScalingFactor ?? 0).toBeGreaterThan(1);
  });

  it('does not divide by zero when there are no material layers', () => {
    // Surfaces only: R''T - Rsi - Rse = 0, so there is nothing to scale and k is 1.
    expect(combinedScalingFactor(0.17, 0.17, 0.13, 0.04)).toBe(1);
    const bare = element([]);
    const profile = calculateTemperatureProfile(bare, STANDARD_CONDITIONS, 'combined');
    expect(profile.combinedScalingFactor).toBe(1);
    expect(Number.isFinite(profile.heatFluxWPerM2)).toBe(true);
  });
});

describe('the display mode never changes a verdict (Revision 2.4)', () => {
  it('reports identical worst-case temperatures and screening flags in all modes', () => {
    const sections: readonly ProfileSection[] = ['unbridged', 'bridged', 'combined'];
    const profiles = sections.map((section) =>
      calculateTemperatureProfile(TIMBER_FRAME_WALL, STANDARD_CONDITIONS, section),
    );
    const [first] = profiles;
    if (first === undefined) {
      throw new Error('no profiles');
    }
    for (const profile of profiles) {
      expect(profile.nodes.map((node) => node.worstCaseTemperatureC)).toEqual(
        first.nodes.map((node) => node.worstCaseTemperatureC),
      );
      expect(profile.nodes.map((node) => node.isBelowInternalDewPoint)).toEqual(
        first.nodes.map((node) => node.isBelowInternalDewPoint),
      );
    }
    // Only the displayed line differs between the modes.
    expect(nodeAt(profiles[0]?.nodes ?? [], 1).temperatureC).not.toBeCloseTo(
      nodeAt(profiles[1]?.nodes ?? [], 1).temperatureC,
      6,
    );
  });

  it('finds the worst case on a mixed path when two layers are bridged', () => {
    // Two 100 mm insulation layers, each 10 % bridged by softwood, 20 C / 0 C:
    //   unbridged section R = 0.100 / 0.035 = 2.8571429
    //   bridging  section R = 0.100 / 0.13  = 0.7692308
    //
    // At the A/B interface, theta = theta_e + dT * (Rse + R_B) / R_T,path, so the
    // coldest path is the one with a SMALL outer resistance and a LARGE total: that
    // is A unbridged with B bridged, not either extreme.
    //
    //   path         R_T         Rse + R_B    ratio       theta_AB
    //   (unb,unb)    5.8842858   2.8971429    0.4923525    9.847050 C
    //   (unb,br)     3.7963737   0.8092308    0.2131589    4.263178 C  <- worst
    //   (br,unb)     3.7963737   2.8971429    0.7631343   15.262686 C
    //   (br,br)      1.7084616   0.8092308    0.4736605    9.473210 C
    //
    // The mixed path is 5.2 K colder at that interface than either uniform path, so a
    // verdict taken from the two extremes alone would miss it by a wide margin.
    const twoBridgedLayers = element([
      solid('a', 'Insulation A', 0.1, MINERAL_WOOL, {
        label: 'Stud A',
        areaFraction: 0.1,
        material: SOFTWOOD,
      }),
      solid('b', 'Insulation B', 0.1, MINERAL_WOOL, {
        label: 'Stud B',
        areaFraction: 0.1,
        material: SOFTWOOD,
      }),
    ]);
    const profile = calculateTemperatureProfile(
      twoBridgedLayers,
      STANDARD_CONDITIONS,
      'combined',
    );
    // Node 2 is the A/B interface (0 internal air, 1 internal surface, 2 interface).
    const interfaceNode = nodeAt(profile.nodes, 2);
    expect(interfaceNode.worstCaseTemperatureC).toBeCloseTo(4.263178, 5);
    expect(interfaceNode.worstCasePathId).toBe('mixed:01');
    // Confirm it beats both uniform paths.
    expect(interfaceNode.worstCaseTemperatureC).toBeLessThan(9.47321);
    expect(interfaceNode.worstCaseTemperatureC).toBeLessThan(9.84705);
  });
});

describe('vapour thicknesses follow the unbridged path (Revision 2.5)', () => {
  it('gives the combined mode the same Sd values as the unbridged mode', () => {
    // Area-weighting mu*d across a stud layer has no clean physical meaning, so the
    // combined profile carries the unbridged path's Sd. For the timber-frame wall:
    //   plasterboard  mu 10, d 0.0125 -> Sd 0.125 m
    //   mineral wool  mu  1, d 0.140  -> Sd 0.140 m   (cumulative 0.265 m)
    //   OSB           mu 50, d 0.009  -> Sd 0.450 m   (cumulative 0.715 m)
    const combined = calculateTemperatureProfile(
      TIMBER_FRAME_WALL,
      STANDARD_CONDITIONS,
      'combined',
    );
    const unbridged = calculateTemperatureProfile(
      TIMBER_FRAME_WALL,
      STANDARD_CONDITIONS,
      'unbridged',
    );
    expect(combined.sdFollowsUnbridgedConvention).toBe(true);
    expect(combined.nodes.map((node) => node.cumulativeSdM)).toEqual(
      unbridged.nodes.map((node) => node.cumulativeSdM),
    );
    expect(combined.nodes.map((node) => node.cumulativeSdM)).toEqual([
      0, 0, 0.125, 0.265, 0.715, 0.715,
    ]);
  });
});
