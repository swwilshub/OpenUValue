import type {
  AirLayerVentilation,
  ExternalEnvironmentKind,
  HeatFlowDirection,
  InternalSurfaceCondition,
  ProfileSection,
} from '@openuvalue/engine';
import { EXTERNAL_ENVIRONMENTS, INTERNAL_SURFACE_CONDITIONS } from '@openuvalue/engine';
import { type UiLayer, type UiState, blankSolidLayer, defaultState, makeLayerId } from '../state/model.js';

/**
 * The build-up is encoded into the URL hash so it can be shared by link, with no
 * backend and nothing stored anywhere. The format is version-prefixed
 * (`#1:<base64url>`) so that older links stay decodable if the shape changes.
 *
 * Decoding is deliberately defensive: a truncated or hand-edited hash falls back to
 * the default build-up and reports why, rather than throwing on load.
 */
const FORMAT_VERSION = 1;

interface EncodedLayer {
  readonly k: 's' | 'a';
  readonly n: string;
  readonly t: number;
  readonly m: string | null;
  readonly l: number;
  readonly u: number;
  readonly b?: number;
  readonly bn?: string;
  readonly bm?: string | null;
  readonly bl?: number;
  readonly v?: AirLayerVentilation;
  readonly o?: number;
}

interface EncodedState {
  readonly n: string;
  readonly d: HeatFlowDirection;
  readonly s: ProfileSection;
  readonly c: readonly [number, number, number, number];
  readonly ls: readonly EncodedLayer[];
  /** Internal surface condition. Absent in links written before it existed. */
  readonly i?: InternalSurfaceCondition;
  /** External environment. Absent in links written before it existed. */
  readonly e?: ExternalEnvironmentKind;
}

