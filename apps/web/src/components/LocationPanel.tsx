import { useState } from 'react';
import { EXPOSURE_ZONES, exposureZone } from '@openuvalue/engine';
import type { ExposureZoneId } from '@openuvalue/engine';
import { hasFullFillCavity } from '../state/model.js';
import type { UiLayer } from '../state/model.js';
import { ExposureMapReader } from './ExposureMapReader.js';
import { HelpButton } from './guide/Guide.js';

/**
 * Where the building is, and what the weather there does to the wall.
 *
 * Wind-driven rain exposure used to sit inside the Conditions box under "Inside", which
 * was the wrong home twice over: it is not an inside quantity, and it is not a condition
 * the calculation uses at all. It changes no U-value, no temperature and no vapour
 * pressure. What it decides is whether a construction is allowed, chiefly whether a
 * cavity may be filled, so it belongs in a box about the place rather than the physics.
 *
 * The zone can be read straight off Approved Document C Diagram 12: load your own copy of
 * the figure, click where the building is, and the shade under the pointer settles the
 * band. That needs no geography at all, and the four bands are matched by the tool rather
 * than by eye. Picking a band by hand still works, and overrides the reading.
 */

const SWATCH: Readonly<Record<ExposureZoneId, string>> = {
  sheltered: 'var(--exposure-sheltered)',
  moderate: 'var(--exposure-moderate)',
  severe: 'var(--exposure-severe)',
  'very-severe': 'var(--exposure-very-severe)',
};

export interface LocationPanelProps {
  readonly zoneId: ExposureZoneId;
  readonly onChange: (zoneId: ExposureZoneId) => void;
  /** Needed only to spot a fully filled cavity, which the zone may rule out. */
  readonly layers: readonly UiLayer[];
  readonly onOpenGuide: (topicId: string) => void;
}

export function LocationPanel({
  zoneId,
  onChange,
  layers,
  onOpenGuide,
}: LocationPanelProps): JSX.Element {
  /*
   * Whether the band on screen was read off the map. It is not part of the shared state
   * because it describes how this session arrived at the value rather than the value
   * itself: a shared link should carry the zone, not the route to it.
   */
  const [readFromMap, setReadFromMap] = useState(false);

  const current = exposureZone(zoneId);
  const fullFill = hasFullFillCavity(layers);
  const conflict = fullFill && current?.rulesOutFullFill === true;

  return (
    <section className="panel location-panel">
      <h2>
        Location
        <HelpButton
          topicId="conditions-exposure"
          label="wind-driven rain exposure"
          onOpen={onOpenGuide}
        />
      </h2>

      <p className="choice-lead">
        How much wind-driven rain the wall catches. It changes no calculated figure here,
        only what the build-up is allowed to be: Approved Document C settles whether a
        cavity may be filled by the zone the building stands in. Load the map below and
        click your spot, or pick a band yourself.
      </p>

      <ExposureMapReader
        onRead={(next) => {
          setReadFromMap(true);
          onChange(next);
        }}
      />

      <ul className="exposure-options">
        {EXPOSURE_ZONES.map((zone) => (
          <li key={zone.id}>
            <button
              type="button"
              className={zone.id === zoneId ? 'exposure-option is-current' : 'exposure-option'}
              aria-pressed={zone.id === zoneId}
              onClick={() => {
                setReadFromMap(false);
                onChange(zone.id);
              }}
            >
              <span className="exposure-swatch" style={{ background: SWATCH[zone.id] }}>
                {zone.number}
              </span>
              <span>
                <strong>{zone.label}</strong>
                <em>{zone.rangeText}</em>
                <em>{zone.where}</em>
              </span>
            </button>
          </li>
        ))}
      </ul>

      {readFromMap && (
        <p className="exposure-read">
          <strong>Read from the map.</strong> Paragraph 5.16 then lets you move it: add one
          zone where local conditions accentuate the wind, such as an open hillside or a
          valley funnelling it onto the wall, and subtract one where the wall does not face
          into the prevailing wind. A site-specific calculation to BS 8104 replaces the map
          altogether.
        </p>
      )}

      {current !== undefined && (
        <p className={conflict ? 'exposure-conflict' : 'cavity-custom'}>
          {conflict && <strong>This build-up fills the cavity. </strong>}
          {current.cavityAdvice}
        </p>
      )}

      <p className="footnote">
        Zones and boundaries from Approved Document C Diagram 12, the categories coming
        from BS 8104. Table 4, which gives the highest zone each construction may be used
        in, is not implemented here; the advice above follows its facing-masonry columns
        only. A sheltering hill or an exposed corner can put one wall of a house in a
        different band from another.
      </p>
    </section>
  );
}
