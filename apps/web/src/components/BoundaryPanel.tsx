import type {
  EnvironmentConditions,
  ExternalEnvironmentKind,
  HeatFlowDirection,
  InternalSurfaceCondition,
  UValueResult,
} from '@openuvalue/engine';
import {
  INTERNAL_SURFACE_CONDITIONS,
  externalEnvironment,
  externalEnvironmentsForDirection,
} from '@openuvalue/engine';
import {
  EXTERNAL_CONDITION_PRESETS,
  INTERNAL_CONDITION_PRESET,
  commonDefaultConditions,
  conditionsForEnvironment,
} from '../state/model.js';
import { HelpButton } from './guide/Guide.js';

const DIRECTION_LABELS: Record<HeatFlowDirection, string> = {
  horizontal: 'Horizontal — wall',
  upward: 'Upward — roof or ceiling',
  downward: 'Downward — floor',
};

export interface BoundaryPanelProps {
  /** Opens the feature guide at a topic. */
  readonly onOpenGuide: (topicId: string) => void;
  readonly heatFlowDirection: HeatFlowDirection;
  readonly conditions: EnvironmentConditions;
  readonly internalSurfaceCondition: InternalSurfaceCondition;
  readonly externalEnvironmentKind: ExternalEnvironmentKind;
  readonly result: UValueResult;
  readonly onDirectionChange: (direction: HeatFlowDirection) => void;
  readonly onConditionsChange: (conditions: EnvironmentConditions) => void;
  readonly onInternalSurfaceConditionChange: (condition: InternalSurfaceCondition) => void;
  readonly onExternalEnvironmentChange: (
    kind: ExternalEnvironmentKind,
    conditions: EnvironmentConditions,
  ) => void;
}

function clampPercent(value: number): number {
  return Math.min(100, Math.max(0, value));
}

