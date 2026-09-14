import { assertFiniteNumber } from './errors.js';
import type { DegreesCelsius, WattsPerSquareMetreKelvin } from './units.js';

/**
 * UK monthly climate, from the Government's Standard Assessment Procedure.
 *
 * SAP is the UK's own methodology for the energy performance of dwellings, published by
 * BRE for the department of state, and free. Its **Appendix U, Table U1** tabulates mean
 * external temperature by month for 21 regions plus a UK average, which is the thing
 * this file needs and the reason it can exist: OpenUValue has refused to give an annual
 * answer until now because it shipped no climate data and would not invent any.
 *
 * Quoted from SAP 10.2 (17-12-2021), Table U1, with the note that heads it: "These data
 * are for typical height above sea level representative of the region (see Table U4)."
 *
 * TODO(verify): whether SAP 10.3 revises Table U1, and Table U6's postcode-to-region
 * mapping, which is not reproduced here. VERIFY.md row V32.
 */

export interface ClimateRegion {
  /** SAP's own region number. 0 is the UK average. */
  readonly id: number;
  readonly name: string;
  /** Mean external temperature by month, January first, °C. */
  readonly monthlyMeanExternalC: readonly DegreesCelsius[];
}

/** Days in each month, January first. A non-leap year, as SAP's monthly method uses. */
export const DAYS_IN_MONTH: readonly number[] = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

