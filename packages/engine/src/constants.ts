import type { HeatFlowDirection } from './types.js';
import type { Metres, Pascals, SquareMetreKelvinPerWatt } from './units.js';

/* ----------------------------------------------------- surface resistances ---- */

/**
 * BS EN ISO 6946 tabulated surface resistances, m^2*K/W, by direction of heat flow.
 * Rse is 0.04 for all three directions.
 *
 *   heat flow    Rsi     Rse
 *   upward       0.10    0.04     (e.g. a roof or ceiling, heat flowing up)
 *   horizontal   0.13    0.04     (e.g. a wall; +/-30 degrees of horizontal)
 *   downward     0.17    0.04     (e.g. a floor, heat flowing down)
 *
 * BR 443 (Conventions for U-value calculations) adopts the same values for UK
 * U-value work, so no UK-specific override is needed for these three cases.
 *
 * TODO(verify): table and clause numbers in BS EN ISO 6946:2017 (the values appear
 * as Table 1 in the 2007 edition and were renumbered in 2017), and the corresponding
 * section of BR 443 (2019 edition).
 */
export const SURFACE_RESISTANCES_M2K_PER_W: {
  readonly [D in HeatFlowDirection]: {
    readonly rsiM2KPerW: SquareMetreKelvinPerWatt;
    readonly rseM2KPerW: SquareMetreKelvinPerWatt;
  };
} = {
  upward: { rsiM2KPerW: 0.1, rseM2KPerW: 0.04 },
  horizontal: { rsiM2KPerW: 0.13, rseM2KPerW: 0.04 },
  downward: { rsiM2KPerW: 0.17, rseM2KPerW: 0.04 },
};

/* -------------------------------------------------------------- air layers ---- */

/**
 * BS EN ISO 6946 thermal resistance of unventilated air layers, m^2*K/W, for air
 * layers of large extent bounded by surfaces of high emissivity, tabulated against
 * layer thickness and interpolated linearly on thickness between tabulated points.
 *
 *   thickness   upward   horizontal   downward
 *      0 mm      0.00       0.00        0.00
 *      5 mm      0.11       0.11        0.11
 *      7 mm      0.13       0.13        0.13
 *     10 mm      0.15       0.15        0.15
 *     15 mm      0.16       0.17        0.17
 *     25 mm      0.16       0.18        0.19
 *     50 mm      0.16       0.18        0.21
 *    100 mm      0.16       0.18        0.22
 *    300 mm      0.16       0.18        0.23
 *
 * Note the physics the table encodes: with heat flowing downward, convection is
 * suppressed, so resistance keeps rising with thickness; flowing upward, convection
 * sets in and resistance plateaus at 0.16.
 *
 * TODO(verify): every value in this table, plus its table/clause number and edition.
 * BS EN ISO 6946:2007 presents these as a table (understood to be Table 2), while the
 * 2017 edition moved to a calculation procedure for air layers in an annex. Confirm
 * which basis this implementation should follow for BR 443 UK work, and whether the
 * tabulated values are reproduced unchanged in the 2017 edition.
 */
export interface AirLayerTableRow {
  readonly thicknessM: Metres;
  readonly upward: SquareMetreKelvinPerWatt;
  readonly horizontal: SquareMetreKelvinPerWatt;
  readonly downward: SquareMetreKelvinPerWatt;
}

export const UNVENTILATED_AIR_LAYER_TABLE: readonly AirLayerTableRow[] = [
  { thicknessM: 0.0, upward: 0.0, horizontal: 0.0, downward: 0.0 },
  { thicknessM: 0.005, upward: 0.11, horizontal: 0.11, downward: 0.11 },
  { thicknessM: 0.007, upward: 0.13, horizontal: 0.13, downward: 0.13 },
  { thicknessM: 0.01, upward: 0.15, horizontal: 0.15, downward: 0.15 },
  { thicknessM: 0.015, upward: 0.16, horizontal: 0.17, downward: 0.17 },
  { thicknessM: 0.025, upward: 0.16, horizontal: 0.18, downward: 0.19 },
  { thicknessM: 0.05, upward: 0.16, horizontal: 0.18, downward: 0.21 },
  { thicknessM: 0.1, upward: 0.16, horizontal: 0.18, downward: 0.22 },
  { thicknessM: 0.3, upward: 0.16, horizontal: 0.18, downward: 0.23 },
];

