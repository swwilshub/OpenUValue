import { InvalidInputError } from './errors.js';
import type { WattsPerSquareMetreKelvin } from './units.js';
import { type Warning, warning } from './warnings.js';

/**
 * ΔU_f — the correction for mechanical fasteners passing through an insulation layer.
 *
 * Screws, wall ties, helping-hand brackets and membrane fixings are metal, and metal
 * through insulation is a short circuit. BR 443 (2019) 4.8.3 requires the correction for
 * UK work, so a build-up with insulation fixed through and no ΔU_f is under-reported.
 *
 * **Two routes, and only one of them can be attributed.** BR 443 (2019) 4.8.3 sets out
 * both, quoted here because the distinction is the whole design of this module:
 *
 *   a) "Detailed calculation, where the effect of mechanical fasteners can be assessed
 *      in accordance with BS EN ISO 10211 in order to obtain the point thermal
 *      transmittance for one fastener. The total correction to the calculated U-value is
 *      the point thermal transmittance (χ) for one fastener multiplied by the number of
 *      fasteners per square metre";
 *
 *   b) "Approximate procedure in BS EN ISO 6946 (Annex F.3.2) which can be used when the
 *      effect of mechanical fasteners, calculated by other methods, is not available."
 *
 * Route (a) is specified completely by that sentence — it is ΔU_f = χ · n_f, and that is
 * what this module implements. Route (b) needs the formula in BS EN ISO 6946 Annex F.3.2,
 * which BR 443 points at without reproducing, in the 2019 edition and in the 2006 one.
 * Neither the ISO 6946:2017 nor the ISO 6946:2007 published preview contains the annex.
 * So route (b) is **not implemented**, rather than implemented from a half-remembered
 * formula: a guessed ΔU_f is worse than an admitted gap. See VERIFY.md.
 *
 * Getting a χ is not exotic — it is what an ISO 10211 model produces, and fixing and
 * bracket manufacturers publish it (often in a BBA certificate) precisely so this
 * calculation can be done.
 */

/**
 * BR 443 (2019) 4.8.3: "No correction need be applied in the case of fixings in a flat
 * roof where the metal part of the composite fastener is recessed by at least 50% of the
 * length of the fixing and the density of fixings does not exceed 15 fixings per square
 * metre."
 *
 * Both halves of that are conditions, so both are here.
 */
export const RECESSED_FIXING_EXEMPTION_MAX_PER_M2 = 15;
export const RECESSED_FIXING_EXEMPTION_MIN_RECESS_FRACTION = 0.5;

/**
 * Reference data from BR 443 (2019) 4.8.2, for wall ties.
 *
 * These are the quantities the **approximate** procedure needs — a conductivity, a
 * cross-sectional area and a number per square metre — so nothing here feeds a
 * calculation in this module, which implements the detailed route only. They are carried
 * because BR 443 publishes them as the values to use "in the absence of the exact
 * details", and a user deciding whether fasteners matter at all should be able to see
 * them. Areas are converted from the mm² the standard quotes.
 */
export const BR443_TIE_CONDUCTIVITY_W_PER_MK = {
  /** BR 443 (2019) 4.8.2. */
  mildSteel: 50,
  /** BR 443 (2019) 4.8.2. */
  stainlessSteel: 17,
} as const;

export interface WallTieReference {
  readonly label: string;
  readonly crossSectionalAreaM2: number;
}

/** BR 443 (2019) 4.8.2, "Cross-section (typical size for ties)". */
export const BR443_WALL_TIE_TYPES: readonly WallTieReference[] = [
  { label: 'Double triangle, 4 mm diameter', crossSectionalAreaM2: 12.5e-6 },
  { label: 'Vertical twist, 20 mm by 4 mm', crossSectionalAreaM2: 80e-6 },
];

/**
 * BR 443 (2019) 4.8.2: 2.5 per m² at 900 mm by 450 mm centres, "for walls up to 15 m in
 * height and leaf thickness of at least 90 mm (a higher density is required if the height
 * is greater or either leaf is thinner)".
 */
export const BR443_WALL_TIE_DENSITY_PER_M2 = 2.5;

/**
 * BR 443 (2019) 4.8.2: "specialist wall ties have thermal conductivity less than
 * 1 W/m·K and therefore have very little effect on the calculated U-value".
 */
export const SPECIALIST_TIE_MAX_CONDUCTIVITY_W_PER_MK = 1;

