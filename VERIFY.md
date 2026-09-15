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
| ~~V4~~ | ~~Unventilated air layer resistance table~~ | — | **CLOSED, by deriving it.** ISO/DIS 6946:2015 Annex D's own note settles the basis: "The values in Table 9 in 6.9.2 are calculated using Formula (D.1) with ha according to Table D.1. ε1 = 0,9, ε2 = 0,9, and hr0 evaluated at 10 °C." `engine/src/airspace.ts` implements C.3 and D.1–D.4 and **reproduces all 21 of our tabulated entries to the two decimals they are quoted at** — a test asserts it over the whole table. The table is no longer a set of remembered numbers; it is the output of a formula we hold. Ten of the values were separately confirmed against Malta's Technical Document F before this, which now reads as a cross-check that agreed. The 35 mm floor row that disagreed there is explained too: the formula gives **0.203**, against our interpolated 0.198 and that document's 0.17 — so the outlier was theirs, and our linear interpolation is a close but not exact stand-in for a curve | — |
| V5 | **Slightly ventilated air layers** — linear interpolation of the total resistance on opening area | `engine/src/airLayer.ts`, `engine/src/assembly.ts` | **Confirmed against ISO/DIS 6946:2015 Formula (11)**, which interpolates exactly as we do between R<sub>tot;nve</sub> and R<sub>tot;ve</sub> over the 500–1500 mm² range — the alternative treatment this row worried about is not what the standard does. Still to confirm against the **published 2017** text, since the source is a draft | Was the highest-risk open item; now believed right |
| ~~V6~~ | ~~Ventilation class thresholds, 500 and 1500 mm²/m~~ | — | **CLOSED.** BR 443 (2019) 4.7 states both, and settles the orientation question too: slightly ventilated is "&gt;500 mm² but &lt;1500 mm² per metre of length (in the horizontal direction) for vertical air layers, and &gt;500 mm² but &lt;1500 mm² per square metre of surface area for horizontal air layers", with well ventilated at or above 1500 in the same units. The numbers are the same for both orientations; only the unit they are counted in differs | — |
| ~~V7~~ | ~~Well-ventilated treatment: disregard the cavity and everything outboard, substitute Rsi for Rse~~ | — | **CLOSED.** BR 443 (2019) §4.7.3: the air is at external temperature, so the cavity and all layers outboard are disregarded, and because the cladding shelters the wall Rse exceeds 0.04. Its indicative values for **high-emissivity** surfaces are Rse 0.13 (wall) and 0.10 (roof) — exactly what our Rse = Rsi rule produces. **Not yet modelled:** low-emissivity surfaces get 0.29 (wall) and 0.17 (roof) | Low-emissivity ventilated cavities are under-reported |
| V8 | Combined-method applicability limit R'T/R''T ≤ 1.5 | `engine/src/constants.ts` `COMBINED_METHOD_MAX_UPPER_TO_LOWER_RATIO` | The limit and its clause in BS EN ISO 6946. (We have confirmed internally that a ratio of 1.5 is algebraically the same rule as a 20 % error estimate, so only one figure needs checking) | Changes which build-ups get a U-value at all |
| V9 | **Metal-bridging detection threshold, λ ≥ 5.0 W/(m·K)** | `engine/src/constants.ts` `METAL_DETECTION_MIN_LAMBDA_W_PER_MK` | How BS EN ISO 6946 words its exclusion of metal penetrating the insulation, and whether it gives any quantitative test. **The threshold is our own heuristic, not a figure from any standard.** It sits above dense concrete (~2.0) and granite (~3.5) and below stainless steel (~17) | Could wrongly admit or exclude a build-up from the combined method |
| V10 | Interstitial condensation is assessed through the insulation path as well as the stud path, worst per interface | `engine/src/temperatureProfile.ts`, `engine/src/condensation/method.ts` | Whether BS 5250 assesses interstitial condensation through the insulation rather than the stud, as we believe. Our approach takes the worst of **all** section paths, so it is conservative either way — but the basis should be confirmed | Basis of the condensation verdict |
| V11 | BS EN ISO 13788 Annex E equation numbers for the saturation-pressure and dew-point equations | `engine/src/psychrometrics.ts` | The equation numbers within Annex E of BS EN ISO 13788:2012. The equations themselves are reproduced in the code and tested against hand calculations | Citation only |
| ~~V12~~ | ~~Reduced air circulation Rsi = 0.25 m²K/W~~ | — | **CLOSED.** Not DIN after all — it is in BS EN ISO 13788:2012 §4.4.1, in the published free preview: "For condensation or mould growth on opaque surfaces, an internal surface thermal resistance of 0,25 m²·K/W **shall** be taken to represent the effect of corners, furniture, curtains or suspended ceilings, if there are no national standards." Note it is *shall*, not *may* — see V26 | — |
| V13 | Rse taken as the still-air Rsi for an element adjacent to an unheated space | `engine/src/boundary.ts` `RseTreatment` | The clause in BS EN ISO 6946 for the unheated-space case (the well-ventilated-cavity case is V7), and whether the unheated space's own resistance `R_u` must additionally be included. **`R_u` is not applied** — see ROADMAP.md, Phase 2 | Under-reports the resistance of elements next to garages, lofts and unheated stores |
| ~~V14~~ | ~~Bridged fraction for studs and rafters~~ | — | **CLOSED, and we were wrong.** BR 443 (2019) §4.5: the fraction is the member width divided by the spacing **plus 0.01** for additional timbers, with worked examples ((35/600)+0.01 = 0.068; (50/400)+0.01 = 0.135). The allowance is now applied, and BR 443's own defaults are offered as presets: timber frame 15 % (§4.4.1(i)), 12.5 % with improved detailing (§4.4.1(ii)), ceiling joists 12.8 % (§4.5.1), doubled 16.7 % (§4.5.2), suspended floor joists 10.8 % (§4.5.3) | — |
| V15 | **Water vapour permeability of still air, δ = 2.0 × 10⁻¹⁰ kg/(m·s·Pa)** | `engine/src/vapour.ts` `AIR_VAPOUR_PERMEABILITY_KG_PER_M_S_PA` | The value and its clause in BS EN ISO 13788 / BS EN ISO 10456, and whether either fixes it as a constant or gives it as a function of temperature and barometric pressure (the permeability of air does depend on both). Also the 5 MN·s/(g·m) resistivity of still air against BS 5250. **The two agree**: 1 ÷ (2.0 × 10⁻¹⁰ × 10⁹) = 5 exactly, which is the cross-check that made this value usable — but agreeing with a remembered figure is not a citation | Scales every δ shown and every MN·s/g conversion. μ and S<sub>d</sub>, which drive the tool's own reasoning, are unaffected |
| V16 | **The Glaser construction** — vapour pressure profile as the lower convex hull of the saturation ceiling between the two air vapour pressures | `engine/src/condensation/glaser.ts` | The clause in BS EN ISO 13788 describing the construction, and that the convex-hull form is equivalent to the standard's own wording. The geometry is derived rather than guessed (slopes increasing along the path ⇔ flow arriving ≥ flow leaving ⇔ condensation at the touching planes), and it reproduces the textbook result on the worked example in `glaser.test.ts` | The whole interstitial verdict |
| ~~V17~~ | ~~Surface vapour resistances are neglected~~ | — | **CLOSED.** BS EN ISO 13788:2012 §4.4.2, verbatim: "The surface water vapour resistance is assumed to be negligible in the calculations in accordance with this International Standard." | — |
| V18 | Condensation rate g = δ_air·Δp/S<sub>d</sub>, taken over the whole straight run between planes | `engine/src/condensation/glaser.ts` `vapourFlowRateKgPerM2S` | The clause for the flow equation, and that the rate at a plane is flow in minus flow out | Scales every g/m²·day figure reported |
| V19 | The bridged path is assessed with the bridging member's **temperatures** but the surrounding layers' **vapour resistances** | `engine/src/condensation/iso13788.ts` | Whether BS EN ISO 13788 expects the vapour path through a stud to use that stud's own μ (timber μ 50 against mineral wool μ 1 is a large difference). If so, the bridging material's μ needs threading through `SectionPath` | Misstates the bridged path's condensation. Surfaced as a warning in the UI whenever an element is bridged |
| ~~V20~~ | ~~Mould threshold: 80 % surface relative humidity~~ | — | **CLOSED.** BS EN ISO 13788:2012 §5.3: "To avoid mould growth the monthly mean relative humidity at the surface should not exceed a critical relative humidity φ<sub>si,cr</sub>, which should be taken as 0,8 unless more specific information is available from National Regulations or elsewhere. Other criteria, e.g. φ<sub>si,cr</sub> ≤ 0,6 to avoid corrosion, can be used if appropriate." Two things we did not have: it is a **monthly mean**, not an instantaneous value, and 0,6 is the alternative for corrosion. f<sub>Rsi</sub> is still not implemented | — |
| V21 | Season lengths, drying-season weather, and the limit on accumulated condensate | Moisture tab inputs; `engine/src/condensation/periodAssessment.ts` takes all of them as arguments | What BS EN ISO 13788 and DIN 4108-3 each prescribe: the periods, the boundary conditions for each, and the maximum permitted accumulation (and whether it differs for capillary-absorbent layers). **Nothing is asserted here** — the engine takes every one of these as an input, the UI defaults are round numbers chosen to look provisional, and no pass mark is given, precisely because these cannot yet be attributed | Nothing silently: the arithmetic is correct for whatever periods and conditions are entered. What is missing is the authority to say whether a result passes |
| V22 | The ΔU<sub>g</sub> scaling by (R<sub>1</sub> / R<sub>T,h</sub>)² | `engine/src/corrections.ts` | **Confirmed against ISO/DIS 6946:2015 Annex F, Formula (F.3)**: ΔU<sub>g</sub> = ΔU″ · (R<sub>1</sub>/R<sub>T,h</sub>)², with R<sub>1</sub> the resistance of the layer containing the gaps and R<sub>T,h</sub> the total ignoring thermal bridging. Table F.1 also confirms the three levels 0.00/0.01/0.04. Still to confirm against the published 2017 text | Believed right; our R<sub>T</sub> should be the *unbridged* total, which is worth re-checking in code |
| V23 | **BS EN ISO 13786 clause, equation and table numbers** — for the layer transfer matrix, the element matrix ordering, and the definitions of Y<sub>ie</sub>, the decrement factor, the time shift and κ | `engine/src/dynamic.ts` | The paragraph numbers, and whether the standard's sign convention for the time shift matches ours (we report a delay as a positive number of hours). **The physics is not in doubt**: the layer matrix is derived from the heat equation in the module header and checked in the tests against an independent complex-exponential form, against the massless limit, against ρ·c·d/2 for a thin slab and against ρ·c·δ/√2 for a semi-infinite one. What is unverified is the citation and any reporting convention the standard imposes (rounding, which face κ is quoted for, whether SAP 10.3 wants κ at a different period) | The numbers would be right but might be labelled or rounded differently from a conforming calculation, and a SAP submission needs the standard's own conventions |
| V24 | **The approximate fastener procedure** | `engine/src/fasteners.ts` | **Formula obtained** from ISO/DIS 6946:2015 Annex F.3.2, Formula (F.5): ΔU<sub>f</sub> = α · (λ<sub>f</sub> A<sub>f</sub> n<sub>f</sub> / d<sub>1</sub>) · (R<sub>1</sub>/R<sub>T,h</sub>)², with α = 0,8 fully penetrating or 0,8 × d<sub>1</sub>/d<sub>0</sub> recessed. F.3.1 also gives the detailed route as ΔU<sub>f</sub> = n<sub>f</sub>·χ, which independently confirms what we built from BR 443 4.8.3(a). Implemented; **still to confirm against the published 2017 text** | A user without a χ can now get a correction from the fastener's own dimensions |
| V25 | **Low-emissivity cavity resistance between 10 mm and 25 mm** is interpolated linearly between BR 443's own points | `engine/src/airLayer.ts` `lowEmissivityAirLayerResistanceM2KPerW` | BR 443 (2019) 4.7.2 gives three wall figures at e = 0.2 — 0.17 at 5 mm, 0.29 at 10 mm, 0.44 at 25 mm — and also says a 20 mm cavity is "still close to that for 25mm". Straight-line interpolation between its own points gives 0.39 at 20 mm, so it is lower than BR 443's description. The real curve flattens towards 25 mm and should be taken from BS EN ISO 6946 Annex D, which is not in the free preview | Under-states a thin low-emissivity wall cavity by up to about 0.05 m²K/W, which is the safe direction for a U-value. Nothing below 25 mm in a roof or floor is estimated at all — the high-emissivity value is used with a warning |
| V26 | **BS EN ISO 13788's fixed Rsi for surface condensation and mould is now enforced** | `engine/src/condensation/surfaceAssessment.ts`, `engine/src/constants.ts` `ISO13788_SURFACE_ASSESSMENT_RSI_M2K_PER_W` | **Behaviour fixed; the citation is what remains.** §4.4.1 requires 0,25 m²K/W for condensation or mould on an opaque surface, while Table 2's 0,10 / 0,13 / 0,17 are for interstitial condensation and for windows and doors. It was previously left to the user's air-circulation choice, so the verdict only conformed when they happened to pick reduced circulation. It is now applied always, on the coldest path, and the control says outright that it no longer affects the verdict. **Still to check against a printed copy:** the clause number, and whether 4.4.1 states the figure for every heat-flow direction or only for walls. Also still open, and separate: the 80 % mould threshold and the f_Rsi form of the criterion — f_Rsi is now *calculated* and reported, but no limit is applied to it, since BS 5250 / BRE IP 1/06's UK figure of 0.75 is unverified | Was: the mould verdict was optimistic by default. Now: the verdict is conservative and conforming, and what is left is whether we are citing the right clause for a figure we are already applying |
| ~~V27~~ | ~~Air voids are not distinguished from air layers~~ | — | **CLOSED.** ISO/DIS 6946:2015 Annex D.4 is implemented in `engine/src/airspace.ts` and applied to a cavity divided by members: D.6 is the air layer's own radiative formula with a geometry term, hr = hr0 / (1/ε1 + 1/ε2 − 2 + 2/(1 + √(1 + d²/b²) − d/b)), which collapses to the layer case as the width grows, so one expression covers both. BR 443 (2006) 4.8.1 supplies the UK form of the ten-times test and names the space between battens in a dry-lined wall as a layer. **This row previously had the consequence backwards** and it is worth recording why: a narrow deep pocket's two faces see less of each other, so more of what the warm face radiates lands on the sides, hr *falls*, and the resistance *rises*. Treating a divided cavity as an air layer therefore **under**-states it, not over-states it — the safe direction, but still wrong. In the limit hr tends to hr0/(1/ε1 + 1/ε2) = 2.32 against a layer's 4.21 | — |
| V28 | **What the Glaser method does not account for** | `engine/src/condensation/glaser.ts`, shown to the reader in `MoistureTab.tsx` and `CrossSection.tsx` | The clause in BS EN ISO 13788 that lists the transport mechanisms the method excludes. We state four — rain driven into the outer leaf, capillary movement of liquid water, air carrying moisture through gaps, and hygroscopic uptake and release — and they are uncontroversial physics rather than a reading of the standard, which is precisely why the clause is worth having: the standard's own list may be longer, shorter, or differently drawn, and we are asserting where a method stops. **This is user-facing text, not a number**, so a wrong emphasis misleads without ever failing a test | Sets how much weight a reader gives a condensation result. Under-stating the limits makes a wet plane look like a defect; over-stating them makes a real one look ignorable |
| V29 | **A slightly ventilated cavity moves the thermal boundary but not the vapour boundary** | `engine/src/assembly.ts`, `engine/src/condensation/` | Whether BS EN ISO 13788 (or BR 443) says anything about the vapour path through a slightly ventilated cavity. Ours is a deliberate asymmetry: ISO 6946's interpolation is applied to **thermal** resistance, and nothing in the condensation modules reads the ventilation class at all, so the full S<sub>d</sub> of every layer outboard of the cavity stays in the vapour path. Verified by experiment: an unventilated and a slightly ventilated 25 mm cavity behind the same wall both give 8.86 g/(m²·day), while a well-ventilated one gives no condensation at all, the outer leaf having been disregarded. The asymmetry is the conservative direction, and it may still be wrong — a cavity with open perpends plainly carries *some* vapour away | A wall whose cavity is slightly ventilated has its condensation over-reported. This is the common UK masonry case: open perpends at 900 mm centres give about 720 mm²/m, which is slightly ventilated on BR 443 4.7's thresholds (V6), not well ventilated — you would need them at 433 mm centres or closer to reach 1500 mm²/m |
| V30 | **BR 443 plasterboard-lining data is quoted from the 2006 edition** | `engine/src/constants.ts`, `apps/web/src/state/model.ts` | The dab and batten figures — dabs at 0.20 area fraction, λ 0.43 W/(m·K), 15 mm thick over a 0.17 m²K/W airspace; battens 47 mm at 600 mm centres plus top and bottom rails for a 2400 mm room giving 0.118, 22 mm thick over 0.18 m²K/W — are **verbatim from BR 443 (2006) 4.7.1 and 4.7.2**, which we hold. The 2019 edition renumbers this material (its 4.7 is airspaces, per V6 and V7), so the clause numbers we cite are the 2006 ones and are labelled as such in the code. Confirm the 2019 clause numbers and whether any figure moved. Two internal cross-checks already agree: 47/600 + 2×47/2400 = 0.1175, which is their 0.118; and our air-layer table interpolates 0.177 at 22 mm, which is their 0.18 | A superseded convention would be applied to every dry-lined wall. The figures are a named edition's, not invented, so the risk is staleness rather than fabrication |
| V31 | **EPS μ is grade-dependent and our single figure sits high; EPS specific heat has two citable sources that disagree** | `packages/materials/data/materials.json` `eps-board` | **μ.** EUMEPS's *EPS White Book*, tabulating EN 13163 Annex D.2 as revised, gives μ **20–40 for EPS 30–80**, 30–70 for EPS 90–150, and 40–100 for EPS 200 and above. We carry a single 60, which is inside the EPS 90–150 band and **outside** the band for EPS 70 — a common wall and floor board. A generic EPS record cannot be right for every grade, so the question is whether to carry grades as separate records or to pick the commonest and say so. Not changed on my own initiative, because μ drives the condensation verdict and swapping one unverified number for another is not an improvement. **c.** The same document states 1 300 J/(kg·K) for polystyrene, attributing it to EN 12524 — the very table ISO 10456 adopted. We carry 1 450 from BR 443 (2019) §16, which groups "mineral wool, expanded and extruded polystyrene" together. Two citable sources, 12 % apart; BR 443 wins for UK work by our own standards order, and the conflict is worth knowing about | μ: mis-states how much vapour crosses an EPS layer, in whichever direction the layer's position makes it matter. c: affects the dynamic properties only, where 12 % on one layer is small |
| V32 | **SAP 10.2 climate and fuel factors** | `engine/src/climate.ts`, `engine/src/heatSource.ts` | Table U1 (monthly mean external temperature, 21 regions plus a UK average) and Table 12 (emission factors, primary energy factors, fuel prices) are transcribed from SAP 10.2 (17-12-2021), which BRE publishes free for the department of state. **What to check:** whether SAP 10.3 revises either table, and Table U6's postcode-to-region mapping, which is *not* reproduced — the region is chosen by name, so a user in a boundary postcode may pick the wrong one. Also Table U4's representative altitude, which U1's own note says the figures assume | Wrong temperatures scale every seasonal figure. **The prices are knowingly stale**: SAP set them in 2021 and UK energy prices have moved a long way since, so they are offered as an editable starting point rather than an answer. Electricity's carbon factor also falls as the grid decarbonises, so a comparison made today flatters gas over a building's life |
| V33 | **The heating base temperature, 15.5 °C** | `engine/src/climate.ts` `DEFAULT_HEATING_BASE_TEMPERATURE_C` | The temperature below which a month counts as needing heating. **This is the one figure on the energy tab that is not SAP's.** 15.5 °C is the long-standing UK degree-day base — the idea being that internal and solar gains carry a building the last few degrees — but no citable source has been found for it, and it properly depends on the building rather than on the weather. Exposed as an input for that reason. SAP itself does not work this way: it runs a monthly balance and has no fixed heating season at all, which is the better method and needs the whole dwelling | Decides how many months count. At 15.5 °C ten months of the UK average year qualify; raising it to 18 makes it twelve and lowering it to 10 makes it four, so the seasonal total moves a great deal |
| V34 | **Wind-driven rain zones, and Table 4** | `engine/src/exposure.ts` | **The document is now held**, so this row shrinks. Approved Document C as published on gov.uk (`BR_PDF_AD_C_2013.pdf`, © Crown copyright 2013, reprint August 2013) Diagram 12 prints its own key, and the four boundaries carried here are that key verbatim: 1 sheltered less than 33, 2 moderate 33 to less than 56.5, 3 severe 56.5 to less than 100, 4 very severe 100 or more litres/m² per spell, described on the figure as the maximum wall spell index derived from BS 8104. Paragraph 5.15 makes the zone the gate on cavity fill; 5.16 gives the two modifiers (add one for a hillside or a funnelling valley, subtract one where the wall does not face the prevailing wind), which the Location box states but does not apply. **What is still not implemented: Table 4**, "Maximum recommended exposure zones for insulated masonry walls", which crosses insulation method and minimum cavity width against external finish and gives the highest zone each may be used in. The per-zone advice here is read off its facing-masonry columns only. **What to check:** whether a later edition supersedes this one, and Table 4's own footnote and the BRE Report 262 guidance paragraph 5.16 points to | The zone drives guidance, never a calculated number. Without Table 4 a build-up that the document restricts gets advice to go and check rather than a verdict, and a reader who does not check could fill a cavity the document would not let them fill |
| V35 | **Which way round the ±30° rule goes, and so where a roof stops being a roof** | `engine/src/pitch.ts` `PITCH_TREATED_AS_VERTICAL_DEGREES` | BS EN ISO 6946 tabulates surface resistances by the direction of heat flow, and the horizontal column applies within ±30° of the horizontal plane. Heat leaves normal to the face, so a roof pitched θ from horizontal sends it out at (90 − θ), and the switch to a wall's figures falls at a **pitch of 60°**, not 30°. **What to check:** the clause and table in BS EN ISO 6946:2017 that states the rule, and whether it is expressed there as a direction of heat flow (as implemented) or as an inclination of the surface, which would move the switch to 30° and put every ordinary pitched roof on a wall's R<sub>si</sub>. The guide text in this tool previously stated it the other way round, which is how easily it goes wrong. The three resistance values themselves carry their own TODO in `constants.ts` | Rsi moves between 0.10 and 0.13 m²K/W, worth about 2 % of a 0.15 W/(m²·K) roof and more on an uninsulated one. It also changes the air-layer column for any cavity in the build-up. It does **not** change the Approved Document L category, which comes from what the element is |

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
| C5 | Approved Document L limits are shown only for England, only for dwellings (Volume 1), and only for opaque elements; the renovation rows quote column (b) and, for walls, the weaker cavity-insulation figure of 0.55 | `engine/src/partL.ts` | The U-values themselves are transcribed from two published editions that agree, so they are not in doubt. What is a choice of ours is the scope: Wales, Scotland and Northern Ireland set their own standards, Volume 2 covers non-dwellings, column (a) is a trigger for doing work rather than a standard the finished element meets, and quoting the weaker wall row keeps the check from being stricter than the rules. A build-up judged against the wrong jurisdiction or the wrong table would read as compliant when it is not |
| C6 | The summary strip gives a pass/fail against a cited limit or nothing at all — there is no poor-to-excellent rating on any metric | `apps/web/src/components/SummaryStrip.tsx` | Approved Document L defines a maximum, not a scale, and no standard we can cite bands U-values, mass, heat capacity or S<sub>d</sub> into quality grades. A five-step rating bar would put invented thresholds in the most prominent place on the page and make them look like the standards beside them |
| C7 | Dynamic properties of a **bridged** element are calculated separately for the unbridged and bridged sections, and the headline figures are the unbridged section's; the two are never area-weighted | `engine/src/dynamic.ts` `calculateDynamicProperties` | BS EN ISO 13786 is a method for plane, continuous layers. Area-weighting complex transfer matrices is not something the physics licenses, and the two sections differ in stored heat as much as in resistance — a softwood stud is ~800 kJ/(m³·K) against mineral wool's ~29. Both sections are reported with their area fractions so the spread is visible, and a warning says the combination is ours |
| C8 | A layer with no density or specific heat is treated as storing **no** heat in the dynamic calculation, rather than being given an assumed value | `engine/src/dynamic.ts` `toSlab` | Guessing a density would put an invented number into κ, which is the figure SAP 10.3 consumes. Treating it as massless understates thermal mass, which is the safe direction for an overheating assessment, and the affected layers are listed in `layersTreatedAsMassless` with a warning so the shortfall is visible rather than silent |

