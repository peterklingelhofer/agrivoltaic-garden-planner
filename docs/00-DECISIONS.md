# Decision record

The modelling decisions behind the app, and what each one rests on. Where another document in `docs/`
disagrees with this file, this file wins. Every source named here has an entry in the citation corpus,
`docs/CITATIONS.md`, with its machine-readable record in `docs/CITATIONS.csl.json`.

## 1. Scope

| Axis | Decision |
|---|---|
| Architecture | Static frontend plus a thin Cloudflare Worker for proxying and caching |
| Geography | Global |
| Light simulation | Full annual DLI map |
| Design scale | One garden: beds, a few dozen panels, a single site |
| Surfaces | 3D canvas, plant recommender, the layout search of record 10c |

## 2. Physics and model choices

### 2.1 Ground shading: per-panel polygon projection

Explicit per-panel polygon projection along the solar vector is the production ground model, because
edge rows dominate at garden scale and a finite array needs the explicit projection: Zainali et al. 2023
(Applied Energy 339:120981) validate it at R^2 0.99-1.00 against PVsyst, 0.3% daily error.
`pvlib.bifacial.infinite_sheds.vf_ground_sky_2d` is a unit-test oracle for the degenerate infinite-row
case and reaches no user path.

The PV chain is a separate surface and does ship infinite-row formulations on the user path:
`rear_poa_wm2` in `crates/agv-sim/src/pv/bifacial.rs` takes the unshaded ground fraction as `1 - GCR` (Marion et al. 2017), and
`row_self_shade_fraction` in `crates/agv-sim/src/shading.rs` shades every row alike. A three-row array is nearly all edge, so both understate
rear-side gain and overstate row-shading loss. The overstated row shading costs 0.13% of the year on the
shipped default array at its wide 9 m pitch, and the understated rear gain is unquantified, a known
limit.

### 2.2 Ray tracing: a validation reference only

`bifacial_radiance` takes 12.7 to 88 h against 2 to 4 min for view factors, with no gain in
annual-aggregate accuracy (Grommes et al. 2023, EPJ PV 14:11). Radiance and Ladybug are validation
references and stay out of the runtime.

### 2.3 One sky model for the PV plane and the ground

Perez et al. 1990 (`allsitescomposite1990`) transposes irradiance to the plane of array, chosen
because it is the sky model behind Radiance `gendaymtx`. PV yield and the ground DLI map read one sky
radiance distribution.

### 2.4 Solar position: NREL SPA, with SunCalc for UI chrome

SPA (Reda & Andreas 2008, NREL/TP-560-34302) is ported from `pvlib/spa.py` (BSD-3) and validated to
under 0.001 deg. Accuracy is the justification: a 0.05 deg declination error moves a 4 m structure's
shadow tip about 0.4 m at 5 deg elevation, three cells on a 12 cm raster. One SPA evaluation costs about
6 us, so a year of 8760 takes about 51 ms, baked once into a Float32Array.

SunCalc covers sunrise, sunset, twilight and moon chrome only, exposing no air mass, radius vector or
refraction control. Geometric elevation (shadow casting) and refracted elevation (horizon UI) stay
separate values, and azimuth uses the `atan2` form, which keeps afternoon shadows on the correct side.

### 2.5 Decomposition as an optional adapter

Open-Meteo, PVGIS, NSRDB and CAMS all ship GHI, DNI and DHI. DIRINT (Perez et al. 1992) covers hourly
input, Engerer2 with Bright & Engerer 2019 coefficients covers sub-hourly, and Erbs et al. 1982 is
the fallback. The adapter is inert when the source provides all three components.

### 2.6 DLI as the primary plant filter

USDA zones encode winter minimum temperature alone, a category error for annual vegetables. Hardiness
gates perennials, chill gates fruit, and growing degree days against season length gate annuals. DLI
gates everything, and it is the discriminating variable this app computes.

### 2.7 Under-panel air and soil temperature: not modelled

No under-panel air or canopy temperature is derived, and no crop gate reads one. The measured effects
are about a degree and differ in shape by site.

| Site | Air temperature under the array |
|---|---|
| Arizona, semi-arid | about 1 C cooler by day, 0.5 C warmer at night (Barron-Gafford et al. 2019) |
| Germany, temperate | daily mean about 1.1 C lower both years, most in summer, higher on 7 days in 2017 and 18 in 2018 (Weselek et al. 2021) |
| Oregon, temperate | significant at 1.2 m and 2.0 m, while "magnitudes smaller" than the 3 to 5 C some simulations predicted (Hassanpour Adeh et al. 2018) |

Soil cooling in summer is the one consistent result. Soil water flips sign by site, which Weselek
attributes to the other two sites being irrigated. An effect of about a degree whose shape changes by
site cannot stand behind a planting date.

Two consequences run against intuition. An array cuts daytime warming along with night-time cooling,
reducing degree-days and DLI together. So fewer frosts do not buy a longer, warmer season or let any
region finish a crop it could not finish before. `src/recommend/frost.ts` is worded and tested to
refuse that inference. Milder nights also reduce chill, which `chillGate` reads for perennials, so a
"panels keep it warmer" adjustment would quietly fail the fruit trees. A measured frost-margin or
degree-day figure for a bed under an array would change this, and no accessible source gives one, in
degrees or in damage incidence.

### 2.7a Sky view factor: reported, with nothing derived from it

The bake (the annual light simulation over the ground grid) computes a per-cell sky view factor for
the diffuse light and the ground-to-module inter-reflection. It is aggregated onto `BedLight` and
read by `src/recommend/frost.ts`, whose on-screen sentence states the geometry and names the
direction: less sky in view is less longwave loss on a still clear night, the mechanism Oke 1981
establishes for street canyons and the one a frost cloth uses. That sentence says explicitly that
this is no help against advective frost (Snyder & de Melo-Abreu 2005) and claims no temperature.
Site frost dates, degree-days and chill are untouched.

### 2.8 Electrical and grid modelling: out of scope

No grid, inverter-sizing or interconnection model is built. The energy side stops at the PV chain's
annual yield and at the LER electricity term, whose formulation follows Dupraz et al. 2011.

That term's denominator is stated verbatim in `REFERENCE_DEFINITION` (`src/sim/pv/ler.ts`): a sole-use
monoculture-equivalent fixed-tilt plant on the same land, GCR 0.40 with 0.35-0.45 as band width,
equator-facing, tilt equal to site latitude clamped to 10-35 deg, DC:AC 1.20, and modules, inverter and
loss stack identical to the agrivoltaic array, both sides in annual AC kWh per m2 of land where land is
module aperture over GCR. Identical hardware isolates the design decision of pitch, tilt, clearance and
tracking.

## 3. Physics constants and formulas

- PAR fraction of GHI: 0.45 by energy, inside the 0.42-0.50 the literature gives (Meek et al. 1984,
  Britton & Dodd 1976, Jacovides et al. 2004 measured 0.451-0.456, to 0.501 hourly under overcast).
- Photon conversion: 4.57 umol/J in-band (McCree 1971), about 2.06 umol/J composite on broadband.
- `DLI (mol/m2/d) ~= GHI (MJ/m2/d) x 2.06`, or `x 7.4` for kWh/m2/d.
- Module-to-ground inter-reflection: `E / (1 - rho_g (1 - SVF) rho_m)`, an instance of the two-surface
  enclosure radiosity result `B = (I - rho F)^-1 E`. The mathematics is standard and the form is this
  app's own derivation: pvlib's `infinite_sheds`, Marion et al. 2017, the Sandia PVPMC ground-reflected
  page and PVsyst all carry single-bounce terms only. The 3-8% magnitude quoted for white backsheets is
  unverifiable and labelled as such, since no source states it and the published figures that resemble
  it measure other quantities.
- Penumbra, derived from geometry with no citation to make. Across the ray the width is `d *
  tan(0.533 deg)` at slant distance `d`, and 0.533 deg, the Sun's mean angular diameter (31.99
  arcmin, 0.524-0.542 deg over the year), is the full limb-to-limb angle, so the formula takes no
  factor of 2. The width is 3.72 cm at 4 m overhead, 7.4 cm at the 8 m slant of a 4 m edge at 30 deg
  elevation. On the ground along the sun's azimuth it is `h * tan(0.533 deg) / sin^2(alpha)`, which
  at h = 4 m gives 3.7 cm at the zenith, 4.5 at 65 deg, 9.0 at 40 and 14.9 at 30. That sits under
  the 12 cm cell near noon and exceeds one cell below about 33 deg, where the hours carry little
  energy, so annual DLI ignores it. The constant holds for the annual integral alone, and for no
  instantaneous or edge-detail rendering.

## 4. Resolution requirements

- Timestep 15 min or finer, 5-10 min preferred. Beam shadow bands sweep about 0.25 deg/min, and
  hourly steps smear cell-level extremes.
- Ground grid 0.25 m or finer cross-row, 0.1 m at bed scale.
- Weather input is a **TMY** (typical meteorological year), because the sign of the shade effect
  flips between normal and drought years and a single year carries one sign. Weselek et al. 2021
  measured potato at -18.2% (p = 0.005) and winter wheat at -18.7% (p = 0.03) in 2017, against a
  potato gain of +11% (p = 0.034) and a wheat gain of +2.7% that is not significant (p = 0.78) in
  the 2018 drought year. Amaducci et al. 2018 found maize gains only under rainfed stress.

## 5. GPU pipeline

Cumulative-sky daylight coefficients, the Radiance and Ladybug method, factorise time-invariant
visibility from space-invariant weather.

- Reinhart MF:2 gives 577 sky patches. The Tregenza 1987 145-patch dome stays in `skydome.ts` for
  tests that run coarse.
- The sun directions are a separate set, and the beam is never binned into 6 deg patches.
- 8760 h x 4 sub-steps dedupe onto a 2 deg grid, which yields 1569 unique directions.
- At 0.12 m cells (284 x 299 = 84,916 cells, 40 panels, MF:2, 4 sub-steps) the pass count is 2146,
  those 1569 directions plus 577 patches, for about 429 ms on the GPU and 0.9-1.0 s in total. A 3 deg
  bin or `n_sub = 2` brings the total toward 0.55 s. One second is the figure to plan against.
- 512^2 RGBA32F accumulation, where twelve monthly targets are nearly free.
- WebGPU compute ray casting where available, about 30 ms, with WebGL2 shadow maps as the baseline.

## 5b. Pipeline formulas and disclosed approximations

