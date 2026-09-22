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
import { DEFAULT_SHEET_SIZE, SHEET_SIZE_PRESETS, sheetsCostGBP, sheetsForArea } from '../state/sheets.js';
import { SheetDiagram } from './SheetDiagram.js';
import { HelpButton } from './guide/Guide.js';

/**
 * What the work saves, and how long it takes to pay for itself.
 *
 * The build-up on the other tabs is the **finished** wall. Ticking the layers that are
 * new gives the wall as it was for nothing — no second editor, no chance of the two
 * drifting apart, and the comparison is always between two build-ups the tool has
 * actually calculated rather than a remembered U-value.
 *
 * The tab is laid out as three steps rather than one flat page of controls, because the
 * six inputs are not six of a kind. Two of them — the area treated and what the work
 * costs — are the project, and nobody else can supply them. The other four are
 * assumptions with defensible defaults, so they sit behind a disclosure that states in
 * one line what is currently assumed. A reader who disagrees can open it; a reader who
 * does not should not have to read four fields to reach the answer.
 */

export interface RetrofitTabProps {
  readonly onOpenGuide: (topicId: string) => void;
  readonly state: UiState;
}

const money = new Intl.NumberFormat('en-GB', { maximumFractionDigits: 0 });

export function RetrofitTab({ onOpenGuide, state }: RetrofitTabProps): JSX.Element {
  const [newLayerIds, setNewLayerIds] = useState<readonly string[]>([]);
  const [regionId, setRegionId] = useState(0);
  const [presetId, setPresetId] = useState('gas-condensing');
  const [efficiency, setEfficiency] = useState(0.9);
  const [pricePerKWh, setPricePerKWh] = useState(7);
  const [areaM2, setAreaM2] = useState(50);
  /*
   * A price per sheet rather than a price for the job, because a sheet price is a number
   * somebody can read off a quote. Twenty-five pounds is a placeholder in the same spirit
   * as the fuel price: a starting point to overwrite, not a market figure this tool knows.
   */
  const [pricePerSheetGBP, setPricePerSheetGBP] = useState(25);
  const [sheetWidthMm, setSheetWidthMm] = useState(DEFAULT_SHEET_SIZE.widthM * 1000);
  const [sheetLengthMm, setSheetLengthMm] = useState(DEFAULT_SHEET_SIZE.lengthM * 1000);
  /** Labour, access, fixings: whatever the sheets themselves do not cover. */
  const [otherCostsGBP, setOtherCostsGBP] = useState(0);

  // Millimetres are a UI unit and convert at this boundary, as everywhere else.
  const sheetSize = { widthM: sheetWidthMm / 1000, lengthM: sheetLengthMm / 1000 };
  const sheets =
    sheetWidthMm > 0 && sheetLengthMm > 0 && areaM2 > 0
      ? sheetsForArea(areaM2, sheetSize)
      : undefined;
  const materialsGBP = sheets === undefined ? 0 : sheetsCostGBP(sheets, pricePerSheetGBP);
  const costGBP = materialsGBP + otherCostsGBP;

  const preset = HEAT_SOURCE_PRESETS.find((candidate) => candidate.id === presetId);
  const fuelId = preset?.source.fuelId ?? 'mains-gas';
  const factors = fuel(fuelId);
  const region = CLIMATE_REGIONS.find((candidate) => candidate.id === regionId);

  const toggle = (id: string): void =>
    setNewLayerIds((current) =>
      current.includes(id) ? current.filter((candidate) => candidate !== id) : [...current, id],
    );

  const comparison = useMemo(() => {
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
      const assessment = assessRetrofit({
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
      if (assessment === undefined) {
        return undefined;
      }
      // assessRetrofit returns undefined unless both U-values are in scope, so by here
      // neither is null — but the types do not know that, and CLAUDE.md forbids a `!`.
      const beforeU = before.uValueWPerM2K;
      const afterU = after.uValueWPerM2K;
      if (beforeU === null || afterU === null) {
        return undefined;
      }
      return { assessment, beforeU, afterU };
    } catch {
      return undefined;
    }
  }, [state, newLayerIds, regionId, fuelId, efficiency, pricePerKWh, areaM2, costGBP]);

  const assessment = comparison?.assessment;
  const nothingTicked = newLayerIds.length === 0;
  const everythingTicked = newLayerIds.length === state.layers.length && state.layers.length > 0;

  return (
    <section className="panel energy-tab retrofit-tab">
      <h2>
        Retrofit
        <HelpButton topicId="retrofit" label="the retrofit comparison" onOpen={onOpenGuide} />
      </h2>

      <p className="choice-lead">
        The build-up on the other tabs is the wall <strong>after</strong> the work. Tick
        what the work adds and the wall as it was is whatever is left, so both sides of the
        comparison are build-ups this tool has calculated.
      </p>

      <ol className="retrofit-steps">
        <li className="retrofit-step">
          <h3>
            <span className="retrofit-step-number">1</span> What the work adds
          </h3>
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
                        {layer.thicknessMm} mm ·{' '}
                        {isNew ? 'added by the work' : 'already there'}
                      </em>
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
          {everythingTicked && (
            <p className="footnote">
              Every layer is ticked, which leaves no wall to compare against. Leave at
              least one in place.
            </p>
          )}
        </li>

        <li className="retrofit-step">
          <h3>
            <span className="retrofit-step-number">2</span> How much of it, and what a sheet costs
            <HelpButton topicId="retrofit-sheets" label="costing by the sheet" onOpen={onOpenGuide} />
          </h3>
          <p className="choice-lead">
            Materials are bought by the sheet, so that is what this asks for. The area
            decides how many sheets, and whole sheets get paid for however much of the last
            one is left over.
          </p>
          <div className="retrofit-fields">
            <label className="field">
              <span className="field-caption">Area treated, m²</span>
              <input
                type="number"
                min={1}
                step={1}
                value={areaM2}
                onChange={(event) => setAreaM2(Math.max(1, Number(event.target.value)))}
              />
            </label>
            <label className="field">
              <span className="field-caption">Price of one sheet, £</span>
              <input
                type="number"
                min={0}
                step={1}
                value={pricePerSheetGBP}
                onChange={(event) =>
                  setPricePerSheetGBP(Math.max(0, Number(event.target.value)))
                }
              />
            </label>
            <label className="field">
              <span className="field-caption">Labour and the rest, £</span>
              <input
                type="number"
                min={0}
                step={50}
                value={otherCostsGBP}
                onChange={(event) => setOtherCostsGBP(Math.max(0, Number(event.target.value)))}
              />
            </label>
          </div>

          <div className="sheet-size">
            <span className="picker-label">Sheet size, mm</span>
            <div className="chip-row">
              {SHEET_SIZE_PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  className={
                    Math.abs(sheetWidthMm - preset.widthM * 1000) < 0.5 &&
                    Math.abs(sheetLengthMm - preset.lengthM * 1000) < 0.5
                      ? 'chip is-current'
                      : 'chip'
                  }
                  onClick={() => {
                    setSheetWidthMm(preset.widthM * 1000);
                    setSheetLengthMm(preset.lengthM * 1000);
                  }}
                >
                  {preset.label}
                </button>
              ))}
            </div>
            <div className="sheet-size-fields">
              <label className="field">
                <span className="field-caption">Width</span>
                <input
                  type="number"
                  min={1}
                  step={50}
                  value={sheetWidthMm}
                  onChange={(event) => setSheetWidthMm(Math.max(1, Number(event.target.value)))}
                />
              </label>
              <label className="field">
                <span className="field-caption">Length</span>
                <input
                  type="number"
                  min={1}
                  step={50}
                  value={sheetLengthMm}
                  onChange={(event) => setSheetLengthMm(Math.max(1, Number(event.target.value)))}
                />
              </label>
            </div>
          </div>

          {sheets !== undefined && (
            <>
              <SheetDiagram count={sheets} size={sheetSize} />
              <p className="sheet-sum">
                {sheets.wholeSheets} sheet{sheets.wholeSheets === 1 ? '' : 's'} at £
                {money.format(pricePerSheetGBP)} = <strong>£{money.format(materialsGBP)}</strong>
                {otherCostsGBP > 0 ? (
                  <>
                    , plus £{money.format(otherCostsGBP)} for labour and the rest:{' '}
                    <strong>£{money.format(costGBP)}</strong>
                  </>
                ) : (
                  <>, and no labour entered, so everything below is materials only</>
                )}
                .
              </p>
            </>
          )}
        </li>

        <li className="retrofit-step">
          <h3>
            <span className="retrofit-step-number">3</span> What you get back
            <HelpButton topicId="retrofit-payback" label="the payback" onOpen={onOpenGuide} />
          </h3>

          {nothingTicked && (
            <p className="retrofit-waiting">
              Tick a layer in step 1 and the answer appears here.
            </p>
          )}

          {assessment !== undefined && assessment.makesItWorse && (
            <p className="verdict verdict-risk">
              These layers make the element lose <strong>more</strong> heat, not less, so
              there is nothing to pay back. Check which ones are ticked.
            </p>
          )}

          {comparison !== undefined && assessment !== undefined && !assessment.makesItWorse && (
            <>
              <div className="retrofit-answer">
                <span className="retrofit-answer-label">Pays for itself in</span>
                <strong>
                  {assessment.paybackYears === undefined
                    ? '—'
                    : assessment.paybackYears.toFixed(1)}
                  <span className="retrofit-answer-unit">years</span>
                </strong>
                <em>
                  £{money.format(costGBP)}
                  {sheets !== undefined && otherCostsGBP === 0
                    ? ` of sheets (${sheets.wholeSheets} at £${money.format(pricePerSheetGBP)}, materials only)`
                    : ' of work'}
                  , saving £{money.format(assessment.savedGBPPerYear)} a year on{' '}
                  {factors?.label.toLowerCase() ?? 'fuel'}
                </em>
              </div>

              <p className="retrofit-change">
                <span>
                  U-value <b>{comparison.beforeU.toFixed(2)}</b> → <b>{comparison.afterU.toFixed(2)}</b>{' '}
                  W/(m²·K)
                </span>
                <span>
                  Heat lost <b>{assessment.beforeLossKWhPerM2.toFixed(0)}</b> →{' '}
                  <b>{assessment.afterLossKWhPerM2.toFixed(0)}</b> kWh/m² a year
                </span>
              </p>

              <div className="energy-figures">
                <div className="energy-figure">
                  <span className="energy-figure-label">Heat saved</span>
                  <strong>
                    {money.format(assessment.savedKWhPerYear)}{' '}
                    <span className="energy-figure-unit">kWh/year</span>
                  </strong>
                  <em>over the {areaM2} m² being treated</em>
                </div>
                <div className="energy-figure">
                  <span className="energy-figure-label">Money saved</span>
                  <strong>
                    £{money.format(assessment.savedGBPPerYear)}{' '}
                    <span className="energy-figure-unit">/year</span>
                  </strong>
                  <em>
                    {money.format(assessment.savedFuelKWhPerYear)} kWh less{' '}
                    {factors?.label.toLowerCase() ?? 'fuel'} at {pricePerKWh} p/kWh
                  </em>
                </div>
                <div className="energy-figure">
                  <span className="energy-figure-label">Carbon saved</span>
                  <strong>
                    {money.format(assessment.savedCO2KgPerYear)}{' '}
                    <span className="energy-figure-unit">kg CO₂e/year</span>
                  </strong>
                  <em>operational only, not the carbon spent making the materials</em>
                </div>
              </div>
            </>
          )}

          <details className="explain retrofit-assumptions">
            <summary>
              Assumptions: {region?.name ?? 'UK average'} weather ·{' '}
              {preset?.label ?? 'Gas boiler'} · {pricePerKWh} p/kWh
            </summary>
            <div className="retrofit-fields">
              <label className="field">
                <span className="field-caption">Where the building is</span>
                <select
                  value={regionId}
                  onChange={(event) => setRegionId(Number(event.target.value))}
                >
                  {CLIMATE_REGIONS.map((candidate) => (
                    <option key={candidate.id} value={candidate.id}>
                      {candidate.id === 0 ? candidate.name : `${candidate.id}. ${candidate.name}`}
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
                <span className="field-caption">
                  {efficiency > 1 ? 'Seasonal CoP' : 'Efficiency'}
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
            </div>
          </details>

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
              payback, usually a short one for insulation. This tool cannot tell you,
              because it ships no embodied-carbon data and will not invent any.
            </p>
            <p className="tour-caveat">
              <strong>The sheet count is area, not a buying list.</strong> It divides the
              area by one sheet and rounds up. A real wall has reveals, corners and
              openings, every cut leaves an offcut that rarely fits anywhere else, and
              nothing here counts fixings, adhesive, tape or the skip. Expect to buy a few
              sheets more than this says.
            </p>
            <p className="tour-caveat">
              And a payback in years says nothing about whether the work is worth doing. A
              wall that stays warm, dry and free of mould is worth something no
              spreadsheet will show you.
            </p>
          </details>
        </li>
      </ol>
    </section>
  );
}
