import { describe, expect, it } from 'vitest';
import { CAVITY_PRESETS, blankAirLayer, cavityPreset, matchingCavityPreset } from '../model.js';

/**
 * Three of the presets resolve to the same airspace — a clear masonry cavity, a partial
 * fill's residual gap and a batten void are all unventilated and high-emissivity, and the
 * calculation is right to treat them alike. Which means the *choice* has to be recorded,
 * or the picker can only ever highlight the first of the three. That was the bug.
 */
describe('which preset a cavity is showing as', () => {
  it('has presets that genuinely collide on their settings', () => {
    // If this ever stops being true the recorded id could be dropped — so assert it
    // rather than leaving the reason for the field to be inferred.
    const keys = CAVITY_PRESETS.map(
      (preset) => `${preset.ventilation}|${preset.emissivity}|${preset.openingAreaMm2PerM}`,
    );
    expect(new Set(keys).size).toBeLessThan(CAVITY_PRESETS.length);
  });

  it('returns the preset that was chosen, not the first that fits', () => {
    const serviceVoid = cavityPreset('service-void');
    expect(serviceVoid).toBeDefined();
    const layer = {
      ...blankAirLayer(),
      ventilation: serviceVoid!.ventilation,
      emissivity: serviceVoid!.emissivity,
      openingAreaMm2PerM: serviceVoid!.openingAreaMm2PerM,
      cavityPresetId: 'service-void',
    };
    expect(matchingCavityPreset(layer)?.id).toBe('service-void');
  });

  it('can show every preset as current, which is the whole point', () => {
    for (const preset of CAVITY_PRESETS) {
      const layer = {
        ...blankAirLayer(),
        ventilation: preset.ventilation,
        emissivity: preset.emissivity,
        openingAreaMm2PerM: preset.openingAreaMm2PerM,
        cavityPresetId: preset.id,
      };
      expect(matchingCavityPreset(layer)?.id).toBe(preset.id);
    }
  });

  it('falls back to matching on values where no choice was recorded', () => {
    // A build-up that arrived by link, or predates the field.
    const layer = { ...blankAirLayer(), ventilation: 'well-ventilated' as const };
    expect(matchingCavityPreset(layer)?.id).toBe('well-ventilated-rainscreen');
  });

  it('ignores a recorded id that no longer fits the layer', () => {
    // Someone recorded a service void, then set the cavity well ventilated by hand.
    const layer = {
      ...blankAirLayer(),
      ventilation: 'well-ventilated' as const,
      cavityPresetId: 'service-void',
    };
    expect(matchingCavityPreset(layer)?.id).toBe('well-ventilated-rainscreen');
  });
});
