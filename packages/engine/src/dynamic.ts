import {
  type Matrix2,
  ONE,
  argument,
  complex,
  divide,
  isFinite as complexIsFinite,
  modulus,
  multiplyMatrix,
  scale,
  subtract,
} from './complex.js';
import { InvalidInputError } from './errors.js';
import { layerSectionResistances } from './resistance.js';
import { resolveSurfaceResistancesDetailed } from './surfaceResistance.js';
import type { BuildingElement, HeatFlowDirection, Layer, MaterialProperties } from './types.js';
import type { SquareMetreKelvinPerWatt, WattsPerSquareMetreKelvin } from './units.js';
import { type Warning, warning } from './warnings.js';

/**
 * BS EN ISO 13786 — dynamic thermal characteristics.
 *
 * A U-value answers a steady question: hold one side at 20 °C and the other at 0 °C
 * for ever, and this much heat crosses. It says nothing about a construction's response
 * to a temperature that swings, which is the question that decides whether a room
 * overheats in August and whether thermal mass is doing anything useful.
 *
 * The method treats the outside temperature as a sinusoid of period T (24 hours by
 * convention) and solves the heat equation for the resulting steady oscillation. Each
 * layer becomes a 2x2 complex matrix relating the temperature and heat flow amplitudes
 * at its two faces; multiplying them gives the element's matrix, from which four things
 * follow:
 *
 *   Y_ie  periodic thermal transmittance, W/(m^2*K) — how much of a swing gets through
 *   f     decrement factor, |Y_ie| / U — the same thing relative to the steady U-value
 *   dt    time shift, hours — how much later the peak arrives inside
 *   kappa areal heat capacity, kJ/(m^2*K) — how much heat a face can absorb and release
 *
 * kappa is the one SAP 10.3 asks for, as the basis of its thermal mass parameter.
 *
 * **On the derivation.** BS EN ISO 13786 is not freely published, so rather than
 * transcribe formulae that could not be checked, the layer matrix here is derived from
 * the one-dimensional heat equation and verified two ways (see the tests):
 *
 *   dtheta/dt = a * d2theta/dx2,  with a = lambda / (rho * c)
 *
 * For a sinusoid at angular frequency w, theta(x,t) = Re[Theta(x) * exp(j*w*t)] gives
 * Theta'' = (j*w/a) * Theta, whose solution has wavenumber k = sqrt(j*w/a) = (1+j)/delta
 * where delta = sqrt(a*T/pi) is the periodic penetration depth. With heat flow
 * Q = -lambda * Theta', integrating across a layer of thickness d gives
 *
 *   [ Theta(d) ]   [   cosh(k*d)          -sinh(k*d)/(lambda*k) ] [ Theta(0) ]
 *   [   Q(d)   ] = [ -lambda*k*sinh(k*d)       cosh(k*d)        ] [   Q(0)   ]
 *
 * which expands, with xi = d/delta, into the real and imaginary parts written in
 * layerMatrix below. This is the standard's method — it is the only solution of the
 * heat equation for this problem, so an independent derivation lands in the same place
 * rather than somewhere merely similar.
 *
 * TODO(verify): the clause, equation and table numbers in BS EN ISO 13786:2017 for the
 * layer matrix, the element matrix ordering, and the definitions of Y_ie, f, dt and
 * kappa; and whether the standard's sign convention for the time shift matches the one
 * documented at timeShiftHours below. The physics is checked; the paragraph numbers are
 * not, and the standard may also specify rounding or reporting conventions we do not
 * apply. See VERIFY.md.
 */

/**
 * The daily cycle, in seconds. BS EN ISO 13786 is written for an arbitrary period and
 * defines the tabulated cases for 24 hours, which is the one that matters for summer
 * overheating; a year is used for ground-coupled elements.
 */
export const DEFAULT_PERIOD_S = 86400;

