import { useMemo, useState } from 'react';
import {
  CLIMATE_REGIONS,
  DEFAULT_HEATING_BASE_TEMPERATURE_C,
  HEAT_SOURCE_PRESETS,
  calculateUValue,
  fuel,
} from '@openuvalue/engine';
import type { UiState } from '../state/model.js';
import { toBuildingElement } from '../state/model.js';
import { assessRetrofit } from '../state/retrofit.js';
import { HelpButton } from './guide/Guide.js';

/**
 * What the work saves, and how long it takes to pay for itself.
 *
 * The build-up on the other tabs is the **finished** wall. Ticking the layers that are
 * new gives the wall as it was for nothing — no second editor, no chance of the two
 * drifting apart, and the comparison is always between two build-ups the tool has
 * actually calculated rather than a remembered U-value.
 */

export interface RetrofitTabProps {
  readonly onOpenGuide: (topicId: string) => void;
  readonly state: UiState;
}

export function RetrofitTab({ onOpenGuide, state }: RetrofitTabProps): JSX.Element {
  const [newLayerIds, setNewLayerIds] = useState<readonly string[]>([]);
  const [regionId, setRegionId] = useState(0);
  const [presetId, setPresetId] = useState('gas-condensing');
  const [efficiency, setEfficiency] = useState(0.9);
  const [pricePerKWh, setPricePerKWh] = useState(7);
  const [areaM2, setAreaM2] = useState(50);
  const [costGBP, setCostGBP] = useState(4000);

  const preset = HEAT_SOURCE_PRESETS.find((candidate) => candidate.id === presetId);
  const fuelId = preset?.source.fuelId ?? 'mains-gas';
  const factors = fuel(fuelId);

  const toggle = (id: string): void =>
    setNewLayerIds((current) =>
      current.includes(id) ? current.filter((candidate) => candidate !== id) : [...current, id],
    );

  const assessment = useMemo(() => {
    if (newLayerIds.length === 0 || newLayerIds.length === state.layers.length) {
      return undefined;
    }
    try {
      const after = calculateUValue(toBuildingElement(state));
      const before = calculateUValue(
        toBuildingElement({
          ...state,
          layers: state.layers.filter((layer) => !newLayerIds.includes(layer.id)),
        }),
      );
      return assessRetrofit({
        before,
        after,
        regionId,
        internalTemperatureC: state.conditions.internalAirTemperatureC,
        baseTemperatureC: DEFAULT_HEATING_BASE_TEMPERATURE_C,
        source: { fuelId, efficiency },
        pricePerKWhPence: pricePerKWh,
        areaM2,
        costGBP,
      });
    } catch {
      return undefined;
    }
  }, [state, newLayerIds, regionId, fuelId, efficiency, pricePerKWh, areaM2, costGBP]);

  return (
    <section className="panel energy-tab">
      <h2>
        Retrofit
        <HelpButton topicId="retrofit" label="the retrofit comparison" onOpen={onOpenGuide} />
      </h2>

      <p className="choice-lead">
        The build-up on the other tabs is the wall <strong>after</strong> the work. Tick the
        layers that are new and the wall as it was follows from what is left, so the two
        sides are always build-ups this tool has calculated rather than a figure typed in
        from somewhere else.
      </p>

      <ul className="retrofit-layers">
        {state.layers.map((layer) => {
          const isNew = newLayerIds.includes(layer.id);
          return (
            <li key={layer.id}>
              <label className={isNew ? 'retrofit-layer is-new' : 'retrofit-layer'}>
                <input type="checkbox" checked={isNew} onChange={() => toggle(layer.id)} />
                <span>
                  <strong>{layer.label}</strong>
                  <em>
                    {layer.thicknessMm} mm{isNew ? ' · added by the work' : ' · already there'}
                  </em>
                </span>
              </label>
            </li>
          );
        })}
      </ul>

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
          <span className="field-caption">How it is heated</span>
          <select
            value={presetId}
            onChange={(event) => {
              setPresetId(event.target.value);
              const next = HEAT_SOURCE_PRESETS.find((c) => c.id === event.target.value);
              if (next !== undefined) {
                setEfficiency(next.source.efficiency);
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
          <span className="field-caption">{efficiency > 1 ? 'Seasonal CoP' : 'Efficiency'}</span>
          <input type="number" min={0.1} step={0.05} value={efficiency}
            onChange={(e) => setEfficiency(Math.max(0.1, Number(e.target.value)))} />
        </label>
        <label className="field">
          <span className="field-caption">Fuel price, p/kWh</span>
          <input type="number" min={0} step={0.1} value={pricePerKWh}
            onChange={(e) => setPricePerKWh(Math.max(0, Number(e.target.value)))} />
        </label>
        <label className="field">
          <span className="field-caption">Area treated, m²</span>
          <input type="number" min={1} step={1} value={areaM2}
            onChange={(e) => setAreaM2(Math.max(1, Number(e.target.value)))} />
        </label>
        <label className="field">
          <span className="field-caption">Cost of the work, £</span>
          <input type="number" min={0} step={100} value={costGBP}
            onChange={(e) => setCostGBP(Math.max(0, Number(e.target.value)))} />
        </label>
      </div>

      {newLayerIds.length === 0 && (
        <p className="footnote">Tick at least one layer above to compare against.</p>
      )}
      {newLayerIds.length === state.layers.length && (
        <p className="footnote">
          Every layer is ticked, which leaves no wall to compare against — leave at least
          one in place.
        </p>
      )}

      {assessment !== undefined && assessment.makesItWorse && (
        <p className="verdict verdict-risk">
          These layers make the element lose <strong>more</strong> heat, not less, so there
          is nothing to pay back. Check which ones are ticked.
        </p>
      )}

      {assessment !== undefined && !assessment.makesItWorse && (
        <>
          <div className="energy-figures">
            <div className="energy-figure">
              <span className="energy-figure-label">Heat saved</span>
              <strong>
                {assessment.savedKWhPerYear.toFixed(0)}{' '}
                <span className="energy-figure-unit">kWh/year</span>
              </strong>
              <em>
                {assessment.beforeLossKWhPerM2.toFixed(1)} down to{' '}
                {assessment.afterLossKWhPerM2.toFixed(1)} kWh/m² over {areaM2} m²
              </em>
            </div>
            <div className="energy-figure">
              <span className="energy-figure-label">Money saved</span>
              <strong>
                £{assessment.savedGBPPerYear.toFixed(0)}{' '}
                <span className="energy-figure-unit">/year</span>
              </strong>
              <em>
                {assessment.savedFuelKWhPerYear.toFixed(0)} kWh less{' '}
                {factors?.label.toLowerCase() ?? 'fuel'} at {pricePerKWh} p/kWh
              </em>
            </div>
            <div className="energy-figure">
              <span className="energy-figure-label">Carbon saved</span>
              <strong>
                {assessment.savedCO2KgPerYear.toFixed(0)}{' '}
                <span className="energy-figure-unit">kg CO₂e/year</span>
              </strong>
              <em>operational only — not the carbon spent making the materials</em>
            </div>
            <div className="energy-figure">
              <span className="energy-figure-label">Pays for itself in</span>
              <strong>
                {assessment.paybackYears === undefined
                  ? '—'
                  : assessment.paybackYears.toFixed(1)}{' '}
                <span className="energy-figure-unit">years</span>
              </strong>
              <em>£{costGBP} at £{assessment.savedGBPPerYear.toFixed(0)} a year</em>
            </div>
          </div>

          <details className="explain">
            <summary>Why the real payback is longer than this</summary>
            <p className="tour-caveat">
              <strong>Prices do not stand still.</strong> This assumes today&rsquo;s price
              forever. Rising fuel prices shorten the payback and falling ones lengthen it,
              and neither is predictable enough for us to guess on your behalf.
            </p>
            <p className="tour-caveat">
              <strong>People take some of the benefit as warmth.</strong> A colder house
              that becomes affordable to heat properly often gets heated properly, so the
              heat saved and the money saved are not the same number. That is a real gain,
              but it does not show up in a bill.
            </p>
            <p className="tour-caveat">
              <strong>The carbon here is operational only.</strong> Making the insulation
              cost carbon and money before any of it was saved, and that debt has its own
              payback — usually a short one for insulation, but this tool cannot tell you
              because it ships no embodied-carbon data and will not invent any.
            </p>
            <p className="tour-caveat">
              And a payback in years says nothing about whether the work is worth doing. A
              wall that stays warm, dry and free of mould is worth something no
              spreadsheet will show you.
            </p>
          </details>
        </>
      )}
    </section>
  );
}
