import { describe, expect, it } from 'vitest';
import { decodeState, encodeState } from '../codec.js';
import { defaultState } from '../../state/model.js';

describe('a roof in a share link', () => {
  it('carries its kind and pitch, and rebuilds the direction from them', () => {
    // A 35 degree roof: heat leaves at 90 - 35 = 55 degrees from horizontal, outside the
    // +/-30 band, so the direction is upward.
    const roof = {
      ...defaultState(),
      elementKind: 'roof' as const,
      roofPitchDegrees: 35,
      heatFlowDirection: 'upward' as const,
    };
    const { state, problem } = decodeState(encodeState(roof));
    expect(problem).toBeUndefined();
    expect(state.elementKind).toBe('roof');
    expect(state.roofPitchDegrees).toBe(35);
    expect(state.heatFlowDirection).toBe('upward');
  });

  it('gives a steep roof a wall direction without making it a wall', () => {
    // 70 degrees: heat leaves at 20 degrees from horizontal, inside the band.
    const roof = {
      ...defaultState(),
      elementKind: 'roof' as const,
      roofPitchDegrees: 70,
      heatFlowDirection: 'horizontal' as const,
    };
    const { state } = decodeState(encodeState(roof));
    expect(state.elementKind).toBe('roof');
    expect(state.roofPitchDegrees).toBe(70);
    expect(state.heatFlowDirection).toBe('horizontal');
  });

  it('does not trust a direction typed into the hash by hand', () => {
    /*
     * The hash is editable text. A link claiming a 10 degree roof with a wall's
     * horizontal heat flow is not something the standard allows, so the direction is
     * recomputed from the kind and the pitch rather than taken as given.
     */
    const forged = encodeState({
      ...defaultState(),
      elementKind: 'roof',
      roofPitchDegrees: 10,
      heatFlowDirection: 'horizontal',
    });
    expect(decodeState(forged).state.heatFlowDirection).toBe('upward');
  });

  it('keeps a wall a wall, and a floor a floor', () => {
    const wall = decodeState(encodeState(defaultState())).state;
    expect(wall.elementKind).toBe('wall');
    expect(wall.heatFlowDirection).toBe('horizontal');

    const floor = decodeState(
      encodeState({
        ...defaultState(),
        elementKind: 'floor',
        heatFlowDirection: 'downward',
      }),
    ).state;
    expect(floor.elementKind).toBe('floor');
    expect(floor.heatFlowDirection).toBe('downward');
  });
});
