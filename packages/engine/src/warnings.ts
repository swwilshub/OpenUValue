/**
 * Modelling limits are reported, never hidden. A warning means "the number is the
 * best this method can do, and here is why you should know that", as distinct from
 * an InvalidInputError, which means the caller passed nonsense.
 */
export type WarningCode =
  /** ISO 6946 combined method: R'T/R''T exceeded the applicability limit. */
  | 'combined-method-ratio-exceeds-limit'
  /** ISO 6946: the combined method is not applicable to metal-penetrated insulation. */
  | 'metal-bridging-out-of-scope'
  /** Air layer thickness fell outside the tabulated range and was clamped. */
  | 'air-layer-thickness-out-of-table'
  /** Slightly ventilated air layer resistance obtained by interpolation. */
  | 'slightly-ventilated-interpolated'
  /** Well-ventilated air layer: that layer and everything outboard of it ignored. */
  | 'well-ventilated-outer-layers-ignored'
  /** An in-house convention (not a standard method) contributed to this result. */
  | 'in-house-convention'
  /** A value used here still needs checking against the printed standard. */
  | 'value-needs-verification';

export interface Warning {
  readonly code: WarningCode;
  readonly message: string;
  /** The layer the warning arose from, where it is layer-specific. */
  readonly layerId?: string;
}

export function warning(code: WarningCode, message: string, layerId?: string): Warning {
  return layerId === undefined ? { code, message } : { code, message, layerId };
}

/** Concatenate warning lists, dropping exact duplicates but keeping order. */
export function mergeWarnings(...groups: readonly (readonly Warning[])[]): readonly Warning[] {
  const seen = new Set<string>();
  const out: Warning[] = [];
  for (const group of groups) {
    for (const item of group) {
      const key = `${item.code}|${item.layerId ?? ''}|${item.message}`;
      if (!seen.has(key)) {
        seen.add(key);
        out.push(item);
      }
    }
  }
  return out;
}
