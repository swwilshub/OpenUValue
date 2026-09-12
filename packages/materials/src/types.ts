/**
 * A material record. Property names carry their units, matching the convention in
 * @openuvalue/engine, so a record can be handed to the engine without translation.
 */
export type MaterialCategory =
  | 'masonry'
  | 'concrete'
  | 'timber-and-board'
  | 'insulation'
  | 'plaster-and-render'
  | 'screed'
  | 'membrane'
  | 'covering';

export const MATERIAL_CATEGORIES: readonly MaterialCategory[] = [
  'masonry',
  'concrete',
  'timber-and-board',
  'insulation',
  'plaster-and-render',
  'screed',
  'membrane',
  'covering',
];

/**
 * Where the values in a record come from. A plausible-looking but unconfirmed citation
 * is worse than an admitted gap, so a value is never dressed up as something it is not.
 * Three states, and each says a different thing:
 *
 *   a real reference   read from the named standard at the named clause.
 *   'TODO(verify)'     not attributed at all. A placeholder.
 *   'EVIDENCED'        the conventional value for the material, agreeing across
 *                      independent public sources, but **not read from the standard
 *                      that governs it**.
 *
 * EVIDENCED exists because the middle ground was being hidden. A value that every
 * public source agrees on is not a guess, and filing it with the unattributed
 * placeholders says less than is actually known about it. Equally it is not a citation:
 * nobody here has opened the clause. So it is recorded for what it is - an assumption
 * we expect to hold, pending sight of the standard - and it is marked on screen.
 *
 * **The bar.** EVIDENCED is good enough to model with and not good enough to submit.
 * It never licenses inventing a number, and it is not a way to retire a VERIFY.md row:
 * an evidenced value stays on the list until someone reads the clause and either
 * confirms it or corrects it.
 */
export const UNVERIFIED_SOURCE = 'TODO(verify)' as const;

/**
 * Marks one property within a source string as evidenced rather than cited, in the same
 * per-property style as the rest of the field: "mu: EVIDENCED - ...".
 */
export const EVIDENCED_MARKER = 'EVIDENCED' as const;

export interface MaterialRecord {
  readonly id: string;
  readonly name: string;
  readonly category: MaterialCategory;
  /** Design thermal conductivity lambda, W/(m*K). */
  readonly lambdaWPerMK: number;
  /** Density rho, kg/m^3. */
  readonly densityKgPerM3: number;
  /** Specific heat capacity c, J/(kg*K). */
  readonly specificHeatCapacityJPerKgK: number;
  /** Water vapour resistance factor mu, dimensionless and never below 1. */
  readonly vapourResistanceFactorMu: number;
  /**
   * Per-property provenance: a table reference, 'TODO(verify)', or 'EVIDENCED'.
   * See the three states above.
   */
  readonly source: string;
  /** What to check, and against which authority, when source is 'TODO(verify)'. */
  readonly notes?: string;
}

export interface MaterialDatabase {
  readonly schemaVersion: number;
  readonly materials: readonly MaterialRecord[];
}

/** The engine's MaterialProperties shape, without importing the engine. */
export interface EngineMaterialProperties {
  readonly lambdaWPerMK: number;
  readonly densityKgPerM3: number;
  readonly specificHeatCapacityJPerKgK: number;
  readonly vapourResistanceFactorMu: number;
}
