# Agrivoltaic Garden Designer: Reconciled Decision Record

Authoritative. Where a research report conflicts with this file, this file wins.
Source reports: `02-agrivoltaics-science.md`, `03-solar-engineering.md`,
`04-horticulture.md`, `05-tek-agroecology.md`.

## 0. Gate

Product does not exist. Nearest analogs are B2B/utility-scale (Spade, Serida, NREL InSPIRE,
PVsyst agrivoltaic templates). No consumer tool combines 3D design + PV shade physics +
location-based plant recommendation. Proceed.

## 1. Product decisions (user-selected)

| Axis | Decision |
|---|---|
| Architecture | Static frontend + thin Cloudflare Worker proxy/cache |
| Geo scope | Global |
| Light sim | Full annual DLI map |
| v1 scope | 3D canvas, plant recommender, auto-layout optimizer. Reports deferred to v1.1. Superseded: the optimizer went with the dock in Record 17; the layout search of 10c stands |

## 2. Conflicts resolved

### 2.1 Ground shading model: polygon projection, not `infinite_sheds`

the solar geometry document proposed the analytic 2-D infinite-row view factor. the agrivoltaics document rejects it because at
garden scale edge rows dominate and finite arrays need explicit polygon projection
(Zainali et al. 2023, Applied Energy 339:120981; R^2 0.99-1.00 vs PVsyst, 0.3% daily error).

RESOLUTION: explicit per-panel polygon projection along the solar vector is the production
model. `pvlib.bifacial.infinite_sheds.vf_ground_sky_2d` is a **unit-test oracle only**, valid
solely for the degenerate infinite-row case. Do not ship the 2-D form on any user path.

SCOPE, added later because the sentence above reads wider than it is: this governs the **ground**
light map, which is what the sentence was about, and there `vf_ground_sky_2d` is an oracle only.
The **PV chain** is a separate surface and does still ship infinite-row formulations on the user
path: `rearPoaWM2` takes the unshaded ground fraction as `1 - GCR` (Marion et al. 2017) and
`rowSelfShadeFraction` shades every row alike, front row included. Both approximations lean the
same way at garden scale, and it is the unflattering way: a three-row array is nearly all edge, so
the true rear-side gain is **understated** and the true row-shading loss **overstated**. Measured
on the shipped default array the second is negligible (0.13% of the year at a 9 m pitch, which is
very open); the first is not quantified and is a known limitation, not a resolved decision.

### 2.2 Ray tracing rejected

`bifacial_radiance` measured 12.7-88 h vs 2-4 min for view-factor with no annual-aggregate
accuracy gain (Grommes et al. 2023, EPJ PV 14:11). Radiance/Ladybug are validation references,
never runtime dependencies.

### 2.3 Sky model shared between PV plane and ground

Perez 1990 (`allsitescomposite1990`) for plane-of-array transposition, chosen because it is the
same sky model behind Radiance `gendaymtx`. PV yield and the ground DLI map must read one sky
radiance distribution, not two.

### 2.4 Solar position: NREL SPA in sim, SunCalc in UI only

SPA (Reda & Andreas, NREL/TP-560-34302) ported from `pvlib/spa.py` (BSD-3), validated to
<0.001 deg. Justification is accuracy, not dogma: 0.05 deg declination error moves a 4 m
structure's shadow tip ~0.4 m at 5 deg elevation = 3 cells on a 12 cm raster. Cost is 3-8 ms
for 8760 evaluations baked into a Float32Array.

SunCalc is permitted for sunrise/sunset/twilight/moon chrome only. It exposes no air mass,
radius vector, or refraction control.

Keep geometric elevation (shadow casting) and refracted elevation (horizon UI) as separate
values. Azimuth must use the `atan2` form or afternoon shadows mirror.

### 2.5 Decomposition is an optional adapter

Open-Meteo, PVGIS, NSRDB and CAMS all ship GHI+DNI+DHI. Implement DIRINT (hourly), Engerer2
with Bright & Engerer 2019 coefficients (sub-hourly), Erbs (fallback) behind an adapter that is
inert when the source provides all three components.

### 2.6 Primary plant filter is DLI, not hardiness zone

the horticulture document's core claim, accepted. USDA zones encode winter minimum temperature only and are a
category error for annual vegetables. Hardiness gates perennials; chill gates fruit; GDD-vs-
season gates annuals; **DLI gates everything** and is the discriminating variable this product
uniquely computes.

### 2.7 Under-panel air and soil temperature: not modeled, and that is the finding

A common expectation is that beds under an array run hotter with fewer frost cycles,
warm enough to grow crops the region cannot otherwise support. The mechanism behind half of that
is real and is now shipped as a qualitative reading (§2.7a); the conclusion is not, and the
temperature model it would need is deliberately absent.

RESOLUTION: no under-panel air or canopy temperature is derived, and no crop gate reads one. Doc
02 §3.2 is the reason. Air-temperature effects **contradict each other across climates** in the
primary literature: ~1 °C cooler by day and ~0.5 °C warmer at night in semi-arid Arizona
(Barron-Gafford et al. 2019), *higher* under the array in temperate Germany (Weselek et al. 2021),
significantly different but "magnitudes smaller" than simulations predicted in Oregon (Hassanpour
Adeh et al. 2018). The one consistent result is **soil cooling in summer**, which is the opposite
sign to the expectation that prompted this. A model whose sign flips by site is not a model this
app can put behind a planting date.

Two consequences a reader is likely to get backward, recorded because they are the reasons this
is not merely "not done yet":

- **Shade cuts daytime warming as surely as it cuts night-time cooling.** A heat-and-light-limited
  crop is limited by accumulated degree-days and DLI, and an array reduces both. "Fewer frosts"
  therefore does not mean "a longer, warmer season", and it emphatically does not mean a
  region can now finish a crop it could not finish before. The frost reading in
  `src/recommend/frost.ts` is worded and tested to refuse that inference.
- **Milder nights reduce chill accumulation.** `chillGate` gates perennials on the site's chill,
  and any "panels keep it warmer" adjustment would extend the season and quietly fail the fruit
  trees. The direction is stated in the frost caveat and is asserted in `frost.test.ts`.

What would change this: a measured frost-margin or degree-day figure for a bed under an array. Doc
02 §3.6 searched and found none in any accessible source, in degrees or in damage incidence.

### 2.7a Sky view factor is reported; nothing is derived from it but words

The bake has computed a per-cell sky view factor from the beginning, for the diffuse light and the
ground-to-module inter-reflection. It is now aggregated onto `BedLight` and read by
`src/recommend/frost.ts`, which states the geometry and names the direction: less sky in view is
less longwave loss on a still clear night, the mechanism Oke 1981 establishes for street canyons
and the one a frost cloth uses. It says explicitly that this is no help against advective frost
(Snyder & de Melo-Abreu 2005) and it claims no temperature. Site frost dates, degree-days and
chill are untouched.

## 3. Physics constants and formulas

- PAR fraction of GHI: 0.45 by energy, user-adjustable 0.42-0.50 (Meek 1984; Britton & Dodd
  1976; Jacovides 2004 measured 0.451-0.456, to 0.501 hourly overcast).
- Photon conversion: 4.57 umol/J in-band, ~2.06 umol/J composite on broadband.
- `DLI (mol/m2/d) ~= GHI (MJ/m2/d) x 2.06`, or `x 7.4` for kWh/m2/d.
- Inter-reflection (only material for white backsheets, 3-8% in the shade strip):
  `E / (1 - rho_g (1 - SVF) rho_m)`.
- Penumbra: **the 7.5 cm figure was WRONG by 2x.** The sun's 0.533 deg angular diameter is
  already the full limb-to-limb angle, so someone doubled it for "both limbs" and double
  counted. Correct value at 4 m is `h*tan(0.533 deg)` = **3.72 cm**; 7.5 cm corresponds to
  8.1 m. The original also ignored elevation dependence: divide by `sin^2(alpha)`, giving
  14.9 cm at 30 deg elevation. The "ignore for annual DLI" conclusion still holds, but for a
  different reason than we recorded. Derived from geometry, not cited.
- Inter-reflection 3-8% for white backsheets: **UNVERIFIABLE.** The radiosity formula itself is
  valid two-surface theory, but no PV paper states it and the 3-8% figure appears nowhere.
  Marion 2017 was checked and is NOT the source. Mark unsourced in the UI or drop the range.

## 4. Resolution requirements

- Timestep <= 15 min, 5-10 min preferred. Beam shadow bands sweep ~0.25 deg/min; hourly steps
  smear cell-level extremes.
- Ground grid <= 0.25 m cross-row, 0.1 m at bed scale.
- Weather input must be a **TMY**, never a single year. The sign of the shade effect flips
  between normal and drought years (Weselek 2021 potato -20% to +11%; Amaducci 2018 corn gains
  only under rainfed stress).

## 5. GPU pipeline

Cumulative-sky daylight coefficients (Radiance/Ladybug method): factorize time-invariant
visibility from space-invariant weather.

- Reinhart MF:2 = 577 sky patches (Tregenza 145 for interactive preview).
- Separate sun direction set. **Never bin the beam into 6 deg patches.**
- Dedupe 8760 h x 4 sub-steps onto a 2 deg grid -> ~600-900 unique directions.
- MEASURED, superseding the 0.55 s estimate: at 0.12 m cells (284x299 = 84,916 cells, 40
  panels, MF:2, 4 sub-steps) the real pass count is **2146** (1569 binned sun directions +
  577 patches), not ~1300, giving ~429 ms GPU and **~0.9-1.0 s** total. Two causes, both in
  the source docs: 2 deg binning at 15-min sub-steps over a full year yields 1569 unique sun
  directions, not the solar geometry document's predicted 600-900; and a full SPA costs ~6 us/sample in JS, so
  8760 evaluations take ~51 ms, not the 3-8 ms the agrivoltaics document claims. Raising binning to 3 deg or
  dropping to n_sub=2 brings it back into range. Treat 0.55 s as aspirational, ~1 s as real.
- 512^2 RGBA32F accumulation. 12 monthly targets are nearly free.
- WebGPU compute ray casting where available (~30 ms); WebGL2 shadow maps as the baseline.

## 5b. Corrections found during implementation

- **The solar geometry document section 3.2 backtracking formula is wrong.** It is written
  `acos(min(1, (P/W) cos psi))`. Deriving the shade-free criterion from the same section's
  shadow-width expression gives **`sin psi`**, which matches pvlib's `cos(tracker rotation)`
  since rotation = 90 - psi. `sin psi` is what is implemented. Do not "fix" it back.
- **Tracking arrays are baked at their peak-elevation pose.** The daylight-coefficient
  factorization requires time-invariant geometry, so fixed tilt is exact and tracking is an
  approximation. This is a real accuracy limit and must be disclosed in the UI.
- **Engerer2 currently uses Haurwitz clear-sky GHI** as a v1 placeholder. Ineichen-Perez with
  Linke turbidity is the v2 upgrade.
- **`'psa'` and `'grena3'` solar-position modes throw** rather than return unvalidated physics.
  Only `'nrel-spa'` and `'michalsky'` are real.

## 6. Crop response model

Drive yield from **season-cumulative relative shade ratio (RSR)**, never instantaneous PPFD,
using the nine crop-group non-linear curves of Laub et al. 2022 (Agron. Sustain. Dev. 42:51;
58 studies, 428 points).

- RSR^2 significant (p=0.0015): linear "% shade = % yield loss" is statistically wrong.
- RSR x crop type p<0.0001: crop group is a required input.
- Shade type (panels vs cloth vs nets) NOT significant: proxy data from shade-cloth studies is
  licensed for use.
- Yield anchors at 40% RSR (all nine groups, from Table S2): berries 114.1%, fruits 113.3%,
  fruity veg 102.5%, forages 93.2%, leafy veg 85.8%, C3 cereals 61.9%, tubers/root 60.8%,
  grain legumes 50.4%, corn 45.3%.
- Shade-benefit optima (verbatim): berries to ~30% RSR, fruits ~25%, fruity veg ~20%, forages
  benefit to 25% then tolerant, C3 cereals never benefit but tolerate to 50%.

### Model form and coefficient provenance

`log10(Y/100) = b1*RSR + b2*RSR^2`, RSR in percent, forced through the origin (0% RSR = 100%
yield), so **the intercept is structurally zero for every group**. The reduced model in Table 1
eliminated the RSR2 x crop-type interaction (p=0.3932), so **b2 is shared across all nine
groups** and only b1 varies by group.

b2 = -7.3293e-05 per (%RSR)^2. b1 per %RSR: berries +4.35911e-03, fruits +4.28533e-03,
fruity veg +3.19481e-03, forages +2.16180e-03, leafy veg +1.27197e-03, C3 cereals -2.27979e-03,
tubers/root -2.47235e-03, grain legumes -4.50551e-03, corn -5.65256e-03.

**These coefficients are DERIVED, not published.** Laub publishes no coefficients anywhere:
not in the article, the supplement (which contains only the Fig. S1 caption, Table S1 and
Table S2), or the Zenodo dataset; "Code availability: Not applicable". They were recovered
algebraically from the 162 published Table S2 points plus the verbatim model specification,
and reproduce every point to within 0.07 pp. Independently fitting b2 per group returned
-7.33e-05 for all nine, confirming the shared-quadratic structure.

Provenance rule: cite these as **derived from** Laub et al. 2022, never as quoted from it. The
data must carry this distinction, and the UI must show it.

TRAP: eartharxiv.org/repository/object/7354 is a DIFFERENT paper that merely cites Laub. Its
equations (e.g. `C3 Cereals Y=106.34-0.44X1`) are NOT Laub's. Do not use them.
- Any "shade improves yield" pathway is **gated on a water-limitation flag**. Barron-Gafford
  2019's 2-3x Arizona gains do not transfer to temperate gardens.
- The same pathway is also gated on **the shade the bed actually has**, and that third factor was
  missing until it was caught by a bad example garden. `shadeBenefitBonus` scaled with site heat
  and the water-limitation index alone, so every shade-tolerant crop collected the full bonus
  standing in open sun. Measured at Phoenix on a bed reading 42 mol/m2/d at cumulative RSR 0.02,
  that put **ramps**, an eastern North American woodland ephemeral, at the head of the ranking
  ahead of okra, cowpea and sorghum, which beat it on climate fit 0.840 to 0.700 and lost the
  total 0.710 to 0.715 on a 0.114 bonus they could not receive. The bonus now scales with
  `cumulativeRsr`, which is the axis the Laub curves and `maxDesignRsr` are both written on, so
  it grows with the shade exactly as the yield response it stands for does.

### DLI thresholds (mol/m2/d, min -> target; max design RSR)