export function BoundaryPanel({
  heatFlowDirection,
  conditions,
  internalSurfaceCondition: internalCondition,
  externalEnvironmentKind,
  result,
  onDirectionChange,
  onConditionsChange,
  onInternalSurfaceConditionChange,
  onExternalEnvironmentChange,
  onOpenGuide,
}: BoundaryPanelProps): JSX.Element {
  const set = (patch: Partial<EnvironmentConditions>): void => {
    onConditionsChange({ ...conditions, ...patch });
  };

  const applicable = externalEnvironmentsForDirection(heatFlowDirection);
  const selectedExternal = externalEnvironment(externalEnvironmentKind);
  const selectedInternal =
    INTERNAL_SURFACE_CONDITIONS.find((candidate) => candidate.kind === internalCondition) ??
    INTERNAL_SURFACE_CONDITIONS[0];
  const externalPreset = EXTERNAL_CONDITION_PRESETS[externalEnvironmentKind];

  return (
    <section className="panel boundary-panel">
      <div className="panel-head">
        <h2>
        Conditions
        <HelpButton topicId="conditions-direction" label="the conditions box" onOpen={onOpenGuide} />
      </h2>
        <button
          type="button"
          className="ghost-button"
          onClick={() => onConditionsChange(commonDefaultConditions(externalEnvironmentKind))}
          title="Set both sides back to typical starting values"
        >
          Common defaults
        </button>
      </div>

      <label className="field">
        Direction of heat flow
        <select
          value={heatFlowDirection}
          onChange={(event) => onDirectionChange(event.target.value as HeatFlowDirection)}
        >
          {(Object.keys(DIRECTION_LABELS) as HeatFlowDirection[]).map((direction) => (
            <option key={direction} value={direction}>
              {DIRECTION_LABELS[direction]}
            </option>
          ))}
        </select>
      </label>

      <div className="boundary-sides">
        {/* ----------------------------------------------------------- inside --- */}
        <div className="boundary-side">
          <h3>
            <span className="side-chip side-chip-inside">Inside</span>
            <HelpButton topicId="conditions-inside" label="inside conditions" onOpen={onOpenGuide} />
          </h3>

          <fieldset className="choice-group">
            <legend>
              Air circulation at the surface
              <HelpButton
                topicId="conditions-surface"
                label="air circulation at the surface"
                onOpen={onOpenGuide}
              />
            </legend>
            {INTERNAL_SURFACE_CONDITIONS.map((condition) => (
              <label key={condition.kind} className="choice">
                <input
                  type="radio"
                  name="internal-surface-condition"
                  value={condition.kind}
                  checked={condition.kind === internalCondition}
                  onChange={() => onInternalSurfaceConditionChange(condition.kind)}
                />
                <span>
                  <strong>{condition.label}</strong>
                  <em>{condition.summary}</em>
                </span>
              </label>
            ))}
          </fieldset>
          {/* The reasoning is a click away rather than a wall of text by default. */}
          <details className="explain">
            <summary>What does this change?</summary>
            {INTERNAL_SURFACE_CONDITIONS.map((condition) => (
              <p key={condition.kind}>
                <strong>{condition.label}.</strong> {condition.description}
              </p>
            ))}
          </details>

          <div className="pair">
            <label className="field">
              Temperature, °C
              <input
                type="number"
                step={0.5}
                value={conditions.internalAirTemperatureC}
                onChange={(event) =>
                  set({ internalAirTemperatureC: Number(event.target.value) })
                }
              />
            </label>
            <label className="field">
              Humidity, %
              <input
                type="number"
                min={0}
                max={100}
                step={1}
                value={conditions.internalRelativeHumidityPercent}
                onChange={(event) =>
                  set({
                    internalRelativeHumidityPercent: clampPercent(Number(event.target.value)),
                  })
                }
              />
            </label>
          </div>
          <p className="footnote">{INTERNAL_CONDITION_PRESET.note}</p>
        </div>

        {/* ---------------------------------------------------------- outside --- */}
        <div className="boundary-side">
          <h3>
            <span className="side-chip side-chip-outside">Outside</span>
            <HelpButton topicId="conditions-outside" label="what is on the other side" onOpen={onOpenGuide} />
          </h3>

          <label className="field">
            What is on the other side
            <select
              value={externalEnvironmentKind}
              onChange={(event) => {
                const kind = event.target.value as ExternalEnvironmentKind;
                onExternalEnvironmentChange(kind, conditionsForEnvironment(kind, conditions));
              }}
            >
              {applicable.map((environment) => (
                <option
                  key={environment.kind}
                  value={environment.kind}
                  disabled={!environment.supported}
                >
                  {environment.label}
                  {environment.supported ? '' : ' — not available'}
                </option>
              ))}
            </select>
          </label>
          <p className="footnote">{selectedExternal.summary}</p>
          <details className="explain">
            <summary>What does this change?</summary>
            <p>{selectedExternal.description}</p>
            {applicable
              .filter((environment) => !environment.supported)
              .map((environment) => (
                <p key={environment.kind}>
                  <strong>{environment.label} is not available.</strong>{' '}
                  {environment.unsupportedReason}
                </p>
              ))}
          </details>

          <div className="pair">
            <label className="field">
              Temperature, °C
              <input
                type="number"
                step={0.5}
                value={conditions.externalAirTemperatureC}
                onChange={(event) =>
                  set({ externalAirTemperatureC: Number(event.target.value) })
                }
              />
            </label>
            <label className="field">
              Humidity, %
              <input
                type="number"
                min={0}
                max={100}
                step={1}
                value={conditions.externalRelativeHumidityPercent}
                onChange={(event) =>
                  set({
                    externalRelativeHumidityPercent: clampPercent(Number(event.target.value)),
                  })
                }
              />
            </label>
          </div>
          <p className="footnote">{externalPreset.note}</p>
        </div>
      </div>

      {/*
        The resolved surface resistances come from the calculation itself, not from a
        second copy of the rules here, so what is shown is always what was used.
      */}
      <p className="footnote">
        In use: R<sub>si</sub> {result.rsiM2KPerW.toFixed(2)}, R<sub>se</sub>{' '}
        {result.rseM2KPerW.toFixed(2)} m²K/W.{' '}
        {selectedInternal?.departsFromIso6946 === true ? (
          <strong>
            Reduced air circulation raises R<sub>si</sub> above the BS EN ISO 6946 value, which
            also raises the total resistance — so this U-value is a moisture-protection figure,
            not a BR 443 U-value.
          </strong>
        ) : (
          <>BS EN ISO 6946, adopted by BR 443.</>
        )}
      </p>
    </section>
  );
}
