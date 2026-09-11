# VERIFY.md

Everything in OpenUValue that needs checking against a printed standard before the
tool should be relied on for design work.

This file is a deliverable, not a leftovers list. The repository rule (see
`CLAUDE.md`) is that a guessed citation is worse than an admitted gap: where a value
or a clause reference is not something we can attribute with confidence, the code
carries a `TODO(verify)` and the item is recorded here rather than being dressed up
with a plausible-looking reference.

Two kinds of entry appear below:

- **Values we believe are correct but cannot yet attribute to a clause.** The number
  is used, the calculation works, and the citation is incomplete.
- **Open questions where the standard may specify a different method.** These could
  change results, not just references. They are marked **method risk**.

Standards referenced: BS EN ISO 6946 (thermal resistance and transmittance),
BR 443 *Conventions for U-value calculations*, BS EN ISO 13788 (surface humidity and
interstitial condensation), BS EN ISO 10456 (declared and design thermal values),
BS EN ISO 10211 (thermal bridges, numerical), BS 5250 (moisture control in
buildings), DIN 4108-3 (Glaser, for a later phase).

---

## 1. Engine: clause references for values we are using

| # | Item | Where | What to check | If wrong |
|---|---|---|---|---|
| ~~V1~~ | ~~Surface resistances 0.10 / 0.13 / 0.17 and Rse 0.04~~ | — | **CLOSED.** BR 443 (2019) §4.2 *Surface resistance* tabulates exactly these against heat-flow direction and element type, citing BS EN ISO 6946 | — |
| ~~V2~~ | ~~"Horizontal" means ±30° of the horizontal plane~~ | — | **CLOSED.** BR 443 (2019) §4.2, verbatim: "The values under 'horizontal' apply to heat flow directions ±30° from the horizontal plane" | — |
| ~~V3~~ | ~~Rounding~~ | — | **CLOSED.** BS EN ISO 6946:2017 6.5.2: a thermal transmittance presented as a final result *shall be rounded to two significant figures*. Implemented; the old two-decimal-places rule was wrong at both ends of the range. Resistance reporting precision remains our own choice — BR 443 (2019) is silent and ISO 6946 6.7.1.1 only sets a three-decimal floor on *intermediate* values | — |

## 2. Engine: open method questions (**method risk**)

