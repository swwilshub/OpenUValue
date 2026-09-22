import { describe, expect, it } from 'vitest';
import { roundUValueForReporting } from '../rounding.js';
import { calculateUValue } from '../uvalue.js';
import type { BuildingElement, Layer } from '../types.js';

/**
 * Worked U-value examples published by a government, reproduced end to end.
 *
 * The source is the Irish Department of Housing's Technical Guidance Document L,
 * *Conservation of Fuel and Energy – Dwellings*, Appendix A, which works I.S. EN ISO 6946
 * examples through with every intermediate figure printed. I.S. EN ISO 6946 is the Irish
 * adoption of the same EN ISO 6946 that BS EN ISO 6946 adopts, and the surface resistances
 * used (Rsi 0.13 horizontal, 0.10 upward; Rse 0.04) are the ones this engine uses.
 *
 *   - TGD L 2011, Example A2, printed pages 37-38: timber frame wall, one bridged layer.
 *   - TGD L 2022, Example A1, printed page 49: masonry cavity wall with a low-e cavity.
 *   - TGD L 2022, Example A3, printed pages 52-53: pitched roof insulated at ceiling
 *     level. The same example, with the same figures, is in the 2011 edition.
 *
 * The λ values are the document's own (its Table A1 and the example tables), used here
 * as test inputs only. They are not catalogue data and do not enter packages/materials.
 *
 * As CLAUDE.md requires, each expectation is the hand calculation in the comment beside
 * it, carried at full precision. The document rounds each resistance to three places
 * before adding them up, so its printed intermediates differ from ours in the third
 * decimal place; both are shown, and the published U-value to two decimal places is
 * asserted as well.
 *
 * Not reproduced: TGD L 2022 Example A2 (timber frame with a service void). Its printed
 * arithmetic has two slips: the 15 mm plasterboard is entered as 0.006 m²K/W where
 * 0.015 / 0.25 = 0.060, and the lower limit omits the 0.440 low-e cavity that both of its
 * upper-limit insulation paths include. A test against it would be testing the misprint.
 */

function element(
  heatFlowDirection: BuildingElement['heatFlowDirection'],
  layers: readonly Layer[],
): BuildingElement {
  return { id: 'published', name: 'Published example', heatFlowDirection, layers };
}

describe('TGD L 2011 Example A2: timber frame wall, one bridged layer', () => {
  // Internal -> external, heat flow horizontal. λ from the example's own table.
  //   13 mm plasterboard, λ 0.25                 0.013 / 0.25  = 0.0520000
  //   150 mm PIR, λ 0.023, 15 % softwood studs   0.150 / 0.023 = 6.5217391
  //     studs, λ 0.12                            0.150 / 0.12  = 1.2500000
  //   12 mm sheathing ply, λ 0.13                0.012 / 0.13  = 0.0923077
  //   50 mm unventilated air cavity (table)                      0.1800000
  //   102 mm brick outer leaf, λ 0.77            0.102 / 0.77  = 0.1324675
  //   Rsi 0.13, Rse 0.04
  //
  // The document gives the cavity as 0.180 from the table, with the vapour control layer
  // and breather membrane taken as having no resistance, so neither is modelled here.
  const wall = element('horizontal', [
    { kind: 'solid', id: 'pb', label: 'Plasterboard', thicknessM: 0.013, material: { lambdaWPerMK: 0.25 } },
    {
      kind: 'solid',
      id: 'pir',
      label: 'PIR between studs',
      thicknessM: 0.15,
      material: { lambdaWPerMK: 0.023 },
      bridging: { label: 'Timber studs', areaFraction: 0.15, material: { lambdaWPerMK: 0.12 } },
    },
    { kind: 'solid', id: 'ply', label: 'Sheathing ply', thicknessM: 0.012, material: { lambdaWPerMK: 0.13 } },
    { kind: 'air', id: 'cavity', label: 'Air cavity', thicknessM: 0.05, ventilation: 'unventilated' },
    { kind: 'solid', id: 'brick', label: 'Brick outer leaf', thicknessM: 0.102, material: { lambdaWPerMK: 0.77 } },
  ]);
  const result = calculateUValue(wall);

  it('takes the 0.18 the document tabulates for the cavity', () => {
    // ISO 6946 unventilated air layer, 25 mm or more, horizontal heat flow: 0.18.
    const cavity = result.layers.find((layer) => layer.layerId === 'cavity');
    expect(cavity?.resistanceM2KPerW).toBeCloseTo(0.18, 10);
  });

  it('reproduces the upper and lower limits', () => {
    // UPPER LIMIT
    //   common to both paths: 0.04 + 0.1324675 + 0.18 + 0.0923077 + 0.052 + 0.13 = 0.6267752
    //   insulation path R1 = 0.6267752 + 6.5217391 = 7.1485143   (printed 7.148)
    //   stud path       R2 = 0.6267752 + 1.25      = 1.8767752   (printed 1.876)
    //   1/Ru = 0.85 / 7.1485143 + 0.15 / 1.8767752
    //        = 0.1189058        + 0.0799243
    //        = 0.1988301
    //   Ru   = 5.0294182                                          (printed 5.028)
    expect(result.totalResistanceUpperLimitM2KPerW).toBeCloseTo(5.0294182, 6);

    // LOWER LIMIT
    //   1/Rb = 0.85 / 6.5217391 + 0.15 / 1.25 = 0.1303333 + 0.12 = 0.2503333
    //   Rb   = 3.9946738                                          (printed 3.995)
    //   RL   = 0.6267752 + 3.9946738 = 4.6214490                  (printed 4.621)
    expect(result.totalResistanceLowerLimitM2KPerW).toBeCloseTo(4.621449, 6);
  });

  it('reproduces the total resistance and the U-value', () => {
    // RT = (5.0294182 + 4.6214490) / 2 = 4.8254336               (printed 4.8245)
    // U  = 1 / 4.8254336 = 0.2072353 W/(m²·K)                     (printed 0.21)
    // The printed RT is (5.028 + 4.621) / 2 = 4.8245 from the rounded limits.
    expect(result.totalResistanceM2KPerW).toBeCloseTo(4.8254336, 6);
    expect(result.uValueWPerM2K).toBeCloseTo(0.2072353, 6);
    expect(roundUValueForReporting(result.uValueWPerM2K)).toBe(0.21);
  });

  it('is well inside the combined method, so a U-value is reported', () => {
    // Ru / RL = 5.0294182 / 4.6214490 = 1.0882773, under the 1.5 limit.
    expect(result.upperToLowerLimitRatio).toBeCloseTo(1.0882773, 6);
    expect(result.outOfScopeReasons).toEqual([]);
  });
});

