import type {
  ExposureZoneId,
  AirGapLevel,
  AirLayerEmissivity,
  AirLayerVentilation,
  BuildingElement,
  EnvironmentConditions,
  ExternalEnvironmentKind,
  HeatFlowDirection,
  InternalSurfaceCondition,
  Layer,
  ProfileSection,
} from '@openuvalue/engine';
import {
  DEFAULT_AIR_GAP_LEVEL,
  externalEnvironment,
  externalEnvironmentsForDirection,
} from '@openuvalue/engine';
import { millimetresToMetres, percentToFraction } from '@openuvalue/engine';
import type { MaterialCategory } from '@openuvalue/materials';
import { findMaterialById, toEngineMaterial } from '@openuvalue/materials';

/**
 * The UI's layer model. Thicknesses are in millimetres and bridging is a percentage,
 * because that is how people work; both are converted at the boundary in
 * toBuildingElement below, so the engine only ever sees SI.
 */
/** Whether a member spacing is measured centre to centre, or as the clear gap. */
export type BridgeDistanceBasis = 'centres' | 'clear';

export interface UiLayer {
  readonly id: string;
  readonly kind: 'solid' | 'air';
  readonly label: string;
  readonly thicknessMm: number;
  /** A catalogue id, or null when lambda has been typed in directly. */
  readonly materialId: string | null;
  readonly lambdaWPerMK: number;
  readonly vapourResistanceFactorMu: number;
  /** Percentage of the element area bridged; 0 means the layer is homogeneous. */
  readonly bridgedPercent: number;
  readonly bridgeLabel: string;
  readonly bridgeMaterialId: string | null;
  readonly bridgeLambdaWPerMK: number;
  /**
   * How the bridged percentage is arrived at. Studs and rafters are repeating members
   * at a spacing, so their width and centres are what a person actually knows;
   * 'fraction' is the escape hatch for a conventional whole-wall allowance.
   */
  readonly bridgeSizing: 'dimensions' | 'fraction';
  /**
   * How the bridging is laid out, which the drawing needs and the calculation does not.
   * 'members' is a repeating run — a stud, a rafter, a batten — crossing the whole
   * layer. 'dabs' is discrete pads with air all round them, which is a different thing
   * to look at even though both resolve to an area fraction.
   */
  readonly bridgePattern: BridgePattern;
  /**
   * Which cavity preset was picked, for air layers.
   *
   * Needed because the choice is not recoverable from the values: a clear masonry
   * cavity, the residual gap of a partial fill and a batten void all resolve to the same
   * unventilated, high-emissivity airspace, and the calculation is right to treat them
   * alike. What differs is what the user is describing, which is worth keeping — without
   * it the picker could only ever highlight the first of the three.
   */
  readonly cavityPresetId?: string | undefined;
  /**
   * True while the cavity type was inferred from the layup rather than chosen. Drives a
   * note on the picker, and clears the moment anyone picks one — a guess that stops
   * announcing itself is just an assertion.
   */
  readonly wasCavityGuessed?: boolean | undefined;
  /** Width of one member across the face, mm. Used when bridgeSizing is 'dimensions'. */
  readonly bridgeWidthMm: number;
  /**
   * Spacing of the members, mm. What it measures depends on bridgeDistanceBasis: either
   * centre to centre, or the clear opening between two members.
   */
  readonly bridgeSpacingMm: number;
  /**
   * Which distance the spacing figure is. Both are in normal use — a drawing gives
   * centres, a tape measure on site gives the clear gap — and they are not
   * interchangeable: 40 mm members at 600 mm centres bridge 6.7 % of the face, while the
   * same members with a 600 mm clear gap bridge 6.3 %, because their centres are 640 mm
   * apart. Defaults to centres, which is how members are specified.
   */
  readonly bridgeDistanceBasis: BridgeDistanceBasis;
  /** Air layers only. */
  readonly ventilation: AirLayerVentilation;
  readonly openingAreaMm2PerM: number;
  /**
   * Air layers only: whether a surface bounding the cavity is reflective. BR 443 4.7.2 —
   * only counts where the reflective face actually looks into the air space.
   */
  readonly emissivity: AirLayerEmissivity;
}

export interface UiState {
  readonly name: string;
  readonly heatFlowDirection: HeatFlowDirection;
  readonly layers: readonly UiLayer[];
  readonly conditions: EnvironmentConditions;
  readonly section: ProfileSection;
  /** Free or reduced air circulation at the internal surface. */
  readonly internalSurfaceCondition: InternalSurfaceCondition;
  /** What the outer face faces: outside air, a loft, another heated room, ... */
  readonly externalEnvironment: ExternalEnvironmentKind;
  /**
   * Air gaps in the insulation layer, BR 443 (2019) 4.8.1. A property of how the
   * element is built rather than of the weather, so it lives with the build-up.
   */
  readonly airGapLevel: AirGapLevel;
  /**
   * Wind-driven rain exposure, picked off the published map rather than derived from a
   * location we do not ask for. Decides whether a cavity may be filled.
   */
  readonly exposureZoneId: ExposureZoneId;
  /**
   * Mechanical fasteners through the insulation, BR 443 (2019) 4.8.3. Undefined means
   * the user has not told us about any, which is **not** the same as "there are none":
   * the UI has to say so, because a missing DeltaU_f under-reports the U-value.
   */
  readonly fasteners?: UiFasteners;
}