- The shade-free backtracking criterion is `acos(min(1, (P/W) sin psi))`. Deriving it from the
  shadow-width expression gives `sin psi`, which matches pvlib's `cos(tracker rotation)` because
  rotation = 90 - psi. A `cos psi` form fails both checks.
- Tracking arrays bake at their peak-elevation pose. The daylight-coefficient factorisation requires
  time-invariant geometry, so fixed tilt is exact, tracking is an approximation, and the UI discloses
  it.
- Engerer2 reads Haurwitz clear-sky GHI. Ineichen-Perez with Linke turbidity is the upgrade path.
- `'nrel-spa'` and `'michalsky'` are the real solar-position modes. `'psa'` and `'grena3'` throw,
  because a throw is safer than unvalidated physics.

## 6. Crop response model

Yield follows season-cumulative relative shade ratio (RSR), through the nine crop-group non-linear
curves of Laub et al. 2022 (Agron. Sustain. Dev. 42:51, 58 studies, 428 points). Instantaneous PPFD
never enters the yield term.

- RSR^2 is significant (p = 0.0015), so a linear "% shade = % yield loss" is statistically wrong.
- RSR x crop type is significant (p < 0.0001), so crop group is a required input.
- Shade type (panels, cloth, nets) is not significant, which licenses proxy data from shade-cloth
  studies.
- Yield at 40% RSR, from Table S2: berries 114.1%, fruits 113.3%, fruity vegetables 102.5%, forages
  93.2%, leafy vegetables 85.8%, C3 cereals 61.9%, tubers and roots 60.8%, grain legumes 50.4%, maize
  45.3%.

### Model form and coefficient provenance

`log10(Y/100) = b1*RSR + b2*RSR^2`, RSR in percent, forced through the origin so that 0% RSR gives
100% yield and the intercept is structurally zero for every group. Table 1's reduced model eliminates
the RSR^2 x crop-type interaction (p = 0.3932), so b2 is shared across all nine groups and only b1
varies by group.

b2 = -7.3293e-05 per (%RSR)^2. b1 per %RSR: berries +4.35911e-03, fruits +4.28533e-03, fruity
vegetables +3.19481e-03, forages +2.16180e-03, leafy vegetables +1.27197e-03, C3 cereals
-2.27979e-03, tubers and roots -2.47235e-03, grain legumes -4.50551e-03, maize -5.65256e-03.

These coefficients are **derived**, cited as derived from Laub et al. 2022, because Laub publishes none in the article, the supplement or the Zenodo dataset. They were recovered
algebraically from the 162 published Table S2 points plus the verbatim model specification, reproduce
every point to within 0.07 pp, and an independent per-group fit of b2 returns -7.33e-05 for all nine.
The data carries this distinction and the UI shows it.

### Shade benefit

`laub.generated.ts` carries two quantities generated from Table S2: `benefitPeakRsrPercent`, the RSR
of the highest tabulated prediction, and `benefitPhaseEndRsrPercent`, the last level the table
classes as benefiting. Generating both from the table keeps the paper's prose figure for fruits out
of either field. The paper's own Table S2 contradicts that figure by five RSR points. C3 cereals
never benefit and tolerate shade to 50% RSR.

| Group | Peak %RSR | Benefit phase ends at %RSR |
|---|---|---|
| Berries | 30 | 55 |
| Fruits | 30 | 55 |
| Fruity vegetables | 20 | 40 |
| Forages | 15 | 25 |
| Leafy vegetables | 10 | 15 |

Any "shade improves yield" pathway is gated on two flags.

- **Water limitation**, because every published gain in this corpus comes from a hot, dry or
  irrigated-arid site: Barron-Gafford's Sonoran plot, Amaducci's rainfed drought simulations,
  Weselek's 2018 drought year. Zhang et al. 2025 find the same clustering across 20 countries, where
  the climates reporting an increase "share some main features: hot summers, limited precipitation
  and (semi-) arid conditions". No published work stratifies a shade-response curve by water status,
  and none can from this literature, since Laub et al. 2022 excluded any trial applying a treatment
  other than shading without applying it to the control, reduced irrigation included. The pooled
  curves are blind to the interaction, so the 100% yield ceiling on a site without water limitation
  is a floor-of-evidence choice: it predicts no gain where the mechanism the literature names is
  absent, and claims no size for the gain where it is present. It can do nothing for maize or grain
  legumes at any shade level, because neither curve reaches 100%, a property `docs/VALIDATION.md`
  section 3 measures.
- **The shade the bed actually has.** `shadeBenefitBonus` scales with `cumulativeRsr`, the axis the
  Laub curves and `maxDesignRsr` are both written on, so the bonus grows with the shade exactly as the
  yield response it stands for does. Scaling on site heat and the water-limitation index alone would
  hand the full bonus to every shade-tolerant crop standing in open sun.

### The fruity-vegetables curve is three studies

Bell pepper under nets, sweet pepper under cloth, both subtropical, and squash. No tomato is in it
and none of the three is under panels, so the +8% it predicts at 20% RSR for a tomato is an analogy.
The field trials in the corpus measured the other direction: Mata et al. 2026 at Bridgeton found
yield lower in every row nearest the array, and Ben Naim et al. 2025 found a significant tomato
yield loss at 16.5% and 19.3% season shading with none at 8.6% and 11.9%. The catalogue's tomato,
pepper and cucumber rows carry that as their caveat.

### DLI thresholds (mol/m2/d, min -> target, max design RSR)

