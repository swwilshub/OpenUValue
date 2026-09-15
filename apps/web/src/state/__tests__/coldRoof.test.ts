import { describe, expect, it } from 'vitest';
import { calculateUValue, checkAgainstPartL } from '@openuvalue/engine';
import { coldRoofExample, partLKindForElement, toBuildingElement } from '../model.js';

/*
 * The example is a starting point people will trust, so its answer is worked out here by
 * hand rather than read off the tool.
 *
 * Build-up, inside to outside:
 *   Rsi                             0.10      (upward heat flow)
 *   12.5 mm plasterboard            0.0125 / 0.21  = 0.059524
 *   100 mm quilt between joists     0.100  / 0.035 = 2.857143
 *     ... or 47 mm softwood joist   0.100  / 0.13  = 0.769231
 *   200 mm quilt cross-laid over    0.200  / 0.035 = 5.714286
 *   Rse                             0.10      (a loft is still air, so Rse = Rsi)
 *
 * Timber fraction: 47 / 400 = 0.1175, plus BR 443's 0.01 for additional timbers = 0.1275.
 *
 * Upper limit, by section:
 *   insulation path  0.10 + 0.059524 + 2.857143 + 5.714286 + 0.10 = 8.830953
 *   joist path       0.10 + 0.059524 + 0.769231 + 5.714286 + 0.10 = 6.743041
 *   R'_T = 1 / (0.8725 / 8.830953 + 0.1275 / 6.743041)
 *        = 1 / (0.098800 + 0.018909) = 8.4956
 *
 * Lower limit, layer by layer. Only the bridged layer differs:
 *   R_eq = 1 / (0.8725 / 2.857143 + 0.1275 / 0.769231)
 *        = 1 / (0.305375 + 0.165750) = 2.122589
 *   R''_T = 0.10 + 0.059524 + 2.122589 + 5.714286 + 0.10 = 8.096399
 *
 * R_T = (8.4956 + 8.096399) / 2 = 8.2960, so U = 1 / 8.2960 = 0.1205 W/(m2*K).
 * R'_T / R''_T = 1.049, comfortably inside the 1.5 the combined method allows.
 */

describe('the cold roof example', () => {
  const result = calculateUValue(toBuildingElement(coldRoofExample()));

  it('is in scope for the combined method', () => {
    expect(result.uValueWPerM2K).not.toBeNull();
  });

  it('comes to 0.12 W/(m2*K)', () => {
    expect(result.uValueWPerM2K ?? 0).toBeCloseTo(0.1205, 3);
  });

  it('has the surface resistances a ceiling under a loft gets', () => {
    // Upward heat flow, and a loft is still air on the far side, so Rse takes Rsi's value.
    expect(result.rsiM2KPerW).toBeCloseTo(0.1, 10);
    expect(result.rseM2KPerW).toBeCloseTo(0.1, 10);
  });

  it('clears the Approved Document L limit for a new dwelling', () => {
    // Roof, new dwelling: 0.16 W/(m2*K). 0.1205 is well under it.
    const check = checkAgainstPartL(
      result.uValueWPerM2K ?? 1,
      partLKindForElement(coldRoofExample().elementKind),
    ).find((candidate) => candidate.context === 'new-dwelling');
    expect(check?.maximumUValueWPerM2K).toBeCloseTo(0.16, 10);
    expect(check?.meetsLimit).toBe(true);
  });

  it('bridges only the layer the joists are in', () => {
    const example = coldRoofExample();
    // 47 / 400 = 0.1175, plus BR 443's 0.01 additional-timber allowance.
    expect(example.layers[1]?.bridgedPercent).toBeCloseTo(12.75, 6);
    expect(example.layers[0]?.bridgedPercent).toBe(0);
    // The point of cross-laying: the 200 mm over the joists insulates the timber too.
    expect(example.layers[2]?.bridgedPercent).toBe(0);
  });
});