/**
 * What the fastener correction needs from the user.
 *
 * chi is the one figure this tool cannot work out: it comes from an ISO 10211 model or
 * from the fixing manufacturer, usually in a BBA certificate. The rest is counting.
 *
 * `recessedFlatRoof` carries both halves of BR 443's exemption condition, because
 * neither half means anything alone: the exemption is for a flat roof *and* a fastener
 * recessed by at least half its length (and, separately, a density at or under 15/m²,
 * which is read off the density field rather than asked again).
 */
export interface UiFasteners {
  readonly pointThermalTransmittanceWPerK: number;
  readonly fastenersPerM2: number;
  readonly recessedFlatRoof: boolean;
  readonly bothEndsInMetalSheets: boolean;
}

/**
 * A starting point for someone switching the correction on: a light-gauge fixing at a
 * plausible density. Both figures are placeholders to be replaced with the real product
 * data, which is why they are round rather than precise, and the UI says so.
 */
export function defaultFasteners(): UiFasteners {
  return {
    pointThermalTransmittanceWPerK: 0.004,
    fastenersPerM2: 5,
    recessedFlatRoof: false,
    bothEndsInMetalSheets: false,
  };
}


/* --------------------------------------------------- typical starting points --- */

/**
 * Typical conditions to start from, offered behind the "Common defaults" button and
 * applied when the external environment is changed.
 *
 * **These are starting points, not standard values.** No standard fixes the
 * temperature of a particular garage or loft, and a real assessment states its own
 * conditions. They are here so that a homeowner gets a sensible answer without having
 * to know what to type, and every one of them is listed in VERIFY.md.
 *
 * TODO(verify): the internal 20 degC / 50 % RH pair against the humidity classes in
 * BS EN ISO 13788 Annex A and the guidance in BS 5250, which classify internal
 * humidity by occupancy rather than fixing one figure; and whether BR 443 or BS 5250
 * give UK figures for unheated spaces and lofts to replace the estimates below.
 */
export interface ConditionPreset {
  readonly airTemperatureC: number;
  readonly relativeHumidityPercent: number;
  /** Shown next to the figures so nobody mistakes an estimate for a standard value. */
  readonly note: string;
}

export const INTERNAL_CONDITION_PRESET: ConditionPreset = {
  airTemperatureC: 20,
  relativeHumidityPercent: 50,
  note: 'A commonly used UK assessment pair for a normally occupied dwelling.',
};

export const EXTERNAL_CONDITION_PRESETS: Record<ExternalEnvironmentKind, ConditionPreset> = {
  'outside-air': {
    airTemperatureC: 0,
    relativeHumidityPercent: 90,
    note: 'A cold UK winter day. Outside air is damp when it is cold.',
  },
  'rear-ventilated-cladding': {
    airTemperatureC: 0,
    relativeHumidityPercent: 90,
    note: 'The ventilated cavity is effectively at outside conditions.',
  },
  'rear-ventilated-roofing': {
    airTemperatureC: 0,
    relativeHumidityPercent: 90,
    note: 'The ventilated cavity is effectively at outside conditions.',
  },
  'unheated-room': {
    airTemperatureC: 10,
    relativeHumidityPercent: 80,
    note: 'An estimate for a garage or store: warmer than outside, colder than inside.',
  },
  'unheated-roof-space': {
    airTemperatureC: 2,
    relativeHumidityPercent: 90,
    note: 'An estimate for a ventilated cold loft, close to outside conditions.',
  },
  'heated-room': {
    airTemperatureC: 20,
    relativeHumidityPercent: 50,
    note: 'The same as inside, so there is no heat flow and no condensation risk.',
  },
  ground: {
    airTemperatureC: 10,
    relativeHumidityPercent: 100,
    note: 'Not used: ground heat loss is BS EN ISO 13370 and is not implemented.',
  },
};

/** Conditions for an external environment, with the internal pair kept as it is. */
export function conditionsForEnvironment(
  kind: ExternalEnvironmentKind,
  current: EnvironmentConditions,
): EnvironmentConditions {
  const preset = EXTERNAL_CONDITION_PRESETS[kind];
  return {
    ...current,
    externalAirTemperatureC: preset.airTemperatureC,
    externalRelativeHumidityPercent: preset.relativeHumidityPercent,
  };
}

/** Both sides reset to their typical starting points. */
export function commonDefaultConditions(
  kind: ExternalEnvironmentKind,
): EnvironmentConditions {
  const external = EXTERNAL_CONDITION_PRESETS[kind];
  return {
    internalAirTemperatureC: INTERNAL_CONDITION_PRESET.airTemperatureC,
    internalRelativeHumidityPercent: INTERNAL_CONDITION_PRESET.relativeHumidityPercent,
    externalAirTemperatureC: external.airTemperatureC,
    externalRelativeHumidityPercent: external.relativeHumidityPercent,
  };
}