## 4. Materials

**10 of 23 records now have their thermal conductivity traced to a clause**, and 10
more have their specific heat capacity cited with λ still open. Three are entirely
unattributed. The picker shows this per material as a marker — filled green for cited,
an asterisk for evidenced, amber for partial, dashed outline for open — so an unchecked
figure cannot pass for a checked one on screen.

**Evidenced (∗) is a third state, added deliberately.** It means the conventional value,
agreeing across every independent public source consulted, *not* read from the standard
that governs it — believed right, not verified. It exists because the middle ground was
being hidden: filing a value that every source agrees on alongside pure placeholders
says less than is actually known. The bar is **good enough to model with, not good
enough to submit**, and it is explicitly *not* a way to retire a row here — an evidenced
value stays on this list until someone reads the clause and confirms or corrects it.
`unverifiedMaterialIds()` counts it as outstanding for exactly that reason, and a test
asserts an evidenced record can never be reported as cited.

What closed them was **BR 443 (2019)**, which BRE publishes and CIBSE hosts openly. It
states outright:

- brick, outer leaf of a cavity wall λ 0.77, inner leaf λ 0.56 (§3.6)
- reinforced concrete, 1 % steel, λ 2.30; concrete screed λ 1.15 at ρ 1800 (§3.7)
- gypsum plasterboard λ 0.21 standard wallboard to 700 kg/m³, λ 0.25 higher density to
  900 kg/m³ for acoustic or fire-resistant board (§3.8) — the database now carries both
  grades, where it previously had one entry mislabelled as generic
