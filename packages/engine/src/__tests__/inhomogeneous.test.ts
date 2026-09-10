import { describe, expect, it } from 'vitest';
import {
  enumerateSectionPaths,
  parallelResistanceM2KPerW,
} from '../inhomogeneous.js';
import { resolveAssembly } from '../assembly.js';
import { calculateUValue } from '../uvalue.js';
import {
  CONCRETE_MEDIUM,
  MINERAL_WOOL,
  OSB,
  PLASTERBOARD,
  SOFTWOOD,
  STEEL,
  TIMBER_FRAME_WALL,
  element,
  solid,
} from './fixtures.js';

const variantOf = (el: Parameters<typeof calculateUValue>[0]) => {
  const variant = resolveAssembly(el).variants[0];
  if (variant === undefined) {
    throw new Error('no variant');
  }
  return variant;
};

describe('parallelResistanceM2KPerW', () => {
  it('returns that same resistance when both sections are equal', () => {
    // 1/R = 0.5/2 + 0.5/2 = 0.5, so R = 2. Two identical sections in parallel are
    // indistinguishable from one homogeneous layer.
    expect(parallelResistanceM2KPerW([
      { areaFraction: 0.5, resistanceM2KPerW: 2 },
      { areaFraction: 0.5, resistanceM2KPerW: 2 },
    ])).toBeCloseTo(2, 12);
  });

  it('short-circuits when a section has zero resistance', () => {
    expect(parallelResistanceM2KPerW([
      { areaFraction: 0.9, resistanceM2KPerW: 4 },
      { areaFraction: 0.1, resistanceM2KPerW: 0 },
    ])).toBe(0);
  });
});