/**
 * Keep the external environment consistent with the direction of heat flow. Changing
 * a wall into a roof would otherwise leave "rear ventilated cladding" selected, which
 * the engine refuses outright.
 */
export function environmentForDirection(
  kind: ExternalEnvironmentKind,
  direction: HeatFlowDirection,
): ExternalEnvironmentKind {
  if (externalEnvironment(kind).applicableDirections.includes(direction)) {
    return kind;
  }
  return externalEnvironmentsForDirection(direction)[0]?.kind ?? 'outside-air';
}

let nextId = 0;
export function makeLayerId(): string {
  nextId += 1;
  return `layer-${nextId}`;
}


/* --------------------------------------------------------- studs and rafters --- */

/**
 * The share of the element face taken by repeating members.
 *
 * BR 443 (2019), 4.5: "In general the fraction can be calculated as the timber width
 * divided by the spacing interval, allowing for any additional cross pieces", and its
 * worked examples add a flat 1 % for those cross pieces:
 *
 *   35 mm joists at 600 mm centres: (35 / 600) + 0.01 = 0.068
 *   50 mm joists at 400 mm centres: (50 / 400) + 0.01 = 0.135
 *
 * with the note "1% added for additional timbers". So the width-over-spacing figure on
 * its own is an under-estimate, and the allowance is part of the convention rather
 * than a safety margin someone added.
 *
 * It is still only the repeating members plus that allowance. BR 443 4.4.1 treats a
 * whole timber-frame wall separately and gives a default of 15 %, because sole and head
 * plates, lintels and doubled studs at openings are not a fixed percentage of anything
 * — see BR443_TIMBER_FRACTION_DEFAULTS.
 */
export const BR443_ADDITIONAL_TIMBER_ALLOWANCE = 0.01;

/**
 * The centre-to-centre pitch of the members, whichever way the distance was given.
 *
 * The area fraction is always width over pitch: with a clear gap the pitch is the gap
 * plus one member, since the next member starts a whole width later.
 */
export function bridgePitchMm(
  widthMm: number,
  distanceMm: number,
  basis: BridgeDistanceBasis,
): number {
  return basis === 'centres' ? distanceMm : distanceMm + widthMm;
}

/**
 * What the drawing should show for a bridged layer, or undefined where there is nothing
 * honest to draw.
 *
 * Deliberately independent of `bridgeSizing`. That field says where the *percentage*
 * came from; this says whether there is a *geometry* to picture. A layer can have both —
 * BR 443's batten configuration is 47 mm at 600 mm centres and carries a stated fraction
 * of 11.8 %, because the standard's figure also counts the top and bottom rails. Refusing
 * to draw it because the percentage was stated rather than derived would hide a geometry
 * we know exactly.
 *
 * Where the two disagree, `geometricPercent` differs from the layer's `bridgedPercent`,
 * and the caller is expected to say so rather than let the picture quietly contradict the
 * number beside it.
 */
export interface BridgeGeometry {
  /**
   * Width of one member across a **section**, mm. For dabs this is not the size of a
   * dab: see `dabPadMm`.
   */
  readonly widthMm: number;
  readonly pitchMm: number;
  readonly pattern: BridgePattern;
  /** The percentage the drawn members alone come to. */
  readonly geometricPercent: number;
  /**
   * Side of one dab on a **face**, mm, for a view that shows the wall rather than a cut
   * through it. Undefined for continuous members, which look the same either way.
   *
   * It differs from `widthMm` because the two views are answering different questions,
   * and the same area fraction gives different answers to them. Dabs sit on a grid at
   * pitch p. Seen face on, pads of side s cover s²/p² of the area, so matching a
   * fraction f needs s = p·√f. Cut through, a section that happens to pass along a row
   * of dabs meets them for s/p of its length — but averaged over where the cut falls,
   * the coverage is f, which is what `widthMm = f·p` represents. Using the face size in
   * the section would show a section through the dabs every time, which is one
   * particular cut rather than the average one.
   */
  readonly dabPadMm?: number;
}

export function bridgeGeometry(layer: UiLayer): BridgeGeometry | undefined {
  if (layer.bridgedPercent <= 0) {
    return undefined;
  }
  if (layer.bridgePattern === 'dabs') {
    /*
     * Dabs have no stated layout, so the pitch is a drawing constant and the pad size
     * follows from the fraction: pad = fraction x pitch makes the coverage down the
     * section equal the fraction the calculation uses.
     */
    const fraction = layer.bridgedPercent / 100;
    return {
      widthMm: fraction * DAB_NOMINAL_PITCH_MM,
      pitchMm: DAB_NOMINAL_PITCH_MM,
      pattern: 'dabs',
      geometricPercent: layer.bridgedPercent,
      dabPadMm: Math.sqrt(fraction) * DAB_NOMINAL_PITCH_MM,
    };
  }
  if (layer.bridgeWidthMm <= 0) {
    return undefined;
  }
  const pitchMm = bridgePitchMm(
    layer.bridgeWidthMm,
    layer.bridgeSpacingMm,
    layer.bridgeDistanceBasis,
  );
  if (!(pitchMm > 0)) {
    return undefined;
  }
  return {
    widthMm: layer.bridgeWidthMm,
    pitchMm,
    pattern: 'members',
    geometricPercent: (layer.bridgeWidthMm / pitchMm) * 100,
  };
}

