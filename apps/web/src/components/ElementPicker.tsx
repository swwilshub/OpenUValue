import {
  PITCH_TREATED_AS_VERTICAL_DEGREES,
  heatFlowAngleFromHorizontalDegrees,
  surfaceResistances,
} from '@openuvalue/engine';
import { directionForElement } from '../state/model.js';
import type { UiElementKind } from '../state/model.js';

/**
 * What the element is, in the words somebody would use, with the direction of heat flow
 * falling out of it.
 *
 * The engine needs a direction. A person has a wall, a roof or a floor. Asking for the
 * direction put the physics in the control and left "upward" to be decoded by whoever
 * read it, and it also lost the pitch, which a roof has and which decides the direction
 * for it.
 *
 * The pitch figure is here because the rule surprises people, including the version of
 * this tool that used to state it backwards. BS EN ISO 6946 tabulates by the direction
 * heat *flows*, and heat leaves normal to the face, so a roof has to reach 60° before its
 * heat flow comes within the ±30° band that takes a wall's figures. The drawing shows the
 * slope, the arrow and the band together, which is quicker than the sentence.
 */

const ELEMENTS: readonly { kind: UiElementKind; label: string }[] = [
  { kind: 'wall', label: 'Wall' },
  { kind: 'roof', label: 'Roof or ceiling' },
  { kind: 'floor', label: 'Floor' },
];

/** A small section through each, so the choice reads before the words do. */
function ElementIcon({ kind }: { readonly kind: UiElementKind }): JSX.Element {
  return (
    <svg viewBox="0 0 30 22" className="element-icon" aria-hidden="true">
      {kind === 'wall' && (
        <>
          <rect x={11} y={2} width={8} height={18} className="element-icon-body" />
          <path d="M 6 11 L 1 11" className="element-icon-flow" markerEnd="url(#element-arrow)" />
        </>
      )}
      {kind === 'roof' && (
        <>
          <path d="M 3 19 L 21 5 L 25 10 L 7 24 Z" className="element-icon-body" />
          <path d="M 16 9 L 20 3" className="element-icon-flow" markerEnd="url(#element-arrow)" />
        </>
      )}
      {kind === 'floor' && (
        <>
          <rect x={3} y={7} width={24} height={7} className="element-icon-body" />
          <path d="M 15 17 L 15 21" className="element-icon-flow" markerEnd="url(#element-arrow)" />
        </>
      )}
    </svg>
  );
}

/**
 * The slope, the heat flowing out of it, and the band that decides which column of the
 * table applies. Drawn live from the pitch on the control.
 */
function PitchFigure({ pitchDegrees }: { readonly pitchDegrees: number }): JSX.Element {
  const radians = (pitchDegrees * Math.PI) / 180;
  const originX = 18;
  const groundY = 88;
  const slopeLength = 78;
  // Screen y grows downward, so a rising slope subtracts.
  const apexX = originX + slopeLength * Math.cos(radians);
  const apexY = groundY - slopeLength * Math.sin(radians);

  // The outward normal is the slope turned a quarter turn towards the sky.
  const midX = (originX + apexX) / 2;
  const midY = (groundY + apexY) / 2;
  const normalLength = 26;
  const normalX = midX + normalLength * Math.sin(radians);
  const normalY = midY - normalLength * Math.cos(radians);

  // The wedge within 30 degrees of horizontal, drawn so its apex stays on the canvas.
  const bandRun = 92;
  const bandRise = bandRun * Math.tan(Math.PI / 6);
  const isWall = heatFlowAngleFromHorizontalDegrees(pitchDegrees) <= 30;

  return (
    <svg
      viewBox="0 0 200 104"
      className="pitch-figure"
      role="img"
      aria-label={`A roof pitched at ${pitchDegrees} degrees`}
    >
      <defs>
        <marker
          id="pitch-arrow"
          viewBox="0 0 8 8"
          refX={7}
          refY={4}
          markerWidth={5}
          markerHeight={5}
          orient="auto"
        >
          <path d="M 0 1 L 7 4 L 0 7 Z" className="pitch-arrow-head" />
        </marker>
      </defs>

      <path
        d={`M ${originX} ${groundY} L ${originX + bandRun} ${groundY} L ${
          originX + bandRun
        } ${groundY - bandRise} Z`}
        className={isWall ? 'pitch-band is-active' : 'pitch-band'}
      />
      <text x={originX + bandRun - 3} y={groundY - 6} className="pitch-label" textAnchor="end">
        ±30°
      </text>

      <line x1={originX} y1={groundY} x2={originX + bandRun} y2={groundY} className="pitch-ground" />
      <line x1={originX} y1={groundY} x2={apexX} y2={apexY} className="pitch-slope" />
      <line
        x1={midX}
        y1={midY}
        x2={normalX}
        y2={normalY}
        className="pitch-flow"
        markerEnd="url(#pitch-arrow)"
      />
      <text x={normalX + 4} y={normalY + 3} className="pitch-label">
        heat out
      </text>
      <text x={originX} y={groundY + 12} className="pitch-label">
        {pitchDegrees}° pitch
      </text>
      <text x={originX + bandRun + 6} y={groundY + 12} className="pitch-label">
        {isWall ? 'wall figures' : 'roof figures'}
      </text>
    </svg>
  );
}