| Class | Min | Target | Max RSR |
|---|---|---|---|
| Understory herbs | 2-4 | 4-10 | 60-75% |
| Leafy greens | 6 | 12-17 | 40-50% (tipburn >17 for a month) |
| Forages / C3 pasture | - | - | 45-50% |
| Cane/bush berries | 15 | - | 30-35% |
| Strawberry | 25 | - | 15-20% |
| Brassicas | - | 12-17 (inferred) | 30-40% |
| Root/tuber | none established | - | 15-25% |
| Solanaceae | 10-12 | 20-30 | 20-25% temperate, to 40% arid |
| Cucurbits | - | 20-30 | 20-30% |
| Alliums | none established | - | <=15% (bulb thickening light-limited) |
| Legumes (grain) | - | - | <=10% |
| C3 cereals | - | - | <=15% |
| Corn / C4 | - | - | <=10% |

Strawberry is split out from Laub's lumped berry group on the authority of Widmer et al.'s
21-site Swiss study, the only source expressing agrivoltaic limits directly as DLI.

## 7. Uncertainty policy (product-level, non-negotiable)

The dominant error is agronomic, not optical. Laub's 95% **confidence** interval for fruity
vegetables at 40% RSR spans 67.2-156.1% around a 102.5% point estimate. An optics model
accurate to 1% feeding that is false precision.

TERMINOLOGY, do not conflate: Table S2 tabulates 95% CONFIDENCE intervals. Laub computes
prediction intervals but only draws them as gray lines in Fig. 3 and never tabulates them, so
we do not have them. Label every band in the UI as a confidence interval. The paper's own
caveat, verbatim: "uncertainties due to random plot scale effects are large, while at country
or continental scales the mean response to shading, represented by the confidence intervals,
is the more valid estimator." A single-garden user is at the plot scale, i.e. the regime the
authors say is MORE uncertain than the CI implies. Say so in the UI.

CIs are symmetric on the log10 scale, so interpolate bands in log space, not linearly.

- Never render a single-point yield number. Render bands.
- Attribute the band to the crop term explicitly in the UI.
- Treat seasonal cumulative PAR as +/-10%.
- Most per-crop DLI values are Tier C inferences. Ordinal ranking is reliable; absolutes are
  provisional and must be labeled as such.

### The DLI gate rests on thinner evidence than its central role implies

A systematic hunt (2026-07-30) for per-crop DLI figures found that **12 of 18 crops checked have
no mol/m2/d figure anywhere in accessible peer-reviewed or Extension literature**: all seven
temperate tree fruits (apple, pear, plum, both cherries, apricot, fig), plus melon, watermelon,
tomatillo, winter squash, pumpkin and hot pepper. Okra has only an experimental treatment
level, not a target. Orchard literature expresses light as **% of full sun or instantaneous
PPFD**, never as a daily integral.

Three consequences, all of which must reach the UI:

1. **Those values are class-level inferences, marked Tier C.** They are not cited, because no
   source exists. Several previously cited FAO ECOCROP, which contains no DLI values at all:
   that was a false attribution and is fixed.
2. **The one credible Extension source is transplant-only.** Purdue's 10-15 and 15-20
   mol/m2/d ranges are for greenhouse plug production, not mature garden plants. Using them as
   garden targets is a different error from the ReduSystems 22, but still an error.
3. **The concept itself is contested by Extension.** Erik Runkle (MSU), whose vine-crop figure
   we now cite for tomato, pepper and cucumber, writes in "DLI Requirements": *"In my opinion,
   there is no such thing as a DLI requirement"*, because guidelines are subjective, situational
   and vary with shade tolerance. We use DLI as the primary gate, so this must be disclosed
   rather than buried. Present DLI thresholds as design guidance, never as physiological limits.

**SHIPPED 2026-07-30: the three consequences above now reach the UI.** `src/ui/dli.ts` derives
the evidence of whichever threshold the light gate applied (`dli-minimum`,
`dli-disorder-ceiling`, `max-design-rsr`) from the crop's own `Cited` record, so the tier and the
`inferred` provenance are read off the data and cannot drift from it. It renders as
`readout-recommendation-dli-evidence-{cropId}` beside the limiting factor in the ranking and as
`readout-calendar-dli-evidence-{cropId}` at the calendar's light gate, each carrying
`data-tier`, `data-provenance` and `data-class-inference` so a crop excluded on an unmeasured
number is distinguishable from one excluded on a measured one. The full disclosure is
`panel-dli-evidence` on the sources step, reached inline from the crop step via
`panel-dli-evidence-inline`. Tone is deliberately calibrated, not apologetic: the ordinal
ranking is stated as reliable in the same breath as the absolutes are called provisional.

**MISSING CITEKEY, not invented.** Runkle's "DLI Requirements" column, the source of "in my
opinion, there is no such thing as a DLI requirement", has no entry in `CITATIONS.csl.json`. The
disclosure quotes it under its own title, says plainly that it carries no citekey, and cites
`runkle2011-vegetable-dli` ("Lighting Greenhouse Vegetables") only for the vine-crop figure that
work actually backs. Add the column to the corpus and the quote can be attached properly.

Vendor-marketing origin confirmed for the 22: ReduSystems, "An adult tomato crop requires at
least 22 mol/m2/d for good productivity", citing no primary literature. Hydroponics and LED
vendor pages republish 22-30 figures with no citation, which is how it spread.
- Faust & Logan and Zhang et al. 2025 have now BOTH been retrieved, and both were being
  misused:
  - **Faust & Logan contains no per-crop DLI table at all.** The "10-12 minimum" we attributed
    to it actually traces to Purdue HO-238-W. Re-attribute.
  - **Zhang et al.'s "tipping point" is ~2 ha of system size, not 50% shade.** The shade result
    is a segmented regression in a 50-60% band (p<0.05), and the literal 50% figure is Zhang's
    own citation of Beck et al. 2012, not Zhang's finding.

### RELEASE BLOCKERS

**RESOLVED 2026-07-30: MA SMART downgraded from CHECK to ESTIMATE.** `Verifiability` now has
the single value `'estimate-only'`, `pass`/`fail` criterion outcomes were renamed
`meets`/`misses`, a new `approximate` outcome carries a window disclaimer, and
`ComplianceOutcome` is two-state (`meets-expedited-parameters` /
`requires-exception-request` / `indeterminate`), so a determination is unrepresentable.
Citations moved to `ma-225-cmr-28` plus `ma-doer-shading-analysis-tool`.
`src/ui/compliance-language.test.ts` pins that no rendered string contains compliant,
non-compliant, pass, fail, approved or rejected, and that every outcome has a label.

Growing Season Hours is implemented as a MONTH restriction (March-October) with the hour
window disclosed as not applied, because `DliRaster` resolves months, not hours. Resolving
this properly requires hour-of-day accumulation in the raster.

**Also found and fixed: `nameplateAcKw` was a mislabeled DC quantity**, computed from module
watt-peak. Renamed to `nameplateDcKw` with a `KilowattsDc` brand. The MA 5 MW **AC** cap and
the 2:1 DC:AC ratio are now `not-applicable` with the reason "requires an inverter model",
rather than silently comparing a DC number against an AC threshold. The 7,500 kW DC ceiling
is a real check. See `the grid document`.

STILL OPEN:

1. **FALSE CITATION.** "at least 22 mol/m2/d" for tomato is verbatim ReduSystems vendor
   marketing, but carries legitimate Extension citation IDs in
   `src/data/catalog/citations.ts`. A real source attached to a number that did not come from
   it is worse than an uncited value. Remove or re-source. Resolved: the vine-crop rows cite
   `runkle2011-vegetable-dli` at 15 / 20-30 and the 22 is deleted; the horticulture document follows (record 23).
2. **INTERNAL CONTRADICTION on strawberry DLI minimum**: the horticulture document says 10, this record and
   Widmer say 25. Resolve before either number reaches a filter. Resolved with a source on each
   side in record 23: the gate uses Widmer's 25, and the horticulture document follows.
3. Remaining base temperatures and DLI values traceable to trackgdd.com, hydroponics blogs and
   ReduSystems. Sweet corn 10/30 C is confirmed via NDSU and the cool archetype 4.4 C is
   defensible, but the horticulture document's 0 C lower bound is unsupported.

## 8. Compliance overlays

**REVISED after primary-source verification. Nothing here is a compliance CHECK. Everything is
an ESTIMATE.** See `the verification document` for the evidence trail.

Massachusetts SMART, all four numbers confirmed verbatim against primary text (50%, 8 ft fixed
measured at the lowest panel point, 10 ft tracking measured at horizontal, 5 MW AC) but the
regime cannot be self-verified, for three independent reasons any one of which is sufficient:

1. DOER mandates **its own** tool: "Applicants shall use the Shading Analysis Tool provided on
   the Department's website." Our result has no standing regardless of accuracy.
2. The test window is **Growing Season Hours**, defined in 225 CMR 28.02 as April-September
   9 AM to 6 PM and March/October 10 AM to 5 PM. **Our annual DLI map is the wrong aggregation
   window.** Producing this requires a separate accumulation.
3. Every parameter is waivable under 28.07(5)(b)3.b.iv, so pass/fail is not a property of
   geometry.

Also corrected: the governing regulation is **225 CMR 28.00** (SMART 3.0, filed August 2025),
not 225 CMR 20.00 which is legacy. "ASTGU" is now "Dual-use Agricultural STGU". The 50% test
applies to "every square foot of land directly beneath, behind, and in areas adjacent to and
within the STGU's design", i.e. WIDER than the array footprint. Additional constraints we had
missed: 2:1 DC:AC ratio and a 7,500 kW DC ceiling; the tracker 10 ft may drop to 8 ft
conditionally.

**Required UI output is two-state and must never say compliant/non-compliant:**
"meets the expedited design parameters" / "would require an exception request".

DIN SPEC 91434: all seven of our claims verified correct against the full 26-page text,
including all three negatives (no light-homogeneity threshold, no GCR cap, no minimum row
spacing; clause 6.4.4 actively disclaims row spacing). One addition: the 2.10 m clearance is
**Category I only**; Category II has no clearance floor at all.

Estimate-only (require field agronomy, label as such):
- Germany DIN SPEC 91434: 66% of reference yield, 2.10 m, <10%/<15% area loss. Contains **no**
  numeric light-homogeneity threshold, **no** GCR cap, **no** minimum row spacing.
- Japan MAFF: 80% of regional average yield, 2 m.
- Italy DM 436/2023: >=70% area agricultural, 2.1 m for crops, 60% producibility ratio (not an
  LER>1 requirement).
- France: 90% of a control zone >=5% of area capped at 1 ha, 40% max coverage.

## 9. Data chain

Browser-direct (CORS verified by live curl 2026-07-29): Open-Meteo (primary; only global,
keyless, CORS-enabled, CC BY 4.0 commercial source returning GHI+DNI+DHI), NASA POWER,
Nominatim (1 req/s + UA header), Photon, Overpass, Open-Elevation.

Worker-proxied: PVGIS v5.3 (**explicitly forbids AJAX by written policy**), NREL NSRDB PSM3
(key secrecy). `developer.nrel.gov` was retired May 29, 2026, and the endpoint is now GOES TMY v4.0.0 on `developer.nlr.gov`; PSM v3.2.2 is withdrawn. Cache by lat/lon
rounded to 0.01 deg.

Bundled static: OPHZ PRISM-derived hardiness GeoJSON (~450 m, credit USDA-ARS + OSU),
Beck et al. 2018 Koppen 1 km, FAO ECOCROP (~2568 species), frost normals. No official USDA
hardiness API exists.

**Superseded in part, see docs/STATIC-LAYERS.md.** OPHZ traces the 2012 map and is not bundled;
the official 2023 PRISM grid and the published 5 arcmin Koppen aggregate ship instead. NRCan's
4th edition Canadian zones now ship alongside them, under the Open Government Licence Canada.

### 9a. Hardiness schemes are never crosswalked

A USDA zone is one variable, the mean annual extreme minimum temperature. An NRCan zone is a
score on a seven-variable index (`ouellet1967-woody-zonation`, reinterpolated by
`mckenney2001-canada-zones` and `mckenney2025-canada-zones`) that includes frost-free period,
summer rainfall, maximum snow depth and maximum wind gust. The two disagree in both directions
depending on which term dominates locally, so no table maps one onto the other and none may be
written.

This is enforced by the type rather than by review. `HardinessRating` is a discriminated union:
`TemperatureHardinessRating` carries `extremeMinTempC`, `CompositeHardinessRating` declares
`extremeMinTempC?: never` and carries the zone plus the index terms the source supplies.
Assigning a temperature to an NRCan rating is a compile error, pinned by a `@ts-expect-error` in
`src/types/contract.test.ts`.

Deriving a winter minimum from ERA5 for a Canadian point is **not** a crosswalk: it measures the
quantity USDA measures, from reanalysis, and is what the code already did wherever the PRISM
grid has no coverage. So a Canadian site carries two independent ratings. The ERA5-derived
temperature rating gates, because `siteExtremeMinC` reads only temperature schemes. The NRCan
zone informs and is displayed as its own readout, never blended into a single number, with copy
saying the two systems are not comparable.

Licensing: PFAF and Permapeople are CC BY-SA (viral) and must be isolated behind a boundary or
excluded. Trefle is unusable (repeated shutdowns). No open, well-licensed horticultural
attribute DB exists: the ~200-crop curated table from public-domain Extension publications is
the ownable asset.

## 10. Recommendation pipeline

0. Site resolution (geocode -> lat/lon -> elevation, climate normals, TMY)
1. Hard climate gate: hardiness (perennials), chill portions (fruit), GDD vs season (annuals)
2. **Light gate**: per crop x bed x month against the crop's own growing window. Bonus where
   shade-benefiting AND heat-days high
3. Soil / water
4. Mature-footprint fit
5. Interactions: rotation hard-constraint, companions soft-score
6. Rank, always exposing the limiting factor

Chill: compute Chilling Hours, Utah Chill Units, and Dynamic Chill Portions separately.
Luedeling's global comparison shows Dynamic is superior and that the three are **not
interconvertible** (CH/CP ratio spans 0-34).

ECOCROP suitability uses trapezoidal membership with min-across-parameters, which yields the
limiting factor for free.

### 10b. Crop-vs-crop compatibility and polyculture suggestion

Stages 1-6 compare one crop against the SITE. Nothing compared two crops proposed for the same
bed, so the tool would co-plant blueberry with a brassica at pH 6.5-7.0, which is a real
horticultural error. `src/recommend/compatibility.ts` adds the missing axis. It runs AFTER the
per-crop pipeline and never re-gates a crop.

Eight terms, each computed from data already held, each carrying its own verdict, citations and
evidence grade, each reported separately:

