# CLAUDE.md — OpenUValue conventions

Working conventions for this repository. These are binding on every change.

## What this project is

A browser-based building-envelope calculator: build a wall, roof or floor layer by
layer and see its U-value, temperature profile, condensation risk and (later) summer
performance. Homeowners and designers, UK first.

## Clean-room rule

This is a clean-room reimplementation of a *category of tool*, not of any product.

- Do **not** fetch, scrape, copy or paraphrase any existing calculator's source code,
  UI text, graphics, icons, colour palette, or material data.
- Knowing *what features such tools have* is fine. That knowledge must not become a
  source of code, strings, styling or numbers here.
- All numeric inputs come from published standards or are clearly labelled as generic
  and unverified. Never lift a value from another calculator's output.
- Wording, layout and visual language are our own.

## Citation rule — the important one

**Every physical constant, surface resistance, tabulated value and formula carries a
code comment naming the standard and clause it comes from.** No exceptions, including
values that "everyone knows".

```ts
// BS EN ISO 6946 surface resistance, horizontal heat flow (walls):
// Rsi = 0.13, Rse = 0.04 m²K/W. BR 443 adopts the same for UK U-value conventions.
// TODO(verify): clause/table numbers for the 2017 edition and BR 443 (2019) section.
const RSI_HORIZONTAL_M2K_PER_W = 0.13;
```

If a value or clause reference is not something I am confident about:

1. **Do not guess.** Do not invent a clause number, a table number or a λ value.
2. Add `// TODO(verify): <what exactly, which standard, which edition>` at the value.
3. Add a row to `VERIFY.md` — what it is, where it is used, what to check, and the
   consequence if it is wrong.
4. For material data, set `"source": "TODO(verify)"` rather than a plausible-looking
   reference.

A guessed citation is worse than an admitted gap. `VERIFY.md` is a first-class
deliverable, not a leftovers list.

## Standards order

1. **BS EN ISO 6946** — thermal resistance and transmittance; the combined
   (upper/lower limit) method for inhomogeneous layers.
2. **BR 443** *Conventions for U-value calculations* — UK conventions layered on top
   of ISO 6946. Where they differ, BR 443 wins for UK output, and the difference is
   noted in a comment.
3. **BS EN ISO 13788** — surface humidity and interstitial condensation. Phase 1 uses
   only its Annex E psychrometric equations.
4. **BS EN ISO 10456** — declared/design thermal values for materials.
5. **DIN 4108-3** (Glaser) — an *alternative* method to be addable later. Condensation
   must therefore sit behind the `CondensationMethod` interface in
   `packages/engine/src/condensation/`, never hard-wired into the U-value path.

## Units

SI throughout the engine, and **the unit is part of every identifier**:

| Quantity | Name pattern | Unit |
|---|---|---|
| thickness | `thicknessM` | m |
| conductivity | `lambdaWPerMK` | W/(m·K) |
| resistance | `resistanceM2KPerW`, `rsiM2KPerW` | m²K/W |
| transmittance | `uValueWPerM2K` | W/(m²·K) |
| density | `densityKgPerM3` | kg/m³ |
| specific heat | `specificHeatCapacityJPerKgK` | J/(kg·K) |
| vapour resistance factor | `vapourResistanceFactorMu` | – (dimensionless) |
| temperature | `temperatureC` | °C |
| vapour pressure | `vapourPressurePa` | Pa |
| area fraction | `areaFraction` | – (0..1, never a percentage) |

Non-SI user units (mm thickness, % fractions) are converted **at the UI boundary**.
No millimetres and no percentages cross into `packages/engine`.

## Architecture rules

- **pnpm monorepo**, strict TypeScript, MIT licence.
- `packages/engine` — a pure calculation library:
  - **zero runtime dependencies**, and no `devDependencies` leaking into the API;
  - **no DOM, no `window`, no `fetch`, no `Date.now()`, no I/O, no globals**;
  - deterministic and side-effect free: same input, same output, always;
  - inputs `readonly` and never mutated; results are fresh objects;
  - it will be imported by a separate SAP 10.3 calculator, so treat the public
    surface in `src/index.ts` as an API, not an internal detail.