describe('TGD L 2022 Example A1: masonry cavity wall with a low-e cavity', () => {
  // Internal -> external, heat flow horizontal, every layer homogeneous.
  //   13 mm lightweight plaster, λ 0.18    0.013 / 0.18  = 0.0722222
  //   100 mm dense block, λ 1.33           0.100 / 1.33  = 0.0751880
  //   100 mm PIR, λ 0.021                  0.100 / 0.021 = 4.7619048
  //   50 mm low-e air cavity (table)                        0.4400000
  //   100 mm dense block, λ 1.33           0.100 / 1.33  = 0.0751880
  //   19 mm render, λ 1.00                 0.019 / 1.00  = 0.0190000
  //   Rsi 0.13, Rse 0.04
  const wall = element('horizontal', [
    { kind: 'solid', id: 'plaster', label: 'Lightweight plaster', thicknessM: 0.013, material: { lambdaWPerMK: 0.18 } },
    { kind: 'solid', id: 'inner', label: 'Dense block inner leaf', thicknessM: 0.1, material: { lambdaWPerMK: 1.33 } },
    { kind: 'solid', id: 'pir', label: 'PIR partial fill', thicknessM: 0.1, material: { lambdaWPerMK: 0.021 } },
    {
      kind: 'air',
      id: 'cavity',
      label: 'Low-e residual cavity',
      thicknessM: 0.05,
      ventilation: 'unventilated',
      emissivity: 'low',
    },
    { kind: 'solid', id: 'outer', label: 'Dense block outer leaf', thicknessM: 0.1, material: { lambdaWPerMK: 1.33 } },
    { kind: 'solid', id: 'render', label: 'Render', thicknessM: 0.019, material: { lambdaWPerMK: 1.0 } },
  ]);
  const result = calculateUValue(wall);

  it('takes the 0.44 the document gives for a low-e cavity in a wall', () => {
    // The engine's own low-emissivity value for a wall cavity of 25 mm or more is BR 443
    // (2019) 4.7.2's 0.44, and the document uses the same figure.
    const cavity = result.layers.find((layer) => layer.layerId === 'cavity');
    expect(cavity?.resistanceM2KPerW).toBeCloseTo(0.44, 10);
  });

  it('reproduces the total resistance and the U-value', () => {
    // RT = 0.13 + 0.0722222 + 0.0751880 + 4.7619048 + 0.44 + 0.0751880 + 0.019 + 0.04
    //    = 5.6135030                                     (printed 5.611, from rounded rows)
    // U  = 1 / 5.6135030 = 0.1781419 W/(m²·K)             (printed 0.18)
    expect(result.method).toBe('homogeneous');
    expect(result.totalResistanceM2KPerW).toBeCloseTo(5.613503, 6);
    expect(result.uValueWPerM2K).toBeCloseTo(0.1781419, 6);
    expect(roundUValueForReporting(result.uValueWPerM2K)).toBe(0.18);
  });
});