- softwood λ 0.13 at 500 kg/m³, plywood λ 0.13 at 500, OSB λ 0.13 at 650,
  particleboard and fibreboard λ 0.14 at 600 (§3.9)
- specific heat capacities: brick, concrete and stone 840; gypsum, plasters, renders
  and plasterboard 840; timber 1600; plywood 1700; mineral wool, EPS and XPS 1450;
  rigid PU foam 1800 (§16)

**Still open, and what would close it:**

- **λ for the blocks, plasters, renders, tiles and insulation.** BR 443 defers to
  BS EN ISO 10456 tabulated values and to manufacturers' declared values. ISO 10456's
  Clause 8 (Tables 3, 4 and 5) is the source; the free preview stops at page 6, so a
  licensed copy is needed. Insulation λ is product-specific and declared under the
  relevant harmonised standard in any case (BS EN 13162 mineral wool, 13163 EPS, 13165
  PIR, 13171 wood fibre), so a generic figure can only ever be a placeholder.
- **μ for everything — now carried as evidenced, not silently.** Neither BR 443 nor
  anything else consulted gives vapour resistance factors; ISO 10456 Table 3 does,
  including whether the dry or wet value applies. **This matters more than it used to**:
  μ now drives the interstitial condensation verdict, not just a displayed number.

  Until now every record carried a μ with **no provenance statement of any kind** — a
  number with nothing said about where it came from, which is the one thing this file
  exists to prevent. All 23 now state it: the conventional value for the material,
  agreeing across the public sources consulted, not read from the clause. Two caveats
  travel with them. ISO 10456 Table 3 gives μ as a **dry-cup and wet-cup pair**, and we
  carry a single figure, so even a confirmed value leaves the question of which of the
  two applies — for softwood the two differ widely enough to change a result. And for a
  membrane the number that matters is the declared S_d to BS EN ISO 12572, which comes
  from the product rather than from a generic μ at all.

  *Searched and not found (2026-09).* Every trail for μ ends at a copyrighted standard
  with no lawful free full text, so this is a licence to buy rather than a search to
  repeat:
  - **ISO 10456:2007** — the preview runs to page 6 and stops at clause 7.5; Clause 8,
    which holds Tables 3–5, starts on page 8. ISO's own Online Browsing Platform
    returns HTTP 403 for it.
  - **EN 12524:2000** — the predecessor whose tables ISO 10456 adopted. Withdrawn, and
    no more freely available than its replacement.
  - **EN 1745:2020** — the tabulated masonry λ values are in Annex A; no preview of the
    SIST, DIN or NSAI adoptions reaches the annexes.
  - **BS 5250 Annex E** — the UK route to the same data, equally licensed.
  - Public-sector documents do not fill the gap the way they did for air layers:
    Malta's Technical Document F tabulates λ, ρ and c with a source column but **has no
    μ column at all**, and the Scottish technical handbook simply refers the reader to
    BS 5250.
  - The one academic option, Anderson's water-vapour-resistivity literature survey in
    *Matériaux et Construction*, is paywalled, and a 1970s survey would not be a
    standards citation even if it were open.

  Copies of the EN 12524 and BS 5250 tables **are** circulating free, but every one
  found is either an outright piracy site, an unauthorised third-party rehost, or a
  competing calculator's bundled material database. None is usable here: two of those
  three are off limits under the clean-room rule regardless of what they contain, and
  citing any of them as "ISO 10456 Table 3" would assert a citation we have not read —
  exactly the guessed citation this file exists to prevent. **μ therefore stays
  unsourced by decision, not by oversight.**
