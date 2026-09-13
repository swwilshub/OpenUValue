import { useMemo, useState } from 'react';
import type { DryingSettings } from '../state/drying.js';
import type {
  BuildingElement,
  EnvironmentConditions,
  TemperatureProfile,
} from '@openuvalue/engine';
import {
  MOULD_CRITICAL_SURFACE_HUMIDITY_PERCENT,
  assessSurfaceCondensation,
  assessInterstitialCondensation,
  assessOverPeriods,
} from '@openuvalue/engine';
import type { UiLayer } from '../state/model.js';
import { GlaserChart } from './GlaserChart.js';
import { HumidityChart } from './HumidityChart.js';
import { HelpButton } from './guide/Guide.js';

/**
 * Everything about moisture in one place: how damp the air gets inside the build-up,
 * where it condenses, how much water that adds up to over a season, whether a drying
 * season takes it away again, and whether the internal surface is damp enough to grow
 * mould.
 *
 * The seasonal figures are arithmetic on periods and conditions **the user sets**.
 * OpenUValue ships no design climate and no limit on the permitted amount, because it
 * cannot attribute either to a clause — see VERIFY.md. The defaults below are round
 * numbers chosen to be obviously provisional rather than to look authoritative.
 */


export interface MoistureTabProps {
  /** Opens the feature guide at a topic. */
  readonly onOpenGuide: (topicId: string) => void;
  readonly element: BuildingElement;
  readonly layers: readonly UiLayer[];
  readonly conditions: EnvironmentConditions;
  readonly profile: TemperatureProfile;
  /**
   * Held above this tab, because the cross-section reports the same dry-out answer and
   * the two must not be able to disagree about the same wall.
   */
  readonly dryingSettings: DryingSettings;
  readonly onChangeDryingSettings: (settings: DryingSettings) => void;
}

