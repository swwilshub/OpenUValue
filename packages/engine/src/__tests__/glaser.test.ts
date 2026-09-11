import { describe, expect, it } from 'vitest';
import { assessGlaser, vapourFlowRateKgPerM2S } from '../condensation/glaser.js';
import type { GlaserNode } from '../condensation/glaser.js';
import { saturationVapourPressurePa } from '../psychrometrics.js';

/**
 * The worked example throughout is the internally-insulated solid wall the walkthrough
 * uses, at 20 °C / 50 % inside and 0 °C / 90 % outside. Its temperatures come from the
 * steady-state profile and are quoted here as the inputs they are, so that this file
 * tests the Glaser construction alone rather than re-testing the heat calculation.
 *
 *   node  interface                     theta      Sd
 *   0     internal surface              19.23 C    0.000
 *   1     plasterboard / mineral wool   18.93 C    0.125
 *   2     mineral wool / solid brick     1.90 C    0.225
 *   3     external surface               0.24 C    2.375
 */
const INTERNAL_INSULATION: readonly GlaserNode[] = [
  { boundaryIndex: 0, label: 'Internal surface', cumulativeSdM: 0, temperatureC: 19.23 },
  { boundaryIndex: 1, label: 'Plasterboard / Mineral wool', cumulativeSdM: 0.125, temperatureC: 18.93 },
  { boundaryIndex: 2, label: 'Mineral wool / Solid brick', cumulativeSdM: 0.225, temperatureC: 1.9 },
  { boundaryIndex: 3, label: 'External surface', cumulativeSdM: 2.375, temperatureC: 0.24 },
];

/** The same wall with 0.2 mm of polythene (Sd 20 m) behind the plasterboard. */
const WITH_VAPOUR_BARRIER: readonly GlaserNode[] = [
  { boundaryIndex: 0, label: 'Internal surface', cumulativeSdM: 0, temperatureC: 19.23 },
  { boundaryIndex: 1, label: 'Plasterboard / Polythene', cumulativeSdM: 0.125, temperatureC: 18.93 },
  { boundaryIndex: 2, label: 'Polythene / Mineral wool', cumulativeSdM: 20.125, temperatureC: 18.92 },
  { boundaryIndex: 3, label: 'Mineral wool / Solid brick', cumulativeSdM: 20.225, temperatureC: 1.9 },
  { boundaryIndex: 4, label: 'External surface', cumulativeSdM: 22.375, temperatureC: 0.24 },
];

// Internal air at 20 C, 50 % RH:  p = 0.50 * p_sat(20).
const INTERNAL_PA = 0.5 * saturationVapourPressurePa(20);
// External air at 0 C, 90 % RH:   p = 0.90 * p_sat(0).
const EXTERNAL_PA = 0.9 * saturationVapourPressurePa(0);

describe('vapour flow rate', () => {
  it('is delta_air times the pressure difference over Sd', () => {
    // 2.0e-10 * 500 / 1 = 1.0e-7 kg/(m2*s).
    expect(vapourFlowRateKgPerM2S(500, 1)).toBeCloseTo(1.0e-7, 15);
    // Ten times the Sd, one tenth the flow.
    expect(vapourFlowRateKgPerM2S(500, 10)).toBeCloseTo(1.0e-8, 15);
  });

  it('is zero through a layer with no vapour resistance at all', () => {
    expect(vapourFlowRateKgPerM2S(500, 0)).toBe(0);
  });
});

describe('Glaser construction: no condensation', () => {
  it('runs straight from inside to outside when the ceiling is never touched', () => {
    // A single well-insulated layer whose interfaces stay warm. p_sat everywhere is far
    // above the straight line, so the profile is that straight line.
    const nodes: readonly GlaserNode[] = [
      { boundaryIndex: 0, label: 'in', cumulativeSdM: 0, temperatureC: 19 },
      { boundaryIndex: 1, label: 'mid', cumulativeSdM: 1, temperatureC: 18 },
      { boundaryIndex: 2, label: 'out', cumulativeSdM: 2, temperatureC: 17 },
    ];
    const result = assessGlaser({
      nodes,
      internalVapourPressurePa: 1000,
      externalVapourPressurePa: 800,
    });
    expect(result.condensationPlaneIndices).toEqual([]);
    expect(result.totalCondensationRateKgPerM2S).toBe(0);
    // Straight line: halfway along Sd is halfway between the pressures.
    expect(result.nodes[1]?.actualVapourPressurePa).toBeCloseTo(900, 8);
  });
});

