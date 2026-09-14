import { describe, expect, it } from 'vitest';
import { assessRetrofit } from '../retrofit.js';
import { blankAirLayer, blankSolidLayer, hasFullFillCavity } from '../model.js';
import type { UiLayer } from '../model.js';
import type { UValueResult } from '@openuvalue/engine';

/** Only the U-value is read, so the rest of the result can be a stub. */
function withU(u: number | null): UValueResult {
  return { uValueWPerM2K: u } as UValueResult;
}

const BASE = {
  regionId: 0,
  internalTemperatureC: 20,
  baseTemperatureC: 15.5,
  source: { fuelId: 'mains-gas', efficiency: 0.9 },
  pricePerKWhPence: 7,
  areaM2: 50,
  costGBP: 4000,
};

describe('what a retrofit saves', () => {
  it('saves the difference between the two heat losses', () => {
    /*
     * A solid wall at 2.00 improved to 0.30, UK average, room at 20 C, base 15.5.
     *
     * Ten of the twelve months are below the base — July at 16.6 and August at 16.4 are
     * not — and their degree-days against the 20 C room add up as:
     *   486.7 + 422.8 + 418.5 + 333.0 + 257.3 + 162.0
     *         + 177.0 + 291.4 + 387.0 + 489.8  =  3425.5 K.day
     * Heat through a square metre is U * DD * 24 / 1000:
     *   before: 2.00 * 3425.5 * 24 / 1000 = 164.424 kWh/m2
     *   after:  0.30 * 3425.5 * 24 / 1000 =  24.664 kWh/m2
     *   saved                              = 139.760 kWh/m2
     * Over 50 m2 that is 6988.0 kWh a year of heat that no longer has to be supplied.
     */
    const result = assessRetrofit({ ...BASE, before: withU(2.0), after: withU(0.3) });
    expect(result).toBeDefined();
    expect(result!.beforeLossKWhPerM2).toBeCloseTo(164.424, 3);
    expect(result!.afterLossKWhPerM2).toBeCloseTo(24.6636, 3);
    expect(result!.savedKWhPerM2).toBeCloseTo(139.7604, 3);
    expect(result!.savedKWhPerYear).toBeCloseTo(6988.02, 1);
  });

  it('costs the saving through the heating system, not as bare heat', () => {
    /*
     * 6988.02 kWh of heat at a boiler efficiency of 0.9 is 7764.47 kWh of gas:
     *   money  = 7764.47 * 7p       = £543.51
     *   carbon = 7764.47 * 0.210    = 1630.5 kg CO2e
     * Dividing by the efficiency matters: costing the heat directly would understate the
     * saving by a tenth, because a tenth of the gas never becomes heat in the room.
     */
    const result = assessRetrofit({ ...BASE, before: withU(2.0), after: withU(0.3) })!;
    expect(result.savedFuelKWhPerYear).toBeCloseTo(7764.47, 1);
    expect(result.savedGBPPerYear).toBeCloseTo(543.51, 1);
    expect(result.savedCO2KgPerYear).toBeCloseTo(1630.5, 0);
  });

  it('divides the cost by the annual saving to get a payback', () => {
    // £4000 of work saving £543.51 a year pays back in 7.36 years.
    const result = assessRetrofit({ ...BASE, before: withU(2.0), after: withU(0.3) })!;
    expect(result.paybackYears).toBeCloseTo(7.3595, 3);
  });

  it('has no payback where the work saves nothing', () => {
    // Not zero years, which would read as "pays back instantly".
    const result = assessRetrofit({ ...BASE, before: withU(0.3), after: withU(0.3) })!;
    expect(result.paybackYears).toBeUndefined();
    expect(result.makesItWorse).toBe(true);
  });

  it('says so when the work makes the element worse', () => {
    const result = assessRetrofit({ ...BASE, before: withU(0.3), after: withU(0.5) })!;
    expect(result.makesItWorse).toBe(true);
    expect(result.savedKWhPerM2).toBeLessThan(0);
    expect(result.paybackYears).toBeUndefined();
  });

  it('gives nothing at all where either side has no U-value', () => {
    // An out-of-scope build-up has no number to compare, and inventing one would be the
    // whole point of withholding it in the first place.
    expect(assessRetrofit({ ...BASE, before: withU(null), after: withU(0.3) })).toBeUndefined();
    expect(assessRetrofit({ ...BASE, before: withU(2), after: withU(null) })).toBeUndefined();
  });

  it('pays back sooner in a colder region, on the same work', () => {
    const uk = assessRetrofit({ ...BASE, before: withU(2), after: withU(0.3) })!;
    const highland = assessRetrofit({ ...BASE, regionId: 17, before: withU(2), after: withU(0.3) })!;
    expect(highland.paybackYears!).toBeLessThan(uk.paybackYears!);
  });
});

describe('spotting a fully filled masonry cavity', () => {
  const solid = (materialId: string): UiLayer => ({ ...blankSolidLayer(), materialId });

  it('finds insulation between two masonry leaves', () => {
    expect(
      hasFullFillCavity([
        solid('gypsum-plasterboard'),
        solid('aircrete-block'),
        solid('mineral-wool-quilt'),
        solid('brick-outer-leaf'),
      ]),
    ).toBe(true);
  });

  it('does not flag a partial fill, which keeps a cavity', () => {
    expect(
      hasFullFillCavity([
        solid('gypsum-plasterboard'),
        solid('aircrete-block'),
        solid('pir-board'),
        blankAirLayer(),
        solid('brick-outer-leaf'),
      ]),
    ).toBe(false);
  });

  it('does not flag a timber frame, which the rule is not about', () => {
    expect(
      hasFullFillCavity([
        solid('gypsum-plasterboard'),
        solid('mineral-wool-quilt'),
        solid('osb-board'),
        blankAirLayer(),
        solid('brick-outer-leaf'),
      ]),
    ).toBe(false);
  });

  it('does not flag external or internal insulation on a solid wall', () => {
    expect(
      hasFullFillCavity([solid('gypsum-plasterboard'), solid('eps-board'), solid('brick-outer-leaf')]),
    ).toBe(false);
    expect(
      hasFullFillCavity([solid('brick-outer-leaf'), solid('eps-board'), solid('cement-sand-render')]),
    ).toBe(false);
  });
});
