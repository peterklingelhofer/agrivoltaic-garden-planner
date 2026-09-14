# Citation corpus

217 sources (154 crossref-verified, 1 datacite-verified, 16 unverified, 46 url-verified). Machine-readable companion: [`CITATIONS.csl.json`](./CITATIONS.csl.json) (CSL-JSON).
Verification pass completed 2026-07-30 against the Crossref REST API, the DataCite REST API, and direct
fetches of authoritative publisher, standards-body and government URLs.

## How to read this

### Verification status

This says how the *bibliographic record* was checked. It says nothing about whether the finding is true.

| Status | Meaning |
|---|---|
| `crossref-verified` | The DOI resolves in Crossref and the returned title, authors, year, journal, volume and pages were compared against what our research docs claim. Any discrepancy is written into the caveat. |
| `datacite-verified` | Same, via the DataCite API. Used for Zenodo and other dataset DOIs. |
| `url-verified` | No DOI exists. An authoritative URL (publisher, standards body, government, extension service) was fetched on 2026-07-30 and the document identity confirmed from the page itself. |
| `unverified` | Neither a resolvable DOI nor a successfully fetched authoritative URL. The bibliographic details are inherited from our research docs or from secondary citation and may be wrong. |

A `crossref-verified` record can still carry a loud caveat. Verification confirms the *citation*, not the *claim*.
Several entries here are Crossref-verified but were paywalled to full-text fetch, meaning we confirmed the paper exists
and is what we say it is, but never read its numbers.

### Access level

`open-access` (a CC licence is registered or the publisher serves it freely) | `paywalled` |
`public-domain` (government, national-lab or extension output) | `standard-purchase` (must be bought from a standards body).
Where a Crossref `license` field was present, the access level is taken from it rather than guessed.

### Evidence tier

The A-E scheme from `00-DECISIONS.md` section 11, applied to sources making biological or agronomic claims.
Physics, geodata and software sources carry `null`: the scheme does not apply to them.

| Tier | Definition | Product treatment |
|---|---|---|
| A | Multi-site trials or meta-analysis with a characterised mechanism | Contributes to scoring |
| B | Replicated trials, context-dependent or with management preconditions | Contributes to scoring |
| C | Single study or lab-only | Renders as "experimental", does not score |
| D | Traditional, plausible, untested | Folklore panel only, never affects layout |
| E | No evidence, or directly contradicted | Folklore panel only, never affects layout |

### Counts

| Verification | n |
|---|---|
| crossref-verified | 154 |
| datacite-verified | 1 |
| unverified | 16 |
| url-verified | 46 |
| **total** | **217** |

| Access level | n |
|---|---|
| open-access | 62 |
| paywalled | 109 |
| public-domain | 45 |
| public-domain-with-conditions | 1 |

| Evidence tier | n |
|---|---|
| A | 36 |
| B | 63 |
| C | 30 |
| null (not applicable) | 88 |

---

## Agrivoltaics

25 sources.

#### `amaducci2018-maize`

Amaducci, Stefano; Yin, Xinyou; Colauzzi, Michele. (2018). *Agrivoltaic systems to optimise land use for electric energy production*. Applied Energy 220: 545-561