describe('Glaser construction: internally insulated solid wall', () => {
  const result = assessGlaser({
    nodes: INTERNAL_INSULATION,
    internalVapourPressurePa: INTERNAL_PA,
    externalVapourPressurePa: EXTERNAL_PA,
  });

  it('condenses at the insulation/brick junction and nowhere else', () => {
    // Hand check. p_int = 0.5 * p_sat(20) = 0.5 * 2339.3 = 1169.6 Pa.
    // p_ext = 0.9 * p_sat(0) = 0.9 * 610.5 = 549.5 Pa.
    // The straight line from (0, 1169.6) to (2.375, 549.5) reaches, at Sd 0.225,
    //   1169.6 - (1169.6 - 549.5) * 0.225 / 2.375 = 1169.6 - 58.7 = 1110.9 Pa,
    // but p_sat(1.90 C) is only about 699 Pa, so the line cannot get there: that
    // junction condenses. At Sd 0.125 the line is at about 1137 Pa against a ceiling
    // of p_sat(18.93) = 2189 Pa, so that interface is clear.
    expect(result.condensationPlaneIndices).toEqual([2]);
  });

  it('pins the vapour pressure to saturation at the condensing plane', () => {
    const plane = result.nodes[2];
    expect(plane?.actualVapourPressurePa).toBeCloseTo(
      saturationVapourPressurePa(1.9),
      8,
    );
  });

  it('gives a condensation rate equal to flow in minus flow out', () => {
    // p_c = p_sat(1.90) = 698.9 Pa (checked against Annex E in psychrometrics.test.ts).
    //   flow in  = 2.0e-10 * (1169.6 - 698.9) / 0.225   = 4.184e-7 kg/(m2*s)
    //   flow out = 2.0e-10 * (698.9  - 549.5) / 2.150   = 1.390e-8 kg/(m2*s)
    //   rate     = 4.184e-7 - 1.390e-8                  = 4.045e-7 kg/(m2*s)
    const pc = saturationVapourPressurePa(1.9);
    const flowIn = (2.0e-10 * (INTERNAL_PA - pc)) / 0.225;
    const flowOut = (2.0e-10 * (pc - EXTERNAL_PA)) / 2.15;
    expect(result.nodes[2]?.rateKgPerM2S).toBeCloseTo(flowIn - flowOut, 15);
    expect(result.totalCondensationRateKgPerM2S).toBeCloseTo(flowIn - flowOut, 15);
    // Sanity: about 0.4 micrograms per square metre per second, which is roughly
    // 35 g/m2 per day. A real amount of water.
    expect(result.nodes[2]?.rateKgPerM2S).toBeGreaterThan(3e-7);
    expect(result.nodes[2]?.rateKgPerM2S).toBeLessThan(5e-7);
  });

  it('reports outward vapour flow and no surface condensation', () => {
    expect(result.vapourFlowDirection).toBe('outward');
    // p_int 1169.6 Pa against p_sat(19.23) = 2229 Pa: the surface is clear.
    expect(result.surfaceCondensation).toBe(false);
  });
});

describe('Glaser construction: the vapour barrier stops it', () => {
  const result = assessGlaser({
    nodes: WITH_VAPOUR_BARRIER,
    internalVapourPressurePa: INTERNAL_PA,
    externalVapourPressurePa: EXTERNAL_PA,
  });

  it('clears the junction that the temperature check still flags', () => {
    // The brick junction is still at 1.90 C, so it is still below the internal dew
    // point and the Phase 1 screening still flags it. But 20 m of Sd inboard means the
    // straight line from 1169.6 Pa has fallen to
    //   1169.6 - (1169.6 - 549.5) * 20.225 / 22.375 = 1169.6 - 560.5 = 609 Pa
    // by the time it gets there, which is below the 699 Pa ceiling. Nothing condenses.
    expect(result.condensationPlaneIndices).toEqual([]);
    expect(result.totalCondensationRateKgPerM2S).toBe(0);
  });

  it('leaves the junction below saturation with room to spare', () => {
    const junction = result.nodes[3];
    expect(junction).toBeDefined();
    expect(junction?.actualVapourPressurePa).toBeLessThan(
      junction?.saturationVapourPressurePa ?? 0,
    );
  });
});

