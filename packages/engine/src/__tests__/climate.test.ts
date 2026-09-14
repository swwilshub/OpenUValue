import { describe, expect, it } from 'vitest';
import {
  CLIMATE_REGIONS,
  DAYS_IN_MONTH,
  climateRegion,
  seasonalHeatLoss,
} from '../climate.js';
import { FUELS, costOfHeat, fuel } from '../heatSource.js';

describe('the climate table', () => {
  it('carries SAP 10.2 Table U1 in full', () => {
    // 21 regions plus the UK average.
    expect(CLIMATE_REGIONS).toHaveLength(22);
    expect(CLIMATE_REGIONS.every((region) => region.monthlyMeanExternalC.length === 12)).toBe(true);
    // The ids are SAP's own and run 0..21 without gaps.
    expect(CLIMATE_REGIONS.map((region) => region.id)).toEqual(
      Array.from({ length: 22 }, (_, index) => index),
    );
  });

  it('has the UK average row exactly as tabulated', () => {
    expect(climateRegion(0)?.monthlyMeanExternalC).toEqual([
      4.3, 4.9, 6.5, 8.9, 11.7, 14.6, 16.6, 16.4, 14.1, 10.6, 7.1, 4.2,
    ]);
  });

  it('gets colder going north, which is the sense check the numbers must pass', () => {
    const january = (id: number): number => climateRegion(id)?.monthlyMeanExternalC[0] ?? 0;
    // Thames against the Highland, in January.
    expect(january(1)).toBeGreaterThan(january(17));
    // And the extremes are where they should be: South West England is the mildest
    // January on the table, the Highland the coldest.
    const januaries = CLIMATE_REGIONS.filter((r) => r.id !== 0).map((r) => r.monthlyMeanExternalC[0] ?? 0);
    expect(Math.max(...januaries)).toBe(january(4));
    expect(Math.min(...januaries)).toBe(january(17));
  });

  it('sums to a 365-day year', () => {
    expect(DAYS_IN_MONTH.reduce((a, b) => a + b, 0)).toBe(365);
  });
});

describe('heat through a square metre over the heating season', () => {
  it('is U times degree-days times 24 hours', () => {
    /*
     * A 0.30 W/(m2*K) wall in the UK average region, room at 20 C, base 15.5 C.
     *
     * Every month on the UK average row is below 15.5 except June (14.6 — below),
     * July (16.6) and August (16.4). So ten months count. January alone:
     *   (20 - 4.3) K * 31 days = 486.7 K.day
     *   0.30 W/(m2*K) * 486.7 K.day * 24 h = 3504.24 Wh = 3.50424 kWh/m2
     */
    const result = seasonalHeatLoss(0.3, 0, 20);
    const january = result.months[0];
    expect(january?.degreeDaysKDay).toBeCloseTo(486.7, 10);
    expect(january?.lossKWhPerM2).toBeCloseTo(3.50424, 10);
    expect(result.heatingMonthCount).toBe(10);
    expect(result.months[6]?.isHeatingMonth).toBe(false); // July, 16.6 C
    expect(result.months[7]?.isHeatingMonth).toBe(false); // August, 16.4 C
    expect(result.months[5]?.isHeatingMonth).toBe(true); // June, 14.6 C
  });

  it('loses from the room temperature, not from the base temperature', () => {
    /*
     * The base decides *whether* a month is heated; the room temperature decides how
     * much the fabric loses once it is. Using the base for both would understate every
     * month by (theta_i - base) times its length.
     */
    const result = seasonalHeatLoss(1, 0, 20, 15.5);
    const january = result.months[0];
    // (20 - 4.3) * 31 = 486.7, not (15.5 - 4.3) * 31 = 347.2
    expect(january?.degreeDaysKDay).toBeCloseTo(486.7, 10);
  });

  it('counts more months as the base temperature rises', () => {
    const low = seasonalHeatLoss(0.3, 0, 20, 10);
    const high = seasonalHeatLoss(0.3, 0, 20, 18);
    expect(low.heatingMonthCount).toBeLessThan(high.heatingMonthCount);
    expect(high.heatingMonthCount).toBe(12);
    expect(high.heatingSeasonLossKWhPerM2).toBeGreaterThan(low.heatingSeasonLossKWhPerM2);
  });

  it('never exceeds the whole-year figure', () => {
    // The annual total counts every month; the season is a subset of it.
    for (const region of CLIMATE_REGIONS) {
      const result = seasonalHeatLoss(0.3, region.id, 20);
      expect(result.heatingSeasonLossKWhPerM2).toBeLessThanOrEqual(
        result.annualLossKWhPerM2 + 1e-9,
      );
    }
  });

  it('loses more in the Highland than on the Thames', () => {
    const thames = seasonalHeatLoss(0.3, 1, 20);
    const highland = seasonalHeatLoss(0.3, 17, 20);
    expect(highland.heatingSeasonLossKWhPerM2).toBeGreaterThan(
      thames.heatingSeasonLossKWhPerM2,
    );
  });

  it('scales with the U-value, since nothing else in it depends on the element', () => {
    const poor = seasonalHeatLoss(1.2, 0, 20);
    const good = seasonalHeatLoss(0.3, 0, 20);
    expect(poor.heatingSeasonLossKWhPerM2).toBeCloseTo(good.heatingSeasonLossKWhPerM2 * 4, 9);
  });
});

