/**
 * Display conventions shared across panels.
 */

/**
 * A temperature *difference*, for a reader rather than for a physicist.
 *
 * The engine carries these in kelvin and its identifiers say so — `belowDewPointK`,
 * `shortfallK` — which is right: the kelvin is the SI unit of temperature interval, and
 * CLAUDE.md requires the unit in the name. But the degree Celsius and the kelvin are
 * **identical in size**, so an interval is equally correct in either, and on screen °C
 * is the one people can read. "0.8 K below its dew point" asks a homeowner to know that
 * a kelvin step is a Celsius step; "0.8 °C below its dew point" asks nothing.
 *
 * So there is no conversion here and nothing to get wrong — the number is unchanged and
 * only the symbol differs. What it buys is that a sentence no longer switches units
 * halfway through: the results panel used to read "5.3 K clear of the internal dew point
 * of 9.3 °C", two units for the same quantity in one breath.
 *
 * **This is for intervals only.** A unit with a kelvin inside it — U-values in W/(m²·K),
 * resistances in m²K/W, specific heat in J/(kg·K), a point transmittance in W/K — is a
 * unit symbol, not a temperature, and stays exactly as it is.
 */
export function temperatureIntervalC(kelvin: number, decimalPlaces = 1): string {
  return `${kelvin.toFixed(decimalPlaces)} °C`;
}
