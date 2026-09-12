import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  MATERIALS,
  MATERIAL_DATABASE,
  findMaterialById,
  materialsByCategory,
  sourceStatus,
  toEngineMaterial,
  unverifiedMaterialIds,
} from '../catalogue.js';
import { EVIDENCED_MARKER, MATERIAL_CATEGORIES, UNVERIFIED_SOURCE } from '../types.js';
import {
  MaterialValidationError,
  parseMaterialDatabase,
  validateMaterialDatabase,
} from '../validate.js';

const VALID_RECORD = {
  id: 'test-material',
  name: 'Test material',
  category: 'insulation',
  lambdaWPerMK: 0.035,
  densityKgPerM3: 20,
  specificHeatCapacityJPerKgK: 1030,
  vapourResistanceFactorMu: 1,
  source: UNVERIFIED_SOURCE,
};

const withRecord = (overrides: Record<string, unknown>) => ({
  schemaVersion: 1,
  materials: [{ ...VALID_RECORD, ...overrides }],
});

describe('the seeded database', () => {
  it('validates, and holds at least 15 materials with unique ids', () => {
    expect(validateMaterialDatabase(MATERIAL_DATABASE)).toEqual([]);
    expect(MATERIALS.length).toBeGreaterThanOrEqual(15);
    expect(new Set(MATERIALS.map((material) => material.id)).size).toBe(MATERIALS.length);
  });

  it('covers every declared category', () => {
    for (const category of MATERIAL_CATEGORIES) {
      expect(materialsByCategory(category).length).toBeGreaterThan(0);
    }
  });

  it('looks a material up by id', () => {
    expect(findMaterialById('softwood-structural')?.lambdaWPerMK).toBe(0.13);
    expect(findMaterialById('no-such-material')).toBeUndefined();
  });
});

describe('provenance', () => {
  it('gives every record a reference, TODO(verify), or a marked assumption', () => {
    // Three states, and no fourth: a record may not carry a vague or invented citation.
    // EVIDENCED is not a loophole for one - it still has to name the standard it has
    // *not* been read from, so the claim it makes stays checkable.
    for (const material of MATERIALS) {
      expect(material.source.length).toBeGreaterThan(0);
      if (material.source !== UNVERIFIED_SOURCE) {
        // A real citation must name a standard, not just say "standard values".
        expect(material.source).toMatch(/\b(BS|EN|ISO|BR|DIN|CIBSE)\b/);
      }
    }
  });

  it('says of every evidenced value which standard would settle it', () => {
    for (const material of MATERIALS) {
      if (!material.source.includes(EVIDENCED_MARKER)) {
        continue;
      }
      // The point of the state is that it admits what it has not done. A marker with
      // no standard behind it would be an unattributed number wearing a label.
      const [, ...afterMarker] = material.source.split(EVIDENCED_MARKER);
      expect(afterMarker.join(EVIDENCED_MARKER)).toMatch(/\b(BS|EN|ISO|BR|DIN|CIBSE)\b/);
      expect(material.source).toMatch(/not read from|not yet read/i);
    }
  });

  it('ranks provenance worst-first', () => {
    // A record with an open value and an evidenced one is 'partial': the weakest value
    // in it is the one a reader needs to be told about.
    for (const material of MATERIALS) {
      const status = sourceStatus(material);
      if (material.source === UNVERIFIED_SOURCE) {
        expect(status).toBe('open');
      } else if (material.source.includes(UNVERIFIED_SOURCE)) {
        expect(status).toBe('partial');
      } else if (material.source.includes(EVIDENCED_MARKER)) {
        expect(status).toBe('evidenced');
      } else {
        expect(status).toBe('cited');
      }
    }
  });

  it('does not let an evidenced record count as cited', () => {
    // The failure this guards against is an evidenced value quietly dropping off the
    // list in VERIFY.md because everything else in its record gained a citation.
    const evidenced = MATERIALS.filter((material) => sourceStatus(material) === 'evidenced');
    expect(evidenced.length).toBeGreaterThan(0);
    const listed = unverifiedMaterialIds();
    for (const material of evidenced) {
      expect(listed).toContain(material.id);
    }
  });

  it('gives every unverified record a note saying what to check', () => {
    for (const material of MATERIALS) {
      if (material.source === UNVERIFIED_SOURCE) {
        expect(material.notes ?? '').not.toBe('');
      }
    }
  });

  it('lists every unverified id in VERIFY.md', () => {
    // The point of VERIFY.md is that nothing can quietly stay unattributed: if a
    // record is marked TODO(verify) and does not appear in VERIFY.md, this fails.
    const verifyPath = fileURLToPath(new URL('../../../../VERIFY.md', import.meta.url));
    const verify = readFileSync(verifyPath, 'utf-8');
    const missing = unverifiedMaterialIds().filter((id) => !verify.includes(id));
    expect(missing).toEqual([]);
  });
});

