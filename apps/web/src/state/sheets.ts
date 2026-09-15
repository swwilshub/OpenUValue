/**
 * Costing a retrofit by the sheet, because that is how the materials are sold.
 *
 * Nobody buys 50 m² of insulation. They buy boards, in one of a handful of sizes a
 * merchant stocks, and pay for whole ones however much of the last is left over. A price
 * per sheet is a number somebody can read off a quote or a website, where a total cost
 * for the work is a guess at labour, access and profit rolled into one figure nobody can
 * check.
 *
 * **The sizes here are commercial conventions, not standard values.** No standard says a
 * board is 1.2 by 2.4 metres; that is simply what plasterboard and most rigid insulation
 * are cut to in the UK. They are offered as starting points and are editable, and nothing
 * here is cited to a clause because there is no clause to cite.
 *
 * The count is area divided by sheet area, rounded up. That is the lower bound rather
 * than the buying list: a real wall has reveals, corners and openings, and cutting a sheet
 * to fit leaves an offcut that usually cannot be used elsewhere. See `offcutAreaM2` for
 * the part of the last sheet this does account for, and expect a real job to need a few
 * sheets more than this.
 */

export interface SheetSize {
  readonly widthM: number;
  readonly lengthM: number;
}

export interface SheetSizePreset extends SheetSize {
  readonly id: string;
  /** As a merchant writes it, in millimetres. */
  readonly label: string;
}

/** The one most rigid boards and plasterboard come in. */
export const DEFAULT_SHEET_SIZE: SheetSize = { widthM: 1.2, lengthM: 2.4 };

/** Common UK merchant sizes. Conventions, not standards, and all of them editable. */
export const SHEET_SIZE_PRESETS: readonly SheetSizePreset[] = [
  { id: '1200x2400', label: '1200 × 2400', widthM: 1.2, lengthM: 2.4 },
  { id: '1200x3000', label: '1200 × 3000', widthM: 1.2, lengthM: 3.0 },
  { id: '900x1800', label: '900 × 1800', widthM: 0.9, lengthM: 1.8 },
  { id: '600x1200', label: '600 × 1200', widthM: 0.6, lengthM: 1.2 },
];

export interface SheetCount {
  readonly sheetAreaM2: number;
  /** Area divided by sheet area, before rounding. */
  readonly exactSheets: number;
  /** Whole sheets to buy. */
  readonly wholeSheets: number;
  /** Area of the last sheet left over, m². Zero where the area divides exactly. */
  readonly offcutAreaM2: number;
  /** How much of the last sheet gets used, 0..1, for drawing it. */
  readonly lastSheetUsedFraction: number;
}

export function sheetsForArea(areaM2: number, size: SheetSize): SheetCount {
  if (size.widthM <= 0 || size.lengthM <= 0) {
    throw new Error('A sheet needs a positive width and length.');
  }
  if (areaM2 <= 0) {
    throw new Error('An area to cover has to be positive.');
  }

  const sheetAreaM2 = size.widthM * size.lengthM;
  const exactSheets = areaM2 / sheetAreaM2;
  const wholeSheets = Math.ceil(exactSheets);
  const offcutAreaM2 = wholeSheets * sheetAreaM2 - areaM2;

  return {
    sheetAreaM2,
    exactSheets,
    wholeSheets,
    offcutAreaM2,
    // An area that divides exactly uses all of its last sheet, not none of it.
    lastSheetUsedFraction: 1 - offcutAreaM2 / sheetAreaM2,
  };
}

export function sheetsCostGBP(count: SheetCount, pricePerSheetGBP: number): number {
  return count.wholeSheets * pricePerSheetGBP;
}