/**
 * Above this many penetration depths a layer is effectively semi-infinite: cosh and
 * sinh of xi are within a rounding error of each other and the matrix stops carrying
 * usable information, while the terms themselves grow towards overflow. Well beyond any
 * real construction — at 24 hours, masonry has a penetration depth of order 0.1 m, so
 * this is several metres of solid stone.
 */
const MAX_PENETRATION_DEPTHS = 40;

export interface DynamicOptions {
  /** Excitation period in seconds. Defaults to 24 hours. */
  readonly periodS?: number;
}

/** One slab in a section path: either something with mass, or a bare resistance. */
type Slab =
  | {
      readonly kind: 'massive';
      readonly layerId: string;
      readonly thicknessM: number;
      readonly lambdaWPerMK: number;
      readonly densityKgPerM3: number;
      readonly specificHeatCapacityJPerKgK: number;
    }
  | {
      readonly kind: 'massless';
      readonly layerId: string;
      readonly resistanceM2KPerW: SquareMetreKelvinPerWatt;
    };

/**
 * The matrix of a layer that stores heat.
 *
 * delta = sqrt(lambda * T / (pi * rho * c)) is the periodic penetration depth: the
 * distance into the material at which the swing has fallen to 1/e of its surface value.
 * xi = d / delta is therefore the layer's thickness measured in those depths, and it is
 * the only shape the answer depends on.
 */
function layerMatrix(slab: Extract<Slab, { kind: 'massive' }>, periodS: number): Matrix2 {
  const { lambdaWPerMK: lambda, densityKgPerM3: rho, specificHeatCapacityJPerKgK: c } = slab;
  const penetrationDepthM = Math.sqrt((lambda * periodS) / (Math.PI * rho * c));
  const xi = slab.thicknessM / penetrationDepthM;

  const sinhXi = Math.sinh(xi);
  const coshXi = Math.cosh(xi);
  const sinXi = Math.sin(xi);
  const cosXi = Math.cos(xi);

  // Written out because these two products appear four times between them, and naming
  // them is what makes the sign pattern below checkable by eye.
  const s = sinhXi * cosXi;
  const k = coshXi * sinXi;

  const diagonal = complex(coshXi * cosXi, sinhXi * sinXi);
  const m12 = scale(complex(s + k, k - s), -penetrationDepthM / (2 * lambda));
  const m21 = scale(complex(s - k, s + k), -lambda / penetrationDepthM);

  return { m11: diagonal, m12, m21, m22: diagonal };
}

/**
 * The matrix of a pure resistance — a surface film, an air cavity, a declared product,
 * or a material whose density we do not know.
 *
 * Heat flow is unchanged across it and the temperature drops by Q*R, which is the
 * massive matrix's own limit as the thickness goes to zero. The tests check that
 * degeneration rather than assuming it.
 */
function resistanceMatrix(resistanceM2KPerW: number): Matrix2 {
  return {
    m11: ONE,
    m12: complex(-resistanceM2KPerW, 0),
    m21: complex(0, 0),
    m22: ONE,
  };
}

function slabMatrix(slab: Slab, periodS: number): Matrix2 {
  return slab.kind === 'massive'
    ? layerMatrix(slab, periodS)
    : resistanceMatrix(slab.resistanceM2KPerW);
}

function slabResistanceM2KPerW(slab: Slab): number {
  return slab.kind === 'massive'
    ? slab.thicknessM / slab.lambdaWPerMK
    : slab.resistanceM2KPerW;
}

/**
 * Turn one layer, taking either its main section or its bridging section, into a slab.
 *
 * A solid layer becomes massive only if the material carries both a density and a
 * specific heat. Without them it falls back to its resistance, which **under-states the
 * construction's thermal mass**: the layer still resists heat but no longer stores any.
 * That is the safe direction for an overheating assessment, and the missing layers are
 * reported so the shortfall is visible rather than silent.
 */
