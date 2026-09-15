import type {
  ExposureZoneId,
  AirGapLevel,
  AirLayerVentilation,
  ExternalEnvironmentKind,
  HeatFlowDirection,
  InternalSurfaceCondition,
  ProfileSection,
} from '@openuvalue/engine';
import {
  EXPOSURE_ZONES,
  EXTERNAL_ENVIRONMENTS,
  INTERNAL_SURFACE_CONDITIONS,
  MAX_PITCH_DEGREES,
  PITCH_TREATED_AS_VERTICAL_DEGREES,
} from '@openuvalue/engine';
import {
  DEFAULT_ROOF_PITCH_DEGREES,
  type UiElementKind,
  type UiFasteners,
  type UiLayer,
  type UiState,
  blankSolidLayer,
  defaultState,
  directionForElement,
  makeLayerId,
} from '../state/model.js';

/** The element kinds, for validating a hand-edited link. */
const ELEMENT_KINDS: readonly UiElementKind[] = ['wall', 'roof', 'floor'];

/** What a link written before element kinds existed meant by its direction. */
function elementKindForDirection(direction: HeatFlowDirection): UiElementKind {
  switch (direction) {
    case 'upward':
      return 'roof';
    case 'downward':
      return 'floor';
    case 'horizontal':
      return 'wall';
  }
}

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
  readonly bz?: 'dimensions' | 'fraction';
  readonly bw?: number;
  readonly bsp?: number;
  /** Whether bsp is centre-to-centre or a clear gap. Absent in older links. */
  readonly bdb?: 'centres' | 'clear';
  readonly v?: AirLayerVentilation;
  readonly o?: number;
  /** Air layers: surface emissivity. Absent in links written before it existed. */
  readonly em?: 'high' | 'low';
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
  /** Air gap level. Absent in links written before it existed. */
  readonly g?: AirGapLevel;
  /** Fasteners as [chi, per m², recessedFlatRoof, bothEndsInMetalSheets]. */
  readonly f?: readonly [number, number, number, number];
  /** Wind-driven rain exposure zone. Absent in links written before it existed. */
  readonly x?: ExposureZoneId;
  /** What the element is. Absent in links written before roofs had a pitch. */
  readonly k?: UiElementKind;
  /** Roof pitch in degrees. Absent unless the element is a roof. */
  readonly p?: number;
}

/**
 * Decode the fastener tuple, tolerating anything that is not one.
 *
 * A hash is user-editable text, so a malformed 'f' must not throw or produce a
 * half-built object: it produces no fasteners, exactly as an old link does. Returning a
 * spreadable partial keeps the "absent" and "present" cases one expression at the call
 * site.
 */
