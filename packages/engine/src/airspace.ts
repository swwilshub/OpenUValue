import { assertPositive, assertFiniteNumber } from './errors.js';
import type { HeatFlowDirection } from './types.js';
import type { Metres, SquareMetreKelvinPerWatt } from './units.js';

/**
 * Airspace resistance from first principles, to ISO/DIS 6946:2015 Annex D.
 *
 * The tabulated resistances we have been carrying are the *output* of this, not an
 * independent source: Annex D's own note says Table 9's values "are calculated using
 * Formula (D.1) with ha according to Table D.1, ε1 = 0,9, ε2 = 0,9, and hr0 evaluated at
 * 10 °C". Implementing the formula reproduces all 21 of them to the two decimals they
 * are quoted at, which is what closes VERIFY.md row V4 — the table is now derived rather
 * than believed.
 *
 * Doing it this way buys two things a table cannot. **Emissivity** becomes a number
 * rather than a choice between two tabulated columns, so a foil facing with a declared ε
 * gives its own answer. And **air voids** become calculable: D.4 is the same formula with
 * a geometry term, so a cavity divided into narrow pockets no longer has to borrow an air
 * layer's resistance, which is VERIFY.md row V27.
 *
 * Annex D applies to airspaces up to 0,3 m thick in components other than glazing (D.1).
 */

/** Stefan-Boltzmann constant, W/(m^2*K^4). ISO/DIS 6946:2015 C.1. */
export const STEFAN_BOLTZMANN_W_PER_M2K4 = 5.67e-8;

/**
 * Mean temperature the tabulated values are evaluated at, °C. Annex D's note fixes this
 * at 10 °C, and BR 443 (2006) 4.8.1 says the same for UK work: "Calculations of airspace
 * resistance for normal building applications should be based on a mean temperature of
 * 10 °C and a temperature difference across the airspace of 5 K".
 */
export const AIRSPACE_MEAN_TEMPERATURE_C = 10;
export const AIRSPACE_REFERENCE_DELTA_T_K = 5;

/** The thickness Annex D stops at, metres (D.1). */
export const ANNEX_D_MAX_THICKNESS_M = 0.3;

/** Ratio of width to thickness at or above which an airspace is an air layer, not a void. */
export const AIR_LAYER_MIN_WIDTH_TO_THICKNESS = 10;

/**
 * Radiative coefficient of a black-body surface, W/(m^2*K). ISO/DIS 6946:2015 Formula
 * (C.3): hr0 = 4 * sigma * Tmn^3, with Tmn the mean thermodynamic temperature.
 */
export function blackBodyRadiativeCoefficient(
  meanTemperatureC: number = AIRSPACE_MEAN_TEMPERATURE_C,
): number {
  const kelvin = meanTemperatureC + 273.15;
  return 4 * STEFAN_BOLTZMANN_W_PER_M2K4 * kelvin ** 3;
}

/**
 * Conduction/convection coefficient across an airspace, W/(m^2*K). ISO/DIS 6946:2015 D.2.
 *
 * "ha is determined by conduction in still air for narrow airspaces and by convection in
 * wide cavities. For calculations in accordance with this International Standard, it is
 * the larger of 0,025/d and the value of ha obtained from Table D.1 or Table D.2."
 *
 * Table D.1 applies at a temperature difference of 5 K or less, Table D.2 above it. The
 * 0,025/d floor is still air conducting: below about 20 mm it is what governs, which is
 * why thin cavities lose resistance so quickly.
 */
export function airspaceConvectiveCoefficient(
  thicknessM: Metres,
  direction: HeatFlowDirection,
  deltaTK: number = AIRSPACE_REFERENCE_DELTA_T_K,
): number {
  assertPositive(thicknessM, 'thicknessM');
  assertFiniteNumber(deltaTK, 'deltaTK');
  const magnitude = Math.abs(deltaTK);
  const tabulated =
    magnitude <= AIRSPACE_REFERENCE_DELTA_T_K
      ? // Table D.1
        direction === 'horizontal'
        ? 1.25
        : direction === 'upward'
          ? 1.95
          : 0.12 * thicknessM ** -0.44
      : // Table D.2
        direction === 'horizontal'
        ? 0.73 * magnitude ** (1 / 3)
        : direction === 'upward'
          ? 1.14 * magnitude ** (1 / 3)
          : 0.09 * magnitude ** 0.187 * thicknessM ** -0.44;
  // Still-air conduction, which is the floor under all of them.
  return Math.max(tabulated, 0.025 / thicknessM);
}

