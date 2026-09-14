# ROADMAP

Phase 1 (delivered) covers steady-state U-values, inhomogeneous layers by the
BS EN ISO 6946 combined method, a steady-state temperature profile with a dew-point
comparison, and a browser UI with a to-scale cross-section.

Everything below is **out of scope in Phase 1** and absent from the tool. Ordered by
dependency, so each phase is buildable on the one before it.

---

## Phase 2 — completing a UK U-value

Without these, a U-value from this tool is not yet a BR 443 U-value.

1. **BS EN ISO 6946 ΔU corrections.**
   - `ΔU_g`, air voids in the insulation layer. **Delivered** — BR 443 (2019) 4.8.1
     gives the three levels (0.00, 0.01, 0.04) with level 1 as the default, and the
     3 % omission threshold. See `engine/src/corrections.ts`.
   - `ΔU_f`, mechanical fasteners penetrating an insulation layer. **Both routes
     delivered.** The detailed one, ΔU_f = χ · n_f, is BR 443 (2019) 4.8.3(a) and is
     confirmed independently by ISO/DIS 6946:2015 Formula (F.4). The approximate one is
     Annex F.3.2 Formula (F.5), obtained from the **enquiry draft** rather than the
     published 2017 standard — see VERIFY.md V24, which is the remaining work on it.
     **Not yet wired into the UI**: the engine exports `approximateFastenerCorrection`
     but the Result box still only offers the χ route, so a user with wall ties cannot
     reach it yet.

   - `ΔU_r`, inverted (upside-down) roofs, where rainwater drains over the insulation.
   - Wall ties, for which BR 443 4.8.2 gives the data needed (mild steel λ 50,
     stainless λ 17; double-triangle ties 12.5 mm², vertical twist 80 mm²; typically
     2.5 per m²) but the correction formula is again in ISO 6946 Annex F.
2. **Elements adjacent to unheated spaces**, via the unheated-space resistance `R_u`,
   and the BR 443 conventions for garages, roof voids and similar. The engine already
   accepts `rseOverrideM2KPerW`, so this is a matter of computing the right override
   and labelling it, not of restructuring.
3. **Point and linear thermal bridge reporting** in the UI, distinct from the plane
   element U-value.

## Phase 3 — interstitial condensation

Phase 1 reports the *temperature* condition only: which interfaces are colder than the
internal air dew point. That is the real criterion at the internal surface, where
nothing impedes vapour reaching it, but within the element it is a **screening
indicator** — necessary for condensation, not sufficient. Turning it into an
assessment needs the vapour side, which is what this phase adds.

**Delivered since:** the Glaser construction itself — the vapour pressure profile
against the saturation ceiling, the condensation planes and their rates — calculated at
**one set of conditions**, the ones on screen. See `engine/src/condensation/glaser.ts`
and `iso13788.ts`, and the diagram in the results.

**Still outstanding**, and the reason the above is not a BS EN ISO 13788 *assessment*:

0. **Monthly climate data.** ~~The blocker.~~ **Half solved.** SAP 10.2 Appendix U,
   Table U1 gives mean monthly external temperature for 21 UK regions plus a UK average,
   free and official, and is now in `engine/src/climate.ts`. The temperature side of the
   annual assessment is therefore available.

   **Still missing: monthly external humidity.** Table U1 carries temperature, and U2
   and U3 carry wind speed and solar radiation, but SAP has no use for external humidity
   and does not tabulate it. The Glaser construction needs it to get an external vapour
   pressure for each month. Until that is found the twelve-month loop can be written but
   not run honestly — so the two-season approximation stands, and the accumulation loop
   remains small while the data remains the blocker.

4. **BS EN ISO 13788 monthly (Glaser) interstitial condensation assessment**:
   monthly climate data, condensation and evaporation over an annual cycle, and the
   drying-reserve question ("does it dry out again by the end of the year?").
5. **DIN 4108-3 Glaser** as a selectable **alternative** method, not a replacement.
6. Both plug into `packages/engine/src/condensation/method.ts`, which already exists
   and already specifies the two rules that matter: a method is handed **every**
   section path, and results are reduced to the worst case at each interface, so the
   display mode can never change a verdict.
7. **BS 5250** guidance and limit values for UK practice.

## Phase 4 — dynamic properties (needed by the SAP 10.3 calculator)

8. ~~**BS EN ISO 13786 dynamic thermal characteristics**~~ — **DONE.** `engine/src/dynamic.ts`
   gives the periodic thermal transmittance Y<sub>ie</sub>, the decrement factor, the time
   shift and the areal heat capacity κ on both faces, for any excitation period (24 hours
   by default). The layer transfer matrix is derived from the heat equation rather than
   transcribed, and checked against the massless limit, ρ·c·d/2 for a thin slab and
   ρ·c·δ/√2 for a semi-infinite one. Surfaced in the summary strip and the Summer
   performance panel.
9. ~~**Summer performance** reporting~~ — **DONE**, same commit.

Still open in this area:

- **VERIFY V23**: the clause, equation and table numbers in BS EN ISO 13786, and the
  standard's own sign convention for the time shift. The physics is verified; the
  citation is not.
- **Bridged elements** (VERIFY C7) are reported per section rather than combined,
  because area-weighting complex transfer matrices is not something the standard
  defines. If it does define a treatment, adopt it.
- **κ for SAP 10.3** specifically: confirm which face SAP wants, at which period, and
  with which rounding, before the SAP calculator consumes this.
- **Overheating** proper (BS EN ISO 52016 / Part O) needs solar gain, ventilation and a
  room model. These element-level figures are an input to that, not a substitute.

## Phase 5 — beyond the plane element

**Cross battens.** A second set of members running across the first — service battens
over studs, counter-battens over rafters, a crossed-batten service void. Two things are
needed and neither exists yet:

- *The calculation.* Crossed members do not bridge a single layer; they form two
  inhomogeneous layers whose members are at right angles, so the area fractions are not
  simply additive where they cross. BS EN ISO 6946's combined method handles each layer
  separately, and whether that is the right treatment for a crossed set, or whether the
  overlap needs its own section path, has to be settled against the standard before
  anything is implemented.
- *The model and the drawing.* `UiLayer` carries one set of members per layer, with a
  single width, spacing and distance basis. A crossed set needs a second, plus a
  direction, and the cross-section and the 3D layup both assume members run one way.

The 3D layup view says outright that cross battens are not drawn yet, so the gap is
visible to a user rather than silently absent.


10. **BS EN ISO 13370 ground floors**, which need perimeter/area ratio and soil
    properties rather than a simple layer stack.
11. **BS EN ISO 10211 two-dimensional numerical calculation**, for the build-ups the
    combined method refuses today: steel studs and other metal-bridged elements. The
    engine currently withholds a U-value for these on purpose (`uValueWPerM2K` is
    `null`); this is what would let it give an answer instead.
12. **Whole-building fabric heat loss**: element areas, ψ-values for junctions,
    thermal bridging allowance (y-value), and the heat loss parameter.

## Ongoing

13. **Close out `VERIFY.md`.** The single most valuable piece of work available: every
    material source, several clause references, and two genuine open method questions
    (the air-layer table basis, and the treatment of slightly ventilated cavities).
14. **Worked examples from the standards** as regression tests, once printed copies
    are to hand.

    *The web app now has tests of its own* — `apps/web` runs vitest over the pure
    functions in `state/`, which is where being wrong is silent. Component rendering is
    still uncovered.
15. **Element library** of common UK build-ups, authored by us.
16. **Import/export** of build-ups as JSON, alongside the existing URL sharing.
