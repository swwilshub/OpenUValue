import { EXPOSURE_ZONES, exposureZone } from '@openuvalue/engine';
import type { ExposureZoneId } from '@openuvalue/engine';
import { hasFullFillCavity } from '../state/model.js';
import type { UiLayer } from '../state/model.js';

/**
 * Which wind-driven rain zone the building is in.
 *
 * No map. The zone boundaries are a geographic dataset rather than a table, and drawing
 * them approximately would give a wall a mile the wrong side of a line a confident wrong
 * answer. The Approved Document's own note says the map can only be varied by a
 * site-specific BS 8104 calculation, so it was never the last word either — the person
 * with the published map in front of them reads it better than we could redraw it.
 *
 * The swatches carry the same four-step blue ramp the published figure uses, so matching
 * a colour off that map to a row here is the whole interaction.
 */

const SWATCH: Readonly<Record<ExposureZoneId, string>> = {
  sheltered: 'var(--exposure-sheltered)',
  moderate: 'var(--exposure-moderate)',
  severe: 'var(--exposure-severe)',
  'very-severe': 'var(--exposure-very-severe)',
};

export interface ExposurePickerProps {
  readonly zoneId: ExposureZoneId;
  readonly onChange: (zoneId: ExposureZoneId) => void;
  readonly layers: readonly UiLayer[];
}

export function ExposurePicker({ zoneId, onChange, layers }: ExposurePickerProps): JSX.Element {
  const current = exposureZone(zoneId);
  const fullFill = hasFullFillCavity(layers);
  const conflict = fullFill && current?.rulesOutFullFill === true;

  return (
    <div className="exposure-picker">
      <p className="choice-lead">
        How much wind-driven rain the wall catches, which decides whether a cavity may be
        filled. Read your zone off the map in Approved Document C and match the colour —
        the bands are the same four.
      </p>
      <ul className="exposure-options">
        {EXPOSURE_ZONES.map((zone) => (
          <li key={zone.id}>
            <button
              type="button"
              className={zone.id === zoneId ? 'exposure-option is-current' : 'exposure-option'}
              aria-pressed={zone.id === zoneId}
              onClick={() => onChange(zone.id)}
            >
              <span className="exposure-swatch" style={{ background: SWATCH[zone.id] }} />
              <span>
                <strong>{zone.label}</strong>
                <em>{zone.rangeText}</em>
                <em>{zone.where}</em>
              </span>
            </button>
          </li>
        ))}
      </ul>

      {current !== undefined && (
        <p className={conflict ? 'exposure-conflict' : 'cavity-custom'}>
          {conflict && <strong>This build-up fills the cavity. </strong>}
          {current.cavityAdvice}
        </p>
      )}

      <p className="footnote">
        Boundaries from the Approved Document C exposure figure, the categories coming
        from BS 8104. A site-specific calculation to BS 8104 overrides the map, and a
        sheltering hill or an exposed corner can put one wall of a house in a different
        band from another.
      </p>
    </div>
  );
}