export interface AirspaceInput {
  readonly thicknessM: Metres;
  readonly direction: HeatFlowDirection;
  /** Hemispherical emissivity of the warm face. 0,9 for ordinary building materials. */
  readonly emissivityWarm?: number;
  /** Hemispherical emissivity of the cold face. */
  readonly emissivityCold?: number;
  /**
   * Width of the airspace, metres, measured across the heat flow. Supply it and the
   * airspace is treated by D.4, which narrows to D.2 as the width grows; leave it out
   * and it is an air layer of unbounded width.
   */
  readonly widthM?: Metres;
  readonly deltaTK?: number;
  readonly meanTemperatureC?: number;
}

export interface AirspaceResistance {
  readonly resistanceM2KPerW: SquareMetreKelvinPerWatt;
  /** Conduction/convection coefficient, W/(m^2*K). */
  readonly haWPerM2K: number;
  /** Radiative coefficient, W/(m^2*K). */
  readonly hrWPerM2K: number;
  /** True where the width put this in D.4's territory rather than D.2's. */
  readonly isAirVoid: boolean;
  /** True where the thickness is past the 0,3 m Annex D covers. */
  readonly beyondAnnexDThickness: boolean;
}

/**
 * Thermal resistance of an unventilated airspace, ISO/DIS 6946:2015 Formulae (D.1)/(D.5).
 *
 *   Ra = 1 / (ha + hr)
 *
 * For an air layer, (D.3) and (D.4) give hr = hr0 / (1/e1 + 1/e2 - 1). For a void, (D.6)
 * replaces the -1 with a term in the width-to-thickness ratio:
 *
 *   hr = hr0 / ( 1/e1 + 1/e2 - 2 + 2 / (1 + sqrt(1 + d^2/b^2) - d/b) )
 *
 * The two are one formula. As b grows, d/b tends to 0, the square root tends to 1, and
 * 2/(1 + 1 - 0) becomes 1 — leaving exactly the air layer's -1. So a single expression
 * covers both, and an air layer is just a void that is wide enough not to notice its own
 * edges. Narrowing a void *raises* hr and so lowers its resistance: the warm face can see
 * the cold one past the sides.
 */
export function airspaceResistance(input: AirspaceInput): AirspaceResistance {
  const { thicknessM, direction } = input;
  assertPositive(thicknessM, 'thicknessM');
  const e1 = input.emissivityWarm ?? 0.9;
  const e2 = input.emissivityCold ?? 0.9;
  assertPositive(e1, 'emissivityWarm');
  assertPositive(e2, 'emissivityCold');

  const ha = airspaceConvectiveCoefficient(thicknessM, direction, input.deltaTK);
  const hr0 = blackBodyRadiativeCoefficient(input.meanTemperatureC);

  const widthM = input.widthM;
  const isAirVoid =
    widthM !== undefined &&
    widthM > 0 &&
    widthM < thicknessM * AIR_LAYER_MIN_WIDTH_TO_THICKNESS;

  let geometry: number;
  if (widthM === undefined || widthM <= 0) {
    geometry = -1;
  } else {
    const ratio = thicknessM / widthM;
    geometry = -2 + 2 / (1 + Math.sqrt(1 + ratio * ratio) - ratio);
  }

  const hr = hr0 / (1 / e1 + 1 / e2 + geometry);

  return {
    resistanceM2KPerW: 1 / (ha + hr),
    haWPerM2K: ha,
    hrWPerM2K: hr,
    isAirVoid,
    beyondAnnexDThickness: thicknessM > ANNEX_D_MAX_THICKNESS_M,
  };
}
