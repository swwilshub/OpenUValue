import { describe, expect, it } from 'vitest';
import {
  EXTERNAL_ENVIRONMENTS,
  INTERNAL_SURFACE_CONDITIONS,
  externalEnvironment,
  externalEnvironmentsForDirection,
  internalSurfaceCondition,
} from '../boundary.js';
import { InvalidInputError } from '../errors.js';
import { resolveSurfaceResistancesDetailed } from '../surfaceResistance.js';
import { calculateUValue } from '../uvalue.js';
import { CONCRETE_MEDIUM, MINERAL_WOOL, element, solid } from './fixtures.js';

/** 100 mm concrete: R = 0.1 / 1.15 = 0.086957 m2K/W. Used throughout below. */
const CONCRETE_R = 0.1 / 1.15;

describe('internal surface condition', () => {
  it('leaves the ISO 6946 table alone for free air circulation', () => {
    const wall = element([solid('c', 'Concrete', 0.1, CONCRETE_MEDIUM)], {
      internalSurfaceCondition: 'normal-air-circulation',
    });
    const resolved = resolveSurfaceResistancesDetailed(wall);
    expect(resolved.rsiM2KPerW).toBe(0.13);
    expect(resolved.rseM2KPerW).toBe(0.04);
    expect(resolved.rsiBasis).toBe('iso6946-tabulated');
  });

  it('raises Rsi to 0.25 for reduced air circulation, and says so', () => {
    const wall = element([solid('c', 'Concrete', 0.1, CONCRETE_MEDIUM)], {
      internalSurfaceCondition: 'reduced-air-circulation',
    });
    const resolved = resolveSurfaceResistancesDetailed(wall);
    expect(resolved.rsiM2KPerW).toBe(0.25);
    // Rse is unaffected: the obstruction is on the inside.
    expect(resolved.rseM2KPerW).toBe(0.04);
    expect(resolved.rsiBasis).toBe('reduced-air-circulation');
    expect(resolved.internalCondition.departsFromIso6946).toBe(true);
  });

  it('changes the U-value, not just the surface temperature', () => {
    // Hand calculation, 100 mm concrete, horizontal heat flow.
    //   R_layer = 0.1 / 1.15         = 0.0869565 m2K/W
    //   free:    RT = 0.13 + 0.0869565 + 0.04 = 0.2569565 -> U = 3.89171 W/(m2K)
    //   reduced: RT = 0.25 + 0.0869565 + 0.04 = 0.3769565 -> U = 2.65283 W/(m2K)
    // The 0.12 m2K/W added to Rsi is a real resistance in series, so it lowers U.
    // This is why the reduced case must never be presented as a BR 443 U-value.
    const free = calculateUValue(
      element([solid('c', 'Concrete', 0.1, CONCRETE_MEDIUM)], {
        internalSurfaceCondition: 'normal-air-circulation',
      }),
    );
    const reduced = calculateUValue(
      element([solid('c', 'Concrete', 0.1, CONCRETE_MEDIUM)], {
        internalSurfaceCondition: 'reduced-air-circulation',
      }),
    );
    expect(free.totalResistanceM2KPerW).toBeCloseTo(0.13 + CONCRETE_R + 0.04, 10);
    expect(free.uValueWPerM2K).toBeCloseTo(3.89171, 4);
    expect(reduced.totalResistanceM2KPerW).toBeCloseTo(0.25 + CONCRETE_R + 0.04, 10);
    expect(reduced.uValueWPerM2K).toBeCloseTo(2.65283, 4);
    // Exactly 0.12 m2K/W apart, which is 0.25 - 0.13.
    expect(
      reduced.totalResistanceM2KPerW - free.totalResistanceM2KPerW,
    ).toBeCloseTo(0.12, 10);
  });

  it('rejects an unknown condition', () => {
    expect(() => internalSurfaceCondition('nonsense' as never)).toThrow(InvalidInputError);
  });
});

