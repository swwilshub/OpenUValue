import {
  RESISTANCE_REPORTING_DECIMAL_PLACES,
  U_VALUE_REPORTING_SIGNIFICANT_FIGURES,
} from './constants.js';
import type { SquareMetreKelvinPerWatt, WattsPerSquareMetreKelvin } from './units.js';

/**
 * Display-only rounding. Calculation runs at full double precision; nothing in a
 * chain of resistances is rounded on the way through.
 */
function roundTo(value: number, decimalPlaces: number): number {
  const factor = 10 ** decimalPlaces;
  return Math.round(value * factor) / factor;
}

/** Thermal resistance for reporting. See constants.ts for the rounding TODO(verify). */
export function roundResistanceForReporting(
  resistanceM2KPerW: SquareMetreKelvinPerWatt,
): SquareMetreKelvinPerWatt {
  return roundTo(resistanceM2KPerW, RESISTANCE_REPORTING_DECIMAL_PLACES);
}

/**
 * Round to a number of significant figures rather than decimal places.
 *
 * toPrecision does the work but returns a string, and for large or small magnitudes
 * an exponential one ("2.6e-1"), so it is parsed back to a number. Zero has no
 * significant figures to speak of and is returned as it is.
 */
function roundToSignificantFigures(value: number, significantFigures: number): number {
  if (value === 0 || !Number.isFinite(value)) {
    return value;
  }
  return Number(value.toPrecision(significantFigures));
}

/**
 * U-value for reporting: two significant figures, per BS EN ISO 6946:2017, 6.5.2.
 * Null passes through, so an out-of-scope result stays null.
 */
export function roundUValueForReporting(
  uValueWPerM2K: WattsPerSquareMetreKelvin,
): WattsPerSquareMetreKelvin;
export function roundUValueForReporting(uValueWPerM2K: null): null;
export function roundUValueForReporting(
  uValueWPerM2K: WattsPerSquareMetreKelvin | null,
): WattsPerSquareMetreKelvin | null;
export function roundUValueForReporting(
  uValueWPerM2K: WattsPerSquareMetreKelvin | null,
): WattsPerSquareMetreKelvin | null {
  return uValueWPerM2K === null
    ? null
    : roundToSignificantFigures(uValueWPerM2K, U_VALUE_REPORTING_SIGNIFICANT_FIGURES);
}
