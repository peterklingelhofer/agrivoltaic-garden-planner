# Citation corpus

528 sources (176 crossref-verified, 1 datacite-verified, 16 unverified, 335 url-verified). Machine-readable companion: [`CITATIONS.csl.json`](./CITATIONS.csl.json) (CSL-JSON).
A record enters this corpus verified against the Crossref REST API, against the DataCite REST API,
or by a fetch of the authoritative publisher, standards-body or government URL, with an Internet
Archive snapshot standing in where a live page withholds its text.

## How to read this

### Verification status

This says how the *bibliographic record* was checked. It says nothing about whether the finding is true.

| Status | Meaning |
|---|---|
| `crossref-verified` | The DOI resolves in Crossref and the returned title, authors, year, journal, volume and pages match the entry as it stands here. Any discrepancy is written into the caveat. |
| `datacite-verified` | Same, via the DataCite API. Used for Zenodo and other dataset DOIs. |
| `url-verified` | No DOI exists. An authoritative URL (publisher, standards body, government, extension service) was fetched and the document identity confirmed from the page itself. |
| `unverified` | Neither a resolvable DOI nor a successfully fetched authoritative URL. The bibliographic details are unconfirmed, taken from a secondary citation, and may be wrong. |

A `crossref-verified` record can still carry a loud caveat. Verification confirms the *citation* and
says nothing about the *claim*. Several entries here are Crossref-verified and paywalled to full-text
fetch: the record is right about what the paper is, and the paper's own numbers are unread.

### Access level

`open-access` (a CC license is registered or the publisher serves it freely) | `paywalled` |
`public-domain` (government, national-lab or extension output) | `standard-purchase` (must be bought from a standards body).
Where a Crossref `license` field was present, the access level comes from that field.

### Evidence tier

The A-E scheme from `00-DECISIONS.md` section 11, applied to sources making biological or agronomic claims.
Physics, geodata and software sources carry `null`: the scheme does not apply to them.

| Tier | Definition | Product treatment |
|---|---|---|
| A | Multi-site trials or meta-analysis with a characterized mechanism | Contributes to scoring |
| B | Replicated trials, context-dependent or with management preconditions | Contributes to scoring |
| C | Single study or lab-only | Renders as "experimental", does not score |
| D | Traditional, plausible, untested | Folklore panel only, never affects layout |
| E | No evidence, or directly contradicted | Folklore panel only, never affects layout |

### Archived copies

A source cited by URL also lists an Archived link to the Wayback Machine capture nearest the date it was read. The live page may have been revised or removed since then, so check the capture when a quoted figure doesn't match the live page. `scripts/archive-sources.mjs` finds or requests each capture and records its link.

### Receipts and baselines

A receipt records that a verbatim quote was found in its source: the quote's hash and a
description of the text it was found in, since the texts themselves are copyrighted and stay on
one machine. `src/data/citation-receipts.test.ts` holds `CITATIONS.receipts.json` against this
ledger offline, so a quote whose words change after it was checked fails CI until
`bun scripts/check-quotes.mjs --write-receipts` finds the new wording. `CITATIONS.baseline.json`
holds five counts that can only go down: the entries still marked unverified, the quotes without a
receipt, the quotes written with a bare ellipsis, the quotes without a locator and the entries
with a claim that still says verbatim. `src/data/citation-baseline.test.ts` fails when any of them
goes up, and `bun run citations:baseline --write` lowers the baseline when one comes down.

### Quotes

An entry's `quotes` hold the source's own words, and `backsClaims` holds each claim they back in
the ledger's words. A quote writes an elision as `[...]`. Each quote carries a locator, the page,
section, table or figure it comes from, and the baseline counts the quotes that still lack one.
The ledger's house spelling of a unit, such as `mol/m2/d`, stands for the source's own, since the
lookup folds the spellings together.

### Counts

| Verification | n |
|---|---|
| crossref-verified | 176 |
| datacite-verified | 1 |
| unverified | 16 |
| url-verified | 335 |
| **total** | **528** |

| Access level | n |
|---|---|
| open-access | 80 |
| paywalled | 115 |
| public-domain | 333 |

| Evidence tier | n |
|---|---|
| A | 40 |
| B | 75 |
| C | 319 |
| null (not applicable) | 94 |

---

## Agrivoltaics

38 sources.

#### `allen2023-jacks-solar-garden`

Allen, Gabe; Hickman, Tyler. (2023). *In Colorado, the soil beneath solar panels is ripe for growing crops*. Planet Forward

- URL: <https://planetforward.org/story/soil-beneath-solar-panels/>
- Archived: <https://web.archive.org/web/20260711142821/https://planetforward.org/story/soil-beneath-solar-panels/>
- Verification: URL-verified | Access: public-domain
- Backs:
  - at Jack's Solar Garden the trackers' shadows move across the ground through the day and rainwater is deposited along each panel's downward edge, and growers plant to the microclimates that makes
- **Caveat:** Journalism about a research site, quoted for the practice it reports and for nothing measured.

#### `amaducci2018-corn`

Amaducci, Stefano; Yin, Xinyou; Colauzzi, Michele. (2018). *Agrivoltaic systems to optimise land use for electric energy production*. Applied Energy 220: 545-561

- DOI: [10.1016/j.apenergy.2018.03.081](https://doi.org/10.1016/j.apenergy.2018.03.081)
- Verification: Crossref-verified | Access: paywalled, evidence tier **B**
- Backs:
  - corn gains under agrivoltaic shade appear only under rainfed water stress
  - the water-limitation flag that gates the shade-benefit pathway
- **Caveat:** A simulation study: a coupled radiation and shading model driving the GECROS crop model over a 40-year climate record, with no field trial of its own. Laub et al. 2022's inclusion criteria exclude modeling work, so this paper is outside the meta-analysis this app's yield curves come from and its corn result can't be read as a data point inside them.

#### `barron-gafford2019-arizona`

Barron-Gafford, Greg A.; Pavao-Zuckerman, Mitchell A.; Minor, Rebecca L.; Sutter, Leland F. (2019). *Agrivoltaics provide mutual benefits across the food-energy-water nexus in drylands*. Nature Sustainability 2: 848-855

- DOI: [10.1038/s41893-019-0364-5](https://doi.org/10.1038/s41893-019-0364-5)
- Verification: Crossref-verified | Access: paywalled, evidence tier **B**
- Backs:
  - chiltepin pepper total fruit production was three times greater under the PV panels of the agrivoltaic system
  - cherry tomato total fruit production was twice as great under the PV panels
  - jalapeno total fruit production was nearly EQUAL between treatments, attained with 65% less transpirational water loss, and jalapeno water use efficiency was 157% greater
  - soil moisture +15% under panels at an arid site
  - daytime air-temperature cooling under panels in a hot arid climate
- **Caveat:** The study is dryland-specific. This app gates every 'shade improves yield' pathway behind a water-limitation flag, because these gains don't transfer to temperate gardens. The temperate Heggelbach site (Weselek 2021) found effects in the opposite direction on both temperature and soil moisture. The full text (https://www.osti.gov/servlets/purl/1567040) puts the 3x on chiltepin and the 2x on cherry tomato. Jalapeno showed no yield gain at all: 'total fruit production was nearly equal between treatments... but this was attained with 65% less transpirational H2O loss'. Its cumulative CO2 uptake was 11% lower under the panels. A jalapeno yield gain has no support in this paper.

#### `bennaim2025-tomato-shade`

Ben Naim, Yariv; Ladell, Chanani; Cohen, Yigal. (2025). *Agri-Photovoltaic technology allows dual use of land for tomato production and electricity generation*. Scientific Reports 15: 43717

- DOI: [10.1038/s41598-025-27602-9](https://doi.org/10.1038/s41598-025-27602-9)
- Verification: Crossref-verified | Access: open-access, evidence tier **B**
- Backs:
  - a row-resolved tomato yield response under single-axis trackers
    - "Plants in row 4 yielded the highest fruit weight (~ 3.5 kg per plant), which declined significantly and progressively in adjacent rows. The yields in rows 3 and 5 were similar to row 4 while rows 2 and 6 showed a significant reduction in yield (~ 2.6 kg/plant) compared with row 4." (p. 7)
  - the shading those rows received, so a significant tomato yield loss appears at 16.5 and 19.3 percent season shading and none at 8.6 and 11.9
    - "The relative gradual reduction in irradiation levels in rows 1-7, compared to row 4, were 92.7%, 19.3%, 11.9%, 0.0%, 8.6%, 16.5%, and 91.2%, respectively" (p. 5)
  - the whole-system reading the authors draw, with total fruit yield loss of 19.4% across all seven rows and an improved land equivalent ratio
    - "A coverage of up to 26% of the land area with PV modules did not significantly affect plant growth or fruit quality" (p. 16)
- **Caveat:** Bar Ilan University, Israel (32.07 N), hot Mediterranean, processing tomato in 110 L containers on white plastic mulch under computer-controlled drip fertigation, two seasons. Irrigated and container-grown, so water isn't the limiting factor. The east and west asymmetry between rows at similar shading (row 2 against row 6, row 3 against row 5) is larger than the shading difference between them, so the trial carries a confounder the paper doesn't resolve. The row-level result is the one a per-bed tool should quote, and the land-coverage sentence is about module coverage of the plot.

#### `both2025-nj-lessons`

Both, A. J.; Bamka, Bill; Besancon, Thierry; Birnie, Dunbar P.; Burgher, Clint; Gimenez, Daniel; Guran, Serpil; Kornitas, Michael; Nitzsche, Pete; Robinson, David; Rucker, W. Ross; Schoolman, Ethan; Specca, David; Sullivan, Kevin P.; Ward, Daniel L.; Westendorf, Mike; Wyenandt, Christian A. (2025). *Lessons Learned from Three Agrivoltaic Installations in New Jersey*. AgriVoltaics Conference Proceedings 3

- DOI: [10.52825/agripv.v3i.1357](https://doi.org/10.52825/agripv.v3i.1357)
- Verification: Crossref-verified | Access: open-access
- Backs:
  - the design premise this app is built on
    - "While some yield reduction is to be expected, resulting from less sunlight reaching the plant canopy and ground occupied by support structures, the generated electricity provides a low-risk supplemental income to farmers" (p. 1)
  - why an agrivoltaic array is built at a lower ground coverage ratio and a greater height than a solar farm
    - "agrivoltaic systems use a lower ground coverage ratio compared to normal solar farms and the PV panels are often mounted higher above the ground in order to facilitate the movement of agricultural equipment and to reduce the contrast between shaded and non-shaded areas" (p. 1)
  - the three Rutgers and NJAES installations the Bridgeton trials run on
- **Caveat:** A practice paper about designing, permitting and building three research installations. It reports no crop yield of its own and carries no evidence tier.

#### `dalpra2025-organic-tomato-shade`

Dal Pra, Aldo; Dainelli, Riccardo; Santoni, Margherita; Lanini, Giuseppe Mario; Di Serio, Annamaria; Zanotti, Davide; Greco, Antonino; Ronga, Domenico. (2025). *Impact of Different Shading Conditions on Processing Tomato Yield and Quality Under Organic Agrivoltaic Systems*. Horticulturae 11: 319

- DOI: [10.3390/horticulturae11030319](https://doi.org/10.3390/horticulturae11030319)
- Verification: Crossref-verified | Access: open-access, evidence tier **B**
- Backs:
  - processing tomato under trackers at a 41% ground coverage ratio
    - "In 2023, the results showed that A2 achieved a total yield of only 24.5% lower than FL, with a marketable yield reduction of just 6.5%, indicating its potential to maintain productivity under shaded conditions" (the abstract)
- **Caveat:** This entry rests on the publisher abstract and the Crossref record. The trial ran two seasons in northwest Italy under organic management. Its shading treatments are defined by ground coverage ratio and panel position, with no measured season-cumulative shade fraction.

#### `doedt2024-japan-legal`

Doedt, Christian; Tajima, Masayoshi; Iida, Tetsunari. (2024). *Agrivoltaics in Japan*. AgriVoltaics Conference Proceedings 1

- DOI: [10.52825/agripv.v1i.533](https://doi.org/10.52825/agripv.v1i.533)
- Verification: Crossref-verified | Access: open-access, evidence tier **C**
- Backs:
  - Japanese MAFF solar-sharing requires 80% of regional average yield and 2 m clearance
  - Japanese researchers themselves describe the 80% rule as lacking a scientific basis
- **Caveat:** Crossref records issue year 2024 and the short title 'Agrivoltaics in Japan'. A 2022 date and the longer title 'Agrivoltaics in Japan: a legal framework analysis' both circulate for it.

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
- **Caveat:** Single-authored by Christian Dupraz. The version of record is Agroforestry Systems 98:2679-2696 (2024), Crossref-registered online in 2023. The HAL deposit hal-04240227 is the preprint, served at https://hal.inrae.fr/hal-04240227 where hal.science doesn't serve it. A second preprint copy is at https://www.researchsquare.com/article/rs-3030967/v1. An 'INRAE (2023)' form with no author circulates for it.

#### `edf2023-photovoltaic-facility-gutter`

Van Iseghem, Mike; Poivey, Romain; Mallo, Etienne. (2023). *Photovoltaic facility*. Electricité de France US 11736061 B2

- URL: <https://patents.google.com/patent/US11736061B2/en>
- Verification: URL-verified | Access: public-domain
- Backs:
  - a gutter hung from a panel's edge on pivots so it swings level at any tilt, made to recover the water and to stop it concentrating on the crops beneath and gullying the soil
- **Caveat:** A patent describes a device and claims no measurement.

#### `elamri2018-rain-concentration`

Elamri, Yassin; Cheviron, Bruno; Mange, Annabelle; Dejean, Cyril; Liron, François; Belaud, Gilles. (2018). *Rain concentration and sheltering effect of solar panels on cultivated plots*. Hydrology and Earth System Sciences 22: 1285-1298

- DOI: [10.5194/hess-22-1285-2018](https://doi.org/10.5194/hess-22-1285-2018)
- Verification: Crossref-verified | Access: open-access, evidence tier **B**
- Backs:
  - rain shadow beneath panels and concentrated runoff at the drip line
  - Eq. 1, after Van Hamme 1992: the rain's angle from vertical is the wind speed over the raindrop's fall speed, so a panel's rain shadow lands its height times that ratio downwind, the projection the rain field uses
  - Eq. 3 carries Best 1950's drop-size distribution and Eq. 2 a terminal-speed drag balance at a drag coefficient of about 0.5, and the paper derives the rain's angle "from given rain intensity (I) and wind velocity (vw)", the chain the rain field follows hour by hour. The rain field reads Gunn and Kinzer's measured table in place of Eq. 2, which runs 2 to 60 percent fast below 2 mm, and the paper names no drop of the distribution, so splitting each hour's rain into three equal thirds is this app's own step
  - Table 1 takes a 1.5 mm drop as its reference "for simplicity", at the first mode of Fig. 4's count histogram of the drops leaving a panel edge, whose modes are 1.4, 3.8 and 9.3 mm, of which the paper says diameters above 7.5 mm "might be artifacts" of drops that size breaking up. The rain field carries 3.8 mm, where the mass of the stable drops sits
  - Eq. 4, after Van Hamme 1992: a panel facing the wind intercepts more than its plan area and one turned from it less, which the rain field gets by projecting the panel along the rain and taking the projected area as its catchment
  - Eq. 5 is the paper's own closed form for a drip's parabola, a constant wind push over a free-fall time, with the runoff film leaving the edge at the Manning speed for an n of 0.01 on glass (after Chow 1959). The rain field integrates that fall instead and uses Eq. 5 as a limiting check. The paper gives no film depth, speed or landing width, so the still-air strip of 0.2 m is this app's own derivation from its n, both of them from Sect. 2.2.1
  - the wetting of a panel before its runoff starts "is 0.2 mm at most" in the field at low tilts, where Sect. 4.1 puts the same threshold at "(approximately) 2 mm water depth" on the indoor rig. The rain field carries no retention term and follows the field figure
  - the rig: 2 m panels 5 m up in north to south rows 6.4 m apart, tilting to 50 degrees either way, read by 21 collectors of 0.3 m diameter in a line across a row
  - event 06, panels flat and a 0.78 m/s wind: one collector beside the drip line, in the zone the paper labels F4 on the sheltered side, took 11 times the open ground's rain by the text and about 16 times by Fig. 6c, at a coefficient of variation of 2.13 across the row
  - event 07, panels flat: the ground under the panels got 1.3 mm of a 3.0 mm rain and the drip edge 24 mm, three zones the soil moisture kept. That 24 mm in a 0.3 m collector is a 2 m panel's whole catchment draining to one edge, which is what the paper says a nominally flat panel does, since "the panels are never strictly flat"
  - indoors, below 20 degrees of tilt the runoff redistributes along the edge and below 5 degrees about 90 percent of a module's water leaves through an outlet 20 cm wide along its 1 m edge, so a flat panel's strip is beaded along the edge
  - the wind mattered more than the rain amount to where the water landed, and the panels' height less than their width and spacing, in a Morris sensitivity analysis of their model over one event, where the drop size came out "non-negligible but rather weak"
  - a tracker rotated out of the rain held the water on the ground to a coefficient of variation of 0.22 (event 11, 14.8 mm) where a flat panel gave 2.13 (event 06, 3.6 mm)
  - AVrain reproduced 11 events at a mean determination coefficient of 0.88, with regression coefficients above 1 in 7 of them, so the model overestimates, and about a quarter of its error sat near the drip line
- **Caveat:** The paper doesn't give its anemometer's height (it names a Young 05103-L and no more), and the collectors' readings are in its figures with two numbers in the text, so the rain field is compared with its numbers and never fitted to them. Its rig stands 5 m up where a garden row stands 1 to 3 m, and its own model is 2D at a one-minute step where this one places whole hours

#### `elamri2018-water-budget`

Elamri, Yassin; Cheviron, Bruno; Lopez, Jean-Marc; Dejean, Cyril; Belaud, Gilles. (2018). *Water budget and crop modelling for agrivoltaic systems: Application to irrigated lettuces*. Agricultural Water Management 208: 440-453

- DOI: [10.1016/j.agwat.2018.07.001](https://doi.org/10.1016/j.agwat.2018.07.001)
- Verification: Crossref-verified | Access: paywalled, evidence tier **B**
- Backs:
  - reduced evapotranspiration and irrigation demand under panel shade for irrigated lettuce
  - the drip-line edge zones of the plot held more soil moisture and ran cooler than its interior
  - a delay of 3 to 7 days of plant maturity under the panels, alongside a decrease of about 20% in plant water consumption
- **Caveat:** The 3 to 7 day figure comes from the published abstract and isn't quoted from the full text, which is paywalled. It's a modeling result. The abstract offers it as the alternative to a 10% yield decrease when irrigation is cut by 20%: 'it is possible to improve land use efficiency and water productivity at once, by reducing irrigation amounts by 20%, when tolerating a decrease of 10% in yield or, alternatively, a slight extension of the cropping cycle'. Unconfirmed in the full text, the figure can't back a model constant.

#### `garcia-chica2025-pv-rainwater-irrigation`

García-Chica, Antonio; Rodriguez-Perez, Angel Mariano; Caparros-Mancera, Julio Jose; Rodríguez-Gonzalez, Cesar Antonio; Chica, Rosa Maria. (2025). *Integrated photovoltaic system for rainwater collection and sustainable irrigation*. Irrigation Science 43: 1385-1395

- DOI: [10.1007/s00271-025-01028-7](https://doi.org/10.1007/s00271-025-01028-7)
- Verification: Crossref-verified | Access: open-access, evidence tier **C**
- Backs:
  - the built form of drip-line harvesting: gutters along the modules' low edges, a reservoir, a pump and a drip network, so the row goes where the light says and the water where the crop is
- **Caveat:** This entry rests on the abstract, without the full text.

#### `grommes2023-raytrace-vs-viewfactor`

Grommes, Eva-Maria; Schemann, Fabian; Klag, Felix; Nows, Sven; Blieske, Ulf. (2023). *Simulation of the irradiance and yield calculation of bifacial PV systems in the USA and Germany by combining ray tracing and view factor model*. EPJ Photovoltaics 14: 11

- DOI: [10.1051/epjpv/2023003](https://doi.org/10.1051/epjpv/2023003)
- Verification: Crossref-verified | Access: open-access
- Backs:
  - ray tracing costs 12.7-88 h vs 2-4 min for view-factor with no annual-aggregate accuracy gain
  - decision 2.2: ray tracing rejected as a runtime dependency

#### `hassanpour-adeh2018-oregon`

Hassanpour Adeh, Elnaz; Selker, John S.; Higgins, Chad W. (2018). *Remarkable agrivoltaic influence on soil moisture, micrometeorology and water-use efficiency*. PLOS ONE 13: e0203256

- DOI: [10.1371/journal.pone.0203256](https://doi.org/10.1371/journal.pone.0203256)
- Verification: Crossref-verified | Access: open-access, evidence tier **B**
- Backs:
  - soil moisture roughly doubled under panels at an Oregon pasture site
  - water-use efficiency gains under partial shade in a temperate maritime climate
- **Caveat:** A pasture/forage system. Its soil-moisture sign is opposite to Heggelbach's, so the soil-moisture effect has no single global sign.

#### `horowitz2020-dual-use-capital-costs`

Horowitz, Kelsey; Ramasamy, Vignesh; Macknick, Jordan; Margolis, Robert. (2020). *Capital Costs for Dual-Use Photovoltaic Installations: 2020 Benchmark for Ground-Mounted PV Systems with Pollinator-Friendly Vegetation, Grazing, and Crops*. National Renewable Energy Laboratory NREL/TP-6A20-77811

- DOI: [10.2172/1756713](https://doi.org/10.2172/1756713)
- Verification: Crossref-verified | Access: public-domain
- Backs:
  - the three PV + crops installed-cost benchmarks of Figure 3, p. 11: $1.83/Wdc vertical mount, $2.09/Wdc tracker stilt mount, $2.33/Wdc reinforced regular mount
  - the $1.53/Wdc typical fixed-tilt bare-ground baseline those three are a premium over
  - that the crop-mount premium sits in structural balance of system (the racking structure) and installation labor, with no premium on modules, inverters or soft costs
- **Caveat:** A 500 kWdc benchmark, a simple average across eight US states, in 2020 USD, installed cost only: no financing, no operations and maintenance, no revenue. The smallest system modeled anywhere in the report is 200 kW and cost per watt rises as system size falls, so a garden's few kilowatts sit below the bottom of the report's own size curve by an amount it never gives. It states verbatim (p. 9) that it has 'a limited number of input data points for nonconventional system designs in the PV + crop space, and so the costs associated with those applications are more uncertain'.

#### `kujawa2025-greenhouse-tomato-shade`

Kujawa, Anna; Kornas, Julian; Hanrieder, Natalie; Gonzalez Rodriguez, Sergio; Hristov, Lyubomir; Fernandez Solas, Alvaro; Wilbert, Stefan; Blanco, Manuel Jesus; Berzosa Alvarez, Leontina; Martinez Gallardo, Ana. (2025). *Tomato Yield Under Different Shading Levels in an Agrivoltaic Greenhouse in Southern Spain*. AgriEngineering 7: 178

- DOI: [10.3390/agriengineering7060178](https://doi.org/10.3390/agriengineering7060178)
- Verification: Crossref-verified | Access: open-access, evidence tier **B**
- Backs:
  - tomato yield falls with shading in a Mediterranean greenhouse
    - "The 30% and 50% shading zones resulted in 15% and 26% crop yield reductions, respectively" (the abstract)
  - the trade the authors draw from it
    - "A preliminary, theoretical analysis of potential revenues of the photovoltaic yield showed that reductions in crop yield can be overcompensated by the energy generated by the PV system" (the abstract)
- **Caveat:** This entry rests on the publisher abstract and the Crossref record. Opaque plastic sheets in a checkerboard on the roof of a raspa-y-amagado greenhouse in Almeria stand in for the modules. The shading is a roof cover ratio in a greenhouse, and no field array was tested.

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
  - season-cumulative relative shade ratio (RSR) is the correct yield driver, and instantaneous PPFD is the wrong quantity
  - RSR^2 term significant (p=0.0015): the linear '% shade = % yield loss' rule is statistically wrong
  - RSR x crop type interaction p<0.0001: crop group is a required model input
  - shade type (PV panels vs shade cloth vs nets) NOT significant, which licenses shade-cloth proxy data
    - "Further, no significant differences were found whether cloths, PV panels or nets were used for shading." (p. 5)
  - Table S2 relative-yield predictions and 95% confidence intervals per crop group per RSR level
  - yield anchors at 40% RSR: berries 114%, fruits 113%, fruity veg 102%, forages 93%, leafy veg 86%, grain legumes 50%, corn 45%
    - "Estimated yields at 40% RSR are 50% (CI 41 to 61%)." (p. 6)
    - "In contrast to these crops, berries, fruits and fruity vegetables benefit at 20% of RSR (114, 114 and 108%, respectively) as well as at 40% RSR (114, 113 and 102% estimated yield, for berries, fruits and fruity vegetables, respectively; CI at 40% RSR: 84 to 154%, 84 to 152% and 67 to 156%, respectively)." (p. 6)
    - "Forages are also estimated to have little susceptibility to RSR with an estimated yield of 103% at 20% RSR and 93% at 40% RSR (CI at 40% RSR: 75 to 117%)." (p. 6)
    - "For leafy vegetables the estimate for 40% RSR is 86% (CI 61 to 120%)." (p. 6)
  - all crop groups decline above ~50% RSR
    - "At around 50% of shading, all crops show susceptibility." (p. 7)
  - corn is the most shade-susceptible group, 45% of control at 40% RSR (95% CI 37-56%)
    - "For maize, the crop type with the strongest and disproportionately largest yield loss in response to RSR, the estimated yield at 40% RSR is 45% (95% CI 37 to 56%)." (p. 6)
  - per-group shade-benefit optima
  - greenhouse experiments were explicitly excluded from the meta-analysis
    - "Experiments from greenhouses as the system difference to AV was considered too large." (p. 3)
- **Caveat:** The per-group curve coefficients this app uses aren't published anywhere: they're absent from the article, from supplement MOESM1 (the Fig. S1 caption, Table S1 listing the 58 publications, and Table S2's predictions), from MOESM2 (the raw dataset) and from the Zenodo record 10.5281/zenodo.5716091 (two xlsx data files). The app recovered them algebraically from the 162 published Table S2 points and the paper's own model specification, and they reproduce those points to within 0.07 percentage points. They're this app's figures, never Laub's published coefficients. The 67.2 to 156.1% range for fruity vegetables at 40% RSR is a 95% confidence interval: Table S2's caption and the main text both say so, and the paper's prediction intervals are drawn as gray lines in Fig. 3 and never tabulated. Group sizes: berries n = 5, fruits n = 7, fruity vegetables n = 3, leafy vegetables n = 4, C3 cereals n = 10, corn n = 10, tubers and root crops n = 2, grain legumes n = 14, forages n = 11, from 428 data points (340 without controls), 58 studies and 38 crop species. The three groups a garden leans on most, root crops, fruity vegetables and leafy vegetables, are the thinnest in the paper. The authors write that 'uncertainties due to random plot scale effects are large, while at country or continental scales the mean response to shading, represented by the confidence intervals, is the more valid estimator', and a single garden is the plot scale they call the more uncertain one.

#### `marrou2013-lettuce-rue`

Marrou, Hélène; Wery, Jacques; Dufour, Lydie; Dupraz, Christian. (2013). *Productivity and radiation use efficiency of lettuces grown in the partial shade of photovoltaic panels*. European Journal of Agronomy 44: 54-66

- DOI: [10.1016/j.eja.2012.08.003](https://doi.org/10.1016/j.eja.2012.08.003)
- Verification: Crossref-verified | Access: paywalled, evidence tier **B**
- Backs:
  - lettuce maintains yield under partial panel shade through improved radiation interception efficiency
    - "Lettuce yield was maintained through an improved Radiation Interception Efficiency (RIE) in the shade, while Radiation Conversion Efficiency (RCE) did not change significantly" (p. 54)
  - no phenological delay in thermal time to harvest
    - "Thermal time was calculated from air temperature measurement above control plots (CPs): indeed no significant difference in cumulated thermal time was measured between FD, HD and the control plots, whatever reference temperature is used (crop or air temperature) (not shown)" (p. 57)
  - measured yields against the unshaded control: 58% in 2010 and 79% in 2011 under full density (RSR 50%), 81% in 2010 and 99% in 2011 under half density (RSR 30%)
  - one of the four studies inside Laub et al. 2022's leafy-vegetables curve, listed in Table S1 as 'Marrou et al., 2013b' with this paper's DOI, so a comparison against it is an in-sample check
- **Caveat:** This paper reports a null on cumulated thermal time and states no phenology delay. The '3-7 day phenology delay in shaded lettuce' belongs to elamri2018-water-budget. Laub's Table S1 labels this paper 2013b where this corpus labels it 2013a, so a reader checking the supplement meets a naming collision.

#### `marrou2013-microclimate`

Marrou, Hélène; Guilioni, Lydie; Dufour, Lydie; Dupraz, Christian; Wery, Jacques. (2013). *Microclimate under agrivoltaic systems: Is crop growth rate affected in the partial shade of solar panels?* Agricultural and Forest Meteorology 177: 117-132

- DOI: [10.1016/j.agrformet.2013.04.012](https://doi.org/10.1016/j.agrformet.2013.04.012)
- Verification: Crossref-verified | Access: paywalled, evidence tier **B**
- Backs:
  - panel shade alters air temperature, humidity and VPD only marginally relative to the light reduction
  - microclimate is a second-order modifier, and light is the first-order driver

#### `marrou2013-water-flows`

Marrou, Hélène; Dufour, Lydie; Wery, Jacques. (2013). *How does a shelter of solar panels influence water flows in a soil-crop system?* European Journal of Agronomy 50: 38-51

- DOI: [10.1016/j.eja.2013.05.004](https://doi.org/10.1016/j.eja.2013.05.004)
- Verification: Crossref-verified | Access: paywalled, evidence tier **B**
- Backs:
  - reduced soil evaporation and improved water-use efficiency under panels
  - rain shadow and drip-line redistribution of water under a panel array

#### `mata2026-rutgers-solanaceous`

Mata, Rebeca; Ward, Daniel L.; Wyenandt, Christian A. (2026). *First Year Observations of Growing Solanaceous Vegetable Crops in an Agrivoltaic System in New Jersey*. AgriVoltaics Conference Proceedings 4

- DOI: [10.52825/agripv.v4i.2829](https://doi.org/10.52825/agripv.v4i.2829)
- Verification: Crossref-verified | Access: open-access, evidence tier **B**
- Backs:
  - Solanaceae yield falls nearest the array in a temperate field trial
    - "Total yield of all crops studied was lower at the rows closer to the solar panels, especially on eggplants" (p. 1)
  - fruit quality doesn't follow yield
    - "while quality of the fruit, expressed as the marketable percentage of the harvested fruit, was higher closer to the modules row for eggplant, but was unaffected for tomatoes and peppers" (p. 1)
- **Caveat:** One season, 2024, the first of the trial. Eggplant 'Palermo', bell pepper 'Turnpike' and fresh-market tomato 'Red Deuce' under single-axis trackers at 2.4 m with 10 m row spacing, on raised plastic mulch beds with drip irrigation. The paper reports yield by distance from the array and states no light measurement, so no season-cumulative shade fraction can be paired with its yields, which is the number this app would need from it.

#### `meng2025-desert-pv-plants`

Meng, Ruibing; Meng, Zhongju; Ren, Xiaomeng; Cai, Jiale; Tong, Xufang. (2025). *Positive impacts of typical desert photovoltaic scenarios in China on the growth and physiology of sand-adapted plants*. Frontiers in Plant Science 15: 1515896

- DOI: [10.3389/fpls.2024.1515896](https://doi.org/10.3389/fpls.2024.1515896)
- Verification: Crossref-verified | Access: open-access, evidence tier **B**
- Backs:
  - Astragalus adsurgens under desert panels stood about 50 percent taller by August, with 51 to 87 percent more nitrogen and crude protein than plants in the open, in the more humid air the panels' shade keeps
- **Caveat:** One site, one species, one season. Soil moisture under and beside the panels was described and not measured.

#### `pataczek2023-wheat-drought`

Pataczek, Lisa; Weselek, Axel; Bauerle, Andrea; Högy, Petra. (2023). *Agrivoltaics mitigate drought effects in winter wheat*. Physiologia Plantarum 175: e14081

- DOI: [10.1111/ppl.14081](https://doi.org/10.1111/ppl.14081)
- Verification: Crossref-verified | Access: open-access, evidence tier **B**
- Backs:
  - the shade benefit for a C3 cereal is conditional on drought, reinforcing the water-limitation gate

#### `pv-magazine2026-solarroot`

(2026). *Mexican graduates develop agrivoltaic system with rainwater harvesting, smart irrigation*. pv magazine

- URL: <https://www.pv-magazine.com/2026/07/28/mexican-graduates-develop-agrivoltaic-system-with-rainwater-harvesting-smart-irrigation/>
- Archived: <https://web.archive.org/web/20260731101933/https://www.pv-magazine.com/2026/07/28/mexican-graduates-develop-agrivoltaic-system-with-rainwater-harvesting-smart-irrigation/>
- Verification: URL-verified | Access: public-domain
- Backs:
  - a 2026 proposal pairing rainwater harvesting from the modules with sensor-driven subsurface drip, with the module count, the crops and the water recovered all undisclosed and nothing measured
- **Caveat:** Trade press on a competition entry. Cited as the state of the idea, nothing in it is evidence.

#### `pvcase-agrivoltaics-guide`

(n.d.). *Agrivoltaics: the technical guide to integrated solar and agricultural systems*. PVcase

- URL: <https://pvcase.com/blog/agrivoltaics>
- Archived: <https://web.archive.org/web/20260616180311/https://pvcase.com/blog/agrivoltaics>
- Verification: URL-verified | Access: public-domain
- Backs:
  - design practice for the drip line: a gravel drip zone under the module edges, or trackers tilted during heavy rain to spread the water across the rows
- **Caveat:** A software vendor's guide. Practice, with no source of its own for the figures it gives.

#### `ravi2016-colocation-drylands`

Ravi, Sujith; Macknick, Jordan; Lobell, David; Field, Christopher; Ganesan, Karthik; Jain, Rishabh; Elchinger, Michael; Stoltenberg, Blaise. (2016). *Colocation opportunities for large solar infrastructures and agriculture in drylands*. Applied Energy 165: 383-392

- DOI: [10.1016/j.apenergy.2015.12.078](https://doi.org/10.1016/j.apenergy.2015.12.078)
- Verification: Crossref-verified | Access: paywalled, evidence tier **C**
- Backs:
  - the water used to clean solar panels is about what an aloe crop needs in a year, so the two can share it, and a life cycle analysis of the pairing returns more per cubic meter of water than either alone
- **Caveat:** A modeling and life cycle study of a hypothetical dryland colocation. The abstract says nothing about rainwater from the panels.

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
  - shade-intolerant C4 corn performance under a solar-sharing array
- **Caveat:** Single-site, small-plot. It's the only English-language Japanese solar-sharing crop study located with a verifiable DOI, which is itself a measure of how thin that literature is in English. A 'Nagashima 2015/2020' and an 'AIP Conf. Proc. 2361(1):030002 2021' circulate on the same topic and couldn't be resolved.

#### `tekie2024-drought-index-preprint`

Tekie, Sultan; Zainali, Sebastian; Zidane, Tekai Eddine Khalil; Ma Lu, Silvia; Guezgouz, Mohammed; Zhang, Jie; Amaducci, Stefano; Campana, Pietro Elia. (2024). *Unraveling the crop yield response under shading conditions through the deployment of a drought index*. EarthArXiv

- DOI: [10.31223/X5KT33](https://doi.org/10.31223/X5KT33)
- Verification: Crossref-verified | Access: open-access, evidence tier **C**
- Backs:
  - nothing in the shipping product, recorded solely as a negative control
- **Caveat:** This entry warns of a look-alike. The paper can't verify this app's numbers, because it's a different paper that merely cites Laub et al. 2022. Its Table 2 publishes its own regressions, including 'C3 Cereals Y=106.34-0.44X1', 'Berries Y=-13.36+2.22X1', 'Maize Y=61.82+0.25X1' and 'Grain Legumes Y=104.54-0.52X1'. Those are Tekie's coefficients and none of them is Laub's. Because it reuses Laub's crop categories and ranks highly in search, anyone re-deriving this app's crop-response curves is likely to hit it and mistake its equations for Laub's. It also isn't peer reviewed. The link https://eartharxiv.org/repository/object/7354/ returns 404, and the working URL is /repository/view/7354/.

#### `trommsdorff2021-heggelbach`

Trommsdorff, Max; Kang, Jinsuk; Reise, Christian; Schindele, Stephan; Bopp, Georg; Ehmann, Andrea; Weselek, Axel; Högy, Petra; Obergfell, Tabea. (2021). *Combining food and energy production: Design of an agrivoltaic system applied in arable and vegetable farming in Germany*. Renewable and Sustainable Energy Reviews 140: 110694

- DOI: [10.1016/j.rser.2020.110694](https://doi.org/10.1016/j.rser.2020.110694)
- Verification: Crossref-verified | Access: paywalled, evidence tier **B**
- Backs:
  - Heggelbach reference geometry: clearance height, row pitch and ground coverage ratio for a temperate arable APV system

#### `wang2024-desert-pv-ecology`

Wang, Yimeng; Liu, Benli; Xing, Yu; Peng, Huaiwu; Wu, Hui; Zhong, Jianping. (2024). *Ecological construction status of photovoltaic power plants in China's deserts*. Frontiers in Environmental Science 12: 1406546

- DOI: [10.3389/fenvs.2024.1406546](https://doi.org/10.3389/fenvs.2024.1406546)
- Verification: Crossref-verified | Access: open-access, evidence tier **C**
- Backs:
  - panels cleaned seven to eight times a year drop the cleaning water and the rain from their edges into drip lines, which raise soil moisture under the panels and carry the vegetation and biological crust of China's desert plants
  - the one setting found where the drip line under a panel edge is counted on to water what grows there
- **Caveat:** A survey of practice across desert plants, with the soil-moisture mechanism described and no controlled comparison of its own.

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
  - the sign of the shade effect flips between years, and the 2017 figures are the significant ones: fresh-matter tuber yield 23.6 t/ha under the array against 28.8 t/ha on the reference in 2017 (-18.2%, p = 0.005) and 25.5 against 23.0 t/ha in 2018 (+11%, p = 0.034), winter wheat grain yield 4.6 against 5.7 t/ha in 2017 (-18.7%, p = 0.03) and 4.7 against 4.6 t/ha in 2018 (+2.7%, not significant, p = 0.78). The 7.2% and 8% figures quoted elsewhere are two-year averages
  - decision 4: weather input must be a TMY, never a single year
  - temperate-site cooling under panels, which agrees in direction with the Arizona and Oregon results
    - "In both, 2017 (n = 132 days) and 2018 (n = 112 days) daily mean air temperature was significantly lower by about 1.1 °C on average. This effect was found across the whole year but was most prevalent during summertime. However, on 7 days in 2017 and 18 days in 2018, measured air temperature was higher under AV" (page 7)
  - reduced soil moisture at Heggelbach, contradicting the Arizona and Oregon increases, so the significant reductions fall in winter and the shoulder seasons and the authors attribute the difference from the irrigated sites to irrigation
    - "Soil moisture was significantly decreased under AV on 26 days in 2017 and on 133 days in 2018. In 2017, significant differences only occurred during wintertime from the end of November onwards. Similar results were observed in 2018, where daily mean soil moisture was significantly lower under AV until the middle of April and from the end of October onwards" (page 6)
  - crop development was slightly delayed under the array and the visible differences had gone by final harvest (page 12)
- **Caveat:** The sentence 'air temperature tended to be higher underneath the AV facility on days with high solar radiation or low wind speeds' is Weselek reporting Marrou et al. 2013b as a contrast to their own result, introduced by 'In contrast' and closed by 'the opposing results'. Reading it as Weselek's own finding inverts the sign of what they measured.

#### `widmer-strawberry-dli`

Widmer, Jocelyn; Ançay, André; Duchemin, Mathilde; Nardin, Gaël; Ackermann, Mathieu; Sutter, Louis. (2026). *Light Thresholds and Shading Effects on Strawberry and Raspberry Yields and Quality Under Agrivoltaics Systems in Switzerland*. AgriVoltaics Conference Proceedings 4

- DOI: [10.52825/agripv.v4i.2837](https://doi.org/10.52825/agripv.v4i.2837)
- Verification: Crossref-verified | Access: open-access, evidence tier **B**
- Backs:
  - strawberry minimum DLI 25 mol/m2/d and raspberry minimum DLI 15 mol/m2/d
    - "Based on the point where the standardized regression line crosses zero, the minimal DLI recommendation for maintaining average yield was 15 mol m-2 d-1 for raspberry and 25 mol m-2 d-1 for strawberries." (p. 4)
  - the shading that recommendation corresponds to, which is the only shading percentage in the paper and the basis for this app's 10% strawberry ceiling
    - "Based on our findings, we recommend a minimum DLI of 25 mol m-2 d-1 [...] corresponded to an estimated total shading of 10-30%, depending on the type of cover" (p. 7)
  - a positive linear relationship between DLI and both yield and sugar content in both species, stronger in strawberry
  - strawberry firmness declines at low DLI, and fruit weight and titratable acidity are unaffected in both species
  - the authority for splitting strawberry out of Laub's lumped berry group
- **Caveat:** The author list, the title and the year as printed are the ones above, and the version of record is 2026. A citation as 'Widmer, J., Ancay, A., Duchemin, C., Nardin, R., Ackermann, T., Sutter, G. (2024/2025). Strawberry and raspberry under agrivoltaics: minimum DLI requirements.' has four given names wrong, paraphrases the title and predates the version of record. The paper says its 25 mol/m2/d recommendation 'corresponded to an estimated total shading of 10-30%, depending on the type of cover', so a strawberry 'max design RSR 15-20%' has no basis in it. No shading or RSR percentage for raspberry appears anywhere in the paper, so a raspberry 'max design RSR 30-35%' has none either. The paper's 'minimum' has a narrow meaning. It's the DLI at which the standardized yield regression crosses zero, i.e. the DLI that yields the trial-average yield, chosen because 'AgriPV systems should not negatively impact' average yield. It's a design convention and isn't a physiological failure threshold or a fitted breakpoint. The fitted yield-DLI relationship is linear with no breakpoint. The study ran four years, with 21 case studies in Switzerland, including 13 AgriPV configurations at three sites. All were substrate-grown with fertigation under protective covers, and open-field cases were excluded. Transfer to in-ground garden beds is an extrapolation. It remains the only located source that expresses agrivoltaic limits directly as DLI, so the whole strawberry/berry DLI split rests on one conference paper.

#### `zainali2023-viewfactor`

Zainali, Sebastian; Ma Lu, Silvia; Stridh, Bengt; Avelin, Anders; Amaducci, Stefano; Colauzzi, Michele; Campana, Pietro Elia. (2023). *Direct and diffuse shading factors modelling for the most representative agrivoltaic system layouts*. Applied Energy 339: 120981

- DOI: [10.1016/j.apenergy.2023.120981](https://doi.org/10.1016/j.apenergy.2023.120981)
- Verification: Crossref-verified | Access: open-access
- Backs:
  - explicit polygon projection is required for finite arrays because edge rows dominate at garden scale
  - R^2 0.99-1.00 vs PVsyst, 0.3% daily error
  - decision 2.1: pvlib infinite_sheds 2-D view factor is a unit-test oracle only, never a user path
- **Caveat:** The 0.3% daily-error figure comes from a single clear-sky day. No published seasonal validation of any analytic ground-PAR model against distributed field PAR sensors was located. The arXiv preprint (2208.04886) confirms the R^2 0.99-1.00 range. The literal '0.3% daily error' couldn't be located anywhere in the accessible text, and the reported beam shading-factor MBE and RMSE are absolute quantities, so the 0.3% figure is untraced.

#### `zhang2025-tipping-points`

Zhang, Yuxin; Hendriks, Chantal; Uchanski, Mark; Page, Ellie. (2025). *Climatic and design tipping points in agrivoltaic crop production systems. A meta-analysis*. Agronomy for Sustainable Development 45: 69

- DOI: [10.1007/s13593-025-01060-z](https://doi.org/10.1007/s13593-025-01060-z)
- Verification: Crossref-verified | Access: open-access, evidence tier **B**
- Backs:
  - the paper's own headline tipping point is SYSTEM SIZE, ~2 ha (breakpoint 19,839 m2), beyond which microclimate temperature effects reverse
  - segmented regression on shading rate (n=155)
    - "Results from segmented regression lines revealed that at shading rates below 20%, crop yield shows no statistically significant difference from the control group (p = 0.084) [...] In the shading scale between 20% and 30% (which does not significantly change the microclimate), lower yield is observed (p < 0.01)" (p. 6)
  - the design ceiling this app's Solanaceae and cucurbits classes now carry
    - "To reduce the impact on the growth of crops, the shading caused by PV systems should preferably not exceed 20%, but such a strategy might sacrifice energy generation per unit of land" (p. 11)
  - where a shade benefit is observed at all
    - "Additionally, some variability is present in the climate conditions of the studies reporting yield increase, but in summary, the climates share some main features: hot summers, limited precipitation and (semi-) arid conditions (Fig. 9)" (p. 6)
  - the authors' design conclusion that 30-40% shading may support plant growth while maintaining reasonable solar output, and that shading above 50% isn't ideal from a crop standpoint
  - crop groupings used: corn shade-sensitive (n=17), beans partial (n=40), lettuce shade-tolerant (n=42)
- **Caveat:** The full text (21 pp, CC BY 4.0) is at https://link.springer.com/content/pdf/10.1007/s13593-025-01060-z.pdf. A '~50% shade tipping point' doesn't come from this paper. Its tipping point is ~2 ha of system size. The shade result is a separate segmented regression whose significant suppression band is 50-60%. The literal 50% figure belongs to Beck et al. 2012, which Zhang et al. cite. The paper has no per-group effect-size table with confidence intervals, so any such numbers cited to it are unsupportable. The segmented regression pools crops, and its three crop-resolved regressions are corn, beans and lettuce. No Solanaceae appears in any of them, so the 20% ceiling it supports is a design figure across crops with no tomato result behind it.

## Solar engineering

50 sources.

#### `arena2024-vertical-bifacial`

Arena, Rosario; Aneli, Stefano; Gagliano, Antonio; Tina, Giuseppe Marco. (2024). *Optimal Photovoltaic Array Layout of Agrivoltaic Systems Based on Vertical Bifacial Photovoltaic Modules*. Solar RRL 8

- DOI: [10.1002/solr.202300505](https://doi.org/10.1002/solr.202300505)
- Verification: Crossref-verified | Access: open-access
- Backs:
  - vertical bifacial agrivoltaic layout parameter ranges feeding the per-latitude geometry defaults
- **Caveat:** Crossref records online publication in 2023. Volume 8 is the 2024 issue year, so either year is defensible in a reference.

#### `bennett1982-refraction`

Bennett, G. G. (1982). *The Calculation of Astronomical Refraction in Marine Navigation*. Journal of Navigation 35: 255-259

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
  - PSA algorithm, accuracy <=0.5 arcmin, rejected in favor of SPA

#### `bright2019-engerer2-global`

Bright, Jamie M.; Engerer, Nicholas A. (2019). *Engerer2: Global re-parameterisation, update, and validation of an irradiance separation model at different temporal resolutions*. Journal of Renewable and Sustainable Energy 11: 033701

- DOI: [10.1063/1.5097014](https://doi.org/10.1063/1.5097014)
- Verification: Crossref-verified | Access: paywalled
- Backs:
  - decision 2.5: the globally re-parameterized Engerer2 coefficients used sub-hourly

#### `britton1976-par-ratio`

Britton, C. M.; Dodd, J. D. (1976). *Relationships of photosynthetically active radiation and shortwave irradiance*. Agricultural Meteorology 17: 1-7

- DOI: [10.1016/0002-1571(76)90080-7](https://doi.org/10.1016/0002-1571(76)90080-7)
- Verification: Crossref-verified | Access: paywalled
- Backs:
  - PAR/GHI energy ratio 0.41-0.45, the lower bound of the 0.42-0.50 range the default sits in

#### `cook-mccuen2013-solar-farm-hydrology`

Cook, Lauren M.; McCuen, Richard H. (2013). *Hydrologic Response of Solar Farms*. Journal of Hydrologic Engineering 18: 536-541

- DOI: [10.1061/(ASCE)HE.1943-5584.0000530](https://doi.org/10.1061/(ASCE)HE.1943-5584.0000530)
- Verification: Crossref-verified | Access: paywalled, evidence tier **C**
- Backs:
  - water leaving a panel's edge carries up to ten times the kinetic energy of rainfall and erodes the ground at the base of a row, so the drip strip is mulched and seedlings are set back from it
  - the panels themselves leave runoff volumes, peaks and times to peak unchanged, the ground cover under them decides the storm response
- **Caveat:** A modeling study with sensitivity analysis, no field measurement of its own.

#### `dobos2014-pvwatts-v5`

Dobos, Aron P. (2014). *PVWatts Version 5 Manual*. National Renewable Energy Laboratory NREL/TP-6A20-62641

- URL: <https://www.nrel.gov/docs/fy14osti/62641.pdf>
- Verification: URL-verified | Access: public-domain, evidence tier **B**
- Backs:
  - the DC power model Pdc = (Gpoa/1000) * Pdc0 * (1 + gamma * (Tcell - 25))
  - the inverter part-load efficiency curve
  - the default loss stack: soiling, mismatch, wiring, connections, light-induced degradation, nameplate, availability
- **Caveat:** An NREL technical report with no DOI. Its default loss percentages are generic industry values and weren't measured for any particular installation.

#### `engerer2015-engerer2`

Engerer, N. A. (2015). *Minute resolution estimates of the diffuse fraction of global irradiance for southeastern Australia*. Solar Energy 116: 215-237

- DOI: [10.1016/j.solener.2015.04.012](https://doi.org/10.1016/j.solener.2015.04.012)
- Verification: Crossref-verified | Access: paywalled
- Backs:
  - the Engerer2 sub-hourly separation model

#### `erbs1982-diffuse-fraction`

Erbs, D. G.; Klein, S. A.; Duffie, J. A. (1982). *Estimation of the diffuse radiation fraction for hourly, daily and monthly-average global radiation*. Solar Energy 28: 293-302

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
- **Caveat:** Wiley paywalls the full text. The model form and coefficients are taken from pvlib and the Sandia PVPMC modeling guide, which state them in full. The coefficients are typical values for a module family and weren't measured for any particular module a user selects.

#### `faust2018-dli-maps`

Faust, James E.; Logan, Joanne. (2018). *Daily Light Integral: A Research Review and High-resolution Maps of the United States*. HortScience 53: 1250-1257

- DOI: [10.21273/HORTSCI13144-18](https://doi.org/10.21273/HORTSCI13144-18)
- Verification: Crossref-verified | Access: paywalled, evidence tier **C**
- Backs:
  - ambient DLI reference maps for the contiguous United States, contoured in 5 mol/m2/d bins from 0-5 through 60-65
  - maximum mapped DLI range 55-60 mol/m2/d in the southwestern US May-July, with a 60-65 band appearing in the southwest in June only
  - the paper's own DLI conversion factor 0.0072664 mol (400-700 nm) per Wh (400-2700 nm), assuming 45% of the solar spectrum is PAR and 4.48 umol/J
- **Caveat:** The ASHS page draws the article in with its own JavaScript, so the paper is open to read and absent from the raw HTML. The paper contains no per-crop DLI table. It's a narrative review organized by crop group, so it can't back any per-crop DLI minimum. The '10-12 mol/m2/d minimum' often attributed to it originates in Purdue HO-238-W (torres-lopez-purdue-dli), scoped there to shade-intolerant floriculture crops at the finish stage. The closest thing to a threshold in Faust & Logan is a worked example: 'If 5 mol/m2/d is considered to be the lowest acceptable DLI for a greenhouse crop...'. The paper uses 4.48 umol/J where Decision Record 6 uses McCree's in-band 4.57. The composite 2.06 umol/J figure is ambiguous until it names the constant it derives from.

#### `grena2012-sunpos`

Grena, Roberto. (2012). *Five new algorithms for the computation of sun position from 2010 to 2110*. Solar Energy 86: 1323-1337

- DOI: [10.1016/j.solener.2012.01.024](https://doi.org/10.1016/j.solener.2012.01.024)
- Verification: Crossref-verified | Access: paywalled
- Backs:
  - candidate solar position algorithm family evaluated against SPA

#### `gueymard2016-separation-validation`

Gueymard, Christian A.; Ruiz-Arias, Jose A. (2016). *Extensive worldwide validation and climate sensitivity analysis of direct irradiance predictions from 1-min global irradiance*. Solar Energy 128: 1-30

- DOI: [10.1016/j.solener.2015.10.010](https://doi.org/10.1016/j.solener.2015.10.010)
- Verification: Crossref-verified | Access: paywalled
- Backs:
  - the comparative ranking that justifies the DIRINT / Engerer2 / Erbs ordering

#### `gueymard2018-solar-constant`

Gueymard, Christian A. (2018). *A reevaluation of the solar constant based on a 42-year total solar irradiance time series and a reconciliation of spaceborne observations*. Solar Energy 168: 2-9

- DOI: [10.1016/j.solener.2018.04.001](https://doi.org/10.1016/j.solener.2018.04.001)
- Verification: Crossref-verified | Access: paywalled
- Backs:
  - solar constant value used for extraterrestrial irradiance and the clearness index

#### `hay1980-transposition`

Hay, John E.; Davies, John A. (1980). *Calculation of the solar radiation incident on an inclined surface*. Proceedings of the First Canadian Solar Radiation Data Workshop 59-72

- Verification: UNVERIFIED | Access: paywalled
- Backs:
  - Hay-Davies anisotropic transposition, a candidate rejected in favor of Perez 1990
- **Caveat:** Workshop proceedings. No DOI located and no authoritative online copy verified.

#### `jacovides2003-par-mediterranean`

Jacovides, C. P.; Tymvios, F. S.; Asimakopoulos, D. N. (2003). *Global photosynthetically active radiation and its relationship with global solar radiation in the Eastern Mediterranean basin*. Theoretical and Applied Climatology 74: 227-233

- DOI: [10.1007/s00704-002-0685-5](https://doi.org/10.1007/s00704-002-0685-5)
- Verification: Crossref-verified | Access: paywalled
- Backs:
  - corroborating regional PAR/GHI ratio measurements
- **Caveat:** The DOI is supplied here. The surname appears as Tymvios in this record and Timvios in the 2004 record. Same author.

#### `jacovides2004-par-cyprus`

Jacovides, C. P.; Timvios, F. S.; Papaioannou, G.; Asimakopoulos, D. N.; Theofilou, C. M. (2004). *Ratio of PAR to broadband solar radiation measured in Cyprus*. Agricultural and Forest Meteorology 121: 135-140

- DOI: [10.1016/j.agrformet.2003.10.001](https://doi.org/10.1016/j.agrformet.2003.10.001)
- Verification: Crossref-verified | Access: paywalled
- Backs:
  - measured PAR/GHI 0.451 winter to 0.456 summer, annual mean ~0.454
  - PAR/GHI rises to 0.501 hourly under overcast sky, motivating the 0.42-0.50 adjustable range

#### `kasten1989-airmass`

Kasten, Fritz; Young, Andrew T. (1989). *Revised optical air mass tables and approximation formula*. Applied Optics 28: 4735-4738

- DOI: [10.1364/AO.28.004735](https://doi.org/10.1364/AO.28.004735)
- Verification: Crossref-verified | Access: paywalled
- Backs:
  - relative optical air mass consumed by the Perez transposition model

#### `khan2019-ground-sculpting`

Khan, M. Ryyan; Sakr, Enas; Sun, Xingshu; Bermel, Peter; Alam, Muhammad A. (2019). *Ground sculpting to enhance energy yield of vertical bifacial solar farms*. Applied Energy 241: 592-598

- DOI: [10.1016/j.apenergy.2019.01.168](https://doi.org/10.1016/j.apenergy.2019.01.168)
- Verification: Crossref-verified | Access: paywalled
- Backs:
  - ground-surface shaping effects on bifacial gain and on the ground light distribution
- **Caveat:** The authors are Khan, Sakr, Sun, Bermel and Alam. No Patel appears on the author list, though 'Patel, M. T. et al. (2018). Ground sculpting to enhance vertical bifacial solar farm output. arXiv:1806.06666' circulates for this work. The version of record is Applied Energy 241:592-598 (2019) under a slightly different title, and it supersedes that preprint.

#### `king2004-sapm`

King, David L.; Boyson, William E.; Kratochvil, Jay A. (2004). *Photovoltaic Array Performance Model*. Sandia National Laboratories SAND2004-3535

- URL: <https://www.osti.gov/biblio/919131>
- Archived: <https://web.archive.org/web/20260930014408/https://www.osti.gov/biblio/919131>
- Verification: URL-verified | Access: public-domain, evidence tier **B**
- Backs:
  - the alternative cell-temperature model, used to measure the model-form contribution to the LER energy band by running the chain both ways
- **Caveat:** Sandia technical report, no DOI

#### `king2007-sandia-inverter`

King, David L.; Gonzalez, Sigifredo; Galbraith, Gary M.; Boyson, William E. (2007). *Performance Model for Grid-Connected Photovoltaic Inverters*. Sandia National Laboratories SAND2007-5036

- URL: <https://www.osti.gov/biblio/920449>
- Archived: <https://web.archive.org/web/20260902165401/https://www.osti.gov/biblio/920449>
- Verification: URL-verified | Access: public-domain, evidence tier **B**
- Backs:
  - the named upgrade path from the PVWatts inverter efficiency curve to a full inverter performance model
- **Caveat:** This app doesn't implement this model, and it's recorded only as the intended upgrade. This app currently uses the PVWatts curve, so none of its numbers come from this model.

#### `korczynski2002-dli-maps`

Korczynski, Paul C.; Logan, Joanne; Faust, James E. (2002). *Mapping Monthly Distribution of Daily Light Integrals across the Contiguous United States*. HortTechnology 12: 12-16

- DOI: [10.21273/HORTTECH.12.1.12](https://doi.org/10.21273/HORTTECH.12.1.12)
- Verification: Crossref-verified | Access: paywalled, evidence tier **C**
- Backs:
  - earlier monthly ambient DLI maps for the contiguous United States

#### `liu1963-flat-plate`

Liu, Benjamin Y. H.; Jordan, Richard C. (1963). *The long-term average performance of flat-plate solar-energy collectors*. Solar Energy 7: 53-74

- DOI: [10.1016/0038-092X(63)90006-9](https://doi.org/10.1016/0038-092X(63)90006-9)
- Verification: Crossref-verified | Access: paywalled
- Backs:
  - isotropic sky transposition baseline against which Perez 1990 is compared

#### `loutzenhiser2007-transposition-validation`

Loutzenhiser, P. G.; Manz, H.; Felsmann, C.; Strachan, P. A.; Frank, T.; Maxwell, G. M. (2007). *Empirical validation of models to compute solar irradiance on inclined surfaces for building energy simulation*. Solar Energy 81: 254-267

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

Maxwell, Eugene L. (1987). *A Quasi-Physical Model for Converting Hourly Global Horizontal to Direct Normal Insolation*. Solar Energy Research Institute SERI/TR-215-3087

- Verification: UNVERIFIED | Access: public-domain
- Backs:
  - the DISC model, ancestor of DIRINT
- **Caveat:** No DOI located and the report wasn't fetched. The bibliographic details follow the pvlib documentation.

#### `mccree1971-action-spectrum`

McCree, K. J. (1971). *The action spectrum, absorptance and quantum yield of photosynthesis in crop plants*. Agricultural Meteorology 9: 191-216

- DOI: [10.1016/0002-1571(71)90022-7](https://doi.org/10.1016/0002-1571(71)90022-7)
- Verification: Crossref-verified | Access: paywalled
- Backs:
  - the 400-700 nm definition of PAR from the crop photosynthesis action spectrum
  - the spectral basis for 4.57 umol/J in-band photon conversion
- **Caveat:** Crossref records issued year 1971, Agricultural Meteorology vol. 9. Both 1971 and 1972 circulate in the literature, and 1971 is the registered record.

#### `mccree1972-par-definitions`

McCree, K. J. (1972). *Test of current definitions of photosynthetically active radiation against leaf photosynthesis data*. Agricultural Meteorology 10: 443-453

- DOI: [10.1016/0002-1571(72)90045-3](https://doi.org/10.1016/0002-1571(72)90045-3)
- Verification: Crossref-verified | Access: paywalled
- Backs:
  - validation that a photon-based PAR definition outperforms energy-based definitions
- **Caveat:** This is a second, separate McCree paper. It and the action-spectrum paper both circulate as 'McCree (1972)'. They're different articles with different DOIs, and one bibliography entry can't stand for both.

#### `meek1984-par-ratio`

Meek, D. W.; Hatfield, J. L.; Howell, T. A.; Idso, S. B.; Reginato, R. J. (1984). *A Generalized Relationship between Photosynthetically Active Radiation and Solar Radiation*. Agronomy Journal 76: 939-945

- DOI: [10.2134/agronj1984.00021962007600060018x](https://doi.org/10.2134/agronj1984.00021962007600060018x)
- Verification: Crossref-verified | Access: paywalled
- Backs:
  - PAR = 0.45 x GHI by energy, the product default
  - derived from paired year-long PAR/shortwave records at Fresno CA over the 0.285-2.8 um band

#### `michalsky1988-almanac`

Michalsky, Joseph J. (1988). *The Astronomical Almanac's algorithm for approximate solar position (1950-2050)*. Solar Energy 40: 227-235

- DOI: [10.1016/0038-092X(88)90045-X](https://doi.org/10.1016/0038-092X(88)90045-X)
- Verification: Crossref-verified | Access: paywalled
- Backs:
  - candidate low-cost solar position algorithm, rejected on accuracy grounds

#### `mulla2024-solar-farm-soil-moisture`

Mulla, David; Galzki, Jake; Hanson, Aaron; Simunek, Jirka. (2024). *Measuring and modeling soil moisture and runoff at solar farms using a disconnected impervious surface approach*. Vadose Zone Journal 23: e20335

- DOI: [10.1002/vzj2.20335](https://doi.org/10.1002/vzj2.20335)
- Verification: Crossref-verified | Access: open-access, evidence tier **B**
- Backs:
  - a panel row treated as a disconnected impervious surface that sheds its water to the ground at its drip edge, which is the treatment this app's rain field gives every row
- **Caveat:** This entry rests on the abstract and the title, without the full text.

#### `perez1990-transposition`

Perez, Richard; Ineichen, Pierre; Seals, Robert; Michalsky, Joseph; Stewart, Ronald. (1990). *Modeling daylight availability and irradiance components from direct and global irradiance*. Solar Energy 44: 271-289

- DOI: [10.1016/0038-092X(90)90055-H](https://doi.org/10.1016/0038-092X(90)90055-H)
- Verification: Crossref-verified | Access: paywalled
- Backs:
  - the Perez transposition coefficient set (Table 6), the allsitescomposite1990 model
  - decision 2.3: one shared sky model for plane-of-array transposition and the ground DLI map
  - chosen because it's the same sky model behind Radiance gendaymtx

#### `perez1992-dirint`

Perez, Richard; Ineichen, Pierre; Maxwell, Eugene; Seals, Robert; Zelenka, Antoine. (1992). *Dynamic global-to-direct irradiance conversion models*. ASHRAE Transactions 98: 354-369

- Verification: UNVERIFIED | Access: paywalled
- Backs:
  - decision 2.5: DIRINT as the recommended hourly separation model
- **Caveat:** No DOI located, and ASHRAE Transactions volumes aren't comprehensively deposited in Crossref. The author list here follows the pvlib documentation and is broader than the 'Perez, R. et al.' short form.

#### `perez1993-sky-luminance`

Perez, Richard; Seals, Robert; Michalsky, Joseph. (1993). *All-weather model for sky luminance distribution - Preliminary configuration and validation*. Solar Energy 50: 235-245

- DOI: [10.1016/0038-092X(93)90017-I](https://doi.org/10.1016/0038-092X(93)90017-I)
- Verification: Crossref-verified | Access: paywalled
- Backs:
  - the all-weather sky luminance distribution used by Radiance gendaymtx and therefore by this app's cumulative-sky pipeline
- **Caveat:** Crossref also holds a near-identical record 10.1016/0038-092X(93)90157-J ('To all-weather model...', Solar Energy 51:423). Cite the 50:235-245 record.

#### `radiance-gendaymtx`

Ward, Greg. (n.d.). *gendaymtx - generate an annual Perez sky matrix from a weather tape*. Radiance manual pages

- URL: <https://www.radiance-online.org/learning/documentation/manual-pages/pdfs/gendaymtx.pdf>
- Archived: <https://web.archive.org/web/20250825022934/https://www.radiance-online.org/learning/documentation/manual-pages/pdfs/gendaymtx.pdf>
- Verification: URL-verified | Access: open-access
- Backs:
  - the cumulative-sky daylight-coefficient method this app's GPU pipeline reimplements
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
  - the normative SPA computation chain this app's implementation follows step by step
  - the algorithm ported into pvlib/spa.py (BSD-3), which this app re-ports
- **Caveat:** This entry is the January 2008 revision, which supersedes the 2003 original. The 2004 article text carries a journal corrigendum (10.1016/j.solener.2007.01.003), so an implementation derived from that text alone is uncorrected.

#### `reindl1990-tilted-surface`

Reindl, D. T.; Beckman, W. A.; Duffie, J. A. (1990). *Evaluation of hourly tilted surface radiation models*. Solar Energy 45: 9-17

- DOI: [10.1016/0038-092X(90)90061-G](https://doi.org/10.1016/0038-092X(90)90061-G)
- Verification: Crossref-verified | Access: paywalled
- Backs:
  - Reindl transposition, a candidate rejected in favor of Perez 1990

#### `reinhart2001-radiance-validation`

Reinhart, Christoph F.; Walkenhorst, Oliver. (2001). *Validation of dynamic RADIANCE-based daylight simulations for a test office with external blinds*. Energy and Buildings 33: 683-697

- DOI: [10.1016/S0378-7788(01)00058-5](https://doi.org/10.1016/S0378-7788(01)00058-5)
- Verification: Crossref-verified | Access: paywalled
- Backs:
  - decision 5: Reinhart MF:2 = 577-patch sky subdivision for the production cumulative-sky pass
  - validity of the daylight-coefficient method

#### `sager1988-photon-conversion`

Sager, J. C.; Smith, W. O.; Edwards, J. L.; Cyr, K. L. (1988). *Photosynthetic Efficiency and Phytochrome Photoequilibria Determination Using Spectral Data*. Transactions of the ASAE 31: 1882-1889

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
- **Caveat:** It describes the NSRDB and the Physical Solar Model through v3. It doesn't describe PSM v4.0.0, the model behind the GOES v4 endpoints this app now calls. PSM v3.2.2 and its TMY product were retired and replaced by GOES Aggregated and GOES TMY v4.0.0. NLR still names this paper as the foundational NSRDB reference, so it's cited for the database alone.

#### `spencer1971-fourier`

Spencer, J. W. (1971). *Fourier series representation of the position of the sun*. Search 2: 172

- Verification: UNVERIFIED | Access: paywalled
- Backs:
  - low-order declination approximation, retained only for comparison
- **Caveat:** No DOI was located. Search 2(5):172 is a one-page note, widely cited and rarely read. Its bibliographic details here are inherited from secondary citation.

#### `stallknecht2025-vce-dli`

Stallknecht, Eric. (2025). *Calculating and Using Daily Light Integral (DLI): An Introductory Guide*. Virginia Cooperative Extension SPES-720NP

- URL: <https://www.pubs.ext.vt.edu/content/dam/pubs_ext_vt_edu/spes/spes-720/SPES-720.pdf>
- Archived: <https://web.archive.org/web/20260307184940/https://www.pubs.ext.vt.edu/content/dam/pubs_ext_vt_edu/spes/spes-720/SPES-720.pdf>
- Verification: URL-verified | Access: public-domain, evidence tier **C**
- Backs:
  - DLI calculation guidance underpinning the DLI classification bands
  - Table 3 prints 14 to 20 mol/m2/d for spinach, the spinach row's target band
    - "Table 3. Suggested average daily light integral (DLI; mol/m2/d) for example crops. [...] Spinach 14-20" (Table 3, p. 3)

#### `szarek2026-high-latitude-vertical`

Szarek, Kamil; Jouttijärvi, Sami; Karttunen, Ville; Hynnä, Aleksi. (2026). *Performance evaluation of high latitude agrivoltaic systems with vertically mounted bifacial panels*. Applied Energy 402: 127022

- DOI: [10.1016/j.apenergy.2025.127022](https://doi.org/10.1016/j.apenergy.2025.127022)
- Verification: Crossref-verified | Access: open-access
- Backs:
  - high-latitude vertical bifacial array performance for the per-latitude-band geometry defaults
- **Caveat:** The paper circulates with neither authors nor DOI. Both are supplied here.

#### `thevenard2006-ground-reflectivity`

Thevenard, D.; Haddad, K. (2006). *Ground reflectivity in the context of building energy simulation*. Energy and Buildings 38: 972-980

- DOI: [10.1016/j.enbuild.2005.11.007](https://doi.org/10.1016/j.enbuild.2005.11.007)
- Verification: Crossref-verified | Access: paywalled
- Backs:
  - ground reflectivity is strongly seasonal wherever snow lies, so a single annual albedo misstates both the ground-reflected component of the plane-of-array irradiance and the rear-side gain through the winter
- **Caveat:** The paper is paywalled, and its full text hasn't been read. It's cited for the established result that snow cover dominates monthly ground reflectivity at mid and high latitudes. It backs no particular snow albedo. The figure this app uses is its own, and the renderer shares it, so the picture and the number can't disagree.

#### `torres-lopez-purdue-dli`

Torres, Ariana P.; Lopez, Roberto G. (n.d.). *Measuring Daily Light Integral in a Greenhouse*. Commercial Greenhouse Production HO-238-W

- URL: <https://www.extension.purdue.edu/extmedia/ho/ho-238-w.pdf>
- Archived: <https://web.archive.org/web/20260914214324/https://www.extension.purdue.edu/extmedia/ho/ho-238-w.pdf>
- Verification: URL-verified | Access: public-domain, evidence tier **C**
- Backs:
  - worked DLI integration example: 500 umol/m2/s over a 12 h photoperiod = 21.6 mol/m2/d
  - the 10-12 mol/m2/d minimum DLI figure
    - "we recommend that greenhouse growers provide a minimum of 10 to 12 mol/m2/d of light during the finish stage to produce many shade-intolerant floriculture crops" (p. 3)
  - propagation DLI 4-11 mol/m2/d during callusing and root development accelerates petunia and New Guinea impatiens propagation
  - greenhouse DLI seldom exceeds 25 mol/m2/d because of glazing, superstructure and season
- **Caveat:** Published outside a peer-reviewed journal. It's the origin of the '10-12 mol/m2/d minimum' commonly attributed to Faust & Logan 2018, which contains no such figure. The source scopes the 10-12 figure to shade-intolerant floriculture crops at the finish stage in a greenhouse. It sets no threshold for vegetables or for field growing. Using it as the Solanaceae minimum in Decision Record 6 is an extrapolation the source doesn't make.

#### `torres-purdue-dli-b`

Torres, Ariana P.; Currey, Christopher J.; Lopez, Roberto G.; Faust, James E. (2010). *Measuring Daily Light Integral (DLI)*. Commercial Greenhouse Production HO-238-B-W

- URL: <https://www.extension.purdue.edu/extmedia/ho/ho-238-b-w.pdf>
- Archived: <https://web.archive.org/web/20260907111331/https://www.extension.purdue.edu/extmedia/ho/ho-238-b-w.pdf>
- Verification: URL-verified | Access: public-domain, evidence tier **C**
- Backs:
  - DLI measurement guidance for the curated crop table
- **Caveat:** Purdue HO-238-B-W and HO-238-W are different publications with different author lists, and they're easily conflated.

#### `tregenza1987-sky-subdivision`

Tregenza, P. R. (1987). *Subdivision of the sky hemisphere for luminance measurements*. Lighting Research & Technology 19: 13-14

- DOI: [10.1177/096032718701900103](https://doi.org/10.1177/096032718701900103)
- Verification: Crossref-verified | Access: paywalled
- Backs:
  - decision 5: Tregenza 145-patch sky discretization, retained in `skydome.ts` for coarse tests

#### `yavari2022-solar-farm-hydrology-review`

Yavari, Rouhangiz; Zaliwciw, Demetrius; Cibin, Raj; McPhillips, Lauren. (2022). *Minimizing environmental impacts of solar farms: a review of current science on landscape hydrology and guidance on stormwater management*. Environmental Research: Infrastructure and Sustainability 2: 032002

- DOI: [10.1088/2634-4505/ac76dd](https://doi.org/10.1088/2634-4505/ac76dd)
- Verification: Crossref-verified | Access: open-access, evidence tier **B**
- Backs:
  - concentrated runoff at the drip edge of panel rows and bare ground under them are the erosion and stormwater risks a solar farm adds, and vegetated ground under the rows is the remedy the literature agrees on

## Horticulture & crop physiology

369 sources.

#### `adhikary2025-clubroot-review`

Adhikary, Dinesh; Islam, Md. Rashidul; Adhikari, Bikram; Chapara, Venkata. (2025). *Clubroot Disease: 145 Years Post-Discovery, Challenges, and Opportunities*. Annual Review of Phytopathology 63: 603-626

- DOI: [10.1146/annurev-phyto-121323-020949](https://doi.org/10.1146/annurev-phyto-121323-020949)
- Verification: Crossref-verified | Access: open-access, evidence tier **A**
- Backs:
  - clubroot resting spores survive up to 20 years with a sharp early decline
  - crop rotation as a hard constraint in place of a soft companion score
- **Caveat:** The full text is behind annualreviews.org and unread. The open abstract says only that resting spores 'persist in the soil for several years'. The '20 years with a sharp early decline' figure is common in extension literature and is NOT confirmed anywhere in this review's accessible text. This entry stands for the review's existence and carries no 20-year number until someone reads the full text.

#### `agriculture-canada-1992-alternative-crops-prairies`

Kiehn, Ferdinand A.; Reimer, Mel. (1992). *Alternative crops for the prairies (Agriculture Canada Publication 1887/E)*. Agriculture Canada, Research Station Mordon, Manitoba (Communications Branch, Ottawa)

- URL: <https://archive.org/details/alternativecrops00kieh>
- Verification: URL-verified | Access: public-domain, evidence tier **C**
- Backs:
  - crosne spacing
    - "Plant in early May, in rows 45 cm apart for easy mechanical weed control, and allow 15-30 cm within rows." (Entry 'Japanese artichoke' (the name used for Stachys affinis), 'Cultural information', Planting, page 24)
  - crosne height
    - "The plant is 30-45 cm high, usually 34-40 cm." (Entry 'Japanese artichoke', Introduction, page 24)
  - crosne daysToMaturity
    - "Harvest Japanese artichokes 100-130 days after planting by mechanically lifting the tubers out of the ground." (Entry 'Japanese artichoke', Harvesting, page 25)
  - crosne coldLimit
    - "The tubers also overwinter extremely well in the field as long as they are planted in a well-drained area." (Entry 'Japanese artichoke', Harvesting, page 25)
  - tepary-bean spacing
    - "For effective weed control with row crop equipment, seed at a rate of 25-35 kg/ha in rows 60-90 cm apart." (Entry 'Tepary bean', 'Cultural information', Planting, page 45)
  - tepary-bean height
    - "The plant is 35-50 cm high, with vines that receive ample moisture and that measure up to 115 cm long." (Entry 'Tepary bean', Introduction, page 45)
- **Caveat:** Published outside a peer-reviewed journal.

#### `akepic-non-native-plant-species-list`

Alaska Center for Conservation Science, University of Alaska Anchorage. (n.d.). *Non-Native Plant Species List*. Alaska Center for Conservation Science (Alaska Exotic Plants Information Clearinghouse, AKEPIC)

- URL: <https://accs.uaa.alaska.edu/invasive-species/non-native-plant-species-list/>
- Archived: <https://web.archive.org/web/20260921110506/https://accs.uaa.alaska.edu/invasive-species/non-native-plant-species-list/>
- Verification: URL-verified | Access: public-domain, evidence tier **C**
- Backs:
  - dandelion invasiveStatus
    - "Taraxacum officinale F.H. Wigg. TAOF common dandelion 58 Asteraceae 1916 Alaska" (AKEPIC 'Non-Native Plant Species List' table (Alaska Center for Conservation Science), columns Scientific Name, Symbol,)
- **Caveat:** Published outside a peer-reviewed journal.

#### `allen1998-fao56`

Allen, Richard G.; Pereira, Luis S.; Raes, Dirk; Smith, Martin. (1998). *Crop evapotranspiration: Guidelines for computing crop water requirements*. Food and Agriculture Organization of the United Nations FAO Irrigation and Drainage Paper 56

- URL: <https://www.fao.org/4/x0490e/x0490e00.htm>
- Archived: <https://web.archive.org/web/20261013002639/https://www.fao.org/4/x0490e/x0490e00.htm>
- Verification: UNVERIFIED | Access: open-access, evidence tier **A**
- Backs:
  - crop coefficients (Table 22) and rooting depths for the soil/water stage of the recommendation pipeline
- **Caveat:** URL not independently fetched.

#### `andrews2021-osu-em9305-gdd`

Andrews, Nick; Coop, Leonard; Stoven, Heather; Noordijk, Heidi; Heinrich, Aaron. (2021). *Vegetable degree-day models: An introduction for farmers and gardeners*. Oregon State University Extension Service EM 9305

- URL: <https://extension.oregonstate.edu/sites/extd8/files/catalog/auto/EM9305.pdf>
- Archived: <https://web.archive.org/web/20260314052805/https://extension.oregonstate.edu/sites/extd8/files/catalog/auto/EM9305.pdf>
- Verification: URL-verified | Access: public-domain, evidence tier **B**
- Backs:
  - OSU Croptime coverage, which is the count behind ledger row A16
    - "Croptime currently hosts 29 vegetable DD models and three summer annual weed models" (p. 5)
  - published lower and upper development thresholds for six vegetables: broccoli 32/70 F, cucumber 50/90 F, snap bean 40/90 F, sweet corn 44 F fresh market or 50 F processing with an 86 F upper, sweet pepper 52/100 F, tomato 45/92 F
  - cultivar-level degree-days to named growth stages and to harvest, with per-cultivar model accuracy in days and the number of data sets behind each
  - the case for GDD-based maturity over fixed days-to-maturity: 'Arcadia' broccoli in Aurora, Oregon ranged 66-103 days to maturity, a 20-32 day spread within a season by planting date
  - the calculation methods used: single sine with horizontal cutoff for most crops, and the threshold-substitution 'Corn Growing DD Method' for sweet corn
- **Caveat:** The models are regional. The authors state they were built from field trials 'mainly in the Willamette Valley of Oregon' in a cool Mediterranean climate. They warn that upper thresholds matter more in hotter climates, and that accuracy degrades there. The tabulated degree days are for four named cultivars per crop and aren't species averages. Accuracy figures are the authors' own mean absolute differences computed from the fitting data, which they state isn't independent validation. EM 9305 contradicts this app's base temperatures. It uses 45 F (7.2 C) for tomato where this app assumes 10 C. For fresh-market sweet corn it uses 44 F (6.7 C), where this app's rows use 10 C from NDAWN. Both can't be right, and an average of the two would hide a real divergence.

#### `ar-2025-code-of-arkansas-rules-2car-part-50`

Arkansas State Plant Board, Arkansas Department of Agriculture. (2025). *Code of Arkansas Rules, Title 2, Chapter II, Subchapter B, Part 50: Rules on Plant Diseases and Pests, 2 CAR 50-101 Public nuisance declared*. Arkansas Bureau of Legislative Research, Code of Arkansas Rules

- URL: <https://webftp.blr.arkansas.gov/Home/FTPDocument?path=CAR%2FParts%2F2CARpt50.pdf>
- Archived: <https://web.archive.org/web/20261017221536/https://webftp.blr.arkansas.gov/Home/FTPDocument?path=CAR%2FParts%2F2CARpt50.pdf>
- Verification: URL-verified | Access: public-domain, evidence tier **C**
- Backs:
  - sunn-hemp invasiveStatus
    - "(23) Crotalaria (Crotalaria spp.);" (2 CAR 50-101, subsection (d) Noxious weeds listed, item (23), page 5 of the PDF)
- **Caveat:** Published outside a peer-reviewed journal.

#### `bassal-2020-winged-bean-underused`

Bassal, Hussein; Merah, Othmane; Ali, Aqeel M.; Hijazi, Akram; El Omar, Fawaz. (2020). *Psophocarpus tetragonolobus: An Underused Species with Multiple Potential Uses*. Plants 9: 1730

- DOI: [10.3390/plants9121730](https://doi.org/10.3390/plants9121730)
- Verification: URL-verified | Access: public-domain, evidence tier **C**
- Backs:
  - winged-bean spacing
    - "The distance between seeds is around 50 cm." (Section 2.5 Cultivation)
  - winged-bean height
    - "Winged bean is a climbing twinning plant (climb up to 3–5 m)." (Section 2.3 Morphology)
  - winged-bean daysToMaturity
    - "In the first 6 weeks, Psophocarpus tetragonolobus grows slowly, and after 10–12 weeks of planting, the fruit can be harvested." (Section 2.5 Cultivation)
- **Caveat:** Read in full for the sentences quoted. The catalog row comments say which figure each sentence gives.

#### `bleasdale1960-population-yield`

Bleasdale, J. K. A.; Nelder, J. A. (1960). *Plant Population and Crop Yield*. Nature 188: 342

- DOI: [10.1038/188342a0](https://doi.org/10.1038/188342a0)
- Verification: Crossref-verified | Access: paywalled, evidence tier **A**
- Backs:
  - Bleasdale-Nelder plant-density / yield relationship for spacing and competition modeling

#### `both1997-cornell-lettuce-light`

Both, A. J.; Albright, L. D.; Langhans, R. W.; Reiser, R. A.; Vinzant, B. G. (1997). *Hydroponic lettuce production influenced by integrated supplemental light levels in a controlled environment agriculture facility: experimental results*. Acta Horticulturae 418: 45-52

- DOI: [10.17660/ActaHortic.1997.418.5](https://doi.org/10.17660/ActaHortic.1997.418.5)
- Verification: Crossref-verified | Access: paywalled, evidence tier **A**
- Backs:
  - the Cornell CEA daily light integral of 17 mol/m2/d for greenhouse hydroponic lettuce, the origin of the leafy-greens target ceiling
- **Caveat:** The bibliographic record matches Crossref (title, five authors, Acta Horticulturae 418: 45-52, 1997). Neither Crossref, OpenAlex, Semantic Scholar nor actahort.org serves the abstract. The 17 mol/m2/d figure therefore rests on the Cornell CEA Hydroponic Lettuce Handbook by Brechner and Both (brechner2013-cornell-lettuce-handbook). The handbook states it for the boston bibb cultivar used in this research program. The two sources only support the figure together.

#### `brechner2013-cornell-lettuce-handbook`

Brechner, Melissa; Both, A. J. (2013). *Hydroponic Lettuce Handbook*. Cornell University Controlled Environment Agriculture Program

- URL: <https://cpb-us-e1.wpmucdn.com/blogs.cornell.edu/dist/8/8824/files/2019/06/Cornell-CEA-Lettuce-Handbook-.pdf>
- Archived: <https://web.archive.org/web/20261005233844/https://cpb-us-e1.wpmucdn.com/blogs.cornell.edu/dist/8/8824/files/2019/06/Cornell-CEA-Lettuce-Handbook-.pdf>
- Verification: URL-verified | Access: open-access, evidence tier **B**
- Backs:
  - lettuce target DLI
    - "A supplemental light intensity within the range of 100-200 umol/m2/s (for a total of 17 mol/m2/d of both natural and supplemental lighting) at the plant level is recommended. It should be noted that 17 mol/m2/d is the light integral that worked best for the particular cultivar of boston bibb lettuce that we used" (p. 13)
  - tipburn is light-limited and cultivar-dependent
    - "For some cultivars, 15 or mol/m2/d is the maximum amount of light that can be used before the physiological condition called tipburn occurs" (p. 13)
    - "Without the air flow, we were not able to go over 12 mol/m2/d" (p. 14)
  - seedlings
    - "the same total daily accumulated light (~22 mol/m2/d). Anecdotal evidence shows that some lettuce seedlings can tolerate 30 mol/m2/d" (p. 10)
- **Caveat:** A production handbook for one floating-raft greenhouse system, written from Cornell trials on a boston bibb cultivar (Ostinata, no longer available). It gives no minimum DLI and no sustained-days rule for tipburn: the tipburn ceiling it describes moves with cultivar, spacing and vertical airflow (12 to 17 mol/m2/d in its own examples), so it backs the 17 target and the existence of a light-driven tipburn limit, and nothing more precise.

#### `ca-olive-committee-2003-olive-pmsp`

California Olive Committee and California Minor Crops Council. (2003). *A Pest Management Strategic Plan for Olive Production in California*. California Olive Committee / California Minor Crops Council

- URL: <https://ipmdata.ipmcenters.org/documents/pmsps/CAOLIVEPMSP.pdf>
- Verification: URL-verified | Access: public-domain, evidence tier **C**
- Backs:
  - harvest timing for olive
    - "Table olive harvest usually begins in mid-September and can extend through November. Cultivars grown for oil, however, are harvested much later so that the maximum amount of oil can accumulate in the fruit" (HARVEST section, document p. 19 (PDF p. 21). Table cultivar region and 'September - November' harvest period also given in the 'Differences in Production of Table Versus Oil Cultivars in California' table, PDF p. 7)
- **Caveat:** Published outside a peer-reviewed journal. Its dates are calibrated to the table-cultivar production areas of California's San Joaquin and Sacramento Valleys, and this app places them at the same point in each garden's own frost-free season. For olive, the source is a pest management strategic plan for table olives in the Central Valley, from the California Olive Committee and the California Minor Crops Council.

#### `calipc-inventory`

California Invasive Plant Council. (n.d.). *The Cal-IPC Inventory*. California Invasive Plant Council

- URL: <https://www.cal-ipc.org/plants/inventory/>
- Archived: <https://web.archive.org/web/20261002053929/https://www.cal-ipc.org/plants/inventory/>
- Verification: URL-verified | Access: public-domain, evidence tier **C**
- Backs:
  - shungiku invasiveStatus
    - "Glebionis coronaria garland Chrysanthemum, crown daisy Limited" (Cal-IPC Inventory web table (https://www.cal-ipc.org/plants/inventory/), columns 'Scientific name', 'Common names' and ')
- **Caveat:** Published outside a peer-reviewed journal.

#### `chamberlain2014-forest-farming-ramps`

Chamberlain, James L.; Beegle, Dana; Lajeunesse Connette, Katie. (2014). *Forest Farming Ramps*. USDA National Agroforestry Center AF Note-47

- URL: <https://www.fs.usda.gov/nac/assets/documents/agroforestrynotes/an47ff08.pdf>
- Archived: <https://web.archive.org/web/20260703123027/https://www.fs.usda.gov/nac/assets/documents/agroforestrynotes/an47ff08.pdf>
- Verification: URL-verified | Access: public-domain, evidence tier **B**
- Backs:
  - ramps want high light during their own growing window, and the shade in a ramp habitat arrives after it
- **Caveat:** It gives no DLI figure for ramps or for anything else, so it supports the direction of the light requirement and can't set a threshold. Secondary summaries of ramp cultivation quote a '60-80% shade' canopy target that this note doesn't contain.

#### `chan-elevitch-2006-coconut-species-profile`

Chan, Edwin; Elevitch, Craig R. (2006). *Cocos nucifera (coconut), Species Profiles for Pacific Island Agroforestry, ver. 2.1*. Permanent Agriculture Resources (Agroforestry Net), Holualoa, Hawaii (listed on the CTAHR Master Gardener plants page, University of Hawaii)

- URL: <https://agroforestry.org/images/pdfs/Cocos-coconut.pdf>
- Archived: <https://web.archive.org/web/20260916093154/https://agroforestry.org/images/pdfs/Cocos-coconut.pdf>
- Verification: URL-verified | Access: public-domain, evidence tier **C**
- Backs:
  - coconut width
    - "The canopy has a diameter of 8–9 m (26–30 ft)." (p. 3 of 27, section 'BOTANICAL DESCRIPTION', paragraph 'Size')
- **Caveat:** Published outside a peer-reviewed journal.

#### `clemson-hgic-2024-inground-citrus`

Snipes, Zack; Melgar, Juan Carlos. (2024). *In-Ground Citrus Production (HGIC 1364)*. Clemson Cooperative Extension, Home & Garden Information Center

- URL: <https://hgic.clemson.edu/factsheet/in-ground-citrus-production/>
- Archived: <https://web.archive.org/web/20260613215859/https://hgic.clemson.edu/factsheet/in-ground-citrus-production/>
- Verification: URL-verified | Access: public-domain, evidence tier **C**
- Backs:
  - orange yearsToFirstHarvest
    - "Young, grafted oranges, grapefruits, and mandarins must grow for 5 years before they will flower and produce fruit." ("Purchasing Citrus" section)
  - mandarin yearsToFirstHarvest
    - "Young, grafted oranges, grapefruits, and mandarins must grow for 5 years before they will flower and produce fruit." ("Purchasing Citrus" section)
  - mandarin coldLimit
    - "Satsuma Owari 19.8-20.7 Very little foliar damage in the 2022 Christmas Freeze" (unlabeled cold-hardiness table under "Recommended Varieties for South Carolina", columns "Type", "Variety", "Minimum Tem)
  - mandarin light
    - "Site Selection: Citrus trees should be planted in a full-sun location to achieve maximum production." ("Culture" / "Site Selection" section)
- **Caveat:** Published outside a peer-reviewed journal.

#### `clemson-hgic-2025-pomegranate`

Tanner, Cory. (2025). *Pomegranate (Punica granatum): How to Grow, Care for, and Enjoy in South Carolina (HGIC 1359)*. Clemson Cooperative Extension, Home & Garden Information Center

- URL: <https://hgic.clemson.edu/factsheet/pomegranate-punica-granatum-how-to-grow-care-for-and-enjoy-in-south-carolina/>
- Archived: <https://web.archive.org/web/20260904181100/https://hgic.clemson.edu/factsheet/pomegranate-punica-granatum-how-to-grow-care-for-and-enjoy-in-south-carolina/>
- Verification: URL-verified | Access: public-domain, evidence tier **C**
- Backs:
  - pomegranate height
    - "This deciduous (rarely evergreen) shrub or small tree typically grows from 12 to 20 feet tall and nearly the same in spread." ("Description: Identifying the Pomegranate Plant" section)
  - pomegranate width
    - "This deciduous (rarely evergreen) shrub or small tree typically grows from 12 to 20 feet tall and nearly the same in spread." ("Description: Identifying the Pomegranate Plant" section)
- **Caveat:** Published outside a peer-reviewed journal.

#### `cockshull1992-tomato-shading`

Cockshull, K. E.; Graves, C. J.; Cave, C. R. J. (1992). *The influence of shading on yield of glasshouse tomatoes*. Journal of Horticultural Science 67: 11-24

- DOI: [10.1080/00221589.1992.11516215](https://doi.org/10.1080/00221589.1992.11516215)
- Verification: Crossref-verified | Access: paywalled, evidence tier **B**
- Backs:
  - origin of the '1% light = 1% yield' rule for greenhouse fruiting vegetables
- **Caveat:** A greenhouse relationship. Laub et al. excluded greenhouse experiments from their meta-analysis as too dissimilar to agrivoltaics, so this paper serves as an upper-bound sensitivity for protected-culture solanaceae and can't stand in for an open-field shade response.

#### `coladonato1994-teaberry-feis`

Coladonato, Milo. (1994). *Gaultheria procumbens, eastern teaberry*. Fire Effects Information System

- DOI: [10.2737/feis-species-review-gaupro](https://doi.org/10.2737/feis-species-review-gaupro)
- Verification: Crossref-verified | Access: public-domain, evidence tier **C**
- Backs:
  - eastern teaberry found growing where soil pH ranged from 3.5 to 6.9 at the surface, with 4.5 to 6.0 reported as optimum and 7.0 the maximum tolerated
  - eastern teaberry grows well on many acidic substrates including peat, sand, sandy loam and coal spoils
- **Caveat:** This FEIS review is a secondary synthesis of field observations and isn't a controlled pH trial.

#### `colorado-cda-noxious-weed-species`

Colorado Department of Agriculture. (n.d.). *Noxious Weed Species in Colorado*. Colorado Department of Agriculture

- URL: <https://ag.colorado.gov/conservation/noxious-weeds/species-id>
- Verification: URL-verified | Access: public-domain, evidence tier **C**
- Backs:
  - caraway invasiveStatus
    - "List B Species [...] Wild caraway Carum carvi" (Colorado Department of Agriculture, 'Noxious Weed Species in Colorado' page, section 'List B Species' (the species page ))
- **Caveat:** Published outside a peer-reviewed journal.

#### `cornell-2006-garden-cress`

Cornell University, Home Gardening. (2006). *Garden cress (Vegetable Growing Guide)*. Cornell University

- URL: <http://www.gardening.cornell.edu/homegardening/scene3673.html>
- Archived: <https://web.archive.org/web/20260531014909/http://www.gardening.cornell.edu/homegardening/scene3673.html>
- Verification: URL-verified | Access: public-domain, evidence tier **C**
- Backs:
  - cress coldLimit
    - "Tolerates: frost" (Site and Plant Characteristics tab, Special Considerations)
  - cress light
    - "Prefers part shade during hot summer weather." (Site and Plant Characteristics tab, Site Characteristics, Sunlight (listed as full sun and part shade))
- **Caveat:** Published outside a peer-reviewed journal.

#### `cornell-fruit-resources-quince`

Cornell University, Department of Horticulture. (n.d.). *Quinces (Cydonia oblonga), Cornell Fruit Resources: Minor Fruits*. Cornell University

- URL: <http://www.hort.cornell.edu/fruit/mfruit/quince.html>
- Archived: <https://web.archive.org/web/20250625023002/http://www.hort.cornell.edu/fruit/mfruit/quince.html>
- Verification: URL-verified | Access: public-domain, evidence tier **C**
- Backs:
  - quince coldLimit
    - "The flowers are susceptible to winter injury at temperatures below about -15 F, but trees are hardy in Zones 5 to 9." (Cornell Fruit Resources, Quinces page, first paragraph)
  - quince light
    - "Quinces prefer a fertile site in full sun." (Cornell Fruit Resources, Quinces page, Growing quinces paragraph)
- **Caveat:** Published outside a peer-reviewed journal.

#### `crane-ifas-lemon-hs1153`

Crane, Jonathan H. (n.d.). *Lemon Growing in the Florida Home Landscape*. University of Florida IFAS Extension HS1153/HS402

- URL: <https://ask.ifas.ufl.edu/publication/HS402>
- Archived: <https://web.archive.org/web/20260614172052/https://ask.ifas.ufl.edu/publication/HS402>
- Verification: URL-verified | Access: public-domain
- Backs:
  - lemon height and width, the size trees may reach and the size they are best maintained at
    - "Trees may reach 10-20 ft (3.1-6.1 m) in height" ("Description" section, "Tree" subsection)
    - "maintained at 7 to 10 ft (2.1-3.1 m) high and 10 to 15 ft (3.1-4.6 m) wide" ("Lemon Trees, Lawn Care, Mulch, and Pruning" section, "Pruning" subsection)
  - lemon spacing from buildings and other trees
    - "15 to 25 feet or more (6.1 to 7.6 m) away from buildings and other trees" ("Placement in the Landscape" section)
  - lemon yearsToFirstHarvest
    - "Young trees usually begin fruit production in the third year" ("Fruit Production" section)
  - lemon coldLimit
    - "defoliated at 22-24F (-4.4 to -5.6C), severe wood damaged at 20F (-6.7C), flowers and young fruit are killed at 29F (-1.7C)" ("Climatic Adaptation" section)
  - lemon light
    - "should be planted in full sun" ("Placement in the Landscape" section)
- **Caveat:** The quoted sentences come from the page itself, and the page shows no publication date.

#### `crane-ifas-mango-hs2`

Crane, Jonathan H.; Wasielewski, Jeff; Balerdi, Carlos F.; Maguire, Ian. (n.d.). *Mango Growing in the Florida Home Landscape*. University of Florida IFAS Extension HS2/MG216

- URL: <https://ask.ifas.ufl.edu/publication/MG216>
- Archived: <https://web.archive.org/web/20261004065636/https://ask.ifas.ufl.edu/publication/MG216>
- Verification: URL-verified | Access: public-domain
- Backs:
  - mango height
    - "Left unpruned many mango varieties become medium to large (30 to 100 ft; 9.1 to 30.5 m) trees" ("Description" section, "Tree" subsection)
  - mango spacing, for less vigorous varieties with pruning
    - "may be planted 12 to 15 feet (3.7 to 4.6 m) apart from other trees, buildings, and power lines" ("Spacing and Pruning" section)
  - mango yearsToFirstHarvest
    - "Grafted trees will begin to bear 3 to 5 years after planting" ("Production (Crop Yields)" section)
  - mango coldLimit, where mature trees withstand 25F with injury and young trees are killed at 29F to 30F
    - "mature trees can withstand air temperatures as low as 25F (-3.9C)" ("Climate" section)
    - "young trees may be killed at 29F to 30F (-1.7C to -1.1C)" ("Climate" section)
  - mango light
    - "mango trees should be planted in full sun for best growth and fruit production" ("Planting a Mango Tree" section, "Site Selection" subsection)
- **Caveat:** The quoted sentences come from the page itself, and the page shows no publication date.

#### `crane-ifas-papaya-hs11`

Crane, Jonathan H. (n.d.). *Papaya Growing in the Florida Home Landscape*. University of Florida IFAS Extension HS11/MG054

- URL: <https://ask.ifas.ufl.edu/publication/MG054>
- Archived: <https://web.archive.org/web/20260525145455/https://ask.ifas.ufl.edu/publication/MG054>
- Verification: URL-verified | Access: public-domain
- Backs:
  - papaya height
    - "Giant arborescent plant to 33 ft (10 m) tall" ("Description" section, "Tree and Tree Types" subsection)
  - papaya light and spacing
    - "Papaya plants should be planted in full sun and at least 7 to 10 ft (2.1-3.1 m) away from other plants, buildings, and power lines" ("Spacing and Pruning" section)
  - papaya yearsToFirstHarvest
    - "Well-cared-for plants may begin to produce flowers 4 months after planting and fruit 7 to 11 months after planting" ("Production (Crop Yields)" section)
  - papaya coldLimit
    - "Papaya plants are not tolerant of freezing temperatures and are damaged or killed below 31F (-0.6C)" ("Climate" section)
- **Caveat:** The quoted sentences come from the page itself, and the page shows no publication date.

#### `cryan2024-three-sisters-labor`

Cryan, Jessica; Musselman, Erin; Baumgardner, Ann; Osborn, Sara. (2024). *Yield, growth, and labor demands of growing maize, beans, and squash in monoculture versus the Three Sisters*. Plants, People, Planet 7: 204-214

- DOI: [10.1002/ppp3.10576](https://doi.org/10.1002/ppp3.10576)
- Verification: Crossref-verified | Access: open-access, evidence tier **B**
- Backs:
  - labor cost of Three Sisters relative to monoculture: land efficiency isn't the only objective function
  - the product must surface labor and harvest difficulty alongside LER
- **Caveat:** License is CC BY-NC 4.0. Crossref records online publication in 2024, and volume 7 is the 2025 issue year.

#### `ctahr-1983-guava-in-hawaii`

Shigeura, Gordon T.; Bullock, Richard M. (1983). *Guava (Psidium guajava L.) in Hawaii: History and Production (Research Extension Series 035)*. Hawaii Institute of Tropical Agriculture and Human Resources, University of Hawaii

- URL: <https://www3.ctahr.hawaii.edu/oc/freepubs/pdf/RES-035.pdf>
- Archived: <https://web.archive.org/web/20251204105754/https://www.ctahr.hawaii.edu/oc/freepubs/pdf/RES-035.pdf>
- Verification: URL-verified | Access: public-domain, evidence tier **C**
- Backs:
  - guava width
    - "A properly pruned and trained tree can be confined to a foliage canopy approaching 4 meters (11 to 12 feet) in radius." (CTAHR RES-035, section 'Orchard Design', Clonal orchard, PDF page 17)
- **Caveat:** Published outside a peer-reviewed journal.

#### `ctahr-2002-lablab-green-manure`

Valenzuela, Hector; Smith, Jody. (2002). *Green Manure Crops: Lablab (SA-GM-7)*. College of Tropical Agriculture and Human Resources, University of Hawaii at Manoa

- URL: <https://www3.ctahr.hawaii.edu/oc/freepubs/pdf/GreenManureCrops/lablab.pdf>
- Archived: <https://web.archive.org/web/20260708105759/https://www.ctahr.hawaii.edu/oc/freepubs/pdf/GreenManureCrops/lablab.pdf>
- Verification: URL-verified | Access: public-domain, evidence tier **C**
- Backs:
  - lablab light
    - "Lablab is also shade tolerant." (Page 1, section 'Environmental requirements')
  - lablab photoperiod, why the row carries no day-length gate
    - "Both short-day and long-day varieties are known." (page 1)
- **Caveat:** Published outside a peer-reviewed journal.

#### `ctahr-2002-pineapple-cultivation-hawaii`

Bartholomew, Duane P.; Rohrbach, Kenneth G.; Evans, Dale O. (2002). *Pineapple Cultivation in Hawaii (F&N-7)*. College of Tropical Agriculture and Human Resources, University of Hawaii at Manoa

- URL: <https://www.ctahr.hawaii.edu/oc/freepubs/pdf/f_n-7.pdf>
- Archived: <https://web.archive.org/web/20260902194450/https://www3.ctahr.hawaii.edu/oc/freepubs/pdf/F_N-7.pdf>
- Verification: URL-verified | Access: public-domain, evidence tier **C**
- Backs:
  - pineapple harvestSeason
    - "Fruits are harvested year-round for fresh market and canning operations." (CTAHR F&N-7, 'Overview of Commercial Production Practices', first page, PDF page 1)
- **Caveat:** Published outside a peer-reviewed journal.

#### `ctahr-2009-cacao-economics-kona`

Fleming, Kent; Smith, Virginia Easton; Bittenbender, H. C. (2009). *The Economics of Cacao Production in Kona (AB-17)*. University of Hawai'i College of Tropical Agriculture and Human Resources (CTAHR)

- URL: <https://www.ctahr.hawaii.edu/oc/freepubs/pdf/AB-17.pdf>
- Archived: <https://web.archive.org/web/20251129220117/https://www.ctahr.hawaii.edu/oc/freepubs/pdf/AB-17.pdf>
- Verification: URL-verified | Access: public-domain, evidence tier **C**
- Backs:
  - cacao spacing
    - "The example farm's tree spacing is 6 ft by 7 ft [...] some managers prefer a 5x12-ft spacing arrangement because it allows machinery to travel more freely between the rows." (p. 3, orchard-size description)
- **Caveat:** Published outside a peer-reviewed journal.

#### `ctahr-2010-non-invasive-fruit-trees-hawaii`

Clifford, Patti; Kobayashi, Kent. (2010). *Non-Invasive Fruit Trees for Gardens in Hawai'i (F_N-17)*. Hawai'i Invasive Species Council and College of Tropical Agriculture and Human Resources, University of Hawaii at Manoa

- URL: <https://www.ctahr.hawaii.edu/oc/freepubs/pdf/F_N-17.pdf>
- Archived: <https://web.archive.org/web/20260423080601/https://www.ctahr.hawaii.edu/oc/freepubs/pdf/F_N-17.pdf>
- Verification: URL-verified | Access: public-domain, evidence tier **C**
- Backs:
  - macadamia yearsToFirstHarvest
    - "Harvest trees begin bearing fruit at 3–6 years" (CTAHR and Hawaii Invasive Species Council F_N-17, Macadamia entry, PDF page 6)
- **Caveat:** Published outside a peer-reviewed journal.

#### `ctahr-circular-485-macadamia`

Hamilton, Richard A.; Ito, Philip J.; Chia, C. L. (n.d.). *Macadamia: Hawaii's Dessert Nut (Circular 485)*. College of Tropical Agriculture and Human Resources, University of Hawaii at Manoa

- URL: <https://www3.ctahr.hawaii.edu/oc/freepubs/pdf/C1-485.pdf>
- Archived: <https://web.archive.org/web/20260901143437/https://www3.ctahr.hawaii.edu/oc/freepubs/pdf/C1-485.pdf>
- Verification: URL-verified | Access: public-domain, evidence tier **C**
- Backs:
  - macadamia spacing
    - "[...] 30 to 35 feet between rows and 16 to 20 feet between trees in the row are considered reasonable, depending on tree form and growth rate of the trees." (CTAHR Circular 485, section 'Yields and Spacing', PDF page 8)
  - macadamia harvestSeason
    - "The main harvest period for macadamia nuts in Hawaii extends from about August through January." (CTAHR Circular 485, section 'Harvesting and Processing', PDF page 13)
- **Caveat:** Published outside a peer-reviewed journal.

#### `ctahr-coconut-as-an-ornamental`

Watson, Donald P. (n.d.). *Coconut as an Ornamental (Circular 478)*. Hawaii Cooperative Extension Service, College of Tropical Agriculture and Human Resources, University of Hawaii

- URL: <https://www.ctahr.hawaii.edu/oc/freepubs/pdf/C1-478.pdf>
- Archived: <https://web.archive.org/web/20260801224447/https://www.ctahr.hawaii.edu/oc/freepubs/pdf/C1-478.pdf>
- Verification: URL-verified | Access: public-domain, evidence tier **C**
- Backs:
  - coconut height
    - "Tall coconut palms may attain a height of more than 80 feet and live as long as 90 years. They begin to bear 6 to 10 years after planting. Dwarf coconut palms rarely grow to be more than 25 feet and bear fruit a little sooner." (p. 3 of 16, opening section)
- **Caveat:** Published outside a peer-reviewed journal.

#### `ctahr-hgv18-upland-taro`

University of Hawaii Cooperative Extension Service. (1998). *Upland Taro*. College of Tropical Agriculture and Human Resources, University of Hawaii at Manoa Home Garden Vegetable HGV-18

- URL: <https://www3.ctahr.hawaii.edu/oc/freepubs/pdf/HGV-18.pdf>
- Archived: <https://web.archive.org/web/20260901125154/https://www3.ctahr.hawaii.edu/oc/freepubs/pdf/HGV-18.pdf>
- Verification: URL-verified | Access: public-domain
- Backs:
  - taro spacing
    - "use a guide string to plant 18-24 inches apart within rows 18-24 inches apart" (p. 1)
  - taro daysToMaturity
    - "Upland taro is ready for harvest 8-10 months after planting" (p. 2)
  - taro soil and rainfall
    - "best results are obtained on deep, well drained, friable loams with pH 5.5-6.5" (p. 1)
    - "It is best adapted to a warm, moist environment. Evenly distributed rainfall is ideal" (p. 1)
- **Caveat:** Home-garden guidance for Hawaii, and it gives no temperature figures.

#### `de-melo-abreu2004-olive-chilling`

De Melo-Abreu, J. P.; Barranco, D.; Cordeiro, A. M.; Tous, J.; Rogado, B. M.; Villalobos, F. J. (2004). *Modelling olive flowering date using chilling for dormancy release and thermal time*. Agricultural and Forest Meteorology 125: 117-127

- DOI: [10.1016/j.agrformet.2004.02.009](https://doi.org/10.1016/j.agrformet.2004.02.009)
- Verification: Crossref-verified | Access: paywalled, evidence tier **A**
- Backs:
  - the 150 to 300 hour chilling requirement below 7 C the study modeled for its olive cultivars
- **Caveat:** Crossref records only one author, family 'DEMELOABREU' given 'J', with no spacing. The paper is cited everywhere as De Melo-Abreu, Barranco, Cordeiro, Tous, Rogado and Villalobos.

#### `dou2018-basil-dli`

Dou, Haijie; Niu, Genhua; Gu, Mengmeng; Masabni, Joseph G. (2018). *Responses of Sweet Basil to Different Daily Light Integrals in Photosynthesis, Morphology, Yield, and Nutritional Quality*. HortScience 53: 496-503

- DOI: [10.21273/HORTSCI12785-17](https://doi.org/10.21273/HORTSCI12785-17)
- Verification: Crossref-verified | Access: open-access, evidence tier **A**
- Backs:
  - sweet basil grown for 21 days under five DLIs of 9.3, 11.5, 12.9, 16.5 and 17.8 mol/m2/d, where shoot fresh weight was 54 to 79 percent higher under the higher DLIs than under 9.3, and soluble sugars, chlorophyll, anthocyanins and phenolics rose with DLI
  - the basil production DLI
    - "we suggest a DLI of 12.9 mol/m2/d for sweet basil commercial production in indoor vertical farming to minimize the energy cost while maintaining a high yield and nutritional quality" (the abstract)
- **Caveat:** This entry rests on the abstract and the Crossref record. The suggested 12.9 mol/m2/d is a production recommendation that trades energy cost against yield and quality. Plants at 9.3 still grew, so it isn't a failure threshold. It's indoor sole-source LED culture.

#### `duke-1983-cacao-energy-crops`

Duke, James A. (1983). *Handbook of Energy Crops: Theobroma cacao (unpublished)*. Purdue University Center for New Crops & Plants Products (NewCROP)

- URL: <https://www.hort.purdue.edu/newcrop/duke_energy/Theobroma_cacao.html>
- Archived: <https://web.archive.org/web/20260921224616/https://www.hort.purdue.edu/newcrop/duke_energy/Theobroma_cacao.html>
- Verification: URL-verified | Access: public-domain, evidence tier **C**
- Backs:
  - cacao height
    - "Small tree usually 4–8 m tall, rarely up to 20 m" ('Description' section)
  - cacao yearsToFirstHarvest
    - "Remove floral buds until trees are 5 years old." ('Cultivation' section)
  - cacao harvestSeason
    - "Although fruits mature throughout the year, usually only two harvests are made. In West Africa, the main harvest begins in September, extends to February, with a second smaller harvest in May–June [...] Harvest season lasts about 5 months." ('Harvesting' section)
  - cacao regionLastFreeze, no quote: West Africa's cacao belt is equatorial/tropical and frost-free, so no NOAA station lookup was performed, per the task's frost-free allowance
  - cacao coldLimit
    - "Maximum temperature of 33.5°C and minimum 13°C, with diurnal temperature variation between 33.5 and 18°C are suggested (Reed, 1976)." ('Ecology' section)
  - cacao light
    - "Plants are shade-tolerant [...] Fields should remain shaded for 3 years [...] Seedling cacao does best with only 25% full sunlight, saplings with closer to 50%." ('Ecology', 'Cultivation' and 'Energy' sections)
- **Caveat:** Published outside a peer-reviewed journal.

#### `duke-1983-handbook-of-energy-crops-corchorus-olitorius`

Duke, James A. (1983). *Corchorus olitorius L., in Handbook of Energy Crops (unpublished)*. Purdue University Center for New Crops and Plant Products (NewCROP)

- URL: <https://hort.purdue.edu/newcrop/duke_energy/Corchorus_olitorius.html>
- Archived: <https://web.archive.org/web/20261008155054/https://www.hort.purdue.edu/newcrop/duke_energy/Corchorus_olitorius.html>
- Verification: URL-verified | Access: public-domain, evidence tier **C**
- Backs:
  - jute-mallow height
    - "Annual, much-branched herb 90-120 cm tall; stems glabrous." ('Description' section)
- **Caveat:** Published outside a peer-reviewed journal.

#### `duke-1983-handbook-of-energy-crops-saccharum-officinarum`

Duke, James A. (1983). *Saccharum officinarum L., in Handbook of Energy Crops (unpublished)*. Purdue University Center for New Crops and Plant Products (NewCROP)

- URL: <https://hort.purdue.edu/newcrop/duke_energy/Saccharum_officinarum.html>
- Archived: <https://web.archive.org/web/20261011133421/https://hort.purdue.edu/newcrop/duke_energy/Saccharum_officinarum.html>
- Verification: URL-verified | Access: public-domain, evidence tier **C**
- Backs:
  - sugarcane coldLimit
    - "Sugarcane in commercial production has endured a maximum of 53°C (127°F) and a minimum of -13°C (9°F). The high is endured by standing cane and the low by overwintering stubble. Standing stalks of sugarcane freeze at -4 to -5.5°C (25 to 22°F) depending on cv and length of exposure." ('Ecology' section)
- **Caveat:** Published outside a peer-reviewed journal.

#### `duke1983-energy-crops-purdue`

Duke, James A. (1983). *Handbook of Energy Crops*. Unpublished; hosted by Purdue University NewCROP

- URL: <https://hort.purdue.edu/newcrop/duke_energy/dukeindex.html>
- Archived: <https://web.archive.org/web/20261012095420/https://hort.purdue.edu/newcrop/duke_energy/dukeindex.html>
- Verification: URL-verified | Access: open-access, evidence tier **C**
- Backs:
  - cassava height, spacing, harvest time and shade tolerance
    - "Shrub or small tree, 1.3-5 m tall" (Manihot esculenta page, "Description" section)
    - "usually 1.20 m to 1.50 m by 80 cm for good cvs on fertile soils; 1 m each way for weak cvs on poor soils" (Manihot esculenta page, "Cultivation" section)
    - "Cassava is harvested in 10-14 months, depending on the cv, the cultural practices and the purpose of the crop" (Manihot esculenta page, "Harvesting" section)
    - "reported to tolerate" (Manihot esculenta page, "Ecology" section)
  - rice height, transplant spacing and time from planting to harvest
    - "Erect annual grass, to 1.2 m tall" (Oryza sativa page, "Description" section)
    - "spaced 10-20 cm apart in 20-30 cm rows" (Oryza sativa page, "Cultivation" section)
    - "From planting to harvest varies: 4 months in Italy, 6 months in monsoon regions of Asia, and 135 days for some cvs in the US" (Oryza sativa page, "Harvesting" section)
- **Caveat:** An unpublished 1983 compilation, served by a land-grant site. Its climate ranges are means of reported cases and aren't used here. Only the descriptive height, spacing and harvest statements are cited.

#### `ecfr-7cfr-360-200-noxious-weeds`

Animal and Plant Health Inspection Service, US Department of Agriculture. (2018). *7 CFR 360.200: Designation of noxious weeds*. Electronic Code of Federal Regulations, Office of the Federal Register

- URL: <https://www.ecfr.gov/current/title-7/subtitle-B/chapter-III/part-360/section-360.200>
- Verification: URL-verified | Access: public-domain, evidence tier **C**
- Backs:
  - blackberry acceptedName, the listing the blackberry row's name stays clear of
    - "Rubus fruticosus Linnaeus (complex) (wild blackberry)" (paragraph (c))
  - the catalog rule in the decision record. Checked 2026-10-11 against every catalog accepted name and synonym: once the blackberry row took the genus name, it names none of them
    - "a scientific name is intended to include all subordinate taxa within the taxon" (footnote 1)
- **Caveat:** A federal regulation, the list of federal noxious weeds.

#### `elevitch-manner-2006-jackfruit-species-profile`

Elevitch, Craig R.; Manner, Harley I. (2006). *Artocarpus heterophyllus (jackfruit), Species Profiles for Pacific Island Agroforestry, ver. 1.1*. Permanent Agriculture Resources (Agroforestry Net), Holualoa, Hawaii (listed on the CTAHR Master Gardener plants page, University of Hawaii)

- URL: <https://agroforestry.org/images/pdfs/A.heterophyllus-jackfruit.pdf>
- Archived: <https://web.archive.org/web/20260926101738/https://agroforestry.org/images/pdfs/A.heterophyllus-jackfruit.pdf>
- Verification: URL-verified | Access: public-domain, evidence tier **C**
- Backs:
  - jackfruit width
    - "The canopy diameter at 5 years old ranges from 3.5–6.7 m (11–22 ft) and can reach 10 m or more in older trees." (p. 3 of 17, section 'Size and form')
- **Caveat:** Published outside a peer-reviewed journal.

#### `erdei2024-desmodium-interception`

Erdei, Anna L.; David, Aneth B.; Savvidou, Eleni C.; Dzemedzionaite, Vaida; Chakravarthy, Advaith; Molnar, Bela P.; Dekker, Teun. (2024). *The push-pull intercrop Desmodium does not repel, but intercepts and kills pests*. eLife 13: e88695

- DOI: [10.7554/eLife.88695](https://doi.org/10.7554/eLife.88695)
- Verification: Crossref-verified | Access: open-access, evidence tier **B**
- Backs:
  - NO ADULT REPELLENCY: in wind-tunnel oviposition assays gravid female Spodoptera frugiperda laid equal numbers of egg batches on corn with and without Desmodium odor
  - the terpenoids previously reported as repellent were barely detectable in Desmodium intortum headspace across greenhouse and field, with and without soil microbes, and rose only marginally after herbivory, across 50 field headspace samples from Tanzania and Uganda
  - first-instar larvae PREFERRED Desmodium leaf tissue over corn in choice assays, but development stagnated and no larvae survived to pupation
  - proposed mechanism: dense silica-fortified uncinate (hooked) trichomes physically wound larvae
  - the revised functional description: Desmodium acts as a trap crop that intercepts and kills larvae, which replaces the older account of a volatile repellent of adults
  - the mechanism revision behind the caveat on khan2010-push-pull
- **Caveat:** This paper revises the mechanism, and Khan et al.'s push-pull yield and pest results stand. The revision covers stemborer and fall armyworm only. The Striga claim involves a different pest guild and a different chemistry (Tsanuo et al. 2003, Hooper et al. 2010), so the revision doesn't extend to it. The trichome mechanism is proposed and unproven, and eLife rates the strength of evidence 'solid', a step below compelling. That rating puts the paper at tier B. Odermatt et al. 2025 (eLife RP100981, 10.7554/eLife.100981.3) is a related but separate study with icipe-affiliated authors. It detected more field volatiles and still found no significant reduction in FAW oviposition. It isn't a rebuttal, and no formal rebuttal from the icipe group was located.

#### `ernst2018-clubroot-spores`

Ernst, T. W.; Kher, S.; Stanton, D.; Rennie, D. C. (2018). *Plasmodiophora brassicae resting spore dynamics in clubroot resistant canola (Brassica napus) cropping systems*. Plant Pathology 68: 399-408

- DOI: [10.1111/ppa.12949](https://doi.org/10.1111/ppa.12949)
- Verification: Crossref-verified | Access: paywalled, evidence tier **A**
- Backs:
  - clubroot resting-spore decline dynamics across a rotation break
- **Caveat:** Crossref records online publication in 2018. Volume 68 is the 2019 issue year.

#### `fao-1994-neglected-crops-1492`

Hernández Bermejo, J. E.; León, J. (1994). *Neglected crops: 1492 from a different perspective (FAO Plant Production and Protection Series No. 26)*. Food and Agriculture Organization of the United Nations

- URL: <https://openknowledge.fao.org/server/api/core/bitstreams/fbde779c-8968-4a7d-8df8-de28c2196aac/content>
- Archived: <https://web.archive.org/web/20260502074154/https://openknowledge.fao.org/server/api/core/bitstreams/fbde779c-8968-4a7d-8df8-de28c2196aac/content>
- Verification: URL-verified | Access: public-domain, evidence tier **C**
- Backs:
  - oca daysToMaturity
    - "The extensive growing period of seven to eight months exposes the crop for a longer time to attack from biotic and abiotic factors" (Chapter 'Andean tubers' (C. Arbizu and M. Tapia), section Oca, 'Prospects for improvement' (page 152 of the book, also o))
  - malanga light
    - "The Xanthosoma species are plants of the tropical rain forest and, although in their natural habitat they grow under the forest canopy, under cultivation they are usually sown with full exposure to sunlight." (Chapter 'Tannia, yautia' (D. C. Giacometti and J. León), 'Ecology and phytogeography' (page 254))
  - tepary-bean daysToMaturity
    - "The cultivated form, like the wild forms, has a short cycle, flowering 27 to 40 clays after gen-nination and ripening at 60 to 80 days." (Chapter 'Beans' (D. G. Debouck), section Phaseolus acutifolius, 'Botanical description', book page 52 (PDF page 70))
  - tepary-bean light
    - "heliophyte and has characteristics that allow it to tolerate excessive sun." (Chapter 'Beans' (D. G. Debouck), section Phaseolus acutifolius, 'Ecology and phytogeography', last sentence of the secti)
- **Caveat:** Published outside a peer-reviewed journal.

#### `fao-minor-oil-crops-cashew-nut`

Food and Agriculture Organization of the United Nations. (n.d.). *Minor oil crops: Individual monographs, Cashew nut*. Food and Agriculture Organization of the United Nations

- URL: <https://www.fao.org/4/x5043e/x5043E06.htm>
- Archived: <https://web.archive.org/web/20261007121957/https://www.fao.org/4/X5043E/x5043E06.htm>
- Verification: URL-verified | Access: public-domain, evidence tier **C**
- Backs:
  - cashew harvestSeason
    - "In India the main crop is ready for harvest between March and April. Some trees may produce an additional light crop between October and November (Woodroof)." (Section 'HARVESTING PERIODS' of the Cashew nut monograph)
- **Caveat:** Published outside a peer-reviewed journal.

#### `farazdaghi1968-competition-yield`

Farazdaghi, H.; Harris, P. M. (1968). *Plant Competition and Crop Yield*. Nature 217: 289-290

- DOI: [10.1038/217289a0](https://doi.org/10.1038/217289a0)
- Verification: Crossref-verified | Access: paywalled, evidence tier **A**
- Backs:
  - the reciprocal-yield competition model of plant density and crop yield, commonly cited under Holliday's name
- **Caveat:** Nature 217:289-290 (1968), 'Plant Competition and Crop Yield', is by Farazdaghi and Harris. It circulates widely under Holliday's name, whose own paper is Nature 186:22-24 (1960), holliday1960-population-yield.

#### `ferguson-1990-catnip-north-carolina`

Ferguson, J.M.; Weeks, W.W.; Fike, W.T. (1990). *Production of catnip in North Carolina*. Timber Press, in Advances in new crops (J. Janick and J.E. Simon, eds.), pp. 527-528, hosted by Purdue University NewCROP

- URL: <https://hort.purdue.edu/newcrop/proceedings1990/V1-527.html>
- Archived: <https://web.archive.org/web/20261017220054/https://hort.purdue.edu/newcrop/proceedings1990/V1-527.html>
- Verification: URL-verified | Access: public-domain, evidence tier **C**
- Backs:
  - catnip yearsToFirstHarvest
    - "Seeds are sown into warm plantbeds 60-65 days prior to transplanting, which in North Carolina is generally between March 1 and April 1 [...] Catnip is usually ready to harvest in August a time when the weather is too humid in North Carolina for proper curing." (Sections 'TRANSPLANT PRODUCTION' and 'CURING')
  - catnip harvestSeason
    - "Catnip is usually ready to harvest in August a time when the weather is too humid in North Carolina for proper curing." (Section 'CURING')
- **Caveat:** Read in full for the sentences quoted. The catalog row comments say which figure each sentence gives.

#### `fernandez-2006-yacon-central-europe`

Fernández, E. C.; Viehmannová, I.; Lachman, J.; Milella, L. (2006). *Yacon [Smallanthus sonchifolius (Poeppig & Endlicher) H. Robinson]: a new crop in the Central Europe*. Plant, Soil and Environment 52(12):564-570 (Czech Academy of Agricultural Sciences)

- URL: <https://pse.agriculturejournals.cz/pdfs/pse/2006/12/05.pdf>
- Archived: <https://web.archive.org/web/20261017215232/https://pse.agriculturejournals.cz/pdfs/pse/2006/12/05.pdf>
- Verification: URL-verified | Access: public-domain, evidence tier **C**
- Backs:
  - yacon coldLimit
    - "The first frosts (–1°C) in autumn can cause yacon frost burns on the overground parts (1 meter above the ground). Basal parts of the stem resist –2°C, and underground organs –3°C. In lower temperatures the tuberous roots crack." (Journal page 568 (PDF page 5), Results and Discussion, section 'Influence of precipitation and temperature')
- **Caveat:** Read in full for the sentences quoted. The catalog row comments say which figure each sentence gives.

#### `fiedler2007-insectary`

Fiedler, Anna K.; Landis, Douglas A. (2007). *Attractiveness of Michigan Native Plants to Arthropod Natural Enemies and Herbivores*. Environmental Entomology 36: 751-765

- DOI: [10.1093/ee/36.4.751](https://doi.org/10.1093/ee/36.4.751)
- Verification: Crossref-verified | Access: paywalled, evidence tier **A**
- Backs:
  - species-level insectary plant selection for natural-enemy provisioning
- **Caveat:** Crossref holds two DOIs for this article (also 10.1603/0046-225X(2007)36[751:AOMNPT]2.0.CO;2). The OUP DOI recorded here is the preferred one.

#### `finch-collier2000-landings`

Finch, Stan; Collier, Rosemary H. (2000). *Host-plant selection by insects - a theory based on 'appropriate/inappropriate landings' by pest insects of cruciferous plants*. Entomologia Experimentalis et Applicata 96: 91-102

- DOI: [10.1046/j.1570-7458.2000.00684.x](https://doi.org/10.1046/j.1570-7458.2000.00684.x)
- Verification: Crossref-verified | Access: paywalled, evidence tier **A**
- Backs:
  - appropriate/inappropriate landings theory: Grade A for the theory, D/E for the folk version

#### `finch-collier2003`

Finch, Stan; Billiald, Helen; Collier, Rosemary H. (2003). *Companion planting - do aromatic plants disrupt host-plant finding by the cabbage root fly and the onion fly more effectively than non-aromatic plants?* Entomologia Experimentalis et Applicata 109: 183-195

- DOI: [10.1046/j.0013-8703.2003.00102.x](https://doi.org/10.1046/j.0013-8703.2003.00102.x)
- Verification: Crossref-verified | Access: paywalled, evidence tier **A**
- Backs:
  - Grade E for 'aromatic herbs repel pests': aromatic plants were no more effective than non-aromatic plants
  - the operative mechanism is green surface area, and smell plays no part
  - undersowing with non-host green cover is the effective intervention
- **Caveat:** The paper has three authors, Finch, Billiald and Collier. 'Finch & Collier (2003)' is a common short form and is the form Decision Record 11 uses, so the citekey keeps it. Any rendered reference must list Billiald.

#### `fisc-2025-invasive-plant-species`

Florida Invasive Species Council. (2025). *2025 Invasive Plant Species (the invasive plant species list used by the Florida Invasive Species Council)*. Florida Invasive Species Council, successor to the Florida Exotic Pest Plant Council

- URL: <https://www.floridainvasives.org/plant-list/2025-invasive-plant-species/>
- Archived: <https://web.archive.org/web/20260226093230/https://www.floridainvasives.org/plant-list/2025-invasive-plant-species/>
- Verification: URL-verified | Access: public-domain, evidence tier **C**
- Backs:
  - malanga invasiveStatus
    - "Xanthosoma sagittifolium arrowleaf elephant's ear N, C, S II" (2025 Invasive Plant Species table, columns Scientific Name, Common Name, Zone, Category)
- **Caveat:** Published outside a peer-reviewed journal.

#### `fisc-2026-invasive-plant-list`

Florida Invasive Species Council (formerly Florida Exotic Pest Plant Council). (2026). *FISC List of Invasive Plant Species, Category I and Category II (updated April 2026)*. Florida Invasive Species Council

- URL: <https://www.floridainvasives.org/wp-content/uploads/2026/07/FISC-2026-Plant-List-Cat-I-II_April2026.pdf>
- Archived: <https://web.archive.org/web/20261017214110/https://www.floridainvasives.org/wp-content/uploads/2026/07/FISC-2026-Plant-List-Cat-I-II_April2026.pdf>
- Verification: URL-verified | Access: public-domain, evidence tier **C**
- Backs:
  - guava invasiveStatus
    - "Psidium guajava guava C, S" (FISC List of Invasive Plant Species, table 'FISC Category I', row Psidium guajava (columns Scientific Name, Common Name,))
- **Caveat:** Published outside a peer-reviewed journal.

#### `gao2020-spinach-dli`

Gao, Wei; He, Dongxian; Ji, Fang; Zhang, Sen; Zheng, Jianfeng. (2020). *Effects of Daily Light Integral and LED Spectrum on Growth and Nutritional Quality of Hydroponic Spinach*. Agronomy 10: 1082

- DOI: [10.3390/agronomy10081082](https://doi.org/10.3390/agronomy10081082)
- Verification: Crossref-verified | Access: open-access, evidence tier **A**
- Backs:
  - hydroponic spinach grown in a closed plant factory under four DLIs, 11.5, 14.4, 17.3 and 20.2 mol/m2/d, crossed with four spectra
  - total fresh and dry weight, energy yield and light use efficiency were highest at 17.3 mol/m2/d (with a red:blue ratio of 1.2), and net photosynthetic rate peaked at 17.3 regardless of spectrum, with 20.2 giving less
- **Caveat:** The article is CC BY 4.0, and this entry rests on the abstract and the Crossref record. The lowest level tested, 11.5 mol/m2/d, is a plant-factory setting far above what a garden bed offers in spring. The trial finds an optimum and places no minimum. The catalog spinach row therefore stays a Tier C class inference and cites this work in the documentation only.

#### `garbuzov2014-attractiveness`

Garbuzov, Mihail; Ratnieks, Francis L. W. (2014). *Quantifying variation among garden plants in attractiveness to bees and other flower-visiting insects*. Functional Ecology 28: 364-374

- DOI: [10.1111/1365-2435.12178](https://doi.org/10.1111/1365-2435.12178)
- Verification: Crossref-verified | Access: open-access, evidence tier **A**
- Backs:
  - that garden plants differ by more than an order of magnitude in the flower visitors they attract, and that the difference is a property of the plant
- **Caveat:** Counts are of 32 summer-flowering garden varieties in southern England. The ranking isn't a global one and doesn't cover most food crops.

#### `gimsing2006-glucosinolate-soil`

Gimsing, A. L.; Kirkegaard, J. A. (2006). *Glucosinolate and isothiocyanate concentration in soil following incorporation of Brassica biofumigants*. Soil Biology and Biochemistry 38: 2255-2264

- DOI: [10.1016/j.soilbio.2006.01.024](https://doi.org/10.1016/j.soilbio.2006.01.024)
- Verification: Crossref-verified | Access: paywalled, evidence tier **B**
- Backs:
  - glucosinolate and isothiocyanate concentrations in soil peak immediately (30 min) after incorporation of pulverized Brassica tissue, and are detectable for up to 8 d (GSL) and 12 d (ITC)
  - maximum total ITC concentration 21.6 nmol/g soil for rape and 90.6 nmol/g for mustard
  - ITC release efficiency 26% for high-glucosinolate rape and 56% for mustard when tissue is pulverized
  - the amount released is generally proportional to the glucosinolate content of the incorporated tissue, so cultivar choice matters
  - irrigating with 18 mm of water over 3 h had no effect on either GSL or ITC concentration
  - a significant proportion of plant glucosinolate persists un-hydrolyzed in soil for several days after incorporation
- **Caveat:** Elsevier paywalls the full text, and this entry rests on the abstract and the Crossref record. Every treatment in this study used pulverized tissue, so on its own this paper doesn't demonstrate maceration dependence. It establishes the high-release end of the range. The contrast that shows maceration matters comes from morra2002-isothiocyanate-release, where simple incorporation yielded 1% or less. The two papers only make the argument together. It's a field/lab study on rape and mustard only, with no garden-scale trial and no pest-outcome measurement.

#### `govaerts2021-wcvp`

Govaerts, Rafaël; Nic Lughadha, Eimear; Black, Nicholas; Turner, Robert; Paton, Alan. (2021). *The World Checklist of Vascular Plants, a continuously updated resource for exploring global plant diversity*. Scientific Data 8: 215

- DOI: [10.1038/s41597-021-00997-6](https://doi.org/10.1038/s41597-021-00997-6)
- Verification: Crossref-verified | Access: open-access, evidence tier **A**
- Backs:
  - where each catalog species is recorded as native, at TDWG level 3, introductions excluded
- **Caveat:** A checklist of the wild species. It says nothing about cultivated varieties bred from one, and native status isn't a statement that a plant will grow well in a given garden.

#### `hargreaves1985-reference-et`

Hargreaves, George H.; Samani, Zohrab A. (1985). *Reference Crop Evapotranspiration from Temperature*. Applied Engineering in Agriculture 1: 96-99

- DOI: [10.13031/2013.26773](https://doi.org/10.13031/2013.26773)
- Verification: Crossref-verified | Access: paywalled, evidence tier **B**
- Backs:
  - the reference-evapotranspiration fallback used when humidity or wind are missing from the TMY
- **Caveat:** A temperature-only method, less accurate than FAO-56 Penman-Monteith. This app uses it only as a documented fallback. The panel names which method produced each figure.

#### `harrington-soil-temperature-germination`

Harrington, J. F. (2013). *Soil temperature conditions for vegetable seed germination*. Oregon State University Extension Service

- URL: <https://extension.oregonstate.edu/gardening/soil-compost/soil-temperature-conditions-vegetable-seed-germination>
- Archived: <https://web.archive.org/web/20260805220201/https://extension.oregonstate.edu/gardening/soil-compost/soil-temperature-conditions-vegetable-seed-germination>
- Verification: URL-verified | Access: public-domain, evidence tier **C**
- Backs:
  - minSoilTempC per crop: a minimum / optimum range / optimum / maximum soil temperature table in degrees F for roughly 30 vegetables, e.g. 'Tomato 50 60-85 85 95'
  - the qualifier that daily fluctuation to 60 F or lower at night is essential for some species
- **Caveat:** It's an extension web factsheet and isn't a journal paper. The underlying experiment is mid-20th-century UC Davis work, and the page gives no primary citation for it. It reports germination temperature, which is a different quantity from a growth or transplant threshold. Its minimum column can't serve as a base temperature for GDD. OSU asserts university copyright.

#### `hear-hpwra-cashew`

Hawaiian Ecosystems at Risk project, Pacific Island Ecosystems at Risk (PIER). (n.d.). *Anacardium occidentale (cashew): Hawaii-Pacific Weed Risk Assessment, Pacific Island Ecosystems at Risk (PIER)*. Hawaiian Ecosystems at Risk project (HEAR)

- URL: <http://www.hear.org/pier/wra/pacific/anacardium_occidentale_htmlwra.htm>
- Archived: <https://web.archive.org/web/20260711014415/http://www.hear.org/pier/wra/pacific/anacardium_occidentale_htmlwra.htm>
- Verification: URL-verified | Access: public-domain, evidence tier **C**
- Backs:
  - cashew invasiveStatus
    - "RISK ASSESSMENT RESULTS: Low risk, score: 0" (Header of the Hawaii-Pacific Weed Risk Assessment page for Anacardium occidentale)
- **Caveat:** Published outside a peer-reviewed journal.

#### `hear-hpwra-lagenaria-siceraria`

Hawaiian Ecosystems at Risk project (HEAR), Pacific Island Ecosystems at Risk (PIER). (n.d.). *Lagenaria siceraria risk assessment (Hawaii-Pacific Weed Risk Assessment)*. Hawaiian Ecosystems at Risk project

- URL: <http://www.hear.org/pier/wra/pacific/lagenaria_siceraria_htmlwra.htm>
- Archived: <https://web.archive.org/web/20230601224239/http://www.hear.org/pier/wra/pacific/lagenaria_siceraria_htmlwra.htm>
- Verification: URL-verified | Access: public-domain, evidence tier **C**
- Backs:
  - bottle-gourd invasiveStatus
    - "RISK ASSESSMENT RESULTS: Low risk, score: 0" (HEAR (Hawaiian Ecosystems at Risk) Hawaii-Pacific Weed Risk Assessment page for Lagenaria siceraria)
- **Caveat:** Published outside a peer-reviewed journal.

#### `hear-hpwra-macadamia-integrifolia`

Hawaiian Ecosystems at Risk project (HEAR), Pacific Island Ecosystems at Risk (PIER). (n.d.). *Macadamia integrifolia risk assessment (Hawaii-Pacific Weed Risk Assessment)*. Hawaiian Ecosystems at Risk project

- URL: <http://www.hear.org/pier/wra/pacific/macadamia_integrifolia_htmlwra.htm>
- Archived: <https://web.archive.org/web/20261017214126/http://www.hear.org/pier/wra/pacific/macadamia_integrifolia_htmlwra.htm>
- Verification: URL-verified | Access: public-domain, evidence tier **C**
- Backs:
  - macadamia invasiveStatus
    - "RISK ASSESSMENT RESULTS: Low risk, score: -1" (HEAR (Hawaiian Ecosystems at Risk) Hawaii-Pacific Weed Risk Assessment page for Macadamia integrifolia)
- **Caveat:** Published outside a peer-reviewed journal.

#### `hear-pier-carthamus-tinctorius`

US Forest Service, Pacific Island Ecosystems at Risk (PIER). (2018). *Carthamus tinctorius: info from PIER*. USDA Forest Service Institute of Pacific Islands Forestry, Pacific Island Ecosystems at Risk (PIER), hosted by the Hawaiian Ecosystems at Risk project (HEAR)

- URL: <http://www.hear.org/pier/species/carthamus_tinctorius.htm>
- Archived: <https://web.archive.org/web/20250328062158/http://www.hear.org/pier/species/carthamus_tinctorius.htm>
- Verification: URL-verified | Access: public-domain, evidence tier **C**
- Backs:
  - safflower invasiveStatus
    - "Risk assessment results: High risk; score: 8 ( Hawaii-Pacific Weed Risk Assessment for Carthamus tinctorius )" (PIER species page, 'Risk assessment results' line)
- **Caveat:** Published outside a peer-reviewed journal.

#### `hear-pier-dysphania-ambrosioides`

Pacific Island Ecosystems at Risk project (PIER). (n.d.). *Dysphania ambrosioides: info from PIER*. Hawaiian Ecosystems at Risk project (HEAR), PIER

- URL: <http://www.hear.org/pier/species/dysphania_ambrosioides.htm>
- Archived: <https://web.archive.org/web/20261017220035/http://www.hear.org/pier/species/dysphania_ambrosioides.htm>
- Verification: URL-verified | Access: public-domain, evidence tier **C**
- Backs:
  - epazote invasiveStatus
    - "O‘ahu Island introduced invasive Wagner, Warren L./Herbst, Derral R./Sohmer, S. H. (1999) (p. 537)" (HEAR PIER species page 'Dysphania ambrosioides: info from PIER', table 'Presence', rows for the State of Hawaii (one per))
- **Caveat:** Published outside a peer-reviewed journal.

#### `hear-pier-eryngium-foetidum`

Pacific Island Ecosystems at Risk project (PIER). (n.d.). *Eryngium foetidum: info from PIER*. Hawaiian Ecosystems at Risk project (HEAR), PIER

- URL: <http://www.hear.org/pier/species/eryngium_foetidum.htm>
- Archived: <https://web.archive.org/web/20251211052305/http://www.hear.org/pier/species/eryngium_foetidum.htm>
- Verification: URL-verified | Access: public-domain, evidence tier **C**
- Backs:
  - culantro invasiveStatus
    - "O‘ahu Island introduced invasive cultivated Wagner, Warren L./Herbst, Derral R./Sohmer, S. H. (1999) (p. 199)" (HEAR PIER species page 'Eryngium foetidum: info from PIER', table 'Presence', row for the State of Hawaii, O‘ahu Island,)
- **Caveat:** Published outside a peer-reviewed journal.

#### `hear-pier-lablab-purpureus`

US Forest Service, Pacific Island Ecosystems at Risk (PIER). (2013). *Lablab purpureus: info from PIER*. USDA Forest Service Institute of Pacific Islands Forestry, Pacific Island Ecosystems at Risk (PIER), hosted by the Hawaiian Ecosystems at Risk project (HEAR)

- URL: <http://www.hear.org/pier/species/lablab_purpureus.htm>
- Archived: <https://web.archive.org/web/20261017221403/http://www.hear.org/pier/species/lablab_purpureus.htm>
- Verification: URL-verified | Access: public-domain, evidence tier **C**
- Backs:
  - lablab invasiveStatus
    - "Risk assessment results: Evaluate, score: 5 ( Go to the risk assessment )" (PIER species page, 'Risk assessment results' line)
- **Caveat:** Published outside a peer-reviewed journal.

#### `hear-pier-setaria-italica`

US Forest Service, Pacific Island Ecosystems at Risk (PIER). (2011). *Setaria italica: info from PIER*. USDA Forest Service Institute of Pacific Islands Forestry, Pacific Island Ecosystems at Risk (PIER), hosted by the Hawaiian Ecosystems at Risk project (HEAR)

- URL: <http://www.hear.org/pier/species/setaria_italica.htm>
- Archived: <https://web.archive.org/web/20260215021723/http://www.hear.org/pier/species/setaria_italica.htm>
- Verification: URL-verified | Access: public-domain, evidence tier **C**
- Backs:
  - foxtail-millet invasiveStatus
    - "Risk assessment results: Evaluate, score: 3 (Go to the risk assessment ( Australia )). High risk, score 9 (Go to the risk assessment ( Pacific ))." (PIER species page, 'Risk assessment results' lines)
- **Caveat:** Published outside a peer-reviewed journal.

#### `hermann-heller-1997-andean-roots-tubers`

Hermann, M.; Heller, J. (1997). *Andean roots and tubers: Ahipa, arracacha, maca and yacon (Promoting the conservation and use of underutilized and neglected crops 21)*. Institute of Plant Genetics and Crop Plant Research (IPK), Gatersleben, Germany, and International Plant Genetic Resources Institute (IPGRI), Rome, Italy

- URL: <https://hdl.handle.net/10568/104208>
- Verification: URL-verified | Access: public-domain, evidence tier **C**
- Backs:
  - jicama nfix
    - "three cultivars of P. erosus (reproductively pruned harvested after 154-168 days): 162-215 kg N/ha (or 84-107 g N/t biomass per day)" (Chapter 'Ahipa (Pachyrhizus ahipa (Wedd.) Parodi)' (M. Sørensen, W. J. Grüneberg and B. Ørting), section 4.1 Biological nitrogen fixation, page 27, on Castellanos et al. 1997's field trial in Mexico)
- **Caveat:** A scholarly monograph (IPK and IPGRI), outside the usual extension, USDA and FAO classes. Its 154-168 days to harvest are for reproductively pruned trial plants and the book doesn't say what the count starts from, so the catalog's season length for jicama comes from UF/IFAS HS615. The catalog row comments say which figure each sentence gives.

#### `hoanghua2024-white-rot`

Hoang Hua, Giang; Wilson, Christopher R.; Dung, Jeremiah K. S. (2024). *Evaluation of Bait Crops for the Integrated Management of White Rot (Sclerotium cepivorum) in Allium Crops*. Plant Disease 108: 118-124

- DOI: [10.1094/PDIS-04-23-0688-RE](https://doi.org/10.1094/PDIS-04-23-0688-RE)
- Verification: Crossref-verified | Access: paywalled, evidence tier **B**
- Backs:
  - bait crops and germination stimulants as the only experimental lever against allium white rot
  - hard rule: if white rot is reported at a site, exclude Alliums indefinitely and offer no rotation interval
- **Caveat:** The 20-40 year sclerotial survival figure and the 'rotation does not work' conclusion come from UC IPM, UMass and RHS extension pages, NOT from this paper. Those extension pages weren't fetched.

#### `holden2012-trap-crop-design`

Holden, Matthew H.; Ellner, Stephen P.; Lee, Doo-Hyung; Nyrop, Jan P.; Sanderson, John P. (2012). *Designing an effective trap cropping strategy: the effects of attraction, retention and plant spatial distribution*. Journal of Applied Ecology 49: 715-722

- DOI: [10.1111/j.1365-2664.2012.02137.x](https://doi.org/10.1111/j.1365-2664.2012.02137.x)
- Verification: Crossref-verified | Access: paywalled, evidence tier **B**
- Backs:
  - retention is the limiting factor in trap cropping, and attraction is the lesser one
  - untended trap crops act as pest nurseries that concentrate and then release pests

#### `holliday1960-population-yield`

Holliday, R. (1960). *Plant Population and Crop Yield*. Nature 186: 22-24

- DOI: [10.1038/186022b0](https://doi.org/10.1038/186022b0)
- Verification: Crossref-verified | Access: paywalled, evidence tier **A**
- Backs:
  - parabolic density-yield response for reproductive yield, used in mature-footprint fit
- **Caveat:** There's no Holliday 1968 in Nature. Nature 217:289-290 (1968), 'Plant Competition and Crop Yield', is by Farazdaghi & Harris (farazdaghi1968-competition-yield). Holliday's paper is the 1960 Nature 186:22-24 record here. The two are different papers by different author teams and are often conflated.

#### `hooks2010-marigold-nematode`

Hooks, Cerruti R. R.; Wang, Koon-Hui; Ploeg, Antoon; McSorley, Robert. (2010). *Using marigold (Tagetes spp.) as a cover crop to protect crops from plant-parasitic nematodes*. Applied Soil Ecology 46: 307-320

- DOI: [10.1016/j.apsoil.2010.09.005](https://doi.org/10.1016/j.apsoil.2010.09.005)
- Verification: Crossref-verified | Access: paywalled, evidence tier **B**
- Backs:
  - marigold (Tagetes spp.) grown as a cover crop as a recognized tactic for suppressing plant-parasitic nematodes
  - alpha-terthienyl as the compound marigold is known among nematologists for producing, allelopathic to many plant-parasitic nematode species
  - the mechanism is UNRESOLVED and possibly multiple: allelopathy from root or shoot tissue, poor host status, enhancement of nematode-antagonistic microorganisms, or a 'dead-end' trap crop, potentially operating simultaneously
  - outcomes are highly variable, ranging from more effective than nematicides or soil fumigants to a negative impact on cash crop growth and yield
  - the named sources of that variability: how the marigold is used (intercrop vs cover crop vs soil amendment), seeding rate, interval between marigold and cash crop, cultivar, nematode species or race, temperature and marigold plant age
- **Caveat:** It's a literature review and isn't a trial. The abstract's own conclusion is that the mechanism is uncertain and the results contradictory. Elsevier paywalls the full text, and this entry rests on the abstract and the Crossref record. The abstract addresses plant-parasitic nematodes generally. It doesn't single out root-knot nematode (Meloidogyne), and it doesn't use the phrase 'full-season'. So it can't back a companion rule that claims root-knot-specific suppression from a full-season stand. It's tier B because the results are replicated but strongly context-dependent, with management preconditions. Tier A needs a characterized mechanism, and the review states that this one isn't.

#### `hummer2006-blue-honeysuckle`

Hummer, Kim E. (2006). *Blue Honeysuckle: A New Berry Crop for North America*. Journal of the American Pomological Society 60: 3-8

- DOI: [10.71318/apom.2006.60.1.3](https://doi.org/10.71318/apom.2006.60.1.3)
- Verification: Crossref-verified | Access: open-access, evidence tier **C**
- Backs:
  - haskap chill, why the row carries no chill figure
    - "Notwithstanding this cold hardiness, the buds have a very short chilling, i.e., rest, requirement. In St. Petersburg, rest is satisfied by late October or early November (6)." (page 5)
- **Caveat:** A review of the crop by the USDA ARS curator at Corvallis, with no trial of its own. License CC BY-NC 4.0.

#### `iastate-extension-2015-aronia`

Hannan, Joe. (2015). *Growing Aronia in Iowa*. Iowa State University Extension and Outreach, Yard and Garden

- URL: <https://yardandgarden.extension.iastate.edu/article/2015/02-13/aronia.htm>
- Archived: <https://web.archive.org/web/20260419193722/https://yardandgarden.extension.iastate.edu/article/2015/02-13/aronia.htm>
- Verification: URL-verified | Access: public-domain, evidence tier **C**
- Backs:
  - harvest timing for aronia
    - "The fruit ripen from late August through mid-September" (Third paragraph of the article (fruiting-habit paragraph))
- **Caveat:** Published outside a peer-reviewed journal. Its dates are calibrated to Iowa, and this app places them at the same point in each garden's own frost-free season.

#### `iastate-extension-2019-chinese-chestnut`

O'Malley, Patrick. (2019). *What is Chinese Chestnut?* Iowa State University Extension and Outreach, Yard and Garden

- URL: <https://yardandgarden.extension.iastate.edu/article/2019/11/what-chinese-chestnut>
- Archived: <https://web.archive.org/web/20260420012400/https://yardandgarden.extension.iastate.edu/article/2019/11/what-chinese-chestnut>
- Verification: URL-verified | Access: public-domain, evidence tier **C**
- Backs:
  - chestnut height
    - "Eventually after several decades the trees can reach a height of 40-60’ and a spread of 30’ and potentially produce 50 lbs. of nuts." (Iowa State University Extension, "What is Chinese Chestnut?" article)
  - chestnut width
    - "Eventually after several decades the trees can reach a height of 40-60’ and a spread of 30’ and potentially produce 50 lbs. of nuts." (Iowa State University Extension, "What is Chinese Chestnut?" article)
- **Caveat:** Published outside a peer-reviewed journal.

#### `iastate-extension-2025-rhubarb`

Iowa State University Extension and Outreach. (2025). *Growing Rhubarb in Iowa*. Iowa State University Extension and Outreach, Yard and Garden

- URL: <https://yardandgarden.extension.iastate.edu/how-to/growing-rhubarb-iowa>
- Archived: <https://web.archive.org/web/20260626185155/https://yardandgarden.extension.iastate.edu/how-to/growing-rhubarb-iowa>
- Verification: URL-verified | Access: public-domain, evidence tier **C**
- Backs:
  - harvest timing for rhubarb
    - "Begin harvesting rhubarb when stalks reach 10 to 15 inches long (usually sometime in April or early May in Iowa). Rhubarb can be harvested for eight to ten weeks, ending in mid-June" ("Harvesting > When to Harvest" section)
- **Caveat:** Published outside a peer-reviewed journal. Its dates are calibrated to Iowa, represented by Des Moines, and this app places them at the same point in each garden's own frost-free season. Rhubarb's start date is the middle of the stated range, April to early May.

#### `iastate-extension-red-mulberry`

Iowa State University Extension and Outreach, Natural Resources. (n.d.). *Red Mulberry (Iowa Trees)*. Iowa State University Extension and Outreach

- URL: <https://naturalresources.extension.iastate.edu/forestry/iowa_trees/trees/red_mulberry.html>
- Archived: <https://web.archive.org/web/20260615140520/https://naturalresources.extension.iastate.edu/forestry/iowa_trees/trees/red_mulberry.html>
- Verification: URL-verified | Access: public-domain, evidence tier **C**
- Backs:
  - mulberry-red height
    - "Height: 30-45 feet" (Iowa State University Extension, Natural Resources, Red Mulberry page, fact list at the top (last reviewed March 1, 2019))
  - mulberry-red width
    - "Width: 25-35 feet" (Iowa State University Extension, Natural Resources, Red Mulberry page, fact list at the top)
  - mulberry-red coldLimit
    - "Hardiness: Zones 5 through 10" (Iowa State University Extension, Natural Resources, Red Mulberry page, fact list at the top)
- **Caveat:** Published outside a peer-reviewed journal.

#### `iimr-2017-finger-millet-pop`

ICAR-Indian Institute of Millets Research. (2017). *Recommended Package of Practices: Finger Millet (Eleusine coracana Gaertn.)*. ICAR-Indian Institute of Millets Research

- URL: <https://www.millets.res.in/technologies/1-Recommended_Package_of_Practices-Finger_Millet.pdf>
- Archived: <https://web.archive.org/web/20260116064853/https://millets.res.in/technologies/1-Recommended_Package_of_Practices-Finger_Millet.pdf>
- Verification: URL-verified | Access: public-domain, evidence tier **C**
- Backs:
  - finger-millet spacing
    - "Maintenance of optimum plant population of 4-5 lakh plants ha-1 this is attained by line sowing using seed drill giving a spacing of 22.5-30 cm between rows and 7.5-10 cm between plants" ('Sowing/Planting' section)
- **Caveat:** Published outside a peer-reviewed journal.

#### `iimr-foxtail-millet-package-of-practices`

ICAR-Indian Institute of Millets Research. (n.d.). *Recommended package of practices: Foxtail millet (Setaria italica L.)*. ICAR-Indian Institute of Millets Research

- URL: <https://www.millets.res.in/technologies/2-Recommended_Package_of_Practices-Foxtail_Millet.pdf>
- Archived: <https://web.archive.org/web/20260116054858/https://millets.res.in/technologies/2-Recommended_Package_of_Practices-Foxtail_Millet.pdf>
- Verification: URL-verified | Access: public-domain, evidence tier **C**
- Backs:
  - foxtail-millet spacing
    - "25-30 cm between rows and 8-10 cm between plants within a row" (Page 1, heading 'Spacing')
- **Caveat:** Published outside a peer-reviewed journal.

#### `illinois-extension-herbs-bay-laurel`

University of Illinois Extension. (n.d.). *Bay Laurel*. University of Illinois Extension

- URL: <https://extension.illinois.edu/herbs/bay-laurel>
- Archived: <https://web.archive.org/web/20260801075018/https://extension.illinois.edu/herbs/bay-laurel>
- Verification: URL-verified | Access: public-domain, evidence tier **C**
- Backs:
  - harvest timing for bay-laurel
    - "Leaves can be harvested throughout the season as needed" ("Harvesting" section)
- **Caveat:** Published outside a peer-reviewed journal. Its dates are calibrated to Illinois, and this app places them at the same point in each garden's own frost-free season.

#### `illinois-extension-herbs-caraway`

University of Illinois Extension. (n.d.). *Caraway | Herbs | Illinois Extension*. University of Illinois Extension

- URL: <https://extension.illinois.edu/herbs/caraway>
- Archived: <https://web.archive.org/web/20260520042439/https://extension.illinois.edu/herbs/caraway>
- Verification: URL-verified | Access: public-domain, evidence tier **C**
- Backs:
  - caraway height
    - "The second season the plant grows to 2 to 3 feet tall and produces a large, flat-topped flower head with white flowers." (Opening paragraph)
  - caraway yearsToFirstHarvest
    - "Caraway is a biennial plant that produces seeds the second season after planting." (Opening paragraph)
- **Caveat:** Published outside a peer-reviewed journal.

#### `illinois-extension-herbs-chives`

University of Illinois Extension. (n.d.). *Chives*. University of Illinois Extension

- URL: <https://extension.illinois.edu/herbs/chives>
- Archived: <https://web.archive.org/web/20260316020433/https://extension.illinois.edu/herbs/chives>
- Verification: URL-verified | Access: public-domain, evidence tier **C**
- Backs:
  - harvest timing for chives
    - "Harvest chives throughout the season to prevent the leaves from becoming tough and to encourage formation of new bulblets" ("Harvesting" section)
- **Caveat:** Published outside a peer-reviewed journal. Its dates are calibrated to Illinois, and this app places them at the same point in each garden's own frost-free season.

#### `illinois-extension-herbs-lemon-balm`

University of Illinois Extension. (n.d.). *Lemon Balm*. University of Illinois Extension

- URL: <https://extension.illinois.edu/herbs/lemon-balm>
- Archived: <https://web.archive.org/web/20260722033611/https://extension.illinois.edu/herbs/lemon-balm>
- Verification: URL-verified | Access: public-domain, evidence tier **C**
- Backs:
  - harvest timing for lemon-balm
    - "Stems can be cut as needed anytime during the season preferably before flowering" ("Harvesting" section)
- **Caveat:** Published outside a peer-reviewed journal. Its dates are calibrated to Illinois, and this app places them at the same point in each garden's own frost-free season.

#### `illinois-extension-herbs-lovage`

University of Illinois Extension. (n.d.). *Lovage*. University of Illinois Extension

- URL: <https://extension.illinois.edu/herbs/lovage>
- Archived: <https://web.archive.org/web/20260608051235/https://extension.illinois.edu/herbs/lovage>
- Verification: URL-verified | Access: public-domain, evidence tier **C**
- Backs:
  - harvest timing for lovage
    - "Leaves and stems can be used fresh anytime they are needed" ("Harvesting" section)
- **Caveat:** Published outside a peer-reviewed journal. Its dates are calibrated to Illinois, and this app places them at the same point in each garden's own frost-free season.

#### `illinois-extension-herbs-rosemary`

University of Illinois Extension. (n.d.). *Rosemary*. University of Illinois Extension

- URL: <https://extension.illinois.edu/herbs/rosemary>
- Archived: <https://web.archive.org/web/20260808094249/https://extension.illinois.edu/herbs/rosemary>
- Verification: URL-verified | Access: public-domain, evidence tier **C**
- Backs:
  - harvest timing for rosemary
    - "The tender tips and foliage can be cut as needed throughout the growing season" ("Harvesting" section)
- **Caveat:** Published outside a peer-reviewed journal. Its dates are calibrated to Illinois, and this app places them at the same point in each garden's own frost-free season.

#### `illinois-extension-herbs-sage`

University of Illinois Extension. (n.d.). *Sage*. University of Illinois Extension

- URL: <https://extension.illinois.edu/herbs/sage>
- Archived: <https://web.archive.org/web/20260615212638/https://extension.illinois.edu/herbs/sage>
- Verification: URL-verified | Access: public-domain, evidence tier **C**
- Backs:
  - harvest timing for sage
    - "Leaves can be harvested through the season as needed" ("Harvest" section)
- **Caveat:** Published outside a peer-reviewed journal. Its dates are calibrated to Illinois, and this app places them at the same point in each garden's own frost-free season.

#### `illinois-extension-herbs-savory-winter`

University of Illinois Extension. (n.d.). *Savory: Winter*. University of Illinois Extension

- URL: <https://extension.illinois.edu/herbs/savory-winter>
- Archived: <https://web.archive.org/web/20260312080832/https://extension.illinois.edu/herbs/savory-winter>
- Verification: URL-verified | Access: public-domain, evidence tier **C**
- Backs:
  - harvest timing for winter-savory
    - "Young shoots and leaves can be harvested throughout the growing season" ("Harvest" section)
- **Caveat:** Published outside a peer-reviewed journal. Its dates are calibrated to Illinois, and this app places them at the same point in each garden's own frost-free season.

#### `illinois-extension-herbs-tarragon-french`

University of Illinois Extension. (n.d.). *Tarragon: French*. University of Illinois Extension

- URL: <https://extension.illinois.edu/herbs/tarragon-french>
- Archived: <https://web.archive.org/web/20260421040030/https://extension.illinois.edu/herbs/tarragon-french>
- Verification: URL-verified | Access: public-domain, evidence tier **C**
- Backs:
  - harvest timing for tarragon
    - "Young stem tips and leaves can be harvested as needed throughout the season" ("Harvesting" section)
- **Caveat:** Published outside a peer-reviewed journal. Its dates are calibrated to Illinois, and this app places them at the same point in each garden's own frost-free season.

#### `illinois-extension-herbs-thyme`

University of Illinois Extension. (n.d.). *Thyme*. University of Illinois Extension

- URL: <https://extension.illinois.edu/herbs/thyme>
- Archived: <https://web.archive.org/web/20260216045059/https://extension.illinois.edu/herbs/thyme>
- Verification: URL-verified | Access: public-domain, evidence tier **C**
- Backs:
  - harvest timing for thyme
    - "Stems of thyme can be cut through the season but is best cut just before the plant starts to flower" ("Harvesting" section)
- **Caveat:** Published outside a peer-reviewed journal. Its dates are calibrated to Illinois, and this app places them at the same point in each garden's own frost-free season.

#### `illinois-extension-lemon-verbena`

University of Illinois Extension. (n.d.). *Lemon Verbena (Herb Gardening)*. University of Illinois Extension

- URL: <https://extension.illinois.edu/herbs/lemon-verbena>
- Archived: <https://web.archive.org/web/20260516233307/https://extension.illinois.edu/herbs/lemon-verbena>
- Verification: URL-verified | Access: public-domain, evidence tier **C**
- Backs:
  - lemon-verbena harvestSeason
    - "Harvest leaves as needed throughout the season." (Harvesting section)
  - lemon-verbena light
    - "Outdoors, place the plant in a full sun location." (Growing: Tender Perennial paragraph)
- **Caveat:** Published outside a peer-reviewed journal.

#### `jose-juglone`

Jose, Shibu; Holzmueller, Eric J. (2008). *Black Walnut Allelopathy: Implications for Intercropping*. Allelopathy in Sustainable Agriculture and Forestry 303-319

- DOI: [10.1007/978-0-387-77337-7_16](https://doi.org/10.1007/978-0-387-77337-7_16)
- Verification: Crossref-verified | Access: paywalled, evidence tier **C**
- Backs:
  - juglone allelopathy is Grade C: laboratory toxicity is real, landscape-scale evidence is weak
- **Caveat:** Crossref returns NO issued year for this chapter. 2008 is the book year and isn't Crossref-confirmed. The two sources behind the skeptical reading of juglone, a ResearchGate copy and a WSU Extension fact sheet, aren't peer reviewed and are unverified here.

#### `kattge2020-try`

Kattge, Jens; Bönisch, Gerhard; Díaz, Sandra; Lavorel, Sandra. (2020). *TRY plant trait database - enhanced coverage and open access*. Global Change Biology 26: 119-188

- DOI: [10.1111/gcb.14904](https://doi.org/10.1111/gcb.14904)
- Verification: Crossref-verified | Access: open-access
- Backs:
  - candidate plant trait source for mature footprint and functional traits
- **Caveat:** Crossref records online publication in 2019, and the issue is 2020. The database has access conditions distinct from the article's CC BY license, and its license compatibility with a commercial product wasn't evaluated.

#### `kau-2016-package-of-practices-crops`

Directorate of Extension, Kerala Agricultural University. (2016). *Package of Practices Recommendations: Crops 2016 (15th edition)*. Kerala Agricultural University, Directorate of Extension

- URL: <https://kau.in/sites/default/files/documents/pop2016.pdf>
- Archived: <https://web.archive.org/web/20260119200851/https://kau.in/sites/default/files/documents/pop2016.pdf>
- Verification: URL-verified | Access: public-domain, evidence tier **C**
- Backs:
  - black-pepper spacing
    - "The spacing recommended is 3 m x 3 m on plain lands and 2 m between plants in rows across the slope and 4 m between rows on sloppy lands." (p. 138 (PDF p. 146 of 401), section 'Field planting' under BLACK PEPPER (Piper nigrum))
  - black-pepper width
    - "The spacing recommended is 3 m x 3 m on plain lands and 2 m between plants in rows across the slope and 4 m between rows on sloppy lands." (p. 138 (PDF p. 146 of 401), section 'Field planting' under BLACK PEPPER (Piper nigrum))
  - black-pepper coldLimit
    - "The plant tolerates a minimum temperature of 10oC and maximum of 40oC, the optimum being 20 - 30oC." (p. 136 (PDF p. 144 of 401), opening paragraphs of BLACK PEPPER (Piper nigrum))
  - black-pepper light
    - "When pepper is grown in open places, shading and watering of the young seedlings may be done during summer months for the first 1 to 3 years according to necessity." (p. 139 (PDF p. 147 of 401), section 'Management after planting')
- **Caveat:** Published outside a peer-reviewed journal.

#### `kelly2020-lettuce-dli`

Kelly, Nathan; Choe, Daegeun; Meng, Qingwu; Runkle, Erik S. (2020). *Promotion of lettuce growth under an increasing daily light integral depends on the combination of the photosynthetic photon flux density and photoperiod*. Scientia Horticulturae 272: 109565

- DOI: [10.1016/j.scienta.2020.109565](https://doi.org/10.1016/j.scienta.2020.109565)
- Verification: Crossref-verified | Access: paywalled, evidence tier **A**
- Backs:
  - lettuce 'Rex' and 'Rouxai' grown indoors at DLIs of 6.9, 10.4 and 15.6 mol/m2/d (PPFD 120 to 270 umol/m2/s, photoperiods 16 to 24 h): shoot fresh and dry mass, leaf number and leaf width increased with DLI
  - at 15.6 mol/m2/d a lower PPFD over a longer photoperiod gave more fresh and dry mass than a higher PPFD over a shorter one, and the interaction was absent at 10.4
- **Caveat:** The full text is paywalled, and this entry rests on the abstract and the Crossref record. The lowest DLI, 6.9 mol/m2/d, still grew both cultivars to harvest, with the smallest plants. The trial establishes that growth rises with DLI across 6.9 to 15.6 and places no failure point. It's indoor sole-source LED culture, so the figures are levels of a lamp schedule and can't serve as a garden threshold.

#### `khan2008-push-pull-economics`

Khan, Zeyaur R.; Midega, Charles A. O.; Njuguna, Elizabeth M.; Amudavi, David M. (2008). *Economic performance of the 'push-pull' technology for stemborer and Striga control in smallholder farming systems in western Kenya*. Crop Protection 27: 1084-1097

- DOI: [10.1016/j.cropro.2008.01.005](https://doi.org/10.1016/j.cropro.2008.01.005)
- Verification: Crossref-verified | Access: paywalled, evidence tier **A**
- Backs:
  - field economic performance of push-pull in western Kenya

#### `khan2008-push-pull-onfarm`

Khan, Zeyaur R.; Midega, Charles A. O.; Amudavi, David M.; Hassanali, Ahmed; Pickett, John A. (2008). *On-farm evaluation of the 'push-pull' technology for the control of stemborers and striga weed on maize in western Kenya*. Field Crops Research 106: 224-233

- DOI: [10.1016/j.fcr.2007.12.002](https://doi.org/10.1016/j.fcr.2007.12.002)
- Verification: Crossref-verified | Access: paywalled, evidence tier **A**
- Backs:
  - on-farm replicated evidence for push-pull, Field Crops Research 106(3)

#### `khan2010-push-pull`

Khan, Zeyaur R.; Midega, Charles A. O.; Bruce, Toby J. A.; Hooper, Antony M.; Pickett, John A. (2010). *Exploiting phytochemicals for developing a 'push-pull' crop protection strategy for cereal farmers in Africa*. Journal of Experimental Botany 61: 4185-4196

- DOI: [10.1093/jxb/erq229](https://doi.org/10.1093/jxb/erq229)
- Verification: Crossref-verified | Access: paywalled, evidence tier **A**
- Backs:
  - push-pull as a Grade A outcome with a characterized mechanism
  - named attribution to Zeyaur Khan and icipe per the TEK rule on crediting individual innovators
- **Caveat:** It's grade A for the outcome, and that outcome doesn't transfer to a temperate garden. The mechanism has since been revised: Desmodium intercepts and kills stemborer and fall armyworm larvae, which revises the older repels-adults account. The revision is erdei2024-desmodium-interception (eLife 13:e88695). It doesn't extend to the Striga mechanism, which involves a different pest guild and a different chemistry.

#### `klein2007-pollinators`

Klein, Alexandra-Maria; Vaissière, Bernard E.; Cane, James H.; Steffan-Dewenter, Ingolf; Cunningham, Saul A.; Kremen, Claire; Tscharntke, Teja. (2007). *Importance of pollinators in changing landscapes for world crops*. Proceedings of the Royal Society B: Biological Sciences 274: 303-313

- DOI: [10.1098/rspb.2006.3721](https://doi.org/10.1098/rspb.2006.3721)
- Verification: Crossref-verified | Access: open-access, evidence tier **A**
- Backs:
  - how much a crop's yield depends on animal pollination, by crop and by harvested organ
- **Caveat:** The paper states its classes for crops at the level of the harvested product, across 107 world crops. This app applies them at the level of botanical family and harvested organ, which is an inference from the paper and isn't a per-species reading of it.

#### `kstate-butler-county-ground-cherry`

K-State Research and Extension, Butler County. (n.d.). *Ground Cherry*. Kansas State University, K-State Research and Extension, Butler County

- URL: <https://www.butler.k-state.edu/horticulture/gardener-resources/seed-libraries/groundcherry.html>
- Archived: <https://web.archive.org/web/20261017215013/https://www.butler.k-state.edu/horticulture/gardener-resources/seed-libraries/groundcherry.html>
- Verification: URL-verified | Access: public-domain, evidence tier **C**
- Backs:
  - ground-cherry daysToMaturity
    - "Usually, fruits will ripen ten to eleven weeks after transplanting outdoors." (Harvest and Storage section)
  - ground-cherry light
    - "Sunlight: Ground cherries prefer eight hours of direct light on a daily basis." (Growing notes, Sunlight entry)
- **Caveat:** Published outside a peer-reviewed journal.

#### `ksu-extension-2010-organic-pawpaw`

Pomper, Kirk W.; Crabtree, Sheri B.; Lowe, Jeremy D. (2010). *Organic Production of Pawpaw*. Kentucky State University Cooperative Extension Program

- URL: <https://www.kysu.edu/wp-content/uploads/2017/09/OrganicPawpawPBI-004-New-2.pdf>
- Archived: <https://web.archive.org/web/20261017211855/https://www.kysu.edu/wp-content/uploads/2017/09/OrganicPawpawPBI-004-New-2.pdf>
- Verification: URL-verified | Access: public-domain, evidence tier **C**
- Backs:
  - harvest timing for pawpaw
    - "Depending on the variety, fruit ripen in late-August to early-October. Fruit ripen on the same tree over about a 2 week period, which reflects an extended spring flowering period" (PBI-004, p. 1)
- **Caveat:** Published outside a peer-reviewed journal. Its dates are calibrated to Frankfort, Kentucky, home of the KSU Pawpaw Research Program, and this app places them at the same point in each garden's own frost-free season.

#### `kubota-osu-strawberry-dli`

Kubota Lab, The Ohio State University. (n.d.). *Environment*. Controlled Environment Berry Production Information

- URL: <https://u.osu.edu/indoorberry/environment/>
- Archived: <https://web.archive.org/web/20261017210823/https://u.osu.edu/indoorberry/environment/>
- Verification: URL-verified | Access: open-access, evidence tier **C**
- Backs:
  - greenhouse strawberry DLI guidance
    - "We recommend 12 mol/m2/day DLI to target as minimum level for good productivity and consider the optimum between 20-25 mol/m2/d" (paragraph headed "DLI")
  - a strawberry light ceiling
    - "Under DLI exceeding 30 mol/m2/d, strawberry plants tend to be stressed (shading is required in that case)" (paragraph headed "DLI")
- **Caveat:** Greenhouse production guidance from a university lab page, undated and without a primary citation for the numbers. Its 12 mol/m2/d minimum is a greenhouse-productivity floor and isn't the same quantity as the 25 mol/m2/d agrivoltaic average-yield convention in widmer-strawberry-dli, which is what the catalog gate uses. The two are recorded side by side in Decision Record 23. The 30 mol/m2/d stress point is the only strawberry light ceiling located and isn't yet wired into the catalog.

#### `lai2022-legume-cereal-n`

Lai, Hangxian; Gao, Fake; Su, Hao; Zheng, Peng. (2022). *Nitrogen Distribution and Soil Microbial Community Characteristics in a Legume-Cereal Intercropping System: A Review*. Agronomy 12: 1900

- DOI: [10.3390/agronomy12081900](https://doi.org/10.3390/agronomy12081900)
- Verification: Crossref-verified | Access: open-access, evidence tier **C**
- Backs:
  - supporting review for legume-cereal nitrogen dynamics

#### `lerner2020-purdue-planting-calendar`

Lerner, B. Rosie. (2020). *Indiana Vegetable Planting Calendar*. Purdue University Cooperative Extension Service HO-186-W

- URL: <https://www.extension.purdue.edu/extmedia/HO/HO-186-W.pdf>
- Archived: <https://web.archive.org/web/20251217183844/https://www.extension.purdue.edu/extmedia/ho/ho-186-w.pdf>
- Verification: URL-verified | Access: public-domain, evidence tier **C**
- Backs:
  - frostOffsetDays by hardiness class
    - "plant 4-6 weeks before last spring frost" (Table 1, hardy (tolerates hard frost))
    - "plant 2-4 weeks before last spring frost" (Table 1, semi-hardy (tolerates light frost))
    - "plant after average last spring frost (minimum air temp 50 F)" (Table 1, tender)
    - "plant at least two weeks after average last spring frost (minimum air temp 60-65 F)" (Table 1, very tender)
  - fall window rule
    - "plant at least 4-8 weeks before first fall frost" (Table 2, cool season plants for late-summer or fall planting)
  - minSoilTempC per crop from Table 3, 'Soil Temperatures for Vegetable Seed Germination', giving optimum, optimum range, minimum and maximum in degrees F
  - the crop-to-hardiness-class assignment for roughly 30 common vegetables
- **Caveat:** Published outside a peer-reviewed journal. Its dates are calibrated to Indiana, and its own frost maps are drawn at the 10% exceedance level. The publication states that the 50% level falls about two weeks earlier in spring and two weeks later in fall. Its offsets only hold against a stated percentile, and an unqualified 'average frost date' leaves them ambiguous. Purdue asserts university copyright, and this bibliography classifies it as public domain by its convention for extension output.

#### `long2024-blueberry-lsp`

Long, Yu; Tan, Xiaofeng; Zhu, Jing; An, Hua. (2024). *Response of blueberry photosynthetic physiology to light intensity during different stages of fruit development*. PLOS ONE 19: e0310252

- DOI: [10.1371/journal.pone.0310252](https://doi.org/10.1371/journal.pone.0310252)
- Verification: Crossref-verified | Access: open-access, evidence tier **C**
- Backs:
  - highbush blueberry light saturation point near 500 umol/m2/s under field conditions
  - Pmax, apparent quantum yield, LCP and LSP all decline under sustained low light
- **Caveat:** A single study of a single species. The paper circulates with neither authors nor DOI, and both are supplied here. The PLOS ONE full text never states '500' as a light saturation point. The nearest textual anchor is a Pn-vs-PAR curve described as plateauing at 400 umol/m2/s, and the fitted LSP values appear only in a bar chart (Fig 3), beyond reach of any text extraction. The '~500 umol/m2/s' figure that circulates for this paper is unconfirmed, so it can't back a hard filter.

#### `lsu-agcenter-2017-beans`

LSU AgCenter. (2017). *Beans (Pub. 2309)*. Louisiana State University Agricultural Center

- URL: <https://www.lsuagcenter.com/~/media/system/c/7/1/0/c710883aa4ed69a0304445fab01c9399/pub%202309%20beans%20gardening%20tipspdf.pdf>
- Archived: <https://web.archive.org/web/20251108194758/https://www.lsuagcenter.com/~/media/system/c/7/1/0/c710883aa4ed69a0304445fab01c9399/pub%202309%20beans%20gardening%20tipspdf.pdf>
- Verification: URL-verified | Access: public-domain, evidence tier **C**
- Backs:
  - lima-bean spacing
    - "Bush beans are planted in rows 3 feet apart. Plant 1/2 inch deep. After plants are up (7-12 days), thin limas to 3-5 inches apart [...] For pole beans, plant hills of two or three seeds every 12 inches apart in the row. Space these rows 3-4 feet apart." (p. 1-2, 'Cultural Practices' section)
  - lima-bean height
    - "Many pole varieties will grow 10-12 feet, so be prepared." (p. 1, 'Cultural Practices' section)
  - lima-bean light
    - "Choose a fertile, well-drained area that receives full sunlight." (p. 1, 'Cultural Practices' section)
- **Caveat:** Published outside a peer-reviewed journal.

#### `lsuagcenter-2017-mirlitons`

Timmerman, Anna. (2017). *Got Mirlitons? Or Chayote? How About Alligator Pears?* LSU AgCenter (Jefferson Parish Extension, "GNO Gardening" newsletter)

- URL: <https://www.lsuagcenter.com/~/media/system/0/7/6/8/076829d1e19d5482e65dc24f45dfa6ae/january%202017pdf.pdf>
- Archived: <https://web.archive.org/web/20251108222040/https://www.lsuagcenter.com/~/media/system/0/7/6/8/076829d1e19d5482e65dc24f45dfa6ae/january%202017pdf.pdf>
- Verification: URL-verified | Access: public-domain, evidence tier **C**
- Backs:
  - chayote daysToMaturity
    - "The vine will die back in a frost, but a thick mulch around the roots will keep the plant happy and it will regrow in the spring. It typically takes 150 frost free days before the vine will produce more mirlitons." (Feature article text, January 2017 "GNO Gardening" newsletter)
- **Caveat:** Published outside a peer-reviewed journal.

#### `magness-1971-food-and-feed-crops-dandelion`

Magness, J.R.; Markle, G.M.; Compton, C.C. (1971). *Dandelion (Food and feed crops of the United States)*. Purdue University Center for New Crops and Plant Products (NewCROP), reproducing Magness et al. 1971

- URL: <https://hort.purdue.edu/newcrop/Crops/Dandelion.html>
- Archived: <https://web.archive.org/web/20261017220233/https://hort.purdue.edu/newcrop/Crops/Dandelion.html>
- Verification: URL-verified | Access: public-domain, evidence tier **C**
- Backs:
  - dandelion width
    - "Cultivated forms may have rosettes of leaves spreading to 18 to 24 inches on established plants." (Entry 'Dandelion' in Magness, Markle and Compton 1971, 'Food and feed crops of the United States', as reproduced by Purd)
- **Caveat:** Published outside a peer-reviewed journal.

#### `mahr-2025-anise-hyssop`

Mahr, Susan. (2025). *Anise hyssop, Agastache foeniculum*. University of Wisconsin-Madison Division of Extension

- URL: <https://hort.extension.wisc.edu/articles/anise-hyssop-agastache-foeniculum/>
- Archived: <https://web.archive.org/web/20260514111527/https://hort.extension.wisc.edu/articles/anise-hyssop-agastache-foeniculum/>
- Verification: URL-verified | Access: public-domain, evidence tier **C**
- Backs:
  - harvest timing for anise-hyssop
    - "The best time to harvest foliage to dry is when the flowers are just past full bloom, as the oil content in the leaves is the highest at that time, but they can be used at any time" (main overview text (before the "Landscape Use" heading))
- **Caveat:** Published outside a peer-reviewed journal. Its dates are calibrated to Wisconsin, and this app places them at the same point in each garden's own frost-free season.

#### `maine-dacf-2024-invasive-plants-do-not-sell-list`

Maine Department of Agriculture, Conservation and Forestry, Horticulture Program. (2024). *Invasive Plants: Do Not Sell Plant List (Chapter 273, Criteria for Listing Invasive Terrestrial Plants)*. State of Maine

- URL: <https://www.maine.gov/dacf/php/horticulture/invasiveplants.shtml>
- Archived: <https://web.archive.org/web/20261011010722/https://www.maine.gov/dacf/php/horticulture/invasiveplants.shtml>
- Verification: URL-verified | Access: public-domain, evidence tier **C**
- Backs:
  - sea-buckthorn invasiveStatus
    - "The invasive plants listed below are illegal to import, export, buy, sell or intentionally propagate for sale or distribution in Maine. The ban includes all cultivars, varieties and hybrids of these plants. [...] Hippophae rhamnoides Sea buckthorn January 1, 2024" ("Do Not Sell Plant List" table, row for Hippophae rhamnoides (the 2024 handout PDF also names it, saved as maine-dacf-in))
- **Caveat:** Published outside a peer-reviewed journal.

#### `manitoba-agriculture-sea-buckthorn-production`

Manitoba Agriculture. (n.d.). *Sea Buckthorn Production in Manitoba*. Province of Manitoba

- URL: <https://www.gov.mb.ca/agriculture/crops/crop-management/fruit-crops/sea-buckthorn-production.html>
- Archived: <https://web.archive.org/web/20260604084535/https://www.gov.mb.ca/agriculture/crops/crop-management/fruit-crops/sea-buckthorn-production.html>
- Verification: URL-verified | Access: public-domain, evidence tier **C**
- Backs:
  - sea-buckthorn spacing
    - "Plants should be spaced three feet (1 m) between plants and 13 feet (4 m) between rows." ("Site Selection/Spacing/Rooting Depth" section)
  - sea-buckthorn height
    - "The sea buckthorn is a medium deciduous shrub six to 13 feet (2 to 4 m) in height." ("Description" section)
  - sea-buckthorn coldLimit
    - "Sea buckthorn plants are very hardy and can withstand temperatures of -45 to 103 °F (-43 to 40 °C)." ("Description" section)
- **Caveat:** Published outside a peer-reviewed journal.

#### `mansion-vaquie2019-aphids`

Mansion-Vaquié, Agathe; Ferrer, Astrid; Ramon-Portugal, Felipe; Wezel, Alexander. (2019). *Intercropping impacts the host location behaviour and population growth of aphids*. Entomologia Experimentalis et Applicata 168: 41-52

- DOI: [10.1111/eea.12848](https://doi.org/10.1111/eea.12848)
- Verification: Crossref-verified | Access: paywalled, evidence tier **B**
- Backs:
  - intercropping disrupts aphid host location, consistent with the green-surface-area mechanism

#### `marcelis2006-light-response`

Marcelis, L. F. M.; Broekhuijsen, A. G. M.; Meinen, E.; Nijs, E. M. F. M.; Raaphorst, M. G. M. (2006). *Quantification of the growth response to light quantity of greenhouse grown crops*. Acta Horticulturae 97-104

- DOI: [10.17660/ActaHortic.2006.711.9](https://doi.org/10.17660/ActaHortic.2006.711.9)
- Verification: Crossref-verified | Access: paywalled, evidence tier **B**
- Backs:
  - refinement of the 1%-light rule to 0.7-1.0% yield decline per 1% radiation reduction
  - the relative effect is larger at low light, higher CO2, and in winter
- **Caveat:** Crossref gives pages 97-104. The pair 97-103 also circulates. Same greenhouse-only restriction as Cockshull 1992.

#### `martin-guay2018-ler`

Martin-Guay, Marc-Olivier; Paquette, Alain; Dupras, Jérôme; Rivest, David. (2018). *The new Green Revolution: Sustainable intensification of agriculture by intercropping*. Science of The Total Environment 615: 767-772

- DOI: [10.1016/j.scitotenv.2017.10.024](https://doi.org/10.1016/j.scitotenv.2017.10.024)
- Verification: Crossref-verified | Access: paywalled, evidence tier **A**
- Backs:
  - intercropping mean land equivalent ratio 1.30 (23% less land), with 38% more gross energy (relative land output 1.38) and 33% more gross income (1.33), from 939 observations in 126 studies
  - LER was unaffected by irrigation, aridity index, fertilization and intercropping pattern, so the benefit isn't conditional on water stress
  - TEK design rule 7: LER-style portfolio yield reporting in place of single-crop maximization
- **Caveat:** Martin-Guay et al. report a single mean LER of 1.30. The range 1.22-1.32 that circulates for intercropping merges two meta-analyses: 1.22 is the mean LER of Yu et al. 2015 (yu2015-temporal-niche-ler, 1.22 +/- 0.02), and 1.32 corresponds to nothing in either paper. Cite each meta-analysis separately.

#### `morra2002-isothiocyanate-release`

Morra, M. J.; Kirkegaard, J. A. (2002). *Isothiocyanate release from soil-incorporated Brassica tissues*. Soil Biology and Biochemistry 34: 1683-1690

- DOI: [10.1016/S0038-0717(02)00153-0](https://doi.org/10.1016/S0038-0717(02)00153-0)
- Verification: Crossref-verified | Access: paywalled, evidence tier **B**
- Backs:
  - MACERATION DEPENDENCE, the core of the biofumigation rule: with simple incorporation, 'only 1% or less of the ITC predicted from tissue glucosinolate concentrations was measured in soil'
  - cell-level tissue disruption by freezing and thawing raised maximum ITC to 40-75 nmol/g soil, increasing release efficiency to 14 and 26%
  - maximum ITC concentrations near 1.0 nmol/g soil immediately after simple incorporation, with little production after 4 d
  - the authors' management conclusion: choose a high-glucosinolate rapeseed or mustard variety, provide adequate moisture, and above all maximize cell disruption
- **Caveat:** Elsevier paywalls the full text, and this entry rests on the abstract and the Crossref record. The cell disruption tested here is freeze-thaw in a controlled study. The study didn't test field maceration by a flail mower or a garden spade. That a gardener's chopping achieves the same disruption is an inference this paper doesn't make. It measures ITC concentration in soil and doesn't measure pest suppression or crop outcome, so nothing here shows a garden pest was controlled. It covers rapeseed and Indian mustard only.

#### `msu-extension-2018-growing-serviceberries`

Palmer, Dara. (2018). *Growing Serviceberries*. Montana State University Extension (MontGuide MT201821AG)

- URL: <https://extension-store.montana.edu/montguides/growing-serviceberries>
- Archived: <https://web.archive.org/web/20261017211507/https://extension-store.montana.edu/montguides/growing-serviceberries>
- Verification: URL-verified | Access: public-domain, evidence tier **C**
- Backs:
  - harvest timing for serviceberry
    - "Serviceberry fruit ripens in late June through July" (Section ‘Harvest and Uses’)
- **Caveat:** Published outside a peer-reviewed journal. Its dates are calibrated to Montana, and this app places them at the same point in each garden's own frost-free season.

#### `mt-pleasant2010-iroquoian`

Mt. Pleasant, Jane; Burt, Robert F. (2010). *Estimating Productivity of Traditional Iroquoian Cropping Systems from Field Experiments and Historical Literature*. Journal of Ethnobiology 30: 52-79

- DOI: [10.2993/0278-0771-30.1.52](https://doi.org/10.2993/0278-0771-30.1.52)
- Verification: Crossref-verified | Access: paywalled, evidence tier **B**
- Backs:
  - quantified productivity of Haudenosaunee Three Sisters cropping
  - attribution of the Three Sisters system specifically to Haudenosaunee and Mesoamerican peoples

#### `mu-2017-alfalfa-g4550`

Henning, Jimmy C.; Nelson, C. J. (2017). *Alfalfa (G4550)*. University of Missouri Extension

- URL: <https://extension.missouri.edu/publications/g4550>
- Archived: <https://web.archive.org/web/20260412094455/https://extension.missouri.edu/publications/g4550>
- Verification: URL-verified | Access: public-domain, evidence tier **C**
- Backs:
  - alfalfa harvestSeason
    - "For established stands, take the first (May 10 to 20) and second (June 15 to 25) cuttings when the plants are just beginning to bloom. For persistence of the stand, make two more harvests at about 35-day intervals before Sept. 15." (Section 'Harvest management')
- **Caveat:** Published outside a peer-reviewed journal.

#### `mu-2018-growing-millets`

Myers, Rob. (2018). *Growing Millets for Grain, Forage or Cover Crop Use (G4164)*. University of Missouri Extension

- URL: <https://extension.missouri.edu/publications/g4164>
- Archived: <https://web.archive.org/web/20260617222052/https://extension.missouri.edu/publications/g4164>
- Verification: URL-verified | Access: public-domain, evidence tier **C**
- Backs:
  - foxtail-millet daysToMaturity
    - "Maturity varies with foxtail, proso, Japanese and browntop millet being the fastest maturing types (60-90 days depending on planting date and variety and weather)" (Table 3 (Millet seeding rates and primary U.S. markets), footnote)
- **Caveat:** Published outside a peer-reviewed journal.

#### `mu-agroforestry-2009-black-walnut-nut-production`

Reid, William; Coggeshall, Mark; Garrett, H. E. "Gene"; Van Sambeek, Jerry. (2009). *Growing Black Walnut for Nut Production (AF1011)*. University of Missouri Center for Agroforestry

- URL: <https://extension.missouri.edu/media/wysiwyg/Extensiondata/Pub/pdf/agguides/agroforestry/af1011.pdf>
- Archived: <https://web.archive.org/web/20261017213309/https://extension.missouri.edu/media/wysiwyg/Extensiondata/Pub/pdf/agguides/agroforestry/af1011.pdf>
- Verification: URL-verified | Access: public-domain, evidence tier **C**
- Backs:
  - black-walnut spacing
    - "Minimum tree spacing should be 25 to 30 feet depending on soil type." (AF1011, "Orchard Design" section, p. 4)
  - black-walnut yearsToFirstHarvest
    - "Trees should start to bear nuts within four to six years after transplanting." (AF1011, "Methods for Establishing Black Walnut Trees" > "Grafted trees" subsection, p. 5)
  - black-walnut harvestSeason
    - "In areas with a 195-day frost-free growing season such as central Missouri, early-ripening cultivars mature Sept. 1-14 [...] Mid-season cultivars ripen Sept. 15-28 and late-ripening cultivars become harvestable after Sept. 28." (AF1011, "Ripening season" section, p. 4)
- **Caveat:** Published outside a peer-reviewed journal.

#### `mu-agroforestry-2022-chinese-chestnut`

Revord, Ron; Gold, Michael; Meier, Nicholas; Webber, J. Bryan; Hunt, Ken; Warmund, Michele. (2022). *Growing and Marketing Chinese Chestnuts (AF1007)*. University of Missouri Center for Agroforestry

- URL: <https://extension.missouri.edu/media/wysiwyg/Extensiondata/Pub/pdf/agguides/agroforestry/af1007.pdf>
- Archived: <https://web.archive.org/web/20260609052850/https://extension.missouri.edu/media/wysiwyg/Extensiondata/Pub/pdf/agguides/agroforestry/af1007.pdf>
- Verification: URL-verified | Access: public-domain, evidence tier **C**
- Backs:
  - chestnut spacing
    - "Chinese chestnut trees naturally form wide spreading crowns that grow to a height of 35 to 40 feet. Spacing your trees at least 40 to 50 feet apart will allow ample room for tree growth and allow easy access to all sides of the tree at harvest time." (AF1007, "Backyard trees" section, p. 9)
  - chestnut yearsToFirstHarvest
    - "Grafted trees come into bearing two or three years following establishment, depending on tree growth rate." (AF1007, "Planting grafted trees" section, p. 6)
  - chestnut harvestSeason
    - "Chinese chestnut is a medium-sized tree with spreading habit and is covered with burs filled with nuts stretching from September into October in Missouri." (AF1007, photo caption, p. 1)
  - chestnut coldLimit
    - "Chinese chestnuts can tolerate -20 °F temperatures when fully dormant" (AF1007, p. 3)
  - chestnut light
    - "Chestnuts require full sun for best nut production so they should not be planted adjacent to large shade trees." (AF1007, pp. 9-10 (sentence spans the page break))
- **Caveat:** Published outside a peer-reviewed journal.

#### `mu-agroforestry-2022-pecan`

Reid, William; Templemire, Aaron. (2022). *Growing Pecans in Missouri (AF1002)*. University of Missouri Center for Agroforestry

- URL: <https://extension.missouri.edu/media/wysiwyg/Extensiondata/Pub/pdf/agguides/agroforestry/af1002.pdf>
- Archived: <https://web.archive.org/web/20260421003223/https://extension.missouri.edu/media/wysiwyg/Extensiondata/Pub/pdf/agguides/agroforestry/af1002.pdf>
- Verification: URL-verified | Access: public-domain, evidence tier **C**
- Backs:
  - pecan height
    - "The largest member of the hickory family, pecan trees often grow to a height of over 70 feet with a spread of greater than 80 feet." (AF1002, p. 1 (introduction))
  - pecan width
    - "The largest member of the hickory family, pecan trees often grow to a height of over 70 feet with a spread of greater than 80 feet." (AF1002, p. 1 (introduction))
  - pecan yearsToFirstHarvest
    - "Trees should start to bear nuts within five to seven years after transplanting." (AF1002, "Grafted Trees" subsection, p. 7)
- **Caveat:** Published outside a peer-reviewed journal.

#### `nakamura1989-winged-bean-okinawa`

Nakamura, Hiroshi; Abe, Jiro. (1989). *Growth and Yields of Winged Bean Grown in Different Seasons in Okinawa*. Japan Agricultural Research Quarterly 23: 71-77

- URL: <https://www.jircas.go.jp/en/publication/jarq/23/1/71>
- Archived: <https://web.archive.org/web/20251208131005/https://www.jircas.go.jp/en/publication/jarq/23/1/71>
- Verification: URL-verified | Access: open-access, evidence tier **C**
- Backs:
  - winged-bean photoperiod toHarvestDays, plants sown into days shorter than 12 hours
    - "UPS-31 15 92 Dec. 9 57 94" (Table 1, the September 28 sowing, row UPS-31: 57 days in the column whose footnote reads 'Number of days from germination to the first flowering')
  - winged-bean photoperiod toHarvestDays. The catalog adds the 13.5-day midpoint to UPS-31's 57 days, 70.5 days to a first green pod
    - "Pods were carefully harvested before the suture became fibrous 12 to 15 days after flowering" (page 74, green pod production)
- **Caveat:** One site at 24 N in one year. Its photoperiods include civil twilight. The days to flowering count from germination, so for a plant already growing when days shorten they overstate the wait.

#### `ncstate-ces-diospyros-virginiana`

NC State Extension. (n.d.). *Diospyros virginiana (American Persimmon, Common Persimmon, Date Plum, Eastern Persimmon, Jove's Fruit, Persimmon, Possum Apples, Possumwood, Simmon, Winter Plum)*. NC State University Extension, Plant Toolbox

- URL: <https://plants.ces.ncsu.edu/plants/diospyros-virginiana/>
- Archived: <https://web.archive.org/web/20261012154934/https://plants.ces.ncsu.edu/plants/diospyros-virginiana/>
- Verification: URL-verified | Access: public-domain, evidence tier **C**
- Backs:
  - american-persimmon height
    - "Height: 30 ft. 0 in. - 80 ft. 0 in." ("Dimensions" field)
  - american-persimmon width
    - "Width: 20 ft. 0 in. - 35 ft. 0 in." ("Dimensions" field)
- **Caveat:** Published outside a peer-reviewed journal.

#### `ncstate-ces-ginger`

NC State Extension. (n.d.). *Zingiber officinale | North Carolina Extension Gardener Plant Toolbox*. NC State Extension

- URL: <https://plants.ces.ncsu.edu/plants/zingiber-officinale/>
- Archived: <https://web.archive.org/web/20260520220212/https://plants.ces.ncsu.edu/plants/zingiber-officinale/>
- Verification: URL-verified | Access: public-domain, evidence tier **C**
- Backs:
  - ginger height
    - "Height: 2 ft. 0 in. - 4 ft. 0 in." (Dimensions field, plant database entry)
  - ginger width
    - "Width: 2 ft. 0 in. - 3 ft. 0 in." (Dimensions field, plant database entry)
  - ginger coldLimit
    - "While it thrives in zones 9-12, you can grow this tropical plant in a container or as an annual in cooler climates." (Description section; see also the 'USDA Plant Hardiness Zone' field (9a, 9b, 10a, 10b, 11a, 11b, 12a, 12b) and the '#fro)
- **Caveat:** Published outside a peer-reviewed journal.

#### `ncstate-ces-turmeric`

NC State Extension. (n.d.). *Curcuma longa (Common Turmeric, Turmeric) | North Carolina Extension Gardener Plant Toolbox*. NC State Extension

- URL: <https://plants.ces.ncsu.edu/plants/curcuma-longa/>
- Archived: <https://web.archive.org/web/20260516175633/https://plants.ces.ncsu.edu/plants/curcuma-longa/>
- Verification: URL-verified | Access: public-domain, evidence tier **C**
- Backs:
  - turmeric height
    - "Height: 3 ft. 0 in. - 4 ft. 0 in." (Dimensions field, plant database entry)
  - turmeric width
    - "Width: 3 ft. 0 in. - 4 ft. 0 in." (Dimensions field, plant database entry)
  - turmeric coldLimit
    - "The USDA Hardiness Zones are 8-11. In areas where the plant is not winter hardy, it may be grown as an annual." (Description section; see also the 'USDA Plant Hardiness Zone' field (8a, 8b, 9a, 9b, 10a, 10b, 11a, 11b))
  - turmeric light
    - "Common Turmeric grows best in hot, humid conditions with full sun in the morning and afternoon shade." (Description section)
- **Caveat:** Published outside a peer-reviewed journal.

#### `ncstate-extension-plant-toolbox-aloysia-citriodora`

North Carolina State Extension. (n.d.). *Aloysia citriodora (Lemon Beebrush, Lemon Verbena)*. North Carolina State Extension Gardener Plant Toolbox

- URL: <https://plants.ces.ncsu.edu/plants/aloysia-citriodora/>
- Archived: <https://web.archive.org/web/20260516104124/https://plants.ces.ncsu.edu/plants/aloysia-citriodora/>
- Verification: URL-verified | Access: public-domain, evidence tier **C**
- Backs:
  - lemon-verbena height
    - "Lemon verbena will grow 6 to 8 feet tall and wide in the ground but 2 to 4 feet tall and wide in a pot." (Description, second paragraph (the Dimensions list gives Height: 6 ft. 0 in. - 8 ft. 0 in.))
  - lemon-verbena width
    - "Lemon verbena will grow 6 to 8 feet tall and wide in the ground but 2 to 4 feet tall and wide in a pot." (Description, second paragraph (the Dimensions list gives Width: 6 ft. 0 in. - 8 ft. 0 in.))
  - lemon-verbena coldLimit
    - "In zones 8 and higher, it can be grown outdoors." (Description, second paragraph)
- **Caveat:** Published outside a peer-reviewed journal.

#### `ncstate-extension-plant-toolbox-stevia-rebaudiana`

North Carolina State Extension. (n.d.). *Stevia rebaudiana (Candy Leaf, Stevia, Sugar Leaf, Sweet Herb of Paraguay, Sweet Honey Leaf, Sweet Leaf)*. North Carolina State Extension Gardener Plant Toolbox

- URL: <https://plants.ces.ncsu.edu/plants/stevia-rebaudiana/>
- Archived: <https://web.archive.org/web/20260616095317/https://plants.ces.ncsu.edu/plants/stevia-rebaudiana/>
- Verification: URL-verified | Access: public-domain, evidence tier **C**
- Backs:
  - stevia height
    - "This plant grows up to 1 to 2 feet tall and equally as wide, and it is typically grown for its sweet tasting leaves that are ground to make a sugar substitute." (Description, first paragraph (the Dimensions list gives Height: 1 ft. 0 in. - 2 ft. 0 in.))
  - stevia width
    - "This plant grows up to 1 to 2 feet tall and equally as wide, and it is typically grown for its sweet tasting leaves that are ground to make a sugar substitute." (Description, first paragraph (the Dimensions list gives Width: 1 ft. 0 in. - 2 ft. 0 in.))
  - stevia light
    - "Sweet leaf prefers full sun and will tolerate partial shade and requires moist, well-drained, slightly acidic, organically rich, loamy, sandy soils." (Description, second paragraph (the Light list gives Full sun and Partial Shade))
- **Caveat:** Published outside a peer-reviewed journal.

#### `ncstate-plant-toolbox-crotalaria-juncea`

NC State Extension. (n.d.). *Crotalaria juncea (Sunn Hemp)*. North Carolina State University and N.C. A&T State University, North Carolina Extension Gardener Plant Toolbox

- URL: <https://plants.ces.ncsu.edu/plants/crotalaria-juncea/>
- Archived: <https://web.archive.org/web/20260519100449/https://plants.ces.ncsu.edu/plants/crotalaria-juncea/>
- Verification: URL-verified | Access: public-domain, evidence tier **C**
- Backs:
  - sunn-hemp width
    - "Width: 0 ft. 6 in. - 1 ft. 0 in." (Plant detail page, Attributes, Dimensions field)
  - sunn-hemp light
    - "Sunn hemp needs full sun." (Plant detail page, Description)
- **Caveat:** Published outside a peer-reviewed journal.

#### `ncstate-plant-toolbox-glycine-max`

NC State Extension. (n.d.). *Glycine max (soybean), NC State Extension Gardener Plant Toolbox*. North Carolina State University and North Carolina A&T State University, N.C. Cooperative Extension

- URL: <https://plants.ces.ncsu.edu/plants/glycine-max/>
- Archived: <https://web.archive.org/web/20260316235206/https://plants.ces.ncsu.edu/plants/glycine-max/>
- Verification: URL-verified | Access: public-domain, evidence tier **C**
- Backs:
  - soybean width
    - "Width: 0 ft. 9 in. - 2 ft. 0 in." (Plant detail page, 'Dimensions' under Attributes)
  - soybean light
    - "Soybean grows readily in most garden soils in full sun." ('Description' text, and 'Cultural Conditions', 'Light': 'Full sun (6 or more hours of direct sunlight a day)')
- **Caveat:** Published outside a peer-reviewed journal.

#### `ncstate-plant-toolbox-lablab-purpureus`

NC State Extension. (n.d.). *Lablab purpureus (Hyacinth Bean, Indian Bean, Lablab)*. North Carolina State University and N.C. A&T State University, North Carolina Extension Gardener Plant Toolbox

- URL: <https://plants.ces.ncsu.edu/plants/lablab-purpureus/>
- Archived: <https://web.archive.org/web/20260729022231/https://plants.ces.ncsu.edu/plants/lablab-purpureus/>
- Verification: URL-verified | Access: public-domain, evidence tier **C**
- Backs:
  - lablab height
    - "Height: 10 ft. 0 in. - 25 ft. 0 in." (Plant detail page, Attributes, Dimensions field)
  - lablab width
    - "Width: 3 ft. 0 in. - 6 ft. 0 in." (Plant detail page, Attributes, Dimensions field)
- **Caveat:** Published outside a peer-reviewed journal.

#### `ncstate-shew-stevia-production-north-carolina`

Shew, David. (n.d.). *Stevia Production in North Carolina*. North Carolina State University, Department of Plant Pathology and Center for Environmental Farming Systems

- URL: <https://cefs.ncsu.edu/wp-content/uploads/Stevia-FAQ.pdf>
- Archived: <https://web.archive.org/web/20261017215136/https://cefs.ncsu.edu/wp-content/uploads/Stevia-FAQ.pdf>
- Verification: URL-verified | Access: public-domain, evidence tier **C**
- Backs:
  - stevia yearsToFirstHarvest
    - "In the year of establishment, the crop is harvested once in September (sometimes twice)." (Page 2, answer to question 4 (How is stevia harvested and prepared for market?))
  - stevia harvestSeason
    - "After the first year, it is usually harvested twice per growing season, July and September, with a combine." (Page 2, answer to question 4. Region: North Carolina, mostly the eastern counties listed in the answer to question 5)
- **Caveat:** Published outside a peer-reviewed journal.

#### `ncstate-toolbox-bitter-melon`

NC State Extension Gardener Plant Toolbox. (n.d.). *Momordica charantia (Ampalaya, Balsam Pear, Bitter Gourd, Bitter Melon)*. NC State Extension (North Carolina State University / North Carolina A&T State University Cooperative Extension)

- URL: <https://plants.ces.ncsu.edu/plants/momordica-charantia/>
- Archived: <https://web.archive.org/web/20260316183547/https://plants.ces.ncsu.edu/plants/momordica-charantia/>
- Verification: URL-verified | Access: public-domain, evidence tier **C**
- Backs:
  - bitter-melon height
    - "The plant itself, is about 4 to 6 inches high, but the vine will grow rapidly to 12 to 20 feet long in a single growing season. [...] Dimensions: Height: 12 ft. 0 in. - 20 ft. 0 in." ("Description" text and structured "Dimensions" field, plant profile page)
  - bitter-melon width
    - "Dimensions: Height: 12 ft. 0 in. - 20 ft. 0 in. Width: 3 ft. 0 in. - 6 ft. 0 in." (Structured "Dimensions" field, plant profile page)
  - bitter-melon coldLimit
    - "Bitter Goard [sic] is a vigorous, tendril-bearing, frost tender, annual vine of the cucumber family and a native of tropical Africa and Asia. [...] The plants will die in fall at the time of first frost. [...] USDA Plant Hardiness Zone: 9a, 9b, 10a, 10b, 11a, 11b" ("Description" text and structured "Cultural Conditions" field, plant profile page)
  - bitter-melon light
    - "Light: Full sun (6 or more hours of direct sunlight a day) Partial Shade (Direct sunlight only part of the day, 2-6 hours)" (Structured "Cultural Conditions" field, plant profile page)
- **Caveat:** Published outside a peer-reviewed journal.

#### `ncstate-toolbox-burdock`

North Carolina State University Extension. (n.d.). *Arctium lappa (Great Burdock, Gobo), North Carolina Extension Gardener Plant Toolbox*. NC State Extension

- URL: <https://plants.ces.ncsu.edu/plants/arctium-lappa/>
- Archived: <https://web.archive.org/web/20260811110814/https://plants.ces.ncsu.edu/plants/arctium-lappa/>
- Verification: URL-verified | Access: public-domain, evidence tier **C**
- Backs:
  - burdock height
    - "Height: 2 ft. 0 in. - 10 ft. 0 in." ('Dimensions' block of the Plant Toolbox page)
  - burdock width
    - "Width: 2 ft. 0 in. - 4 ft. 0 in." ('Dimensions' block of the Plant Toolbox page)
  - burdock coldLimit
    - "USDA Plant Hardiness Zone: 3a, 3b, 4a, 4b, 5a, 5b, 6a, 6b, 7a, 7b, 8a, 8b, 9a, 9b, 10a, 10b" ('Cultural Conditions' block of the Plant Toolbox page)
  - burdock light
    - "It prefers full sun locations with moist, well drained soil rich in organic matter and nitrogen. [...] Full sun (6 or more hours of direct sunlight a day) Partial Shade (Direct sunlight only part of the day, 2-6 hours)" (Description paragraph and 'Cultural Conditions: Light' on the Plant Toolbox page)
- **Caveat:** Published outside a peer-reviewed journal.

#### `ncstate-toolbox-salsify`

North Carolina State University Extension. (n.d.). *Tragopogon porrifolius (Common Salsify, Purple Goat's Beard, Oyster Plant), North Carolina Extension Gardener Plant Toolbox*. NC State Extension

- URL: <https://plants.ces.ncsu.edu/plants/tragopogon-porrifolius/>
- Archived: <https://web.archive.org/web/20260510145754/https://plants.ces.ncsu.edu/plants/tragopogon-porrifolius/>
- Verification: URL-verified | Access: public-domain, evidence tier **C**
- Backs:
  - salsify height
    - "larger species, up to 4 feet tall" ('Quick ID Hints' list on the Plant Toolbox page)
  - salsify light
    - "Purple Goat's Beard performs best in full sun and sandy, loamy, and clay soils. [...] Full sun (6 or more hours of direct sunlight a day) Partial Shade (Direct sunlight only part of the day, 2-6 hours)" (Description paragraph and 'Cultural Conditions: Light' on the Plant Toolbox page)
- **Caveat:** Published outside a peer-reviewed journal.

#### `ncsu-2023-commercial-luffa-sponge-gourd`

Davis, Jeanine. (2023). *Commercial Luffa Sponge Gourd Production (Horticulture Information Leaflet)*. NC State University, NC State Extension

- URL: <https://content.ces.ncsu.edu/commercial-luffa-sponge-gourd-production>
- Archived: <https://web.archive.org/web/20260617064937/https://content.ces.ncsu.edu/commercial-luffa-sponge-gourd-production>
- Verification: URL-verified | Access: public-domain, evidence tier **C**
- Backs:
  - luffa coldLimit
    - "Luffa should be transplanted outdoors after all danger of frost is past." (NC State Extension, Commercial Luffa Sponge Gourd Production (Davis), section 'Selecting Seeds and Producing Transplants)
  - luffa light
    - "Luffa gourds require a well-drained soil in a location where they will have full sun and good air circulation." (NC State Extension, Commercial Luffa Sponge Gourd Production (Davis), section 'Site Selection and Fertilization')
- **Caveat:** Published outside a peer-reviewed journal.

#### `ncsu-ces-basella-alba`

NC State Extension. (n.d.). *Malabar Spinach - Basella alba*. NC State Extension (NC State University / N.C. A&T State University Cooperative Extension)

- URL: <https://plants.ces.ncsu.edu/plants/basella-alba/common-name/malabar-spinach/>
- Archived: <https://web.archive.org/web/20260412190005/https://plants.ces.ncsu.edu/plants/basella-alba/common-name/malabar-spinach/>
- Verification: URL-verified | Access: public-domain, evidence tier **C**
- Backs:
  - malabar-spinach width
    - "Width: 2 ft. 0 in. - 3 ft. 0 in." (Dimensions field, Basella alba plant profile (common name: Malabar Spinach))
- **Caveat:** Published outside a peer-reviewed journal.

#### `ncsu-ces-matricaria-chamomilla`

NC State Extension. (n.d.). *Chamomile - Matricaria chamomilla*. NC State Extension (NC State University / N.C. A&T State University Cooperative Extension)

- URL: <https://plants.ces.ncsu.edu/plants/matricaria-chamomilla/common-name/chamomile/>
- Archived: <https://web.archive.org/web/20260509163340/https://plants.ces.ncsu.edu/plants/matricaria-chamomilla/common-name/chamomile/>
- Verification: URL-verified | Access: public-domain, evidence tier **C**
- Backs:
  - chamomile width
    - "Width: 0 ft. 6 in. - 2 ft. 0 in." (Dimensions field, Matricaria chamomilla plant profile (common name: Chamomile))
  - chamomile light
    - "Full sun (6 or more hours of direct sunlight a day)" (Cultural Conditions > Light field, same Matricaria chamomilla plant profile)
- **Caveat:** Published outside a peer-reviewed journal.

#### `ncsu-extension-camellia-sinensis`

NC State Extension. (n.d.). *Camellia sinensis*. NC State Extension, Plant Toolbox

- URL: <https://plants.ces.ncsu.edu/plants/camellia-sinensis/>
- Archived: <https://web.archive.org/web/20261011054710/https://plants.ces.ncsu.edu/plants/camellia-sinensis/>
- Verification: URL-verified | Access: public-domain, evidence tier **C**
- Backs:
  - tea height
    - "Height: 6 ft. 0 in. - 15 ft. 0 in." ('Dimensions' field)
  - tea width
    - "Width: 4 ft. 0 in. - 8 ft. 0 in." ('Dimensions' field)
  - tea coldLimit
    - "is the Chinese variety that has small leaves and is more tolerant of cold weather hardy into USDA Zone 6 [...] is from the Assam region of northern India with larger leaves hardy to zone 7 and south." (Description section)
- **Caveat:** Published outside a peer-reviewed journal.

#### `ncsu-extension-linum-usitatissimum`

NC State Extension. (n.d.). *Linum usitatissimum*. NC State Extension, Plant Toolbox

- URL: <https://plants.ces.ncsu.edu/plants/linum-usitatissimum/>
- Archived: <https://web.archive.org/web/20260513074256/https://plants.ces.ncsu.edu/plants/linum-usitatissimum/>
- Verification: URL-verified | Access: public-domain, evidence tier **C**
- Backs:
  - flax light
    - "It does best in full sun and cannot grow in the shade." ('Linum usitatissimum' plant toolbox page, description text)
- **Caveat:** Published outside a peer-reviewed journal.

#### `ncsu-extension-parker-2022-tree-fruits-nuts`

Parker, Michael. (2022). *Tree Fruits and Nuts (Chapter 15), North Carolina Extension Gardener Handbook, 2nd ed.* NC State Extension

- URL: <https://content.ces.ncsu.edu/extension-gardener-handbook/15-tree-fruit-and-nuts>
- Archived: <https://web.archive.org/web/20260727114116/https://content.ces.ncsu.edu/extension-gardener-handbook/15-tree-fruit-and-nuts>
- Verification: URL-verified | Access: public-domain, evidence tier **C**
- Backs:
  - pecan light
    - "Fruit and nut trees need at least 6 hours of sunlight during the growing season." (NC State Extension Gardener Handbook, Chapter 15, "Site Selection" > "Sunlight")
- **Caveat:** Published outside a peer-reviewed journal.

#### `ncsu-extension-planttoolbox-citrus-x-paradisi`

NC State Extension. (n.d.). *Citrus x paradisi (Grapefruit)*. NC State University, NC State Extension (Plant Toolbox)

- URL: <https://plants.ces.ncsu.edu/plants/citrus-x-paradisi/>
- Archived: <https://web.archive.org/web/20260711180547/https://plants.ces.ncsu.edu/plants/citrus-x-paradisi/>
- Verification: URL-verified | Access: public-domain, evidence tier **C**
- Backs:
  - grapefruit height
    - "Height: 15 ft. 0 in. - 30 ft. 0 in." ("Dimensions" field, Attributes list)
  - grapefruit width
    - "Width: 15 ft. 0 in. - 30 ft. 0 in." ("Dimensions" field, Attributes list)
- **Caveat:** Published outside a peer-reviewed journal.

#### `ncsu-extension-planttoolbox-juglans-regia`

NC State Extension. (n.d.). *Juglans regia (Black Sea Walnut, Common Walnut, English Walnut, Persian Walnut)*. NC State University, NC State Extension (Plant Toolbox)

- URL: <https://plants.ces.ncsu.edu/plants/juglans-regia/>
- Archived: <https://web.archive.org/web/20261009004000/https://plants.ces.ncsu.edu/plants/juglans-regia/>
- Verification: URL-verified | Access: public-domain, evidence tier **C**
- Backs:
  - walnut height
    - "Height: 40 ft. 0 in. - 60 ft. 0 in." (NC State Plant Toolbox, Juglans regia page, "Dimensions" section)
  - walnut width
    - "Width: 40 ft. 0 in. - 60 ft. 0 in." (NC State Plant Toolbox, Juglans regia page, "Dimensions" section)
  - walnut coldLimit
    - "USDA Plant Hardiness Zone: 3a, 3b, 4a, 4b, 5a, 5b, 6a, 6b, 7a, 7b" (NC State Plant Toolbox, Juglans regia page, "Cultural Conditions" section)
- **Caveat:** Published outside a peer-reviewed journal.

#### `ncsu-extension-planttoolbox-ziziphus-jujuba`

NC State Extension. (n.d.). *Ziziphus jujuba (Chinese Date, Common Jujuba)*. NC State University, NC State Extension (Plant Toolbox)

- URL: <https://plants.ces.ncsu.edu/plants/ziziphus-jujuba/>
- Archived: <https://web.archive.org/web/20260510150609/https://plants.ces.ncsu.edu/plants/ziziphus-jujuba/>
- Verification: URL-verified | Access: public-domain, evidence tier **C**
- Backs:
  - jujube width
    - "Width: 10 ft. 0 in. - 30 ft. 0 in." ("Dimensions" field, Attributes list)
- **Caveat:** Published outside a peer-reviewed journal.

#### `ncsu-extension-toolbox-caraway`

North Carolina Extension Gardener Plant Toolbox. (n.d.). *Carum carvi (Caraway, Meridian Fennel, Persian Cumin) | North Carolina Extension Gardener Plant Toolbox*. NC State Extension

- URL: <https://plants.ces.ncsu.edu/plants/carum-carvi/>
- Archived: <https://web.archive.org/web/20260617012704/https://plants.ces.ncsu.edu/plants/carum-carvi/>
- Verification: URL-verified | Access: public-domain, evidence tier **C**
- Backs:
  - caraway width
    - "Carawy will grow 1 to 2 feet tall and spread 1 foot wide and prefers full sun to light shade in moist well-drained garden soil." (Description, second paragraph. The source spells the name 'Carawy'. The Dimensions field on the same page reads 'Width:)
  - caraway coldLimit
    - "USDA Plant Hardiness Zone: 4a, 4b, 5a, 5b, 6a, 6b, 7a, 7b, 8a, 8b, 9a, 9b" (Cultural Conditions, field 'USDA Plant Hardiness Zone')
  - caraway light
    - "Carawy will grow 1 to 2 feet tall and spread 1 foot wide and prefers full sun to light shade in moist well-drained garden soil. [...] Plants growing in full sun are richer in essential oils and, therefore more aromatic." (Description, second paragraph)
- **Caveat:** Published outside a peer-reviewed journal.

#### `ncsu-extension-toolbox-catnip`

North Carolina Extension Gardener Plant Toolbox. (n.d.). *Nepeta cataria (Catmint, Catnip, Catswort) | North Carolina Extension Gardener Plant Toolbox*. NC State Extension

- URL: <https://plants.ces.ncsu.edu/plants/nepeta-cataria/>
- Archived: <https://web.archive.org/web/20260511215201/https://plants.ces.ncsu.edu/plants/nepeta-cataria/>
- Verification: URL-verified | Access: public-domain, evidence tier **C**
- Backs:
  - catnip light
    - "‘Cataria’ catmint requires good drainage and full sun to part shade but tolerates many soil types. The plant is resistant to drought, dry soil, and air pollution but is somewhat intolerant of heat and humidity, so give it some afternoon shade." (Description, second paragraph (the Light field reads 'Full sun (6 or more hours of direct sunlight a day)' and 'Partial ))
- **Caveat:** Published outside a peer-reviewed journal.

#### `ncsu-extension-toolbox-cumin`

North Carolina Extension Gardener Plant Toolbox. (n.d.). *Cuminum cyminum (Cumin, Cummin, Jeera) | North Carolina Extension Gardener Plant Toolbox*. NC State Extension

- URL: <https://plants.ces.ncsu.edu/plants/cuminum-cyminum/>
- Archived: <https://web.archive.org/web/20260610032531/https://plants.ces.ncsu.edu/plants/cuminum-cyminum/>
- Verification: URL-verified | Access: public-domain, evidence tier **C**
- Backs:
  - cumin spacing
    - "When seedlings are 2 inches tall, thin them to 1 plant every 4 to 8 inches." (Description, second paragraph (planting instructions))
  - cumin width
    - "Available Space To Plant: Less than 12 inches" (Cultural Conditions, field 'Available Space To Plant')
  - cumin daysToMaturity
    - "It is vulnerable to frost, and needs 120 days of frost-free weather from planting to harvesting." (Description, second paragraph)
  - cumin coldLimit
    - "It is vulnerable to frost, and needs 120 days of frost-free weather from planting to harvesting." (Description, second paragraph (the page tags the plant '#frost tender'))
  - cumin light
    - "Full sun (6 or more hours of direct sunlight a day)" (Cultural Conditions, field 'Light')
- **Caveat:** Published outside a peer-reviewed journal.

#### `ncsu-extension-toolbox-dandelion`

North Carolina Extension Gardener Plant Toolbox. (n.d.). *Taraxacum officinale (Dandelion, Lion's Tooth) | North Carolina Extension Gardener Plant Toolbox*. NC State Extension

- URL: <https://plants.ces.ncsu.edu/plants/taraxacum-officinale/>
- Archived: <https://web.archive.org/web/20260825122450/https://plants.ces.ncsu.edu/plants/taraxacum-officinale/>
- Verification: URL-verified | Access: public-domain, evidence tier **C**
- Backs:
  - dandelion height
    - "Height: 0 ft. 2 in. - 0 ft. 6 in." (Attributes, field 'Dimensions')
  - dandelion light
    - "Dandelion grows in full sun and forms a deep taproot that can break up compact soils." (Description, second paragraph (the Light field reads 'Full sun (6 or more hours of direct sunlight a day)'))
- **Caveat:** Published outside a peer-reviewed journal.

#### `ncsu-extension-toolbox-echinacea`

North Carolina Extension Gardener Plant Toolbox. (n.d.). *Echinacea purpurea (Coneflower, Eastern Purple Coneflower, Purple Coneflower, Purple Rudbeckia) | North Carolina Extension Gardener Plant Toolbox*. NC State Extension

- URL: <https://plants.ces.ncsu.edu/plants/echinacea-purpurea/>
- Archived: <https://web.archive.org/web/20260618095222/https://plants.ces.ncsu.edu/plants/echinacea-purpurea/>
- Verification: URL-verified | Access: public-domain, evidence tier **C**
- Backs:
  - echinacea height
    - "Height: 3 ft. 0 in. - 4 ft. 0 in." (Attributes, field 'Dimensions')
  - echinacea width
    - "Width: 1 ft. 0 in. - 2 ft. 0 in." (Attributes, field 'Dimensions')
  - echinacea coldLimit
    - "USDA Plant Hardiness Zone: 3a, 3b, 4a, 4b, 5a, 5b, 6a, 6b, 7a, 7b, 8a, 8b" (Cultural Conditions, field 'USDA Plant Hardiness Zone')
  - echinacea light
    - "It is drought tolerant once established and can grow in full sun to partial shade." (Description, second paragraph (the Light field lists 'Full sun (6 or more hours of direct sunlight a day)' and 'Partial ))
- **Caveat:** Published outside a peer-reviewed journal.

#### `ncsu-extension-toolbox-epazote`

North Carolina Extension Gardener Plant Toolbox. (n.d.). *Dysphania ambrosioides (Epazote, Jusuit's Tea, Mexican Tea, Paico, Wormseed) | North Carolina Extension Gardener Plant Toolbox*. NC State Extension

- URL: <https://plants.ces.ncsu.edu/plants/dysphania-ambrosioides/>
- Archived: <https://web.archive.org/web/20260618100735/https://plants.ces.ncsu.edu/plants/dysphania-ambrosioides/>
- Verification: URL-verified | Access: public-domain, evidence tier **C**
- Backs:
  - epazote light
    - "This plant does best in full sun and moderately fertile moist well-drained soil." (Description, third paragraph (the Light field reads 'Full sun (6 or more hours of direct sunlight a day)'))
- **Caveat:** Published outside a peer-reviewed journal.

#### `ncsu-plant-toolbox`

NC State Extension. (n.d.). *North Carolina Extension Gardener Plant Toolbox*. North Carolina State University

- URL: <https://plants.ces.ncsu.edu/>
- Archived: <https://web.archive.org/web/20260912002513/https://plants.ces.ncsu.edu/>
- Verification: URL-verified | Access: public-domain
- Backs:
  - cassava (Manihot esculenta): height and width 6 to 10 ft, USDA zones 10a to 12b, full sun or partial shade
  - taro (Colocasia esculenta): height and width 3 to 6 ft, USDA zones 8a to 11b, full sun or partial shade
  - plantain (Musa x paradisiaca): height 7 to 25 ft, width 6 to 10 ft, USDA zones 9a to 11b, full sun, available space to plant 12 to 24 ft
  - lemon (Citrus x limon): height 10 to 20 ft, width 10 to 15 ft, USDA zones 9a to 11b, full sun
- **Caveat:** A land-grant garden reference compiled from secondary sources, where dimensions are landscape ranges with no trial measurement behind them, and the zone lists are hardiness statements for North Carolina gardeners.

#### `ncsu-planttoolbox-lagenaria-siceraria`

NC State Extension. (n.d.). *Lagenaria siceraria (bottle gourd, calabash)*. NC State University, NC State Extension (Plant Toolbox)

- URL: <https://plants.ces.ncsu.edu/plants/lagenaria-siceraria/>
- Archived: <https://web.archive.org/web/20260417123805/https://plants.ces.ncsu.edu/plants/lagenaria-siceraria/>
- Verification: URL-verified | Access: public-domain, evidence tier **C**
- Backs:
  - bottle-gourd spacing
    - "Plant several seeds in mounds 3 feet apart if growing on supports or 4 to 6 feet apart is the vine will trail on the ground." (NC State Plant Toolbox, Lagenaria siceraria page, description (the sentence has the source's own typo 'is the vine'))
  - bottle-gourd width
    - "Width: 10 ft. 0 in. - 16 ft. 0 in." (NC State Plant Toolbox, Lagenaria siceraria page, 'Dimensions')
  - bottle-gourd light
    - "Bottle gourd does best in sandy or loamy, well-drained, soil in full sun and will tolerate hot, humid summers." (NC State Plant Toolbox, Lagenaria siceraria page, description)
- **Caveat:** Published outside a peer-reviewed journal.

#### `ncsu-planttoolbox-luffa-aegyptiaca`

NC State Extension. (n.d.). *Luffa aegyptiaca (sponge gourd, luffa)*. NC State University, NC State Extension (Plant Toolbox)

- URL: <https://plants.ces.ncsu.edu/plants/luffa-aegyptiaca/>
- Archived: <https://web.archive.org/web/20260113082906/https://plants.ces.ncsu.edu/plants/luffa-aegyptiaca/>
- Verification: URL-verified | Access: public-domain, evidence tier **C**
- Backs:
  - luffa width
    - "Width: 1 ft. 0 in. - 3 ft. 0 in." (NC State Plant Toolbox, Luffa aegyptiaca page, 'Dimensions')
- **Caveat:** Published outside a peer-reviewed journal.

#### `ncsu-planttoolbox-macadamia-integrifolia`

NC State Extension. (n.d.). *Macadamia integrifolia (Australian Nut, Macadamia, Macadamia Nut, Queensland Nut)*. NC State University, NC State Extension (Plant Toolbox)

- URL: <https://plants.ces.ncsu.edu/plants/macadamia-integrifolia/>
- Archived: <https://web.archive.org/web/20260606014338/https://plants.ces.ncsu.edu/plants/macadamia-integrifolia/>
- Verification: URL-verified | Access: public-domain, evidence tier **C**
- Backs:
  - macadamia height
    - "Height: 30 ft. 0 in. - 50 ft. 0 in." (NC State Plant Toolbox, Macadamia integrifolia page, 'Dimensions')
  - macadamia width
    - "Width: 20 ft. 0 in. - 40 ft. 0 in." (NC State Plant Toolbox, Macadamia integrifolia page, 'Dimensions')
  - macadamia coldLimit
    - "Macadamia Nut trees prefer humus-rich, moist, well drained soils in full sun and are intolerant of frost." (NC State Plant Toolbox, Macadamia integrifolia page, description)
  - macadamia light
    - "Light: Full sun (6 or more hours of direct sunlight a day)" (NC State Plant Toolbox, Macadamia integrifolia page, 'Cultural Conditions')
- **Caveat:** Published outside a peer-reviewed journal.

#### `ndsu-2024-sea-buckthorn-f2195`

Zeleznik, Joseph. (2024). *Sea-Buckthorn (F2195)*. North Dakota State University Extension

- URL: <https://www.ndsu.edu/agriculture/extension/publications/sea-buckthorn>
- Archived: <https://web.archive.org/web/20261017221144/https://www.ndsu.edu/agriculture/extension/publications/sea-buckthorn>
- Verification: URL-verified | Access: public-domain, evidence tier **C**
- Backs:
  - sea-buckthorn light
    - "Light: Full sun to partial shade." ("Preferences" section)
- **Caveat:** Published outside a peer-reviewed journal.

#### `ndsu-2026-flax-production`

NDSU Extension Service. (2026). *Flax Production for Oil and Seed in North Dakota (A1038)*. North Dakota State University Extension

- URL: <https://www.ndsu.edu/agriculture/extension/publications/flax-production-oil-and-seed-north-dakota>
- Archived: <https://web.archive.org/web/20261008135224/https://www.ndsu.edu/agriculture/extension/publications/flax-production-oil-and-seed-north-dakota>
- Verification: URL-verified | Access: public-domain, evidence tier **C**
- Backs:
  - flax spacing
    - "A stand of 70 plants per square foot is desired. However, if uniform, stands of 30 to 40 plants per square foot may provide a satisfactory yield [...] Seeding rates of 25 to 45 pounds per acre are common." ('Seeding Flax' section)
  - flax height
    - "Flax grows to a height of 20 to 30 inches." ('Growth and Development' section)
  - flax daysToMaturity
    - "It requires a 50-day vegetative period, a 20- to 25-day flowering period and an extra 25 to 30 days to reach maturity. In years with adequate moisture and wet fall conditions, the maturation period may extend until a hard frost kills the crop, with new flowers continuing to emerge until then." ('Growth and Development' section)
  - flax coldLimit
    - "Seedling plants just emerging (breaking ground) are the most susceptible to injury, but can withstand temperatures down to 28 degrees Fahrenheit for a few hours. After the seedlings have a second leaf, they can withstand temperatures in the low 20 degrees range." ('Seeding Flax' section)
- **Caveat:** Published outside a peer-reviewed journal. The May 2020 revision, archived at https://web.archive.org/web/20200730124756/https://www.ag.ndsu.edu/publications/crops/flax-production-in-north-dakota/a1038-flax-production-nd.pdf, gave a height of 24 to 36 inches, a 25-day flowering period and about 35 days to mature. The September 2026 revision quoted here gives 20 to 30 inches, a 20- to 25-day flowering period and an extra 25 to 30 days.

#### `ndsu-extension-2024-black-walnut`

Zeleznik, Joseph. (2024). *Black Walnut (F2209)*. North Dakota State University Extension

- URL: <https://www.ndsu.edu/agriculture/extension/publications/black-walnut>
- Archived: <https://web.archive.org/web/20261017213425/https://www.ndsu.edu/agriculture/extension/publications/black-walnut>
- Verification: URL-verified | Access: public-domain, evidence tier **C**
- Backs:
  - black-walnut width
    - "The largest tree in North Dakota is 65 feet tall with a canopy spread of 50 feet." (NDSU Extension F2209, "Description" section)
  - black-walnut coldLimit
    - "Hardiness: Zone 4" (NDSU Extension F2209, "General" characteristics list)
- **Caveat:** Published outside a peer-reviewed journal.

#### `ndsu-fall-frost-damage-field-crops`

NDSU Extension. (n.d.). *Fall Frost Damage to Field Crops*. North Dakota State University Extension

- URL: <https://www.ndsu.edu/agriculture/ag-hub/ag-topics/crop-production/crops/corn/fall-frost-damage-field-crops>
- Archived: <https://web.archive.org/web/20251109071529/https://www.ndsu.edu/agriculture/ag-hub/ag-topics/crop-production/crops/corn/fall-frost-damage-field-crops>
- Verification: URL-verified | Access: public-domain, evidence tier **C**
- Backs:
  - corn-grain coldLimit
    - "CORN: Usually damaged by temperatures in 28 degree range or less." ('Fall Frost Damage to Field Crops' page, CORN section)
- **Caveat:** Published outside a peer-reviewed journal.

#### `ndsu-ndawn-corn-gdd`

(n.d.). *NDAWN Corn Growing Degree Days Information*. North Dakota Agricultural Weather Network, North Dakota State University

- URL: <https://ndawn.ndsu.nodak.edu/help-corn-growing-degree-days.html>
- Archived: <https://web.archive.org/web/20260318061528/https://ndawn.ndsu.nodak.edu/help-corn-growing-degree-days.html>
- Verification: URL-verified | Access: public-domain, evidence tier **C**
- Backs:
  - corn GDD base temperature
    - "Scientists have determined the lower base temperature for corn is 50 F (10 C)" (first paragraph)
  - corn GDD upper limit
    - "The upper limit for corn is 86 F (30 C)" (first paragraph)
  - the threshold-substitution modified GDD method: substitute 50 F for daily minima below it and 86 F for daily maxima above it
- **Caveat:** The page is about corn generally and never mentions sweet corn, so applying it to sweet corn is an extrapolation. This app's sweet-corn 10/30 C pair is an inference from the field-corn convention, with no sweet-corn measurement behind it. OSU EM 9305, which did fit sweet corn specifically, uses 44 F (6.7 C) for fresh-market varieties and 50 F only for processing varieties. The two sources therefore disagree on sweet corn, a crop this app ships. A weather-network help page isn't peer-reviewed literature. The 10/30 C pair is a standard agronomic convention, which is a different kind of warrant from a measurement.

#### `nelson2007-late-seral-herbs`

Nelson, Cara R.; Halpern, Charles B.; Antos, Joseph A. (2007). *Variation in responses of late-seral herbs to disturbance and environmental stress*. Ecology 88: 2880-2890

- DOI: [10.1890/06-1989.1](https://doi.org/10.1890/06-1989.1)
- Verification: Crossref-verified | Access: open-access, evidence tier **B**
- Backs:
  - growing-season PPFD averaged 36.4 mol/m2/d in the clearcut and 8.6 mol/m2/d in the adjacent old-growth Douglas-fir forest
    - "Photosynthetic photon flux density (PPFD) over the growing season averaged 36.4 mol·m-2·d-1 in the harvest area, but only 8.6 mol·m-2·d-1 in the forest" (p. 2882)
  - Asarum caudatum ramet survival in the clearcut was about 30% of the forest's in year 1
    - "survival rates were ca. 30% of those in the forest (year 1; Fig. 2a-c)" (p. 2884)
  - the depression held into year 2 for Asarum alone, while its surviving ramets' clonal growth (new ramet production) ran markedly higher in the clearcut by year 2
    - "For Asarum, ramet survival remained depressed in the harvest area (Fig. 2a)" (p. 2884)
  - mid-summer air and soil temperatures ran higher in the clearcut, by 3.3 C on the daily mean and up to 5.6 C on the daily maximum
- **Caveat:** A two-level comparison: nine patches per species in one 6-ha clearcut and the adjacent 7-ha stand of old-growth forest in Washington, so 36.4 is the one light level this app has a measured survival collapse at for this species and never a fitted breakpoint. Mid-summer heat and soil dryness ran higher in the clearcut alongside the light, so this figure folds light, heat and drought stress together. Three species were tracked and the pattern belongs to Asarum alone: Clintonia uniflora's survival was significantly greater in the clearcut by year 2, and Pyrola picta's was comparable between environments throughout.

#### `nmsu-1997-growing-pistachios-new-mexico`

Herrera, Esteban. (1997). *Growing Pistachios in New Mexico (Circular 532)*. New Mexico State University Cooperative Extension Service

- URL: <https://pubs.nmsu.edu/_circulars/CR532/index.html>
- Archived: <https://web.archive.org/web/20251209074808/https://pubs.nmsu.edu/_circulars/CR532/index.html>
- Verification: URL-verified | Access: public-domain, evidence tier **C**
- Backs:
  - pistachio spacing
    - "Tree spacing in New Mexico varies mostly from 17 feet by 17 feet to 20 feet by 20 feet (few growers have planted to 24 feet by 24 feet)." (NMSU Circular 532, section Spacing and Planting Procedures)
  - pistachio height
    - "Pistachio trees are long-lived, tap-rooted and can grow to 20-30 feet tall." (NMSU Circular 532, section Soil and Water Requirements)
  - pistachio yearsToFirstHarvest
    - "Pistachio trees begin bearing the fourth or fifth year after budding." (NMSU Circular 532, section Harvest)
  - pistachio harvestSeason
    - "Depending on the season, the last irrigation is usually done the first or second half of August, and harvest starts in late August to early September." (NMSU Circular 532, section Soil and Water Requirements)
  - pistachio coldLimit
    - "Also, temperatures below 10° F can kill the tree, especially young trees." (NMSU Circular 532, section Climate)
- **Caveat:** Published outside a peer-reviewed journal.

#### `nmsu-2023-jujube-chinese-date`

Yao, Shengrui. (2023). *Jujube: Chinese Date in New Mexico (Guide H-330)*. New Mexico State University Cooperative Extension Service

- URL: <https://pubs.nmsu.edu/_h/H330/>
- Archived: <https://web.archive.org/web/20260826080628/https://pubs.nmsu.edu/_h/H330/>
- Verification: URL-verified | Access: public-domain, evidence tier **C**
- Backs:
  - jujube height
    - "Jujube is a deciduous fruit/ornamental tree, 15 to 30 ft in height, with very hard, strong wood." ("DESCRIPTION" section, "Tree" subsection)
  - jujube yearsToFirstHarvest
    - "Most cultivars will produce a few fruits in the second year." ("CULTURE" section, "Precocity and tree life span" subsection)
- **Caveat:** Published outside a peer-reviewed journal.

#### `nps-mid-atlantic-epmt-invasive-plant-list`

National Park Service, Mid-Atlantic Exotic Plant Management Team. (n.d.). *National Park Service, Mid-Atlantic Exotic Plant Management Team Invasive Plant List*. Center for Invasive Species and Ecosystem Health, University of Georgia (invasive.org)

- URL: <https://www.invasive.org/species/list/187>
- Archived: <https://web.archive.org/web/20260618110458/https://www.invasive.org/species/list/187>
- Verification: URL-verified | Access: public-domain, evidence tier **C**
- Backs:
  - goji invasiveStatus
    - "matrimony vine (Lycium barbarum L.)" (invasive.org species list 187, titled "National Park Service, Mid-Atlantic Exotic Plant Management Team Invasive Plant L)
- **Caveat:** Published outside a peer-reviewed journal.

#### `nrc-1981-winged-bean`

National Research Council. (1981). *The Winged Bean: A High-Protein Crop for the Tropics (second edition)*. National Academy Press

- DOI: [10.17226/19754](https://doi.org/10.17226/19754)
- Verification: Crossref-verified | Access: public-domain, evidence tier **C**
- Backs:
  - winged-bean flowering and temperature, a limit the day-length gate doesn't model
    - "Continuous day temperatures higher than 32°C or lower than 18°C inhibit flowering even under otherwise suitable short-day conditions." (page 12)
  - winged-bean range in the United States
    - "For North Americans this means that good harvests can be gained in south Florida but almost nowhere else in the continental United States" (introduction)
- **Caveat:** A National Academies panel report, outside the usual extension, USDA and FAO classes, and not peer reviewed in the journal sense.

#### `nrc-1989-lost-crops-of-the-incas`

National Research Council. (1989). *Lost Crops of the Incas: Little-Known Plants of the Andes with Promise for Worldwide Cultivation*. National Academy Press

- URL: <https://nap.nationalacademies.org/read/1398/chapter/10>
- Archived: <https://web.archive.org/web/20251005020734/https://nap.nationalacademies.org/read/1398/chapter/10>
- Verification: URL-verified | Access: public-domain, evidence tier **C**
- Backs:
  - oca height
    - "Oca is a compact, perennial, tuberous herb, usually 20-30 cm high, with cylindrical, succulent stems that vary in color from yellow and green to a purplish red." (Oca chapter, 'Species Information', Description (page 91))
  - oca photoperiod, why the row carries no day-length gate
    - "Although many types collected from Peru and Ecuador are daylength sensitive, the ones in New Zealand [...] are apparently unrestricted by daylength." (Oca chapter, page 91)
- **Caveat:** Published outside a peer-reviewed journal.

#### `nrcs-2006-plant-guide-sunn-hemp`

Joy, Robert; Peterson, J. S. (2006). *Plant guide for sunn hemp (Crotalaria juncea L.)*. USDA Natural Resources Conservation Service, Plant Materials Center and National Plant Data Center

- URL: <https://plants.usda.gov/DocumentLibrary/plantguide/pdf/pg_crju.pdf>
- Archived: <https://web.archive.org/web/20261017221423/https://plants.usda.gov/DocumentLibrary/plantguide/pdf/pg_crju.pdf>
- Verification: URL-verified | Access: public-domain, evidence tier **C**
- Backs:
  - sunn-hemp spacing
    - "If broadcasted, seed at a rate of 40 to 60 pounds of live seed per acre. If drilled, the rate should be 30 to 50 pounds per acre in 6-inch rows." (Page 1, section 'Establishment')
  - sunn-hemp height
    - "Branched, erect, herbaceous shrubby annual growing 3 to 9 feet high with bright green simple, elliptical leaves." (Page 1, section 'Description')
  - sunn-hemp daysToMaturity
    - "When grown as a summer annual, sunn hemp can produce over 5,000 pounds of biomass and 100 pounds of nitrogen per acre. It can produce this amount within 60 to 90 days" (Page 1, section 'Uses', paragraph 'Cover Crop & Green Manure')
- **Caveat:** Published outside a peer-reviewed journal.

#### `nrcs-2012-plant-guide-lablab`

Sheahan, Christopher M. (2012). *Plant guide for lablab (Lablab purpureus)*. USDA Natural Resources Conservation Service, Cape May Plant Materials Center

- URL: <https://plants.usda.gov/DocumentLibrary/plantguide/pdf/pg_lapu6.pdf>
- Archived: <https://web.archive.org/web/20261017221232/https://plants.usda.gov/DocumentLibrary/plantguide/pdf/pg_lapu6.pdf>
- Verification: URL-verified | Access: public-domain, evidence tier **C**
- Backs:
  - lablab spacing
    - "The seed should be sown 1 to 4 in. deep at 11–18 lb/acre on rows 2.5 ft wide with roughly 1 to 1.5 ft between plants (Cook et al., 2005)." (Page 2, section 'Establishment')
- **Caveat:** Published outside a peer-reviewed journal.

#### `nrcs-2014-plant-guide-foxtail-millet`

Sheahan, Christopher M. (2014). *Plant guide for foxtail millet (Setaria italica)*. USDA Natural Resources Conservation Service, Cape May Plant Materials Center

- URL: <https://plants.usda.gov/DocumentLibrary/plantguide/pdf/pg_seit.pdf>
- Archived: <https://web.archive.org/web/20260312060103/https://plants.usda.gov/DocumentLibrary/plantguide/pdf/pg_seit.pdf>
- Verification: URL-verified | Access: public-domain, evidence tier **C**
- Backs:
  - foxtail-millet height
    - "It is an introduced, annual, warm-season crop that grows 2–5 ft (60-152 cm) tall." (Page 1, section 'Description', paragraph 'General')
- **Caveat:** Published outside a peer-reviewed journal.

#### `oikeh-warda-upland-rice-handbook`

Oikeh, S. O.; Nwilene, F. E.; Agunbiade, T. A.; Oladimeji, O.; Ajayi, O.; Semon, M.; Tsunematsu, H.; Samejima, H. (n.d.). *Growing upland rice: a production handbook*. Africa Rice Center (WARDA)

- URL: <https://www.fao.org/fileadmin/user_upload/ivc/docs/uplandrice.pdf>
- Archived: <https://web.archive.org/web/20260812114737/https://www.fao.org/fileadmin/user_upload/ivc/docs/uplandrice.pdf>
- Verification: URL-verified | Access: open-access
- Backs:
  - spacing
    - "Dibbling at 30 x 30 cm or 20 x 20 cm: seed rate: 50-60 kg/ha" (p. 10)
    - "Drilling at 25-30 cm row spacing and 5 cm within row; seed rate: 75-80 kg/ha" (p. 10)
  - maturity classes
    - "Early maturing (< 90-100 days)" (p. 7)
    - "Medium maturing (100-120 days)" (p. 7)
    - "Late maturing (> 120 days)" (p. 7)
  - site
    - "Select your site in an ecological zone with at least 14-20 mm of five-day rainfall during the growing cycle" (p. 6)
- **Caveat:** A West African smallholder handbook built around NERICA and FARO cultivars. The maturity classes and spacings are those of that program.

#### `olanrewaju-2021-bambara-growth-yield`

Olanrewaju, Oluwaseyi Samuel; Oyatomi, Olaniyi; Babalola, Olubukola Oluranti; Abberton, Michael. (2021). *Genetic Diversity and Environmental Influence on Growth and Yield Parameters of Bambara Groundnut*. Frontiers in Plant Science 12: 796352

- DOI: [10.3389/fpls.2021.796352](https://doi.org/10.3389/fpls.2021.796352)
- Verification: URL-verified | Access: public-domain, evidence tier **C**
- Backs:
  - bambara-groundnut spacing
    - "The length of each plot was 3 m with 0.3 m spacing between each plant and a row spacing of 0.7 m between each plot." (Methods, section 'Field Trials and Phenotyping')
  - bambara-groundnut height
    - "It has both prostrate and erect forms and grows to a height of 0.30–0.35 m." (Introduction)
- **Caveat:** Read in full for the sentences quoted. The catalog row comments say which figure each sentence gives.

#### `olsen-usu-planting-dates`

Olsen, Shawn. (2018). *Suggested Vegetable Planting Dates for Utah*. Utah State University Extension

- URL: <https://extension.usu.edu/yardandgarden/research/suggested-vegetable-planting-dates-for-utah>
- Archived: <https://web.archive.org/web/20260711114646/https://extension.usu.edu/yardandgarden/research/suggested-vegetable-planting-dates-for-utah>
- Verification: URL-verified | Access: public-domain, evidence tier **C**
- Backs:
  - frostOffsetDays as a four-group ladder
    - "Group A: Hardy (Plant as soon as the soil dries out in the spring.)" ("Cool-Season Vegetables" section, "Group A: Hardy")
    - "Group B: Semi-Hardy (Plants a week or two after 'A' group or about 2 weeks before average last spring frost.)" ("Cool-Season Vegetables" section, "Group B: Semi-Hardy")
    - "Group C: Tender (Plant on the average date of the last spring frost-about when first apples reach full bloom.)" ("Warm-Season Vegetables" section, "Group C: Tender")
    - "Group D: Very Tender (Plant when the soil is warm, about 2 weeks after 'C' group.)" ("Warm-Season Vegetables" section, "Group D: Very Tender")
  - a worked frost-anchored table mapping average last spring frost to a concrete Group A-D planting date for 37 named locations, demonstrating the offset method in practice
  - a separate fall-harvest planting window group (Group E) with per-crop date ranges
  - days to maturity per crop in the companion planting guide, e.g. 'Tomatoes 60-90'
- **Caveat:** Extension fact sheet, calibrated to Utah's Intermountain West climate. The page itself notes Washington County differs from the rest of the state. Group C is anchored on the average (50%) last spring frost, whereas Purdue HO-186-W anchors on a 10% exceedance map: the two source's offsets are NOT interchangeable without normalizing the percentile first. USU asserts university copyright.

#### `omafra-2012-gobo`

Ontario Ministry of Agriculture, Food and Rural Affairs. (2012). *Specialty Cropportunities: Gobo*. OMAFRA, Government of Ontario

- URL: <https://www.omafra.gov.on.ca/CropOp/en/spec_veg/root_tuber_veg/gobo.html>
- Archived: <https://web.archive.org/web/20261017215326/https://www.omafra.gov.on.ca/CropOp/en/spec_veg/root_tuber_veg/gobo.html>
- Verification: URL-verified | Access: public-domain, evidence tier **C**
- Backs:
  - burdock spacing
    - "In-row spacing 15-30 cm Between row spacing 60-90 cm" (Gobo crop profile, rows 'In-row spacing' and 'Between row spacing')
  - burdock daysToMaturity
    - "Days to harvest 90-120 days [...] Roots become woody beyond this time." (Gobo crop profile, row 'Days to harvest')
- **Caveat:** Published outside a peer-reviewed journal.

#### `omafra-2012-specialty-cropportunities-stevia`

Ontario Ministry of Agriculture, Food and Rural Affairs. (2012). *Specialty Cropportunities - Stevia*. Ontario Ministry of Agriculture, Food and Rural Affairs

- URL: <https://www.omafra.gov.on.ca/CropOp/en/indus_misc/pharm/stev.html>
- Archived: <https://web.archive.org/web/20261017215120/https://www.omafra.gov.on.ca/CropOp/en/indus_misc/pharm/stev.html>
- Verification: URL-verified | Access: public-domain, evidence tier **C**
- Backs:
  - stevia daysToMaturity
    - "54-104 days depending on day length sensitivity of cultivar." (Days to harvest entry (the same page gives Propagation method: Transplants))
  - stevia coldLimit
    - "Will not survive temperatures below -3°C." (Temperature sensitivity entry)
- **Caveat:** Published outside a peer-reviewed journal.

#### `omafra-2022-canola-guide`

Ontario Ministry of Agriculture, Food and Rural Affairs. (2022). *Agronomy Guide for Field Crops (Publication 811), Chapter 6: Spring and Winter Canola*. Ontario Ministry of Agriculture, Food and Rural Affairs (OMAFRA)

- URL: <https://www.ontario.ca/files/2022-10/omafra-agronomy-guide-for-field-crops-chapter-6-en-2022-10-13.pdf>
- Archived: <https://web.archive.org/web/20261017212700/https://www.ontario.ca/files/2022-10/omafra-agronomy-guide-for-field-crops-chapter-6-en-2022-10-13.pdf>
- Verification: URL-verified | Access: public-domain, evidence tier **C**
- Backs:
  - canola spacing
    - "The optimum plant stand is 75–130 healthy plants/m2 (7–13 plants/ft2) while 54 plants/m2 (5 plants/ft2) is the minimum for maintaining yield potential. In a 19 cm (7.5 in.) row width this is equivalent to 14–25 plants/m (4.5–6 plants/ft) of row." (p. 160, 'Seeding Rate' section)
  - canola daysToMaturity
    - "The average crop flowers 45–50 days (582–666 GDD) after emergence and matures in 90–96 days." (p. 163, 'Crop Development' section)
  - canola coldLimit
    - "Canola seedlings can withstand a considerable frost of -5°C to -8°C if plants have become acclimatized following a few days of cold temperatures. However, canola seedlings growing under warm conditions will be tender, and can be killed by even a few degrees frost." (p. 159, seedling frost-tolerance paragraph)
- **Caveat:** Published outside a peer-reviewed journal.

#### `oplinger1990-sesame-afcm`

Oplinger, E. S.; Putnam, D. H.; Kaminski, A. R.; Hanson, C. V.; Oelke, E. A.; Schulte, E. E.; Doll, J. D. (1990). *Sesame*. Alternative Field Crops Manual

- URL: <https://hort.purdue.edu/newcrop/afcm/sesame.html>
- Archived: <https://web.archive.org/web/20260902222112/https://hort.purdue.edu/newcrop/afcm/sesame.html>
- Verification: URL-verified | Access: public-domain
- Backs:
  - sesame height
    - "Sesame is an erect annual (or occasionally a perennial) that grows to a height of 20 to 60 in., depending on the variety and the growing conditions" ("III. Growth Habits" section)
  - sesame spacing
    - "Populations of 250,000 to 300,000 plants/acre in 18 to 30 in. rows have given the highest yields" ("V. Cultural Practices" section, "C. Method and Rate of Seeding")
  - sesame daysToMaturity
    - "Sesame is ready for harvesting 90 to 150 days after planting" ("V. Cultural Practices" section, "I. Harvesting")
  - sesame temperature response and frost-free days
    - "Daytime temperatures of 77F to 80F are optimal; below 68F, growth is reduced, and at 50F germination and growth is inhibited" ("IV. Environment Requirements" section, "A. Climate")
    - "Commercial varieties of sesame require 90 to 120 frostfree days" ("IV. Environment Requirements" section, "A. Climate")
  - sesame rainfall
    - "A minimum rainfall of 20 to 26 in. per season is necessary for reasonable yields" ("IV. Environment Requirements" section, "A. Climate")
- **Caveat:** Written for the upper Midwest. The agronomy is transferable, the calendar is local.

#### `osu-2002-safflower`

Armah-Agyeman, Grace; Loiland, Jim; Karow, Russell S.; Hang, Anne N. (2002). *Safflower (Dryland Cropping Systems, EM 8792)*. Oregon State University Extension Service

- URL: <https://extension.oregonstate.edu/sites/extd8/files/documents/em8792.pdf>
- Archived: <https://web.archive.org/web/20251112131006/https://extension.oregonstate.edu/sites/extd8/files/documents/em8792.pdf>
- Verification: URL-verified | Access: public-domain, evidence tier **C**
- Backs:
  - safflower height
    - "It stands 1 to 4 feet tall at maturity." (Page 1, section 'Description')
  - safflower daysToMaturity
    - "Seeding to maturity takes 120 to 150 days or longer." (Page 3, section 'Conditions for growth', subsection 'Climate')
  - safflower coldLimit
    - "Varieties adapted to the PNW tolerate temperatures as low as 20°F in the seedling stage, but plants cannot withstand freezing temperatures after flowering." (Page 3, section 'Conditions for growth', subsection 'Climate')
  - safflower light
    - "Safflower is a sun-loving crop, and high temperatures and bright sunny days in July through early September speed development." (Page 3, section 'Conditions for growth', subsection 'Climate')
- **Caveat:** Published outside a peer-reviewed journal.

#### `osu-2013-six-exotic-vegetables`

Oregon State University. (2013). *Six exotic vegetables for Oregon gardeners to try*. Oregon State University Newsroom (quotes Jim Myers, OSU Extension Service vegetable breeder)

- URL: <https://news.oregonstate.edu/news/six-exotic-vegetables-oregon-gardeners-try>
- Archived: <https://web.archive.org/web/20261017215200/https://news.oregonstate.edu/news/six-exotic-vegetables-oregon-gardeners-try>
- Verification: URL-verified | Access: public-domain, evidence tier **C**
- Backs:
  - oca coldLimit
    - "It can't survive frost but tubers will overwinter in the ground as long as they do not freeze." (Oca paragraph of the news release dated June 14, 2013)
- **Caveat:** Published outside a peer-reviewed journal.

#### `osu-2016-forage-information-system-alfalfa`

Oregon State University Forage Information System. (2016). *Alfalfa (Medicago sativa L.), Forage Information System*. Oregon State University

- URL: <https://forages.oregonstate.edu/group/1701/alfalfa>
- Archived: <https://web.archive.org/web/20251206055050/https://forages.oregonstate.edu/group/1701/alfalfa>
- Verification: URL-verified | Access: public-domain, evidence tier **C**
- Backs:
  - alfalfa spacing
    - "For pure stands, a seeding rate of 12-15 lb/a (26.5-33 kg/ha) planted in 6-inch rows is usually sufficient for a good stand of alfalfa." (Section 'Establishment and Management', subsection 'Establishment')
  - alfalfa coldLimit
    - "Tolerant of drought, heat, and cold. Specific heat and cold tolerances depend on FD and WSI group. [USDA Plant Hardiness zone 3 for most cold-tolerant types; Jan mean minimum of -40 °F (-40 °C)" (Section 'Climate and Soil Suitability Zones', 'Climate Tolerances', and Table 1 'Climate Tolerances' (USDA Hardiness Zon))
- **Caveat:** Published outside a peer-reviewed journal.

#### `osu-2021-strik-kiwifruit-home-garden`

Strik, Bernadine; Dixon, Emily; Detweiler, Amy Jo; Sanchez, Nicole. (2021). *Growing Kiwifruit in Your Home Garden (EM 9322)*. Oregon State University Extension Service

- URL: <https://extension.oregonstate.edu/catalog/em-9322-growing-kiwifruit-your-home-garden>
- Archived: <https://web.archive.org/web/20260420133132/https://extension.oregonstate.edu/catalog/em-9322-growing-kiwifruit-your-home-garden>
- Verification: URL-verified | Access: public-domain, evidence tier **C**
- Backs:
  - kiwifruit spacing
    - "One plant needs about 15 feet of space. Plant two vines 15 feet apart and leave about 6 feet on each end." ("Planting" section, p. 7)
  - kiwifruit height
    - "Attach a strong cross arm at 6 to 7 feet above ground level on each post." ("Trellising" section, p. 11)
  - kiwifruit width
    - "One plant needs about 15 feet of space. Plant two vines 15 feet apart and leave about 6 feet on each end." ("Planting" section, p. 7)
  - kiwifruit harvestSeason
    - "In adapted regions of western Oregon, pick ‘Hayward’ and other fuzzy kiwifruit cultivars as late as possible (late October/early November, or before the first hard frost)." ("Harvest" / "Fuzzy kiwifruit" section, p. 12)
  - kiwifruit coldLimit
    - "The fuzzy kiwifruit (Actinidia deliciosa) is only adapted to warmer regions of Oregon. It needs a growing season of 225 to 240 frost-free days and is cold hardy to about 0 to 10 °F, depending on when the cold event occurs and preceding temperatures." ("Common problems" / "Winter cold injury and frost damage" section, p. 16)
  - kiwifruit light
    - "Ideal environmental conditions for kiwifruit are full sun exposure and fertile, well-drained, sandy loam or clay loam soil with moderate water-holding capacity [...] While plants can tolerate partial shade, yield and fruit quality may be lower." ("Site selection" section, p. 4)
- **Caveat:** Published outside a peer-reviewed journal.

#### `osu-extension-2006-growing-walnuts-oregon`

Olsen, Jeff. (2006). *Growing Walnuts in Oregon (EM 8907)*. Oregon State University Extension Service

- URL: <https://extension.oregonstate.edu/catalog/em-8907-growing-walnuts-oregon>
- Archived: <https://web.archive.org/web/20260709105444/https://extension.oregonstate.edu/catalog/em-8907-growing-walnuts-oregon>
- Verification: URL-verified | Access: public-domain, evidence tier **C**
- Backs:
  - walnut spacing
    - "Walnut trees usually are planted about 30 feet apart." (EM 8907, "Planting" section)
  - walnut yearsToFirstHarvest
    - "Most walnut varieties may produce a few nuts when trees are 5 or 6 years old, but they are not considered mature or in commercial production until trees are 10 years old." (EM 8907, introductory section (before "Varieties" heading))
  - walnut harvestSeason
    - "Walnuts are mature as soon as the husk will cut free from the nut, but they usually are not harvested until rains have cracked the husk to the point of letting the nut drop to the ground. This usually happens in October." (EM 8907, "Harvesting and drying nuts" section)
  - walnut light
    - "Walnuts grow best in full sun." (EM 8907, photo caption near the top of the bulletin)
- **Caveat:** Published outside a peer-reviewed journal.

#### `osu-extension-2006-lingonberry-pnw583`

Penhallegon, Ross. (2006). *Lingonberry production guide for the Pacific Northwest*. Oregon State University Extension Service (PNW Extension Publication, PNW 583)

- URL: <https://extension.oregonstate.edu/catalog/pnw-583-lingonberry-production-guide-pacific-northwest>
- Archived: <https://web.archive.org/web/20260923201300/https://extension.oregonstate.edu/catalog/pnw-583-lingonberry-production-guide-pacific-northwest>
- Verification: URL-verified | Access: public-domain, evidence tier **C**
- Backs:
  - harvest timing for lingonberry
    - "There are two bloom periods: March to April and July to August. The fruit ripens in mid-August and mid-October, respectively" (Section ‘Bloom’, p. 4)
- **Caveat:** Published outside a peer-reviewed journal. Its dates are calibrated to the Willamette Valley, Oregon, and this app places them at the same point in each garden's own frost-free season. Lingonberry's two crops a year, in mid-August and mid-October, are read as one season.

#### `osu-extension-2013-hazelnuts-orchard-floor`

Olsen, Jeff L.; Peachey, Ed. (2013). *Growing Hazelnuts in the Pacific Northwest: Orchard Floor Management*. Oregon State University Extension Service

- URL: <https://extension.oregonstate.edu/catalog/em-9079-growing-hazelnuts-pacific-northwest-orchard-floor-management>
- Verification: URL-verified | Access: public-domain, evidence tier **C**
- Backs:
  - harvest timing for hazelnut
    - "Blank nuts fall before good nuts. After blanks have fallen and just before good nuts begin to drop (usually at the end of August), it might be desirable to do a final flailing and floating to fill small depressions in the ground. [...] In most years, it is October before all of the nuts have fallen naturally" (EM 9079, 'Nut Fall' and 'Hazelnut Harvest' sections, p. 3)
- **Caveat:** Published outside a peer-reviewed journal. Its dates are calibrated to the Willamette Valley hazelnut industry in Oregon, and this app places them at the same point in each garden's own frost-free season. For hazelnut, nut drop stands in for harvest. The nuts start falling at the end of August and have mostly fallen by October.

#### `osu-extension-2015-hops-em9115`

Getty, Brooke; Townsend, Shaun; Detweiler, Amy Jo. (2015). *Growing hops in the home garden*. Oregon State University Extension Service (EM 9115)

- URL: <https://extension.oregonstate.edu/catalog/em-9115-growing-hops-home-garden>
- Archived: <https://web.archive.org/web/20261017211522/https://extension.oregonstate.edu/catalog/em-9115-growing-hops-home-garden>
- Verification: URL-verified | Access: public-domain, evidence tier **C**
- Backs:
  - harvest timing for hops
    - "In both Western and Central Oregon, hops typically mature between August 15 and September 15, depending on the cultivar and growing season conditions" (Section ‘Harvesting and storage’)
- **Caveat:** Published outside a peer-reviewed journal. Its dates are calibrated to Western and Central Oregon, and this app places them at the same point in each garden's own frost-free season.

#### `osu-extension-2020-blackberries-ec1303`

Strik, Bernadine; Dixon, Emily; Detweiler, Amy Jo; Sanchez, Nicole. (2020). *Growing blackberries in your home garden*. Oregon State University Extension Service (EC 1303)

- URL: <https://extension.oregonstate.edu/catalog/ec-1303-growing-blackberries-your-home-garden>
- Archived: <https://web.archive.org/web/20260827040330/https://extension.oregonstate.edu/catalog/ec-1303-growing-blackberries-your-home-garden>
- Verification: URL-verified | Access: public-domain, evidence tier **C**
- Backs:
  - harvest timing for blackberry
    - "All cultivars are summer-bearing (‘Triple Crown’, for example) and are the latest summer-bearing cultivars, fruiting from early August to September or October in the Willamette Valley" (Section ‘Blackberry types > Growth type’, paragraph on semierect cultivars)
- **Caveat:** Published outside a peer-reviewed journal. Its dates are calibrated to the Willamette Valley, Oregon, and this app places them at the same point in each garden's own frost-free season. Blackberry dates are for the semierect type, the guide's latest-fruiting group.

#### `osu-extension-2025-tree-fruits-nuts-home`

Olsen, Jeff L. (2025). *Growing tree fruits and nuts at home*. Oregon State University Extension Service

- URL: <https://extension.oregonstate.edu/catalog/ec-819-growing-tree-fruits-nuts-home>
- Archived: <https://web.archive.org/web/20260510092429/https://extension.oregonstate.edu/catalog/ec-819-growing-tree-fruits-nuts-home>
- Verification: URL-verified | Access: public-domain, evidence tier **C**
- Backs:
  - harvest timing for apple, read from Table 3, "Approximate time of maturity": July for Lodi through October for Braeburn, Fuji, Golden Delicious and the other late varieties
  - harvest timing for pear, read from Table 8, "Approximate time of maturity": Aug 1 - 15 for Starkrimson through Sept 20 - 30 for Comice
  - harvest timing for peach, read from Table 7, "Approximate time of maturity": early August for Harko and Red Haven through late August for Improved Elberta and Veteran
  - harvest timing for plum, read from Table 10, European varieties: Sept 1 - 15 for Parsons and Stanley through Oct. 1 for Moyer Perfecto
  - harvest timing for cherry-sour, read from Table 5, sour varieties: July for Balaton, Montmorency and North Star
  - harvest timing for apricot, read from Table 4, "Approximate time of maturity": July for Puget Gold, Rival, Royal (Blenheim) and the rest
  - harvest timing for fig, read from Table 6, "Approximate time of maturity": August for Brown Turkey, Desert King and Lattarula
- **Caveat:** Published outside a peer-reviewed journal. Its dates are calibrated to Western Oregon's valleys, Area 1 in the guide's own map, and this app places them at the same point in each garden's own frost-free season. For apple, pear and peach, the span runs from the earliest to the latest listed variety. For plum, it runs from the earliest to the latest listed European variety.

#### `osu-extension-mediterranean-edibles`

Oregon State University Extension Service. (n.d.). *20 Mediterranean Tastes You Can Grow at Home*. Oregon State University Extension Service

- URL: <https://extension.oregonstate.edu/sites/extd8/files/documents/12846/mediterraneanedibles-morgan.pdf>
- Archived: <https://web.archive.org/web/20261017214436/https://extension.oregonstate.edu/sites/extd8/files/documents/12846/mediterraneanedibles-morgan.pdf>
- Verification: URL-verified | Access: public-domain, evidence tier **C**
- Backs:
  - quince harvestSeason
    - "Harvest in October or later – wait for yellow color and light citrusy odor to develop." (OSU Extension handout 20 Mediterranean Tastes You Can Grow at Home, page 2, quince entry)
- **Caveat:** Published outside a peer-reviewed journal.

#### `osu-horticulture-landscape-plants-cydonia-oblonga`

Oregon State University, Department of Horticulture. (n.d.). *Cydonia oblonga (Landscape Plants)*. Oregon State University, College of Agricultural Sciences, Department of Horticulture

- URL: <https://landscapeplants.oregonstate.edu/plants/cydonia-oblonga>
- Archived: <https://web.archive.org/web/20260122143703/https://landscapeplants.oregonstate.edu/plants/cydonia-oblonga>
- Verification: URL-verified | Access: public-domain, evidence tier **C**
- Backs:
  - quince height
    - "Deciduous tree/shrub, rounded, 15 x 15 ft (4.5 x 4.5 m)." (OSU Landscape Plants, Cydonia oblonga page, description paragraph)
  - quince width
    - "Deciduous tree/shrub, rounded, 15 x 15 ft (4.5 x 4.5 m)." (OSU Landscape Plants, Cydonia oblonga page, description paragraph)
- **Caveat:** Published outside a peer-reviewed journal.

#### `peng2015-clubroot-rotation`

Peng, Gary; Pageau, Denis; Strelkov, Stephen E.; Gossen, Bruce D. (2015). *A >2-year crop rotation reduces resting spores of Plasmodiophora brassicae in soil and the impact of clubroot on canola*. European Journal of Agronomy 70: 78-84

- DOI: [10.1016/j.eja.2015.07.007](https://doi.org/10.1016/j.eja.2015.07.007)
- Verification: Crossref-verified | Access: paywalled, evidence tier **A**
- Backs:
  - a >2-year break from host crops significantly reduces clubroot resting-spore concentration
  - hard constraint: minimum 3-year interval between Brassicaceae in the same bed
- **Caveat:** The ScienceDirect PII S1161030115300125 that circulates for this paper doesn't correspond to its DOI. The DOI recorded here is the Crossref record for the title as printed.

#### `pennisi2020-lettuce-basil-ppfd`

Pennisi, Giuseppina; Pistillo, Alessandro; Orsini, Francesco; Cellini, Antonio; Spinelli, Francesco; Nicola, Silvana; Fernandez, Juan A.; Crepaldi, Andrea; Gianquinto, Giorgio; Marcelis, Leo F. M. (2020). *Optimal light intensity for sustainable water and energy use in indoor cultivation of lettuce and basil under red and blue LEDs*. Scientia Horticulturae 272: 109508

- DOI: [10.1016/j.scienta.2020.109508](https://doi.org/10.1016/j.scienta.2020.109508)
- Verification: Crossref-verified | Access: paywalled, evidence tier **A**
- Backs:
  - lettuce and basil grown at PPFDs of 100, 150, 200, 250 and 300 umol/m2/s for 16 h, which the paper states as DLIs of 5.8, 8.6, 11.5, 14.4 and 17.3 mol/m2/d
  - lettuce and basil biomass rises with PPFD up to 250 umol/m2/s and no further above it
    - "A progressive increase of biomass production for both lettuce and basil up to a PPFD of 250 umol m-2 s-1 was observed, whereas no further yield increases were associated with higher PPFD (300 umol m-2 s-1)" (the abstract)
  - the PPFD the authors find suitable for yield and resource use efficiency in red and blue LED lighting
    - "a PPFD of 250 umol m-2 s-1 seems suitable for optimizing yield and resource use efficiency in red and blue LED lighting for indoor cultivation of lettuce and basil under the prevailing conditions of the used indoor farming set-up" (the abstract)
- **Caveat:** The full text is paywalled, and this entry rests on the abstract and the Crossref record. The abstract doesn't name the cultivars. Both crops still yielded at the lowest level, 5.8 mol/m2/d, with the least biomass. The paper finds an optimum (14.4) and places no failure point. It's indoor sole-source LED culture.

#### `plantpono-hpwra-burdock`

Plant Pono (Coordinating Group on Alien Pest Species). (n.d.). *Arctium lappa (great burdock, greater burdock, gobo), Hawaii-Pacific Weed Risk Assessment result*. Plant Pono, publishing the Hawaii-Pacific Weed Risk Assessment

- URL: <https://plantpono.org/hpwra/arctium-lappa/>
- Archived: <https://web.archive.org/web/20260606134338/https://plantpono.org/hpwra/arctium-lappa/>
- Verification: URL-verified | Access: public-domain, evidence tier **C**
- Backs:
  - burdock invasiveStatus
    - "In Hawai‘i, A. lappa is considered a high-risk species and is not recommended for cultivation." (Plant Pono page, second paragraph, with the result box 'High Risk', Score 9, Date Screened May 14, 2019)
- **Caveat:** Published outside a peer-reviewed journal.

#### `plantpono-hpwra-salsify`

Plant Pono (Coordinating Group on Alien Pest Species). (n.d.). *Tragopogon porrifolius (goat's beard, salsify, vegetable-oyster), Hawaii-Pacific Weed Risk Assessment result*. Plant Pono, publishing the Hawaii-Pacific Weed Risk Assessment

- URL: <https://plantpono.org/hpwra/tragopogon-porrifolius/>
- Archived: <https://web.archive.org/web/20260711025519/https://plantpono.org/hpwra/tragopogon-porrifolius/>
- Verification: URL-verified | Access: public-domain, evidence tier **C**
- Backs:
  - salsify invasiveStatus
    - "Tragopogon porrifolius is naturalized in Hawaiʻi and possesses traits that are cause for concern in tropical island ecosystems." (Plant Pono page, 'Risks & Threats' paragraph, with the result box 'High Risk', Score 6.5, Date Screened February 24, 201)
- **Caveat:** Published outside a peer-reviewed journal.

#### `postma2012-polyculture-roots`

Postma, Johannes A.; Lynch, Jonathan P. (2012). *Complementarity in root architecture for nutrient uptake in ancient maize/bean and maize/bean/squash polycultures*. Annals of Botany 110: 521-534

- DOI: [10.1093/aob/mcs082](https://doi.org/10.1093/aob/mcs082)
- Verification: Crossref-verified | Access: paywalled, evidence tier **B**
- Backs:
  - simulation basis for root complementarity in Three Sisters polyculture
- **Caveat:** No PLOS ONE 2015 root-foraging Three Sisters study was located, and the reference 'PMC4416130 (PLOS ONE 2015 root-foraging LER study)' that circulates for one is unresolved. The root-foraging LER work is the Annals of Botany pair, this record and zhang2014-three-sisters-roots.

#### `prosea-chrysanthemum-coronarium`

Dasuki, U.A.; van den Bergh, M.H. (n.d.). *Chrysanthemum coronarium L. (PROSEA)*. Plant Resources of South-East Asia (PROSEA), hosted by Pl@ntUse

- URL: <https://uses.plantnet-project.org/en/Chrysanthemum_coronarium_(PROSEA)>
- Archived: <https://web.archive.org/web/20261017220732/https://uses.plantnet-project.org/en/Chrysanthemum_coronarium_(PROSEA)>
- Verification: URL-verified | Access: public-domain, evidence tier **C**
- Backs:
  - shungiku spacing
    - "Plant spacing depends on harvesting stage (seedlings or mature plants) and harvesting method (pulling or repeated cuts) but varies from 5-15 cm × 5-15 cm." (Section 'Agronomy')
  - shungiku height
    - "An erect, densely leafy, branched, annual herb, 20-60 cm tall in the vegetative stage, up to ca. 90 cm when flowering." (Section 'Description')
  - shungiku daysToMaturity
    - "Alternatively, plants are harvested when they are vegetatively mature (15-25 cm high at 6-8 weeks from sowing) and either pulled or harvested by repeated cuttings over a 3-month period." (Section 'Agronomy')
  - shungiku coldLimit
    - "Some cultivars even tolerate light frost." (Section 'Ecology')
  - shungiku light
    - "It grows relatively well at low light levels. [...] Tangho is suitable for intercropping because it is shade-tolerant." (Sections 'Ecology' and 'Agronomy')
- **Caveat:** Published outside a peer-reviewed journal.

#### `prota-2004-lagenaria-siceraria`

Morimoto, Y.; Mvere, B. (2004). *Lagenaria siceraria (Molina) Standl., record from PROTA4U (Plant Resources of Tropical Africa 2: Vegetables), text mirrored on Pl@ntUse*. PROTA Foundation, Wageningen

- URL: <https://plantuse.plantnet.org/en/Lagenaria_siceraria_(PROTA)>
- Verification: URL-verified | Access: public-domain, evidence tier **C**
- Backs:
  - bottle-gourd daysToMaturity
    - "For use as a vegetable, fruit harvesting starts three months after sowing." (PROTA (Morimoto and Mvere 2004), section 'Harvesting', read on the Pl@ntUse mirror of the PROTA text)
  - bottle-gourd coldLimit
    - "It tolerates low temperatures, but if the temperature drops below 10°C flowering is reduced; it does not tolerate frost." (PROTA (Morimoto and Mvere 2004), section 'Ecology', Pl@ntUse mirror)
- **Caveat:** Published outside a peer-reviewed journal.

#### `prota-2011-corchorus-olitorius`

Fondio, L.; Grubben, G. J. H. (2011). *Corchorus olitorius L., PROTA (Plant Resources of Tropical Africa) record, Pl@ntUse mirror*. PROTA Foundation, mirrored by Pl@ntUse (Pl@ntNet)

- URL: <https://plantuse.plantnet.org/en/Corchorus_olitorius_(PROTA)>
- Archived: <https://web.archive.org/web/20260604100617/https://plantuse.plantnet.org/en/Corchorus_olitorius_%28PROTA%29>
- Verification: URL-verified | Access: public-domain, evidence tier **C**
- Backs:
  - jute-mallow coldLimit
    - "The optimal temperature is 25–32°C. Growth stops below 15°C. Jew’s mallow is a short-day species." (Section 'Ecology')
- **Caveat:** Published outside a peer-reviewed journal.

#### `psu-2026-agritourism-lavender`

Schmidt, Claudia; Cornelisse, Sarah; Kime, Lynn. (2026). *Agritourism Diversification: Lavender Production*. Penn State Extension

- URL: <https://extension.psu.edu/agritourism-diversification-lavender-production>
- Archived: <https://web.archive.org/web/20260419090042/https://extension.psu.edu/agritourism-diversification-lavender-production>
- Verification: URL-verified | Access: public-domain, evidence tier **C**
- Backs:
  - lavender harvestSeason
    - "Harvest is accomplished by hand and can occur throughout the summer months." (“Harvest” section)
- **Caveat:** Published outside a peer-reviewed journal.

#### `psu-extension-gibson-ground-cherries`

Gibson, Mary Jo R. (2026). *Growing Ground Cherries*. Penn State Extension

- URL: <https://extension.psu.edu/growing-ground-cherries>
- Archived: <https://web.archive.org/web/20261017214931/https://extension.psu.edu/growing-ground-cherries>
- Verification: URL-verified | Access: public-domain, evidence tier **C**
- Backs:
  - ground-cherry height
    - "Although most are 1 to 3 feet tall, they sprawl." (Body text, paragraph beginning As you plan your garden)
- **Caveat:** Published outside a peer-reviewed journal.

#### `purdue-1996-asian-vegetables`

Cantwell, Marita; Nie, Xunli; Zong, Ru Jing; Yamaguchi, Mas. (1996). *Asian Vegetables: Selected Fruit and Leafy Types*. Purdue University Center for New Crops and Plant Products (reprint of a chapter in J. Janick, ed., Progress in new crops, ASHS Press, pp. 488-495)

- URL: <https://hort.purdue.edu/newcrop/proceedings1996/V3-488.html>
- Archived: <https://web.archive.org/web/20261017214908/https://hort.purdue.edu/newcrop/proceedings1996/V3-488.html>
- Verification: URL-verified | Access: public-domain, evidence tier **C**
- Backs:
  - garlic-chives yearsToFirstHarvest
    - "Limited harvesting is done during the first year's growth so that reserves build up in the roots." (Chinese chives section (Purdue NewCROP copy of Cantwell et al. 1996, pp. 488-495))
- **Caveat:** Published outside a peer-reviewed journal.

#### `purdue-1997-chamomile`

Purdue University Center for New Crops and Plant Products (NewCrop). (1997). *Chamomile*. Purdue University

- URL: <https://hort.purdue.edu/newcrop/med-aro/factsheets/CHAMOMILE.html>
- Archived: <https://web.archive.org/web/20261017212247/https://hort.purdue.edu/newcrop/med-aro/factsheets/CHAMOMILE.html>
- Verification: URL-verified | Access: public-domain, evidence tier **C**
- Backs:
  - chamomile height
    - "This many-branched, erect-growing annual, formerly classified as Matricaria chamomilla L., reaches a height of about 0.3 meter and has yellow disc white ray flowers." (Fact sheet body text, paragraph on German chamomile (Matricaria recutita))
- **Caveat:** Published outside a peer-reviewed journal.

#### `purdue-2007-soybean-plant-populations-ay217w`

Robinson, Andrew P.; Conley, Shawn P. (2007). *Soybean Production Systems: Plant Populations and Seeding Rates for Soybeans (AY-217-W)*. Purdue University Cooperative Extension Service

- URL: <https://www.extension.purdue.edu/extmedia/ay/ay-217-w.pdf>
- Archived: <https://web.archive.org/web/20250615172131/https://www.extension.purdue.edu/extmedia/ay/ay-217-w.pdf>
- Verification: URL-verified | Access: public-domain, evidence tier **C**
- Backs:
  - soybean spacing
    - "To maximize yields in most environments growers should have no less than 100,000 uniformly standing plants per acre in 7.5- and 15-inch rows and no less than 80,000 uniformly standing plants per acre in 30-inch rows." (p. 3, paragraph above Table 1. Table 1 'Recommended Seeding Rates and Plant Populations at Different Row Widths', row 'R)
- **Caveat:** Published outside a peer-reviewed journal.

#### `purdue-2025-woodmansee-divine-fruit`

Woodmansee, John E. (2025). *Divine Fruit?* Purdue Extension, Whitley County

- URL: <https://extension.purdue.edu/news/county/whitley/2025/11/divine-fruit.html>
- Archived: <https://web.archive.org/web/20260611010156/https://extension.purdue.edu/news/county/whitley/2025/11/divine-fruit.html>
- Verification: URL-verified | Access: public-domain, evidence tier **C**
- Backs:
  - american-persimmon harvestSeason
    - "Farlee said that persimmon fruit normally ripens in September and October, but some trees hold fruit well into winter." (main text (quoting Purdue forestry extension specialist Lenny Farlee))
- **Caveat:** Published outside a peer-reviewed journal.

#### `purdue-christmas-hawkins-winter-canola`

Christmas, Ellsworth P.; Hawkins, Stephen S. (n.d.). *Winter Canola -- An Alternative Crop in Indiana (AY-272)*. Purdue University Cooperative Extension Service

- URL: <https://www.extension.purdue.edu/extmedia/AY/AY-272.html>
- Archived: <https://web.archive.org/web/20241203075724/https://www.extension.purdue.edu/extmedia/AY/AY-272.html>
- Verification: URL-verified | Access: public-domain, evidence tier **C**
- Backs:
  - canola height
    - "In the spring it bolts, reaching a height of 3 to 5 feet, and produces bright yellow flowers." (Publication AY-272, main text)
- **Caveat:** Published outside a peer-reviewed journal.

#### `purdue-newcrop-simon-1984-dandelion`

Simon, J.E.; Chadwick, A.F.; Craker, L.E. (1984). *DANDELION (Aromatic and Medicinal Plants factsheet, from Herbs: An Indexed Bibliography)*. Purdue University Center for New Crops and Plant Products (NewCROP), summarising Archon Books 1984

- URL: <https://hort.purdue.edu/newcrop/med-aro/factsheets/DANDELION.html>
- Archived: <https://web.archive.org/web/20261017220554/https://hort.purdue.edu/newcrop/med-aro/factsheets/DANDELION.html>
- Verification: URL-verified | Access: public-domain, evidence tier **C**
- Backs:
  - dandelion harvestSeason
    - "Roots are generally harvested in spring or fall of the second year, while leaves and flower heads are gathered from cultivated and wild plants throughout the growing season." (Purdue NewCROP 'Aromatic and Medicinal Plants' factsheet DANDELION, which summarises Simon, Chadwick and Craker 1984, la)
- **Caveat:** Published outside a peer-reviewed journal.

#### `pvamu-cocoyam-fact-sheet`

Ampim, Peter A. Y.; Rivera-Ocasio, Dania. (n.d.). *Cocoyam (fact sheet)*. Prairie View A&M University, College of Agriculture and Human Sciences (USDA NIFA 1890 Capacity Building Grant)

- URL: <https://www.pvamu.edu/cafnr/wp-content/uploads/sites/27/Fact-Sheet-Cocoyam.pdf>
- Archived: <https://web.archive.org/web/20250912064010/https://www.pvamu.edu/cafnr/wp-content/uploads/sites/27/Fact-Sheet-Cocoyam.pdf>
- Verification: URL-verified | Access: public-domain, evidence tier **C**
- Backs:
  - malanga height
    - "It can be 1.3 to 2.5 meters tall." (Page 2, 'Plant description')
- **Caveat:** Published outside a peer-reviewed journal.

#### `pvamu-fact-sheet-epazote`

Ampim, Peter A. Y.; Rivera-Ocasio, Dania. (n.d.). *Epazote (specialty crops fact sheet)*. Prairie View A&M University, College of Agriculture and Human Sciences

- URL: <https://www.pvamu.edu/cafnr/wp-content/uploads/sites/27/Fact-Sheet-Epazote.pdf>
- Archived: <https://web.archive.org/web/20240909134659/https://www.pvamu.edu/cafnr/wp-content/uploads/sites/27/Fact-Sheet-Epazote.pdf>
- Verification: URL-verified | Access: public-domain, evidence tier **C**
- Backs:
  - epazote spacing
    - "Plant 200 plants/m2 (19 plants/ft2). Space plants 5-8 cm. (2-3 in.) apart." (Page 1, block 'PROPAGATION')
  - epazote height
    - "Annual or short-lived erect perennial plant that grows up to 1 m (3 ft.) or taller and strongly odorous." (Page 2, block 'PLANT DESCRIPTION')
  - epazote daysToMaturity
    - "About 50 days after planting" (Page 1, block 'DAYS TO MATURITY')
- **Caveat:** Published outside a peer-reviewed journal.

#### `ragone-2006-breadfruit-species-profile`

Ragone, Diane. (2006). *Artocarpus altilis (breadfruit), Species Profiles for Pacific Island Agroforestry, ver. 2.1*. Permanent Agriculture Resources (Agroforestry Net), Holualoa, Hawaii (copy hosted by the CTAHR Master Gardener program, University of Hawaii)

- URL: <https://gms.ctahr.hawaii.edu/gs/handler/getmedia.ashx?moid=3135&dt=3&g=12>
- Archived: <https://web.archive.org/web/20260627124345/https://gms.ctahr.hawaii.edu/gs/handler/getmedia.ashx?moid=3135&dt=3&g=12>
- Verification: URL-verified | Access: public-domain, evidence tier **C**
- Backs:
  - breadfruit width
    - "Trees can reach heights of 18 m (60 ft) or more but are typically 12–15 m (40–50 ft). Some varieties are relatively short-statured, reaching average heights of 9 m (30 ft). The canopy is generally about two-thirds of the height." (p. 12 of 17, section 'Size in an urban environment')
  - breadfruit light
    - "The tree does best in full sun and forms the overstory canopy in traditional mixed agroforests." (p. 7 of 17, entry 'Full sun' under Tolerances)
- **Caveat:** Published outside a peer-reviewed journal.

#### `rodrigues-2022-eryngium-foetidum-review`

Rodrigues, Thiara L. M.; Silva, Maria E. P.; Gurgel, Ely S. C.; Oliveira, Mozaniel S.; Lucas, Flavia C. A. (2022). *Eryngium foetidum L. (Apiaceae): A Literature Review of Traditional Uses, Chemical Composition, and Pharmacological Activities*. Evidence-based Complementary and Alternative Medicine (Hindawi)

- URL: <https://pmc.ncbi.nlm.nih.gov/articles/PMC8938054/>
- Archived: <https://web.archive.org/web/20261017220153/https://pmc.ncbi.nlm.nih.gov/articles/PMC8938054/>
- Verification: URL-verified | Access: public-domain, evidence tier **C**
- Backs:
  - culantro height
    - "classified as a rustic tropical vegetable of herbaceous habit, measuring 45 cm in height" (Section 3.1 'Botanical Aspects, Propagation, and Cultural Treatments')
- **Caveat:** Read in full for the sentences quoted. The catalog row comments say which figure each sentence gives.

#### `rollings2019-garden-flowers`

Rollings, Rosi; Goulson, Dave. (2019). *Quantifying the attractiveness of garden flowers for pollinators*. Journal of Insect Conservation 23: 803-817

- DOI: [10.1007/s10841-019-00177-3](https://doi.org/10.1007/s10841-019-00177-3)
- Verification: Crossref-verified | Access: open-access, evidence tier **A**
- Backs:
  - that flower visitors concentrate on a minority of garden plants, and which plant families those tend to be
- **Caveat:** A single UK garden over two seasons. Family-level patterns travel further than the per-variety ranking does.

#### `rothenberger-mu-g6470-growing-herbs`

Rothenberger, Ray R. (n.d.). *Growing Herbs at Home*. University of Missouri Extension

- URL: <https://extension.missouri.edu/publications/g6470>
- Archived: <https://web.archive.org/web/20260510045450/https://extension.missouri.edu/publications/g6470>
- Verification: URL-verified | Access: public-domain, evidence tier **C**
- Backs:
  - harvest timing for mint
    - "Leaves and stems may be picked anytime" (page 4, "Herb descriptions (continued)", Spearmint entry)
- **Caveat:** Published outside a peer-reviewed journal. Its dates are calibrated to Missouri, and this app places them at the same point in each garden's own frost-free season.

#### `runkle2011-vegetable-dli`

Runkle, Erik. (2011). *Lighting Greenhouse Vegetables*. GPN (Greenhouse Product News) 42

- URL: <https://www.canr.msu.edu/uploads/resources/pdfs/lightingvegetables.pdf>
- Archived: <https://web.archive.org/web/20251112020947/https://www.canr.msu.edu/uploads/resources/pdfs/lightingvegetables.pdf>
- Verification: URL-verified | Access: public-domain, evidence tier **C**
- Backs:
  - minimum DLI for vine crops (tomato, pepper, cucumber)
    - "A recommended minimum DLI for lettuce production is 12 to 14 mol/m2/d, whereas at least 15 (and preferably more than 20) mol/m2/d is suggested for vine crops" (p. 42)
  - the 1-percent rule
    - "As a general rule, a 1 percent increase in DLI increases production by 1 percent" (p. 42)
  - tomato develops chlorotic leaves under continuous light, so four to six hours of darkness is suggested each night
- **Caveat:** This is the only Extension-authored source located that states a tomato or vine-crop DLI minimum, and the number it gives is 15, preferably >20. The 'at least 22 mol/m2/d' tomato DLI that circulates is verbatim ReduSystems vendor marketing. It has no source in this corpus or in the literature, so nothing citable backs it. The sentence carrying the 15 names no crop at all. It says only 'is suggested for vine crops'. The tomato, pepper and cucumber lumping is the opening sentence of the column, 'Greenhouse vegetable crops, such as tomato, pepper and cucumber, are considered vine crops', so the per-species reading is this app's. The column prints no 30 anywhere: the top of this app's 20 to 30 band comes from VCE SPES-720NP Table 3 and Purdue HO-238-B-W. It's a trade-magazine column that isn't peer reviewed, and it cites no primary source for the 15/20 figures. It's Tier C, so it can't back a hard filter.

#### `runkle2019-dli-requirements`

Runkle, Erik. (2019). *DLI 'Requirements'*. GPN (Greenhouse Product News)

- URL: <https://gpnmag.com/article/dli-requirements/>
- Archived: <https://web.archive.org/web/20261017211139/https://gpnmag.com/article/dli-requirements/>
- Verification: URL-verified | Access: public-domain, evidence tier **C**
- Backs:
  - Extension's own objection to the concept this app gates on
    - "Growers sometimes ask for the DLI "requirement" of a particular crop, or type of crops. In my opinion, there is no such thing as a DLI requirement because, with some notable exceptions, most plants can grow under a wide range of environmental conditions, including different DLIs. Growth of crops also depends on carbon dioxide (CO2) concentration and especially temperature, as well as crop culture. Therefore, providing a DLI requirement is both subjective and situational." (first paragraph)
  - fruiting vegetables at a target of 15+ mol/m2/d in Table 1, whose caption reads 'Suggested daily light integral (DLI) targets for crops grown in controlled environments. Values are subjective and situational, and can vary depending on the shade tolerance of species, other environmental factors (notably, temperature and CO2), the market, and economics.'
  - the direction behind the lettuce disorder ceiling
    - "there can be negative outcomes for some crops when the DLI is too high. Examples include leaf tip burn of some lettuces" ("Too Little or Too Much" section)
- **Caveat:** The quote in this app's DLI disclosure is from this column. Table 1's cells are served as an image on the archived page. The caption is verbatim from the page, and the values (leafy greens and herbs 12+, cut flowers 15+, fruiting vegetables 15+, late plugs 10-15) are transcribed from the printed table. It's a trade-magazine column that isn't peer reviewed, and it cites no primary source.

#### `rutgers-fs547-tomato-diseases`

Wyenandt, Andy; Nitzsche, Peter. (2025). *Diagnosing and Controlling Fungal Diseases of Tomato in the Home Garden*. Rutgers New Jersey Agricultural Experiment Station FS547

- URL: <https://njaes.rutgers.edu/fs547/>
- Archived: <https://web.archive.org/web/20260712092924/https://njaes.rutgers.edu/fs547/>
- Verification: URL-verified | Access: public-domain, evidence tier **B**
- Backs:
  - the Solanaceae rotation interval this app applies
    - "A minimum rotation of three years is considered essential to help reduce populations of soil-borne fungi" ("Control Measures for Fungal Diseases in the Home Garden" section)
  - the crops that interval covers together
    - "Each year, plant tomatoes in a new location away from areas where tomatoes, eggplant, potatoes, or peppers have been grown in the past, since these vegetables all have similar disease problems" ("Control Measures for Fungal Diseases in the Home Garden" section)
- **Caveat:** Extension guidance for home gardeners, citing no trial of its own for the three years. The A to E scheme grades study designs and has no rung for an extension consensus on a characterized mechanism, so the grade this rule ships with is a judgment call recorded in `src/data/companions.ts`.

#### `rutgers-fs678-growing-tomatoes`

Reiners, Steve; Nitzsche, Peter. (2021). *Growing Tomatoes in the Home Garden*. Rutgers New Jersey Agricultural Experiment Station FS678

- URL: <https://njaes.rutgers.edu/fs678/>
- Archived: <https://web.archive.org/web/20260711142636/https://njaes.rutgers.edu/fs678/>
- Verification: URL-verified | Access: public-domain, evidence tier **C**
- Backs:
  - the laxer rotation figure in the same extension service
    - "If possible, plant tomatoes in an area where tomatoes, peppers, eggplants, and potatoes have not grown for at least two years to help avoid soil-borne disease problems" ("Planting Site and Soil Preparation" section)
- **Caveat:** Four years older than FS547 and not disease-specific. Carried as the lower end of the range the two sheets give, and the app ships the longer interval.

#### `sahli2012-chemlali-olive-chilling`

Sahli, A.; Dakhlaoui, H.; Aïachi Mezghani, M.; Bornaz, S.; Aounallah, M. K.; Hellali, R. (2012). *Estimation of chilling and heat requirement of 'Chemlali' olive cultivar and its use to predict flowering date*. Acta Horticulturae 155-164

- DOI: [10.17660/ActaHortic.2012.949.21](https://doi.org/10.17660/ActaHortic.2012.949.21)
- Verification: Crossref-verified | Access: paywalled, evidence tier **C**
- Backs:
  - the chilling and heat requirement estimated for the 'Chemlali' olive cultivar, cited here for its summary of De Melo-Abreu et al.'s 150 to 300 hour range

#### `sare-2021-sea-kale`

Unangst-Rufenacht, Graham. (2021). *Seakale: Commercial Opportunities for New Perennial Crops and Climate Smart Agriculture (Final Report, Project FNE18-895)*. USDA Northeast SARE (Sustainable Agriculture Research and Education), with University of Vermont Extension as technical advisor

- URL: <https://projects.sare.org/project-reports/fne18-895/>
- Archived: <https://web.archive.org/web/20260511183820/https://projects.sare.org/project-reports/fne18-895/>
- Verification: URL-verified | Access: public-domain, evidence tier **C**
- Backs:
  - harvest timing for sea-kale
    - "Seakale provides a harvest of shoot (in May) and broccoli florets (in early June), which presents farmers with an opportunity to functionally integrate Seakale into their cropping when there are few other crops available for harvest" (Project summary/rationale narrative (opening section, before "Description of farm operation"))
- **Caveat:** Published outside a peer-reviewed journal. Its dates are calibrated to Vermont, represented by Burlington, and this app places them at the same point in each garden's own frost-free season. Sea kale dates come from a USDA SARE farmer grant report with University of Vermont Extension as technical adviser. It gives the harvest only as the month of May.

#### `shelton2006-trap-cropping`

Shelton, A. M.; Badenes-Perez, F. R. (2006). *Concepts and Applications of Trap Cropping in Pest Management*. Annual Review of Entomology 51: 285-308

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

#### `siap-2019-epazote`

Servicio de Información Agroalimentaria y Pesquera (SIAP). (2019). *Epazote*. Servicio de Información Agroalimentaria y Pesquera (SIAP), Secretaría de Agricultura y Desarrollo Rural, México

- URL: <https://web.archive.org/web/20220121170740/https://www.gob.mx/cms/uploads/attachment/file/587577/Epazote_.pdf>
- Verification: URL-verified | Access: public-domain, evidence tier **C**
- Backs:
  - epazote coldLimit
    - "El clima más apto es el templado y, también el templado cálido; no tolera las heladas." (Section 'Condiciones edáficas y clima')
- **Caveat:** Published outside a peer-reviewed journal.

#### `singh2025-ucanr-moringa`

Singh, Hardeep. (2025). *Moringa Oleifera (Miracle tree)*. UCCE Central Sierra Agriculture

- URL: <https://ucanr.edu/site/ucce-central-sierra-agriculture/article/moringa-oleifera-miracle-tree>
- Archived: <https://web.archive.org/web/20251205080837/https://ucanr.edu/site/ucce-central-sierra-agriculture/article/moringa-oleifera-miracle-tree>
- Verification: URL-verified | Access: public-domain
- Backs:
  - moringa spacing
    - "could be grown for leaves and/or pods and spaced 3 to 6 feet apart accordingly" (second paragraph)
  - moringa coldLimit
    - "In California, winter frosts could kill the moringa and therefore it is cut back to one foot and covered with plastic during the winters" (second paragraph)
- **Caveat:** A Cooperative Extension article for the central Sierra foothills. The spacing is a home-orchard range.

#### `snyder1993-sweetfern-feis`

Snyder, S. A. (1993). *Comptonia peregrina, sweetfern*. Fire Effects Information System

- DOI: [10.2737/feis-species-review-comper](https://doi.org/10.2737/feis-species-review-comper)
- Verification: Crossref-verified | Access: public-domain, evidence tier **C**
- Backs:
  - sweetfern grows in well-drained, dry, acid, sandy or gravelly soils
  - because it fixes nitrogen sweetfern does well on disturbed or sterile sites such as pine barrens
- **Caveat:** FEIS states the acid-soil habit qualitatively and publishes no pH numbers for this species. The sweetfern trapezoid in the catalog is a Tier C curation and isn't transcribed from this source, so this work can't back a pH figure. FEIS also reports only that sweetfern presence seemed to enhance neighboring little bluestem growth, and it measures no nitrogen transfer to any neighbor.

#### `snyder2005-fao-frost-protection`

Snyder, R. L.; de Melo-Abreu, J. P. (2005). *Frost protection: fundamentals, practice and economics, Volume 1*. Food and Agriculture Organization of the United Nations FAO Environment and Natural Resources Series 10

- URL: <https://www.fao.org/4/y7223e/y7223e00.htm>
- Archived: <https://web.archive.org/web/20260905213907/https://www.fao.org/4/y7223e/y7223e00.htm>
- Verification: URL-verified | Access: public-domain, evidence tier **A**
- Backs:
  - radiative frost and advective frost are different events, and only the radiative kind is reduced by putting something between the ground and the sky
  - covers and screens work by intercepting longwave loss to the sky, which is the same mechanism a panel row applies
- **Caveat:** Only the page title confirms the document's identity, and its full text hasn't been read. It's cited for the radiative-versus-advective distinction and the mechanism of covers, and it backs no quantity. No frost-margin figure for an agrivoltaic array appears in it, and a search located none anywhere.

#### `sperling-king-1990-andean-tuber-crops`

Sperling, Calvin R.; King, Steven R. (1990). *Andean Tuber Crops: Worldwide Potential (pages 428-435 in Advances in New Crops, Timber Press)*. Purdue University Center for New Crops and Plant Products (symposium proceedings host)

- URL: <https://hort.purdue.edu/newcrop/proceedings1990/V1-428.html>
- Archived: <https://web.archive.org/web/20251005020747/https://hort.purdue.edu/newcrop/proceedings1990/V1-428.html>
- Verification: URL-verified | Access: public-domain, evidence tier **C**
- Backs:
  - oca spacing
    - "Planting is done in rows or hills 80-100 cm apart with plants spaced 40-60 cm apart in the rows (Rea 1975)." (Section 'Cultural Practices' under 'Agricultural Requirements' (pages 428-435 of Advances in New Crops, Timber Press, 19))
- **Caveat:** Published outside a peer-reviewed journal.

#### `strik2007-worldwide-blackberry`

Strik, Bernadine C.; Clark, John R.; Finn, Chad E.; Bañados, M. Pilar. (2007). *Worldwide Blackberry Production*. HortTechnology 17: 205-213

- DOI: [10.21273/HORTTECH.17.2.205](https://doi.org/10.21273/HORTTECH.17.2.205)
- Verification: Crossref-verified | Access: open-access, evidence tier **C**
- Backs:
  - blackberry acceptedName
    - "A survey of worldwide blackberry (Rubus spp.) production was conducted in 2005." (Summary, page 205)
  - blackberry acceptedName
    - "Natural hybrids of wild species provided several of the first named cultivars" (page 205)
- **Caveat:** A survey of the world’s plantings, with no trial of its own.

#### `tamu-2011-rodriguez-harvesting-oriental-persimmons`

Rodriguez, David. (2011). *Harvesting Oriental Persimmons*. Texas A&M AgriLife Extension Service, Bexar County

- URL: <https://bexar-tx.tamu.edu/earth-kind-horticulture/best-plants-for-bexar-county-south-texas/harvesting-oriental-persimmons/>
- Archived: <https://web.archive.org/web/20260512093521/https://bexar-tx.tamu.edu/earth-kind-horticulture/best-plants-for-bexar-county-south-texas/harvesting-oriental-persimmons/>
- Verification: URL-verified | Access: public-domain, evidence tier **C**
- Backs:
  - persimmon harvestSeason
    - "Oriental persimmons generally start ripening around late October through the early part of December in San Antonio and surrounding areas." (main text)
- **Caveat:** Published outside a peer-reviewed journal.

#### `tamu-2013-stein-persimmons`

Stein, Larry; Nesbitt, Monte; Kamas, Jim. (2013). *Persimmons (E-611, Texas Fruit and Nut Production)*. Texas A&M AgriLife Extension Service

- URL: <https://aggie-horticulture.tamu.edu/fruit-nut/wp-content/uploads/sites/6/2015/04/persimmons_2015.pdf>
- Archived: <https://web.archive.org/web/20260910071551/https://aggie-horticulture.tamu.edu/fruit-nut/wp-content/uploads/sites/6/2015/04/persimmons_2015.pdf>
- Verification: URL-verified | Access: public-domain, evidence tier **C**
- Backs:
  - persimmon spacing
    - "Plant the trees every 15 to 18 feet in rows that are 20 feet apart." ("Site preparation and planning" section, p. 3)
- **Caveat:** Published outside a peer-reviewed journal.

#### `tamu-2018-jujubes-home-gardeners`

Stein, Larry; Gu, Mengmeng; Li, Qiansheng. (2018). *Jujubes - Easiest Tree Fruit for Home Gardeners (HORT-PU-138)*. Texas A&M AgriLife Extension Service

- URL: <https://mytexas.ag.tamu.edu/publications/jujubes-easiest-tree-fruit-for-home-gardeners/>
- Archived: <https://web.archive.org/web/20261017221010/https://mytexas.ag.tamu.edu/publications/jujubes-easiest-tree-fruit-for-home-gardeners/>
- Verification: URL-verified | Access: public-domain, evidence tier **C**
- Backs:
  - jujube spacing
    - "Space them 6 to 12 feet apart." ("Planting" section)
  - jujube light
    - "The plants grow best under full sun and in well-drained soils." ("Selecting a site" section)
- **Caveat:** Published outside a peer-reviewed journal.

#### `tamu-sauls-citrus`

Sauls, Julian W. (n.d.). *Citrus*. Texas A&M AgriLife Extension, Aggie Horticulture

- URL: <https://aggie-horticulture.tamu.edu/fruit-nut/fact-sheets/citrus/>
- Archived: <https://web.archive.org/web/20260421045345/https://aggie-horticulture.tamu.edu/fruit-nut/fact-sheets/citrus/>
- Verification: URL-verified | Access: public-domain, evidence tier **C**
- Backs:
  - orange light
    - "Citrus requires full sunlight for optimum growth and production." ("Site Selection" section)
  - lime yearsToFirstHarvest
    - "Most budded citrus trees can produce a few fruit in the second year after planting, but usually do not produce until the third year." ("Productivity and Maturity" section)
- **Caveat:** Published outside a peer-reviewed journal.

#### `tang2020-p-use-efficiency`

Tang, Xiaoyan; Zhang, Chaochun; Yu, Yang; Shen, Jianbo. (2020). *Intercropping legumes and cereals increases phosphorus use efficiency; a meta-analysis*. Plant and Soil 460: 89-104

- DOI: [10.1007/s11104-020-04768-x](https://doi.org/10.1007/s11104-020-04768-x)
- Verification: Crossref-verified | Access: open-access, evidence tier **A**
- Backs:
  - LER_P = 1.24 in cereal-legume intercrops with a mean net P gain of 3.67 kg P/ha

#### `theunissen1994-intercropping-pests`

Theunissen, J. (1994). *Intercropping in field vegetable crops: Pest management by agrosystem diversification - an overview*. Pesticide Science 42: 65-68

- DOI: [10.1002/ps.2780420111](https://doi.org/10.1002/ps.2780420111)
- Verification: Crossref-verified | Access: paywalled, evidence tier **B**
- Backs:
  - intercropping as pest management via agrosystem diversification
- **Caveat:** Crossref gives pages 42:65-68. The pair 42:65-72 also circulates.

#### `thilakarathna2016-n-transfer`

Thilakarathna, Malinda S.; McElroy, Michelle S.; Chapagain, Tejendra; Papadopoulos, Yousef A.; Raizada, Manish N. (2016). *Belowground nitrogen transfer from legumes to non-legumes under managed herbaceous cropping systems. A review*. Agronomy for Sustainable Development 36: 58

- DOI: [10.1007/s13593-016-0396-4](https://doi.org/10.1007/s13593-016-0396-4)
- Verification: Crossref-verified | Access: paywalled, evidence tier **B**
- Backs:
  - same-season legume-to-cereal N transfer is typically below 15% of the legume's N, Grade B
  - corrects the folklore that interplanted legumes materially fertilize their neighbors
- **Caveat:** An erratum exists at 10.1007/s13593-016-0403-9 and should be consulted before quoting specific percentages.

#### `tirmenstein1991-lingonberry-feis`

Tirmenstein, D. A. (1991). *Vaccinium vitis-idaea, lingonberry*. Fire Effects Information System

- DOI: [10.2737/feis-species-review-vacvit](https://doi.org/10.2737/feis-species-review-vacvit)
- Verification: Crossref-verified | Access: public-domain, evidence tier **C**
- Backs:
  - lingonberry soil pH ranges from 2.7 to 8.2, with best growth reported at 4.0 to 4.9
  - lingonberry grows on acidic sandy loams or loamy clays high in decaying organics
- **Caveat:** This FEIS review is a secondary synthesis of field observations and isn't a controlled pH trial. The 2.7-8.2 range is the observed field range, and the 4.0-4.9 optimum is quoted from the primary studies FEIS cites. Both are transcribed verbatim into the catalog trapezoid.

#### `tirmenstein1991-lowbush-blueberry-feis`

Tirmenstein, D. A. (1991). *Vaccinium angustifolium, lowbush blueberry*. Fire Effects Information System

- DOI: [10.2737/feis-species-review-vacang](https://doi.org/10.2737/feis-species-review-vacang)
- Verification: Crossref-verified | Access: public-domain, evidence tier **C**
- Backs:
  - lowbush blueberry grows on acidic soils with pH ranging from 2.8 to 6.6 but thrives at pH 4.2 to 5.2
- **Caveat:** This FEIS review is a secondary synthesis of field observations and isn't a controlled pH trial.

#### `tnau-2011-hort282-cumin`

Tamil Nadu Agricultural University. (2011). *HORT 282 :: Lecture 06 :: CUMIN*. Tamil Nadu Agricultural University

- URL: <http://eagri.org/eagri50/HORT282/lec06.html>
- Archived: <https://web.archive.org/web/20260813231432/http://eagri.org/eagri50/HORT282/lec06.html>
- Verification: URL-verified | Access: public-domain, evidence tier **C**
- Backs:
  - cumin height
    - "It is an herbaceous annual plant, with a slender branched stem 20–30 cm tall." (Section 'Botany')
- **Caveat:** Published outside a peer-reviewed journal.

#### `tnau-2013-ragi-cultivation`

Tamil Nadu Agricultural University. (2013). *Ragi*. Tamil Nadu Agricultural University, Agritech Portal

- URL: <https://agritech.tnau.ac.in/agriculture/CropProduction/Millets/millets_ragi.html>
- Archived: <https://web.archive.org/web/20261017212638/https://agritech.tnau.ac.in/agriculture/CropProduction/Millets/millets_ragi.html>
- Verification: URL-verified | Access: public-domain, evidence tier **C**
- Backs:
  - finger-millet height
    - "Height (cm) 75-80 85 - 90 115-120" ('Particulars of Ragi Strains' table, for varieties CO 9, CO 13 and CO (Ra) 14 respectively)
  - finger-millet daysToMaturity
    - "Duration (days) 100-105 95 - 100 105-110" ('Particulars of Ragi Strains' table, for varieties CO 9, CO 13 and CO (Ra) 14 respectively)
- **Caveat:** Published outside a peer-reviewed journal.

#### `tnau-black-pepper`

Tamil Nadu Agricultural University. (n.d.). *Horticulture :: Spice Crops :: Pepper (Black pepper, Piper nigrum L.)*. Tamil Nadu Agricultural University, Agritech Portal

- URL: <https://agritech.tnau.ac.in/horticulture/horti_spice%20crops_pepper.html>
- Archived: <https://web.archive.org/web/20261017215715/https://agritech.tnau.ac.in/horticulture/horti_spice%20crops_pepper.html>
- Verification: URL-verified | Access: public-domain, evidence tier **C**
- Backs:
  - black-pepper height
    - "Prune excessive foliage of the standards and limit the height of the standards to about 6 m." (Section 'Aftercultivation')
  - black-pepper yearsToFirstHarvest
    - "Pepper vines start yielding usually from the 3rd or 4th year." (Section 'Harvesting and curing')
  - black-pepper harvestSeason
    - "Harvesting is done from the November to February in the plains and January to March in the hills." (Section 'Harvesting and curing')
- **Caveat:** Published outside a peer-reviewed journal.

#### `tnau-safflower-package-of-practices`

Tamil Nadu Agricultural University. (n.d.). *Safflower (Carthamus tinctorius), Crop Production, Oil Seeds*. Tamil Nadu Agricultural University, Agritech Portal

- URL: <https://agritech.tnau.ac.in/agriculture/oilseeds_safflower.html>
- Archived: <https://web.archive.org/web/20260609111519/https://www.agritech.tnau.ac.in/agriculture/oilseeds_safflower.html>
- Verification: URL-verified | Access: public-domain, evidence tier **C**
- Backs:
  - safflower spacing
    - "Adopt a spacing of 45 cm between rows and 15 cm between plants." (Section 'Preparation of the field', item 5 Spacing)
- **Caveat:** Published outside a peer-reviewed journal.

#### `tnau-stevia-medicinal-crops`

Tamil Nadu Agricultural University. (n.d.). *Horticulture :: Medicinal Crops :: Stevia*. Tamil Nadu Agricultural University, TNAU Agritech Portal

- URL: <https://agritech.tnau.ac.in/horticulture/horti_medicinal%20crops_stevia.html>
- Archived: <https://web.archive.org/web/20261017215058/https://agritech.tnau.ac.in/horticulture/horti_medicinal%20crops_stevia.html>
- Verification: URL-verified | Access: public-domain, evidence tier **C**
- Backs:
  - stevia spacing
    - "Rooted cuttings are planted at a spacing of 45X45 cm, with a total plant density in the order of 30,000 plants per ha." (Planting section)
- **Caveat:** Published outside a peer-reviewed journal.

#### `tribhuvan2026-winged-bean-photoperiod`

Tribhuvan, Kishor U.; N, Mustafa; Gidhi, Anupama; Singh, Devendra K.; Kumar, Saurav; Kumar, Sudhir; Singh, Binay K. (2026). *Germplasm screening and genome-wide PEBP profiling identify key regulators of photoperiod-insensitive flowering in winged bean (Psophocarpus tetragonolobus L)*. BMC Genomics 27: 512

- DOI: [10.1186/s12864-026-12857-x](https://doi.org/10.1186/s12864-026-12857-x)
- Verification: Crossref-verified | Access: open-access, evidence tier **B**
- Backs:
  - winged-bean photoperiod criticalHours. Flowering under natural days of 12.5 h or less and almost none at 13.0 h or more puts the critical length between them, and the catalog takes the midpoint, 12.75 h
    - "SD conditions corresponded to natural daylengths from July to October (11.5–12.5 h)" (Methods, photoperiod sensitivity)
    - "LD conditions corresponded to natural daylengths from March to June (13.0–14.2 h)" (Methods, photoperiod sensitivity)
    - "In this study, 76 (94%) of the 81 winged bean accessions evaluated under both SD and LD photoperiods for three consecutive years failed to initiate flowering under LD conditions." (Discussion)
- **Caveat:** Three years of field sowings at one site, 81 accessions. The study brackets the critical day length between its short-day and long-day seasons and gives no single figure, so the 12.75 h midpoint is this app’s derivation. License CC BY-NC-ND 4.0.

#### `uaex-2008-hyacinth-bean`

Klingaman, Gerald. (2008). *Plant of the Week: Hyacinth Bean*. University of Arkansas System Division of Agriculture, Cooperative Extension Service

- URL: <https://www.uaex.uada.edu/yard-garden/resource-library/plant-week/hyacinth-bean-10-03-08.aspx>
- Archived: <https://web.archive.org/web/20261017221340/https://www.uaex.uada.edu/yard-garden/resource-library/plant-week/hyacinth-bean-10-03-08.aspx>
- Verification: URL-verified | Access: public-domain, evidence tier **C**
- Backs:
  - lablab daysToMaturity
    - "It takes about 90 days from planting until the first pods are produced." (Plant of the Week article, paragraph on flowers and pods)
  - lablab coldLimit
    - "Its roots will survive over winter in zone 8 if plants are well mulched but mostly the vine is grown as an annual." (Plant of the Week article, paragraph on hot weather)
- **Caveat:** Published outside a peer-reviewed journal.

#### `uaex-2017-camellia-sinensis`

University of Arkansas Division of Agriculture Cooperative Extension Service. (2017). *Plant of the Week: Camellia sinensis, Tea*. University of Arkansas Division of Agriculture Cooperative Extension Service

- URL: <https://www.uaex.uada.edu/yard-garden/resource-library/plant-week/Camellia-sinensis-Tea-10-27-2017.aspx>
- Archived: <https://web.archive.org/web/20261017213021/https://www.uaex.uada.edu/yard-garden/resource-library/plant-week/Camellia-sinensis-Tea-10-27-2017.aspx>
- Verification: URL-verified | Access: public-domain, evidence tier **C**
- Backs:
  - tea light
    - "Plants are understory shrubs in nature and grow in moderate to heavy shade, but tea plantations are almost always in open fields in full sun." ('Camellia sinensis (Tea Plant)' page text)
- **Caveat:** Published outside a peer-reviewed journal.

#### `uaex-andersen-garden-cress`

Andersen, Craig R. (n.d.). *Garden Cress (Home Gardening Series, FSA6084)*. University of Arkansas System Division of Agriculture, Cooperative Extension Service

- URL: <https://www.uaex.uada.edu/publications/pdf/FSA-6084.pdf>
- Archived: <https://web.archive.org/web/20261017215029/https://www.uaex.uada.edu/publications/pdf/FSA-6084.pdf>
- Verification: URL-verified | Access: public-domain, evidence tier **C**
- Backs:
  - cress spacing
    - "Spacing – 1 to 2 inches" (Page 1, Culture box (the same page says Sow 10 to 15 seeds per foot of row and Garden cress is not usually thinned))
  - cress daysToMaturity
    - "Broad Leaved 10-40" (Page 2, Cultivars table, column Days to Maturity, row Garden Cress Broad Leaved (the Curled Cressida row gives 10-30))
- **Caveat:** Published outside a peer-reviewed journal.

#### `uaex-salsify-fsa6094`

Andersen, Craig R. (n.d.). *Salsify (FSA6094, Home Gardening Series)*. University of Arkansas System Division of Agriculture, Cooperative Extension Service

- URL: <https://www.uaex.uada.edu/publications/PDF/FSA-6094.pdf>
- Archived: <https://web.archive.org/web/20261017215302/https://www.uaex.uada.edu/publications/PDF/FSA-6094.pdf>
- Verification: URL-verified | Access: public-domain, evidence tier **C**
- Backs:
  - salsify coldLimit
    - "Because of its ability to withstand a hard freeze in the winter, salsify may be harvested until early spring." (Page 1, introduction)
- **Caveat:** Published outside a peer-reviewed journal.

#### `uarizona-2024-deciduous-fruit-nuts-low-desert`

Bradley, Lucy; Maurer, Michael. (2024). *Deciduous Fruit & Nuts for the Low Desert (az1269)*. The University of Arizona Cooperative Extension

- URL: <https://www.extension.arizona.edu/sites/default/files/2025-05/az1269_Deciduous-Fruit-and-Nuts-for-the-Low-Desert.pdf>
- Archived: <https://web.archive.org/web/20251107224409/https://extension.arizona.edu/sites/default/files/2025-05/az1269_Deciduous-Fruit-and-Nuts-for-the-Low-Desert.pdf>
- Verification: URL-verified | Access: public-domain, evidence tier **C**
- Backs:
  - quince chillHours
    - "Cold hardy, yet low chilling requirement of 300 hours." (az1269, under both Orange Quince and Pineapple Quince, page 3, and the chart's Chilling Hours column, page 7)
- **Caveat:** Extension publication, reviewed by University faculty and not peer reviewed. It lists low-chill cultivars for the Arizona low desert, so the 300 hours are those cultivars’ figure, and it names no origin for it. It counts the hours between 32 and 45 F from November 1 to February 15.

#### `ucanr-2008-artichoke`

Smith, Richard; Baameur, Aziz; Bari, Mohammad; Cahn, Michael; Giraud, Deborah; Natwick, Eric; Takele, Eta. (2008). *Artichoke Production in California (UC ANR Publication 7221)*. University of California Division of Agriculture and Natural Resources

- URL: <https://ucanr.edu/sites/default/files/2026-04/anrcatalog%20Artichoke%20Production%20in%20California%207221.pdf>
- Archived: <https://web.archive.org/web/20260610083635/https://ucanr.edu/sites/default/files/2026-04/anrcatalog%20Artichoke%20Production%20in%20California%207221.pdf>
- Verification: URL-verified | Access: public-domain, evidence tier **C**
- Backs:
  - harvest timing for globe-artichoke
    - "Perennial artichokes are harvested year-round, but the highest volume of production occurs between March and May" (p. 4, "Harvesting and Handling" section)
- **Caveat:** Published outside a peer-reviewed journal. Its dates are calibrated to the Salinas Valley in Monterey County on California's Central Coast, represented by Salinas. This app places them at the same point in each garden's own frost-free season. Globe artichoke is picked year-round on the Central Coast, and the figure is the stated March to May peak.

#### `ucanr-2012-citrus-sacramento`

UC Master Gardeners, Sacramento County. (2012). *Growing Citrus in Sacramento (Garden Notes GN127)*. University of California Cooperative Extension, Sacramento County

- URL: <https://ucanr.edu/sites/default/files/2013-07/72239.pdf>
- Archived: <https://web.archive.org/web/20261017213132/https://ucanr.edu/sites/default/files/2013-07/72239.pdf>
- Verification: URL-verified | Access: public-domain, evidence tier **C**
- Backs:
  - orange spacing
    - "Space standard trees at least 12 feet apart, and dwarf trees 8 to 10 feet apart." (PLANTING section, p. 1 of 4)
  - orange coldLimit
    - "Oranges and mandarins 21°F" (table under "COLD HARDINESS" heading, p. 4 of 4)
  - lime spacing
    - "Space standard trees at least 12 feet apart, and dwarf trees 8 to 10 feet apart." (PLANTING section, p. 1 of 4)
  - lime coldLimit
    - "Limes 29°F" (table under "COLD HARDINESS" heading, p. 4 of 4)
  - mandarin spacing
    - "Space standard trees at least 12 feet apart, and dwarf trees 8 to 10 feet apart." (PLANTING section, p. 1 of 4)
- **Caveat:** Published outside a peer-reviewed journal.

#### `ucanr-alameda-yacon-what-is-it`

Silva, Yolanda. (n.d.). *Yacon: What is it?* UC Cooperative Extension Alameda County and UC Master Gardener Program of Alameda County

- URL: <https://ucanr.edu/sites/default/files/2019-04/301726.pdf>
- Archived: <https://web.archive.org/web/20250712195058/https://ucanr.edu/sites/default/files/2019-04/301726.pdf>
- Verification: URL-verified | Access: public-domain, evidence tier **C**
- Backs:
  - yacon height
    - "the plant typically grows 4 to 8 feet tall, depending on variety." (Page 1 (one-page fact sheet))
- **Caveat:** Published outside a peer-reviewed journal.

#### `ucanr-johnson-1983-jicama`

Johnson, Hunter. (1983). *Jicama*. University of California Cooperative Extension, Small Farms Network

- URL: <https://ucanr.edu/program/uc-small-farms-network/jicama>
- Archived: <https://web.archive.org/web/20260214141431/https://ucanr.edu/program/uc-anr-small-farms-network/jicama>
- Verification: URL-verified | Access: open-access, evidence tier **C**
- Backs:
  - jicama spacing, the 9 in by 2.5 ft midpoints, 0.17 m² a plant, 42 cm on a square grid
    - "Rows should be two to three feet apart with plants eight to 10 inches apart in the row." (section 'Cultural Requirements')
- **Caveat:** An archived copy of a 1983 extension leaflet that isn't peer reviewed. Comments on this app's catalog row say which figure the sentence gives.

#### `ucanr-santaclara-citrus`

UCCE Master Gardener Program of Santa Clara County. (n.d.). *Growing Fabulous Citrus*. University of California Cooperative Extension, Santa Clara County

- URL: <https://ucanr.edu/sites/default/files/2020-02/319461.pdf>
- Archived: <https://web.archive.org/web/20251205073346/https://ucanr.edu/sites/default/files/2020-02/319461.pdf>
- Verification: URL-verified | Access: public-domain, evidence tier **C**
- Backs:
  - orange height
    - "Navel - Standard tree 20 to 25 feet high, dwarf 8 feet." ("Sweet oranges" section, p. 4 of 6)
  - orange harvestSeason
    - "Washington Navel –harvest Dec – May." ("Sweet oranges" section, p. 4 of 6)
  - lime harvestSeason
    - "Tahitian or Persian limes – Bearss variety recommended for SCC. Hardier than Mexican/West Indian (Key) lime, not as hardy as lemon. Attractive small tree. Seedless, ripens to yellow; doesn’t hold well on tree once ripe. Harvest Aug-Mar." ("Limes" section, p. 5 of 6)
  - lime light
    - "Limes and most lemons do not need full sun or long periods of heat to ripen fruit." ("Plant Selection" section, p. 1 of 6)
  - mandarin harvestSeason
    - "Satsuma – a group of varieties including Owari. Early ripening and very cold hardy. Harvest Dec - Apr, depending on variety." ("Mandarins and mandarin hybrids" section, p. 4 of 6)
- **Caveat:** Published outside a peer-reviewed journal.

#### `ucce-2010-lemon-cost-study-sjv-south`

O'Connell, Neil V.; Kallsen, Craig E.; Klonsky, Karen M.; De Moura, Richard L. (2010). *Sample Costs to Establish an Orchard and Produce Lemons, San Joaquin Valley South, Low Volume Irrigation*. University of California Cooperative Extension

- URL: <https://coststudyfiles.ucdavis.edu/uploads/cs_public/57/c4/57c4611c-f2bb-4bde-9b77-a343ca9f0a62/lemonvs10.pdf>
- Archived: <https://web.archive.org/web/20250730185518/https://coststudyfiles.ucdavis.edu/uploads/cs_public/57/c4/57c4611c-f2bb-4bde-9b77-a343ca9f0a62/lemonvs10.pdf>
- Verification: URL-verified | Access: public-domain, evidence tier **C**
- Backs:
  - harvest timing for lemon
    - "Typically one-third of the orchard is picked in each of three harvests over the growing season. Lemons are picked and graded by size and normally harvested from mid October through March" (LM-VS-10, p. 8)
- **Caveat:** Published outside a peer-reviewed journal. Its dates are calibrated to Tulare and Kern counties, the San Joaquin Valley South region of California, and this app places them at the same point in each garden's own frost-free season. Lemon dates come from a commercial cost study for the southern San Joaquin Valley.

#### `uconn-plantdatabase-hippophae-rhamnoides`

Brand, Mark H. (n.d.). *Hippophae rhamnoides, Common Seabuckthorn*. University of Connecticut Plant Database

- URL: <https://plantdatabase.uconn.edu/detail.php?pid=205>
- Archived: <https://web.archive.org/web/20261017221124/https://plantdatabase.uconn.edu/detail.php?pid=205>
- Verification: URL-verified | Access: public-domain, evidence tier **C**
- Backs:
  - sea-buckthorn width
    - "10' to 25' tall with an equal or greater width" ("Habit and Form" entry)
- **Caveat:** Published outside a peer-reviewed journal.

#### `udc-2019-growing-roselle-fact-sheet-001`

Richardson, Matthew L.; Arlotta, Caitlin G. (2019). *Growing Roselle (Hibiscus sabdariffa) for Home or Business Production in the Mid-Atlantic (Fact Sheet 001)*. University of the District of Columbia

- URL: <http://docs-do-not-link.udc.edu/causes/Fact_Sheet%20-%20Growing_Roselle.pdf>
- Archived: <https://web.archive.org/web/20260114214912/http://docs-do-not-link.udc.edu/causes/Fact_Sheet%20-%20Growing_Roselle.pdf>
- Verification: URL-verified | Access: public-domain, evidence tier **C**
- Backs:
  - roselle spacing
    - "Plant roselle outdoors in areas that get full sun once the danger of frost has passed. This is a very shrubby plant, so plants should be spaced at least 3-4 feet apart and watered regularly." (p. 1, right column, section 'Cultivation')
- **Caveat:** Published outside a peer-reviewed journal.

#### `ufifas-1994-adzuki-bean`

Stephens, James M. (1994). *Bean, Adzuki - Phaseolus angularis (Willd.) W.F. Wight (HS549)*. University of Florida IFAS Extension (EDIS archival copy)

- DOI: [10.32473/edis-mv016-1994](https://doi.org/10.32473/edis-mv016-1994)
- Verification: URL-verified | Access: public-domain, evidence tier **C**
- Backs:
  - adzuki-bean spacing
    - "Sow seeds 3/4-1 inch deep, thinning the plants to stand about 2-3 inches apart in the row." (Page 1, section 'Culture' (the row spacing sentence, Space rows 12-18 inches apart, is on page 2))
  - adzuki-bean height
    - "The plant is erect, 1-2 feet high, although some gardeners have reported them to be indeterminate, growing and producing until frost." (Page 1, section 'Description')
  - adzuki-bean daysToMaturity
    - "Adzuki beans need about 120 days from sowing to the time the seeds and pods are dry." (Page 1, section 'Culture')
  - adzuki-bean coldLimit
    - "They need cool nights for best production, but will not tolerate frosts and freezes." (Page 1, section 'Culture')
- **Caveat:** Published outside a peer-reviewed journal.

#### `ufifas-1994-bambara-groundnut`

Stephens, James M. (1994). *Bambara Groundnut - Voandzeia subterranea (L.) Thouars (HS547)*. University of Florida IFAS Extension (EDIS archival copy)

- DOI: [10.32473/edis-mv014-1994](https://doi.org/10.32473/edis-mv014-1994)
- Verification: URL-verified | Access: public-domain, evidence tier **C**
- Backs:
  - bambara-groundnut daysToMaturity
    - "When grown like the peanut, Bambara groundnuts take about 3-6 months to mature, depending on climatic conditions and the cultivar." (Page 2, section 'Culture')
  - bambara-groundnut coldLimit
    - "It needs bright sunshine, high temperatures, at least 4 months free of frost, and frequent rains to grow best." (Page 1, section 'Culture')
  - bambara-groundnut light
    - "It needs bright sunshine, high temperatures, at least 4 months free of frost, and frequent rains to grow best." (Page 1, section 'Culture')
- **Caveat:** Published outside a peer-reviewed journal.

#### `ufifas-1994-jicama`

Stephens, James M. (1994). *Jicama: Pachyrhizus erosus (L.) Urban (HS615)*. University of Florida IFAS Extension (EDIS archival copy)

- DOI: [10.32473/edis-mv082-1994](https://doi.org/10.32473/edis-mv082-1994)
- Verification: URL-verified | Access: public-domain, evidence tier **C**
- Backs:
  - jicama height
    - "The vining tops, which reach 10-20 feet in length, have compound leaves with pointed edges, and bear white flowers and green lima bean-shaped pods." (Page 1, the second paragraph)
  - jicama coldLimit
    - "Jicama does best in a warm climate with moderate rainfall and is sensitive to frost." (Page 2, section 'Culture')
  - jicama daysToMaturity, the 7-month midpoint, 210 days
    - "When planted from seeds, about 5-9 months of warm weather are required before large roots are produced." (Page 2, section 'Culture')
- **Caveat:** Published outside a peer-reviewed journal.

#### `ufifas-1994-roselle-hs659`

Stephens, James M. (1994). *Roselle, Hibiscus sabdariffa L. (HS659), archival copy reviewed May 2003*. University of Florida Institute of Food and Agricultural Sciences, Florida Cooperative Extension Service

- URL: <https://journals.flvc.org/edis/article/download/139843/144801/280434>
- Archived: <https://web.archive.org/web/20261017213851/https://journals.flvc.org/edis/article/download/139843/144801/280434>
- Verification: URL-verified | Access: public-domain, evidence tier **C**
- Backs:
  - roselle height
    - "The okra-like plant is an annual, 5-7 feet in height, with lobed leaves sometimes used for greens." (p. 1, section 'DESCRIPTION')
  - roselle daysToMaturity
    - "It is usually started in April or in late August in Florida, requiring about 4 months to mature." (p. 1, section 'CULTURE')
- **Caveat:** Published outside a peer-reviewed journal.

#### `ufifas-1994-winged-bean`

Stephens, James M. (1994). *Bean, Winged - Psophocarpus tetragonolobus (L.) D.C. (HS561)*. University of Florida IFAS Extension (EDIS archival copy)

- DOI: [10.32473/edis-mv028-1994](https://doi.org/10.32473/edis-mv028-1994)
- Verification: URL-verified | Access: public-domain, evidence tier **C**
- Backs:
  - winged-bean coldLimit
    - "Since most varieties of winged beans need short days to initiate flowering, yet are frost sensitive, they must be grown during the winter in South Florida while the days are short." (Page 1, section 'Culture')
- **Caveat:** Published outside a peer-reviewed journal.

#### `ufifas-2003-chayote`

Stephens, James M. (2003). *Chayote — Sechium edule (Jacq.) Sw.* University of Florida, IFAS Extension (EDIS), publication HS579

- URL: <https://journals.flvc.org/edis/article/download/139590/144628/279059>
- Archived: <https://web.archive.org/web/20261017212457/https://journals.flvc.org/edis/article/download/139590/144628/279059>
- Verification: URL-verified | Access: public-domain, evidence tier **C**
- Backs:
  - chayote spacing
    - "Plant one fruit per hill in hills spaced 12 feet apart and in rows spaced 12 feet apart." ("Culture" section)
- **Caveat:** Published outside a peer-reviewed journal.

#### `ufifas-2003-salsify`

Stephens, James M. (2003). *Salsify - Tragopogon porrifolius L. (HS662)*. University of Florida IFAS Extension (EDIS archival copy, reviewed May 2003)

- URL: <https://journals.flvc.org/edis/article/view/139847>
- Archived: <https://web.archive.org/web/20260211013551/https://journals.flvc.org/edis/article/view/139847>
- Verification: URL-verified | Access: public-domain, evidence tier **C**
- Backs:
  - salsify spacing
    - "The seedlings should be thinned to 3-4 inches apart in rows 18-24 inches apart." (Page 1, section 'Culture')
  - salsify daysToMaturity
    - "Salsify requires a long growing season of 120 to 150 days from seeding to harvest." (Page 1, section 'Culture')
- **Caveat:** Published outside a peer-reviewed journal.

#### `ufifas-2009-backyard-sugarcane-ss-agr-253`

Baucum, L.; Rice, R. W.; Muralles, L. (2009). *Backyard Sugarcane (SS-AGR-253), archival copy revised October 2009*. University of Florida Institute of Food and Agricultural Sciences, Florida Cooperative Extension Service

- URL: <https://ufdcimages.uflib.ufl.edu/IR/00/00/34/15/00001/SC05200.pdf>
- Archived: <https://web.archive.org/web/20131206213904/https://ufdcimages.uflib.ufl.edu/IR/00/00/34/15/00001/SC05200.pdf>
- Verification: URL-verified | Access: public-domain, evidence tier **C**
- Backs:
  - sugarcane spacing
    - "Sugarcane can be planted as a single row (a typical configuration for windbreaks) or in multiple, parallel rows with a distance of from 4 -10 feet between the rows." (p. 3, section 'Planting')
  - sugarcane yearsToFirstHarvest
    - "Depending on variety and growing conditions, a stalk weighing 2 - 4 pounds with 11 - 12 percent sugar will be produced in about 12 - 14 months from an original planting or in 11 - 12 months from a ratoon re-growth." (p. 1, Introduction)
  - sugarcane harvestSeason
    - "Given a reasonable planting date the preceding year, sugarcane will be ready for harvest anytime after November 1, but keep an eye on the weather since you'll want to harvest before a killing freeze." (p. 5, section 'Harvesting')
  - sugarcane light
    - "A well-drained, sunny location is desirable; the more sun the better. Sugarcane planted in partially shaded areas (such as near buildings, walls, or tall trees) will have reduced growth potential." (p. 2, section 'Site Selection')
- **Caveat:** Published outside a peer-reviewed journal.

#### `ufifas-2009-the-passion-fruit-hs60`

Knight, R. J., Jr.; Sauls, Julian W. (2009). *The Passion Fruit (HS60)*. UF/IFAS Extension, University of Florida

- URL: <https://ufdcimages.uflib.ufl.edu/IR/00/00/33/95/00001/MG32800.pdf>
- Archived: <https://web.archive.org/web/20260211092542/https://ufdcimages.uflib.ufl.edu/IR/00/00/33/95/00001/MG32800.pdf>
- Verification: URL-verified | Access: public-domain, evidence tier **C**
- Backs:
  - passion-fruit spacing
    - "In Florida, passion vines are planted 3-4.5 m (10-15 ft.) apart in rows 4.5-6 m (1 5-20 ft.) apart." (UF/IFAS HS60 (archival copy, reviewed 2009), section 'Planting and Trellising', PDF page 2)
  - passion-fruit height
    - "Ideally they should be long enough to provide a trellis height of 1.5 m (5 ft.), with 45-75 cm (18-30 in.) in the ground." (UF/IFAS HS60 (archival copy, reviewed 2009), section 'Planting and Trellising', PDF page 3)
- **Caveat:** Published outside a peer-reviewed journal.

#### `ufifas-2014-gilman-diospyros-kaki`

Gilman, Edward F.; Watson, Dennis G. (2014). *Diospyros kaki: Japanese Persimmon (ENH388/ST229)*. UF/IFAS Extension, University of Florida

- URL: <https://journals.flvc.org/edis/article/view/141253>
- Archived: <https://web.archive.org/web/20260315093053/https://journals.flvc.org/edis/article/view/141253>
- Verification: URL-verified | Access: public-domain, evidence tier **C**
- Backs:
  - persimmon height
    - "Height: 20 to 30 feet" ("Description" section)
  - persimmon width
    - "Spread: 15 to 25 feet" ("Description" section)
  - persimmon light
    - "Light requirement: full sun" ("Culture" section)
- **Caveat:** Published outside a peer-reviewed journal.

#### `ufifas-2015-citrus-culture-home-landscape`

Rouse, Robert E.; Zekri, Mongi. (2015). *Citrus Culture in the Home Landscape (HS132)*. University of Florida IFAS Extension (publication HS132)

- URL: <https://edis.ifas.ufl.edu/publication/HS132>
- Archived: <https://web.archive.org/web/20260124024310/https://edis.ifas.ufl.edu/publication/HS132>
- Verification: URL-verified | Access: public-domain, evidence tier **C**
- Backs:
  - grapefruit spacing
    - "For home plantings, the spacing recommended should be a minimum of 15 feet between trees." ("Site Selection" section)
  - grapefruit harvestSeason
    - "7. Marsh (White flesh) [...] Midseason (Nov–May)" (Table 1, GRAPEFRUIT group, row 'Marsh (White flesh)', column "Fruit Season")
  - grapefruit light
    - "Citrus trees tolerate light shade but will be more productive if grown in full sunlight." ("Site Selection" section)
- **Caveat:** Published outside a peer-reviewed journal.

#### `ufifas-2016-guava-home-landscape`

Crane, Jonathan H.; Balerdi, Carlos F. (2016). *Guava Growing in the Florida Home Landscape (HS4, MG045)*. UF/IFAS Extension, University of Florida

- URL: <https://edis.ifas.ufl.edu/publication/MG045>
- Archived: <https://web.archive.org/web/20260116120147/https://edis.ifas.ufl.edu/publication/MG045>
- Verification: URL-verified | Access: public-domain, evidence tier **C**
- Backs:
  - guava spacing
    - "Depending upon ultimate tree size, trees should be planted 15 to 25 ft (4.6–7.6 m) away from other trees and structures and power lines." (UF/IFAS HS4 (MG045), section 'Spacing', PDF page 3)
  - guava height
    - "Small, single or multi-trunked trees to 20 ft (6.1 m) in height with a broad, spreading or upright canopy." (UF/IFAS HS4 (MG045), section 'Description', subsection 'Tree', PDF page 1)
  - guava yearsToFirstHarvest
    - "Guava trees generally begin fruit production 3 to 4 years after planting and yields range from 50 to 80 lbs (23–36 kg) or more per tree per year." (UF/IFAS HS4 (MG045), section 'Production (Crop Yields)', PDF page 3)
  - guava coldLimit
    - "Young guava trees may be killed by temperatures of 27° to 28°F (-3° to -2°C). Mature trees may withstand short periods of 25° to 26°F (-4° to -3°C) without much damage." (UF/IFAS HS4 (MG045), section 'Climate', Cold stress, PDF page 2)
  - guava light
    - "In general, guava trees should be planted in full sun for best growth and fruit production." (UF/IFAS HS4 (MG045), section 'Site Selection', PDF page 3)
- **Caveat:** Published outside a peer-reviewed journal.

#### `ufifas-2016-jackfruit`

Crane, Jonathan H.; Balerdi, Carlos F.; Maguire, Ian. (2016). *Jackfruit Growing in the Florida Home Landscape (HS882/MG370)*. University of Florida, Institute of Food and Agricultural Sciences (UF/IFAS) Extension

- URL: <https://edis.ifas.ufl.edu/publication/MG370>
- Archived: <https://web.archive.org/web/20251202205941/https://edis.ifas.ufl.edu/publication/mg370>
- Verification: URL-verified | Access: public-domain, evidence tier **C**
- Backs:
  - jackfruit spacing
    - "If little or no pruning is planned, then jackfruit in the home landscape should be planted 25 to 30 feet (7.6–9.1 m) away from other trees and structures. If annual or semi-annual pruning is practiced jackfruit trees may be planted 20 to 25 feet (6.1–7.6 m) away from other trees and structures." (Spacing section)
  - jackfruit height
    - "Erect, evergreen, fairly large tree, 30 to 40 feet (9–12 m) tall in Florida (Figure 2)." (Description section, 'Trees.' paragraph)
  - jackfruit yearsToFirstHarvest
    - "Jackfruit from seed may be more precocious than many other fruit, and trees may begin production in the 3rd to 4th year." (Propagation section)
  - jackfruit harvestSeason
    - "The main fruiting season is in summer and fall. Some fruit may ripen at other times, but usually not in winter and early spring." (Description section, 'Season of bearing', and Table 1, column 'Season and months')
  - jackfruit coldLimit
    - "Jackfruit leaves may be damaged at 32°F (0°C), branches at 30°F (-1°C), and branches and trees may be killed at 28°F (-2°C)." (Cold Stress section)
  - jackfruit light
    - "In general, jackfruit trees should be planted in full sun for best growth and fruit production." (Site Selection section)
- **Caveat:** Published outside a peer-reviewed journal.

#### `ufifas-2016-lychee`

Balerdi, Carlos F.; Maguire, Ian; Crane, Jonathan H. (2016). *Lychee Growing in the Florida Home Landscape (HS6/MG051)*. University of Florida, Institute of Food and Agricultural Sciences (UF/IFAS) Extension

- URL: <https://edis.ifas.ufl.edu/publication/MG051>
- Archived: <https://web.archive.org/web/20251220015127/https://edis.ifas.ufl.edu/publication/MG051>
- Verification: URL-verified | Access: public-domain, evidence tier **C**
- Backs:
  - lychee spacing
    - "Lychee trees in the home landscape should be planted 25 to 30 feet or more (7.6 to 9.1 m) away from buildings, other trees, and electrical wires." (Spacing section)
  - lychee yearsToFirstHarvest
    - "Air-layered or grafted trees begin to bear fruit in 3 to 5 years." (Propagation section)
  - lychee harvestSeason
    - "Mid-May to early July in Florida, depending upon variety." (Section 'Season of Bearing')
  - lychee coldLimit
    - "Young trees are damaged at temperatures of 28° to 32°F (-2° to 0°C), while temperatures down to 24° to 25°F (-3° to -4°C) cause extensive damage or death to large trees if exposed for several hours." (Climate section)
  - lychee light
    - "In general, lychee trees should be planted in full sun for best growth and fruit production." (Site Selection section)
- **Caveat:** Published outside a peer-reviewed journal.

#### `ufifas-2017-assessment-ziziphus-jujuba`

UF/IFAS Center for Aquatic and Invasive Plants. (2017). *Ziziphus jujuba - UF/IFAS Assessment of Non-Native Plants in Florida's Natural Areas*. University of Florida, Institute of Food and Agricultural Sciences

- URL: <https://assessment.ifas.ufl.edu/assessments/ziziphus-jujuba/>
- Archived: <https://web.archive.org/web/20261011022226/https://assessment.ifas.ufl.edu/assessments/ziziphus-jujuba/>
- Verification: URL-verified | Access: public-domain, evidence tier **C**
- Backs:
  - jujube invasiveStatus
    - "Not considered a problem species at this time. May be recommended by IFAS. Reassessed every 10 years." (Assessment page, "For Status Assessments" (assessment dates 2007 and 2017, conclusion "Not a problem species (un-documen))
- **Caveat:** Published outside a peer-reviewed journal.

#### `ufifas-2018-lychee-fact-sheet`

Gilman, Edward F.; Hilbert, Deborah; Watson, Dennis G.; Klein, Ryan; Koeser, Andrew; McLean, Drew C. (2018). *Litchi chinensis: Lychee (ENH-523/ST364)*. University of Florida, Institute of Food and Agricultural Sciences (UF/IFAS) Extension

- URL: <https://edis.ifas.ufl.edu/publication/ST364>
- Archived: <https://web.archive.org/web/20260123195931/https://edis.ifas.ufl.edu/publication/st364>
- Verification: URL-verified | Access: public-domain, evidence tier **C**
- Backs:
  - lychee height
    - "Lychee trees can eventually reach 30 to 50-feet in height with a 30 to 50-foot spread but will reach about 30 feet tall 30-years after planting in a landscape creating a wonderful shade, framing, or specimen tree." (Introduction, and Description section 'Height: 30 to 50 feet')
  - lychee width
    - "Lychee trees can eventually reach 30 to 50-feet in height with a 30 to 50-foot spread but will reach about 30 feet tall 30-years after planting in a landscape creating a wonderful shade, framing, or specimen tree." (Introduction, and Description section 'Spread: 30 to 50 feet')
  - lychee invasiveStatus
    - "UF/IFAS Invasive Assessment Status: not considered a problem species at this time, may be recommended (North, Central, South)" (General Information list)
- **Caveat:** Published outside a peer-reviewed journal.

#### `ufifas-2019-tropical-fruit-alternatives-to-citrus`

Crane, Jonathan H.; Balerdi, Carlos F.; Orfanedes, Michael S. (2019). *Tropical and Subtropical Fruit Crops for the Home Landscape: Alternatives to Citrus (HS812, MG373)*. UF/IFAS Extension, University of Florida

- URL: <https://edis.ifas.ufl.edu/publication/MG373>
- Archived: <https://web.archive.org/web/20251220051123/https://edis.ifas.ufl.edu/publication/MG373>
- Verification: URL-verified | Access: public-domain, evidence tier **C**
- Backs:
  - guava harvestSeason
    - "Season: August–October, February–March." (UF/IFAS MG373 (HS812), 'Invasive Fruit Crops', Guava entry, PDF page 5)
  - passion-fruit width
    - "Passion fruit/ [...] vine 12–20+ ≤32 High June–Dec. Yes" (UF/IFAS MG373 (HS812), Table 1, row Passion fruit/maracuyá, column 'Rec. distance' (value 12–20+, in feet))
  - passion-fruit yearsToFirstHarvest
    - "Vines begin to bear within 3–6 months of planting." (UF/IFAS MG373 (HS812), 'Passion Fruit' entry, PDF page 4)
  - passion-fruit harvestSeason
    - "Vines begin to bear within 3–6 months of planting. Season June–December." (UF/IFAS MG373 (HS812), 'Passion Fruit' entry, PDF page 4)
- **Caveat:** Published outside a peer-reviewed journal.

#### `ufifas-2020-coconut-palm-florida`

Broschat, Timothy K.; Crane, Jonathan H. (2020). *The Coconut Palm in Florida (HS40)*. University of Florida, Institute of Food and Agricultural Sciences (UF/IFAS) Extension, Horticultural Sciences Department (copy hosted at growables.org)

- URL: <https://www.growables.org/information/TropicalFruit/documents/CoconutPalm.pdf>
- Archived: <https://web.archive.org/web/20260921055128/https://www.growables.org/information/TropicalFruit/documents/CoconutPalm.pdf>
- Verification: URL-verified | Access: public-domain, evidence tier **C**
- Backs:
  - coconut spacing
    - "Commercially, the trees are planted at spacings of 18–30 feet (5.5–9.1 m) apart." (p. 3 of 6, section 'Planting and Spacing')
  - coconut yearsToFirstHarvest
    - "The coconut palm starts fruiting 6–10 years after the seed germinates and reaches full production at 15–20 years of age." (p. 2 of 6, section 'Production')
  - coconut harvestSeason
    - "Harvesting of coconuts occurs throughout the year." (p. 5 of 6, section 'Harvesting')
  - coconut coldLimit
    - "Coconut palms will be injured and may be killed by temperatures below 32°F (0°C) and may show chilling injury symptoms of leaflet necrosis at temperatures as high as 40°F (5°C)." (p. 3 of 6, section 'Environmental Stresses', heading 'Cold Temperatures')
  - coconut light
    - "Coconut palms require full sunlight and are tolerant to wind and to temporary flooding." (p. 3 of 6, section 'Climate and Soils')
- **Caveat:** Published outside a peer-reviewed journal.

#### `ufifas-2022-chayote`

Qiu, Yuheng; Liu, Guodong. (2022). *Chayote—A Potential Vegetable Crop for Florida*. University of Florida, IFAS Extension (EDIS), publication HS1454

- URL: <https://journals.flvc.org/edis/article/download/124902/136472>
- Archived: <https://web.archive.org/web/20260305141610/https://journals.flvc.org/edis/article/download/124902/136472>
- Verification: URL-verified | Access: public-domain, evidence tier **C**
- Backs:
  - chayote height
    - "The stem can grow up to 50 feet (Lira Saade 2020); therefore, trellis support is recommended to help plant growth (Stephens 2018). [...] A trellis, usually 6 feet tall, which allows people to walk beneath for cultivation, should be placed near the plant for supporting the climbing vine (Stephens 201" ("Botanical Description" and "General Description" sections)
  - chayote coldLimit
    - "Chayote can tolerate temperatures between 54°F to 104°F, but this frost-sensitive plant will develop unripe fruits and cannot survive at temperatures less than 54°F (Fern 2020)." ("Growing Conditions" section)
  - chayote light
    - "Chayote can grow in full-sun and partially shaded conditions, and 12-hour day length is required for plant flowering (Fern 2020; Valenzuela 2020)." ("Growing Conditions" section)
- **Caveat:** Published outside a peer-reviewed journal.

#### `ufifas-2022-edible-ornamental-landscaping`

Marek, Amanda S.; Bailey, Mark T.; Hansen, Gail. (2022). *Edible Ornamental Landscaping Guide for North-Central Florida (ENH1354/EP618)*. University of Florida IFAS Extension (EDIS)

- URL: <https://edis.ifas.ufl.edu/publication/EP618>
- Archived: <https://web.archive.org/web/20251226034238/https://edis.ifas.ufl.edu/publication/EP618>
- Verification: URL-verified | Access: public-domain, evidence tier **C**
- Backs:
  - lemongrass spacing
    - "Lemongrass can serve as a living privacy fence, growing to approximately 6′ tall and 4′ wide, by planting them about 4′ apart, center-to-center, to allow proper airflow." (“Landscaping with Lemongrass” section)
  - lemongrass height
    - "Lemongrass can serve as a living privacy fence, growing to approximately 6′ tall and 4′ wide" (“Landscaping with Lemongrass” section)
    - "Lemongrass Cymbopogon citratus No Leaves and stalks Year-round Partial–full sun Average 6′ × 4′ 9–11 Harvest when stalks are ~½″ thick, cutting at ground level." (Table 1 (Height × width column))
  - lemongrass width
    - "Lemongrass can serve as a living privacy fence, growing to approximately 6′ tall and 4′ wide" (“Landscaping with Lemongrass” section)
    - "Lemongrass Cymbopogon citratus No Leaves and stalks Year-round Partial–full sun Average 6′ × 4′ 9–11 Harvest when stalks are ~½″ thick, cutting at ground level." (Table 1 (Height × width column))
  - lemongrass coldLimit
    - "It is best to plant lemongrass in spring or summer, allowing it to become fully established before dangerous winter freezes occur." (Body text)
    - "Lemongrass Cymbopogon citratus No Leaves and stalks Year-round Partial–full sun Average 6′ × 4′ 9–11 Harvest when stalks are ~½″ thick, cutting at ground level." (Table 1 (“Hardiness zones” column))
  - lemongrass light
    - "Consider planting lemongrass individually to showcase its cascading leaves, en masse, or as a large border plant in full-to-partial sun where you can enjoy the lemony scent." (“Landscaping with Lemongrass” section)
    - "Lemongrass Cymbopogon citratus No Leaves and stalks Year-round Partial–full sun Average 6′ × 4′ 9–11 Harvest when stalks are ~½″ thick, cutting at ground level." (Table 1 (“Light needs” column))
- **Caveat:** Published outside a peer-reviewed journal.

#### `ufifas-2022-sunn-hemp-cover-crop-florida`

Wang, Qingren; Li, Yuncong; Klassen, Waldemar; Hanlon, Edward A. (2022). *Sunn Hemp - A Promising Cover Crop in Florida (SL 306)*. University of Florida IFAS Extension

- DOI: [10.32473/edis-tr003-2015](https://doi.org/10.32473/edis-tr003-2015)
- Verification: URL-verified | Access: public-domain, evidence tier **C**
- Backs:
  - sunn-hemp coldLimit
    - "Growth may be slowed by cool weather, and the plant is susceptible to freezing injuries when the temperature is less than 28°F." (Page 2, section 'Production and Harvest')
- **Caveat:** Published outside a peer-reviewed journal.

#### `ufifas-2022-yacon`

Gutierrez Laredo, Sergio Marcelo; Chen, Jianjun; Liu, Guodong. (2022). *Yacon, a Potential Tuberous Crop for Florida (HS1435)*. University of Florida IFAS Extension (EDIS)

- URL: <https://ask.ifas.ufl.edu/publication/HS1435>
- Archived: <https://web.archive.org/web/20260713002731/https://ask.ifas.ufl.edu/publication/HS1435>
- Verification: URL-verified | Access: public-domain, evidence tier **C**
- Backs:
  - yacon spacing
    - "rooted stem cuttings or plants propagated from corms can be planted in beds with 3- or 4-foot center-to-center spacing (Chqoue Delago et al. 2013) with 30–40 inches for plant spacing (Herman and Heller 1997)." (Section 'Yacon Cultivation')
  - yacon daysToMaturity
    - "This crop takes approximately 180 days from planting to maturity in Florida." (Section 'Brief Biology')
  - yacon light
    - "the crop can reduce soil erosion and tolerate partial shade and, hence, is ideal for agroforestry systems (Hermann and Heller 1997)." (Section 'Summary')
  - yacon invasiveStatus
    - "It is not listed as an invasive species." (Introduction)
- **Caveat:** Published outside a peer-reviewed journal.

#### `ufifas-2023-ginger-galangal-turmeric`

Fisher, Paul; Freyre, Rosanna; Gómez, Celina; Pearson, Brian; Sanchez-Jones, Tatiana; Steed, Shawn; Laughlin, Wanda; Hochmuth, Robert; Wasielewski, Jeff; Lieurance, Deah; Harmon, Carrie; Paret, Mathews; Osborne, Lance; Athearn, Kevin; Sargent, Steven; Zhang, Mengzi. (2023). *Ginger, Galangal, and Turmeric Production in Florida*. University of Florida IFAS Extension (EDIS ENH1374/EP638)

- URL: <https://edis.ifas.ufl.edu/publication/EP638>
- Archived: <https://web.archive.org/web/20260119183127/https://edis.ifas.ufl.edu/publication/EP638>
- Verification: URL-verified | Access: public-domain, evidence tier **C**
- Backs:
  - turmeric daysToMaturity
    - "Ginger and turmeric rhizomes harvested approximately seven months after planting (i.e., winter harvest) are suitable for curing and selling in retail and as an ingredient for making preserves." (Harvest Maturity section)
- **Caveat:** Published outside a peer-reviewed journal.

#### `ufifas-2023-luffa-asian-vegetable-florida`

Liu, Guodong; Li, Yuncong; Migliaccio, Kati W. (2023). *Luffa: an Asian Vegetable Emerging in Florida (HS1285)*. UF/IFAS Extension, University of Florida

- URL: <https://edis.ifas.ufl.edu/publication/HS1285>
- Archived: <https://web.archive.org/web/20251126193620/https://edis.ifas.ufl.edu/publication/HS1285>
- Verification: URL-verified | Access: public-domain, evidence tier **C**
- Backs:
  - luffa spacing
    - "For planting or transplanting, the distance between plants is usually 3 feet, and the distance between rows is 6 feet." (UF/IFAS HS1285 (EDIS page), section 'Cultivation Method')
  - luffa height
    - "Vertical trellises (Figure 11) of 6 feet in height are recommended because they substantially increase fruit yield (Davis 1994)." (UF/IFAS HS1285 (EDIS page), section 'Cultivation Method')
  - luffa daysToMaturity
    - "The pollinated flowers develop cylindrical fruit (Figures 1 and 2), and only young, immature fruits, which require the hot growing season of about two to three months, can be harvested for consumption as a vegetable." (UF/IFAS HS1285 (EDIS page), section 'Cultivation Method', paragraph on inflorescences)
- **Caveat:** Published outside a peer-reviewed journal.

#### `ufifas-2023-passiflora-edulis-fps456`

Gilman, Edward F.; Klein, Ryan W.; Hansen, Gail. (2023). *Passiflora edulis Passion Fruit, Purple Granadilla (FPS456)*. UF/IFAS Extension, University of Florida

- URL: <https://edis.ifas.ufl.edu/publication/FP456>
- Archived: <https://web.archive.org/web/20260209131333/https://edis.ifas.ufl.edu/publication/FP456>
- Verification: URL-verified | Access: public-domain, evidence tier **C**
- Backs:
  - passion-fruit coldLimit
    - "USDA hardiness zones: 9B through 11" (UF/IFAS FPS456, 'General Information' list, PDF page 2)
  - passion-fruit light
    - "This plant does require a position in the landscape that receives full sun for best flowering and fruit production." (UF/IFAS FPS456, 'Use and Management', PDF page 3)
- **Caveat:** Published outside a peer-reviewed journal.

#### `ufifas-2024-jujube-florida`

Folta, Kevin M.; Huff, Dustin; Sarkhosh, Ali. (2024). *Jujube as a Florida Fruit Crop (HS1477)*. University of Florida IFAS Extension (publication HS1477)

- URL: <https://edis.ifas.ufl.edu/publication/HS1477>
- Archived: <https://web.archive.org/web/20250906132503/https://edis.ifas.ufl.edu/publication/HS1477>
- Verification: URL-verified | Access: public-domain, evidence tier **C**
- Backs:
  - jujube harvestSeason
    - "Fruits are borne on new growth (Figure 14) and expand through the summer months, typically ripening in August and September in Florida." ("Fruit Quality" section)
  - jujube coldLimit
    - "Established trees are cold tolerant to -20°F (-29°C), yet they grow well in hot, humid conditions." ("Growing Conditions" section)
- **Caveat:** Published outside a peer-reviewed journal.

#### `ufifas-2024-long-squash-bottle-gourd`

Liu, Guodong; Li, Yuncong; Dinkins, David; Wells, Bonnie; Wang, Qingren; Cui, Yuqi. (2024). *Long Squash: an Asian Vegetable Expanding in Florida (HS1272), the bottle gourd grown for young fruit*. UF/IFAS Extension, University of Florida

- URL: <https://edis.ifas.ufl.edu/publication/HS1272>
- Archived: <https://web.archive.org/web/20260120213700/https://edis.ifas.ufl.edu/publication/HS1272>
- Verification: URL-verified | Access: public-domain, evidence tier **C**
- Backs:
  - bottle-gourd height
    - "The vine has tendrils for climbing and can be up to 30 feet in length; hence, trellis support systems are needed for high yields of good quality (Figure 1)." (UF/IFAS HS1272 (EDIS page), second paragraph)
- **Caveat:** Published outside a peer-reviewed journal.

#### `ufifas-2024-malabar-spinach`

Qiu, Yuheng; Liu, Guodong. (2024). *Florida Cultivation Guide for Malabar Spinach*. University of Florida IFAS Extension (publication HS1371)

- URL: <https://edis.ifas.ufl.edu/publication/HS1371>
- Archived: <https://web.archive.org/web/20260119172001/https://edis.ifas.ufl.edu/publication/HS1371>
- Verification: URL-verified | Access: public-domain, evidence tier **C**
- Backs:
  - malabar-spinach height
    - "Because Malabar spinach is a fast-growing vine that can grow six feet or even longer (Parkell et al. 2016), it is typically grown on a trellis or fence to help climbing and to facilitate periodic pruning by cutting off the fleshy leaves and overlong vines to keep desired shape (Cornell 2006, Singh e" ("Growing Conditions" section)
  - malabar-spinach daysToMaturity
    - "Malabar spinach grows rapidly and reaches maturity around 70 days from seed in optimal conditions." ("Harvest and Storage" section)
  - malabar-spinach coldLimit
    - "Malabar spinach is extremely vulnerable to frost and should not be planted until the soil temperature reaches 65°F–75°F to reduce risk of frost damage, usually 2 to 3 weeks after last frost date (Cornell 2006). This spinach type grows as a perennial in USDA Plant Hardiness Zone 10 (south Florida) an" ("Propagation" section)
  - malabar-spinach light
    - "While full-sun cultivation does not harm plants, partial shade may be beneficial by facilitating development of larger and more succulent leaves (Cornell 2006, Fern 2014)." ("Growing Conditions" section)
- **Caveat:** Published outside a peer-reviewed journal.

#### `ufifas-2024-vanilla-south-florida`

Wu, Xingbo; Moon, Pamela; Chambers, Alan; Crane, Jonathan. (2024). *Vanilla Growing in South Florida (HS1348)*. University of Florida, Institute of Food and Agricultural Sciences (UF/IFAS) Extension

- URL: <https://edis.ifas.ufl.edu/publication/HS1348>
- Archived: <https://web.archive.org/web/20260121203231/https://edis.ifas.ufl.edu/publication/HS1348>
- Verification: URL-verified | Access: public-domain, evidence tier **C**
- Backs:
  - vanilla spacing
    - "Spacing recommendations are to plant vines 1–3 m (3–10 ft) apart with 2.5–3 m (8–10 ft) between rows." (Section 'Production Methods')
  - vanilla height
    - "Supports vary in height but are usually no more than 2 m (6 ft) tall to facilitate pollination once vines mature." (Section 'Production Methods')
  - vanilla width
    - "Spacing recommendations are to plant vines 1–3 m (3–10 ft) apart with 2.5–3 m (8–10 ft) between rows." (Section 'Production Methods')
  - vanilla coldLimit
    - "Vanilla is sensitive to chilling and can be killed by freezing temperatures." (Section 'Environmental Conditions')
  - vanilla invasiveStatus
    - "The species V. planifolia is naturalized (Figure 1), and V. pompona is also common among gardens in southern Florida." (Section 'History')
- **Caveat:** Published outside a peer-reviewed journal.

#### `ufifas-2025-cashew-apple`

Balerdi, Carlos F.; Maguire, Ian; McLaughlin, John; Crane, Jonathan H. (2025). *Cashew Apple Fruit Growing in the Florida Home Landscape (HS1127/HS377)*. University of Florida, Institute of Food and Agricultural Sciences (UF/IFAS) Extension

- URL: <https://edis.ifas.ufl.edu/publication/HS377>
- Archived: <https://web.archive.org/web/20260202042559/https://edis.ifas.ufl.edu/publication/HS377>
- Verification: URL-verified | Access: public-domain, evidence tier **C**
- Backs:
  - cashew spacing
    - "Cashew trees in the home landscape should be planted 15 to 20 feet or more (4.6 to 6.1 m) away from buildings, electrical wires, or other trees." (Spacing section)
  - cashew height
    - "Under ideal tropical conditions, the cashew is an attractive, erect, 20- to 35-ft. evergreen tree with smooth brown bark and a dense, symmetrical, spreading canopy." (Description section, 'Tree')
  - cashew yearsToFirstHarvest
    - "Seedling trees usually begin fruit production after 3 to 4 years." (Production (Crop Yields) section)
  - cashew coldLimit
    - "The tree will not tolerate even short exposures to frost (freezing temperatures)." (Climate section)
  - cashew light
    - "In general, cashew trees should be planted in full sun for best growth and fruit production." (Site Selection section)
- **Caveat:** Published outside a peer-reviewed journal.

#### `ufifas-2025-pineapple-fps039`

Graves, Keighly; Wilber, Wendy; Wichman, Tom; Lewis, Claire; Hansen, Gail; Klein, Ryan. (2025). *Ananas comosus: Pineapple (FPS039)*. UF/IFAS Extension, University of Florida

- URL: <https://edis.ifas.ufl.edu/publication/FP039>
- Archived: <https://web.archive.org/web/20260106033537/https://edis.ifas.ufl.edu/publication/FP039>
- Verification: URL-verified | Access: public-domain, evidence tier **C**
- Backs:
  - pineapple invasiveStatus
    - "Invasive potential: not known to be invasive" (UF/IFAS FPS039, 'General Information' list, PDF page 3)
- **Caveat:** Published outside a peer-reviewed journal.

#### `ufifas-2025-pineapple-home-landscape`

Crane, Jonathan H. (2025). *Pineapple Growing in the Florida Home Landscape (HS7, MG055)*. UF/IFAS Extension, University of Florida

- URL: <https://edis.ifas.ufl.edu/publication/MG055>
- Archived: <https://web.archive.org/web/20251212041347/https://edis.ifas.ufl.edu/publication/MG055>
- Verification: URL-verified | Access: public-domain, evidence tier **C**
- Backs:
  - pineapple spacing
    - "The distance between individual pineapple plants ranges from 12 to 36 inches (21–91 cm)." (UF/IFAS HS7 (MG055), section 'Spacing and Pruning', PDF page 3)
  - pineapple height
    - "Adult plants may be 3 to 6 feet (0.9–1.8 m) high and wide." (UF/IFAS HS7 (MG055), section 'Description', subsection 'Plant', PDF page 2)
  - pineapple width
    - "Adult plants may be 3 to 6 feet (0.9–1.8 m) high and wide." (UF/IFAS HS7 (MG055), section 'Description', subsection 'Plant', PDF page 2)
  - pineapple yearsToFirstHarvest
    - "The time from planting to harvest of the fruit ranges from 18 to 36 months in subtropical climates." (UF/IFAS HS7 (MG055), section 'Production (Crop Yields)', PDF page 3)
  - pineapple coldLimit
    - "Pineapple plants do not tolerate freezing temperatures below 28°F (-2.0°C), and temperatures below 60°F (15.5°C) and above 90°F (32°C) may slow plant growth." (UF/IFAS HS7 (MG055), section 'Cool and Freezing Temperatures', PDF page 3)
  - pineapple light
    - "In general, pineapple plants should be planted in full sun for best growth and fruit production." (UF/IFAS HS7 (MG055), section 'Spacing and Pruning', PDF page 3)
- **Caveat:** Published outside a peer-reviewed journal.

#### `ufifas-2026-assessment-passiflora-edulis`

UF/IFAS Center for Aquatic and Invasive Plants. (2026). *Passiflora edulis, UF/IFAS Assessment of Non-Native Plants in Florida's Natural Areas*. University of Florida, Institute of Food and Agricultural Sciences

- URL: <https://assessment.ifas.ufl.edu/assessments/passiflora-edulis/>
- Archived: <https://web.archive.org/web/20260906000221/https://assessment.ifas.ufl.edu/assessments/passiflora-edulis/>
- Verification: URL-verified | Access: public-domain, evidence tier **C**
- Backs:
  - passion-fruit invasiveStatus
    - "Predicted to be invasive and not recommended by IFAS." (UF/IFAS Assessment of Non-Native Plants in Florida's Natural Areas, Passiflora edulis page, 'Conclusions by Zone' (Centr))
- **Caveat:** Published outside a peer-reviewed journal.

#### `ufifas-2026-bitter-melon`

Liu, Guodong; Wang, Qingren; Li, Yuncong; Dinkins, David; Wells, Bonnie; Cui, Yuqi. (2026). *Bitter Melon—an Asian Vegetable Expanding in Florida*. University of Florida, IFAS Extension (EDIS), publication HS1271

- URL: <https://edis.ifas.ufl.edu/hs1271>
- Archived: <https://web.archive.org/web/20261017212350/https://edis.ifas.ufl.edu/hs1271>
- Verification: URL-verified | Access: public-domain, evidence tier **C**
- Backs:
  - bitter-melon spacing
    - "Distance between rows should be 5 to 6 feet and spacing between plants should be between 3 and 5 feet (Freeman et al. 2015)." ("Cultural Practices" section)
  - bitter-melon daysToMaturity
    - "Fruit should be started harvesting approximately 50 days after seeding in north Florida. For central and south Florida, fruit can be harvested earlier after seeding." ("Cultural Practices" section)
- **Caveat:** Published outside a peer-reviewed journal.

#### `ufifas-2026-root-crop-production`

Beuzelin, Julien M.; Dittmar, Peter J.; Desaeger, Johan; Zotarelli, Lincoln; Zhang, Shouan; Wang, Qingren; Frey, Craig; Mészáros, Anna. (2026). *Chapter 15. Root Crop Production (Vegetable Production Handbook, HS965/CV300, revised 8/2026)*. University of Florida IFAS Extension (EDIS)

- URL: <https://journals.flvc.org/edis/article/view/134126>
- Archived: <https://web.archive.org/web/20260308010405/https://journals.flvc.org/edis/article/view/134126>
- Verification: URL-verified | Access: public-domain, evidence tier **C**
- Backs:
  - malanga spacing
    - "Distance between rows (in) 48 52 52 Distance between plants (ft) 2 1 1" (Table 5, 'Planting information for cassava, taro, and malanga', column Malanga (the last column), PDF page 2)
  - malanga daysToMaturity
    - "it is typically planted in the spring because the crop requires 9–10 months to reach maturity and can be injured by frosts." (Tropical Root Crops section, tannia paragraph, PDF page 3)
  - malanga coldLimit
    - "it is typically planted in the spring because the crop requires 9–10 months to reach maturity and can be injured by frosts." (Tropical Root Crops section, tannia paragraph, PDF page 3)
- **Caveat:** Published outside a peer-reviewed journal.

#### `ufifas-gardening-solutions-roselle`

UF/IFAS Extension. (n.d.). *Roselle, Gardening Solutions*. University of Florida Institute of Food and Agricultural Sciences

- URL: <https://gardeningsolutions.ifas.ufl.edu/plants/edibles/vegetables/roselle/>
- Archived: <https://web.archive.org/web/20261008141806/https://gardeningsolutions.ifas.ufl.edu/plants/edibles/vegetables/roselle/>
- Verification: URL-verified | Access: public-domain, evidence tier **C**
- Backs:
  - roselle coldLimit
    - "It is only hardy in zones 9-10, and is damaged by frosts or freezes; plan your harvest before temperatures drop below 40° F." (Section 'Planting and Care', paragraph on soil and hardiness)
  - roselle light
    - "Be aware that this plant does not do well in the shade and needs plenty of sunlight to thrive." (Section 'Planting and Care')
- **Caveat:** Published outside a peer-reviewed journal.

#### `ufifas-gardeningsolutions-culantro`

UF/IFAS Extension. (n.d.). *Culantro*. University of Florida, Institute of Food and Agricultural Sciences, Gardening Solutions

- URL: <https://gardeningsolutions.ifas.ufl.edu/plants/edibles/vegetables/culantro/>
- Archived: <https://web.archive.org/web/20260604114054/https://gardeningsolutions.ifas.ufl.edu/plants/edibles/vegetables/culantro/>
- Verification: URL-verified | Access: public-domain, evidence tier **C**
- Backs:
  - culantro light
    - "Contrary to most herbs and vegetables, culantro does best in a shady area. Shade also aides in keeping your plant from bolting, that is, producing its cream-colored flowers and going to seed." (Section 'Planting and Care')
- **Caveat:** Published outside a peer-reviewed journal.

#### `ufifas-gardeningsolutions-ginger`

University of Florida IFAS Extension, Gardening Solutions. (n.d.). *Ginger – Gardening Solutions*. University of Florida IFAS Extension

- URL: <https://gardeningsolutions.ifas.ufl.edu/plants/edibles/vegetables/ginger/>
- Archived: <https://web.archive.org/web/20260509172730/https://gardeningsolutions.ifas.ufl.edu/plants/edibles/vegetables/ginger/>
- Verification: URL-verified | Access: public-domain, evidence tier **C**
- Backs:
  - ginger spacing
    - "Space pieces about 15 inches apart as the underground structure will expand over the course of the year." (Planting and Care section)
  - ginger daysToMaturity
    - "Ginger is considered a long-season crop and takes about eight to ten months to produce fully developed rhizomes." (Planting and Care section)
  - ginger light
    - "Edible ginger does best in partial shade. It produces well if it gets a couple hours of sunlight a day but will grow in full shade, too. More than a couple hours in the sun is too much; the plants will grow poorly and the leaves will turn brown at the tips." (Planting and Care section)
- **Caveat:** Published outside a peer-reviewed journal.

#### `ufifas-gardeningsolutions-mulberry`

UF/IFAS Extension Gardening Solutions. (n.d.). *Mulberry (Gardening Solutions)*. University of Florida IFAS Extension, Gardening Solutions

- URL: <https://gardeningsolutions.ifas.ufl.edu/plants/edibles/fruits/mulberry/>
- Archived: <https://web.archive.org/web/20260617022805/https://gardeningsolutions.ifas.ufl.edu/plants/edibles/fruits/mulberry/>
- Verification: URL-verified | Access: public-domain, evidence tier **C**
- Backs:
  - mulberry-black light
    - "These trees do best in full sun to light shade." (UF/IFAS Gardening Solutions, Mulberry page, Planting and Care section)
- **Caveat:** Published outside a peer-reviewed journal.

#### `ufifas-gardeningsolutions-turmeric`

University of Florida IFAS Extension, Gardening Solutions. (n.d.). *Turmeric – Gardening Solutions*. University of Florida IFAS Extension

- URL: <https://gardeningsolutions.ifas.ufl.edu/plants/edibles/vegetables/turmeric/>
- Archived: <https://web.archive.org/web/20260606201455/https://gardeningsolutions.ifas.ufl.edu/plants/edibles/vegetables/turmeric/>
- Verification: URL-verified | Access: public-domain, evidence tier **C**
- Backs:
  - turmeric spacing
    - "Space them 15 inches in the row and 15 inches between the row." (Planting Tips section)
- **Caveat:** Published outside a peer-reviewed journal.

#### `ufifas-invasive-assessment-breadfruit`

UF/IFAS Invasive Plant Working Group, Center for Aquatic and Invasive Plants. (n.d.). *Artocarpus altilis (breadfruit): Assessment of Non-Native Plants in Florida's Natural Areas*. University of Florida, Institute of Food and Agricultural Sciences (UF/IFAS) Extension

- URL: <https://assessment.ifas.ufl.edu/assessments/artocarpus-altilis/>
- Archived: <https://web.archive.org/web/20261006070250/https://assessment.ifas.ufl.edu/assessments/artocarpus-altilis/>
- Verification: URL-verified | Access: public-domain, evidence tier **C**
- Backs:
  - breadfruit invasiveStatus
    - "Low Risk for invasion, therefore Not considered a problem species at this time. May be recommended by IFAS. Reassessed every 10 years." (Conclusions by Zone, Central, North, South: 'Low Invasion Risk', predictive tool score -1, assessment dates 2014 and 202)
- **Caveat:** Published outside a peer-reviewed journal.

#### `ufifas-invasive-assessment-jackfruit`

UF/IFAS Invasive Plant Working Group, Center for Aquatic and Invasive Plants. (n.d.). *Artocarpus heterophyllus (jackfruit): Assessment of Non-Native Plants in Florida's Natural Areas*. University of Florida, Institute of Food and Agricultural Sciences (UF/IFAS) Extension

- URL: <https://assessment.ifas.ufl.edu/assessments/artocarpus-heterophyllus/>
- Archived: <https://web.archive.org/web/20261006070250/https://assessment.ifas.ufl.edu/assessments/artocarpus-heterophyllus/>
- Verification: URL-verified | Access: public-domain, evidence tier **C**
- Backs:
  - jackfruit invasiveStatus
    - "Not considered a problem species at this time. May be recommended by IFAS. Reassessed every 10 years." (Conclusions by Zone, Central, North, South: 'Not a problem species (un-documented)', assessment dates 2007 and 2018)
- **Caveat:** Published outside a peer-reviewed journal.

#### `ufifas-pasco-2026-heat-tolerant-edibles-roselle`

Sirchia, Julia. (2026). *Heat-Tolerant Edibles for the Summer: Roselle*. UF/IFAS Extension Pasco County

- URL: <https://blogs.ifas.ufl.edu/pascoco/2026/06/11/heat-tolerant-edibles-for-the-summer-home-garden/>
- Archived: <https://web.archive.org/web/20261017213914/https://blogs.ifas.ufl.edu/pascoco/2026/06/11/heat-tolerant-edibles-for-the-summer-home-garden/>
- Verification: URL-verified | Access: public-domain, evidence tier **C**
- Backs:
  - roselle width
    - "roselle can easily grow 4 to 7 feet tall and 3 to 5 feet wide." (Introduction paragraph)
- **Caveat:** Published outside a peer-reviewed journal.

#### `ufifas-santarosa-2025-sugarcane`

Busbee, Larry; Stevens, Sandy; Andrews, Frances; Criss, Josh. (2025). *Sugarcane (Santa Rosa County Cooperative Extension Teaching and Demonstration Gardens)*. UF/IFAS Extension Santa Rosa County

- URL: <https://sfyl.ifas.ufl.edu/media/sfylifasufledu/santa-rosa/docs/pdfs/demo-garden-5/Sugarcane-final.pdf>
- Archived: <https://web.archive.org/web/20251220030236/https://sfyl.ifas.ufl.edu/media/sfylifasufledu/santa-rosa/docs/pdfs/demo-garden-5/Sugarcane-final.pdf>
- Verification: URL-verified | Access: public-domain, evidence tier **C**
- Backs:
  - sugarcane height
    - "Height: 3 to 12 feet Spread: 3 to 10 feet" (Plant data block under the introductory text, field 'Height')
  - sugarcane width
    - "Height: 3 to 12 feet Spread: 3 to 10 feet" (Plant data block under the introductory text, field 'Spread')
- **Caveat:** Published outside a peer-reviewed journal.

#### `uga-2022-pomegranate-production`

MacLean, Dan; Martino, Karina G.; Scherm, Harald; Horton, Dan L. (2022). *Pomegranate Production (Circular 997)*. University of Georgia Cooperative Extension

- URL: <https://fieldreport.caes.uga.edu/publications/C997/>
- Archived: <https://web.archive.org/web/20261017213255/https://fieldreport.caes.uga.edu/publications/C997/>
- Verification: URL-verified | Access: public-domain, evidence tier **C**
- Backs:
  - pomegranate spacing
    - "Traditional spacing for an orchard is 18′ x 18′ (134 trees/acre)." ("Orchard Establishment" section)
  - pomegranate yearsToFirstHarvest
    - "The first harvest is in year three, but these fruit will tend to be small and late-maturing. The focus should be on tree growth as opposed to fruit production in these early years [...] Full commercial production begins occurring in years five or six." ("Orchard Establishment" section)
  - pomegranate harvestSeason
    - "Early cultivars will begin to ripen near the end of August, and will continue through to October or early November for the late-maturing cultivars." ("Harvest Maturity" section)
  - pomegranate coldLimit
    - "Most pomegranate cultivars are hardy down to 12 degrees F, with the hardier types surviving without damage down to 7 degrees F." ("Climate" section)
  - pomegranate light
    - "Pomegranates require at least six hours of direct sunlight a day in order to ensure good fruit color and productivity." ("Soil and Site Selection" section)
- **Caveat:** Published outside a peer-reviewed journal.

#### `uga-2024-corn-production-guide`

Tubbs, R. Scott. (2024). *2024 Corn Production Guide*. University of Georgia Cooperative Extension

- URL: <https://grains.caes.uga.edu/content/dam/caes-subsite/grains/docs/corn/2024-Corn-Production-Guide.pdf>
- Archived: <https://web.archive.org/web/20261017212557/https://grains.caes.uga.edu/content/dam/caes-subsite/grains/docs/corn/2024-Corn-Production-Guide.pdf>
- Verification: URL-verified | Access: public-domain, evidence tier **C**
- Backs:
  - corn-grain spacing
    - "Current plant population recommendations for irrigated corn in Georgia are between 28,000 to 36,000 plants per acre [...] In dryland cropping systems current plant population recommendations are between 18,000 and 20,000 plants per acre in sandy soils [...] Traditional row-spacings utilized in Georgia pro" (p. 6, 'Plant Population and Row Spacing' section; Table 4 (p. 8) converts these to within-row inches by row width)
  - corn-grain daysToMaturity
    - "This table also provides growth stage, days after planting and estimated water use in inches per day for hybrids with a relative maturity of 115-119 days [...] Black layer (physiological maturity). 115-119 [days after planting]" (p. 20, Table 8 'Estimated Water Use of Corn in Georgia')
- **Caveat:** Published outside a peer-reviewed journal.

#### `uga-2025-dorn-herbs-in-southern-gardens`

Dorn, Sheri. (2025). *Herbs in Southern Gardens (Bulletin 1170)*. University of Georgia Cooperative Extension

- URL: <https://fieldreport.caes.uga.edu/publications/B1170/herbs-in-southern-gardens/>
- Archived: <https://web.archive.org/web/20251108200934/https://fieldreport.caes.uga.edu/publications/B1170/herbs-in-southern-gardens/>
- Verification: URL-verified | Access: public-domain, evidence tier **C**
- Backs:
  - lemon-verbena spacing
    - "Lemon Verbena (p) Spring 3–4 ft Seed, cutting 3–5 ft Branching/woody Full sun, partial shade" (Table Herb Cultivation Recommendations, column Spacing, row Lemon Verbena (p))
- **Caveat:** Published outside a peer-reviewed journal.

#### `uga-2026-b992-minor-fruits-nuts-georgia`

Krewer, Gerard W.; Crocker, Thomas F.; Bertrand, Paul F.; Horton, Dan L. (2026). *Minor Fruits and Nuts in Georgia (Bulletin 992)*. University of Georgia Cooperative Extension

- URL: <https://fieldreport.caes.uga.edu/publications/b992/minor-fruits-and-nuts-in-georgia/>
- Archived: <https://web.archive.org/web/20260712082442/https://fieldreport.caes.uga.edu/publications/B992/minor-fruits-and-nuts-in-georgia/>
- Verification: URL-verified | Access: public-domain, evidence tier **C**
- Backs:
  - mulberry-black harvestSeason
    - "The fruit are borne on current season’s growth and ripen in May in Georgia." (UGA Cooperative Extension Bulletin 992, Minor Fruits and Nuts in Georgia, Mulberry section)
- **Caveat:** Published outside a peer-reviewed journal.

#### `uga-b577-planting-chart`

Westerfield, Robert. (2022). *Home Garden Planting Chart*. University of Georgia Cooperative Extension Bulletin 577

- URL: <https://secure.caes.uga.edu/extension/publications/files/html/B577/B577PlantingChart.pdf>
- Archived: <https://web.archive.org/web/20251108044452/https://secure.caes.uga.edu/extension/publications/files/html/B577/B577PlantingChart.pdf>
- Verification: URL-verified | Access: public-domain, evidence tier **C**
- Backs:
  - days to maturity per crop, e.g. 'Tomato 70-85', 'Radish 25-30', 'Onion (mature) 100-120'
  - explicit spring and fall calendar-date planting windows per crop, including 'Not recommended' for fall where no fall window exists
  - in-row and between-row spacing and sowing depth per crop
- **Caveat:** Published outside a peer-reviewed journal. Its dates are fixed calendar dates for Middle Georgia only, and they aren't tied to a frost date. The chart itself puts north Georgia about two weeks later in spring and earlier in fall, and south Georgia the reverse. It supports days-to-maturity and the existence and shape of spring/fall windows, and it can't supply dates outside the Southeast. UGA asserts university copyright. The version mismatch between the served chart (March 2022) and its parent bulletin (February 2026) is unresolved.

#### `uga-extension-2024-pecan-home-backyard`

Wells, Lenny; Hudson, William G.; Brock, Jason H. (2024). *Pecan Trees for the Home or Backyard Orchard (Bulletin 1348)*. University of Georgia Cooperative Extension

- URL: <https://extension.uga.edu/publications/detail.html?number=B1348&title=pecan-trees-for-the-home-or-backyard-orchard>
- Archived: <https://web.archive.org/web/20261017213545/https://extension.uga.edu/publications/detail.html?number=B1348&title=pecan-trees-for-the-home-or-backyard-orchard>
- Verification: URL-verified | Access: public-domain, evidence tier **C**
- Backs:
  - pecan spacing
    - "Yard and home orchard trees should be spaced at least 60 to 80 feet apart so they will not crowd as they reach maturity and so thinning will not be required." (UGA Bulletin 1348, "Location and Spacing" section)
  - pecan harvestSeason
    - "— “Carter” is an Alabama cultivar that produces a large nut and has an estimated harvest date of October 18. [...] — “McMillian” is another low-input cultivar from Alabama that has been highly productive and consistent, with light scab damage on nuts. Its estimated harvest date is October 20." (UGA Bulletin 1348, "Cultivars" section)
- **Caveat:** Published outside a peer-reviewed journal.

#### `uky-2017-kaiser-american-persimmon`

Kaiser, Cheryl; Ernst, Matt. (2017). *American Persimmon (CCD-CP-1)*. Center for Crop Diversification, University of Kentucky College of Agriculture, Food and Environment

- URL: <https://ccd.uky.edu/sites/default/files/2024-11/ccd-cp-001_american-persimmon.pdf>
- Archived: <https://web.archive.org/web/20251204222526/https://ccd.uky.edu/sites/default/files/2024-11/ccd-cp-001_american-persimmon.pdf>
- Verification: URL-verified | Access: public-domain, evidence tier **C**
- Backs:
  - american-persimmon spacing
    - "A tree spacing of 20 feet between trees in the row and 27 feet between rows has worked well." ("Site selection, planting, and maintenance" section, p. 2)
  - american-persimmon yearsToFirstHarvest
    - "Persimmon trees propagated from seeds begin producing a crop in about four to nine years, while grafted trees can begin fruiting three years after planting." ("Harvest and Storage" section, p. 2)
  - american-persimmon light
    - "Persimmon is a very adaptable tree, surviving on everything from poor sites to river bottoms, and from partial shade to full sun. However, for best growth and fruit production, moist, well-drained loamy soils and sunny sites are best." ("Site selection, planting, and maintenance" section, p. 2)
- **Caveat:** Published outside a peer-reviewed journal.

#### `uky-2017-malabar-spinach`

Ernst, Matt. (2017). *Malabar Spinach*. Center for Crop Diversification, University of Kentucky College of Agriculture, Food and Environment (publication CCD-CP-130)

- URL: <https://publications.mgcafe.uky.edu/sites/publications.ca.uky.edu/files/malabar.pdf>
- Archived: <https://web.archive.org/web/20261017212334/https://publications.mgcafe.uky.edu/sites/publications.ca.uky.edu/files/malabar.pdf>
- Verification: URL-verified | Access: public-domain, evidence tier **C**
- Backs:
  - malabar-spinach spacing
    - "Malabar spinach may be direct seeded in rows spaced 1 foot apart, with seeds spaced 1 to 2 inches and thinned to 6 inches between plants." ("Production considerations > Site selection and planting" section, p. 2)
- **Caveat:** Published outside a peer-reviewed journal.

#### `uky-2018-foxtail-millet`

Teutsch, Chris; Smith, Ray; Keene, Tom; Henning, Jimmy C. (2018). *Foxtail Millet (AGR-233)*. University of Kentucky Cooperative Extension Service

- URL: <https://publications.mgcafe.uky.edu/sites/publications.ca.uky.edu/files/AGR233.pdf>
- Archived: <https://web.archive.org/web/20261017221222/https://publications.mgcafe.uky.edu/sites/publications.ca.uky.edu/files/AGR233.pdf>
- Verification: URL-verified | Access: public-domain, evidence tier **C**
- Backs:
  - foxtail-millet coldLimit
    - "Foxtail millet should be planted after there is no chance of frost and when the soil temperature has reached at least 65ºF. It is more sensitive to cold stress than sorghum." (Page 1, planting paragraph)
- **Caveat:** Published outside a peer-reviewed journal.

#### `umaine-extension-2008-wild-blueberries-bulletin-4263`

Fishman, Lisa; Hedstrom, Nellie. (2008). *Bulletin #4263, Vegetables and Fruits for Health: Wild Blueberries*. University of Maine Cooperative Extension

- URL: <https://extension.umaine.edu/publications/4263e/>
- Archived: <https://web.archive.org/web/20260521012711/https://extension.umaine.edu/publications/4263e/>
- Verification: URL-verified | Access: public-domain, evidence tier **C**
- Backs:
  - harvest timing for lowbush-blueberry
    - "If possible, go to the fields and buy berries directly from growers during harvest season. Buy your supply when berries are at their peak, from July to mid-August" (Section ‘Selection’)
- **Caveat:** Published outside a peer-reviewed journal. Its dates are calibrated to the Down East wild blueberry barrens of Washington County, Maine, and this app places them at the same point in each garden's own frost-free season. Lowbush blueberry dates come from buying advice in a nutrition bulletin, read as the peak of the harvest season.

#### `umass-extension-2008-cranberry-production-guide`

Averill, Anne; Caruso, Frank L.; DeMoranville, Carolyn J.; Jeranyama, Peter; LaFleur, Jeffrey; McKenzie, Kenna; Rinta, Linda; Sandler, Hilary A.; Wick, Brian. (2008). *Cranberry Production Guide (CP-08)*. University of Massachusetts Amherst Cranberry Station Extension (ScholarWorks@UMass Amherst)

- URL: <http://scholarworks.umass.edu/cranberry_prod_guide/8>
- Verification: URL-verified | Access: public-domain, evidence tier **C**
- Backs:
  - harvest timing for cranberry
    - "Harvesting typically begins around mid-September and continues through early November" (p. 3, fruit growth and development discussion ('The Cranberry Plant' chapter, before the 'Flowers' heading))
- **Caveat:** Published outside a peer-reviewed journal. Its dates are calibrated to East Wareham in the cranberry-growing area of southeastern Massachusetts, and this app places them at the same point in each garden's own frost-free season.

#### `umd-extension-2024-less-common-fruits`

Talabac, Miri. (2024). *Less Common Fruits for a Home Garden*. University of Maryland Extension, Home and Garden Information Center

- URL: <https://extension.umd.edu/resource/less-common-fruits-home-garden>
- Archived: <https://web.archive.org/web/20260517021634/http://extension.umd.edu/resource/less-common-fruits-home-garden>
- Verification: URL-verified | Access: public-domain, evidence tier **C**
- Backs:
  - harvest timing for elderberry
    - "Harvest is usually between mid-August and mid-September, depending on cultivar and location" (Elderberry section, ‘Harvesting’ subheading)
- **Caveat:** Published outside a peer-reviewed journal. Its dates are calibrated to Maryland, and this app places them at the same point in each garden's own frost-free season.

#### `umn-2018-spring-frost-damage-on-soybean`

Potter, Bruce; Bongard, Phyllis; Naeve, Seth; Gunsolus, Jeff. (2018). *Spring frost damage on soybean*. University of Minnesota Extension

- URL: <https://extension.umn.edu/agriculture/crop-production/soybean/spring-frost>
- Archived: <https://web.archive.org/web/20261017213822/https://extension.umn.edu/agriculture/crop-production/soybean/spring-frost>
- Verification: URL-verified | Access: public-domain, evidence tier **C**
- Backs:
  - soybean coldLimit
    - "To kill soybean tissue, temperatures usually need to be at or below 28 to 30 degrees Fahrenheit for several hours. However, an air temperature of 28 does not guarantee a soybean crop will freeze." (Accordion 'Factors affecting survivability', 'Temperature')
- **Caveat:** Published outside a peer-reviewed journal.

#### `umn-2023-alfalfa-establishment-management-strategies`

Sheaffer, Craig; Wells, M. Samantha; Holen, Doug. (2023). *Alfalfa establishment: Management strategies*. University of Minnesota Extension

- URL: <https://extension.umn.edu/planting-forages/alfalfa-establishment-management-strategies>
- Archived: <https://web.archive.org/web/20260815223526/https://extension.umn.edu/planting-forages/alfalfa-establishment-management-strategies>
- Verification: URL-verified | Access: public-domain, evidence tier **C**
- Backs:
  - alfalfa yearsToFirstHarvest
    - "Direct-seeded alfalfa should be harvested about 60 days following seeding and additional harvests taken before early September." (Section 'Seeding alfalfa', accordion 'Weed control and companion crops with new seedings', paragraph 'Direct seeding wit)
- **Caveat:** Published outside a peer-reviewed journal.

#### `umn-2026-short-stature-corn`

University of Minnesota Extension. (2026). *Changing the Architecture of the Midwest: The Rise of Short Stature Corn*. University of Minnesota Extension, Minnesota Crop News

- URL: <https://blog-crop-news.extension.umn.edu/2026/06/changing-architecture-of-midwest-rise.html>
- Archived: <https://web.archive.org/web/20260729154628/https://blog-crop-news.extension.umn.edu/2026/06/changing-architecture-of-midwest-rise.html>
- Verification: URL-verified | Access: public-domain, evidence tier **C**
- Backs:
  - corn-grain height
    - "While traditional corn towers at 9 to 12 feet, new hybrids are keeping the canopy at 7 feet or less—without sacrificing the yields growers require." (Minnesota Crop News blog post, June 27, 2026 (Cropcast episode summary with Dr. Jeff Coulter, UMN Extension Corn Special))
- **Caveat:** Published outside a peer-reviewed journal.

#### `umn-cpbt-jute-mallow`

Community Plant Breeding Team, University of Minnesota. (n.d.). *Jute Mallow: Corchorus olitorius and Corchorus capsularis*. University of Minnesota

- URL: <https://cpbt.umn.edu/sites/cpbt.umn.edu/files/2025-03/Jute%20Mallow.pdf>
- Archived: <https://web.archive.org/web/20261017214047/https://cpbt.umn.edu/sites/cpbt.umn.edu/files/2025-03/Jute%20Mallow.pdf>
- Verification: URL-verified | Access: public-domain, evidence tier **C**
- Backs:
  - jute-mallow light
    - "Full sun and fertile, well-draining soil" (Column 'Growing')
- **Caveat:** Published outside a peer-reviewed journal.

#### `umn-extension-2024-currants-gooseberries`

Wimmer, Madeline; Tepe, Emily S.; Hoover, Emily E. (2024). *Growing currants and gooseberries in the home garden*. University of Minnesota Extension

- URL: <https://extension.umn.edu/garden-and-home/yard-and-garden/gardening-in-minnesota/growing-currants-and-gooseberries-in-the-home-garden>
- Archived: <https://web.archive.org/web/20261017211249/https://extension.umn.edu/garden-and-home/yard-and-garden/gardening-in-minnesota/growing-currants-and-gooseberries-in-the-home-garden>
- Verification: URL-verified | Access: public-domain, evidence tier **C**
- Backs:
  - harvest timing for currant-red
    - "July, August: Harvest" (‘Care through the seasons’ checklist)
  - harvest timing for currant-black
    - "July, August: Harvest" (‘Care through the seasons’ checklist)
  - harvest timing for gooseberry
    - "July, August: Harvest" (‘Care through the seasons’ checklist)
- **Caveat:** Published outside a peer-reviewed journal. Its dates are calibrated to the Twin Cities area of Southern Minnesota, and this app places them at the same point in each garden's own frost-free season.

#### `umn-extension-2024-horseradish`

University of Minnesota Extension. (2024). *Growing horseradish in home gardens*. University of Minnesota Extension

- URL: <https://extension.umn.edu/vegetables/growing-horseradish>
- Archived: <https://web.archive.org/web/20260604103515/https://extension.umn.edu/vegetables/growing-horseradish>
- Verification: URL-verified | Access: public-domain, evidence tier **C**
- Backs:
  - harvest timing for horseradish
    - "Horseradish grows the most during late summer and early autumn. For this reason, delay fall harvest until late October or early November, or just before the ground freezes" ("Harvesting" section)
- **Caveat:** Published outside a peer-reviewed journal. Its dates are calibrated to Minnesota, represented by Minneapolis-St Paul, and this app places them at the same point in each garden's own frost-free season.

#### `umn-extension-2024-kiwiberry`

Hoover, Emily; Luby, Jim; Guthrie, Bob; Tepe, Emily; Wannemuehler, Seth. (2024). *Growing kiwiberry in the home garden*. University of Minnesota Extension

- URL: <https://extension.umn.edu/fruit/kiwiberry>
- Archived: <https://web.archive.org/web/20260607162424/https://extension.umn.edu/fruit/kiwiberry>
- Verification: URL-verified | Access: public-domain, evidence tier **C**
- Backs:
  - harvest timing for hardy-kiwi
    - "Late August to mid-October" (Table ‘Characteristics of kiwiberry species for Minnesota,’ row ‘Harvest date,’ column ‘A. arguta’)
- **Caveat:** Published outside a peer-reviewed journal. Its dates are calibrated to the Twin Cities area of Southern Minnesota, and this app places them at the same point in each garden's own frost-free season.

#### `umn-extension-2024-sorrel`

University of Minnesota Extension. (2024). *Growing sorrel in home gardens*. University of Minnesota Extension

- URL: <https://extension.umn.edu/vegetables/growing-sorrel>
- Archived: <https://web.archive.org/web/20251110220244/https://extension.umn.edu/vegetables/growing-sorrel>
- Verification: URL-verified | Access: public-domain, evidence tier **C**
- Backs:
  - harvest timing for sorrel
    - "Once the plants are established, you can harvest sorrel at any time from early spring until frost kills the growth" ("Harvest" section)
- **Caveat:** Published outside a peer-reviewed journal. Its dates are calibrated to Minnesota, and this app places them at the same point in each garden's own frost-free season.

#### `umn-extension-2024-strawberries`

Hoover, Emily E.; Klodd, Annie; Tepe, Emily S.; Foulk, Doug. (2024). *Growing strawberries in the home garden*. University of Minnesota Extension

- URL: <https://extension.umn.edu/fruit/growing-strawberries-home-garden>
- Archived: <https://web.archive.org/web/20260513161332/https://extension.umn.edu/fruit/growing-strawberries-home-garden>
- Verification: URL-verified | Access: public-domain, evidence tier **C**
- Backs:
  - harvest timing for strawberry
    - "June-bearing strawberries produce a large, concentrated crop in mid-June to early July" (Section ‘Types of strawberries’ (Quick facts list))
- **Caveat:** Published outside a peer-reviewed journal. Its dates are calibrated to the Twin Cities area of Southern Minnesota, and this app places them at the same point in each garden's own frost-free season.

#### `umn-extension-2026-asparagus`

University of Minnesota Extension. (2026). *Growing asparagus in home gardens*. University of Minnesota Extension

- URL: <https://extension.umn.edu/vegetables/growing-asparagus>
- Archived: <https://web.archive.org/web/20260615110752/https://extension.umn.edu/vegetables/growing-asparagus>
- Verification: URL-verified | Access: public-domain, evidence tier **C**
- Backs:
  - harvest timing for asparagus
    - "The asparagus harvest season lasts about 6 to 8 weeks, from early May to late June in Minnesota" ("Harvest and storage > Harvest" section)
- **Caveat:** Published outside a peer-reviewed journal. Its dates are calibrated to Minnesota, represented by Minneapolis-St Paul, and this app places them at the same point in each garden's own frost-free season.

#### `umn-extension-2026-blueberries`

Tepe, Emily S.; Hoover, Emily E.; Luby, James; Klodd, Annie; Schuh, Marissa. (2026). *Growing blueberries in the home garden*. University of Minnesota Extension

- URL: <https://extension.umn.edu/garden-and-home/yard-and-garden/gardening-in-minnesota/growing-blueberries-in-the-home-garden>
- Archived: <https://web.archive.org/web/20261002071746/https://extension.umn.edu/garden-and-home/yard-and-garden/gardening-in-minnesota/growing-blueberries-in-the-home-garden>
- Verification: URL-verified | Access: public-domain, evidence tier **C**
- Backs:
  - harvest timing for blueberry, from the ‘Care through the seasons’ checklist, which marks July for ‘Harvest’
- **Caveat:** Published outside a peer-reviewed journal. Its dates are calibrated to the Twin Cities area of Southern Minnesota, and this app places them at the same point in each garden's own frost-free season.

#### `umn-extension-2026-cold-climate-grapes`

Wimmer, Madeline. (2026). *Cold-climate grapes*. University of Minnesota Extension

- URL: <https://extension.umn.edu/fruit-and-vegetable-farming/cold-climate-grapes>
- Archived: <https://web.archive.org/web/20261017211359/https://extension.umn.edu/fruit-and-vegetable-farming/cold-climate-grapes>
- Verification: URL-verified | Access: public-domain, evidence tier **C**
- Backs:
  - harvest timing for grape
    - "In Minnesota, many varieties begin to grow in May, and the earliest-ripening varieties are harvested in mid-August, while later-ripening varieties may hang until mid-to-late October" (Section ‘Bud-break and harvest windows’)
- **Caveat:** Published outside a peer-reviewed journal. Its dates are calibrated to the Twin Cities area of Southern Minnesota, and this app places them at the same point in each garden's own frost-free season.

#### `umn-extension-2026-raspberries`

University of Minnesota Extension. (2026). *Growing raspberries in the home garden*. University of Minnesota Extension

- URL: <https://extension.umn.edu/fruit/growing-raspberries-home-garden>
- Archived: <https://web.archive.org/web/20260513160707/https://extension.umn.edu/fruit/growing-raspberries-home-garden>
- Verification: URL-verified | Access: public-domain, evidence tier **C**
- Backs:
  - harvest timing for raspberry, from the ‘Care through the seasons’ checklist for summer-bearing raspberries, which marks July and August for ‘Harvest’
- **Caveat:** Published outside a peer-reviewed journal. Its dates are calibrated to the Twin Cities area of Southern Minnesota, and this app places them at the same point in each garden's own frost-free season.

#### `umn-extension-crow-wing-2020-ground-cherries`

Lee, Jennifer. (2020). *Ground Cherries (Crow Wing County Master Gardener Volunteer Program plant guide)*. University of Minnesota Extension, Crow Wing County Master Gardener Volunteer Program

- URL: <https://crowwingmastergardeners.org/wp-content/uploads/2025/04/Plant-Guide-Ground-Cherries.pdf>
- Archived: <https://web.archive.org/web/20260316045139/https://crowwingmastergardeners.org/wp-content/uploads/2025/04/Plant-Guide-Ground-Cherries.pdf>
- Verification: URL-verified | Access: public-domain, evidence tier **C**
- Backs:
  - ground-cherry coldLimit
    - "Indeterminate – Ground cherries continue to grow all season and continue producing fruit until killed by frost" (Plant Selection box, first bullet)
- **Caveat:** Published outside a peer-reviewed journal.

#### `umn-extension-mackenzie-ground-cherries`

MacKenzie, Jill. (2024). *Growing tomatillos and ground cherries in home gardens*. University of Minnesota Extension

- URL: <https://extension.umn.edu/vegetables/growing-tomatillos-and-ground-cherries>
- Archived: <https://web.archive.org/web/20260618070125/https://extension.umn.edu/vegetables/growing-tomatillos-and-ground-cherries>
- Verification: URL-verified | Access: public-domain, evidence tier **C**
- Backs:
  - ground-cherry spacing
    - "Allow ground cherry plants 18 to 24 inches of space in all directions." (Planting, Transplanting section)
- **Caveat:** Published outside a peer-reviewed journal.

#### `umn-extension-staple-vegetables-molokhia`

University of Minnesota Extension. (n.d.). *Growing staple vegetables from around the world in Minnesota (Molokhia, Corchorus olitorius)*. University of Minnesota Extension

- URL: <https://extension.umn.edu/agriculture/specialty-crops/vegetable-farming/growing-staple-vegetables-from-around-the-world-in-minnesota>
- Archived: <https://web.archive.org/web/20261017214022/https://extension.umn.edu/agriculture/specialty-crops/vegetable-farming/growing-staple-vegetables-from-around-the-world-in-minnesota>
- Verification: URL-verified | Access: public-domain, evidence tier **C**
- Backs:
  - jute-mallow spacing
    - "Row spacing: 30-36 inches. Within-row plant spacing: 2-3 inches for bunched greens, 6-12 inches for continual harvest." (Section 'Growing guides', accordion 'Molokhia (Corchorus olitorius)', 'Planting tips for growing molokhia in Minnesota')
  - jute-mallow daysToMaturity
    - "Days to harvest: 40-60 days for bunched greens. For continuous leaf harvest, start harvesting individually at 40 days and continue throughout the summer." ('Planting tips for growing molokhia in Minnesota' list, item 'Days to harvest')
- **Caveat:** Published outside a peer-reviewed journal.

#### `unh-extension-garlic-chives`

University of New Hampshire Extension. (n.d.). *How to grow garlic chives (Allium tuberosum)*. University of New Hampshire Extension

- URL: <https://extension.unh.edu/resource/how-grow-garlic-chives-allium-tuberosum>
- Archived: <https://web.archive.org/web/20260120053405/https://extension.unh.edu/resource/how-grow-garlic-chives-allium-tuberosum>
- Verification: URL-verified | Access: public-domain, evidence tier **C**
- Backs:
  - garlic-chives spacing
    - "Sow lightly, and thin to 12 inches apart on all sides when seedlings are 2” tall." (Planting paragraph (the Profile list on the same page also gives Plant Spacing: 12 inches and Row Spacing: 12 inches))
  - garlic-chives height
    - "Plant Size: 18-24 inches tall; 12 inches wide" (Profile list, Plant Size line)
  - garlic-chives width
    - "Plant Size: 18-24 inches tall; 12 inches wide" (Profile list, Plant Size line)
  - garlic-chives coldLimit
    - "Hardy to USDA Zone 3." (Planting paragraph)
  - garlic-chives light
    - "Plant seeds in moist soil with good drainage, in full sun to part shade." (Planting paragraph (the Profile list gives Sun: Full sun to part shade))
- **Caveat:** Published outside a peer-reviewed journal.

#### `uog-2020-breadfruit-guam`

Bevacqua, Robert F.; Miller, Ross H. (2020). *Agroforestry on Guam: Breadfruit Cultivation*. University of Guam, Western Pacific Tropical Research Center

- URL: <https://www.uog.edu/_resources/files/wptrc/Bread_Fruit_Final2.pdf>
- Archived: <https://web.archive.org/web/20250620094822/https://www.uog.edu/_resources/files/wptrc/Bread_Fruit_Final2.pdf>
- Verification: URL-verified | Access: public-domain, evidence tier **C**
- Backs:
  - breadfruit spacing
    - "‘Ma’afala’ is a relatively compact variety. A recommended spacing is 25 feet between trees in the rows and 50 feet between rows." (p. 5 of 12, section 'Spacing' under Planting)
- **Caveat:** Published outside a peer-reviewed journal.

#### `uprm-2001-recao-culantro-publicacion-162`

Santiago Santos, Luis Reinaldo. (2001). *La producción de recao o culantro (Eryngium foetidum L.) en Puerto Rico (Publicación 162)*. Universidad de Puerto Rico, Recinto Universitario de Mayagüez, Colegio de Ciencias Agrícolas, Estación Experimental Agrícola

- URL: <https://www.uprm.edu/hortalizasygranosbasicos/wp-content/uploads/sites/330/2025/06/CONJUNTO-RECAO-162-copy.pdf>
- Archived: <https://web.archive.org/web/20260415125100/https://www.uprm.edu/hortalizasygranosbasicos/wp-content/uploads/sites/330/2025/06/CONJUNTO-RECAO-162-copy.pdf>
- Verification: URL-verified | Access: public-domain, evidence tier **C**
- Backs:
  - culantro spacing
    - "Entre las distancias de siembra recomendadas y más utilizadas por los agricultores, se encuentran: 6" x 6" (6 pulgadas entre hilera x 6 pulgadas entre plantas), 5" x 5", 6"x 3" y 6" x 2"." (Section 'Siembra', PDF page 25 (printed page 18))
  - culantro daysToMaturity
    - "El recao tarda de tres a cuatro meses desde la siembra hasta la primera cosecha." (Section 'Ciclo de cultivo vegetativo del recao', PDF page 16)
  - culantro harvestSeason
    - "Al cabo de dos meses, la planta ha crecido de nuevo, dando paso a nuevas cosechas [...] La mejor época de siembra es de octubre a abril, cuando las temperaturas son frescas, aunque se puede sembrar durante todo el año." (Sections 'Ciclo de cultivo vegetativo del recao' (PDF page 16) and 'Siembra' (PDF page 25))
- **Caveat:** Published outside a peer-reviewed journal.

#### `usask-gardening-haskaps`

University of Saskatchewan, College of Agriculture and Bioresources. (n.d.). *Haskaps (Gardening at USask)*. University of Saskatchewan

- URL: <https://gardening.usask.ca/gardening-advice/gardenline-nested-pages/food-plant-pages/fruit/haskap.php>
- Archived: <https://web.archive.org/web/20260618072933/https://gardening.usask.ca/gardening-advice/gardenline-nested-pages/food-plant-pages/fruit/haskap.php>
- Verification: URL-verified | Access: public-domain, evidence tier **C**
- Backs:
  - haskap light
    - "Haskaps do best full sun to thrive. They can grow in part sun, but you will get less fruit. They are not suited to part shade or very shady conditions." (USask Gardening (Gardenline), Haskaps page, Planting haskaps tab, Site selection)
- **Caveat:** Published outside a peer-reviewed journal.

#### `usda-1948-vanilla-culture-puerto-rico`

Childers, Norman F. (1948). *Vanilla Culture in Puerto Rico (Circular No. 28, Federal Experiment Station in Puerto Rico)*. U.S. Department of Agriculture, Federal Experiment Station in Puerto Rico, Mayaguez

- URL: <https://archive.org/details/CAT31289489>
- Verification: URL-verified | Access: public-domain, evidence tier **C**
- Backs:
  - vanilla yearsToFirstHarvest
    - "They usually begin fruiting the third year after planting and continue fruiting for the next 3 to 5 years before dying." (p. 38 (PDF p. 42 of 100), paragraph after Figure 26)
  - vanilla harvestSeason
    - "The harvesting season in Puerto Rico usually begins in September and continues to the following June, the bulk of the crop being harvested in December to March, inclusive, as shown in table 7." (p. 52 (PDF p. 56 of 100), section 'HARVESTING')
  - vanilla light
    - "Vanilla appears to grow and fruit best under shade admitting from one-third to one-half full sunlight." (p. 76 (PDF p. 82 of 100), RECOMMENDATIONS, item 4)
- **Caveat:** Published outside a peer-reviewed journal.

#### `usda-nrcs-2000-plant-guide-echinacea-purpurea`

Stevens, Michelle. (2000). *Eastern purple coneflower, Echinacea purpurea (L.) Moench, Plant Guide*. USDA Natural Resources Conservation Service, National Plant Data Center

- URL: <https://plants.usda.gov/DocumentLibrary/plantguide/pdf/pg_ecpu.pdf>
- Archived: <https://web.archive.org/web/20261017220837/https://plants.usda.gov/DocumentLibrary/plantguide/pdf/pg_ecpu.pdf>
- Verification: URL-verified | Access: public-domain, evidence tier **C**
- Backs:
  - echinacea spacing
    - "In late spring or early summer, the hardy seedlings, now with a four-to-six inch root system, may be transplanted into the field or garden one or two feet apart." (Section 'Seed Propagation', page 2 of the Plant Guide)
- **Caveat:** Published outside a peer-reviewed journal.

#### `usda-nrcs-2006-plant-fact-sheet-alfalfa`

USDA NRCS Plant Materials Program. (2006). *Plant Fact Sheet: Alfalfa, Medicago sativa L.* USDA Natural Resources Conservation Service

- URL: <https://plants.usda.gov/DocumentLibrary/factsheet/pdf/fs_mesa.pdf>
- Archived: <https://web.archive.org/web/20260609044556/https://plants.usda.gov/DocumentLibrary/factsheet/pdf/fs_mesa.pdf>
- Verification: URL-verified | Access: public-domain, evidence tier **C**
- Backs:
  - alfalfa height
    - "Alfalfa’s stems are erect and grow from a woody crown to about 2 to 3 feet tall." (p. 1, 'Description' section)
- **Caveat:** Published outside a peer-reviewed journal.

#### `usda-nrcs-florida-fruit-trees-fact-sheet-6`

USDA NRCS Brooksville Plant Materials Center. (n.d.). *Florida Plant Materials Fact Sheet No. 6: USDA Climate-Smart Commodities: Tropical and Sub-Tropical Fruit Trees*. USDA Natural Resources Conservation Service

- URL: <https://www.nrcs.usda.gov/plantmaterials/flpmctn14135.pdf>
- Verification: URL-verified | Access: public-domain, evidence tier **C**
- Backs:
  - breadfruit height
    - "Top at 10 ft (3 m) to encourage lateral branches; annually as needed to 16-25 ft (4-8 m); unpruned to 40-50 ft (12-15 m)" (p. 2 of 6, table, row 'Breadfruit, Pana', column 'Pruning')
  - breadfruit yearsToFirstHarvest
    - "Moderate to Moderately slow; vegetative or grafted trees- 2-4 yr; trees from seed 5-10 yr" (p. 2 of 6, table, row 'Breadfruit, Pana', column 'Growth Rate/Time to First Harvest')
  - breadfruit coldLimit
    - "Killed <40 F (4.4 C)" (p. 2 of 6, table, row 'Breadfruit, Pana', column 'Min. Temp.')
- **Caveat:** Published outside a peer-reviewed journal.

#### `usda-nrcs-hurteau-black-walnut-plant-guide`

Hurteau, Matthew D. (n.d.). *Plant Guide: Black Walnut (Juglans nigra L.)*. USDA Natural Resources Conservation Service, National Plant Data Center

- URL: <https://plants.sc.egov.usda.gov/DocumentLibrary/plantguide/pdf/cs_juni.pdf>
- Archived: <https://web.archive.org/web/20261017213318/https://plants.sc.egov.usda.gov/DocumentLibrary/plantguide/pdf/cs_juni.pdf>
- Verification: URL-verified | Access: public-domain, evidence tier **C**
- Backs:
  - black-walnut height
    - "Black walnut is usually a medium sized tree ranging from 70-90 feet tall and 2-3 feet in diameter at breast height. However, black walnut can reach 150 feet tall and 8 feet in diameter at breast height." (USDA NRCS Plant Guide (Juglans nigra), p. 1, "Description - General")
  - black-walnut light
    - "Black walnut prefers full sun." (USDA NRCS Plant Guide (Juglans nigra), p. 1, "Adaptation" section)
- **Caveat:** Published outside a peer-reviewed journal.

#### `usda-nrcs-pigeonpea-plant-guide`

USDA NRCS Cape May Plant Materials Center. (n.d.). *Plant Guide: Pigeonpea, Cajanus cajan (L.) Millsp.* United States Department of Agriculture, Natural Resources Conservation Service

- URL: <https://plants.sc.egov.usda.gov/DocumentLibrary/plantguide/pdf/pg_caca27.pdf>
- Archived: <https://web.archive.org/web/20260929154052/https://plants.sc.egov.usda.gov/DocumentLibrary/plantguide/pdf/pg_caca27.pdf>
- Verification: URL-verified | Access: public-domain
- Backs:
  - pigeon-pea height
    - "It is a shrub that can grow to 12 ft tall, but usually only reaches 3 to 6 ft" (page 2)
  - pigeon-pea spacing
    - "Sow seeds 1.5 inches deep on 1 to 3 foot rows at 8 to 10 lb per acre" (page 2)
  - pigeon-pea daysToMaturity
    - "C. cajan requires 65-80 days to flower and 50-75 additional days to create mature seeds (Mullen et al., 2003), however many varieties have been developed to flower earlier" (page 2)
  - pigeon-pea temperature, frost and lifespan
    - "C. cajan grows best under hot conditions (65-86F)" (page 2)
    - "Frost will defoliate the plant" (page 2)
    - "Under good management, the plant can live up to five years" (page 3)
  - pigeon-pea photoperiod, why the row carries no day-length gate
    - "There is a day-neutral cultivar from Florida called ‘Amarillo’ that can be sown and harvested throughout the year (Duke, 1983)." (page 3)
- **Caveat:** A conservation-planting guide compiled from secondary sources (Cook et al. 2005, Mullen et al. 2003, Phatak et al. 1993, Duke 1983), and it reports no trial of its own.

#### `usda-nrcs-plants-glycine-max-characteristics`

USDA Natural Resources Conservation Service. (n.d.). *PLANTS Database: Glycine max (L.) Merr., soybean (GLMA4), Plant Characteristics*. USDA Natural Resources Conservation Service

- URL: <https://plants.usda.gov/plant-profile/GLMA4/characteristics>
- Archived: <https://web.archive.org/web/20261017213704/https://plants.usda.gov/plant-profile/GLMA4/characteristics>
- Verification: URL-verified | Access: public-domain, evidence tier **C**
- Backs:
  - soybean height
    - "Height, Mature (feet) 3.0" (Plant Characteristics, 'Morphology/Physiology', field 'Height, Mature (feet)')
- **Caveat:** Published outside a peer-reviewed journal.

#### `usda-plants-black-pepper`

USDA NRCS National Plant Data Team. (n.d.). *PLANTS Profile for Piper nigrum L. (black pepper), symbol PINI3*. USDA Natural Resources Conservation Service, PLANTS Database

- URL: <https://plants.usda.gov/plant-profile/PINI3>
- Archived: <https://web.archive.org/web/20250929201215/https://plants.usda.gov/plant-profile/PINI3>
- Verification: URL-verified | Access: public-domain, evidence tier **C**
- Backs:
  - black-pepper invasiveStatus
    - ""HasNoxiousStatuses":false,"NoxiousStatuses":null" (USDA PLANTS API profile for symbol PINI3 (Piper nigrum), field HasNoxiousStatuses, https://plantsservices.sc.egov.usda.g)
- **Caveat:** Published outside a peer-reviewed journal.

#### `usfs-1989-hawaii-forest-trees-breadfruit`

Little, Elbert L., Jr.; Skolmen, Roger G. (1989). *Common Forest Trees of Hawaii (Native and Introduced): 'Ulu, breadfruit, Artocarpus altilis (USDA Forest Service Agriculture Handbook 679)*. USDA Forest Service, 1989 (reprint by College of Tropical Agriculture and Human Resources, University of Hawaii at Manoa, 2003)

- URL: <https://www.ctahr.hawaii.edu/gsp/doc/Forestry/Little_Skolmen_CFT/CFT_Artocarpus_altilis.pdf>
- Archived: <https://web.archive.org/web/20260123061035/https://www.ctahr.hawaii.edu/gsp/doc/Forestry/Little_Skolmen_CFT/CFT_Artocarpus_altilis.pdf>
- Verification: URL-verified | Access: public-domain, evidence tier **C**
- Backs:
  - breadfruit harvestSeason
    - "Fruits mature mainly from June to August in Hawaii." (p. 1 of 3, description of the fruit)
- **Caveat:** Published outside a peer-reviewed journal.

#### `usfs-1993-sullivan-feis-morus-rubra`

Sullivan, Janet. (1993). *Morus rubra, red mulberry (Fire Effects Information System species review)*. U.S. Department of Agriculture, Forest Service, Rocky Mountain Research Station, Fire Sciences Laboratory

- URL: <https://research.fs.usda.gov/feis/species-reviews/morrub>
- Archived: <https://web.archive.org/web/20260417063043/https://research.fs.usda.gov/feis/species-reviews/morrub>
- Verification: URL-verified | Access: public-domain, evidence tier **C**
- Backs:
  - mulberry-red light
    - "Red mulberry grows best in the open, but is somewhat tolerant of shade" (USDA Forest Service Fire Effects Information System species review, section Successional Status)
- **Caveat:** Published outside a peer-reviewed journal.

#### `usfs-2008-invasiveness-ranking-non-native-plants-alaska`

Carlson, Matthew L.; Lapina, Irina V.; Shephard, Michael; Conn, Jeffery S.; Densmore, Roseann; Spencer, Page; Heys, Jeff; Riley, Julie; Nielsen, Jamie. (2008). *Invasiveness Ranking System for Non-Native Plants of Alaska (R10-TP-143)*. USDA Forest Service, Alaska Region

- URL: <https://accs.uaa.alaska.edu/wp-content/uploads/Invasiveness_Ranking_System_for_Non-Native_Plants_Alaska.pdf>
- Archived: <https://web.archive.org/web/20250916005647/https://accs.uaa.alaska.edu/wp-content/uploads/Invasiveness_Ranking_System_for_Non-Native_Plants_Alaska.pdf>
- Verification: URL-verified | Access: public-domain, evidence tier **C**
- Backs:
  - alfalfa invasiveStatus
    - "Medicago sativa ssp. sativa Alfalfa 13(30) 17 16 7 53(90) 59 Yes Yes Yes" (Appendix A (p. A-2), table of invasiveness ranks, row 'Medicago sativa ssp. sativa', column 'Invasiveness'. The same tab)
- **Caveat:** Published outside a peer-reviewed journal.

#### `usfs-2008-seed-manual-hippophae-rhamnoides`

Busing, Richard T.; Slabaugh, Paul E. (2008). *Hippophae rhamnoides L.: common seabuckthorn (The Woody Plant Seed Manual, Agriculture Handbook 727)*. USDA Forest Service

- URL: <https://research.fs.usda.gov/treesearch/32649>
- Archived: <https://web.archive.org/web/20260403045946/https://research.fs.usda.gov/treesearch/32649>
- Verification: URL-verified | Access: public-domain, evidence tier **C**
- Backs:
  - sea-buckthorn harvestSeason
    - "ripen in September or October (Hoag 1965; Hottes 1952) and frequently persist on the shrubs until the following March." ("Flowering and fruiting" paragraph, p. 588 of the Woody Plant Seed Manual)
- **Caveat:** Published outside a peer-reviewed journal.

#### `usfs-2014-ramps`

Chamberlain, Jim; Beegle, Dana; Lajeunesse Connette, Katie. (2014). *Forest Farming Ramps (Agroforestry Notes, AF Note-47)*. USDA Forest Service, USDA National Agroforestry Center

- URL: <https://www.fs.usda.gov/nac/assets/documents/agroforestrynotes/an47ff08.pdf>
- Archived: <https://web.archive.org/web/20260703123027/https://www.fs.usda.gov/nac/assets/documents/agroforestrynotes/an47ff08.pdf>
- Verification: URL-verified | Access: public-domain, evidence tier **C**
- Backs:
  - harvest timing for ramps
    - "The timing of harvest may differ geographically. For example, in southern Appalachia the optimal time to harvest is usually about the third week in April, whereas in cooler northern climates harvesting may be best a bit later" (p. 4, "Harvesting & Processing" section)
- **Caveat:** Published outside a peer-reviewed journal. Its dates are calibrated to Southern Appalachia, represented by Asheville, NC, and this app places them at the same point in each garden's own frost-free season. The ramps harvest is the stated best week, since ramps are dug once in spring.

#### `usu-2015-goji-in-the-garden`

Maughan, Tiffany; Black, Brent. (2015). *How to Grow Goji Berries In Your Garden*. Utah State University Extension

- URL: <https://extension.usu.edu/yardandgarden/research/goji-in-the-garden>
- Archived: <https://web.archive.org/web/20260405235117/https://extension.usu.edu/yardandgarden/research/goji-in-the-garden>
- Verification: URL-verified | Access: public-domain, evidence tier **C**
- Backs:
  - goji spacing
    - "If establishing multiple rows, leave 2 to 4 feet between plants within a row and 6 to 8 feet between rows." ("Spacing" section)
  - goji height
    - "When pruned, plants are typically 3 to 6 feet tall but if left without cultivation they can reach 12 feet." ("Summary" section)
  - goji width
    - "make sure there is enough room in all directions for the plant to reach full size and to allow for easy harvest (about 4 to 5 feet in all directions)" ("Spacing" section)
  - goji yearsToFirstHarvest
    - "Both begin bearing 1 to 2 years after planting, although they will not reach full production for 3 to 5 years." ("Recommended Goji Berry Cultivars" section)
  - goji harvestSeason
    - "They will fruit from mid-summer to late fall." ("How to Harvest and Use Goji Berries" section)
  - goji coldLimit
    - "Goji are recommended for zones 4 to 7." ("Summary" section)
  - goji light
    - "Plant goji in a location with full sun (although some shade can be tolerated)." ("Site Selection" section)
- **Caveat:** Published outside a peer-reviewed journal.

#### `usu-2015-haskap-in-the-garden`

Lauritzen, Elisa; Maughan, Tiffany; Black, Brent. (2015). *Haskap in the Garden*. Utah State University Extension

- URL: <https://extension.usu.edu/yardandgarden/research/haskap-in-the-garden.pdf>
- Archived: <https://web.archive.org/web/20260417145020/https://extension.usu.edu/yardandgarden/research/haskap-in-the-garden.pdf>
- Verification: URL-verified | Access: public-domain, evidence tier **C**
- Backs:
  - haskap spacing
    - "For most cultivars, leaving 3 to 4 feet between plants within the row and 6 to 10 feet between rows is sufficient." (Utah State University Extension, Haskap in the Garden, section Planting and Spacing, page 2)
  - haskap height
    - "They can grow to be 6 feet high and wide and the form varies significantly, from low-growing to upright, depending on the variety." (Utah State University Extension, Haskap in the Garden, section Haskap Plants, page 1)
  - haskap width
    - "They can grow to be 6 feet high and wide and the form varies significantly, from low-growing to upright, depending on the variety." (Utah State University Extension, Haskap in the Garden, section Haskap Plants, page 1)
  - haskap harvestSeason
    - "Berries ripen in early to mid-June, usually just before strawberries begin producing." (Utah State University Extension, Haskap in the Garden, section Haskap Plants, page 1)
- **Caveat:** Published outside a peer-reviewed journal.

#### `usu-2020-english-lavender`

Crummitt, Keenen; Drost, Dan. (2020). *How to Grow English Lavender in Your Garden*. Utah State University Extension

- URL: <https://extension.usu.edu/yardandgarden/research/english-lavender-in-the-garden>
- Archived: <https://web.archive.org/web/20260909071347/https://extension.usu.edu/yardandgarden/research/english-lavender-in-the-garden>
- Verification: URL-verified | Access: public-domain, evidence tier **C**
- Backs:
  - lavender spacing
    - "Space lavender plants 18-24 inches apart into light, well aerated, gravelly soil." (“Planting and Spacing” section)
  - lavender height
    - "Lavender grows about 1-2 feet tall and wide depending on variety and takes 3 years to reach full size." (“Planting and Spacing” section)
  - lavender width
    - "Lavender grows about 1-2 feet tall and wide depending on variety and takes 3 years to reach full size." (“Planting and Spacing” section)
  - lavender yearsToFirstHarvest
    - "During the first year, branches should be clipped to keep them from flowering and to encourage the development of lateral shoots." (“How to Harvest and Store English Lavender” section)
  - lavender light
    - "English Lavender (Lavandula angustifolias) thrives in full sun, well-drained soil with a pH of 6.5-7.5. Grow in full sun." (Summary section)
- **Caveat:** Published outside a peer-reviewed journal.

#### `usu-2020-lemongrass`

Linse, Terra; Drost, Dan. (2020). *How to Grow Lemongrass in Your Garden*. Utah State University Extension

- URL: <https://extension.usu.edu/yardandgarden/research/lemongrass-in-the-garden>
- Archived: <https://web.archive.org/web/20260216232751/https://extension.usu.edu/yardandgarden/research/lemongrass-in-the-garden>
- Verification: URL-verified | Access: public-domain, evidence tier **C**
- Backs:
  - lemongrass yearsToFirstHarvest
    - "Lemongrass grows slowly until the heat of summer arrives, then it increases in size dramatically. Typically plants will produce several harvestable stalks by the end of the summer." (“Plants” section (Planting and Spacing))
  - lemongrass harvestSeason
    - "In cooler areas of Utah, harvesting occurs at the end of the growing season just before the first fall frost. However, lemongrass can be harvested at any time, once the plant stalks have reached ½ inch thick." (“How to Harvest and Store Lemongrass” section)
- **Caveat:** Published outside a peer-reviewed journal.

#### `usu-extension-2020-almonds-home-garden`

Roper, Teryl R.; Heflebower, Rick. (2020). *How to Grow Almonds in Your Garden*. Utah State University Extension

- URL: <https://extension.usu.edu/yardandgarden/research/almonds-in-the-home-garden>
- Archived: <https://web.archive.org/web/20260711173554/https://extension.usu.edu/yardandgarden/research/almonds-in-the-home-garden>
- Verification: URL-verified | Access: public-domain, evidence tier **C**
- Backs:
  - almond spacing
    - "Almond trees grow quite large, and at maturity will occupy a space roughly 20 x 20 feet (10-12 foot radius from the trunk)." (USU Extension, "How to Grow Almonds in Your Garden", "Almond Tree Site Preparation" section)
  - almond width
    - "Almond trees grow quite large, and at maturity will occupy a space roughly 20 x 20 feet (10-12 foot radius from the trunk)." (USU Extension, "How to Grow Almonds in Your Garden", "Almond Tree Site Preparation" section)
  - almond yearsToFirstHarvest
    - "Almond trees, like all fruit trees, must mature before they will flower and produce nuts. Further, it is a desirable management practice to remove the flowers or immature fruit for the first 1 to 2 years after planting to allow the tree to grow without a crop. Don’t expect to harvest nuts for 4 to 6" (USU Extension, "Why Almond Trees Fail to Bear" > "Tree age" section)
  - almond harvestSeason
    - "This is a premier cultivar in California. It blooms approximately the 3rd week in February in California’s central valley; matures at the end of August." (USU Extension, "Almond Cultivar and Rootstock Selection" > "Nonpareil" section)
  - almond coldLimit
    - "Temperatures below -10° F may damage the fruit buds during the winter, and temperatures below -20° F will damage the woody stems and branches of almond trees." (USU Extension, "Why Almond Trees Fail to Bear" > "Winter injury" section)
  - almond light
    - "Select a location that will receive full sun for at least ¾ of the day." (USU Extension, "Almond Tree Site Preparation" section)
- **Caveat:** Published outside a peer-reviewed journal.

#### `usu-extension-2020-watercress`

Kendrick, Trudy; Drost, Dan. (2020). *How to Grow Watercress in Your Garden (HG/Garden/2008-03pr, "Watercress in the Garden")*. Utah State University Extension

- URL: <https://extension.usu.edu/yardandgarden/research/watercress-in-the-garden>
- Archived: <https://web.archive.org/web/20260218053326/https://extension.usu.edu/yardandgarden/research/watercress-in-the-garden>
- Verification: URL-verified | Access: public-domain, evidence tier **C**
- Backs:
  - harvest timing for watercress
    - "Harvest dime sized dark green leaves at any time during the year. [...] Watercress can be harvested year round" ("How to Harvest and Store Watercress" section, p.2)
- **Caveat:** Published outside a peer-reviewed journal. Its dates are calibrated to Utah, and this app places them at the same point in each garden's own frost-free season. The source says watercress is picked year round, longer than the frost-free season this app uses.

#### `usu-extension-2023-comfrey`

Rolfe, Emmalee; Drost, Dan. (2023). *Comfrey in the Garden*. Utah State University Extension

- URL: <https://extension.usu.edu/yardandgarden/research/comfrey-in-the-garden>
- Archived: <https://web.archive.org/web/20260728170851/https://extension.usu.edu/yardandgarden/research/comfrey-in-the-garden>
- Verification: URL-verified | Access: public-domain, evidence tier **C**
- Backs:
  - harvest timing for comfrey
    - "Once established, harvest leaves every 2 weeks throughout the growing season" ("Harvest and Storage > Fresh" section, p.2)
- **Caveat:** Published outside a peer-reviewed journal. Its dates are calibrated to Utah, and this app places them at the same point in each garden's own frost-free season.

#### `usu-extension-preserve-cherries`

Utah State University Extension, Preserve the Harvest. (n.d.). *How to Preserve Cherries*. Utah State University Extension

- URL: <https://extension.usu.edu/preserve-the-harvest/research/cherries>
- Archived: <https://web.archive.org/web/20260624191608/https://extension.usu.edu/preserve-the-harvest/research/cherries>
- Verification: URL-verified | Access: public-domain, evidence tier **C**
- Backs:
  - harvest timing for cherry-sweet
    - "From Box Elder County south to Salt Lake County, sweet cherries ripen around June 10 to the 25" (Season Availability section)
- **Caveat:** Published outside a peer-reviewed journal. Its dates are calibrated to Utah from Box Elder County south to Salt Lake County, and this app places them at the same point in each garden's own frost-free season. Sweet cherry dates come from a food preservation page giving the northern Utah season, June 10 to 25.

#### `usu-extension-treebrowser-pistachio`

Utah State University Extension, TreeBrowser. (n.d.). *Pistachio (Pistacia vera), TreeBrowser*. Utah State University Extension

- URL: <https://extension.usu.edu/treebrowser/catalog/pistachio>
- Verification: URL-verified | Access: public-domain, evidence tier **C**
- Backs:
  - pistachio light
    - "Prefers full sun and well-drained soils." (Utah State University Extension TreeBrowser, Pistachio (Pistacia vera) page, General description)
- **Caveat:** Published outside a peer-reviewed journal.

#### `uvah-coaker1984-mixed-cropping`

Uvah, I. I. I.; Coaker, T. H. (1984). *Effect of mixed cropping on some insect pests of carrots and onions*. Entomologia Experimentalis et Applicata 36: 159-167

- DOI: [10.1111/j.1570-7458.1984.tb03422.x](https://doi.org/10.1111/j.1570-7458.1984.tb03422.x)
- Verification: Crossref-verified | Access: paywalled, evidence tier **A**
- Backs:
  - onions selected specifically for pungency failed to deter insects from landing on host plants
  - second independent contradiction of the 'aromatic herbs repel pests' folklore

#### `uwextension-honeyberries`

University of Wisconsin-Madison Division of Extension, Crops and Soils. (n.d.). *Honeyberries (crop profile)*. University of Wisconsin-Madison Division of Extension

- URL: <https://cropsandsoils.extension.wisc.edu/honeyberries/>
- Archived: <https://web.archive.org/web/20260306024423/https://cropsandsoils.extension.wisc.edu/honeyberries/>
- Verification: URL-verified | Access: public-domain, evidence tier **C**
- Backs:
  - haskap yearsToFirstHarvest
    - "Plants will begin bearing a few fruit in years one and two, but three to four years are required for large quantities." (UW-Madison Division of Extension, Honeyberries crop profile, first body paragraph)
  - haskap coldLimit
    - "Plants are extremely cold hardy and can be grown in USDA zones 1-8." (UW-Madison Division of Extension, Honeyberries crop profile, first body paragraph)
- **Caveat:** Published outside a peer-reviewed journal.

#### `uwmadison-2013-uncommon-fruit-mulberry`

University of Wisconsin-Madison, Uncommon Fruit. (2013). *Mulberry (Morus ssp), Uncommon Fruit: Observations from Carandale Farm*. University of Wisconsin-Madison

- URL: <https://uncommonfruit.cias.wisc.edu/mulberry/>
- Archived: <https://web.archive.org/web/20261017214509/https://uncommonfruit.cias.wisc.edu/mulberry/>
- Verification: URL-verified | Access: public-domain, evidence tier **C**
- Backs:
  - mulberry-black coldLimit
    - "The black mulberry, which is a small tree that lives longer, is said to have the best quality fruit, is the least winter hardy and will not tolerate temperatures below zero (Zone 7)." (UW-Madison Uncommon Fruit, Mulberry page, History and background paragraph)
- **Caveat:** Published outside a peer-reviewed journal.

#### `uwmadison-extension-catnip`

Mahr, Susan. (2026). *Catnip, Nepeta cataria*. University of Wisconsin-Madison Division of Extension, Wisconsin Horticulture

- URL: <https://hort.extension.wisc.edu/articles/catnip-nepeta-cataria/>
- Archived: <https://web.archive.org/web/20261006164935/https://hort.extension.wisc.edu/articles/catnip-nepeta-cataria/>
- Verification: URL-verified | Access: public-domain, evidence tier **C**
- Backs:
  - catnip height
    - "Plants can grow up to 3 feet tall and wide under ideal conditions, and may form colonies from the short rhizomes." (Section 'Overview', the paragraph that begins 'Plants die back to the ground in the winter')
  - catnip width
    - "Plants can grow up to 3 feet tall and wide under ideal conditions, and may form colonies from the short rhizomes." (Section 'Overview', the paragraph that begins 'Plants die back to the ground in the winter')
  - catnip coldLimit
    - "Catnip is a vigorous and weedy herbaceous perennial native to Eurasia in the mint family (Lamiaceae) that is hardy in zones 3a to 9b." (Section 'Overview', first full paragraph after the one-line summary)
- **Caveat:** Published outside a peer-reviewed journal.

#### `uwmadison-extension-dandelion`

Mahr, Susan. (2026). *Dandelion, Taraxacum officinale*. University of Wisconsin-Madison Division of Extension, Wisconsin Horticulture

- URL: <https://hort.extension.wisc.edu/articles/dandelion-taraxacum-officinale/>
- Archived: <https://web.archive.org/web/20260222170106/https://hort.extension.wisc.edu/articles/dandelion-taraxacum-officinale/>
- Verification: URL-verified | Access: public-domain, evidence tier **C**
- Backs:
  - dandelion spacing
    - "Space the plants six to nine inches apart in rows twelve inches apart." (Section 'Growing Dandelion')
  - dandelion daysToMaturity
    - "Your crop should be ready in 85 to 95 days." (Section 'Growing Dandelion')
  - dandelion coldLimit
    - "They withstand frost and freezes and tolerate crowding." (Section 'Overview', paragraph on growth habit)
- **Caveat:** Published outside a peer-reviewed journal.

#### `uwmadison-extension-mahr-garlic-chives`

Mahr, Susan. (n.d.). *Garlic Chives, Allium tuberosum*. University of Wisconsin-Madison Division of Extension, Wisconsin Horticulture

- URL: <https://hort.extension.wisc.edu/articles/garlic-chives-allium-tuberosum/>
- Archived: <https://web.archive.org/web/20261006165125/https://hort.extension.wisc.edu/articles/garlic-chives-allium-tuberosum/>
- Verification: URL-verified | Access: public-domain, evidence tier **C**
- Backs:
  - garlic-chives harvestSeason
    - "Leaves can be harvested to eat anytime they are green." (Second paragraph of the article)
  - garlic-chives invasiveStatus
    - "This plant can be invasive under some conditions, so should be planted with care." (Paragraph after the photo caption Garlic chives coming up in spring)
- **Caveat:** Published outside a peer-reviewed journal.

#### `vaishnavi-2020-garden-cress-botanical-description`

Vaishnavi; Gupta, Radhna; Choudhary, Preeti. (2020). *Botanical description of garden cress (Lepidium sativum L.) plant and physical characteristics of its seeds*. Journal of Pharmacognosy and Phytochemistry 9: 2424-2428

- URL: <https://www.phytojournal.com/archives/2020/vol9issue5/PartAH/9-5-426-683.pdf>
- Archived: <https://web.archive.org/web/20250514151846/https://www.phytojournal.com/archives/2020/vol9issue5/PartAH/9-5-426-683.pdf>
- Verification: URL-verified | Access: public-domain, evidence tier **C**
- Backs:
  - cress height
    - "The plants that grew were erect, glabrous and grew up to an average height of 50cm." (Page 2426, Botanical description of garden cress plant (Table 4 on page 2427 gives Height 47-50cm))
- **Caveat:** Read in full for the sentences quoted. The catalog row comments say which figure each sentence gives.

#### `vce-2015-tree-fruit-home-garden`

Yuan, Rongcai. (2015). *Tree Fruit in the Home Garden (Publication 426-841)*. Virginia Cooperative Extension, Virginia Tech

- URL: <https://www.pubs.ext.vt.edu/426/426-841/426-841.html>
- Archived: <https://web.archive.org/web/20260714002628/https://www.pubs.ext.vt.edu/426/426-841/426-841.html>
- Verification: URL-verified | Access: public-domain, evidence tier **C**
- Backs:
  - quince spacing
    - "Quince 15 1 5-6 30-40" (Virginia Cooperative Extension 426-841, Table 1 (Space requirement, yield, bearing age, and life expectancy of tree frui))
  - quince yearsToFirstHarvest
    - "Quince 15 1 5-6 30-40" (Virginia Cooperative Extension 426-841, Table 1, row Quince, column Bearing Age (years))
- **Caveat:** Published outside a peer-reviewed journal.

#### `vce-2024-herb-culture-and-use`

Appling, Ashley; Latimer, Joyce. (2024). *Herb Culture and Use*. Virginia Cooperative Extension (publication 426-420)

- URL: <https://www.pubs.ext.vt.edu/content/dam/pubs_ext_vt_edu/426/426-420/426-420.pdf>
- Archived: <https://web.archive.org/web/20261017212157/https://www.pubs.ext.vt.edu/content/dam/pubs_ext_vt_edu/426/426-420/426-420.pdf>
- Verification: URL-verified | Access: public-domain, evidence tier **C**
- Backs:
  - chamomile spacing
    - "Chamomile, German chamomile Matricaria recutita 8-24” 6-12” Grow from seed. Prefers a sandy, well-drained soil with a pH of 7.0-7.5 and lots of sun. Blooms in early to midsummer. Self seeds." ("Herb Culture and Use" table, Annuals section, row for Chamomile/German chamomile (Matricaria recutita): Height and Plan)
- **Caveat:** Published outside a peer-reviewed journal.

#### `walters2018-basil-species-dli`

Walters, Kellie J.; Currey, Christopher J. (2018). *Effects of Nutrient Solution Concentration and Daily Light Integral on Growth and Nutrient Concentration of Several Basil Species in Hydroponic Production*. HortScience 53: 1319-1325

- DOI: [10.21273/HORTSCI13126-18](https://doi.org/10.21273/HORTSCI13126-18)
- Verification: Crossref-verified | Access: open-access, evidence tier **A**
- Backs:
  - sweet basil under a high DLI of about 15 mol/m2/d against a low DLI of 7 or less
    - "Fresh and dry weight, height, and node number increased by 144%, 178%, 20%, and 18%, respectively, compared with plants grown under the low DLI, and branching was also stimulated" (the abstract)
  - DLI had little effect on tissue nutrient concentration, where nutrient solution concentration did
- **Caveat:** This entry rests on the abstract and the Crossref record. It's a greenhouse hydroponic trial of several basil species, and its two DLI levels bracket the response and fix no threshold.

#### `weston2013-sorghum-allelopathy`

Weston, Leslie A.; Alsaadawi, Ibrahim S.; Baerson, Scott R. (2013). *Sorghum Allelopathy-From Ecosystem to Molecule*. Journal of Chemical Ecology 39: 142-153

- DOI: [10.1007/s10886-013-0245-8](https://doi.org/10.1007/s10886-013-0245-8)
- Verification: Crossref-verified | Access: paywalled, evidence tier **B**
- Backs:
  - RESIDUE WEED SUPPRESSION: phytotoxicity has been reported when sorghum was incorporated into the soil as a green manure, when residues remained on the soil surface in reduced tillage settings, and when sorghum was cultivated as a crop
  - sorghum allelopathy has been reported in a series of field experiments in diverse locations and with various sorghum plant parts
  - the allelochemical suite: numerous phenolics, the cyanogenic glycoside dhurrin, and the hydrophobic p-benzoquinone sorgoleone, isolated from shoots, roots and root exudates
  - sorgoleone is released continuously by living root hairs and accumulates in significant concentrations around the roots
  - allelochemical content varies with plant part, plant age and cultivar, and sorgoleone production is influenced by both genetics and environment
  - the authors' framing of sorghum cover crops as suppressing germinating weed seedlings in a manner similar to a soil-applied preemergent herbicide such as trifluralin
- **Caveat:** It's a review and isn't a trial. Springer paywalls the full text, and this entry rests on the abstract and the Crossref record. The mechanism is well characterized, but the field outcome varies by cultivar, plant part and age, which the review states directly. The abstract quotes no effect size, no percentage weed reduction and no garden-scale trial. This entry supports the existence and mechanism of sorghum residue weed suppression and gives no magnitude. The herbicide analogy cuts both ways: allelopathy that suppresses germinating weeds also suppresses germinating vegetable seed. So the paper can't back a rule that lacks a planting-interval precondition.

#### `wilson1988-ireta-yams`

Wilson, Jill E. (1988). *Rapid Multiplication of Yams (Dioscorea spp.)*. University of the South Pacific Institute for Research, Extension and Training in Agriculture; hosted by the University of Hawaii CTAHR ADAP archive IRETA Publication No. 3/88, Agdex 175-40

- URL: <https://www3.ctahr.hawaii.edu/adap/Publications/Ireta_pubs/rapidyams.pdf>
- Archived: <https://web.archive.org/web/20260902005245/https://www3.ctahr.hawaii.edu/adap/Publications/Ireta_pubs/rapidyams.pdf>
- Verification: URL-verified | Access: open-access
- Backs:
  - staking
    - "Stakes 1 to 2 m high are adequate" (p. 9)
  - spacing of minisetts and of ware yams grown from 500 g setts, in the worked example
    - "Plant the mini-setts at a spacing of 1 x 0.25 m or 1 x 0.5 m" (p. 9)
    - "at a spacing of 100 x 25 cm" (p. 5)
- **Caveat:** A seed-yam multiplication guide, so its spacings are for producing planting setts. It gives no months-to-harvest or temperature figures, which the catalog takes from ECOCROP.

#### `wisniewski-harasym-2024-chinese-artichoke`

Wiśniewski, Rafał; Harasym, Joanna. (2024). *Chinese Artichoke (Stachys affinis Bunge): The Nutritional Profile, Bioactive Profile and Food Applications - A Review*. Molecules 29(15):3525 (MDPI)

- URL: <https://pmc.ncbi.nlm.nih.gov/articles/PMC11314557/>
- Archived: <https://web.archive.org/web/20261017215243/https://pmc.ncbi.nlm.nih.gov/articles/PMC11314557/>
- Verification: URL-verified | Access: public-domain, evidence tier **C**
- Backs:
  - crosne light
    - "They prefer well-drained soil in a sunny location and thrive best in ordinary garden soil that is not too heavy." (Section 2, Botanical Characteristics, cultivation paragraph that begins 'Chinese artichokes grow up to 45 cm in height')
- **Caveat:** Read in full for the sentences quoted. The catalog row comments say which figure each sentence gives.

#### `wsu-2000-strik-growing-kiwifruit`

Strik, Bernadine; Cahn, Helen. (2000). *Growing Kiwifruit (PNW 507)*. Pacific Northwest Extension (Oregon State University / Washington State University / University of Idaho)

- URL: <https://content.libraries.wsu.edu/index.php/utils/getfile/collection/cahnrs-arch/id/499/filename/96136182432004_pnw507.pdf>
- Archived: <https://web.archive.org/web/20260421004022/http://content.libraries.wsu.edu/index.php/utils/getfile/collection/cahnrs-arch/id/499/filename/96136182432004_pnw507.pdf>
- Verification: URL-verified | Access: public-domain, evidence tier **C**
- Backs:
  - kiwifruit yearsToFirstHarvest
    - "It takes 3 or more years after planting to produce a commercial crop." ("Vineyard Planning, Planting, and Spacing" section, p. 6)
- **Caveat:** Published outside a peer-reviewed journal.

#### `wsu-2006-growing-marketing-lavender`

Beus, Curtis E. (2006). *Growing and Marketing Lavender (EB2005, Farming the Northwest series)*. Washington State University Extension

- URL: <https://wpcdn.web.wsu.edu/wp-ecommerce/uploads/sites/2/woocommerce_uploads/EB2005-epq142.pdf>
- Archived: <https://web.archive.org/web/20260913202108/https://wpcdn.web.wsu.edu/wp-ecommerce/uploads/sites/2/woocommerce_uploads/EB2005-epq142.pdf>
- Verification: URL-verified | Access: public-domain, evidence tier **C**
- Backs:
  - lavender coldLimit
    - "Lavandula angustifolia are the hardiest of lavenders, and can survive winter temperatures of -15°C (5°F), or even colder if they are grown in well-drained soils. [...] Lavandula angustifolia varieties tend to be the hardiest lavenders, and can typically be grown in USDA Hardiness Zones 5 and above." (“Lavandula angustifolia” section (p.2) and “Climate” section (p.3))
- **Caveat:** Published outside a peer-reviewed journal.

#### `yousefi2024-biocontrol`

Yousefi, Mahsa; Marja, Roland; Barmettler, Erika; Six, Johan. (2024). *The effectiveness of intercropping and agri-environmental schemes on ecosystem service of biological pest control: a meta-analysis*. Agronomy for Sustainable Development 44

- DOI: [10.1007/s13593-024-00947-7](https://doi.org/10.1007/s13593-024-00947-7)
- Verification: Crossref-verified | Access: open-access, evidence tier **A**
- Backs:
  - effect sizes for insectary strips and intercropping on biological pest control
  - Grade A for natural-enemy abundance, Grade B for realized pest suppression

#### `yu2015-temporal-niche-ler`

Yu, Yang; Stomph, Tjeerd-Jan; Makowski, David; van der Werf, Wopke. (2015). *Temporal niche differentiation increases the land equivalent ratio of annual intercrops: A meta-analysis*. Field Crops Research 184: 133-144

- DOI: [10.1016/j.fcr.2015.09.010](https://doi.org/10.1016/j.fcr.2015.09.010)
- Verification: Crossref-verified | Access: paywalled, evidence tier **A**
- Backs:
  - average intercrop land equivalent ratio 1.22 +/- 0.02, and no difference between the 50 most-cited studies and a random literature sample
  - LER rises with temporal niche differentiation, the mechanistic basis for relay and succession scoring
  - temporal niche differentiation contributes substantially to high LER in C3/C4 mixtures but not in C3-only mixtures
  - second independent LER meta-analysis supporting Grade A for intercropping

#### `zhang-2022-tea-shade-nets-mississippi`

Zhang, Qianwen; Bi, Guihong; Li, Tongyin; Wang, Qiushuang; Xing, Zhiheng; LeCompte, Judson; Harkess, Richard L. (2022). *Color Shade Nets Affect Plant Growth and Seasonal Leaf Quality of Camellia sinensis Grown in Mississippi, the United States*. Frontiers in Nutrition

- URL: <https://pmc.ncbi.nlm.nih.gov/articles/PMC8847693/>
- Archived: <https://web.archive.org/web/20261017212924/https://pmc.ncbi.nlm.nih.gov/articles/PMC8847693/>
- Verification: URL-verified | Access: public-domain, evidence tier **C**
- Backs:
  - tea spacing
    - "Plants were planted in three double row hedges, with 0.76 m between plants within a row, 0.91 m between inner rows, and 1.83 m between double rows." (Materials and Methods)
  - tea harvestSeason
    - "Fresh tea leaf samples containing one terminal bud and two leaves were collected in spring, summer, and fall in 2018 (on 10 April, 12 July, and 18 October, respectively)." (Materials and Methods)
- **Caveat:** Read in full for the sentences quoted. The catalog row comments say which figure each sentence gives.

#### `zhang2014-three-sisters-roots`

Zhang, Chaochun; Postma, Johannes A.; York, Larry M.; Lynch, Jonathan P. (2014). *Root foraging elicits niche complementarity-dependent yield advantage in the ancient 'three sisters' (maize/bean/squash) polyculture*. Annals of Botany 114: 1719-1733

- DOI: [10.1093/aob/mcu191](https://doi.org/10.1093/aob/mcu191)
- Verification: Crossref-verified | Access: paywalled, evidence tier **B**
- Backs:
  - root-architecture niche complementarity as the mechanism behind the Three Sisters yield advantage
  - root-depth stratification as a layout design rule

#### `ziegler1963-comptonia-nitrogen`

Ziegler, H.; Hüser, R. (1963). *Fixation of Atmospheric Nitrogen by Root Nodules of Comptonia peregrina*. Nature 199: 508

- DOI: [10.1038/199508a0](https://doi.org/10.1038/199508a0)
- Verification: Crossref-verified | Access: paywalled, evidence tier **B**
- Backs:
  - Comptonia peregrina root nodules fix atmospheric nitrogen
- **Caveat:** It establishes the trait only. It measures fixation in the nodule and says nothing about transfer of that nitrogen to a neighboring plant, so it can't back a companion-planting benefit.

#### `zimmerman2020-ucanr-moringa`

Zimmerman, Cynthia. (2020). *Helpline Hot Topic for June 2020: Moringa Oleifera*. University of California Agriculture and Natural Resources, Master Gardener Program of Fresno County

- URL: <https://ucanr.edu/sites/default/files/2020-07/329403.pdf>
- Archived: <https://web.archive.org/web/20251205094334/https://ucanr.edu/sites/default/files/2020-07/329403.pdf>
- Verification: URL-verified | Access: public-domain
- Backs:
  - moringa height
    - "it grows from 9 to 16 feet per year if left uncropped. A fully mature tree can reach a height of 35 feet but can be cut back to 3-4 feet high" (p. 2)
  - moringa coldLimit
    - "will die if it freezes completely, but can handle mild frost" (p. 1)
  - moringa rainfall
    - "rainfall is limited to between 9 to 60 inches" (p. 1)
- **Caveat:** A Master Gardener helpline note, compiled from secondary sources for the Fresno area.

## Climate & geodata

24 sources.

#### `beck2018-koppen`

Beck, Hylke E.; Zimmermann, Niklaus E.; McVicar, Tim R.; Vergopolan, Noemi; Berg, Alexis; Wood, Eric F. (2018). *Present and future Köppen-Geiger climate classification maps at 1-km resolution*. Scientific Data 5: 180214

- DOI: [10.1038/sdata.2018.214](https://doi.org/10.1038/sdata.2018.214)
- Verification: Crossref-verified | Access: open-access
- Backs:
  - decision 9: the bundled 1 km Köppen-Geiger raster used for climate context

#### `best1950-raindrop-size-distribution`

Best, A. C. (1950). *The size distribution of raindrops*. Quarterly Journal of the Royal Meteorological Society 76: 16-36

- DOI: [10.1002/qj.49707632704](https://doi.org/10.1002/qj.49707632704)
- Verification: Crossref-verified | Access: paywalled, evidence tier **A**
- Backs:
  - Eq. 1 (as Elamri et al. 2018 Eq. 3): the share of the liquid water in the air carried by drops smaller than D follows 1 - exp(-(D / a)^2.25) with a = 1.30 I^0.232 mm for a rain rate I in mm/h, so the median drop of the air's water is 1.1 mm across at 1 mm/h and 2.2 mm at 20 mm/h
  - because that distribution is per volume of air, the rain field weights each size by its own fall speed to get the rain reaching the ground, and splits that into three equal thirds, each carrying its third's own mean fall speed
- **Caveat:** The form and its coefficients come from Best's own abstract and from Elamri et al. 2018's Eq. 3, which prints it with a D/1000 where its own D is in meters. The full paper hasn't been read. Best warns of 'appreciable variations from these mean values, particularly in the case of n, if the precipitation is essentially of a showery or orographic nature'.

#### `blocken-carmeliet2004-wdr-review`

Blocken, Bert; Carmeliet, Jan. (2004). *A review of wind-driven rain research in building science*. Journal of Wind Engineering and Industrial Aerodynamics 92: 1079-1130

- DOI: [10.1016/j.jweia.2004.06.003](https://doi.org/10.1016/j.jweia.2004.06.003)
- Verification: Crossref-verified | Access: paywalled, evidence tier **B**
- Backs:
  - the rain a horizontal surface receives carries its own drop-size distribution, "the rainfall intensity and raindrop size distribution falling through a horizontal plane in the undisturbed flow field", which is why the rain field weights Best's air-content distribution by each size's fall speed before splitting the rain into thirds
  - Eq. 5: Lacy's wind-driven rain relation, R = 0.222 U R^0.88, is the rain's angle from vertical at the median drop of the hour's rate: "the WDR coefficient is the inverse of the raindrop terminal velocity of fall ... 4.5 m/s, corresponding to a raindrop diameter of 1.2 mm", the same rule the rain field's median class follows and the band it is checked against
  - "Appropriate drag coefficients for falling raindrops were measured by Gunn and Kinzer", where sphere formulas underestimate the real ones, which is the basis for reading the fall speed off their table
  - the coefficient 0.222 holds in the free field with no building in the flow, so a body in the wind deflects both the air and the drops: the rain field takes the free-field rain onto the panels and the ground and models no flow around the array
- **Caveat:** Read at source from the authors' preprint of the published review. A review, so its own numbers are Lacy's and its raindrop spectra are Best's

#### `canham1994-canopy-light-transmission`

Canham, Charles D.; Finzi, Adrien C.; Pacala, Stephen W.; Burbank, Diane H. (1994). *Causes and consequences of resource heterogeneity in forests: interspecific variation in light transmission by canopy trees*. Canadian Journal of Forest Research 24: 337-349

- DOI: [10.1139/x94-046](https://doi.org/10.1139/x94-046)
- Verification: Crossref-verified | Access: paywalled, evidence tier **B**
- Backs:
  - the forest-canopy comparison named in Decision Record 26
    - "The most shade-tolerant species (Fagus grandifolia Ehrh. and Tsuga canadensis (L.) Carr.) cast the deepest shade (<2% of full sun), while earlier successional species such as Quercus rubra L. and Fraxinus americana L. allowed greater light penetration (>5% full sun)" (the abstract)
- **Caveat:** The paper measures closed-canopy interior light by fisheye photography and quantum sensors, under overlapping crowns in a southern New England oak-northern hardwood forest. That's a different quantity from a single isolated urban tree's crown transmittance. This entry serves only as the closed-canopy comparison that Decision Record 26 names. Its light is lower than a lone tree's transmittance, as expected, and this app's default doesn't come from it. The journal version of record is paywalled. The copy the Canham lab self-archives at sortie-nd.org is a scanned PDF with no text layer, so this entry rests on OCR of that scan.

#### `erez1990-dynamic-model`

Erez, A.; Fishman, S.; Linsley-Noakes, G. C.; Allan, P. (1990). *The dynamic model for rest completion in peach buds*. Acta Horticulturae 165-174

- DOI: [10.17660/ActaHortic.1990.276.18](https://doi.org/10.17660/ActaHortic.1990.276.18)
- Verification: Crossref-verified | Access: paywalled, evidence tier **A**
- Backs:
  - the constants of the Dynamic chill model: A0, A1, E0, E1, the transition slope and its midpoint temperature
- **Caveat:** Crossref records the title in capitals and Acta Horticulturae 276 as an issue with no volume.

#### `fishman1987-dormancy-math`

Fishman, Svetlana; Erez, Amos; Couvillon, G. A. (1987). *The temperature dependence of dormancy breaking in plants: Mathematical analysis of a two-step model involving a cooperative transition*. Journal of Theoretical Biology 124: 473-483

- DOI: [10.1016/S0022-5193(87)80221-7](https://doi.org/10.1016/S0022-5193(87)80221-7)
- Verification: Crossref-verified | Access: paywalled, evidence tier **A**
- Backs:
  - the Dynamic chill model (chill portions) formulation

#### `fishman1987-dormancy-sim`

Fishman, Svetlana; Erez, Amos; Couvillon, G. A. (1987). *The temperature dependence of dormancy breaking in plants: Computer simulation of processes studied under controlled temperatures*. Journal of Theoretical Biology 126: 309-321

- DOI: [10.1016/S0022-5193(87)80237-0](https://doi.org/10.1016/S0022-5193(87)80237-0)
- Verification: Crossref-verified | Access: paywalled, evidence tier **A**
- Backs:
  - the simulation companion to the Dynamic chill model

#### `gunn-kinzer1949-terminal-velocity`

Gunn, Ross; Kinzer, Gilbert D. (1949). *The terminal velocity of fall for water droplets in stagnant air*. Journal of Meteorology 6: 243-248

- DOI: [10.1175/1520-0469(1949)006<0243:TTVOFF>2.0.CO;2](https://doi.org/10.1175/1520-0469(1949)006<0243:TTVOFF>2.0.CO;2)
- Verification: Crossref-verified | Access: open-access, evidence tier **A**
- Backs:
  - Table 2 (p. 246), the fall speed of a water drop in still air by its equivalent diameter, the rain field's lookup: 0.5 mm 2.06 m/s, 1.0 mm 4.03, 1.5 mm 5.41 (between the 1.4 and 1.6 mm rows), 2.0 mm 6.49, 3.0 mm 8.06, 3.8 mm 8.72, 4.0 mm 8.83, 5.8 mm 9.17
  - the largest drops "reached their terminal velocity after falling about 12 meters", so a drip leaving a garden-height panel edge is still accelerating when it lands, which is why the drift of a drip is integrated from rest under drag and never taken at terminal speed
  - Table 2's drag coefficient column, 0.544 at 3.8 mm and a Reynolds number of 2211, is the measured coefficient a drip's quadratic drag is matched to when the rain field integrates its fall
- **Caveat:** Read at source from the scanned PDF. The by-diameter speeds are Table 2, where Table 1 of the same paper is indexed by the drop's log mass. The speeds hold at 760 mm, 20 C and 50 percent humidity, and a drop in rain arrives at its terminal speed where a drip leaves the edge from rest

#### `heisler1986-single-tree-irradiance`

Heisler, Gordon M. (1986). *Effects of individual trees on the solar radiation climate of small buildings*. Urban Ecology 9: 337-359

- DOI: [10.1016/0304-4009(86)90008-2](https://doi.org/10.1016/0304-4009(86)90008-2)
- Verification: Crossref-verified | Access: public-domain, evidence tier **B**
- Backs:
  - a corroborating figure for the tree-crown transmittance default, implying roughly 0.20 in-leaf and 0.60 leafless transmittance, read here as a cross-check on the Konarska et al. 2014 crown-transmittance range and never as the shipped default
    - "a mid-sized sugar maple tree (Acer saccharum Marsh.) reduced irradiance in its shade on a south-facing wall by about 80% when in leaf, and by nearly 40% when leafless" (p. 337, the abstract)
- **Caveat:** A USDA Forest Service work, public domain by 17 U.S.C. 105. This entry rests on the agency's own reprint and doesn't use the Elsevier version of record. The paper measures irradiance reduction on a vertical wall inside a tree's shadow: beam plus diffuse sky and crown-reflected radiation reaching a receiver. It doesn't measure transmittance straight through the crown, so its reductions read smaller than those from Konarska's direct-under-crown method. The paper's own Table II clear-day wall average across four sample trees is a 30-34% reduction leafless and 65-85% in-leaf. It backs a cross-check figure only, and this app's default doesn't rest on it.

#### `jolly2005-growing-season-index`

Jolly, William M.; Nemani, Ramakrishna; Running, Steven W. (2005). *A generalized, bioclimatic index to predict foliar phenology in response to climate*. Global Change Biology 11: 619-632

- DOI: [10.1111/j.1365-2486.2005.00930.x](https://doi.org/10.1111/j.1365-2486.2005.00930.x)
- Verification: Crossref-verified | Access: paywalled, evidence tier **B**
- Backs:
  - the three daily indicators, minimum temperature, vapor pressure deficit and day length, and their combination as a product, that a drawn deciduous tree's leaf-on months are read against
    - "We selected as variables: daylength (photoperiod), evaporative demand (vapor pressure deficit), and suboptimal (minimum) temperatures [...] A combined Growing Season Index (GSI) was derived as the product of the three indices" (the abstract)
- **Caveat:** Ten-day mean GSI values agreed with satellite greenness at nine sites, r>0.8 at eight of them, and matched field-observed leaf flush and coloration at Harvard Forest within 3 and 2 days. The app reads a drawn tree of unknown species against the same three thresholds, by calendar month from the site's typical year, where the paper works from its own ten-day means.

#### `konarska2014-urban-tree-transmissivity`

Konarska, Janina; Lindberg, Fredrik; Larsson, Annika; Thorsson, Sofia; Holmer, Björn. (2014). *Transmissivity of solar radiation through crowns of single urban trees - application for outdoor thermal comfort modelling*. Theoretical and Applied Climatology 117: 363-376

- DOI: [10.1007/s00704-013-1000-3](https://doi.org/10.1007/s00704-013-1000-3)
- Verification: Crossref-verified | Access: paywalled, evidence tier **B**
- Backs:
  - the in-leaf crown transmittance of 0.033 used as the default for a drawn tree's crown, the midpoint of the paper's own range
    - "Average transmissivity of direct solar radiation through the foliated and defoliated tree crowns ranged from 1.3 to 5.3 % and from 40.2 to 51.9 %, respectively" (the abstract)
  - the leafless crown transmittance of 0.46 used as the default for a drawn tree's crown, the midpoint of the defoliated range in the same sentence
- **Caveat:** Transmissivity was measured with a pyranometer beneath the live crown against a rooftop reference, on five street trees (one conifer, four deciduous) in Göteborg, Sweden, over nine clear days. The figure is direct-beam transmissivity only. This app applies one transmittance to beam, diffuse and sky-view alike through a solid box crown, with none of a real crown's gaps. This app's default is the midpoint of the paper's own range and isn't a single measured mean. The underlying species are far north of most of this app's users.

#### `luedeling2010-chill-comparability`

Luedeling, Eike; Brown, Patrick H. (2010). *A global analysis of the comparability of winter chill models for fruit and nut trees*. International Journal of Biometeorology 55: 411-421

- DOI: [10.1007/s00484-010-0352-y](https://doi.org/10.1007/s00484-010-0352-y)
- Verification: Crossref-verified | Access: paywalled, evidence tier **A**
- Backs:
  - Chilling Hours, Utah Chill Units and Dynamic Chill Portions are NOT interconvertible
  - the CH/CP ratio spans roughly 0-34 across global climates
  - decision 10: compute all three chill metrics separately
- **Caveat:** Crossref records 2010. Volume 55 is the 2011 issue year.

#### `mckenney2001-canada-zones`

McKenney, Daniel W.; Hutchinson, Michael F.; Kesteven, Jennifer L.; Venier, Lisa A. (2001). *Canada's plant hardiness zones revisited using modern climate interpolation techniques*. Canadian Journal of Plant Science 81: 129-143

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
- Archived: <https://web.archive.org/web/20260730010247/https://www.ncei.noaa.gov/products/land-based-station/us-climate-normals>
- Verification: URL-verified | Access: public-domain
- Backs:
  - the exceedance-percentile freeze/frost date product behind the lastSpringFreeze and firstFallFreeze percentile curves
  - element families ann-tmin-prblst-tXXfpNN (date of last spring occurrence), ann-tmin-prbfst-tXXfpNN (date of first fall occurrence) and ann-tmin-prbgsl-tXXfpNN (growing season length)
  - nine percentiles per threshold, 10% through 90% in 10-point steps, read as 'N% probability date of last XXF occurrence or earlier'
  - six temperature thresholds: 16, 20, 24, 28, 32 and 36 degrees F (32 F = 0 C and 28 F = -2.2 C are the two this app's schema uses)
  - station coverage: more than 15,000 US stations with at least precipitation normals, more than 7,300 with temperature normals
  - frost-freeze date probabilities are computed from the first and last 'killing freeze' of the growing season using serially-complete daily minimum temperatures derived from GHCN-Daily
- **Caveat:** It's a government dataset with no DOI, and the DOI field on NCEI's own landing page is an unfilled template placeholder. The dataset is wider than it's often described: it gives 10-90% in 10-point steps at six thresholds. A description of the Normals as dates at the 50, 40, 30, 20 and 10 percent levels covers five percentiles at one threshold. It covers US and US-territory stations only, and no equivalent dataset exists for the rest of the world. Any non-US frost percentile this app renders is therefore an Open-Meteo-derived estimate. Normals carry completeness flags: 'standard' above 80% data availability, 'representative' at 10+ years, and 'provisional' where neighbors can't fill the record. A station-level frost date isn't uniformly reliable.

#### `noaa-ncei-2021-climate-normals-1991-2020`

NOAA National Centers for Environmental Information. (2021). *U.S. Climate Normals 1991-2020: Annual/Seasonal Normals*. National Oceanic and Atmospheric Administration

- URL: <https://www.ncei.noaa.gov/access/services/data/v1?dataset=normals-annualseasonal-1991-2020>
- Verification: URL-verified | Access: public-domain, evidence tier **A**
- Backs:
  - median (50 percent probability) date of the last spring 32 F freeze at Jonesboro, ME (station USC00174183), May 3, field ANN-TMIN-PRBLST-T32FP50
  - median (50 percent probability) date of the last spring 32 F freeze at East Wareham, MA (station USC00192451), Apr 21, field ANN-TMIN-PRBLST-T32FP50
  - median (50 percent probability) date of the last spring 32 F freeze at Asheville Regional Airport, NC (station USW00003812), Apr 9, field ANN-TMIN-PRBLST-T32FP50
  - median (50 percent probability) date of the last spring 32 F freeze at Burlington International Airport, VT (station USW00014742), Apr 29, field ANN-TMIN-PRBLST-T32FP50
  - median (50 percent probability) date of the last spring 32 F freeze at Minneapolis-St Paul Intl AP, MN (station USW00014922), Apr 23, field ANN-TMIN-PRBLST-T32FP50
  - median (50 percent probability) date of the last spring 32 F freeze at Des Moines Intl AP, IA (station USW00014933), Apr 18, field ANN-TMIN-PRBLST-T32FP50
  - median (50 percent probability) date of the last spring 32 F freeze at Bakersfield AP, CA (station USW00023155), Jan 17, field ANN-TMIN-PRBLST-T32FP50
  - median (50 percent probability) date of the last spring 32 F freeze at Salinas Municipal Airport, CA (station USW00023233), Jan 29, field ANN-TMIN-PRBLST-T32FP50
  - median (50 percent probability) date of the last spring 32 F freeze at Salt Lake City Intl AP, UT (station USW00024127), Apr 8, field ANN-TMIN-PRBLST-T32FP50
  - median (50 percent probability) date of the last spring 32 F freeze at Bozeman Gallatin Fld AP, MT (station USW00024132), May 26, field ANN-TMIN-PRBLST-T32FP50
  - median (50 percent probability) date of the last spring 32 F freeze at Eugene-Mahlon Sweet Fld, OR (station USW00024221), Apr 11, field ANN-TMIN-PRBLST-T32FP50
  - median (50 percent probability) date of the last spring 32 F freeze at Salem AP (McNary Field), OR (station USW00024232), Apr 3, field ANN-TMIN-PRBLST-T32FP50
  - median (50 percent probability) date of the last spring 32 F freeze at Frankfort Capital City AP, KY (station USW00053841), Apr 15, field ANN-TMIN-PRBLST-T32FP50
  - median (50 percent probability) date of the last spring 32 F freeze at Baltimore-Washington Intl AP, MD (station USW00093721), Apr 10, field ANN-TMIN-PRBLST-T32FP50
  - median (50 percent probability) date of the last spring 32 F freeze at station USC00368449, 04-20, field ANN-TMIN-PRBLST-T32FP50
  - median (50 percent probability) date of the last spring 32 F freeze at station USC00228374, 03-23, field ANN-TMIN-PRBLST-T32FP50
  - median (50 percent probability) date of the last spring 32 F freeze at station USW00023293, 01-12, field ANN-TMIN-PRBLST-T32FP50
  - median (50 percent probability) date of the last spring 32 F freeze at station USW00012921, 02-26, field ANN-TMIN-PRBLST-T32FP50
  - median (50 percent probability) date of the last spring 32 F freeze at station USW00014827, 04-24, field ANN-TMIN-PRBLST-T32FP50
  - median (50 percent probability) date of the last spring 32 F freeze at station USC00098703, 03-11, field ANN-TMIN-PRBLST-T32FP50
  - median (50 percent probability) date of the last spring 32 F freeze at station USC00351862, 04-17, field ANN-TMIN-PRBLST-T32FP50
  - median (50 percent probability) date of the last spring 32 F freeze at station USW00003945, 04-07, field ANN-TMIN-PRBLST-T32FP50
  - median (50 percent probability) date of the last spring 32 F freeze at station USW00013869, 03-08, field ANN-TMIN-PRBLST-T32FP50
  - median (50 percent probability) date of the last spring 32 F freeze at station USW00093193, 01-14, field ANN-TMIN-PRBLST-T32FP50
  - median (50 percent probability) date of the first fall 32 F freeze at station USC00098703, Nov 19, field ANN-TMIN-PRBFST-T32FP50, which with the last spring freeze gives a 253-day season
  - median (50 percent probability) date of the first fall 32 F freeze at station USC00174183, Oct 9, field ANN-TMIN-PRBFST-T32FP50, which with the last spring freeze gives a 159-day season
  - median (50 percent probability) date of the first fall 32 F freeze at station USC00192451, Oct 24, field ANN-TMIN-PRBFST-T32FP50, which with the last spring freeze gives a 186-day season
  - median (50 percent probability) date of the first fall 32 F freeze at station USC00351862, Oct 28, field ANN-TMIN-PRBFST-T32FP50, which with the last spring freeze gives a 194-day season
  - median (50 percent probability) date of the first fall 32 F freeze at station USC00368449, Oct 26, field ANN-TMIN-PRBFST-T32FP50, which with the last spring freeze gives a 189-day season
  - median (50 percent probability) date of the first fall 32 F freeze at station USW00003812, Oct 28, field ANN-TMIN-PRBFST-T32FP50, which with the last spring freeze gives a 202-day season
  - median (50 percent probability) date of the first fall 32 F freeze at station USW00003945, Oct 29, field ANN-TMIN-PRBFST-T32FP50, which with the last spring freeze gives a 205-day season
  - median (50 percent probability) date of the first fall 32 F freeze at station USW00012921, Nov 28, field ANN-TMIN-PRBFST-T32FP50, which with the last spring freeze gives a 275-day season
  - median (50 percent probability) date of the first fall 32 F freeze at station USW00013869, Nov 21, field ANN-TMIN-PRBFST-T32FP50, which with the last spring freeze gives a 258-day season
  - median (50 percent probability) date of the first fall 32 F freeze at station USW00014742, Oct 15, field ANN-TMIN-PRBFST-T32FP50, which with the last spring freeze gives a 169-day season
  - median (50 percent probability) date of the first fall 32 F freeze at station USW00014827, Oct 21, field ANN-TMIN-PRBFST-T32FP50, which with the last spring freeze gives a 180-day season
  - median (50 percent probability) date of the first fall 32 F freeze at station USW00014922, Oct 18, field ANN-TMIN-PRBFST-T32FP50, which with the last spring freeze gives a 178-day season
  - median (50 percent probability) date of the first fall 32 F freeze at station USW00014933, Oct 20, field ANN-TMIN-PRBFST-T32FP50, which with the last spring freeze gives a 185-day season
  - median (50 percent probability) date of the first fall 32 F freeze at station USW00023155, Dec 15, field ANN-TMIN-PRBFST-T32FP50, which with the last spring freeze gives a 332-day season
  - median (50 percent probability) date of the first fall 32 F freeze at station USW00023233, Dec 10, field ANN-TMIN-PRBFST-T32FP50, which with the last spring freeze gives a 315-day season
  - median (50 percent probability) date of the first fall 32 F freeze at station USW00023293, Dec 22, field ANN-TMIN-PRBFST-T32FP50, which with the last spring freeze gives a 344-day season
  - median (50 percent probability) date of the first fall 32 F freeze at station USW00024127, Oct 31, field ANN-TMIN-PRBFST-T32FP50, which with the last spring freeze gives a 206-day season
  - median (50 percent probability) date of the first fall 32 F freeze at station USW00024132, Sep 16, field ANN-TMIN-PRBFST-T32FP50, which with the last spring freeze gives a 113-day season
  - median (50 percent probability) date of the first fall 32 F freeze at station USW00024221, Oct 23, field ANN-TMIN-PRBFST-T32FP50, which with the last spring freeze gives a 195-day season
  - median (50 percent probability) date of the first fall 32 F freeze at station USW00024232, Nov 1, field ANN-TMIN-PRBFST-T32FP50, which with the last spring freeze gives a 212-day season
  - median (50 percent probability) date of the first fall 32 F freeze at station USW00053841, Oct 24, field ANN-TMIN-PRBFST-T32FP50, which with the last spring freeze gives a 192-day season
  - median (50 percent probability) date of the first fall 32 F freeze at station USW00093193, Dec 14, field ANN-TMIN-PRBFST-T32FP50, which with the last spring freeze gives a 334-day season
  - median (50 percent probability) date of the first fall 32 F freeze at station USW00093721, Oct 31, field ANN-TMIN-PRBFST-T32FP50, which with the last spring freeze gives a 204-day season
  - median (50 percent probability) date of the last spring 32 F freeze at Quincy 3 SSW, FL (station USC00087429), Mar 13, field ANN-TMIN-PRBLST-T32FP50
  - median (50 percent probability) date of the first fall 32 F freeze at station USC00087429, Nov 22, field ANN-TMIN-PRBFST-T32FP50, which with the last spring freeze gives a 254-day season
  - median (50 percent probability) date of the last spring 32 F freeze at Raleigh Durham Intl AP, NC (station USW00013722), Mar 31, field ANN-TMIN-PRBLST-T32FP50
  - median (50 percent probability) date of the first fall 32 F freeze at station USW00013722, Nov 4, field ANN-TMIN-PRBFST-T32FP50, which with the last spring freeze gives a 218-day season
  - median (50 percent probability) date of the last spring 32 F freeze at Macon Middle GA Rgnl AP, GA (station USW00003813), Mar 21, field ANN-TMIN-PRBLST-T32FP50
  - median (50 percent probability) date of the first fall 32 F freeze at station USW00003813, Nov 10, field ANN-TMIN-PRBFST-T32FP50, which with the last spring freeze gives a 234-day season
  - median (50 percent probability) date of the last spring 32 F freeze at Alamogordo, NM (station USC00290199), Mar 9, field ANN-TMIN-PRBLST-T32FP50
  - median (50 percent probability) date of the first fall 32 F freeze at station USC00290199, Nov 18, field ANN-TMIN-PRBFST-T32FP50, which with the last spring freeze gives a 254-day season
  - median (50 percent probability) date of the last spring 32 F freeze at Gainesville Rgnl AP, FL (station USW00012816), Mar 3, field ANN-TMIN-PRBLST-T32FP50
  - median (50 percent probability) date of the first fall 32 F freeze at station USW00012816, Dec 2, field ANN-TMIN-PRBFST-T32FP50, which with the last spring freeze gives a 274-day season
  - median (50 percent probability) date of the last spring 32 F freeze at Orlando Intl AP, FL (station USW00012815), Jan 25, field ANN-TMIN-PRBLST-T32FP50
  - median (50 percent probability) date of the first fall 32 F freeze at station USW00012815, Jan 10, field ANN-TMIN-PRBFST-T32FP50, which with the last spring freeze gives a 350-day season
- **Caveat:** Station normals for the regions the cited extension harvest calendars speak for. The last spring and first fall freezes give each source its own frost-free season, and the app places a harvest at the same point in the garden's own season.

#### `oke1981-canyon-svf`

Oke, T. R. (1981). *Canyon geometry and the nocturnal urban heat island: Comparison of scale model and field observations*. Journal of Climatology 1: 237-254

- DOI: [10.1002/joc.3370010304](https://doi.org/10.1002/joc.3370010304)
- Verification: Crossref-verified | Access: paywalled
- Backs:
  - the sky view factor of a surface is the geometric control on how much it cools by longwave radiation on a calm clear night
- **Caveat:** The paper is about street canyons and doesn't treat panel rows. Its full text hasn't been read. It's cited for the mechanism and for the direction of the relationship only, and it supports no number for an agrivoltaic array. This app states a sky view factor and names the consequence in words, without converting it into degrees of frost margin.

#### `oke1987-boundary-layer-climates`

Oke, T. R. (2002). *Boundary Layer Climates*. Routledge

- DOI: [10.4324/9780203407219](https://doi.org/10.4324/9780203407219)
- Verification: Crossref-verified | Access: paywalled
- Backs:
  - shortwave albedo ranges for bare soil, grass, crop canopies, dry plant litter and snow
  - sky view factor as the geometric control on how much longwave a surface loses to the sky at night
- **Caveat:** Crossref returns the 2002 Routledge reissue against this DOI. The text is Oke's second edition of 1987. Verified as a bibliographic record only. The albedo table wasn't re-read, and every point value this app takes from it is a choice made inside a published range, and no figure Oke states for that surface.

#### `ophz-hardiness-geojson`

Jenkins, Keith. (n.d.). *OPHZ: Oregon PRISM Hardiness Zones*. GitHub

- URL: <https://github.com/kgjenkins/ophz>
- Verification: URL-verified | Access: public-domain
- Backs:
  - decision 9: the bundled ~450 m PRISM-derived hardiness GeoJSON, credited to USDA-ARS and Oregon State
- **Caveat:** It covers the lower 48 states only and leaves the rest of this app's stated global scope uncovered. Its own README says OPHZ is traced from the 2012 USDA map image, which predates the 2023 map. This app doesn't use it for that reason: it would have labeled 2012 zones as usda-2023. Its zones diverge from the official 2023 PRISM grid at measured sites: Amherst MA 5b vs 6a, Denver 5b vs 6a, Tucson 9a vs 9b, International Falls 3a vs 3b.

#### `ouellet1967-woody-zonation`

Ouellet, C. E.; Sherk, L. C. (1967). *Woody ornamental plant zonation: I. Indices of winterhardiness*. Canadian Journal of Plant Science 47: 231-238

- DOI: [10.4141/cjps67-044](https://doi.org/10.4141/cjps67-044)
- Verification: Crossref-verified | Access: paywalled
- Backs:
  - the six-variable regression underlying Canada's plant hardiness index
- **Caveat:** The part I title is recorded here. 'Woody ornamental plant zonation indices of winter hardiness' also circulates for it. Parts II (10.4141/cjps67-064) and III (10.4141/cjps67-065) also exist, and part III carries the map.

#### `richardson1974-utah-chill`

Richardson, E. Arlo; Seeley, Schuyler D.; Walker, David R. (1974). *A model for estimating the completion of rest for 'Redhaven' and 'Elberta' peach trees*. HortScience 9: 331-332

- DOI: [10.21273/HORTSCI.9.4.331](https://doi.org/10.21273/HORTSCI.9.4.331)
- Verification: Crossref-verified | Access: paywalled, evidence tier **A**
- Backs:
  - the Utah chill unit temperature bands and their weights, including the negative weight of warm hours
- **Caveat:** Crossref splits the first author as family 'Arlo Richardson', given 'E.'. The paper is cited everywhere as Richardson, Seeley and Walker.

#### `usda-phzm-2023`

(2023). *2023 USDA Plant Hardiness Zone Map*. USDA Agricultural Research Service and PRISM Climate Group, Oregon State University

- URL: <https://planthardiness.ars.usda.gov/>
- Archived: <https://web.archive.org/web/20260730013513/https://planthardiness.ars.usda.gov/>
- Verification: URL-verified | Access: open-access
- Backs:
  - hardiness zone gating for perennials
  - decision 9: no official USDA hardiness API exists, only an interactive map, ZIP lookup and static downloads
- **Caveat:** The map isn't public domain, because Oregon State University retains ownership. The 2023 PRISM terms permit redistributing altered data only with a prominently displayed disclaimer that it's not the official USDA Plant Hardiness Zone Map. This app resamples to 0.02 deg, which is an alteration. The disclaimer is therefore a license obligation, and the attribution panel renders it.

#### `wang-pruppacher1977-acceleration`

Wang, P. K.; Pruppacher, H. R. (1977). *Acceleration to terminal velocity of cloud and raindrops*. Journal of Applied Meteorology 16: 275-280

- DOI: [10.1175/1520-0450(1977)016<0275:ATTVOC>2.0.CO;2](https://doi.org/10.1175/1520-0450(1977)016<0275:ATTVOC>2.0.CO;2)
- Verification: Crossref-verified | Access: paywalled, evidence tier **A**
- Backs:
  - Sect. 4: measured and computed fall distances to 99 percent of terminal speed at 1000 mb and 20 C: 3.9 m for a 1 mm diameter drop, 9.5 m for 2 mm and 14.0 m for 4 mm, which is the second source behind integrating a drip's fall from rest, where a simpler model would release it at terminal speed, and the band the rain field's own fall is checked against
  - the drag coefficient of an accelerating drop is the coefficient of a drop at terminal speed at the same Reynolds number, which is why the rain field's quadratic drag is matched to the drip's own measured terminal speed
- **Caveat:** Read at source from an author-hosted scan, text recovered by OCR. The distances are given by drop radius in the paper's own text and converted to diameters here

#### `zhang-taylor2011-dynamic-chill`

Zhang, Jianhua; Taylor, Chris. (2011). *The Dynamic Model Provides the Best Description of the Chill Process on 'Sirora' Pistachio Trees in Australia*. HortScience 46: 420-425

- DOI: [10.21273/HORTSCI.46.3.420](https://doi.org/10.21273/HORTSCI.46.3.420)
- Verification: Crossref-verified | Access: paywalled, evidence tier **C**
- Backs:
  - evidence that the Dynamic model best describes the chill process
- **Caveat:** HortScience 46(3):420-425 is by Zhang & Taylor, a single-site pistachio study in Australia. It circulates as 'Luedeling, E. et al. (2011). The Dynamic Model provides the best description of the chill process'. The global-comparison claim in that title belongs to Luedeling & Brown 2010. A single-site study is Tier C.

## Traditional ecological knowledge

24 sources.

#### `armstrong2021-forest-garden-traits`

Armstrong, Chelsey Geralda; Miller, Jesse E. D.; McAlvay, Alex C.; Ritchie, Patrick Morgan; Lepofsky, Dana. (2021). *Historical Indigenous Land-Use Explains Plant Functional Trait Diversity*. Ecology and Society 26: 6

- DOI: [10.5751/ES-12322-260206](https://doi.org/10.5751/ES-12322-260206)
- Verification: Crossref-verified | Access: open-access, evidence tier **B**
- Backs:
  - Pacific Northwest Coast forest gardens retain elevated functional trait diversity long after management ceased
  - TEK design rule 1: vertical stratification into 2-4 explicit canopy tiers
- **Caveat:** Ecology and Society 26(2):6. The DOI is 10.5751/ES-12322-260206. The plausible-looking 10.5751/ES-12160-260206 returns 404 and must not be used.

#### `armstrong2023-tsmsyen-forest-gardens`

Armstrong, Chelsey Geralda; Lyons, Natasha; McAlvay, Alex C.; Ritchie, Patrick Morgan. (2023). *Historical ecology of forest garden management in Laxyuubm Ts'msyen and beyond*. Ecosystems and People 19

- DOI: [10.1080/26395916.2022.2160823](https://doi.org/10.1080/26395916.2022.2160823)
- Verification: Crossref-verified | Access: open-access, evidence tier **B**
- Backs:
  - Ts'msyen and Coast Salish forest garden management as living, specifically attributed practice
- **Caveat:** Crossref gives 2023, volume 19. The 2022 inside the DOI string is the acceptance year, so the 'Armstrong et al. 2022, Ecosystems and People 18(1)' form that circulates is wrong on both year and volume.

#### `carroll2020-care`

Carroll, Stephanie Russo; Garba, Ibrahim; Figueroa-Rodríguez, Oscar L. (2020). *The CARE Principles for Indigenous Data Governance*. Data Science Journal 19: 43

- DOI: [10.5334/dsj-2020-043](https://doi.org/10.5334/dsj-2020-043)
- Verification: Crossref-verified | Access: open-access
- Backs:
  - the governing framework behind the product's TEK attribution rules
  - decision 12: CARE binds only on an app that encodes community-held seed genetics or ceremonial calendars, which this app doesn't

#### `carroll2021-care-fair`

Carroll, Stephanie Russo; Herczog, Edit; Hudson, Maui; Russell, Keith; Stall, Shelley. (2021). *Operationalizing the CARE and FAIR Principles for Indigenous data futures*. Scientific Data 8: 108

- DOI: [10.1038/s41597-021-00892-0](https://doi.org/10.1038/s41597-021-00892-0)
- Verification: Crossref-verified | Access: open-access
- Backs:
  - practical operationalization of CARE alongside FAIR for this app's data model

#### `chiorese2026-milpa`

Chiorese, Gabriele; Manalil, Sudheesh; Muniraj, Iniya. (2026). *The milpa system as a model of agroecological intensification: integrating productivity, ecological functioning, and resilience*. Frontiers in Sustainable Food Systems 10: 1843955

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
- **Caveat:** License is CC BY-NC-ND 4.0.

#### `fernandes1984-chagga`

Fernandes, E. C. M.; Oktingati, A.; Maghembe, J. (1984). *The Chagga homegardens: a multistoried agroforestry cropping system on Mt. Kilimanjaro (Northern Tanzania)*. Agroforestry Systems 2: 73-86

- DOI: [10.1007/BF00131267](https://doi.org/10.1007/BF00131267)
- Verification: Crossref-verified | Access: paywalled, evidence tier **B**
- Backs:
  - Chagga home gardens as a documented multi-tier canopy system
  - TEK design rule 1: 2-4 explicit canopy tiers keyed to light level
- **Caveat:** Crossref gives 1984, Agroforestry Systems 2:73-86. A separate 1985 Food and Nutrition Bulletin version and a 1989 book chapter also exist, which is where a 1985 date for this paper comes from.

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
- **Caveat:** No Gott article exists at Archaeology in Oceania 18(1), the locus that circulates as 'Gott 1983'. Gott's murnong paper is normally cited as Australian Aboriginal Studies 1983(2):2-18, which has no DOI. The Crossref-verified Gott record in Archaeology in Oceania is the 1982 root-use paper here.

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

Kumar, B. M.; Nair, P. K. R. (2004). *The enigma of tropical homegardens*. Agroforestry Systems 61: 135-152

- DOI: [10.1023/B:AGFO.0000028995.13227.ca](https://doi.org/10.1023/B:AGFO.0000028995.13227.ca)
- Verification: Crossref-verified | Access: paywalled, evidence tier **B**
- Backs:
  - cross-cultural synthesis of tropical home-garden structure supporting the vertical stratification rule

#### `lansing2007-priests-programmers`

Lansing, J. Stephen. (2007). *Priests and Programmers: Technologies of Power in the Engineered Landscape of Bali*. Princeton University Press

- DOI: [10.1515/9781400827633](https://doi.org/10.1515/9781400827633)
- Verification: Crossref-verified | Access: paywalled, evidence tier **B**
- Backs:
  - Balinese subak as a self-organizing water and cropping-calendar institution
  - attribution to Balinese farming communities, developed by the 9th century CE
- **Caveat:** The Crossref-registered record is the 2007 reissue. The first edition is 1991.

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
  - modeled net effect: radiation to crops and pasture reduced by up to 21% in a standard dehesa at 24 mature trees/ha
  - qualitative corroboration that a logistic distance decay is the right SHAPE for a distance-from-panel-edge model
- **Caveat:** It's cited for the light gradient's shape only. No 'Marcos et al.' dehesa radiation-transmission paper could be located, so a citation to 'Marcos et al.' has nothing behind it. The paper's regression template can't be filled in, because its coefficients are behind the Springer paywall and were never obtained. Everything this entry claims comes from the publisher abstract. Until the full text is read, a distance-from-edge model has to come from geometry, with this paper as qualitative corroboration of the curve's shape. The paper covers light only and supports nothing about soil moisture. The dehesa soil-moisture literature (Cubera & Moreno 2007, Ann. For. Sci. 64:355-364, 10.1051/forest:2007012, and Catena 71:298-308) samples 2-30 m from the trunk. It reports categorical beneath-canopy against beyond-canopy contrasts by depth and season, with no fitted distance function. An oak dehesa isn't a PV array: a tree canopy and a panel row have different geometry and different spectral transmission.

#### `moreno2009-dehesa`

Moreno, Gerardo; Pulido, Fernando J. (2009). *The Functioning, Management and Persistence of Dehesas*. Agroforestry in Europe 127-160

- DOI: [10.1007/978-1-4020-8272-6_7](https://doi.org/10.1007/978-1-4020-8272-6_7)
- Verification: Crossref-verified | Access: paywalled, evidence tier **B**
- Backs:
  - dehesa and montado as the analog behind the distance-from-panel-edge gradient
  - attribution to Iberian smallholders and estate managers of Extremadura, Andalusia and Alentejo
- **Caveat:** Crossref returns no issued year for this chapter, so 2009 isn't Crossref-confirmed. The claim that dehesa field studies measure light transmission as a function of distance from the oak trunk belongs to montero2008-dehesa-light. No 'Marcos et al., dehesa radiation transmission' paper exists, and that name must not appear in any shipped artifact. No source supports the soil-moisture half of the same claim: Cubera & Moreno 2007 sample 2-30 m from the trunk and report categorical beneath-canopy against beyond-canopy contrasts, with no fitted distance function.

#### `mueller2025-eastern-ag-complex`

Mueller, Natalie G. (2025). *The sleeping crops of eastern North America: a new synthesis*. Philosophical Transactions of the Royal Society B: Biological Sciences 380: 20240192

- DOI: [10.1098/rstb.2024.0192](https://doi.org/10.1098/rstb.2024.0192)
- Verification: Crossref-verified | Access: open-access, evidence tier **B**
- Backs:
  - Eastern Agricultural Complex as an independent domestication center in eastern North America
  - TEK design rule 6: landraces as distinct plantable entities with their own trait annotations

#### `ortloff1993-tiwanaku-collapse`

Ortloff, Charles R.; Kolata, Alan L. (1993). *Climate and Collapse: Agro-Ecological Perspectives on the Decline of the Tiwanaku State*. Journal of Archaeological Science 20: 195-221

- DOI: [10.1006/jasc.1993.1014](https://doi.org/10.1006/jasc.1993.1014)
- Verification: Crossref-verified | Access: paywalled, evidence tier **B**
- Backs:
  - attribution rule: distinguish an extinct polity's archaeological system from living Aymara and Quechua practice

#### `peyre2006-kerala-homegardens`

Peyre, A.; Guidal, A.; Wiersum, K. F.; Bongers, F. (2006). *Dynamics of Homegarden Structure and Function in Kerala, India*. Agroforestry Systems 66: 101-115

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
- **Caveat:** Functional Ecology 13(4). The DOI is 10.1046/j.1365-2435.1999.00345.x, and the adjacent .00348.x is a different paper.

#### `ruddle1988-dike-pond`

Ruddle, Kenneth; Zhong, Gongfu. (1988). *Integrated Agriculture-Aquaculture in South China: The Dike-Pond System of the Zhujiang Delta*. Cambridge University Press

- Verification: UNVERIFIED | Access: paywalled, evidence tier **B**
- Backs:
  - mulberry-dyke and fish-pond system of the Pearl River Delta, GIAHS-recognized at Huzhou
- **Caveat:** The monograph itself has no DOI, and only reviews of it are indexed. Existence corroborated by three Crossref-indexed reviews, e.g. Richards 1989, Geographical Review 79:260 (10.2307/215545).

#### `simionesei2018-montado-water`

Simionesei, Lucian; Ramos, Tiago B.; Oliveira, Ana R.; Jongen, Marjan. (2018). *Modeling Soil Water Dynamics and Pasture Growth in the Montado Ecosystem Using MOHID Land*. Water 10: 489

- DOI: [10.3390/w10040489](https://doi.org/10.3390/w10040489)
- Verification: Crossref-verified | Access: open-access, evidence tier **C**
- Backs:
  - quantified soil water and pasture growth dynamics under montado oak cover
- **Caveat:** Water 10(4):489 is by Simionesei, Ramos, Oliveira, Jongen et al. No Fabião appears on the author list, though 'Fabião et al. 2018' circulates for this locus.

#### `slach2021-coppice-decline`

Slach, Tomáš; Volařík, Daniel; Maděra, Petr. (2021). *Dwindling coppice woods in Central Europe - Disappearing natural and cultural heritage*. Forest Ecology and Management 501: 119687

- DOI: [10.1016/j.foreco.2021.119687](https://doi.org/10.1016/j.foreco.2021.119687)
- Verification: Crossref-verified | Access: paywalled, evidence tier **C**
- Backs:
  - coppice and pollarding as a documented European light-management tradition
- **Caveat:** The source is ambiguous. The description 'Forest Ecology and Management 2021 (Central European coppice decline)' fits this record. It also fits a second Crossref match, Johann 2021 (10.1016/j.foreco.2021.119129), on the re-introduction of coppice management in Austria. The intended source can't be pinned, so neither counts as confirmed.

#### `yuan2022-hani-rice-fish-duck`

Yuan, Zhengjie; Xu, Jie; Shen, Le. (2022). *Valuation of Ecosystem Services for the Sustainable Development of Hani Terraces: A Rice-Fish-Duck Integrated Farming Model*. International Journal of Environmental Research and Public Health 19: 8549

- DOI: [10.3390/ijerph19148549](https://doi.org/10.3390/ijerph19148549)
- Verification: Crossref-verified | Access: open-access, evidence tier **C**
- Backs:
  - rice-fish-duck integrated system as documented among Hani communities in Yunnan
  - TEK design rule 7: LER-style portfolio reporting across stacked enterprises

## Standards & regulation

11 sources.

#### `din-spec-91434-2021`

(2021). *DIN SPEC 91434:2021-05 Agri-Photovoltaik-Anlagen - Anforderungen an die landwirtschaftliche Hauptnutzung*. DIN e.V. DIN SPEC 91434:2021-05

- URL: <https://www.dinmedia.de/en/technical-rule/din-spec-91434/337886742>
- Archived: <https://web.archive.org/web/20260513221512/https://www.dinmedia.de/en/technical-rule/din-spec-91434/337886742>
- Verification: URL-verified | Access: open-access
- Backs:
  - Germany: 66% of reference yield, 2.10 m clearance, <10% / <15% area loss
  - decision 8: DIN SPEC 91434 contains NO numeric light-homogeneity threshold, NO GCR cap and NO minimum row spacing
  - estimate-only compliance overlay requiring field agronomy
- **Caveat:** Free of charge despite being a DIN document, so accessLevel is open-access. The 66%, 2.10 m and area-loss figures are secondhand and were NOT read out of the standard text. Only the bibliographic record and the availability are verified.

#### `din-spec-91492-2024`

(2024). *DIN SPEC 91492:2024-06 Agri-Photovoltaik-Anlagen - Anforderungen an die Nutztierhaltung*. DIN e.V. DIN SPEC 91492:2024-06

- URL: <https://www.dinmedia.de/en/technical-rule/din-spec-91492/379601163>
- Archived: <https://web.archive.org/web/20261017205803/https://www.dinmedia.de/en/technical-rule/din-spec-91492/379601163>
- Verification: URL-verified | Access: open-access
- Backs:
  - the livestock counterpart to DIN SPEC 91434, out of scope for a garden tool and recorded for completeness

#### `fda-import-alert-54-10`

U.S. Food and Drug Administration. (n.d.). *Import Alert 54-10: Detention Without Physical Examination of Bulk/Finished Dietary Supplements Products Containing Aristolochic Acid*. U.S. Food and Drug Administration

- URL: <https://www.accessdata.fda.gov/cms_ia/importalert_141.html>
- Archived: <https://web.archive.org/web/20260919123443/https://www.accessdata.fda.gov/cms_ia/importalert_141.html>
- Verification: URL-verified | Access: public-domain
- Backs:
  - Asarum caudatum is listed under 'Botanicals Known or Suspected to Contain Aristolochic Acid'
    - "Asarum caudatum Lindl" ("Guidance" section)
  - the health risk
    - "In sum, products containing aristolochic acid cause renal damage and can cause or contribute to renal failure." ("Reason for Alert" section)
- **Caveat:** A regulatory notice on dietary supplements and botanical products. It lists the species as known or suspected to contain the compound and gives no measured content for it, which is why the catalog keeps the plant and offers it only as a groundcover.

#### `france-decret-2024-318`

(2024). *Décret n° 2024-318 du 8 avril 2024 relatif au développement de l'agrivoltaïsme et aux conditions d'implantation des installations photovoltaïques sur des terrains agricoles, naturels ou forestiers*. Journal officiel de la République française NOR ECOR2321918D

- URL: <https://www.legifrance.gouv.fr/jorf/id/JORFTEXT000049386027>
- Verification: URL-verified | Access: public-domain
- Backs:
  - France: 90% of a control zone that is >=5% of area and capped at 1 ha, 40% maximum coverage
  - estimate-only compliance overlay
- **Caveat:** The commonly circulated Legifrance identifier JORFTEXT000049383066 is wrong for this décret. Its numeric thresholds are secondhand and were never read out of the décret text.

#### `italy-dm-436-2023`

(2023). *Decreto MASE 22 dicembre 2023, n. 436 (DM Agrivoltaico)*. Ministero dell'Ambiente e della Sicurezza Energetica DM 436/2023

- URL: <https://www.mase.gov.it/portale/documents/d/guest/dec-436-2023-pdf>
- Archived: <https://web.archive.org/web/20250926093637/https://www.mase.gov.it/portale/documents/d/guest/dec-436-2023-pdf>
- Verification: URL-verified | Access: public-domain
- Backs:
  - Italy: >=70% of area remains agricultural, 2.1 m clearance for crops, 60% producibility ratio
  - the 60% producibility ratio is NOT an LER>1 requirement
  - estimate-only compliance overlay
- **Caveat:** The PDF is confirmed to be the ministerial decree. Its numeric thresholds are secondhand and were never extracted from the decree text.

#### `japan-maff-solar-sharing`

(2024). *営農型太陽光発電に係る農地転用許可制度上の取扱いに関するガイドライン*. 農林水産省農村振興局 (MAFF Rural Development Bureau) 5-Nōshin-2825

- URL: <https://www.maff.go.jp/j/nousin/noukei/totiriyo/attach/pdf/einogata-57.pdf>
- Archived: <https://web.archive.org/web/20251218195358/https://www.maff.go.jp/j/nousin/noukei/totiriyo/attach/pdf/einogata-57.pdf>
- Verification: URL-verified | Access: public-domain
- Backs:
  - Japan: 80% of regional average yield, 2 m clearance
  - estimate-only compliance overlay
- **Caveat:** The PDF at this URL serves the amended text (改正 令和7年3月31日, 6農振第2983号, March 31, 2025), so citing it as 'as of March 25, 2024' is inaccurate. The amendment reference 6-Nōshin-2983 belongs to the 2025 text, and any citation of this URL points to the amended version.

#### `ma-225-cmr-20`

(n.d.). *225 CMR 20.00: Solar Massachusetts Renewable Target (SMART) Program*. Commonwealth of Massachusetts 225 CMR 20.00

- URL: <https://www.mass.gov/regulations/225-CMR-2000-solar-massachusetts-renewable-target-smart-program>
- Archived: <https://web.archive.org/web/20260907120813/https://www.mass.gov/regulations/225-CMR-2000-solar-massachusetts-renewable-target-smart-program>
- Verification: UNVERIFIED | Access: public-domain
- Backs:
  - the legacy SMART regulatory basis, superseded
- **Caveat:** It's superseded by 225 CMR 28.00 (SMART 3.0, filed August 2025), so it's legacy text and its thresholds aren't current.

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
- **Caveat:** The text is a PDF that mass.gov serves only inside a browser session. It supersedes 225 CMR 20.00. Every parameter is waivable, so no geometric result is a determination.

#### `ma-doer-shading-analysis-tool`

(n.d.). *Dual-Use Shading Analysis Tool*. Massachusetts Department of Energy Resources

- URL: <https://massgov.github.io/DOER/doer.html>
- Archived: <https://web.archive.org/web/20261020121717/https://massgov.github.io/DOER/doer.html>
- Verification: URL-verified | Access: public-domain
- Backs:
  - DOER mandates applicants use its own Shading Analysis Tool, so a third-party computed result has no regulatory standing
- **Caveat:** A web app published under the Commonwealth's massgov GitHub organization and credited to the UMass Amherst Clean Energy Extension. It computes no sun position: fixed tables give the sun on the 15th of each month for Eastern, Central or Western Massachusetts, at angles that match NOAA's at half past each clock hour of the Growing Season Hours, Eastern time with daylight saving. A point's figure is the share of those moments it spends in a panel's shadow, counting direct sun only with every moment weighted the same, and the tool reports the most shaded point beside the least shaded and the average, over March to October by default. This app totals the light itself every 15 minutes, diffuse sky included, so the two figures can differ.

#### `ma-smart-astgu-guideline`

(2022). *Agricultural Solar Tariff Generation Units Guideline*. Massachusetts Department of Energy Resources

- URL: <https://www.mass.gov/doc/agricultural-solar-tariff-generation-units-guideline/download>
- Verification: UNVERIFIED | Access: public-domain
- Backs:
  - decision 8: >=50% of sunlight at every square foot during the growing season
  - 8 ft clearance fixed-tilt, 10 ft tracking
  - 5 MW AC cap
  - the only compliance regime the tool can self-verify from geometry alone
- **Caveat:** No mass.gov URL serves its text outside a browser session, so this entry doesn't rest on the primary text. The 50% / 8 ft / 10 ft / 5 MW AC figures come only from a UMass Clean Energy Extension fact sheet (Jan 2024, https://www.umass.edu/agriculture-food-environment/sites/ag.umass.edu/files/fact-sheets/pdf/fs_-_dual-use_-_agriculture_and_solar_pv_012524_0.pdf). This app offers a check for this one regime and an estimate everywhere else, so that check rests on a secondary source. Several near-identical mass.gov guideline slugs exist, and they're easy to confuse.

#### `uni-pdr-148-2023`

(2023). *UNI/PdR 148:2023 Sistemi agrivoltaici - Integrazione di attività agricole e impianti fotovoltaici*. UNI UNI/PdR 148:2023

- URL: <https://store.uni.com/uni-pdr-148-2023>
- Archived: <https://web.archive.org/web/20260907093752/https://store.uni.com/uni-pdr-148-2023>
- Verification: URL-verified | Access: open-access
- Backs:
  - the Italian technical practice document accompanying DM 436/2023

## Software & datasets

12 sources.

#### `eia-electric-power-monthly-5-6-a`

(n.d.). *Electric Power Monthly, Table 5.6.A: Average Price of Electricity to Ultimate Customers by End-Use Sector, by State*. U.S. Energy Information Administration

- URL: <https://www.eia.gov/electricity/monthly/epm_table_grapher.php?t=epmt_5_6_a>
- Archived: <https://web.archive.org/web/20260905203258/https://www.eia.gov/electricity/monthly/epm_table_grapher.php?t=epmt_5_6_a>
- Verification: URL-verified | Access: public-domain
- Backs:
  - the residential retail price of electricity for a US state, in cents per kilowatt-hour
  - that the price series is collected on Form EIA-861M and published by state and end-use sector
- **Caveat:** A retail price is what a kilowatt-hour costs to buy. What an exported kilowatt-hour earns is a separate figure. This app models no net metering, time-of-use rates or export tariffs below retail. Any value computed from this figure therefore assumes that every kilowatt-hour generated displaces one that would have been bought. It's a state-wide, year-long average that no customer pays as a tariff. It covers the United States only, and no equally free per-country series covers the rest of this app's scope.

#### `fao-ecocrop`

(n.d.). *FAO ECOCROP crop ecological requirements database*. Food and Agriculture Organization of the United Nations

- URL: <https://gaez.fao.org/pages/ecocrop>
- Archived: <https://web.archive.org/web/20260821172120/https://gaez.fao.org/pages/ecocrop/>
- Verification: URL-verified | Access: open-access
- Backs:
  - decision 9: bundled FAO ECOCROP (~2568 species)
  - decision 10: ECOCROP trapezoidal membership with min-across-parameters, which yields the limiting factor for free
- **Caveat:** The FAO land-resources-planning-toolbox URL that circulates for ECOCROP is a stale stub and serves none of the database. Use the GAEZ URL above.

#### `nasa-power`

(n.d.). *NASA POWER API*. NASA Langley Research Center

- URL: <https://power.larc.nasa.gov/docs/services/api/>
- Archived: <https://web.archive.org/web/20260820221908/https://power.larc.nasa.gov/docs/services/api/>
- Verification: UNVERIFIED | Access: public-domain
- Backs:
  - decision 9: browser-direct fallback weather source, CORS verified against the live endpoint

#### `nominatim-policy`

(n.d.). *Nominatim Usage Policy*. OpenStreetMap Foundation

- URL: <https://operations.osmfoundation.org/policies/nominatim/>
- Archived: <https://web.archive.org/web/20260807081006/https://operations.osmfoundation.org/policies/nominatim/>
- Verification: UNVERIFIED | Access: open-access
- Backs:
  - decision 9: Nominatim geocoding at 1 request/second with a required User-Agent header

#### `nrel-nsrdb-psm3`

(n.d.). *NSRDB Data Downloads API (GOES PSM v4.0.0)*. National Laboratory of the Rockies

- URL: <https://developer.nlr.gov/docs/solar/nsrdb/>
- Archived: <https://web.archive.org/web/20260625161933/https://developer.nlr.gov/docs/solar/nsrdb/>
- Verification: URL-verified | Access: public-domain
- Backs:
  - decision 9: the NSRDB is worker-proxied for API-key secrecy
  - the developer.nrel.gov -> developer.nlr.gov migration, and the PSM v3.2.2 -> GOES v4.0.0 replacement
- **Caveat:** NREL's own docs state that 'The previous developer.nrel.gov domain was retired on May 29, 2026', and the old host no longer connects at all. The endpoint index marks PSM v3.2.2 and its TMY product as replaced by GOES Aggregated v4.0.0 and GOES TMY v4.0.0. With DEMO_KEY, the live v4 TMY endpoint accepts the wkt, names, interval and attributes parameters and rejects only the email parameter. The upstream requires a real address, so a full download is untested.

#### `open-meteo`

(n.d.). *Open-Meteo Historical Weather API and Satellite Radiation API*. Open-Meteo

- URL: <https://open-meteo.com/en/licence>
- Archived: <https://web.archive.org/web/20260809155104/https://open-meteo.com/en/licence>
- Verification: URL-verified | Access: open-access
- Backs:
  - decision 9: the only global, keyless, CORS-enabled, CC BY 4.0 commercial-use source returning GHI+DNI+DHI
  - primary browser-direct weather source
  - attribution requirement: a visible 'Weather data by Open-Meteo.com' link
- **Caveat:** Rate and tier limits appear on the pricing page and are absent from the license page. This entry doesn't record them.

#### `pvgis-v5-3`

(n.d.). *PVGIS 5.3 non-interactive API*. European Commission Joint Research Centre

- URL: <https://joint-research-centre.ec.europa.eu/photovoltaic-geographical-information-system-pvgis/getting-started-pvgis/api-non-interactive-service_en>
- Archived: <https://web.archive.org/web/20260307064217/https://joint-research-centre.ec.europa.eu/photovoltaic-geographical-information-system-pvgis/getting-started-pvgis/api-non-interactive-service_en>
- Verification: URL-verified | Access: open-access
- Backs:
  - decision 9: PVGIS must be worker-proxied because it explicitly forbids AJAX by written policy

#### `pvlib-python`

(n.d.). *pvlib-python*. pvlib community

- URL: <https://pvlib-python.readthedocs.io/>
- Archived: <https://web.archive.org/web/20261017210708/https://pvlib-python.readthedocs.io/>
- Verification: UNVERIFIED | Access: open-access
- Backs:
  - the BSD-3 reference implementation of SPA, the Perez transposition model, DIRINT and bifacial.infinite_sheds
  - decision 2.1: infinite_sheds.vf_ground_sky_2d is used only as a unit-test oracle

#### `react-three-fiber`

(n.d.). *@react-three/fiber*. Poimandres

- URL: <https://github.com/pmndrs/react-three-fiber>
- Archived: <https://web.archive.org/web/20260817233242/https://github.com/pmndrs/react-three-fiber>
- Verification: UNVERIFIED | Access: open-access
- Backs:
  - decision 13: @react-three/fiber 9.6.1, NOT v10

#### `sandia-pvpmc`

(n.d.). *PV Performance Modeling Collaborative Modeling Guide*. Sandia National Laboratories

- URL: <https://pvpmc.sandia.gov/modeling-guide/>
- Archived: <https://web.archive.org/web/20260902165330/https://pvpmc.sandia.gov/modeling-guide/>
- Verification: UNVERIFIED | Access: public-domain
- Backs:
  - reference derivations for the Perez sky diffuse model, SPA and plane-of-array irradiance

#### `suncalc`

(n.d.). *SunCalc*. Vladimir Agafonkin

- URL: <https://github.com/mourner/suncalc>
- Archived: <https://web.archive.org/web/20260808213159/https://github.com/mourner/suncalc>
- Verification: UNVERIFIED | Access: open-access
- Backs:
  - decision 2.4: SunCalc 2.0.1 permitted for sunrise/sunset/twilight/moon UI chrome only
  - SunCalc exposes no air mass, radius vector or refraction control, which is why it can't drive the simulation

#### `threejs`

(n.d.). *three.js*. three.js contributors

- URL: <https://github.com/mrdoob/three.js>
- Archived: <https://web.archive.org/web/20260730204910/https://github.com/mrdoob/three.js>
- Verification: UNVERIFIED | Access: open-access
- Backs:
  - decision 13: three 0.185.1 as the 3D renderer

## Unsourced and weakly-sourced claims

The honest-provenance ledger. Every entry is a claim that currently reaches, or could reach, a user-visible
surface without solid peer-reviewed backing. Completeness is the only test this list is held to.
Each item names what would close it.

### A. Load-bearing claims with NO verifiable peer-reviewed backing

| # | Claim | Where | Status | What would close it |
|---|---|---|---|---|
| A1 | A dehesa distance gradient giving light transmission and soil moisture as a function of distance from the oak trunk, reused as an empirical template for distance-from-panel-edge modeling | Decision Record 12, the distance-from-edge light model | The light half has its SHAPE only. Montero, Moreno & Bertomeu 2008 fit intercepted light against distance as a logistic curve, R^2 above 0.88 and radiation constant beyond 20 m, and their coefficients are behind the Springer paywall. The template was therefore never instantiated: the endpoints follow the published direction, the ten intermediate samples are interpolated, every magnitude is this app's own, and DEHESA_GRADIENT_CAVEAT says so on screen. The soil-moisture half rests on no distance function at all, since that literature reports discrete beneath-canopy and beyond-canopy zones (Moreno & Pulido 2009 and Simionesei et al. 2018 carry the endpoints). No dehesa paper by Marcos et al. exists, and none is cited. | The full text of Montero et al. 2008 for the fitted coefficients, and a dehesa study that fits soil moisture as a continuous function of distance |
| A2 | Wind reduction percentages under a panel array | microclimate under panels | Rests on trade-press coverage, not primary papers. No peer-reviewed source located. | A primary micrometeorology paper, or remove the numeric wind modifier and keep only the qualitative rule |
| A3 | Frost protection and dew formation under panels | Decision Record 12, rule 3 | Mechanistically plausible, entirely unquantified. No source. | Any field study with quantified frost/dew deltas |
| A4 | VPD and relative-humidity deltas under panels | microclimate under panels | Directionally consistent across reports but no numbers were extractable from any accessible source. | Extract the numbers from Marrou 2013b full text, whose DOI is verified here and whose body is unread |
| A5 | The 'Beck et al. 2012' 50%-shade threshold | the shade ceiling in the design guidance | Cited *within* agrivoltaic reviews. Primary reference NOT LOCATED and may not exist as described. Not to be confused with Beck et al. 2018 Köppen-Geiger, which is verified. | Trace it, or cite Zhang et al. 2025 for the tipping point instead and delete the Beck 2012 attribution |
| A6 | Desmodium intercepts and kills stemborer larvae, a revision of the older repels-adults mechanism | Decision Record 11, the companion-planting rules | Attributed to 'eLife' with no article, authors or DOI. NOT LOCATED. | Find the eLife paper, or state the mechanism revision without a specific citation |
| A7 | Penumbra at 4 m clearance is ~7.5 cm and can be ignored for annual DLI | Decision Record 3 | No source given anywhere. It is a defensible geometric calculation but it is presented as a physics constant. | Show the derivation inline, or cite a source |
| A8 | Inter-reflection formula E / (1 - rho_g (1 - SVF) rho_m), material only for white backsheets at 3-8% in the shade strip | Decision Record 3 | No source given. The 3-8% magnitude in particular is unattributed. | Cite the derivation source. Marion 2017 is the likely candidate, but it does not state these numbers |
| A9 | Beam shadow bands sweep ~0.25 deg/min, therefore timestep must be <=15 min | Decision Record 4 | No source. Arithmetically checkable but the 15 min threshold and the 'hourly steps smear cell-level extremes' claim are unattributed. | Show a convergence study, which is cheap to generate in-repo |
| A10 | Per-crop shade-response functions conditional on climate | the two-context hot/arid and cool/humid split | Do not exist in the literature in usable form. The product ships a two-context hot/arid vs cool/humid approximation that no source supports. | Label the two-context split as a product heuristic, not a finding |
| A11 | Japanese solar-sharing crop science | the Japan compliance overlay | Nearly absent in English despite a decade of deployment and a legally binding 80% yield rule. Only sekiyama2019-solar-sharing was located. | Japanese-language literature search, or state the gap in the UI wherever the Japan overlay appears |
| A12 | Nagashima 2015/2020 and AIP Conf. Proc. 2361(1):030002 (2021) | Japanese solar-sharing sources | Neither citation resolves. The AIP volume 2361 record found at Crossref is a different paper (Hudelson & Lieth, article 080001). | Correct or drop, since sekiyama2019-solar-sharing already carries the Nagashima attribution |
| A13 | PMC4416130, described as a 'PLOS ONE 2015 root-foraging LER study' | Three Sisters root-foraging sources | No such study located. The root-foraging LER work is Zhang et al. 2014 and Postma & Lynch 2012, both in Annals of Botany. | Replace the PMC reference with the two verified Annals of Botany DOIs |
| A14 | Base temperatures and DLI values sourced from trackgdd.com, hydroponics blogs and ReduSystems | the catalog's base temperatures and DLI rows (`src/data/catalog/rows.ts`) | Secondary web sources with no provenance. Every value reaching a hard filter must be traced first. The DLI side is closed (decision record 23): 198 of the 204 Tier C figures cite nothing and say so, the other six cite the greenhouse guidance or trial their numbers come from, the three Tier A rows cite per-crop trials, and no ECOCROP entry backs a light integral. Base temperatures remain. | Trace each base temperature to a primary or extension source before release. This is a release blocker. |
| A17 | Leaf area index and light extinction coefficient per plant habit (`HABITS` in `src/data/catalog/schema.ts`) | water model basal coefficient, crop-versus-crop shading | Declared through `unsourcedClaim` as `HABIT_CANOPY_CLAIM` and listed on the sources step (record 23). FAO-56 chapter 9 fixes one extinction coefficient, 0.7, for every crop. The per-habit values are the app's own. | A source tabulating leaf area index or extinction by canopy form, or adopt FAO-56's single 0.7 and drop the per-habit column |
| A18 | Crop ranking weights: light 0.35, climate 0.25, soil 0.15, interaction 0.1, competition 0.1, preference 0.05 | `src/recommend/stages/rank.ts` | Declared through `unsourcedClaim` as `WEIGHTS_CLAIM` and listed on the sources step (record 23). A design choice, and the comment on `DEFAULT_WEIGHTS` says what each term is and why the order. | Nothing in the literature calibrates these terms for a garden bed. A sensitivity study of the ranking against the weights would say how much they matter |
| A15 | Soil data sources (SoilGrids, SSURGO) license terms and resolution | stage 3 of the recommendation pipeline | Not researched at all. Stage 3 of the recommendation pipeline depends on them. | Do the research before designing stage 3 |
| A16 | OSU Croptime crop and cultivar coverage | GDD-based scheduling | Not enumerated. GDD-based scheduling is designed around it. | Enumerate which vegetables have published GDD models |

### B. Claims backed only by paywalled or secondary sources

These have verified bibliographic records. The numbers behind them are unread here, except where a row says
otherwise.

| # | Claim | Source | Status |
|---|---|---|---|
| B1 | US ambient DLI map contours, and any per-crop DLI table inside the paper | `faust2018-dli-maps` | The full text has been read. The paper gives DLI as a national map contoured in 5 mol/m2/d bins and reviews crops in prose, so it closes no per-crop gap and backs no per-crop DLI minimum. Decision 7: must not reach a hard filter. |
| B2 | The ~50% shade tipping point, the shade-tolerant and shade-sensitive groupings, and their effect sizes and CIs | `zhang2025-tipping-points` | Paywalled. Corroborated only from reviews and pv-magazine. Decision 7: must not reach a hard filter. |
| B3 | Massachusetts SMART: >=50% sunlight at every square foot, 8 ft / 10 ft clearance, 5 MW AC cap | `ma-smart-astgu-guideline`, `ma-225-cmr-20` | No mass.gov URL serves its text outside a browser session. Corroborated only from a UMass Extension fact sheet. **The product claims a CHECK for this one regime, and an estimate everywhere else**, so a human must read the DOER text before the checker ships. |
| B4 | Germany 66% reference yield / 2.10 m / <10% and <15% area loss, and the negative claims that DIN SPEC 91434 contains no light-homogeneity threshold, no GCR cap and no minimum row spacing | `din-spec-91434-2021` | The standard is a free download and its bibliographic record is verified, but the text was not read. The three NEGATIVE claims are the load-bearing ones and are the easiest to get wrong. |
| B5 | Italy >=70% agricultural area, 2.1 m, 60% producibility ratio | `italy-dm-436-2023` | Official PDF confirmed to exist. The thresholds are secondhand and were never extracted from it. |
| B6 | France 90% of a control zone >=5% of area capped at 1 ha, 40% max coverage | `france-decret-2024-318` | Legifrance URL confirmed. The thresholds are secondhand and were never extracted from it. |
| B7 | Japan 80% of regional average yield, 2 m | `japan-maff-solar-sharing` | Guideline PDF confirmed. The text served is the 2025-amended version, where the commonly cited notice is the one of March 25, 2024. |
| B8 | Allium white rot sclerotia survive 20-40 years and rotation does not work | `hoanghua2024-white-rot` | The paper covers bait crops. The survival figure and the 'rotation is impractical' conclusion come from UC IPM, UMass and RHS extension pages that were not fetched. |
| B9 | Juglone landscape-scale evidence is weak | `jose-juglone` | The Springer chapter is verified and paywalled. The skeptical framing leans on a ResearchGate copy and a WSU Extension fact sheet, neither peer reviewed nor verified. |
| B10 | Light saturation point 25-60% of maximum sunlight at canopy level for C3 crops | Pang et al. 2019 and Carrier et al. 2019 | Reachable only as secondary citations *inside* Laub et al. 2022 §4.3. Neither primary paper was located or verified. |
| B11 | NREL SPA report text and the developer.nrel.gov -> developer.nlr.gov migration | `reda2008-spa-report`, `nrel-nsrdb-psm3` | nrel.gov and docs.nrel.gov were DNS-unreachable from the verification network. The DOI record is Crossref-verified. The PDF and the migration notice were never read. |

### C. The Laub 2022 crop-response model: what is this app's and what is theirs

The single most load-bearing source in the product, and the one with the most delicate provenance.

1. **The fitted per-group coefficients are not published anywhere.** Not in the article, not in MOESM1
   (Fig. S1 caption, Table S1 = the 58 publications, Table S2 = predictions), not in MOESM2 (raw dataset),
   not in Zenodo record `10.5281/zenodo.5716091` (two xlsx files). The article states "Code availability:
   Not applicable". The analysis was run in SAS 9.4 PROC GLIMMIX.
2. **This app's coefficients are derived.** They were recovered algebraically from the 162 published
   Table S2 points plus the verbatim model specification, and validated to within 0.07 percentage points.
   They must never be presented as Laub's published coefficients.
3. **The interval is a confidence interval.** The 67.2-156.1% range for fruity vegetables at 40% RSR is a
   95% **confidence** interval: Table S2's caption and the main text both say so. Prediction intervals
   exist in the paper but are only drawn as gray lines in Fig. 3 and are never tabulated, so
   `LaubCurve.anchors` cannot be interpolating them. Any wording that calls the range a prediction
   interval is wrong, in the decision record and in UI copy alike.
4. **Sample sizes.** berries n=5, fruits n=7, fruity vegetables n=3, leafy vegetables n=4, C3 cereals n=10,
   corn n=10, tubers/root crops n=2, grain legumes n=14, forages n=11. Totals 428 data points (340
   excluding controls), 58 studies, 38 crop species. **Tubers/root crops at n=2 is the weakest group in the
   paper**, and the three most garden-relevant groups (root n=2, fruity veg n=3, leafy veg n=4) are the
   three thinnest.
5. **Scale caveat, verbatim from the authors:** "uncertainties due to random plot scale effects are large,
   while at country or continental scales the mean response to shading, represented by the confidence
   intervals, is the more valid estimator." This app's users are single gardens. That is precisely the plot
   scale the authors describe as MORE uncertain, so the confidence intervals it renders are, if anything,
   optimistic for a single-garden prediction.
6. **Do not verify this app's numbers against EarthArXiv 7354.** `tekie2024-drought-index-preprint` is a different,
   non-peer-reviewed paper that merely cites Laub and publishes its own regressions using Laub's crop
   categories, e.g. `C3 Cereals Y=106.34-0.44X1`, `Berries Y=-13.36+2.22X1`, `Maize Y=61.82+0.25X1`,
   `Grain Legumes Y=104.54-0.52X1`. Those are Tekie's coefficients and none of them is Laub's. It ranks
   highly in search and is the most likely way a future reader gets this wrong.

### D. Thin-evidence areas in the agrivoltaics literature, mapped to this corpus

| # | Area | Covered by |
|---|---|---|
| 1 | Tubers/root crops n=2, fruity vegetables n=3, leafy vegetables n=4 in Laub | Section C item 4. The garden-relevant groups have the weakest support in the whole meta-analysis. |
| 2 | No DLI threshold exists for brassicas, root crops, alliums, legumes, most herbs, hops, elderberry, pawpaw or forages | **Open.** Numbers in the decision-record DLI table for these classes are inference and no measurement. Decision Record 6 already marks root/tuber and allium minima as "none established", and brassica 12-17 is explicitly labeled "inferred". Every other inferred number must be labeled the same way in the UI. |
| 3 | Air-temperature effects contradict across climates | `barron-gafford2019-arizona` (cooling, AZ) vs `weselek2021-potato` (warming, Heggelbach). Both verified. **Genuine scientific disagreement, not a citation gap.** The product must not present a single sign. |
| 4 | Soil-moisture sign also flips | `hassanpour-adeh2018-oregon` (doubled), `barron-gafford2019-arizona` (+15%), `weselek2021-potato` (reduced). Same treatment. |
| 5 | VPD/RH deltas not extractable as numbers | Gap A4. |
| 6 | Frost protection and dew formation unquantified | Gap A3. |
| 7 | Wind-reduction percentages rest on trade press | Gap A2. |
| 8 | Phenology delay has one number (lettuce 3-7 d) and no cross-crop synthesis | `marrou2013-lettuce-rue` covers the single number. **No cross-crop source exists.** Do not extrapolate the lettuce figure to other crops. |
| 9 | No published seasonal validation of any analytic ground-PAR model against distributed field PAR sensors | **Open, and it is the largest gap on the physics side.** `zainali2023-viewfactor`'s 0.3% figure is a single clear-sky day. This app's whole optical stack inherits it. |
| 10 | Japanese solar-sharing crop science nearly absent in English | Gaps A11, A12. Only `sekiyama2019-solar-sharing` located. |
| 11 | Fresh-weight vs dry-weight reporting bias may inflate apparent shade benefit for berries, fruits and fruiting vegetables | **Open.** This bites exactly the three groups where Laub shows shade *benefit* (berries 114%, fruits 113%, fruity veg 102%), which is also the pathway the water-limitation flag gates. Two independent reasons to distrust the same numbers. |
| 12 | Multi-year accumulation of shade stress in perennials is under-studied | Partly closed by `reher2025-pears`, a multi-year perennial trial showing a consistent yield reduction. Still open for berries and cane fruit. |

### E. Known gaps in the crop and horticulture data, mapped to this corpus

| # | Gap | Status |
|---|---|---|
| 1 | No per-crop DLI table in Faust & Logan 2018 | The full text has been read. What is still missing is a per-crop table, which that paper does not contain: its DLI figures are a national map in 5 mol/m2/d bins. See gap B1. |
| 2 | 2025 agrivoltaics meta-analysis paywalled | Gap B2. Still not read. Now identified as Zhang et al., `10.1007/s13593-025-01060-z`. |
| 3 | 'Beck et al. 2012' 50%-shade threshold not traced | Gap A5. Still not traced. |
| 4 | Most per-crop DLI values are Tier C inferences | **Confirmed and unchanged.** Ordinal ranking reliable, absolutes provisional. A systematic review of shade-cloth trials, convertible to DLI given site radiation, is the highest-value follow-up and would upgrade 20-30 rows from C to B. |
| 5 | Soil data sources not researched | Gap A15. |
| 6 | OSU Croptime coverage not enumerated | Gap A16. |
| 7 | PFAF and Permapeople CC BY-SA licensing needs legal review | **Open.** Decision 9 already requires isolation behind a boundary or exclusion. The image terms on PFAF add non-commercial and no-derivatives restrictions on top of the viral CC BY-SA. The gap is in the license review, and it blocks shipping. |
| 8 | Per-crop shade response conditional on climate does not exist in usable form | Gap A10. |
| 9 | Secondary sources used for base temperatures and DLI values | Gap A14. Release blocker. |

### F. Citation errors this corpus corrects

Each row is a wrong form that circulates for a source this app cites. The corpus carries the correct
record, and each entry's caveat repeats it.

| Wrong form in circulation | Actually |
|---|---|
| Holliday, R. (1968). Plant competition and crop yield. *Nature* 217:289 | **Nature 217:289-290 (1968) is by Farazdaghi & Harris.** Holliday's paper is *Nature* 186:22-24 (1960). Two different papers conflated. See `holliday1960-population-yield` and `farazdaghi1968-competition-yield`. |
| Luedeling, E. et al. (2011). The Dynamic Model provides the best description of the chill process. *HortScience* 46(3):420-425 | **HortScience 46(3):420-425 is by Zhang & Taylor**, and it is a single-site pistachio study in Australia, not a global comparison. The global-comparison claim belongs to Luedeling & Brown 2010 (`luedeling2010-chill-comparability`). |
| Patel, M. T. et al. (2018). Ground sculpting to enhance vertical bifacial solar farm output. arXiv:1806.06666 | **Authors are Khan, Sakr, Sun, Bermel & Alam.** No Patel. Version of record is *Applied Energy* 241:592-598 (2019), `10.1016/j.apenergy.2019.01.168`. |
| Fabião et al. 2018 (*Water* 10(4):489) | **Water 10(4):489 is by Simionesei, Ramos, Oliveira, Jongen et al.** No Fabião on the author list. |
| INRAE (2023). Assessment of the ground coverage ratio ... hal-04240227 | **Single-authored by Christian Dupraz.** Version of record *Agroforestry Systems* 98:2679-2696 (2024), `10.1007/s10457-023-00906-3`. hal.science does not serve it, use hal.inrae.fr. |
| Finch & Collier (2003) | **Three authors: Finch, Billiald & Collier.** *Ent. Exp. Appl.* 109:183-195. |
| Armstrong et al. 2022 (*Ecosystems and People* 18(1)) | 2023, volume 19. The 2022 inside the DOI is the acceptance year. |
| Armstrong et al. 2021 (*Ecology and Society* 26(2):6), no DOI | DOI is `10.5751/ES-12322-260206`. The plausible-looking `10.5751/ES-12160-260206` 404s. |
| Fernandes, O'Kting'ati & Maghembe 1985 (*Agroforestry Systems* 2) | 1984, *Agroforestry Systems* 2:73-86. Separate 1985 and 1989 versions exist elsewhere. |
| Gott 1983 (*Archaeology in Oceania* 18(1)) | No Gott article at that location. The murnong paper is *Australian Aboriginal Studies* 1983(2):2-18 (no DOI). The Crossref-verified Gott record in *Archaeology in Oceania* is 1982, 17:59-67. |
| Widmer et al. (2024/2025). Strawberry and raspberry under agrivoltaics: minimum DLI requirements | Title is a paraphrase, four of six given names are wrong, and the version of record is 2026, *AgriVoltaics Conference Proceedings* 4, `10.52825/agripv.v4i.2837`. |
| Doedt, C., Tajima, M., Iida, T. (2022). Agrivoltaics in Japan: a legal framework analysis | Crossref gives issue year 2024 and the short title 'Agrivoltaics in Japan'. |
| McCree (1972). The action spectrum... *Agricultural Meteorology* 9:191-216 | Crossref issued year is 1971. Volume and pages are correct. Separately, a *different* McCree 1972 paper (*Agric. Meteorol.* 10:443-453) circulates under the same short form, and the two must not be merged. |
| Marcelis et al. (2006), *Acta Horticulturae* 711:97-103 | Pages 97-104. |
| Theunissen (1994), *Pesticide Science* 42:65-72 | Pages 65-68. |
| Ouellet & Sherk (1967). Woody ornamental plant zonation indices of winter hardiness | Actual part I title: 'Woody ornamental plant zonation: I. Indices of winterhardiness', *Can. J. Plant Sci.* 47:231-238. Parts II and III also exist, and part III carries the map. |
| Peng et al., ScienceDirect PII S1161030115300125 | That PII does not correspond to the quoted title. Correct DOI: `10.1016/j.eja.2015.07.007`. |
| Tekie et al. 2024, https://eartharxiv.org/repository/object/7354/ | URL 404s. Working URL is `/repository/view/7354/`, DOI `10.31223/X5KT33`. See section C item 6 for why this preprint is dangerous. |
| PMC4416130 (*PLOS ONE* 2015 root-foraging LER study) | Not located. The root-foraging LER work is Zhang et al. 2014 and Postma & Lynch 2012, both *Annals of Botany*. |
| FAO ECOCROP via the land-resources-planning-toolbox URL | Stale stub. ECOCROP now lives at <https://gaez.fao.org/pages/ecocrop>, and `ecocrop.fao.org` is dead. |
| Décret n° 2024-318, no Legifrance id | Correct id is JORFTEXT000049386027. The widely circulated JORFTEXT000049383066 is wrong. |
| *Forest Ecology and Management* 2021 (Central European coppice decline) | Ambiguous: two plausible 2021 FEM matches exist (Slach et al. `10.1016/j.foreco.2021.119687` and Johann `10.1016/j.foreco.2021.119129`). Cannot be pinned. |
| Purdue HO-238-B-W treated as interchangeable with HO-238-W | Different publications, different author lists. HO-238-B-W adds Currey and Faust. |
| Virginia Coop. Ext. SPES-720 | Printed publication number is SPES-720NP, author Eric Stallknecht, 2025. |

No DOI in this corpus was invented. Where a DOI in circulation resolves to a different paper, both the
wrong attribution and the correct record are listed above and carried as caveats on the relevant entries.
Where no DOI could be found, the entry is marked `unverified`, and no plausible-looking one was put in
its place.
