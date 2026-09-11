import { assertPositive } from './errors.js';
import type { Dimensionless, Metres } from './units.js';

/**
 * Water vapour properties of a material, derived from the one figure the material
 * databases actually publish: the vapour resistance factor mu.
 *
 * Three quantities describe the same thing and each is used by a different audience:
 *
 *   mu     dimensionless   how many times harder than still air the material is to
 *                          get vapour through. What BS EN ISO 10456 tabulates.
 *   delta  kg/(m*s*Pa)     water vapour permeability: how much vapour actually
 *                          crosses a metre of it per pascal of pressure difference.
 *   Sd     m               equivalent air layer thickness, mu * d. The practical one:
 *                          "this 0.2 mm sheet stops as much vapour as 20 m of air".
 *
 * Sd lives with the layer (it needs a thickness); mu and delta belong to the material.
 */

/**
 * Water vapour permeability of still air, kg/(m*s*Pa).
 *
 * mu is defined as the ratio of a material's vapour resistance to that of an equal
 * thickness of still air, so this constant is what converts mu into a permeability:
 *
 *   delta = delta_air / mu
 *
 * A useful cross-check on the value: UK practice quotes vapour resistance in MN*s/g
 * and gives still air a resistivity of about 5 MN*s/(g*m). Working that back through
 * the units,
 *
 *   resistance = d / delta = mu * d / delta_air          [m^2*s*Pa/kg = N*s/kg]
 *   1 MN*s/g = 1e6 N*s / 1e-3 kg = 1e9 N*s/kg
 *   so resistance in MN*s/g = mu * d / (delta_air * 1e9) = Sd / (delta_air * 1e9)
 *
 * With delta_air = 2.0e-10 that is exactly 5 * Sd, which reproduces the 5 MN*s/(g*m)
 * figure. The two conventions agree, which is why this value is used here.
 *
 * TODO(verify): the value 2.0e-10 kg/(m*s*Pa) and its clause in BS EN ISO 13788 /
 * BS EN ISO 10456, including whether either standard fixes it as a constant or gives
 * it as a function of temperature and barometric pressure (vapour permeability of air
 * does depend on both). Also confirm the 5 MN*s/(g*m) figure against BS 5250.
 */
export const AIR_VAPOUR_PERMEABILITY_KG_PER_M_S_PA = 2.0e-10;

/**
 * Water vapour permeability of a material, kg/(m*s*Pa), from its vapour resistance
 * factor. A high mu is a low permeability: a polythene sheet at mu = 100 000 is a
 * hundred thousand times less permeable than the air it displaces.
 */
export function vapourPermeabilityKgPerMSPa(vapourResistanceFactorMu: Dimensionless): number {
  assertPositive(vapourResistanceFactorMu, 'vapourResistanceFactorMu');
  return AIR_VAPOUR_PERMEABILITY_KG_PER_M_S_PA / vapourResistanceFactorMu;
}

/** Equivalent air layer thickness Sd = mu * d, metres. */
export function equivalentAirLayerThicknessM(
  vapourResistanceFactorMu: Dimensionless,
  thicknessM: Metres,
): Metres {
  return vapourResistanceFactorMu * thicknessM;
}

/**
 * Vapour resistance in MN*s/g, the unit UK product literature and BS 5250 use.
 * Derived from Sd and the air permeability above rather than from a separate
 * conversion factor, so the two can never drift apart.
 */
export function vapourResistanceMNsPerG(equivalentAirLayerThicknessSdM: Metres): number {
  return equivalentAirLayerThicknessSdM / (AIR_VAPOUR_PERMEABILITY_KG_PER_M_S_PA * 1e9);
}

/**
 * How a layer behaves for vapour, in the language BS 5250 uses for build-ups. The
 * thresholds are a presentation aid for describing one layer, not a classification any
 * standard defines, and nothing in the calculation depends on them.
 *
 * TODO(verify): whether BS 5250 or BS EN ISO 13788 define named Sd bands (the terms
 * "vapour barrier", "vapour control layer" and "vapour open" are in common use but
 * the boundaries between them are not something we can attribute). Until then these
 * are labelled in the UI as a rough guide.
 */
export type VapourClass = 'vapour-open' | 'vapour-retarding' | 'vapour-barrier';

export function vapourClassForSd(equivalentAirLayerThicknessSdM: Metres): VapourClass {
  if (equivalentAirLayerThicknessSdM >= 10) {
    return 'vapour-barrier';
  }
  if (equivalentAirLayerThicknessSdM >= 0.5) {
    return 'vapour-retarding';
  }
  return 'vapour-open';
}