| Term | Source | Hard conflict when |
|---|---|---|
| Soil pH | intersection of the two ECOCROP `soilPh` trapezoids | tolerated ranges disjoint, OR optima disjoint and either crop's absolute span is within `HARD_PH_ENVELOPE_WIDTH` |
| Water regime | FAO-56 Table 22 depletion fraction `p`, plus `droughtPenaltyFor` | never; one bed, one schedule, so a wide gap is a management warning |
| Root stratification | `RootProfile` depth and stratum | never |
| Canopy tier | `assignCanopyTier`, the same function the optimizer scores stratification with | never |
| Light overtopping | Beer-Lambert on the taller crop's LAI and k, weighted by its bed area share, against the shorter crop's `dliMin` | the shorter crop falls below its own DLI minimum |
| Shared pest or pathogen | `RotationConstraint` by family | the shared family carries a rotation constraint |
| Documented companion | `ScorableCompanionRule`, via `ruleAppliesInContext` and `ruleEffect` | never |
| Allelopathy | grade C, D and E rules of an allelopathy kind | never: warns, never scores |

The pH rule is the one that needed a decision. Disjoint optimum bands are reconcilable by
compromising the soil ONLY where both envelopes are preferences. Blueberry's is not: it is the
only crop of 163 optimizing below pH 6.2 and its absolute span is 4.0-6.0, which section 3 of
`src/recommend/stages/soil-water.ts` already treats as physiology rather than preference. So
blueberry beside a brassica is refused outright, and the refusal names the pH 5.7 compromise
neither crop can actually live at.

Suggestion generation (`src/recommend/suggest.ts`) takes required, preferred, avoided and
excluded crops as a `PreferenceSet` and returns ranked COMBINATIONS. Space is a first-class
constraint: every crop gets one plant's worth of bed at catalog spacing before anything gets a
second, and a combination whose floor exceeds the bed is reported as not fitting with the
shortfall in square meters. It is never silently truncated. A required crop the bed can't grow
refuses the whole set with its limiting factor rather than being swapped for something else.
Yields stay banded throughout; only the ranking scalar collapses a band, and
`src/ui/point-estimate.test.ts` pins the modules allowed to do that.

TEK design rule 1 (vertical stratification, Chagga and Javanese) supplies the canopy-tier term
and travels with its attribution in the term itself. Rule 7 (portfolio yield, Haudenosaunee and
Andean) supplies the LER weighting. Neither is merged into an unattributed preset.

### 10c. Array design suggestion (`src/recommend/design.ts`)

`suggestDesigns(answers)` turns `OnboardingAnswers` into a ranked `ScenarioSet`. It exists because
tilt, pitch, clearance, row count and tracking were previously hand-set, which a novice cannot do.

Geometry is DERIVED, never looked up. Tilt is a per-archetype fraction of the site latitude,
anchored on the solar geometry document's `beta ~ 0.85 phi` energy optimum and reduced below it where shadow length
matters (food-first 0.60, balanced 0.75), clamped to the 10-35 deg band already
named by `REFERENCE_MIN_TILT_DEG`/`REFERENCE_MAX_TILT_DEG`. Azimuth is equator-facing from the
hemisphere. The shade budget is `AMBITION_SHADE_BUDGET` (leafy 0.45, mixed 0.30, fruiting 0.18,
read off the max design RSR column of section 6, the fruiting figure set by strawberry) scaled by
`SiteExposure`; each archetype spends a share of it (0.55 / 0.80 / 1.00), and that projected
coverage plus the collector width gives the pitch. Rows and row length come from the plot.
`maxHeightM` is hard, and is spent in the order that costs the grower least: modules up the slope
first, then tilt, then headroom, with each step named in the candidate's own rationale. Clearance
floors are DIN SPEC 91434 Category I (2.10 m) and the MA expedited 8 ft / 10 ft, taken from
`src/sim/compliance.ts` rather than restated.

> **Corrected 2026-09-01, and the direction reversed.** Everything in this subsection between
> here and the `energy-first` paragraph was measured against `panelSnapshot` stepping a fixed
> array's rows perpendicular to the way its modules face, which left them standing shoulder to
> shoulder and shading almost nothing. See *What holds it up* in `crates/agv-sim/README.md`. The
> figures below are re-measured where they say so and **void where they do not**; a figure with no
> date beside it in this subsection came from the broken geometry and must not be quoted.

> **Superseded 2026-09-11 by Record 21.** Every figure from here to the end of this subsection
> was read off candidates whose `rowAzimuthDeg` held the surface azimuth, so the rows ran north
> to south with the panels tilted along their own row. The direction tilt moves the light, and
> the `food-first` rule built on it, are re-measured in Record 21 and are the other way round.

**Which way tilt moves the light on the ground, measured 2026-09-01.** The rationale has now been
wrong about this in both directions, which is worth stating before the answer. It first told the
grower that going below the energy optimum "shortens the shadow on the ground". That was replaced
with the opposite, that flattening "does not brighten the ground, it dims it", and that was
measured against an array that could not exist.

Held at one projected coverage and one row count, season RSR **RISES monotonically as tilt rises**,
so a **flatter panel leaves more light**: **0.0397 -> 0.0876 -> 0.1223 at 20 N**, **0.0412 ->
0.0898 -> 0.1251 at 42.4 N**, **0.0436 -> 0.0919 -> 0.1265 at 55 N**, at 10, 23 and 35 degrees.

The mechanism given for the old claim was also wrong on its own terms, independently of the
geometry. Pitch is `collectorWidth * cos(tilt) / projected`, so cos falls as tilt rises and it is
the STEEPER panel that sits closer to its neighbor, not the flatter one. Holding the projected
coverage fixes how much overhead sky the rows take, so what tilt actually changes is how tall they
stand: a panel tilted `b` rises `collectorWidth * sin(b)`, and that height is what removes the low
sky and lengthens every shadow. Two errors that agreed with each other, which is why reading did
not catch either.

Tilt is therefore still a dial at fixed coverage and the food end is now the FLAT end. Pinned by
`design.test.ts`, which bakes both ends and requires the row count to match so an extra row cannot
be mistaken for a tilt effect, plus a copy test that forbids **both** of the wrong claims by their
exact words.

**It does not point in OPPOSITE directions for food and energy anywhere below about 44.4 N, which
is above every latitude this tool is likely to be used at.** This sentence has now been wrong
twice. It first claimed the opposition outright. It was then narrowed on 2026-09-07 to say the
opposition holds at 42.4 N and not at 20 N, and the sweep that narrowing asked for says 42.4 N was
wrong too: there, steepening costs 19 crops AND 189 kWh, both falling together exactly as at 20 N.
What survives at every latitude measured is the half that matters to a grower: flat is the food
end. What does not survive is the idea that the grower is trading anything for it below 44 N.

**Re-measured 2026-09-07, preview quality (tregenza-mf1, one sun sample an hour, 0.5 m cells),
`balanced`, one row held fixed at both ends:** at 20 N, 141 crops clear the light gate at 10
degrees against 128 at 35, and annual AC runs 9 050 kWh at 10 degrees against 8 315 at 35
(`src/recommend/sweep.bench.test.ts`, block 1). RSR at the same two points is 0.0397 and 0.1223,
matching the figures already given above for this latitude.

The claim these figures were meant to support does not hold at 20 N. Crops and annual AC both
fall as tilt rises here, 141 crops and 9 050 kWh at the flat end against 128 crops and 8 315 kWh
at the steep end: both move the same way. The mechanism: pitch tracks tilt, so a steeper panel
closes its own rows up exactly as fast as it stands taller, and at 20 N the extra irradiance from
facing the sun more directly never catches up with the extra self-shading it buys. Flat is still
the right tilt for a food-first design at this latitude, and at 20 N it costs nothing in
electricity either.

**Swept 2026-09-07 across the latitudes, same quality, same plot, same one row held at both ends
(`src/recommend/sweep.bench.test.ts`, block 4), 10 degrees against 35:**

| Latitude | Crops | Annual AC | Latitude | Crops | Annual AC |
|---|---|---|---|---|---|
| 20 N | -13 | -735 kWh | 42.37 N | -19 | -189 kWh |
| 24 N | -13 | -720 kWh | 44 N | -19 | -44 kWh |
| 28 N | -13 | -637 kWh | 48 N | -19 | +363 kWh |
| 32 N | -12 | -453 kWh | 52 N | -19 | +482 kWh |
| 36 N | -12 | -444 kWh | 56 N | -12 | +607 kWh |
| 40 N | -19 | -317 kWh | 60 N | -12 | +798 kWh |

Crops fall as tilt rises at every one of the twelve, which is the finding that has now survived
three re-measurements: **flat is the food end at every latitude on earth this tool serves.**
Annual AC falls with it everywhere below the sign change, which the block bisects to **between
44.25 and 44.50 N**. So over the whole band from the tropics to the Canadian border there is no
trade to make: the flat end is better for food AND better for electricity, and a grower steepening
an array inside one row count at 42.4 N is giving up both.

Two consequences worth keeping. The energy rule of thumb is falsified more sharply than the
`energy-first` paragraph below already puts it: `0.85 phi` reaches the 35-degree clamp at 41.2 N,
so at that latitude the rule asks for exactly the tilt this sweep measures as the worse one on
both axes. And the thing that actually buys electricity by steepening is not tilt, it is the
row-count step, which the next paragraph measures at roughly double the annual AC for one degree.
Above 44.4 N tilt starts paying on its own account, because the sun is low enough that facing it
squarely finally beats the self-shading a closer pitch buys.

**The reversal is the row spacing, not the panel.** A bare plane-of-array calculation with no rows
in it at all (pvlib, Ineichen clear sky, 42.37 N, south-facing, albedo 0.2) prefers 35 degrees to
10 by 14% over the year, 2 415 against 2 118 kWh/m2, and by 48% over December to February, 485
against 327. So the panel's own angle wants to be steep at this latitude, exactly as the rule of
thumb says, and the annual AC still falls when the array is steepened because the pitch closes up
with it. That is worth knowing before anyone tries to "fix" the sweep result: it is not a claim
that steep panels collect less light, it is a claim about what holding the overhead footprint
fixed does to the rows. It also leaves the height-limit sentence in `design.ts` standing, which
tells a grower that flattening under a height cap "costs some winter electricity"; the winter
term is where the tilt preference is strongest.

**RSR against the projected coverage, re-measured 2026-09-01.** The rationale also claimed the
measured loss "is smaller than the footprint at garden scale because light leaks in from the
sides", and this record then said it could go either way. With the geometry fixed it does not:
across 15 configurations, tilt 10 to 35 on plots from 10 x 40 to 30 x 60 m, the measured plot RSR
came in **between 0.022 and 0.128 against a footprint of 0.165**, always under it. That is what
should be expected of the two quantities, since the footprint is a per-pitch figure under an
infinite-row assumption and the measured ratio is a mean over a finite plot with ends, edges and
a five meter margin of open ground. Both sentences are still gone from the shipped copy.

**Open, and worth knowing:** if the footprint is an upper bound in every case, `ScenarioFlags.shade`
can never refuse a design that was sized inside the budget, which would make that check dead code.
It has not been swept exhaustively. `design.test.ts` pins the bound rather than the old claim.

**The shade budget is checked against the bake, not only spent on the footprint.**
`ScenarioFlags.shade` carries the budget, the measured season-cumulative RSR and whether the one
is inside the other, and the card says so in both directions. This is not decoration: sizing the
projected coverage was the ONLY check there was, and it is a different quantity from what the
grower gets. Pinned twice, once that the verdict follows the measured figure rather than the
sizing, and once on the case that motivated it: `food-first` forced to 30 deg on a 16 x 12 m plot
takes a second row, and its measured RSR comes out above its own footprint with that footprint
still inside the budget.

**The row-count step is still a step, and it still matters more than the tilt fraction.** Row
count is non-decreasing in tilt, because pitch is `collectorWidth * cos(tilt) / projected` and a
steeper panel closes up until another row fits.

**Re-measured 2026-09-07, preview quality (tregenza-mf1, one sun sample an hour, 0.5 m cells),
`food-first`, 16 x 12 m plot:** the step sits at 28 degrees, where `fillPlot` admits a second
row. At 27 degrees, one row, RSR is 0.0522, 140 crops clear the light gate and annual AC is
5 033 kWh. At 28 degrees, two rows, RSR is 0.1041, 121 crops clear and annual AC is 10 042 kWh
(`src/recommend/sweep.bench.test.ts`, block 2).

One degree of tilt here costs 19 crops and roughly doubles both RSR and annual AC. Block 1's
whole 25-degree band, 10 to 35 within one row count, cost 13 crops over 25 degrees. One degree at
the step outweighs the whole band.

`food-first` is derived (`groundLightPlan`) and costs no simulation, because two monotonic facts
settle it and **they now point the same way**. Fewer rows is always less shade, since another row
is more panel over the same ground. And within one row count a FLATTER panel leaves more light,
for the reason above. So the answer is simply the flattest tilt in the band, which is both the
fewest rows and the least shade within a row count, and it is arithmetic rather than a search.

This is the change with the largest user-facing consequence of the whole correction: `food-first`
had been recommending the STEEPEST tilt its row count allowed, which is the shadiest end of its
own band, under a name that promises the most light on the ground.

**Rebuilt 2026-09-07, preview quality (tregenza-mf1, one sun sample an hour, 0.5 m cells),
`food-first`, 16 x 12 m plot, four latitudes:**

| Latitude | Rule tilt | Rule rows | Rule crops | Rule kWh | Derived crops | Derived kWh |
|---|---|---|---|---|---|---|
| 20 N | 12 deg | 1 | 141 | 4 532 | 141 | 4 575 |
| 30 N | 18 deg | 1 | 140 | 4 771 | 141 | 4 867 |
| 42.4 N | 25.4 deg | 1 | 140 | 5 049 | 140 | 4 996 |
| 55 N | 33 deg | 2 | 121 | 11 174 | 140 | 5 273 |

(`src/recommend/sweep.bench.test.ts`, block 3.) The derived tilt is 10 degrees at every latitude
and always one row, because `groundLightPlan` returns the bottom of the band regardless of where
the sun is.

The finding survives. At 20, 30 and 42.4 N the rule stays under the 28-degree row-count step this
plot carries (above), so it costs a food-first grower at most one crop and a few percent of kWh
either way, sometimes in the rule's favor. At 55 N the rule asks for 33 degrees, past the step,
and the second row it admits costs 19 crops, 140 down to 121, for 112 percent more electricity a
food-first design was never asked to generate. The rule reads latitude; the step reads pitch, and
the two have nothing to do with each other.

Only `balanced` still takes a latitude rule, and that is deliberate: its name promises a middle
ground rather than an optimum of anything, so there is nothing about it to falsify. It is the one
archetype whose tilt no measurement is owed.