export function bridgedPercentFromDimensions(
  widthMm: number,
  distanceMm: number,
  basis: BridgeDistanceBasis = 'centres',
): number {
  if (!Number.isFinite(widthMm) || !Number.isFinite(distanceMm) || widthMm < 0) {
    return 0;
  }
  const pitchMm = bridgePitchMm(widthMm, distanceMm, basis);
  if (!(pitchMm > 0)) {
    return 0;
  }
  const fraction = widthMm / pitchMm + BR443_ADDITIONAL_TIMBER_ALLOWANCE;
  return Math.min(100, Math.max(0, fraction * 100));
}

/**
 * The defaults BR 443 (2019) gives for common cases, for use where the members are not
 * being measured. Quoted with the clause each comes from so the choice is auditable.
 */
export interface TimberFractionDefault {
  readonly id: string;
  readonly label: string;
  readonly percent: number;
  readonly clause: string;
  readonly note: string;
}

export const BR443_TIMBER_FRACTION_DEFAULTS: readonly TimberFractionDefault[] = [
  {
    id: 'timber-frame',
    label: 'Timber frame wall',
    percent: 15,
    clause: 'BR 443 (2019) 4.4.1(i)',
    note:
      'Default for timber frame, based on 38 mm timbers at 600 mm centres. Additional ' +
      'heat losses at corners, window surrounds and between floors are not counted in ' +
      'the timber fraction — they belong to the junction ψ-values.',
  },
  {
    id: 'timber-frame-improved',
    label: 'Timber frame wall, improved detailing',
    percent: 12.5,
    clause: 'BR 443 (2019) 4.4.1(ii)',
    note:
      'Allowed only where all of BR 443 4.4.1(ii) is met: a single top plate, the sole ' +
      'plate below finished floor level, no mid-height full-depth noggings, and studs ' +
      'at internal wall junctions no deeper than 38 mm with continuous insulation behind.',
  },
  {
    id: 'ceiling-joists',
    label: 'Ceiling joists',
    percent: 12.8,
    clause: 'BR 443 (2019) 4.5.1',
    note: 'Based on 47 mm timbers at 400 mm centres: (47 / 400) + 0.01.',
  },
  {
    id: 'ceiling-joists-doubled',
    label: 'Ceiling joists, doubled up',
    percent: 16.7,
    clause: 'BR 443 (2019) 4.5.2',
    note:
      'Joists at 600 mm centres may be inconsistently spaced and doubled: ' +
      '(2 × 47) / 600 + 0.01.',
  },
  {
    id: 'floor-joists',
    label: 'Suspended timber floor joists',
    percent: 10.8,
    clause: 'BR 443 (2019) 4.5.3',
    note:
      'Based on 38 mm timbers at 400 mm centres plus a nogging every 3 m: ' +
      '(38 / 400) + (38 / 3000). Note this one uses an explicit nogging term rather ' +
      'than the flat 1 % allowance.',
  },
];

/** A common UK stud size and spacing, used when studs are first added to a layer. */
/**
 * BR 443 (2006) 4.7, plasterboard wall lining, in the units the UI works in.
 *
 * 4.7.1 plaster dabs: fraction 0.20, lambda 0.43 W/(m*K), 15 mm thick, over a 15 mm
 * airspace of 0.17 m2K/W. 4.7.2 plasterboard on battens: 47 mm timber at 600 mm centres
 * plus top and bottom rail for a 2400 mm room height, giving 47/600 + 2 x 47/2400 =
 * 0.118, at 22 mm thick over an airspace of 0.18 m2K/W.
 *
 * These are the 2006 edition's clause numbers. The 2019 edition renumbers this material
 * — its 4.7 is airspaces — so TODO(verify) the 2019 clauses and whether the figures
 * moved. VERIFY.md row V30.
 */
export const BR443_DAB_PERCENT = 20;
export const BR443_DAB_LAMBDA_W_PER_MK = 0.43;
export const BR443_DAB_THICKNESS_MM = 15;
export const BR443_BATTEN_PERCENT = 11.8;
export const BR443_BATTEN_WIDTH_MM = 47;
export const BR443_BATTEN_SPACING_MM = 600;
export const BR443_BATTEN_THICKNESS_MM = 22;
/** Softwood, BR 443 (2019) 3.9 — the same value the stud default uses. */
export const SOFTWOOD_LAMBDA_W_PER_MK = 0.13;

export type BridgePattern = 'members' | 'dabs';