- DOI: [10.1016/j.apenergy.2018.03.081](https://doi.org/10.1016/j.apenergy.2018.03.081)
- Verification: Crossref-verified | Access: paywalled, evidence tier **B**
- Backs:
  - maize gains under agrivoltaic shade appear only under rainfed water stress
  - the water-limitation flag that gates the shade-benefit pathway

#### `barron-gafford2019-arizona`

Barron-Gafford, Greg A.; Pavao-Zuckerman, Mitchell A.; Minor, Rebecca L.; Sutter, Leland F.. (2019). *Agrivoltaics provide mutual benefits across the food-energy-water nexus in drylands*. Nature Sustainability 2: 848-855

- DOI: [10.1038/s41893-019-0364-5](https://doi.org/10.1038/s41893-019-0364-5)
- Verification: Crossref-verified | Access: paywalled, evidence tier **B**
- Backs:
  - chiltepin pepper total fruit production was three times greater under the PV panels of the agrivoltaic system
  - cherry tomato total fruit production was twice as great under the PV panels
  - jalapeno total fruit production was nearly EQUAL between treatments, attained with 65% less transpirational water loss; jalapeno water use efficiency was 157% greater
  - soil moisture +15% under panels at an arid site
  - daytime air-temperature cooling under panels in a hot arid climate
- **Caveat:** Dryland-specific. The product gates every 'shade improves yield' pathway behind a water-limitation flag precisely because these gains do not transfer to temperate gardens. Directionally contradicted on both temperature and soil moisture by the temperate Heggelbach site (Weselek 2021). FALSE ATTRIBUTION CORRECTED 2026-07-30. This entry previously read '2-3x for chiltepin and jalapeno'. Full text (https://www.osti.gov/servlets/purl/1567040) shows the 3x belongs to chiltepin, the 2x belongs to CHERRY TOMATO, and jalapeno showed NO yield gain at all: 'total fruit production was nearly equal between treatments... but this was attained with 65% less transpirational H2O loss'. Jalapeno cumulative CO2 uptake was in fact 11% LOWER under the panels. Any product copy claiming a jalapeno yield gain from this paper is false.

#### `doedt2024-japan-legal`

Doedt, Christian; Tajima, Masayoshi; Iida, Tetsunari. (2024). *Agrivoltaics in Japan*. AgriVoltaics Conference Proceedings 1

- DOI: [10.52825/agripv.v1i.533](https://doi.org/10.52825/agripv.v1i.533)
- Verification: Crossref-verified | Access: open-access, evidence tier **C**
- Backs:
  - Japanese MAFF solar-sharing requires 80% of regional average yield and 2 m clearance
  - Japanese researchers themselves describe the 80% rule as lacking a scientific basis
- **Caveat:** MISMATCH: the agrivoltaics document dates this 2022 and gives the title 'Agrivoltaics in Japan: a legal framework analysis'. Crossref records issue year 2024 and the short title 'Agrivoltaics in Japan'.

#### `dupraz2011-agrivoltaics`

Dupraz, Christian; Marrou, Hélène; Talbot, Grégoire; Dufour, Lydie; Nogier, Angel; Ferard, Yannick. (2011). *Combining solar photovoltaic panels and food crops for optimising land use: Towards new agrivoltaic schemes*. Renewable Energy 36: 2725-2732

- DOI: [10.1016/j.renene.2011.03.005](https://doi.org/10.1016/j.renene.2011.03.005)
- Verification: Crossref-verified | Access: paywalled, evidence tier **B**
- Backs:
  - Land Equivalent Ratio as the portfolio metric for dual land use
  - the originating half-density / full-density agrivoltaic row-spacing design

#### `dupraz2024-gcr-proxy`

Dupraz, Christian. (2024). *Assessment of the ground coverage ratio of agrivoltaic systems as a proxy for potential crop productivity*. Agroforestry Systems 98: 2679-2696

- DOI: [10.1007/s10457-023-00906-3](https://doi.org/10.1007/s10457-023-00906-3)
- Verification: Crossref-verified | Access: paywalled
- Backs:
  - ground coverage ratio as a first-order proxy for potential crop productivity under an array
- **Caveat:** CITATION CORRECTED. The solar geometry document lists this as 'INRAE (2023) ... hal-04240227' with no author. It is single-authored by Christian Dupraz and the version of record is Agroforestry Systems 98:2679-2696 (2024), Crossref-registered online 2023. HAL copy at https://hal.inrae.fr/hal-04240227 (hal.science blocks automated fetch); preprint at https://www.researchsquare.com/article/rs-3030967/v1.

#### `elamri2018-rain-concentration`

Elamri, Yassin; Cheviron, Bruno; Mange, Annabelle; Dejean, Cyril; Liron, François; Belaud, Gilles. (2018). *Rain concentration and sheltering effect of solar panels on cultivated plots*. Hydrology and Earth System Sciences 22: 1285-1298

- DOI: [10.5194/hess-22-1285-2018](https://doi.org/10.5194/hess-22-1285-2018)
- Verification: Crossref-verified | Access: open-access, evidence tier **B**
- Backs:
  - rain shadow beneath panels and concentrated runoff at the drip line
  - TEK design rule 4: water-harvesting geometry tied to the array drip line and runoff shadow

#### `elamri2018-water-budget`

Elamri, Yassin; Cheviron, Bruno; Lopez, Jean-Marc; Dejean, Cyril; Belaud, Gilles. (2018). *Water budget and crop modelling for agrivoltaic systems: Application to irrigated lettuces*. Agricultural Water Management 208: 440-453

- DOI: [10.1016/j.agwat.2018.07.001](https://doi.org/10.1016/j.agwat.2018.07.001)
- Verification: Crossref-verified | Access: paywalled, evidence tier **B**
- Backs:
  - reduced evapotranspiration and irrigation demand under panel shade for irrigated lettuce

#### `grommes2023-raytrace-vs-viewfactor`

Grommes, Eva-Maria; Schemann, Fabian; Klag, Felix; Nows, Sven; Blieske, Ulf. (2023). *Simulation of the irradiance and yield calculation of bifacial PV systems in the USA and Germany by combining ray tracing and view factor model*. EPJ Photovoltaics 14: 11

- DOI: [10.1051/epjpv/2023003](https://doi.org/10.1051/epjpv/2023003)
- Verification: Crossref-verified | Access: open-access
- Backs:
  - ray tracing costs 12.7-88 h vs 2-4 min for view-factor with no annual-aggregate accuracy gain
  - decision 2.2: ray tracing rejected as a runtime dependency

#### `hassanpour-adeh2018-oregon`

Hassanpour Adeh, Elnaz; Selker, John S.; Higgins, Chad W.. (2018). *Remarkable agrivoltaic influence on soil moisture, micrometeorology and water-use efficiency*. PLOS ONE 13: e0203256

- DOI: [10.1371/journal.pone.0203256](https://doi.org/10.1371/journal.pone.0203256)
- Verification: Crossref-verified | Access: open-access, evidence tier **B**
- Backs:
  - soil moisture roughly doubled under panels at an Oregon pasture site
  - water-use efficiency gains under partial shade in a temperate maritime climate
- **Caveat:** Pasture/forage system. Its soil-moisture sign is opposite to Heggelbach's, so the product must not present a single global sign for the soil-moisture effect.

#### `horowitz2020-dual-use-capital-costs`

Horowitz, Kelsey; Ramasamy, Vignesh; Macknick, Jordan; Margolis, Robert. (2020). *Capital Costs for Dual-Use Photovoltaic Installations: 2020 Benchmark for Ground-Mounted PV Systems with Pollinator-Friendly Vegetation, Grazing, and Crops*. National Renewable Energy Laboratory NREL/TP-6A20-77811

- DOI: [10.2172/1756713](https://doi.org/10.2172/1756713)
- Verification: Crossref-verified | Access: public-domain
- Backs:
  - the three PV + crops installed-cost benchmarks of Figure 3, p. 11: $1.83/Wdc vertical mount, $2.09/Wdc tracker stilt mount, $2.33/Wdc reinforced regular mount
  - the $1.53/Wdc typical fixed-tilt bare-ground baseline those three are a premium over
  - that the crop-mount premium is structural balance of system (the racking structure) and installation labour, not modules, inverters or soft costs
- **Caveat:** A 500 kWdc benchmark, a simple average across eight US states, in 2020 USD, installed cost only: no financing, no operations and maintenance, no revenue. The smallest system modelled anywhere in the report is 200 kW and cost per watt rises as system size falls, so a garden's few kilowatts sit below the bottom of the report's own size curve by an amount it never gives. It states verbatim (p. 9) that it has 'a limited number of input data points for nonconventional system designs in the PV + crop space, and so the costs associated with those applications are more uncertain'.

#### `laub2021-shade-dataset`

Pataczek, Lisa; Laub, Moritz. (2021). *Crop yield responses at varying levels of shade*. Zenodo

- DOI: [10.5281/zenodo.5716091](https://doi.org/10.5281/zenodo.5716091)
- Verification: DataCite-verified | Access: open-access
- Backs:
  - underlying extracted yield-vs-shade observations behind Laub et al. 2022
- **Caveat:** Holds two xlsx data files only. It does NOT contain the fitted model coefficients, and no analysis code is deposited in any location.

#### `laub2022-shade-meta`

Laub, Moritz; Pataczek, Lisa; Feuerbacher, Arndt; Zikeli, Sabine; Högy, Petra. (2022). *Contrasting yield responses at varying levels of shade suggest different suitability of crops for dual land-use systems: a meta-analysis*. Agronomy for Sustainable Development 42: 51

- DOI: [10.1007/s13593-022-00783-7](https://doi.org/10.1007/s13593-022-00783-7)
- Verification: Crossref-verified | Access: open-access, evidence tier **A**
- Backs:
  - season-cumulative relative shade ratio (RSR), not instantaneous PPFD, is the correct yield driver
  - RSR^2 term significant (p=0.0015): the linear '% shade = % yield loss' rule is statistically wrong
  - RSR x crop type interaction p<0.0001: crop group is a required model input
  - shade type (PV panels vs shade cloth vs nets) NOT significant, which licenses shade-cloth proxy data
  - Table S2 relative-yield predictions and 95% confidence intervals per crop group per RSR level
  - yield anchors at 40% RSR: berries 114%, fruits 113%, fruity veg 102%, forages 93%, leafy veg 86%, grain legumes 50%, maize 45%
  - all crop groups decline above ~50% RSR
  - maize is the most shade-susceptible group, 45% of control at 40% RSR (95% CI 37-56%)
  - per-group shade-benefit optima
  - greenhouse experiments were explicitly excluded from the meta-analysis
- **Caveat:** DERIVED-COEFFICIENT WARNING. The fitted per-group curve coefficients this product uses are NOT PUBLISHED ANYWHERE: not in the article, not in supplement MOESM1 (which contains only the Fig. S1 caption, Table S1 = the 58 publications, and Table S2 = predictions), not in MOESM2 (the raw dataset), and not in the Zenodo record 10.5281/zenodo.5716091 (two xlsx data files only). Our coefficients were recovered algebraically from the 162 published Table S2 points plus the paper's verbatim model specification, validated to within 0.07 percentage points. They must NEVER be quoted as Laub's own published coefficients. INTERVAL-TYPE CORRECTION: the 67.2-156.1% range for fruity vegetables at 40% RSR is a 95% CONFIDENCE interval, not a prediction interval. Table S2's caption and the main text both say confidence interval. Prediction intervals exist in the paper but are only drawn as grey lines in Fig. 3 and are never tabulated. SAMPLE SIZES: berries n=5, fruits n=7, fruity vegetables n=3, leafy vegetables n=4, C3 cereals n=10, maize n=10, tubers/root crops n=2, grain legumes n=14, forages n=11. Totals: 428 data points (340 excluding controls), 58 studies, 38 crop species. Tubers/root crops at n=2 is the weakest group, and the three most garden-relevant groups (root n=2, fruity veg n=3, leafy veg n=4) are the thinnest in the entire paper. SCALE CAVEAT, verbatim from the authors: 'uncertainties due to random plot scale effects are large, while at country or continental scales the mean response to shading, represented by the confidence intervals, is the more valid estimator.' Our users are single gardens, i.e. exactly the plot scale the authors call MORE uncertain.

#### `marrou2013-lettuce-rue`

Marrou, Hélène; Wery, Jacques; Dufour, Lydie; Dupraz, Christian. (2013). *Productivity and radiation use efficiency of lettuces grown in the partial shade of photovoltaic panels*. European Journal of Agronomy 44: 54-66

- DOI: [10.1016/j.eja.2012.08.003](https://doi.org/10.1016/j.eja.2012.08.003)
- Verification: Crossref-verified | Access: paywalled, evidence tier **B**
- Backs:
  - lettuce maintains yield under partial panel shade via increased radiation use efficiency and leaf area expansion
  - 3-7 day phenology delay in shaded lettuce, the only solid per-crop phenology number located

#### `marrou2013-microclimate`

Marrou, Hélène; Guilioni, Lydie; Dufour, Lydie; Dupraz, Christian; Wery, Jacques. (2013). *Microclimate under agrivoltaic systems: Is crop growth rate affected in the partial shade of solar panels?*. Agricultural and Forest Meteorology 177: 117-132

- DOI: [10.1016/j.agrformet.2013.04.012](https://doi.org/10.1016/j.agrformet.2013.04.012)
- Verification: Crossref-verified | Access: paywalled, evidence tier **B**
- Backs:
  - panel shade alters air temperature, humidity and VPD only marginally relative to the light reduction
  - microclimate is a second-order modifier; light is the first-order driver

#### `marrou2013-water-flows`

Marrou, Hélène; Dufour, Lydie; Wery, Jacques. (2013). *How does a shelter of solar panels influence water flows in a soil-crop system?*. European Journal of Agronomy 50: 38-51

- DOI: [10.1016/j.eja.2013.05.004](https://doi.org/10.1016/j.eja.2013.05.004)
- Verification: Crossref-verified | Access: paywalled, evidence tier **B**
- Backs:
  - reduced soil evaporation and improved water-use efficiency under panels
  - rain shadow and drip-line redistribution of water under a panel array

#### `pataczek2023-wheat-drought`

Pataczek, Lisa; Weselek, Axel; Bauerle, Andrea; Högy, Petra. (2023). *Agrivoltaics mitigate drought effects in winter wheat*. Physiologia Plantarum 175: e14081

- DOI: [10.1111/ppl.14081](https://doi.org/10.1111/ppl.14081)
- Verification: Crossref-verified | Access: open-access, evidence tier **B**
- Backs:
  - the shade benefit for a C3 cereal is conditional on drought, reinforcing the water-limitation gate

#### `reher2025-pears`

Reher, Thomas; Willockx, Brecht; Schenk, Anne; Bisschop, Jolien. (2025). *Agrivoltaic cultivation of pears under semi-transparent panels reduces yield consistently and maintains fruit quality*. Agronomy for Sustainable Development 45

- DOI: [10.1007/s13593-025-01019-0](https://doi.org/10.1007/s13593-025-01019-0)
- Verification: Crossref-verified | Access: open-access, evidence tier **B**
- Backs:
  - multi-year perennial tree-fruit yield penalty under semi-transparent panels with fruit quality maintained
  - partial support for the multi-year shade-stress accumulation concern in perennials

#### `sekiyama2019-solar-sharing`

Sekiyama, Takashi; Nagashima, Akira. (2019). *Solar Sharing for Both Food and Clean Energy Production: Performance of Agrivoltaic Systems for Corn, A Typical Shade-Intolerant Crop*. Environments 6: 65

- DOI: [10.3390/environments6060065](https://doi.org/10.3390/environments6060065)
- Verification: Crossref-verified | Access: open-access, evidence tier **C**
- Backs:
  - Japanese solar-sharing lineage, attributed by name to Akira Nagashima per TEK attribution rules
  - shade-intolerant C4 maize performance under a solar-sharing array
- **Caveat:** Single-site, small-plot. It is the only English-language Japanese solar-sharing crop study located with a verifiable DOI, which is itself evidence for thin-evidence area 10 in the agrivoltaics document. The agroecology document cites 'Nagashima 2015/2020' and an 'AIP Conf. Proc. 2361(1):030002 2021' that could not be resolved.

#### `tekie2024-drought-index-preprint`

Tekie, Sultan; Zainali, Sebastian; Zidane, Tekai Eddine Khalil; Ma Lu, Silvia; Guezgouz, Mohammed; Zhang, Jie; Amaducci, Stefano; Campana, Pietro Elia. (2024). *Unraveling the crop yield response under shading conditions through the deployment of a drought index*. EarthArXiv

- DOI: [10.31223/X5KT33](https://doi.org/10.31223/X5KT33)
- Verification: Crossref-verified | Access: open-access, evidence tier **C**
- Backs:
  - nothing in the shipping product; recorded solely as a negative control
- **Caveat:** NEGATIVE ENTRY - DO NOT USE TO VERIFY OUR NUMBERS. This is a DIFFERENT paper that merely CITES Laub et al. 2022. Its Table 2 publishes its own regressions, verbatim confirmed, including 'C3 Cereals Y=106.34-0.44X1', 'Berries Y=-13.36+2.22X1', 'Maize Y=61.82+0.25X1' and 'Grain Legumes Y=104.54-0.52X1'. Those are NOT Laub's coefficients. Because it reuses Laub's crop categories and ranks highly in search, anyone re-deriving our crop-response curves is likely to hit it and mistake its equations for Laub's. It is also not peer reviewed. The agrivoltaics document's link https://eartharxiv.org/repository/object/7354/ returns 404; the working URL is /repository/view/7354/.

#### `trommsdorff2021-heggelbach`

Trommsdorff, Max; Kang, Jinsuk; Reise, Christian; Schindele, Stephan; Bopp, Georg; Ehmann, Andrea; Weselek, Axel; Högy, Petra; Obergfell, Tabea. (2021). *Combining food and energy production: Design of an agrivoltaic system applied in arable and vegetable farming in Germany*. Renewable and Sustainable Energy Reviews 140: 110694

- DOI: [10.1016/j.rser.2020.110694](https://doi.org/10.1016/j.rser.2020.110694)
- Verification: Crossref-verified | Access: paywalled, evidence tier **B**
- Backs:
  - Heggelbach reference geometry: clearance height, row pitch and ground coverage ratio for a temperate arable APV system

#### `weselek2019-apv-review`

Weselek, Axel; Ehmann, Andrea; Zikeli, Sabine; Lewandowski, Iris; Schindele, Stephan; Högy, Petra. (2019). *Agrophotovoltaic systems: applications, challenges, and opportunities. A review*. Agronomy for Sustainable Development 39: 35

- DOI: [10.1007/s13593-019-0581-3](https://doi.org/10.1007/s13593-019-0581-3)
- Verification: Crossref-verified | Access: paywalled, evidence tier **B**
- Backs:
  - general framing of agrivoltaic system types and their agronomic trade-offs

#### `weselek2021-potato`

Weselek, Axel; Bauerle, Andrea; Hartung, Jens; Zikeli, Sabine; Lewandowski, Iris; Högy, Petra. (2021). *Agrivoltaic system impacts on microclimate and yield of different crops within an organic crop rotation in a temperate climate*. Agronomy for Sustainable Development 41: 59

- DOI: [10.1007/s13593-021-00714-y](https://doi.org/10.1007/s13593-021-00714-y)
- Verification: Crossref-verified | Access: open-access, evidence tier **B**
- Backs:
  - the sign of the shade effect flips between years: potato -20% in a normal year, +11% in a dry year
  - decision 4: weather input must be a TMY, never a single year
  - temperate-site warming under panels, contradicting the Arizona and Oregon cooling results
  - reduced soil moisture at Heggelbach, contradicting the Arizona and Oregon increases

#### `widmer-strawberry-dli`

Widmer, Jocelyn; Ançay, André; Duchemin, Mathilde; Nardin, Gaël; Ackermann, Mathieu; Sutter, Louis. (2026). *Light Thresholds and Shading Effects on Strawberry and Raspberry Yields and Quality Under Agrivoltaics Systems in Switzerland*. AgriVoltaics Conference Proceedings 4

- DOI: [10.52825/agripv.v4i.2837](https://doi.org/10.52825/agripv.v4i.2837)
- Verification: Crossref-verified | Access: open-access, evidence tier **B**
- Backs:
  - strawberry minimum DLI 25 mol/m2/d and raspberry minimum DLI 15 mol/m2/d, verbatim: 'Based on the point where the standardized regression line crosses zero, the minimal DLI recommendation for maintaining average yield was 15 mol m-2 d-1 for raspberry and 25 mol m-2 d-1 for strawberry'
  - a positive linear relationship between DLI and both yield and sugar content in both species, stronger in strawberry
  - strawberry firmness declines at low DLI; fruit weight and titratable acidity are unaffected in both species
  - the authority for splitting strawberry out of Laub's lumped berry group
- **Caveat:** OUR DOCS ARE WRONG ON YEAR, TITLE AND AUTHORS. The agrivoltaics document cites 'Widmer, J., Ancay, A., Duchemin, C., Nardin, R., Ackermann, T., Sutter, G. (2024/2025). Strawberry and raspberry under agrivoltaics: minimum DLI requirements.' The given names for Duchemin, Nardin, Ackermann and Sutter are all wrong, the title is a paraphrase, and the version of record is 2026. RSR NUMBERS CORRECTED 2026-07-30 after reading the full text. The previously recorded 'max design RSR 15-20%' for strawberry is wrong: the paper says the 25 mol/m2/d recommendation 'corresponded to an estimated total shading of 10-30%, depending on the type of cover'. The previously recorded 'max design RSR 30-35%' for raspberry is a FALSE ATTRIBUTION: no shading or RSR percentage for raspberry appears anywhere in the paper. DEFINITION OF 'MINIMUM': it is the DLI at which the standardized yield regression crosses zero, i.e. the DLI that yields the trial-average yield, chosen because 'AgriPV systems should not negatively impact' average yield. It is a design convention, NOT a physiological failure threshold and NOT a fitted breakpoint: the fitted yield-DLI relationship is linear with no breakpoint. SCOPE: four-year study, 21 case studies in Switzerland including 13 AgriPV configurations at three sites, all substrate-grown with fertigation under protective covers. Open-field cases were excluded. Transfer to in-ground garden beds is an extrapolation. This remains the ONLY located source expressing agrivoltaic limits directly as DLI, so the entire strawberry/berry DLI split rests on one conference paper.

#### `zainali2023-viewfactor`

Zainali, Sebastian; Ma Lu, Silvia; Stridh, Bengt; Avelin, Anders; Amaducci, Stefano; Colauzzi, Michele; Campana, Pietro Elia. (2023). *Direct and diffuse shading factors modelling for the most representative agrivoltaic system layouts*. Applied Energy 339: 120981

- DOI: [10.1016/j.apenergy.2023.120981](https://doi.org/10.1016/j.apenergy.2023.120981)
- Verification: Crossref-verified | Access: open-access
- Backs:
  - explicit polygon projection is required for finite arrays because edge rows dominate at garden scale
  - R^2 0.99-1.00 vs PVsyst, 0.3% daily error
  - decision 2.1: pvlib infinite_sheds 2-D view factor is a unit-test oracle only, never a user path
- **Caveat:** The 0.3% daily-error figure comes from a SINGLE CLEAR-SKY DAY. No published seasonal validation of any analytic ground-PAR model against distributed field PAR sensors was located (the agrivoltaics document thin-evidence area 9). NUMBER PARTIALLY VERIFIED 2026-07-30. The R^2 0.99-1.00 range is confirmed against the arXiv preprint (2208.04886). The literal '0.3% daily error' could NOT be located anywhere in the accessible text; the reported beam shading-factor MBE/RMSE are absolute, not percentage, quantities. Treat 0.3% as untraced.

#### `zhang2025-tipping-points`

Zhang, Yuxin; Hendriks, Chantal; Uchanski, Mark; Page, Ellie. (2025). *Climatic and design tipping points in agrivoltaic crop production systems. A meta-analysis*. Agronomy for Sustainable Development 45: 69

- DOI: [10.1007/s13593-025-01060-z](https://doi.org/10.1007/s13593-025-01060-z)
- Verification: Crossref-verified | Access: open-access, evidence tier **B**
- Backs:
  - the paper's own headline tipping point is SYSTEM SIZE, ~2 ha (breakpoint 19,839 m2), beyond which microclimate temperature effects reverse
  - segmented regression on shading rate (n=155): <20% no significant difference from control (p=0.084); 20-30% lower yield (p<0.01); 30-40% positive trend (p~0.05); 40-50% slight non-significant reduction (p>0.05); 50-60% marked suppression (p<0.05); >60% further inhibition (p<0.01)
  - the authors' design conclusion that 30-40% shading may support plant growth while maintaining reasonable solar output, and that shading above 50% is not ideal from a crop standpoint
  - crop groupings used: corn shade-sensitive (n=17), beans partial (n=40), lettuce shade-tolerant (n=42)
- **Caveat:** CORRECTED 2026-07-30. Full text (21 pp, CC BY 4.0) retrieved with curl and a browser UA from https://link.springer.com/content/pdf/10.1007/s13593-025-01060-z.pdf. DO NOT ATTRIBUTE A '~50% SHADE TIPPING POINT' TO THIS PAPER. Its tipping point is ~2 ha of system size. The shade result is a separate segmented regression whose significant suppression band is 50-60%, and the literal 50% figure is Zhang et al.'s own citation of Beck et al. 2012, not their result. NO per-group effect-size table with confidence intervals exists in the paper; any such numbers cited to it are unsupportable.

## Solar engineering

47 sources.

#### `arena2024-vertical-bifacial`

Arena, Rosario; Aneli, Stefano; Gagliano, Antonio; Tina, Giuseppe Marco. (2024). *Optimal Photovoltaic Array Layout of Agrivoltaic Systems Based on Vertical Bifacial Photovoltaic Modules*. Solar RRL 8

- DOI: [10.1002/solr.202300505](https://doi.org/10.1002/solr.202300505)
- Verification: Crossref-verified | Access: open-access
- Backs:
  - vertical bifacial agrivoltaic layout parameter ranges feeding the per-latitude geometry defaults
- **Caveat:** Crossref records online publication in 2023; volume 8 is the 2024 issue year. The solar geometry document's 2024 is the issue year and is acceptable.

#### `bennett1982-refraction`

Bennett, G. G.. (1982). *The Calculation of Astronomical Refraction in Marine Navigation*. Journal of Navigation 35: 255-259

- DOI: [10.1017/S0373463300022037](https://doi.org/10.1017/S0373463300022037)
- Verification: Crossref-verified | Access: paywalled
- Backs:
  - atmospheric refraction correction
  - decision 2.4: keep geometric elevation (shadow casting) separate from refracted elevation (horizon UI)

#### `blanco-muriel2001-psa`

Blanco-Muriel, Manuel; Alarcón-Padilla, Diego C.; López-Moratalla, Teodoro; Lara-Coira, Martín. (2001). *Computing the solar vector*. Solar Energy 70: 431-441

- DOI: [10.1016/S0038-092X(00)00156-0](https://doi.org/10.1016/S0038-092X(00)00156-0)
- Verification: Crossref-verified | Access: paywalled
- Backs:
  - PSA algorithm, accuracy <=0.5 arcmin; candidate rejected in favour of SPA

#### `bright2019-engerer2-global`

Bright, Jamie M.; Engerer, Nicholas A.. (2019). *Engerer2: Global re-parameterisation, update, and validation of an irradiance separation model at different temporal resolutions*. Journal of Renewable and Sustainable Energy 11: 033701

- DOI: [10.1063/1.5097014](https://doi.org/10.1063/1.5097014)
- Verification: Crossref-verified | Access: paywalled
- Backs:
  - decision 2.5: the globally re-parameterised Engerer2 coefficients used sub-hourly

#### `britton1976-par-ratio`

Britton, C. M.; Dodd, J. D.. (1976). *Relationships of photosynthetically active radiation and shortwave irradiance*. Agricultural Meteorology 17: 1-7

- DOI: [10.1016/0002-1571(76)90080-7](https://doi.org/10.1016/0002-1571(76)90080-7)
- Verification: Crossref-verified | Access: paywalled
- Backs:
  - PAR/GHI energy ratio 0.41-0.45, the lower bound of the user-adjustable 0.42-0.50 range

#### `dobos2014-pvwatts-v5`

Dobos, Aron P.. (2014). *PVWatts Version 5 Manual*. National Renewable Energy Laboratory NREL/TP-6A20-62641

- URL: <https://www.nrel.gov/docs/fy14osti/62641.pdf>
- Verification: URL-verified | Access: public-domain, evidence tier **B**
- Backs:
  - the DC power model Pdc = (Gpoa/1000) * Pdc0 * (1 + gamma * (Tcell - 25))
  - the inverter part-load efficiency curve
  - the default loss stack: soiling, mismatch, wiring, connections, light-induced degradation, nameplate, availability
- **Caveat:** NREL technical report, no DOI. Default loss percentages are generic industry values, not measured for any specific installation

#### `engerer2015-engerer2`

Engerer, N. A.. (2015). *Minute resolution estimates of the diffuse fraction of global irradiance for southeastern Australia*. Solar Energy 116: 215-237

- DOI: [10.1016/j.solener.2015.04.012](https://doi.org/10.1016/j.solener.2015.04.012)
- Verification: Crossref-verified | Access: paywalled
- Backs:
  - the Engerer2 sub-hourly separation model

#### `erbs1982-diffuse-fraction`

Erbs, D. G.; Klein, S. A.; Duffie, J. A.. (1982). *Estimation of the diffuse radiation fraction for hourly, daily and monthly-average global radiation*. Solar Energy 28: 293-302

- DOI: [10.1016/0038-092X(82)90302-4](https://doi.org/10.1016/0038-092X(82)90302-4)
- Verification: Crossref-verified | Access: paywalled
- Backs:
  - decision 2.5: Erbs as the fallback separation model in the optional decomposition adapter

#### `faiman2008-module-temperature`

Faiman, David. (2008). *Assessing the outdoor operating temperature of photovoltaic modules*. Progress in Photovoltaics: Research and Applications 16: 307-315

- DOI: [10.1002/pip.813](https://doi.org/10.1002/pip.813)
- Verification: Crossref-verified | Access: paywalled, evidence tier **B**
- Backs:
  - the default cell-temperature model in the PV energy chain
  - module operating temperature from POA irradiance, ambient temperature and wind speed via u0/u1 heat-loss coefficients
- **Caveat:** Wiley paywalls the full text; the model form and coefficients are taken from pvlib and the Sandia PVPMC modelling guide, which state them in full. Coefficients are module-family typical values, not measured for any specific module a user selects

#### `faust2018-dli-maps`

Faust, James E.; Logan, Joanne. (2018). *Daily Light Integral: A Research Review and High-resolution Maps of the United States*. HortScience 53: 1250-1257

- DOI: [10.21273/HORTSCI13144-18](https://doi.org/10.21273/HORTSCI13144-18)
- Verification: Crossref-verified | Access: paywalled, evidence tier **C**
- Backs:
  - ambient DLI reference maps for the contiguous United States, contoured in 5 mol/m2/d bins from 0-5 through 60-65
  - maximum mapped DLI range 55-60 mol/m2/d in the southwestern US May-July, with a 60-65 band appearing in the southwest in June only
  - the paper's own DLI conversion factor 0.0072664 mol (400-700 nm) per Wh (400-2700 nm), assuming 45% of the solar spectrum is PAR and 4.48 umol/J
- **Caveat:** CORRECTED 2026-07-30. Full text was retrieved by rendering the ASHS article XML in a JS-executing browser; the previously recorded 403 was the empty SPA shell served to plain HTTP clients, not a paywall. THE PAPER CONTAINS NO PER-CROP DLI TABLE. It is a narrative review organised by crop group. It must NOT back any per-crop DLI minimum. The '10-12 mol/m2/d minimum' previously attributed to this paper actually originates in Purdue HO-238-W (torres-lopez-purdue-dli), and there it is scoped to shade-intolerant FLORICULTURE crops at the finish stage. The closest thing to a threshold in Faust & Logan is a worked example, not a finding: 'If 5 mol/m2/d is considered to be the lowest acceptable DLI for a greenhouse crop...'. The paper uses 4.48 umol/J where our decision record uses McCree's in-band 4.57; the composite 2.06 umol/J figure should state which it derives from.

#### `grena2012-sunpos`

Grena, Roberto. (2012). *Five new algorithms for the computation of sun position from 2010 to 2110*. Solar Energy 86: 1323-1337

- DOI: [10.1016/j.solener.2012.01.024](https://doi.org/10.1016/j.solener.2012.01.024)
- Verification: Crossref-verified | Access: paywalled
- Backs:
  - candidate solar position algorithm family evaluated against SPA

#### `gueymard2016-separation-validation`

Gueymard, Christian A.; Ruiz-Arias, Jose A.. (2016). *Extensive worldwide validation and climate sensitivity analysis of direct irradiance predictions from 1-min global irradiance*. Solar Energy 128: 1-30

- DOI: [10.1016/j.solener.2015.10.010](https://doi.org/10.1016/j.solener.2015.10.010)
- Verification: Crossref-verified | Access: paywalled
- Backs:
  - the comparative ranking that justifies the DIRINT / Engerer2 / Erbs ordering

#### `gueymard2018-solar-constant`

Gueymard, Christian A.. (2018). *A reevaluation of the solar constant based on a 42-year total solar irradiance time series and a reconciliation of spectral irradiance references*. Solar Energy 168: 2-9

- DOI: [10.1016/j.solener.2018.04.001](https://doi.org/10.1016/j.solener.2018.04.001)
- Verification: Crossref-verified | Access: paywalled
- Backs:
  - solar constant value used for extraterrestrial irradiance and the clearness index

#### `hay1980-transposition`

Hay, John E.; Davies, John A.. (1980). *Calculation of the solar radiation incident on an inclined surface*. Proceedings of the First Canadian Solar Radiation Data Workshop 59-72

- Verification: UNVERIFIED | Access: paywalled
- Backs:
  - Hay-Davies anisotropic transposition, a candidate rejected in favour of Perez 1990
- **Caveat:** Workshop proceedings. No DOI located and no authoritative online copy verified.

#### `jacovides2003-par-mediterranean`

Jacovides, C. P.; Tymvios, F. S.; Asimakopoulos, D. N.. (2003). *Global photosynthetically active radiation and its relationship with global solar radiation in the Eastern Mediterranean basin*. Theoretical and Applied Climatology 74: 227-233

- DOI: [10.1007/s00704-002-0685-5](https://doi.org/10.1007/s00704-002-0685-5)
- Verification: Crossref-verified | Access: paywalled
- Backs:
  - corroborating regional PAR/GHI ratio measurements
- **Caveat:** The agrivoltaics document lists this as 'Jacovides, C.P. et al. (2003)' with no DOI; the DOI is supplied here. The surname appears as Tymvios in this record and Timvios in the 2004 record; same author.

#### `jacovides2004-par-cyprus`

Jacovides, C. P.; Timvios, F. S.; Papaioannou, G.; Asimakopoulos, D. N.; Theofilou, C. M.. (2004). *Ratio of PAR to broadband solar radiation measured in Cyprus*. Agricultural and Forest Meteorology 121: 135-140

- DOI: [10.1016/j.agrformet.2003.10.001](https://doi.org/10.1016/j.agrformet.2003.10.001)
- Verification: Crossref-verified | Access: paywalled
- Backs:
  - measured PAR/GHI 0.451 winter to 0.456 summer, annual mean ~0.454
  - PAR/GHI rises to 0.501 hourly under overcast sky, motivating the 0.42-0.50 adjustable range

#### `kasten1989-airmass`

Kasten, Fritz; Young, Andrew T.. (1989). *Revised optical air mass tables and approximation formula*. Applied Optics 28: 4735-4738

- DOI: [10.1364/AO.28.004735](https://doi.org/10.1364/AO.28.004735)
- Verification: Crossref-verified | Access: paywalled
- Backs:
  - relative optical air mass consumed by the Perez transposition model

#### `khan2019-ground-sculpting`

Khan, M. Ryyan; Sakr, Enas; Sun, Xingshu; Bermel, Peter; Alam, Muhammad A.. (2019). *Ground sculpting to enhance energy yield of vertical bifacial solar farms*. Applied Energy 241: 592-598

- DOI: [10.1016/j.apenergy.2019.01.168](https://doi.org/10.1016/j.apenergy.2019.01.168)
- Verification: Crossref-verified | Access: paywalled
- Backs:
  - ground-surface shaping effects on bifacial gain and on the ground light distribution
- **Caveat:** AUTHOR MISATTRIBUTION IN OUR DOCS. The solar geometry document cites 'Patel, M. T. et al. (2018). Ground sculpting to enhance vertical bifacial solar farm output. arXiv:1806.06666'. There is no Patel on the author list: it is Khan, Sakr, Sun, Bermel & Alam. The version of record is Applied Energy 241:592-598 (2019) under a slightly different title, and it supersedes the preprint the solar geometry document cites.

#### `king2004-sapm`

King, David L.; Boyson, William E.; Kratochvil, Jay A.. (2004). *Photovoltaic Array Performance Model*. Sandia National Laboratories SAND2004-3535

- URL: <https://www.osti.gov/biblio/919131>
- Verification: URL-verified | Access: public-domain, evidence tier **B**
- Backs:
  - the alternative cell-temperature model, used to measure the model-form contribution to the LER energy band by running the chain both ways
- **Caveat:** Sandia technical report, no DOI

#### `king2007-sandia-inverter`

King, David L.; Gonzalez, Sigifredo; Galbraith, Gary M.; Boyson, William E.. (2007). *Performance Model for Grid-Connected Photovoltaic Inverters*. Sandia National Laboratories SAND2007-5036

- URL: <https://www.osti.gov/biblio/920449>
- Verification: URL-verified | Access: public-domain, evidence tier **B**
- Backs:
  - the named upgrade path from the PVWatts inverter efficiency curve to a full inverter performance model
- **Caveat:** NOT IMPLEMENTED. Recorded as the intended upgrade only; the shipped chain uses the PVWatts curve. Do not cite this for any number the tool currently produces

#### `korczynski2002-dli-maps`

Korczynski, Paul C.; Logan, Joanne; Faust, James E.. (2002). *Mapping Monthly Distribution of Daily Light Integrals across the Contiguous United States*. HortTechnology 12: 12-16

- DOI: [10.21273/HORTTECH.12.1.12](https://doi.org/10.21273/HORTTECH.12.1.12)
- Verification: Crossref-verified | Access: paywalled, evidence tier **C**
- Backs:
  - earlier monthly ambient DLI maps for the contiguous United States

#### `liu1963-flat-plate`

Liu, Benjamin Y. H.; Jordan, Richard C.. (1963). *The long-term average performance of flat-plate solar-energy collectors*. Solar Energy 7: 53-74

- DOI: [10.1016/0038-092X(63)90006-9](https://doi.org/10.1016/0038-092X(63)90006-9)
- Verification: Crossref-verified | Access: paywalled
- Backs:
  - isotropic sky transposition baseline against which Perez 1990 is compared

#### `loutzenhiser2007-transposition-validation`

Loutzenhiser, P. G.; Manz, H.; Felsmann, C.; Strachan, P. A.; Frank, T.; Maxwell, G. M.. (2007). *Empirical validation of models to compute solar irradiance on inclined surfaces for building energy simulation*. Solar Energy 81: 254-267

- DOI: [10.1016/j.solener.2006.03.009](https://doi.org/10.1016/j.solener.2006.03.009)
- Verification: Crossref-verified | Access: paywalled
- Backs:
  - independent validation ranking that places Perez first among transposition models

#### `marion2017-bifacial`

Marion, Bill; MacAlpine, Sara; Deline, Chris; Asgharzadeh, Amir; Toor, Fatima; Riley, Daniel; Stein, Joshua; Hansen, Clifford. (2017). *A Practical Irradiance Model for Bifacial PV Modules*. 2017 IEEE 44th Photovoltaic Specialist Conference (PVSC) 1537-1542

- DOI: [10.1109/PVSC.2017.8366263](https://doi.org/10.1109/PVSC.2017.8366263)
- Verification: Crossref-verified | Access: paywalled
- Backs:
  - bifacial rear-side irradiance and the ground-reflected component that modifies ground light distribution

#### `maxwell1987-disc`

Maxwell, Eugene L.. (1987). *A Quasi-Physical Model for Converting Hourly Global Horizontal to Direct Normal Insolation*. Solar Energy Research Institute SERI/TR-215-3087

- Verification: UNVERIFIED | Access: public-domain
- Backs:
  - the DISC model, ancestor of DIRINT
- **Caveat:** No DOI located and the report was not fetched. Bibliographic details inherited from the pvlib documentation and the solar geometry document.

#### `mccree1971-action-spectrum`

McCree, K. J.. (1971). *The action spectrum, absorptance and quantum yield of photosynthesis in crop plants*. Agricultural Meteorology 9: 191-216

- DOI: [10.1016/0002-1571(71)90022-7](https://doi.org/10.1016/0002-1571(71)90022-7)
- Verification: Crossref-verified | Access: paywalled
- Backs:
  - the 400-700 nm definition of PAR from the crop photosynthesis action spectrum
  - the spectral basis for 4.57 umol/J in-band photon conversion
- **Caveat:** YEAR MISMATCH: our docs date this 1972; Crossref records issued year 1971 (Agricultural Meteorology vol. 9). The volume and pages in our docs are correct. Both years circulate in the literature; 1971 is the registered record.

#### `mccree1972-par-definitions`

McCree, K. J.. (1972). *Test of current definitions of photosynthetically active radiation against leaf photosynthesis data*. Agricultural Meteorology 10: 443-453

- DOI: [10.1016/0002-1571(72)90045-3](https://doi.org/10.1016/0002-1571(72)90045-3)
- Verification: Crossref-verified | Access: paywalled
- Backs:
  - validation that a photon-based PAR definition outperforms energy-based definitions
- **Caveat:** This is a SECOND, DISTINCT McCree paper. The agrivoltaics document cites the action-spectrum paper and the solar geometry document cites this one, both as 'McCree (1972)'. Different articles, different DOIs; they must not be merged into one bibliography entry.

#### `meek1984-par-ratio`

Meek, D. W.; Hatfield, J. L.; Howell, T. A.; Idso, S. B.; Reginato, R. J.. (1984). *A Generalized Relationship between Photosynthetically Active Radiation and Solar Radiation*. Agronomy Journal 76: 939-945

- DOI: [10.2134/agronj1984.00021962007600060018x](https://doi.org/10.2134/agronj1984.00021962007600060018x)
- Verification: Crossref-verified | Access: paywalled
- Backs:
  - PAR = 0.45 x GHI by energy, the product default
  - derived from paired year-long PAR/shortwave records at Fresno CA over the 0.285-2.8 um band

#### `michalsky1988-almanac`

Michalsky, Joseph J.. (1988). *The Astronomical Almanac's algorithm for approximate solar position (1950-2050)*. Solar Energy 40: 227-235

- DOI: [10.1016/0038-092X(88)90045-X](https://doi.org/10.1016/0038-092X(88)90045-X)
- Verification: Crossref-verified | Access: paywalled
- Backs:
  - candidate low-cost solar position algorithm, rejected on accuracy grounds

#### `perez1990-transposition`

Perez, Richard; Ineichen, Pierre; Seals, Robert; Michalsky, Joseph; Stewart, Ronald. (1990). *Modeling daylight availability and irradiance components from direct and global irradiance*. Solar Energy 44: 271-289

- DOI: [10.1016/0038-092X(90)90055-H](https://doi.org/10.1016/0038-092X(90)90055-H)
- Verification: Crossref-verified | Access: paywalled
- Backs:
  - the Perez transposition coefficient set (Table 6), the allsitescomposite1990 model
  - decision 2.3: one shared sky model for plane-of-array transposition and the ground DLI map
  - chosen because it is the same sky model behind Radiance gendaymtx

#### `perez1992-dirint`

Perez, Richard; Ineichen, Pierre; Maxwell, Eugene; Seals, Robert; Zelenka, Antoine. (1992). *Dynamic global-to-direct irradiance conversion models*. ASHRAE Transactions 98: 354-369

- Verification: UNVERIFIED | Access: paywalled
- Backs:
  - decision 2.5: DIRINT as the recommended hourly separation model
- **Caveat:** No DOI located; ASHRAE Transactions volumes are not comprehensively deposited in Crossref. The author list here follows the pvlib documentation and is broader than the solar geometry document's 'Perez, R. et al.'.

#### `perez1993-sky-luminance`

Perez, Richard; Seals, Robert; Michalsky, Joseph. (1993). *All-weather model for sky luminance distribution - Preliminary configuration and validation*. Solar Energy 50: 235-245

- DOI: [10.1016/0038-092X(93)90017-I](https://doi.org/10.1016/0038-092X(93)90017-I)
- Verification: Crossref-verified | Access: paywalled
- Backs:
  - the all-weather sky luminance distribution used by Radiance gendaymtx and therefore by our cumulative-sky pipeline
- **Caveat:** Crossref also holds a near-identical record 10.1016/0038-092X(93)90157-J ('To all-weather model...', Solar Energy 51:423). Cite the 50:235-245 record.

#### `radiance-gendaymtx`

Ward, Greg. (n.d.). *gendaymtx - generate an annual Perez sky matrix from a weather tape*. Radiance manual pages

- URL: <https://www.radiance-online.org/learning/documentation/manual-pages/pdfs/gendaymtx.pdf>
- Verification: URL-verified | Access: open-access
- Backs:
  - the cumulative-sky daylight-coefficient method our GPU pipeline reimplements
  - gendaymtx uses the Perez all-weather sky, which is why the PV plane and ground must share one sky model

#### `reda2004-spa`

Reda, Ibrahim; Andreas, Afshin. (2004). *Solar position algorithm for solar radiation applications*. Solar Energy 76: 577-589

- DOI: [10.1016/j.solener.2003.12.003](https://doi.org/10.1016/j.solener.2003.12.003)
- Verification: Crossref-verified | Access: paywalled
- Backs:
  - NREL SPA solar position, uncertainty +/-0.0003 deg
  - decision 2.4: SPA in the simulation path, SunCalc for UI chrome only

#### `reda2007-spa-corrigendum`

Reda, Ibrahim; Andreas, Afshin. (2007). *Corrigendum to "Solar position algorithm for solar radiation applications" [Solar Energy 76 (2004) 577-589]*. Solar Energy 81: 838

- DOI: [10.1016/j.solener.2007.01.003](https://doi.org/10.1016/j.solener.2007.01.003)
- Verification: Crossref-verified | Access: paywalled
- Backs:
  - errata that must be applied to any implementation ported from the 2004 journal text

#### `reda2008-spa-report`

Reda, Ibrahim; Andreas, Afshin. (2008). *Solar Position Algorithm for Solar Radiation Applications (Revised)*. National Renewable Energy Laboratory NREL/TP-560-34302

- DOI: [10.2172/15003974](https://doi.org/10.2172/15003974)
- Verification: Crossref-verified | Access: public-domain
- Backs:
  - the normative SPA computation chain our implementation follows step by step
  - the algorithm ported into pvlib/spa.py (BSD-3) that we re-port to TypeScript
- **Caveat:** Cite the January 2008 revision, not the 2003 original. Apply the journal corrigendum (10.1016/j.solener.2007.01.003) to any implementation derived from the 2004 article text.

#### `reindl1990-tilted-surface`

Reindl, D. T.; Beckman, W. A.; Duffie, J. A.. (1990). *Evaluation of hourly tilted surface radiation models*. Solar Energy 45: 9-17

- DOI: [10.1016/0038-092X(90)90061-G](https://doi.org/10.1016/0038-092X(90)90061-G)
- Verification: Crossref-verified | Access: paywalled
- Backs:
  - Reindl transposition, a candidate rejected in favour of Perez 1990

#### `reinhart2001-radiance-validation`

Reinhart, Christoph F.; Walkenhorst, Oliver. (2001). *Validation of dynamic RADIANCE-based daylight simulations for a test office with external blinds*. Energy and Buildings 33: 683-697

- DOI: [10.1016/S0378-7788(01)00058-5](https://doi.org/10.1016/S0378-7788(01)00058-5)
- Verification: Crossref-verified | Access: paywalled
- Backs:
  - decision 5: Reinhart MF:2 = 577-patch sky subdivision for the production cumulative-sky pass
  - validity of the daylight-coefficient method

#### `sager1988-photon-conversion`

Sager, J. C.; Smith, W. O.; Edwards, J. L.; Cyr, K. L.. (1988). *Photosynthetic Efficiency and Phytochrome Photoequilibria Determination Using Spectral Data*. Transactions of the ASAE 31: 1882-1889

- DOI: [10.13031/2013.30952](https://doi.org/10.13031/2013.30952)
- Verification: Crossref-verified | Access: paywalled
- Backs:
  - photon conversion 4.57 umol/J in-band
  - composite 0.45 x 4.57 = 2.06 umol/J on broadband GHI
  - DLI (mol/m2/d) ~= GHI (MJ/m2/d) x 2.06, or x 7.4 for kWh/m2/d

#### `sengupta2018-nsrdb`

Sengupta, Manajit; Xie, Yu; Lopez, Anthony; Habte, Aron; Maclaurin, Galen; Shelby, James. (2018). *The National Solar Radiation Data Base (NSRDB)*. Renewable and Sustainable Energy Reviews 89: 51-60

- DOI: [10.1016/j.rser.2018.03.003](https://doi.org/10.1016/j.rser.2018.03.003)
- Verification: Crossref-verified | Access: open-access
- Backs:
  - decision 9: the NSRDB as a worker-proxied TMY source for North America
- **Caveat:** Describes the NSRDB and the Physical Solar Model through v3. It does NOT describe PSM v4.0.0, which is the model behind the GOES v4 endpoints this app now calls: PSM v3.2.2 and its TMY product were retired and replaced by GOES Aggregated and GOES TMY v4.0.0. NLR still names this paper as the foundational NSRDB reference, so it is cited for the database and not for the model version in use.

#### `spencer1971-fourier`

Spencer, J. W.. (1971). *Fourier series representation of the position of the sun*. Search 2: 172

- Verification: UNVERIFIED | Access: paywalled
- Backs:
  - low-order declination approximation, retained only for comparison
- **Caveat:** No DOI located. Search 2(5):172 is a one-page note that is very widely cited and very rarely read; treat the bibliographic details as inherited from secondary citation.

#### `stallknecht2025-vce-dli`

Stallknecht, Eric. (2025). *Calculating and Using Daily Light Integral (DLI): An Introductory Guide*. Virginia Cooperative Extension SPES-720NP

- URL: <https://www.pubs.ext.vt.edu/content/dam/pubs_ext_vt_edu/spes/spes-720/SPES-720.pdf>
- Verification: URL-verified | Access: public-domain, evidence tier **C**
- Backs:
  - DLI calculation guidance underpinning the DLI classification bands

#### `szarek2026-high-latitude-vertical`

Szarek, Kamil; Jouttijärvi, Sami; Karttunen, Ville; Hynnä, Aleksi. (2026). *Performance evaluation of high latitude agrivoltaic systems with vertically mounted bifacial panels*. Applied Energy 402: 127022

- DOI: [10.1016/j.apenergy.2025.127022](https://doi.org/10.1016/j.apenergy.2025.127022)
- Verification: Crossref-verified | Access: open-access
- Backs:
  - high-latitude vertical bifacial array performance for the per-latitude-band geometry defaults
- **Caveat:** The solar geometry document lists this with no authors and no DOI. Both are supplied here.

#### `thevenard2006-ground-reflectivity`

Thevenard, D.; Haddad, K.. (2006). *Ground reflectivity in the context of building energy simulation*. Energy and Buildings 38: 972-980

- DOI: [10.1016/j.enbuild.2005.11.007](https://doi.org/10.1016/j.enbuild.2005.11.007)
- Verification: Crossref-verified | Access: paywalled
- Backs:
  - ground reflectivity is strongly seasonal wherever snow lies, so a single annual albedo misstates both the ground-reflected component of the plane-of-array irradiance and the rear-side gain through the winter
- **Caveat:** Paywalled and not read in full. Cited for the established result that snow cover dominates monthly ground reflectivity at mid and high latitudes, not for any particular snow albedo: the figure this app uses is its own and is shared with the renderer so the picture and the number cannot disagree.

#### `torres-lopez-purdue-dli`

Torres, Ariana P.; Lopez, Roberto G.. (n.d.). *Measuring Daily Light Integral in a Greenhouse*. Commercial Greenhouse Production HO-238-W

- URL: <https://www.extension.purdue.edu/extmedia/ho/ho-238-w.pdf>
- Verification: URL-verified | Access: public-domain, evidence tier **C**
- Backs:
  - worked DLI integration example: 500 umol/m2/s over a 12 h photoperiod = 21.6 mol/m2/d
  - the 10-12 mol/m2/d minimum DLI figure, verbatim: 'we recommend that greenhouse growers provide a minimum of 10 to 12 mol/m2/d of light during the finish stage to produce many shade-intolerant floriculture crops'
  - propagation DLI 4-11 mol/m2/d during callusing and root development accelerates petunia and New Guinea impatiens propagation
  - greenhouse DLI seldom exceeds 25 mol/m2/d because of glazing, superstructure and season
- **Caveat:** Extension publication, not peer reviewed. THIS IS THE TRUE ORIGIN of the '10-12 mol/m2/d minimum' that our docs previously attributed to Faust & Logan 2018, which contains no such figure. SCOPE WARNING: the 10-12 figure is explicitly scoped to shade-intolerant FLORICULTURE crops at the FINISH stage in a greenhouse. It is not a vegetable threshold and not a field threshold. Using it as a Solanaceae minimum in doc 00 section 6 is an extrapolation the source does not make.

#### `torres-purdue-dli-b`

Torres, Ariana P.; Currey, Christopher J.; Lopez, Roberto G.; Faust, James E.. (2010). *Measuring Daily Light Integral (DLI)*. Commercial Greenhouse Production HO-238-B-W

- URL: <https://www.extension.purdue.edu/extmedia/ho/ho-238-b-w.pdf>
- Verification: URL-verified | Access: public-domain, evidence tier **C**
- Backs:
  - DLI measurement guidance for the curated crop table
- **Caveat:** The horticulture document cites 'Purdue HO-238-B-W' as if it were the same document as HO-238-W. They are different publications with different author lists.

#### `tregenza1987-sky-subdivision`

Tregenza, P. R.. (1987). *Subdivision of the sky hemisphere for luminance measurements*. Lighting Research & Technology 19: 13-14

- DOI: [10.1177/096032718701900103](https://doi.org/10.1177/096032718701900103)
- Verification: Crossref-verified | Access: paywalled
- Backs:
  - decision 5: Tregenza 145-patch sky discretisation for the interactive preview

## Horticulture & crop physiology

81 sources.

#### `adhikary2025-clubroot-review`

Adhikary, Dinesh; Islam, Md. Rashidul; Adhikari, Bikram; Chapara, Venkata. (2025). *Clubroot Disease: 145 Years Post-Discovery, Challenges, and Opportunities*. Annual Review of Phytopathology 63: 603-626

- DOI: [10.1146/annurev-phyto-121323-020949](https://doi.org/10.1146/annurev-phyto-121323-020949)
- Verification: Crossref-verified | Access: open-access, evidence tier **A**
- Backs:
  - clubroot resting spores survive up to 20 years with a sharp early decline
  - crop rotation as a hard constraint rather than a soft companion score
- **Caveat:** NUMBER NOT VERIFIED 2026-07-30. annualreviews.org returns 403 to automated fetch; the open abstract says only that resting spores 'persist in the soil for several years'. The '20 years with a sharp early decline' figure is common in extension literature but was NOT confirmed in this review. Cite this entry for the review's existence, not for the 20-year number, until someone reads the full text.

#### `allen1998-fao56`

Allen, Richard G.; Pereira, Luis S.; Raes, Dirk; Smith, Martin. (1998). *Crop evapotranspiration: Guidelines for computing crop water requirements*. Food and Agriculture Organization of the United Nations FAO Irrigation and Drainage Paper 56

- URL: <https://www.fao.org/4/x0490e/x0490e00.htm>
- Verification: UNVERIFIED | Access: open-access, evidence tier **A**
- Backs:
  - crop coefficients (Table 22) and rooting depths for the soil/water stage of the recommendation pipeline
- **Caveat:** URL not independently fetched.

#### `andrews2021-osu-em9305-gdd`

Andrews, Nick; Coop, Leonard; Stoven, Heather; Noordijk, Heidi; Heinrich, Aaron. (2021). *Vegetable degree-day models: An introduction for farmers and gardeners*. Oregon State University Extension Service EM 9305

- URL: <https://extension.oregonstate.edu/catalog/pub/em9305>
- Verification: URL-verified | Access: public-domain, evidence tier **B**
- Backs:
  - OSU Croptime coverage, verbatim: 'Croptime currently hosts 29 vegetable DD models and three summer annual weed models', closing the the horticulture document gap 6 / ledger A16 enumeration question
  - published lower and upper development thresholds for six vegetables: broccoli 32/70 F, cucumber 50/90 F, snap bean 40/90 F, sweet corn 44 F fresh market or 50 F processing with an 86 F upper, sweet pepper 52/100 F, tomato 45/92 F
  - cultivar-level degree-days to named growth stages and to harvest, with per-cultivar model accuracy in days and the number of data sets behind each
  - the case for GDD-based maturity over fixed days-to-maturity: 'Arcadia' broccoli in Aurora, Oregon ranged 66-103 days to maturity, a 20-32 day spread within a season by planting date
  - the calculation methods used: single sine with horizontal cutoff for most crops, and the threshold-substitution 'Corn Growing DD Method' for sweet corn
- **Caveat:** REGIONAL. The authors state the models were built from field trials 'mainly in the Willamette Valley of Oregon' in a cool Mediterranean climate, and warn that in hotter climates upper thresholds matter more and accuracy degrades. Cultivar-level, not species-level: the tabulated DDs are for four named cultivars per crop and are not species averages. Accuracy figures are the authors' own mean absolute differences computed from the fitting data, NOT independent validation, which they state explicitly. CONTRADICTS OUR BASE TEMPERATURES: EM 9305 uses 45 F (7.2 C) for tomato where the horticulture document assumes 10 C, and 44 F (6.7 C) for fresh-market sweet corn where our rows use 10 C from NDAWN. Both cannot be right; the divergence is real and must be surfaced rather than averaged away.

#### `bleasdale1960-population-yield`

Bleasdale, J. K. A.; Nelder, J. A.. (1960). *Plant Population and Crop Yield*. Nature 188: 342

- DOI: [10.1038/188342a0](https://doi.org/10.1038/188342a0)
- Verification: Crossref-verified | Access: paywalled, evidence tier **A**
- Backs:
  - Bleasdale-Nelder plant-density / yield relationship for spacing and competition modelling

#### `both1997-cornell-lettuce-light`

Both, A. J.; Albright, L. D.; Langhans, R. W.; Reiser, R. A.; Vinzant, B. G.. (1997). *Hydroponic lettuce production influenced by integrated supplemental light levels in a controlled environment agriculture facility: experimental results*. Acta Horticulturae 418: 45-52

- DOI: [10.17660/ActaHortic.1997.418.5](https://doi.org/10.17660/ActaHortic.1997.418.5)
- Verification: Crossref-verified | Access: paywalled, evidence tier **A**
- Backs:
  - the Cornell CEA daily light integral of 17 mol/m2/d for greenhouse hydroponic lettuce, the origin of the leafy-greens target ceiling
- **Caveat:** Bibliographic record verified against Crossref on 2026-09-11 (title, five authors, Acta Horticulturae 418: 45-52, 1997). The abstract is served by neither Crossref, OpenAlex, Semantic Scholar nor actahort.org to an automated fetch, so the 17 mol/m2/d figure was confirmed from the Cornell CEA Hydroponic Lettuce Handbook by Brechner and Both (brechner2013-cornell-lettuce-handbook), which states it for the boston bibb cultivar used in this research programme. Cite the two together for the figure.

#### `brechner2013-cornell-lettuce-handbook`

Brechner, Melissa; Both, A. J.. (2013). *Hydroponic Lettuce Handbook*. Cornell University Controlled Environment Agriculture Program

- URL: <https://cpb-us-e1.wpmucdn.com/blogs.cornell.edu/dist/8/8824/files/2019/06/Cornell-CEA-Lettuce-Handbook-.pdf>
- Verification: URL-verified | Access: open-access, evidence tier **B**
- Backs:
  - lettuce target DLI, verbatim: 'A supplemental light intensity within the range of 100-200 umol/m2/s (for a total of 17 mol/m2/d of both natural and supplemental lighting) at the plant level is recommended. It should be noted that 17 mol/m2/d is the light integral that worked best for the particular cultivar of boston bibb lettuce that we used'
  - tipburn is light-limited and cultivar-dependent, verbatim: 'For some cultivars, 15 or mol/m2/d is the maximum amount of light that can be used before the physiological condition called tipburn occurs' and 'Without the air flow, we were not able to go over 12 mol/m2/d'
  - seedlings, verbatim: 'the same total daily accumulated light (~22 mol/m2/d). Anecdotal evidence shows that some lettuce seedlings can tolerate 30 mol/m2/d'
- **Caveat:** A production handbook for one floating-raft greenhouse system, written from Cornell trials on a boston bibb cultivar (Ostinata, no longer available). It gives no minimum DLI and no sustained-days rule for tipburn: the tipburn ceiling it describes moves with cultivar, spacing and vertical airflow (12 to 17 mol/m2/d in its own examples), so it backs the 17 target and the existence of a light-driven tipburn limit, and nothing more precise.

#### `chamberlain2014-forest-farming-ramps`

Chamberlain, James L.; Beegle, Dana; Lajeunesse Connette, Katie. (2014). *Forest Farming Ramps*. USDA National Agroforestry Center AF Note-47

- URL: <https://www.fs.usda.gov/nac/assets/documents/agroforestrynotes/an47ff08.pdf>
- Verification: URL-verified | Access: public-domain, evidence tier **B**
- Backs:
  - ramps want high light during their own growing window, and the shade in a ramp habitat arrives after it
- **Caveat:** Gives no DLI figure for ramps or for anything else, so it can support the DIRECTION of the light requirement and never a threshold. Secondary summaries of ramp cultivation quote a '60-80% shade' canopy target that this note does not contain.

#### `cockshull1992-tomato-shading`

Cockshull, K. E.; Graves, C. J.; Cave, C. R. J.. (1992). *The influence of shading on yield of glasshouse tomatoes*. Journal of Horticultural Science 67: 11-24

- DOI: [10.1080/00221589.1992.11516215](https://doi.org/10.1080/00221589.1992.11516215)
- Verification: Crossref-verified | Access: paywalled, evidence tier **B**
- Backs:
  - origin of the '1% light = 1% yield' rule for greenhouse fruiting vegetables
- **Caveat:** GREENHOUSE relationship. Laub et al. explicitly excluded greenhouse experiments as too dissimilar to agrivoltaics. Use only as an upper-bound sensitivity for protected-culture solanaceae, never as an open-field shade response.

#### `coladonato1994-teaberry-feis`

Coladonato, Milo. (1994). *Gaultheria procumbens, eastern teaberry*. Fire Effects Information System

- DOI: [10.2737/feis-species-review-gaupro](https://doi.org/10.2737/feis-species-review-gaupro)
- Verification: Crossref-verified | Access: public-domain, evidence tier **C**
- Backs:
  - eastern teaberry found growing where soil pH ranged from 3.5 to 6.9 at the surface, with 4.5 to 6.0 reported as optimum and 7.0 the maximum tolerated
  - eastern teaberry grows well on many acidic substrates including peat, sand, sandy loam and coal spoils
- **Caveat:** Secondary synthesis of field observations, not a controlled pH trial. Verified against the FEIS full text 2026-07-31.

#### `crane-ifas-lemon-hs1153`

Crane, Jonathan H.. (n.d.). *Lemon Growing in the Florida Home Landscape*. University of Florida IFAS Extension HS1153/HS402

- URL: <https://ask.ifas.ufl.edu/publication/HS402>
- Verification: URL-verified | Access: public-domain
- Backs:
  - verbatim: 'Trees may reach 10-20 ft (3.1-6.1 m) in height' and are best 'maintained at 7 to 10 ft (2.1-3.1 m) high and 10 to 15 ft (3.1-4.6 m) wide'
  - verbatim: planted '15 to 25 feet or more (6.1 to 7.6 m) away from buildings and other trees'
  - verbatim: 'Young trees usually begin fruit production in the third year'
  - verbatim: trees are 'defoliated at 22-24F (-4.4 to -5.6C), severe wood damaged at 20F (-6.7C), flowers and young fruit are killed at 29F (-1.7C)'
  - verbatim: lemon trees 'should be planted in full sun'
- **Caveat:** Page fetched and the quoted sentences read on 2026-09-11; the publication date is not shown on the page.

#### `crane-ifas-mango-hs2`

Crane, Jonathan H.; Wasielewski, Jeff; Balerdi, Carlos F.; Maguire, Ian. (n.d.). *Mango Growing in the Florida Home Landscape*. University of Florida IFAS Extension HS2/MG216

- URL: <https://ask.ifas.ufl.edu/publication/MG216>
- Verification: URL-verified | Access: public-domain
- Backs:
  - verbatim: 'Left unpruned many mango varieties become medium to large (30 to 100 ft; 9.1 to 30.5 m) trees'
  - verbatim: less vigorous varieties with pruning 'may be planted 12 to 15 feet (3.7 to 4.6 m) apart from other trees, buildings, and power lines'
  - verbatim: 'Grafted trees will begin to bear 3 to 5 years after planting'
  - verbatim: 'mature trees can withstand air temperatures as low as 25F (-3.9C)' with injury; 'young trees may be killed at 29F to 30F (-1.7C to -1.1C)'
  - verbatim: 'mango trees should be planted in full sun for best growth and fruit production'
- **Caveat:** Page fetched and the quoted sentences read on 2026-09-11; the publication date is not shown on the page.

#### `crane-ifas-papaya-hs11`

Crane, Jonathan H.. (n.d.). *Papaya Growing in the Florida Home Landscape*. University of Florida IFAS Extension HS11/MG054

- URL: <https://ask.ifas.ufl.edu/publication/MG054>
- Verification: URL-verified | Access: public-domain
- Backs:
  - verbatim: 'Giant arborescent plant to 33 ft (10 m) tall'
  - verbatim: 'Papaya plants should be planted in full sun and at least 7 to 10 ft (2.1-3.1 m) away from other plants, buildings, and power lines'
  - verbatim: 'Well-cared-for plants may begin to produce flowers 4 months after planting and fruit 7 to 11 months after planting'
  - verbatim: 'Papaya plants are not tolerant of freezing temperatures and are damaged or killed below 31F (-0.6C)'
- **Caveat:** Page fetched and the quoted sentences read on 2026-09-11; the publication date is not shown on the page.

#### `cryan2024-three-sisters-labor`

Cryan, Jessica; Musselman, Erin; Baumgardner, Ann; Osborn, Sara. (2024). *Yield, growth, and labor demands of growing maize, beans, and squash in monoculture versus the Three Sisters*. Plants, People, Planet 7: 204-214

- DOI: [10.1002/ppp3.10576](https://doi.org/10.1002/ppp3.10576)
- Verification: Crossref-verified | Access: open-access, evidence tier **B**
- Backs:
  - labour cost of Three Sisters relative to monoculture: land efficiency is not the only objective function
  - the product must surface labour and harvest difficulty alongside LER
- **Caveat:** Licence is CC BY-NC 4.0, not CC BY. Crossref records online publication 2024; the horticulture and agroecology documents date it 2025, matching the volume 7 issue year.

#### `ctahr-hgv18-upland-taro`

University of Hawaii Cooperative Extension Service. (1998). *Upland Taro*. College of Tropical Agriculture and Human Resources, University of Hawaii at Manoa Home Garden Vegetable HGV-18

- URL: <https://www3.ctahr.hawaii.edu/oc/freepubs/pdf/HGV-18.pdf>
- Verification: URL-verified | Access: public-domain
- Backs:
  - verbatim: 'use a guide string to plant 18-24 inches apart within rows 18-24 inches apart'
  - verbatim: 'Upland taro is ready for harvest 8-10 months after planting'
  - verbatim: 'best results are obtained on deep, well drained, friable loams with pH 5.5-6.5'; 'It is best adapted to a warm, moist environment. Evenly distributed rainfall is ideal'
- **Caveat:** Home-garden guidance for Hawaii; gives no temperature figures.

#### `de-melo-abreu2004-olive-chilling`

De Melo-Abreu, J. P.; Barranco, D.; Cordeiro, A. M.; Tous, J.; Rogado, B. M.; Villalobos, F. J.. (2004). *Modelling olive flowering date using chilling for dormancy release and thermal time*. Agricultural and Forest Meteorology 125: 117-127

- DOI: [10.1016/j.agrformet.2004.02.009](https://doi.org/10.1016/j.agrformet.2004.02.009)
- Verification: Crossref-verified | Access: paywalled, evidence tier **A**
- Backs:
  - the 150 to 300 hour chilling requirement below 7 C the study modelled for its olive cultivars
- **Caveat:** Crossref records only one author, family 'DEMELOABREU' given 'J', with no spacing; the paper is cited everywhere as De Melo-Abreu, Barranco, Cordeiro, Tous, Rogado and Villalobos.

#### `dou2018-basil-dli`

Dou, Haijie; Niu, Genhua; Gu, Mengmeng; Masabni, Joseph G.. (2018). *Responses of Sweet Basil to Different Daily Light Integrals in Photosynthesis, Morphology, Yield, and Nutritional Quality*. HortScience 53: 496-503

- DOI: [10.21273/HORTSCI12785-17](https://doi.org/10.21273/HORTSCI12785-17)
- Verification: Crossref-verified | Access: open-access, evidence tier **A**
- Backs:
  - sweet basil grown for 21 days under five DLIs: 9.3, 11.5, 12.9, 16.5 and 17.8 mol/m2/d; shoot fresh weight was 54 to 79 percent higher under the higher DLIs than under 9.3, and soluble sugars, chlorophyll, anthocyanins and phenolics rose with DLI
  - the basil production DLI, verbatim: 'we suggest a DLI of 12.9 mol/m2/d for sweet basil commercial production in indoor vertical farming to minimize the energy cost while maintaining a high yield and nutritional quality'
- **Caveat:** Bibliographic record verified against Crossref on 2026-09-11; abstract read through the OpenAlex record. The suggested 12.9 mol/m2/d is a production recommendation that trades energy cost against yield and quality; plants at 9.3 still grew, so it is not a failure threshold. Indoor sole-source LED culture.

#### `duke1983-energy-crops-purdue`

Duke, James A.. (1983). *Handbook of Energy Crops*. Unpublished; hosted by Purdue University NewCROP

- URL: <https://hort.purdue.edu/newcrop/duke_energy/dukeindex.html>
- Verification: URL-verified | Access: open-access, evidence tier **C**
- Backs:
  - cassava, verbatim: 'Shrub or small tree, 1.3-5 m tall'; spacing 'usually 1.20 m to 1.50 m by 80 cm for good cvs on fertile soils; 1 m each way for weak cvs on poor soils'; 'Cassava is harvested in 10-14 months, depending on the cv, the cultural practices and the purpose of the crop'; cassava is 'reported to tolerate' shade
  - rice, verbatim: 'Erect annual grass, to 1.2 m tall'; transplanted 'spaced 10-20 cm apart in 20-30 cm rows'; 'From planting to harvest varies: 4 months in Italy, 6 months in monsoon regions of Asia, and 135 days for some cvs in the US'
- **Caveat:** An unpublished 1983 compilation, served by a land-grant site. Its climate ranges are means of reported cases and are not used here; only the descriptive height, spacing and harvest statements are cited.

#### `erdei2024-desmodium-interception`

Erdei, Anna L.; David, Aneth B.; Savvidou, Eleni C.; Dzemedzionaite, Vaida; Chakravarthy, Advaith; Molnar, Bela P.; Dekker, Teun. (2024). *The push-pull intercrop Desmodium does not repel, but intercepts and kills pests*. eLife 13: e88695

- DOI: [10.7554/eLife.88695](https://doi.org/10.7554/eLife.88695)
- Verification: Crossref-verified | Access: open-access, evidence tier **B**
- Backs:
  - NO ADULT REPELLENCY: in wind-tunnel oviposition assays gravid female Spodoptera frugiperda laid equal numbers of egg batches on maize with and without Desmodium odour
  - the terpenoids previously reported as repellent were barely detectable in Desmodium intortum headspace across greenhouse and field, with and without soil microbes, and rose only marginally after herbivory; 50 field headspace samples from Tanzania and Uganda
  - first-instar larvae PREFERRED Desmodium leaf tissue over maize in choice assays, but development stagnated and no larvae survived to pupation
  - proposed mechanism: dense silica-fortified uncinate (hooked) trichomes physically wound larvae
  - the revised functional description: Desmodium acts as a trap crop that intercepts and kills larvae, not as a volatile repellent of adults
  - the mechanism revision behind the caveat on khan2010-push-pull
- **Caveat:** This is a MECHANISM revision, not a refutation of the push-pull field outcome; Khan et al.'s yield and pest results stand. Scoped to stemborer and fall armyworm. DO NOT transfer it to the Striga claim, which is a different pest guild and a different chemistry (Tsanuo et al. 2003, Hooper et al. 2010). The trichome mechanism is proposed, not proven, and eLife rates the strength of evidence 'solid' rather than compelling, which is why this is tier B. Related but distinct, do not conflate: Odermatt et al. 2025, eLife RP100981, 10.7554/eLife.100981.3, a parallel study with icipe-affiliated authors that detected more field volatiles but still found no significant reduction in FAW oviposition. Not a rebuttal. No formal rebuttal from the icipe group was located.

#### `ernst2018-clubroot-spores`

Ernst, T. W.; Kher, S.; Stanton, D.; Rennie, D. C.. (2018). *Plasmodiophora brassicae resting spore dynamics in clubroot resistant canola (Brassica napus) cropping systems*. Plant Pathology 68: 399-408

- DOI: [10.1111/ppa.12949](https://doi.org/10.1111/ppa.12949)
- Verification: Crossref-verified | Access: paywalled, evidence tier **A**
- Backs:
  - clubroot resting-spore decline dynamics across a rotation break
- **Caveat:** The horticulture document dates this 2019, matching the volume 68 issue year; Crossref records online publication in 2018.

#### `farazdaghi1968-competition-yield`

Farazdaghi, H.; Harris, P. M.. (1968). *Plant Competition and Crop Yield*. Nature 217: 289-290

- DOI: [10.1038/217289a0](https://doi.org/10.1038/217289a0)
- Verification: Crossref-verified | Access: paywalled, evidence tier **A**
- Backs:
  - the reciprocal-yield competition model that the horticulture document misattributed to Holliday
- **Caveat:** Recorded expressly to correct the horticulture document's misattribution.

#### `fiedler2007-insectary`

Fiedler, Anna K.; Landis, Douglas A.. (2007). *Attractiveness of Michigan Native Plants to Arthropod Natural Enemies and Herbivores*. Environmental Entomology 36: 751-765

- DOI: [10.1093/ee/36.4.751](https://doi.org/10.1093/ee/36.4.751)
- Verification: Crossref-verified | Access: paywalled, evidence tier **A**
- Backs:
  - species-level insectary plant selection for natural-enemy provisioning
- **Caveat:** Crossref holds two DOIs for this article (also 10.1603/0046-225X(2007)36[751:AOMNPT]2.0.CO;2). Prefer the OUP DOI recorded here.

#### `finch-collier2000-landings`

Finch, Stan; Collier, Rosemary H.. (2000). *Host-plant selection by insects - a theory based on 'appropriate/inappropriate landings' by pest insects of cruciferous plants*. Entomologia Experimentalis et Applicata 96: 91-102

- DOI: [10.1046/j.1570-7458.2000.00684.x](https://doi.org/10.1046/j.1570-7458.2000.00684.x)
- Verification: Crossref-verified | Access: paywalled, evidence tier **A**
- Backs:
  - appropriate/inappropriate landings theory: Grade A for the theory, D/E for the folk version

#### `finch-collier2003`

Finch, Stan; Billiald, Helen; Collier, Rosemary H.. (2003). *Companion planting - do aromatic plants disrupt host-plant finding by the cabbage root fly and the onion fly more effectively than non-aromatic plants?*. Entomologia Experimentalis et Applicata 109: 183-195

- DOI: [10.1046/j.0013-8703.2003.00102.x](https://doi.org/10.1046/j.0013-8703.2003.00102.x)
- Verification: Crossref-verified | Access: paywalled, evidence tier **A**
- Backs:
  - Grade E for 'aromatic herbs repel pests': aromatic plants were no more effective than non-aromatic plants
  - the operative mechanism is green surface area, not smell
  - undersowing with non-host green cover is the effective intervention
- **Caveat:** AUTHOR MISMATCH. Both doc 00 section 11 and the horticulture document cite this as 'Finch & Collier (2003)'. The paper has three authors: Finch, Billiald & Collier. The citekey is kept for continuity with the decision record, but any rendered reference must list Billiald.

#### `gao2020-spinach-dli`

Gao, Wei; He, Dongxian; Ji, Fang; Zhang, Sen; Zheng, Jianfeng. (2020). *Effects of Daily Light Integral and LED Spectrum on Growth and Nutritional Quality of Hydroponic Spinach*. Agronomy 10: 1082

- DOI: [10.3390/agronomy10081082](https://doi.org/10.3390/agronomy10081082)
- Verification: Crossref-verified | Access: open-access, evidence tier **A**
- Backs:
  - hydroponic spinach grown in a closed plant factory under four DLIs, 11.5, 14.4, 17.3 and 20.2 mol/m2/d, crossed with four spectra
  - total fresh and dry weight, energy yield and light use efficiency were highest at 17.3 mol/m2/d (with a red:blue ratio of 1.2), and net photosynthetic rate peaked at 17.3 regardless of spectrum; 20.2 gave less
- **Caveat:** Bibliographic record verified against Crossref on 2026-09-11 (CC BY 4.0); abstract read through the OpenAlex record. The lowest level tested, 11.5 mol/m2/d, is a plant-factory setting far above what a garden bed offers in spring, so the trial places an optimum and no minimum; the catalogue spinach row therefore stays a Tier C class inference and cites this work in the documentation only.

#### `garbuzov2014-attractiveness`

Garbuzov, Mihail; Ratnieks, Francis L. W.. (2014). *Quantifying variation among garden plants in attractiveness to bees and other flower-visiting insects*. Functional Ecology 28: 364-374

- DOI: [10.1111/1365-2435.12178](https://doi.org/10.1111/1365-2435.12178)
- Verification: Crossref-verified | Access: open-access, evidence tier **A**
- Backs:
  - that garden plants differ by more than an order of magnitude in the flower visitors they attract, and that the difference is a property of the plant
- **Caveat:** Counts are of 32 summer-flowering garden varieties in southern England. The ranking is not a global one and does not cover most food crops.

#### `gimsing2006-glucosinolate-soil`

Gimsing, A. L.; Kirkegaard, J. A.. (2006). *Glucosinolate and isothiocyanate concentration in soil following incorporation of Brassica biofumigants*. Soil Biology and Biochemistry 38: 2255-2264

- DOI: [10.1016/j.soilbio.2006.01.024](https://doi.org/10.1016/j.soilbio.2006.01.024)
- Verification: Crossref-verified | Access: paywalled, evidence tier **B**
- Backs:
  - glucosinolate and isothiocyanate concentrations in soil peak immediately (30 min) after incorporation of pulverised Brassica tissue, and are detectable for up to 8 d (GSL) and 12 d (ITC)
  - maximum total ITC concentration 21.6 nmol/g soil for rape and 90.6 nmol/g for mustard
  - ITC release efficiency 26% for high-glucosinolate rape and 56% for mustard when tissue is pulverised
  - the amount released is generally proportional to the glucosinolate content of the incorporated tissue, so cultivar choice matters
  - irrigating with 18 mm of water over 3 h had no effect on either GSL or ITC concentration
  - a significant proportion of plant glucosinolate persists un-hydrolysed in soil for several days after incorporation
- **Caveat:** Elsevier paywalls the full text (Crossref record and abstract read via Europe PMC 2026-07-30; body never read). IMPORTANT LOGICAL LIMIT: every treatment in this study used PULVERISED tissue, so on its own this paper does NOT demonstrate maceration dependence. It establishes the high-release end of the range. The contrast that makes maceration load-bearing comes from morra2002-isothiocyanate-release, where simple incorporation yielded 1% or less. Cite the pair together or the argument does not close. Field/lab study on rape and mustard only; no garden-scale trial and no pest-outcome measurement.

#### `govaerts2021-wcvp`

Govaerts, Rafaël; Nic Lughadha, Eimear; Black, Nicholas; Turner, Robert; Paton, Alan. (2021). *The World Checklist of Vascular Plants, a continuously updated resource for exploring global plant diversity*. Scientific Data 8: 215

- DOI: [10.1038/s41597-021-00997-6](https://doi.org/10.1038/s41597-021-00997-6)
- Verification: Crossref-verified | Access: open-access, evidence tier **A**
- Backs:
  - where each catalogue species is recorded as native, at TDWG level 3, introductions excluded
- **Caveat:** A checklist of the wild species. It says nothing about cultivated varieties bred from one, and native status is not a statement that a plant will grow well in a given garden.

#### `hargreaves1985-reference-et`

Hargreaves, George H.; Samani, Zohrab A.. (1985). *Reference Crop Evapotranspiration from Temperature*. Applied Engineering in Agriculture 1: 96-99

- DOI: [10.13031/2013.26773](https://doi.org/10.13031/2013.26773)
- Verification: Crossref-verified | Access: paywalled, evidence tier **B**
- Backs:
  - the reference-evapotranspiration fallback used when humidity or wind are missing from the TMY
- **Caveat:** Temperature-only method, less accurate than FAO-56 Penman-Monteith. Used only as a documented fallback; the panel names which method produced each figure via fallbackReason

#### `harrington-soil-temperature-germination`

Harrington, J. F.. (2013). *Soil temperature conditions for vegetable seed germination*. Oregon State University Extension Service

- URL: <https://extension.oregonstate.edu/gardening/soil-compost/soil-temperature-conditions-vegetable-seed-germination>
- Verification: URL-verified | Access: public-domain, evidence tier **C**
- Backs:
  - minSoilTempC per crop: a minimum / optimum range / optimum / maximum soil temperature table in degrees F for roughly 30 vegetables, e.g. 'Tomato 50 60-85 85 95'
  - the qualifier that daily fluctuation to 60 F or lower at night is essential for some species
- **Caveat:** Extension web factsheet, not a journal paper, and the underlying experiment is mid-20th-century UC Davis work with no primary citation given on the page. It reports germination temperature, which is a different quantity from a growth or transplant threshold; do not reuse the minimum column as a base temperature for GDD. OSU asserts university copyright.

#### `hoanghua2024-white-rot`

Hoang Hua, Giang; Wilson, Christopher R.; Dung, Jeremiah K. S.. (2024). *Evaluation of Bait Crops for the Integrated Management of White Rot (Sclerotium cepivorum) in Onion*. Plant Disease 108: 118-124

- DOI: [10.1094/PDIS-04-23-0688-RE](https://doi.org/10.1094/PDIS-04-23-0688-RE)
- Verification: Crossref-verified | Access: paywalled, evidence tier **B**
- Backs:
  - bait crops and germination stimulants as the only experimental lever against allium white rot
  - hard rule: if white rot is reported at a site, exclude Alliums indefinitely and offer no rotation interval
- **Caveat:** The 20-40 year sclerotial survival figure and the 'rotation does not work' conclusion come from UC IPM, UMass and RHS extension pages, NOT from this paper. Those extension pages were not fetched.

#### `holden2012-trap-crop-design`

Holden, Matthew H.; Ellner, Stephen P.; Lee, Doo-Hyung; Nyrop, Jan P.; Sanderson, John P.. (2012). *Designing an effective trap cropping strategy: the effects of attraction, retention and plant spatial distribution*. Journal of Applied Ecology 49: 715-722

- DOI: [10.1111/j.1365-2664.2012.02137.x](https://doi.org/10.1111/j.1365-2664.2012.02137.x)
- Verification: Crossref-verified | Access: paywalled, evidence tier **B**
- Backs:
  - retention, not attraction, is the limiting factor in trap cropping
  - untended trap crops act as pest nurseries that concentrate and then release pests

#### `holliday1960-population-yield`

Holliday, R.. (1960). *Plant Population and Crop Yield*. Nature 186: 22-24

- DOI: [10.1038/186022b0](https://doi.org/10.1038/186022b0)
- Verification: Crossref-verified | Access: paywalled, evidence tier **A**
- Backs:
  - parabolic density-yield response for reproductive yield, used in mature-footprint fit
- **Caveat:** BAD CITATION IN OUR DOCS. The horticulture document lists 'Holliday, R. (1968). Plant competition and crop yield. Nature 217:289'. No such Holliday paper exists: Nature 217:289-290 (1968), 'Plant Competition and Crop Yield', is by FARAZDAGHI & HARRIS. Holliday's paper is the 1960 Nature 186:22-24 record here. The horticulture document has conflated two different papers by two different author teams.

#### `hooks2010-marigold-nematode`

Hooks, Cerruti R. R.; Wang, Koon-Hui; Ploeg, Antoon; McSorley, Robert. (2010). *Using marigold (Tagetes spp.) as a cover crop to protect crops from plant-parasitic nematodes*. Applied Soil Ecology 46: 307-320

- DOI: [10.1016/j.apsoil.2010.09.005](https://doi.org/10.1016/j.apsoil.2010.09.005)
- Verification: Crossref-verified | Access: paywalled, evidence tier **B**
- Backs:
  - marigold (Tagetes spp.) grown as a cover crop as a recognised tactic for suppressing plant-parasitic nematodes
  - alpha-terthienyl as the compound marigold is known among nematologists for producing, allelopathic to many plant-parasitic nematode species
  - the mechanism is UNRESOLVED and possibly multiple: allelopathy from root or shoot tissue, poor host status, enhancement of nematode-antagonistic microorganisms, or a 'dead-end' trap crop, potentially operating simultaneously
  - outcomes are highly variable, ranging from more effective than nematicides or soil fumigants to a negative impact on cash crop growth and yield
  - the named sources of that variability: how the marigold is used (intercrop vs cover crop vs soil amendment), seeding rate, interval between marigold and cash crop, cultivar, nematode species or race, temperature and marigold plant age
- **Caveat:** Literature review, not a trial, and the abstract's own conclusion is that the mechanism is uncertain and the results contradictory. Elsevier paywalls the full text to automated fetch (Crossref record and abstract read via Europe PMC 2026-07-30; body never read). SCOPE LIMIT: the abstract addresses PLANT-PARASITIC NEMATODES generally. It does not single out root-knot nematode (Meloidogyne), and it does not use the phrase 'full-season'. A companion rule that claims root-knot-specific suppression from a full-season stand is claiming more than this entry verifies. Tier B, not A: replicated but strongly context-dependent with management preconditions, and the mechanism is explicitly NOT characterised, which is the A criterion.

#### `jose-juglone`

Jose, Shibu; Holzmueller, Eric J.. (2008). *Black Walnut Allelopathy: Implications for Intercropping*. Allelopathy in Sustainable Agriculture and Forestry 303-319

- DOI: [10.1007/978-0-387-77337-7_16](https://doi.org/10.1007/978-0-387-77337-7_16)
- Verification: Crossref-verified | Access: paywalled, evidence tier **C**
- Backs:
  - juglone allelopathy is Grade C: laboratory toxicity is real, landscape-scale evidence is weak
- **Caveat:** Crossref returns NO issued year for this chapter; 2008 is the book year and is not Crossref-confirmed. The horticulture document's supporting sources for the sceptical reading (a ResearchGate copy and a WSU Extension fact sheet) are not peer reviewed and were not verified here.

#### `kattge2020-try`

Kattge, Jens; Bönisch, Gerhard; Díaz, Sandra; Lavorel, Sandra. (2020). *TRY plant trait database - enhanced coverage and open access*. Global Change Biology 26: 119-188

- DOI: [10.1111/gcb.14904](https://doi.org/10.1111/gcb.14904)
- Verification: Crossref-verified | Access: open-access
- Backs:
  - candidate plant trait source for mature footprint and functional traits
- **Caveat:** Crossref records online publication in 2019; the issue is 2020. The DATABASE has access conditions distinct from the ARTICLE's CC BY licence, and its licence compatibility with a commercial product was not evaluated.

#### `kelly2020-lettuce-dli`

Kelly, Nathan; Choe, Daegeun; Meng, Qingwu; Runkle, Erik S.. (2020). *Promotion of lettuce growth under an increasing daily light integral depends on the combination of the photosynthetic photon flux density and photoperiod*. Scientia Horticulturae 272: 109565

- DOI: [10.1016/j.scienta.2020.109565](https://doi.org/10.1016/j.scienta.2020.109565)
- Verification: Crossref-verified | Access: paywalled, evidence tier **A**
- Backs:
  - lettuce 'Rex' and 'Rouxai' grown indoors at DLIs of 6.9, 10.4 and 15.6 mol/m2/d (PPFD 120 to 270 umol/m2/s, photoperiods 16 to 24 h): shoot fresh and dry mass, leaf number and leaf width increased with DLI
  - at 15.6 mol/m2/d a lower PPFD over a longer photoperiod gave more fresh and dry mass than a higher PPFD over a shorter one; the interaction was absent at 10.4
- **Caveat:** Bibliographic record verified against Crossref on 2026-09-11; abstract read through the Semantic Scholar record, full text paywalled. The lowest DLI, 6.9 mol/m2/d, still grew both cultivars to harvest with the smallest plants: the trial establishes that growth rises with DLI across 6.9 to 15.6, and places no failure point. Indoor sole-source LED culture, so the figures are levels of a lamp schedule rather than garden thresholds.

#### `khan2008-push-pull-economics`

Khan, Zeyaur R.; Midega, Charles A. O.; Njuguna, Elizabeth M.; Amudavi, David M.. (2008). *Economic performance of the 'push-pull' technology for stemborer and Striga control in smallholder farming systems in western Kenya*. Crop Protection 27: 1084-1097

- DOI: [10.1016/j.cropro.2008.01.005](https://doi.org/10.1016/j.cropro.2008.01.005)
- Verification: Crossref-verified | Access: paywalled, evidence tier **A**
- Backs:
  - field economic performance of push-pull in western Kenya

#### `khan2008-push-pull-onfarm`

Khan, Zeyaur R.; Midega, Charles A. O.; Amudavi, David M.; Hassanali, Ahmed; Pickett, John A.. (2008). *On-farm evaluation of the 'push-pull' technology for the control of stemborers and striga weed on maize in western Kenya*. Field Crops Research 106: 224-233

- DOI: [10.1016/j.fcr.2007.12.002](https://doi.org/10.1016/j.fcr.2007.12.002)
- Verification: Crossref-verified | Access: paywalled, evidence tier **A**
- Backs:
  - on-farm replicated evidence for push-pull; the source the agroecology document cites only as 'Field Crops Research 106(3)'

#### `khan2010-push-pull`

Khan, Zeyaur R.; Midega, Charles A. O.; Bruce, Toby J. A.; Hooper, Antony M.; Pickett, John A.. (2010). *Exploiting phytochemicals for developing a 'push-pull' crop protection strategy for cereal farmers in Africa*. Journal of Experimental Botany 61: 4185-4196

- DOI: [10.1093/jxb/erq229](https://doi.org/10.1093/jxb/erq229)
- Verification: Crossref-verified | Access: paywalled, evidence tier **A**
- Backs:
  - push-pull as a Grade A outcome with a characterised mechanism
  - named attribution to Zeyaur Khan and icipe per the TEK rule on crediting individual innovators
- **Caveat:** Grade A for the OUTCOME but explicitly non-transferable to a temperate garden. The mechanism has since been revised: Desmodium intercepts and kills stemborer and fall armyworm larvae rather than repelling adults. That revision source is now located and verified as erdei2024-desmodium-interception (eLife 13:e88695). Do not merge it with the Striga mechanism, which is a different pest guild and a different chemistry.

#### `klein2007-pollinators`

Klein, Alexandra-Maria; Vaissière, Bernard E.; Cane, James H.; Steffan-Dewenter, Ingolf; Cunningham, Saul A.; Kremen, Claude; Tscharntke, Teja. (2007). *Importance of pollinators in changing landscapes for world crops*. Proceedings of the Royal Society B: Biological Sciences 274: 303-313

- DOI: [10.1098/rspb.2006.3721](https://doi.org/10.1098/rspb.2006.3721)
- Verification: Crossref-verified | Access: open-access, evidence tier **A**
- Backs:
  - how much a crop's yield depends on animal pollination, by crop and by harvested organ
- **Caveat:** Classes are stated for crops at the level of the harvested product across 107 world crops. This product applies them at the level of botanical family and harvested organ, which is an inference from the paper and not a per-species reading of it.

#### `kubota-osu-strawberry-dli`

Kubota Lab, The Ohio State University. (n.d.). *Environment*. Controlled Environment Berry Production Information

- URL: <https://u.osu.edu/indoorberry/environment/>
- Verification: URL-verified | Access: open-access, evidence tier **C**
- Backs:
  - greenhouse strawberry DLI guidance, verbatim: 'We recommend 12 mol/m2/day DLI to target as minimum level for good productivity and consider the optimum between 20-25 mol/m2/d'
  - a strawberry light ceiling, verbatim: 'Under DLI exceeding 30 mol/m2/d, strawberry plants tend to be stressed (shading is required in that case)'
- **Caveat:** Greenhouse production guidance from a university lab page, undated and without a primary citation for the numbers. Its 12 mol/m2/d minimum is a greenhouse-productivity floor and is not the same quantity as the 25 mol/m2/d agrivoltaic average-yield convention in widmer-strawberry-dli, which is what the catalogue gate uses; the two are recorded side by side in Decision Record 23. The 30 mol/m2/d stress point is the only strawberry light ceiling located and is not yet wired into the catalogue.

#### `lai2022-legume-cereal-n`

Lai, Hangxian; Gao, Fake; Su, Hao; Zheng, Peng. (2022). *Nitrogen Distribution and Soil Microbial Community Characteristics in a Legume-Cereal Intercropping System: A Review*. Agronomy 12: 1900

- DOI: [10.3390/agronomy12081900](https://doi.org/10.3390/agronomy12081900)
- Verification: Crossref-verified | Access: open-access, evidence tier **C**
- Backs:
  - supporting review for legume-cereal nitrogen dynamics

#### `lerner2020-purdue-planting-calendar`

Lerner, B. Rosie. (2020). *Indiana Vegetable Planting Calendar*. Purdue University Cooperative Extension Service HO-186-W

- URL: <https://www.extension.purdue.edu/extmedia/HO/HO-186-W.pdf>
- Verification: URL-verified | Access: public-domain, evidence tier **C**
- Backs:
  - frostOffsetDays by hardiness class, verbatim from Table 1: hardy (tolerates hard frost) 'plant 4-6 weeks before last spring frost'; semi-hardy (tolerates light frost) 'plant 2-4 weeks before last spring frost'; tender 'plant after average last spring frost (minimum air temp 50 F)'; very tender 'plant at least two weeks after average last spring frost (minimum air temp 60-65 F)'
  - fall window rule, verbatim from Table 2: cool season plants for late-summer or fall planting 'plant at least 4-8 weeks before first fall frost'
  - minSoilTempC per crop from Table 3, 'Soil Temperatures for Vegetable Seed Germination', giving optimum, optimum range, minimum and maximum in degrees F
  - the crop-to-hardiness-class assignment for roughly 30 common vegetables
- **Caveat:** Extension publication, not peer reviewed. Calibrated to Indiana. Its own frost maps are drawn at the 10% exceedance level and the publication states explicitly that the 50% level falls about two weeks earlier in spring and two weeks later in fall, so the offsets must be applied against a stated percentile, not against an unqualified 'average frost date'. Purdue asserts university copyright; classified public-domain here per this corpus's convention for extension output.

#### `long2024-blueberry-lsp`

Long, Yu; Tan, Xiaofeng; Zhu, Jing; An, Hua. (2024). *Response of blueberry photosynthetic physiology to light intensity during different stages of fruit development*. PLOS ONE 19: e0310252

- DOI: [10.1371/journal.pone.0310252](https://doi.org/10.1371/journal.pone.0310252)
- Verification: Crossref-verified | Access: open-access, evidence tier **C**
- Backs:
  - highbush blueberry light saturation point near 500 umol/m2/s under field conditions
  - Pmax, apparent quantum yield, LCP and LSP all decline under sustained low light
- **Caveat:** Single-species, single-study. The agrivoltaics document cites it with neither authors nor DOI; both are supplied here. NUMBER NOT VERIFIED 2026-07-30. The PLOS ONE full text never states '500' as a light saturation point. The nearest textual anchor is a Pn-vs-PAR curve described as plateauing at 400 umol/m2/s; the fitted LSP values appear only in a bar chart (Fig 3) and are not extractable as text. The '~500 umol/m2/s' figure in our docs is therefore unconfirmed and must not reach a hard filter.

#### `mansion-vaquie2019-aphids`

Mansion-Vaquié, Agathe; Ferrer, Astrid; Ramon-Portugal, Felipe; Wezel, Alexander. (2019). *Intercropping impacts the host location behaviour and population growth of aphids*. Entomologia Experimentalis et Applicata 168: 41-52

- DOI: [10.1111/eea.12848](https://doi.org/10.1111/eea.12848)
- Verification: Crossref-verified | Access: paywalled, evidence tier **B**
- Backs:
  - intercropping disrupts aphid host location, consistent with the green-surface-area mechanism

#### `marcelis2006-light-response`

Marcelis, L. F. M.; Broekhuijsen, A. G. M.; Meinen, E.; Nijs, E. M. F. M.; Raaphorst, M. G. M.. (2006). *Quantification of the growth response to light quantity of greenhouse grown crops*. Acta Horticulturae 97-104

- DOI: [10.17660/ActaHortic.2006.711.9](https://doi.org/10.17660/ActaHortic.2006.711.9)
- Verification: Crossref-verified | Access: paywalled, evidence tier **B**
- Backs:
  - refinement of the 1%-light rule to 0.7-1.0% yield decline per 1% radiation reduction
  - the relative effect is larger at low light, higher CO2, and in winter
- **Caveat:** PAGE MISMATCH: the agrivoltaics document gives 97-103; Crossref gives 97-104. Same greenhouse-only restriction as Cockshull 1992.

#### `martin-guay2018-ler`

Martin-Guay, Marc-Olivier; Paquette, Alain; Dupras, Jérôme; Rivest, David. (2018). *The new Green Revolution: Sustainable intensification of agriculture by intercropping*. Science of The Total Environment 615: 767-772

- DOI: [10.1016/j.scitotenv.2017.10.024](https://doi.org/10.1016/j.scitotenv.2017.10.024)
- Verification: Crossref-verified | Access: paywalled, evidence tier **A**
- Backs:
  - intercropping mean land equivalent ratio 1.30 (23% less land), with 38% more gross energy (relative land output 1.38) and 33% more gross income (1.33), from 939 observations in 126 studies
  - LER was unaffected by irrigation, aridity index, fertilisation and intercropping pattern, so the benefit is not conditional on water stress
  - TEK design rule 7: LER-style portfolio yield reporting rather than single-crop maximisation
- **Caveat:** FALSE ATTRIBUTION CORRECTED 2026-07-30. This entry previously read 'intercropping Land Equivalent Ratio 1.22-1.32'. That range does not appear in this paper. Martin-Guay et al. report a single mean LER of 1.30. The 1.22 is the mean LER from a DIFFERENT meta-analysis, Yu et al. 2015 (yu2015-temporal-niche-ler, 1.22 +/- 0.02), and 1.32 corresponds to nothing in either. Two meta-analyses had been merged into one fabricated interval. Cite each separately.

#### `morra2002-isothiocyanate-release`

Morra, M. J.; Kirkegaard, J. A.. (2002). *Isothiocyanate release from soil-incorporated Brassica tissues*. Soil Biology and Biochemistry 34: 1683-1690

- DOI: [10.1016/S0038-0717(02)00153-0](https://doi.org/10.1016/S0038-0717(02)00153-0)
- Verification: Crossref-verified | Access: paywalled, evidence tier **B**
- Backs:
  - MACERATION DEPENDENCE, the core of the biofumigation rule: with simple incorporation, 'only 1% or less of the ITC predicted from tissue glucosinolate concentrations was measured in soil'
  - cell-level tissue disruption by freezing and thawing raised maximum ITC to 40-75 nmol/g soil, increasing release efficiency to 14 and 26%
  - maximum ITC concentrations near 1.0 nmol/g soil immediately after simple incorporation, with little production after 4 d
  - the authors' management conclusion: choose a high-glucosinolate rapeseed or mustard variety, provide adequate moisture, and above all maximise cell disruption
- **Caveat:** Elsevier paywalls the full text (Crossref record and abstract read via Europe PMC 2026-07-30; body never read). The cell disruption tested here is FREEZE-THAW in a controlled study, not field maceration by a flail mower or a garden spade; that a gardener's chopping achieves the same disruption is an inference this paper does not make. Measures ITC concentration in soil, NOT pest suppression or crop outcome: nothing here shows a garden pest was controlled. Rapeseed and Indian mustard only.

#### `mt-pleasant2010-iroquoian`

Mt. Pleasant, Jane; Burt, Robert F.. (2010). *Estimating Productivity of Traditional Iroquoian Cropping Systems from Field Experiments and Historical Literature*. Journal of Ethnobiology 30: 52-79

- DOI: [10.2993/0278-0771-30.1.52](https://doi.org/10.2993/0278-0771-30.1.52)
- Verification: Crossref-verified | Access: paywalled, evidence tier **B**
- Backs:
  - quantified productivity of Haudenosaunee Three Sisters cropping
  - attribution of the Three Sisters system specifically to Haudenosaunee and Mesoamerican peoples

#### `ncsu-plant-toolbox`

NC State Extension. (n.d.). *North Carolina Extension Gardener Plant Toolbox*. North Carolina State University

- URL: <https://plants.ces.ncsu.edu/>
- Verification: URL-verified | Access: public-domain
- Backs:
  - cassava (Manihot esculenta): height and width 6 to 10 ft, USDA zones 10a to 12b, full sun or partial shade
  - taro (Colocasia esculenta): height and width 3 to 6 ft, USDA zones 8a to 11b, full sun or partial shade
  - plantain (Musa x paradisiaca): height 7 to 25 ft, width 6 to 10 ft, USDA zones 9a to 11b, full sun, available space to plant 12 to 24 ft
  - lemon (Citrus x limon): height 10 to 20 ft, width 10 to 15 ft, USDA zones 9a to 11b, full sun
- **Caveat:** A land-grant garden reference compiled from secondary sources; dimensions are landscape ranges rather than trial measurements, and the zone lists are hardiness statements for North Carolina gardeners.

#### `ndsu-ndawn-corn-gdd`

(n.d.). *NDAWN Corn Growing Degree Days Information*. North Dakota Agricultural Weather Network, North Dakota State University

- URL: <https://ndawn.ndsu.nodak.edu/help-corn-growing-degree-days.html>
- Verification: URL-verified | Access: public-domain, evidence tier **C**
- Backs:
  - corn GDD base temperature, verbatim: 'Scientists have determined the lower base temperature for corn is 50 F (10 C)'
  - corn GDD upper limit, verbatim: 'The upper limit for corn is 86 F (30 C)'
  - the threshold-substitution modified GDD method: substitute 50 F for daily minima below it and 86 F for daily maxima above it
- **Caveat:** EXTRAPOLATION WARNING. The page is about CORN generally and never mentions SWEET corn. Our rows.ts sweet-corn 10/30 C is therefore an inference from the field-corn convention, not a sweet-corn measurement. OSU EM 9305, which did fit sweet corn specifically, uses 44 F (6.7 C) for fresh-market varieties and 50 F only for processing varieties, so the two sources disagree on exactly the crop we ship. A weather-network help page is not peer-reviewed literature; 10/30 C is a standard agronomic convention, which is a different kind of warrant from a measurement.

#### `oikeh-warda-upland-rice-handbook`

Oikeh, S. O.; Nwilene, F. E.; Agunbiade, T. A.; Oladimeji, O.; Ajayi, O.; Semon, M.; Tsunematsu, H.; Samejima, H.. (n.d.). *Growing upland rice: a production handbook*. Africa Rice Center (WARDA)

- URL: <https://www.fao.org/fileadmin/user_upload/ivc/docs/uplandrice.pdf>
- Verification: URL-verified | Access: open-access
- Backs:
  - spacing, verbatim: 'Dibbling at 30 x 30 cm or 20 x 20 cm: seed rate: 50-60 kg/ha' and 'Drilling at 25-30 cm row spacing and 5 cm within row; seed rate: 75-80 kg/ha'
  - maturity classes, verbatim: 'Early maturing (< 90-100 days)', 'Medium maturing (100-120 days)', 'Late maturing (> 120 days)'
  - site, verbatim: 'Select your site in an ecological zone with at least 14-20 mm of five-day rainfall during the growing cycle'
- **Caveat:** A West African smallholder handbook built around NERICA and FARO cultivars; the maturity classes and spacings are those of that programme.

#### `olsen-usu-planting-dates`

Olsen, Shawn. (2018). *Suggested Vegetable Planting Dates for Utah*. Utah State University Extension

- URL: <https://extension.usu.edu/yardandgarden/research/suggested-vegetable-planting-dates-for-utah>
- Verification: URL-verified | Access: public-domain, evidence tier **C**
- Backs:
  - frostOffsetDays as a four-group ladder, verbatim: 'Group A: Hardy (Plant as soon as the soil dries out in the spring.)'; 'Group B: Semi-Hardy (Plants a week or two after A group or about 2 weeks before average last spring frost.)'; 'Group C: Tender (Plant on the average date of the last spring frost)'; 'Group D: Very Tender (Plant when the soil is warm, about 2 weeks after C group.)'
  - a worked frost-anchored table mapping average last spring frost to a concrete Group A-D planting date for 37 named locations, demonstrating the offset method in practice
  - a separate fall-harvest planting window group (Group E) with per-crop date ranges
  - days to maturity per crop in the companion planting guide, e.g. 'Tomatoes 60-90'
- **Caveat:** Extension fact sheet, calibrated to Utah's Intermountain West climate; the page itself notes Washington County differs from the rest of the state. Group C is anchored on the average (50%) last spring frost, whereas Purdue HO-186-W anchors on a 10% exceedance map: the two source's offsets are NOT interchangeable without normalising the percentile first. USU asserts university copyright.

#### `oplinger1990-sesame-afcm`

Oplinger, E. S.; Putnam, D. H.; Kaminski, A. R.; Hanson, C. V.; Oelke, E. A.; Schulte, E. E.; Doll, J. D.. (1990). *Sesame*. Alternative Field Crops Manual

- URL: <https://hort.purdue.edu/newcrop/afcm/sesame.html>
- Verification: URL-verified | Access: public-domain
- Backs:
  - verbatim: 'Sesame is an erect annual (or occasionally a perennial) that grows to a height of 20 to 60 in., depending on the variety and the growing conditions'
  - verbatim: 'Populations of 250,000 to 300,000 plants/acre in 18 to 30 in. rows have given the highest yields'
  - verbatim: 'Sesame is ready for harvesting 90 to 150 days after planting'
  - verbatim: 'Daytime temperatures of 77F to 80F are optimal; below 68F, growth is reduced, and at 50F germination and growth is inhibited'; 'Commercial varieties of sesame require 90 to 120 frostfree days'
  - verbatim: 'A minimum rainfall of 20 to 26 in. per season is necessary for reasonable yields'
- **Caveat:** Written for the upper Midwest; the agronomy is transferable, the calendar is not.

#### `peng2015-clubroot-rotation`

Peng, Gary; Pageau, Denis; Strelkov, Stephen E.; Gossen, Bruce D.. (2015). *A >2-year crop rotation reduces resting spores of Plasmodiophora brassicae in soil and the impact of clubroot on canola*. European Journal of Agronomy 70: 78-84

- DOI: [10.1016/j.eja.2015.07.007](https://doi.org/10.1016/j.eja.2015.07.007)
- Verification: Crossref-verified | Access: paywalled, evidence tier **A**
- Backs:
  - a >2-year break from host crops significantly reduces clubroot resting-spore concentration
  - hard constraint: minimum 3-year interval between Brassicaceae in the same bed
- **Caveat:** The horticulture document links this via a ScienceDirect PII (S1161030115300125) that does not correspond to this DOI. The DOI recorded here is the Crossref record for the exact title the horticulture document quotes.

#### `pennisi2020-lettuce-basil-ppfd`

Pennisi, Giuseppina; Pistillo, Alessandro; Orsini, Francesco; Cellini, Antonio; Spinelli, Francesco; Nicola, Silvana; Fernandez, Juan A.; Crepaldi, Andrea; Gianquinto, Giorgio; Marcelis, Leo F. M.. (2020). *Optimal light intensity for sustainable water and energy use in indoor cultivation of lettuce and basil under red and blue LEDs*. Scientia Horticulturae 272: 109508

- DOI: [10.1016/j.scienta.2020.109508](https://doi.org/10.1016/j.scienta.2020.109508)
- Verification: Crossref-verified | Access: paywalled, evidence tier **A**
- Backs:
  - lettuce and basil grown at PPFDs of 100, 150, 200, 250 and 300 umol/m2/s for 16 h, which the paper states as DLIs of 5.8, 8.6, 11.5, 14.4 and 17.3 mol/m2/d
  - verbatim: 'A progressive increase of biomass production for both lettuce and basil up to a PPFD of 250 umol m-2 s-1 was observed, whereas no further yield increases were associated with higher PPFD (300 umol m-2 s-1)'
  - verbatim: 'a PPFD of 250 umol m-2 s-1 seems suitable for optimizing yield and resource use efficiency in red and blue LED lighting for indoor cultivation of lettuce and basil under the prevailing conditions of the used indoor farming set-up'
- **Caveat:** Bibliographic record verified against Crossref on 2026-09-11; abstract read through the Semantic Scholar record, full text paywalled. Cultivars are not named in the abstract. Both crops still produced a crop at the lowest level, 5.8 mol/m2/d, with the least biomass; the paper places an optimum (14.4) and no failure point. Indoor sole-source LED culture.

#### `postma2012-polyculture-roots`

Postma, Johannes A.; Lynch, Jonathan P.. (2012). *Complementarity in root architecture for nutrient uptake in ancient maize/bean and maize/bean/squash polycultures*. Annals of Botany 110: 521-534

- DOI: [10.1093/aob/mcs082](https://doi.org/10.1093/aob/mcs082)
- Verification: Crossref-verified | Access: paywalled, evidence tier **B**
- Backs:
  - simulation basis for root complementarity in Three Sisters polyculture
- **Caveat:** The agroecology document cites 'PMC4416130 (PLOS ONE 2015 root-foraging LER study)'. No PLOS ONE 2015 root-foraging Three Sisters study was located. The root-foraging LER work is the Annals of Botany pair (this record and zhang2014-three-sisters-roots). The agroecology document's PMC reference is unresolved and should be corrected.

#### `rollings2019-garden-flowers`

Rollings, Rosi; Goulson, Dave. (2019). *Quantifying the attractiveness of garden flowers for pollinators*. Journal of Insect Conservation 23: 803-817

- DOI: [10.1007/s10841-019-00177-3](https://doi.org/10.1007/s10841-019-00177-3)
- Verification: Crossref-verified | Access: open-access, evidence tier **A**
- Backs:
  - that flower visitors concentrate on a minority of garden plants, and which plant families those tend to be
- **Caveat:** A single UK garden over two seasons. Family-level patterns travel further than the per-variety ranking does.

#### `runkle2011-vegetable-dli`

Runkle, Erik. (2011). *Lighting Greenhouse Vegetables*. GPN (Greenhouse Product News) 42

- URL: <https://www.canr.msu.edu/uploads/resources/pdfs/lightingvegetables.pdf>
- Verification: URL-verified | Access: public-domain, evidence tier **C**
- Backs:
  - minimum DLI for vine crops (tomato, pepper, cucumber), verbatim: 'A recommended minimum DLI for lettuce production is 12 to 14 mol/m2/d, whereas at least 15 (and preferably more than 20) mol/m2/d is suggested for vine crops'
  - the 1-percent rule, verbatim: 'As a general rule, a 1 percent increase in DLI increases production by 1 percent'
  - tomato develops chlorotic leaves under continuous light, so four to six hours of darkness is suggested each night
- **Caveat:** THIS IS THE REPLACEMENT FOR THE FALSE TOMATO DLI CITATION, and it does not give 22. It is the only Extension-authored source located that states a tomato/vine-crop DLI minimum, and the number is 15 (preferably >20), not 22. The 'at least 22 mol/m2/d' figure in the horticulture document is verbatim ReduSystems vendor marketing and has no source in this corpus or in the literature; it must be deleted, not re-cited. SCOPE: greenhouse production of vine crops, lumped as a group; the column names tomato, pepper and cucumber together and does not resolve per-species numbers. It is a trade-magazine column, not peer reviewed, and it cites no primary source for the 15/20 figures. Tier C. Must not reach a hard filter.

#### `sahli2012-chemlali-olive-chilling`

Sahli, A.; Dakhlaoui, H.; Aïachi Mezghani, M.; Bornaz, S.; Aounallah, M. K.; Hellali, R.. (2012). *Estimation of chilling and heat requirement of 'Chemlali' olive cultivar and its use to predict flowering date*. Acta Horticulturae 155-164

- DOI: [10.17660/ActaHortic.2012.949.21](https://doi.org/10.17660/ActaHortic.2012.949.21)
- Verification: Crossref-verified | Access: paywalled, evidence tier **C**
- Backs:
  - the chilling and heat requirement estimated for the 'Chemlali' olive cultivar, cited here for its summary of De Melo-Abreu et al.'s 150 to 300 hour range

#### `shelton2006-trap-cropping`

Shelton, A. M.; Badenes-Perez, F. R.. (2006). *Concepts and Applications of Trap Cropping in Pest Management*. Annual Review of Entomology 51: 285-308

- DOI: [10.1146/annurev.ento.51.110104.150959](https://doi.org/10.1146/annurev.ento.51.110104.150959)
- Verification: Crossref-verified | Access: paywalled, evidence tier **B**
- Backs:
  - of ~100 trap-cropping systems reviewed only ~10 succeeded at commercial scale
  - four of those ten depended on applying pesticide directly to the trap crop
  - Grade B for trap cropping

#### `shinozaki1956-cd-effect`

Shinozaki, Kichiro; Kira, Tatuo. (1956). *Intraspecific competition among higher plants VII: logistic theory of the C-D effect*. Journal of the Institute of Polytechnics, Osaka City University, Series D 7: 35-72

- Verification: UNVERIFIED | Access: paywalled, evidence tier **B**
- Backs:
  - logistic constant-final-yield (C-D effect) theory for intraspecific competition
- **Caveat:** No DOI located and no authoritative online copy verified. Volume and page details are inherited from secondary citation and should be treated as provisional.

#### `singh2025-ucanr-moringa`

Singh, Hardeep. (2025). *Moringa Oleifera (Miracle tree)*. UCCE Central Sierra Agriculture

- URL: <https://ucanr.edu/site/ucce-central-sierra-agriculture/article/moringa-oleifera-miracle-tree>
- Verification: URL-verified | Access: public-domain
- Backs:
  - spacing, verbatim: moringa 'could be grown for leaves and/or pods and spaced 3 to 6 feet apart accordingly'
  - verbatim: 'In California, winter frosts could kill the moringa and therefore it is cut back to one foot and covered with plastic during the winters'
- **Caveat:** A Cooperative Extension article for the central Sierra foothills; the spacing is a home-orchard range.

#### `snyder1993-sweetfern-feis`

Snyder, S. A.. (1993). *Comptonia peregrina, sweetfern*. Fire Effects Information System

- DOI: [10.2737/feis-species-review-comper](https://doi.org/10.2737/feis-species-review-comper)
- Verification: Crossref-verified | Access: public-domain, evidence tier **C**
- Backs:
  - sweetfern grows in well-drained, dry, acid, sandy or gravelly soils
  - because it fixes nitrogen sweetfern does well on disturbed or sterile sites such as pine barrens
- **Caveat:** FEIS states the acid-soil habit qualitatively and publishes NO pH numbers for this species. The sweetfern trapezoid in the catalogue is a Tier C curation, not transcribed from this source, and this work must not be cited for a pH figure. FEIS also reports only that sweetfern presence seemed to enhance neighbouring little bluestem growth; it measures no nitrogen transfer to any neighbour.

#### `snyder2005-fao-frost-protection`

Snyder, R. L.; de Melo-Abreu, J. P.. (2005). *Frost protection: fundamentals, practice and economics, Volume 1*. Food and Agriculture Organization of the United Nations FAO Environment and Natural Resources Series 10

- URL: <https://www.fao.org/4/y7223e/y7223e00.htm>
- Verification: URL-verified | Access: public-domain, evidence tier **A**
- Backs:
  - radiative frost and advective frost are different events, and only the radiative kind is reduced by putting something between the ground and the sky
  - covers and screens work by intercepting longwave loss to the sky, which is the same mechanism a panel row applies
- **Caveat:** URL fetched and the document identity confirmed from the page title on 2026-08-27; the text was not read in full. Cited for the radiative-versus-advective distinction and the mechanism of covers, not for any quantity: no frost-margin figure for an agrivoltaic array appears in it or, as far as we could find, anywhere.

#### `tang2020-p-use-efficiency`

Tang, Xiaoyan; Zhang, Chaochun; Yu, Yang; Shen, Jianbo. (2020). *Intercropping legumes and cereals increases phosphorus use efficiency; a meta-analysis*. Plant and Soil 460: 89-104

- DOI: [10.1007/s11104-020-04768-x](https://doi.org/10.1007/s11104-020-04768-x)
- Verification: Crossref-verified | Access: open-access, evidence tier **A**
- Backs:
  - LER_P = 1.24 in cereal-legume intercrops with a mean net P gain of 3.67 kg P/ha

#### `theunissen1994-intercropping-pests`

Theunissen, J.. (1994). *Intercropping in field vegetable crops: Pest management by agrosystem diversification - an overview*. Pesticide Science 42: 65-68

- DOI: [10.1002/ps.2780420111](https://doi.org/10.1002/ps.2780420111)
- Verification: Crossref-verified | Access: paywalled, evidence tier **B**
- Backs:
  - intercropping as pest management via agrosystem diversification
- **Caveat:** PAGE MISMATCH: the horticulture document gives 42:65-72; Crossref gives 42:65-68.

#### `thilakarathna2016-n-transfer`

Thilakarathna, Malinda S.; McElroy, Michelle S.; Chapagain, Tejendra; Papadopoulos, Yousef A.; Raizada, Manish N.. (2016). *Belowground nitrogen transfer from legumes to non-legumes under managed herbaceous cropping systems. A review*. Agronomy for Sustainable Development 36: 58

- DOI: [10.1007/s13593-016-0396-4](https://doi.org/10.1007/s13593-016-0396-4)
- Verification: Crossref-verified | Access: paywalled, evidence tier **B**
- Backs:
  - same-season legume-to-cereal N transfer is typically below 15% of the legume's N, Grade B
  - corrects the folklore that interplanted legumes materially fertilise their neighbours
- **Caveat:** An erratum exists at 10.1007/s13593-016-0403-9 and should be consulted before quoting specific percentages.

#### `tirmenstein1991-lingonberry-feis`

Tirmenstein, D. A.. (1991). *Vaccinium vitis-idaea, lingonberry*. Fire Effects Information System

- DOI: [10.2737/feis-species-review-vacvit](https://doi.org/10.2737/feis-species-review-vacvit)
- Verification: Crossref-verified | Access: public-domain, evidence tier **C**
- Backs:
  - lingonberry soil pH ranges from 2.7 to 8.2, with best growth reported at 4.0 to 4.9
  - lingonberry grows on acidic sandy loams or loamy clays high in decaying organics
- **Caveat:** Secondary synthesis of field observations, not a controlled pH trial. The 2.7-8.2 range is the observed field range and the 4.0-4.9 optimum is quoted from the primary studies FEIS cites; both are transcribed verbatim into the catalogue trapezoid. Verified against the FEIS full text 2026-07-31.

#### `tirmenstein1991-lowbush-blueberry-feis`

Tirmenstein, D. A.. (1991). *Vaccinium angustifolium, lowbush blueberry*. Fire Effects Information System

- DOI: [10.2737/feis-species-review-vacang](https://doi.org/10.2737/feis-species-review-vacang)
- Verification: Crossref-verified | Access: public-domain, evidence tier **C**
- Backs:
  - lowbush blueberry grows on acidic soils with pH ranging from 2.8 to 6.6 but thrives at pH 4.2 to 5.2
- **Caveat:** Secondary synthesis of field observations, not a controlled pH trial. Verified against the FEIS full text 2026-07-31.

#### `uga-b577-planting-chart`

Westerfield, Robert. (2022). *Home Garden Planting Chart*. University of Georgia Cooperative Extension Bulletin 577

- URL: <https://secure.caes.uga.edu/extension/publications/files/html/B577/B577PlantingChart.pdf>
- Verification: URL-verified | Access: public-domain, evidence tier **C**
- Backs:
  - days to maturity per crop, e.g. 'Tomato 70-85', 'Radish 25-30', 'Onion (mature) 100-120'
  - explicit spring and fall calendar-date planting windows per crop, including 'Not recommended' for fall where no fall window exists
  - in-row and between-row spacing and sowing depth per crop
- **Caveat:** Extension publication, not peer reviewed. Calendar dates are ABSOLUTE, not frost-relative, and are stated for Middle Georgia only; the chart itself says north Georgia should shift about two weeks later in spring and earlier in fall, and south Georgia the reverse. Use it for days-to-maturity and for the existence and shape of spring/fall windows, NOT for dates outside the Southeast. UGA asserts university copyright. Version mismatch between the served chart (March 2022) and its parent bulletin (February 2026) is unresolved.

#### `usda-nrcs-pigeonpea-plant-guide`

USDA NRCS Cape May Plant Materials Center. (n.d.). *Plant Guide: Pigeonpea, Cajanus cajan (L.) Millsp.*. United States Department of Agriculture, Natural Resources Conservation Service

- URL: <https://plants.sc.egov.usda.gov/DocumentLibrary/plantguide/pdf/pg_caca27.pdf>
- Verification: URL-verified | Access: public-domain
- Backs:
  - verbatim: 'It is a shrub that can grow to 12 ft tall, but usually only reaches 3 to 6 ft'
  - verbatim: 'Sow seeds 1.5 inches deep on 1 to 3 foot rows at 8 to 10 lb per acre'
  - verbatim: 'C. cajan requires 65-80 days to flower and 50-75 additional days to create mature seeds (Mullen et al., 2003), however many varieties have been developed to flower earlier'
  - verbatim: 'C. cajan grows best under hot conditions (65-86F)'; 'Frost will defoliate the plant'; 'Under good management, the plant can live up to five years'
- **Caveat:** A conservation-planting guide compiled from secondary sources (Cook et al. 2005, Mullen et al. 2003, Phatak et al. 1993, Duke 1983); it reports no trial of its own.

#### `uvah-coaker1984-mixed-cropping`

Uvah, I. I. I.; Coaker, T. H.. (1984). *Effect of mixed cropping on some insect pests of carrots and onions*. Entomologia Experimentalis et Applicata 36: 159-167

- DOI: [10.1111/j.1570-7458.1984.tb03422.x](https://doi.org/10.1111/j.1570-7458.1984.tb03422.x)
- Verification: Crossref-verified | Access: paywalled, evidence tier **A**
- Backs:
  - onions selected specifically for pungency failed to deter insects from landing on host plants
  - second independent contradiction of the 'aromatic herbs repel pests' folklore

#### `walters2018-basil-species-dli`

Walters, Kellie J.; Currey, Christopher J.. (2018). *Effects of Nutrient Solution Concentration and Daily Light Integral on Growth and Nutrient Concentration of Several Basil Species in Hydroponic Production*. HortScience 53: 1319-1325

- DOI: [10.21273/HORTSCI13126-18](https://doi.org/10.21273/HORTSCI13126-18)
- Verification: Crossref-verified | Access: open-access, evidence tier **A**
- Backs:
  - sweet basil under a high DLI of about 15 mol/m2/d against a low DLI of 7 or less, verbatim: 'Fresh and dry weight, height, and node number increased by 144%, 178%, 20%, and 18%, respectively, compared with plants grown under the low DLI, and branching was also stimulated'
  - DLI had little effect on tissue nutrient concentration; nutrient solution concentration did
- **Caveat:** Bibliographic record verified against Crossref on 2026-09-11; abstract read through the Semantic Scholar record. Greenhouse hydroponic trial of several basil species; the two DLI levels bracket the response and fix no threshold.

#### `weston2013-sorghum-allelopathy`

Weston, Leslie A.; Alsaadawi, Ibrahim S.; Baerson, Scott R.. (2013). *Sorghum Allelopathy-From Ecosystem to Molecule*. Journal of Chemical Ecology 39: 142-153

- DOI: [10.1007/s10886-013-0245-8](https://doi.org/10.1007/s10886-013-0245-8)
- Verification: Crossref-verified | Access: paywalled, evidence tier **B**
- Backs:
  - RESIDUE WEED SUPPRESSION: phytotoxicity has been reported when sorghum was incorporated into the soil as a green manure, when residues remained on the soil surface in reduced tillage settings, and when sorghum was cultivated as a crop
  - sorghum allelopathy has been reported in a series of field experiments in diverse locations and with various sorghum plant parts
  - the allelochemical suite: numerous phenolics, the cyanogenic glycoside dhurrin, and the hydrophobic p-benzoquinone sorgoleone, isolated from shoots, roots and root exudates
  - sorgoleone is released continuously by living root hairs and accumulates in significant concentrations around the roots
  - allelochemical content varies with plant part, plant age and cultivar, and sorgoleone production is influenced by both genetics and environment
  - the authors' framing of sorghum cover crops as suppressing germinating weed seedlings in a manner similar to a soil-applied preemergent herbicide such as trifluralin
- **Caveat:** Review, not a trial. Springer paywalls the full text (Crossref record and abstract read via Europe PMC 2026-07-30; body never read). The mechanism is well characterised, but the field OUTCOME is variable by cultivar, plant part and age, which the review states directly. No effect size, no percentage weed reduction and no garden-scale trial is quoted in the abstract, so this entry supports the EXISTENCE and MECHANISM of sorghum residue weed suppression, not any magnitude. Note also the herbicide analogy cuts both ways: allelopathy that suppresses germinating weeds also suppresses germinating vegetable seed, so any rule using this must carry a planting-interval precondition.

#### `wilson1988-ireta-yams`

Wilson, Jill E.. (1988). *Rapid Multiplication of Yams (Dioscorea spp.)*. University of the South Pacific Institute for Research, Extension and Training in Agriculture; hosted by the University of Hawaii CTAHR ADAP archive IRETA Publication No. 3/88, Agdex 175-40

- URL: <https://www3.ctahr.hawaii.edu/adap/Publications/Ireta_pubs/rapidyams.pdf>
- Verification: URL-verified | Access: open-access
- Backs:
  - staking, verbatim: 'Stakes 1 to 2 m high are adequate'
  - spacing of minisetts, verbatim: 'Plant the mini-setts at a spacing of 1 x 0.25 m or 1 x 0.5 m'; and ware yams grown from 500 g setts 'at a spacing of 100 x 25 cm' in the worked example
- **Caveat:** A seed-yam multiplication guide, so its spacings are for producing planting setts; it gives no months-to-harvest or temperature figures, which the catalogue takes from ECOCROP.

#### `yousefi2024-biocontrol`

Yousefi, Mahsa; Marja, Roland; Barmettler, Erika; Six, Johan. (2024). *The effectiveness of intercropping and agri-environmental schemes on ecosystem service of biological pest control: a meta-analysis*. Agronomy for Sustainable Development 44

- DOI: [10.1007/s13593-024-00947-7](https://doi.org/10.1007/s13593-024-00947-7)
- Verification: Crossref-verified | Access: open-access, evidence tier **A**
- Backs:
  - effect sizes for insectary strips and intercropping on biological pest control
  - Grade A for natural-enemy abundance, Grade B for realised pest suppression

#### `yu2015-temporal-niche-ler`

Yu, Yang; Stomph, Tjeerd-Jan; Makowski, David; van der Werf, Wopke. (2015). *Temporal niche differentiation increases the land equivalent ratio of annual intercrops: A meta-analysis*. Field Crops Research 184: 133-144

- DOI: [10.1016/j.fcr.2015.09.010](https://doi.org/10.1016/j.fcr.2015.09.010)
- Verification: Crossref-verified | Access: paywalled, evidence tier **A**
- Backs:
  - average intercrop land equivalent ratio 1.22 +/- 0.02, and no difference between the 50 most-cited studies and a random literature sample
  - LER rises with temporal niche differentiation, the mechanistic basis for relay and succession scoring
  - temporal niche differentiation contributes substantially to high LER in C3/C4 mixtures but not in C3-only mixtures
  - second independent LER meta-analysis supporting Grade A for intercropping

#### `zhang2014-three-sisters-roots`

Zhang, Chaochun; Postma, Johannes A.; York, Larry M.; Lynch, Jonathan P.. (2014). *Root foraging elicits niche complementarity-dependent yield advantage in the ancient 'three sisters' polyculture*. Annals of Botany 114: 1719-1733

- DOI: [10.1093/aob/mcu191](https://doi.org/10.1093/aob/mcu191)
- Verification: Crossref-verified | Access: paywalled, evidence tier **B**
- Backs:
  - root-architecture niche complementarity as the mechanism behind the Three Sisters yield advantage
  - root-depth stratification as a layout design rule

#### `ziegler1963-comptonia-nitrogen`

Ziegler, H.; Hüser, R.. (1963). *Fixation of Atmospheric Nitrogen by Root Nodules of Comptonia peregrina*. Nature 199: 508

- DOI: [10.1038/199508a0](https://doi.org/10.1038/199508a0)
- Verification: Crossref-verified | Access: paywalled, evidence tier **B**
- Backs:
  - Comptonia peregrina root nodules fix atmospheric nitrogen
- **Caveat:** Establishes the trait only. It measures fixation in the nodule and says nothing about transfer of that nitrogen to a neighbouring plant, so it must never be cited for a companion-planting benefit.

#### `zimmerman2020-ucanr-moringa`

Zimmerman, Cynthia. (2020). *Helpline Hot Topic for June 2020: Moringa Oleifera*. University of California Agriculture and Natural Resources, Master Gardener Program of Fresno County

- URL: <https://ucanr.edu/sites/default/files/2020-07/329403.pdf>
- Verification: URL-verified | Access: public-domain
- Backs:
  - verbatim: 'it grows from 9 to 16 feet per year if left uncropped. A fully mature tree can reach a height of 35 feet but can be cut back to 3-4 feet high'
  - verbatim: it 'will die if it freezes completely, but can handle mild frost'
  - verbatim: 'rainfall is limited to between 9 to 60 inches'
- **Caveat:** A Master Gardener helpline note, compiled from secondary sources for the Fresno area.

## Climate & geodata

18 sources.

#### `beck2018-koppen`

Beck, Hylke E.; Zimmermann, Niklaus E.; McVicar, Tim R.; Vergopolan, Noemi; Berg, Alexis; Wood, Eric F.. (2018). *Present and future Köppen-Geiger climate classification maps at 1-km resolution*. Scientific Data 5: 180214

- DOI: [10.1038/sdata.2018.214](https://doi.org/10.1038/sdata.2018.214)
- Verification: Crossref-verified | Access: open-access
- Backs:
  - decision 9: the bundled 1 km Köppen-Geiger raster used for climate context

#### `canham1994-canopy-light-transmission`

Canham, Charles D.; Finzi, Adrien C.; Pacala, Stephen W.; Burbank, Diane H.. (1994). *Causes and consequences of resource heterogeneity in forests: interspecific variation in light transmission by canopy trees*. Canadian Journal of Forest Research 24: 337-349

- DOI: [10.1139/x94-046](https://doi.org/10.1139/x94-046)
- Verification: Crossref-verified | Access: paywalled, evidence tier **B**
- Backs:
  - the forest-canopy comparison named in Decision Record 26, verbatim: 'The most shade-tolerant species (Fagus grandifolia Ehrh. and Tsuga canadensis (L.) Carr.) cast the deepest shade (<2% of full sun), while earlier successional species such as Quercus rubra L. and Fraxinus americana L. allowed greater light penetration (>5% full sun)'
- **Caveat:** Closed-canopy interior light measured by fisheye photography and quantum sensors under overlapping crowns in a southern New England oak-northern hardwood forest, not a single isolated urban tree's crown transmittance. Kept only as the closed-canopy comparison Decision Record 26 names, lower than a lone tree's transmittance as expected; not a source for the app's shipped default. Read via OCR of the scanned PDF the Canham lab self-archives at sortie-nd.org, since the journal version of record is paywalled and the copy carries no text layer.

#### `erez1990-dynamic-model`

Erez, A.; Fishman, S.; Linsley-Noakes, G. C.; Allan, P.. (1990). *The dynamic model for rest completion in peach buds*. Acta Horticulturae 165-174

- DOI: [10.17660/ActaHortic.1990.276.18](https://doi.org/10.17660/ActaHortic.1990.276.18)
- Verification: Crossref-verified | Access: paywalled, evidence tier **A**
- Backs:
  - the constants of the Dynamic chill model: A0, A1, E0, E1, the transition slope and its midpoint temperature
- **Caveat:** Crossref records the title in capitals and Acta Horticulturae 276 as an issue with no volume.

#### `fishman1987-dormancy-math`

Fishman, Svetlana; Erez, Amos; Couvillon, G. A.. (1987). *The temperature dependence of dormancy breaking in plants: Mathematical analysis of a two-step model involving a cooperative transition*. Journal of Theoretical Biology 124: 473-483

- DOI: [10.1016/S0022-5193(87)80221-7](https://doi.org/10.1016/S0022-5193(87)80221-7)
- Verification: Crossref-verified | Access: paywalled, evidence tier **A**
- Backs:
  - the Dynamic chill model (chill portions) formulation

#### `fishman1987-dormancy-sim`

Fishman, Svetlana; Erez, Amos; Couvillon, G. A.. (1987). *The temperature dependence of dormancy breaking in plants: Computer simulation of processes studied under controlled temperatures*. Journal of Theoretical Biology 126: 309-321

- DOI: [10.1016/S0022-5193(87)80237-0](https://doi.org/10.1016/S0022-5193(87)80237-0)
- Verification: Crossref-verified | Access: paywalled, evidence tier **A**
- Backs:
  - the simulation companion to the Dynamic chill model

#### `heisler1986-single-tree-irradiance`

Heisler, Gordon M.. (1986). *Effects of individual trees on the solar radiation climate of small buildings*. Urban Ecology 9: 337-359

- DOI: [10.1016/0304-4009(86)90008-2](https://doi.org/10.1016/0304-4009(86)90008-2)
- Verification: Crossref-verified | Access: public-domain, evidence tier **B**
- Backs:
  - a corroborating figure for the tree-crown transmittance default, verbatim: 'a mid-sized sugar maple tree (Acer saccharum Marsh.) reduced irradiance in its shade on a south-facing wall by about 80% when in leaf, and by nearly 40% when leafless', implying roughly 0.20 in-leaf and 0.60 leafless transmittance, read here as a cross-check on the Konarska et al. 2014 crown-transmittance range rather than as the shipped default
- **Caveat:** A USDA Forest Service work, public domain by 17 U.S.C. 105; read from the agency's own reprint rather than the Elsevier version of record. It measures irradiance reduction on a vertical wall inside a tree's shadow, beam plus diffuse sky and crown-reflected radiation reaching a receiver, not transmittance straight through the crown, so its reductions read smaller than Konarska's direct-under-crown method: the paper's own Table II clear-day wall average across four sample trees is a 30-34% reduction leafless and 65-85% in-leaf. Backs a cross-check figure only, not the shipped default.

#### `konarska2014-urban-tree-transmissivity`

Konarska, Janina; Lindberg, Fredrik; Larsson, Annika; Thorsson, Sofia; Holmer, Björn. (2014). *Transmissivity of solar radiation through crowns of single urban trees - application for outdoor thermal comfort modelling*. Theoretical and Applied Climatology 117: 363-376

- DOI: [10.1007/s00704-013-1000-3](https://doi.org/10.1007/s00704-013-1000-3)
- Verification: Crossref-verified | Access: paywalled, evidence tier **B**
- Backs:
  - the in-leaf crown transmittance of 0.033 used as the default for a drawn tree's crown, the midpoint of the paper's own range, verbatim: 'Average transmissivity of direct solar radiation through the foliated and defoliated tree crowns ranged from 1.3 to 5.3 % and from 40.2 to 51.9 %, respectively'
  - the leafless crown transmittance of 0.46 used as the default for a drawn tree's crown, the midpoint of the defoliated range in the same sentence
- **Caveat:** Measured with a pyranometer beneath the live crown against a rooftop reference, on five street trees (one conifer, four deciduous) in Göteborg, Sweden, over nine clear days. The figure is direct-beam transmissivity only; the app applies one transmittance to beam, diffuse and sky-view alike through a solid box crown rather than a real crown's gaps. The shipped default is the midpoint of the paper's own range, not a single measured mean; the underlying species are far north of most of this app's users.

#### `luedeling2010-chill-comparability`

Luedeling, Eike; Brown, Patrick H.. (2010). *A global analysis of the comparability of winter chill models for fruit and nut trees*. International Journal of Biometeorology 55: 411-421

- DOI: [10.1007/s00484-010-0352-y](https://doi.org/10.1007/s00484-010-0352-y)
- Verification: Crossref-verified | Access: paywalled, evidence tier **A**
- Backs:
  - Chilling Hours, Utah Chill Units and Dynamic Chill Portions are NOT interconvertible
  - the CH/CP ratio spans roughly 0-34 across global climates
  - decision 10: compute all three chill metrics separately
- **Caveat:** The horticulture document dates this 2011, matching the volume 55 issue year; Crossref records 2010.

#### `mckenney2001-canada-zones`

McKenney, Daniel W.; Hutchinson, Michael F.; Kesteven, Jennifer L.; Venier, Lisa A.. (2001). *Canada's plant hardiness zones revisited using modern climate interpolation techniques*. Canadian Journal of Plant Science 81: 129-143

- DOI: [10.4141/P00-030](https://doi.org/10.4141/P00-030)
- Verification: Crossref-verified | Access: paywalled
- Backs:
  - the Canadian multivariate hardiness model, distinct from the USDA winter-minimum system

#### `mckenney2025-canada-zones`

McKenney, Daniel W.; Pedlar, John H.; Lawrence, Kevin; DeBoer, Kaitlin. (2025). *Updated plant hardiness zones for Canada and assessment of change over time*. Scientific Reports 15

- DOI: [10.1038/s41598-025-00931-5](https://doi.org/10.1038/s41598-025-00931-5)
- Verification: Crossref-verified | Access: open-access
- Backs:
  - the current Canadian hardiness zone surface

#### `ncei-normals-1991-2020-freeze`

Palecki, Michael; Durre, Imke; Applequist, Scott; Arguez, Anthony; Lawrimore, Jay. (2021). *U.S. Climate Normals 2020: U.S. Annual/Seasonal Climate Normals (1991-2020), freeze/frost date probability normals*. NOAA National Centers for Environmental Information

- URL: <https://www.ncei.noaa.gov/products/land-based-station/us-climate-normals>
- Verification: URL-verified | Access: public-domain
- Backs:
  - the exceedance-percentile freeze/frost date product behind the lastSpringFreeze and firstFallFreeze percentile curves
  - element families ann-tmin-prblst-tXXfpNN (date of last spring occurrence), ann-tmin-prbfst-tXXfpNN (date of first fall occurrence) and ann-tmin-prbgsl-tXXfpNN (growing season length)
  - nine percentiles per threshold, 10% through 90% in 10-point steps, read as 'N% probability date of last XXF occurrence or earlier'
  - six temperature thresholds: 16, 20, 24, 28, 32 and 36 degrees F (32 F = 0 C and 28 F = -2.2 C are the two our schema uses)
  - station coverage: more than 15,000 US stations with at least precipitation normals, more than 7,300 with temperature normals
  - frost-freeze date probabilities are computed from the first and last 'killing freeze' of the growing season using serially-complete daily minimum temperatures derived from GHCN-Daily
- **Caveat:** NO DOI. Government dataset; the DOI field on NCEI's own landing page is an unfilled template placeholder. OUR DOCS UNDERSTATE THE PRODUCT: the horticulture document section 1.10 says the Normals give dates at the 50, 40, 30, 20 and 10 percent levels. The published product is 10-90% in 10-point steps at six thresholds, not five percentiles at one. US and US-territory stations only: there is no equivalent product for the rest of the world, so any non-US frost percentile the product renders is an Open-Meteo-derived estimate and must be labelled as such. Completeness flags matter: normals are 'standard' above 80% data availability, 'representative' at 10+ years, and 'provisional' where neighbours cannot fill the record. A station-level frost date is not uniformly reliable.

#### `oke1981-canyon-svf`

Oke, T. R.. (1981). *Canyon geometry and the nocturnal urban heat island: Comparison of scale model and field observations*. Journal of Climatology 1: 237-254

- DOI: [10.1002/joc.3370010304](https://doi.org/10.1002/joc.3370010304)
- Verification: Crossref-verified | Access: paywalled
- Backs:
  - the sky view factor of a surface is the geometric control on how much it cools by longwave radiation on a calm clear night
- **Caveat:** About street canyons, not panel rows, and not read in full. Cited for the mechanism and for the direction of the relationship only. It supports NO number for an agrivoltaic array: this app states a sky view factor and names the consequence in words, and never converts one into degrees of frost margin.

#### `oke1987-boundary-layer-climates`

Oke, T. R.. (2002). *Boundary Layer Climates*. Routledge

- DOI: [10.4324/9780203407219](https://doi.org/10.4324/9780203407219)
- Verification: Crossref-verified | Access: paywalled
- Backs:
  - shortwave albedo ranges for bare soil, grass, crop canopies, dry plant litter and snow
  - sky view factor as the geometric control on how much longwave a surface loses to the sky at night
- **Caveat:** Crossref returns the 2002 Routledge reissue against this DOI; the text is Oke's second edition of 1987. Verified as a bibliographic record only. The albedo table was not re-read, and every point value this app takes from it is a choice made inside a published range rather than a figure Oke states for that surface.

#### `ophz-hardiness-geojson`

Jenkins, Keith. (n.d.). *OPHZ: Oregon PRISM Hardiness Zones*. GitHub

- URL: <https://github.com/kgjenkins/ophz>
- Verification: URL-verified | Access: public-domain
- Backs:
  - decision 9: the bundled ~450 m PRISM-derived hardiness GeoJSON, credited to USDA-ARS and Oregon State
- **Caveat:** Lower 48 only. Provides no coverage for the product's stated global scope. VINTAGE: OPHZ is traced from the 2012 USDA map image, not 2023, per its own README. Not shipped for that reason: it would have labelled 2012 zones as usda-2023. Measured divergence from the official 2023 PRISM grid: Amherst MA 5b vs 6a, Denver 5b vs 6a, Tucson 9a vs 9b, International Falls 3a vs 3b.

#### `ouellet1967-woody-zonation`

Ouellet, C. E.; Sherk, L. C.. (1967). *Woody ornamental plant zonation: I. Indices of winterhardiness*. Canadian Journal of Plant Science 47: 231-238

- DOI: [10.4141/cjps67-044](https://doi.org/10.4141/cjps67-044)
- Verification: Crossref-verified | Access: paywalled
- Backs:
  - the six-variable regression underlying Canada's plant hardiness index
- **Caveat:** TITLE MISMATCH: the horticulture document gives 'Woody ornamental plant zonation indices of winter hardiness'. The actual part I title is recorded here. Parts II (10.4141/cjps67-064) and III (10.4141/cjps67-065) also exist and part III carries the map.

#### `richardson1974-utah-chill`

Richardson, E. Arlo; Seeley, Schuyler D.; Walker, David R.. (1974). *A model for estimating the completion of rest for 'Redhaven' and 'Elberta' peach trees*. HortScience 9: 331-332

- DOI: [10.21273/HORTSCI.9.4.331](https://doi.org/10.21273/HORTSCI.9.4.331)
- Verification: Crossref-verified | Access: paywalled, evidence tier **A**
- Backs:
  - the Utah chill unit temperature bands and their weights, including the negative weight of warm hours
- **Caveat:** Crossref splits the first author as family 'Arlo Richardson', given 'E.'; the paper is cited everywhere as Richardson, Seeley and Walker.

#### `usda-phzm-2023`

(2023). *2023 USDA Plant Hardiness Zone Map*. USDA Agricultural Research Service and PRISM Climate Group, Oregon State University

- URL: <https://planthardiness.ars.usda.gov/>
- Verification: URL-verified | Access: public-domain-with-conditions
- Backs:
  - hardiness zone gating for perennials
  - decision 9: no official USDA hardiness API exists, only an interactive map, ZIP lookup and static downloads
- **Caveat:** NOT unconditionally public domain: the 2023 PRISM terms permit redistributing ALTERED data only with a prominently displayed disclaimer that it is not the official USDA Plant Hardiness Zone Map. We resample to 0.02 deg, which is an alteration, so the disclaimer is a licence obligation and is rendered by staticLayerLicences() in the attribution panel.

#### `zhang-taylor2011-dynamic-chill`

Zhang, Jianhua; Taylor, Chris. (2011). *The Dynamic Model Provides the Best Description of the Chill Process on 'Sirora' Pistachio Trees in Australia*. HortScience 46: 420-425

- DOI: [10.21273/HORTSCI.46.3.420](https://doi.org/10.21273/HORTSCI.46.3.420)
- Verification: Crossref-verified | Access: paywalled, evidence tier **C**
- Backs:
  - evidence that the Dynamic model best describes the chill process
- **Caveat:** BAD ATTRIBUTION IN OUR DOCS. The horticulture document lists this as 'Luedeling, E. et al. (2011). The Dynamic Model provides the best description of the chill process. HortScience 46(3):420-425'. HortScience 46(3):420-425 is by ZHANG & TAYLOR, and it is a SINGLE-SITE pistachio study in Australia, not a global comparison. Downgraded to Tier C accordingly. The global-comparison claim belongs to Luedeling & Brown 2010 instead.

## Traditional ecological knowledge

24 sources.

#### `armstrong2021-forest-garden-traits`

Armstrong, Chelsey Geralda; Miller, Jesse E. D.; McAlvay, Alex C.; Ritchie, Patrick Morgan; Lepofsky, Dana. (2021). *Historical Indigenous Land-Use Explains Plant Functional Trait Diversity*. Ecology and Society 26: 6

- DOI: [10.5751/ES-12322-260206](https://doi.org/10.5751/ES-12322-260206)
- Verification: Crossref-verified | Access: open-access, evidence tier **B**
- Backs:
  - Pacific Northwest Coast forest gardens retain elevated functional trait diversity long after management ceased
  - TEK design rule 1: vertical stratification into 2-4 explicit canopy tiers
- **Caveat:** DOI SUPPLIED AND CORRECTED. The agroecology document cites 'Armstrong et al. 2021 (Ecology and Society 26(2):6)' with no DOI. The correct DOI is 10.5751/ES-12322-260206. The plausible-looking 10.5751/ES-12160-260206 returns 404 and must not be used.

#### `armstrong2023-tsmsyen-forest-gardens`

Armstrong, Chelsey Geralda; Lyons, Natasha; McAlvay, Alex C.; Ritchie, Patrick Morgan. (2023). *Historical ecology of forest garden management in Laxyuubm Ts'msyen and beyond*. Ecosystems and People 19

- DOI: [10.1080/26395916.2022.2160823](https://doi.org/10.1080/26395916.2022.2160823)
- Verification: Crossref-verified | Access: open-access, evidence tier **B**
- Backs:
  - Ts'msyen and Coast Salish forest garden management as living, specifically attributed practice
- **Caveat:** YEAR AND VOLUME MISMATCH: the agroecology document cites 'Armstrong et al. 2022 (Ecosystems and People 18(1))'. Crossref gives 2023, volume 19. The 2022 inside the DOI string is the acceptance year, not the issue year.

#### `carroll2020-care`

Carroll, Stephanie Russo; Garba, Ibrahim; Figueroa-Rodríguez, Oscar L.. (2020). *The CARE Principles for Indigenous Data Governance*. Data Science Journal 19: 43

- DOI: [10.5334/dsj-2020-043](https://doi.org/10.5334/dsj-2020-043)
- Verification: Crossref-verified | Access: open-access
- Backs:
  - the governing framework behind the product's TEK attribution rules
  - decision 12: CARE binds only if we encode community-held seed genetics or ceremonial calendars, which we will not

#### `carroll2021-care-fair`

Carroll, Stephanie Russo; Herczog, Edit; Hudson, Maui; Russell, Keith; Stall, Shelley. (2021). *Operationalizing the CARE and FAIR Principles for Indigenous data futures*. Scientific Data 8: 108

- DOI: [10.1038/s41597-021-00892-0](https://doi.org/10.1038/s41597-021-00892-0)
- Verification: Crossref-verified | Access: open-access
- Backs:
  - practical operationalisation of CARE alongside FAIR for our data model

#### `chiorese2026-milpa`

Chiorese, Gabriele; Manalil, Sudheesh; Muniraj, Iniya. (2026). *The milpa system as a model of agroecological intensification: integrating productivity, ecological function and cultural heritage*. Frontiers in Sustainable Food Systems 10: 1843955

- DOI: [10.3389/fsufs.2026.1843955](https://doi.org/10.3389/fsufs.2026.1843955)
- Verification: Crossref-verified | Access: open-access, evidence tier **C**
- Backs:
  - milpa as a Mesoamerican agroecological system, attributed to Maya, Nahua and other Mesoamerican peoples

#### `denham2023-dark-emu-context`

Denham, Tim; Donohue, Mark. (2023). *Putting the Dark Emu debate into context*. Archaeology in Oceania 58: 275-295

- DOI: [10.1002/arco.5302](https://doi.org/10.1002/arco.5302)
- Verification: Crossref-verified | Access: open-access, evidence tier **B**
- Backs:
  - the scholarly context that keeps Aboriginal Australian land management from being over- or under-claimed
  - attribution rule: distinguish historical/archaeological systems from living practice
- **Caveat:** Licence is CC BY-NC-ND 4.0.

#### `fernandes1984-chagga`

Fernandes, E. C. M.; Oktingati, A.; Maghembe, J.. (1984). *The Chagga homegardens: a multistoried agroforestry cropping system on Mt. Kilimanjaro (Northern Tanzania)*. Agroforestry Systems 2: 73-86

- DOI: [10.1007/BF00131267](https://doi.org/10.1007/BF00131267)
- Verification: Crossref-verified | Access: paywalled, evidence tier **B**
- Backs:
  - Chagga home gardens as a documented multi-tier canopy system
  - TEK design rule 1: 2-4 explicit canopy tiers keyed to light level
- **Caveat:** YEAR MISMATCH: the agroecology document dates this 1985. Crossref gives 1984 (Agroforestry Systems 2:73-86). A separate 1985 Food and Nutrition Bulletin version and a 1989 book chapter also exist, which is probably the source of the confusion.

#### `glaser2002-terra-preta`

Glaser, Bruno; Lehmann, Johannes; Zech, Wolfgang. (2002). *Ameliorating physical and chemical properties of highly weathered soils in the tropics with charcoal - a review*. Biology and Fertility of Soils 35: 219-230

- DOI: [10.1007/s00374-002-0466-4](https://doi.org/10.1007/s00374-002-0466-4)
- Verification: Crossref-verified | Access: paywalled, evidence tier **B**
- Backs:
  - Amazonian terra preta soil amendment as a documented traditional system
  - attribution to pre-Columbian Amazonian peoples across the Basin, unnamed cultures

#### `gott1982-root-use`

Gott, Beth. (1982). *Ecology of Root Use by the Aborigines of Southern Australia*. Archaeology in Oceania 17: 59-67

- DOI: [10.1002/j.1834-4453.1982.tb00039.x](https://doi.org/10.1002/j.1834-4453.1982.tb00039.x)
- Verification: Crossref-verified | Access: paywalled, evidence tier **B**
- Backs:
  - murnong (yam daisy) and root-crop management by Aboriginal peoples of temperate southeastern Australia
- **Caveat:** CITATION MISMATCH. The agroecology document cites 'Gott 1983 (Archaeology in Oceania 18(1))'. No Gott article was found at Archaeology in Oceania 18(1). Gott's murnong paper is normally cited as Australian Aboriginal Studies 1983(2):2-18, which has no DOI. The Crossref-verified Gott record in Archaeology in Oceania is the 1982 root-use paper here. The agroecology document's citation is wrong in at least the volume.

#### `hemp2006-chagga-banana-forests`

Hemp, Andreas. (2006). *The Banana Forests of Kilimanjaro: Biodiversity and Conservation of the Chagga Homegardens*. Biodiversity and Conservation 15: 1193-1217

- DOI: [10.1007/s10531-004-8230-8](https://doi.org/10.1007/s10531-004-8230-8)
- Verification: Crossref-verified | Access: paywalled, evidence tier **B**
- Backs:
  - species composition and vertical structure of Chagga home gardens

#### `kolata1989-waru-waru`

Kolata, Alan L.; Ortloff, Charles. (1989). *Thermal analysis of Tiwanaku raised field systems in the Lake Titicaca Basin of Bolivia*. Journal of Archaeological Science 16: 233-263

- DOI: [10.1016/0305-4403(89)90004-6](https://doi.org/10.1016/0305-4403(89)90004-6)
- Verification: Crossref-verified | Access: paywalled, evidence tier **B**
- Backs:
  - waru waru / camellones raised-field thermal buffering
  - TEK design rule 3: wind and thermal buffering as a first-class microclimate modifier
  - attribution to Tiwanaku-era and pre-Inca Andean farmers, still used by Aymara and Quechua communities

#### `kumar2004-tropical-homegardens`

Kumar, B. M.; Nair, P. K. R.. (2004). *The enigma of tropical homegardens*. Agroforestry Systems 61: 135-152

- DOI: [10.1023/B:AGFO.0000028995.13227.ca](https://doi.org/10.1023/B:AGFO.0000028995.13227.ca)
- Verification: Crossref-verified | Access: paywalled, evidence tier **B**
- Backs:
  - cross-cultural synthesis of tropical home-garden structure supporting the vertical stratification rule

#### `lansing2007-priests-programmers`

Lansing, J. Stephen. (2007). *Priests and Programmers: Technologies of Power in the Engineered Landscape of Bali*. Princeton University Press

- DOI: [10.1515/9781400827633](https://doi.org/10.1515/9781400827633)
- Verification: Crossref-verified | Access: paywalled, evidence tier **B**
- Backs:
  - Balinese subak as a self-organising water and cropping-calendar institution
  - attribution to Balinese farming communities, developed by the 9th century CE
- **Caveat:** The agroecology document cites the 1991 first edition. The Crossref-registered record is the 2007 reissue.

#### `mirez2025-waru-waru-model`

Mírez Tarrillo, Jorge. (2025). *Sustainable Thermal Energy Storage Systems: A Mathematical Model of the "Waru-Waru" Agricultural Technique*. Energies 18: 3116

- DOI: [10.3390/en18123116](https://doi.org/10.3390/en18123116)
- Verification: Crossref-verified | Access: open-access, evidence tier **C**
- Backs:
  - quantified thermal model of waru waru raised fields

#### `montero2008-dehesa-light`

Montero, Maria Jesus; Moreno, Gerardo; Bertomeu, Manuel. (2008). *Light distribution in scattered-trees open woodlands in Western Spain*. Agroforestry Systems 73: 233-244

- DOI: [10.1007/s10457-008-9143-4](https://doi.org/10.1007/s10457-008-9143-4)
- Verification: Crossref-verified | Access: paywalled, evidence tier **B**
- Backs:
  - intercepted light decreases with distance from the trunk following a LOGISTIC curve, indicating a rapid increase in light availability with distance
  - for mature trees, radiation was constant beyond 20 m from the trunk
  - a multivariable regression in distance, stem diameter and canopy width explained more than 88% of the light variability for each orientation studied
  - design: 36 trees, canopy widths 0.1-14 m, two dehesa stands at 19 mature trees/ha, hemispherical photographs at multiple distances per tree
  - modelled net effect: radiation to crops and pasture reduced by up to 21% in a standard dehesa at 24 mature trees/ha
  - qualitative corroboration that a logistic distance decay is the right SHAPE for a distance-from-panel-edge model
- **Caveat:** REPLACES A CONFABULATED CITATION. Doc 00 section 12 and the agroecology document section 4.1 attribute the dehesa distance template to 'Marcos et al., dehesa radiation transmission'. No such paper exists: author-name, topic and combined searches returned nothing, and 'Marcos et al.' must not appear in any shipped artefact. TEMPLATE NOT INSTANTIABLE. The regression COEFFICIENTS are behind the Springer paywall and were never obtained; everything above is from the publisher abstract. Until someone reads the full text, the distance-from-edge model must be geometry-derived with this paper cited only as qualitative corroboration of the curve shape. THE SOIL-MOISTURE HALF OF THE OLD CLAIM IS NOT SUPPORTED. This paper is light only. The dehesa soil-moisture literature (Cubera & Moreno 2007, Ann. For. Sci. 64:355-364, 10.1051/forest:2007012, and Catena 71:298-308) samples 2-30 m from the trunk but reports categorical beneath-canopy vs beyond-canopy contrasts by depth and season, not a fitted distance function. Delete 'and soil moisture' from the highest-value-analog sentence. Oak dehesa, not a PV array: a tree canopy and a panel row have different geometry and different spectral transmission.

#### `moreno2009-dehesa`

Moreno, Gerardo; Pulido, Fernando J.. (2009). *The Functioning, Management and Persistence of Dehesas*. Agroforestry in Europe 127-160

- DOI: [10.1007/978-1-4020-8272-6_7](https://doi.org/10.1007/978-1-4020-8272-6_7)
- Verification: Crossref-verified | Access: paywalled, evidence tier **B**
- Backs:
  - dehesa and montado as the analog behind the distance-from-panel-edge gradient
  - attribution to Iberian smallholders and estate managers of Extremadura, Andalusia and Alentejo
- **Caveat:** Crossref returns no issued year for this chapter; 2009 is taken from the agroecology document and is not Crossref-confirmed. CITATION CORRECTED 2026-07-30. The agroecology document's load-bearing claim that dehesa field studies measure light transmission as a function of distance from the oak trunk was attributed only to 'Marcos et al., dehesa radiation transmission', which does not exist and must not appear in any shipped artefact. The real source is montero2008-dehesa-light. The SOIL-MOISTURE half of the old claim is NOT supported by any source: Cubera & Moreno 2007 sample 2-30 m from the trunk but report categorical beneath-canopy vs beyond-canopy contrasts, not a fitted distance function.

#### `mueller2025-eastern-ag-complex`

Mueller, Natalie G.. (2025). *The sleeping crops of eastern North America: a new synthesis*. Philosophical Transactions of the Royal Society B: Biological Sciences 380: 20240192

- DOI: [10.1098/rstb.2024.0192](https://doi.org/10.1098/rstb.2024.0192)
- Verification: Crossref-verified | Access: open-access, evidence tier **B**
- Backs:
  - Eastern Agricultural Complex as an independent domestication centre in eastern North America
  - TEK design rule 6: landraces as distinct plantable entities with their own trait annotations

#### `ortloff1993-tiwanaku-collapse`

Ortloff, Charles R.; Kolata, Alan L.. (1993). *Climate and Collapse: Agro-Ecological Perspectives on the Decline of the Tiwanaku State*. Journal of Archaeological Science 20: 195-221

- DOI: [10.1006/jasc.1993.1014](https://doi.org/10.1006/jasc.1993.1014)
- Verification: Crossref-verified | Access: paywalled, evidence tier **B**
- Backs:
  - attribution rule: distinguish an extinct polity's archaeological system from living Aymara and Quechua practice

#### `peyre2006-kerala-homegardens`

Peyre, A.; Guidal, A.; Wiersum, K. F.; Bongers, F.. (2006). *Dynamics of Homegarden Structure and Function in Kerala, India*. Agroforestry Systems 66: 101-115

- DOI: [10.1007/s10457-005-2919-x](https://doi.org/10.1007/s10457-005-2919-x)
- Verification: Crossref-verified | Access: paywalled, evidence tier **B**
- Backs:
  - Kerala home-garden tier structure and species turnover over time

#### `roupsard1999-faidherbia`

Roupsard, Olivier; Ferhi, Abdelaziz; Granier, André; Pallo, François. (1999). *Reverse phenology and dry-season water uptake by Faidherbia albida (Del.) A. Chev. in an agroforestry parkland of Sudanese west Africa*. Functional Ecology 13: 460-472

- DOI: [10.1046/j.1365-2435.1999.00345.x](https://doi.org/10.1046/j.1365-2435.1999.00345.x)
- Verification: Crossref-verified | Access: paywalled, evidence tier **B**
- Backs:
  - Faidherbia albida reverse phenology: the nurse tree is leafless during the crop's growing season
  - TEK design rule 2: nurse plants as a distinct data-model role for microclimate-service species
  - TEK design rule 5: shade-schedule-aware temporal succession
- **Caveat:** The agroecology document cites 'Roupsard et al. 1999 (Functional Ecology 13(4))' with no DOI or title. The DOI is 10.1046/j.1365-2435.1999.00345.x, not the adjacent .00348.x.

#### `ruddle1988-dike-pond`

Ruddle, Kenneth; Zhong, Gongfu. (1988). *Integrated Agriculture-Aquaculture in South China: The Dike-Pond System of the Zhujiang Delta*. Cambridge University Press

- Verification: UNVERIFIED | Access: paywalled, evidence tier **B**
- Backs:
  - mulberry-dyke and fish-pond system of the Pearl River Delta, GIAHS-recognised at Huzhou
- **Caveat:** The monograph itself has no DOI; only reviews of it are indexed. Existence corroborated by three Crossref-indexed reviews, e.g. Richards 1989, Geographical Review 79:260 (10.2307/215545).

#### `simionesei2018-montado-water`

Simionesei, Lucian; Ramos, Tiago B.; Oliveira, Ana R.; Jongen, Marjan. (2018). *Modeling Soil Water Dynamics and Pasture Growth in the Montado Ecosystem Using MOHID Land*. Water 10: 489

- DOI: [10.3390/w10040489](https://doi.org/10.3390/w10040489)
- Verification: Crossref-verified | Access: open-access, evidence tier **C**
- Backs:
  - quantified soil water and pasture growth dynamics under montado oak cover
- **Caveat:** AUTHOR MISATTRIBUTION IN OUR DOCS. The agroecology document cites 'Fabião et al. 2018 (Water 10(4):489)'. Water 10(4):489 is by Simionesei, Ramos, Oliveira, Jongen et al. There is no Fabião on the author list.

#### `slach2021-coppice-decline`

Slach, Tomáš; Volařík, Daniel; Maděra, Petr. (2021). *Dwindling coppice woods in Central Europe - Disappearing natural and cultural heritage*. Forest Ecology and Management 501: 119687

- DOI: [10.1016/j.foreco.2021.119687](https://doi.org/10.1016/j.foreco.2021.119687)
- Verification: Crossref-verified | Access: paywalled, evidence tier **C**
- Backs:
  - coppice and pollarding as a documented European light-management tradition
- **Caveat:** AMBIGUOUS SOURCE. The agroecology document cites this only as 'Forest Ecology and Management 2021 (Central European coppice decline)'. Crossref holds a second plausible match: Johann 2021, 10.1016/j.foreco.2021.119129, on the re-introduction of coppice management in Austria. The intended source cannot be pinned; do not treat either as confirmed.

#### `yuan2022-hani-rice-fish-duck`

Yuan, Zhengjie; Xu, Jie; Shen, Le. (2022). *Valuation of Ecosystem Services for the Sustainable Development of Hani Terraces: A Rice-Fish-Duck Integrated Farming Model*. International Journal of Environmental Research and Public Health 19: 8549

- DOI: [10.3390/ijerph19148549](https://doi.org/10.3390/ijerph19148549)
- Verification: Crossref-verified | Access: open-access, evidence tier **C**
- Backs:
  - rice-fish-duck integrated system as documented among Hani communities in Yunnan
  - TEK design rule 7: LER-style portfolio reporting across stacked enterprises

## Standards & regulation

10 sources.

#### `din-spec-91434-2021`

(2021). *DIN SPEC 91434:2021-05 Agri-Photovoltaik-Anlagen - Anforderungen an die landwirtschaftliche Hauptnutzung*. DIN e.V. DIN SPEC 91434:2021-05

- URL: <https://www.dinmedia.de/en/technical-rule/din-spec-91434/337886742>
- Verification: URL-verified | Access: open-access
- Backs:
  - Germany: 66% of reference yield, 2.10 m clearance, <10% / <15% area loss
  - decision 8: DIN SPEC 91434 contains NO numeric light-homogeneity threshold, NO GCR cap and NO minimum row spacing
  - estimate-only compliance overlay requiring field agronomy
- **Caveat:** Free of charge despite being a DIN document, so accessLevel is open-access rather than standard-purchase. The 66% / 2.10 m / area-loss figures were carried over from the agrivoltaics document and were NOT read out of the standard text; only the bibliographic record and availability were verified.

#### `din-spec-91492-2024`

(2024). *DIN SPEC 91492:2024-06 Agri-Photovoltaik-Anlagen - Anforderungen an die Nutztierhaltung*. DIN e.V. DIN SPEC 91492:2024-06

- URL: <https://www.dinmedia.de/en/technical-rule/din-spec-91492/379601163>
- Verification: URL-verified | Access: open-access
- Backs:
  - the livestock counterpart to DIN SPEC 91434; out of scope for a garden tool but recorded for completeness

#### `france-decret-2024-318`

(2024). *Décret n° 2024-318 du 8 avril 2024 relatif au développement de l'agrivoltaïsme et aux conditions d'implantation des installations photovoltaïques sur des terrains agricoles, naturels ou forestiers*. Journal officiel de la République française NOR ECOR2321918D

- URL: <https://www.legifrance.gouv.fr/jorf/id/JORFTEXT000049386027>
- Verification: URL-verified | Access: public-domain
- Backs:
  - France: 90% of a control zone that is >=5% of area and capped at 1 ha, 40% maximum coverage
  - estimate-only compliance overlay
- **Caveat:** URL CORRECTED: the agrivoltaics document does not give a Legifrance identifier and the commonly circulated JORFTEXT000049383066 is wrong. The numeric thresholds were carried over from the agrivoltaics document and were not read out of the décret text.

#### `italy-dm-436-2023`

(2023). *Decreto MASE 22 dicembre 2023, n. 436 (DM Agrivoltaico)*. Ministero dell'Ambiente e della Sicurezza Energetica DM 436/2023

- URL: <https://www.mase.gov.it/portale/documents/d/guest/dec-436-2023-pdf>
- Verification: URL-verified | Access: public-domain
- Backs:
  - Italy: >=70% of area remains agricultural, 2.1 m clearance for crops, 60% producibility ratio
  - the 60% producibility ratio is NOT an LER>1 requirement
  - estimate-only compliance overlay
- **Caveat:** The PDF was confirmed to exist and to be the ministerial decree, but its numeric thresholds were not extracted; they are carried over from the agrivoltaics document.

#### `japan-maff-solar-sharing`

(2024). *営農型太陽光発電に係る農地転用許可制度上の取扱いに関するガイドライン*. 農林水産省農村振興局 (MAFF Rural Development Bureau) 5-Nōshin-2825

- URL: <https://www.maff.go.jp/j/nousin/noukei/totiriyo/attach/pdf/einogata-57.pdf>
- Verification: URL-verified | Access: public-domain
- Backs:
  - Japan: 80% of regional average yield, 2 m clearance
  - estimate-only compliance overlay
- **Caveat:** The PDF at this URL serves the AMENDED text (改正 令和7年3月31日, 6農振第2983号, 31 March 2025), so citing it as 'as of 25 March 2024' is inaccurate. The agrivoltaics document's amendment reference 6-Nōshin-2983 is correct but it dates it 2025 without noting that the linked text is the amended version.

#### `ma-225-cmr-20`

(n.d.). *225 CMR 20.00: Solar Massachusetts Renewable Target (SMART) Program*. Commonwealth of Massachusetts 225 CMR 20.00

- URL: <https://www.mass.gov/regulations/225-CMR-2000-solar-massachusetts-renewable-target-smart-program>
- Verification: UNVERIFIED | Access: public-domain
- Backs:
  - the legacy SMART regulatory basis, superseded
- **Caveat:** SUPERSEDED by 225 CMR 28.00 (SMART 3.0, filed August 2025). Legacy only, do not cite for current thresholds.

#### `ma-225-cmr-28`

(2025). *225 CMR 28.00: Solar Massachusetts Renewable Target (SMART) Program*. Commonwealth of Massachusetts 225 CMR 28.00

- URL: <https://www.mass.gov/regulations/225-CMR-2800-solar-massachusetts-renewable-target-smart-program>
- Verification: URL-verified | Access: public-domain
- Backs:
  - Dual-use Agricultural STGU design parameters
  - 50% sunlight at every square foot beneath, behind and adjacent to the STGU design
  - 8 ft fixed clearance at the lowest panel point
  - 10 ft tracking clearance at horizontal
  - 5 MW AC cap
  - 2:1 DC:AC ratio
  - 7,500 kW DC ceiling
  - Growing Season Hours definition in 28.02
  - waiver provision 28.07(5)(b)3.b.iv
- **Caveat:** Retrieved by driving a real browser and fetching same-origin, then decoding with pdf.js in-page; mass.gov WAF blocks ordinary clients. Supersedes 225 CMR 20.00. Every parameter is waivable, so no geometric result is a determination.

#### `ma-doer-shading-analysis-tool`

(n.d.). *DOER Shading Analysis Tool for Dual-use Agricultural STGUs*. Massachusetts Department of Energy Resources

- Verification: URL-verified | Access: public-domain
- Backs:
  - DOER mandates applicants use its own Shading Analysis Tool, so a third-party computed result has no regulatory standing
- **Caveat:** The tool is a public S3 app whose own footer reads UNDER CONSTRUCTION as of 2026-07-30.

#### `ma-smart-astgu-guideline`

(2022). *Agricultural Solar Tariff Generation Units Guideline*. Massachusetts Department of Energy Resources

- URL: <https://www.mass.gov/doc/agricultural-solar-tariff-generation-units-guideline/download>
- Verification: UNVERIFIED | Access: public-domain
- Backs:
  - decision 8: >=50% of sunlight at every square foot during the growing season
  - 8 ft clearance fixed-tilt, 10 ft tracking
  - 5 MW AC cap
  - the only compliance regime the tool can self-verify from geometry alone
- **Caveat:** mass.gov returns HTTP 403 to automated fetch for EVERY URL, so the primary text was NOT read. The 50% / 8 ft / 10 ft / 5 MW AC figures were corroborated only from a UMass Clean Energy Extension fact sheet (Jan 2024, https://www.umass.edu/agriculture-food-environment/sites/ag.umass.edu/files/fact-sheets/pdf/fs_-_dual-use_-_agriculture_and_solar_pv_012524_0.pdf). Since this is the one regime the product claims to CHECK rather than estimate, the DOER text must be read by a human before the checker ships. Note also that several near-identical mass.gov guideline slugs exist; pick one deliberately.

#### `uni-pdr-148-2023`

(2023). *UNI/PdR 148:2023 Sistemi agrivoltaici - Integrazione di attività agricole e impianti fotovoltaici*. UNI UNI/PdR 148:2023

- URL: <https://store.uni.com/uni-pdr-148-2023>
- Verification: URL-verified | Access: open-access
- Backs:
  - the Italian technical practice document accompanying DM 436/2023

## Software & datasets

12 sources.

#### `eia-electric-power-monthly-5-6-a`

(n.d.). *Electric Power Monthly, Table 5.6.A: Average Price of Electricity to Ultimate Customers by End-Use Sector, by State*. U.S. Energy Information Administration

- URL: <https://www.eia.gov/electricity/monthly/epm_table_grapher.php?t=epmt_5_6_a>
- Verification: URL-verified | Access: public-domain
- Backs:
  - the residential retail price of electricity for a US state, in cents per kilowatt-hour
  - that the price series is collected on Form EIA-861M and published by state and end-use sector
- **Caveat:** A retail price is what a kilowatt-hour costs to buy, not what an exported one earns. Net metering, time-of-use rates and export tariffs below retail are modelled nowhere in this app, so any value computed from this figure assumes every kilowatt-hour generated displaces one that would have been bought. It is a state-wide, year-long average and not a tariff anybody is on. United States only: no equally free per-country series covers the rest of this app's scope.

#### `fao-ecocrop`

(n.d.). *FAO ECOCROP crop ecological requirements database*. Food and Agriculture Organization of the United Nations

- URL: <https://gaez.fao.org/pages/ecocrop>
- Verification: URL-verified | Access: open-access
- Backs:
  - decision 9: bundled FAO ECOCROP (~2568 species)
  - decision 10: ECOCROP trapezoidal membership with min-across-parameters, which yields the limiting factor for free
- **Caveat:** The horticulture document's FAO land-resources-planning-toolbox URL is a stale stub, not the database. Use the GAEZ URL.

#### `nasa-power`

(n.d.). *NASA POWER API*. NASA Langley Research Center

- URL: <https://power.larc.nasa.gov/docs/services/api/>
- Verification: UNVERIFIED | Access: public-domain
- Backs:
  - decision 9: browser-direct fallback weather source, CORS verified by live curl 2026-07-29

#### `nominatim-policy`

(n.d.). *Nominatim Usage Policy*. OpenStreetMap Foundation

- URL: <https://operations.osmfoundation.org/policies/nominatim/>
- Verification: UNVERIFIED | Access: open-access
- Backs:
  - decision 9: Nominatim geocoding at 1 request/second with a required User-Agent header

#### `nrel-nsrdb-psm3`

(n.d.). *NSRDB Data Downloads API (GOES PSM v4.0.0)*. National Laboratory of the Rockies

- URL: <https://developer.nlr.gov/docs/solar/nsrdb/>
- Verification: URL-verified | Access: public-domain
- Backs:
  - decision 9: the NSRDB is worker-proxied for API-key secrecy
  - the developer.nrel.gov -> developer.nlr.gov migration, and the PSM v3.2.2 -> GOES v4.0.0 replacement
- **Caveat:** Verified directly on 2026-08-05, which the previous record could not do. The docs state verbatim that 'The previous developer.nrel.gov domain was retired on May 29, 2026', the old host now fails to connect entirely, and the endpoint index marks PSM v3.2.2 and its TMY product as replaced by GOES Aggregated v4.0.0 and GOES TMY v4.0.0. The live v4 TMY endpoint was exercised with DEMO_KEY and validated wkt, names, interval and attributes, returning a structured 400 for the email parameter only. No full download was made: the upstream requires a real address.

#### `open-meteo`

(n.d.). *Open-Meteo Historical Weather API and Satellite Radiation API*. Open-Meteo

- URL: <https://open-meteo.com/en/licence>
- Verification: URL-verified | Access: open-access
- Backs:
  - decision 9: the only global, keyless, CORS-enabled, CC BY 4.0 commercial-use source returning GHI+DNI+DHI
  - primary browser-direct weather source
  - attribution requirement: a visible 'Weather data by Open-Meteo.com' link
- **Caveat:** Rate and tier limits are on the pricing page, not the licence page, and were not captured.

#### `pvgis-v5-3`

(n.d.). *PVGIS 5.3 non-interactive API*. European Commission Joint Research Centre

- URL: <https://joint-research-centre.ec.europa.eu/photovoltaic-geographical-information-system-pvgis/getting-started-pvgis/api-non-interactive-service_en>
- Verification: URL-verified | Access: open-access
- Backs:
  - decision 9: PVGIS must be worker-proxied because it explicitly forbids AJAX by written policy

#### `pvlib-python`

(n.d.). *pvlib-python*. pvlib community

- URL: <https://pvlib-python.readthedocs.io/>
- Verification: UNVERIFIED | Access: open-access
- Backs:
  - the BSD-3 reference implementation of SPA, the Perez transposition model, DIRINT and bifacial.infinite_sheds
  - decision 2.1: infinite_sheds.vf_ground_sky_2d is used only as a unit-test oracle

#### `react-three-fiber`

(n.d.). *@react-three/fiber*. Poimandres

- URL: <https://github.com/pmndrs/react-three-fiber>
- Verification: UNVERIFIED | Access: open-access
- Backs:
  - decision 13: @react-three/fiber 9.6.1, NOT v10

#### `sandia-pvpmc`

(n.d.). *PV Performance Modeling Collaborative Modeling Guide*. Sandia National Laboratories

- URL: <https://pvpmc.sandia.gov/modeling-guide/>
- Verification: UNVERIFIED | Access: public-domain
- Backs:
  - reference derivations for the Perez sky diffuse model, SPA and plane-of-array irradiance

#### `suncalc`

(n.d.). *SunCalc*. Vladimir Agafonkin

- URL: <https://github.com/mourner/suncalc>
- Verification: UNVERIFIED | Access: open-access
- Backs:
  - decision 2.4: SunCalc 2.0.1 permitted for sunrise/sunset/twilight/moon UI chrome only
  - SunCalc exposes no air mass, radius vector or refraction control, which is why it cannot drive the simulation

#### `threejs`

(n.d.). *three.js*. three.js contributors

- URL: <https://github.com/mrdoob/three.js>
- Verification: UNVERIFIED | Access: open-access
- Backs:
  - decision 13: three 0.185.1 as the 3D renderer

## Unsourced and weakly-sourced claims

The honest-provenance ledger. Every entry is a claim that currently reaches, or could reach, a user-visible
surface without solid peer-reviewed backing. This list is meant to be complete rather than flattering.
Each item names what would close it.

### A. Load-bearing claims with NO verifiable peer-reviewed backing

| # | Claim | Where | Status | What would close it |
|---|---|---|---|---|
| A1 | Dehesa field studies measure light transmission and soil moisture as a function of distance from the oak trunk, reusable as an empirical template for distance-from-panel-edge modelling | doc 00 §12; the agroecology document §4.1 | Attributed only to 'Marcos et al., dehesa radiation transmission'. NOT LOCATED. This is called the highest-value analog in the decision record and rests on an unresolvable citation. | Find the actual paper, or drop the distance-from-edge empirical template and model it from geometry alone |
| A2 | Wind reduction percentages under a panel array | the agrivoltaics document thin-evidence 7 | Rests on trade-press coverage, not primary papers. No peer-reviewed source located. | A primary micrometeorology paper, or remove the numeric wind modifier and keep only the qualitative rule |
| A3 | Frost protection and dew formation under panels | the agrivoltaics document thin-evidence 6; doc 00 §12 rule 3 | Mechanistically plausible, entirely unquantified. No source. | Any field study with quantified frost/dew deltas |
| A4 | VPD and relative-humidity deltas under panels | the agrivoltaics document thin-evidence 5 | Directionally consistent across reports but no numbers were extractable from any accessible source. | Extract the numbers from Marrou 2013b full text, which we hold a verified DOI for but did not read |
| A5 | The 'Beck et al. 2012' 50%-shade threshold | the horticulture document gap 3 | Cited *within* agrivoltaic reviews. Primary reference NOT LOCATED and may not exist as described. Not to be confused with Beck et al. 2018 Köppen-Geiger, which is verified. | Trace it, or cite Zhang et al. 2025 for the tipping point instead and delete the Beck 2012 attribution |
| A6 | Desmodium intercepts and kills stemborer larvae rather than repelling adults | doc 00 §11 | Attributed to 'eLife' with no article, authors or DOI. NOT LOCATED. | Find the eLife paper, or state the mechanism revision without a specific citation |
| A7 | Penumbra at 4 m clearance is ~7.5 cm and can be ignored for annual DLI | doc 00 §3 | No source given anywhere. It is a defensible geometric calculation but it is presented as a physics constant. | Show the derivation inline, or cite a source |
| A8 | Inter-reflection formula E / (1 - rho_g (1 - SVF) rho_m), material only for white backsheets at 3-8% in the shade strip | doc 00 §3 | No source given. The 3-8% magnitude in particular is unattributed. | Cite the derivation source; Marion 2017 is the likely candidate but does not state these numbers |
| A9 | Beam shadow bands sweep ~0.25 deg/min, therefore timestep must be <=15 min | doc 00 §4 | No source. Arithmetically checkable but the 15 min threshold and the 'hourly steps smear cell-level extremes' claim are unattributed. | Show a convergence study; this is cheap to generate ourselves |
| A10 | Per-crop shade-response functions conditional on climate | the horticulture document gap 8 | Do not exist in the literature in usable form. The product ships a two-context hot/arid vs cool/humid approximation that no source supports. | Label the two-context split as a product heuristic, not a finding |
| A11 | Japanese solar-sharing crop science | the agrivoltaics document thin-evidence 10 | Nearly absent in English despite a decade of deployment and a legally binding 80% yield rule. Only sekiyama2019-solar-sharing was located. | Japanese-language literature search, or state the gap in the UI wherever the Japan overlay appears |
| A12 | Nagashima 2015/2020 and AIP Conf. Proc. 2361(1):030002 (2021) | the agroecology document §3.1 | Neither citation resolves. The AIP volume 2361 record found at Crossref is a different paper (Hudelson & Lieth, article 080001). | Correct or drop; sekiyama2019-solar-sharing already carries the Nagashima attribution |
| A13 | PMC4416130, described as a 'PLOS ONE 2015 root-foraging LER study' | the agroecology document Americas source list | No such study located. The root-foraging LER work is Zhang et al. 2014 and Postma & Lynch 2012, both in Annals of Botany. | Replace the PMC reference with the two verified Annals of Botany DOIs |
| A14 | Base temperatures and DLI values sourced from trackgdd.com, hydroponics blogs and ReduSystems | the horticulture document gap 9 | Secondary web sources with no provenance. The horticulture document itself flags that every value reaching a hard filter must be traced first. DLI side closed 2026-09-11 (decision record 23): every Tier C figure cites the class methodology, the three Tier A rows cite per-crop trials, and no ECOCROP entry backs a light integral. Base temperatures remain. | Trace each base temperature to a primary or extension source before release; this is a release blocker, not a nice-to-have |
| A17 | Leaf area index and light extinction coefficient per plant habit (`HABITS` in `src/data/catalog/schema.ts`) | water model basal coefficient; crop-versus-crop shading | Declared through `unsourcedClaim` as `HABIT_CANOPY_CLAIM` and listed on the sources step (record 23). FAO-56 chapter 9 fixes one extinction coefficient, 0.7, for every crop; the per-habit values are the app's own. | A source tabulating leaf area index or extinction by canopy form, or adopt FAO-56's single 0.7 and drop the per-habit column |
| A18 | Crop ranking weights: light 0.35, climate 0.25, soil 0.15, interaction 0.1, competition 0.1, preference 0.05 | `src/recommend/stages/rank.ts` | Declared through `unsourcedClaim` as `WEIGHTS_CLAIM` and listed on the sources step (record 23). A design choice; the comment on `DEFAULT_WEIGHTS` says what each term is and why the order. | Nothing in the literature calibrates these terms for a garden bed; a sensitivity study of the ranking against the weights would say how much they matter |
| A15 | Soil data sources (SoilGrids, SSURGO) licence terms and resolution | the horticulture document gap 5 | Not researched at all. Stage 3 of the recommendation pipeline depends on them. | Do the research before designing stage 3 |
| A16 | OSU Croptime crop and cultivar coverage | the horticulture document gap 6 | Not enumerated; the search budget ran out. GDD-based scheduling is designed around it. | Enumerate which vegetables have published GDD models |

### B. Claims backed only by paywalled or secondary sources

These have verified bibliographic records. Nobody on this project has read the numbers.

| # | Claim | Source | Status |
|---|---|---|---|
| B1 | US ambient DLI map contours; any per-crop DLI table inside the paper | `faust2018-dli-maps` | ASHS returns 403 to automated fetch. Crossref-verified record, full text never read. Decision 7: must not reach a hard filter. |
| B2 | The ~50% shade tipping point; shade-tolerant vs shade-sensitive groupings; their effect sizes and CIs | `zhang2025-tipping-points` | Paywalled to automated fetch when the horticulture document was written. Corroborated only from reviews and pv-magazine. Decision 7: must not reach a hard filter. |
| B3 | Massachusetts SMART: >=50% sunlight at every square foot, 8 ft / 10 ft clearance, 5 MW AC cap | `ma-smart-astgu-guideline`, `ma-225-cmr-20` | mass.gov returns 403 to every automated fetch. Corroborated only from a UMass Extension fact sheet. **This is the one regime the product claims to CHECK rather than estimate**, so a human must read the DOER text before the checker ships. |
| B4 | Germany 66% reference yield / 2.10 m / <10% and <15% area loss; and the negative claims that DIN SPEC 91434 contains no light-homogeneity threshold, no GCR cap and no minimum row spacing | `din-spec-91434-2021` | The standard is a free download and its bibliographic record is verified, but the text was not read. The three NEGATIVE claims are the load-bearing ones and are the easiest to get wrong. |
| B5 | Italy >=70% agricultural area, 2.1 m, 60% producibility ratio | `italy-dm-436-2023` | Official PDF confirmed to exist; thresholds carried over from the agrivoltaics document, not extracted. |
| B6 | France 90% of a control zone >=5% of area capped at 1 ha, 40% max coverage | `france-decret-2024-318` | Legifrance URL corrected and confirmed; thresholds carried over from the agrivoltaics document, not extracted. |
| B7 | Japan 80% of regional average yield, 2 m | `japan-maff-solar-sharing` | Guideline PDF confirmed, but the served text is the 2025-amended version, not the 25 March 2024 notice our docs cite. |
| B8 | Allium white rot sclerotia survive 20-40 years and rotation does not work | `hoanghua2024-white-rot` | The paper covers bait crops. The survival figure and the 'rotation is impractical' conclusion come from UC IPM, UMass and RHS extension pages that were not fetched. |
| B9 | Juglone landscape-scale evidence is weak | `jose-juglone` | The Springer chapter is verified but paywalled. The horticulture document's sceptical framing leans on a ResearchGate copy and a WSU Extension fact sheet, neither peer reviewed nor verified. |
| B10 | Light saturation point 25-60% of maximum sunlight at canopy level for C3 crops | Pang et al. 2019 and Carrier et al. 2019 | Cited by the agrivoltaics document only as secondary citations *inside* Laub et al. 2022 §4.3. Neither primary paper was located or verified. |
| B11 | NREL SPA report text and the developer.nrel.gov -> developer.nlr.gov migration | `reda2008-spa-report`, `nrel-nsrdb-psm3` | nrel.gov and docs.nrel.gov were DNS-unreachable from the verification network. The DOI record is Crossref-verified; the PDF and the migration notice were not fetched. |

### C. The Laub 2022 crop-response model: what is ours and what is theirs

The single most load-bearing source in the product, and the one with the most delicate provenance.

1. **The fitted per-group coefficients are not published anywhere.** Not in the article, not in MOESM1
   (Fig. S1 caption, Table S1 = the 58 publications, Table S2 = predictions), not in MOESM2 (raw dataset),
   not in Zenodo record `10.5281/zenodo.5716091` (two xlsx files). The article states "Code availability:
   Not applicable". The analysis was run in SAS 9.4 PROC GLIMMIX.
2. **Our coefficients are derived, not cited.** They were recovered algebraically from the 162 published
   Table S2 points plus the verbatim model specification, and validated to within 0.07 percentage points.
   They must never be presented as Laub's published coefficients.
3. **Documentation error to fix.** `00-DECISIONS.md` §7, `02-agrivoltaics-science.md` (§2.1 table, §2.2
   point 1, §5) and `ARCHITECTURE.md` all describe the 67.2-156.1% range for fruity vegetables at 40% RSR
   as a *prediction interval*. It is a 95% **confidence** interval: Table S2's caption and the main text
   both say so. Prediction intervals exist in the paper but are only drawn as grey lines in Fig. 3 and are
   never tabulated, so `LaubCurve.anchors` cannot be interpolating them. Correct the wording in all four
   documents and in any UI copy that inherited it.
4. **Sample sizes.** berries n=5, fruits n=7, fruity vegetables n=3, leafy vegetables n=4, C3 cereals n=10,
   maize n=10, tubers/root crops n=2, grain legumes n=14, forages n=11. Totals 428 data points (340
   excluding controls), 58 studies, 38 crop species. **Tubers/root crops at n=2 is the weakest group in the
   paper**, and the three most garden-relevant groups (root n=2, fruity veg n=3, leafy veg n=4) are the
   three thinnest.
5. **Scale caveat, verbatim from the authors:** "uncertainties due to random plot scale effects are large,
   while at country or continental scales the mean response to shading, represented by the confidence
   intervals, is the more valid estimator." Our users are single gardens. That is precisely the plot scale
   the authors describe as MORE uncertain, so the confidence intervals we render are, if anything,
   optimistic for a single-garden prediction.
6. **Do not verify our numbers against EarthArXiv 7354.** `tekie2024-drought-index-preprint` is a different,
   non-peer-reviewed paper that merely cites Laub and publishes its own regressions using Laub's crop
   categories, e.g. `C3 Cereals Y=106.34-0.44X1`, `Berries Y=-13.36+2.22X1`, `Maize Y=61.82+0.25X1`,
   `Grain Legumes Y=104.54-0.52X1`. Those are not Laub's coefficients. It ranks highly in search and is the
   most likely way a future reader gets this wrong.

### D. The agrivoltaics document thin-evidence areas, mapped to this corpus

| # (the agrivoltaics document §7) | Area | Covered by |
|---|---|---|
| 1 | Tubers/root crops n=2, fruity vegetables n=3, leafy vegetables n=4 in Laub | Section C item 4. The garden-relevant groups have the weakest support in the whole meta-analysis. |
| 2 | No DLI threshold exists for brassicas, root crops, alliums, legumes, most herbs, hops, elderberry, pawpaw or forages | **Open.** Numbers in the decision-record DLI table for these classes are inference, not measurement. Doc 00 §6 already marks root/tuber and allium minima as "none established"; brassica 12-17 is explicitly labelled "inferred". Every other inferred number must be labelled the same way in the UI. |
| 3 | Air-temperature effects contradict across climates | `barron-gafford2019-arizona` (cooling, AZ) vs `weselek2021-potato` (warming, Heggelbach). Both verified. **Genuine scientific disagreement, not a citation gap.** The product must not present a single sign. |
| 4 | Soil-moisture sign also flips | `hassanpour-adeh2018-oregon` (doubled), `barron-gafford2019-arizona` (+15%), `weselek2021-potato` (reduced). Same treatment. |
| 5 | VPD/RH deltas not extractable as numbers | Gap A4. |
| 6 | Frost protection and dew formation unquantified | Gap A3. |
| 7 | Wind-reduction percentages rest on trade press | Gap A2. |
| 8 | Phenology delay has one number (lettuce 3-7 d) and no cross-crop synthesis | `marrou2013-lettuce-rue` covers the single number. **No cross-crop source exists.** Do not extrapolate the lettuce figure to other crops. |
| 9 | No published seasonal validation of any analytic ground-PAR model against distributed field PAR sensors | **Open, and it is the largest gap on the physics side.** `zainali2023-viewfactor`'s 0.3% figure is a single clear-sky day. Our whole optical stack inherits this. |
| 10 | Japanese solar-sharing crop science nearly absent in English | Gaps A11, A12. Only `sekiyama2019-solar-sharing` located. |
| 11 | Fresh-weight vs dry-weight reporting bias may inflate apparent shade benefit for berries, fruits and fruiting vegetables | **Open.** This bites exactly the three groups where Laub shows shade *benefit* (berries 114%, fruits 113%, fruity veg 102%), which is also the pathway the water-limitation flag gates. Two independent reasons to distrust the same numbers. |
| 12 | Multi-year accumulation of shade stress in perennials is under-studied | Partly closed by `reher2025-pears`, a multi-year perennial trial showing a consistent yield reduction. Still open for berries and cane fruit. |

### E. The horticulture document known gaps, mapped to this corpus

| # (the horticulture document §7) | Gap | Status |
|---|---|---|
| 1 | Faust & Logan 2018 full text not retrievable | Gap B1. Still not retrieved. |
| 2 | 2025 agrivoltaics meta-analysis paywalled | Gap B2. Still not read. Now identified as Zhang et al., `10.1007/s13593-025-01060-z`. |
| 3 | 'Beck et al. 2012' 50%-shade threshold not traced | Gap A5. Still not traced. |
| 4 | Most DLI values in the horticulture document §3.6 are Tier C inferences | **Confirmed and unchanged.** Ordinal ranking reliable, absolutes provisional. The horticulture document's own suggested fix (a systematic review of shade-cloth trials, convertible to DLI given site radiation) is the highest-value follow-up and would upgrade 20-30 rows from C to B. |
| 5 | Soil data sources not researched | Gap A15. |
| 6 | OSU Croptime coverage not enumerated | Gap A16. |
| 7 | PFAF and Permapeople CC BY-SA licensing needs legal review | **Open.** Decision 9 already requires isolation behind a boundary or exclusion. The image terms on PFAF add non-commercial and no-derivatives restrictions on top of the viral CC BY-SA. Not a citation gap, but it is a shipping blocker. |
| 8 | Per-crop shade response conditional on climate does not exist in usable form | Gap A10. |
| 9 | Secondary sources used for base temperatures and DLI values | Gap A14. Release blocker. |

### F. Citation errors found in the research docs

Every one of these is a wrong citation shipped in `docs/`. Fix at source.

| Where | Our docs say | Actually |
|---|---|---|
| the horticulture document §8 | Holliday, R. (1968). Plant competition and crop yield. *Nature* 217:289 | **Nature 217:289-290 (1968) is by Farazdaghi & Harris.** Holliday's paper is *Nature* 186:22-24 (1960). Two different papers conflated. See `holliday1960-population-yield` and `farazdaghi1968-competition-yield`. |
| the horticulture document §8 | Luedeling, E. et al. (2011). The Dynamic Model provides the best description of the chill process. *HortScience* 46(3):420-425 | **HortScience 46(3):420-425 is by Zhang & Taylor**, and it is a single-site pistachio study in Australia, not a global comparison. The global-comparison claim belongs to Luedeling & Brown 2010 (`luedeling2010-chill-comparability`). |
| the solar geometry document §9 | Patel, M. T. et al. (2018). Ground sculpting to enhance vertical bifacial solar farm output. arXiv:1806.06666 | **Authors are Khan, Sakr, Sun, Bermel & Alam.** No Patel. Version of record is *Applied Energy* 241:592-598 (2019), `10.1016/j.apenergy.2019.01.168`. |
| the agroecology document Europe | Fabião et al. 2018 (*Water* 10(4):489) | **Water 10(4):489 is by Simionesei, Ramos, Oliveira, Jongen et al.** No Fabião on the author list. |
| the solar geometry document §9 | INRAE (2023). Assessment of the ground coverage ratio ... hal-04240227 | **Single-authored by Christian Dupraz.** Version of record *Agroforestry Systems* 98:2679-2696 (2024), `10.1007/s10457-023-00906-3`. hal.science blocks automated fetch; use hal.inrae.fr. |
| doc 00 §11, the horticulture document §4.5 | Finch & Collier (2003) | **Three authors: Finch, Billiald & Collier.** *Ent. Exp. Appl.* 109:183-195. |
| the agroecology document §1.8 | Armstrong et al. 2022 (*Ecosystems and People* 18(1)) | 2023, volume 19. The 2022 inside the DOI is the acceptance year. |
| the agroecology document §1.8 | Armstrong et al. 2021 (*Ecology and Society* 26(2):6), no DOI | DOI is `10.5751/ES-12322-260206`. The plausible-looking `10.5751/ES-12160-260206` 404s. |
| the agroecology document Africa | Fernandes, O'Kting'ati & Maghembe 1985 (*Agroforestry Systems* 2) | 1984, *Agroforestry Systems* 2:73-86. Separate 1985 and 1989 versions exist elsewhere. |
| the agroecology document Asia/Oceania | Gott 1983 (*Archaeology in Oceania* 18(1)) | No Gott article at that location. The murnong paper is *Australian Aboriginal Studies* 1983(2):2-18 (no DOI); the Crossref-verified Gott record in *Archaeology in Oceania* is 1982, 17:59-67. |
| the agrivoltaics document §8 | Widmer et al. (2024/2025). Strawberry and raspberry under agrivoltaics: minimum DLI requirements | Title is a paraphrase; four of six given names are wrong; version of record is 2026, *AgriVoltaics Conference Proceedings* 4, `10.52825/agripv.v4i.2837`. |
| the agrivoltaics document §8 | Doedt, C., Tajima, M., Iida, T. (2022). Agrivoltaics in Japan: a legal framework analysis | Crossref gives issue year 2024 and the short title 'Agrivoltaics in Japan'. |
| the agrivoltaics document §8, §1.2 | McCree (1972). The action spectrum... *Agricultural Meteorology* 9:191-216 | Crossref issued year is 1971. Volume and pages are correct. Separately, the solar geometry document cites a *different* McCree 1972 paper (*Agric. Meteorol.* 10:443-453) under the same short form; they must not be merged. |
| the agrivoltaics document §8 | Marcelis et al. (2006), *Acta Horticulturae* 711:97-103 | Pages 97-104. |
| the horticulture document §4.5 | Theunissen (1994), *Pesticide Science* 42:65-72 | Pages 65-68. |
| the horticulture document §1.7 | Ouellet & Sherk (1967). Woody ornamental plant zonation indices of winter hardiness | Actual part I title: 'Woody ornamental plant zonation: I. Indices of winterhardiness', *Can. J. Plant Sci.* 47:231-238. Parts II and III also exist; part III carries the map. |
| the horticulture document §4.11 | Peng et al., ScienceDirect PII S1161030115300125 | That PII does not correspond to the quoted title. Correct DOI: `10.1016/j.eja.2015.07.007`. |
| the agrivoltaics document §8 | Tekie et al. 2024, https://eartharxiv.org/repository/object/7354/ | URL 404s. Working URL is `/repository/view/7354/`; DOI `10.31223/X5KT33`. See section C item 6 for why this preprint is dangerous. |
| the agroecology document Americas | PMC4416130 (*PLOS ONE* 2015 root-foraging LER study) | Not located. The root-foraging LER work is Zhang et al. 2014 and Postma & Lynch 2012, both *Annals of Botany*. |
| the horticulture document §2 | FAO ECOCROP via the land-resources-planning-toolbox URL | Stale stub. ECOCROP now lives at <https://gaez.fao.org/pages/ecocrop>; `ecocrop.fao.org` is dead. |
| the agrivoltaics document §6.5 | Décret n° 2024-318, no Legifrance id | Correct id is JORFTEXT000049386027. The widely circulated JORFTEXT000049383066 is wrong. |
| the agroecology document Europe | *Forest Ecology and Management* 2021 (Central European coppice decline) | Ambiguous: two plausible 2021 FEM matches exist (Slach et al. `10.1016/j.foreco.2021.119687` and Johann `10.1016/j.foreco.2021.119129`). Cannot be pinned. |
| the horticulture document §8 | Purdue HO-238-B-W treated as interchangeable with HO-238-W | Different publications, different author lists. HO-238-B-W adds Currey and Faust. |
| the horticulture document §8 | Virginia Coop. Ext. SPES-720 | Printed publication number is SPES-720NP; author Eric Stallknecht, 2025. |

No DOI in this corpus was invented. Where our docs gave a DOI that resolves to a different paper, both the
wrong attribution and the correct record are listed above and carried as caveats on the relevant entries.
Where no DOI could be found, the entry is marked `unverified` rather than given a plausible-looking one.
