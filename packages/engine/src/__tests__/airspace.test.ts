import { describe, expect, it } from 'vitest';
import {
  airspaceConvectiveCoefficient,
  airspaceResistance,
  blackBodyRadiativeCoefficient,
} from '../airspace.js';
import { UNVENTILATED_AIR_LAYER_TABLE } from '../constants.js';

/**
 * The whole point of this file: the tabulated resistances we have been carrying are what
 * this formula produces. Annex D's own note says so, and this checks it rather than
 * taking its word for it.
 */
describe('the coefficients the formula is built from', () => {
  it('gives the black-body radiative coefficient at the reference temperature', () => {
    // hr0 = 4 * 5.67e-8 * (10 + 273.15)^3
    //     = 4 * 5.67e-8 * 22701242.9... = 5.148643 W/(m2*K)
    expect(blackBodyRadiativeCoefficient()).toBeCloseTo(5.148643, 6);
    expect(blackBodyRadiativeCoefficient(10)).toBeCloseTo(5.148643, 6);
  });

  it('takes the tabulated convection coefficient where it beats still-air conduction', () => {
    // 25 mm horizontal: Table D.1 gives 1.25; 0.025/0.025 = 1.0 is smaller, so 1.25.
    expect(airspaceConvectiveCoefficient(0.025, 'horizontal')).toBeCloseTo(1.25, 10);
    // Upward is 1.95 by the same table.
    expect(airspaceConvectiveCoefficient(0.025, 'upward')).toBeCloseTo(1.95, 10);
  });

  it('takes still-air conduction where it beats the table', () => {
    // 10 mm: 0.025/0.010 = 2.5, which is larger than the 1.25 in Table D.1.
    expect(airspaceConvectiveCoefficient(0.01, 'horizontal')).toBeCloseTo(2.5, 10);
    // 5 mm: 0.025/0.005 = 5.0, larger again — which is why thin cavities lose so fast.
    expect(airspaceConvectiveCoefficient(0.005, 'horizontal')).toBeCloseTo(5, 10);
  });

  it('uses the larger-temperature-difference table above 5 K', () => {
    // Table D.2, horizontal: 0.73 * dT^(1/3). At dT = 10: 0.73 * 2.154435 = 1.572738.
    expect(airspaceConvectiveCoefficient(0.05, 'horizontal', 10)).toBeCloseTo(1.5727373, 6);
    // At exactly 5 K it is still Table D.1's 1.25, not 0.73 * 5^(1/3) = 1.248.
    expect(airspaceConvectiveCoefficient(0.05, 'horizontal', 5)).toBeCloseTo(1.25, 10);
  });

  it('falls with thickness for downward heat flow, where convection is suppressed', () => {
    // Table D.1 downward: 0.12 * d^-0.44. At 25 mm that is 0.608, below the 1.0 that
    // still-air conduction gives, so conduction wins. At 100 mm: 0.12 * 100^0.44... in
    // metres, 0.12 * 0.1^-0.44 = 0.12 * 2.7542 = 0.3305, against 0.025/0.1 = 0.25.
    expect(airspaceConvectiveCoefficient(0.025, 'downward')).toBeCloseTo(1, 10);
    expect(airspaceConvectiveCoefficient(0.1, 'downward')).toBeCloseTo(0.3305074, 6);
  });
});

describe('an air layer', () => {
  it('reproduces the 25 mm wall cavity everyone knows', () => {
    /*
     * ha = 1.25 (Table D.1, horizontal)
     * E  = 1 / (1/0.9 + 1/0.9 - 1) = 1 / 1.222222 = 0.818182
     * hr = 0.818182 * 5.148643 = 4.212526
     * Ra = 1 / (1.25 + 4.212526) = 1 / 5.462526 = 0.183065  ->  0.18
     */
    const result = airspaceResistance({ thicknessM: 0.025, direction: 'horizontal' });
    expect(result.haWPerM2K).toBeCloseTo(1.25, 10);
    expect(result.hrWPerM2K).toBeCloseTo(4.212526, 6);
    expect(result.resistanceM2KPerW).toBeCloseTo(0.183065, 6);
    expect(result.isAirVoid).toBe(false);
  });

  it('reproduces every value in the table we have been carrying', () => {
    /*
     * This is the check that settles VERIFY.md V4. Annex D's note says Table 9 is
     * calculated from this formula at e = 0.9 both sides and hr0 at 10 C; if that is
     * true, all 21 tabulated entries must come back to the two decimals they are quoted
     * at. They do.
     */
    for (const row of UNVENTILATED_AIR_LAYER_TABLE) {
      // The table anchors at zero thickness for interpolation; there is no airspace
      // there to compute, and the formula divides by d.
      if (row.thicknessM <= 0) {
        continue;
      }
      for (const direction of ['horizontal', 'upward', 'downward'] as const) {
        const tabulated = row[direction];
        const computed = airspaceResistance({
          thicknessM: row.thicknessM,
          direction,
        }).resistanceM2KPerW;
        expect(
          Math.abs(computed - tabulated),
          `${row.thicknessM * 1000} mm ${direction}: table ${tabulated}, formula ${computed.toFixed(4)}`,
        ).toBeLessThan(0.005);
      }
    }
  });

  it('roughly doubles when one face is a foil', () => {
    // A low-emissivity face cuts the radiation term, which is most of the total.
    const plain = airspaceResistance({ thicknessM: 0.025, direction: 'horizontal' });
    const foiled = airspaceResistance({
      thicknessM: 0.025,
      direction: 'horizontal',
      emissivityWarm: 0.05,
    });
    expect(foiled.resistanceM2KPerW).toBeGreaterThan(plain.resistanceM2KPerW * 1.9);
    expect(foiled.hrWPerM2K).toBeLessThan(plain.hrWPerM2K / 3);
  });
});

