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
import { ElementPicker } from './ElementPicker.js';
import type { UiElementKind } from '../state/model.js';

export interface BoundaryPanelProps {
  /** Opens the feature guide at a topic. */
  readonly onOpenGuide: (topicId: string) => void;
  readonly heatFlowDirection: HeatFlowDirection;
  readonly elementKind: UiElementKind;
  readonly roofPitchDegrees: number;
  readonly conditions: EnvironmentConditions;
  readonly internalSurfaceCondition: InternalSurfaceCondition;
  readonly externalEnvironmentKind: ExternalEnvironmentKind;
  readonly result: UValueResult;
  readonly onElementChange: (kind: UiElementKind, roofPitchDegrees: number) => void;
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

/**
 * A small picture of each case, because "air circulation at the surface" describes a
 * thing most people have never had to name, and two words of label cannot carry it. One
 * shows the room's air sweeping the wall; the other shows something parked against it.
 */
function SurfaceConditionIcon({ kind }: { readonly kind: InternalSurfaceCondition }): JSX.Element {
  return (
    <svg viewBox="0 0 34 26" className="surface-icon" aria-hidden="true">
      {/* The wall, in section, with its inside face on the right. */}
      <rect x={1} y={2} width={7} height={22} className="surface-icon-wall" />
      {kind === 'normal-air-circulation' ? (
        <>
          {/* Air moving freely past the face. */}
          {[6, 13, 20].map((y) => (
            <path key={y} d={`M 12 ${y} q 6 -3 11 0 q 5 3 9 0`} className="surface-icon-air" />
          ))}
        </>
      ) : (
        <>
          {/* Something standing against it, with the air stalled in the gap behind. */}
          <rect x={17} y={4} width={15} height={18} className="surface-icon-block" />
          <path d="M 11 13 q 2 -2 4 0" className="surface-icon-air" />
        </>
      )}
    </svg>
  );
}

export function BoundaryPanel({
  heatFlowDirection,
  elementKind,
  roofPitchDegrees,
  conditions,
  internalSurfaceCondition: internalCondition,
  externalEnvironmentKind,
  result,
  onElementChange,
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

      <fieldset className="choice-group">
        <legend>
          What are you building?
          <HelpButton
            topicId="conditions-direction"
            label="the element and its pitch"
            onOpen={onOpenGuide}
          />
        </legend>
        <ElementPicker
          elementKind={elementKind}
          roofPitchDegrees={roofPitchDegrees}
          onChange={onElementChange}
        />
      </fieldset>

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
            <p className="choice-lead">
              Still air clings to the inside face of a wall in a thin film, and that film
              insulates. On a wall it is worth about as much as 8 mm of plasterboard. Park
              a sofa or a wardrobe against the wall and the room&rsquo;s air stops sweeping
              it away: the film thickens and the surface behind it runs colder. That is the
              only thing these two settings change.
            </p>
            {INTERNAL_SURFACE_CONDITIONS.map((condition) => (
              <label key={condition.kind} className="choice choice-with-icon">
                <input
                  type="radio"
                  name="internal-surface-condition"
                  value={condition.kind}
                  checked={condition.kind === internalCondition}
                  onChange={() => onInternalSurfaceConditionChange(condition.kind)}
                />
                <SurfaceConditionIcon kind={condition.kind} />
                <span>
                  <strong>{condition.label}</strong>
                  <em>{condition.summary}</em>
                  <em className="choice-figure">
                    surface resistance {condition.fixedRsiM2KPerW ?? 'from the standard'}
                    {condition.fixedRsiM2KPerW === undefined ? '' : ' m²K/W'}
                    {condition.departsFromIso6946 ? ' · not a BR 443 U-value' : ' · BR 443'}
                  </em>
                </span>
              </label>
            ))}
          </fieldset>
          {/*
            * The one thing a reader most needs to know about this control is what it does
            * NOT do, since the obvious guess is that the cautious setting is the one that
            * catches damp.
            */}
          <p className="choice-note">
            <strong>The damp and mould check ignores this setting.</strong> BS EN ISO 13788
            requires a fixed 0.25 m²K/W for that, which stands for the worst corner of the
            room, so the verdict is worked out at that figure whichever option is chosen
            here, and on the coldest path through the wall. This control changes the
            U-value and the temperature line, nothing else.
          </p>
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
                  {environment.supported ? '' : ' (not available)'}
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
            also raises the total resistance, so this U-value is a moisture-protection
            figure rather than a BR 443 U-value.
          </strong>
        ) : (
          <>BS EN ISO 6946, adopted by BR 443.</>
        )}
      </p>
    </section>
  );
}
