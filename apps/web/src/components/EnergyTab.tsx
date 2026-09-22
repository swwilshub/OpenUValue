import { useMemo, useState } from 'react';
import {
  CLIMATE_REGIONS,
  DEFAULT_HEATING_BASE_TEMPERATURE_C,
  HEAT_SOURCE_PRESETS,
  costOfHeat,
  fuel,
  seasonalHeatLoss,
} from '@openuvalue/engine';
import type { UValueResult } from '@openuvalue/engine';
import { HelpButton } from './guide/Guide.js';

/**
 * What one square metre of this element costs to keep warm, where the building is.
 *
 * Everything here rests on SAP — the UK's own methodology, published free — rather than
 * on figures we have chosen: Table U1 for monthly temperatures by region, Table 12 for
 * what a fuel costs in carbon, primary energy and money. The one exception is the base
 * temperature that decides which months count as heating months, which is ours and says
 * so.
 */

export interface EnergyTabProps {
  readonly onOpenGuide: (topicId: string) => void;
  readonly result: UValueResult;
  readonly internalTemperatureC: number;
}

function Figure({
  label,
  value,
  unit,
  note,
}: {
  readonly label: string;
  readonly value: string;
  readonly unit: string;
  readonly note: string;
}): JSX.Element {
  return (
    <div className="energy-figure">
      <span className="energy-figure-label">{label}</span>
      <strong>
        {value} <span className="energy-figure-unit">{unit}</span>
      </strong>
      <em>{note}</em>
    </div>
  );
}

