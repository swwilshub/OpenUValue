import { describe, expect, it } from 'vitest';
import {
  checkAgainstPartL,
  partLElementKindForDirection,
  partLLimits,
} from '../partL.js';

/**
 * The values are read straight from the published tables, so these tests are a check
 * that the transcription is right and that the comparison treats the limit as a maximum.
 */

describe('Approved Document L limiting U-values', () => {
  it('carries the new-dwelling limits (Table 4.1 / 3.1)', () => {
    const byKind = (kind: 'roof' | 'wall' | 'floor' | 'party-wall'): number | undefined =>
      partLLimits(kind).find((limit) => limit.context === 'new-dwelling')
        ?.maximumUValueWPerM2K;

    expect(byKind('roof')).toBe(0.16);
    expect(byKind('wall')).toBe(0.26);
    expect(byKind('floor')).toBe(0.18);
    expect(byKind('party-wall')).toBe(0.2);
  });

  it('carries the existing-dwelling limits (Table 4.2 / 3.2)', () => {
    const byKind = (kind: 'roof' | 'wall' | 'floor'): number | undefined =>
      partLLimits(kind).find(
        (limit) => limit.context === 'new-element-in-existing-dwelling',
      )?.maximumUValueWPerM2K;

    // A new element in an existing dwelling is held to a tighter standard than one in a
    // new dwelling for roofs and walls, and the same for floors.
    expect(byKind('roof')).toBe(0.15);
    expect(byKind('wall')).toBe(0.18);
    expect(byKind('floor')).toBe(0.18);
  });

  it('quotes column (b), the improved value, for renovated elements (Table 4.3 / 3.3)', () => {
    const byKind = (kind: 'roof' | 'wall' | 'floor'): number | undefined =>
      partLLimits(kind).find((limit) => limit.context === 'renovated-element')
        ?.maximumUValueWPerM2K;

    expect(byKind('roof')).toBe(0.16);
    // The weaker of the two wall rows: 0.55 by cavity insulation, against 0.30 by
    // internal or external insulation.
    expect(byKind('wall')).toBe(0.55);
    expect(byKind('floor')).toBe(0.25);
  });

  it('cites both editions on every limit', () => {
    for (const kind of ['roof', 'wall', 'floor', 'party-wall'] as const) {
      for (const limit of partLLimits(kind)) {
        expect(limit.citation).toContain('2021 edition');
        expect(limit.citation).toContain('2026 edition');
      }
    }
  });

  it('offers a party wall only under the new-dwelling table', () => {
    expect(partLLimits('party-wall').map((limit) => limit.context)).toEqual([
      'new-dwelling',
    ]);
  });
});

describe('checkAgainstPartL', () => {
  it('treats the limit as a maximum, so sitting exactly on it passes', () => {
    const onTheLimit = checkAgainstPartL(0.26, 'wall').find(
      (check) => check.context === 'new-dwelling',
    );
    expect(onTheLimit?.meetsLimit).toBe(true);
    expect(onTheLimit?.marginFraction).toBeCloseTo(0, 12);
  });

  it('fails a wall just over the new-dwelling limit', () => {
    const over = checkAgainstPartL(0.27, 'wall').find(
      (check) => check.context === 'new-dwelling',
    );
    expect(over?.meetsLimit).toBe(false);
    // (0.26 - 0.27) / 0.26 = -0.038461...
    expect(over?.marginFraction).toBeCloseTo(-0.0384615384615, 10);
  });

  it('reports the margin as a fraction of the limit', () => {
    // U = 0.13 against a 0.26 limit: (0.26 - 0.13) / 0.26 = 0.5
    const half = checkAgainstPartL(0.13, 'wall').find(
      (check) => check.context === 'new-dwelling',
    );
    expect(half?.meetsLimit).toBe(true);
    expect(half?.marginFraction).toBeCloseTo(0.5, 12);
  });

  it('can pass one context and fail another at the same U-value', () => {
    // 0.22 is under the 0.26 new-dwelling wall limit but over the 0.18 required of a
    // new wall in an existing dwelling. Which one applies is the user's to choose.
    const checks = checkAgainstPartL(0.22, 'wall');
    expect(checks.find((check) => check.context === 'new-dwelling')?.meetsLimit).toBe(true);
    expect(
      checks.find((check) => check.context === 'new-element-in-existing-dwelling')
        ?.meetsLimit,
    ).toBe(false);
  });
});

describe('partLElementKindForDirection', () => {
  it('maps heat flow direction to the regulatory element kind', () => {
    expect(partLElementKindForDirection('upward')).toBe('roof');
    expect(partLElementKindForDirection('horizontal')).toBe('wall');
    expect(partLElementKindForDirection('downward')).toBe('floor');
  });
});
