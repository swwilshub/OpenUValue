import { describe, expect, it } from 'vitest';
import { DEFAULT_HEATING_SETTINGS, heatingSummary, withHeatSource } from '../heating.js';

describe('heating settings', () => {
  it('takes the efficiency and the fuel price from the heating system picked', () => {
    // heatSource.ts: 'gas-condensing' is mains gas at 0.9, and SAP 10.2 Table 12 prices
    // mains gas at 3.64 p/kWh (the 2021 figure the engine carries).
    const gas = withHeatSource(
      { ...DEFAULT_HEATING_SETTINGS, efficiency: 0.5, pricePerKWhPence: 99 },
      'gas-condensing',
    );
    expect(gas.efficiency).toBe(0.9);
    expect(gas.pricePerKWhPence).toBe(3.64);
  });

  it('leaves the settings alone for a heating system it does not know', () => {
    expect(withHeatSource(DEFAULT_HEATING_SETTINGS, 'no-such-system')).toBe(
      DEFAULT_HEATING_SETTINGS,
    );
  });

  it('keeps the region and base temperature when the heating system changes', () => {
    const start = { ...DEFAULT_HEATING_SETTINGS, regionId: 3, baseTemperatureC: 14 };
    const next = withHeatSource(start, 'gas-condensing');
    expect(next.regionId).toBe(3);
    expect(next.baseTemperatureC).toBe(14);
  });

  it('names the defaults in one line', () => {
    expect(heatingSummary(DEFAULT_HEATING_SETTINGS)).toBe(
      'UK average · Gas boiler, condensing, efficiency 0.9 · 7 p/kWh',
    );
  });
});
