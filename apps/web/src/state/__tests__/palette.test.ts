import { describe, expect, it } from 'vitest';
import { MATERIALS } from '@openuvalue/materials';
import { CAVITY_PALETTE_ID, PALETTE_GROUPS, layerFromPalette, paletteItem } from '../palette.js';
import { layerFromMaterial, withLayerInserted } from '../model.js';

const allItems = PALETTE_GROUPS.flatMap((group) => group.items);

describe('the palette', () => {
  it('offers every material in the catalogue, and nothing else', () => {
    const paletteMaterials = allItems
      .filter((item) => item.id !== CAVITY_PALETTE_ID)
      .map((item) => item.id)
      .sort();
    const catalogue = MATERIALS.map((material) => material.id).sort();
    expect(paletteMaterials).toEqual(catalogue);
  });

  it('gives every chip a positive starting thickness and a short label', () => {
    for (const item of allItems) {
      expect(item.thicknessMm).toBeGreaterThan(0);
      expect(item.label.length).toBeGreaterThan(0);
      // A chip has to fit on a chip.
      expect(item.label.length).toBeLessThanOrEqual(22);
    }
  });

  it('has no duplicate ids', () => {
    const ids = allItems.map((item) => item.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('builds the same layer the list would build for a material', () => {
    const item = paletteItem('gypsum-plasterboard');
    expect(item?.thicknessMm).toBe(12.5);
    const fromPalette = layerFromPalette('gypsum-plasterboard');
    const fromList = layerFromMaterial('gypsum-plasterboard', 12.5);
    // The ids differ because each layer gets its own; everything else must match.
    expect({ ...fromPalette, id: '' }).toEqual({ ...fromList, id: '' });
  });

  it('builds an air layer for the cavity chip', () => {
    const cavity = layerFromPalette(CAVITY_PALETTE_ID);
    expect(cavity?.kind).toBe('air');
    expect(cavity?.thicknessMm).toBe(50);
  });

  it('returns nothing for an id that is not on the palette', () => {
    expect(layerFromPalette('not-a-material')).toBeUndefined();
  });
});

describe('withLayerInserted', () => {
  const board = layerFromMaterial('gypsum-plasterboard', 12.5);
  const brick = layerFromMaterial('brick-outer-leaf', 102.5);

  it('puts a layer in the gap it was given', () => {
    const next = withLayerInserted([board, brick], 1, layerFromMaterial('pir-board', 100));
    expect(next.map((layer) => layer.materialId)).toEqual([
      'gypsum-plasterboard',
      'pir-board',
      'brick-outer-leaf',
    ]);
  });

  it('clamps an index that is off either end rather than throwing', () => {
    expect(withLayerInserted([board], -5, brick)[0]?.materialId).toBe('brick-outer-leaf');
    expect(withLayerInserted([board], 99, brick)[1]?.materialId).toBe('brick-outer-leaf');
  });

  it('classifies a cavity from what it lands between', () => {
    // A gap between masonry and masonry is the unventilated masonry cavity, which the
    // guess names, so the layer arrives classified rather than blank.
    const cavity = layerFromPalette(CAVITY_PALETTE_ID);
    expect(cavity).toBeDefined();
    const next = withLayerInserted([board, brick], 1, cavity ?? board);
    const placed = next[1];
    expect(placed?.kind).toBe('air');
    expect(placed?.cavityPresetId).toBeDefined();
    expect(placed?.wasCavityGuessed).toBe(true);
  });

  it('leaves a solid layer exactly as it was handed over', () => {
    const pir = layerFromMaterial('pir-board', 100);
    const next = withLayerInserted([board, brick], 1, pir);
    expect(next[1]).toEqual(pir);
  });

  it('does not mutate the list it was given', () => {
    const before = [board, brick];
    withLayerInserted(before, 1, layerFromMaterial('pir-board', 100));
    expect(before).toHaveLength(2);
  });
});
