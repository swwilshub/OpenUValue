import {
  type AirLayerEmissivity,
  LOW_EMISSIVITY_TABULATED,
  airspaceResistance,
} from '@openuvalue/engine';
import type { HeatFlowDirection } from '@openuvalue/engine';
import {
  CAVITY_PRESETS,
  type CavityIcon,
  type CavityPreset,
  type UiLayer,
  matchingCavityPreset,
} from '../state/model.js';

/**
 * Choosing what kind of cavity you have.
 *
 * This used to be a dropdown of the standard's own classes — unventilated, slightly
 * ventilated, well ventilated, high or low emissivity. Those are the *answer*. Someone
 * drawing a partial-fill wall does not know which of them they have; they know there is
 * a board against the inner leaf and a gap in front of it. So the options are named and
 * drawn for the construction, and the classification is shown as what each one resolves
 * to rather than as what you have to pick.
 *
 * Each card also carries the resistance it actually produces at the thickness set, which
 * is the part that makes the choice concrete: a foil facing the gap roughly doubles it,
 * and a well ventilated cavity throws away everything outboard of itself.
 */

const EMISSIVITY_VALUE: Readonly<Record<AirLayerEmissivity, number>> = {
  high: 0.9,
  low: LOW_EMISSIVITY_TABULATED,
};

/**
 * A section through each case, inside on the left. Ours, and deliberately schematic: two
 * leaves, what is between them, and where the air can go.
 */
function CavitySection({ icon }: { readonly icon: CavityIcon }): JSX.Element {
  return (
    <svg viewBox="0 0 44 30" className="cavity-icon" aria-hidden="true">
      {/* The inner leaf is common to all of them. */}
      <rect x={1} y={2} width={7} height={26} className="cav-leaf" />
      {icon === 'clear' && (
        <>
          <rect x={30} y={2} width={12} height={26} className="cav-leaf" />
          <path d="M 14 15 q 5 -3 10 0" className="cav-air" />
        </>
      )}
      {(icon === 'partial-fill' || icon === 'partial-fill-foil') && (
        <>
          <rect x={8} y={2} width={11} height={26} className="cav-board" />
          <rect x={30} y={2} width={12} height={26} className="cav-leaf" />
          {icon === 'partial-fill-foil' && (
            <line x1={19.6} y1={2} x2={19.6} y2={28} className="cav-foil" />
          )}
          <path d="M 23 15 q 3 -2 5 0" className="cav-air" />
        </>
      )}
      {icon === 'ventilated' && (
        <>
          <rect x={32} y={2} width={10} height={26} className="cav-cladding" />
          {/* Air entering low and leaving high: what makes it well ventilated. */}
          <path d="M 30 25 L 22 25 L 22 6 L 30 6" className="cav-air" />
          <path d="M 27 3.2 L 30.5 6 L 27 8.8" className="cav-air" />
          <path d="M 30.5 25 L 27 22.2" className="cav-air" />
        </>
      )}
      {icon === 'service-void' && (
        <>
          {/* A shallow void held open by battens, with the lining in front of it. */}
          <rect x={30} y={2} width={12} height={26} className="cav-leaf" />
          <rect x={22} y={3} width={7} height={6} className="cav-board" />
          <rect x={22} y={21} width={7} height={6} className="cav-board" />
          <path d="M 22 15 q 3 -2 6 0" className="cav-air" />
        </>
      )}
    </svg>
  );
}

/** What the standard's classes are called where a reader meets them. */
const VENTILATION_TEXT = {
  unventilated: 'unventilated',
  'slightly-ventilated': 'slightly ventilated',
  'well-ventilated': 'well ventilated',
} as const;

function resistanceFor(
  preset: CavityPreset,
  thicknessMm: number,
  direction: HeatFlowDirection,
): string {
  if (preset.ventilation === 'well-ventilated') {
    // Its resistance is discarded along with everything outboard of it, so quoting one
    // would be quoting a number the calculation never uses.
    return 'disregarded, with everything outside it';
  }
  if (thicknessMm <= 0) {
    return '—';
  }
  /*
   * One face reflective at most. A foil-faced board looks into the cavity from the warm
   * side; whatever is on the other side of it is ordinary masonry or sheathing, so the
   * cold face stays at 0.9. Two reflective faces would gain very little over one anyway —
   * the formula's 1/e1 + 1/e2 - 1 is already dominated by the first of them.
   */
  const result = airspaceResistance({
    thicknessM: thicknessMm / 1000,
    direction,
    emissivityWarm: EMISSIVITY_VALUE[preset.emissivity],
    emissivityCold: EMISSIVITY_VALUE.high,
  });
  const prefix = preset.ventilation === 'slightly-ventilated' ? 'up to ' : '';
  return `${prefix}${result.resistanceM2KPerW.toFixed(2)} m²K/W at ${thicknessMm} mm`;
}

export interface CavityPickerProps {
  readonly layer: UiLayer;
  readonly direction: HeatFlowDirection;
  readonly onApply: (preset: CavityPreset) => void;
}

export function CavityPicker({ layer, direction, onApply }: CavityPickerProps): JSX.Element {
  const current = matchingCavityPreset(layer);
  return (
    <div className="cavity-picker">
      <ul className="cavity-options">
        {CAVITY_PRESETS.map((preset) => {
          const isCurrent = current?.id === preset.id;
          return (
            <li key={preset.id}>
              <button
                type="button"
                className={isCurrent ? 'cavity-option is-current' : 'cavity-option'}
                aria-pressed={isCurrent}
                onClick={() => onApply(preset)}
                title={preset.note}
              >
                <CavitySection icon={preset.icon} />
                <span className="cavity-option-text">
                  <strong>{preset.label}</strong>
                  <em>{preset.where}</em>
                  <em className="cavity-option-result">
                    {VENTILATION_TEXT[preset.ventilation]}
                    {preset.emissivity === 'low' ? ', reflective face' : ''} ·{' '}
                    {resistanceFor(preset, layer.thicknessMm, direction)}
                  </em>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      {current === undefined && (
        <p className="cavity-custom">
          This cavity does not match any of the above — its ventilation, opening area or
          emissivity has been set by hand. Picking one of these will overwrite that.
        </p>
      )}
      {/*
        * The confusion worth heading off before any of the above matters: people reach
        * for a cavity layer to represent full fill, and there is no cavity there at all.
        */}
      <p className="cavity-note">
        <strong>A full-fill cavity is not a cavity.</strong> If insulation fills the gap
        wall to wall there is no airspace left to classify — enter the insulation as a
        material layer and do not add a cavity at all. A cavity layer belongs here only
        where there is air.
      </p>
    </div>
  );
}
