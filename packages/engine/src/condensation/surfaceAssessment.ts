import { calculateTemperatureProfile } from '../temperatureProfile.js';
import { calculateUValue } from '../uvalue.js';
import { dewPointFromAirStateC } from '../psychrometrics.js';
import { ISO13788_SURFACE_ASSESSMENT_RSI_M2K_PER_W } from '../constants.js';
import { MOULD_CRITICAL_SURFACE_HUMIDITY_PERCENT, surfaceRelativeHumidityPercent } from './periodAssessment.js';
import type { BuildingElement, EnvironmentConditions, ProfileSection } from '../types.js';
import type { DegreesCelsius, SquareMetreKelvinPerWatt } from '../units.js';

/**
 * Surface condensation and mould, assessed the way BS EN ISO 13788 requires rather than
 * the way the drawing happens to be set up.
 *
 * §4.4.1 fixes the internal surface resistance at **0,25 m²K/W** for condensation or
 * mould growth on an opaque surface, and its Table 2's 0,10 / 0,13 / 0,17 are for
 * interstitial condensation and for windows and doors. That is a different figure from
 * the one BS EN ISO 6946 tabulates for a U-value, and deliberately so: the point of the
 * higher value is to stand for the worst bit of the room — behind furniture, in the
 * corner of an external wall — rather than for an open wall in the middle of a heated
 * space.
 *
 * Until now OpenUValue offered that as a **user choice**, which meant the mould verdict
 * only conformed when the user happened to pick reduced air circulation, and was
 * optimistic otherwise. That breaks the rule CLAUDE.md already states — a display choice
 * must never change a safety verdict — so the assessment now applies the required figure
 * itself and says that it has.
 *
 * The U-value is untouched, and must be: for that, BR 443 wants the ISO 6946 tabulated
 * resistance, and using 0,25 there would produce a number no UK submission would accept.
 * The two live side by side on purpose.
 */
export interface SurfaceAssessment {
  /** The resistance the assessment is required to use, whatever the U-value uses. */
  readonly rsiM2KPerW: SquareMetreKelvinPerWatt;
  /** The resistance the U-value is using, for the caller to contrast against. */
  readonly uValueRsiM2KPerW: SquareMetreKelvinPerWatt;
  /** True where the two differ, so a caller can explain why one figure is not the other. */
  readonly differsFromUValueRsi: boolean;
  /** Coldest internal surface temperature across every path, at the required Rsi. */
  readonly temperatureC: DegreesCelsius;
  /** Which path that came from. */
  readonly pathId: ProfileSection;
  /**
   * The temperature factor f_Rsi = (theta_si - theta_e) / (theta_i - theta_e), which is
   * the form the criterion is usually quoted in because it is independent of the
   * weather. Undefined where inside and outside are at the same temperature.
   */
  readonly temperatureFactor: number | undefined;
  /** Relative humidity of the air at that surface. */
  readonly surfaceRelativeHumidityPercent: number;
  /** At or above the mould threshold: damp enough to grow mould without any liquid water. */
  readonly mouldRisk: boolean;
  /** At or below the dew point of the room air: liquid water forms on the surface. */
  readonly condensationRisk: boolean;
  readonly dewPointC: DegreesCelsius;
}

/**
 * Swap the surface resistance without recalculating the element.
 *
 * Everything outboard of the internal surface is unchanged, so the element's own
 * resistance is the total less whatever Rsi went into it, and the assessment total is
 * that plus the required Rsi.
 */
function surfaceTemperatureAtRsiC(
  totalResistanceM2KPerW: SquareMetreKelvinPerWatt,
  rsiUsedM2KPerW: SquareMetreKelvinPerWatt,
  rsiRequiredM2KPerW: SquareMetreKelvinPerWatt,
  internalAirTemperatureC: DegreesCelsius,
  externalAirTemperatureC: DegreesCelsius,
): DegreesCelsius {
  const beyondSurface = totalResistanceM2KPerW - rsiUsedM2KPerW;
  const assessedTotal = rsiRequiredM2KPerW + beyondSurface;
  if (assessedTotal <= 0) {
    return externalAirTemperatureC;
  }
  return (
    internalAirTemperatureC -
    (rsiRequiredM2KPerW / assessedTotal) * (internalAirTemperatureC - externalAirTemperatureC)
  );
}

export function assessSurfaceCondensation(
  element: BuildingElement,
  conditions: EnvironmentConditions,
): SurfaceAssessment {
  const uValue = calculateUValue(element);
  const rsiUsed = uValue.rsiM2KPerW;
  const rsiRequired = ISO13788_SURFACE_ASSESSMENT_RSI_M2K_PER_W;

  /*
   * Every real path, not the displayed one. The bridging path has the lower resistance
   * and therefore the colder internal surface, so it is the one that decides this - the
   * same worst-case-across-paths rule the interstitial assessment follows.
   */
  const hasBridging = element.layers.some(
    (layer) =>
      (layer.kind === 'solid' || layer.kind === 'air') &&
      layer.bridging !== undefined &&
      layer.bridging.areaFraction > 0 &&
      layer.bridging.areaFraction < 1,
  );
  const sections: readonly ProfileSection[] = hasBridging
    ? ['unbridged', 'bridged']
    : ['unbridged'];

  let coldestC = Number.POSITIVE_INFINITY;
  let coldestPath: ProfileSection = 'unbridged';
  for (const section of sections) {
    const profile = calculateTemperatureProfile(element, conditions, section);
    const temperatureC = surfaceTemperatureAtRsiC(
      profile.totalResistanceM2KPerW,
      rsiUsed,
      rsiRequired,
      conditions.internalAirTemperatureC,
      conditions.externalAirTemperatureC,
    );
    if (temperatureC < coldestC) {
      coldestC = temperatureC;
      coldestPath = section;
    }
  }

  const humidity = surfaceRelativeHumidityPercent(
    conditions.internalAirTemperatureC,
    conditions.internalRelativeHumidityPercent,
    coldestC,
  );
  const dewPointC = dewPointFromAirStateC(
    conditions.internalAirTemperatureC,
    conditions.internalRelativeHumidityPercent,
  );
  const swing = conditions.internalAirTemperatureC - conditions.externalAirTemperatureC;

  return {
    rsiM2KPerW: rsiRequired,
    uValueRsiM2KPerW: rsiUsed,
    // Compared loosely: these are both tabulated figures, not results of a calculation.
    differsFromUValueRsi: Math.abs(rsiRequired - rsiUsed) > 1e-9,
    temperatureC: coldestC,
    pathId: coldestPath,
    temperatureFactor:
      swing === 0 ? undefined : (coldestC - conditions.externalAirTemperatureC) / swing,
    surfaceRelativeHumidityPercent: humidity,
    mouldRisk: humidity >= MOULD_CRITICAL_SURFACE_HUMIDITY_PERCENT,
    condensationRisk: coldestC <= dewPointC,
    dewPointC,
  };
}
