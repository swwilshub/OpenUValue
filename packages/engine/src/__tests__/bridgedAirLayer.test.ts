import { describe, expect, it } from 'vitest';
import { calculateUValue } from '../uvalue.js';
import { layerSectionResistances } from '../resistance.js';
import {
  PLASTERBOARD_BATTEN_AREA_FRACTION,
  PLASTER_DAB_AREA_FRACTION,
  PLASTER_DAB_LAMBDA_W_PER_MK,
} from '../constants.js';
import type { AirLayer, BuildingElement, Layer } from '../types.js';
import { element, solid } from './fixtures.js';

const PLASTERBOARD = { lambdaWPerMK: 0.25 };
const BRICK = { lambdaWPerMK: 0.77 };
const DABS = { lambdaWPerMK: PLASTER_DAB_LAMBDA_W_PER_MK };
const SOFTWOOD = { lambdaWPerMK: 0.13 };

function cavity(overrides: Partial<AirLayer> = {}): Layer {
  return {
    kind: 'air',
    id: 'cav',
    label: 'Cavity',
    thicknessM: 0.015,
    ventilation: 'unventilated',
    ...overrides,
  } as Layer;
}

/**
 * Plasterboard on dabs over a brick wall, using BR 443 (2006) 4.7.1's own figures:
 * dabs at an area fraction of 0.20, lambda 0.43 W/(m*K), 15 mm thick.
 *
 *   Rsi                                    0.13
 *   12.5 mm plasterboard, lambda 0.25      0.0125 / 0.25       = 0.05
 *   15 mm cavity                           table, wall, 15 mm  = 0.17
 *     or 15 mm of dab, lambda 0.43         0.015 / 0.43        = 0.034883720930
 *   100 mm brick, lambda 0.77              0.1 / 0.77          = 0.129870129870
 *   Rse                                    0.04
 */
const DOT_AND_DAB = element([
  solid('pb', 'Plasterboard', 0.0125, PLASTERBOARD),
  cavity({
    bridging: {
      label: 'Plaster dabs',
      areaFraction: PLASTER_DAB_AREA_FRACTION,
      material: DABS,
    },
  }),
  solid('brk', 'Brick', 0.1, BRICK),
]) as BuildingElement;

describe('a cavity crossed by plaster dabs', () => {
  const result = calculateUValue(DOT_AND_DAB);

  it('resolves by the combined method, as any other inhomogeneous layer', () => {
    /*
     * Upper limit — two whole paths in parallel, weighted by area:
     *   through the cavity: 0.13 + 0.05 + 0.17          + 0.129870129870 + 0.04
     *                     = 0.519870129870
     *   through a dab:      0.13 + 0.05 + 0.034883720930 + 0.129870129870 + 0.04
     *                     = 0.384753850800
     *   1/R'T = 0.8/0.519870129870 + 0.2/0.384753850800 = 2.058658726691
     *     R'T = 0.485753168816
     *
     * Lower limit — combine the bridged layer, then sum in series:
     *   1/R_cav = 0.8/0.17 + 0.2/0.034883720930 = 10.439215686275
     *     R_cav = 0.095792637115
     *   R''T  = 0.13 + 0.05 + 0.095792637115 + 0.129870129870 + 0.04
     *         = 0.445662766985
     *
     *   RT = (0.485753168816 + 0.445662766985) / 2 = 0.465707967900
     *   U  = 1 / 0.465707967900                    = 2.147268393342
     */
    expect(result.totalResistanceUpperLimitM2KPerW).toBeCloseTo(0.485753168816, 10);
    expect(result.totalResistanceLowerLimitM2KPerW).toBeCloseTo(0.445662766985, 10);
    expect(result.totalResistanceM2KPerW).toBeCloseTo(0.4657079679, 10);
    expect(result.uValueWPerM2K).toBeCloseTo(2.147268393342, 10);
  });

  it('stays inside the validity limit of the combined method', () => {
    // 0.485753168816 / 0.445662766985 = 1.0900, well under the 1.5 gate.
    expect(result.upperToLowerLimitRatio).toBeCloseTo(1.089957, 5);
    expect(result.uValueWPerM2K).not.toBeNull();
  });

  it('is warmer than the same cavity with no dabs in it', () => {
    // The dabs are a thermal bridge: 0.43 W/(m*K) through 15 mm beats 0.17 m2K/W of
    // still air, so bridging the cavity can only raise the U-value.
    const unbridged = calculateUValue(
      element([
        solid('pb', 'Plasterboard', 0.0125, PLASTERBOARD),
        cavity(),
        solid('brk', 'Brick', 0.1, BRICK),
      ]) as BuildingElement,
    );
    expect(unbridged.uValueWPerM2K).not.toBeNull();
    expect(result.uValueWPerM2K ?? 0).toBeGreaterThan(unbridged.uValueWPerM2K ?? 0);
  });
});