/**
 * Nominal pitch used to draw plaster dabs. BR 443 gives their area fraction and nothing
 * about their layout, so this is a **drawing convention only**: the pads are pitched at
 * this spacing and their size is then set from the fraction, so the coverage down the
 * section is the fraction the calculation actually uses. The arrangement is indicative
 * and the caption says so; no number in the result depends on it.
 */
export const DAB_NOMINAL_PITCH_MM = 300;

export const DEFAULT_STUD_WIDTH_MM = 38;
export const DEFAULT_STUD_SPACING_MM = 400;

export function blankSolidLayer(): UiLayer {
  return {
    id: makeLayerId(),
    kind: 'solid',
    label: 'New layer',
    thicknessMm: 50,
    materialId: null,
    lambdaWPerMK: 0.5,
    vapourResistanceFactorMu: 10,
    bridgedPercent: 0,
    bridgePattern: 'members',
    bridgeLabel: 'Timber stud',
    bridgeMaterialId: 'softwood-structural',
    bridgeLambdaWPerMK: 0.13,
    bridgeSizing: 'dimensions',
    bridgeWidthMm: DEFAULT_STUD_WIDTH_MM,
    bridgeSpacingMm: DEFAULT_STUD_SPACING_MM,
    bridgeDistanceBasis: 'centres',
    ventilation: 'unventilated',
    openingAreaMm2PerM: 0,
    emissivity: 'high',
  };
}

export function layerFromMaterial(materialId: string, thicknessMm: number): UiLayer {
  const material = findMaterialById(materialId);
  const base = blankSolidLayer();
  if (material === undefined) {
    return { ...base, thicknessMm };
  }
  const engineMaterial = toEngineMaterial(material);
  return {
    ...base,
    label: material.name,
    materialId,
    thicknessMm,
    lambdaWPerMK: engineMaterial.lambdaWPerMK,
    vapourResistanceFactorMu: engineMaterial.vapourResistanceFactorMu,
  };
}

/**
 * The cavities that actually turn up in UK construction, each with the ventilation class
 * and emissivity that go with it, so a cavity can be chosen by what it *is* rather than by
 * setting three fields correctly.
 *
 * Every one is BR 443 (2019) 4.7, quoted in its note.
 */
export interface CavityPreset {
  readonly id: string;
  /** Named for the construction, not for the classification it resolves to. */
  readonly label: string;
  /** Where you would meet it, in one line. */
  readonly where: string;
  readonly thicknessMm: number;
  readonly ventilation: AirLayerVentilation;
  readonly openingAreaMm2PerM: number;
  readonly emissivity: AirLayerEmissivity;
  readonly note: string;
  /** Which small section drawing stands for it. */
  readonly icon: CavityIcon;
}

/**
 * The five cases worth drawing. Named for what is in the picture rather than for the
 * standard's classes, because the classes are the answer and the picture is the question.
 */
export type CavityIcon =
  | 'clear'
  | 'partial-fill'
  | 'partial-fill-foil'
  | 'ventilated'
  | 'service-void';