- `packages/materials` — JSON data plus a zero-dependency validator. Data is data:
  no calculation logic lives here.
- `apps/web` — Vite + React, **no backend**. State is serialisable and encoded into
  the URL hash so a build-up can be shared by link.
- The engine must not depend on the materials package. The app wires them together.

## In-house conventions must be labelled as such

Some outputs have no standard behind them. Where that is true, say so in the code and
in the UI — never let an in-house convention read as a standard result.

Current in-house conventions:

- **The `'combined'` temperature profile.** ISO 6946 gives a U-value for a bridged
  element but no temperature profile through one. We display the parallel-combined
  layer resistances **scaled** so the profile sums to the reported R_T:
  `k = (R_T − Rsi − Rse) / (R''_T − Rsi − Rse)`, with Rsi and Rse held fixed and
  `q = ΔT / R_T`. Never sum the unscaled parallel-combined layers: that gives R''_T,
  and the drawn profile would then imply a different heat flux from the U-value shown
  beside it.
- **S_d in `'combined'` mode** uses the unbridged path's values. Area-weighting μ·d
  across a stud layer has no clean physical meaning.

## Display mode must never change a safety verdict

The profile mode (`'unbridged'` / `'bridged'` / `'combined'`) selects **what is drawn**
and nothing else. Condensation risk is always evaluated over every section path and the
worst result at each interface is reported, whichever profile is on screen.

Do not assume the bridging path is the conservative one. It has the lower resistance
and therefore the higher heat flux, so it is colder at the **internal surface** but
warmer through the **outer** layers, including the sheathing where interstitial
condensation usually occurs. For interstitial condensation the unbridged insulation
path is normally the worst case; for internal surface temperature it is the bridged
path. This is why the verdict takes the worst of all paths per interface rather than
picking a path up front.

## Validity limits are hard gates, not warnings

ISO 6946's combined method applies only while `R'_T / R''_T ≤ 1.5` (equivalently, an
error estimate ≤ 20 % — the two forms are the same rule). Beyond that the element needs
ISO 10211 numerical modelling, and metal penetrating the insulation is excluded
outright.

When a limit is breached, `uValueWPerM2K` is `null`, not a number. The out-of-scope
figure lives in `provisionalUValueWPerM2K` for diagnostics and must never be rendered
as a U-value. `strictNullChecks` is doing load-bearing work here: do not widen the type,
and do not add a `?? 0` or a `!` to make a consumer compile.

## Error handling

- **Invalid input** (λ ≤ 0, negative thickness, `areaFraction` outside 0..1) throws a
  typed error. Fail loudly.
- **Modelling limits** (combined-method error too large, air-layer thickness outside
  the table, method not applicable to metal bridging) return a typed `Warning` in the
  result. Never silently degrade, and never hide a limitation from the user — warnings
  are surfaced in the UI.
- Never invent a fallback number to keep a calculation going.

## Rounding

Calculate at full double precision. Round **only for display**, via `rounding.ts`.
No intermediate rounding inside a chain of resistances.

## Testing

- Vitest, in `packages/engine` (and `packages/materials`).
- Every calculation test states its expected value as a **hand calculation worked out
  in a comment**, showing the arithmetic — not a number copied from a previous run.
  A test whose expectation came from running the code proves nothing.
- Cover the standards' own worked examples where available, plus edge cases
  (zero thickness, `areaFraction` 0 and 1, sub-zero temperatures).
- `pnpm test` and `pnpm typecheck` must both be clean before any commit.

## TypeScript style

- `strict: true` plus `noUncheckedIndexedAccess`; no `any`, no non-null `!`, no
  `as` casts to paper over types. `unknown` + a narrowing guard instead.
- Discriminated unions over optional-field soup (`Layer` is discriminated on `kind`).
- Named exports only. No default exports.
- Prefer pure functions to classes in the engine.
- Comments explain *why* and *which clause*, not *what the line does*.

## Commits

One working step per commit, imperative subject, body explaining the standards
touched and any new `VERIFY.md` rows. Work on the branch given for the session.
Never commit with `pnpm test` failing.
