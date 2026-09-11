import { describe, expect, it } from 'vitest';
import {
  lowEmissivityAirLayerResistanceM2KPerW,
  unventilatedAirLayerResistanceM2KPerW,
} from '../airLayer.js';
import {
  LOW_EMISSIVITY_AIR_LAYER_M2K_PER_W,
  LOW_EMISSIVITY_TABULATED,
  MIN_DECLARABLE_EMISSIVITY,
} from '../constants.js';

/**
 * Every expected value is quoted from BR 443 (2019) 4.7.2 rather than worked out, because
 * these are tabulated figures: the test is that the table is transcribed correctly and
 * applied to the right heat flow direction.
 */

describe('low-emissivity unventilated air layers (BR 443 (2019) 4.7.2)', () => {
  it('carries the three tabulated values, one per heat flow direction', () => {
    // "Low-emissivity surface, heat flow horizontal (wall applications, e=0.2) R=0.44"
    // "Low-emissivity surface, heat flow upwards (roof applications, e=0.2)    R=0.34"
    // "Low-emissivity surface, heat flow downwards (floor applications, e=0.2) R=0.50"
    expect(LOW_EMISSIVITY_AIR_LAYER_M2K_PER_W.horizontal).toBe(0.44);
    expect(LOW_EMISSIVITY_AIR_LAYER_M2K_PER_W.upward).toBe(0.34);
    expect(LOW_EMISSIVITY_AIR_LAYER_M2K_PER_W.downward).toBe(0.5);
  });

  it('applies them at 25 mm and stays flat above it', () => {
    // "The thermal resistance for unventilated cavities larger than 25 mm will remain
    // unchanged with respect to the thickness of the cavity if the same emissivity value
    // is used."
    for (const thicknessM of [0.025, 0.05, 0.1, 0.3]) {
      expect(
        lowEmissivityAirLayerResistanceM2KPerW(thicknessM, 'horizontal').resistanceM2KPerW,
      ).toBeCloseTo(0.44, 10);
      expect(
        lowEmissivityAirLayerResistanceM2KPerW(thicknessM, 'upward').resistanceM2KPerW,
      ).toBeCloseTo(0.34, 10);
      expect(
        lowEmissivityAirLayerResistanceM2KPerW(thicknessM, 'downward').resistanceM2KPerW,
      ).toBeCloseTo(0.5, 10);
    }
  });

  it('roughly doubles the resistance of an ordinary masonry cavity', () => {
    // BR 443 4.7.1 gives R = 0.18 for an unventilated masonry cavity at normal emissivity;
    // 4.7.2 gives 0.44 for the same cavity with a reflective face. Radiation is most of
    // what crosses a still air layer, which is why cutting it matters this much.
    const high = unventilatedAirLayerResistanceM2KPerW(0.05, 'horizontal').resistanceM2KPerW;
    const low = lowEmissivityAirLayerResistanceM2KPerW(0.05, 'horizontal').resistanceM2KPerW;
    expect(high).toBeCloseTo(0.18, 10);
    expect(low / high).toBeGreaterThan(2.4);
  });

  it('falls away below 25 mm in a wall, on the figures BR 443 gives', () => {
    // "for a wall air cavity of 10 mm (e=0.2) the resistance is 0.29 m²K/W, and for a
    // wall air cavity of 5mm (e=0.2) the resistance is 0.17 m²K/W"
    expect(
      lowEmissivityAirLayerResistanceM2KPerW(0.01, 'horizontal').resistanceM2KPerW,
    ).toBeCloseTo(0.29, 10);
    expect(
      lowEmissivityAirLayerResistanceM2KPerW(0.005, 'horizontal').resistanceM2KPerW,
    ).toBeCloseTo(0.17, 10);
  });

  it('interpolates between the tabulated thin-wall points', () => {
    // Half way between 10 mm (0.29) and 25 mm (0.44) is 17.5 mm:
    //   0.29 + 0.5 x (0.44 - 0.29) = 0.365
    expect(
      lowEmissivityAirLayerResistanceM2KPerW(0.0175, 'horizontal').resistanceM2KPerW,
    ).toBeCloseTo(0.365, 10);
  });

  it('goes to nothing as the gap closes', () => {
    // BR 443: "very thin air gaps have very small resistances, therefore making the
    // benefits of low emissivity surface negligible". A gap of no thickness has no
    // resistance however reflective its faces are.
    expect(lowEmissivityAirLayerResistanceM2KPerW(0, 'horizontal').resistanceM2KPerW).toBe(0);
    // Half of the thinnest tabulated gap: 0.17 / 2 = 0.085
    expect(
      lowEmissivityAirLayerResistanceM2KPerW(0.0025, 'horizontal').resistanceM2KPerW,
    ).toBeCloseTo(0.085, 10);
  });

  it('will not guess a thin low-emissivity cavity in a roof or a floor', () => {
    // BR 443 tabulates the sub-25 mm case for walls only. Rather than scale the wall
    // figures into a direction the standard says nothing about, the ordinary
    // high-emissivity value is used and the shortfall is warned about.
    for (const direction of ['upward', 'downward'] as const) {
      const result = lowEmissivityAirLayerResistanceM2KPerW(0.01, direction);
      const plain = unventilatedAirLayerResistanceM2KPerW(0.01, direction);
      expect(result.resistanceM2KPerW).toBeCloseTo(plain.resistanceM2KPerW, 10);
      expect(result.warnings.map((w) => w.code)).toContain('value-needs-verification');
      // Under-stating the foil's benefit is the safe direction for a U-value.
      expect(result.resistanceM2KPerW).toBeLessThan(
        LOW_EMISSIVITY_AIR_LAYER_M2K_PER_W[direction],
      );
    }
  });

  it('routes through the ordinary entry point when the layer declares low emissivity', () => {
    expect(
      unventilatedAirLayerResistanceM2KPerW(0.05, 'horizontal', undefined, 'low')
        .resistanceM2KPerW,
    ).toBeCloseTo(0.44, 10);
    expect(
      unventilatedAirLayerResistanceM2KPerW(0.05, 'horizontal', undefined, 'high')
        .resistanceM2KPerW,
    ).toBeCloseTo(0.18, 10);
  });

  it('records the emissivity BR 443 tabulates and the floor on declaring one', () => {
    // 4.7.2: an emissivity below 0.2 may only be used where it comes from a certificate
    // issued by an accredited body, and BS EN 15976 cannot measure below 0.02, "therefore
    // the declared emissivity cannot be less than 0.02".
    expect(LOW_EMISSIVITY_TABULATED).toBe(0.2);
    expect(MIN_DECLARABLE_EMISSIVITY).toBe(0.02);
  });
});