export const CAVITY_PRESETS: readonly CavityPreset[] = [
  {
    id: 'unventilated-masonry',
    label: 'Clear cavity, nothing in it',
    where: 'An uninsulated masonry cavity wall, or the whole cavity of one.',
    thicknessMm: 50,
    ventilation: 'unventilated',
    openingAreaMm2PerM: 0,
    emissivity: 'high',
    icon: 'clear',
    note:
      'Still air between ordinary building surfaces. BR 443 (2019) 4.7.1: "Cavities in ' +
      'unventilated masonry wall constructions normally have R = 0.18 m²K/W." Weep holes ' +
      'and the odd open perpend do not make it ventilated: that needs 500 mm² per metre ' +
      'of length, and open perps at 900 mm centres come to about 720 mm² only on the ' +
      'courses that have them.',
  },
  {
    id: 'partial-fill-residual',
    label: 'Residual gap, partial fill',
    where: 'The clear gap left in front of insulation board fixed to the inner leaf.',
    thicknessMm: 50,
    ventilation: 'unventilated',
    openingAreaMm2PerM: 0,
    emissivity: 'high',
    icon: 'partial-fill',
    note:
      'A partial-fill wall has two things in the cavity: the board, which is an ' +
      'insulation layer, and the gap left in front of it, which is this. Enter them as ' +
      'two layers. The gap is there to keep rain off the insulation and is not ventilated ' +
      'to outside, so it takes an unventilated air layer resistance like any other.',
  },
  {
    id: 'unventilated-low-e',
    label: 'Residual gap facing a foil',
    where: 'The same gap, where the board facing it is foil-faced.',
    thicknessMm: 25,
    ventilation: 'unventilated',
    openingAreaMm2PerM: 0,
    emissivity: 'low',
    icon: 'partial-fill-foil',
    note:
      'A foil face looking into the cavity cuts the radiation across it and roughly ' +
      'doubles its resistance — 0.44 m²K/W in a wall against 0.18. BR 443 (2019) 4.7.2, ' +
      'at ε = 0.2 and at least 25 mm wide. The foil only counts if it faces the air ' +
      'space: a foil buried against masonry, or against another board, does nothing at ' +
      'all, which is the mistake this option exists to prevent.',
  },
  {
    id: 'slightly-ventilated-timber-frame',
    label: 'Drained and vented cavity, timber frame',
    where: 'The cavity of a timber-framed wall, which has to be drained and vented.',
    thicknessMm: 50,
    ventilation: 'slightly-ventilated',
    openingAreaMm2PerM: 580,
    emissivity: 'high',
    icon: 'clear',
    note:
      'BR 443 (2019) 4.7.1 works this one through: a timber framed wall has to be drained ' +
      'and vented, and the NHBC requirement of an open perpend every 1.2 m comes to about ' +
      '580 mm² per metre — over the 500 mm² threshold, so the cavity is slightly ' +
      'ventilated rather than unventilated.',
  },
  {
    id: 'well-ventilated-rainscreen',
    label: 'Behind cladding or tile hanging',
    where: 'An open rainscreen, boarding, or hanging tiles.',
    thicknessMm: 50,
    ventilation: 'well-ventilated',
    openingAreaMm2PerM: 1500,
    emissivity: 'high',
    icon: 'ventilated',
    note:
      'A cavity behind tile hanging, boarding or a rainscreen. BR 443 (2019) 4.7.1 calls ' +
      'this out as a well ventilated cavity: the air in it is at outdoor temperature, so ' +
      'it and everything outboard of it are disregarded, and the outer surface resistance ' +
      'rises because the cladding shelters the wall.',
  },
  {
    id: 'service-void',
    label: 'Batten or service void',
    where: 'Behind a dry lining on battens, or a service zone inside the airtight layer.',
    thicknessMm: 25,
    ventilation: 'unventilated',
    openingAreaMm2PerM: 0,
    emissivity: 'high',
    icon: 'service-void',
    note:
      'BR 443 (2006) 4.8.1 names "the space between the battens in a dry-lined wall" as ' +
      'an air layer, so it is treated like any other unventilated cavity. Add the battens ' +
      'crossing it as members: they bridge it, and if they divide it into pockets deeper ' +
      'than a tenth of their spacing it becomes an air void instead, which is calculated ' +
      'differently.',
  },
];

export function cavityPreset(id: string): CavityPreset | undefined {
  return CAVITY_PRESETS.find((preset) => preset.id === id);
}

/** Which preset a cavity currently matches, if any. */
/**
 * Which preset a cavity is set to.
 *
 * The recorded choice wins where there is one. Falling back to matching on the values
 * covers a build-up that arrived by link or predates the field, and can only ever return
 * the first preset that fits — which is the right answer when nothing better is known.
 */
export function matchingCavityPreset(layer: UiLayer): CavityPreset | undefined {
  const recorded =
    layer.cavityPresetId === undefined ? undefined : cavityPreset(layer.cavityPresetId);
  if (recorded !== undefined && presetFitsLayer(recorded, layer)) {
    return recorded;
  }
  return CAVITY_PRESETS.find((preset) => presetFitsLayer(preset, layer));
}

/** Whether a preset's settings are the ones the layer currently carries. */
function presetFitsLayer(preset: CavityPreset, layer: UiLayer): boolean {
  return (
    preset.ventilation === layer.ventilation &&
    preset.emissivity === layer.emissivity &&
    (preset.ventilation !== 'slightly-ventilated' ||
      preset.openingAreaMm2PerM === layer.openingAreaMm2PerM)
  );
}

/**
 * A first guess at what kind of cavity is being added, from what sits either side of it.
 *
 * The layup already says most of it. A gap outboard of insulation board is the residual
 * gap of a partial fill; a gap behind a dry lining is a service void; a gap with tile
 * hanging or boarding outside it is ventilated to the outdoors. Guessing spares the user
 * a decision they often cannot make confidently, and the ones it gets wrong are one click
 * from being corrected — so it is offered as a starting point and labelled as a guess,
 * never applied silently as though it were known.
 *
 * `index` is where the cavity sits in the build-up, inside to outside.
 */
