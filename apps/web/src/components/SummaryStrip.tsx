import { useMemo } from 'react';
import type {
  BuildingElement,
  CorrectionResult,
  DynamicResult,
  EnvironmentConditions,
  PartLContext,
  UValueResult,
  PartLElementKind,
} from '@openuvalue/engine';
import {
  MOULD_CRITICAL_SURFACE_HUMIDITY_PERCENT,
  assessSurfaceCondensation,
  arealQuantities,
  assessInterstitialCondensation,
  checkAgainstPartL,
  ratePerDayGPerM2,
  vapourClassForSd,
} from '@openuvalue/engine';
import { HelpButton } from './guide/Guide.js';

/**
 * The build-up's figures, in two places. Four answer the questions people come with —
 * does it meet the limit, will the room face grow mould, does it condense, how thick is
 * it — and are pinned above the drawing so they move as layers are dragged about. The
 * rest are on the Results tab.
 *
 * **There is no quality rating on any of these.** That is a deliberate choice, not an
 * omission. Two of the figures can be judged against something published — the U-value
 * against the limiting values in Approved Document L, and the internal surface humidity
 * against the 80 % mould criterion in BS EN ISO 13788 — so those two carry a verdict and
 * name what gave it. Nothing published bands a wall's mass, heat capacity or S_d into
 * good and bad, and the bands would have to be invented. An invented threshold in the
 * most prominent place on the page, drawn in the same style as the two real ones, would
 * be the single most misleading thing this tool could do. See VERIFY.md C6.
 *
 * What is missing from here and why is in the note at the end of the Results tab's
 * figures, so the gaps are visible rather than simply absent.
 */

export const PART_L_CONTEXTS: readonly {
  readonly id: PartLContext;
  readonly label: string;
  /** How the pinned U-value tile names the context, after the limit it quotes. */
  readonly short: string;
}[] = [
  { id: 'new-dwelling', label: 'New dwelling', short: 'new dwelling' },
  {
    id: 'new-element-in-existing-dwelling',
    label: 'New element, existing dwelling',
    short: 'new element',
  },
  { id: 'renovated-element', label: 'Renovated element', short: 'renovated' },
];

type Verdict = 'ok' | 'risk' | 'none';

interface MetricProps {
  readonly label: React.ReactNode;
  readonly value: string;
  readonly unit?: string;
  readonly note?: string;
  readonly verdict?: Verdict;
  readonly title?: string;
}

function Metric({ label, value, unit, note, verdict = 'none', title }: MetricProps): JSX.Element {
  return (
    <div className={`metric metric-${verdict}`} title={title}>
      <span className="metric-label">{label}</span>
      <span className="metric-value">
        {value}
        {unit !== undefined && <span className="metric-unit">{unit}</span>}
      </span>
      {note !== undefined && <span className="metric-note">{note}</span>}
    </div>
  );
}

interface FigureInputs {
  readonly element: BuildingElement;
  /**
   * The Approved Document L category. Passed in rather than derived from the heat flow
   * direction, because a roof steep enough to take a wall's surface resistances is still
   * a roof to the limiting values.
   */
  readonly partLKind: PartLElementKind;
  readonly result: UValueResult;
  readonly corrections: CorrectionResult | undefined;
  readonly conditions: EnvironmentConditions;
  /** Which Approved Document L limit the U-value is judged against. */
  readonly partLContext: PartLContext;
}

