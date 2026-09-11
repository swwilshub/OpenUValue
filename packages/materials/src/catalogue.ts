import rawDatabase from '../data/materials.json' with { type: 'json' };
import {
  UNVERIFIED_SOURCE,
  type EngineMaterialProperties,
  type MaterialCategory,
  type MaterialDatabase,
  type MaterialRecord,
} from './types.js';
import { parseMaterialDatabase } from './validate.js';

/**
 * The seeded database, validated at module load. A malformed data file is a build
 * error rather than something to discover at runtime in the browser.
 */
export const MATERIAL_DATABASE: MaterialDatabase = parseMaterialDatabase(rawDatabase);

export const MATERIALS: readonly MaterialRecord[] = MATERIAL_DATABASE.materials;

const BY_ID = new Map(MATERIALS.map((material) => [material.id, material]));

export function findMaterialById(id: string): MaterialRecord | undefined {
  return BY_ID.get(id);
}

export function materialsByCategory(category: MaterialCategory): readonly MaterialRecord[] {
  return MATERIALS.filter((material) => material.category === category);
}

/** Ids whose values still need checking against a printed standard. */
export function unverifiedMaterialIds(): readonly string[] {
  return MATERIALS.filter((material) => material.source === UNVERIFIED_SOURCE).map(
    (material) => material.id,
  );
}

/**
 * Project a record onto the shape @openuvalue/engine expects. The property names
 * already match, so this is a narrowing rather than a translation - which is the
 * point of naming units the same way in both packages.
 */
export function toEngineMaterial(material: MaterialRecord): EngineMaterialProperties {
  return {
    lambdaWPerMK: material.lambdaWPerMK,
    densityKgPerM3: material.densityKgPerM3,
    specificHeatCapacityJPerKgK: material.specificHeatCapacityJPerKgK,
    vapourResistanceFactorMu: material.vapourResistanceFactorMu,
  };
}

/**
 * How far a material's values have been traced to a published source.
 *
 * The database rule (see CLAUDE.md) is that an unattributable value carries
 * "TODO(verify)" rather than a plausible-looking reference. That honesty is only
 * useful if it reaches the screen, so this classifies each record for the UI:
 *
 *   'cited'   every value in the record names the clause it came from
 *   'partial' some values are cited and some are still open, with the source string
 *             saying which
 *   'open'    nothing is attributed yet
 */
export type SourceStatus = 'cited' | 'partial' | 'open';

export function sourceStatus(material: MaterialRecord): SourceStatus {
  if (material.source === 'TODO(verify)') {
    return 'open';
  }
  return material.source.includes('TODO(verify)') ? 'partial' : 'cited';
}
