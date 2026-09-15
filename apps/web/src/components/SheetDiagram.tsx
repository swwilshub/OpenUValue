import type { SheetCount, SheetSize } from '../state/sheets.js';

/**
 * What "eighteen sheets" looks like.
 *
 * A count of sheets is arithmetic until you see it, and the part people query is the
 * rounding: why eighteen when the area came to 17.4 sheets' worth. So the run is drawn
 * with the first sheet dimensioned as the unit, and the last one drawn part-full, with
 * the offcut hatched. The bit you pay for and do not use is the bit that explains the
 * round-up.
 *
 * It is drawn as one run of wall the height of a sheet, because that is the arrangement
 * the count assumes. A real wall's shape changes where the cuts fall, not how much area
 * there is, so the picture is honest about the total and says nothing about the setting
 * out.
 */

const SHEET_DRAW_WIDTH = 24;
const SHEET_DRAW_HEIGHT_PER_M = 21;
/** Beyond this the run is elided, because a hundred identical rectangles say nothing. */
const MAX_DRAWN = 11;
const GAP = 2;
const LEFT = 30;
const TOP = 20;

export interface SheetDiagramProps {
  readonly count: SheetCount;
  readonly size: SheetSize;
}

export function SheetDiagram({ count, size }: SheetDiagramProps): JSX.Element {
  const sheetHeight = size.lengthM * SHEET_DRAW_HEIGHT_PER_M;
  const elided = count.wholeSheets > MAX_DRAWN;
  // With an elision the last sheet still gets drawn, because it carries the offcut.
  const drawnBefore = elided ? MAX_DRAWN - 1 : count.wholeSheets - 1;
  const hidden = count.wholeSheets - drawnBefore - 1;

  const columns = drawnBefore + (elided ? 1 : 0) + 1;
  const width = LEFT + columns * (SHEET_DRAW_WIDTH + GAP) + 78;
  const height = TOP + sheetHeight + 26;

  const xOf = (column: number): number => LEFT + column * (SHEET_DRAW_WIDTH + GAP);
  const lastColumn = drawnBefore + (elided ? 1 : 0);
  const usedHeight = sheetHeight * count.lastSheetUsedFraction;

  return (
    <svg
      className="sheet-diagram"
      viewBox={`0 0 ${width} ${height}`}
      width={width}
      height={height}
      role="img"
      aria-label={`${count.wholeSheets} sheets of ${size.widthM} by ${size.lengthM} metres`}
    >
      <defs>
        <pattern id="sheet-offcut" width="5" height="5" patternUnits="userSpaceOnUse">
          <path d="M 0 5 L 5 0" className="sheet-offcut-hatch" />
        </pattern>
      </defs>

      {/* Every sheet's fill goes down first, so the offcut can be hatched over the top. */}
      <rect
        x={xOf(0)}
        y={TOP}
        width={SHEET_DRAW_WIDTH}
        height={sheetHeight}
        className="sheet-face"
      />
      <text x={xOf(0) + SHEET_DRAW_WIDTH / 2} y={TOP - 7} className="sheet-dim" textAnchor="middle">
        {size.widthM.toFixed(2)} m
      </text>
      <text
        x={xOf(0) - 7}
        y={TOP + sheetHeight / 2}
        className="sheet-dim"
        textAnchor="middle"
        transform={`rotate(-90 ${xOf(0) - 7} ${TOP + sheetHeight / 2})`}
      >
        {size.lengthM.toFixed(2)} m
      </text>

      {Array.from({ length: Math.max(0, drawnBefore - 1) }, (_, index) => (
        <rect
          key={index}
          x={xOf(index + 1)}
          y={TOP}
          width={SHEET_DRAW_WIDTH}
          height={sheetHeight}
          className="sheet-face"
        />
      ))}

      {elided && (
        <>
          <rect
            x={xOf(drawnBefore)}
            y={TOP}
            width={SHEET_DRAW_WIDTH}
            height={sheetHeight}
            className="sheet-face is-elided"
          />
          <text
            x={xOf(drawnBefore) + SHEET_DRAW_WIDTH / 2}
            y={TOP + sheetHeight / 2}
            className="sheet-elided-count"
            textAnchor="middle"
          >
            +{hidden}
          </text>
        </>
      )}

      {/*
        The last sheet, drawn as far as it is used with the rest hatched: the part that is
        paid for and thrown away is what explains the round-up. With a single sheet this
        lands on the unit itself, which is right, because then they are the same sheet.
      */}
      <g>
        <rect
          x={xOf(lastColumn)}
          y={TOP}
          width={SHEET_DRAW_WIDTH}
          height={sheetHeight}
          className="sheet-face is-offcut"
        />
        <rect
          x={xOf(lastColumn)}
          y={TOP + sheetHeight - usedHeight}
          width={SHEET_DRAW_WIDTH}
          height={usedHeight}
          className="sheet-face"
        />
      </g>

      {/* The outline of the sheet being priced, drawn last so nothing paints over it. */}
      <rect
        x={xOf(0)}
        y={TOP}
        width={SHEET_DRAW_WIDTH}
        height={sheetHeight}
        className="sheet-unit-outline"
      />

      <text x={xOf(lastColumn) + SHEET_DRAW_WIDTH + 8} y={TOP + 13} className="sheet-total">
        {count.wholeSheets} sheet{count.wholeSheets === 1 ? '' : 's'}
      </text>
      <text x={xOf(lastColumn) + SHEET_DRAW_WIDTH + 8} y={TOP + 28} className="sheet-note">
        {count.sheetAreaM2.toFixed(2)} m² each
      </text>
      {count.offcutAreaM2 > 0.005 && (
        <text x={xOf(lastColumn) + SHEET_DRAW_WIDTH + 8} y={TOP + 43} className="sheet-note">
          {count.offcutAreaM2.toFixed(2)} m² over
        </text>
      )}

      <text x={LEFT} y={TOP + sheetHeight + 16} className="sheet-note">
        Area only. Cuts at reveals, corners and openings need more.
      </text>
    </svg>
  );
}
