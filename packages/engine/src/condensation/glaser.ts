import { saturationVapourPressurePa } from '../psychrometrics.js';
import type { DegreesCelsius, Metres, Pascals } from '../units.js';
import { AIR_VAPOUR_PERMEABILITY_KG_PER_M_S_PA } from '../vapour.js';
import { type Warning, warning } from '../warnings.js';

/**
 * The Glaser vapour pressure construction, which is the core of the BS EN ISO 13788
 * interstitial condensation assessment.
 *
 * The idea in one paragraph. Plot the element with **cumulative equivalent air layer
 * thickness Sd on the x axis** rather than physical thickness: on that axis a constant
 * vapour flow is a straight line, because the flow through a layer is
 * g = delta_air * dp / Sd. Plot saturation vapour pressure, which follows from the
 * temperature at each interface, as a ceiling. If the straight line from the internal
 * vapour pressure to the external one stays under that ceiling, vapour passes straight
 * through and nothing condenses. Where it would poke through, it cannot: the air there
 * is already saturated, so the surplus condenses and pins the vapour pressure to
 * saturation at that interface.
 *
 * The resulting profile is a taut string from the internal vapour pressure to the
 * external one, pulled up against the saturation ceiling and touching it at the
 * condensation planes. Geometrically that is the **lower convex hull** of the
 * saturation points together with the two end pressures, and that is exactly how it is
 * computed below. Convexity is not an accident of the drawing: slopes that increase
 * along the path mean the vapour flow arriving at each plane is at least the flow
 * leaving it, which is what condensing there requires.
 *
 * Surface vapour resistances are neglected, so the vapour pressure at each surface is
 * that of the adjacent air. TODO(verify): that BS EN ISO 13788 does neglect them, and
 * the clause that says so.
 *
 * TODO(verify): the clause numbers for the construction, for the flow equation
 * g = delta_air * dp / Sd, and for the accumulation procedure in annual.ts.
 */

export interface GlaserNode {
  /** 0 is the internal surface; the last index is the external surface. */
  readonly boundaryIndex: number;
  readonly label: string;
  readonly cumulativeSdM: Metres;
  readonly temperatureC: DegreesCelsius;
}

export interface GlaserNodeResult extends GlaserNode {
  readonly saturationVapourPressurePa: Pascals;
  readonly actualVapourPressurePa: Pascals;
  /** True where the vapour pressure has been pinned to saturation at this node. */
  readonly condensationOccurs: boolean;
  /**
   * Net rate at this plane, kg/(m^2*s). Positive is condensation, negative is
   * evaporation from a plane that was already wet. Zero everywhere else.
   */
  readonly rateKgPerM2S: number;
}

export interface GlaserAssessment {
  readonly nodes: readonly GlaserNodeResult[];
  readonly internalVapourPressurePa: Pascals;
  readonly externalVapourPressurePa: Pascals;
  /** Indices of the interfaces where the profile touches saturation. */
  readonly condensationPlaneIndices: readonly number[];
  /** Sum of the positive rates, kg/(m^2*s). */
  readonly totalCondensationRateKgPerM2S: number;
  /**
   * True when the internal air's vapour pressure is at or above saturation at the
   * internal surface. That is surface condensation, a different problem from the
   * interstitial one, and it is reported rather than folded into the planes.
   */
  readonly surfaceCondensation: boolean;
  /**
   * Which way vapour is being driven. The construction below is the heating-season
   * one and assumes outward flow; 'inward' is reported with a warning rather than
   * silently mirrored.
   */
  readonly vapourFlowDirection: 'outward' | 'inward' | 'none';
  readonly warnings: readonly Warning[];
}

interface Point {
  readonly x: Metres;
  readonly y: Pascals;
}

/**
 * Cross product of OA x OB. Positive means O -> A -> B turns anticlockwise, which for
 * points ordered by increasing x means A sits below the chord OB.
 */
