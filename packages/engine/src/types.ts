import type {
  DegreesCelsius,
  Dimensionless,
  Fraction,
  JoulesPerKilogramKelvin,
  KilogramsPerCubicMetre,
  Metres,
  Pascals,
  SquareMetreKelvinPerWatt,
  WattsPerMetreKelvin,
  WattsPerSquareMetre,
  WattsPerSquareMetreKelvin,
} from './units.js';
import type { Warning } from './warnings.js';

/**
 * Direction of heat flow through the element, which selects the surface resistances.
 * BS EN ISO 6946 treats "horizontal" as heat flow within +/-30 degrees of the
 * horizontal plane, so a wall and a steeply pitched roof share the horizontal values.
 * TODO(verify): the +/-30 degree wording and its clause number in BS EN ISO 6946:2017.
 */
export type HeatFlowDirection = 'upward' | 'horizontal' | 'downward';

/** Thermophysical properties of a material. Only lambda is needed for a U-value. */
export interface MaterialProperties {
  /** Design thermal conductivity, W/(m*K). */
  readonly lambdaWPerMK: WattsPerMetreKelvin;
  /** Density rho, kg/m^3. Needed by BS EN ISO 13786 (out of Phase 1 scope). */
  readonly densityKgPerM3?: KilogramsPerCubicMetre;
  /** Specific heat capacity c, J/(kg*K). Needed by BS EN ISO 13786. */
  readonly specificHeatCapacityJPerKgK?: JoulesPerKilogramKelvin;
  /** Water vapour resistance factor mu, dimensionless. Needed by BS EN ISO 13788. */
  readonly vapourResistanceFactorMu?: Dimensionless;
}

/**
 * The bridging section within an otherwise homogeneous layer: timber studs or
 * rafters through insulation, mortar joints through blockwork, and so on.
 */
export interface LayerBridging {
  readonly label: string;
  /** Fraction of the element area occupied by the bridging section, 0..1. */
  readonly areaFraction: Fraction;
  readonly material: MaterialProperties;
}

export interface SolidLayer {
  readonly kind: 'solid';
  readonly id: string;
  readonly label: string;
  readonly thicknessM: Metres;
  readonly material: MaterialProperties;
  /** Present => the layer is inhomogeneous and the combined method applies. */
  readonly bridging?: LayerBridging;
}

/**
 * BS EN ISO 6946 distinguishes three ventilation classes for an air layer by the
 * area of openings to the external environment per metre of length:
 *   unventilated        - openings below the slightly-ventilated threshold
 *   slightly ventilated - between the two thresholds
 *   well ventilated     - at or above the well-ventilated threshold
 * TODO(verify): the two opening-area thresholds (understood to be 500 mm^2/m and
 * 1500 mm^2/m per metre of length for walls) and their clause in BS EN ISO 6946.
 */
export type AirLayerVentilation = 'unventilated' | 'slightly-ventilated' | 'well-ventilated';

export interface AirLayer {
  readonly kind: 'air';
  readonly id: string;
  readonly label: string;
  readonly thicknessM: Metres;
  readonly ventilation: AirLayerVentilation;
  /** Area of openings to the outside per metre of length. Required when slightly ventilated. */
  readonly openingAreaMm2PerM?: number;
}

/** A declared product resistance used as-is, with thickness only for drawing to scale. */
export interface FixedResistanceLayer {
  readonly kind: 'fixed-resistance';
  readonly id: string;
  readonly label: string;
  readonly thicknessM: Metres;
  readonly resistanceM2KPerW: SquareMetreKelvinPerWatt;
}

export type Layer = SolidLayer | AirLayer | FixedResistanceLayer;

export interface BuildingElement {
  readonly id: string;
  readonly name: string;
  readonly heatFlowDirection: HeatFlowDirection;
  /** Ordered internal -> external. */
  readonly layers: readonly Layer[];
  /** Overrides the tabulated Rsi, e.g. a BR 443 convention for a special case. */
  readonly rsiOverrideM2KPerW?: SquareMetreKelvinPerWatt;
  /** Overrides the tabulated Rse. */
  readonly rseOverrideM2KPerW?: SquareMetreKelvinPerWatt;
}

export interface EnvironmentConditions {
  readonly internalAirTemperatureC: DegreesCelsius;
  readonly internalRelativeHumidityPercent: number;
  readonly externalAirTemperatureC: DegreesCelsius;
  readonly externalRelativeHumidityPercent: number;
}

/* ------------------------------------------------------------------ results ---- */

export interface LayerResistance {
  readonly layerId: string;
  readonly label: string;
  readonly thicknessM: Metres;
  /** Resistance of the unbridged (or only) section of the layer. */
  readonly resistanceM2KPerW: SquareMetreKelvinPerWatt;
  /** Resistance of the bridging section, when the layer is inhomogeneous. */
  readonly bridgingResistanceM2KPerW?: SquareMetreKelvinPerWatt;
  /** Area-weighted parallel combination, as used by the ISO 6946 lower limit. */
  readonly combinedResistanceM2KPerW: SquareMetreKelvinPerWatt;
  /** Equivalent air layer thickness Sd = mu * d, metres. Zero when mu is unknown. */
  readonly vapourDiffusionThicknessSdM: Metres;
  /**
   * False for a layer disregarded by the calculation: a well-ventilated air layer
   * and everything outboard of it. Such layers are still drawn, but they contribute
   * nothing to R and carry no temperature.
   */
  readonly includedInCalculation: boolean;
}

/** Why the ISO 6946 combined method does not apply to this element. */
export type OutOfScopeReason = 'upper-lower-ratio-exceeds-limit' | 'metal-bridging';

