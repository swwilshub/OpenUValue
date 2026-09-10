import {
  SATURATION_PRESSURE_COEFFICIENT_ABOVE_ZERO,
  SATURATION_PRESSURE_COEFFICIENT_BELOW_ZERO,
  SATURATION_PRESSURE_DENOMINATOR_ABOVE_ZERO,
  SATURATION_PRESSURE_DENOMINATOR_BELOW_ZERO,
  SATURATION_PRESSURE_REFERENCE_PA,
} from './constants.js';
import { InvalidInputError, assertFiniteNumber } from './errors.js';
import type { DegreesCelsius, Pascals } from './units.js';

/**
 * Saturation vapour pressure of water in air, Pa.
 *
 * BS EN ISO 13788 Annex E:
 *   theta >= 0 C:  p_sat = 610.5 * exp( 17.269 * theta / (237.3 + theta) )
 *   theta <  0 C:  p_sat = 610.5 * exp( 21.875 * theta / (265.5 + theta) )
 *
 * Both branches pass through 610.5 Pa at 0 C, so the function is continuous there.
 * TODO(verify): equation numbers within Annex E of BS EN ISO 13788:2012.
 */
export function saturationVapourPressurePa(temperatureC: DegreesCelsius): Pascals {
  assertFiniteNumber(temperatureC, 'temperatureC');
  const coefficient =
    temperatureC >= 0
      ? SATURATION_PRESSURE_COEFFICIENT_ABOVE_ZERO
      : SATURATION_PRESSURE_COEFFICIENT_BELOW_ZERO;
  const denominatorOffset =
    temperatureC >= 0
      ? SATURATION_PRESSURE_DENOMINATOR_ABOVE_ZERO
      : SATURATION_PRESSURE_DENOMINATOR_BELOW_ZERO;
  const denominator = denominatorOffset + temperatureC;
  if (denominator <= 0) {
    // Unphysical for building work: -237.3 C sits below absolute zero on this branch.
    throw new InvalidInputError('temperatureC', `outside the valid range, received ${temperatureC}`);
  }
  return SATURATION_PRESSURE_REFERENCE_PA * Math.exp((coefficient * temperatureC) / denominator);
}

/**
 * Dew point temperature for a given partial vapour pressure, degrees C.
 *
 * BS EN ISO 13788 Annex E, the inverse of the saturation pressure equations:
 *   p >= 610.5 Pa:  theta = 237.3 * ln(p/610.5) / (17.269 - ln(p/610.5))
 *   p <  610.5 Pa:  theta = 265.5 * ln(p/610.5) / (21.875 - ln(p/610.5))
 *
 * TODO(verify): equation numbers within Annex E of BS EN ISO 13788:2012.
 */
export function dewPointTemperatureC(vapourPressurePa: Pascals): DegreesCelsius {
  assertFiniteNumber(vapourPressurePa, 'vapourPressurePa');
  if (vapourPressurePa <= 0) {
    throw new InvalidInputError(
      'vapourPressurePa',
      `must be greater than zero, received ${vapourPressurePa}`,
    );
  }
  const logRatio = Math.log(vapourPressurePa / SATURATION_PRESSURE_REFERENCE_PA);
  const isAboveFreezing = vapourPressurePa >= SATURATION_PRESSURE_REFERENCE_PA;
  const numeratorFactor = isAboveFreezing
    ? SATURATION_PRESSURE_DENOMINATOR_ABOVE_ZERO
    : SATURATION_PRESSURE_DENOMINATOR_BELOW_ZERO;
  const coefficient = isAboveFreezing
    ? SATURATION_PRESSURE_COEFFICIENT_ABOVE_ZERO
    : SATURATION_PRESSURE_COEFFICIENT_BELOW_ZERO;
  return (numeratorFactor * logRatio) / (coefficient - logRatio);
}

/**
 * Partial vapour pressure of moist air, Pa: p = phi * p_sat(theta), with phi as a
 * fraction. BS EN ISO 13788 defines relative humidity as that ratio.
 */
export function vapourPressurePa(
  temperatureC: DegreesCelsius,
  relativeHumidityPercent: number,
): Pascals {
  assertFiniteNumber(relativeHumidityPercent, 'relativeHumidityPercent');
  if (relativeHumidityPercent < 0 || relativeHumidityPercent > 100) {
    throw new InvalidInputError(
      'relativeHumidityPercent',
      `must be within 0..100, received ${relativeHumidityPercent}`,
    );
  }
  return (relativeHumidityPercent / 100) * saturationVapourPressurePa(temperatureC);
}

/** Relative humidity, percent, for a given vapour pressure and temperature. */
export function relativeHumidityPercent(
  vapourPressureAtNodePa: Pascals,
  temperatureC: DegreesCelsius,
): number {
  assertFiniteNumber(vapourPressureAtNodePa, 'vapourPressureAtNodePa');
  return (vapourPressureAtNodePa / saturationVapourPressurePa(temperatureC)) * 100;
}

/** Dew point of air at a given temperature and relative humidity, degrees C. */
export function dewPointFromAirStateC(
  temperatureC: DegreesCelsius,
  relativeHumidityPercent_: number,
): DegreesCelsius {
  return dewPointTemperatureC(vapourPressurePa(temperatureC, relativeHumidityPercent_));
}
