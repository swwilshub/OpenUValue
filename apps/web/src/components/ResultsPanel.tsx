import type {
  AirGapLevel,
  CorrectionResult,
  TemperatureProfile,
  UValueResult,
  Warning,
} from '@openuvalue/engine';
import {
  AIR_GAP_LEVELS,
  roundResistanceForReporting,
  roundUValueForReporting,
} from '@openuvalue/engine';
import { HelpButton } from './guide/Guide.js';

const WARNING_TITLES: Record<Warning['code'], string> = {
  'combined-method-ratio-exceeds-limit': 'Out of scope for this method',
  'metal-bridging-out-of-scope': 'Metal bridging',
  'air-layer-thickness-out-of-table': 'Air layer outside the table',
  'slightly-ventilated-interpolated': 'Slightly ventilated cavity',
  'well-ventilated-outer-layers-ignored': 'Well ventilated cavity',
  'in-house-convention': 'Not a standard method',
  'value-needs-verification': 'Needs verification',
};

export interface ResultsPanelProps {
  /** Opens the feature guide at a topic. */
  readonly onOpenGuide: (topicId: string) => void;
  readonly result: UValueResult;
  readonly profile: TemperatureProfile;
  /** Undefined where the element has no U-value to correct. */
  readonly corrections?: CorrectionResult | undefined;
  readonly airGapLevel: AirGapLevel;
  readonly onAirGapLevelChange: (level: AirGapLevel) => void;
}

