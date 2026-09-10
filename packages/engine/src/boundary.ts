import { REDUCED_AIR_CIRCULATION_RSI_M2K_PER_W } from './constants.js';
import { InvalidInputError } from './errors.js';
import type { HeatFlowDirection } from './types.js';

/**
 * What sits against each face of the element. This is separate from the layers
 * themselves: the same wall build-up behaves differently facing outside air, a
 * ventilated cladding cavity, or an unheated garage, and the difference is carried
 * entirely by the surface resistances and by which air temperature applies outside.
 *
 * Keeping these as named cases rather than as raw Rsi/Rse numbers means the reason
 * for a surface resistance survives into the result, so the UI can say *why* a figure
 * is what it is rather than presenting an unexplained override.
 */

/* -------------------------------------------------------- internal surface ---- */

/**
 * How freely air moves across the internal surface.
 *
 * - `normal-air-circulation` uses the BS EN ISO 6946 tabulated Rsi. This is the case
 *   for a U-value calculation to BR 443.
 * - `reduced-air-circulation` raises Rsi to account for furniture, curtains,
 *   decoration, corners and niches obstructing the surface. It lowers the internal
 *   surface temperature and is the unfavourable case for moisture protection and for
 *   panel heating. See REDUCED_AIR_CIRCULATION_RSI_M2K_PER_W for the DIN 4108-3
 *   attribution and its TODO(verify).
 */
export type InternalSurfaceCondition = 'normal-air-circulation' | 'reduced-air-circulation';

export interface InternalSurfaceConditionDefinition {
  readonly kind: InternalSurfaceCondition;
  readonly label: string;
  /** One line, for the control itself. Plain language, no clause numbers. */
  readonly summary: string;
  /** The full reasoning, for a consumer that offers somewhere to put it. */
  readonly description: string;
  /**
   * A fixed Rsi that replaces the tabulated value, or undefined to use the tabulated
   * value for the element's heat-flow direction.
   */
  readonly fixedRsiM2KPerW?: number;
  /** True where the case comes from somewhere other than BS EN ISO 6946 / BR 443. */
  readonly departsFromIso6946: boolean;
}

export const INTERNAL_SURFACE_CONDITIONS: readonly InternalSurfaceConditionDefinition[] = [
  {
    kind: 'normal-air-circulation',
    label: 'Free air circulation',
    summary: 'Nothing against the wall. The normal case for a U-value.',
    description:
      'An unobstructed internal surface. Uses the BS EN ISO 6946 surface resistance ' +
      'for the direction of heat flow, as BR 443 requires for a UK U-value.',
    departsFromIso6946: false,
  },
  {
    kind: 'reduced-air-circulation',
    label: 'Reduced air circulation',
    summary:
      'Furniture, curtains, a corner or a niche against the surface. The cautious ' +
      'case for damp and mould.',
    description:
      'Furniture, decoration, corners and niches hinder air exchange at the internal ' +
      'surface. The most unfavourable case for panel heating and for moisture ' +
      'protection, and the case DIN 4108-3 assesses. Raises Rsi, which lowers the ' +
      'internal surface temperature and also raises the total resistance, so the ' +
      'U-value it produces is not a BR 443 U-value.',
    fixedRsiM2KPerW: REDUCED_AIR_CIRCULATION_RSI_M2K_PER_W,
    departsFromIso6946: true,
  },
];

export function internalSurfaceCondition(
  kind: InternalSurfaceCondition,
): InternalSurfaceConditionDefinition {
  const found = INTERNAL_SURFACE_CONDITIONS.find((candidate) => candidate.kind === kind);
  if (found === undefined) {
    throw new InvalidInputError('internalSurfaceCondition', `unknown condition "${kind}"`);
  }
  return found;
}

/* ------------------------------------------------------ external environment --- */

/**
 * What the outer face of the element faces. Several of these are not "external" in
 * the everyday sense - an internal partition faces another heated room - but they
 * occupy the same slot in the calculation.
 */
export type ExternalEnvironmentKind =
  | 'outside-air'
  | 'rear-ventilated-cladding'
  | 'rear-ventilated-roofing'
  | 'unheated-room'
  | 'unheated-roof-space'
  | 'heated-room'
  | 'ground';

/**
 * How the external surface resistance is obtained for an environment.
 *
 * - `tabulated`: the BS EN ISO 6946 Rse for the direction of heat flow (0.04 for all
 *   three), which is the moving-air case.
 * - `still-air-equal-to-rsi`: Rse is taken as the *internal* surface resistance for
 *   the same direction. BS EN ISO 6946 specifies this both behind a well-ventilated
 *   air layer and for an element adjacent to an unheated space: in each case the air
 *   on the outer face is still rather than wind-driven.
 *   TODO(verify): the clause for the unheated-space case, and whether BS EN ISO 6946
 *   or BR 443 additionally require the unheated space's own resistance R_u to be
 *   added. R_u is not applied here - see ROADMAP.md, Phase 2.
 */
export type RseTreatment = 'tabulated' | 'still-air-equal-to-rsi';

