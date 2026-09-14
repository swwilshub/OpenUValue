import { describe, expect, it } from 'vitest';
import {
  DIAGRAM_12_ZONE_COLOURS,
  classifyExposurePixel,
  readExposureArea,
} from '../exposureColour.js';
import type { Rgb } from '../exposureColour.js';

/*
 * The four key colours of Approved Document C Diagram 12, sampled at 300 dpi:
 *   zone 1 sheltered   (237, 237, 238)
 *   zone 2 moderate    (218, 219, 219)
 *   zone 3 severe      (197, 198, 200)
 *   zone 4 very severe (178, 179, 181)
 * Adjacent references are about sqrt(3 x 19^2) = 32.9 apart, so the 14 tolerance is
 * comfortably under half that gap.
 */

const fill = (pixel: Rgb, count: number): Rgb[] => Array.from({ length: count }, () => pixel);

describe('classifyExposurePixel', () => {
  it('reads each of the four key colours as its own zone', () => {
    for (const { zoneId, colour } of DIAGRAM_12_ZONE_COLOURS) {
      expect(classifyExposurePixel(colour)).toEqual({ kind: 'zone', zoneId });
    }
  });

  it('treats white paper and sea as background', () => {
    expect(classifyExposurePixel({ r: 255, g: 255, b: 255 })).toEqual({ kind: 'background' });
    // 247 on every channel is the threshold itself, which counts as background.
    expect(classifyExposurePixel({ r: 247, g: 247, b: 247 })).toEqual({ kind: 'background' });
  });

  it('treats a coastline, a city dot or a label as ink', () => {
    // The figure's line and text colour.
    expect(classifyExposurePixel({ r: 25, g: 23, b: 27 })).toEqual({ kind: 'ink' });
  });

  it('absorbs a small drift, as a rescaled or recompressed screenshot gives', () => {
    // Zone 3 is (197, 198, 200); +6 on each channel is a distance of sqrt(3 x 36) = 10.4,
    // inside the 14 tolerance.
    expect(classifyExposurePixel({ r: 203, g: 204, b: 206 })).toEqual({
      kind: 'zone',
      zoneId: 'severe',
    });
  });

  it('refuses a shade sitting between two bands', () => {
    // Halfway between zone 2 (218) and zone 3 (197) is about 207.5, which is 18 from
    // each: outside the tolerance both ways, so neither band may claim it.
    expect(classifyExposurePixel({ r: 208, g: 208, b: 210 })).toEqual({ kind: 'unrecognised' });
  });

  it('refuses a colour that is not on the grey ramp at all', () => {
    expect(classifyExposurePixel({ r: 200, g: 120, b: 60 })).toEqual({ kind: 'unrecognised' });
  });
});

describe('readExposureArea', () => {
  it('reads a window that is all one band', () => {
    const result = readExposureArea(fill({ r: 178, g: 179, b: 181 }, 25));
    expect(result).toEqual({ kind: 'zone', zoneId: 'very-severe', agreement: 1 });
  });

  it('lets the majority carry a window clipped by a coastline', () => {
    // 18 zone-2 pixels and 7 of the figure's black line: 18 confident, all agreeing.
    const samples = [...fill({ r: 218, g: 219, b: 219 }, 18), ...fill({ r: 25, g: 23, b: 27 }, 7)];
    expect(readExposureArea(samples)).toEqual({
      kind: 'zone',
      zoneId: 'moderate',
      agreement: 1,
    });
  });

  it('reports a click straddling two bands as unclear', () => {
    // 12 zone-2 against 11 zone-3 is 12/23 = 0.52 agreement, under the 0.6 needed.
    const samples = [
      ...fill({ r: 218, g: 219, b: 219 }, 12),
      ...fill({ r: 197, g: 198, b: 200 }, 11),
    ];
    expect(readExposureArea(samples)).toEqual({ kind: 'unclear' });
  });

  it('accepts a clear majority across a band edge', () => {
    // 20 zone-4 against 5 zone-3 is 20/25 = 0.8, over the 0.6 needed.
    const samples = [
      ...fill({ r: 178, g: 179, b: 181 }, 20),
      ...fill({ r: 197, g: 198, b: 200 }, 5),
    ];
    expect(readExposureArea(samples)).toEqual({
      kind: 'zone',
      zoneId: 'very-severe',
      agreement: 0.8,
    });
  });

  it('says a click out at sea is background, not unclear', () => {
    expect(readExposureArea(fill({ r: 255, g: 255, b: 255 }, 25))).toEqual({ kind: 'background' });
  });

  it('will not read a zone from fewer than five confident pixels', () => {
    // Four zone-1 pixels agreeing is one short of the five needed, and the rest are
    // between-band shades rather than sea, so this is unclear rather than background.
    const samples = [
      ...fill({ r: 237, g: 237, b: 238 }, 4),
      ...fill({ r: 208, g: 208, b: 210 }, 6),
    ];
    expect(readExposureArea(samples)).toEqual({ kind: 'unclear' });
  });

  it('calls a mostly-sea window background rather than unclear', () => {
    // Six white against four zone-1: only four are confident, under the five needed, and
    // six is a strict majority of ten, so the answer is that the click missed the land.
    const samples = [
      ...fill({ r: 255, g: 255, b: 255 }, 6),
      ...fill({ r: 237, g: 237, b: 238 }, 4),
    ];
    expect(readExposureArea(samples)).toEqual({ kind: 'background' });
  });
});
