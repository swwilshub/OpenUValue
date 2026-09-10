import type { BuildingElement, EnvironmentConditions, SectionPath } from '../types.js';
import type { DegreesCelsius, Metres, Pascals } from '../units.js';
import type { Warning } from '../warnings.js';

/**
 * Extension point for interstitial condensation methods. Nothing implements this in
 * Phase 1 - the Phase 1 verdict is the surface-temperature-against-dew-point check in
 * temperatureProfile.ts. The interface exists now so that BS EN ISO 13788 and the
 * DIN 4108-3 Glaser method can be added as *alternatives*, selected by the caller,
 * rather than one of them becoming hard-wired into the U-value path.
 *
 * Two rules are baked into the contract deliberately:
 *
 *  1. A method is handed **every** section path, not one chosen path. The bridging
 *     path carries the higher heat flux, so it runs colder at the internal surface
 *     but warmer through the outer layers, including the sheathing where interstitial
 *     condensation usually forms. Neither path is conservative everywhere, so the
 *     worst result is taken at each interface.
 *  2. A method reports per-interface results keyed by boundary index, so the caller
 *     can reduce across paths without knowing anything about the method.
 *
 * What a method adds over Phase 1's `isBelowInternalDewPoint` is the vapour side: an
 * interface colder than the internal dew point only condenses if vapour reaches it at
 * saturation pressure, which depends on the Sd of the layers inboard of it. Phase 1
 * reports the temperature condition alone and says so; a method here compares the
 * actual vapour pressure profile against saturation and can therefore clear
 * interfaces that the screening indicator flags.
 */
export interface CondensationInterfaceResult {
  /** Boundary index: 0 is the internal surface, n is the external surface. */
  readonly boundaryIndex: number;
  readonly temperatureC: DegreesCelsius;
  readonly saturationVapourPressurePa: Pascals;
  readonly actualVapourPressurePa: Pascals;
  readonly cumulativeSdM: Metres;
  /** True where the actual vapour pressure reaches saturation at this interface. */
  readonly condensationOccurs: boolean;
  /** Accumulated condensate, kg/m^2, where the method quantifies it. */
  readonly condensateKgPerM2?: number;
}

export interface CondensationResult {
  readonly methodId: string;
  readonly standard: string;
  readonly interfaces: readonly CondensationInterfaceResult[];
  readonly warnings: readonly Warning[];
}

export interface CondensationMethodInput {
  readonly element: BuildingElement;
  readonly conditions: EnvironmentConditions;
  /** Every 1D path through the element; see rule 1 above. */
  readonly paths: readonly SectionPath[];
}

export interface CondensationMethod<TOptions = void> {
  readonly id: 'iso13788-glaser' | 'din4108-3-glaser';
  /** Human-readable standard reference, shown in the UI alongside the result. */
  readonly standard: string;
  run(input: CondensationMethodInput, options: TOptions): CondensationResult;
}

/**
 * Reduce per-path results to the worst case at each interface. This is the reduction
 * the UI must use, whichever profile is on display, so that the display mode cannot
 * change a safety verdict.
 */
export function worstCasePerInterface(
  perPathResults: readonly CondensationResult[],
): readonly CondensationInterfaceResult[] {
  const byBoundary = new Map<number, CondensationInterfaceResult>();
  for (const result of perPathResults) {
    for (const item of result.interfaces) {
      const existing = byBoundary.get(item.boundaryIndex);
      // "Worst" = condensation occurring beats not occurring; among those, the
      // coldest interface, since that is the one furthest into saturation.
      const isWorse =
        existing === undefined ||
        (item.condensationOccurs && !existing.condensationOccurs) ||
        (item.condensationOccurs === existing.condensationOccurs &&
          item.temperatureC < existing.temperatureC);
      if (isWorse) {
        byBoundary.set(item.boundaryIndex, item);
      }
    }
  }
  return [...byBoundary.values()].sort((a, b) => a.boundaryIndex - b.boundaryIndex);
}

/** Registry of available methods. Empty in Phase 1. */
export const CONDENSATION_METHODS: readonly CondensationMethod<never>[] = [];