| Class | Min | Target | Max RSR |
|---|---|---|---|
| Understory herbs | 2-4 | 4-10 | 60-75% |
| Leafy greens | 6 | 12-17 | 40-50% (tipburn >17 for a month) |
| Forages / C3 pasture | - | - | 45-50% |
| Cane/bush berries | 15 | - | 30-35% |
| Strawberry | 25 | - | 10-30% (Widmer's own range, collapsed to 10%) |
| Brassicas | - | 12-17 (inferred) | 30-40% |
| Root/tuber | none established | - | 15-25% |
| Solanaceae | 10-12 | 20-30 | 20-25% temperate, to 40% arid |
| Cucurbits | - | 20-30 | 20-30% |
| Alliums | none established | - | <=15% (bulb thickening light-limited) |
| Legumes (grain) | - | - | <=10% |
| C3 cereals | - | - | <=15% |
| Maize / C4 | - | - | <=10% |

Strawberry is split from Laub's lumped berry group on the authority of Widmer et al. 2026, a 21-site
Swiss study and the only source expressing APV limits directly as DLI.

The 20% ceiling on Solanaceae and cucurbits rests at Tier B on Zhang et al. 2025, whose segmented
regression finds no statistically significant yield difference from the control below 20% shading
(p = 0.084), lower yield from 20% to 30% (p < 0.01), and recommends shading from PV "preferably not
exceed 20%". That regression pools crops, and its crop-resolved fits are corn, beans and lettuce, so it
supports a design figure across crops and resolves no Solanaceae of its own.

## 7. Uncertainty policy

The dominant error is agronomic. Laub's 95% **confidence** interval for fruity vegetables at 40% RSR
spans 67.2-156.1% around a 102.5% point estimate, so an optics model accurate to 1% feeding it is false
precision.

Table S2 tabulates 95% confidence intervals. Laub computes prediction intervals and draws them only as
grey lines in Fig. 3, so this app does not hold them, and every band in the UI is labelled a confidence
interval. The authors' caveat is that plot-scale uncertainty is large and the confidence intervals are
the more valid estimator at country or continental scale. A single-garden user sits at that plot scale,
and the UI says so. CIs are symmetric on the log10 scale, so bands interpolate in log space.

- No yield number renders as a single point. Bands render.
- The UI attributes the band to the crop term explicitly.
- Seasonal cumulative PAR carries +/-10%.
- Most per-crop DLI values are Tier C inferences. Ordinal ranking is reliable, and the absolutes are
  provisional and labelled as such.

### What the DLI gate rests on

12 of 18 crops checked have no mol/m2/d figure in any accessible peer-reviewed or Extension source:
all seven temperate tree fruits, plus melon, watermelon, tomatillo, winter squash and pumpkin. Okra
has a treatment level and no target. Orchard literature gives light as a percentage of full sun or
as instantaneous PPFD, never as a daily integral. Three consequences reach the UI.

1. Those values are class-level inferences, marked Tier C, uncited because no source exists. FAO
   ECOCROP holds no DLI values, and Faust & Logan 2018, which maps the United States in 5 mol/m2/d
   bins from 0-5 through 60-65 and reviews crops in prose, holds no per-crop table, so no threshold
   cites either.
2. Purdue's 10-15 and 15-20 mol/m2/d ranges (Torres & Lopez, HO-238-W) are greenhouse plug production
   figures, and the 10-12 minimum traces there too, so they guide no mature garden plant.
3. Runkle 2011 is the source of the vine-crop 15 the tomato, pepper and cucumber rows cite, and
   Runkle 2019 writes "in my opinion, there is no such thing as a DLI requirement", since guidelines are
   subjective, situational and vary with shade tolerance. DLI is this app's primary gate, so the
   disclosure is on screen and cites him. Thresholds are design guidance.

`src/ui/dli.ts` reads the evidence of the applied threshold off the crop's own `Cited` record, so each
readout marks whether the number that excluded a crop was measured or inferred.

The gate has a floor and almost no ceiling. Lettuce is the only crop with a published upper bound:
Cornell's CEA handbook reports tipburn as light-limited at 12 to 17 mol/m2/d depending on cultivar
and airflow (Brechner & Both 2013, Both et al. 1997). The model carries 17 as
`dliMaxBeforeDisorderMolM2Day`. A season mean above it lowers the light score, and a whole month
above it is flagged, since monthly light can't test a rule counted in days. No source bounds any
other crop from above, and none flags a species as shade-requiring. `dliTargetHigh` is a range top:
tomato's 15/20/30 renders Runkle's "15, preferably >20". A shade-tolerant crop scoring well on a
bright bed is no error in the light term, and the climate envelope is what rules a woodland
perennial out of a desert garden. Ramps are the case in point: the USDA National Agroforestry
Center's forest-farming note (Chamberlain et al. 2014) has them needing sun early in the season and
liking shade once it is over, with no DLI figure. Both limits are on screen in the DLI evidence
panel.

The "at least 22 mol/m2/d" tomato figure is ReduSystems vendor marketing, republished uncited by
hydroponics and LED vendors, and appears nowhere in the catalogue. Some base temperatures still trace to
secondary sources, while sweet corn's 10/30 C is confirmed against NDSU NDAWN and the cool archetype's
4.4 C base is defensible.

## 8. Compliance overlays

Every overlay is an estimate, and no overlay is a determination. The types make one unrepresentable:
`Verifiability` has the single value `'estimate-only'`, criterion outcomes are `meets` and `misses`, an
`approximate` outcome carries a window disclaimer, and a regime verdict is `meets-expedited-parameters`,
`requires-exception-request` or `indeterminate`. A test pins that no rendered string says compliant,
non-compliant, pass, fail, approved or rejected. Verdicts read "meets the expedited design parameters"
or "would require an exception request".

**Massachusetts SMART 3.0**, 225 CMR 28.00, term of art Dual-use Agricultural STGU. Parameters verbatim
from 28.07(5)(b)3.b:

| Parameter | Threshold |
|---|---|
| Sunlight | at most 50% reduction of baseline field conditions, on every square foot beneath, behind and adjacent to the design, wider than the array footprint |
| Fixed tilt | 8 ft minimum height at the lowest panel point |
| Tracking | 10 ft at the horizontal position, 8 ft where the sunlight test is met in all tilt positions and the farm operator controls the tracker |
| Capacity | 5,000 kW AC, DC at most twice AC and at most 7,500 kW DC |
| Window | Growing Season Hours (28.02): April to September 9 AM to 6 PM, March and October 10 AM to 5 PM, half-open bounds |

Three facts each make it an estimate. DOER mandates its own Shading Analysis Tool, so an independent
engine has no standing whatever its accuracy. The regulation leaves open whether the 50% is
cumulative over the window or worst-instantaneous. Every parameter is waivable under
28.07(5)(b)3.b.iv, so a miss becomes an exception request and is no property of geometry.

The raster accumulates the window at a 15-minute timestep on the local clock, daylight saving included
where the weather series names the site's zone, and reports the worst cell of the cumulative window. The
clock basis is an explicit assumption, since the regulation's "9 AM" names a wall clock, and a `'solar'`
basis measures the other reading. A raster baked without the window falls back to those months with no
hour restriction, over-counting early and late daylight, and says so. `nameplateDcKw` is a DC quantity
from module watt-peak, branded `KilowattsDc`: the AC cap and the 2:1 DC:AC ratio are `not-applicable`
for want of an inverter model, and the 7,500 kW DC ceiling is a real check.

**DIN SPEC 91434:2021-05**, against the full 26-page text: 66% of reference yield (5.2.10), 2.10 m
clearance for Category I only (6.4.2), none for Category II (5.2.2), usable-area loss to structures at
most 10% Category I and 15% Category II (5.2.3), reference yield a three-year average or three rotation
cycles for arable rotations (5.2.11). Category I is elevated with crops under the panels, Category II
near-ground with crops between rows. It sets no numeric light-homogeneity threshold (3.8 is
qualitative, 5.2.5 asks only for homogeneity "as high as possible"), no GCR cap and no minimum row
spacing, which 6.4.4 disclaims outright.

| Regime | Thresholds |
|---|---|
| Japan MAFF | 80% of regional average yield, 2 m clearance |
| Italy DM 436/2023 | at least 70% of area agricultural, 2.1 m for crops, 60% producibility ratio, with no LER > 1 requirement |
| France décret 2024-318 | 90% of the yield of a control zone of at least 5% of area capped at 1 ha, 40% maximum coverage |

Every yield threshold here is defined on measured agricultural yield, which geometry cannot establish,
so each such criterion is labelled as requiring field agronomy.

## 9. Data chain

Open-Meteo is the primary weather source, the one global, keyless, CC BY 4.0 source returning GHI,
DNI and DHI. The Worker proxies it, with PVGIS v5.3 (which forbids AJAX by written policy), NREL
NSRDB (for key secrecy, at `developer.nlr.gov` as GOES TMY v4.0.0), Nominatim, Photon and the EIA
retail price, and caches weather by latitude and longitude rounded to 0.01 deg. NASA POWER,
SoilGrids and Overpass stay browser-direct, CORS verified.

Bundled static, detailed in `docs/STATIC-LAYERS.md`: the official 2023 USDA PRISM hardiness grid, the
published 5 arcmin Köppen aggregate (Beck et al. 2018), NRCan's 4th edition Canadian zones under the
Open Government Licence Canada, FAO ECOCROP at about 2568 species, and frost normals. No official USDA
hardiness API exists.

PFAF and Permapeople are CC BY-SA, which is viral, so each is isolated behind a boundary or excluded,
and Trefle is unusable after repeated shutdowns. No open, well-licensed horticultural attribute database
exists, which makes the roughly 200-crop table curated from public-domain Extension publications the
ownable asset.

### 9a. Hardiness schemes are never crosswalked

A USDA zone is one variable, the mean annual extreme minimum temperature. An NRCan zone is a score on
a seven-variable index (Ouellet & Sherk 1967, reinterpolated by McKenney et al. 2001 and 2025) that
includes frost-free period, summer rainfall, maximum snow depth and maximum wind gust. The two
disagree in both directions depending on which term dominates locally, so no table maps one onto the
other and none may be written.

The type enforces this. `HardinessRating` is a discriminated union where `TemperatureHardinessRating`
carries `extremeMinTempC` and `CompositeHardinessRating` declares `extremeMinTempC?: never` and carries
the zone plus the index terms the source supplies, so assigning a temperature to an NRCan rating is a
compile error, pinned by a `@ts-expect-error` in the type tests.

Deriving a winter minimum from ERA5 for a Canadian point is no crosswalk, because it measures the
quantity USDA measures, and it is what the code does wherever the PRISM grid has no coverage. So a
Canadian site carries two independent ratings. The ERA5-derived temperature rating gates, because
`siteExtremeMinC` reads only temperature schemes. The NRCan zone informs and displays as its own
readout, never blended into a single number, with copy saying the two are not comparable.

### 9b. Elevation read from the weather record

A site's height above sea level comes from the weather record the site already fetches. Open-Meteo's
archive body names its `elevation`, PVGIS names it under the location it echoes back, NASA POWER
writes it as the third coordinate of the point it answered for, and an NSRDB or uploaded CSV names
it in the metadata header, so `elevationOfPayload` reads whichever spelling the source used. It is
null where a body names none. The site readout then says so, and the solar position falls back to
the sea-level reference. A genuine 0 m stays 0 m. One fetch carrying both numbers means a fresh
lookup needs no elevation service: a separate DEM API inside the same `Promise.all` as the weather
would fail every fresh lookup whenever that one host is unreachable.

## 10. Recommendation pipeline

0. Site resolution (geocode -> lat/lon -> elevation, climate normals, TMY)
1. Hard climate gate: hardiness (perennials), chill portions (fruit), GDD against the season
   (annuals)
2. **Light gate**: per crop x bed x month, against the crop's own growing window, with a bonus where
   a shade-benefiting crop meets many heat days
3. Soil and water
4. Mature-footprint fit
5. Interactions: rotation as a hard constraint, companions as a soft score
6. Rank, always exposing the limiting factor

Chilling Hours, Utah Chill Units and Dynamic Chill Portions are computed separately, because
Luedeling & Brown 2010 find the Dynamic model the strongest and the three not interconvertible, with
the CH/CP ratio spanning 0 to 34. ECOCROP suitability uses trapezoidal membership with a minimum
across parameters, which yields the limiting factor for free. Soil pH is left out of that minimum:
it is a fact about a bed, and the soil stage scores it against the bed's own soil.

### 10b. Crop-vs-crop compatibility and polyculture suggestions

Stages 1 to 6 compare one crop against the site. `src/recommend/compatibility.ts` compares two crops
proposed for one bed, so the tool cannot co-plant blueberry with a brassica at pH 6.5 to 7.0. It
runs after the per-crop pipeline and never re-gates a crop. Eight terms, each from data already
held, each with its own verdict, citations and grade:

| Term | Source | Hard conflict when |
|---|---|---|
| Soil pH | the two ECOCROP `soilPh` trapezoids intersected | tolerated ranges disjoint, or optima disjoint and either span within `HARD_PH_ENVELOPE_WIDTH` |
| Water regime | FAO-56 Table 22 depletion fraction `p`, plus `droughtPenaltyFor` | never: one bed, one schedule, so a wide gap is a management warning |
| Root stratification | `RootProfile` depth and stratum | never |
| Canopy tier | `assignCanopyTier` | never |
| Light overtopping | Beer-Lambert on the taller crop's LAI and k, by bed area share, against the shorter crop's `dliMin` | the shorter crop falls below its own DLI minimum |
| Shared pest or pathogen | `RotationConstraint` by family | the shared family carries a rotation constraint |
| Documented companion | `ScoreableCompanionRule`, via `ruleAppliesInContext` and `ruleEffect` | never |
| Allelopathy | grade C, D and E rules of an allelopathy kind | never: it warns without scoring |

Disjoint optimum bands are reconciled with a compromise soil pH only where both envelopes are
preferences. Blueberry's envelope is physiology: it is the only crop of 163 optimising below pH 6.2,
and section 3 of `src/recommend/stages/soil-water.ts` reads its span of 4.0 to 6.0 that way. So
blueberry beside a brassica is refused outright, and the refusal names the pH 5.7 compromise neither
crop can live at.

`src/recommend/suggest.ts` takes required, preferred, avoided and excluded crops as a
`PreferenceSet` and returns ranked combinations. Space is a hard constraint: every crop gets one
plant's worth of bed at catalogue spacing before anything gets a second, and a combination whose
floor exceeds the bed is reported as not fitting, with the shortfall in square metres. A required crop the bed cannot grow refuses the whole set and names its limiting
factor. Yields stay banded, only the ranking scalar collapses a band, and
`src/ui/point-estimate.test.ts` pins the modules allowed to do that.

The canopy-tier term carries TEK rule 1 with its attribution inside the term, and rule 7 supplies
the LER weighting (record 12).

### 10c. Array design suggestion: the layout search

`suggestDesigns(answers)` turns `OnboardingAnswers` into a ranked `ScenarioSet`, because tilt,
pitch, clearance, row count and tracking are settings a novice has no way to hand-pick.

#### Candidates

Five archetypes in a fixed order: `food-first`, `balanced`, `energy-first`, `vertical-east-west`,
`no-array-control`. `mounting` filters the offered set and names every archetype it drops, and
`no-array-control` is always offered. Nothing is swept around the five, because each candidate costs
a full annual bake: a five-scenario run measures 1.4 s on a 10 x 7 m plot and 3.4 s on 30 x 20 m on
an M-series GPU, about 4.5 s a candidate on the CPU rasteriser. `ScenarioSet.notConsidered` says so
in its first line.

#### Derived geometry

Geometry is derived from the answers and the plot.

- Tilt, clamped to 10 to 35 degrees (`REFERENCE_MIN_TILT_DEG`, `REFERENCE_MAX_TILT_DEG`). `balanced`
  takes 0.75 of the site latitude, anchored on the energy rule of thumb near 0.85 of latitude and
  held below it because shadow length matters. `food-first` takes the tilt putting the least panel
  over the plot from overhead, arithmetic with no simulation in it (`groundLightPlan`, record 21).
  `energy-first` is the argmax of `runAnnualChain` over whole degrees of the band, so no sibling can
  beat it on tilt, and it tracks only when tracking wins. Ties go to the lower tilt, at one PV chain
  run per tilt and no light bake.
- Azimuth is equator-facing, from the hemisphere. `rowAzimuthDeg` is the direction the rows run
  (record 21).
- Shade. `AMBITION_SHADE_BUDGET` is 0.45 leafy, 0.30 mixed and 0.18 fruiting, off the max design RSR
  column of record 6, the fruiting figure set by strawberry, the tightest class it covers.
  `SiteExposure` scales it down, since a site already shaded has less to spend on panels. Each
  archetype spends a share, 0.55 food-first, 0.80 balanced, 1.00 energy-first, and that projected
  coverage with the collector width gives the pitch.
- Rows and row length come from the plot. `maxHeightM` is hard, spent in the order that costs the
  grower least: modules up the slope, then tilt, then headroom, each step named in the rationale.
  Lowering the tilt to meet a cap costs winter electricity: on a bare plane at 42.37 N, pvlib puts
  35 degrees ahead of 10 degrees by 14% over the year and 48% over December to February, which is
  what the cap's copy rests on.
- Clearance floors are DIN SPEC 91434 Category I (2.10 m) and the Massachusetts expedited 8 ft and
  10 ft, read from `src/sim/compliance.ts`.

The budget is spent on the footprint and then checked against the bake. `ScenarioFlags.shade`
carries the budget, the measured season-cumulative RSR and whether the one is inside the other, and
the card reports it either way. A projected coverage is an infinite-row figure, so a design sized
inside its budget can still be flagged on what its plot measures.

#### Evaluation

Every candidate is baked at `FINAL_OPTIONS`, the quality the editor runs, with the Growing Season
Hours window as one extra weight vector on the shared direction set, so the Massachusetts figure is
the regulated quantity. `siteSkyFor` in `src/sim/pipeline.ts` computes the solar positions,
decomposition and sky set once for all five bakes, and `MAX_RAY_TESTS_PER_DRAW` caps each WebGL2
draw so no command buffer outlives the GPU watchdog. The discretisation, 577 patches, 2 degree sun
bins and 0.12 m cells, is the one the app uses everywhere it reads light, so a gap the search
reports is the gap the editor shows and the ranking carries no tie band.

`landEquivalentRatio` is a portfolio sum over a fixed six-crop basket (`DESIGN_BASKET_SIZE`) of the
scenario's top-ranked admissible crops plus the electricity term, TEK rule 7's convention, and must
never be rendered as a two-term Dupraz ratio. `GeneratedBed.lostToShade` compares each bed against
the brightest bed of its own plot, minus that bed's own light-gate refusals, so it needs no second
bake and works on a hand-drawn garden. `cropsLostToShade` compares against the open-sky control,
baked first, so a crop the site refuses in full sun is never charged to the panels. `confidence`
never reaches `high`, because every path rests on the Tier C crop DLI absolutes of record 7, and it
falls to `low` where a scenario adds an approximation of its own: a tracked array, baked at peak
elevation, shade past the 40 percent level Laub et al. 2022 tabulate, a water-limited site, or a
basket whose thresholds are all class inferences.

#### Ranking

Four raw terms are min-max normalised across the set and combined with the `DesignObjective` weights
that the answers set: crop retention with light kept, annual AC kWh, the water the layout's own beds
save, and structural simplicity. An exact tie goes to the archetype named for the answers
(`namesakeOf`), then to archetype order. No band is collapsed, so `design.ts` stays off the
`unsafeBandMidpoint` allowlist.

The water term is the balance's own unirrigated deficit at the middle of the soil's available-water
range, area-weighted over the placed beds, as `1 - under / open`, from the rain field under the
site's rain-hour rose and the balance's monthly shade factors. A shade proxy would credit spring and
autumn shade on ground that is dry in July. The term takes no water-limitation weighting, since a
low index cancels it and a high one already agrees with shade.

#### Where a bed sits

Each bed slides onto the rain the rows shed, one at a time along the cross-row axis, to where the
balance says its plants would go short least (`slideBeds` in `layout.ts`). It stays within the room
that its light band, the working margin, the array's feet and its neighbours leave it. A bed keeps
the place the light gave it unless the move cuts the shortfall by a tenth or more
(`SLIDE_WORTH_FRACTION`), below which the balance's inputs cannot tell two positions apart. The step
is 0.1 m (`SLIDE_STEP_M`), half a drip strip's width in still air, and the judge is the water term's
own balance on the FAO-56 reference crop, since a bed being placed carries no planting. Where a
site's rain arrives along the rows, no bed's room reaches a strip. Choosing which piece of a shaded
band a bed goes in, by the strip that piece holds, is not built.

### 10d. Planting every bed: bed space and its block

`rankingChain` and `rankingRequirement` in `src/ui/requirement.ts` chain site, beds, light and
ranking, and `firstUnmet` offers a reader the first thing they can act on. `RequirementNotice`
holds the sentence and the press that settles it as one element, and the plants step shows it
where its cards would be while anything in that chain is unmet.

A guided apply and "Plant every bed" (`plantEveryBed`) plant through one function, `plantBeds` in
`src/state/store.ts`. Each bed takes a combination from `suggestPolycultures`, sized by
`allocateSpace`, the one-plant-each rule of 10b, splitting the surplus evenly. A combination whose
floor exceeds the bed does not fit and reports its shortfall (`suggest.test.ts`).

The beds are planted in turn, each with the others in view. Among the combinations that fit a
bed, `plantBeds` takes the one that places the most liked crops no bed holds yet, then the one
that repeats the fewest crops already growing in another bed, and it passes over a combination
another bed took while a different one fits. Solving each bed alone would give beds with the same
light the same crops.

## 11. Companion planting: evidence grades A to E

**A** = multi-site trials or meta-analysis with a characterised mechanism. **B** = replicated
trials, context-dependent or carrying management preconditions. **C** = single study or lab-only.
**D** = traditional, plausible, untested. **E** = no evidence, or contradicted.

Only A and B score. C renders as "experimental". D and E render only in a clearly labelled folklore
panel, and never affect layout.

| Claim | Grade | Note |
|---|---|---|
| Intercropping LER | A | 1.22-1.32 |
| Crop rotation | A | |
| Insectary strips | A for enemy abundance, B for pest suppression | |
| Marigold against root-knot nematode | A as a full-season cover crop, E as interplanted individuals | |
| Push-pull | A outcome, non-transferable | Erdei et al. 2024 (eLife 13:e88695) measured no adult repellency, and first-instar larvae preferred *Desmodium* tissue with none surviving to pupation on its silica-fortified hooked trichomes. The mechanism is interception and larval death, scoped to stemborers and fall armyworm. Striga is a different guild and chemistry, and this never carries across to it |
| Trap cropping | B | About 10 of some 100 systems succeed commercially, retention is the limiting step, and an untended trap crop is a pest nursery |
| Legume N transfer | B | Under 15% in the same season |
| Biofumigation | B | Only with maceration, under 1% ITC conversion otherwise |
| Juglone | C | Lab yes, landscape evidence weak |
| "Aromatic herbs repel pests" | E | Contradicted (Finch et al. 2003, Uvah & Coaker 1984). The mechanism is green surface area, and smell plays no part |
| Blueberry with lingonberry or the acid guild | D | Traditional. Its defensible content is the shared acid envelope, already the pH term, so the rule keeps the pairing from being silently upgraded |
| Sweetfern fixes nitrogen for a neighbouring blueberry | D | Ziegler & Hüser 1963 measure fixation in the nodule, Snyder's 1993 FEIS review an apparent effect on neighbouring little bluestem. Neither measures transfer to a blueberry, and Fabaceae figures do not carry to an actinorhizal shrub |

## 12. TEK-derived design rules

Seven rules of traditional ecological knowledge (TEK) from more than 20 documented systems, each
named and individually attributed in `src/data/tek.ts`.

| Rule | What it requires | Attributed to |
|---|---|---|
| 1 Vertical stratification | Two to four canopy tiers, each keyed to the modelled DLI at its height | Chagga home gardens of Mt Kilimanjaro and Javanese pekarangan gardens (Fernandes et al. 1984, Kumar & Nair 2004) |
| 2 Nurse plants | A data-model role for a microclimate-service species, distinct from a yield crop | Sahelian and Sudanian parkland communities, for Faidherbia albida and its reverse phenology (Roupsard et al. 1999) |
| 3 Wind and thermal buffering | Adjacent water, stone and hedge sized as first-class microclimate modifiers | Tiwanaku-era and pre-Inca waru waru builders, and the Aymara and Quechua using the revived technique (Kolata & Ortloff 1989) |
| 4 Water-harvesting geometry | A sunken basin and inert mulch per plant, beds sited on the array's drip line and runoff shadow | Zuni (A:shiwi) waffle gardens and Mossi zai pits, with Yacouba Sawadogo credited for the zai revival (Elamri et al. 2018) |
| 5 Temporal succession | Each crop growth stage paired against the array's seasonal and diurnal shade | Japanese communities practising solar sharing, with Akira Nagashima its named inventor (Sekiyama & Nagashima 2019) |
| 6 Landraces | Named landraces as distinct plantable entities with their own trait annotations | Sidama, Wolaita, Kambata and Gurage peoples of the southern Ethiopian highlands (Mueller 2025) |
| 7 Portfolio yield | A plan scored on aggregate output and a land-equivalent ratio, labour cost beside it | Haudenosaunee (Iroquois) nations, and Quechua and Aymara communities for the historical vertical archipelago (Mt. Pleasant & Burt 2010) |

The dehesa and montado distance gradient is a geometry-derived stand-in for distance-from-panel-edge
modelling. Montero, Moreno & Bertomeu 2008 (Agroforestry Systems 73:233-244) fitted intercepted
light against distance from the trunk as a logistic curve, R^2 above 0.88, with radiation constant
beyond 20 m. Their coefficients are paywalled, so the paper is cited for the shape of the light half
alone. Every magnitude is this app's own: the endpoints follow the published direction, the ten
intermediate samples are interpolated, and `DEHESA_GRADIENT_CAVEAT` says so on screen. The
soil-moisture half rests on no distance function, since that literature reports discrete
beneath-canopy and beyond-canopy zones (Moreno & Pulido 2009 and Simionesei et al. 2018 carry the
endpoints).

### Attribution rules (hard product constraints)

- Attribute to specifically named peoples. Never a generic "indigenous".
- Distinguish a historical or archaeological system from living practice.
- Credit named individual innovators (Nagashima, Sawadogo, Khan) separately from communities.
- Never claim a community endorsement that was not sought.
- Ship no merged, unattributed "ancient wisdom presets" feature. Pan-indigenous generalisation is
  the named failure mode, and a Zuni water rule and a Chagga tier rule are not interchangeable.
- Published literature is citable under normal scholarly norms. The CARE Principles and the Nagoya
  Protocol bind an app encoding community-held seed genetics or ceremonial calendars. This app holds
  only published trait descriptions.

## 13. Stack

three 0.185.1 / @react-three/fiber 9.6.1 (v10 is alpha) / @react-three/drei 10.7.7 / three-mesh-bvh
0.9.13 / three-bvh-csg 0.0.18 / suncalc 2.0.1 / zustand 5.0.14 / immer 11.1.15. Vite + React 19 + TS
strict. One Cloudflare Worker serves the static build as assets and proxies the upstreams. The physics is a Rust core compiled to wasm (`crates/agv-sim`),
on unless `VITE_RUST_CORE=off`, which leaves a build that cannot compute at all.

`src/sim/` is framework-free: zero three.js and zero React imports, so the physics is unit-testable
with no GL context. That boundary is hard, and `src/sim/boundary.test.ts` enforces it.

Testing: `bun test` for pure math, the bulk of coverage, on every commit.
`@react-three/test-renderer` for the scene graph, asserting primitives because object identity is
unstable across renders (vitest#4207). Playwright for e2e, naming its GL backend explicitly,
swiftshader on a CI runner and metal on darwin, since GPU rendering is not deterministic across
drivers.

## 14. The simulation mode of the designer

The designer answers "what is the best layout for this site", the simulation answers "what happens
if I try this here", one season at a time, as a mode of the designer. What keeps the two from
disagreeing about one garden is that **the simulation calls the functions the recommendation
calls**, on a `Site` computed for the year (`siteForYear`), with a history the ground remembers.
`src/simulation/` is the layer, pure, between `recommend` and `state`.

### 14.1 A measured year drives a simulated season

Record 4 holds for the designer: its input is a TMY and its yield bands come from one. The
simulation runs on a measured year, because the sign of the shade effect flips between normal and
drought years (Weselek et al. 2021 on potato, Amaducci et al. 2018 on maize). The measured years are
the ten the TMY was assembled from, kept beside it by `normaliseWeather` with the rain that fell in
them. A `SeasonReport` names its year and is never a recommendation. Light stays the typical-year
bake, because a season's shade ratio is geometry. The year varies frost, heat, rain and evaporative
demand through `siteForYear`.

### 14.2 What a season may invent

- The realised harvest is a seeded draw inside the crop-response band, Record 7's confidence
  interval, uniform in log space, and a garden replays from its seed. The harvest share is the mean
  over every planting planned, a refused one counting zero like a frosted one, because the standing,
  the land equivalent ratio the garden reaches over its seasons, is per bed of ground.
- Pests: the spatial term is the `undersown-cover-host-finding` mechanism, that non-host green area
  dilutes host finding, the year term is the year's degree-days over the typical year's, and the
  share of a harvest lost at full pressure is the mode's one unsourced number, declared through
  `unsourcedClaim`.
- Water, frost and season length: the drought penalty on the year's water index with the bed's
  irrigation, and the year's two dates with `siteMaturityDays`, through `seasonAnchors` and
  `frostHardy`.
- Rotation: `rotationViolation` on a real history, by family. A standing perennial is checked only
  in the season it is planted.
- Companions: `ruleAppliesInContext` at every grade. A and B rules apply as measured, minus their
  competition penalty. C rules do nothing the numbers can see. D and E rules are hypotheses (14.3).

The economy sits below the standing in its own block, never in the verdict or a score. Money is
rounded to two significant figures, and nothing is discounted, converted or projected, because no
source gives a rate. Build cost is a band across the three PV + crops structures Horowitz et al.
2020 benchmarks, since nothing here measures which one a garden array is:

| PV + crops structure | $ per watt DC |
|---|---|
| Vertical mount | 1.83 |
| Tracker stilt mount | 2.09 |
| Reinforced regular mount | 2.33 |

That is installed cost only, 2020 US dollars, a 500 kW benchmark over eight US states, no financing,
operations or revenue. Its smallest modelled system is 200 kW and cost per watt rises as size falls,
so a garden sits below the smallest size on its curve, and costs more per watt by an unstated
amount. A year's electricity value is the season's AC generation at the residential retail price of
the site's US state (EIA Electric Power Monthly Table 5.6.A, through the Worker), null wherever no
price reaches, which is everywhere outside the United States. A grower may type a tariff and an
installed cost in the currency they name. Payback is the cost over one year of electricity,
undiscounted, null where either side is missing or the currencies differ. A retail price is a buying
price, and with net metering, time-of-use rates and export tariffs unmodelled the value assumes each
kilowatt-hour displaces one bought. Labour is a count of the applied rules' `requiresManagement`
tasks.

### 14.3 The one place a folklore claim acts

Record 11 and `docs/ARCHITECTURE.md` 3.4 stand: grade D and E rules cannot move a layout, a score or
a recommendation, and the types enforce it. The simulation is the one place they act, and only on a
`PlantingOutcome`, which no score consumes. Whether a claim is true in a garden is a seeded draw at
even odds, made once and never shown, and a contradicted claim is false in every garden. Where a
claim is true, its size is the median measured effect of the A and B rules of the same interaction
kind, so no effect size is invented. After three seasons of a trial the literature is offered. The
outcome is labelled a simulated hypothesis wherever it shows, because blurring "tested here" with
"endorsed" would claim an endorsement nobody sought, which Record 12 forbids. A trial is read
against the harvested plantings of the same seasons that did not run the rule, and where every bed
ran it the panel says so.

### 14.4 Units and names

A season is a year's growing season, and rotation intervals, trials and the ground's history are
counted in seasons. The mode is called the simulation, in code and on screen. `src/sim/` is the
physics of one year's light and `src/simulation/` is the garden over years, and both names stay
because renaming the physics would cost more than the confusion.

### 14.5 The picture follows the season

A season moves the scene's clock to the year that was run, keeping the grower's day and hour, and a
reset puts it back. The plants' age is the greater of the `plantYear` slider and the seasons run,
bounded by `MAX_PLANT_YEAR` and derived where the scene reads it (`gardenAge`). A season leaves the
light alone, which is the whole of 14.1: its shade ratio is geometry off the typical year, so moving
the clock is a calendar move and no measurement. The sun over a given day hardly moves between
years, so the calendar move is a small approximation.

Pressing Run sweeps the clock from the year's last spring frost to the day the grower was on, over
three and a half seconds, and the outcome lands when it ends (`ui/useSeasonSweep.ts`). Nothing is
re-baked, and `prefers-reduced-motion` lands the outcome at once. The light overlay is hidden while
the seasons step is open, because it buries the plants, and the grower's setting is untouched. The
outcome is drawn to be seen: a frosted planting lies flat and bleached, a refused one is not drawn
at all, and a bed short of water shows paler, warmer topsoil (`driedBy`), every tint a multiplier on
a reflectance.

The weather is the record's, and only on the seasons step. After a season has run, the scene shows
that year's own hour: its cloud, read as the clearness index of the measured sun against a clear one
(`src/sim/clearness.ts`), drawn on the sky dome and taken off the key light's intensity, its rain as
a point cloud at the hour's own rate, and snow from that year's monthly normals. Off the step all
three revert and the sky's cloud stays at zero, because the designer's picture claims nothing about
an hour's weather.

## 15. The test runner and the rules it imposes

`bun test` runs the suite, and every `package.json` script passes `--parallel`, which implies
`--isolate`: without it one module registry is shared, so the panel tests' refusal of the embedding
module leaks into `embedding.test.ts`. `test:dom` preloads `test/dom.ts`, because react-dom caches
at module load whether it is in a browser, and a late import leaves controlled inputs silently
ignoring typing. The preload also binds the jsdom window's three `EventTarget` methods onto
`globalThis`. The `src/scene/` tests run in a second pass with no DOM, because
`@react-three/test-renderer` patches `getContext` wherever `HTMLCanvasElement` exists. Under bun's
fake timers a reference captured before `useFakeTimers` never fires, so progress rides the microtask
queue (`test/vi.ts`). `test/setup.ts` prints through `reportError`, since bun rethrows what a React
boundary caught, and redirects `@huggingface/transformers` to the web build wherever the weights are
absent, since its `node` condition dlopens native addons. The two agent panel tests refuse it, and
the holdout tests keep the native build. `test/bun-test.d.ts` widens three matchers, since bun types
`expect(x).toBe(y)` against the type of `x` and the ids here are branded. `REQUIRE_AGENT_MODEL` is
opt-in and never inferred from `CI`.

## 16. Root depth limits a crop

`roots.maxEffectiveDepthM` is FAO-56 Table 22's Zr (Allen et al. 1998), the effective rooting depth
the water balance works from, whose note says the smaller values apply in restricted soils. It is no
minimum soil depth, so a bed shallower than Zr limits a crop: `spaceStage` passes it with a
`limiting` factor (`cause: root-depth`, membership `depth / Zr`, "Roots would reach X m in deep soil
and this bed offers Y m, so it will need watering more often"), and `pipeline.ts` carries that
factor into the marginal chain beside the light and soil ones. The plants step's raised-bed remedy
reads a marginal verdict as well as an exclusion. Below `ROOT_DEPTH_FLOOR_M` (0.20 m) the crop is
excluded, because a tray of seed compost is not a bed.

## 17. One column of guided questions

There is one flow: the sidebar stepper, ten steps whose titles are the questions, one open at a
time, each ending in `Next: <the next question>`, and a first visit opens on step 1. On a phone the
column is the Plan tab, the 3D view is the Garden tab, and a pinned strip on Garden says which step
Plan is on. A second surface over the same garden would give a second answer to the same question.

The place resolves when a result is chosen. The light computation runs after the place resolves and
after every settled geometry change (`useAutoLight`). The ranking follows the light and holds while
one is computing, so a guided planting is ranked once, against the finished light. A press is never
silent: a combination prints what it planted or why not beneath its own button, and the old ranking
stays up while the next one runs (`ranking` on the slice).

Most growers reach the plants step with every bed planted, so it leads with one card per bed (the
mix, the counts, a confidence word and two buttons), then the chips for what you like to eat, the
combinations for the selected bed, and folds for "Pick plants one at a time" and "Every crop ranked,
and why". `plantEveryBed` plants the plot through the code a guided apply uses, and no bed repeats
another's combination.

Combinations lead with food: the crop each combination starts from is a food crop (`role === null`),
and the growing answer reaches the suggester and the ranking as a preference for the classes it
names (`ambitionPreferences`). Plot size has one source, the plot boundary. The answers and the open
step persist with the design.

Known limits: the layout search places beds only in the bright strips when the plot is narrow, so a
plot can come back with no shaded bed. The frost headline at the 50th percentile reads three weeks
earlier than the extension date growers use. The pair reasoning prints the same soil-pH sentence for
nearly every pair.

## 18. A bake upload names its texture unit

`uploadTexture` in `src/sim/gpu/webgl2.ts` names the unit it binds on. Binding on whichever unit is
active would let sky directions be read as `uPanels`, so the shading would follow the panel count.
The WebGL2 and CPU backends agree to the digit. The parity test in `src/sim/gpu/webgl2.test.ts` is
skipped wherever WebGL2 is absent, so `scripts/probe-bake-backends.mjs` is the check after any
change to the GPU path.

## 19. A tall perennial waits to be asked for

A perennial (life cycle `perennial` or `woody-perennial`) whose typical height is above
`BED_PERENNIAL_HEIGHT_M` (2 m) is orchard scale. It joins a combination only when the grower names
it, through a `prefer` or `require` entry, and its refusal says so where a card folds ("hops grows
to 6 m and stays for years, so it joins a bed only when you ask for it"). The growing answer's lean
(`ambitionPreferences`) leaves such crops out, so a `prefer` entry can only be the grower's. The
stratification term otherwise rewards a combination for holding a tall tier over a low one, and hops
stands 6 m on a permanent trellis, three years to a first harvest. Blackberry and aronia (2 m) stay,
the smaller berries fall under the line, and sunflower, sweet corn and pole bean are annuals and
untouched. The per-crop ranking and the one-at-a-time picker still offer them all. Height is the
test because `yearsToMature` cannot answer: the catalogue defaults every perennial to three years,
so chives and mint match hops.

## 20. Fall-harvest dating, and weeks of picking

A crop marked `fallHarvest` in the catalogue (brussels sprouts) is dated from the autumn end. Its
one sowing is the latest that finishes its harvest by the first fall freeze at the chosen
exceedance, the indoor start counts back from that, and no spring sowing is offered. Where the fall
sowing would fall before the spring floor, the spring dates stand and a note says so. Peppers and
eggplant carry their own soil floor of 18 °C (`minSoilTempC`), over the warm archetype's 13 °C. The
fruiting annuals carry their weeks of picking as `harvestDays`: tomato, the peppers, eggplant,
tomatillo and okra 60, summer squash 50, cucumber and pole bean 45, cowpea 30, bush bean 21. A
tender crop's harvest is cut at the first fall freeze, so a tomato's closes at the frost. The winter
squashes, melons and pumpkins keep the catalogue's default fortnight: they are cut once.

Known limits: every cool-season crop shares the archetype's spring offset, so an April in a cold
climate has a dozen jobs on one day. The succession schedule sows peas into June. Where the heat
supply stretches days to maturity, a melon's harvest can land in late October.

## 21. Row azimuth is the direction the rows run

`rowAzimuthDeg` is the direction the rows run, everywhere. A fixed row facing the equator runs east
to west (90). A north-south tracker axis and a vertical east-west-facing wall both run north to
south (0). The beds are laid across (cos, -sin) of it. Every candidate's rows sit inside the plot
(`design.test.ts`).

Measured on the CPU reference backend at 42.4 N with ground rows, season RSR falls as tilt rises at
one row count, 0.256 to 0.243 to 0.218 on 16 by 12 m at 10, 20 and 35 degrees, and on 30 by 60 m the
flattest tilt fits four rows at 0.221 where 20 degrees fits five at 0.264. Each row's overhead
footprint, `collectorWidth * cos(tilt)`, is nearly the whole of the effect, and the height a steeper
panel adds is a small term.

`groundLightPlan` minimises that overhead, with nothing simulated. The panel over the plot from
overhead is `rows(tilt) * cos(tilt)`, and it is not monotonic: rows fall with a flatter tilt as the
pitch opens, while each row widens. The band is walked a degree at a time and the least overhead
wins, the flatter of two equals. The rationale sentences say what the arithmetic does, and the
figure to read is the measured light beside the design.

The sizing footprint (`GCR * cos(tilt)`, an infinite-row figure) bounds nothing a finite plot
measures, from either side: 0.217 against 0.165 on the 12 m test plot. `flags.shade` reads the
measured ratio, and sizing the pitch to a measured target is open.

## 22. Move is a mode, and an option carries a figure

Four toolbar modes: Select looks around and picks, Move drags beds, panel rows and plot corners with
the camera holding still (zoom stays), and Draw plot and Draw bed draw the plot boundary and a bed.
The plot's corner handles exist only in Move mode, because a hand reaching for the camera can grab a
corner, and `patchBoundary` reads a boundary edit as a size edit, dropping a finished layout search.
A bed and its plants move together (`useGroundDrag`), the store is written once on release, and
`dragging` keeps a drag from clearing the selection. A corner drag on a rectangle resizes it with
the opposite corner held (`movedCorner`), so "This boundary is not a plain rectangle" is only ever
true of a hand-drawn shape. The selected bed wears a white outline, and a bed label hides behind a
nearer one (`BedLabels`).

Each option on the wants step carries "Room for N rows of panels" from the `candidatesFor` the
search starts with (`option-rows.ts`). Rows are one array, so dragging a single row apart from its
neighbours is not offered, and nor is rotating a bed by hand.

## 23. What every light figure in the catalogue rests on

ECOCROP holds no daily light integral, its light field being a descriptor, so no row cites
`fao-ecocrop` for one and the schema default cites nothing. Against Torres et al. 2010 (Purdue
HO-238-B-W) and Stallknecht 2025 (VCE SPES-720NP), each of the 177 Tier C rows is in one of three
states. The three Tier A and two Tier B rows cite work on the crop itself and are set out under the
tiers below.

1. **Printed for this crop**, six rows: tomato and cucumber on VCE Table 3's "Tomato 20-30" and
   "Cucumber 20-30", spinach on its "Spinach 14-20", both peppers on Purdue's Capsicum bands,
   raspberry on the 15 Widmer et al. 2026 print. Spinach cites VCE alone and raspberry cites Widmer
   alone. Tomato and both peppers cite VCE, Purdue and Runkle 2011, and cucumber cites VCE and
   Runkle: the 15 at the foot of all four is Runkle's figure for vine crops as a group, and the
   peppers' 20 to 30 is the range VCE prints for tomato. Every row but hot pepper carries a comment
   naming the row or the band.
2. **Printed nowhere**, 168 rows. They cite nothing for light and carry one sentence: "This app's
   own figure, set by analogy with the crops in its class for which a published DLI exists. No cited
   work measured it for this crop, and the sources step lists it as a gap. Trust the ordering it
   gives, and treat the number itself as provisional." The sources step lists every one, so the
   claim holds of itself.
3. **Contradicting the cited document**, three rows: cilantro at 10 to 16 where VCE prints 15 to 20,
   summer squash at 18 to 25 where VCE prints "Zucchini 20-30", parsley at 10 to 16 where VCE prints
   10 to 15. The numbers stay, the citation goes, and each comment names the difference, since a
   citation that does not hold its number fails any spot check.

On screen an inferred figure reads "no cited work measured it for this crop", because "nothing was
measured for this crop" would be untrue of spinach.

**The tiers.** 3 A, 2 B and 177 C, and a Tier C figure is never shown as a measurement. A is leaf
lettuce, head lettuce and basil, on per-crop trials: Both et al. 1997 for Cornell's 17 mol/m2/d,
read in Brechner and Both 2013, Kelly et al. 2020 (lettuce at 6.9, 10.4, 15.6), Pennisi et al. 2020
(lettuce and basil 5.8 to 17.3, optimum 14.4), Dou et al. 2018 (basil 9.3 to 17.8, 12.9 for
production), Walters and Currey 2018 (basil at about 7 against about 15). None places a failure
point, so a Tier A minimum is the lowest level at which a cited trial still grew the crop, or the
level one recommends for production, carried on the row as its verbatim caveat (`dliCaveat`) beside
the number. Lettuce is 5.8 / 14.4-17 on both rows, basil 12.9 / 14.4-17.8, and the polyculture
engine's measured floor is lettuce's 5.8.

Spinach is C at 6 / 14-20 on VCE alone: Gao et al. 2020's 11.5 to 20.2 with an optimum at 17.3 is a
plant-factory range that bounds nothing a spring bed offers, so the 6 is this app's own. B is potato
and strawberry. Potato rests on Weselek et al. 2021 at about 30 percent shade and the tuber curve of
Laub et al. 2022, neither printing a light integral, so its 12 and 18 to 25 are this app's own band.
Strawberry is at 25 / 25-30 on Widmer et al. 2026, four years and 21 cases in the row's unit.
Strawberry's sources are two quantities: the Ohio State Kubota Lab's greenhouse guidance gives 12 as
a greenhouse-productivity minimum, 20 to 25 as the optimum and stress above 30, and Widmer's 25
maintains trial-average yield under agrivoltaic cover. The gate takes Widmer's for being the
agrivoltaic one, and the OSU 30 tops the band.

The yield band names its study count beside the citation, "dominated by crop response: the leafy
vegetables curve, 4 studies (Laub et al. 2022)", from `cropResponseLabel`, so a reader sees 61
greens sitting on a four-study curve without opening a file.

**Constants with no source.** The water model's basal coefficient is FAO-56 chapter 9 equations 97
and 98 (Allen et al. 1998), with one departure: the catalogue's per-habit extinction coefficient
replaces FAO-56's single 0.7. That coefficient and the per-habit leaf area index reach
the sources ledger through `HABIT_CANOPY_CLAIM`, and the ranking weights (light 0.35, climate 0.25,
soil 0.15, companion interaction 0.1, crowding 0.1, preference 0.05), which sum to 1, through
`WEIGHTS_CLAIM`.

**Tropical and subtropical staples.** Cassava, taro, greater yam, plantain, upland rice, lemon,
mango, papaya, pigeon pea, sesame and moringa. Every envelope is transcribed from the crop's ECOCROP
data sheet at `dataSheet?id=<EcoPort code>`, the code named in the row. `coldC` is the sheet's
killing temperature during rest, omitted where the sheet has none, and the Köppen list is the
sheet's zones read through a stated Trewartha table (Ar is Af and Am, and so on). Each row names the
extension sheet its growth figures come from, among UF/IFAS, NC State, Purdue NewCROP, the
Alternative Field Crops Manual, USDA NRCS, WARDA, CTAHR, IRETA and UC ANR. Rooting depths for
cassava, rice, sesame, plantain and lemon are FAO-56 Table 22 midpoints, and native ranges come from
the WCVP archive (Govaerts et al. 2021). Three figures are this app's own and say so: papaya's 3 m
picking height, moringa's 3 m pruned height, sesame's 0.3 m spread.

## 24. Licence, the site's own season and clock, banded figures

**Licence.** Code is Apache-2.0, docs and data CC BY 4.0, third-party data under its own terms
(`LICENSE`, `LICENSE-DOCS`, `NOTICE`, `CITATION.cff`). Open core stays possible, since the copyright
holder can sell a closed tier on top. The choice also lets a competitor host the public part closed,
and lets outside contributions arrive usable without a contributor agreement. Its one consequence in
code: the Dynamic chill model is written from Fishman, Erez and Couvillon 1987 with the paper's own
symbols, so no GPL-3 port of chillR sits in the tree.

**The season and the clock are the site's.** The bed-light word, the plan's shade figures, the
compliance estimates and the layout search read `growingWindowFor(site, percentile)`: last spring
frost to first autumn frost at the chosen exceedance percentile, wrapping the year end in the south,
the whole year where the record holds no frost, the three warmest months where no frost-free stretch
exists. Regimes with statutory months (Massachusetts, March to October) keep their own, and a fixed
April to September (`SIM_GROWING_WINDOW`) is the fallback before a site resolves, since a fixed
northern window summarises a Melbourne garden over its winter. The daily normals request asks
Open-Meteo for `timezone=auto`, which also aggregates daily minima by local day, and the IANA name
it answers with is the site's zone. `utcOffsetMinutesAt` reads the offset for each instant through
`Intl`, cached per day, in the water balance, the skydome windows and the compliance clock. A
longitude rounded to whole hours is half an hour out in India and an hour or more across Spain,
France and western China, so it stands only where no zone is known. The Rust decomposition takes one
standard offset at its boundary.

**A default says it is one.** A failed SoilGrids lookup returns pH 6.5 loam whose source is
`'default'`, and the bed panel reads "Assumed pH 6.5 loam: the soil map has no answer for this place
yet." Hardiness computed from the weather record reads "USDA-style, computed from the weather
record". The place step goes further, saying whether the map held no reading near the point or was
never reached at all.

**Normals fall back and the cache is global.** Where the daily normals fail, they fall to NASA POWER
daily data from the visitor's own browser, named as the source, so a successful hourly leg is kept.
Open-Meteo's allowance is pooled across every visitor behind the Worker, about 600 weighted calls
per fresh place against 10,000 a day, and an edge cache is per data centre, so a KV namespace
(`WEATHER_CACHE`) is the second tier, written only on a 2xx that reached the upstream: one town
costs the allowance once for the whole deployment. The NSRDB upstream needs an email the client
never sends, so the Worker injects `NSRDB_EMAIL` the way it injects the key. The proxy refuses more
than 120 requests a minute from one address, and four security headers ride every response and
`public/_headers`.

**The picture is the plot.** The bake's extent takes in the whole plot ring, and the overlay is the
plot's own shape with UVs into the raster, discarded where the raster has nothing, so the map covers
the plot's edges and spills past none. A preflight replaces the canvas where a browser lacks WebGL2
or WebAssembly, and an error boundary replaces a blank page with a sentence and a Reload press. The
canvas is named for a screen reader, the mode buttons say which is pressed, arrow keys nudge a
selection in Move mode, and a rectangular bed takes width and length.

**No figure sharper than its evidence.** The land equivalent ratio is a band built from the
per-planting published bands, harvests read "about 60% of full yield" beside their published range,
and energy and money read to two significant figures. Electricity prices exist only for US states,
so a typed tariff and currency carry the economy block anywhere. Outside US dollars the installed
cost is typed too, since the cost benchmark on file is in 2020 US dollars. Each typed figure is
stamped `'user'` like a typed pH. Still missing: other languages, and a field validation against a
real garden.

## 25. Surroundings dim the light, and a place reports itself

**The surroundings answer dims the light every bed is judged by.** One table serves both the bed
light and the layout search (`src/recommend/surroundings.ts`): a space shaded part of the day loses
three tenths of the open-sky light before any panel does, one in shade most of the day six tenths.
Both are this app's own reading of a three-answer question, declared unsourced on the sources step.
Every bed's under-array figures are dimmed by that share, the open-sky reference is left alone so
the relative shade ratio compounds by itself, the layout search judges its candidates on the same
dimmed light, and the ranking re-runs when the answer changes. The light step says what was taken
off, and that the ground map shows the panels' shade alone. The shade budget the search spends is
one minus the same share.

**A plant recorded wild only where winters are cold needs one.** Ramps, western wild ginger and
eastern teaberry carry `coldWinterOnly` on their recorded ranges (Chamberlain et al. 2014, FEIS,
WCVP), and a gate refuses them where the coldest month averages above 7.2 C, the top of the chilling
band and the figure the chilling-hours metric counts under. Their cool-perennial envelope is met
every month at a highland tropical site, and the hardiness gate asks only whether winter is too
cold. The gate runs last, so a desert July still refuses ramps on the envelope, and the winter is
named only where the envelope would have admitted the plant anyway. The place step's verdict counts
these under "colder winters".

**A weak climate fit holds a crop back on its own.** The score is a weighted sum, so light and soil
can outvote a climate fit of 0.05 and carry a crop to Recommended. Liebig's law decides the gate,
and it decides the verdict too: the row reads Limited with the limb of the envelope that bites.
Where crops tie on score, the ones whose light threshold was measured come before the class-level
inferences, and the tie note says so.

**A place says how it grows.** Under the frost sentence on the place step, two sentences from
figures the app already has: how much of the catalogue passes the climate gate, graded most, about
half or few, with the count and what the rest would need, and rain against what a garden would use,
from the FAO-56 balance. Light is not in it, because light is a fact about a bed. The starting array
faces south, so when a place resolves south of the equator, an array still on one of the two
starting directions is turned to face the equator. An array somebody pointed by hand keeps its
direction.

**Eight more staples.** Pearl millet, grain sorghum, mung bean, teff, olive, avocado, arabica coffee
and dessert banana, transcribed from their FAO ECOCROP sheets at Tier C like the other tropical
rows. Olive carries a chill figure of 150 hours, cited to De Melo-Abreu et al. 2004 and Sahli et al.
2012.

**Where a service has no answer.** Where the weather service names no zone, the clock is the nearest
tzdb zone to the point, inside the country the geocoder named where it named one: tzdb holds one
point for all of India, so without the country the nearest point to Mumbai is Karachi's. The place
step says which basis the clock has. Where SoilGrids answers nothing at the point, as at the centre
of nearly every town, a ring of four points three kilometres out is asked, then a ring six
kilometres out, and the reading says how far away it was taken. The rainy-season sentence names
every run of wet months, so Nairobi's two rains are both named, and a sowing window spanning the
year reads "any time of year". The store's lookup carries a token and drops an answer that lands
after a later lookup began, so two lookups in flight cannot leave one town's ground under another's
weather.

## 26. Houses and trees shade the bake

A flat surroundings share is wrong in sign and in season. A house north of the beds shades nothing
in the northern hemisphere and would still cost them a third of their light, and a house south of
them shades in winter and hardly at all while crops are in the ground: at Amherst a 6 m eave throws
13 m at noon in December and 2 m in June, where a flat share takes 30% off June. So what stands
around a garden is drawn on the ground, and the bake shades with it.

**What is drawn.** Two kinds of obstruction, each a box. A house is an opaque ground rectangle with
a wall height. A tree is a crown box between a canopy base height and a top, on a trunk the bake
ignores, with one transmittance in leaf, another leafless, and a switch for a tree that keeps its
leaves. A box may stand anywhere on the scene's 240 m ground, inside the boundary or outside it,
because the building that shades a garden is mostly next door. Both are added from the ground step
beside the surroundings question, then moved in Move mode the way a bed is, corner-dragged as a
rectangle (Record 22), nudged with arrow keys, or typed as a centre, two sides, heights and a turn.
The defaults are this app's own: a house 10 by 8 m and 6 m to the eaves, 2 m outside the boundary on
the equator-facing side so its shadow crosses the plot when the sun is low, and a crown 5 by 5 m
from 2 m up to 7 m, deciduous, 8 m east of it.

**How the bake sees it.** A house becomes five quads, the top and four walls (`houseQuads` in
`src/sim/obstruction.ts`), appended to the list the panels already travel in, which is typed as four
corners and nothing else (`Occluder`). All three kernels, the CPU reference, the Rust one it is held
to and the WebGL2 ray-quad loop, already treat a panel as opaque, so a house needs no new physics.
Beam, diffuse and sky-view factor share one visibility test, so a wall darkens all three at once.
The open-sky reference stays the closed form over no occluders: a house's shade lands in the
under-array layer, the shade ratio compounds house and panels, and the shade budget checks the
crop's total shade against its tolerance. The layout search sees a house because it reads the baked
raster.

A crown's transmittance is the one new thing in the kernels. Every quad may carry one, a blocked
sample keeps the smallest transmittance among the quads that block it, and a ray through both faces
of one crown counts once. A crown is six faces carrying the tree's pair. Panels and house faces
carry 0, so the min rule collapses to the opaque test wherever every quad is opaque.

**When a crown is in leaf.** The bake accumulates by month, so the leafless season is a set of
months. A deciduous crown is in leaf where the Growing Season Index of Jolly, Nemani and Running
2005 (`src/sim/phenology.ts`) averages above 0.5. The index is the product of three daily
indicators, each running 0 to 1: the day's minimum temperature, 0 at -2 C and 1 at 5 C, its vapour
pressure deficit, 1 at 900 Pa and 0 at 4100 Pa, and its day length, 0 at 10 hours and 1 at 11, from
the declination the solar geometry already carries. A drawn tree holds the deficit term at 1,
because the paper takes dry air as a surrogate for soil water that natural vegetation cannot reach,
and a garden tree stands where the beds are watered. A month is in leaf where the index's 21-day
mean, centred on each day so the paper's rule gains no added lag, passes 0.5 on the month's 15th.
Each month's light takes the crown's in-leaf figure or its bare one, and the annual is the sum of
the months. The sky-view factor and the time windows read the in-leaf figure whatever the month, a
declared approximation, since the one window shipped is the growing season. All three backends carry
the seasonal pair, and a bake with no crown in it runs the opaque test alone.

**What it replaces.** With no house and no tree, the surroundings share of Record 25 applies. Once
one is drawn the share applies nowhere, the drawn geometry being the answer: every reader goes
through `exposureInForce`, so the bed light, the layout search and the shade budget agree. The
question is disabled with a sentence saying why, the light step's note names what was drawn, and the
plan card says so. The question stays for anyone who won't draw, and the share table keeps its
unsourced claim. A house keeps beds and rows out: the layout search places neither inside one, and a
hand placement that overlaps gets a sentence on the check step, with drags never blocked. A tree
polices nothing, since a bed under a crown is a garden.

**Where it lives.** `GardenPlot.obstructions`, schema 5, empty for every garden saved at schema 4
and for the three shipped examples, holds both kinds in one list, a house needing four corners and a
positive height, and a tree needing a crown above its base and two figures between 0 and 1.
`lightGeometryKey` and the worker's memo key both carry the list, so a moved or altered box re-bakes
by itself. `HouseMesh` and `TreeMesh` draw the boxes the bake shades with (Record 14.5), a house
casting the scene's live shadow like a panel, and a crown's opacity is one minus the transmittance
the bake applies in the month the scene clock shows, dithered to that density because a shadow map
casts all or nothing.

**The figures and their sources.** A house has no figure. A tree's defaults, editable on its card
with the source beside them, are 0.033 in leaf and 0.46 leafless, the midpoints of Konarska et al.
2014's five street trees in Göteborg, at 1.3 to 5.3 percent foliated and 40.2 to 51.9 percent
defoliated. Heisler 1986 cross-checks them: a mid-sized sugar maple cut the irradiance on a wall in
its shade by about 80% in leaf and nearly 40% leafless, a wall figure that also counts sky and
reflected light. Canham et al. 1994 is the closed-canopy comparison, under 2% of full sun beneath
beech and hemlock and over 5% beneath red oak and ash. The figures are direct-beam transmissivity
applied to beam, diffuse and sky view alike through a solid box, which the entries' caveats say.
Three readings of the index are this app's own and the card says so: the 15th standing for the whole
month, the 21-day mean centred on each day, and the deficit term held at its moist value.

A compass at the view's left edge turns with the camera, and on a touch screen a tap within 24
screen px of a bed's projected footprint selects the nearest bed, measured on the screen so a tap on
a bed's floating label selects the bed under it.

## 27. The interface is set in Ubuntu Sans

The interface and its figures are set in Ubuntu Sans and Ubuntu Sans Mono, the faces Ubuntu 24.04
ships, so screenshots from a Mac, a Windows laptop and a phone read as one product. The files are
served from this origin under the Ubuntu Font Licence (`public/fonts/`), the same stance the
rendered docs take on third-party requests. The latin subset is preloaded, and latin-ext loads only
where a source's author needs it. Bed names in the view are drawn onto their textures once the face
has loaded (`BedLabel.tsx`). The classic Ubuntu face was passed over for its missing 600 weight.

## 28. Rain follows the array's plan geometry

The share of rain a bed loses to the panels and the water the panels' drip lines bring it are
computed from the array's plan geometry (`src/recommend/rain.ts`), because the bed's solar relative
shade ratio stands for neither. A fixed row keeps its tilt and drips from its low edge. A tracker is
taken lying flat in rain, its night stow, and sheds to both long edges, half each. Rotating a
tracker out of the rain, Elamri's remedy, is a schedule no tracker here runs, and a note says so.

**The rose and the projection.** The weather record carries the direction the wind blows from
(`windDirectionDeg`, from Open-Meteo, NASA POWER, PVGIS and NSRDB alike), and the field runs on the
site's rain-hour wind rose: twelve 30 degree bins, each weighted by the rain that fell with the wind
from it and carrying that rain's mean speed. A record with no direction falls back to the equal
twelve-way rose at the rain-hour mean, a special case of the same model. Each panel is projected to
the ground along each bin's rain, every corner by its own height times the rain's angle off vertical
(Elamri et al. 2018 Eq. 1: tan αR is the wind speed over a raindrop's fall speed). The projected quad is the panel's rain shadow in that bin and its area is the panel's
catchment, their Eq. 4 in geometric form: a row facing the rain intercepts more than its plan area,
one turned from it less, and a tilted row's high edge throws further. The panel's mid-height wind
carries every corner, a declared approximation within about 13 percent of an integrated lagged fall
for a row 2.5 to 5 m up.

**The rain's own drops.** The field sizes its drops from the hourly rain rate through Best 1950's
distribution (its Eq. 3) and reads their fall speed from Gunn and Kinzer 1949. Best's distribution
is the water held in the air, and the rain reaching the ground weights every size by its own fall
speed, so the field builds that flux-weighted distribution, splits it into three equal thirds and
gives each third the harmonic mean of its own fall speeds, 3.3, 5.5 and 6.9 m/s at 2 mm/h. Three
thirds carry the mean shift exactly, and five would cut the edge-step error by about two points for
seventy percent more quads. The wind-speed spread inside a 30 degree bin is the larger unresolved
source. Each third projects its own shadow, so a shadow's downwind edge is soft.

**The drip strip.** 0.2 m wide in still air, moved downwind by the drift. The width is this app's
own derivation from Elamri et al. 2018 Eq. 5, since the paper gives no landing width: the runoff
film leaves the low edge at under 0.2 m/s at a Manning n of 0.01 on glass, so from a garden-height
edge the drops land within a hand's width of the edge's vertical. Their own 20 cm is the width of
the outlet along the edge. Below 5 degrees of tilt about 90 percent of a 1 m module's water leaves
through 20 cm of it. That figure says how beaded a flat panel's strip is, and the tracker note
carries it. The drift is computed for a 3.8 mm drop, the mass mode of the drops the paper measured
leaving a panel edge, read off Gunn and Kinzer's Table 2, integrated from rest under quadratic drag
along the drop's velocity relative to the wind, through the site's own wind profile: 0.059 m at 1
m/s, 0.24 m at 3, 0.69 m at
6. Gunn and Kinzer measured their largest drops reaching terminal speed only after about 12 m, and
Wang and Pruppacher 1977 put the fall to 99 percent of terminal at 9.5 m for a 2 mm drop and 14 m
for a 4 mm one, and a test checks the drip's fall from rest against those distances.

**The wind's height.** The NSRDB's wind is MERRA-2's 2 m surface wind where every other source
reports 10 m. NREL's own NSRDB builder documents `wind_speed` as "Wind speed at 2 meters above the
surface", computed from MERRA-2's U2M and V2M, and an NSRDB typical year matches MERRA-2's own 2 m
wind hour by hour at a correlation of 0.994, so the record is scaled to 10 m at ingest by the same
FAO-56 profile that ET0 runs the other way. Over cells the reanalysis treats as forest, that 2 m
wind runs near zero, Amherst averaging 0.16 m/s with 4,649 of 8,760 hours at exactly 0 where PVGIS
reads 2.1 m/s at the same point, so a year whose mean falls under 1 m/s takes FAO-56's own default
of 2 m/s and says so on its label.

**What a bed keeps.** A plain bed keeps half of the water its strip brings, and a bed with a basin
or swale along the strip keeps four fifths, both declared modelling assumptions with Elamri et al.'s
event 07 as the nearest anchor: the top metre under the drip edge held 6.7 of the 24.0 mm that
landed on it. A flat tracker's half to each long edge is the expected value over a lean the app
cannot know, since the paper says a nominally flat panel sends all of it to one outlet, so the notes
say the strip is either twice what the field draws or nothing. Whether a bed catches a strip is the
geometry's answer, and the bed's own switch adds the basin. The ground overlay carries the field as
a channel, and every bed's water panel names the row that drips on it and the side it drips along.
In the layout search the water term is the balance's own deficit saving on the placed beds,
unweighted by the site's water limitation, which cancelled it at both sites measured, and each bed
slides onto a strip within the room its light band leaves it, where the balance says its plants
would go short less (Record 10c).

**What it costs, and where the numbers live.** The field is built only where it is looked at, the
rain channel, the water panel and a bed's panel. Its cell coarsens past 3,000 m² of extent, 0.2 m at
a hectare, with the strip never narrower than a cell so no water is lost to the grid, and its margin
comes from the rose's own largest drift, so a tall row's runoff is never dropped off the edge. The
field costs 6 to 7 ms on the starting plot. Every number it takes from a paper lives in
`src/recommend/rain-sources.ts` with its citation, its locator and the sentence the bibliography
uses for it, and a test holds the three together, alongside tests of Eq. 4's catchment identity,
Best's round trip and Lacy's 4.5 m/s mean fall speed. Elamri et al. give their anemometer's height
and their collectors' readings only in figures, so the model is compared with their rig and no
parameter is fitted to it. Blocken and Carmeliet 2004 carry the same physics from Lacy's relation, which ISO
15927-3 codifies, define the flux-weighted distribution the field uses, and recommend Gunn and
Kinzer's own drag coefficients over sphere formulae, which the drip's drag is matched to.