describe('an air void', () => {
  it('is the same formula as an air layer once it is wide enough', () => {
    // At b = 1000 d the geometry term is within a whisker of the layer's -1.
    const layer = airspaceResistance({ thicknessM: 0.025, direction: 'horizontal' });
    const veryWide = airspaceResistance({
      thicknessM: 0.025,
      direction: 'horizontal',
      widthM: 25,
    });
    expect(veryWide.resistanceM2KPerW).toBeCloseTo(layer.resistanceM2KPerW, 3);
    expect(veryWide.isAirVoid).toBe(false);
  });

  it('has MORE resistance the narrower it gets, not less', () => {
    /*
     * The direction here is worth stating plainly, because the obvious guess is wrong and
     * VERIFY.md had it the wrong way round until this was implemented.
     *
     * In a narrow, deep slot the two faces barely see each other: most of what the warm
     * face radiates lands on the sides rather than on the cold face. The radiative
     * coupling therefore weakens, hr falls, and the resistance RISES. In the limit the
     * geometry term reaches 0 and hr tends to hr0/(1/e1 + 1/e2) = 2.317, against an air
     * layer's hr0/(1/e1 + 1/e2 - 1) = 4.213.
     *
     * So giving a divided cavity a full air layer's resistance **under**-states it. That
     * is the safe direction to have been wrong in, but it is still wrong.
     */
    const wide = airspaceResistance({ thicknessM: 0.05, direction: 'horizontal', widthM: 1 });
    const narrow = airspaceResistance({ thicknessM: 0.05, direction: 'horizontal', widthM: 0.1 });
    const narrower = airspaceResistance({ thicknessM: 0.05, direction: 'horizontal', widthM: 0.05 });
    expect(narrow.resistanceM2KPerW).toBeGreaterThan(wide.resistanceM2KPerW);
    expect(narrower.resistanceM2KPerW).toBeGreaterThan(narrow.resistanceM2KPerW);
    expect(narrower.hrWPerM2K).toBeLessThan(wide.hrWPerM2K);
    // And never past the limit the formula tends to.
    expect(narrower.hrWPerM2K).toBeGreaterThan(2.3168);
  });

  it('matches a hand-worked square void', () => {
    /*
     * d = b = 0.05, so d/b = 1 and sqrt(1 + 1) = 1.414214.
     *   geometry = -2 + 2 / (1 + 1.414214 - 1) = -2 + 2 / 1.414214 = -2 + 1.414213
     *            = -0.585787
     *   hr = 5.148643 / (1.111111 + 1.111111 - 0.585786)
     *      = 5.148643 / 1.636436 = 3.146254
     *   ha = max(1.25, 0.025/0.05) = 1.25
     *   Ra = 1 / (1.25 + 3.146254) = 1 / 4.396254 = 0.227466
     */
    const result = airspaceResistance({
      thicknessM: 0.05,
      direction: 'horizontal',
      widthM: 0.05,
    });
    expect(result.hrWPerM2K).toBeCloseTo(3.146254, 6);
    expect(result.resistanceM2KPerW).toBeCloseTo(0.227466, 6);
    expect(result.isAirVoid).toBe(true);
  });

  it('counts as a layer at exactly ten times the thickness', () => {
    const atTheBoundary = airspaceResistance({
      thicknessM: 0.05,
      direction: 'horizontal',
      widthM: 0.5,
    });
    expect(atTheBoundary.isAirVoid).toBe(false);
  });

  it('flags a thickness past what Annex D covers', () => {
    expect(airspaceResistance({ thicknessM: 0.4, direction: 'horizontal' }).beyondAnnexDThickness).toBe(true);
    expect(airspaceResistance({ thicknessM: 0.3, direction: 'horizontal' }).beyondAnnexDThickness).toBe(false);
  });
});
