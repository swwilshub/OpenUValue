import { useState } from 'react';
import { EXPOSURE_ZONES, exposureZone } from '@openuvalue/engine';
import type { ExposureZoneId } from '@openuvalue/engine';
import { hasFullFillCavity } from '../state/model.js';
import type { UiLayer } from '../state/model.js';
import { ExposureMap } from './ExposureMap.js';
import { HelpButton } from './guide/Guide.js';

/**
 * Where the building is, and what the weather there does to the wall.
 *
 * Wind-driven rain exposure used to sit inside the Conditions box under "Inside", which
 * was the wrong home twice over: it is not an inside quantity, and it is not a condition
 * the calculation uses at all. It changes no U-value, no temperature and no vapour
 * pressure. What it decides is whether a construction is *allowed* — chiefly whether a
 * cavity may be filled — so it belongs in a box about the place rather than the physics.
 *
 * The map beside the bands is our own coarse grid rather than the published figure; see
 * `ExposureMap` for why it is drawn the way it is. Picking a band off it is a suggestion
 * and is labelled as one. Matching a colour off the Approved Document's own map to a row
 * here remains the interaction that settles it.
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
   * Whether the band on screen came from the map rather than from the reader. It is not
   * part of the shared state because it describes how this session arrived at the value,
   * not the value itself — a shared link should carry the zone, not the fact that
   * somebody once clicked a square to reach it.
   */
  const [suggestedFromMap, setSuggestedFromMap] = useState(false);

  const current = exposureZone(zoneId);
  const fullFill = hasFullFillCavity(layers);
  const conflict = fullFill && current?.rulesOutFullFill === true;

  const pick = (next: ExposureZoneId, fromMap: boolean): void => {
    setSuggestedFromMap(fromMap);
    onChange(next);
  };

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
        How much wind-driven rain the wall catches, which decides whether a cavity may be
        filled. Read your zone off the map in Approved Document C and match the colour —
        the bands are the same four. It changes no calculated figure here, only what the
        build-up is allowed to be.
      </p>

      <div className="location-body">
        <figure className="exposure-map-figure">
          <ExposureMap zoneId={zoneId} onPick={(next) => pick(next, true)} />
          <figcaption>
            The rough pattern, not the published map. Click a band to try it.
          </figcaption>
        </figure>

        <ul className="exposure-options">
          {EXPOSURE_ZONES.map((zone) => (
            <li key={zone.id}>
              <button
                type="button"
                className={zone.id === zoneId ? 'exposure-option is-current' : 'exposure-option'}
                aria-pressed={zone.id === zoneId}
                onClick={() => pick(zone.id, false)}
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
      </div>

      {suggestedFromMap && (
        <p className="exposure-suggested">
          <strong>Suggested from the map above.</strong> That map is a rough pattern rather
          than the published boundaries, so check the band against the figure in Approved
          Document C before you rely on it.
        </p>
      )}

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
    </section>
  );
}
