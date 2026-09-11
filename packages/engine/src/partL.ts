import type { HeatFlowDirection } from './types.js';
import type { WattsPerSquareMetreKelvin } from './units.js';

/**
 * Limiting U-values from Approved Document L, Volume 1: Dwellings — the regulatory
 * benchmark a calculated U-value is usually judged against in England.
 *
 * **England only.** Approved Documents are guidance to the Building Regulations 2010,
 * which apply in England. Wales, Scotland (Section 6 of the Technical Handbooks) and
 * Northern Ireland (Technical Booklet F) set their own standards and are not covered
 * here. Volume 1 covers dwellings; Volume 2 covers buildings other than dwellings and
 * is not reproduced here either.
 *
 * The figures below are common to two published editions, which is why they can be
 * stated with confidence:
 *
 *   - 2021 edition incorporating 2023 amendments, Tables 4.1, 4.2 and 4.3;
 *   - 2026 edition, Tables 3.1, 3.2 and 3.3.
 *
 * The table numbering moved between the two editions but every U-value here is
 * identical in both, so each entry cites both locations. Which edition applies to a
 * given project depends on when the work is subject to — that is a question about the
 * project, not about the construction, so this module reports the limit and leaves the
 * choice of edition to the user.
 *
 * A limiting U-value is a maximum, not a target. Both editions say so directly: the
 * 2021 edition notes under Table 4.1 that meeting the Target Fabric Energy Efficiency
 * Rate will need some elements to be significantly better than the limiting standards.
 * Passing the limit is therefore the floor, not a good result, and the UI should not
 * present it as one.
 *
 * All values are area-weighted averages over the element type (note 1 to each table),
 * so a single build-up meeting the limit does not by itself demonstrate compliance for
 * the whole element.
 */

export type PartLElementKind = 'roof' | 'wall' | 'floor' | 'party-wall';

export type PartLContext =
  /** A new element in a new dwelling. 2021 Table 4.1 / 2026 Table 3.1. */
  | 'new-dwelling'
  /** A new or replacement element in an existing dwelling. 2021 Table 4.2 / 2026 Table 3.2. */
  | 'new-element-in-existing-dwelling'
  /**
   * An existing element being renovated: (b) the improved U-value it should achieve.
   * 2021 Table 4.3 / 2026 Table 3.3.
   */
  | 'renovated-element';

export interface PartLLimit {
  readonly context: PartLContext;
  /** What this limit applies to, in the words of the tables. */
  readonly label: string;
  readonly maximumUValueWPerM2K: WattsPerSquareMetreKelvin;
  /** Where the figure comes from, for display beside it. */
  readonly citation: string;
}

const TABLE_4_1 = 'Approved Document L Vol 1, Table 4.1 (2021 edition) / Table 3.1 (2026 edition)';
const TABLE_4_2 = 'Approved Document L Vol 1, Table 4.2 (2021 edition) / Table 3.2 (2026 edition)';
const TABLE_4_3 = 'Approved Document L Vol 1, Table 4.3 (2021 edition) / Table 3.3 (2026 edition)';

/**
 * Every limit that applies to an opaque element of each kind, in the order a build-up is
 * most likely to be judged against: new build first, then work to an existing dwelling.
 *
 * The renovation tables give a threshold column (a) and an improved column (b). Only
 * column (b) appears here, because (a) is the trigger for having to do the work rather
 * than a standard the finished element has to meet.
 *
 * Windows, doors, rooflights and swimming pool basins are in the tables too but not
 * here: they are not layered opaque constructions and this engine does not calculate
 * them.
 */
