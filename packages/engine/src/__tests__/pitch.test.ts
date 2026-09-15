import { describe, expect, it } from 'vitest';
import {
  PITCH_TREATED_AS_VERTICAL_DEGREES,
  heatFlowAngleFromHorizontalDegrees,
  heatFlowDirectionForRoofPitch,
} from '../pitch.js';
import { surfaceResistances } from '../surfaceResistance.js';

describe('heatFlowDirectionForRoofPitch', () => {
  it('sends a flat roof straight up', () => {
    // Pitch 0 means the face is horizontal, so heat leaves at 90 degrees from the
    // horizontal plane: the upward column.
    expect(heatFlowDirectionForRoofPitch(0)).toBe('upward');
    expect(heatFlowAngleFromHorizontalDegrees(0)).toBe(90);
  });

  it('keeps an ordinary pitched roof on the upward figures', () => {
    // A 45 degree roof sends heat out at 90 - 45 = 45 degrees from horizontal, which is
    // outside the +/-30 band, so it is still upward heat flow.
    expect(heatFlowDirectionForRoofPitch(45)).toBe('upward');
    expect(heatFlowAngleFromHorizontalDegrees(45)).toBe(45);
  });

  it('switches to a wall at 60 degrees, where the heat flow reaches 30 from horizontal', () => {
    // 90 - 60 = 30, the edge of the band, and the band includes it.
    expect(heatFlowAngleFromHorizontalDegrees(60)).toBe(30);
    expect(heatFlowDirectionForRoofPitch(60)).toBe('horizontal');
    expect(heatFlowDirectionForRoofPitch(59.9)).toBe('upward');
    expect(PITCH_TREATED_AS_VERTICAL_DEGREES).toBe(60);
  });

  it('treats a vertical face as a wall', () => {
    // 90 - 90 = 0 degrees from horizontal: heat flows straight out sideways.
    expect(heatFlowDirectionForRoofPitch(90)).toBe('horizontal');
    expect(heatFlowAngleFromHorizontalDegrees(90)).toBe(0);
  });

  it('changes Rsi by 0.03 across the switch, and nothing else', () => {
    // Upward Rsi 0.10, horizontal 0.13; Rse is 0.04 either side.
    const shallow = surfaceResistances(heatFlowDirectionForRoofPitch(50));
    const steep = surfaceResistances(heatFlowDirectionForRoofPitch(70));
    expect(shallow.rsiM2KPerW).toBeCloseTo(0.1, 10);
    expect(steep.rsiM2KPerW).toBeCloseTo(0.13, 10);
    expect(steep.rsiM2KPerW - shallow.rsiM2KPerW).toBeCloseTo(0.03, 10);
    expect(shallow.rseM2KPerW).toBeCloseTo(steep.rseM2KPerW, 10);
  });

  it('refuses a pitch that is not a pitch', () => {
    expect(() => heatFlowDirectionForRoofPitch(-1)).toThrow();
    expect(() => heatFlowDirectionForRoofPitch(91)).toThrow();
    expect(() => heatFlowDirectionForRoofPitch(Number.NaN)).toThrow();
    expect(() => heatFlowAngleFromHorizontalDegrees(120)).toThrow();
  });
});
