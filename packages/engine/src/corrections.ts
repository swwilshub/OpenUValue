import { type FastenerAssessment, type FastenerInput, assessFasteners } from './fasteners.js';
import type { SquareMetreKelvinPerWatt, WattsPerSquareMetreKelvin } from './units.js';
import type { HeatFlowDirection } from './types.js';
import { type Warning, warning } from './warnings.js';

/**
 * Corrections to thermal transmittance, ΔU.
 *
 * BS EN ISO 6946 calculates U for an idealised element and then adds corrections for
 * the ways a real one falls short of it. BR 443 (2019) 4.8 lists three:
 *
 *   - air gaps in an insulation layer          (implemented here)
 *   - mechanical fasteners through insulation  (not implemented — see below)
 *   - inverted roofs, where rain runs over the insulation (not implemented)
 *
 * The U-value is calculated without them and the correction added afterwards, so this
 * module deliberately does not touch the resistance chain.
 *
 * **Fasteners** are in fasteners.ts. BR 443 4.8.3 gives two routes and this engine
 * implements the detailed one, ΔU_f = χ · n_f, which that clause specifies completely;
 * the approximate route needs BS EN ISO 6946 Annex F.3.2, which BR 443 points at without
 * reproducing, so it is absent rather than guessed.
 *
 * **Inverted roofs** — the precipitation correction ΔU_r — are still not implemented.
 *
 * The 3 % omission threshold applies to the **sum** of the corrections, which is why
 * they are all totalled here rather than each deciding its own fate. BR 443 (2019) 4.8
 * is explicit: "The 3% relates to the total corrections. For example, if there are both
 * wall ties and air gaps, the 3% threshold applies to the sum of the ΔU values from each
 * cause."
 */

/**
 * Air gaps in an insulation layer, BR 443 (2019) 4.8.1, which sets out the three
 * levels BS EN ISO 6946 Annex F recognises.
 *
 * Level 1 is the default and should be assumed unless the conditions for Level 0 are
 * met — that is the standard's own instruction, not a cautious reading of it.
 */
export type AirGapLevel = 'level-0' | 'level-1' | 'level-2';

export interface AirGapLevelDefinition {
  readonly level: AirGapLevel;
  readonly label: string;
  /** ΔU_g in W/(m²·K). */
  readonly deltaUWPerM2K: WattsPerSquareMetreKelvin;
  readonly description: string;
}

export const AIR_GAP_LEVELS: readonly AirGapLevelDefinition[] = [
  {
    level: 'level-0',
    label: 'No correction',
    deltaUWPerM2K: 0.0,
    description:
      'No air voids within the insulation, or only minor ones with no significant ' +
      'effect — gaps not exceeding 5 mm penetrating the layer. Applies to double-layer ' +
      'insulation, and to single-layer boards with lapped or sealed joints or with ' +
      'tolerances tight enough that no gap will exceed 5 mm.',
  },
  {
    level: 'level-1',
    label: 'Gaps bridging the layer',
    deltaUWPerM2K: 0.01,
    description:
      'Air gaps bridge between the cold and warm sides of the insulation but do not ' +
      'cause air to circulate between them, and either the sum of the length or width ' +
      'tolerance and the dimensional stability exceeds 5 mm, or the squareness ' +
      'tolerance exceeds 5 mm. This is the default.',
  },
  {
    level: 'level-2',
    label: 'Gaps allowing air circulation',
    deltaUWPerM2K: 0.04,
    description:
      'Gaps as at level 1, and air can also circulate between the warm and cold sides ' +
      'of the insulation layer. Applies for example to partial cavity fill where the ' +
      'boards are not fixed back to the inner leaf.',
  },
];

/** BR 443 (2019) 4.8.1: level 1 unless the conditions for level 0 are met. */
export const DEFAULT_AIR_GAP_LEVEL: AirGapLevel = 'level-1';

export function airGapLevel(level: AirGapLevel): AirGapLevelDefinition {
  const found = AIR_GAP_LEVELS.find((candidate) => candidate.level === level);
  if (found === undefined) {
    throw new Error(`unknown air gap level "${level}"`);
  }
  return found;
}

/**
 * BS EN ISO 6946 6.5.2 and BR 443 (2019) 4.8: corrections need not be applied where
 * the total comes to less than 3 % of the uncorrected transmittance. The threshold
 * applies to the **sum** of all corrections, not to each one separately, so it can
 * only be tested once they have all been calculated.
 */
export const DELTA_U_NEGLIGIBLE_FRACTION = 0.03;