function cross(o: Point, a: Point, b: Point): number {
  return (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
}

/**
 * Lower convex hull of points already sorted by x (Andrew's monotone chain, lower
 * half only). The first and last points are always kept, since they have the extreme
 * x values and are the fixed end pressures.
 */
function lowerConvexHull(points: readonly Point[]): readonly Point[] {
  const hull: Point[] = [];
  for (const point of points) {
    while (hull.length >= 2) {
      const last = hull[hull.length - 1];
      const secondLast = hull[hull.length - 2];
      if (last === undefined || secondLast === undefined) {
        break;
      }
      if (cross(secondLast, last, point) > 0) {
        break;
      }
      hull.pop();
    }
    hull.push(point);
  }
  return hull;
}

/**
 * Read the hull back as a pressure at every original x. A node that is a hull vertex
 * sits on the ceiling and is a condensation plane; the rest are interpolated along the
 * segment they fall in.
 */
function pressuresAlongHull(
  hull: readonly Point[],
  xs: readonly Metres[],
): { readonly pressures: readonly Pascals[]; readonly isVertex: readonly boolean[] } {
  const pressures: Pascals[] = [];
  const isVertex: boolean[] = [];
  let segment = 0;
  for (const x of xs) {
    while (segment < hull.length - 2) {
      const next = hull[segment + 1];
      if (next === undefined || next.x >= x) {
        break;
      }
      segment += 1;
    }
    const a = hull[segment];
    const b = hull[segment + 1];
    if (a === undefined || b === undefined) {
      pressures.push(a?.y ?? 0);
      isVertex.push(true);
      continue;
    }
    const span = b.x - a.x;
    // A zero-width segment happens where two interfaces share an Sd, e.g. a layer with
    // mu = 0. Take the left end rather than dividing by zero.
    const pressure = span === 0 ? a.y : a.y + ((b.y - a.y) * (x - a.x)) / span;
    pressures.push(pressure);
    isVertex.push(hull.some((vertex) => vertex.x === x));
  }
  return { pressures, isVertex };
}

/** Vapour flow through a run of Sd under a pressure difference, kg/(m^2*s). */
export function vapourFlowRateKgPerM2S(
  pressureDifferencePa: Pascals,
  sdM: Metres,
): number {
  if (sdM <= 0) {
    return 0;
  }
  return (AIR_VAPOUR_PERMEABILITY_KG_PER_M_S_PA * pressureDifferencePa) / sdM;
}

export interface GlaserInput {
  readonly nodes: readonly GlaserNode[];
  readonly internalVapourPressurePa: Pascals;
  readonly externalVapourPressurePa: Pascals;
  /**
   * Interfaces already holding condensate from an earlier month. A wet plane stays at
   * saturation whether or not the dry construction would put it there, and can
   * evaporate, so it is forced to be a vertex of the profile.
   */
  readonly wetBoundaryIndices?: readonly number[];
}

/**
 * Build the vapour pressure profile and the condensation or evaporation rate at each
 * interface, for one set of conditions.
 */
export function assessGlaser(input: GlaserInput): GlaserAssessment {
  const { nodes, internalVapourPressurePa, externalVapourPressurePa } = input;
  const wet = new Set(input.wetBoundaryIndices ?? []);
  const warnings: Warning[] = [];

  if (nodes.length < 2) {
    throw new Error('assessGlaser needs at least an internal and an external surface');
  }

  const saturation = nodes.map((node) => saturationVapourPressurePa(node.temperatureC));
  const xs = nodes.map((node) => node.cumulativeSdM);
  const firstNode = nodes[0];
  const lastNode = nodes[nodes.length - 1];
  const firstSaturation = saturation[0];
  if (firstNode === undefined || lastNode === undefined || firstSaturation === undefined) {
    throw new Error('unreachable: node list checked non-empty above');
  }

  const vapourFlowDirection =
    internalVapourPressurePa > externalVapourPressurePa
      ? 'outward'
      : internalVapourPressurePa < externalVapourPressurePa
        ? 'inward'
        : 'none';

  if (vapourFlowDirection === 'inward') {
    warnings.push(
      warning(
        'in-house-convention',
        'The external air is carrying more water vapour than the internal air, so ' +
          'vapour is being driven inward. The BS EN ISO 13788 construction used here ' +
          'is the heating-season one and assumes outward flow; treat this result as ' +
          'indicative only.',
      ),
    );
  }

  /*
   * The profile is built between fixed points: the two end pressures, plus any plane
   * already wet, which is pinned to saturation. Between consecutive fixed points the
   * profile is the lower convex hull of the saturation ceiling, which is what makes
   * new condensation planes appear.
   */
  const fixedIndices = [0, ...[...wet].filter((i) => i > 0 && i < nodes.length - 1).sort((a, b) => a - b), nodes.length - 1];
  const pressures: Pascals[] = new Array<Pascals>(nodes.length).fill(0);
  const isPlane: boolean[] = new Array<boolean>(nodes.length).fill(false);

  for (let segment = 0; segment < fixedIndices.length - 1; segment += 1) {
    const startIndex = fixedIndices[segment];
    const endIndex = fixedIndices[segment + 1];
    if (startIndex === undefined || endIndex === undefined) {
      continue;
    }
    const startPressure =
      startIndex === 0 ? internalVapourPressurePa : (saturation[startIndex] ?? 0);
    const endPressure =
      endIndex === nodes.length - 1 ? externalVapourPressurePa : (saturation[endIndex] ?? 0);

    const points: Point[] = [{ x: xs[startIndex] ?? 0, y: startPressure }];
    for (let i = startIndex + 1; i < endIndex; i += 1) {
      points.push({ x: xs[i] ?? 0, y: saturation[i] ?? 0 });
    }
    points.push({ x: xs[endIndex] ?? 0, y: endPressure });

    const hull = lowerConvexHull(points);
    const segmentXs = xs.slice(startIndex, endIndex + 1);
    const { pressures: segmentPressures } = pressuresAlongHull(hull, segmentXs);

    for (let i = 0; i <= endIndex - startIndex; i += 1) {
      const nodeIndex = startIndex + i;
      pressures[nodeIndex] = segmentPressures[i] ?? 0;
    }
    // Interior hull vertices are where the string touches the ceiling: condensation.
    for (const vertex of hull) {
      const nodeIndex = xs.indexOf(vertex.x);
      if (nodeIndex > 0 && nodeIndex < nodes.length - 1) {
        isPlane[nodeIndex] = true;
      }
    }
  }

  // A plane that was already wet stays a plane even if nothing new condenses there,
  // because it can still evaporate.
  for (const index of wet) {
    if (index > 0 && index < nodes.length - 1) {
      isPlane[index] = true;
    }
  }

  const rates = nodes.map((_node, index) => {
    if (!isPlane[index]) {
      return 0;
    }
    // Flow is measured over the whole straight run to the neighbouring plane or
    // surface, not just to the adjacent interface: the profile is straight between
    // planes, so that whole run carries one flow.
    let inStart = index - 1;
    while (inStart > 0 && !isPlane[inStart]) {
      inStart -= 1;
    }
    let outEnd = index + 1;
    while (outEnd < nodes.length - 1 && !isPlane[outEnd]) {
      outEnd += 1;
    }
    const flowIn = vapourFlowRateKgPerM2S(
      (pressures[inStart] ?? 0) - (pressures[index] ?? 0),
      (xs[index] ?? 0) - (xs[inStart] ?? 0),
    );
    const flowOut = vapourFlowRateKgPerM2S(
      (pressures[index] ?? 0) - (pressures[outEnd] ?? 0),
      (xs[outEnd] ?? 0) - (xs[index] ?? 0),
    );
    return flowIn - flowOut;
  });

  const results: GlaserNodeResult[] = nodes.map((node, index) => ({
    ...node,
    saturationVapourPressurePa: saturation[index] ?? 0,
    actualVapourPressurePa: pressures[index] ?? 0,
    condensationOccurs: isPlane[index] === true,
    rateKgPerM2S: rates[index] ?? 0,
  }));

  const condensationPlaneIndices = results
    .filter((node) => node.condensationOccurs)
    .map((node) => node.boundaryIndex);

  return {
    nodes: results,
    internalVapourPressurePa,
    externalVapourPressurePa,
    condensationPlaneIndices,
    totalCondensationRateKgPerM2S: rates.reduce(
      (total, rate) => total + Math.max(0, rate),
      0,
    ),
    surfaceCondensation: internalVapourPressurePa >= firstSaturation,
    vapourFlowDirection,
    warnings,
  };
}