function toSlab(
  layer: Layer,
  direction: HeatFlowDirection,
  useBridging: boolean,
  missingMass: string[],
): Slab {
  const sections = layerSectionResistances(layer, direction);
  const resistanceM2KPerW =
    useBridging && sections.bridgedM2KPerW !== undefined
      ? sections.bridgedM2KPerW
      : sections.unbridgedM2KPerW;

  /*
   * A cavity stores no heat, but a batten or a stud crossing one does, so on the bridged
   * path of a bridged cavity the slab is the member: its thickness is the cavity's, and
   * its mass is its own. Treating that path as massless would drop real thermal mass out
   * of a dry-lined wall.
   */
  const bridgedCavityMaterial =
    layer.kind === 'air' && useBridging ? layer.bridging?.material : undefined;

  if (layer.kind !== 'solid' && bridgedCavityMaterial === undefined) {
    // An empty cavity and a declared-resistance product store no heat worth counting.
    return { kind: 'massless', layerId: layer.id, resistanceM2KPerW };
  }

  const material: MaterialProperties =
    bridgedCavityMaterial ??
    (useBridging && layer.kind === 'solid' && layer.bridging !== undefined
      ? layer.bridging.material
      : (layer as { readonly material: MaterialProperties }).material);
  const rho = material.densityKgPerM3;
  const c = material.specificHeatCapacityJPerKgK;

  if (rho === undefined || c === undefined || rho <= 0 || c <= 0) {
    missingMass.push(layer.id);
    return { kind: 'massless', layerId: layer.id, resistanceM2KPerW };
  }

  return {
    kind: 'massive',
    layerId: layer.id,
    thicknessM: layer.thicknessM,
    lambdaWPerMK: material.lambdaWPerMK,
    densityKgPerM3: rho,
    specificHeatCapacityJPerKgK: c,
  };
}

export interface DynamicPathResult {
  readonly pathId: string;
  readonly label: string;
  /** Share of the element's area this path occupies, 0..1. */
  readonly areaFraction: number;
  /** Steady-state transmittance of this path alone, for the decrement factor. */
  readonly uValueWPerM2K: WattsPerSquareMetreKelvin;
  /** |Y_ie|, W/(m^2*K): the amplitude of the swing that gets through. */
  readonly periodicThermalTransmittanceWPerM2K: WattsPerSquareMetreKelvin;
  /** |Y_ie| / U, dimensionless and between 0 and 1 for any real construction. */
  readonly decrementFactor: number;
  /**
   * Hours by which the inside peak lags the outside peak. Positive is a delay; a
   * construction cannot respond before it is excited, so a negative value here would
   * mean the calculation has gone wrong rather than that the wall is prescient.
   */
  readonly timeShiftHours: number;
  /** kappa on the internal side, kJ/(m^2*K). The one SAP 10.3 uses. */
  readonly internalArealHeatCapacityKJPerM2K: number;
  /** kappa on the external side, kJ/(m^2*K). */
  readonly externalArealHeatCapacityKJPerM2K: number;
}

export interface DynamicResult {
  readonly standard: string;
  readonly periodS: number;
  readonly perPath: readonly DynamicPathResult[];
  /**
   * The path the headline figures come from: the one with no bridging sections, or the
   * only path where the element is homogeneous. See the note on bridging below.
   */
  readonly main: DynamicPathResult;
  /** Layers with no density or specific heat, so treated as storing no heat. */
  readonly layersTreatedAsMassless: readonly string[];
  readonly warnings: readonly Warning[];
}

/**
 * Assemble the element matrix and read the dynamic characteristics off it.
 *
 * The product runs from the internal environment outwards, so the rightmost factor is
 * the internal surface film and the leftmost is the external one:
 *
 *   Z = Z_se * Z_n * ... * Z_1 * Z_si
 *
 * Getting that order backwards silently swaps the two areal heat capacities, because
 * the element matrix is not symmetric once it has more than one layer. The tests pin it
 * down with an asymmetric element: insulation inside a masonry wall must give a small
 * internal kappa and a large external one, which is exactly the case that matters, since
 * it is why internal wall insulation kills a building's thermal mass.
 */
