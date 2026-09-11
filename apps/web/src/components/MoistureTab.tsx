import { useMemo, useState } from 'react';
import type {
  BuildingElement,
  EnvironmentConditions,
  TemperatureProfile,
} from '@openuvalue/engine';
import {
  MOULD_CRITICAL_SURFACE_HUMIDITY_PERCENT,
  assessInterstitialCondensation,
  assessOverPeriods,
  surfaceRelativeHumidityPercent,
} from '@openuvalue/engine';
import type { UiLayer } from '../state/model.js';
import { GlaserChart } from './GlaserChart.js';
import { HumidityChart } from './HumidityChart.js';

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

const DEFAULT_PERIOD_DAYS = 90;

export interface MoistureTabProps {
  readonly element: BuildingElement;
  readonly layers: readonly UiLayer[];
  readonly conditions: EnvironmentConditions;
  readonly profile: TemperatureProfile;
}

export function MoistureTab({
  element,
  layers,
  conditions,
  profile,
}: MoistureTabProps): JSX.Element {
  const [pathId, setPathId] = useState<string | undefined>(undefined);
  const [wettingDays, setWettingDays] = useState(DEFAULT_PERIOD_DAYS);
  const [dryingDays, setDryingDays] = useState(DEFAULT_PERIOD_DAYS);
  const [dryingExternalC, setDryingExternalC] = useState(18);
  const [dryingExternalRh, setDryingExternalRh] = useState(55);

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

  return (
    <div className="moisture-tab">
      {/* ------------------------------------------------ humidity inside ---- */}
      <section className="panel">
        <div className="panel-head">
          <h2>How damp does it get inside the wall?</h2>
          {assessment.perPath.length > 1 && (
            <label className="inline-select">
              Path
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
        <h2>Where does it condense?</h2>
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
        <h2>Over a season, does it dry out again?</h2>
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
                  {plane.daysToDry === undefined
                    ? ', and nothing evaporates from it under the drying conditions'
                    : `, and would need ${plane.daysToDry.toFixed(0)} days to clear`}
                  .
                </li>
              ))}
            </ul>
          </>
        )}

        <details className="explain">
          <summary>Why there is no pass mark here</summary>
          <p className="tour-caveat">
            A standard assessment compares the accumulated amount against a permitted
            maximum, and sets the seasons and their weather from a design climate for the
            location. OpenUValue does not ship either: the season lengths, the drying
            weather and the limit you judge against are all things it cannot attribute to
            a clause, and inventing them would make a made-up number look like a verdict.
            What is calculated here is the arithmetic — rate multiplied by duration, then
            evaporation over the drying season — on the periods and conditions you set.
            The numbers are real; deciding what counts as too much is still yours.
          </p>
        </details>
      </section>

      {/* --------------------------------------------------------- mould ---- */}
      <section className="panel">
        <h2>Mould on the inside surface</h2>
        {surfaceHumidity === undefined ? (
          <p className="footnote">No internal surface to assess.</p>
        ) : (
          <>
            <p className={mouldRisk ? 'verdict verdict-risk' : 'verdict verdict-ok'}>
              The internal surface sits at{' '}
              <strong>{internalSurface?.worstCaseTemperatureC.toFixed(1)} °C</strong>, which
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