export interface CorrectionInput {
  readonly uncorrectedUValueWPerM2K: WattsPerSquareMetreKelvin;
  readonly heatFlowDirection: HeatFlowDirection;
  /**
   * Air gaps in the insulation. Omit where the element has no insulation layer for
   * gaps to occur in.
   */
  readonly airGapLevel?: AirGapLevel;
  /**
   * Total resistance, needed because ΔU_g is scaled by how much of the element's
   * resistance the insulation provides. See computeCorrections.
   */
  readonly totalResistanceM2KPerW: SquareMetreKelvinPerWatt;
  /** Resistance of the insulation layer the gaps are in. */
  readonly insulationResistanceM2KPerW?: SquareMetreKelvinPerWatt;
  /**
   * Mechanical fasteners through the insulation. Omit where there are none, or where
   * the fixings are not known — a missing ΔU_f under-reports the U-value, so the UI
   * should say so rather than letting absence read as zero.
   */
  readonly fasteners?: FastenerInput;
}

export interface CorrectionResult {
  /** ΔU for air gaps, W/(m²·K). */
  readonly airGapDeltaUWPerM2K: WattsPerSquareMetreKelvin;
  /** ΔU for mechanical fasteners, W/(m²·K). Zero where none were given. */
  readonly fastenerDeltaUWPerM2K: WattsPerSquareMetreKelvin;
  /** The full fastener assessment, so a caller can say *why* ΔU_f came out as it did. */
  readonly fasteners?: FastenerAssessment;
  /** Sum of every correction applied. */
  readonly totalDeltaUWPerM2K: WattsPerSquareMetreKelvin;
  /** True where the total is under 3 % of U and may be omitted. */
  readonly isNegligible: boolean;
  /** The transmittance with corrections applied, or the uncorrected one if negligible. */
  readonly correctedUValueWPerM2K: WattsPerSquareMetreKelvin;
  readonly warnings: readonly Warning[];
}

/**
 * Apply the corrections this engine can calculate.
 *
 * ΔU_g is not simply the tabulated figure: BS EN ISO 6946 Annex F scales it by the
 * square of the fraction of the element's resistance that the insulation provides,
 *
 *   ΔU_g = ΔU'' × (R_insulation / R_total)²
 *
 * so gaps in a thin layer inside a well-insulated build-up matter less than gaps that
 * are most of the element's resistance. Where the insulation resistance is not given,
 * the unscaled figure is used and a warning says so, which is the conservative choice.
 *
 * TODO(verify): the squared-ratio scaling and its formula number in BS EN ISO 6946
 * Annex F. BR 443 4.8.1 gives the three ΔU'' levels but not the scaling, and the annex
 * is not in the freely published preview. The levels themselves are attributable; the
 * scaling is not yet.
 */
export function computeCorrections(input: CorrectionInput): CorrectionResult {
  const warnings: Warning[] = [];
  let airGapDeltaU = 0;

  if (input.airGapLevel !== undefined) {
    const level = airGapLevel(input.airGapLevel);
    if (input.heatFlowDirection === 'downward') {
      // BR 443 4.8.1: the air gap correction applies to walls and roofs but not to
      // floors, because convection is suppressed when heat flows downwards.
      if (level.deltaUWPerM2K > 0) {
        warnings.push(
          warning(
            'in-house-convention',
            'No air gap correction is applied to a floor: BR 443 4.8.1 excludes it ' +
              'because convection is suppressed when heat flows downwards.',
          ),
        );
      }
    } else if (
      input.insulationResistanceM2KPerW === undefined ||
      input.totalResistanceM2KPerW <= 0
    ) {
      airGapDeltaU = level.deltaUWPerM2K;
      if (level.deltaUWPerM2K > 0) {
        warnings.push(
          warning(
            'value-needs-verification',
            'The air gap correction was applied unscaled because no insulation layer ' +
              'was identified. BS EN ISO 6946 Annex F scales it by the share of the ' +
              "element's resistance the insulation provides, so this is an over-estimate.",
          ),
        );
      }
    } else {
      const ratio = input.insulationResistanceM2KPerW / input.totalResistanceM2KPerW;
      airGapDeltaU = level.deltaUWPerM2K * ratio * ratio;
    }
  }

  const fasteners =
    input.fasteners === undefined ? undefined : assessFasteners(input.fasteners);
  if (fasteners !== undefined) {
    warnings.push(...fasteners.warnings);
  }
  const fastenerDeltaU = fasteners?.deltaUWPerM2K ?? 0;

  const total = airGapDeltaU + fastenerDeltaU;
  const isNegligible = total < DELTA_U_NEGLIGIBLE_FRACTION * input.uncorrectedUValueWPerM2K;

  return {
    airGapDeltaUWPerM2K: airGapDeltaU,
    fastenerDeltaUWPerM2K: fastenerDeltaU,
    ...(fasteners === undefined ? {} : { fasteners }),
    totalDeltaUWPerM2K: total,
    isNegligible,
    // The standard permits omitting a negligible total; it is still reported, so a
    // caller can show what was left out rather than silently losing it.
    correctedUValueWPerM2K: isNegligible
      ? input.uncorrectedUValueWPerM2K
      : input.uncorrectedUValueWPerM2K + total,
    warnings,
  };
}