/** Every figure both views show, worked out once per view from the same inputs. */
function useFigures({
  element,
  partLKind,
  result,
  corrections,
  conditions,
  partLContext,
}: FigureInputs) {
  const areal = useMemo(() => arealQuantities(element), [element]);

  const condensation = useMemo(() => {
    try {
      return assessInterstitialCondensation(element, conditions);
    } catch {
      // A summary, not the moisture tab: if the vapour calculation cannot run, the
      // thermal figures beside it are still worth showing.
      return undefined;
    }
  }, [element, conditions]);

  // The headline follows the same rule as the results panel: the corrected U-value where
  // a correction was applied, the uncorrected one where it was too small to matter.
  const displayedU = corrections?.correctedUValueWPerM2K ?? result.uValueWPerM2K;

  const partLCheck =
    displayedU === null
      ? undefined
      : checkAgainstPartL(displayedU, partLKind).find(
          (check) => check.context === partLContext,
        );

  /*
   * The damp and mould verdict comes from the assessment, not from the profile on
   * screen. BS EN ISO 13788 4.4.1 requires Rsi = 0.25 m2K/W for this, whatever the
   * U-value is using and whatever the user picked for the drawing - so the verdict is
   * calculated at that figure, on the coldest path, and cannot be softened by a choice
   * made somewhere else.
   */
  const surface = useMemo(() => {
    try {
      return assessSurfaceCondensation(element, conditions);
    } catch {
      return undefined;
    }
  }, [element, conditions]);

  const condensationRateGPerM2Day =
    condensation === undefined
      ? undefined
      : ratePerDayGPerM2(condensation.totalCondensationRateKgPerM2S);

  return { areal, condensation, displayedU, partLCheck, surface, condensationRateGPerM2Day };
}

export interface AnswerTilesProps extends FigureInputs {
  readonly onOpenGuide: (topicId: string) => void;
}

/**
 * The four figures pinned above the drawing. Three carry a verdict because something
 * published gives one — Approved Document L's limit, BS EN ISO 13788's 80 % surface
 * humidity, and whether its method finds condensation at all. Thickness carries none.
 */
export function AnswerTiles(props: AnswerTilesProps): JSX.Element {
  const { onOpenGuide, partLContext } = props;
  const { areal, condensation, displayedU, partLCheck, surface, condensationRateGPerM2Day } =
    useFigures(props);
  const contextShort =
    PART_L_CONTEXTS.find((entry) => entry.id === partLContext)?.short ?? '';
  const condenses = condensation?.condenses === true;
  const incompleteMass = areal.layersMissingDensity.length;

  return (
    <section className="answer-tiles" aria-label="Headline figures">
      <div className="answer-tile answer-tile-lead" title={partLCheck?.citation}>
        <span className="answer-label">
          U-value
          <HelpButton topicId="strip-u-value" label="the headline figures" onOpen={onOpenGuide} />
        </span>
        <span className="answer-value">
          {displayedU === null ? '—' : displayedU.toFixed(2)}
          <span className="answer-unit">W/(m²·K)</span>
        </span>
        {displayedU === null ? (
          <>
            <span className="answer-chip chip-risk">Outside the method</span>
            <span className="answer-sub">see the Results tab</span>
          </>
        ) : (
          partLCheck !== undefined && (
            <>
              <span className={`answer-chip ${partLCheck.meetsLimit ? 'chip-ok' : 'chip-risk'}`}>
                {partLCheck.meetsLimit ? 'Meets' : 'Over'}{' '}
                {partLCheck.maximumUValueWPerM2K.toFixed(2)}
              </span>
              <span className="answer-sub">limit, {contextShort}</span>
            </>
          )
        )}
      </div>

      <div
        className="answer-tile"
        title={
          surface === undefined
            ? undefined
            : `Assessed at the Rsi of ${surface.rsiM2KPerW} m²K/W that BS EN ISO 13788 §4.4.1 ` +
              `requires for damp and mould, a colder surface than the U-value's ` +
              `${surface.uValueRsiM2KPerW} m²K/W gives, so it is deliberately not the figure ` +
              `on the temperature line. Mould grows from about ` +
              `${MOULD_CRITICAL_SURFACE_HUMIDITY_PERCENT} % surface humidity.`
        }
      >
        <span className="answer-label">Inside surface</span>
        <span className="answer-value">
          {surface === undefined ? '—' : surface.temperatureC.toFixed(1)}
          <span className="answer-unit">°C</span>
        </span>
        {surface !== undefined && (
          <>
            <span className={`answer-chip ${surface.mouldRisk ? 'chip-risk' : 'chip-ok'}`}>
              {surface.mouldRisk ? 'Mould risk' : 'No mould risk'}
            </span>
            <span className="answer-sub">
              {surface.surfaceRelativeHumidityPercent.toFixed(0)} % RH
            </span>
          </>
        )}
      </div>

      <div
        className="answer-tile"
        title="Interstitial condensation rate under the conditions set on the Conditions tab, by the BS EN ISO 13788 method."
      >
        <span className="answer-label">Condensation</span>
        <span className="answer-value">
          {condensationRateGPerM2Day === undefined
            ? '—'
            : condenses
              ? condensationRateGPerM2Day.toFixed(1)
              : 'None'}
          {condenses && <span className="answer-unit">g/(m²·day)</span>}
        </span>
        {condensationRateGPerM2Day !== undefined && (
          <>
            <span className={`answer-chip ${condenses ? 'chip-risk' : 'chip-ok'}`}>
              {condenses ? 'Condenses' : 'Stays dry'}
            </span>
            <span className="answer-sub">
              {condenses ? 'inside the build-up' : 'vapour below saturation'}
            </span>
          </>
        )}
      </div>

      <div className="answer-tile">
        <span className="answer-label">Thickness</span>
        <span className="answer-value">
          {(areal.totalThicknessM * 1000).toFixed(0)}
          <span className="answer-unit">mm</span>
        </span>
        <span
          className="answer-sub"
          title={
            incompleteMass === 0
              ? 'Dry mass of the specified materials, excluding fixings and finishes.'
              : 'Dry mass, excluding layers with no density in the catalogue, so this is an under-estimate.'
          }
        >
          {areal.massPerAreaKgPerM2.toFixed(0)} kg/m²{incompleteMass === 0 ? '' : ' or more'}
        </span>
      </div>
    </section>
  );
}

