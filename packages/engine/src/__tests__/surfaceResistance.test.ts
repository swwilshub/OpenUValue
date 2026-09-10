import { describe, expect, it } from 'vitest';
import { resolveSurfaceResistances, surfaceResistances } from '../surfaceResistance.js';
import { InvalidInputError } from '../errors.js';
import { SINGLE_LAYER_CONCRETE_WALL, element, solid, CONCRETE_MEDIUM } from './fixtures.js';

describe('surfaceResistances (BS EN ISO 6946, BR 443 conventions)', () => {
  it('returns the tabulated values for each direction of heat flow', () => {
    // Rse is 0.04 for all three directions; Rsi varies because convection at the
    // internal surface depends on whether the flow is with or against buoyancy.
    expect(surfaceResistances('upward')).toEqual({ rsiM2KPerW: 0.1, rseM2KPerW: 0.04 });
    expect(surfaceResistances('horizontal')).toEqual({ rsiM2KPerW: 0.13, rseM2KPerW: 0.04 });
    expect(surfaceResistances('downward')).toEqual({ rsiM2KPerW: 0.17, rseM2KPerW: 0.04 });
  });
});

describe('resolveSurfaceResistances', () => {
  it('uses the table when the element states no override', () => {
    expect(resolveSurfaceResistances(SINGLE_LAYER_CONCRETE_WALL)).toEqual({
      rsiM2KPerW: 0.13,
      rseM2KPerW: 0.04,
    });
  });

  it('lets an override win, and reports the overridden value back', () => {
    // An override is how a caller applies a convention the engine does not model,
    // such as BR 443's treatment of an element next to an unheated space.
    const overridden = element([solid('c', 'Concrete', 0.1, CONCRETE_MEDIUM)], {
      rsiOverrideM2KPerW: 0.1,
      rseOverrideM2KPerW: 0,
    });
    expect(resolveSurfaceResistances(overridden)).toEqual({ rsiM2KPerW: 0.1, rseM2KPerW: 0 });
  });

  it('rejects a negative override', () => {
    const bad = element([solid('c', 'Concrete', 0.1, CONCRETE_MEDIUM)], {
      rsiOverrideM2KPerW: -0.1,
    });
    expect(() => resolveSurfaceResistances(bad)).toThrow(InvalidInputError);
  });
});