export function ResultsPanel({
  result,
  profile,
  corrections,
  airGapLevel,
  onAirGapLevelChange,
  onOpenGuide,
}: ResultsPanelProps): JSX.Element {
  /*
   * BR 443 (2019) 4.8: "The U-value is first calculated without taking account of
   * these effects, and then a correction DU is added to obtain the final U-value." So
   * the headline is the corrected figure, and the uncorrected one is shown beside it
   * rather than instead of it.
   */
  const reportedU = corrections?.correctedUValueWPerM2K ?? result.uValueWPerM2K;
  const rounded = roundUValueForReporting(reportedU);
  const layersOnly = result.totalResistanceM2KPerW - result.rsiM2KPerW - result.rseM2KPerW;
  const coldNodes = profile.nodes.filter((node) => node.isBelowInternalDewPoint);
  const internalSurface = profile.nodes.find((node) => node.kind === 'internal-surface');

  return (
    <section className="panel results">
      <h2>
        Result
        <HelpButton topicId="result-headline" label="the result box" onOpen={onOpenGuide} />
      </h2>

      {rounded === null ? (
        <div className="u-value u-value-void">
          <span className="u-value-figure">no U-value</span>
          <span className="u-value-reason">
            The BS EN ISO 6946 combined method does not apply to this build-up
            {result.outOfScopeReasons.includes('metal-bridging') && ' (metal bridging)'}
            {result.outOfScopeReasons.includes('upper-lower-ratio-exceeds-limit') &&
              ` (R′T/R″T = ${result.upperToLowerLimitRatio.toFixed(2)}, limit 1.5)`}
            . It needs numerical calculation to BS EN ISO 10211.
          </span>
        </div>
      ) : (
        <div className="u-value">
          <span className="u-value-figure">{rounded.toFixed(2)}</span>
          <span className="u-value-unit">W/(m²·K)</span>
        </div>
      )}

      {corrections !== undefined && (
        <div className="corrections">
          <label className="field">
            Air gaps in the insulation (BR 443 4.8.1)
            <select
              value={airGapLevel}
              onChange={(event) => onAirGapLevelChange(event.target.value as AirGapLevel)}
            >
              {AIR_GAP_LEVELS.map((level) => (
                <option key={level.level} value={level.level} title={level.description}>
                  {level.label} — ΔU {level.deltaUWPerM2K.toFixed(2)}
                </option>
              ))}
            </select>
          </label>
          <p className="footnote">
            {corrections.totalDeltaUWPerM2K === 0 ? (
              <>No correction for air gaps at this level.</>
            ) : corrections.isNegligible ? (
              <>
                ΔU<sub>g</sub> = {corrections.totalDeltaUWPerM2K.toFixed(4)} W/(m²·K), which is
                under 3% of the U-value, so BS EN ISO 6946 permits omitting it — and it has
                been omitted. It is shown here rather than lost.
              </>
            ) : (
              <>
                ΔU<sub>g</sub> = <strong>{corrections.totalDeltaUWPerM2K.toFixed(4)} W/(m²·K)</strong>{' '}
                added to an uncorrected {result.uValueWPerM2K?.toFixed(3)}.
              </>
            )}{' '}
            BR 443 4.8.1 makes level 1 the default unless the conditions for level 0 are met.
            The mechanical-fastener and inverted-roof corrections are not implemented.
          </p>
          {corrections.warnings.map((item) => (
            <p key={item.message} className="footnote">
              {item.message}
            </p>
          ))}
        </div>
      )}

      <dl className="result-grid">
        <div>
          <dt>Total R</dt>
          <dd>{roundResistanceForReporting(result.totalResistanceM2KPerW).toFixed(3)} m²K/W</dd>
        </div>
        <div>
          <dt>Layers only</dt>
          <dd>{roundResistanceForReporting(layersOnly).toFixed(3)} m²K/W</dd>
        </div>
        <div>
          <dt>R
            <sub>si</sub> / R<sub>se</sub></dt>
          <dd>
            {result.rsiM2KPerW.toFixed(2)} / {result.rseM2KPerW.toFixed(2)}
          </dd>
        </div>
        <div>
          <dt>Heat flux</dt>
          <dd>{profile.heatFluxWPerM2.toFixed(2)} W/m²</dd>
        </div>
      </dl>

      {result.method === 'iso6946-combined' && (
        <details className="combined-detail" open>
          <summary>Combined method (bridged layers)</summary>
          <dl className="result-grid">
            <div>
              <dt>Upper limit R′<sub>T</sub></dt>
              <dd>
                {roundResistanceForReporting(result.totalResistanceUpperLimitM2KPerW).toFixed(3)}
              </dd>
            </div>
            <div>
              <dt>Lower limit R″<sub>T</sub></dt>
              <dd>
                {roundResistanceForReporting(result.totalResistanceLowerLimitM2KPerW).toFixed(3)}
              </dd>
            </div>
            <div>
              <dt>Ratio</dt>
              <dd
                className={
                  result.upperToLowerLimitRatio > 1.5 ? 'value-bad' : 'value-ok'
                }
              >
                {result.upperToLowerLimitRatio.toFixed(3)} / 1.5
              </dd>
            </div>
            <div>
              <dt>Error estimate</dt>
              <dd className={result.maxRelativeErrorPercent > 20 ? 'value-bad' : 'value-ok'}>
                ±{result.maxRelativeErrorPercent.toFixed(2)} %
              </dd>
            </div>
          </dl>
          <p className="footnote">
            R<sub>T</sub> is the mean of the two limits. The ratio limit of 1.5 and the
            20 % error limit are the same rule expressed two ways.
          </p>
        </details>
      )}

      <h3>
        Surface condensation
        <HelpButton topicId="result-surface-condensation" label="surface condensation" onOpen={onOpenGuide} />
      </h3>
      {internalSurface === undefined ? (
        <p className="empty-note">Add a layer to assess the internal surface.</p>
      ) : internalSurface.isBelowInternalDewPoint ? (
        <p className="verdict verdict-risk">
          The internal surface reaches{' '}
          {internalSurface.worstCaseTemperatureC.toFixed(1)} °C at worst, at or below the
          internal dew point of {profile.internalDewPointTemperatureC.toFixed(1)} °C.
          Condensation will form on the surface in these conditions.
        </p>
      ) : (
        <p className="verdict verdict-ok">
          The internal surface stays at{' '}
          {internalSurface.worstCaseTemperatureC.toFixed(1)} °C at worst,{' '}
          {(
            internalSurface.worstCaseTemperatureC - profile.internalDewPointTemperatureC
          ).toFixed(1)}{' '}
          K clear of the internal dew point of{' '}
          {profile.internalDewPointTemperatureC.toFixed(1)} °C.
        </p>
      )}

      <h3>
        Dew-point screening, within the element
        <HelpButton topicId="result-dew-screen" label="dew-point screening" onOpen={onOpenGuide} />
      </h3>
      {coldNodes.length === 0 ? (
        <p className="verdict verdict-ok">
          No interface falls to the internal dew point of{' '}
          {profile.internalDewPointTemperatureC.toFixed(1)} °C.
        </p>
      ) : (
        <div className="verdict verdict-screen">
          <p>
            {coldNodes.length} interface{coldNodes.length === 1 ? '' : 's'} sit at or below
            the internal dew point of{' '}
            {profile.internalDewPointTemperatureC.toFixed(1)} °C:
          </p>
          <ul>
            {coldNodes.map((node, index) => (
              <li key={`${node.label}-${index}`}>
                <strong>{node.label}</strong> — worst case{' '}
                {node.worstCaseTemperatureC.toFixed(1)} °C
                {node.worstCasePathId !== 'n/a' && ` on the ${node.worstCasePathId} path`}
                {node.cumulativeSdM > 0 && `, S`}
                {node.cumulativeSdM > 0 && <sub>d</sub>}
                {node.cumulativeSdM > 0 && ` ${node.cumulativeSdM.toFixed(2)} m inboard`}
              </li>
            ))}
          </ul>
        </div>
      )}
      <p className="footnote">
        <strong>This is a screening indicator, not an interstitial condensation
        assessment.</strong> Being colder than the internal dew point is necessary for
        condensation at an interface but not sufficient: whether vapour actually arrives
        there at saturation depends on the vapour resistance inboard of it, shown above
        as S<sub>d</sub>. A well-insulated element has most of its thickness below the
        internal dew point by design, so expect interfaces to be listed here that a
        BS EN ISO 13788 or Glaser calculation would clear. That calculation is Phase 3
        — see ROADMAP.md. The internal surface above is the one place where the
        comparison is the real criterion, because nothing impedes vapour reaching it.
      </p>
      <p className="footnote">
        Both are assessed on every path through the element and reported as the worst
        case at each interface, so changing the profile shown below never changes them.
      </p>

      {profile.warnings.length > 0 && (
        <>
          <h3>
        Notes and limits
        <HelpButton topicId="result-warnings" label="notes and limits" onOpen={onOpenGuide} />
      </h3>
          <ul className="warnings">
            {profile.warnings.map((warning, index) => (
              <li key={`${warning.code}-${index}`} className={`warning warning-${warning.code}`}>
                <strong>{WARNING_TITLES[warning.code]}</strong>
                <span>{warning.message}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