| # | Item | Where | What to check | If wrong |
|---|---|---|---|---|
| V4 | **Unventilated air layer resistance table** — every value, for all three heat-flow directions | `engine/src/constants.ts` `UNVENTILATED_AIR_LAYER_TABLE` | All 27 tabulated values against a printed copy. Also: BS EN ISO 6946:2007 presents these as a table, while the 2017 edition moved to a calculation procedure for air layers in an annex. Confirm which basis BR 443 UK work should follow, and whether the tabulated values are reproduced unchanged in 2017 | Changes every build-up containing a cavity |
| V5 | **Slightly ventilated air layers** — we interpolate the total resistance linearly on opening area between the unventilated and well-ventilated treatments | `engine/src/airLayer.ts` `slightlyVentilatedInterpolationWeight`, `engine/src/assembly.ts` | Whether BS EN ISO 6946 specifies this, or instead specifies **half the tabulated unventilated resistance with the resistance of the layers outboard of the cavity capped at 0.15 m²K/W**. These give different answers. Both candidates are implemented-or-noted; the standard's method must replace ours | Changes every slightly ventilated build-up |
| V6 | Ventilation class thresholds, 500 and 1500 mm²/m | `engine/src/constants.ts` | Both thresholds and their clause, including whether the figures differ for walls (per metre of length) and roofs (per m² of area) | Misclassifies cavities between the two treatments |
| ~~V7~~ | ~~Well-ventilated treatment: disregard the cavity and everything outboard, substitute Rsi for Rse~~ | — | **CLOSED.** BR 443 (2019) §4.7.3: the air is at external temperature, so the cavity and all layers outboard are disregarded, and because the cladding shelters the wall Rse exceeds 0.04. Its indicative values for **high-emissivity** surfaces are Rse 0.13 (wall) and 0.10 (roof) — exactly what our Rse = Rsi rule produces. **Not yet modelled:** low-emissivity surfaces get 0.29 (wall) and 0.17 (roof) | Low-emissivity ventilated cavities are under-reported |
| V8 | Combined-method applicability limit R'T/R''T ≤ 1.5 | `engine/src/constants.ts` `COMBINED_METHOD_MAX_UPPER_TO_LOWER_RATIO` | The limit and its clause in BS EN ISO 6946. (We have confirmed internally that a ratio of 1.5 is algebraically the same rule as a 20 % error estimate, so only one figure needs checking) | Changes which build-ups get a U-value at all |
| V9 | **Metal-bridging detection threshold, λ ≥ 5.0 W/(m·K)** | `engine/src/constants.ts` `METAL_DETECTION_MIN_LAMBDA_W_PER_MK` | How BS EN ISO 6946 words its exclusion of metal penetrating the insulation, and whether it gives any quantitative test. **The threshold is our own heuristic, not a figure from any standard.** It sits above dense concrete (~2.0) and granite (~3.5) and below stainless steel (~17) | Could wrongly admit or exclude a build-up from the combined method |
| V10 | Interstitial condensation is assessed through the insulation path as well as the stud path, worst per interface | `engine/src/temperatureProfile.ts`, `engine/src/condensation/method.ts` | Whether BS 5250 assesses interstitial condensation through the insulation rather than the stud, as we believe. Our approach takes the worst of **all** section paths, so it is conservative either way — but the basis should be confirmed | Basis of the condensation verdict |
| V11 | BS EN ISO 13788 Annex E equation numbers for the saturation-pressure and dew-point equations | `engine/src/psychrometrics.ts` | The equation numbers within Annex E of BS EN ISO 13788:2012. The equations themselves are reproduced in the code and tested against hand calculations | Citation only |
| V12 | **Reduced air circulation Rsi = 0.25 m²K/W** | `engine/src/constants.ts` `REDUCED_AIR_CIRCULATION_RSI_M2K_PER_W`, `engine/src/boundary.ts` | The value and its clause in DIN 4108-3 (and DIN 4108-2, where the same figure is understood to serve the mould-growth check); whether it applies to all three heat-flow directions or only horizontal; and whether BR 443 or BS 5250 give a UK equivalent, since this is a German convention offered in a UK-first tool | Changes both the surface temperature **and** the U-value wherever the option is selected. The UI states that the result is not a BR 443 U-value |
| V13 | Rse taken as the still-air Rsi for an element adjacent to an unheated space | `engine/src/boundary.ts` `RseTreatment` | The clause in BS EN ISO 6946 for the unheated-space case (the well-ventilated-cavity case is V7), and whether the unheated space's own resistance `R_u` must additionally be included. **`R_u` is not applied** — see ROADMAP.md, Phase 2 | Under-reports the resistance of elements next to garages, lofts and unheated stores |
| ~~V14~~ | ~~Bridged fraction for studs and rafters~~ | — | **CLOSED, and we were wrong.** BR 443 (2019) §4.5: the fraction is the member width divided by the spacing **plus 0.01** for additional timbers, with worked examples ((35/600)+0.01 = 0.068; (50/400)+0.01 = 0.135). The allowance is now applied, and BR 443's own defaults are offered as presets: timber frame 15 % (§4.4.1(i)), 12.5 % with improved detailing (§4.4.1(ii)), ceiling joists 12.8 % (§4.5.1), doubled 16.7 % (§4.5.2), suspended floor joists 10.8 % (§4.5.3) | — |
| V15 | **Water vapour permeability of still air, δ = 2.0 × 10⁻¹⁰ kg/(m·s·Pa)** | `engine/src/vapour.ts` `AIR_VAPOUR_PERMEABILITY_KG_PER_M_S_PA` | The value and its clause in BS EN ISO 13788 / BS EN ISO 10456, and whether either fixes it as a constant or gives it as a function of temperature and barometric pressure (the permeability of air does depend on both). Also the 5 MN·s/(g·m) resistivity of still air against BS 5250. **The two agree**: 1 ÷ (2.0 × 10⁻¹⁰ × 10⁹) = 5 exactly, which is the cross-check that made this value usable — but agreeing with a remembered figure is not a citation | Scales every δ shown and every MN·s/g conversion. μ and S<sub>d</sub>, which drive the tool's own reasoning, are unaffected |
| V16 | **The Glaser construction** — vapour pressure profile as the lower convex hull of the saturation ceiling between the two air vapour pressures | `engine/src/condensation/glaser.ts` | The clause in BS EN ISO 13788 describing the construction, and that the convex-hull form is equivalent to the standard's own wording. The geometry is derived rather than guessed (slopes increasing along the path ⇔ flow arriving ≥ flow leaving ⇔ condensation at the touching planes), and it reproduces the textbook result on the worked example in `glaser.test.ts` | The whole interstitial verdict |
| V17 | Surface vapour resistances are neglected, so vapour pressure at each surface is that of the adjacent air | `engine/src/condensation/glaser.ts` | That BS EN ISO 13788 does neglect them, and the clause | Small shift in the profile near each surface; unlikely to change a verdict |
| V18 | Condensation rate g = δ_air·Δp/S<sub>d</sub>, taken over the whole straight run between planes | `engine/src/condensation/glaser.ts` `vapourFlowRateKgPerM2S` | The clause for the flow equation, and that the rate at a plane is flow in minus flow out | Scales every g/m²·day figure reported |
| V19 | The bridged path is assessed with the bridging member's **temperatures** but the surrounding layers' **vapour resistances** | `engine/src/condensation/iso13788.ts` | Whether BS EN ISO 13788 expects the vapour path through a stud to use that stud's own μ (timber μ 50 against mineral wool μ 1 is a large difference). If so, the bridging material's μ needs threading through `SectionPath` | Misstates the bridged path's condensation. Surfaced as a warning in the UI whenever an element is bridged |
| V20 | **Mould threshold: 80 % surface relative humidity** | `engine/src/condensation/periodAssessment.ts` `MOULD_CRITICAL_SURFACE_HUMIDITY_PERCENT` | The value and its clause. BS EN ISO 13788 is understood to set a critical surface humidity of 80 % for mould and to express the requirement as a temperature factor f<sub>Rsi</sub> derived from it; BS 5250 and BRE IP 1/06 are understood to give a UK f<sub>Rsi</sub> of 0.75 for dwellings. **Neither has been checked**, and f<sub>Rsi</sub> is not implemented at all | The mould verdict on the Moisture tab flips at the wrong humidity |
| V21 | Season lengths, drying-season weather, and the limit on accumulated condensate | Moisture tab inputs; `engine/src/condensation/periodAssessment.ts` takes all of them as arguments | What BS EN ISO 13788 and DIN 4108-3 each prescribe: the periods, the boundary conditions for each, and the maximum permitted accumulation (and whether it differs for capillary-absorbent layers). **Nothing is asserted here** — the engine takes every one of these as an input, the UI defaults are round numbers chosen to look provisional, and no pass mark is given, precisely because these cannot yet be attributed | Nothing silently: the arithmetic is correct for whatever periods and conditions are entered. What is missing is the authority to say whether a result passes |

