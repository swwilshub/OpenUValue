# OpenUValue — Phase 1 Plan

Open-source, browser-based building-envelope calculator. Clean-room implementation
against published standards (BS EN ISO 6946, BR 443, BS EN ISO 13788). No third-party
calculator's code, text, graphics, colours or material data is used or reproduced.

Status: **approved with Revision 2 corrections; building.**

---

## Revision 2 — profile, validity and vapour corrections

Revision 1 proposed `'bridged'` as a candidate default profile and derived the
`'combined'` profile by simply summing the parallel-combined layer resistances. Both
were wrong. Corrections, all adopted:

**R2.1 — `'bridged'` is not the conservative case for interstitial condensation.**
The bridging (stud) path has the lower total resistance, so it carries the higher heat
flux. That makes its *internal surface* colder but its *outer* layers **warmer**,
including the sheathing, which is normally the condensation plane. The worst case at
the sheathing is therefore the **unbridged insulation path**. A `'bridged'` default
would under-report sheathing condensation. `'bridged'` is worst only for internal
surface temperature.
`// TODO(verify)`: BS 5250 is understood to assess interstitial condensation through
the insulation path rather than the stud — confirm against a copy of BS 5250.

**R2.2 — the `'combined'` profile must sum to the reported R_T.**
Summing the parallel-combined layer resistances yields the isothermal-planes lower
bound R''_T, not the ISO 6946 reported R_T = (R'_T + R''_T)/2. Drawn next to the
reported U-value, that profile would imply a different heat flux from the U-value
beside it. Fix: scale **only the material layers** by

```
k = (R_T − Rsi − Rse) / (R''_T − Rsi − Rse)          // k >= 1, since R_T >= R''_T
```

holding Rsi and Rse fixed, and take q = ΔT / R_T. Then
Rsi + k·Σ R_j,combined + Rse = Rsi + (R_T − Rsi − Rse) + Rse = R_T exactly, and the
profile is consistent with the U-value shown.

**R2.3 — guard the combined method's validity limit.**
ISO 6946's combined method applies only while R'_T / R''_T ≤ 1.5; beyond that the
element goes to ISO 10211 numerical modelling. Steel studs and other metal-bridged
layers can exceed this. When they do, `uValueWPerM2K` is **`null`**, not a number, so
`strictNullChecks` forces every consumer to handle it and no caller can render an
invalid U-value by accident. The out-of-scope figure is still available as
`provisionalUValueWPerM2K` for diagnostics only.
Note the two forms of the criterion agree: at R'_T = 1.5·R''_T, R_T = 1.25·R''_T and
the error estimate e = (R'_T − R''_T)/(2·R_T) = 20 %. The ratio limit and the 20 %
error limit are the same rule, so the code checks the ratio and reports both.

**R2.4 — the condensation verdict is independent of the display mode.**
Risk is evaluated on **every** section path (all-unbridged, all-bridged, and, where an
element has several inhomogeneous layers, each cross-product combination — the same
enumeration the upper limit uses), and the **worst result at each interface** is
reported whichever profile is displayed. The mode toggle changes only what is drawn
and has no bearing on the safety verdict. Phase 1's verdict is surface temperature
versus dew point; the same both-paths-then-worst-per-interface contract is what the
`CondensationMethod` interface will hand to ISO 13788 and DIN 4108-3 Glaser later.

**R2.5 — vapour in `'combined'` mode uses the unbridged path's S_d.**
Area-weighting μ·d across a stud layer has no clean physical meaning, so the combined
profile carries the **unbridged** path's S_d values. This is part of the same in-house
convention as R2.2 and is labelled as such in the code and the UI.

`'combined'` remains the default display mode, with R2.2's scaling applied and R2.3's
guard in front of it.

---

## 1. Repository layout

```
OpenUValue/
├── CLAUDE.md                     conventions (units, citations, TODO(verify) policy)
├── PLAN.md                       this file
├── README.md                     what it is, how to run
├── ROADMAP.md                    out-of-scope items, in dependency order
├── VERIFY.md                     every value/formula needing a printed-standard check
├── LICENSE                       MIT
├── package.json                  private root; scripts: build, test, lint, typecheck, dev
├── pnpm-workspace.yaml           packages/*, apps/*
├── tsconfig.base.json            strict: true + noUncheckedIndexedAccess, ES2022, NodeNext
├── .gitignore
│
├── packages/engine/              @openuvalue/engine — pure, zero runtime deps, no DOM
│   ├── package.json
│   ├── tsconfig.json
│   ├── vitest.config.ts
│   └── src/
│       ├── index.ts              public barrel — the only import surface for consumers
│       ├── units.ts              branded-comment unit aliases + unit documentation
│       ├── types.ts              Layer, Element, BoundaryConditions, results
│       ├── constants.ts          surface resistances, air-layer table, psychro constants
│       ├── surfaceResistance.ts  Rsi/Rse by heat-flow direction (ISO 6946 + BR 443)
│       ├── airLayer.ts           unventilated / slightly / well-ventilated air layers
│       ├── resistance.ts         per-layer R = d/λ, air layers, validation
│       ├── inhomogeneous.ts      ISO 6946 combined method: upper + lower limits
│       ├── uvalue.ts             total R and U, method selection, warnings
│       ├── temperatureProfile.ts steady-state interface temperatures
│       ├── psychrometrics.ts     p_sat, dew point, vapour pressure (ISO 13788 Annex E)
│       ├── rounding.ts           reporting rounding, kept separate from raw maths
│       ├── warnings.ts           typed diagnostic codes (no thrown errors for modelling)
│       ├── condensation/
│       │   ├── method.ts         CondensationMethod interface + registry (empty in P1)
│       │   └── README.md         how to add ISO 13788 / DIN 4108-3 Glaser later
│       └── __tests__/            *.test.ts, Vitest
│
├── packages/materials/           @openuvalue/materials — JSON DB + zero-dep validator
│   ├── package.json
│   ├── data/materials.json       ~15 generic UK entries
│   ├── schema/material.schema.json   JSON Schema 2020-12 (for external tooling)
│   └── src/
│       ├── types.ts              MaterialRecord
│       ├── validate.ts           hand-rolled validator (no runtime deps)
│       ├── catalogue.ts          lookup by id / category, toEngineMaterial()
│       ├── index.ts
│       └── __tests__/materials.test.ts
│
└── apps/web/                     Vite + React, no backend
    ├── index.html
    ├── vite.config.ts
    ├── package.json
    └── src/
        ├── main.tsx
        ├── App.tsx
        ├── state/buildup.ts      reducer over the element model
        ├── url/codec.ts          URL-hash encode/decode of the build-up
        ├── components/
        │   ├── LayerTable.tsx        editable: material, thickness, bridged fraction
        │   ├── MaterialSelect.tsx
        │   ├── BoundaryPanel.tsx     direction, θi/RHi, θe/RHe, Rsi/Rse overrides
        │   ├── ResultsPanel.tsx      live U, ΣR, upper/lower limits, warnings
        │   ├── CrossSection.tsx      to-scale SVG + temperature line overlay
        │   └── ShareLink.tsx
        └── styles.css                our own visual language
```

---

## 2. Engine data model

All numbers SI, unit in the name. Everything `readonly`; the engine never mutates input.

```ts
export type HeatFlowDirection = 'upward' | 'horizontal' | 'downward';

/** Thermophysical properties of one material. Only lambda is needed for U-values. */
export interface MaterialProperties {
  readonly lambdaWPerMK: number;             // design thermal conductivity
  readonly densityKgPerM3?: number;          // rho — needed by ISO 13786 later
  readonly specificHeatCapacityJPerKgK?: number; // c  — needed by ISO 13786 later
  readonly vapourResistanceFactorMu?: number;    // mu — needed by ISO 13788 later
}

/** The bridging (e.g. stud/rafter) section within an otherwise homogeneous layer. */
export interface LayerBridging {
  readonly label: string;
  readonly areaFraction: number;             // 0..1, fraction of element area bridged
  readonly material: MaterialProperties;
}

export interface SolidLayer {
  readonly kind: 'solid';
  readonly id: string;
  readonly label: string;
  readonly thicknessM: number;
  readonly material: MaterialProperties;
  readonly bridging?: LayerBridging;         // present => inhomogeneous layer
}

export type AirLayerVentilation = 'unventilated' | 'slightly-ventilated' | 'well-ventilated';

export interface AirLayer {
  readonly kind: 'air';
  readonly id: string;
  readonly label: string;
  readonly thicknessM: number;
  readonly ventilation: AirLayerVentilation;
  readonly openingAreaMm2PerM?: number;      // required for 'slightly-ventilated'
}

export type Layer = SolidLayer | AirLayer;

/** Fixed thermal resistance, e.g. a declared product R with no thickness maths. */
export interface FixedResistanceLayer {
  readonly kind: 'fixed-resistance';
  readonly id: string;
  readonly label: string;
  readonly thicknessM: number;               // drawn to scale only
  readonly resistanceM2KPerW: number;
}

export interface BuildingElement {
  readonly id: string;
  readonly name: string;
  readonly heatFlowDirection: HeatFlowDirection;
  /** Ordered internal -> external. */
  readonly layers: readonly Layer[];
  readonly rsiOverrideM2KPerW?: number;
  readonly rseOverrideM2KPerW?: number;
}

export interface EnvironmentConditions {
  readonly internalAirTemperatureC: number;
  readonly internalRelativeHumidityPercent: number;
  readonly externalAirTemperatureC: number;
  readonly externalRelativeHumidityPercent: number;
}
```

### Result types

```ts
export type WarningCode =
  | 'combined-method-error-exceeds-limit'   // upper/lower spread too wide for ISO 6946
  | 'metal-bridging-out-of-scope'           // lambda ratio suggests metal; needs ISO 10211
  | 'air-layer-thickness-out-of-table'      // clamped to tabulated range
  | 'slightly-ventilated-interpolated'
  | 'well-ventilated-outer-layers-ignored'
  | 'value-needs-verification';

export interface Warning { readonly code: WarningCode; readonly message: string; readonly layerId?: string; }

export interface LayerResistance {
  readonly layerId: string;
  readonly label: string;
  readonly thicknessM: number;
  /** Unbridged (or only) section. */
  readonly resistanceM2KPerW: number;
  /** Bridging section, when the layer is inhomogeneous. */
  readonly bridgingResistanceM2KPerW?: number;
  /** Parallel-combined resistance used by the ISO 6946 lower limit. */
  readonly combinedResistanceM2KPerW: number;
}

/** Why the ISO 6946 combined method does not apply to this element (R2.3). */
export type OutOfScopeReason = 'upper-lower-ratio-exceeds-1.5' | 'metal-bridging';

export interface UValueResult {
  readonly rsiM2KPerW: number;
  readonly rseM2KPerW: number;
  readonly layers: readonly LayerResistance[];
  readonly method: 'homogeneous' | 'iso6946-combined';
  readonly totalResistanceUpperLimitM2KPerW: number;  // R'T
  readonly totalResistanceLowerLimitM2KPerW: number;  // R''T
  readonly totalResistanceM2KPerW: number;            // RT = (R'T + R''T)/2
  readonly upperToLowerLimitRatio: number;            // R'T / R''T; 1 when homogeneous
  readonly maxRelativeErrorPercent: number;           // (R'T - R''T)/(2 RT) x 100
  /**
   * Unrounded U. **null when the combined method is out of scope** (R2.3) so that no
   * consumer can display an invalid U-value without handling the null case.
   */
  readonly uValueWPerM2K: number | null;
  /** Always populated. Diagnostics only — never present this as a U-value. */
  readonly provisionalUValueWPerM2K: number;
  readonly outOfScopeReasons: readonly OutOfScopeReason[];
  readonly warnings: readonly Warning[];
}

/**
 * Which 1D path through the element to *display*. 'unbridged' and 'bridged' are real
 * 1D calculations; 'combined' is the in-house convention of R2.2 (parallel-combined
 * layers scaled to sum to the reported RT). Display only — the condensation verdict
 * below never depends on it (R2.4).
 */
export type ProfileSection = 'unbridged' | 'bridged' | 'combined';

export interface ProfileNode {
  readonly kind: 'internal-air' | 'internal-surface' | 'interface' | 'external-surface' | 'external-air';
  readonly label: string;
  readonly positionM: number;            // 0 at internal face of the first layer
  readonly cumulativeResistanceM2KPerW: number;
  /** Temperature on the *displayed* path. */
  readonly temperatureC: number;
  readonly saturationVapourPressurePa: number;
  /** Dew point of the internal air, i.e. the threshold this node is judged against. */
  readonly dewPointTemperatureC: number;
  /** Coldest temperature at this interface over **all** section paths (R2.4). */
  readonly worstCaseTemperatureC: number;
  readonly worstCasePathId: string;      // e.g. 'unbridged', 'bridged'
  /**
   * The safety verdict: worstCaseTemperatureC <= dewPointTemperatureC. Derived from
   * the worst path, never from the displayed one, so the display toggle cannot change
   * a verdict (R2.4).
   */
  readonly condensationRisk: boolean;
  /**
   * Cumulative equivalent air layer thickness Sd = sum(mu * d) up to this node. In
   * 'combined' mode these are the **unbridged** path's values (R2.5).
   */
  readonly cumulativeSdM: number;
}

export interface TemperatureProfile {
  readonly section: ProfileSection;
  /** For 'combined', the RT reported by calculateUValue; otherwise that path's own RT. */
  readonly totalResistanceM2KPerW: number;
  /** q = deltaT / totalResistanceM2KPerW. */
  readonly heatFluxWPerM2: number;
  /** The R2.2 scaling factor k. Present only for section 'combined'. */
  readonly combinedScalingFactor?: number;
  /** True when Sd values follow the unbridged-path convention of R2.5. */
  readonly sdFollowsUnbridgedConvention: boolean;
  readonly internalDewPointTemperatureC: number;
  readonly nodes: readonly ProfileNode[];
  readonly warnings: readonly Warning[];
}

/** One enumerated 1D path through the element (R2.4). */
export interface SectionPath {
  readonly id: string;                   // 'unbridged' | 'bridged' | 'mixed:0b101'
  readonly areaFraction: number;         // product of the chosen sections' fractions
  readonly layerResistancesM2KPerW: readonly number[];
  readonly totalResistanceM2KPerW: number;
}
```

---

## 3. Engine API signatures

```ts
// surfaceResistance.ts
export function surfaceResistances(direction: HeatFlowDirection):
  { readonly rsiM2KPerW: number; readonly rseM2KPerW: number };
export function resolveSurfaceResistances(element: BuildingElement):
  { readonly rsiM2KPerW: number; readonly rseM2KPerW: number; readonly warnings: readonly Warning[] };

// airLayer.ts
export function unventilatedAirLayerResistanceM2KPerW(
  thicknessM: number, direction: HeatFlowDirection):
  { readonly resistanceM2KPerW: number; readonly warnings: readonly Warning[] };
export function airLayerResistanceM2KPerW(
  layer: AirLayer, direction: HeatFlowDirection):
  { readonly resistanceM2KPerW: number; readonly warnings: readonly Warning[] };

// resistance.ts
export function solidLayerResistanceM2KPerW(thicknessM: number, lambdaWPerMK: number): number;
export function layerResistances(element: BuildingElement):
  { readonly layers: readonly LayerResistance[]; readonly warnings: readonly Warning[] };

// inhomogeneous.ts
export function parallelResistanceM2KPerW(
  sections: readonly { readonly areaFraction: number; readonly resistanceM2KPerW: number }[]): number;
export function upperLimitTotalResistanceM2KPerW(element: BuildingElement): number;   // R'T
export function lowerLimitTotalResistanceM2KPerW(element: BuildingElement): number;   // R''T

// uvalue.ts
export function calculateUValue(element: BuildingElement): UValueResult;

// inhomogeneous.ts (continued) — path enumeration shared by the upper limit and R2.4
export function enumerateSectionPaths(element: BuildingElement): readonly SectionPath[];

// temperatureProfile.ts
/**
 * Builds the requested display profile, but always evaluates every section path so
 * that each node's worst-case temperature and condensation verdict are path-worst
 * rather than display-dependent (R2.4).
 */
export function calculateTemperatureProfile(
  element: BuildingElement,
  conditions: EnvironmentConditions,
  section?: ProfileSection /* default 'combined' */): TemperatureProfile;

// psychrometrics.ts   (ISO 13788 Annex E)
export function saturationVapourPressurePa(temperatureC: number): number;
export function dewPointTemperatureC(vapourPressurePa: number): number;
export function vapourPressurePa(temperatureC: number, relativeHumidityPercent: number): number;
export function relativeHumidityPercent(vapourPressurePa: number, temperatureC: number): number;

// rounding.ts
export function roundResistanceForReporting(rM2KPerW: number): number;  // 3 dp
export function roundUValueForReporting(uWPerM2K: number): number;      // 2 dp

// condensation/method.ts — extension point, no implementations in Phase 1
export interface CondensationMethod<TOptions, TResult> {
  readonly id: 'iso13788-glaser' | 'din4108-3-glaser';
  readonly standard: string;
  run(element: BuildingElement, options: TOptions): TResult;
}
```

### Standards each module implements

| Module | Standard / clause | Certainty |
|---|---|---|
| `surfaceResistance` | BS EN ISO 6946 surface-resistance table; BR 443 UK convention (walls 0.13/0.04, roofs 0.10/0.04, floors 0.17/0.04) | values confident, **clause numbers → VERIFY.md** |
| `airLayer` unventilated | BS EN ISO 6946 tabulated air-layer resistances, linear interpolation on thickness | table values confident, **edition/clause → VERIFY.md** |
| `airLayer` well-ventilated | BS EN ISO 6946: disregard the air layer and everything outboard of it, and use Rsi in place of Rse | rule confident, **clause + 1500 mm²/m threshold → VERIFY.md** |
| `airLayer` slightly-ventilated | linear interpolation between unventilated and well-ventilated on opening area 500–1500 mm²/m | **method → VERIFY.md** |
| `inhomogeneous` | BS EN ISO 6946 combined method, upper/lower limits, error estimate | formulae confident, **clause → VERIFY.md** |
| `inhomogeneous` validity | R'T/R''T ≤ 1.5, else ISO 10211; equivalently e ≤ 20 % | limit confident, **clause → VERIFY.md** |
| `inhomogeneous` metal guard | combined method not applicable where metal penetrates the insulation | rule confident, **detection criterion is ours → VERIFY.md** |
| `uvalue` | RT = (R'T + R''T)/2; U = 1/RT | confident |
| profile `'combined'` | **in-house convention** (R2.2): parallel-combined layers scaled by k so the profile sums to RT; Rsi/Rse held fixed | ours, not a standard — labelled in code and UI |
| profile S_d in `'combined'` | **in-house convention** (R2.5): unbridged path's S_d | ours, not a standard — labelled in code and UI |
| condensation worst case | assessed on the unbridged (insulation) path as well as the bridged path, worst per interface (R2.1, R2.4) | **BS 5250 insulation-path basis → VERIFY.md** |
| `rounding` | reporting precision (R to 3 dp, U to 2 dp) | **→ VERIFY.md** |
| `psychrometrics` | BS EN ISO 13788 Annex E saturation-pressure and dew-point equations | confident |
| `temperatureProfile` | steady-state proportional-resistance division; the 'combined' section is our own documented convention, not a standard method | convention flagged in code |

---

## 4. Material database

`packages/materials/data/materials.json`, validated by a zero-dependency validator
plus a JSON Schema for outside tooling.

```jsonc
{
  "schemaVersion": 1,
  "materials": [{
    "id": "brick-outer-leaf",
    "name": "Brickwork, outer leaf (exposed)",
    "category": "masonry",
    "lambdaWPerMK": 0.77,
    "densityKgPerM3": 1700,
    "specificHeatCapacityJPerKgK": 1000,
    "vapourResistanceFactorMu": 10,
    "source": "TODO(verify)",
    "notes": "Generic UK value; confirm against BR 443 / CIBSE Guide A."
  }]
}
```

Seed set (~15), all generic — no manufacturer data:
masonry (brick outer leaf, brick inner leaf, dense concrete block, aircrete block,
medium-density concrete), finishes (gypsum plasterboard, gypsum plaster,
cement:sand render, sand:cement screed), timber (softwood structural, OSB, plywood,
chipboard flooring), insulation (mineral wool, EPS, PIR), membranes
(polyethylene VCL, bitumen sheet), coverings (concrete/clay roof tile).

`source` is either a real table reference (e.g. `"BS EN ISO 10456:2007 Table 3"`)
where the value is one I can attribute with confidence, or the literal string
`"TODO(verify)"`. Every `"TODO(verify)"` entry gets a row in VERIFY.md. Validation
fails on: missing field, non-finite or non-positive λ/ρ/c, μ < 1, unknown category,
duplicate id, missing `source`.

---

## 5. Web app

- Single page, no backend, no analytics, no network calls at runtime.
- Left: editable layer table — reorder/insert/delete, material select (or manual λ),
  thickness in mm (converted to m at the engine boundary), bridged fraction in %
  with bridging material, air-layer rows with ventilation class.
- Right, sticky: live U-value (2 dp), ΣR, R'T/R''T, error estimate, warning list.
- Below: to-scale SVG cross-section, internal on the left, with the steady-state
  temperature line overlaid on a second axis, dew-point line, and per-interface
  tooltips. Pure SVG, no chart library.
- Boundary panel: heat-flow direction, θi/RHi, θe/RHe, optional Rsi/Rse overrides.
- Share: whole build-up encoded in the URL hash as
  `#1:<base64url(JSON)>` (version-prefixed so old links stay decodable). Decode is
  defensive — a malformed hash falls back to the default build-up and shows a notice.
- Two starter examples of our own authorship (UK filled cavity wall; timber-frame wall).

---

## 6. Test list (Vitest, `packages/engine`, hand-worked expectations in comments)

Numbering is continuous across files; Revision 2 added items marked **R2.x**.

**psychrometrics.test.ts**
1. `p_sat(0 °C) = 610.5 Pa` exactly.
2. `p_sat(20 °C) ≈ 2337.2 Pa` — worked in comment.
3. Dew point of 20 °C / 50 % RH ≈ 9.27 °C — worked in comment.
4. Round-trip `dewPoint(vapourPressure(θ, 100 %)) === θ` for θ ∈ {-10, 0, 10, 25}.
5. Sub-zero branch switch is continuous at 0 °C.

**surfaceResistance.test.ts**
6. horizontal → 0.13 / 0.04; upward → 0.10 / 0.04; downward → 0.17 / 0.04.
7. Overrides win over the table, and are reported back in the result.

**airLayer.test.ts**
8. Tabulated points reproduced exactly for all three directions (5, 10, 25, 100 mm).
9. 20 mm horizontal interpolates to 0.175 — worked in comment.
10. Below/above the table clamps and raises `air-layer-thickness-out-of-table`.
11. Well-ventilated: RT of [plasterboard, insulation, well-vent cavity, brick]
    equals Rsi + R_pb + R_ins + Rsi, with outer layers ignored and a warning.

**uvalue.test.ts**
12. Single 100 mm layer λ = 1.15, horizontal: R = 0.086957, RT = 0.256957,
    U = 3.8917 W/m²K — worked in comment.
13. Four-layer UK cavity wall, homogeneous: full arithmetic in the comment.
14. Rotating the same layers to `downward` changes only Rsi.
15. U is invariant under layer reordering (series resistances commute).
16. Zero-thickness layer contributes exactly 0.
17. λ ≤ 0 or thickness < 0 throws a typed error (input error, not a warning).
18. Reporting rounding: U to 2 dp, R to 3 dp.

**inhomogeneous.test.ts**
19. `parallelResistance` of two equal-R sections equals that R.
20. Timber-frame wall, 15 % softwood studs through 140 mm mineral wool:
    R'T, R''T, RT, U and the error estimate all hand-worked in the comment.
21. `areaFraction = 0` reduces exactly to the homogeneous result; `= 1` reduces to
    the all-bridging result.
22. Two inhomogeneous layers in one element are both handled (upper limit needs the
    cross-product of sections).
23. **R2.3** — a steel-stud build-up with R'T/R''T > 1.5 returns
    `uValueWPerM2K === null`, a populated `provisionalUValueWPerM2K`, and
    `outOfScopeReasons` containing `'upper-lower-ratio-exceeds-1.5'`.
24. **R2.3** — the ratio limit and the error limit agree: at R'T = 1.5·R''T the
    reported `maxRelativeErrorPercent` is exactly 20 %. Hand-worked.
25. **R2.3** — a metal bridging material is flagged `'metal-bridging'` even when the
    ratio happens to stay under 1.5.
26. Upper limit ≥ lower limit always (property test over random valid build-ups).
27. `enumerateSectionPaths` on two inhomogeneous layers returns 4 paths whose area
    fractions are the products of the layer fractions and sum to 1.

**temperatureProfile.test.ts**
28. Node count = layers + 3 (two air nodes, two surfaces, n-1 interfaces).
29. Endpoints equal the air temperatures; θsi = θi − (Rsi/RT)(θi − θe) — worked.
30. Single-layer 20 °C/0 °C profile: every interface temperature hand-worked.
31. Temperature is monotonic across the element when θi > θe.
32. `condensationRisk` is true exactly where the **worst-path** temperature ≤ internal
    dew point, verified against a deliberately cold-bridge case.
33. **R2.1** — in a timber-frame wall the bridged path is colder at the internal
    surface but **warmer** at the sheathing than the unbridged path. Asserted as two
    opposite inequalities on the same element, with the crossover explained.
34. **R2.2** — for `'combined'`, Rsi + Σ(scaled layer R) + Rse equals the `RT` from
    `calculateUValue` to within 1e-12, and q·RT = ΔT. The naive unscaled sum is shown
    in the comment to equal R''T, i.e. the bug this test pins.
35. **R2.2** — k ≥ 1 always, and k = 1 exactly when the element is homogeneous.
36. **R2.4** — the three display modes return **identical** `condensationRisk` and
    `worstCaseTemperatureC` arrays; only `temperatureC` differs.
37. **R2.4** — with two inhomogeneous layers, the worst case at some interface comes
    from a *mixed* path, not from all-bridged or all-unbridged. Hand-worked.
38. **R2.5** — `cumulativeSdM` in `'combined'` mode equals the `'unbridged'` mode's,
    and `sdFollowsUnbridgedConvention` is true.
39. Zero-thickness element (surfaces only) does not divide by zero when computing k.

**materials.test.ts** (`packages/materials`)
40. Every seeded record validates; the seed has ≥ 15 entries and unique ids.
41. Each malformed-record class is rejected with the offending field named.
42. Every record either cites a source or is exactly `"TODO(verify)"`, and every
    `"TODO(verify)"` id appears in VERIFY.md (test reads the markdown).
43. `toEngineMaterial()` output satisfies the engine's `MaterialProperties`.

---

## 7. Build order

1. Scaffold: workspace, tsconfig, lint, MIT licence, CI-less `pnpm test`.
2. Engine: units/types → psychrometrics → surface resistance → air layers →
   resistance → inhomogeneous → uvalue → temperature profile. Tests alongside.
3. `pnpm test` green, `pnpm typecheck` clean. Commit.
4. Materials package + validator + tests. Commit.
5. Web app: state → engine wiring → layer table → results → SVG → URL codec. Commit.
6. README / ROADMAP / VERIFY final pass. Commit.

Out of scope this phase, tracked in ROADMAP.md: ISO 13788 monthly interstitial
condensation, DIN 4108-3 Glaser, ISO 13786 dynamic properties (κ, decrement factor,
time shift — needed by the SAP 10.3 tool), ISO 6946 ΔU corrections (air voids,
mechanical fasteners, inverted roofs), 2D thermal bridges (ISO 10211), whole-building
heat loss, ground floors (ISO 13370), summer overheating.
