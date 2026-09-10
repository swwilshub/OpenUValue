import {
  MATERIAL_CATEGORIES,
  type MaterialCategory,
  type MaterialDatabase,
  type MaterialRecord,
} from './types.js';

/**
 * A hand-rolled validator rather than a schema library, so this package keeps zero
 * runtime dependencies like the engine. schema/material.schema.json expresses the
 * same rules in JSON Schema for tooling outside this repository; the two must be
 * kept in step, and the tests check the rules stated here.
 */
export interface ValidationIssue {
  /** Dotted path to the offending value, e.g. 'materials[3].lambdaWPerMK'. */
  readonly path: string;
  readonly message: string;
}

export class MaterialValidationError extends Error {
  public readonly issues: readonly ValidationIssue[];

  public constructor(issues: readonly ValidationIssue[]) {
    super(
      `material database is invalid:\n${issues
        .map((issue) => `  ${issue.path}: ${issue.message}`)
        .join('\n')}`,
    );
    this.name = 'MaterialValidationError';
    this.issues = issues;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const ID_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

const NUMERIC_FIELDS: readonly {
  readonly key: keyof MaterialRecord;
  readonly minimum: number;
  readonly minimumIsInclusive: boolean;
  readonly why: string;
}[] = [
  {
    key: 'lambdaWPerMK',
    minimum: 0,
    minimumIsInclusive: false,
    why: 'a zero or negative conductivity has no physical meaning',
  },
  {
    key: 'densityKgPerM3',
    minimum: 0,
    minimumIsInclusive: false,
    why: 'a zero or negative density has no physical meaning',
  },
  {
    key: 'specificHeatCapacityJPerKgK',
    minimum: 0,
    minimumIsInclusive: false,
    why: 'a zero or negative heat capacity has no physical meaning',
  },
  {
    key: 'vapourResistanceFactorMu',
    minimum: 1,
    minimumIsInclusive: true,
    why: 'mu is measured relative to air, whose value is 1, so nothing can be below it',
  },
];

function validateMaterial(value: unknown, path: string): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (!isRecord(value)) {
    return [{ path, message: 'expected an object' }];
  }

  const id = value['id'];
  if (typeof id !== 'string' || !ID_PATTERN.test(id)) {
    issues.push({
      path: `${path}.id`,
      message: 'expected a lower-case kebab-case identifier',
    });
  }

  const name = value['name'];
  if (typeof name !== 'string' || name.trim().length === 0) {
    issues.push({ path: `${path}.name`, message: 'expected a non-empty string' });
  }

  const category = value['category'];
  if (
    typeof category !== 'string' ||
    !MATERIAL_CATEGORIES.includes(category as MaterialCategory)
  ) {
    issues.push({
      path: `${path}.category`,
      message: `expected one of: ${MATERIAL_CATEGORIES.join(', ')}`,
    });
  }

  for (const field of NUMERIC_FIELDS) {
    const raw = value[field.key];
    if (typeof raw !== 'number' || !Number.isFinite(raw)) {
      issues.push({ path: `${path}.${field.key}`, message: 'expected a finite number' });
      continue;
    }
    const isBelow = field.minimumIsInclusive ? raw < field.minimum : raw <= field.minimum;
    if (isBelow) {
      issues.push({
        path: `${path}.${field.key}`,
        message: `must be ${field.minimumIsInclusive ? 'at least' : 'greater than'} ${
          field.minimum
        }: ${field.why}`,
      });
    }
  }

  const source = value['source'];
  if (typeof source !== 'string' || source.trim().length === 0) {
    issues.push({
      path: `${path}.source`,
      message: "expected a table reference, or the literal string 'TODO(verify)'",
    });
  }

  const notes = value['notes'];
  if (notes !== undefined && typeof notes !== 'string') {
    issues.push({ path: `${path}.notes`, message: 'expected a string when present' });
  }

  const allowedKeys = new Set([
    'id',
    'name',
    'category',
    'source',
    'notes',
    ...NUMERIC_FIELDS.map((field) => String(field.key)),
  ]);
  for (const key of Object.keys(value)) {
    if (!allowedKeys.has(key)) {
      issues.push({ path: `${path}.${key}`, message: 'unrecognised property' });
    }
  }

  return issues;
}

/** Validate a parsed database, returning every issue found rather than the first. */
export function validateMaterialDatabase(value: unknown): readonly ValidationIssue[] {
  if (!isRecord(value)) {
    return [{ path: '', message: 'expected an object' }];
  }
  const issues: ValidationIssue[] = [];

  if (value['schemaVersion'] !== 1) {
    issues.push({ path: 'schemaVersion', message: 'expected 1' });
  }

  const materials = value['materials'];
  if (!Array.isArray(materials)) {
    issues.push({ path: 'materials', message: 'expected an array' });
    return issues;
  }
  if (materials.length === 0) {
    issues.push({ path: 'materials', message: 'expected at least one material' });
  }

  const seenIds = new Set<string>();
  materials.forEach((material, index) => {
    const path = `materials[${index}]`;
    issues.push(...validateMaterial(material, path));
    if (isRecord(material)) {
      const id = material['id'];
      if (typeof id === 'string') {
        if (seenIds.has(id)) {
          issues.push({ path: `${path}.id`, message: `duplicate id '${id}'` });
        }
        seenIds.add(id);
      }
    }
  });

  return issues;
}

/** Validate and narrow, throwing MaterialValidationError on any issue. */
export function parseMaterialDatabase(value: unknown): MaterialDatabase {
  const issues = validateMaterialDatabase(value);
  if (issues.length > 0) {
    throw new MaterialValidationError(issues);
  }
  return value as MaterialDatabase;
}