export function guessCavityPreset(
  layers: readonly UiLayer[],
  index: number,
): CavityPreset | undefined {
  const categoryAt = (at: number): LayerDrawCategory | undefined => {
    const layer = layers[at];
    return layer === undefined ? undefined : layerDrawCategory(layer.materialId, layer.kind);
  };
  const inboard = categoryAt(index - 1);
  const outboard = categoryAt(index + 1);
  const inboardLayer = layers[index - 1];

  /*
   * Nothing outboard, or only a covering: the gap is open to the outside. A rainscreen,
   * boarding or hanging tiles all sit on battens over a vented cavity, and BR 443 4.7.1
   * names that case specifically.
   */
  if (outboard === undefined || outboard === 'covering') {
    return cavityPreset('well-ventilated-rainscreen');
  }

  /*
   * A gap in front of insulation board is a partial fill's residual cavity. Where that
   * board is foil-faced the foil looks into this gap, which roughly doubles it — the one
   * case where guessing wrong costs a real amount of resistance, so it keys off the
   * material rather than the category.
   */
  if (inboard === 'insulation') {
    return cavityPreset(
      inboardLayer?.materialId === 'pir-board' ? 'unventilated-low-e' : 'partial-fill-residual',
    );
  }

  /* A gap behind a dry lining is a service or batten void. */
  if (inboard === 'plaster-and-render') {
    return cavityPreset('service-void');
  }

  /*
   * A gap in a timber-framed wall has to be drained and vented, which BR 443 4.7.1 works
   * through. Recognised by sheathing board on the inboard side of the cavity.
   */
  if (inboard === 'timber-and-board') {
    return cavityPreset('slightly-ventilated-timber-frame');
  }

  return cavityPreset('unventilated-masonry');
}

export function blankAirLayer(): UiLayer {
  return { ...blankSolidLayer(), kind: 'air', label: 'Cavity', thicknessMm: 25 };
}

/**
 * A filled-cavity masonry wall and a timber-frame wall, both written by us as
 * starting points. Neither is taken from any other tool's example library.
 */
export function defaultState(): UiState {
  return {
    name: 'Filled cavity masonry wall',
    heatFlowDirection: 'horizontal',
    layers: [
      layerFromMaterial('gypsum-plasterboard', 12.5),
      layerFromMaterial('aircrete-block', 100),
      layerFromMaterial('mineral-wool-quilt', 100),
      layerFromMaterial('brick-outer-leaf', 102.5),
    ],
    conditions: commonDefaultConditions('outside-air'),
    section: 'combined',
    internalSurfaceCondition: 'normal-air-circulation',
    externalEnvironment: 'outside-air',
    // BR 443 (2019) 4.8.1: level 1 unless the conditions for level 0 are met.
    airGapLevel: DEFAULT_AIR_GAP_LEVEL,
    exposureZoneId: 'moderate',
  };
}

export function timberFrameExample(): UiState {
  const insulation = layerFromMaterial('mineral-wool-quilt', 140);
  return {
    name: 'Timber frame wall',
    heatFlowDirection: 'horizontal',
    layers: [
      layerFromMaterial('gypsum-plasterboard', 12.5),
      {
        ...insulation,
        /*
         * BR 443 (2019) 4.4.1(i) gives 15 % as the default timber fraction for a
         * timber-frame wall — not the bare width-over-spacing figure, because plates,
         * lintels and doubled studs at openings are not a fixed share of the spacing.
         * So the example carries the convention rather than a measurement.
         */
        bridgedPercent: 15,
        bridgeLabel: 'Softwood stud',
        bridgeMaterialId: 'softwood-structural',
        bridgeLambdaWPerMK: 0.13,
        bridgeSizing: 'fraction',
        bridgeWidthMm: 38,
        bridgeSpacingMm: 600,
      },
      layerFromMaterial('osb-board', 9),
      { ...blankAirLayer(), thicknessMm: 25, ventilation: 'well-ventilated' },
      layerFromMaterial('brick-outer-leaf', 102.5),
    ],
    conditions: commonDefaultConditions('outside-air'),
    section: 'combined',
    internalSurfaceCondition: 'normal-air-circulation',
    externalEnvironment: 'outside-air',
    // BR 443 (2019) 4.8.1: level 1 unless the conditions for level 0 are met.
    airGapLevel: DEFAULT_AIR_GAP_LEVEL,
    exposureZoneId: 'moderate',
  };
}


/**
 * Density and specific heat for a layer, taken from the catalogue record rather than
 * carried in UiLayer.
 *
 * Neither value affects a U-value, so neither is editable and neither is encoded in the
 * share link. They are needed for the build-up's mass and heat capacity, and they are a
 * property of the material, so the material id is enough to recover them. Editing lambda
 * or mu clears the id (see LayerTable), which is what makes this safe: an id that is
 * still set means the layer is exactly the catalogue record.
 *
 * A layer with a typed-in lambda has no density, and gets none here. That is honest
 * rather than unhelpful — the engine reports which layers it could not weigh.
 */
function massProperties(materialId: string | null): {
  readonly densityKgPerM3?: number;
  readonly specificHeatCapacityJPerKgK?: number;
} {
  if (materialId === null) {
    return {};
  }
  const material = findMaterialById(materialId);
  if (material === undefined) {
    return {};
  }
  const { densityKgPerM3, specificHeatCapacityJPerKgK } = toEngineMaterial(material);
  return {
    ...(densityKgPerM3 === undefined ? {} : { densityKgPerM3 }),
    ...(specificHeatCapacityJPerKgK === undefined
      ? {}
      : { specificHeatCapacityJPerKgK }),
  };
}

/**
 * Convert the UI model to the engine's model. This is the single place where
 * millimetres become metres and percentages become fractions.
 */