describe('Glaser construction: a plane already wet', () => {
  it('evaporates when the dry construction would not condense there', () => {
    // Take the barrier case, which condenses nothing, but declare the brick junction
    // already wet from an earlier month. It stays pinned at saturation, and because
    // the flow arriving is now smaller than the flow leaving, the net rate is
    // negative: it is drying out.
    const result = assessGlaser({
      nodes: WITH_VAPOUR_BARRIER,
      internalVapourPressurePa: INTERNAL_PA,
      externalVapourPressurePa: EXTERNAL_PA,
      wetBoundaryIndices: [3],
    });
    expect(result.condensationPlaneIndices).toEqual([3]);
    expect(result.nodes[3]?.rateKgPerM2S).toBeLessThan(0);
    // Nothing is *added* anywhere, so the positive total is zero.
    expect(result.totalCondensationRateKgPerM2S).toBe(0);
  });
});

describe('Glaser construction: reversed vapour drive', () => {
  it('warns rather than silently mirroring the construction', () => {
    const result = assessGlaser({
      nodes: INTERNAL_INSULATION,
      internalVapourPressurePa: 600,
      externalVapourPressurePa: 1200,
    });
    expect(result.vapourFlowDirection).toBe('inward');
    expect(result.warnings.map((w) => w.code)).toContain('in-house-convention');
  });
});

describe('Glaser construction: surface condensation', () => {
  it('is reported separately from the interstitial planes', () => {
    // Internal air at 19.23 C surface temperature and a vapour pressure above its own
    // saturation: that is condensation on the wall, not inside it.
    const result = assessGlaser({
      nodes: INTERNAL_INSULATION,
      internalVapourPressurePa: saturationVapourPressurePa(19.23) + 1,
      externalVapourPressurePa: EXTERNAL_PA,
    });
    expect(result.surfaceCondensation).toBe(true);
  });
});

describe('assessInterstitialCondensation (the whole element)', () => {
  it('condenses in the internally-insulated wall and not once a barrier is added', async () => {
    const { assessInterstitialCondensation, ratePerDayGPerM2 } = await import(
      '../condensation/iso13788.js'
    );
    const { element, solid } = await import('./fixtures.js');
    const conditions = {
      internalAirTemperatureC: 20,
      internalRelativeHumidityPercent: 50,
      externalAirTemperatureC: 0,
      externalRelativeHumidityPercent: 90,
    };
    const plasterboard = { lambdaWPerMK: 0.25, vapourResistanceFactorMu: 10 };
    const wool = { lambdaWPerMK: 0.035, vapourResistanceFactorMu: 1 };
    const brick = { lambdaWPerMK: 0.77, vapourResistanceFactorMu: 10 };
    const polythene = { lambdaWPerMK: 0.33, vapourResistanceFactorMu: 100000 };

    const without = assessInterstitialCondensation(
      element([
        solid('pb', 'Plasterboard', 0.0125, plasterboard),
        solid('ins', 'Mineral wool', 0.1, wool),
        solid('brk', 'Solid brick', 0.215, brick),
      ]),
      conditions,
    );
    expect(without.condenses).toBe(true);
    // Roughly 35 g/m2 per day, i.e. a real quantity of water into the brickwork.
    expect(ratePerDayGPerM2(without.totalCondensationRateKgPerM2S)).toBeGreaterThan(20);
    expect(ratePerDayGPerM2(without.totalCondensationRateKgPerM2S)).toBeLessThan(50);

    const withBarrier = assessInterstitialCondensation(
      element([
        solid('pb', 'Plasterboard', 0.0125, plasterboard),
        solid('vcl', 'Polythene', 0.0002, polythene),
        solid('ins', 'Mineral wool', 0.1, wool),
        solid('brk', 'Solid brick', 0.215, brick),
      ]),
      conditions,
    );
    expect(withBarrier.condenses).toBe(false);
    expect(withBarrier.totalCondensationRateKgPerM2S).toBe(0);
  });
});