export interface SummaryStripProps extends FigureInputs {
  /** Opens the feature guide at a topic. */
  readonly onOpenGuide: (topicId: string) => void;
  /** BS EN ISO 13786 figures, absent when the dynamic calculation could not run. */
  readonly dynamic: DynamicResult | undefined;
  readonly onPartLContextChange: (context: PartLContext) => void;
}

/**
 * The figures that are not pinned, with the choice of which limit the pinned U-value is
 * judged against. Lives on the Results tab.
 */
export function SummaryStrip(props: SummaryStripProps): JSX.Element {
  const { dynamic, onOpenGuide, partLContext, onPartLContextChange } = props;
  const { areal, partLCheck } = useFigures(props);

  const incompleteMass = areal.layersMissingDensity.length;
  const incompleteMu = areal.layersMissingMu.length;

  return (
    <section className="summary-strip" aria-label="Build-up summary">
      <p className="strip-title">
        More figures
        <HelpButton topicId="strip-u-value" label="the figures" onOpen={onOpenGuide} />
      </p>
      <div className="metric-row">
        <Metric
          label="Mass"
          value={areal.massPerAreaKgPerM2.toFixed(0)}
          unit="kg/m²"
          note={
            incompleteMass === 0
              ? undefined
              : `${incompleteMass} layer${incompleteMass === 1 ? '' : 's'} without a density`
          }
          title={
            incompleteMass === 0
              ? 'Dry mass of the specified materials, excluding fixings and finishes.'
              : 'Dry mass, excluding layers with no density in the catalogue, so this is an under-estimate.'
          }
        />

        <Metric
          label="Total capacity"
          value={areal.totalHeatCapacityKJPerM2K.toFixed(0)}
          unit="kJ/(m²·K)"
          note="total, not κ"
          title={
            'The sum of ρ × c × d over the layers: all the heat the build-up could hold if ' +
            'warmed right through. This is not the areal heat capacity κ of BS EN ISO 13786, ' +
            'which counts only what a daily cycle reaches and is shown alongside.'
          }
        />

        <Metric
          label="Vapour resistance"
          value={areal.totalSdM.toFixed(2)}
          unit="m Sd"
          note={
            incompleteMu === 0
              ? vapourClassForSd(areal.totalSdM).replace('-', ' ')
              : `${incompleteMu} layer${incompleteMu === 1 ? '' : 's'} without a μ`
          }
          title="Equivalent air layer thickness of the whole build-up: the depth of still air that would resist vapour as much as this does."
        />

        {/*
          BS EN ISO 13786. Neutral like the rest: the standard publishes no scale saying
          which decrement factor is good, and the answer depends on the building anyway.
        */}
        {dynamic !== undefined && (
          <>
            <Metric
              label="Decrement"
              value={dynamic.main.decrementFactor.toFixed(2)}
              note={`${(dynamic.main.decrementFactor * 100).toFixed(0)} % of the swing gets in`}
              title="Decrement factor: the share of an outside temperature swing that reaches the inside surface over a 24 hour cycle."
            />
            <Metric
              label="Time shift"
              value={dynamic.main.timeShiftHours.toFixed(1)}
              unit="h"
              note="until the peak arrives"
              title="How much later the indoor peak follows the outdoor one."
            />
            <Metric
              label={
                <>
                  Heat capacity <span className="symbol-label">κ</span>
                  <sub>i</sub>
                </>
              }
              value={dynamic.main.internalArealHeatCapacityKJPerM2K.toFixed(0)}
              unit="kJ/(m²·K)"
              note="reachable from inside"
              title="Areal heat capacity of the internal face, per BS EN ISO 13786. This is the figure SAP 10.3 uses for thermal mass. It is lower than the total heat capacity because a daily cycle only reaches so far into the build-up."
            />
          </>
        )}
      </div>

      <div className="strip-foot">
        <label className="inline-select">
          Judge the U-value as
          <HelpButton
            topicId="strip-partl-context"
            label="which Part L limit applies"
            onOpen={onOpenGuide}
          />
          <select
            value={partLContext}
            onChange={(event) => onPartLContextChange(event.target.value as PartLContext)}
          >
            {PART_L_CONTEXTS.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.label}
              </option>
            ))}
          </select>
        </label>

        {partLCheck !== undefined && (
          <span className="strip-source">
            {partLCheck.label}, {partLCheck.citation}. England, dwellings. A limiting
            value is a maximum to clear, not a target to aim at.
          </span>
        )}
      </div>

      <details className="explain">
        <summary>Why some figures you might expect are not here</summary>
        <div className="tour-caveat">
          <p>
            A summary is only useful if everything in it is real, so the gaps are listed
            rather than filled.
          </p>
          <ul>
            <li>
              <strong>A rating on the dynamic figures.</strong> The decrement factor, time
              shift and κ are calculated (BS EN ISO 13786), but what counts as a good value
              depends on the building around them. A shaded north wall and a south-facing
              one with the same numbers are not the same problem. The standard publishes no
              scale, so neither do we.
            </li>
            <li>
              <strong>A drying reserve</strong>, as a single figure of how much moisture a
              build-up could shed beyond what it collects. There is no clause we can point
              at that defines one, and the seasonal balance on the moisture tab already
              gives the same answer in a form that shows its workings.
            </li>
            <li>
              <strong>Embodied carbon or greenhouse contribution.</strong> That is a
              property of the products specified rather than of the layer thicknesses, and
              it needs life-cycle data the catalogue does not carry.
            </li>
            <li>
              <strong>A rating from poor to excellent</strong> on any of these. The
              U-value is measured against Approved Document L because that document
              publishes a limit; the surface humidity against BS EN ISO 13788 because that
              standard publishes a criterion. Nothing published grades mass, heat capacity
              or S<sub>d</sub>, and a scale invented here would look exactly as
              authoritative as the two that are not invented.
            </li>
          </ul>
        </div>
      </details>
    </section>
  );
}
