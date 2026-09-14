/**
 * Wind-driven rain exposure, and what it means for filling a cavity.
 *
 * Approved Document C (2013 edition, reprint August 2013) Diagram 12 divides the UK into
 * four numbered zones by the amount of wind-driven rain a wall catches, in litres per
 * square metre per spell. The figure's own key gives the boundaries used here and names
 * the quantity as the "maximum wall spell index derived from BS 8104", the code of
 * practice for assessing exposure of walls to wind-driven rain.
 *
 * Paragraph 5.15 makes the zone the gate on cavity insulation: a wall's suitability for
 * filling is settled either by Diagram 12 with Table 4, or by the calculation procedure
 * in the British and CEN standards.
 *
 * **The map is not shipped with this tool.** The zones are a geographic dataset rather
 * than a table, and the published figure is Crown copyright, free to download but not
 * free to republish. The app reads the zone off the user's own copy of Diagram 12 by the
 * shade under the pointer, which needs four colours rather than any geography. See
 * `apps/web/src/state/exposureColour.ts`.
 *
 * Paragraph 5.16 also modifies a zone read off the map, and those modifiers are the
 * user's to apply: add one where local conditions accentuate wind effects, such as an
 * open hillside or a valley funnelling wind onto the wall, and subtract one where the
 * wall does not face into the prevailing wind. BS 8104 itself overrides the map entirely.
 *
 * TODO(verify): Table 4, "Maximum recommended exposure zones for insulated masonry
 * walls", is not implemented. It gives the highest zone each construction may be used in,
 * across insulation method, minimum cavity width and external finish, and it is the part
 * that turns a zone into a verdict. What is implemented is the zone boundaries and the
 * advice that follows from reading Table 4's facing-masonry columns. VERIFY.md row V34.
 */

export type ExposureZoneId = 'sheltered' | 'moderate' | 'severe' | 'very-severe';

export interface ExposureZone {
  readonly id: ExposureZoneId;
  /** The zone number Diagram 12 and Table 4 use, 1 (sheltered) to 4 (very severe). */
  readonly number: 1 | 2 | 3 | 4;
  readonly label: string;
  /** Lower bound of the band, litres/m^2 per spell. */
  readonly minLitresPerM2PerSpell: number;
  /** Upper bound, exclusive. Undefined for the top band, which is open-ended. */
  readonly maxLitresPerM2PerSpell?: number;
  /** The band as the Approved Document prints it. */
  readonly rangeText: string;
  /** Where in the UK it typically falls, to help someone place themselves. */
  readonly where: string;
  /** What it means for filling a cavity. */
  readonly cavityAdvice: string;
  /** True where a fully filled cavity should not be used with fair-faced masonry. */
  readonly rulesOutFullFill: boolean;
}

/**
 * The four zones, driest first, with the boundaries printed in Diagram 12's own key:
 * 1 sheltered under 33, 2 moderate 33 to under 56.5, 3 severe 56.5 to under 100,
 * 4 very severe 100 or more litres/m² per spell.
 */
export const EXPOSURE_ZONES: readonly ExposureZone[] = [
  {
    id: 'sheltered',
    number: 1,
    label: 'Sheltered',
    minLitresPerM2PerSpell: 0,
    maxLitresPerM2PerSpell: 33,
    rangeText: 'less than 33 litres/m² per spell',
    where: 'Inland and low-lying, much of central and eastern England.',
    cavityAdvice:
      'Full fill is ordinarily acceptable here, subject to the insulation being suitable ' +
      'for the purpose and properly installed.',
    rulesOutFullFill: false,
  },
  {
    id: 'moderate',
    number: 2,
    label: 'Moderate',
    minLitresPerM2PerSpell: 33,
    maxLitresPerM2PerSpell: 56.5,
    rangeText: '33 to less than 56.5 litres/m² per spell',
    where: 'Much of the English midlands and the drier parts of the north.',
    cavityAdvice:
      'Full fill is ordinarily acceptable, with attention to workmanship: mortar droppings ' +
      'and badly fitted batts are what carry water across a cavity.',
    rulesOutFullFill: false,
  },
  {
    id: 'severe',
    number: 3,
    label: 'Severe',
    minLitresPerM2PerSpell: 56.5,
    maxLitresPerM2PerSpell: 100,
    rangeText: '56.5 to less than 100 litres/m² per spell',
    where: 'Western coasts, higher ground, much of Wales and Scotland.',
    cavityAdvice:
      'Full fill is restricted here. Approved Document C Table 4 caps facing masonry ' +
      'with a built-in full fill at zone 2 for a 50 mm cavity and zone 3 for 75 mm or ' +
      'wider, and caps recessed mortar joints at zone 1 whatever the width. A rendered ' +
      'or clad outer leaf reaches this zone comfortably. Check the construction against ' +
      'Table 4 rather than assuming.',
    rulesOutFullFill: false,
  },
  {
    id: 'very-severe',
    number: 4,
    label: 'Very severe',
    minLitresPerM2PerSpell: 100,
    rangeText: '100 litres/m² per spell or more',
    where: 'Exposed western and northern coasts, the highest ground, the islands.',
    cavityAdvice:
      'Approved Document C Table 4 accepts no facing masonry with a fully filled cavity ' +
      'in this zone at any cavity width. The cavity has to stay clear, or the wall has ' +
      'to be protected by impervious cladding, render or tile hanging, so that water ' +
      'crossing the cavity is not relied upon to be absent.',
    rulesOutFullFill: true,
  },
];

export function exposureZone(id: ExposureZoneId): ExposureZone | undefined {
  return EXPOSURE_ZONES.find((zone) => zone.id === id);
}

/**
 * Which zone a measured or calculated exposure falls in, for a user who has done the
 * BS 8104 site-specific calculation rather than reading a zone off the map.
 */
export function exposureZoneForSpellIndex(litresPerM2PerSpell: number): ExposureZone {
  const zone = EXPOSURE_ZONES.find(
    (candidate) =>
      litresPerM2PerSpell >= candidate.minLitresPerM2PerSpell &&
      (candidate.maxLitresPerM2PerSpell === undefined ||
        litresPerM2PerSpell < candidate.maxLitresPerM2PerSpell),
  );
  // The bands are contiguous from zero upwards with an open top, so this cannot miss;
  // the fallback is here so the return type needs no null check at every call site.
  return zone ?? EXPOSURE_ZONES[EXPOSURE_ZONES.length - 1]!;
}
