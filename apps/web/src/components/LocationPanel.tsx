import { EXPOSURE_ZONES, exposureZone } from '@openuvalue/engine';
import type { ExposureZoneId } from '@openuvalue/engine';
import { hasFullFillCavity } from '../state/model.js';
import type { UiLayer } from '../state/model.js';
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
 * **No map here.** Approved Document C Diagram 12 is Crown copyright, free to download
 * but not free to republish, so the figure cannot be shown inside this page. Anything we
 * could draw in its place would be our own approximation of a geographic dataset, which
 * is worse than not drawing one: a wall a mile the wrong side of a line would get a
 * confident wrong answer. So the zone is chosen, and the reader is sent to the published
 * figure to choose it from. They read it better than we could redraw it.
 */

const SWATCH: Readonly<Record<ExposureZoneId, string>> = {
  sheltered: 'var(--exposure-sheltered)',
  moderate: 'var(--exposure-moderate)',
  severe: 'var(--exposure-severe)',
  'very-severe': 'var(--exposure-very-severe)',
};

const ADC_PUBLICATION_URL =
  'https://www.gov.uk/government/publications/site-preparation-and-resistance-to-contaminates-and-moisture-approved-document-c';

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
        cavity may be filled by the zone the building stands in. Find your zone on{' '}
        <a href={ADC_PUBLICATION_URL} target="_blank" rel="noreferrer">
          Diagram 12 of Approved Document C
        </a>{' '}
        (page 34) and pick it here.
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

      {current !== undefined && (
        <p className={conflict ? 'exposure-conflict' : 'cavity-custom'}>
          {conflict && <strong>This build-up fills the cavity. </strong>}
          {current.cavityAdvice}
        </p>
      )}

      <p className="footnote">
        Paragraph 5.16 then lets you move the zone the map gives you: add one where local
        conditions accentuate the wind, such as an open hillside or a valley funnelling it
        onto the wall, and subtract one where the wall does not face into the prevailing
        wind. A site-specific calculation to BS 8104 replaces the map altogether, and a
        sheltering hill or an exposed corner can put one wall of a house in a different
        zone from another.
      </p>

      <p className="footnote">
        Zones and boundaries from Approved Document C Diagram 12, the categories coming
        from BS 8104. Table 4, which gives the highest zone each construction may be used
        in, is not implemented here; the advice above follows its facing-masonry columns
        only.
      </p>
    </section>
  );
}