## 3. In-house conventions (not standards — labelled as ours in code and UI)

These are **not** verification items in the sense above: no standard defines them, and
they cannot be "checked". They are listed so that nobody mistakes them for standard
methods. See `CLAUDE.md`.

| # | Convention | Where | Why |
|---|---|---|---|
| C1 | The `'combined'` temperature profile scales the parallel-combined layer resistances by `k = (RT − Rsi − Rse)/(R''T − Rsi − Rse)`, holding Rsi and Rse fixed | `engine/src/temperatureProfile.ts` `combinedScalingFactor` | BS EN ISO 6946 gives a U-value for a bridged element but defines no temperature profile through one. Without the scaling, the drawn profile sums to R''T and would imply a different heat flux from the U-value shown beside it |
| C2 | Sd values in `'combined'` mode follow the unbridged path | `engine/src/temperatureProfile.ts` | Area-weighting μ·d across a stud layer has no clean physical meaning |
| C3 | Where an element resolves into several weighted variants (a slightly ventilated cavity), the profile is drawn for the dominant variant | `engine/src/temperatureProfile.ts` | A single drawn profile cannot represent an interpolation between two different assemblies. Flagged in the result's warnings |
| C4 | The "vapour open / retarding / barrier" chip beside each layer bands S<sub>d</sub> at 0.5 m and 10 m | `engine/src/vapour.ts` `vapourClassForSd` | The three terms are in common use but we cannot attribute the boundaries between them to a standard. The chip is a reading aid for one layer; **nothing in the calculation depends on it**, and the S<sub>d</sub> figure itself is shown beside it |