describe('external environment', () => {
  it('uses the tabulated Rse against outside air', () => {
    const wall = element([solid('c', 'Concrete', 0.1, CONCRETE_MEDIUM)], {
      externalEnvironment: 'outside-air',
    });
    const resolved = resolveSurfaceResistancesDetailed(wall);
    expect(resolved.rseM2KPerW).toBe(0.04);
    expect(resolved.rseBasis).toBe('iso6946-tabulated');
  });

  it.each([
    ['rear-ventilated-cladding', 'horizontal', 0.13],
    ['unheated-room', 'horizontal', 0.13],
    ['heated-room', 'horizontal', 0.13],
    ['unheated-roof-space', 'upward', 0.1],
    ['rear-ventilated-roofing', 'upward', 0.1],
  ] as const)(
    'takes Rse as the still-air Rsi behind %s',
    (kind, direction, expectedRsi) => {
      // BS EN ISO 6946: behind a well-ventilated cavity, and for an element adjacent
      // to an unheated space, the outer face sees still air, so Rse = Rsi for the
      // same direction of heat flow - 0.13 horizontal, 0.10 upward.
      const built = element([solid('c', 'Concrete', 0.1, CONCRETE_MEDIUM)], {
        heatFlowDirection: direction,
        externalEnvironment: kind,
      });
      const resolved = resolveSurfaceResistancesDetailed(built);
      expect(resolved.rsiM2KPerW).toBe(expectedRsi);
      expect(resolved.rseM2KPerW).toBe(expectedRsi);
      expect(resolved.rseBasis).toBe('still-air-equal-to-rsi');
    },
  );

  it('carries a reduced-circulation Rsi through to a still-air outer face', () => {
    // An internal partition between two heated rooms, both faces obstructed:
    //   Rsi = Rse = 0.25, R_layer = 0.0869565
    //   RT = 0.25 + 0.0869565 + 0.25 = 0.5869565 -> U = 1.70371 W/(m2K)
    const partition = element([solid('c', 'Concrete', 0.1, CONCRETE_MEDIUM)], {
      externalEnvironment: 'heated-room',
      internalSurfaceCondition: 'reduced-air-circulation',
    });
    const resolved = resolveSurfaceResistancesDetailed(partition);
    expect(resolved.rsiM2KPerW).toBe(0.25);
    expect(resolved.rseM2KPerW).toBe(0.25);
    expect(calculateUValue(partition).uValueWPerM2K).toBeCloseTo(1.70371, 4);
  });

  it('refuses ground rather than approximating it as outside air', () => {
    // BS EN ISO 13370 is not implemented. Falling back to Rse = 0.04 would produce a
    // confident number for a calculation this engine cannot do.
    const floor = element([solid('c', 'Concrete', 0.1, CONCRETE_MEDIUM)], {
      heatFlowDirection: 'downward',
      externalEnvironment: 'ground',
    });
    expect(() => resolveSurfaceResistancesDetailed(floor)).toThrow(InvalidInputError);
    expect(() => resolveSurfaceResistancesDetailed(floor)).toThrow(/13370/);
  });

  it('refuses an environment that does not apply to the direction of heat flow', () => {
    // Rear ventilated cladding is not a thing a ceiling has.
    const ceiling = element([solid('c', 'Concrete', 0.1, CONCRETE_MEDIUM)], {
      heatFlowDirection: 'upward',
      externalEnvironment: 'rear-ventilated-cladding',
    });
    expect(() => resolveSurfaceResistancesDetailed(ceiling)).toThrow(InvalidInputError);
  });

  it('lets an explicit Rse override win over the environment', () => {
    const wall = element([solid('c', 'Concrete', 0.1, CONCRETE_MEDIUM)], {
      externalEnvironment: 'unheated-room',
      rseOverrideM2KPerW: 0.09,
    });
    const resolved = resolveSurfaceResistancesDetailed(wall);
    expect(resolved.rseM2KPerW).toBe(0.09);
    expect(resolved.rseBasis).toBe('caller-override');
  });

  it('rejects an unknown environment', () => {
    expect(() => externalEnvironment('nonsense' as never)).toThrow(InvalidInputError);
  });
});

describe('environment listings', () => {
  it('offers only environments that suit the direction of heat flow', () => {
    /*
     * Horizontal heat flow is not only a wall's. A roof pitched past 60 degrees resolves
     * to horizontal and still has tiles over a ventilated batten space, and a gable wall
     * between a room and a cold loft faces a roof space while standing upright. What a
     * wall genuinely cannot have is a ceiling's, and vice versa.
     */
    const horizontal = externalEnvironmentsForDirection('horizontal').map((e) => e.kind);
    expect(horizontal).toContain('rear-ventilated-cladding');
    expect(horizontal).toContain('rear-ventilated-roofing');
    expect(horizontal).toContain('unheated-roof-space');

    const upward = externalEnvironmentsForDirection('upward').map((e) => e.kind);
    expect(upward).toContain('unheated-roof-space');
    expect(upward).toContain('rear-ventilated-roofing');
    expect(upward).not.toContain('rear-ventilated-cladding');
    // Ground needs BS EN ISO 13370 and is never offered upward either way.
    expect(upward).not.toContain('ground');
  });

  it('keeps every listed case reachable by its own lookup', () => {
    for (const definition of EXTERNAL_ENVIRONMENTS) {
      expect(externalEnvironment(definition.kind)).toBe(definition);
    }
    for (const definition of INTERNAL_SURFACE_CONDITIONS) {
      expect(internalSurfaceCondition(definition.kind)).toBe(definition);
    }
  });

  it('marks exactly the unimplemented cases unsupported, with a reason', () => {
    for (const definition of EXTERNAL_ENVIRONMENTS) {
      if (definition.supported) {
        expect(definition.unsupportedReason).toBeUndefined();
      } else {
        expect(definition.unsupportedReason).toBeTruthy();
      }
    }
    expect(EXTERNAL_ENVIRONMENTS.filter((e) => !e.supported).map((e) => e.kind)).toEqual([
      'ground',
    ]);
  });
});

describe('boundary interaction with a real build-up', () => {
  it('warms the outer face of an insulated ceiling under a cold loft', () => {
    // 200 mm mineral wool at the ceiling, heat flowing up into a loft.
    //   R_layer = 0.2 / 0.035 = 5.714286 m2K/W
    //   outside air: RT = 0.10 + 5.714286 + 0.04 = 5.854286 -> U = 0.170815
    //   cold loft:   RT = 0.10 + 5.714286 + 0.10 = 5.914286 -> U = 0.169083
    // The loft adds still air on the outer face, so U falls slightly.
    const layers = [solid('mw', 'Mineral wool', 0.2, MINERAL_WOOL)];
    const toOutsideAir = calculateUValue(
      element(layers, { heatFlowDirection: 'upward', externalEnvironment: 'outside-air' }),
    );
    const toLoft = calculateUValue(
      element(layers, {
        heatFlowDirection: 'upward',
        externalEnvironment: 'unheated-roof-space',
      }),
    );
    expect(toOutsideAir.uValueWPerM2K).toBeCloseTo(0.170815, 5);
    expect(toLoft.uValueWPerM2K).toBeCloseTo(0.169083, 5);
  });
});
