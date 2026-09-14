import { assertPositive, assertFiniteNumber } from './errors.js';

/**
 * What it costs, in carbon and in primary energy, to put a kilowatt-hour of heat into a
 * building — and therefore what a square metre of fabric loss is worth saving.
 *
 * The factors are SAP 10.2 (17-12-2021) Table 12, "Fuel prices, emission factors and
 * primary energy factors". SAP is the UK's own methodology, published free, so these are
 * the figures a UK calculation is expected to use rather than ones we have chosen.
 *
 * Two things to be careful of, both of which the UI has to carry rather than bury:
 *
 * **Prices go stale, factors go stale more slowly.** The prices in Table 12 were set in
 * 2021 and UK energy prices have moved a very long way since. They are offered as a
 * starting point and are meant to be overwritten. The emission and primary energy
 * factors are policy figures revised with the grid and are steadier, but they are not
 * permanent either — electricity's carbon factor in particular falls as the grid
 * decarbonises, so a payback calculated today flatters a gas boiler over its lifetime.
 *
 * **Efficiency is separate from the fuel.** A kilowatt-hour of heat delivered into a room
 * is not a kilowatt-hour of fuel bought. A condensing boiler needs rather more than one;
 * a heat pump needs a fraction of one. That is what `efficiency` carries, and it is the
 * single number that decides whether electricity is the dirtiest or the cleanest way to
 * heat a house on these factors.
 */

export interface FuelFactors {
  readonly id: string;
  readonly label: string;
  /** SAP Table 12 emissions, kg CO2e per kWh of *fuel*. */
  readonly emissionsKgCO2ePerKWh: number;
  /** SAP Table 12 primary energy factor, kWh primary per kWh of fuel. */
  readonly primaryEnergyFactor: number;
  /** SAP Table 12 unit price, pence per kWh, as at 2021. Expected to be overridden. */
  readonly priceP2021PerKWh: number;
}

/** SAP 10.2 Table 12, the rows a domestic heating system is likely to use. */
export const FUELS: readonly FuelFactors[] = [
  { id: 'mains-gas', label: 'Mains gas', emissionsKgCO2ePerKWh: 0.21, primaryEnergyFactor: 1.13, priceP2021PerKWh: 3.64 },
  { id: 'heating-oil', label: 'Heating oil', emissionsKgCO2ePerKWh: 0.298, primaryEnergyFactor: 1.18, priceP2021PerKWh: 4.94 },
  { id: 'bulk-lpg', label: 'LPG (bulk)', emissionsKgCO2ePerKWh: 0.241, primaryEnergyFactor: 1.141, priceP2021PerKWh: 6.74 },
  { id: 'electricity', label: 'Electricity', emissionsKgCO2ePerKWh: 0.136, primaryEnergyFactor: 1.501, priceP2021PerKWh: 16.49 },
  { id: 'wood-logs', label: 'Wood logs', emissionsKgCO2ePerKWh: 0.028, primaryEnergyFactor: 1.046, priceP2021PerKWh: 5.12 },
  { id: 'wood-pellets', label: 'Wood pellets (bulk)', emissionsKgCO2ePerKWh: 0.053, primaryEnergyFactor: 1.325, priceP2021PerKWh: 6.25 },
  { id: 'house-coal', label: 'House coal', emissionsKgCO2ePerKWh: 0.395, primaryEnergyFactor: 1.064, priceP2021PerKWh: 5.58 },
];

export function fuel(id: string): FuelFactors | undefined {
  return FUELS.find((candidate) => candidate.id === id);
}

export interface HeatSource {
  readonly fuelId: string;
  /**
   * Heat delivered per unit of fuel. A seasonal efficiency for a boiler (0.9 or so for a
   * condensing one) or a seasonal coefficient of performance for a heat pump (around 3),
   * which is why this is a ratio rather than a percentage: a heat pump's exceeds 1.
   */
  readonly efficiency: number;
}

/** Common starting points. Efficiencies are indicative and meant to be edited. */
export const HEAT_SOURCE_PRESETS: readonly {
  readonly id: string;
  readonly label: string;
  readonly source: HeatSource;
  readonly note: string;
}[] = [
  {
    id: 'gas-condensing',
    label: 'Gas boiler, condensing',
    source: { fuelId: 'mains-gas', efficiency: 0.9 },
    note: 'A modern condensing boiler in good order. Older or badly commissioned ones run well below this.',
  },
  {
    id: 'heat-pump-air',
    label: 'Air source heat pump',
    source: { fuelId: 'electricity', efficiency: 3.0 },
    note: 'A seasonal coefficient of performance of 3, so it moves three units of heat for each unit of electricity. A well-designed system at low flow temperatures does better; one pushed to run radiators hot does worse.',
  },
  {
    id: 'oil-boiler',
    label: 'Oil boiler',
    source: { fuelId: 'heating-oil', efficiency: 0.85 },
    note: 'Typical of a condensing oil boiler.',
  },
  {
    id: 'lpg-boiler',
    label: 'LPG boiler',
    source: { fuelId: 'bulk-lpg', efficiency: 0.89 },
    note: 'Off the gas grid, on a bulk tank.',
  },
  {
    id: 'direct-electric',
    label: 'Direct electric heating',
    source: { fuelId: 'electricity', efficiency: 1.0 },
    note: 'Panel heaters, storage heaters or immersion: all the electricity becomes heat, and none of it is multiplied.',
  },
  {
    id: 'wood-pellet',
    label: 'Wood pellet boiler',
    source: { fuelId: 'wood-pellets', efficiency: 0.85 },
    note: 'Biomass carries a low emission factor under SAP but a high primary energy factor, so it reads very differently on the two.',
  },
];

export interface HeatCost {
  /** Fuel bought to deliver the heat, kWh. */
  readonly fuelKWh: number;
  readonly emissionsKgCO2e: number;
  readonly primaryEnergyKWh: number;
  /** At the price given, in pounds. */
  readonly costGBP: number;
}

/**
 * What delivering a quantity of heat costs, in fuel, carbon, primary energy and money.
 *
 * `deliveredKWh` is heat that ends up in the building — the fabric loss, for this tool's
 * purposes. Dividing by the efficiency gives the fuel that had to be bought to produce
 * it, and everything else follows from that.
 */
export function costOfHeat(
  deliveredKWh: number,
  source: HeatSource,
  pricePerKWhPence: number,
): HeatCost {
  assertFiniteNumber(deliveredKWh, 'deliveredKWh');
  assertPositive(source.efficiency, 'efficiency');
  assertFiniteNumber(pricePerKWhPence, 'pricePerKWhPence');
  const factors = fuel(source.fuelId);
  if (factors === undefined) {
    throw new Error(`unknown fuel "${source.fuelId}"`);
  }
  const fuelKWh = deliveredKWh / source.efficiency;
  return {
    fuelKWh,
    emissionsKgCO2e: fuelKWh * factors.emissionsKgCO2ePerKWh,
    primaryEnergyKWh: fuelKWh * factors.primaryEnergyFactor,
    costGBP: (fuelKWh * pricePerKWhPence) / 100,
  };
}