export function MoistureTab({
  element,
  layers,
  conditions,
  profile,
  onOpenGuide,
  dryingSettings,
  onChangeDryingSettings,
}: MoistureTabProps): JSX.Element {
  const [pathId, setPathId] = useState<string | undefined>(undefined);
  const { wettingDays, dryingDays, dryingExternalC } = dryingSettings;
  const dryingExternalRh = dryingSettings.dryingExternalRhPercent;
  const setWettingDays = (days: number) =>
    onChangeDryingSettings({ ...dryingSettings, wettingDays: days });
  const setDryingDays = (days: number) =>
    onChangeDryingSettings({ ...dryingSettings, dryingDays: days });
  const setDryingExternalC = (temperatureC: number) =>
    onChangeDryingSettings({ ...dryingSettings, dryingExternalC: temperatureC });
  const setDryingExternalRh = (percent: number) =>
    onChangeDryingSettings({ ...dryingSettings, dryingExternalRhPercent: percent });

  const assessment = useMemo(
    () => assessInterstitialCondensation(element, conditions),
    [element, conditions],
  );
  const shown = assessment.perPath.find((path) => path.pathId === pathId) ?? assessment.worst;

  const periods = useMemo(
    () =>
      assessOverPeriods(
        element,
        { label: 'Wetting season', days: wettingDays, conditions },
        {
          label: 'Drying season',
          days: dryingDays,
          conditions: {
            ...conditions,
            externalAirTemperatureC: dryingExternalC,
            externalRelativeHumidityPercent: dryingExternalRh,
          },
        },
      ),
    [element, conditions, wettingDays, dryingDays, dryingExternalC, dryingExternalRh],
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
  const surfaceHumidity = surface?.surfaceRelativeHumidityPercent;
  const mouldRisk = surface?.mouldRisk ?? false;

  return (
    <div className="moisture-tab">
      {/* ------------------------------------------------ humidity inside ---- */}
      <section className="panel">
        <div className="panel-head">
          <h2>
            How damp does it get inside the wall?
            <HelpButton topicId="moisture-humidity" label="the humidity chart" onOpen={onOpenGuide} />
          </h2>
          {assessment.perPath.length > 1 && (
            <label className="inline-select">
              Path
              <HelpButton topicId="moisture-path" label="the section path selector" onOpen={onOpenGuide} />
              <select value={shown.pathId} onChange={(event) => setPathId(event.target.value)}>
                {assessment.perPath.map((path) => (
                  <option key={path.pathId} value={path.pathId}>
                    {path.label}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
        <HumidityChart layers={layers} profile={profile} path={shown} />
      </section>

      {/* ------------------------------------------------- where and how much --- */}
      <section className="panel">
        <h2>
          Where does it condense?
          <HelpButton topicId="moisture-glaser" label="the Glaser diagram" onOpen={onOpenGuide} />
        </h2>
        {assessment.condenses ? (
          <p className="verdict verdict-risk">
            <strong>Vapour reaches saturation inside the build-up</strong> at{' '}
            {assessment.worst.assessment.condensationPlaneIndices.length === 1
              ? 'one interface'
              : `${assessment.worst.assessment.condensationPlaneIndices.length} interfaces`}
            . The build-up does not stop the vapour getting there.
          </p>
        ) : (
          <p className="verdict verdict-ok">
            <strong>Nowhere.</strong> The vapour pressure stays below saturation right
            through, so the construction is stopping the moisture before it reaches
            anywhere cold enough to condense.
          </p>
        )}
        <GlaserChart assessment={assessment} path={shown} />
      </section>

      {/* ------------------------------------------------ seasonal balance ---- */}
      <section className="panel">
        <h2>
          Over a season, does it dry out again?
          <HelpButton topicId="moisture-seasons" label="the seasonal balance" onOpen={onOpenGuide} />
        </h2>
        <p className="footnote">
          Water that collects over a winter is only a problem if it does not leave again.
          Set how long each season lasts and what the weather does in the drying one; the
          wetting season uses the conditions on the build-up tab.
        </p>

        <div className="period-grid">
          <label className="field">
            Wetting season, days
            <input
              type="number"
              min={1}
              max={365}
              value={wettingDays}
              onChange={(event) =>
                setWettingDays(Math.min(365, Math.max(1, Number(event.target.value))))
              }
            />
          </label>
          <label className="field">
            Drying season, days
            <input
              type="number"
              min={1}
              max={365}
              value={dryingDays}
              onChange={(event) =>
                setDryingDays(Math.min(365, Math.max(1, Number(event.target.value))))
              }
            />
          </label>
          <label className="field">
            Drying outside, °C
            <input
              type="number"
              step={0.5}
              value={dryingExternalC}
              onChange={(event) => setDryingExternalC(Number(event.target.value))}
            />
          </label>
          <label className="field">
            Drying outside RH, %
            <input
              type="number"
              min={0}
              max={100}
              value={dryingExternalRh}
              onChange={(event) =>
                setDryingExternalRh(Math.min(100, Math.max(0, Number(event.target.value))))
              }
            />
          </label>
        </div>

        {periods.planes.length === 0 ? (
          <p className="verdict verdict-ok">
            <strong>Nothing accumulates.</strong> No interface condenses over the wetting
            season, so there is nothing for the drying season to remove.
          </p>
        ) : (
          <>
            <div className="balance-row">
              <div className="balance-figure">
                <span className="balance-label">Collected over {wettingDays} days</span>
                <strong>{periods.totalAccumulatedKgPerM2.toFixed(2)} kg/m²</strong>
              </div>
              <div className="balance-figure">
                <span className="balance-label">Left after {dryingDays} days drying</span>
                <strong className={periods.driesOut ? 'is-ok' : 'is-risk'}>
                  {periods.totalRemainingKgPerM2.toFixed(2)} kg/m²
                </strong>
              </div>
            </div>

            <p className={periods.driesOut ? 'verdict verdict-ok' : 'verdict verdict-risk'}>
              {periods.driesOut ? (
                <>
                  <strong>It dries out.</strong> Everything that collects over the wetting
                  season leaves again within the drying season, so the water does not build
                  up year on year.
                </>
              ) : (
                <>
                  <strong>It does not dry out.</strong>{' '}
                  {periods.totalRemainingKgPerM2.toFixed(2)} kg/m² is still there at the end
                  of the drying season, so this build-up gains water every year. That is the
                  failure mode that rots a wall slowly rather than quickly.
                </>
              )}
            </p>

            <ul className="plane-list">
              {periods.planes.map((plane) => (
                <li key={plane.boundaryIndex}>
                  <strong>{plane.label}</strong> — collects{' '}
                  {plane.accumulatedKgPerM2.toFixed(2)} kg/m² at {plane.temperatureC.toFixed(1)}{' '}
                  °C
                  {plane.daysToDry !== undefined
                    ? `, and would need ${plane.daysToDry.toFixed(0)} days to clear`
                    : plane.remainingKgPerM2 > plane.accumulatedKgPerM2
                      ? `, and goes on gaining under the drying conditions, reaching ` +
                        `${plane.remainingKgPerM2.toFixed(2)} kg/m² by the end of them`
                      : ', and nothing evaporates from it under the drying conditions'}
                  .
                </li>
              ))}
            </ul>
          </>
        )}

        <details className="explain">
          <summary>What this calculation leaves out</summary>
          <p className="tour-caveat">
            The Glaser method moves water vapour by diffusion and nothing else. It does
            not model rain driven into an outer leaf, liquid water moving through a
            material by capillarity, air carrying moisture through gaps and joints, or the
            moisture a hygroscopic material takes up and gives back. Those are not minor
            corrections: in a masonry outer leaf they dominate, and a wall takes far more
            water from a day of driving rain than from a season of the rates above.
          </p>
          <p className="tour-caveat">
            So <em>where</em> a wet plane sits matters as much as how much arrives there.
            The back of a leaf that is built to get wet and drain is a different
            proposition from the same rate against insulation or sheathing, which are not
            — and the method cannot tell you which of those you are looking at. You can.
            {/* TODO(verify): the clause in BS EN ISO 13788 that lists what the method
            does not account for. See VERIFY.md row V28. */}
          </p>
        </details>

        <details className="explain">
          <summary>Why there is no pass mark here</summary>
          <p className="tour-caveat">
            A standard assessment compares the accumulated amount against a permitted
            maximum, and sets the seasons and their weather from a design climate for the
            location. OpenUValue does not ship either: the season lengths, the drying
            weather and the limit you judge against are all things it cannot attribute to
            a clause, and inventing them would make a made-up number look like a verdict.
            What is calculated here is the arithmetic — rate multiplied by duration, then
            the net rate over the drying season applied to what the plane already held —
            on the periods and conditions you set. That second period can add water as
            well as remove it, and does whenever the conditions you give it still drive
            vapour outwards. The numbers are real; deciding what counts as too much is
            still yours.
          </p>
        </details>
      </section>

      {/* --------------------------------------------------------- mould ---- */}
      <section className="panel">
        <h2>
          Mould on the inside surface
          <HelpButton topicId="moisture-mould" label="the mould check" onOpen={onOpenGuide} />
        </h2>
        {surfaceHumidity === undefined ? (
          <p className="footnote">No internal surface to assess.</p>
        ) : (
          <>
            <p className={mouldRisk ? 'verdict verdict-risk' : 'verdict verdict-ok'}>
              The internal surface sits at{' '}
              <strong>{surface?.temperatureC.toFixed(1)} °C</strong>, which
              puts the air against it at <strong>{surfaceHumidity.toFixed(0)} % humidity</strong>{' '}
              even though the room is at {conditions.internalRelativeHumidityPercent} %.{' '}
              {mouldRisk ? (
                <>
                  That is at or above the {MOULD_CRITICAL_SURFACE_HUMIDITY_PERCENT} % where
                  mould will grow, and it will do so long before any liquid water appears.
                </>
              ) : (
                <>
                  That is below the {MOULD_CRITICAL_SURFACE_HUMIDITY_PERCENT} % where mould
                  becomes a risk.
                </>
              )}
            </p>
            <p className="footnote">
              Mould does not need condensation, only persistently damp air against a
              surface — which is why it appears in cold corners and behind furniture first.
              Switching the internal surface to <em>reduced air circulation</em> on the
              build-up tab is how to test those spots.
            </p>
          </>
        )}
      </section>
    </div>
  );
}