export const MONTH_NAMES: readonly string[] = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/** SAP 10.2 Table U1: mean external temperature, °C. */
export const CLIMATE_REGIONS: readonly ClimateRegion[] = [
  { id: 0, name: 'UK average', monthlyMeanExternalC: [4.3, 4.9, 6.5, 8.9, 11.7, 14.6, 16.6, 16.4, 14.1, 10.6, 7.1, 4.2] },
  { id: 1, name: 'Thames', monthlyMeanExternalC: [5.1, 5.6, 7.4, 9.9, 13.0, 16.0, 17.9, 17.8, 15.2, 11.6, 8.0, 5.1] },
  { id: 2, name: 'South East England', monthlyMeanExternalC: [5.0, 5.4, 7.1, 9.5, 12.6, 15.4, 17.4, 17.5, 15.0, 11.7, 8.1, 5.2] },
  { id: 3, name: 'Southern England', monthlyMeanExternalC: [5.4, 5.7, 7.3, 9.6, 12.6, 15.4, 17.3, 17.3, 15.0, 11.8, 8.4, 5.5] },
  { id: 4, name: 'South West England', monthlyMeanExternalC: [6.1, 6.4, 7.5, 9.3, 11.9, 14.5, 16.2, 16.3, 14.6, 11.8, 9.0, 6.4] },
  { id: 5, name: 'Severn Wales / Severn England', monthlyMeanExternalC: [4.9, 5.3, 7.0, 9.3, 12.2, 15.0, 16.7, 16.7, 14.4, 11.1, 7.8, 4.9] },
  { id: 6, name: 'Midlands', monthlyMeanExternalC: [4.3, 4.8, 6.6, 9.0, 11.8, 14.8, 16.6, 16.5, 14.0, 10.5, 7.1, 4.2] },
  { id: 7, name: 'West Pennines Wales / West Pennines England', monthlyMeanExternalC: [4.7, 5.2, 6.7, 9.1, 12.0, 14.7, 16.4, 16.3, 14.1, 10.7, 7.5, 4.6] },
  { id: 8, name: 'North West England / South West Scotland', monthlyMeanExternalC: [3.9, 4.3, 5.6, 7.9, 10.7, 13.2, 14.9, 14.8, 12.8, 9.7, 6.6, 3.7] },
  { id: 9, name: 'Borders Scotland / Borders England', monthlyMeanExternalC: [4.0, 4.5, 5.8, 7.9, 10.4, 13.3, 15.2, 15.1, 13.1, 9.7, 6.6, 3.7] },
  { id: 10, name: 'North East England', monthlyMeanExternalC: [4.0, 4.6, 6.1, 8.3, 10.9, 13.8, 15.8, 15.6, 13.5, 10.1, 6.7, 3.8] },
  { id: 11, name: 'East Pennines', monthlyMeanExternalC: [4.3, 4.9, 6.5, 8.9, 11.7, 14.6, 16.6, 16.4, 14.1, 10.6, 7.1, 4.2] },
  { id: 12, name: 'East Anglia', monthlyMeanExternalC: [4.7, 5.2, 7.0, 9.5, 12.5, 15.4, 17.6, 17.6, 15.0, 11.4, 7.7, 4.7] },
  { id: 13, name: 'Wales', monthlyMeanExternalC: [5.0, 5.3, 6.5, 8.5, 11.2, 13.7, 15.3, 15.3, 13.5, 10.7, 7.8, 5.2] },
  { id: 14, name: 'West Scotland', monthlyMeanExternalC: [4.0, 4.4, 5.6, 7.9, 10.4, 13.0, 14.5, 14.4, 12.5, 9.3, 6.5, 3.8] },
  { id: 15, name: 'East Scotland', monthlyMeanExternalC: [3.6, 4.0, 5.4, 7.7, 10.1, 12.9, 14.6, 14.5, 12.5, 9.2, 6.1, 3.2] },
  { id: 16, name: 'North East Scotland', monthlyMeanExternalC: [3.3, 3.6, 5.0, 7.1, 9.3, 12.2, 14.0, 13.9, 12.0, 8.8, 5.7, 2.9] },
  { id: 17, name: 'Highland', monthlyMeanExternalC: [3.1, 3.2, 4.4, 6.6, 8.9, 11.4, 13.2, 13.1, 11.3, 8.2, 5.4, 2.7] },
  { id: 18, name: 'Western Isles', monthlyMeanExternalC: [5.2, 5.0, 5.8, 7.6, 9.7, 11.8, 13.4, 13.6, 12.1, 9.6, 7.3, 5.2] },
  { id: 19, name: 'Orkney', monthlyMeanExternalC: [4.4, 4.2, 5.0, 7.0, 8.9, 11.2, 13.1, 13.2, 11.7, 9.1, 6.6, 4.3] },
  { id: 20, name: 'Shetland', monthlyMeanExternalC: [4.6, 4.1, 4.7, 6.5, 8.3, 10.5, 12.4, 12.8, 11.4, 8.8, 6.5, 4.6] },
  { id: 21, name: 'Northern Ireland', monthlyMeanExternalC: [4.8, 5.2, 6.4, 8.4, 10.9, 13.5, 15.0, 14.9, 13.1, 10.0, 7.2, 4.7] },
];

export function climateRegion(id: number): ClimateRegion | undefined {
  return CLIMATE_REGIONS.find((region) => region.id === id);
}

/**
 * Base temperature for deciding which months need heating, °C.
 *
 * **In-house, and the one figure here that is not SAP's.** A building does not need
 * heating the moment it is colder outside than in: internal gains from people, cooking
 * and appliances, plus sun through the windows, carry it some way. The base temperature
 * is where that runs out. 15,5 °C is the long-standing UK degree-day base and is used as
 * the default, but it depends on the building rather than the weather, so it is exposed
 * as an input.
 *
 * TODO(verify): a citable source for 15,5 °C as the UK degree-day base. VERIFY.md V33.
 */
export const DEFAULT_HEATING_BASE_TEMPERATURE_C = 15.5;

export interface MonthlyHeatLoss {
  readonly monthIndex: number;
  readonly name: string;
  readonly meanExternalC: DegreesCelsius;
  /** True where this month counts towards the heating season. */
  readonly isHeatingMonth: boolean;
  /** Degree-days for the month against the internal temperature, K*day. */
  readonly degreeDaysKDay: number;
  /** Heat through one square metre of the element this month, kWh/m^2. */
  readonly lossKWhPerM2: number;
}