describe('what that heat costs to supply', () => {
  it('divides by the efficiency to get the fuel bought', () => {
    /*
     * 100 kWh delivered by a condensing gas boiler at 0.9:
     *   fuel      = 100 / 0.9          = 111.111 kWh
     *   emissions = 111.111 * 0.210    = 23.333 kg CO2e
     *   primary   = 111.111 * 1.130    = 125.556 kWh
     *   cost      = 111.111 * 3.64p    = 404.44p = £4.04
     */
    const result = costOfHeat(100, { fuelId: 'mains-gas', efficiency: 0.9 }, 3.64);
    expect(result.fuelKWh).toBeCloseTo(111.1111, 4);
    expect(result.emissionsKgCO2e).toBeCloseTo(23.3333, 4);
    expect(result.primaryEnergyKWh).toBeCloseTo(125.5556, 4);
    expect(result.costGBP).toBeCloseTo(4.0444, 4);
  });

  it('multiplies heat by a heat pump, which is the whole point of one', () => {
    /*
     * The same 100 kWh from an air source heat pump at a seasonal CoP of 3:
     *   fuel      = 100 / 3        = 33.333 kWh of electricity
     *   emissions = 33.333 * 0.136 = 4.533 kg CO2e
     * Against the gas boiler's 23.33 kg — about a fifth, because it buys a fifth as
     * much carbon per unit AND needs a third as much of it.
     */
    const pump = costOfHeat(100, { fuelId: 'electricity', efficiency: 3 }, 16.49);
    expect(pump.fuelKWh).toBeCloseTo(33.3333, 4);
    expect(pump.emissionsKgCO2e).toBeCloseTo(4.5333, 4);
    const gas = costOfHeat(100, { fuelId: 'mains-gas', efficiency: 0.9 }, 3.64);
    expect(pump.emissionsKgCO2e).toBeLessThan(gas.emissionsKgCO2e / 5);
  });

  it('shows direct electric as the case a heat pump is not', () => {
    // Same fuel, no multiplication: worse than gas on carbon at these factors.
    const direct = costOfHeat(100, { fuelId: 'electricity', efficiency: 1 }, 16.49);
    expect(direct.emissionsKgCO2e).toBeCloseTo(13.6, 10);
    expect(direct.fuelKWh).toBe(100);
  });

  it('refuses a fuel it does not have factors for', () => {
    expect(() => costOfHeat(100, { fuelId: 'unobtainium', efficiency: 1 }, 5)).toThrow();
  });

  it('carries every fuel with all three factors', () => {
    for (const candidate of FUELS) {
      expect(fuel(candidate.id)).toBe(candidate);
      expect(candidate.emissionsKgCO2ePerKWh).toBeGreaterThan(0);
      expect(candidate.primaryEnergyFactor).toBeGreaterThan(1);
    }
  });
});
