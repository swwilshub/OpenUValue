import { EXPOSURE_ZONES } from '@openuvalue/engine';
import type { ExposureZoneId } from '@openuvalue/engine';

/**
 * A coarse grid map of where the four wind-driven rain bands generally fall.
 *
 * **This is not the Approved Document's map, and it is drawn so that nobody could mistake
 * it for one.** The published zone boundaries are a geographic dataset, and redrawing
 * them at any resolution that looked like a real map would hand a wall a mile the wrong
 * side of a line a confident wrong answer. So the country is a grid of squares: a shape
 * coarse enough to orient yourself on and far too coarse to read a boundary off. Its
 * coarseness is the honest part of it.
 *
 * What the squares carry is nothing more than the plain-English `where` line already on
 * each band — western coasts and high ground wet, central and eastern England dry — drawn
 * instead of written. Clicking a band therefore *suggests* it, exactly as the cavity
 * guess does, and the panel says so; the zone still has to be read off the published map
 * in Approved Document C, which is the only thing that settles it, and which a
 * site-specific calculation to BS 8104 overrides in turn.
 *
 * TODO(verify): nothing here is a boundary claim, but the general pattern is an in-house
 * reading of the band descriptions rather than a traced figure. VERIFY.md row V35.
 */

/**
 * Nine columns west to east, thirteen rows north to south. Each character is the band
 * that part of the country generally falls in: `V` very severe, `S` severe, `M` moderate,
 * `H` sheltered, `.` sea.
 */
const PATTERN: readonly string[] = [
  '..VVS....',
  '.VVVSS...',
  '.VVSSSS..',
  '..VSSMM..',
  '..SSSMM..',
  'VV.SSMM..',
  'VS.SSMMM.',
  '...SSMMM.',
  '..SSMMMH.',
  '..SSMMHHH',
  '..SSMMHHH',
  '.SSSMMHH.',
  'VSSMM....',
];

const BAND_OF: Readonly<Record<string, ExposureZoneId>> = {
  V: 'very-severe',
  S: 'severe',
  M: 'moderate',
  H: 'sheltered',
};

const FILL: Readonly<Record<ExposureZoneId, string>> = {
  sheltered: 'var(--exposure-sheltered)',
  moderate: 'var(--exposure-moderate)',
  severe: 'var(--exposure-severe)',
  'very-severe': 'var(--exposure-very-severe)',
};

const CELL = 16;
const INSET = 0.75;
const COLUMNS = 9;

interface Cell {
  readonly x: number;
  readonly y: number;
}

/** The cells of one band, gathered once so each band can be a single click target. */
function cellsOf(zoneId: ExposureZoneId): readonly Cell[] {
  const cells: Cell[] = [];
  PATTERN.forEach((row, rowIndex) => {
    for (let column = 0; column < COLUMNS; column += 1) {
      const character = row[column];
      if (character !== undefined && BAND_OF[character] === zoneId) {
        cells.push({ x: column * CELL, y: rowIndex * CELL });
      }
    }
  });
  return cells;
}

export interface ExposureMapProps {
  readonly zoneId: ExposureZoneId;
  readonly onPick: (zoneId: ExposureZoneId) => void;
}

export function ExposureMap({ zoneId, onPick }: ExposureMapProps): JSX.Element {
  return (
    <svg
      className="exposure-map"
      viewBox={`0 0 ${COLUMNS * CELL} ${PATTERN.length * CELL}`}
      width={COLUMNS * CELL}
      height={PATTERN.length * CELL}
      role="group"
      aria-label="Rough map of where each wind-driven rain band falls"
    >
      {EXPOSURE_ZONES.map((zone) => (
        <g
          key={zone.id}
          className={
            zone.id === zoneId ? 'exposure-map-band is-current' : 'exposure-map-band'
          }
          role="button"
          tabIndex={0}
          aria-label={`${zone.label} — ${zone.where}`}
          aria-pressed={zone.id === zoneId}
          onClick={() => onPick(zone.id)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              onPick(zone.id);
            }
          }}
        >
          {cellsOf(zone.id).map((cell) => (
            <rect
              key={`${cell.x}-${cell.y}`}
              x={cell.x + INSET}
              y={cell.y + INSET}
              width={CELL - INSET * 2}
              height={CELL - INSET * 2}
              rx={1.5}
              fill={FILL[zone.id]}
            />
          ))}
        </g>
      ))}
    </svg>
  );
}