/**
 * Opening-area thresholds separating the three ventilation classes, mm^2 per metre
 * of length. At or above the well-ventilated threshold, the air layer and everything
 * outboard of it are disregarded and Rsi is used in place of Rse. Between the two,
 * the resistance is interpolated.
 *
 * TODO(verify): both thresholds and their clause in BS EN ISO 6946, including whether
 * the figures differ for walls (per metre of length) and roofs (per m^2 of area).
 */
export const SLIGHTLY_VENTILATED_MIN_OPENING_AREA_MM2_PER_M = 500;
export const WELL_VENTILATED_MIN_OPENING_AREA_MM2_PER_M = 1500;

/* ------------------------------------------- combined method applicability ---- */

/**
 * BS EN ISO 6946 limits the combined (upper/lower limit) method to elements where
 * the ratio of the upper to the lower limit of total thermal resistance does not
 * exceed 1.5. Beyond that, numerical calculation to BS EN ISO 10211 is required.
 *
 * This is the same rule as the 20 % error-estimate limit, expressed differently.
 * At R'T = 1.5*R''T:  RT = (1.5 + 1)/2 * R''T = 1.25*R''T, so
 *   e = (R'T - R''T) / (2*RT) = (0.5*R''T) / (2.5*R''T) = 0.20.
 * The code checks the ratio and reports the error estimate alongside it.
 *
 * TODO(verify): the 1.5 ratio limit and its clause number in BS EN ISO 6946.
 */
export const COMBINED_METHOD_MAX_UPPER_TO_LOWER_RATIO = 1.5;

/** The equivalent error-estimate limit, percent. Derived from the ratio limit above. */
export const COMBINED_METHOD_MAX_ERROR_PERCENT = 20;

/**
 * BS EN ISO 6946 excludes the combined method where a metal layer penetrates the
 * insulation; such elements need BS EN ISO 10211 (or, for discrete fasteners, the
 * point-thermal-bridge correction, which is out of Phase 1 scope).
 *
 * The standard states the exclusion in terms of metal rather than a lambda value, so
 * this threshold is our own detection heuristic, not a figure from the standard. It
 * sits above every common non-metallic construction material (dense concrete ~2.0,
 * granite ~3.5) and well below the metals used in construction (stainless steel ~17,
 * carbon steel ~50, aluminium ~200).
 *
 * TODO(verify): how BS EN ISO 6946 words the metal exclusion, and whether it offers
 * any quantitative test we should use instead of this heuristic.
 */
export const METAL_DETECTION_MIN_LAMBDA_W_PER_MK = 5.0;

/* --------------------------------------------------------- psychrometrics ----- */

/**
 * BS EN ISO 13788 Annex E saturation vapour pressure constants.
 *
 *   theta >= 0 C:  p_sat = 610.5 * exp( 17.269 * theta / (237.3 + theta) )
 *   theta <  0 C:  p_sat = 610.5 * exp( 21.875 * theta / (265.5 + theta) )
 *
 * TODO(verify): the equation numbers within Annex E of BS EN ISO 13788:2012.
 */
export const SATURATION_PRESSURE_REFERENCE_PA: Pascals = 610.5;
export const SATURATION_PRESSURE_COEFFICIENT_ABOVE_ZERO = 17.269;
export const SATURATION_PRESSURE_DENOMINATOR_ABOVE_ZERO = 237.3;
export const SATURATION_PRESSURE_COEFFICIENT_BELOW_ZERO = 21.875;
export const SATURATION_PRESSURE_DENOMINATOR_BELOW_ZERO = 265.5;

/* -------------------------------------------------------------- reporting ----- */

/**
 * Reporting precision. Calculation is at full double precision throughout; these
 * apply only at the point of display.
 *
 * TODO(verify): the rounding requirements in BS EN ISO 6946 and BR 443 - understood
 * to be thermal resistances to three decimal places and U-values to two, but the
 * clause needs checking, as does whether BR 443 requires two significant figures for
 * small U-values.
 */
export const RESISTANCE_REPORTING_DECIMAL_PLACES = 3;
export const U_VALUE_REPORTING_DECIMAL_PLACES = 2;