## 4. Materials

Every seeded material has `"source": "TODO(verify)"`. This is deliberate. The values
are conventional UK figures that give sensible results, but we are not able to
attribute specific numbers to specific table rows with confidence, and the repository
rule forbids inventing a citation that looks authoritative. Each record's `notes`
field names the authority to check it against.

**No material value in this database should be used for a submitted calculation until
its row here is closed.**

The general checks that apply to the whole table:

- λ, ρ, c and μ against **BS EN ISO 10456:2007 Table 3** where the material appears
  there, noting that ISO 10456 tabulates masonry and concrete by density band rather
  than by UK convention.
- **BR 443** for UK-specific conventions (notably the outer/inner leaf brickwork
  distinction, which is a UK convention rather than an ISO one).
- **CIBSE Guide A** Table 3.49 for UK construction materials.
- For insulation, λ is product-specific and declared under the relevant harmonised
  standard (BS EN 13162 mineral wool, 13163 EPS, 13165 PIR, 13171 wood fibre). The
  seeded values are generic placeholders only.
- For membranes, the useful quantity is the declared Sd (BS EN ISO 12572), not λ.
- Whether the dry or wet μ value applies for the intended use (ISO 10456 tabulates
  both for many materials).

### Individual records

| id | name | λ W/(m·K) | ρ kg/m³ | c J/(kg·K) | μ | check against |
|---|---|---|---|---|---|---|
| `brick-outer-leaf` | Brickwork, outer leaf (exposed) | 0.77 | 1700 | 1000 | 10 | Conventional UK design value for an exposed outer leaf. Check against BR 443 and CIBSE Guide A Table 3.49; ISO 10456 gives masonry by density band rather than by UK leaf convention. |
| `brick-inner-leaf` | Brickwork, inner leaf (protected) | 0.56 | 1700 | 1000 | 10 | Conventional UK design value for a protected inner leaf. Check against BR 443 and CIBSE Guide A Table 3.49. |
| `dense-concrete-block` | Dense aggregate concrete block | 1.13 | 1900 | 1000 | 60 | Generic UK dense aggregate block. Product values vary widely; check against BR 443 and manufacturer declared values, and confirm mu against ISO 10456 Table 3. |
| `aircrete-block` | Aircrete (autoclaved aerated) block | 0.15 | 600 | 1000 | 6 | Generic UK aircrete block. UK products span roughly 0.11 to 0.20 W/(m*K) by density; check against BR 443 and manufacturer declared values. |
| `concrete-medium-density` | Concrete, medium density | 1.35 | 2000 | 1000 | 100 | Check lambda, c and mu against BS EN ISO 10456:2007 Table 3, which tabulates concrete by density. |
| `concrete-reinforced` | Concrete, reinforced (1 % steel) | 2.3 | 2300 | 1000 | 130 | Check against BS EN ISO 10456:2007 Table 3, which lists reinforced concrete separately by steel content. |
| `gypsum-plasterboard` | Gypsum plasterboard | 0.25 | 900 | 1000 | 10 | Check lambda, rho, c and mu against BS EN ISO 10456:2007 Table 3 (gypsum plasterboard, 900 kg/m3). |
| `gypsum-plaster` | Gypsum plaster, dense | 0.57 | 1300 | 1000 | 10 | Check against BS EN ISO 10456:2007 Table 3, which tabulates gypsum plaster by density. |
| `cement-sand-render` | Cement:sand render | 1.0 | 1800 | 1000 | 25 | Check against BS EN ISO 10456:2007 Table 3 (cement mortar / plaster) and BR 443. |
| `sand-cement-screed` | Sand:cement screed | 1.15 | 2000 | 1000 | 30 | Check against BS EN ISO 10456:2007 Table 3 and BR 443. |
| `softwood-structural` | Softwood, structural | 0.13 | 500 | 1600 | 50 | Check against BS EN ISO 10456:2007 Table 3 (softwood, 500 kg/m3), including whether the dry (50) or wet (20) mu applies for the intended use. |
| `osb-board` | Oriented strand board (OSB) | 0.13 | 650 | 1700 | 50 | Check lambda, rho, c and mu against BS EN ISO 10456:2007 Table 3 (OSB) and BS EN 13986. |
| `plywood-board` | Plywood | 0.13 | 500 | 1600 | 90 | Check against BS EN ISO 10456:2007 Table 3 (plywood by density) and BS EN 13986. |
| `chipboard-flooring` | Chipboard flooring | 0.14 | 600 | 1700 | 50 | Check against BS EN ISO 10456:2007 Table 3 (particleboard by density) and BS EN 13986. |
| `mineral-wool-quilt` | Mineral wool quilt | 0.035 | 20 | 1030 | 1 | Generic value only; lambda is product-specific and declared to BS EN 13162. Check c and mu against BS EN ISO 10456:2007 Table 3 (mineral wool). |
| `eps-board` | Expanded polystyrene (EPS) board | 0.038 | 20 | 1450 | 60 | Generic value only; lambda is product-specific and declared to BS EN 13163. Check c and mu against BS EN ISO 10456:2007 Table 3 (EPS). |
| `pir-board` | Polyisocyanurate (PIR) board, foil faced | 0.022 | 32 | 1400 | 60 | Generic value only; lambda is product-specific and declared to BS EN 13165. Facings dominate the vapour resistance, so mu of the core is not the whole story. Check against ISO 10456 and product declarations. |
| `wood-fibre-board` | Wood fibre insulation board | 0.04 | 140 | 2100 | 5 | Generic value only; lambda is product-specific and declared to BS EN 13171. Check c and mu against ISO 10456 and product declarations. |
| `polyethylene-vcl` | Polyethylene vapour control layer | 0.33 | 980 | 1800 | 100000 | A thin membrane's contribution is its Sd, not its lambda. Check lambda, rho, c against ISO 10456 (polyethylene) and take Sd from the product declaration to BS EN ISO 12572. |
| `bitumen-sheet` | Bitumen sheet membrane | 0.23 | 1100 | 1000 | 50000 | Check against BS EN ISO 10456:2007 Table 3 (bitumen / roofing felt) and take Sd from the product declaration. |
| `concrete-roof-tile` | Concrete roof tile | 1.0 | 2100 | 1000 | 100 | Check against BS EN ISO 10456:2007 Table 3 (tiles, concrete) and BR 443. |
| `clay-roof-tile` | Clay roof tile | 1.0 | 2000 | 800 | 40 | Check against BS EN ISO 10456:2007 Table 3 (tiles, clay) and BR 443. |

---

## 5. Out of scope in Phase 1, so not yet a verification item

Listed here only so it is clear they are absent rather than assumed. See `ROADMAP.md`.

- BS EN ISO 6946 ΔU corrections: air voids, mechanical fasteners, inverted roofs.
  **BR 443 requires the fastener correction, so a UK U-value from this tool is
  incomplete wherever insulation is mechanically fixed through.**
- BS EN ISO 13788 monthly interstitial condensation and its climate data.
- DIN 4108-3 Glaser as an alternative method.
- BS EN ISO 13786 dynamic properties (areal heat capacity kappa, decrement factor,
  time shift) needed by the SAP 10.3 tool.
- BS EN ISO 10211 two-dimensional thermal bridges.
- BS EN ISO 13370 ground floors.
