import type {
  AirLayerVentilation,
  BuildingElement,
  EnvironmentConditions,
  ExternalEnvironmentKind,
  HeatFlowDirection,
  InternalSurfaceCondition,
  Layer,
  ProfileSection,
} from '@openuvalue/engine';
import { externalEnvironment, externalEnvironmentsForDirection } from '@openuvalue/engine';
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
 * A repeating member's share of the element face is simply its width divided by its
 * spacing: 38 mm members at 400 mm centres occupy 9.5 % of the wall. That is plain
 * arithmetic and needs no standard behind it.
 *
 * What it does NOT include is the rest of the timber in a real wall - sole plates,
 * head plates, noggins, lintels and studs doubled at openings - which is why a
 * conventional whole-element allowance is usually larger than this figure. Typing the
 * percentage directly is the way to use such an allowance instead.
 *
 * TODO(verify): whether BR 443 prescribes how the bridged fraction for a timber-frame
 * wall is to be derived, and whether it gives a standard allowance to use in place of
 * a measured width and spacing.
 */
export function bridgedPercentFromDimensions(widthMm: number, spacingMm: number): number {
  if (!Number.isFinite(widthMm) || !Number.isFinite(spacingMm) || spacingMm <= 0) {
    return 0;
  }
  return Math.min(100, Math.max(0, (widthMm / spacingMm) * 100));
}

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
        // 38 mm studs at 400 mm centres: 38/400 = 9.5 % of the wall face.
        bridgedPercent: bridgedPercentFromDimensions(38, 400),
        bridgeLabel: 'Softwood stud',
        bridgeMaterialId: 'softwood-structural',
        bridgeLambdaWPerMK: 0.13,
        bridgeSizing: 'dimensions',
        bridgeWidthMm: 38,
        bridgeSpacingMm: 400,
      },
      layerFromMaterial('osb-board', 9),
      { ...blankAirLayer(), thicknessMm: 25, ventilation: 'well-ventilated' },
      layerFromMaterial('brick-outer-leaf', 102.5),
    ],
    conditions: commonDefaultConditions('outside-air'),
    section: 'combined',
    internalSurfaceCondition: 'normal-air-circulation',
    externalEnvironment: 'outside-air',
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
        material: { lambdaWPerMK: layer.bridgeLambdaWPerMK },
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
