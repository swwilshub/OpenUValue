/**
 * Wind-driven rain exposure, and what it means for filling a cavity.
 *
 * Approved Document C divides the UK into four zones by the amount of wind-driven rain a
 * wall catches, in litres per square metre per spell, the categories coming from
 * BS 8104 "Assessing exposure of walls to wind-driven rain". The boundaries are the ones
 * printed on the Approved Document's own figure, which is itself adapted from the BRE
 * report *Thermal Insulation: avoiding risks*.
 *
 * **No map here, on purpose.** The zone boundaries are a geographic dataset rather than a
 * table, and reproducing them badly would be worse than not reproducing them at all — a
 * wall a mile the wrong side of a line gets the wrong answer and nothing says so. The
 * Approved Document's own note is that "variation to the exposure shown on the map can
 * only be made by site-specific calculation using BS 8104", so the map was never the
 * final word either. The user picks their zone off the published map, which they can
 * read better than we can guess.
 *
 * TODO(verify): the per-zone construction table in Approved Document C — which wall
 * build-ups it accepts in which zone, and at what minimum cavity width. What is
 * implemented here is the zone boundaries and the one rule that is not in doubt, that
 * full fill is ruled out in the worst zone. VERIFY.md row V34.
 */

export type ExposureZoneId = 'sheltered' | 'moderate' | 'severe' | 'very-severe';

export interface ExposureZone {
  readonly id: ExposureZoneId;
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
 * The four zones, driest first. Boundaries from the Approved Document C figure:
 * sheltered under 33, moderate 33 to under 56.5, severe 56.5 to under 100, very severe
 * 100 or more.
 */
export const EXPOSURE_ZONES: readonly ExposureZone[] = [
  {
    id: 'sheltered',
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
    label: 'Severe',
    minLitresPerM2PerSpell: 56.5,
    maxLitresPerM2PerSpell: 100,
    rangeText: '56.5 to less than 100 litres/m² per spell',
    where: 'Western coasts, higher ground, much of Wales and Scotland.',
    cavityAdvice:
      'Full fill is restricted here. Approved Document C limits which wall constructions ' +
      'may be fully filled, and a rendered or clad outer leaf is often required rather ' +
      'than fair-faced masonry. Check the construction against the Approved Document ' +
      'rather than assuming.',
    rulesOutFullFill: false,
  },
  {
    id: 'very-severe',
    label: 'Very severe',
    minLitresPerM2PerSpell: 100,
    rangeText: '100 litres/m² per spell or more',
    where: 'Exposed western and northern coasts, the highest ground, the islands.',
    cavityAdvice:
      'Fair-faced masonry with a fully filled cavity is not accepted in this zone. The ' +
      'cavity has to stay clear, or the wall has to be protected by render, cladding ' +
      'or tile hanging, so that water crossing the cavity is not relied upon to be ' +
      'absent.',
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
