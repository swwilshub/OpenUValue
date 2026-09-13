import { describe, expect, it } from 'vitest';
import { blankAirLayer, blankSolidLayer, guessCavityPreset } from '../model.js';
import type { UiLayer } from '../model.js';

function solid(materialId: string | null): UiLayer {
  return { ...blankSolidLayer(), materialId, label: materialId ?? 'custom' };
}

/**
 * The guess reads the two neighbours and nothing else, so each case here is the smallest
 * build-up that puts the right pair either side of the cavity.
 */
describe('guessing a cavity from what is either side of it', () => {
  it('calls a gap with nothing outboard of it ventilated', () => {
    const layers = [solid('gypsum-plasterboard'), blankAirLayer()];
    expect(guessCavityPreset(layers, 1)?.id).toBe('well-ventilated-rainscreen');
  });

  it('calls a gap behind hanging tiles ventilated', () => {
    const layers = [solid('brick-inner-leaf'), blankAirLayer(), solid('clay-roof-tile')];
    expect(guessCavityPreset(layers, 1)?.id).toBe('well-ventilated-rainscreen');
  });

  it('calls a gap in front of insulation the residual gap of a partial fill', () => {
    const layers = [
      solid('gypsum-plasterboard'),
      solid('aircrete-block'),
      solid('eps-board'),
      blankAirLayer(),
      solid('brick-outer-leaf'),
    ];
    expect(guessCavityPreset(layers, 3)?.id).toBe('partial-fill-residual');
  });

  it('spots that a foil-faced board makes the same gap reflective', () => {
    /*
     * The one guess that changes a number rather than a label: a foil looking into the
     * cavity roughly doubles its resistance, 0.44 against 0.18 in a wall. So it keys off
     * the material rather than the category, PIR being the foil-faced board here.
     */
    const layers = [
      solid('gypsum-plasterboard'),
      solid('aircrete-block'),
      solid('pir-board'),
      blankAirLayer(),
      solid('brick-outer-leaf'),
    ];
    expect(guessCavityPreset(layers, 3)?.id).toBe('unventilated-low-e');
  });

  it('calls a gap behind a dry lining a service void', () => {
    const layers = [
      solid('gypsum-plasterboard'),
      blankAirLayer(),
      solid('dense-concrete-block'),
    ];
    expect(guessCavityPreset(layers, 1)?.id).toBe('service-void');
  });

  it('calls a gap outboard of sheathing a drained and vented timber frame cavity', () => {
    const layers = [
      solid('gypsum-plasterboard'),
      solid('mineral-wool-quilt'),
      solid('osb-board'),
      blankAirLayer(),
      solid('brick-outer-leaf'),
    ];
    expect(guessCavityPreset(layers, 3)?.id).toBe('slightly-ventilated-timber-frame');
  });

  it('falls back to a clear masonry cavity between two leaves', () => {
    const layers = [solid('brick-inner-leaf'), blankAirLayer(), solid('brick-outer-leaf')];
    expect(guessCavityPreset(layers, 1)?.id).toBe('unventilated-masonry');
  });

  it('reads the neighbours, not the whole build-up', () => {
    // Insulation elsewhere in the wall must not make every gap a partial-fill residual.
    const layers = [
      solid('gypsum-plasterboard'),
      solid('mineral-wool-quilt'),
      solid('brick-inner-leaf'),
      blankAirLayer(),
      solid('brick-outer-leaf'),
    ];
    expect(guessCavityPreset(layers, 3)?.id).toBe('unventilated-masonry');
  });
});
