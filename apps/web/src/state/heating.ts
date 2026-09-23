import {
  CLIMATE_REGIONS,
  DEFAULT_HEATING_BASE_TEMPERATURE_C,
  HEAT_SOURCE_PRESETS,
  fuel,
} from '@openuvalue/engine';

/**
 * Where the building is and how it is heated. Asked once, on the Conditions tab, and
 * read by the Energy and Retrofit tabs, so the two can never quietly cost the same wall
 * with different weather or a different boiler.
 */
export interface HeatingSettings {
  /** SAP climate region, 0 for the UK average. */
  readonly regionId: number;
  readonly presetId: string;
  /** Seasonal efficiency, or a seasonal CoP where above 1. */
  readonly efficiency: number;
  readonly pricePerKWhPence: number;
  readonly baseTemperatureC: number;
}

export const DEFAULT_HEATING_SETTINGS: HeatingSettings = {
  regionId: 0,
  presetId: 'gas-condensing',
  efficiency: 0.9,
  // A placeholder to overwrite, not a market price: the tab says as much beside the
  // figure it produces. SAP's own fuel prices are 2021 figures and well out of date.
  pricePerKWhPence: 7,
  baseTemperatureC: DEFAULT_HEATING_BASE_TEMPERATURE_C,
};

/**
 * Pick a heating system. Its efficiency and its fuel's SAP price come with it, as a
 * starting point for someone who does not know theirs; both stay editable.
 */
export function withHeatSource(settings: HeatingSettings, presetId: string): HeatingSettings {
  const preset = HEAT_SOURCE_PRESETS.find((candidate) => candidate.id === presetId);
  if (preset === undefined) {
    return settings;
  }
  const fuelFactors = fuel(preset.source.fuelId);
  return {
    ...settings,
    presetId,
    efficiency: preset.source.efficiency,
    pricePerKWhPence: fuelFactors?.priceP2021PerKWh ?? settings.pricePerKWhPence,
  };
}

/** One line naming the settings, for the tabs that use them without asking for them. */
export function heatingSummary(settings: HeatingSettings): string {
  const region = CLIMATE_REGIONS.find((candidate) => candidate.id === settings.regionId);
  const preset = HEAT_SOURCE_PRESETS.find((candidate) => candidate.id === settings.presetId);
  return [
    region?.name ?? 'UK average',
    `${preset?.label ?? 'Heating'}, ${settings.efficiency > 1 ? 'CoP' : 'efficiency'} ${settings.efficiency}`,
    `${settings.pricePerKWhPence} p/kWh`,
  ].join(' · ');
}