export interface ExternalEnvironmentDefinition {
  readonly kind: ExternalEnvironmentKind;
  readonly label: string;
  /** One line, for the control itself. Plain language, no clause numbers. */
  readonly summary: string;
  /** The full reasoning, for a consumer that offers somewhere to put it. */
  readonly description: string;
  readonly rseTreatment: RseTreatment;
  /**
   * Directions of heat flow this environment can sensibly apply to. A rear-ventilated
   * roofing build-up is not a wall, and offering it for one invites nonsense.
   */
  readonly applicableDirections: readonly HeatFlowDirection[];
  /**
   * False where OpenUValue cannot calculate this case at all. The engine refuses
   * rather than approximating, and the UI disables the option.
   */
  readonly supported: boolean;
  /** Why an unsupported environment is unsupported, for the UI to show. */
  readonly unsupportedReason?: string;
  /**
   * True where the air on the far side is at a temperature the user must supply,
   * because it is neither outside air nor a value any standard fixes for them.
   */
  readonly needsOwnAirTemperature: boolean;
}

export const EXTERNAL_ENVIRONMENTS: readonly ExternalEnvironmentDefinition[] = [
  {
    kind: 'outside-air',
    label: 'Direct contact to outside air',
    summary: 'Open air on the far side, as on a normal external wall or roof.',
    description:
      'The outer surface is exposed to moving outside air. BS EN ISO 6946 Rse for ' +
      'the direction of heat flow.',
    rseTreatment: 'tabulated',
    applicableDirections: ['upward', 'horizontal', 'downward'],
    supported: true,
    needsOwnAirTemperature: false,
  },
  {
    kind: 'rear-ventilated-cladding',
    label: 'Rear ventilated cladding',
    summary: 'Cladding on battens with an open cavity behind it.',
    description:
      'A ventilated cavity behind a cladding. The cavity and everything outboard of ' +
      'it are disregarded and the outer face sees still air, so Rse takes the ' +
      'internal-surface value (BS EN ISO 6946).',
    rseTreatment: 'still-air-equal-to-rsi',
    applicableDirections: ['horizontal'],
    supported: true,
    needsOwnAirTemperature: false,
  },
  {
    kind: 'rear-ventilated-roofing',
    label: 'Rear ventilated roofing',
    summary: 'Tiles or sheeting with a ventilated space beneath.',
    description:
      'A ventilated cavity beneath a roof covering. Treated as for rear ventilated ' +
      'cladding, with the covering and the cavity disregarded.',
    rseTreatment: 'still-air-equal-to-rsi',
    applicableDirections: ['upward', 'downward'],
    supported: true,
    needsOwnAirTemperature: false,
  },
  {
    kind: 'unheated-room',
    label: 'Non-heated room',
    summary: 'A garage, porch or store that is not heated.',
    description:
      'An unheated space such as a garage or store. Still air on the outer face, so ' +
      'Rse takes the internal-surface value. The space is warmer than outside, and ' +
      'its temperature has to be supplied.',
    rseTreatment: 'still-air-equal-to-rsi',
    applicableDirections: ['upward', 'horizontal', 'downward'],
    supported: true,
    needsOwnAirTemperature: true,
  },
  {
    kind: 'unheated-roof-space',
    label: 'Unheated roof space',
    summary: 'A cold loft above the insulation.',
    description:
      'A cold loft above the insulated ceiling. Still air on the outer face, so Rse ' +
      'takes the internal-surface value, and the loft temperature has to be supplied.',
    rseTreatment: 'still-air-equal-to-rsi',
    applicableDirections: ['upward', 'downward'],
    supported: true,
    needsOwnAirTemperature: true,
  },
  {
    kind: 'heated-room',
    label: 'Heated room',
    summary: 'Another heated room: an internal wall or an intermediate floor.',
    description:
      'An internal partition or intermediate floor between two heated rooms. Still ' +
      'air on both faces. With equal temperatures either side there is no heat flow ' +
      'and no condensation risk; the U-value still describes the construction.',
    rseTreatment: 'still-air-equal-to-rsi',
    applicableDirections: ['upward', 'horizontal', 'downward'],
    supported: true,
    needsOwnAirTemperature: true,
  },
  {
    kind: 'ground',
    label: 'Ground',
    summary: 'A floor on the ground, or a basement wall.',
    description:
      'A ground-bearing floor or basement wall. Heat loss to the ground depends on ' +
      'the floor area, exposed perimeter and wall thickness, not on the build-up ' +
      'alone, so it cannot be obtained from a surface resistance.',
    rseTreatment: 'tabulated',
    applicableDirections: ['downward', 'horizontal'],
    supported: false,
    unsupportedReason:
      'Ground heat loss is BS EN ISO 13370, which OpenUValue does not implement. ' +
      'See ROADMAP.md, Phase 2. Treating the ground as outside air would materially ' +
      'overstate the heat loss, so it is refused rather than approximated.',
    needsOwnAirTemperature: true,
  },
];

export function externalEnvironment(
  kind: ExternalEnvironmentKind,
): ExternalEnvironmentDefinition {
  const found = EXTERNAL_ENVIRONMENTS.find((candidate) => candidate.kind === kind);
  if (found === undefined) {
    throw new InvalidInputError('externalEnvironment', `unknown environment "${kind}"`);
  }
  return found;
}

/** Environments that make sense for a direction of heat flow, in listing order. */
export function externalEnvironmentsForDirection(
  direction: HeatFlowDirection,
): readonly ExternalEnvironmentDefinition[] {
  return EXTERNAL_ENVIRONMENTS.filter((environment) =>
    environment.applicableDirections.includes(direction),
  );
}
