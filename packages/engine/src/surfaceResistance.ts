import {
  type ExternalEnvironmentDefinition,
  type InternalSurfaceConditionDefinition,
  externalEnvironment,
  internalSurfaceCondition,
} from './boundary.js';
import { SURFACE_RESISTANCES_M2K_PER_W } from './constants.js';
import { InvalidInputError, assertNonNegative } from './errors.js';
import type { BuildingElement, HeatFlowDirection } from './types.js';
import type { SquareMetreKelvinPerWatt } from './units.js';

export interface SurfaceResistances {
  readonly rsiM2KPerW: SquareMetreKelvinPerWatt;
  readonly rseM2KPerW: SquareMetreKelvinPerWatt;
}

/** Where a resolved surface resistance came from, so the UI can explain the figure. */
export type SurfaceResistanceBasis =
  /** The BS EN ISO 6946 table for this direction of heat flow. */
  | 'iso6946-tabulated'
  /** Rsi raised for an obstructed internal surface (DIN 4108-3). */
  | 'reduced-air-circulation'
  /** Rse taken as the still-air internal value, per the external environment. */
  | 'still-air-equal-to-rsi'
  /** A number the caller supplied outright. */
  | 'caller-override';

export interface ResolvedSurfaceResistances extends SurfaceResistances {
  readonly rsiBasis: SurfaceResistanceBasis;
  readonly rseBasis: SurfaceResistanceBasis;
  readonly internalCondition: InternalSurfaceConditionDefinition;
  readonly external: ExternalEnvironmentDefinition;
}

/**
 * Tabulated internal and external surface resistances for a direction of heat flow.
 * BS EN ISO 6946, adopted unchanged by BR 443 for UK U-value work. See constants.ts.
 */
export function surfaceResistances(direction: HeatFlowDirection): SurfaceResistances {
  return SURFACE_RESISTANCES_M2K_PER_W[direction];
}

/**
 * Surface resistances for an element, in order of precedence:
 *
 *   1. an explicit rsi/rse override, taken as given;
 *   2. the internal surface condition and the external environment (boundary.ts);
 *   3. the BS EN ISO 6946 table for the direction of heat flow.
 *
 * An unsupported external environment throws rather than falling back to outside
 * air. Silently substituting a different boundary would produce a confident number
 * for a calculation this engine cannot do - see 'ground'.
 */
export function resolveSurfaceResistancesDetailed(
  element: BuildingElement,
): ResolvedSurfaceResistances {
  const tabulated = surfaceResistances(element.heatFlowDirection);
  const condition = internalSurfaceCondition(
    element.internalSurfaceCondition ?? 'normal-air-circulation',
  );
  const external = externalEnvironment(element.externalEnvironment ?? 'outside-air');

  if (!external.supported) {
    throw new InvalidInputError(
      'externalEnvironment',
      `"${external.label}" is not supported: ${external.unsupportedReason ?? ''}`.trim(),
    );
  }
  if (!external.applicableDirections.includes(element.heatFlowDirection)) {
    throw new InvalidInputError(
      'externalEnvironment',
      `"${external.label}" does not apply to ${element.heatFlowDirection} heat flow`,
    );
  }

  const rsiOverride = element.rsiOverrideM2KPerW;
  const rseOverride = element.rseOverrideM2KPerW;
  if (rsiOverride !== undefined) {
    assertNonNegative(rsiOverride, 'rsiOverrideM2KPerW');
  }
  if (rseOverride !== undefined) {
    assertNonNegative(rseOverride, 'rseOverrideM2KPerW');
  }

  const conditionRsi = condition.fixedRsiM2KPerW ?? tabulated.rsiM2KPerW;
  const rsiM2KPerW = rsiOverride ?? conditionRsi;

  // Rse follows the *resolved* Rsi where the environment calls for still air, so a
  // reduced-circulation internal surface carries through to both faces of, say, an
  // internal partition rather than being silently dropped on the outer one.
  const environmentRse =
    external.rseTreatment === 'still-air-equal-to-rsi' ? rsiM2KPerW : tabulated.rseM2KPerW;
  const rseM2KPerW = rseOverride ?? environmentRse;

  return {
    rsiM2KPerW,
    rseM2KPerW,
    rsiBasis:
      rsiOverride !== undefined
        ? 'caller-override'
        : condition.fixedRsiM2KPerW !== undefined
          ? 'reduced-air-circulation'
          : 'iso6946-tabulated',
    rseBasis:
      rseOverride !== undefined
        ? 'caller-override'
        : external.rseTreatment === 'still-air-equal-to-rsi'
          ? 'still-air-equal-to-rsi'
          : 'iso6946-tabulated',
    internalCondition: condition,
    external,
  };
}

/** The resolved Rsi and Rse alone, for callers that do not need the reasoning. */
export function resolveSurfaceResistances(element: BuildingElement): SurfaceResistances {
  const { rsiM2KPerW, rseM2KPerW } = resolveSurfaceResistancesDetailed(element);
  return { rsiM2KPerW, rseM2KPerW };
}
