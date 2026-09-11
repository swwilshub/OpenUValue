import { useState } from 'react';
import type { BuildingElement, EnvironmentConditions } from '@openuvalue/engine';
import { assessInterstitialCondensation, ratePerDayGPerM2 } from '@openuvalue/engine';
import { GlaserChart } from './GlaserChart.js';

export interface InterstitialPanelProps {
  readonly element: BuildingElement;
  readonly conditions: EnvironmentConditions;
}

export function InterstitialPanel({
  element,
  conditions,
}: InterstitialPanelProps): JSX.Element | null {
  const [pathId, setPathId] = useState<string | undefined>(undefined);

  let assessment;
  try {
    assessment = assessInterstitialCondensation(element, conditions);
  } catch {
    // The U-value path reports input errors already; this panel simply stands down
    // rather than showing a second copy of the same message.
    return null;
  }

  const shown =
    assessment.perPath.find((path) => path.pathId === pathId) ?? assessment.worst;
  const ratePerDay = ratePerDayGPerM2(assessment.totalCondensationRateKgPerM2S);

  return (
    <section className="panel">
      <div className="panel-head">
        <h2>Will vapour condense inside?</h2>
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

      {assessment.condenses ? (
        <p className="verdict verdict-risk">
          <strong>Yes — at these conditions.</strong> Vapour reaches saturation inside the
          build-up and condenses at{' '}
          {assessment.worst.assessment.condensationPlaneIndices.length === 1
            ? 'one interface'
            : `${assessment.worst.assessment.condensationPlaneIndices.length} interfaces`}
          , totalling <strong>{ratePerDay.toFixed(1)} g/m² per day</strong>. Whether that
          dries out again over a year is the twelve-month assessment, which needs climate
          data this tool does not have — see below.
        </p>
      ) : (
        <p className="verdict verdict-ok">
          <strong>No — at these conditions.</strong> The vapour pressure stays below
          saturation right through the build-up, so nothing condenses inside it. Where the
          temperature check flags an interface as colder than the dew point, this is the
          calculation that clears it: the vapour never arrives.
        </p>
      )}

      {assessment.worst.assessment.surfaceCondensation && (
        <p className="verdict verdict-risk">
          <strong>Condensation on the internal surface.</strong> The room air is at or
          above saturation against the wall itself. That is a different problem from the
          interstitial one, and it shows up on the room side rather than inside the
          construction.
        </p>
      )}

      <GlaserChart assessment={assessment} path={shown} />

      <details className="explain">
        <summary>How to read this, and what it does not cover</summary>
        <p>
          The x axis is <strong>cumulative S<sub>d</sub></strong>, not thickness. On that
          axis a steady vapour flow is a straight line, so a straight run means vapour is
          passing through and a kink means it is condensing. A 0.2 mm vapour barrier takes
          up most of the width and a 215 mm brick very little — which is the point: for
          vapour, the sheet is the thick layer.
        </p>
        <p>
          The upper line is saturation, which follows from the temperature at each
          interface. The lower line is the vapour pressure that can actually exist: it
          runs straight from the inside pressure toward the outside one, and where that
          straight line would break through the saturation ceiling it cannot, so it is
          pulled down onto it and the surplus condenses there.
        </p>
        <p className="tour-caveat">
          <strong>This is one set of conditions, not a year.</strong> BS EN ISO 13788's
          full assessment repeats this construction for each of twelve months of a design
          year and passes an element only if everything that condenses in winter dries out
          again by the end of it. That needs monthly climate data for the location, which
          OpenUValue does not ship and will not invent. What is shown here is the same
          construction and the same equations applied to the conditions you have set — so
          it answers “does this build-up condense at these conditions, and how fast”, not
          “does it dry out over a year”.
        </p>
      </details>

      {assessment.warnings.length > 0 && (
        <ul className="warning-list">
          {assessment.warnings.map((item) => (
            <li key={`${item.code}-${item.message}`}>{item.message}</li>
          ))}
        </ul>
      )}
    </section>
  );
}