export interface ElementPickerProps {
  readonly elementKind: UiElementKind;
  readonly roofPitchDegrees: number;
  readonly onChange: (kind: UiElementKind, roofPitchDegrees: number) => void;
}

export function ElementPicker({
  elementKind,
  roofPitchDegrees,
  onChange,
}: ElementPickerProps): JSX.Element {
  const direction = directionForElement(elementKind, roofPitchDegrees);
  const resistances = surfaceResistances(direction);
  const flowAngle = heatFlowAngleFromHorizontalDegrees(
    elementKind === 'roof' ? roofPitchDegrees : elementKind === 'wall' ? 90 : 0,
  );

  return (
    <div className="element-picker">
      <svg width={0} height={0} aria-hidden="true" className="element-defs">
        <defs>
          <marker id="element-arrow" viewBox="0 0 8 8" refX={7} refY={4} markerWidth={4}
            markerHeight={4} orient="auto">
            <path d="M 0 1 L 7 4 L 0 7 Z" className="element-icon-arrow-head" />
          </marker>
        </defs>
      </svg>

      <ul className="element-options">
        {ELEMENTS.map((entry) => (
          <li key={entry.kind}>
            <button
              type="button"
              className={entry.kind === elementKind ? 'element-option is-current' : 'element-option'}
              aria-pressed={entry.kind === elementKind}
              onClick={() => onChange(entry.kind, roofPitchDegrees)}
            >
              <ElementIcon kind={entry.kind} />
              <span>{entry.label}</span>
            </button>
          </li>
        ))}
      </ul>

      {elementKind === 'roof' && (
        <div className="pitch-control">
          <div className="pitch-inputs">
            <label className="field">
              <span className="field-caption">Pitch, degrees</span>
              <input
                type="number"
                min={0}
                max={90}
                step={1}
                value={roofPitchDegrees}
                onChange={(event) =>
                  onChange('roof', Math.min(90, Math.max(0, Number(event.target.value))))
                }
              />
            </label>
            <input
              type="range"
              min={0}
              max={90}
              step={1}
              value={roofPitchDegrees}
              aria-label="Roof pitch"
              className="pitch-slider"
              onChange={(event) => onChange('roof', Number(event.target.value))}
            />
            <span className="pitch-hint">0° is flat. A cold loft ceiling is 0° too.</span>
          </div>
          <PitchFigure pitchDegrees={roofPitchDegrees} />
        </div>
      )}

      <p className="footnote">
        Heat leaves this element {flowAngle.toFixed(0)}° from horizontal, which BS EN ISO
        6946 puts in the <strong>{direction}</strong> column: R<sub>si</sub>{' '}
        {resistances.rsiM2KPerW.toFixed(2)}, R<sub>se</sub>{' '}
        {resistances.rseM2KPerW.toFixed(2)} m²K/W.
        {elementKind === 'roof' &&
          (direction === 'horizontal'
            ? ` A pitch of ${PITCH_TREATED_AS_VERTICAL_DEGREES}° or more brings the heat flow inside the ±30° band, so this roof takes a wall's surface resistances. Approved Document L still judges it as a roof.`
            : ` Below ${PITCH_TREATED_AS_VERTICAL_DEGREES}° a roof keeps the upward figures, however steep it looks.`)}
      </p>
    </div>
  );
}
