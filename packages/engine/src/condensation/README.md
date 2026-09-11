# Condensation methods

`method.ts` defines the extension point. `glaser.ts` implements the construction
itself and `iso13788.ts` wraps it as the BS EN ISO 13788 assessment **at one set
of conditions**.

Phase 1's surface-temperature-against-dew-point check in
`../temperatureProfile.ts` is still there and still reported. The two answer
different questions and neither replaces the other: the temperature check says an
interface is cold enough for condensation, the Glaser construction says whether
vapour actually reaches it. An interface can be flagged by the first and cleared
by the second — that is a vapour control layer doing its job, and it is the whole
point of running both.

## What is implemented

- `assessGlaser` — the vapour pressure profile as the lower convex hull of the
  saturation ceiling between the two air vapour pressures, the condensation
  planes, and the rate at each. Handles planes already wet from an earlier
  period, which stay pinned to saturation and can evaporate.
- `assessInterstitialCondensation` — runs it per section path and reports the
  worst. The in-house `combined` profile is deliberately *not* assessed: it is a
  display convention with no single vapour path behind it.

## What is not

The twelve-month accumulation. The standard's assessment repeats the
construction for each month of a design year and passes an element only if what
condenses in winter evaporates again within it. That needs monthly climate data
we do not have and will not invent — see `ROADMAP.md`. The loop is small; the
data is the blocker. `assessGlaser` already takes `wetBoundaryIndices`, which is
the state such a loop would carry between months.

## Adding DIN 4108-3

DIN 4108-3's Glaser is the same construction over a fixed condensation and
drying period rather than twelve months, so it should reuse `assessGlaser`
rather than reimplement it, and differ only in the periods, the boundary
conditions and the pass criteria.

## Rules for any method here

1. Cite the standard and clause for every constant and equation, per `CLAUDE.md`.
   Anything you cannot attribute gets a `TODO(verify)` and a row in `VERIFY.md`.
2. Assess every section path, not one chosen path. The bridging path is colder at
   the internal surface but warmer at the sheathing, so neither is conservative
   everywhere.
3. Methods are alternatives chosen by the caller. Neither may become the implicit
   behaviour of the U-value path.