describe('calculateUValue, combined method (BS EN ISO 6946)', () => {
  it('computes the timber-frame worked example', () => {
    // Internal -> external, heat flow horizontal:
    //   12.5 mm plasterboard                 R = 0.0125 / 0.25  = 0.0500000
    //   140 mm mineral wool, 15 % softwood   unbridged 0.140 / 0.035 = 4.0000000
    //                                        bridged   0.140 / 0.13  = 1.0769231
    //    9 mm OSB sheathing                  R = 0.009  / 0.13  = 0.0692308
    //   Rsi = 0.13, Rse = 0.04
    //
    // UPPER LIMIT (no lateral heat flow: each path conducts independently)
    //   unbridged path, f = 0.85:
    //     R_T1 = 0.13 + 0.05 + 4.0        + 0.0692308 + 0.04 = 4.2892308
    //   bridging path, f = 0.15:
    //     R_T2 = 0.13 + 0.05 + 1.0769231  + 0.0692308 + 0.04 = 1.3661539
    //   1/R_T1 = 0.2331420,  1/R_T2 = 0.7319820
    //   1/R'T = 0.85 * 0.2331420 + 0.15 * 0.7319820
    //         = 0.1981707        + 0.1097973
    //         = 0.3079680
    //   R'T   = 1 / 0.3079680 = 3.2470903 m^2*K/W
    //
    // LOWER LIMIT (isothermal planes: combine each layer in parallel first)
    //   insulation layer: 1/R = 0.85/4.0 + 0.15/1.0769231
    //                         = 0.2125   + 0.1392857      (0.15 * 13/14 = 1.95/14)
    //                         = 0.3517857
    //                     R   = 1 / 0.3517857 = 2.8426396
    //   R''T = 0.13 + 0.05 + 2.8426396 + 0.0692308 + 0.04 = 3.1318704 m^2*K/W
    //
    // COMBINED
    //   RT = (3.2470903 + 3.1318704) / 2 = 6.3789607 / 2 = 3.1894804 m^2*K/W
    //   U  = 1 / 3.1894804 = 0.3135307 W/(m^2*K)          -> 0.31 as reported
    //
    // APPLICABILITY
    //   ratio = 3.2470903 / 3.1318704 = 1.0367895         (limit 1.5, so in scope)
    //     check: 3.1318704 * 1.03679 = 3.2470919, over by 0.0000016, and
    //            0.0000016 / 3.1318704 = 0.0000005, so the ratio is 1.0367895.
    //   e     = (3.2470903 - 3.1318704) / (2 * 3.1894804) * 100
    //         = 0.1152199 / 6.3789607 * 100 = 1.80625 %   (limit 20 %)
    const result = calculateUValue(TIMBER_FRAME_WALL);
    expect(result.method).toBe('iso6946-combined');
    expect(result.totalResistanceUpperLimitM2KPerW).toBeCloseTo(3.2470903, 6);
    expect(result.totalResistanceLowerLimitM2KPerW).toBeCloseTo(3.1318704, 6);
    expect(result.totalResistanceM2KPerW).toBeCloseTo(3.1894804, 6);
    expect(result.uValueWPerM2K).toBeCloseTo(0.3135307, 7);
    expect(result.upperToLowerLimitRatio).toBeCloseTo(1.0367895, 6);
    expect(result.maxRelativeErrorPercent).toBeCloseTo(1.80625, 4);
    expect(result.outOfScopeReasons).toEqual([]);
    // The reported layer resistances expose both sections plus their combination.
    expect(result.layers[1]?.resistanceM2KPerW).toBeCloseTo(4.0, 12);
    expect(result.layers[1]?.bridgingResistanceM2KPerW).toBeCloseTo(1.0769231, 7);
    expect(result.layers[1]?.combinedResistanceM2KPerW).toBeCloseTo(2.8426396, 6);
  });

  it('collapses to the homogeneous result at an area fraction of 0', () => {
    // A "0 % bridged" layer is not inhomogeneous, so the combined method must not be
    // invoked at all and the error estimate must be exactly zero.
    const unbridged = element([
      solid('pb', 'Plasterboard', 0.0125, PLASTERBOARD),
      solid('insulation', 'Mineral wool', 0.14, MINERAL_WOOL, {
        label: 'Softwood stud',
        areaFraction: 0,
        material: SOFTWOOD,
      }),
      solid('osb', 'OSB', 0.009, OSB),
    ]);
    // RT = 0.13 + 0.05 + 4.0 + 0.0692308 + 0.04 = 4.2892308 (the unbridged path).
    const result = calculateUValue(unbridged);
    expect(result.method).toBe('homogeneous');
    expect(result.totalResistanceM2KPerW).toBeCloseTo(4.2892308, 7);
    expect(result.maxRelativeErrorPercent).toBe(0);
  });

  it('collapses to the all-bridging result at an area fraction of 1', () => {
    const fullyBridged = element([
      solid('pb', 'Plasterboard', 0.0125, PLASTERBOARD),
      solid('insulation', 'Mineral wool', 0.14, MINERAL_WOOL, {
        label: 'Softwood stud',
        areaFraction: 1,
        material: SOFTWOOD,
      }),
      solid('osb', 'OSB', 0.009, OSB),
    ]);
    // RT = 0.13 + 0.05 + 14/13 + 9/130 + 0.04
    //    = 0.22 + 1.0769230769 + 0.0692307692 = 1.3661538461 (the stud path).
    const result = calculateUValue(fullyBridged);
    expect(result.method).toBe('homogeneous');
    expect(result.totalResistanceM2KPerW).toBeCloseTo(1.3661538461, 9);
    expect(result.maxRelativeErrorPercent).toBe(0);
  });

  it('keeps the upper limit at or above the lower limit for arbitrary build-ups', () => {
    // A property of the two assumptions: allowing lateral heat flow (isothermal
    // planes) can only increase the conductance, never reduce it.
    let seed = 20260910;
    const random = () => {
      seed = (seed * 1103515245 + 12345) % 2 ** 31;
      return seed / 2 ** 31;
    };
    for (let trial = 0; trial < 200; trial += 1) {
      const layerCount = 1 + Math.floor(random() * 4);
      const layers = Array.from({ length: layerCount }, (_unused, index) =>
        solid(
          `layer-${index}`,
          `Layer ${index}`,
          0.005 + random() * 0.2,
          { lambdaWPerMK: 0.02 + random() * 1.5 },
          random() < 0.6
            ? {
                label: 'Bridge',
                areaFraction: random() * 0.4,
                material: { lambdaWPerMK: 0.05 + random() * 0.5 },
              }
            : undefined,
        ),
      );
      const result = calculateUValue(element(layers));
      expect(result.totalResistanceUpperLimitM2KPerW).toBeGreaterThanOrEqual(
        result.totalResistanceLowerLimitM2KPerW - 1e-12,
      );
    }
  });
});

describe('enumerateSectionPaths', () => {
  it('returns the cross-product of sections, with fractions summing to 1', () => {
    // Two inhomogeneous layers, 15 % and 10 % bridged, give 2 * 2 = 4 paths with
    // area fractions 0.85*0.90 = 0.765, 0.85*0.10 = 0.085, 0.15*0.90 = 0.135 and
    // 0.15*0.10 = 0.015, which sum to 1.000.
    const twoBridged = element([
      solid('a', 'Insulation A', 0.1, MINERAL_WOOL, {
        label: 'Stud A',
        areaFraction: 0.15,
        material: SOFTWOOD,
      }),
      solid('b', 'Insulation B', 0.1, MINERAL_WOOL, {
        label: 'Stud B',
        areaFraction: 0.1,
        material: SOFTWOOD,
      }),
    ]);
    const paths = enumerateSectionPaths(twoBridged, variantOf(twoBridged));
    expect(paths).toHaveLength(4);
    expect(paths.map((p) => p.areaFraction).reduce((a, b) => a + b, 0)).toBeCloseTo(1, 12);
    const sortedFractions = [...paths.map((p) => p.areaFraction)].sort((a, b) => a - b);
    for (const [index, expected] of [0.015, 0.085, 0.135, 0.765].entries()) {
      expect(sortedFractions[index]).toBeCloseTo(expected, 12);
    }
    expect(paths.filter((p) => p.isAllUnbridged)).toHaveLength(1);
    expect(paths.filter((p) => p.isAllBridged)).toHaveLength(1);
    expect(paths.filter((p) => p.id.startsWith('mixed:'))).toHaveLength(2);
  });
});