- **ρ for most records**, which BR 443 gives only where it states a λ against a density.
- For membranes the useful quantity is the declared S_d to BS EN ISO 12572, not λ.

**No material value here should be used for a submitted calculation until its row is
closed.**

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
| `gypsum-plasterboard-dense` | Gypsum plasterboard, acoustic or fire resistant | 0.25 | 900 | 840 | 10 | λ and ρ from BR 443 (2019) 3.8, c from BR 443 (2019) 16. Carries the same λ and ρ as the standard board while taking the **840 J/(kg·K)** specific heat rather than 1000 — check that this is right, since a board sold for acoustic or fire performance is denser in practice and BR 443 3.8 may not intend its figures to cover it. μ evidenced, not read: confirm against BS EN ISO 10456:2007 Table 3. |
| `gypsum-plaster` | Gypsum plaster, dense | 0.57 | 1300 | 1000 | 10 | Check against BS EN ISO 10456:2007 Table 3, which tabulates gypsum plaster by density. |
| `plaster-dabs` | Plaster dabs (dot and dab adhesive) | 0.43 | 1300 | 840 | 10 | **λ and c are cited**: BR 443 (2006) 4.7.1 for the conductivity, BR 443 (2019) §16 for the specific heat. **ρ is not.** BR 443 gives a dab's conductivity, thickness and area fraction but no density, so this carries set gypsum plaster's 1300 kg/m³ on the grounds that a dab is set gypsum plaster. Do not take the figure off an adhesive datasheet without checking what it measures — those quote the dry powder in the bag, around 500 kg/m³, which is not the set material. Deriving one from a coverage rate (25 kg over 4.2 m²) needs assumptions about dab geometry that make it no better than the stand-in. ρ affects the dynamic properties only. μ evidenced, as for gypsum plaster |
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
  **BR 443's detailed fastener route is now implemented; its approximate route is not, so a UK U-value from this tool is
  incomplete wherever insulation is mechanically fixed through.**
- BS EN ISO 13788 monthly interstitial condensation and its climate data.
- DIN 4108-3 Glaser as an alternative method.
- BS EN ISO 13786 dynamic properties (areal heat capacity kappa, decrement factor,
  time shift) needed by the SAP 10.3 tool.
- BS EN ISO 10211 two-dimensional thermal bridges.
- BS EN ISO 13370 ground floors.
