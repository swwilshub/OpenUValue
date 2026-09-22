# OpenUValue

An open-source, browser-based building-envelope calculator. Build a wall, roof or
floor layer by layer and see its U-value, the temperature through it, whether and
where condensation forms, how it behaves on a hot day, and what it costs to heat
through.

MIT licensed. No backend, no accounts, no tracking. Build-ups are shared by URL.

> **Still being checked.** Several material values and clause references have not yet
> been checked against printed standards. [VERIFY.md](VERIFY.md) lists every one, with
> what would change if it were wrong, and [ROADMAP.md](ROADMAP.md) lists what is not
> built yet. **Read VERIFY.md before using a result for design work.**

## What it does today

- **U-values** to BS EN ISO 6946 with BR 443 conventions: surface resistances by
  heat-flow direction (including a roof's pitch), unventilated air layers, and
  slightly and well-ventilated cavities. Cavity types are offered by the construction
  they are, and a new cavity's type is guessed from the layers either side of it.
- **Bridged layers**, such as studs through insulation or battens across a cavity, by
  the ISO 6946 combined method, reporting the upper and lower limits, R_T, U and the
  error estimate. Where the method does not apply (a ratio above 1.5, or metal
  bridging), **no U-value is reported** rather than an invalid one.
- **Corrections** from BR 443 for air gaps in the insulation and for mechanical
  fasteners, where you supply the fastener's point thermal transmittance χ.
- **Part L limits** from Approved Document L for a new dwelling, a new element in an
  existing one, or a renovated element (England, dwellings).
- **Temperature and moisture.** A temperature profile at the conditions you set, the
  internal surface checked for mould and condensation, and interstitial condensation
  by the BS EN ISO 13788 Glaser method, with a two-season check of whether it dries out
  again. Every path through a bridged element is assessed and the worst case at each
  interface reported, so what is on display never changes a verdict.
- **Wind-driven rain exposure** zones from Approved Document C, flagging a fully
  filled cavity where the zone rules it out.
- **Summer performance** to BS EN ISO 13786: decrement factor, time shift, areal heat
  capacity κ and periodic transmittance Y.
- **Energy and retrofit.** Heat lost over a heating season by SAP climate region, the
  fuel, carbon, primary energy and cost of replacing it, and a before-and-after
  comparison of a retrofit with its payback, costed by the sheet.
- **A to-scale cross-section** you can edit directly: drag layers to reorder them,
  drag an edge to change a thickness, drop materials in from a palette. A 3D cutaway
  view, a guided tour of how to read the drawing, and a guide with walkthroughs and an
  explanation of every box.

## Layout

| Package | What it is |
|---|---|
| `packages/engine` | `@openuvalue/engine`. Pure calculation library: no DOM, no I/O, **zero runtime dependencies**. SI units, with the unit in every identifier. Designed to be imported by other tools — a SAP 10.3 calculator is the first. |
| `packages/materials` | `@openuvalue/materials`. Generic UK material data as JSON, with a zero-dependency validator and a JSON Schema. |
| `apps/web` | Vite + React front end. No backend. |

## Running it

Requires Node 20+ and pnpm 10+.

```sh
pnpm install
pnpm test        # engine, materials and web app test suites
pnpm typecheck   # strict TypeScript across the workspace
pnpm dev         # the web app on http://localhost:5173
pnpm build       # production build
```

## Deploying

`.github/workflows/pages.yml` builds the app and publishes `apps/web/dist` to GitHub
Pages on every push to **`main`**. `pnpm typecheck` and `pnpm test` gate the deploy, so
a failing suite never reaches the site. Pushes to other branches, and pull requests
from forks, run the same checks without publishing.

One repository setting is needed once, and no workflow file can set it for itself:

> **Settings → Pages → Build and deployment → Source: _GitHub Actions_**

Until that is set, the deploy job fails with a 404 from the Pages API. After that, the
site is at `https://<owner>.github.io/<repository>/` — for this repository,
<https://swwilshub.github.io/OpenUValue/>.

The publishing branch is named in the workflow rather than read from the repository's
default-branch setting. Two things have to agree before a deploy runs, and naming the
branch is what keeps them in agreement:

- the workflow's own condition, and
- the `github-pages` deployment environment, whose protection rules GitHub seeds to
  allow `main`.

A branch that is merely the repository default is still refused by the second with
*"not allowed to deploy to github-pages due to environment protection rules"*. To
publish from a different branch, change both: the `if:` conditions here, and
**Settings → Environments → github-pages → Deployment branches and tags**.

`vite.config.ts` sets `base: './'`, so the build works under the `/OpenUValue/`
subpath, from a different repository name, or opened straight off disk — the
repository name is not baked into the output. Build-ups are shared through the URL
**hash**, which never reaches the server, so Pages needs no SPA fallback and share
links keep working under the subpath.

## Using the engine on its own

```ts
import { calculateUValue, calculateTemperatureProfile } from '@openuvalue/engine';

const wall = {
  id: 'wall-1',
  name: 'Timber frame',
  heatFlowDirection: 'horizontal' as const,
  layers: [
    { kind: 'solid' as const, id: 'pb', label: 'Plasterboard',
      thicknessM: 0.0125, material: { lambdaWPerMK: 0.25 } },
    { kind: 'solid' as const, id: 'ins', label: 'Mineral wool',
      thicknessM: 0.14, material: { lambdaWPerMK: 0.035 },
      bridging: { label: 'Stud', areaFraction: 0.15,
                  material: { lambdaWPerMK: 0.13 } } },
  ],
};

const result = calculateUValue(wall);
if (result.uValueWPerM2K === null) {
  // Out of scope for ISO 6946's combined method: see result.outOfScopeReasons.
} else {
  console.log(result.uValueWPerM2K);
}
```

`uValueWPerM2K` is `number | null` on purpose. `null` means the ISO 6946 combined
method does not apply to that build-up, and the type forces you to handle it rather
than display an invalid figure.

## Conventions

Read [CLAUDE.md](CLAUDE.md) before contributing. The three rules that matter most:

1. **Cite the clause.** Every constant, tabulated value and formula names the standard
   it comes from. If you cannot attribute it, write `TODO(verify)` and add a row to
   `VERIFY.md`. A guessed citation is worse than an admitted gap.
2. **SI units, in the name.** `thicknessM`, `lambdaWPerMK`, `rsiM2KPerW`. Millimetres
   and percentages are converted at the UI boundary and never enter the engine.
3. **Label in-house conventions.** Where no standard defines an output — the
   `'combined'` temperature profile is the current example — say so in the code and in
   the UI.

This is a clean-room implementation. It reproduces the *functionality* of layer-by-layer
envelope calculators; it does not copy any existing tool's code, text, graphics,
colour scheme or material data.
