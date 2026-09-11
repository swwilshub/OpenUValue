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
   - `ΔU_f`, mechanical fasteners penetrating the insulation. **BR 443 requires
     this**, so any build-up with insulation fixed through is still under-reported.
     BR 443 4.8.3 points to BS EN ISO 6946 Annex F.3.2 for the approximate procedure
     without reproducing it, and that annex is not in the free preview, so the formula
     cannot yet be attributed. BR 443 does give one usable exemption: no correction is
     needed for fixings in a flat roof where the metal part of a composite fastener is
     recessed by at least 50 % of its length and there are no more than 15 fixings per
     square metre.
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

0. **Monthly climate data.** The standard's assessment runs the construction for each
   of twelve months and passes an element only if what condenses in winter evaporates
   again within the year. That needs mean monthly external temperature and humidity for
   the location. OpenUValue ships none and will not invent any. Until a dataset with a
   citable source is added — or the UI lets a user paste twelve months of their own —
   the annual verdict cannot be given. The accumulation loop itself is small; the data
   is the blocker.

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

8. **BS EN ISO 13786 dynamic thermal characteristics**:
   - areal heat capacity κ (kappa), which SAP 10.3 needs for thermal mass;
   - periodic thermal transmittance;
   - decrement factor and time shift, for summer overheating.
   The engine already stores ρ and c on every material for this, and the materials
   database already carries them.
9. **Summer performance** reporting built on the above: temperature amplitude damping
   and phase shift.

## Phase 5 — beyond the plane element

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
15. **Element library** of common UK build-ups, authored by us.
16. **Import/export** of build-ups as JSON, alongside the existing URL sharing.