export interface FastenerInput {
  /**
   * Point thermal transmittance χ of a single fastener, W/K, from an ISO 10211
   * calculation or a declared product value. This is the input the detailed route needs
   * and the one this engine cannot derive for you.
   */
  readonly pointThermalTransmittanceWPerK: number;
  /** Number of fasteners per square metre of element. */
  readonly fastenersPerM2: number;
  /**
   * True where the element is a flat roof. Not inferred from the heat flow direction:
   * upward heat flow covers ceilings and pitched roofs too, and BR 443 grants the
   * recessed-fixing exemption to flat roofs specifically. Inferring it would hand the
   * exemption to elements the standard does not give it to.
   */
  readonly isFlatRoof?: boolean;
  /**
   * True where the metal part of a composite fastener is recessed by at least half the
   * length of the fixing.
   */
  readonly metalRecessedAtLeastHalf?: boolean;
  /**
   * True where both ends of the metallic fixing are in direct contact with metal sheets —
   * a composite panel bounded by metal sheets, typically. BR 443 4.8.3 says the
   * BS EN ISO 6946 method does not apply at all in that case.
   */
  readonly bothEndsInMetalSheets?: boolean;
}

export type FastenerOutcome =
  /** ΔU_f calculated from χ and the fastener density. */
  | 'corrected'
  /** BR 443 4.8.3 says no correction is needed: recessed fixings in a flat roof. */
  | 'exempt-recessed-flat-roof'
  /** The method does not apply; the element is outside what this engine can calculate. */
  | 'out-of-scope-metal-sheets';

export interface FastenerAssessment {
  readonly deltaUWPerM2K: WattsPerSquareMetreKelvin;
  readonly outcome: FastenerOutcome;
  /** Why the correction came out as it did, in a sentence fit to show a user. */
  readonly explanation: string;
  readonly warnings: readonly Warning[];
}

/**
 * ΔU_f by the detailed route of BR 443 (2019) 4.8.3(a): χ multiplied by the number of
 * fasteners per square metre.
 *
 * The units work out directly — W/K per fastener times fasteners per m² is W/(m²·K) —
 * which is worth stating because it is the check that the quoted sentence really does
 * specify the whole calculation.
 *
 * The two BR 443 escape clauses are applied before the arithmetic, because each of them
 * means a different thing: one says the correction is genuinely unnecessary, the other
 * says the method does not apply and the answer is not ours to give.
 */
export function assessFasteners(input: FastenerInput): FastenerAssessment {
  if (!Number.isFinite(input.pointThermalTransmittanceWPerK) ||
      input.pointThermalTransmittanceWPerK < 0) {
    throw new InvalidInputError(
      'pointThermalTransmittanceWPerK',
      'the point thermal transmittance must be a non-negative number',
    );
  }
  if (!Number.isFinite(input.fastenersPerM2) || input.fastenersPerM2 < 0) {
    throw new InvalidInputError(
      'fastenersPerM2',
      'the number of fasteners per square metre must be a non-negative number',
    );
  }

  if (input.bothEndsInMetalSheets === true) {
    return {
      deltaUWPerM2K: 0,
      outcome: 'out-of-scope-metal-sheets',
      explanation:
        'Both ends of the fixing are in direct contact with metal sheets. BR 443 (2019) ' +
        '4.8.3 states that the method of correction given in BS EN ISO 6946 does not ' +
        'apply in that case, and refers such elements to its own section 4.9. No ' +
        'correction is calculated here, and the U-value beside it does not account for ' +
        'the fixings.',
      warnings: [
        warning(
          'metal-bridging-out-of-scope',
          'Both ends of the fixing are in metal sheets, so BR 443 4.8.3 puts this ' +
            'element outside the BS EN ISO 6946 fastener correction. The reported ' +
            'U-value does not include any allowance for the fixings.',
        ),
      ],
    };
  }

  if (
    input.isFlatRoof === true &&
    input.metalRecessedAtLeastHalf === true &&
    input.fastenersPerM2 <= RECESSED_FIXING_EXEMPTION_MAX_PER_M2
  ) {
    return {
      deltaUWPerM2K: 0,
      outcome: 'exempt-recessed-flat-roof',
      explanation:
        'No correction is needed. BR 443 (2019) 4.8.3 exempts fixings in a flat roof ' +
        'where the metal part of the composite fastener is recessed by at least 50 % of ' +
        `the length of the fixing and the density does not exceed ` +
        `${RECESSED_FIXING_EXEMPTION_MAX_PER_M2} fixings per square metre.`,
      warnings: [],
    };
  }

  const deltaUWPerM2K = input.pointThermalTransmittanceWPerK * input.fastenersPerM2;

  return {
    deltaUWPerM2K,
    outcome: 'corrected',
    explanation:
      `${input.fastenersPerM2} fastener${input.fastenersPerM2 === 1 ? '' : 's'} per m² at ` +
      `χ = ${input.pointThermalTransmittanceWPerK} W/K gives ΔU_f = ` +
      `${deltaUWPerM2K.toPrecision(3)} W/(m²·K), by the detailed route of BR 443 (2019) ` +
      '4.8.3(a).',
    warnings: [],
  };
}
