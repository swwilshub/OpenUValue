/**
 * Unit conventions for @openuvalue/engine.
 *
 * The engine is SI throughout and the unit is part of every identifier. These aliases
 * are documentation, not nominal types: they exist so a signature reads as physics
 * rather than as a list of `number`s. Non-SI user units (millimetres, percentages)
 * are converted at the UI boundary and never cross into the engine.
 */

/** Length, metres (m). */
export type Metres = number;
/** Thermal conductivity, W/(m*K). */
export type WattsPerMetreKelvin = number;
/** Thermal resistance, m^2*K/W. */
export type SquareMetreKelvinPerWatt = number;
/** Thermal transmittance, W/(m^2*K). */
export type WattsPerSquareMetreKelvin = number;
/** Density, kg/m^3. */
export type KilogramsPerCubicMetre = number;
/** Specific heat capacity, J/(kg*K). */
export type JoulesPerKilogramKelvin = number;
/** Temperature, degrees Celsius. */
export type DegreesCelsius = number;
/** Pressure, pascals. */
export type Pascals = number;
/** Density of heat flow rate, W/m^2. */
export type WattsPerSquareMetre = number;
/** Dimensionless ratio in the range 0..1 (never a percentage). */
export type Fraction = number;
/** Dimensionless water vapour resistance factor, mu. */
export type Dimensionless = number;

/** Millimetres to metres. For use at the UI boundary only. */
export function millimetresToMetres(millimetres: number): Metres {
  return millimetres / 1000;
}

/** Metres to millimetres. For use at the UI boundary only. */
export function metresToMillimetres(metres: Metres): number {
  return metres * 1000;
}

/** Percentage to fraction. For use at the UI boundary only. */
export function percentToFraction(percent: number): Fraction {
  return percent / 100;
}

/** Fraction to percentage. For use at the UI boundary only. */
export function fractionToPercent(fraction: Fraction): number {
  return fraction * 100;
}