`energy-first` is the one exception, and it is measured rather than derived (`measuredEnergyPlan`).
Its name is a promise the figures beside it can falsify, and the rule of thumb falsified it. The
kWh figures in this paragraph and the next predate the geometry fix and are **void as numbers**;
the argument they were offered for does not depend on them, since `measuredEnergyPlan` sweeps the
band on the site's own weather at run time and is right by construction whatever the geometry.
On a 16 x 11 m plot at 42.4 N the array at `0.85 phi` (35 deg after the clamp) made **9 711 kWh**
where `balanced` at 31.8 deg made **9 872 kWh** on identical hardware: the design called Energy
first generated less than the one called Balanced. The cause is that pitch here is not independent of
tilt. The shade budget is written as a PROJECTED ground coverage, so flattening the panels widens
the rows by exactly as much as it shortens their shadow, and row-to-row shading falls with it. Swept
a degree at a time the curve is smooth with an interior maximum at **21 deg / 10 027 kWh**, 3.2%
above the 35 deg figure. Separately, a north-south tracker axis turns the rows across the plot, and
on a 3.5 x 2.4 m courtyard that halved the modules the plot could hold (1.72 -> 0.86 kWp) and cost
more than tracking won back.

So `energy-first`'s tilt is the argmax of `runAnnualChain` over whole degrees across the whole
reference band, and tracking is taken only when it measures better than every fixed tilt. The band
is every tilt any sibling archetype can be built at, so `energy-first` can no longer be beaten on
tilt alone. Projected coverage is held fixed across the sweep, so it spends no extra shade: what
moves is the shape of the shadow, not how much of it there is. Ties go to the lower tilt and the
order is fixed, so the search stays deterministic. It costs one PV chain run per tilt and NO light
bake, which is why it is affordable where a whole extra candidate is not. Pinned by
`design.test.ts` on three plot shapes, including one wider than deep and one deeper than wide.

Five archetypes, and the search is capped there: no sweep runs around them, because each
candidate costs a full annual bake, and `ScenarioSet.notConsidered` says so in the first line.
`mounting` filters the offered set and the dropped archetypes are named. `no-array-control` is
always offered.

Evaluation is `PREVIEW_OPTIONS` plus the Growing Season Hours window (one extra weight vector on
the shared direction set, so the MA figure measures the regulated quantity instead of the
March-October month approximation). `evaluatedAt` is therefore always `'preview'`. Measured wall
clock for a full five-scenario run: **~4.5 s** on the `cpu-reference` backend in node at 0.25 m
cells over a 16 x 12 m plot; the browser runs the same bake on WebGL2 or WebGPU.

The land equivalent ratio is `landEquivalentRatio`'s PORTFOLIO sum, the same convention as
`OptimizerResult.portfolio` and TEK rule 7, taken over a fixed six-crop basket
(`DESIGN_BASKET_SIZE`) of the scenario's own top-ranked admissible crops plus the electricity
term. It is not a two-term Dupraz ratio and must not be rendered as one. (`OptimizerResult` went
with the optimizer in Record 17; `landEquivalentRatio` keeps the convention.)

`GeneratedBed.lostToShade` is the per-bed version of the same question, and it is deliberately a
DIFFERENT comparison: each bed against the brightest bed of its own plot, not against the open-sky
control. It needs no second bake, it works identically on a garden drawn by hand, and it is the
question a grower actually asks standing between two beds two meters apart. Subtracting the bright
bed's own light-gate refusals is what makes it mean "the shade cost this", since a crop the site
refuses outright is refused in both. What it cannot say is what the plot gave up to carry panels
at all; that is the plot-level figure below.

`cropsLostToShade` is measured AGAINST the open-sky control, which is baked first: a crop the
site refuses in full sun is not something the panels cost. `confidence` never reaches `high`,
because every path rests on the Tier C crop DLI absolutes of section 7; it falls from `moderate`
to `low` where a scenario adds an approximation of its own (a tracked array, whose pose is baked
at peak elevation; shade past the 40 percent level where Laub's anchors are tabulated; a
water-limited site; or a basket in which every light threshold is a class inference).

Ranking is deterministic: four raw terms (crop retention and light kept, annual AC kWh,
mean shade as an evapotranspiration proxy, and structural simplicity) min-max normalized across
the set and combined with the user's own `DesignObjective` weights, ties broken by archetype
order. No band is collapsed anywhere, so `design.ts` is NOT on the `unsafeBandMidpoint` allowlist.

The ordering being deterministic was never the question worth asking. The question is whether a
GAP is real, and `SCORE_RESOLUTION` answers it by running the same search twice, once at preview
settings and once at `FINAL_OPTIONS`, and reading how far a score moves when the approximation is
lifted. On a 16 x 12 m plot at 42.4 N that is 0.0385, and a community-gardener run separated its top two
by **0.0024**, a tenth of what the bake was moving scores by on that very set. A search that looks
unstable across runs is this, not non-determinism: an order resting on a difference finer than the
numbers under it. Scenarios within `SCORE_RESOLUTION` of the winner are listed in
`ScenarioSet.tooCloseToCall` and named to the grower as equals to choose between. The winner is
still picked and still shown; what is no longer implied is that being second means anything.

**The margin is DERIVED per run, not a constant, and two attempts to make it one were both
wrong.** The score is a weighted sum of min-max normalized terms, so each term is divided by its
own spread across the candidate set and a raw error of `d` arrives in the score as `d / spread`.
Where an array is marginal that spread collapses and the same bake error lands magnified. Measured:
Bergen's 3.5 x 2.4 m courtyard moves 0.1541 where the same city's 16 x 11 m plot moves 0.0115, on
bake errors that are nearly identical. No single number covers both, and each of 0.0385, 0.12 and
0.02 failed at one end or the other.

What makes it tractable is that only TWO of the four terms can move at all. `energyRaw` comes from
`runAnnualChain`, which reads weather, solar position and geometry and never touches the raster,
and `simplicityRaw` is pure geometry. So the bake's error need only be measured on the light
terms, in raw units, where it is a physical quantity rather than an artifact of normalization.
Eight paired real-weather runs, preview against `FINAL_OPTIONS`:

| site | plot | season RSR moved | crop share moved | score moved | was, RSR / share |
|---|---|---|---|---|---|
| Tromso NO | 3.5 x 2.4 m | 0.0023 | 0.0000 | 0.0090 | 0.0022 / 0.0000 |
| Bergen NO | 3.5 x 2.4 m | 0.0013 | **0.0702** | **0.1543** | 0.0015 / 0.0702 |
| Bergen NO | 16 x 11 m | 0.0015 | 0.0244 | 0.0115 | 0.0016 / 0.0244 |
| Edinburgh GB | 3.5 x 2.4 m | 0.0017 | 0.0000 | 0.0039 | 0.0024 / 0.0000 |
| Amherst MA | 3.5 x 2.4 m | 0.0043 | 0.0000 | 0.0013 | 0.0048 / 0.0000 |
| Amherst MA | 16 x 11 m | 0.0032 | 0.0000 | 0.0001 | 0.0032 / 0.0000 |
| Phoenix AZ | 3.5 x 2.4 m | **0.0134** | 0.0227 | 0.0130 | 0.0056 / 0.0194 |
| Singapore | 3.5 x 2.4 m | 0.0094 | 0.0000 | 0.0022 | 0.0093 / 0.0000 |

The crop share is a STEP: a crop either clears the light gate or it does not, so a hair of DLI
moves the share by a whole crop. Five of eight runs move it by nothing; one moves it by seven
percent. `BAKE_RSR_RESOLUTION` and `BAKE_CROP_SHARE_RESOLUTION` are the worst measured value of
each, and `scoreResolution` carries them through the same normalization the score uses, weighted
the way the score weights them, each term capped at 1 because a normalized term cannot move
further than its own range.