describe('validateMaterialDatabase', () => {
  it('accepts a well-formed database', () => {
    expect(validateMaterialDatabase(withRecord({}))).toEqual([]);
  });

  it('rejects a wrong schema version', () => {
    expect(
      validateMaterialDatabase({ ...withRecord({}), schemaVersion: 2 }).map((i) => i.path),
    ).toContain('schemaVersion');
  });

  it('names the offending field for each class of malformed record', () => {
    const cases: readonly { readonly overrides: Record<string, unknown>; readonly path: string }[] =
      [
        { overrides: { id: 'Not Kebab Case' }, path: 'materials[0].id' },
        { overrides: { name: '' }, path: 'materials[0].name' },
        { overrides: { category: 'unicorn' }, path: 'materials[0].category' },
        { overrides: { lambdaWPerMK: 0 }, path: 'materials[0].lambdaWPerMK' },
        { overrides: { lambdaWPerMK: -0.1 }, path: 'materials[0].lambdaWPerMK' },
        { overrides: { lambdaWPerMK: 'warm' }, path: 'materials[0].lambdaWPerMK' },
        { overrides: { densityKgPerM3: 0 }, path: 'materials[0].densityKgPerM3' },
        { overrides: { specificHeatCapacityJPerKgK: -1 }, path: 'materials[0].specificHeatCapacityJPerKgK' },
        // mu is measured against air, whose value is 1, so 0.5 is unphysical.
        { overrides: { vapourResistanceFactorMu: 0.5 }, path: 'materials[0].vapourResistanceFactorMu' },
        { overrides: { source: '' }, path: 'materials[0].source' },
        { overrides: { notes: 42 }, path: 'materials[0].notes' },
        { overrides: { extraneous: true }, path: 'materials[0].extraneous' },
      ];
    for (const testCase of cases) {
      const issues = validateMaterialDatabase(withRecord(testCase.overrides));
      expect(issues.map((issue) => issue.path)).toContain(testCase.path);
    }
  });

  it('reports a missing required field', () => {
    const { lambdaWPerMK: _omitted, ...withoutLambda } = VALID_RECORD;
    const issues = validateMaterialDatabase({ schemaVersion: 1, materials: [withoutLambda] });
    expect(issues.map((issue) => issue.path)).toContain('materials[0].lambdaWPerMK');
  });

  it('reports duplicate ids', () => {
    const issues = validateMaterialDatabase({
      schemaVersion: 1,
      materials: [VALID_RECORD, VALID_RECORD],
    });
    expect(issues.map((issue) => issue.message).join(' ')).toContain('duplicate id');
  });

  it('collects every issue rather than stopping at the first', () => {
    const issues = validateMaterialDatabase(
      withRecord({ id: 'Bad Id', lambdaWPerMK: -1, source: '' }),
    );
    expect(issues.length).toBeGreaterThanOrEqual(3);
  });

  it('rejects non-objects and a missing materials array', () => {
    expect(validateMaterialDatabase(null).length).toBeGreaterThan(0);
    expect(validateMaterialDatabase({ schemaVersion: 1 }).map((i) => i.path)).toContain(
      'materials',
    );
    expect(
      validateMaterialDatabase({ schemaVersion: 1, materials: [] }).map((i) => i.path),
    ).toContain('materials');
  });
});

describe('parseMaterialDatabase', () => {
  it('throws with every issue attached', () => {
    try {
      parseMaterialDatabase(withRecord({ lambdaWPerMK: -1 }));
      expect.unreachable('should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(MaterialValidationError);
      expect((error as MaterialValidationError).issues.length).toBeGreaterThan(0);
    }
  });
});

describe('toEngineMaterial', () => {
  it('produces exactly the four properties the engine reads', () => {
    // The property names already match the engine's MaterialProperties, so this is a
    // narrowing rather than a unit translation.
    const material = findMaterialById('mineral-wool-quilt');
    expect(material).toBeDefined();
    if (material === undefined) {
      return;
    }
    expect(toEngineMaterial(material)).toEqual({
      lambdaWPerMK: 0.035,
      densityKgPerM3: 20,
      // BR 443 (2019) 16, "Mineral wool, expanded and extruded polystyrene".
      specificHeatCapacityJPerKgK: 1450,
      vapourResistanceFactorMu: 1,
    });
  });

  it('gives every seeded material a positive lambda the engine can divide by', () => {
    for (const material of MATERIALS) {
      expect(toEngineMaterial(material).lambdaWPerMK).toBeGreaterThan(0);
    }
  });
});