function toBase64Url(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(encoded: string): string {
  const padded = encoded.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(padded + '='.repeat((4 - (padded.length % 4)) % 4));
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

export function encodeState(state: UiState): string {
  const payload: EncodedState = {
    n: state.name,
    d: state.heatFlowDirection,
    s: state.section,
    c: [
      state.conditions.internalAirTemperatureC,
      state.conditions.internalRelativeHumidityPercent,
      state.conditions.externalAirTemperatureC,
      state.conditions.externalRelativeHumidityPercent,
    ],
    i: state.internalSurfaceCondition,
    e: state.externalEnvironment,
    ls: state.layers.map((layer) => {
      const base: EncodedLayer = {
        k: layer.kind === 'air' ? 'a' : 's',
        n: layer.label,
        t: layer.thicknessMm,
        m: layer.materialId,
        l: layer.lambdaWPerMK,
        u: layer.vapourResistanceFactorMu,
      };
      if (layer.kind === 'air') {
        return { ...base, v: layer.ventilation, o: layer.openingAreaMm2PerM };
      }
      if (layer.bridgedPercent > 0) {
        return {
          ...base,
          b: layer.bridgedPercent,
          bn: layer.bridgeLabel,
          bm: layer.bridgeMaterialId,
          bl: layer.bridgeLambdaWPerMK,
        };
      }
      return base;
    }),
  };
  return `${FORMAT_VERSION}:${toBase64Url(JSON.stringify(payload))}`;
}

const HEAT_FLOW_DIRECTIONS: readonly HeatFlowDirection[] = ['upward', 'horizontal', 'downward'];
const PROFILE_SECTIONS: readonly ProfileSection[] = ['unbridged', 'bridged', 'combined'];
const VENTILATION_CLASSES: readonly AirLayerVentilation[] = [
  'unventilated',
  'slightly-ventilated',
  'well-ventilated',
];
// Taken from the engine's own listings, so a case added there cannot be silently
// dropped when decoding a link.
const INTERNAL_CONDITION_KINDS: readonly InternalSurfaceCondition[] =
  INTERNAL_SURFACE_CONDITIONS.map((condition) => condition.kind);
const EXTERNAL_ENVIRONMENT_KINDS: readonly ExternalEnvironmentKind[] =
  EXTERNAL_ENVIRONMENTS.filter((environment) => environment.supported).map(
    (environment) => environment.kind,
  );

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function finiteNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function decodeLayer(raw: unknown): UiLayer {
  const base = { ...blankSolidLayer(), id: makeLayerId() };
  if (!isRecord(raw)) {
    return base;
  }
  const kind = raw['k'] === 'a' ? 'air' : 'solid';
  const ventilation = raw['v'];
  return {
    ...base,
    kind,
    label: typeof raw['n'] === 'string' ? raw['n'] : base.label,
    thicknessMm: Math.max(0, finiteNumber(raw['t'], base.thicknessMm)),
    materialId: typeof raw['m'] === 'string' ? raw['m'] : null,
    lambdaWPerMK: Math.max(1e-6, finiteNumber(raw['l'], base.lambdaWPerMK)),
    vapourResistanceFactorMu: Math.max(1, finiteNumber(raw['u'], base.vapourResistanceFactorMu)),
    bridgedPercent: Math.min(100, Math.max(0, finiteNumber(raw['b'], 0))),
    bridgeLabel: typeof raw['bn'] === 'string' ? raw['bn'] : base.bridgeLabel,
    bridgeMaterialId: typeof raw['bm'] === 'string' ? raw['bm'] : null,
    bridgeLambdaWPerMK: Math.max(1e-6, finiteNumber(raw['bl'], base.bridgeLambdaWPerMK)),
    ventilation:
      typeof ventilation === 'string' &&
      VENTILATION_CLASSES.includes(ventilation as AirLayerVentilation)
        ? (ventilation as AirLayerVentilation)
        : 'unventilated',
    openingAreaMm2PerM: Math.max(0, finiteNumber(raw['o'], 0)),
  };
}

export interface DecodeResult {
  readonly state: UiState;
  /** Set when the hash could not be used, so the UI can say so rather than silently reset. */
  readonly problem?: string;
}

export function decodeState(hash: string): DecodeResult {
  const trimmed = hash.replace(/^#/, '');
  if (trimmed.length === 0) {
    return { state: defaultState() };
  }
  const separatorIndex = trimmed.indexOf(':');
  if (separatorIndex === -1) {
    return { state: defaultState(), problem: 'The link had no format version and was ignored.' };
  }
  const version = Number(trimmed.slice(0, separatorIndex));
  if (version !== FORMAT_VERSION) {
    return {
      state: defaultState(),
      problem: `The link uses format version ${trimmed.slice(
        0,
        separatorIndex,
      )}, which this build does not understand.`,
    };
  }
  try {
    const parsed: unknown = JSON.parse(fromBase64Url(trimmed.slice(separatorIndex + 1)));
    if (!isRecord(parsed) || !Array.isArray(parsed['ls'])) {
      return { state: defaultState(), problem: 'The link did not contain a build-up.' };
    }
    const fallback = defaultState();
    const conditions = Array.isArray(parsed['c']) ? parsed['c'] : [];
    const direction = parsed['d'];
    const section = parsed['s'];
    return {
      state: {
        name: typeof parsed['n'] === 'string' ? parsed['n'] : fallback.name,
        heatFlowDirection:
          typeof direction === 'string' &&
          HEAT_FLOW_DIRECTIONS.includes(direction as HeatFlowDirection)
            ? (direction as HeatFlowDirection)
            : 'horizontal',
        section:
          typeof section === 'string' && PROFILE_SECTIONS.includes(section as ProfileSection)
            ? (section as ProfileSection)
            : 'combined',
        layers: parsed['ls'].map(decodeLayer),
        // A link from before these existed decodes to the ISO 6946 defaults, which is
        // what such a link meant when it was written.
        internalSurfaceCondition:
          typeof parsed['i'] === 'string' &&
          INTERNAL_CONDITION_KINDS.includes(parsed['i'] as InternalSurfaceCondition)
            ? (parsed['i'] as InternalSurfaceCondition)
            : 'normal-air-circulation',
        externalEnvironment:
          typeof parsed['e'] === 'string' &&
          EXTERNAL_ENVIRONMENT_KINDS.includes(parsed['e'] as ExternalEnvironmentKind)
            ? (parsed['e'] as ExternalEnvironmentKind)
            : 'outside-air',
        conditions: {
          internalAirTemperatureC: finiteNumber(conditions[0], 20),
          internalRelativeHumidityPercent: Math.min(
            100,
            Math.max(0, finiteNumber(conditions[1], 50)),
          ),
          externalAirTemperatureC: finiteNumber(conditions[2], 0),
          externalRelativeHumidityPercent: Math.min(
            100,
            Math.max(0, finiteNumber(conditions[3], 90)),
          ),
        },
      },
    };
  } catch {
    return { state: defaultState(), problem: 'The link could not be decoded.' };
  }
}