export function EnergyTab({
  onOpenGuide,
  result,
  internalTemperatureC,
}: EnergyTabProps): JSX.Element {
  const [regionId, setRegionId] = useState(0);
  const [presetId, setPresetId] = useState('gas-condensing');
  const [efficiency, setEfficiency] = useState(0.9);
  const [pricePerKWh, setPricePerKWh] = useState(7.0);
  const [baseC, setBaseC] = useState(DEFAULT_HEATING_BASE_TEMPERATURE_C);

  const preset = HEAT_SOURCE_PRESETS.find((candidate) => candidate.id === presetId);
  const fuelId = preset?.source.fuelId ?? 'mains-gas';
  const factors = fuel(fuelId);

  const uValue = result.uValueWPerM2K;

  const season = useMemo(
    () =>
      uValue === null ? undefined : seasonalHeatLoss(uValue, regionId, internalTemperatureC, baseC),
    [uValue, regionId, internalTemperatureC, baseC],
  );

  const cost = useMemo(
    () =>
      season === undefined
        ? undefined
        : costOfHeat(season.heatingSeasonLossKWhPerM2, { fuelId, efficiency }, pricePerKWh),
    [season, fuelId, efficiency, pricePerKWh],
  );

  if (uValue === null || season === undefined || cost === undefined) {
    return (
      <section className="panel">
        <h2>Energy and carbon</h2>
        <p className="verdict verdict-risk">
          This build-up has no U-value, because it is outside the scope of the combined
          method, so there is nothing to put a heating cost against. Fix that on the
          Build-up and U-value tab and this fills in.
        </p>
      </section>
    );
  }

  const peak = Math.max(...season.months.map((month) => month.lossKWhPerM2), 0.0001);

  return (
    <section className="panel energy-tab">
      <h2>
        Energy and carbon
        <HelpButton topicId="energy-season" label="the heating season figures" onOpen={onOpenGuide} />
      </h2>

      <div className="energy-controls">
        <label className="field">
          <span className="field-caption">Where the building is</span>
          <select value={regionId} onChange={(event) => setRegionId(Number(event.target.value))}>
            {CLIMATE_REGIONS.map((region) => (
              <option key={region.id} value={region.id}>
                {region.id === 0 ? region.name : `${region.id}. ${region.name}`}
              </option>
            ))}
          </select>
        </label>

        <label className="field">
          <span className="field-caption">
            How it is heated
            <HelpButton topicId="energy-inputs" label="region, heating and fuel price" onOpen={onOpenGuide} />
          </span>
          <select
            value={presetId}
            onChange={(event) => {
              setPresetId(event.target.value);
              const next = HEAT_SOURCE_PRESETS.find((c) => c.id === event.target.value);
              if (next !== undefined) {
                setEfficiency(next.source.efficiency);
                const f = fuel(next.source.fuelId);
                if (f !== undefined) {
                  setPricePerKWh(f.priceP2021PerKWh);
                }
              }
            }}
          >
            {HEAT_SOURCE_PRESETS.map((candidate) => (
              <option key={candidate.id} value={candidate.id}>
                {candidate.label}
              </option>
            ))}
          </select>
        </label>

        <label className="field">
          <span className="field-caption">
            {efficiency > 1 ? 'Seasonal CoP' : 'Seasonal efficiency'}
          </span>
          <input
            type="number"
            min={0.1}
            step={0.05}
            value={efficiency}
            onChange={(event) => setEfficiency(Math.max(0.1, Number(event.target.value)))}
          />
        </label>

        <label className="field">
          <span className="field-caption">Fuel price, p/kWh</span>
          <input
            type="number"
            min={0}
            step={0.1}
            value={pricePerKWh}
            onChange={(event) => setPricePerKWh(Math.max(0, Number(event.target.value)))}
          />
        </label>

        <label className="field">
          <span className="field-caption">
            Heating base, °C
            <HelpButton topicId="energy-months" label="the heating base temperature" onOpen={onOpenGuide} />
          </span>
          <input
            type="number"
            min={5}
            max={20}
            step={0.5}
            value={baseC}
            onChange={(event) => setBaseC(Number(event.target.value))}
          />
        </label>
      </div>

      {preset !== undefined && <p className="footnote">{preset.note}</p>}

      <h3>
        Per square metre, over a year
        <HelpButton topicId="energy-figures" label="the energy figures" onOpen={onOpenGuide} />
      </h3>
      <div className="energy-figures">
        <Figure
          label="Heat lost through this element"
          value={season.heatingSeasonLossKWhPerM2.toFixed(1)}
          unit="kWh/m²"
          note={`over ${season.heatingMonthCount} heating months in ${season.region.name}, at U = ${uValue.toFixed(2)}`}
        />
        <Figure
          label="Fuel to replace it"
          value={cost.fuelKWh.toFixed(1)}
          unit="kWh/m²"
          note={`${efficiency > 1 ? 'a CoP' : 'an efficiency'} of ${efficiency} on ${factors?.label.toLowerCase() ?? 'the fuel'}`}
        />
        <Figure
          label="Carbon"
          value={cost.emissionsKgCO2e.toFixed(1)}
          unit="kg CO₂e/m²"
          note={`at SAP's ${factors?.emissionsKgCO2ePerKWh ?? 0} kg per kWh of fuel`}
        />
        <Figure
          label="Primary energy"
          value={cost.primaryEnergyKWh.toFixed(1)}
          unit="kWh/m²"
          note={`factor ${factors?.primaryEnergyFactor ?? 0}, counting what it took to deliver the fuel`}
        />
        <Figure
          label="Cost"
          value={`£${cost.costGBP.toFixed(2)}`}
          unit="/m²"
          note={`at ${pricePerKWh} p/kWh, a price you should set yourself`}
        />
      </div>

      <h3>
        Month by month
        <HelpButton topicId="energy-months" label="the monthly bars" onOpen={onOpenGuide} />
      </h3>
      <ul className="month-bars">
        {season.months.map((month) => (
          <li key={month.monthIndex} className={month.isHeatingMonth ? '' : 'is-off-season'}>
            <span className="month-name">{month.name.slice(0, 3)}</span>
            <span className="month-bar-track">
              <span
                className="month-bar-fill"
                style={{ width: `${(month.lossKWhPerM2 / peak) * 100}%` }}
              />
            </span>
            <span className="month-value">
              {month.isHeatingMonth ? `${month.lossKWhPerM2.toFixed(2)} kWh/m²` : 'no heating'}
            </span>
            <span className="month-temp">{month.meanExternalC.toFixed(1)} °C</span>
          </li>
        ))}
      </ul>

      <details className="explain">
        <summary>What this is, and what it is not</summary>
        <p className="tour-caveat">
          <strong>This is heat lost through the fabric, not the heating demand.</strong>{' '}
          People, cooking, appliances and sunlight through the windows all put heat into a
          building, and that heat meets part of the loss. What a boiler or heat pump
          actually has to supply is therefore less than the figure above. How much less
          depends on the whole dwelling, its windows and how it is occupied, which is a
          different calculation from this one and not one an element on its own can
          answer.
        </p>
        <p className="tour-caveat">
          Monthly temperatures are SAP 10.2 Table U1, by region. The emission, primary
          energy and price factors are SAP 10.2 Table 12. The <strong>base temperature</strong>{' '}
          that decides which months count as heating months is ours rather than SAP&rsquo;s:
          15.5 °C is the long-standing UK degree-day base, but it depends on the building
          rather than the weather, so it is yours to change.
        </p>
        <p className="tour-caveat">
          <strong>The prices are stale on purpose.</strong> SAP&rsquo;s Table 12 prices were
          set in 2021 and UK energy prices have moved a very long way since, so they are a
          starting point to overwrite rather than an answer. The carbon and primary energy
          factors are policy figures and steadier. Electricity&rsquo;s carbon factor still
          falls as the grid decarbonises, so a comparison made today flatters gas over the
          life of a building.
        </p>
      </details>
    </section>
  );
}