export interface SeasonalHeatLoss {
  readonly region: ClimateRegion;
  readonly internalTemperatureC: DegreesCelsius;
  readonly baseTemperatureC: DegreesCelsius;
  readonly uValueWPerM2K: WattsPerSquareMetreKelvin;
  readonly months: readonly MonthlyHeatLoss[];
  /** Over the heating months only, kWh/m^2. */
  readonly heatingSeasonLossKWhPerM2: number;
  /** Over all twelve months, kWh/m^2. */
  readonly annualLossKWhPerM2: number;
  /** Degree-days over the heating months, K*day. */
  readonly heatingDegreeDaysKDay: number;
  readonly heatingMonthCount: number;
}

/**
 * Heat through one square metre of an element over the heating season.
 *
 *   Q = U * (theta_i - theta_e) * t
 *
 * summed month by month, with t the length of the month. Which months count is decided
 * by the **base** temperature, but the heat lost in them is driven by the **internal**
 * temperature: a month is a heating month when it is cold enough that gains no longer
 * cover the losses, and in such a month the fabric still loses heat all the way down
 * from the room temperature, not from the base.
 *
 * **This is heat loss, not heating demand.** Internal and solar gains meet part of it, so
 * the energy a heating system has to supply is less than this — how much less depends on
 * the whole dwelling rather than on one element, which is why this stops at the fabric.
 */
export function seasonalHeatLoss(
  uValueWPerM2K: WattsPerSquareMetreKelvin,
  regionId: number,
  internalTemperatureC: DegreesCelsius,
  baseTemperatureC: DegreesCelsius = DEFAULT_HEATING_BASE_TEMPERATURE_C,
): SeasonalHeatLoss {
  assertFiniteNumber(uValueWPerM2K, 'uValueWPerM2K');
  assertFiniteNumber(internalTemperatureC, 'internalTemperatureC');
  assertFiniteNumber(baseTemperatureC, 'baseTemperatureC');
  const region = climateRegion(regionId) ?? CLIMATE_REGIONS[0];
  if (region === undefined) {
    throw new Error('no climate regions are defined');
  }

  const months: MonthlyHeatLoss[] = region.monthlyMeanExternalC.map((meanExternalC, monthIndex) => {
    const days = DAYS_IN_MONTH[monthIndex] ?? 30;
    const isHeatingMonth = meanExternalC < baseTemperatureC;
    const degreeDaysKDay = isHeatingMonth
      ? Math.max(0, internalTemperatureC - meanExternalC) * days
      : 0;
    // W/(m2*K) * K*day * 24 h/day / 1000 = kWh/m2.
    const lossKWhPerM2 = (uValueWPerM2K * degreeDaysKDay * 24) / 1000;
    return {
      monthIndex,
      name: MONTH_NAMES[monthIndex] ?? '',
      meanExternalC,
      isHeatingMonth,
      degreeDaysKDay,
      lossKWhPerM2,
    };
  });

  const heatingSeasonLossKWhPerM2 = months.reduce((total, month) => total + month.lossKWhPerM2, 0);
  const annualLossKWhPerM2 = months.reduce((total, month, monthIndex) => {
    const days = DAYS_IN_MONTH[monthIndex] ?? 30;
    const swing = Math.max(0, internalTemperatureC - month.meanExternalC);
    return total + (uValueWPerM2K * swing * days * 24) / 1000;
  }, 0);

  return {
    region,
    internalTemperatureC,
    baseTemperatureC,
    uValueWPerM2K,
    months,
    heatingSeasonLossKWhPerM2,
    annualLossKWhPerM2,
    heatingDegreeDaysKDay: months.reduce((total, month) => total + month.degreeDaysKDay, 0),
    heatingMonthCount: months.filter((month) => month.isHeatingMonth).length,
  };
}