function assess(
  slabs: readonly Slab[],
  rsiM2KPerW: number,
  rseM2KPerW: number,
  periodS: number,
  pathId: string,
  label: string,
  areaFraction: number,
): { readonly result: DynamicPathResult; readonly warnings: readonly Warning[] } {
  const warnings: Warning[] = [];

  for (const slab of slabs) {
    if (slab.kind !== 'massive') {
      continue;
    }
    const penetrationDepthM = Math.sqrt(
      (slab.lambdaWPerMK * periodS) /
        (Math.PI * slab.densityKgPerM3 * slab.specificHeatCapacityJPerKgK),
    );
    if (slab.thicknessM / penetrationDepthM > MAX_PENETRATION_DEPTHS) {
      warnings.push(
        warning(
          'value-needs-verification',
          `Layer "${slab.layerId}" is more than ${MAX_PENETRATION_DEPTHS} periodic ` +
            'penetration depths thick, where the dynamic method loses numerical ' +
            'precision. Treat its dynamic figures as indicative.',
        ),
      );
    }
  }

  let z = resistanceMatrix(rsiM2KPerW);
  for (const slab of slabs) {
    z = multiplyMatrix(slabMatrix(slab, periodS), z);
  }
  z = multiplyMatrix(resistanceMatrix(rseM2KPerW), z);

  const totalResistanceM2KPerW =
    rsiM2KPerW + rseM2KPerW + slabs.reduce((total, slab) => total + slabResistanceM2KPerW(slab), 0);
  const uValueWPerM2K = 1 / totalResistanceM2KPerW;

  // Y_ie = -1 / Z12. The minus sign is the same one that makes a pure resistance's
  // matrix element -R: it carries the convention that heat flows down the gradient.
  const periodicTransmittance = divide(complex(-1, 0), z.m12);
  const periodicThermalTransmittanceWPerM2K = modulus(periodicTransmittance);

  // kappa = (T / 2pi) * |(Z11 - 1) / Z12| on the internal side, and the same with Z22
  // on the external side. Dividing by 1000 reports kJ rather than J.
  const angularFactor = periodS / (2 * Math.PI);
  const internalArealHeatCapacityKJPerM2K =
    (angularFactor * modulus(divide(subtract(z.m11, ONE), z.m12))) / 1000;
  const externalArealHeatCapacityKJPerM2K =
    (angularFactor * modulus(divide(subtract(z.m22, ONE), z.m12))) / 1000;

  /*
   * The time shift comes from the argument of Y_ie. arg is negative for any real
   * construction, because the inside peak follows the outside one, so negating it gives
   * the delay as a positive number of hours — which is how a delay is quoted, and how
   * the field is documented above.
   */
  const timeShiftHours = (-argument(periodicTransmittance) * (periodS / (2 * Math.PI))) / 3600;

  if (!complexIsFinite(z.m12) || !Number.isFinite(periodicThermalTransmittanceWPerM2K)) {
    warnings.push(
      warning(
        'value-needs-verification',
        'The dynamic calculation did not produce a finite result for this section, ' +
          'which points at a layer far outside the range the method is useful over.',
      ),
    );
  }

  return {
    result: {
      pathId,
      label,
      areaFraction,
      uValueWPerM2K,
      periodicThermalTransmittanceWPerM2K,
      decrementFactor: periodicThermalTransmittanceWPerM2K / uValueWPerM2K,
      timeShiftHours,
      internalArealHeatCapacityKJPerM2K,
      externalArealHeatCapacityKJPerM2K,
    },
    warnings,
  };
}

/**
 * Dynamic thermal characteristics of an element.
 *
 * **Bridged layers.** The method above is for plane layers, one behind another. An
 * element with studs through it is not that, and combining the sections has no obvious
 * right answer: the two paths differ in stored heat as much as in resistance, and
 * area-weighting complex matrices is not a thing the physics licenses. So each section
 * path is calculated separately and reported separately, and the headline figures come
 * from the unbridged path. That is an OpenUValue convention, flagged as a warning and
 * recorded in VERIFY.md — not a rule from the standard.
 */
