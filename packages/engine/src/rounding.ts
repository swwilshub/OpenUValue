import {
  RESISTANCE_REPORTING_DECIMAL_PLACES,
  U_VALUE_REPORTING_DECIMAL_PLACES,
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

/** U-value for reporting. Null passes through, so an out-of-scope result stays null. */
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
  return uValueWPerM2K === null ? null : roundTo(uValueWPerM2K, U_VALUE_REPORTING_DECIMAL_PLACES);
}
