import type { UValueResult } from '@openuvalue/engine';
import { costOfHeat, seasonalHeatLoss } from '@openuvalue/engine';
import type { HeatSource } from '@openuvalue/engine';

/**
 * What a retrofit saves, and how long it takes to pay for itself.
 *
 * The arithmetic is deliberately plain, because the honest part of this calculation is
 * what it refuses to claim rather than what it computes. Two U-values, the same weather
 * and the same heating system, give a saving per square metre per year; the cost of the
 * work divided by that saving is a payback in years.
 *
 * **What it leaves out, all of which make real paybacks longer:** fuel prices change,
 * and the figure here assumes today's forever. A fabric improvement changes the heat
 * loss but people often take part of the benefit as a warmer house rather than a smaller
 * bill — the rebound effect — so the cash saved is usually less than the heat saved.
 * Nothing here accounts for maintenance, disruption, or the carbon and money already
 * spent making the insulation, which is the embodied side and needs data this tool does
 * not have. And a payback in years says nothing about whether the work is worth doing:
 * a wall that stays warm and dry is worth something a spreadsheet will not show.
 */

export interface RetrofitInputs {
  readonly before: UValueResult;
  readonly after: UValueResult;
  readonly regionId: number;
  readonly internalTemperatureC: number;
  readonly baseTemperatureC: number;
  readonly source: HeatSource;
  readonly pricePerKWhPence: number;
  /** Area of the element being improved, m^2. */
  readonly areaM2: number;
  /** What the work costs in total, pounds. */
  readonly costGBP: number;
}

export interface RetrofitResult {
  readonly beforeLossKWhPerM2: number;
  readonly afterLossKWhPerM2: number;
  readonly savedKWhPerM2: number;
  /** Over the whole element, per year. */
  readonly savedKWhPerYear: number;
  readonly savedFuelKWhPerYear: number;
  readonly savedCO2KgPerYear: number;
  readonly savedGBPPerYear: number;
  /** Years for the saving to cover the cost, or undefined where it never does. */
  readonly paybackYears: number | undefined;
  /** True where the work makes the element worse, which a payback cannot describe. */
  readonly makesItWorse: boolean;
}

export function assessRetrofit(inputs: RetrofitInputs): RetrofitResult | undefined {
  const beforeU = inputs.before.uValueWPerM2K;
  const afterU = inputs.after.uValueWPerM2K;
  if (beforeU === null || afterU === null) {
    return undefined;
  }

  const lossFor = (u: number): number =>
    seasonalHeatLoss(u, inputs.regionId, inputs.internalTemperatureC, inputs.baseTemperatureC)
      .heatingSeasonLossKWhPerM2;

  const beforeLossKWhPerM2 = lossFor(beforeU);
  const afterLossKWhPerM2 = lossFor(afterU);
  const savedKWhPerM2 = beforeLossKWhPerM2 - afterLossKWhPerM2;
  const savedKWhPerYear = savedKWhPerM2 * inputs.areaM2;

  /*
   * The saving is the difference between two heat *deliveries*, so it has to be costed
   * through the heating system the same way each of them would be — not costed once as a
   * lump. With a single system and a constant efficiency those come to the same thing,
   * which is why this can be a subtraction; it is written as one so that it stays right
   * if the two sides ever differ.
   */
  const beforeCost = costOfHeat(
    beforeLossKWhPerM2 * inputs.areaM2,
    inputs.source,
    inputs.pricePerKWhPence,
  );
  const afterCost = costOfHeat(
    afterLossKWhPerM2 * inputs.areaM2,
    inputs.source,
    inputs.pricePerKWhPence,
  );

  const savedGBPPerYear = beforeCost.costGBP - afterCost.costGBP;
  const makesItWorse = savedKWhPerM2 <= 0;

  return {
    beforeLossKWhPerM2,
    afterLossKWhPerM2,
    savedKWhPerM2,
    savedKWhPerYear,
    savedFuelKWhPerYear: beforeCost.fuelKWh - afterCost.fuelKWh,
    savedCO2KgPerYear: beforeCost.emissionsKgCO2e - afterCost.emissionsKgCO2e,
    savedGBPPerYear,
    // A payback needs a saving to pay it back. Free work pays back instantly; work that
    // saves nothing never does, and saying "0 years" for either would be wrong.
    paybackYears:
      savedGBPPerYear > 0 ? inputs.costGBP / savedGBPPerYear : undefined,
    makesItWorse,
  };
}
