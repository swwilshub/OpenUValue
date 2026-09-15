import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SHEET_SIZE,
  SHEET_SIZE_PRESETS,
  sheetsCostGBP,
  sheetsForArea,
} from '../sheets.js';

describe('sheetsForArea', () => {
  it('measures the standard sheet', () => {
    // 1.2 m x 2.4 m = 2.88 m^2.
    expect(sheetsForArea(10, DEFAULT_SHEET_SIZE).sheetAreaM2).toBeCloseTo(2.88, 10);
  });

  it('rounds a part sheet up to a whole one', () => {
    // 50 / 2.88 = 17.3611..., so 18 sheets are bought.
    // 18 x 2.88 = 51.84, leaving 51.84 - 50 = 1.84 m^2 of the last one.
    // Used fraction of the last sheet: 1 - 1.84 / 2.88 = 0.36111...
    const count = sheetsForArea(50, DEFAULT_SHEET_SIZE);
    expect(count.exactSheets).toBeCloseTo(17.361111, 6);
    expect(count.wholeSheets).toBe(18);
    expect(count.offcutAreaM2).toBeCloseTo(1.84, 10);
    expect(count.lastSheetUsedFraction).toBeCloseTo(0.361111, 6);
  });

  it('leaves nothing over when the area divides exactly', () => {
    // 2 x 2.88 = 5.76 m^2 exactly.
    const count = sheetsForArea(5.76, DEFAULT_SHEET_SIZE);
    expect(count.wholeSheets).toBe(2);
    expect(count.offcutAreaM2).toBeCloseTo(0, 10);
    // A sheet that is fully used is drawn full, not empty.
    expect(count.lastSheetUsedFraction).toBeCloseTo(1, 10);
  });

  it('buys a whole sheet for a scrap of wall', () => {
    // 1 / 2.88 = 0.347..., so one sheet, of which 1 - 1.88 / 2.88 = 0.347... is used.
    const count = sheetsForArea(1, DEFAULT_SHEET_SIZE);
    expect(count.wholeSheets).toBe(1);
    expect(count.offcutAreaM2).toBeCloseTo(1.88, 10);
    expect(count.lastSheetUsedFraction).toBeCloseTo(0.347222, 6);
  });

  it('follows a different sheet size', () => {
    // 1.2 x 3.0 = 3.6 m^2; 50 / 3.6 = 13.888..., so 14 sheets.
    // 14 x 3.6 = 50.4, leaving 0.4 m^2.
    const size = SHEET_SIZE_PRESETS.find((candidate) => candidate.id === '1200x3000');
    expect(size).toBeDefined();
    const count = sheetsForArea(50, size ?? DEFAULT_SHEET_SIZE);
    expect(count.sheetAreaM2).toBeCloseTo(3.6, 10);
    expect(count.wholeSheets).toBe(14);
    expect(count.offcutAreaM2).toBeCloseTo(0.4, 10);
  });

  it('refuses a sheet or an area that is not a real one', () => {
    expect(() => sheetsForArea(10, { widthM: 0, lengthM: 2.4 })).toThrow();
    expect(() => sheetsForArea(10, { widthM: 1.2, lengthM: -1 })).toThrow();
    expect(() => sheetsForArea(0, DEFAULT_SHEET_SIZE)).toThrow();
  });
});

describe('sheetsCostGBP', () => {
  it('pays for whole sheets, including the one barely used', () => {
    // 18 sheets at GBP 25 = GBP 450.
    const count = sheetsForArea(50, DEFAULT_SHEET_SIZE);
    expect(sheetsCostGBP(count, 25)).toBeCloseTo(450, 10);
  });

  it('costs nothing where the sheets cost nothing', () => {
    expect(sheetsCostGBP(sheetsForArea(50, DEFAULT_SHEET_SIZE), 0)).toBe(0);
  });
});