const LIMITS: Readonly<Record<PartLElementKind, readonly PartLLimit[]>> = {
  roof: [
    {
      context: 'new-dwelling',
      label: 'New dwelling, all roof types',
      maximumUValueWPerM2K: 0.16,
      citation: TABLE_4_1,
    },
    {
      context: 'new-element-in-existing-dwelling',
      label: 'New or replacement roof in an existing dwelling',
      maximumUValueWPerM2K: 0.15,
      citation: TABLE_4_2,
    },
    {
      context: 'renovated-element',
      label: 'Renovated roof, improved value',
      maximumUValueWPerM2K: 0.16,
      citation: TABLE_4_3,
    },
  ],
  wall: [
    {
      context: 'new-dwelling',
      label: 'New dwelling, wall',
      maximumUValueWPerM2K: 0.26,
      citation: TABLE_4_1,
    },
    {
      context: 'new-element-in-existing-dwelling',
      label: 'New or replacement wall in an existing dwelling',
      maximumUValueWPerM2K: 0.18,
      citation: TABLE_4_2,
    },
    {
      // The tables split renovated walls by how they are insulated, because a filled
      // cavity cannot reach what internal or external insulation can. The weaker of the
      // two is quoted here so the check is not stricter than the rules; the other is
      // 0.30 for internal or external insulation.
      context: 'renovated-element',
      label: 'Renovated wall, improved value (cavity insulation)',
      maximumUValueWPerM2K: 0.55,
      citation: TABLE_4_3,
    },
  ],
  floor: [
    {
      context: 'new-dwelling',
      label: 'New dwelling, floor',
      maximumUValueWPerM2K: 0.18,
      citation: TABLE_4_1,
    },
    {
      context: 'new-element-in-existing-dwelling',
      label: 'New or replacement floor in an existing dwelling',
      maximumUValueWPerM2K: 0.18,
      citation: TABLE_4_2,
    },
    {
      context: 'renovated-element',
      label: 'Renovated floor, improved value',
      maximumUValueWPerM2K: 0.25,
      citation: TABLE_4_3,
    },
  ],
  'party-wall': [
    {
      // A party wall appears only in the new-dwelling table.
      context: 'new-dwelling',
      label: 'New dwelling, party wall',
      maximumUValueWPerM2K: 0.2,
      citation: TABLE_4_1,
    },
  ],
};

export function partLLimits(kind: PartLElementKind): readonly PartLLimit[] {
  return LIMITS[kind];
}

/**
 * The element kind the limiting tables would use for a given heat flow direction.
 *
 * BS EN ISO 6946 classes heat flow within 30 degrees of horizontal as horizontal, so a
 * steeply pitched roof shares a wall's surface resistances — but Approved Document L
 * judges it as a roof. This maps to the regulatory categories, not the thermal ones, so
 * a pitched roof modelled with horizontal heat flow must be passed as 'roof' explicitly
 * rather than taken from its direction. A party wall has no heat flow direction to
 * infer it from either.
 */
export function partLElementKindForDirection(direction: HeatFlowDirection): PartLElementKind {
  switch (direction) {
    case 'upward':
      return 'roof';
    case 'downward':
      return 'floor';
    case 'horizontal':
      return 'wall';
  }
}

export interface PartLCheck extends PartLLimit {
  /** True where the calculated U-value is at or below the limit. */
  readonly meetsLimit: boolean;
  /**
   * How far below the limit, as a fraction of it: 0 sits exactly on the limit, 0.5 is
   * half the limit, and a negative value is over it. Useful for drawing a scale; not a
   * quantity from the standard.
   */
  readonly marginFraction: number;
}

/**
 * Compare a calculated U-value against each limit that applies.
 *
 * "At or below" is the test: the tables give a maximum U-value, so equality passes.
 * No verdict beyond that is offered, because the Approved Document defines none — there
 * is no published scale running from poor to excellent, and inventing one would dress a
 * made-up threshold as a regulatory judgement.
 */
export function checkAgainstPartL(
  uValueWPerM2K: WattsPerSquareMetreKelvin,
  kind: PartLElementKind,
): readonly PartLCheck[] {
  return partLLimits(kind).map((limit) => ({
    ...limit,
    meetsLimit: uValueWPerM2K <= limit.maximumUValueWPerM2K,
    marginFraction:
      (limit.maximumUValueWPerM2K - uValueWPerM2K) / limit.maximumUValueWPerM2K,
  }));
}
