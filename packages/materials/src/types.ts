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
 * Where the values in a record come from. Either a real table reference, or the
 * literal string 'TODO(verify)'. A plausible-looking but unconfirmed citation is
 * worse than an admitted gap, so there is no third option.
 */
export const UNVERIFIED_SOURCE = 'TODO(verify)' as const;

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
  /** A table reference, or 'TODO(verify)'. */
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