function decodeFasteners(value: unknown): { fasteners?: UiFasteners } {
  if (!Array.isArray(value) || value.length < 4) {
    return {};
  }
  const chi = finiteNumber(value[0], Number.NaN);
  const perM2 = finiteNumber(value[1], Number.NaN);
  if (!Number.isFinite(chi) || !Number.isFinite(perM2) || chi < 0 || perM2 < 0) {
    return {};
  }
  return {
    fasteners: {
      pointThermalTransmittanceWPerK: chi,
      fastenersPerM2: perM2,
      recessedFlatRoof: value[2] === 1,
      bothEndsInMetalSheets: value[3] === 1,
    },
  };
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
    x: state.exposureZoneId,
    k: state.elementKind,
    ...(state.elementKind === 'roof' ? { p: state.roofPitchDegrees } : {}),
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
    g: state.airGapLevel,
    // Fasteners travel as a four-element tuple so the hash stays short: chi, per m²,
    // and the two flags as 0/1. Absent entirely when the user has not entered any.
    ...(state.fasteners === undefined
      ? {}
      : {
          f: [
            state.fasteners.pointThermalTransmittanceWPerK,
            state.fasteners.fastenersPerM2,
            state.fasteners.recessedFlatRoof ? 1 : 0,
            state.fasteners.bothEndsInMetalSheets ? 1 : 0,
          ] as const,
        }),
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
        return {
          ...base,
          v: layer.ventilation,
          o: layer.openingAreaMm2PerM,
          em: layer.emissivity,
        };
      }
      if (layer.bridgedPercent > 0) {
        return {
          ...base,
          b: layer.bridgedPercent,
          bn: layer.bridgeLabel,
          bm: layer.bridgeMaterialId,
          bl: layer.bridgeLambdaWPerMK,
          bz: layer.bridgeSizing,
          bw: layer.bridgeWidthMm,
          bsp: layer.bridgeSpacingMm,
          bdb: layer.bridgeDistanceBasis,
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
    // A link written before studs had dimensions keeps its typed percentage.
    bridgeSizing: raw['bz'] === 'dimensions' ? 'dimensions' : 'fraction',
    bridgeWidthMm: Math.max(0, finiteNumber(raw['bw'], base.bridgeWidthMm)),
    bridgeSpacingMm: Math.max(1, finiteNumber(raw['bsp'], base.bridgeSpacingMm)),
    // An older link meant ordinary surfaces, which is what every cavity was then.
    emissivity: raw['em'] === 'low' ? 'low' : 'high',
    // A link written before the basis existed meant centres, which is what the field
    // always was, so an absent value decodes to that rather than changing the geometry.
    bridgeDistanceBasis: raw['bdb'] === 'clear' ? 'clear' : 'centres',
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
    const decodedDirection: HeatFlowDirection =
      typeof direction === 'string' &&
      HEAT_FLOW_DIRECTIONS.includes(direction as HeatFlowDirection)
        ? (direction as HeatFlowDirection)
        : 'horizontal';
    const elementKind: UiElementKind =
      typeof parsed['k'] === 'string' && ELEMENT_KINDS.includes(parsed['k'] as UiElementKind)
        ? (parsed['k'] as UiElementKind)
        : elementKindForDirection(decodedDirection);
    const rawPitch = parsed['p'];
    const pitch =
      typeof rawPitch === 'number' && Number.isFinite(rawPitch)
        ? Math.min(MAX_PITCH_DEGREES, Math.max(0, rawPitch))
        : /*
           * An old link that said "upward" meant a flat roof or a ceiling, which is 0.
           * One that said "horizontal" and is being read as a roof only gets there by
           * hand-editing, and a steep pitch is the reading that keeps its resistances.
           */
          decodedDirection === 'upward'
          ? 0
          : elementKind === 'roof'
            ? PITCH_TREATED_AS_VERTICAL_DEGREES
            : DEFAULT_ROOF_PITCH_DEGREES;
    return {
      state: {
        name: typeof parsed['n'] === 'string' ? parsed['n'] : fallback.name,
        /*
         * Exposure is a site property rather than a property of the build-up, so a link
         * that predates it falls back rather than failing. It changes no number: it
         * decides whether a warning about filling the cavity is shown.
         */
        exposureZoneId:
          typeof parsed['x'] === 'string' &&
          EXPOSURE_ZONES.some((zone) => zone.id === parsed['x'])
            ? (parsed['x'] as UiState['exposureZoneId'])
            : fallback.exposureZoneId,
        /*
         * The element kind and its pitch arrived after the direction did, so a link
         * written before them carries only 'd'. Such a link is read back through the
         * kind that direction implied at the time, which is what it meant: 'upward' was
         * only ever reachable by choosing a roof. The direction is then recomputed from
         * the pair rather than trusted from the hash, so a hand-edited link cannot
         * describe a 20-degree roof with a wall's surface resistances.
         */
        elementKind,
        roofPitchDegrees: pitch,
        heatFlowDirection: directionForElement(elementKind, pitch),
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
        // A link from before the correction existed decodes to BR 443's default, which
        // is what such a build-up would be assessed at today.
        airGapLevel:
          parsed['g'] === 'level-0' || parsed['g'] === 'level-2'
            ? parsed['g']
            : 'level-1',
        // A link written before the fastener correction existed carries no 'f', and
        // decodes to no fasteners — which is what it meant, and what the UI then flags
        // as an unanswered question rather than as a zero.
        ...decodeFasteners(parsed['f']),
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