export function calculateDynamicProperties(
  element: BuildingElement,
  options: DynamicOptions = {},
): DynamicResult {
  const periodS = options.periodS ?? DEFAULT_PERIOD_S;
  if (!(periodS > 0) || !Number.isFinite(periodS)) {
    throw new InvalidInputError('periodS', 'the excitation period must be a positive number');
  }

  const surfaces = resolveSurfaceResistancesDetailed(element);
  const direction = element.heatFlowDirection;
  const warnings: Warning[] = [];
  const missingMass: string[] = [];

  const bridgedLayers = element.layers.filter(
    (layer) =>
      (layer.kind === 'solid' || layer.kind === 'air') &&
      layer.bridging !== undefined &&
      layer.bridging.areaFraction > 0 &&
      layer.bridging.areaFraction < 1,
  );

  // Two paths at most, and only one when nothing is bridged: the all-unbridged path and
  // the all-bridged one. Enumerating every mixture would multiply the output without
  // adding anything, since the headline comes from the unbridged path either way.
  const buildPath = (useBridging: boolean): readonly Slab[] =>
    element.layers.map((layer) => toSlab(layer, direction, useBridging, missingMass));

  /*
   * The share of the element each path covers. Taking every bridged layer's section in
   * turn, the all-unbridged path is the product of the unbridged fractions and the
   * all-bridged path the product of the bridging ones. With a single bridged layer, the
   * usual case, those are simply 1 - f and f. The two do not sum to 1 when more than one
   * layer is bridged, because the mixed paths in between are not enumerated.
   */
  const bridgingFractions = bridgedLayers.map((layer) =>
    layer.kind === 'solid' || layer.kind === 'air' ? (layer.bridging?.areaFraction ?? 0) : 0,
  );
  const unbridgedAreaFraction = bridgingFractions.reduce(
    (total, fraction) => total * (1 - fraction),
    1,
  );
  const bridgedAreaFraction = bridgingFractions.reduce((total, fraction) => total * fraction, 1);

  const unbridged = assess(
    buildPath(false),
    surfaces.rsiM2KPerW,
    surfaces.rseM2KPerW,
    periodS,
    'unbridged',
    bridgedLayers.length > 0 ? 'Between the studs' : 'Whole element',
    bridgedLayers.length > 0 ? unbridgedAreaFraction : 1,
  );
  warnings.push(...unbridged.warnings);
  const perPath: DynamicPathResult[] = [unbridged.result];

  if (bridgedLayers.length > 0) {
    // missingMass is collected per path; clear the duplicates the second pass adds.
    const bridged = assess(
      buildPath(true),
      surfaces.rsiM2KPerW,
      surfaces.rseM2KPerW,
      periodS,
      'bridged',
      'Through the studs',
      bridgedAreaFraction,
    );
    warnings.push(...bridged.warnings);
    perPath.push(bridged.result);

    warnings.push(
      warning(
        'in-house-convention',
        'BS EN ISO 13786 applies to layers that are plane and continuous. This element ' +
          'is bridged, so each section is calculated separately and the headline ' +
          'figures are those of the section between the bridging members. Area-weighting ' +
          'the sections is not offered, because the standard does not define it here.',
      ),
    );
  }

  const uniqueMissing = [...new Set(missingMass)];
  if (uniqueMissing.length > 0) {
    warnings.push(
      warning(
        'value-needs-verification',
        `${uniqueMissing.length} layer${uniqueMissing.length === 1 ? '' : 's'} ` +
          `(${uniqueMissing.join(', ')}) ${uniqueMissing.length === 1 ? 'has' : 'have'} no ` +
          'density or specific heat capacity, so it is treated as storing no heat. The ' +
          "element's real thermal mass is higher than reported.",
      ),
    );
  }

  const main = perPath[0];
  if (main === undefined) {
    throw new InvalidInputError('layers', 'the element produced no section to calculate');
  }

  return {
    standard: 'BS EN ISO 13786',
    periodS,
    perPath,
    main,
    layersTreatedAsMassless: uniqueMissing,
    warnings,
  };
}
