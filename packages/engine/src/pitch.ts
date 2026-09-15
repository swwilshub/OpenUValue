import { InvalidInputError } from './errors.js';
import type { HeatFlowDirection } from './types.js';

/**
 * What a roof's pitch does to the direction of heat flow, and so to its surface
 * resistances.
 *
 * BS EN ISO 6946's surface resistances are tabulated by the direction of heat flow, not
 * by the angle of the surface, and the horizontal column applies to heat flowing within
 * ±30° of the horizontal plane. Heat leaves an element normal to its face, so a roof
 * pitched θ from horizontal sends it out at (90 − θ) from horizontal:
 *
 *   flat roof, θ = 0    heat flow 90° from horizontal   straight up
 *   pitched roof, 45°   heat flow 45° from horizontal   still "upward"
 *   steep pitch, 70°    heat flow 20° from horizontal   inside the ±30°, so "horizontal"
 *
 * The switch therefore falls at a pitch of 60°, not at 30°, and it is easy to get the
 * wrong way round: the *shallow* roofs are the ones that use the upward figures, and
 * only a very steep pitch — a mansard's lower slope, a steep dormer cheek — behaves like
 * a wall. That costs 0.03 m²K/W on Rsi, which is worth about 2 % of a 0.15 W/(m²·K) roof
 * and a good deal more on an uninsulated one.
 *
 * **This changes the physics, not the paperwork.** Approved Document L judges a roof as a
 * roof whatever its pitch, so the Part L limit must come from what the element *is*
 * rather than from the direction resolved here. See `partLElementKindForDirection`.
 *
 * TODO(verify): the clause and table in BS EN ISO 6946:2017 that states the ±30° rule,
 * and whether it is expressed there as a direction of heat flow (as taken here) or as an
 * inclination of the surface, which would move the switch from 60° to 30°. The values
 * themselves carry their own TODO in constants.ts. VERIFY.md row V35.
 */

/**
 * Pitch at or above which a roof's heat flow falls within ±30° of horizontal and the
 * element takes a wall's surface resistances. Degrees from horizontal.
 */
export const PITCH_TREATED_AS_VERTICAL_DEGREES = 60;

/** A flat roof is 0°; a vertical surface is 90° and is a wall by any reading. */
export const MAX_PITCH_DEGREES = 90;

/**
 * The direction of heat flow for a roof or ceiling at a given pitch, with heat flowing
 * out of the building through it.
 */
export function heatFlowDirectionForRoofPitch(pitchDegrees: number): HeatFlowDirection {
  if (!Number.isFinite(pitchDegrees) || pitchDegrees < 0 || pitchDegrees > MAX_PITCH_DEGREES) {
    throw new InvalidInputError(
      'pitchDegrees',
      `a roof pitch runs from 0 to ${MAX_PITCH_DEGREES} degrees, got ${pitchDegrees}`,
    );
  }
  return pitchDegrees >= PITCH_TREATED_AS_VERTICAL_DEGREES ? 'horizontal' : 'upward';
}

/** How far the heat flow sits from the horizontal plane, in degrees. For explaining. */
export function heatFlowAngleFromHorizontalDegrees(pitchDegrees: number): number {
  if (!Number.isFinite(pitchDegrees) || pitchDegrees < 0 || pitchDegrees > MAX_PITCH_DEGREES) {
    throw new InvalidInputError(
      'pitchDegrees',
      `a roof pitch runs from 0 to ${MAX_PITCH_DEGREES} degrees, got ${pitchDegrees}`,
    );
  }
  return MAX_PITCH_DEGREES - pitchDegrees;
}
