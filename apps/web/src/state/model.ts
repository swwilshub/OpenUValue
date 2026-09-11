import type {
  AirGapLevel,
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
  /** Width of one member across the face, mm. Used when bridgeSizing is 'dimensions'. */
  readonly bridgeWidthMm: number;
  /** Spacing of the members, centre to centre, mm. */
  readonly bridgeSpacingMm: number;
  /** Air layers only. */
  readonly ventilation: AirLayerVentilation;
  readonly openingAreaMm2PerM: number;
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

export function bridgedPercentFromDimensions(widthMm: number, spacingMm: number): number {
  if (!Number.isFinite(widthMm) || !Number.isFinite(spacingMm) || spacingMm <= 0) {
    return 0;
  }
  const fraction = widthMm / spacingMm + BR443_ADDITIONAL_TIMBER_ALLOWANCE;
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
    bridgeLabel: 'Timber stud',
    bridgeMaterialId: 'softwood-structural',
    bridgeLambdaWPerMK: 0.13,
    bridgeSizing: 'dimensions',
    bridgeWidthMm: DEFAULT_STUD_WIDTH_MM,
    bridgeSpacingMm: DEFAULT_STUD_SPACING_MM,
    ventilation: 'unventilated',
    openingAreaMm2PerM: 0,
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
      return {
        kind: 'air',
        id: layer.id,
        label: layer.label,
        thicknessM: millimetresToMetres(layer.thicknessMm),
        ventilation: layer.ventilation,
        openingAreaMm2PerM: layer.openingAreaMm2PerM,
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
    (layer) => layer.kind === 'solid' && layer.bridgedPercent > 0 && layer.bridgedPercent < 100,
  );
}
