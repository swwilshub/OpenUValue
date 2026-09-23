import { CLIMATE_REGIONS, HEAT_SOURCE_PRESETS } from '@openuvalue/engine';
import type { HeatingSettings } from '../state/heating.js';
import { withHeatSource } from '../state/heating.js';
import { HelpButton } from './guide/Guide.js';

export interface HeatingPanelProps {
  readonly onOpenGuide: (topicId: string) => void;
  readonly settings: HeatingSettings;
  readonly onChange: (settings: HeatingSettings) => void;
}

/**
 * Where the building is and how it is heated, for the Energy and Retrofit tabs. Nothing
 * on this tab's U-value or condensation depends on it; it sits with the conditions
 * because it is the other half of "what is this element up against".
 */
export function HeatingPanel({ onOpenGuide, settings, onChange }: HeatingPanelProps): JSX.Element {
  const preset = HEAT_SOURCE_PRESETS.find((candidate) => candidate.id === settings.presetId);
  const set = (patch: Partial<HeatingSettings>): void => onChange({ ...settings, ...patch });

  return (
    <section className="panel">
      <h2>
        Climate and heating
        <HelpButton topicId="energy-inputs" label="region, heating and fuel price" onOpen={onOpenGuide} />
      </h2>
      <p className="panel-intro">
        Used by the Energy and Retrofit tabs to put a cost and a carbon figure on the heat
        lost. The U-value and the moisture checks do not use it.
      </p>

      <div className="energy-controls">
        <label className="field">
          <span className="field-caption">Where the building is</span>
          <select
            value={settings.regionId}
            onChange={(event) => set({ regionId: Number(event.target.value) })}
          >
            {CLIMATE_REGIONS.map((region) => (
              <option key={region.id} value={region.id}>
                {region.id === 0 ? region.name : `${region.id}. ${region.name}`}
              </option>
            ))}
          </select>
        </label>

        <label className="field">
          <span className="field-caption">How it is heated</span>
          <select
            value={settings.presetId}
            onChange={(event) => onChange(withHeatSource(settings, event.target.value))}
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
            {settings.efficiency > 1 ? 'Seasonal CoP' : 'Seasonal efficiency'}
          </span>
          <input
            type="number"
            min={0.1}
            step={0.05}
            value={settings.efficiency}
            onChange={(event) => set({ efficiency: Math.max(0.1, Number(event.target.value)) })}
          />
        </label>

        <label className="field">
          <span className="field-caption">Fuel price, p/kWh</span>
          <input
            type="number"
            min={0}
            step={0.1}
            value={settings.pricePerKWhPence}
            onChange={(event) => set({ pricePerKWhPence: Math.max(0, Number(event.target.value)) })}
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
            value={settings.baseTemperatureC}
            onChange={(event) => set({ baseTemperatureC: Number(event.target.value) })}
          />
        </label>
      </div>

      {preset !== undefined && <p className="footnote">{preset.note}</p>}
    </section>
  );
}
