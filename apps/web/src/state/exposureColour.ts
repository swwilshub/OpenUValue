import type { ExposureZoneId } from '@openuvalue/engine';

/**
 * Reading an exposure zone off the published map by the colour under the pointer.
 *
 * Approved Document C Diagram 12 shades the country in four flat greys, one per zone,
 * with white sea and near-black coastlines, city dots and labels. So a click on the
 * figure carries the answer in its pixel, and no geography has to be shipped, redrawn or
 * guessed: the user opens the document, points at where the building is, and the shade
 * says which of the four bands that is.
 *
 * **The map itself is not shipped with this tool and must not be.** Approved Document C
 * is Crown copyright and its own notice permits free reproduction only "for research,
 * private study or for internal circulation within an organisation", with re-use beyond
 * that needing a licence. Publishing the figure inside a public web page is that kind of
 * re-use. The user therefore supplies their own copy of the figure from the free
 * download, it never leaves their browser, and what this file holds is four colours, not
 * a map.
 *
 * The four references were sampled from Diagram 12's own key, rendered at 300 dpi from
 * the 2013 edition (reprint August 2013) published on gov.uk. The map body uses the same
 * four values, which is what makes the reading possible.
 */

export interface Rgb {
  readonly r: number;
  readonly g: number;
  readonly b: number;
}

interface ZoneColour {
  readonly zoneId: ExposureZoneId;
  readonly colour: Rgb;
}

/** Approved Document C Diagram 12 key, lightest (zone 1) to darkest (zone 4). */
export const DIAGRAM_12_ZONE_COLOURS: readonly ZoneColour[] = [
  { zoneId: 'sheltered', colour: { r: 237, g: 237, b: 238 } },
  { zoneId: 'moderate', colour: { r: 218, g: 219, b: 219 } },
  { zoneId: 'severe', colour: { r: 197, g: 198, b: 200 } },
  { zoneId: 'very-severe', colour: { r: 178, g: 179, b: 181 } },
];

/**
 * Anything lighter than this is the sea or the paper around the figure. The lightest
 * zone is 237, so the threshold sits above it with room for a screenshot that has been
 * lightened slightly.
 */
const BACKGROUND_MIN_CHANNEL = 247;

/** Anything darker than this is a coastline, a city dot or a label, not a zone. */
const INK_MAX_CHANNEL = 120;

/**
 * How far a pixel may sit from a key colour and still be read as that zone. The four
 * greys are about 19 apart on each channel, so adjacent references are roughly 33 apart
 * in RGB distance; 14 accepts a shade that has drifted through scaling or JPEG while
 * still rejecting a pixel sitting between two bands.
 */
const MATCH_TOLERANCE = 14;

export type PixelReading =
  | { readonly kind: 'zone'; readonly zoneId: ExposureZoneId }
  | { readonly kind: 'background' }
  | { readonly kind: 'ink' }
  | { readonly kind: 'unrecognised' };

export function classifyExposurePixel(pixel: Rgb): PixelReading {
  if (Math.min(pixel.r, pixel.g, pixel.b) >= BACKGROUND_MIN_CHANNEL) {
    return { kind: 'background' };
  }
  if (Math.max(pixel.r, pixel.g, pixel.b) <= INK_MAX_CHANNEL) {
    return { kind: 'ink' };
  }

  let best: ZoneColour | undefined;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const candidate of DIAGRAM_12_ZONE_COLOURS) {
    const distance = Math.hypot(
      pixel.r - candidate.colour.r,
      pixel.g - candidate.colour.g,
      pixel.b - candidate.colour.b,
    );
    if (distance < bestDistance) {
      bestDistance = distance;
      best = candidate;
    }
  }

  if (best === undefined || bestDistance > MATCH_TOLERANCE) {
    return { kind: 'unrecognised' };
  }
  return { kind: 'zone', zoneId: best.zoneId };
}

export type AreaReading =
  | { readonly kind: 'zone'; readonly zoneId: ExposureZoneId; readonly agreement: number }
  | { readonly kind: 'background' }
  | { readonly kind: 'unclear' };

/** At least this many of the sampled pixels must land on a zone for a reading to stand. */
const MIN_CONFIDENT_SAMPLES = 5;

/** And at least this share of those must agree, or the click straddled a boundary. */
const MIN_AGREEMENT = 0.6;

/**
 * A click is read from a small window rather than a single pixel, because a coastline, a
 * label or the edge between two bands is exactly where somebody will click, and one
 * antialiased pixel there means nothing. The window votes, and a click that cannot carry
 * a majority is reported as unclear rather than resolved to whichever pixel happened to
 * be under the crosshair.
 */
export function readExposureArea(samples: readonly Rgb[]): AreaReading {
  const votes = new Map<ExposureZoneId, number>();
  let confident = 0;
  let background = 0;

  for (const sample of samples) {
    const reading = classifyExposurePixel(sample);
    if (reading.kind === 'zone') {
      votes.set(reading.zoneId, (votes.get(reading.zoneId) ?? 0) + 1);
      confident += 1;
    } else if (reading.kind === 'background') {
      background += 1;
    }
  }

  if (confident < MIN_CONFIDENT_SAMPLES) {
    // Out at sea, or off the figure entirely, which is worth saying differently from a
    // click that landed on the land but between two shades.
    return background > samples.length / 2 ? { kind: 'background' } : { kind: 'unclear' };
  }

  let winner: ExposureZoneId | undefined;
  let winnerVotes = 0;
  for (const [zoneId, count] of votes) {
    if (count > winnerVotes) {
      winnerVotes = count;
      winner = zoneId;
    }
  }

  const agreement = winnerVotes / confident;
  if (winner === undefined || agreement < MIN_AGREEMENT) {
    return { kind: 'unclear' };
  }
  return { kind: 'zone', zoneId: winner, agreement };
}