export function toBuildingElement(state: UiState): BuildingElement {
  const layers: Layer[] = state.layers.map((layer) => {
    if (layer.kind === 'air') {
      const air = {
        kind: 'air' as const,
        id: layer.id,
        label: layer.label,
        thicknessM: millimetresToMetres(layer.thicknessMm),
        ventilation: layer.ventilation,
        openingAreaMm2PerM: layer.openingAreaMm2PerM,
        emissivity: layer.emissivity,
      };
      if (layer.bridgedPercent <= 0) {
        return air;
      }
      /*
       * Battens, studs or dabs crossing the cavity. The clear span between members is
       * what decides whether the pockets left between them are still air layers
       * (BR 443 2006 4.8.1), and it is only known when the user gave dimensions rather
       * than a bare percentage - so it is passed only then, and the engine skips the
       * check rather than inventing a spacing.
       */
      const clearWidthMm =
        layer.bridgeSizing === 'dimensions'
          ? bridgePitchMm(layer.bridgeWidthMm, layer.bridgeSpacingMm, layer.bridgeDistanceBasis) -
            layer.bridgeWidthMm
          : undefined;
      return {
        ...air,
        bridging: {
          label: layer.bridgeLabel,
          areaFraction: percentToFraction(layer.bridgedPercent),
          material: {
            ...massProperties(layer.bridgeMaterialId),
            lambdaWPerMK: layer.bridgeLambdaWPerMK,
          },
          ...(clearWidthMm === undefined || clearWidthMm <= 0
            ? {}
            : { clearWidthM: millimetresToMetres(clearWidthMm) }),
        },
      };
    }
    const solid = {
      kind: 'solid' as const,
      id: layer.id,
      label: layer.label,
      thicknessM: millimetresToMetres(layer.thicknessMm),
      material: {
        ...massProperties(layer.materialId),
        lambdaWPerMK: layer.lambdaWPerMK,
        vapourResistanceFactorMu: layer.vapourResistanceFactorMu,
      },
    };
    if (layer.bridgedPercent <= 0) {
      return solid;
    }
    return {
      ...solid,
      bridging: {
        label: layer.bridgeLabel,
        areaFraction: percentToFraction(layer.bridgedPercent),
        material: {
          ...massProperties(layer.bridgeMaterialId),
          lambdaWPerMK: layer.bridgeLambdaWPerMK,
        },
      },
    };
  });
  return {
    id: 'element',
    name: state.name,
    heatFlowDirection: state.heatFlowDirection,
    layers,
    internalSurfaceCondition: state.internalSurfaceCondition,
    // Guarded so a direction change can never hand the engine an environment it
    // refuses; the panel keeps the two in step, and this is the belt to that braces.
    externalEnvironment: environmentForDirection(
      state.externalEnvironment,
      state.heatFlowDirection,
    ),
  };
}

/**
 * How a layer is drawn in the cross-section. The catalogue's own category drives it,
 * so a layer looks like what it is made of; 'air' and 'custom' cover the two cases the
 * catalogue cannot answer for - a cavity, and a layer whose lambda was typed in
 * directly. Purely presentational: nothing in the calculation reads it.
 */
export type LayerDrawCategory = MaterialCategory | 'air' | 'custom';

export function layerDrawCategory(materialId: string | null, kind: 'solid' | 'air'): LayerDrawCategory {
  if (kind === 'air') {
    return 'air';
  }
  if (materialId === null) {
    return 'custom';
  }
  return findMaterialById(materialId)?.category ?? 'custom';
}

/** True when any layer is genuinely bridged, i.e. the section toggle is meaningful. */
export function hasBridging(state: UiState): boolean {
  return state.layers.some(
    (layer) => layer.bridgedPercent > 0 && layer.bridgedPercent < 100,
  );
}

/**
 * Whether the build-up fills a masonry cavity wall-to-wall.
 *
 * The case Approved Document C restricts by exposure zone: insulation sitting directly
 * between two masonry leaves with no clear cavity in front of it. A partial fill has an
 * air layer outboard of the insulation and is a different construction, so the test is
 * for masonry on both sides *and* no cavity between the insulation and the outer leaf.
 *
 * Deliberately narrow. It answers "is this the construction the exposure rule is about",
 * not "is this wall risky" — a timber frame, a solid wall or an externally insulated one
 * are all outside the rule and get no warning rather than a vague one.
 */
export function hasFullFillCavity(layers: readonly UiLayer[]): boolean {
  const categories = layers.map((layer) => layerDrawCategory(layer.materialId, layer.kind));
  return layers.some((_layer, index) => {
    if (categories[index] !== 'insulation') {
      return false;
    }
    const before = categories.slice(0, index);
    const after = categories.slice(index + 1);
    const masonryInboard = before.some((c) => c === 'masonry' || c === 'concrete');
    const masonryOutboard = after.some((c) => c === 'masonry' || c === 'concrete');
    // A cavity anywhere between this insulation and the outside makes it a partial fill.
    const cavityOutboard = after.includes('air');
    return masonryInboard && masonryOutboard && !cavityOutboard;
  });
}