describe('the section resistances of a bridged cavity', () => {
  it('gives the air its layer resistance and the member its own conductivity', () => {
    const sections = layerSectionResistances(
      cavity({
        thicknessM: 0.022,
        bridging: {
          label: 'Timber batten',
          areaFraction: PLASTERBOARD_BATTEN_AREA_FRACTION,
          material: SOFTWOOD,
        },
      }),
      'horizontal',
    );
    // 22 mm wall cavity, interpolated between the 15 mm (0.17) and 25 mm (0.18)
    // entries: 0.17 + (7/10) * 0.01 = 0.177. BR 443 (2006) 4.7.2 quotes 0.18 for this
    // airspace, which is that figure to two decimals.
    expect(sections.unbridgedM2KPerW).toBeCloseTo(0.177, 10);
    // 0.022 / 0.13 = 0.169230769231
    expect(sections.bridgedM2KPerW).toBeCloseTo(0.169230769231, 10);
    expect(sections.bridgingAreaFraction).toBe(PLASTERBOARD_BATTEN_AREA_FRACTION);
  });

  it('leaves an unbridged cavity exactly as it was', () => {
    const sections = layerSectionResistances(cavity({ thicknessM: 0.025 }), 'horizontal');
    expect(sections.bridgedM2KPerW).toBeUndefined();
    expect(sections.bridgingAreaFraction).toBe(0);
    expect(sections.unbridgedM2KPerW).toBeCloseTo(0.18, 10);
  });
});

describe('the air layer / air void test', () => {
  it('passes a batten cavity, which BR 443 4.8.1 names as an air layer', () => {
    // 22 mm deep, 553 mm clear between 47 mm battens at 600 mm centres.
    // 22 < 55.3, so it is an air layer on width alone.
    const sections = layerSectionResistances(
      cavity({
        thicknessM: 0.022,
        bridging: {
          label: 'Timber batten',
          areaFraction: PLASTERBOARD_BATTEN_AREA_FRACTION,
          material: SOFTWOOD,
          clearWidthM: 0.553,
        },
      }),
      'horizontal',
    );
    expect(sections.warnings).toEqual([]);
  });

  it('warns where the pocket is too deep for its width', () => {
    // 100 mm deep with 200 mm clear: 100 is not less than 20, so it fails on width.
    const sections = layerSectionResistances(
      cavity({
        thicknessM: 0.1,
        bridging: {
          label: 'Timber stud',
          areaFraction: 0.15,
          material: SOFTWOOD,
          clearWidthM: 0.2,
        },
      }),
      'horizontal',
    );
    expect(sections.warnings.some((w) => w.message.includes('air void'))).toBe(true);
  });

  it('says nothing where no spacing was given, rather than guessing one', () => {
    const sections = layerSectionResistances(
      cavity({
        thicknessM: 0.1,
        bridging: { label: 'Timber stud', areaFraction: 0.15, material: SOFTWOOD },
      }),
      'horizontal',
    );
    expect(sections.warnings).toEqual([]);
  });
});
