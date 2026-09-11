import { useMemo, useState } from 'react';
import type {
  BuildingElement,
  CorrectionResult,
  DynamicResult,
  EnvironmentConditions,
  PartLContext,
  TemperatureProfile,
  UValueResult,
} from '@openuvalue/engine';
import {
  MOULD_CRITICAL_SURFACE_HUMIDITY_PERCENT,
  arealQuantities,
  assessInterstitialCondensation,
  checkAgainstPartL,
  partLElementKindForDirection,
  ratePerDayGPerM2,
  surfaceRelativeHumidityPercent,
  vapourClassForSd,
} from '@openuvalue/engine';

/**
 * The whole build-up in one line of figures, kept on screen under the drawing so the
 * headline numbers move as layers are dragged about.
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
 * What is missing from here and why is in the note at the end of the strip, so the gaps
 * are visible rather than simply absent.
 */

const PART_L_CONTEXTS: readonly { readonly id: PartLContext; readonly label: string }[] = [
  { id: 'new-dwelling', label: 'New dwelling' },
  { id: 'new-element-in-existing-dwelling', label: 'New element, existing dwelling' },
  { id: 'renovated-element', label: 'Renovated element' },
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

export interface SummaryStripProps {
  readonly element: BuildingElement;
  readonly result: UValueResult;
  readonly corrections: CorrectionResult | undefined;
  readonly profile: TemperatureProfile;
  readonly conditions: EnvironmentConditions;
  /** BS EN ISO 13786 figures, absent when the dynamic calculation could not run. */
  readonly dynamic: DynamicResult | undefined;
}

export function SummaryStrip({
  element,
  result,
  corrections,
  profile,
  conditions,
  dynamic,
}: SummaryStripProps): JSX.Element {
  const [partLContext, setPartLContext] = useState<PartLContext>('new-dwelling');

  const areal = useMemo(() => arealQuantities(element), [element]);

  const condensation = useMemo(() => {
    try {
      return assessInterstitialCondensation(element, conditions);
    } catch {
      // The strip is a summary, not the moisture tab: if the vapour calculation cannot
      // run, the thermal figures beside it are still worth showing.
      return undefined;
    }
  }, [element, conditions]);

  // The headline follows the same rule as the results panel: the corrected U-value where
  // a correction was applied, the uncorrected one where it was too small to matter.
  const displayedU = corrections?.correctedUValueWPerM2K ?? result.uValueWPerM2K;

  const partLCheck =
    displayedU === null
      ? undefined
      : checkAgainstPartL(
          displayedU,
          partLElementKindForDirection(element.heatFlowDirection),
        ).find((check) => check.context === partLContext);

  const internalSurface = profile.nodes.find((node) => node.kind === 'internal-surface');
  const surfaceHumidity =
    internalSurface === undefined
      ? undefined
      : surfaceRelativeHumidityPercent(
          conditions.internalAirTemperatureC,
          conditions.internalRelativeHumidityPercent,
          internalSurface.worstCaseTemperatureC,
        );
  const mouldRisk =
    surfaceHumidity !== undefined && surfaceHumidity >= MOULD_CRITICAL_SURFACE_HUMIDITY_PERCENT;

  const condensationRateGPerM2Day =
    condensation === undefined
      ? undefined
      : ratePerDayGPerM2(condensation.totalCondensationRateKgPerM2S);

  const incompleteMass = areal.layersMissingDensity.length;
  const incompleteMu = areal.layersMissingMu.length;

  return (
    <section className="summary-strip" aria-label="Build-up summary">
      <div className="metric-row">
        <Metric
          label="U-value"
          value={displayedU === null ? '—' : displayedU.toFixed(2)}
          unit="W/(m²·K)"
          verdict={partLCheck === undefined ? 'none' : partLCheck.meetsLimit ? 'ok' : 'risk'}
          note={
            displayedU === null
              ? 'outside the method'
              : partLCheck === undefined
                ? undefined
                : `limit ${partLCheck.maximumUValueWPerM2K.toFixed(2)}`
          }
          title={partLCheck?.citation}
        />

        <Metric
          label="Thickness"
          value={(areal.totalThicknessM * 1000).toFixed(0)}
          unit="mm"
        />

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
              : 'Dry mass, excluding layers with no density in the catalogue — so this is an under-estimate.'
          }
        />

        <Metric
          label="Total capacity"
          value={areal.totalHeatCapacityKJPerM2K.toFixed(0)}
          unit="kJ/(m²·K)"
          note="total, not κ"
          title={
            'The sum of ρ × c × d over the layers. This is the total, not the areal heat ' +
            'capacity κ of BS EN ISO 13786, which is a dynamic quantity and is not ' +
            'implemented.'
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

        {surfaceHumidity !== undefined && internalSurface !== undefined && (
          <Metric
            label="Inside surface"
            value={internalSurface.worstCaseTemperatureC.toFixed(1)}
            unit="°C"
            verdict={mouldRisk ? 'risk' : 'ok'}
            note={`${surfaceHumidity.toFixed(0)} % RH at the surface`}
            title={`Mould grows from about ${MOULD_CRITICAL_SURFACE_HUMIDITY_PERCENT} % surface humidity, per BS EN ISO 13788.`}
          />
        )}

        {condensationRateGPerM2Day !== undefined && (
          <Metric
            label="Condensation"
            value={
              condensation?.condenses === true ? condensationRateGPerM2Day.toFixed(1) : 'None'
            }
            unit={condensation?.condenses === true ? 'g/(m²·day)' : undefined}
            verdict={condensation?.condenses === true ? 'risk' : 'ok'}
            note={
              condensation?.condenses === true
                ? 'inside the build-up'
                : 'vapour stays below saturation'
            }
            title="Interstitial condensation rate under the conditions set on the build-up tab, by the BS EN ISO 13788 method."
          />
        )}

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
              title="Areal heat capacity of the internal face, per BS EN ISO 13786 — the figure SAP 10.3 uses for thermal mass. Lower than the total heat capacity because a daily cycle only reaches so far into the build-up."
            />
          </>
        )}
      </div>

      <div className="strip-foot">
        <label className="inline-select">
          Judge the U-value as
          <select
            value={partLContext}
            onChange={(event) => setPartLContext(event.target.value as PartLContext)}
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
            {partLCheck.label} — {partLCheck.citation}. England, dwellings. A limiting
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
              depends on the building around them — a shaded north wall and a south-facing
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
