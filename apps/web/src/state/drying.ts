import type { BuildingElement, EnvironmentConditions, PeriodAssessment } from '@openuvalue/engine';
import { assessOverPeriods } from '@openuvalue/engine';

/**
 * The wetting and drying seasons the dry-out check runs over.
 *
 * Held once, above both the cross-section and the Moisture tab, because both now report
 * whether the build-up clears and two different answers to that on one screen would be
 * a defect rather than a difference of emphasis. The settings are deliberately **not**
 * part of the URL-encoded build-up: they describe an analysis the reader is running,
 * not the wall itself, and changing them should not make a shared link mean something
 * different from what was shared.
 *
 * **In-house defaults.** 90 days each way, and a drying season at 18 °C / 55 % outside,
 * are OpenUValue's starting points, not figures from a standard. BS EN ISO 13788's own
 * assessment runs twelve months of a design year against monthly climate data, which we
 * do not ship and will not invent - see ROADMAP.md and the note in
 * condensation/README.md. Two seasons is an approximation to that, and it is labelled
 * as one everywhere it is shown.
 */
export interface DryingSettings {
  readonly wettingDays: number;
  readonly dryingDays: number;
  readonly dryingExternalC: number;
  readonly dryingExternalRhPercent: number;
}

export const DEFAULT_DRYING_SETTINGS: DryingSettings = {
  wettingDays: 90,
  dryingDays: 90,
  dryingExternalC: 18,
  dryingExternalRhPercent: 55,
};

/**
 * Run the two-season check. Returns undefined rather than throwing: a build-up whose
 * vapour calculation cannot run still has a thermal answer worth showing, and neither
 * caller should lose its whole panel over this one figure.
 */
export function assessDryOut(
  element: BuildingElement,
  conditions: EnvironmentConditions,
  settings: DryingSettings,
): PeriodAssessment | undefined {
  try {
    return assessOverPeriods(
      element,
      { label: 'Wetting season', days: settings.wettingDays, conditions },
      {
        label: 'Drying season',
        days: settings.dryingDays,
        conditions: {
          ...conditions,
          externalAirTemperatureC: settings.dryingExternalC,
          externalRelativeHumidityPercent: settings.dryingExternalRhPercent,
        },
      },
    );
  } catch {
    return undefined;
  }
}