describe('validity limits (BS EN ISO 6946)', () => {
  it('withholds the U-value when the upper/lower ratio exceeds 1.5', () => {
    // Steel studs, 10 % of a 100 mm insulation layer, heat flow horizontal:
    //   unbridged R = 0.100 / 0.035 = 2.8571429
    //   bridged   R = 0.100 / 50    = 0.0020000
    //
    // UPPER LIMIT
    //   R_T1 = 0.13 + 2.8571429 + 0.04 = 3.0271429   (f = 0.9)
    //   R_T2 = 0.13 + 0.002     + 0.04 = 0.1720000   (f = 0.1)
    //   1/R_T1 = 0.3303445,  1/R_T2 = 1/0.172 = 5.8139535
    //   1/R'T  = 0.9 * 0.3303445 + 0.1 * 5.8139535
    //          = 0.2973101       + 0.5813953  = 0.8787054
    //   R'T    = 1 / 0.8787054 = 1.1380378
    //
    // LOWER LIMIT
    //   1/R = 0.9/2.8571429 + 0.1/0.002 = 0.315 + 50 = 50.315
    //   R   = 1 / 50.315 = 0.0198748
    //   R''T = 0.13 + 0.0198748 + 0.04 = 0.1898748
    //
    //   ratio = 1.1380378 / 0.1898748 = 5.9936      -> far above the 1.5 limit
    //   RT    = (1.1380378 + 0.1898748) / 2 = 0.6639563
    //   provisional U = 1 / 0.6639563 = 1.5061232 W/(m^2*K), diagnostics only
    const steelStudWall = element([
      solid('insulation', 'Insulation', 0.1, MINERAL_WOOL, {
        label: 'Steel stud',
        areaFraction: 0.1,
        material: STEEL,
      }),
    ]);
    const result = calculateUValue(steelStudWall);
    expect(result.totalResistanceUpperLimitM2KPerW).toBeCloseTo(1.1380378, 6);
    expect(result.totalResistanceLowerLimitM2KPerW).toBeCloseTo(0.1898748, 6);
    expect(result.upperToLowerLimitRatio).toBeCloseTo(5.9936, 3);
    expect(result.uValueWPerM2K).toBeNull();
    expect(result.provisionalUValueWPerM2K).toBeCloseTo(1.5061232, 6);
    expect(result.outOfScopeReasons).toContain('upper-lower-ratio-exceeds-limit');
    expect(result.warnings.map((w) => w.code)).toContain('combined-method-ratio-exceeds-limit');
  });

  it('agrees with the 20 % error limit, which is the same rule restated', () => {
    // Algebraically, at R'T = 1.5 * R''T:
    //   RT = (1.5 + 1)/2 * R''T = 1.25 * R''T
    //   e  = (R'T - R''T) / (2*RT) = 0.5*R''T / (2.5*R''T) = 0.20
    // So the ratio limit of 1.5 and the error limit of 20 % are one criterion. Any
    // element at the ratio limit must therefore report exactly 20 %.
    const lower = 1;
    const upper = 1.5;
    const total = (upper + lower) / 2;
    expect(((upper - lower) / (2 * total)) * 100).toBeCloseTo(20, 12);
  });

  it('flags metal bridging even when the ratio stays inside the limit', () => {
    // 0.5 % steel through 100 mm concrete, heat flow horizontal:
    //   unbridged R = 0.100 / 1.15 = 0.0869565
    //   bridged   R = 0.100 / 50   = 0.0020000
    //
    //   1/R'T = 0.995/0.2569565 + 0.005/0.172 = 3.8722400 + 0.0290698 = 3.9013098
    //   R'T   = 0.2563244
    //   1/R   = 0.995/0.0869565 + 0.005/0.002 = 11.4425 + 2.5 = 13.9425
    //   R     = 0.0717232,  R''T = 0.13 + 0.0717232 + 0.04 = 0.2417232
    //   ratio = 0.2563244 / 0.2417232 = 1.0604   -> inside the 1.5 limit
    //
    // The ratio test alone would let this through, but BS EN ISO 6946 excludes metal
    // penetrating the insulation regardless, so the U-value is still withheld.
    const metalBridged = element([
      solid('concrete', 'Concrete', 0.1, CONCRETE_MEDIUM, {
        label: 'Steel tie',
        areaFraction: 0.005,
        material: STEEL,
      }),
    ]);
    const result = calculateUValue(metalBridged);
    expect(result.upperToLowerLimitRatio).toBeLessThan(1.5);
    expect(result.outOfScopeReasons).toEqual(['metal-bridging']);
    expect(result.uValueWPerM2K).toBeNull();
    expect(result.warnings.map((w) => w.code)).toContain('metal-bridging-out-of-scope');
  });
});