export interface UValueResult {
  readonly rsiM2KPerW: SquareMetreKelvinPerWatt;
  readonly rseM2KPerW: SquareMetreKelvinPerWatt;
  readonly layers: readonly LayerResistance[];
  readonly method: 'homogeneous' | 'iso6946-combined';
  /** R'T, the upper limit of total thermal resistance. */
  readonly totalResistanceUpperLimitM2KPerW: SquareMetreKelvinPerWatt;
  /** R''T, the lower limit of total thermal resistance. */
  readonly totalResistanceLowerLimitM2KPerW: SquareMetreKelvinPerWatt;
  /** RT = (R'T + R''T)/2. */
  readonly totalResistanceM2KPerW: SquareMetreKelvinPerWatt;
  /** R'T / R''T. Exactly 1 for a homogeneous element. */
  readonly upperToLowerLimitRatio: number;
  /** e = (R'T - R''T) / (2*RT) * 100. Zero for a homogeneous element. */
  readonly maxRelativeErrorPercent: number;
  /**
   * Unrounded U = 1/RT, or null when the combined method is out of scope for this
   * element. The null is deliberate: it forces every consumer to handle the
   * out-of-scope case rather than rendering an invalid U-value by accident.
   */
  readonly uValueWPerM2K: WattsPerSquareMetreKelvin | null;
  /** Always populated. Diagnostics only - never present this as a U-value. */
  readonly provisionalUValueWPerM2K: WattsPerSquareMetreKelvin;
  readonly outOfScopeReasons: readonly OutOfScopeReason[];
  readonly warnings: readonly Warning[];
}

/**
 * One enumerated 1D path through the element. For an element with n inhomogeneous
 * layers there are 2^n paths, whose area fractions are the products of the chosen
 * sections' fractions and sum to 1.
 */
export interface SectionPath {
  /** 'unbridged', 'bridged', or 'mixed:<bit pattern>' for everything between. */
  readonly id: string;
  readonly label: string;
  readonly areaFraction: Fraction;
  /** True where every inhomogeneous layer takes its unbridged section. */
  readonly isAllUnbridged: boolean;
  /** True where every inhomogeneous layer takes its bridging section. */
  readonly isAllBridged: boolean;
  /** Per-layer resistances along this path, in element order. */
  readonly layerResistancesM2KPerW: readonly SquareMetreKelvinPerWatt[];
  /** Rsi + sum(layers) + Rse for this path. */
  readonly totalResistanceM2KPerW: SquareMetreKelvinPerWatt;
}

/**
 * Which 1D path to *display*. 'unbridged' and 'bridged' are real 1D calculations;
 * 'combined' is an in-house convention (see calculateTemperatureProfile). Display
 * only: the condensation verdict never depends on this choice.
 */
export type ProfileSection = 'unbridged' | 'bridged' | 'combined';

export type ProfileNodeKind =
  | 'internal-air'
  | 'internal-surface'
  | 'interface'
  | 'external-surface'
  | 'external-air';

export interface ProfileNode {
  readonly kind: ProfileNodeKind;
  readonly label: string;
  /** 0 at the internal face of the first layer, increasing outwards. */
  readonly positionM: Metres;
  readonly cumulativeResistanceM2KPerW: SquareMetreKelvinPerWatt;
  /** Temperature on the displayed path. */
  readonly temperatureC: DegreesCelsius;
  /** Saturation vapour pressure at this node's displayed temperature. */
  readonly saturationVapourPressurePa: Pascals;
  /** Dew point of the internal air: the threshold this node is judged against. */
  readonly dewPointTemperatureC: DegreesCelsius;
  /** Coldest temperature at this interface over every section path. */
  readonly worstCaseTemperatureC: DegreesCelsius;
  readonly worstCasePathId: string;
  /**
   * worstCaseTemperatureC <= dewPointTemperatureC, taken from the worst path rather
   * than the displayed one, so changing the display cannot change the answer.
   *
   * This is a **screening indicator, not an interstitial condensation assessment.**
   * It says the interface is colder than the dew point of the internal air, which is
   * a necessary condition for condensation there but not a sufficient one: whether
   * vapour actually arrives at saturation pressure depends on the vapour resistances
   * inboard of the interface (the Sd distribution), which a full BS EN ISO 13788 or
   * Glaser calculation accounts for and this does not. Expect it to flag interfaces
   * that a proper assessment would clear - a well-insulated element has most of its
   * thickness below the internal dew point by design.
   *
   * At the internal surface, where there is no vapour resistance in the way, it is
   * the real surface-condensation criterion.
   *
   * See condensation/method.ts for the extension point that will answer the fuller
   * question, and cumulativeSdM below for the data it needs.
   */
  readonly isBelowInternalDewPoint: boolean;
  /** Cumulative Sd = sum(mu*d) up to this node, on the unbridged path. */
  readonly cumulativeSdM: Metres;
}

export interface TemperatureProfile {
  readonly section: ProfileSection;
  /** For 'combined' this is the RT reported by calculateUValue. */
  readonly totalResistanceM2KPerW: SquareMetreKelvinPerWatt;
  /** q = (theta_i - theta_e) / totalResistanceM2KPerW. */
  readonly heatFluxWPerM2: WattsPerSquareMetre;
  /** The in-house scaling factor k. Present only for section 'combined'. */
  readonly combinedScalingFactor?: number;
  /** True when the Sd values follow the unbridged-path in-house convention. */
  readonly sdFollowsUnbridgedConvention: boolean;
  readonly internalDewPointTemperatureC: DegreesCelsius;
  readonly nodes: readonly ProfileNode[];
  readonly warnings: readonly Warning[];
}
