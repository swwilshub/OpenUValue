import type {
  AirLayerVentilation,
  BuildingElement,
  EnvironmentConditions,
  HeatFlowDirection,
  Layer,
  ProfileSection,
} from '@openuvalue/engine';
import { millimetresToMetres, percentToFraction } from '@openuvalue/engine';
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
}

let nextId = 0;
export function makeLayerId(): string {
  nextId += 1;
  return `layer-${nextId}`;
}

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
    conditions: {
      internalAirTemperatureC: 20,
      internalRelativeHumidityPercent: 50,
      externalAirTemperatureC: 0,
      externalRelativeHumidityPercent: 90,
    },
    section: 'combined',
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
        bridgedPercent: 15,
        bridgeLabel: 'Softwood stud',
        bridgeMaterialId: 'softwood-structural',
        bridgeLambdaWPerMK: 0.13,
      },
      layerFromMaterial('osb-board', 9),
      { ...blankAirLayer(), thicknessMm: 25, ventilation: 'well-ventilated' },
      layerFromMaterial('brick-outer-leaf', 102.5),
    ],
    conditions: {
      internalAirTemperatureC: 20,
      internalRelativeHumidityPercent: 50,
      externalAirTemperatureC: 0,
      externalRelativeHumidityPercent: 90,
    },
    section: 'combined',
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
  };
}

/** True when any layer is genuinely bridged, i.e. the section toggle is meaningful. */
export function hasBridging(state: UiState): boolean {
  return state.layers.some(
    (layer) => layer.kind === 'solid' && layer.bridgedPercent > 0 && layer.bridgedPercent < 100,
  );
}