describe('TGD L 2022 Example A3: pitched roof insulated at ceiling level', () => {
  // Internal -> external, heat flow upward.
  //   13 mm plasterboard, λ 0.25                  0.013 / 0.25 = 0.0520000
  //   100 mm mineral wool between joists, λ 0.04  0.100 / 0.04 = 2.5000000
  //     9 % timber joists, λ 0.13                 0.100 / 0.13 = 0.7692308
  //   150 mm mineral wool over the joists         0.150 / 0.04 = 3.7500000
  //   roof space, including the sloping construction and the roof cavity   0.2000000
  //   Rsi 0.10 (upward), Rse 0.04
  //
  // The document treats the loft as a 0.20 roof-space resistance followed by an ordinary
  // external surface at 0.04. The engine has no unheated-space resistance R_u yet
  // (ROADMAP Phase 2, VERIFY V13), so the 0.20 goes in as a fixed-resistance layer and the
  // external surface is left as open air. This checks the combined-method arithmetic for
  // a ceiling; it is not the engine's "unheated roof space" convention, which puts
  // 0.10 on that side instead of 0.24.
  const roof = element('upward', [
    { kind: 'solid', id: 'pb', label: 'Plasterboard', thicknessM: 0.013, material: { lambdaWPerMK: 0.25 } },
    {
      kind: 'solid',
      id: 'between',
      label: 'Mineral wool between joists',
      thicknessM: 0.1,
      material: { lambdaWPerMK: 0.04 },
      bridging: { label: 'Ceiling joists', areaFraction: 0.09, material: { lambdaWPerMK: 0.13 } },
    },
    { kind: 'solid', id: 'over', label: 'Mineral wool over joists', thicknessM: 0.15, material: { lambdaWPerMK: 0.04 } },
    { kind: 'fixed-resistance', id: 'roof-space', label: 'Roof space', thicknessM: 0, resistanceM2KPerW: 0.2 },
  ]);
  const result = calculateUValue(roof);

  it('uses the upward surface resistances', () => {
    expect(result.rsiM2KPerW).toBeCloseTo(0.1, 10);
    expect(result.rseM2KPerW).toBeCloseTo(0.04, 10);
  });

  it('reproduces the upper and lower limits', () => {
    // UPPER LIMIT
    //   common: 0.04 + 0.2 + 3.75 + 0.052 + 0.10 = 4.142
    //   insulation path R1 = 4.142 + 2.5       = 6.6420000        (printed 6.642)
    //   joist path      R2 = 4.142 + 0.7692308 = 4.9112308        (printed 4.911)
    //   1/Ru = 0.91 / 6.642 + 0.09 / 4.9112308
    //        = 0.1370069    + 0.0183253
    //        = 0.1553322
    //   Ru   = 6.4378123                                          (printed 6.438)
    expect(result.totalResistanceUpperLimitM2KPerW).toBeCloseTo(6.4378123, 6);

    // LOWER LIMIT
    //   1/Rb = 0.91 / 2.5 + 0.09 / 0.7692308 = 0.364 + 0.117 = 0.481
    //   Rb   = 2.0790021                                          (printed 2.079)
    //   RL   = 4.142 + 2.0790021 = 6.2210021                      (printed 6.221)
    expect(result.totalResistanceLowerLimitM2KPerW).toBeCloseTo(6.2210021, 6);
  });

  it('reproduces the total resistance and the U-value', () => {
    // RT = (6.4378123 + 6.2210021) / 2 = 6.3294072              (printed 6.329)
    // U  = 1 / 6.3294072 = 0.1579927 W/(m²·K)                    (printed 0.16)
    expect(result.totalResistanceM2KPerW).toBeCloseTo(6.3294072, 6);
    expect(result.uValueWPerM2K).toBeCloseTo(0.1579927, 6);
    expect(roundUValueForReporting(result.uValueWPerM2K)).toBe(0.16);
  });
});
