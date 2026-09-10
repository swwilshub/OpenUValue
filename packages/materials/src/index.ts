/**
 * @openuvalue/materials - generic UK building material data with validation.
 *
 * Data only: no calculation logic lives here. Every record's `source` is either a
 * table reference or the literal string 'TODO(verify)', and every 'TODO(verify)'
 * record is listed in VERIFY.md at the repository root.
 */
export * from './types.js';
export * from './validate.js';
export * from './catalogue.js';