The right-hand column is the original 2025 measurement, kept beside the current one because the
re-measurement moved something the earlier text had ruled out. It said the shade ratio was well
behaved, under one percentage point everywhere; Phoenix now moves 0.0134, past the 0.01 that
shipped, and `BAKE_RSR_RESOLUTION` is 0.014. The cause is not the bake. Two crop-side
changes on 2026-08-09 (a perennial judged on the heat it cannot leave, and the Mediterranean
herbs given rosemary's heat ceiling) changed which crops clear the light gate at a hot site, `candidatesFor` derives row pitch from the
shade the planting can afford, and so a different geometry is being scored. **A crop-side change
therefore invalidates the LIGHT constants too**, which is a coupling neither this record nor the
code comment had named. The harness is `scripts/measure-bake-resolution.mjs`, checked in for
exactly that reason: it records the wizard answers and the two quality settings it used, so the
next re-measurement is comparable to this one instead of to a script nobody kept.

Checked against all eight runs: the margin covers every one, including the Bergen courtyard that
defeated the constant, and by a wider hand than before (0.1794 against a measured 0.1543, where
the old constants gave 0.1640 against 0.1541). One claim that stood here is WITHDRAWN as
arithmetically impossible rather than merely stale: that the margin is tighter than the 0.02 it
replaces wherever the set is well separated, at 0.0112 on Amherst's 16 x 11 m plot. Both raw terms
are min-max normalized into [0, 1], so a spread can never exceed 1, and the floor of the margin at
balanced weights was `0.35 * 0.04 + 0.15 * 0.01`, which is 0.0155. That plot actually returns
0.0553. The adaptive margin is WIDER than the constant it replaced everywhere these eight sites
reach, and its case is not tightness: it is that one constant was wrong at both ends at once.

The figure ships on `ScenarioSet.scoreResolution`. Note for anyone revisiting: the synthetic
weather fixture's season diffuse fraction never leaves 0.68-0.79 where real skies run 0.24-0.45,
and both discarded constants came from calibrating on it. Do not calibrate this on that fixture
again.

### 10d. An applied plan shares the bed, and the block that stops it carries its own press

**Two defects.** The feature gave no visible way to run the optimizer, and when it ran it
"just planted lingonberries for everything".

**The block.** The sentence read *"Run the layout optimizer on the crop step before a plan can be
applied"*. There is no step called "crop", the step is *What to plant*; there is no control called
*the layout optimizer*, the button says *Fill every bed*; and that button is in the next panel's
header, fifth of five, under a ranked crop list that runs to 163 rows. So the sentence named
nothing a reader could find, and the reader clicked at random until the grayed-out Apply button
woke up. `RequirementNotice` already existed for exactly this, and its own docstring says it does:
the sentence and the press that settles it as one element, because "the pair that drifted apart
was exactly the failure". There were five requirement builders and no `planRequirement`. There is
now, chained behind site, beds, light and ranking, so a reader is offered the first thing they can
actually act on. The ranking panel's own notice was also gated on `phase === 'blocked'`, and
`phase` is `'off'` whenever the auto-run toggle is off, which meant two dead buttons and no
explanation at all; it is now gated on there being something in the way.

**The monoculture, which was NOT the optimizer.** `derivePlanting` fills whatever room it is given,
and `applyPlanToBeds` derived the plan's slots one at a time. So the first slot took the whole bed
at catalog spacing, sixty-two lingonberry in ten square meters, and every slot after it was
refused for room. Whatever variety the optimizer found was discarded at the last step. The
refusals were even printed under the button, where they read as the plan being over-ambitious
rather than as the applier throwing it away. The comment above the loop claimed the opposite of
what the code did.

The fix is `allocateSpace`, the rule this repository already states and already tests over in the
polyculture path: every crop gets one plant's worth of bed at catalog spacing before anything
gets a second, and the surplus is split evenly. A combination whose floor exceeds the bed does not
fit, and then the one-at-a-time fill stands and reports the shortfall as before.
`planting.test.ts` holds it, and that test was checked to fail on the old behavior rather than
merely to pass on the new one.

**What is NOT fixed, and is a decision rather than a defect.** Beds are still solved in isolation,
so two beds with the same light still get the same crops. Three things in `optimizeLayout` produce
that: `yieldBand` (0.4) and `portfolioLer` (0.3) are the same quantity counted twice, because
`totalLer` contains the same sum of relative yields; `companion` (0.15) is identically zero when
planning into an empty bed, since `supportingRules` is computed against what is ALREADY in the
bed; and `stratification` (0.15) is constant for a first pick. So the first crop in every bed is
chosen by relative yield alone. That yield is *relative* and *per Laub group*, meaning percent of
a crop's own full-sun yield rather than food, `berries` is the strongest group, and lingonberry is
the only berry that both passes the light gate at `dliMin` 8 and is small enough (0.126 m² canopy
against 1.2 to 4.9 m² for every other low-DLI berry) to clear the space gate with no crowding
penalty. Also noted: `requireInsectaryCoverage` is set by the store and never read.

Changing that objective moves every recommendation the app makes, so it is recorded here and left
for a decision rather than taken quietly.

## 11. Companion planting: evidence grading A-E

A = multi-site trials or meta-analysis with characterized mechanism. B = replicated trials,
context-dependent or with management preconditions. C = single study or lab-only. D =
traditional, plausible, untested. E = no evidence or contradicted.

Only A/B contribute to scoring. C renders as "experimental". D/E render only in a clearly
labeled folklore panel and never affect layout.

| Claim | Grade | Note |
|---|---|---|
| Intercropping LER | A | 1.22-1.32 |
| Crop rotation | A | |
| Insectary strips | A (enemy abundance) / B (pest suppression) | |
| Marigold vs root-knot nematode | A as full-season cover crop / **E** as interplanted individuals | |
| Push-pull | A outcome, non-transferable | Mechanism revised by **Erdei et al. 2024, eLife 13:e88695, doi 10.7554/eLife.88695**: no adult repellency at all; larvae preferred Desmodium but none survived to pupation, via silica-fortified hooked trichomes. It intercepts and kills, it does not repel |
| Trap cropping | B | ~10 of ~100 systems commercially successful; retention not attraction is limiting; untended trap crops are pest nurseries |
| Legume N transfer | B | <15% same-season |
| Biofumigation | B | only with maceration; <=1% ITC conversion otherwise |
| Juglone | C | lab yes, landscape evidence weak |
| "Aromatic herbs repel pests" | **E** | Directly contradicted (Finch & Collier 2003; Uvah & Coaker 1984). Mechanism is green surface area, not smell |
| Blueberry with lingonberry or the acid guild | **D** | Traditional. The only defensible content is the shared acid envelope, which is already the pH compatibility term; the rule exists so the pairing is not silently upgraded |
| Sweetfern fixes nitrogen for a neighboring blueberry | **D** | Ziegler & Huser 1963 measure fixation IN THE NODULE and FEIS reports only an apparent effect on neighboring little bluestem. Neither measures transfer to a blueberry, and the Fabaceae transfer figures do not carry across to an actinorhizal shrub |

## 12. TEK-derived design rules

Encode as named, individually attributed rules. Seven distilled from 20+ documented systems:

1. Vertical stratification: 2-4 explicit canopy tiers keyed to light level under the array
2. Nurse plants: a data-model role for microclimate-service species distinct from yield crops
3. Wind/thermal buffering as a first-class microclimate modifier, not just panel shade
4. Water-harvesting geometry tied to the array drip line and runoff shadow
5. Shade-schedule-aware temporal succession and relay cropping
6. Landraces as distinct plantable entities with their own trait annotations
7. LER-style portfolio yield reporting, not single-crop maximization

**Dehesa/montado analog, CLAIM NARROWED.** "Marcos et al." does not exist and must not be
cited. The real source is **Montero, Moreno & Bertomeu 2008, Agroforestry Systems 73:233-244**,
a logistic curve in distance from trunk with R^2 > 0.88, which is genuinely the right shape.
Its coefficients are paywalled, so the template is not instantiable yet and the gradient ships
endpoints plus a caveat only. The **soil-moisture half of the claim does not hold**: real
papers sample 2-30 m but report categorical zones, not a curve. Narrow the claim to LIGHT
TRANSMISSION only.

### Attribution rules (hard product constraints)

- Attribute to specifically named peoples. Never generic "indigenous".
- Distinguish historical/archaeological systems from living practice.
- Credit named individual innovators (Nagashima, Sawadogo, Khan) separately from communities.
- Never claim community endorsement that was not sought.
- **Do not ship a merged, unattributed "ancient wisdom presets" feature.** Pan-indigenous
  generalization is the named failure mode.
- Published academic literature is citable under normal scholarly norms. CARE Principles and
  the Nagoya Protocol bind only if we encode community-held seed genetics or ceremonial
  calendars. We will not.

## 13. Stack

three 0.185.1 / @react-three/fiber 9.6.1 (NOT v10, alpha) / @react-three/drei 10.7.7 /
three-mesh-bvh 0.9.13 / three-bvh-csg 0.0.18 / @turf/turf 7.3.5 / suncalc 2.0.1 / zustand.
Vite + React 19 + TS strict. Cloudflare Pages + Workers.

`src/sim/` is framework-free: zero three.js and zero React imports, so the physics is unit-
testable without a GL context. This is a hard architectural boundary.

Testing: Vitest for pure math (the bulk of coverage, every commit);
`@react-three/test-renderer` for scene graph (assert primitives, not object identity, per
vitest#4207); Playwright for e2e with `--use-gl=swiftshader` on visual-regression projects
(GPU rendering is not deterministic across CI drivers) and `--use-gl=angle` for functional.

## 14. The simulation mode: the garden run forward

Decided 2026-09-03, on the audit in `the convergence document`. The designer answers "what is the
best layout for this site"; the simulation answers "what happens if I try this here", one season
at a time, on years the site actually had. It is a MODE of the designer and not a product beside
it, and the rule that keeps the two from disagreeing about one garden is that **the simulation
calls the functions the recommendation calls**, on a `Site` computed for the year
(`siteForYear`), with a history the ground remembers. `src/simulation/` is the layer. It is pure
and sits between `recommend` and `state`; `docs/ARCHITECTURE.md` has the boundary.

### 14.1 A measured year may drive a simulated season

Section 4 stands for the designer: its input is a TMY and its yield bands come from one. The
simulation runs on a measured year on purpose, because the sign of the shade effect flips between
normal and drought years (the evidence section 4 cites), and a mode for practicing has to be able
to show the drought. The measured years are the ten the TMY was assembled from, kept beside it by
`normalizeWeather`, with the rain that fell in them. A `SeasonReport` names its year in its
`YearSummary` and is never a recommendation. Light stays the typical-year bake: a season's shade
ratio is geometry, and the year varies frost, heat, rain and evaporative demand through
`siteForYear`.

### 14.2 What a season may invent, and what it may not

- The realized harvest is a seeded draw inside the crop-response band, section 7's own
  confidence interval, uniform in log space. No variance is invented, and a garden replays
  exactly from its seed.
- Pests: the spatial term is the mechanism recorded under `undersown-cover-host-finding`, that
  non-host green area dilutes host finding; the year term is the year's degree-days over the
  typical year's at the same site. The share of a harvest lost at full pressure is the one
  unsourced number in the mode, declared through `unsourcedClaim` so it stands in the provenance
  ledger with the other gaps.
- Water: the designer's own drought penalty, on the year's water index, with the bed's own
  irrigation.
- Frost and season length: the year's own two dates and the designer's `siteMaturityDays`,
  through `seasonAnchors` and `frostHardy`.
- Rotation: `rotationViolation`, fed a real history, matching by family rather than by crop. A
  perennial that stood in the same bed last season is standing rather than sown and is not asked;
  in the season it is first planted it is (decided 2026-09-04).
- The harvest share is the mean over every planting planned, a refused one counting as zero the
  same as a frosted one, because the standing it feeds is per bed of ground (decided 2026-09-04).
- Companions: `ruleAppliesInContext` at every grade. A and B rules apply as measured, minus
  their competition penalty; C rules do nothing the numbers can see; D and E rules are
  hypotheses (14.3).
- An economy, bounded, decided 2026-09-04 on `the economy document`. The prototype's
  management budget, build cost and connection charge were invented scales and stay out. What
  may show, each with its source on the row: a build cost as a band across NREL's three
  crop-mount structures (Horowitz et al. 2020, $1.83 to $2.33 per watt DC, 2020 US dollars, a
  500 kW benchmark across eight states, with the caveat that a garden's few kilowatts sit below
  the bottom of that report's own size curve); a year's electricity value at the residential
  retail price of the site's US state (EIA Electric Power Monthly 5.6.A, through the proxy with
  a secret) and a simple undiscounted payback from the two, both null wherever no price reaches,
  which today is everywhere outside the United States; and labor as a plain count of the applied
  rules' own `requiresManagement` tasks, never as hours or money. The economy sits below the
  standing in its own block, never in the verdict and never in a score, and nothing in it is
  discounted, converted or projected, because no source in the corpus gives a rate.

### 14.3 A folklore claim may move a simulated outcome, and nothing else

Section 11 and `docs/ARCHITECTURE.md` 3.4 stand: grade D and E rules can't move a layout, a
score or a recommendation, and the types enforce it. The simulation is the one place they act,
and only on a `PlantingOutcome`, which no score consumes. Whether a claim is true in a garden is
a seeded draw at even odds, made once and never shown; a contradicted claim is false in every
garden; and where a claim is true its size is the median measured effect of the A and B rules of
the same interaction kind, so no effect size is invented. After three seasons of a trial the
literature is offered. The outcome is labeled a simulated hypothesis wherever it is shown,
because a mode that blurs "tested here" with "endorsed" is the risk `the port document`
section 10 names about traditional knowledge. A trial is read against the harvested plantings of
the same seasons that didn't run the rule, off the reports, and where every bed ran it the panel
says so (decided 2026-09-04).

### 14.4 Units and names

A season is a year's growing season. Rotation intervals, trials and the ground's history are all
counted in seasons. The mode is called the simulation, in code and on screen. `src/sim/` stays
the physics of one year's light and `src/simulation/` is the garden over years; the two names
are kept because renaming the physics would cost more than the confusion. The prototype under
`prototypes/solarpunk/` that this replaces was deleted on 2026-09-03, the day the mode reached
the screen; `prototypes/light-harness/` was what was kept out of it, until its one measurement
moved into `src/sim/` as `gap.test.ts` on 2026-09-04, and `prototypes/` is gone.

### 14.5 The picture follows the season, and it is still not a second physics

Decided 2026-09-03. Two things on screen were saying which year it was and neither of them was
the simulation: the scene's clock, which is the sun scrubber's, and `plantYear`, a slider that
decides how near its mature size a perennial is drawn. So a drought of 2018 was drawn under this
year's date, in a garden that stayed one year old however many seasons had been run.

A season now moves the clock, keeping the grower's day and hour, to the year that was run, and a
reset puts it back. The plants' age is derived where the scene reads it: the greater of the
slider's year and the seasons run, bounded by `MAX_PLANT_YEAR` (`gardenAge`). It was written by
the season for a few hours on 2026-09-03 and that made the shipped example, drawn at year 3, a
year old on its first press; a grown shrub vanished, and every persona who tried it read that as
the season killing it. What a season does NOT do is re-bake the light, and the distinction is the whole of
14.1: a season's shade ratio is geometry off the typical year, so moving the clock is a calendar
move and not a measurement. The sun over a given day of the year hardly moves between years in
any case, which is why this is honest to do and would be dishonest to call a per-year sun.

`the convergence document` section 6 listed this as "the year should move the sun", which read as a
per-year bake and would have contradicted 14.1. This is what it should have said.

Three more things the picture does, added 2026-09-03 after eight personas tried the mode
(`the convergence document` 7), and the line each one stays behind:

- **A season plays.** Pressing Run sweeps the scene's clock from the year's last spring frost to
  the day the grower was looking at, over three and a half seconds, and the outcome lands on the
  plants when it ends (`ui/useSeasonSweep.ts`, the transient `sweeping` flag). The plants grow
  because they already grow with the day of the year and the sun moves because it already
  follows the clock; nothing is computed that the press did not compute, and the light is not
  re-baked. `prefers-reduced-motion` lands the outcome at once, as the overlay playback and the
  guided tour already do.
- **The outcome is drawn to be seen.** A frosted planting lies flat and bleached rather than
  standing small and gray; one the ground refused is not drawn at all, because bare soil is what
  there is to see; a bed that ran short of water shows paler, warmer topsoil (`driedBy`, the
  same kind of reading as irrigation darkening it, and like it a rendering choice in size and a
  fact in direction). Every tint is still a multiplier on a reflectance.
- **The light overlay is not drawn while the seasons step is open.** It is the designer's
  answer and the loudest thing on screen, and it buried the plants the season is about. The
  grower's setting is untouched; the overlay simply waits for another step.
- **The scene shows the recorded weather, and only on the seasons step.** Once a season has run on a
  year that happened, the scene shows that year's own hour under the clock: its cloud, read as
  the clearness index of the measured sun against a clear one (`src/sim/clearness.ts`, Liu and
  Jordan 1960) and drawn on the sky dome and taken off the key light; its rain, as a point cloud
  over the plot at the hour's own rate; and snow on the ground from that year's own monthly
  normals through the one snow model. Off the seasons step all three are what they were, and the
  sky's cloud stays at zero, because the designer's picture makes no claim about any hour's
  weather and its visual baselines are held to that. The sky dome's old rule, that procedural
  cloud would be a weather claim the model never made, still holds where the model has not made
  it; on the seasons step the record has.

## 15. The test runner is `bun test`, and vitest is gone

Vitest ran this suite for the life of the project and was replaced in a day. The
reason was not speed, and not the two dependencies it saved. It was that the gate had become a
coin flip.

**What went wrong.** Vitest routes `console.*` from a worker to the reporter over an rpc channel.
If the worker closes with one still in flight, vitest raises
`EnvironmentTeardownError: Closing rpc while "onUserConsoleLog" was pending` and counts the
unhandled rejection as a failed run. Build `f10376f8` reported `Tests 2064 passed | 12 skipped`
and exited 1. A retry of the identical commit passed and deployed, which is what proved it a race
rather than a defect: same code, same image, same command, different outcome. It had been seen locally too, and nobody had measured how often it lost.

The prints were eleven `console.log` calls across five agent test files, held-out scoring reports
somebody reads rather than assertions. Three cheaper fixes were available and are recorded here
because they were the ones to try first: `disableConsoleIntercept: true`, swapping the eleven to
`process.stdout.write` (which `sweep.bench.test.ts` already used and which had never raced), or
putting the reports behind an env flag. The runner move was chosen, which had been wanted
anyway, and it removes the mechanism rather than the trigger: `bun test` has no worker rpc
reporter for a print to race against.

**What it cost, honestly.** 175 test files and one harness had their imports rewritten; that part
was mechanical. Six things were not:

1. **`react-dom` decides once, at module load, whether it is in a browser**, caching the answer in
   `canUseDOM` and `isInputEventSupported`. Import it before a DOM exists and its change event
   falls back to a polyfill path that a dispatched `input` event never reaches: every controlled
   input in the suite renders correctly and silently stops responding to typing. A first-line
   `import` of the DOM registrar inside the test file is NOT early enough. It has to be a preload,
   which is why `test/dom.ts` is global rather than per-file where vitest's
   `// @vitest-environment jsdom` pragma was.
2. **The five `@react-three/test-renderer` files must NOT have a DOM.** With `HTMLCanvasElement`
   present, test-renderer patches `getContext` instead of using its own fake canvas, and the
   camera tests in `useGuidedTour.test.tsx` stop seeing frames. So the suite runs twice:
   `test:dom` for 170 files and `test:scene` for those five. The split is a glob, not a list.
3. **Bun fakes timers inside the runtime**, not by swapping `globalThis.setTimeout`. A reference
   captured before `useFakeTimers` is not a real timer and never fires, so anything that must make
   progress under fake timers has to ride the microtask queue. See `test/vi.ts`.
4. **React re-reports an error a boundary has already caught**, through `reportError`. Bun's
   rethrows; jsdom's does not. `scene.test.tsx` exists to check that `SceneBoundary` swallows an
   IBL subtree the fake WebGL context cannot draw, so `test/setup.ts` installs a `reportError` that
   prints. The error stays visible and stops failing a passing test.
5. **`globalThis` is not the jsdom window.** They are separate event targets, so
   `globalThis.dispatchEvent(new Event('pointerdown'))` reached nothing and threw on the way. The
   three `EventTarget` methods are bound across in `test/dom.ts`.
6. **Bun types `expect(x).toBe(y)` against the type of `x`.** Nearly every id and unit here is
   branded, so 127 assertions comparing against a plain literal stopped compiling. Vitest typed
   these `unknown`. `test/bun-test.d.ts` widens three matchers back rather than putting a cast in
   every assertion, because the brand is a device for the production code and should not decide
   how a literal is written in a test.

**And a seventh, found by looping the suite rather than by reading it.** The first green run
proved nothing, so the suite was run twelve times end to end. Eleven passed. One exited 1 with
zero test failures, which is the signature the whole exercise set out to kill:

```
panic: Segmentation fault at address 0x3B
error: a test worker process crashed with SIGSEGV while running src/ui/agent-waiting.test.tsx
```

Two crashes in seventeen full runs, the same file and the same fault address both times, each one
aborting every file that had not finished. Bun's own report names a native addon. The cause was
`@huggingface/transformers`: it exports a `node` condition that `dlopen`s `onnxruntime-node` and
`sharp`, and a `default` one that is `transformers.web.js` on WASM. Bun takes `node`. Vite takes
`default`, so the build that ships has never touched the native runtime and only the test process
did.

What made `agent-waiting.test.tsx` the one to crash is that it does not want a model at all. It
stubs `fetch` so "the model download answers no", which is true only where the weights are absent;
with `models/` on disk it loaded a 23 MB ONNX file through a native runtime, in a test about what
the panel says while a run is pending. That test and `agent-composer.test.tsx` now refuse the
module, which is what their comments already claimed was happening, and that is what holds on a
builder. `test/setup.ts` additionally redirects to the web build wherever the weights are absent,
which is a local clone and nothing else: both builders fetch them, Cloudflare included, since
`build:deploy` runs `fetch-agent-model` before the suite. The agent's own holdout tests keep the
native build, because embedding against the real weights is what they are for. The twenty clean
runs were measured on a machine that has the weights, so they describe the builders' configuration
rather than a quieter one.

One sharp edge this leaves. `bun test <file> <file>` by hand, without `--parallel`, shares one
module registry across files, so the panel tests' refusal of the embedding module leaks into
`embedding.test.ts` and the real model fails to load with "the weights are on disk but did not
load". Every script in `package.json` passes `--parallel`, which implies `--isolate`, so the suite
never sees this; an ad-hoc command does, and it reads as a broken model rather than a broken
command. Both mocks say so where they are written.

A stale claim found on the way, and corrected: `src/agent/model-presence.ts` and the `env` block
of `.github/workflows/ci.yml` both said Workers Builds "has no `models/`", which was the whole
worked example for why `REQUIRE_AGENT_MODEL` is opt-in rather than inferred from `CI`. It has
them: `build:deploy` runs `fetch-agent-model` before the suite. Whether the claim was ever true is
not checkable. The rule it argued for is kept and
its reason restated, since "this builder fetches the weights" is still not derivable from "this is
a builder" and the next builder to set `CI` without fetching would fail on a file nobody asked it
for. What changed is that the example is now hypothetical rather than live, and a comment whose
example is false is worse than one with no example at all.

Two approaches were tried and do not work, recorded so nobody spends the afternoon again: a bun
resolver plugin (its `setup` runs, its `onResolve` is never called for a bare node_modules
specifier) and a `mock.module` factory returning a promise (not honored; the native build loads
anyway). An eagerly awaited module in the factory is what bun accepts.

**What it bought.** 2,064 tests, the same count as before, in 31 s. `vitest`,
`@vitest/coverage-v8` and `vitest.config.ts` are gone; `bun-types` and `@types/jsdom` arrived, and
`jsdom` stayed. Both flakes were found by looping the suite and counting exit codes, which is the
only thing that works on a race: the vitest one had gone unmeasured for days, and the bun one
would have looked like a clean migration after any single run.

## 16. Root depth limits a crop; only a tray-shallow bed refuses it

`stages/space.ts` refused any crop whose `roots.maxEffectiveDepthM` exceeded the
bed's soil depth plus its raised height. That figure is FAO-56 Table 22's Zr, the effective
rooting depth the water balance works from, and the table's own note says the smaller values
apply in restricted soils: it was never a minimum soil depth. Tomatoes grow in 30 cm of soil. Read
as a minimum it excluded tomato, pepper and most of the fruiting classes from every bed the
questions place, so a request for tomatoes came back as hops and sorrel.

**The rule.** A bed shallower than Zr LIMITS a crop: `spaceStage` passes it with a `limiting`
factor (`cause: root-depth`, membership `depth / Zr`, "Roots would reach X m in deep soil and
this bed offers Y m, so it will need watering more often"), `pipeline.ts` carries that factor
into the marginal chain beside the light and soil ones, and the plants step's raised-bed remedy
reads it from a marginal verdict as well as from an exclusion. Below `ROOT_DEPTH_FLOOR_M`
(0.20 m) the crop is still excluded.

**What it costs.** A shallow bed now ranks a deep-rooted crop as marginal rather than dropping
it, with the sentence beside it. The water balance already reads the bed's own depth, so the
more frequent watering the sentence promises is what the seasons then simulate.

## 17. One column: the guided questions are sidebar steps, and the dock is gone

**2026-09-10 to 11.** A walk through the app showed the two flows fighting: the panels
step's "Suggest a layout" opened the dock at the foot of the 3D view and collapsed the sidebar
step; "Use this layout and plant it" rewrote the sidebar's open step and left the dock up on "One
more choice"; the dock's plot size and the ground step's plot size were two answers to one
question; the light had to be asked for by a button after the place was chosen; and the plants
step offered three ways to plant a bed, one of which (the optimizer, Record 10d) planted eastern
teaberry in every bed.
A dozen scripted runs in a browser harness went through the whole build that night and found
the same things from every starting point, which is the basis of what follows.

**The rule.** There is one flow: the sidebar stepper, ten steps whose titles are the questions
the dock asked, one open at a time, each ending in `Next: <the next question>`. The dock, the
toolbar's "Guided setup" toggle, the phone's "Guided" tab, the express path and "Don't show this
again" are deleted. A first visit opens the column on step 1. On a phone the column is the Plan
tab, the 3D view is the Garden tab, and a pinned strip on Garden says which step Plan is on.

**What runs by itself, and what a press does.** The place resolves when a result is chosen; the
light runs as the full check after the place resolves and after every settled geometry change
(`useAutoLight`, Record 15's open question, decided on the ground that it should just happen);
the ranking follows the light, and holds while the light is being computed so a guided
planting is ranked once against the full check rather than three times against three lights. A
press is never silent: a combination prints what it planted or why not beneath its own button.
The ranking on screen stays up while the next one runs (`ranking` on the slice).

**The plants step is designed for arrival.** Most growers reach it with every bed planted by
the layout they chose. It leads with one card per bed (the mix in the crops' names, the counts,
a confidence word, "Try another mix", "Change a plant"), then the chips for what you like to
eat, then the combinations for the selected bed, then "Pick plants one at a time" and "Every
crop ranked, and why" behind folds. `plantEveryBed` plants the plot as it stands through the
same code a guided apply uses, and no bed repeats another bed's combination when a different one
fits.

**Two model changes that came out of the walk, each its own rule.** Combinations lead with food:
a seed crop is a food crop (`role === null`), and the answer to "What would you like to grow?" reaches the suggester and
the ranking as a preference for the classes it names (`ambitionPreferences`). Root depth limits
rather than excludes (Record 16).

**Plot size has one source**, the plot boundary; the search reads it off the extent. The answers
and the open step are persisted (schema 4), because a reload that remembered the plot and forgot
"mostly food" read as the app forgetting.

**What this cost, measured.** The unit suite went from 2,066 tests to 2,032 (the dock's 900-line
test and the optimizer's tests went; the flow's own tests came in). The e2e suite's dock specs
were rewritten against the column. First light on a new garden is a full bake, as Record 15
measured.

**What was NOT changed, and is recorded for a later decision.** The layout search still places
beds only in the bright strips when the plot is narrow, so a class about shade can be handed a
plot with no shaded bed; the calendar sows brussels sprouts in February and prints two-week
harvest windows; the frost headline at the 50th percentile reads three weeks earlier than the
Extension date growers use; and the pair reasoning prints the same soil-pH sentence for nearly
every pair. Each is a modeling question with the evidence for it on record,
and none is a UI question.

## 18. The WebGL2 bake read its panel corners out of the sky directions

**Found in a real Chromium.** With the one-column build open, lowering the
panels from 3.4 m to 1.5 m dropped them in the 3D view while the DLI map, every
per-bed figure and the plant cards stayed frozen. Reproduced with
`scripts/probe-bake-backends.mjs`: the WebGL2 shadow-map backend answered 86 / 57 / 71 percent of
open sky for the three default beds at every headroom, pitch and tilt tried, and the CPU reference
answered 94 / 38 / 54 at the default geometry and 98 / 8 / 79 with the panels at 0.6 m. Removing
the array moved both to 100.

**The defect.** `uploadTexture` in `src/sim/gpu/webgl2.ts` bound its texture on whichever unit was
active. The chunk loop bound the panel corners on unit 0, then uploaded the direction chunk, which
bound the direction texture on unit 0 as well before the code moved it to unit 1. So every draw
read `uPanels` from the direction texture: the "panel corners" were sky directions and weights,
which is why the shading followed the number of panels (how many texels were read as corners)
and not where they stood. Uploads now name their unit. The two backends agree to the digit on
both geometries.

**What this touched.** Every bake in a browser since the backend was written: the editor's light,
the per-bed light the ranking reads, the compliance checks, the five candidate bakes behind
"Show me some layouts", and the visual baselines that include the DLI overlay. The shipped
example's raster was baked by `scripts/bake-example-garden.mjs` outside a browser and was not
affected. The parity test in `src/sim/gpu/webgl2.test.ts` that would have caught this is skipped
wherever WebGL2 is absent, which is everywhere the unit suite runs; the probe script is the check
until that test has a browser to run in.

## 19. A perennial taller than a bed's trellis waits to be asked for

A cold visitor on a phone gave Hadley, kept the default plot, answered "Tomatoes,
peppers and berries", took the suggested layout, and was handed hops in six of eleven beds
("tomato, hops and cucumber", "hot pepper, shallot and hops"). An earlier round's
report had named the same thing on a laptop (hops and hardy kiwi in vegetable beds) and put the
cause on the stratification term, which rewards a combination for holding a tall tier over a low
one. Hops stands 6 m on a permanent trellis and takes three years to a first harvest; a fruit
tree is 4 m and six years. Nothing in the suggester distinguished them from a tomato, and the
growing answer, which leans the ranking toward `cane-bush-berries`, leaned toward them too.

**The rule.** A perennial (life cycle `perennial` or `woody-perennial`) whose typical height is
above `BED_PERENNIAL_HEIGHT_M` (2 m) is orchard scale: it joins a combination only when the
grower names it (a `prefer` or `require` entry of their own), and its refusal says so in the
list a combination card folds ("hops grows to 6 m and stays for years, so it joins a bed only
when you ask for it"). The growing answer's lean (`ambitionPreferences`) leaves such crops out,
so a `prefer` entry for one can only be the grower's. Blackberry and aronia (2 m) sit on the
line and stay; raspberry, strawberry, the currants and gooseberry are under it. Sunflower, sweet
corn and pole bean are annuals and untouched. The per-crop ranking and "Pick plants one at a
time" still rank and offer every one of them: an orchard row or an arbor is a design the grower
can make, and this rule only stops the suggester making it for them.

**What was considered and not done.** `yearsToMature` would have been the more literal test
("does it crop this season"), but the catalog defaults every perennial to three years, so
chives, thyme and mint carry the same figure as hops. Height is what the evidence on record
actually named. A dedicated refusal group in the combinations fold was not added: the reason is
one sentence under "Incompatible for another reason", and `SuggestionRefusal` would need a new
field for the grouping to read it without matching the phrasing.

## 20. A fall-harvest crop is dated from the autumn end, and a fruiting annual picks for weeks

**Three things the calendar got wrong.** The catalog had brussels sprouts
transplanted on April 3 and harvested in the July heat, where every Extension sheet for the
northeast sows them in late May and transplants in June for October; peppers set out at 13 °C
soil, where 65 °F (18 °C) is the rule; the tomato harvest closing on September 11, six weeks
before the frost, because every annual's harvest lasted the fourteen days a head of lettuce
does.

**The rules.** A crop marked `fallHarvest` in the catalog (brussels sprouts, whose sprouts form
in cool weather and sweeten after frost) is dated from the autumn end: its one sowing is the
latest that finishes its harvest by the first fall freeze at the chosen exceedance, its indoor
start counts back from that, and no spring sowing is offered. Where the season is too short for
that (the fall sowing would fall before the spring floor) the spring dates stand and a note says
so. Peppers and eggplant carry a soil floor of 18 °C of their own (`minSoilTempC`), over the warm
archetype's 13 °C, which is the tomato rule. And the fruiting annuals carry their weeks of
picking as `harvestDays`: tomato, the peppers, eggplant, tomatillo and okra 60, summer squash 50,
cucumber and pole bean 45, cowpea 30, bush bean 21; the harvest of a tender crop is still cut at
the first fall freeze, so a tomato's now closes at the frost rather than two weeks after its
first ripe fruit. The winter squashes, melons and pumpkins keep the catalog's default two weeks: they are cut once.

**What was not changed.** Every cool-season crop still shares the archetype's spring offset, so
a Hadley April still has a dozen jobs on one day; the succession schedule still sows peas into
June; the heat-supply stretch of days to maturity still puts a melon's harvest in late October.
Each is a modeling question with the evidence for it on record, and none was a
one-line data fix.

## 21. The search's rows run the way the scene draws them, and food-first is the least panel overhead

**Panels outside the plot rectangle.** The layout preview drew solar panels standing outside
of the rectangle the grower had given. Measured with the store handle on a 38.4 by 22.9 m plot: the
previewed candidate carried `rowLengthM 37.4` (sized for the width) and `rowAzimuthDeg 180`,
which `arrayLayout` and `sim/geometry.ts` both read as "the rows run north to south". So 37 m
of panel ran across a 23 m plot, and the search had been measuring the shade of a sawtooth of
panels tilted along their own row. `tiltedCandidate` had been writing the equator-facing
surface azimuth into the row direction since the candidates existed; the vertical candidate
wrote 90 (east-west rows) under a sentence promising north-south walls; and `layout.ts` read
the row direction as the offset direction, which canceled the first mistake exactly, so the
beds ran along the rows for the wrong reason and turned across them the moment the rows were
right.

**The rules.** `rowAzimuthDeg` is the direction the rows run, everywhere: a fixed row facing
the equator runs east to west (90), a north-south tracker axis and a vertical east-west-facing
wall both run north to south (0). The beds are laid across (cos, -sin) of it. Every candidate's
rows now sit inside the plot (`design.test.ts`, "keeps every row of every candidate inside the
plot").

**What tilt does, re-measured on rows that run the right way** (CPU reference backend, 42.4 N,
ground rows, `balanced` tilt injected): at one row count season RSR **falls** as tilt rises,
0.256 -> 0.243 -> 0.218 on 16 by 12 m and 0.267 -> 0.262 -> 0.246 on 40 by 25 m at 10, 20 and
35 degrees. On 30 by 60 m the flattest tilt fits four rows at 0.221 where 20 degrees fits five
at 0.264. The ratio 0.256 / 0.218 is 1.17 against cos(10) / cos(35) of 1.20: each row's overhead
footprint, `collectorWidth * cos(tilt)`, is nearly the whole of the effect, and the height a
steeper panel adds is a small term against it. The 2026-09-01 figures in 10c said the opposite
and were a faithful reading of the sawtooth.

**`groundLightPlan` is now a minimization, still with no simulation in it.** The panel over the
plot from overhead is `rows(tilt) * cos(tilt)`, and it is not monotonic: rows fall with a
flatter tilt (the pitch opens) while each row widens. The band is walked a degree at a time and
the least overhead wins, the flatter of two equals. On a 40 by 25 m plot two rows fit at every
tilt and the steepest is chosen; on 30 by 60 m the steepest tilt that still holds four rows.
The rationale sentences that told the grower "the flattest angle leaves the most light" say what
the arithmetic does instead, and the measured light figure beside the design is named as the
figure to read.

**What was not changed.** The sizing footprint (`GCR * cos(tilt)`, an infinite-row figure) is
neither an upper nor a lower bound on what a finite plot measures: 0.217 against 0.165 on the
12 m test plot, where the second row's shadow reaches past the bare margin. `flags.shade` reads
the measured ratio and always did; sizing the pitch to hit a measured target rather than a
projected one is open. The shipped example gardens were authored with `DEFAULT_ROW_GEOMETRY`
(90, east-west) and baked by the scene's own convention, so their rasters stand.

## 22. Move is a mode, a corner drag keeps the rectangle, and an answer option is a figure

**A drag in the 3D view.** On the garden itself, a hand reaching for the
camera grabbed a plot corner and reshaped the plot ("that was extremely unintuitive"), which also
dropped the finished layout search, since `patchBoundary` treats a boundary edit as a size edit.
The move gizmo on a selected bed was "this little square thing" nobody could name a purpose for.
The mode this asks for is plain: the camera holds still and what you drag is the garden.
And on the wants step the translucent array drawn as the pointer crossed the options was "too
much or something, you don't know why it's doing it", and stayed on screen on
the panels step for an answer already given.

**The rules.** Four toolbar modes: Select looks around and picks, Move drags beds, panel rows
and plot corners with the camera holding still (zoom stays), Draw plot and Draw bed as before.
The plot's corner handles exist only in Move mode. `TransformControls` is gone, with its
translate/rotate select and the persisted `gizmo` field; a bed and its plants move together
(`useGroundDrag`), the store is written once on release, and `dragging` still keeps the ground
from clearing the selection under a drag. A corner drag on a rectangle resizes it with the
opposite corner held (`movedCorner`), so "This boundary is not a plain rectangle" is now only
ever true of a shape drawn by hand. The ghost preview, its layer, its store field and the
`onPreview` hook on `ChoiceGroup` are deleted; each option on the wants step carries "Room for
N rows of panels" from the same `candidatesFor` the search starts with (`option-rows.ts`). The
selected bed wears a white outline, and the bed labels hide whichever of them would print over
a nearer one (`BedLabels`).

**What was not changed.** Rows are still one array: dragging a single row apart from its
neighbors is not offered, on the assumption that a row wants its symmetry kept.
Rotating a bed by hand went with the gizmo; the array's row azimuth field remains.

## 23. A Tier C light figure cites the class methodology, and the four Tier A rows went looking for their trials

A pass over the crop catalog's provenance
found 112 rows citing `fao-ecocrop` for their daily light integral, five more citing it by name,
and the schema default carrying it too, weeks after record 7 had called that attribution false
and fixed. ECOCROP holds no light integral; its light field is a descriptor. The rows' own
comments and section 3.6 of the horticulture document say where every Tier C class came from: the crop's
conventional garden sun label, converted into a band by this app's own arithmetic in section
3.3. So the only work behind a Tier C figure is the class-range methodology (Purdue HO-238-B-W
and VCE SPES-720NP), and that is what every Tier C row now cites: the `C` citation set in
`rows.ts` is the methodology set, the schema default dropped ECOCROP, and the inferred record's
basis says in one sentence that the class is the app's own reading of the sun label. The UI
sentence "nothing was measured for this crop" became "no cited work measured it for this crop",
because for spinach the first was untrue.

**The four Tier A rows.** Lettuce (leaf and head), spinach and basil carried tier A while citing
that same methodology, which `rows.ts` itself says cannot support an A. Per-crop trials were
found and each verified against Crossref before it was added: Both, Albright, Langhans, Reiser
and Vinzant 1997 (Acta Horticulturae 418: 45-52, the origin of Cornell's 17 mol/m2/d, the figure
read from the Cornell CEA Hydroponic Lettuce Handbook by Brechner and Both because the abstract
is served to no automated fetch); Kelly, Choe, Meng and Runkle 2020 (Scientia Horticulturae
272: 109565, lettuce at 6.9, 10.4 and 15.6); Pennisi et al. 2020 (Scientia Horticulturae 272:
109508, lettuce and basil at 5.8 to 17.3, optimum 14.4; the DOI this work was first handed,
10.1038/s41598-020-71399-8, resolves to a chinchilla paper and was not used); Dou, Niu, Gu and
Masabni 2018 (HortScience 53(4): 496-503, basil at 9.3 to 17.8, 12.9 suggested for production);
Walters and Currey 2018 (HortScience 53(9): 1319-1325, basil at 7 or less against about 15);
Gao, He, Ji, Zhang and Zheng 2020 (Agronomy 10: 1082, spinach at 11.5 to 20.2, optimum 17.3).

None of the trials places a failure point, so a Tier A minimum here is the lowest level at
which a cited trial still grew the crop, or the level a trial recommends for production, and
the row carries that definition on the record as the verbatim caveat (`dliCaveat`), which the
UI prints beside the number. Lettuce is 5.8 / 14.4-17 on both rows (Pennisi's floor, Pennisi's
optimum, Cornell's target); basil is 12.9 / 14.4-17.8 (Dou's production level, Pennisi's
optimum, the top of Dou's range). Spinach went to Tier C: Gao's lowest level is a plant-factory
setting and bounds nothing a garden bed offers in spring, so the row keeps its sun-label 6 /
14-20 and cites the class methodology, with the trial recorded in the corpus and in the horticulture document. The
catalog is now 3 A, 4 B and 167 C of 174 rows, and the polyculture engine's measured floor
moved from 6 to 5.8 with lettuce.

**Tomato and strawberry in the horticulture document.** The table's tomato row still read 14 / 22-30 A and its
strawberry row 10 / 17-22 A/B, against shipped rows of 15 / 20-30 C (Runkle 2011) and 25 /
25-30 C (Widmer 2026). The table now follows the rows for tomato, both peppers, cucumber,
lettuce, spinach, basil, strawberry and raspberry. The strawberry 10-versus-25 blocker of record
7 is closed with a source on each side: the Ohio State Kubota Lab's greenhouse guidance
(`kubota-osu-strawberry-dli`, url-verified) recommends 12 as a greenhouse-productivity minimum
and 20-25 as the optimum, and reports stress above 30; Widmer's 25 is the level that maintains
trial-average yield under agrivoltaic cover. They are different quantities. The gate uses
Widmer's because it is the agrivoltaic one, the OSU 30 is the top of the row's band, and doc
04's 10 was a sun-hour guess that resembled neither. The OSU page is also the first strawberry
light ceiling located; wiring it needs a cited ceiling in the schema, which today carries only
the lettuce tipburn rule, and is left for a later change.

**Study counts on the yield band.** Each Laub group already carried its study count in
`laub.generated.ts`; the band's attribution never said it. It now reads "dominated by crop
response: the leafy vegetables curve, 4 studies (Laub et al. 2022)", from `cropResponseLabel`,
on the yield band and in `formatYieldEstimate`.

**Constants with no source.** The water model's basal coefficient is FAO-56 chapter 9
(equations 97 and 98) with one departure, the catalog's per-habit extinction coefficient in
place of FAO-56's 0.7; the comment on `canopyCoverFromLai` says so, and the per-habit leaf area
index and extinction coefficient are declared through `unsourcedClaim` (`HABIT_CANOPY_CLAIM`) so
they appear in the sources step's ledger. The ranking weights (light 0.35, climate 0.25, soil
0.15, interaction 0.1, competition 0.1, preference 0.05) carry a comment saying what each term
is and why the order, and `WEIGHTS_CLAIM` puts them on the same ledger under a new
`model-constant` area.

**Eleven tropical and subtropical staples.** Cassava, taro, greater yam, plantain, upland rice,
lemon, mango, papaya, pigeon pea, sesame and moringa; chickpea was on the list and was already
in the catalog. Every envelope is transcribed from the crop's ECOCROP data sheet, which the
FAO app now serves at `dataSheet?id=<EcoPort code>`, the code named in each row; `coldC` is the
sheet's killing temperature during rest and is omitted where the sheet has none; the Köppen list
is the sheet's climate zones read through a stated Trewartha table (Ar is Af and Am, and so on),
which brought Af into the catalog without touching the archetype lists. Growth figures name
their sheet: UF/IFAS for mango, papaya and lemon, NC State's plant toolbox for cassava, taro,
plantain and lemon dimensions, Duke's handbook at Purdue NewCROP for cassava and rice, the
Wisconsin and Minnesota Alternative Field Crops Manual for sesame, the USDA NRCS plant guide for
pigeon pea, WARDA's upland rice handbook, CTAHR HGV-18 for taro, Wilson's IRETA yam guide and
two UC ANR notes for moringa. Rooting depths for cassava, rice, sesame, plantain and lemon are
FAO-56 Table 22 midpoints, read from the chapter itself. Native ranges were computed from the
WCVP archive with the generator's own matching rules (11 of 11 matched; lemon is native
nowhere, as a cultigen is) and spliced into `native-ranges.generated.ts` by hand, because the
generator also rewrites `public/data` and its manifest, which this change had no reason to
touch. Three figures are the app's own and their comments say so: papaya's 3 m picking height,
moringa's 3 m pruned height and sesame's 0.3 m spread.

**Twenty corpus entries were added**, every DOI verified against Crossref before use, every URL
fetched and read, and none invented; the count stands at 212.

## 24. Apache-2.0, a site's own season and clock, a global weather cache, and no figure sharper than its evidence

**A pass over everything before sharing** the app with researchers, growers and
gardeners anywhere: a night of measurement found it solid and honest as
a prototype, and short of that in a list of specific ways. Every item on the list was fixed the
same night. GitHub CI, which the account's billing had stopped on 2026-09-09, runs again since the
repository went public on 2026-09-12; deploy is Workers Builds on push.

**License.** Code is Apache-2.0, docs and data CC BY 4.0, third-party data under its own terms
(`LICENSE`, `LICENSE-DOCS`, `NOTICE`, `CITATION.cff`). Open core stays possible under it: the
owner holds the copyright and can sell a closed tier on top; what the choice decides is that a
competitor may host the public part closed, and that outside contributions arrive usable
without a contributor agreement. The one consequence in code: the Dynamic chill model had been
ported from chillR, which is GPL-3, so it was rewritten from Fishman, Erez and Couvillon 1987
with the paper's symbols and checked bit for bit against the old output on 206 series.

**The season is the site's.** The bed-light word, the plan's shade figures and the app's own
compliance estimates read a fixed April to September (`SIM_GROWING_WINDOW`), so a Melbourne
garden was summarized over its winter. They now read `growingWindowFor(site, percentile)`: the
months from the last spring frost to the first autumn frost at the chosen exceedance
percentile, wrapping the year end in the south, the whole year where the record holds no
frost, the three warmest months where no frost-free stretch exists. The layout search reads the
same window. Regimes with statutory months (Massachusetts, March to October) keep their own. The
fixed window survives only as the fallback before a site resolves. Amherst's window moved from
April to September to May to October at the default percentile, so figures on the example moved
with it.

**The clock is the site's.** The timezone was `round(longitude / 15)` with an `Etc/GMT` label:
wrong by half an hour in India and by an hour or more across Spain, France and western China,
and blind to daylight saving. The daily normals request now asks Open-Meteo for
`timezone=auto`, which also aggregates daily minima by local day, and the IANA name it answers
with is the site's zone; `utcOffsetMinutesAt` reads the offset for each instant through `Intl`,
cached per day, in the water balance, the skydome windows and the compliance clock. The
longitude rule remains only where no zone is known. The Rust decomposition still takes one
standard offset at its boundary.

**A default says it is one.** A failed SoilGrids lookup returned pH 6.5 loam stamped `'user'`,
which the bed panel hides, so a default read as the gardener's own soil test. The default's
source is `'default'` and the panel says "Assumed pH 6.5 loam: the soil map has no answer for
this place yet." Hardiness ratings computed from the weather record read "USDA-style, worked
out from the weather record" rather than "(USDA)".

**Normals have a fallback and the cache is global.** One Open-Meteo 429 on the daily normals
failed the whole site resolve even when the hourly leg had succeeded; the normals now fall to
NASA POWER daily data from the visitor's own browser, named as the source. Behind the Worker,
Open-Meteo's allowance is pooled across every visitor (about 600 weighted calls per fresh place,
10,000 a day), and the edge cache was per data center; a KV namespace (`WEATHER_CACHE`) is now
the second tier, written only on a 2xx that reached the upstream, so one town costs the
allowance once for the whole deployment. NSRDB was a dead fallback because the upstream requires
an email the client never sent; the Worker injects `NSRDB_EMAIL` the way it injects the key.
The proxy refuses more than 120 requests a minute from one address, and four security headers
ride every response and `public/_headers`.

**The picture is the plot.** The light overlay was a plane over the bake's extent, which was
the panels and beds plus five meters and never the plot ring, so the map spilled past the plot
and missed its edges. The extent now unites the plot ring, and the overlay is the plot's own
shape with UVs into the raster, discarded where the raster has nothing. Nothing tells a
visitor whose browser lacks WebGL2 or WebAssembly what is wrong; a preflight now does, in the
canvas's place, and a boundary around the whole app replaces a blank page with a sentence and a Reload button. The canvas has a name a screen reader can say, the mode buttons say which is
pressed, arrow keys nudge the selected bed or row in Move mode, and a rectangular bed has width
and length fields.

**No figure sharper than its evidence.** The seasons step printed a land equivalent ratio to
two decimals from a sum of means while the same quantity was banded on every other surface, a
harvest to the percent from a random draw, and energy to the kilowatt-hour. The ratio is a band
built from the per-planting published bands, harvests read "about 60% of full yield" beside
their published range, and energy and money read to two significant figures. The yield band
names the Laub group's study count beside the citation, because a professor should see that 61
greens sit on a four-study curve without opening a file. Record 23 covers the catalog side.
Electricity prices exist only for US states, so a typed tariff and currency (and, outside US
dollars, a typed installed cost, since the cost benchmark on file is in 2020 US dollars) now
carry the economy block anywhere, stamped `'user'` like a typed pH.

**Not done.** Translation into other languages; a field validation against a real garden,
which the README still says has not happened; and the shipped examples, which are re-baked when
the catalog settles.

## 25. What is around the space reaches the light, a plant of cold winters is refused one that has none, and a place says how it grows

Three cold visitors on real weather (Nairobi, Mumbai, Sydney) each got a ranked
crop list in five presses and about fifteen seconds, and the list they got was temperate in
judgment: eastern teaberry and western wild ginger, North American woodland perennials, headed
the shaded bed in Nairobi and in Mumbai as Recommended; the answer to "What is already around
the space?" changed nothing in the ranking; the starting array faced south in Sydney; and no
sentence anywhere said whether a place as a whole was one most of the catalog could live in.
Each was fixed the same day, with the measurement that found it.

**The surroundings answer dims the light every bed is judged by.** The answer reached only the
layout search, which spent less of the shade budget on panels for a shaded space; the bake holds
no house, fence or tree, and the ranking read the bake. One table now serves both readers
(`src/recommend/surroundings.ts`): a space shaded part of the day loses three tenths of the
open-sky light before any panel does, one in shade most of the day six tenths, both this app's
own reading of a three-answer question and declared unsourced on the sources step. Every bed's
under-array figures are dimmed by that share when a bake lands and when the answer moves, the
open-sky reference is left alone so the relative shade ratio compounds by itself, the layout
search judges its candidates' crops on the same dimmed light, and the ranking re-runs when the
answer changes. The light step says what was taken off and that the map on the ground shows the
panels' shade alone. The shade budget the search spends is unchanged in number: it is now
written as one minus the same share.

**A plant recorded wild only where winters are cold needs a cold winter.** Ramps, western wild ginger and
eastern teaberry carry a cool-perennial envelope whose growing-season temperatures a highland
tropical site meets in every month, and nothing in the envelope says they need the winter they
come from: the hardiness gate asks only whether winter is too cold. The three rows carry
`coldWinterOnly`, on their recorded ranges (Chamberlain 2014, FEIS, WCVP), and a gate refuses
them where the coldest month averages above the top of the chilling band, 7.2 C, the same
figure the chilling-hours metric counts under. The gate runs last, so a desert July still
refuses ramps on the envelope, as before, and the winter is named only where the envelope would
have admitted the plant. The place step's verdict counts these under "colder winters".

**A climate fit under the marginal line holds a crop back on its own.** The total is a weighted
sum, so a bed that lit and drained western wild ginger well carried it to Recommended at Mumbai
on a climate fit of 0.05: the hottest month sat a fraction inside the envelope, the gate passed,
and light and soil outvoted the climate. Liebig's law already decides the gate; it now decides
the verdict too, and the row reads Limited with the limb of the envelope that bites.

**Equal scores are ordered by their evidence.** At a frost-free site twenty-odd crops of the
kind a grower asked for fit the light, the climate and the soil and tie on score. The tie note
already said so; among equals the crops whose light threshold was measured now come before the
class-level inferences, and the note says that too.

**The starting array faces the equator.** Only the layout search set an array equator-facing;
the starting array faced south everywhere, which in Sydney is away from the sun. A place that
resolves south of the equator turns an array still on one of the two starting directions, and
never one somebody pointed by hand.

**A place says how it grows.** Under the frost sentence on the place step, two sentences from
figures the app already had: how much of the catalog passes the climate gate (graded most,
about half, few, with the count and what the rest would need), and rain against what a garden
would use, from the FAO-56 balance. Light isn't in it, because light is a fact about a bed.

**Eight staples the catalog lacked.** Pearl millet, grain sorghum, mung bean, teff, olive,
avocado, arabica coffee and dessert banana, transcribed from their FAO ECOCROP sheets at Tier C
like the other tropical rows. A verified public copy of the ECOCROP table stood in for the FAO
service, whose data sheets answered with a server error that day; the catalog's own cassava
row matched that copy figure for figure.

**The fallback clock, the soil map's edge, two rainy seasons, and a window that is the whole
year.** Where the weather service names no zone, the clock is the nearest tzdb zone to the
point, within the country the geocoder named where it named one, rather than the longitude
rounded to whole hours, which put Nairobi an hour out; tzdb records one point for all of India,
so without the country the nearest point to Mumbai is Karachi's. The place step says which
basis the clock has. Where SoilGrids answers nothing at the point, which is the
center of nearly every town, a ring of four points three kilometers out is asked, then six,
and the reading says how far away it was taken. The rainy-season sentence names every run of
wet months, so Nairobi's two rains are both named. A sowing window that spans the year reads
"any time of year" rather than a pair of dates.

**A later lookup wins.** Found while photographing the fixes: two place lookups in flight at
once (the boot lookup of the example's town and a search typed within seconds of opening) had
no guard, so whichever finished last was the place on screen, and the soil ring made the boot
lookup slow enough to lose. A visitor who typed Mumbai quickly got Amherst's ground under
Mumbai's weather. The store's lookup carries a token now, and an answer that lands after a
later lookup began is dropped.

**Not done.** Nothing of this list any more: the house and the tree that replace the
three-answer share are Record 26, built. The olive row now carries a chill figure, 150 hours, cited to De Melo-Abreu
et al. 2004 and Sahli et al. 2012, and the three example gardens were re-baked against the 182-row
catalog: Amherst's beds 2 and 4 gained teff, and Bergen's bed 3 traded sorrel for good king
henry.

## 26. A house or a tree is drawn on the ground, and the bake shades with it

**Decided 2026-09-13; the house and the tree built 2026-09-14.** The three-answer surroundings
share of Record 25 dims every bed by the same fraction whatever stands where. It stood in for
what the bake did not hold: the house next door, the shed, the tree at the fence. A flat share is
wrong in sign and in season. A house north of the beds shades nothing in the northern hemisphere
and still cost them a third of their light; a house south of them shades in winter and hardly at
all while crops are in the ground (at Amherst a 6 m eave throws 13 m at noon in December and 2 m
in June), and the share took 30% off June instead. This record fixes what replaces it.

**What is drawn.** Two kinds of obstruction, each a box. A house is a rectangle on the ground with
a wall height, opaque. A tree is a crown box between a canopy base height and a top, on a trunk
the bake ignores, with one transmittance in leaf and another leafless, and a switch for a tree
that keeps its leaves. A box may stand anywhere on the 240 m ground the scene draws, inside the
boundary or outside it, because the building that shades a garden is mostly next door. Both are
added from the ground step beside the surroundings question ("Add a house", "Add a tree"), then
moved in Move mode the way a bed is, a corner drag keeping the rectangle (Record 22), nudged
with the arrow keys, or placed by typing the center, the two sides, the heights and the turn on
the same step. The defaults, this app's own: a house 10 by 8 m and 6 m to the eaves, drawn 2 m
outside the boundary on the side that faces the equator so its shadow crosses the plot when the
sun is low; a tree with a crown 5 by 5 m from 2 m up to 7 m, deciduous, 8 m east of the house's
spot, its two figures the cited defaults below and editable on the card with the source beside
them.

**How the bake sees it.** A house becomes five quads, the top and four walls (`houseQuads` in
`src/sim/obstruction.ts`), appended to the list the panels already travel in, which is typed as
what a kernel reads off a panel: four corners and nothing else (`Occluder`). The CPU reference
kernel, the Rust kernel it is held to and the WebGL2 shader's ray-quad loop shade with it
unchanged: both backends already treat a panel as opaque (the kernel's transmittance argument is
passed 0 everywhere the app calls it), so a house needed no new physics and no shader change.
The sky-view factor and the diffuse term read the same visibility test as the beam, so a wall
darkens all three at once. The open-sky reference stays the closed form over no occluders: the
house's shade lands in the under-array layer only, the shade ratio compounds house and panels
the way Record 25's share compounded, and the shade budget then checks the crop's total shade
against its tolerance, which is the accounting Record 25's scaled budget approximated with a
table. A reference baked over the house alone was considered and refused: it would have made the
bed bands and the yield curve blind to the house's shade. The layout search sees the house
because it reads the baked raster, and every candidate plot the search bakes carries it. The
tree is the one new thing in the kernels: every quad may carry a transmittance, a blocked sample
keeps the smallest transmittance among the quads that block it, and a ray through both faces of
one crown counts once. A crown is six faces with the tree's pair on each, and the trunk is
ignored. Panels and house faces carry 0, so nothing already measured moves: the min rule
collapses to the old test wherever every quad is opaque. The leafless season is a set of months,
because the bake accumulates by month: a deciduous crown is in leaf during the site's growing
window at the median frost percentile (the growing-window rule now lives in the sim layer,
`src/sim/growing-window.ts`, and the data layer re-exports it), and each month's light is
accumulated from the crown's in-leaf figure or its bare one, the annual being the sum of the
months. The sky-view factor and the time windows read the in-leaf figure whatever the month, a
declared approximation: the one window shipped is the growing season, which the leaf-on months
follow closely. The CPU backend runs a second visibility pass with the bare figures only when a
deciduous tree is drawn; the WebGL2 shader carries both figures in a fifth texture row, keeps
two running minima in one loop, picks the month's variant by a bitmask, and leaves the path
without a season byte for byte as it was; the Rust kernel takes a per-quad transmittance slice
beside its scalar.

**What it replaces.** While a plot has no house and no tree the share of Record 25 applies as
before. Once one is drawn the share is not applied anywhere, the drawn geometry being the
answer: every reader of the answer goes through `exposureInForce`, which returns the open answer
while anything stands, so the bed light, the layout search and the shade budget agree. The
question is disabled on the ground step with a sentence saying why, the light step's note names
what was drawn, and the plan card says so. The question stays: it is the answer for anyone who
won't draw, and the share table with its unsourced claim stays declared on the sources step. A
house keeps beds and rows out: the layout search never places a bed or a candidate row inside
one, and a hand placement that overlaps gets a sentence on the check step; drags are never
blocked. A tree restricts no placement: a bed may stand under a crown.

**Where it lives.** `GardenPlot.obstructions`, schema 4 to 5 with an empty list for every saved
garden and for the three shipped examples, a decoder that admits a four-corner house with a
positive height or a tree with a crown above its base and two figures between 0 and 1 (a tree
is a second kind inside the same list, so it needed no schema step), and `lightGeometryKey` and
the worker's memo key carrying the list so a moved or altered obstruction re-bakes by itself.
The ground step's controls are `ObstructionsSection`; the scene's `HouseMesh` and `TreeMesh`
draw the same boxes the bake shades with, so the picture holds nothing the bake does not (Record
14.5). The house casts the scene's live shadow the way a panel does; the crown's opacity is one
minus the transmittance the bake applies in the month the scene clock shows, and its shadow is
dithered to the same density, since a shadow map casts all or nothing. The three example gardens
ship none, so their rasters, `exampleGridMatches` and the overlay baseline stay where they are.

**The figures and their sources.** A house has no figure. A tree's two defaults are 0.033 in
leaf and 0.46 leafless, the midpoints of what Konarska et al. 2014 measured under five street
trees in Göteborg (Theoretical and Applied Climatology 117:363-376): "Average transmissivity of
direct solar radiation through the foliated and defoliated tree crowns ranged from 1.3 to 5.3 %
and from 40.2 to 51.9 %, respectively." Heisler 1986 (Urban Ecology 9:337-359) is the
cross-check: a mid-sized sugar maple cut the irradiance on a wall in its shade by about 80% in
leaf and nearly 40% leafless, a wall figure that also counts sky and reflected light and so
reads higher than a crown's own transmittance. Canham et al. 1994 (Canadian Journal of Forest
Research 24:337-349) is the closed-canopy comparison, under 2% of full sun beneath beech and
hemlock and over 5% beneath red oak and ash, lower than a lone tree as expected. The figures are
direct-beam transmissivity applied here to beam, diffuse and sky view alike through a solid box,
which the entries' caveats say. The months a crown is in leaf, the site's growing window at the
median frost percentile, are this app's own reading and are declared on the sources step the
way the share table is.

**How it is checked.** A house fixture in `rust-geometry-parity.test.ts` holds the TypeScript and
Rust kernels to the same shadow cell for cell with a wall in the grid, and `webgl2.test.ts`
carries the same house for the shader where a browser runs it. `obstruction.test.ts` reads a
6 m house's shadow on the side away from the sun out to the height-over-tangent throw and clear
past it, and its sky-view factor lower a meter from a wall than clear of the house, where it
equals having none. A pipeline case bakes the same plot with and without a house: the open-sky
layer is identical and the bed beside the wall darker. The memo the worker answers repeat bakes
from is keyed on the house too: `probe-bake-backends.mjs`, run against a preview build with a
12 m house a meter south of the first bed, first read the houseless field back on both backends
because that key lacked the house while the staleness key had it; with the key fixed, the
WebGL2 and CPU backends agree to the digit on all three geometries (87, 42 and 54% of open sky
bare; 29, 24 and 52% with the house). `house.spec.ts` draws a 10 m house a meter south of the
example's bed 1: its light falls from 99% of open sky and 32.9 mol/m²/d to 38% and 17.4, tomato
leaves Recommended for Not suited, the house survives a reload at schema 5, and removing it
gives the surroundings question back. Persisted gardens at schema 4 round-trip with an empty
list. The tree's checks: a crown at 0.3 directly over a panel reads 0 on the ground beneath
both and 0.3 where only the crown shades, and a ray through two faces of one crown reads 0.3
once; with July in leaf and January bare, the CPU backend's July beam under the crown is the
in-leaf figure times the open one and January's the bare figure times it, and the annual beam
equals the sum of the twelve months; the parity fixture carries the crown at 0.3 through both
kernels with the per-quad slice, and the WebGL2 fixture carries it with half the months bare;
the pipeline case pins a leaf-on month's ratio under the crown below a bare month's; the Rust
crate has its own min-rule test; the memo key changes when a tree is added, its figure edited or
its evergreen switch flipped; a tree round-trips through storage and one whose top is below its
base is refused; the crown's opacity in the scene reads the in-leaf figure in a July hour and
the bare one in a January hour; `tree.spec.ts` draws a 12 m crown over the ground south of the
example's bed 1 and reads its light falling, the note naming the tree, the tree surviving a
reload and Remove giving the question back. The probe's fourth geometry, a 12 m crown over the
default plot's first bed, reads 58, 33 and 51% of open sky on both backends, eight real bakes
posted. The overlap rule has its own cases: two rectangles that touch along an edge do not
overlap, a plus sign of two thin rectangles does, a placement inside a house is skipped and
named, a candidate whose rows run through a house is dropped and the search says so, and the
check step prints the sentence for a bed inside a house. Four scripted runs drove a preview
build on stubbed Amherst weather (a laptop and a phone, a garden with an old maple in it, and
a run that checked every figure against the sources): all four found "Add a house" and "Add a
tree" under "What shades it" unaided, read the disabled question's sentence as clear, and got
figures that hold up. The run against the sources matched the tree's 3% and 46% to the paper's own
range. What the runs found and what changed: the disabled radios still looked bright and checked,
so a disabled group now fades; a selected house or tree in the 3D view showed only a tint, so
its card on the ground step lights up; and "show this work in Sources" from a card on another
step left the reader at the top of the list, because the stepper holds the opened step's header
in place for a moment and undid the jump's scroll, so the jump now settles that landing before
it scrolls (`landing.ts`). The measured figures and the assumed leaf calendar sat side by side
on the tree's card with a citation on the figures alone, so the card now says the calendar is
this app's own reading.

**Cost.** One day for both, against the four to five estimated: the house needed a type and five
quads, a schema step, one function every reader of the answer goes through, a card of six fields
and one mesh on the bed's pattern; the tree needed the per-quad figure in three kernels, the
seasonal split in two backends, the citation pull, a second card and a translucent mesh; the
overlap rule needed one polygon test and two filters.
