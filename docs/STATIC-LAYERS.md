# Bundled climate grids

Köppen class and USDA hardiness zone are the primary climate gate. Both were derived from
Open-Meteo normals because the authoritative rasters were not in the repository. Sampling the
published rasters is a fidelity upgrade, but only if it can be done inside the data budget: the whole crop catalog is under 15 kB gzipped and a few hundred kB is the ceiling for bundled data.

This is what was measured, what ships, and what error shipping it introduces.

Rebuild everything with `node scripts/fetch-static-layers.mjs`, and reproduce the agreement
figures below with `node --max-old-space-size=12288 scripts/fetch-static-layers.mjs --validate`.
The botanical layer in section 5b has an upstream and a script of its own:
`node --max-old-space-size=8192 scripts/fetch-plant-traits.mjs [--validate]`.

Provenance for what is on disk is in `public/data/manifest.json`, which both scripts write into.
Each owns the entries carrying its own name and replaces exactly those, so rebuilding a 35 kB
grid does not cost a gigabyte of climate rasters to keep the file honest. That is why the
generator, the date, the format version and whether it validated are recorded per layer rather
than once at the top: they stopped being true of the file as a whole the moment it had two
authors.

## 1. What the naive options cost

| Candidate | Raw | Best encoding | Gzipped |
|---|---|---|---|
| Beck et al. 2018 Köppen, 1 km global, as a Uint8 grid | 933 MB (43 200 × 21 600) | 14.3 MB | 6.6 MB |
| Beck et al. 2018 Köppen, published 5 arcmin aggregate | 9.3 MB (4 320 × 2 160) | 491 kB | **219 kB** |
| Beck et al. 2018 Köppen, published 0.5° aggregate | 259 kB | 34 kB | 16 kB |
| OPHZ hardiness vector, per-state GeoJSON | 90 MB | — | — |
| OPHZ hardiness vector, national TopoJSON | 14.1 MB | — | 2.5 MB |
| USDA 2023 PRISM raster, 800 m CONUS, float32 | 87 MB (7 025 × 3 105) | — | — |
| USDA 2023 PRISM, half-zones at 0.02° | 3.8 MB | 590 kB | **228 kB** |
| USDA 2023 PRISM, half-zones at 0.0125° | 9.7 MB | 1 100 kB | 443 kB |
| USDA 2023 PRISM, 1 °F bins at 0.02° | 3.8 MB | 1 716 kB | 715 kB |
| NRCan zone polygons, published shapefile | 18.4 MB (12.8 MB zipped) | — | — |
| NRCan zones rasterized at 0.03° | 4.1 MB | 374 kB | — |
| NRCan zones rasterized at 0.05° | 1.5 MB (1 769 × 830) | 181 kB | **75 kB** |
| NRCan zones rasterized at 0.06° | 1.0 MB | 136 kB | — |

Vectorizing either raster is the wrong move. OPHZ's national TopoJSON is 14.1 MB, and it's already quantized with shared arcs; the boundaries are 450 m raster staircases, so almost every
byte is describing pixel corners. Douglas-Peucker line simplification would have to move boundaries
kilometers to reach the budget, and the app never draws these layers. It only asks what class covers
a point, and for a point query a grid is both smaller and exact to the cell.

## 2. The encoding

`AGDG v1`, written by `scripts/fetch-static-layers.mjs` and read by `decodeClassGrid` in
`src/data/static-layers.ts`. A 48-byte header, a class-name table, then the cells: each cell is
replaced by a sentinel when it equals the cell in the row below it, and the result is run-length
coded with varint run lengths. Vertically uniform bands collapse to one run, and the horizontal runs
that plain run-length encoding (RLE) would find are kept. It beats plain RLE by 2.1× on the
hardiness grid and gets within a few percent of gzip on its own, so no decompression stream is
needed in the browser and the file is still small once a CDN gzips it.

No new dependency: the encoder is Node builtins, the decoder is a `DataView` and a loop, and
`@turf/turf` is no longer needed for these layers.

## 3. Köppen: Beck et al. 2018 at 5 arcmin

The 1 km product is 6.6 MB gzipped in the best encoding measured, thirty times the budget, so it
can't be bundled. What ships is `Beck_KG_V1_present_0p083.tif`, the 5 arcmin (0.0833°, about
9.3 km) aggregate the authors publish in the same archive. Shipping their aggregate rather than
resampling ourselves means the classification is theirs end to end.

**Measured error**, every third cell of the 1 km raster in both directions, 34 359 436 land
points:

| Shipped 5 arcmin vs source 1 km | Share |
|---|---|
| Identical class | 96.95 % |
| Different class, same major group (A/B/C/D/E) | 1.59 % |
| Different major group | 1.46 % |

The 1.46 % is concentrated in mountains, where a 9.3 km cell can't hold a 1 km climate
boundary. That is the honest cost of the budget.

Whether this beats the Open-Meteo derivation is a fair question, since ERA5-Land is about 9 km
too. It does, for two reasons that are not resolution: Beck's inputs are station-interpolated
climatologies (WorldClim, CHELSA, CHPclim) rather than reanalysis, and reanalysis precipitation
bias falls directly on the aridity threshold and the s/w/f seasonality letter, which is where a
derived Köppen code is most likely to be wrong. It is also the classification a user will find
if they look their site up anywhere else.

## 4. Hardiness: the official 2023 PRISM grid, not OPHZ

Decision record 9 and `docs/CITATIONS.csl.json` both name OPHZ as the hardiness layer to bundle.
**OPHZ is traced from the 2012 USDA map image, not the 2023 one.** Its own README says so. The difference shows at real sites:

| Site | OPHZ (2012) | USDA 2023 PRISM |
|---|---|---|
| Amherst, Massachusetts | 5b | 6a |
| Denver, Colorado | 5b | 6a |
| Tucson, Arizona | 9a | 9b |
| International Falls, Minnesota | 3a | 3b |

`HardinessScheme` has one USDA member, `usda-2023`. Bundling OPHZ under it would have labeled
2012 zones as 2023 ones at every site above, which is the "silently wrong zone" failure this
work exists to prevent. So the layer that ships is `phzm_us_grid_2023.bil` from PRISM: the
official 30 arcsec (800 m) 1991-2020 mean annual extreme minimum temperature grid, nearest-
neighbor resampled to 0.02° and classified into the published 5 °F half-zones.

Classifying after resampling, never averaging: a mean of two temperatures across a zone boundary
would invent a zone neither cell is in.

**Measured error**, every third cell of the 800 m raster in both directions, 1 346 433 land
points:

| Shipped 0.02° vs source 800 m | Share |
|---|---|
| Identical half-zone | 93.92 % |
| Adjacent half-zone (5 °F, 2.8 °C) | 5.92 % |
| Two or more half-zones out | 0.16 % |

Nearly all of the disagreement is a boundary that moved by up to one cell, about 2.2 km north-south
and 1.7 km east-west at 40°N. The 0.16 % tail is where three bands meet within one cell. Half-zone
granularity was chosen over 1 °F bins because the half-zone *is* the published classification: crop
`coldHardinessMinC` values and every published hardiness rating are stated at that granularity, so
finer bins would have tripled the asset to carry precision nothing reads.

`extremeMinTempC` carries the **lower edge** of the band, which is the only temperature a zone label
defines, and it round-trips: `usdaZoneLabel(usdaZoneLowerC(label)) === label` for every zone the
grid can return. Reporting a band midpoint would claim precision the label doesn't have.

Coverage is CONUS only. Alaska, Hawaii and Puerto Rico are separate PRISM grids and are not
bundled; those sites fall through to the derivation, which is the intended behavior, not a bug.

## 5. NRCan zones ship, and are never crosswalked to USDA zones

The blocker was the type, not the data. `HardinessRating` used to require `extremeMinTempC` of
every scheme, and the NRCan shapefile carries no temperature at all: only `ph_zone`, 0a to 9a.
Filling that field would have meant assigning a USDA winter minimum to a zone that is not one.

`HardinessRating` is a discriminated union:

```ts
type HardinessRating = TemperatureHardinessRating | CompositeHardinessRating
//   scheme 'usda-2023' | 'rhs'      scheme 'nrcan'
//   extremeMinTempC: Celsius        extremeMinTempC?: never
//   zoneLabel                       zoneLabel, indexTerms
```

`extremeMinTempC?: never` is the whole mechanism. A crosswalked NRCan rating does not fail a
review, it fails `tsc`; `src/types/contract.test.ts` pins that with a `@ts-expect-error`. The
seven variables the index actually combines are named as `HardinessIndexVariable`, and
`indexTerms` is empty because the published layer carries the zone label alone.

### Why the crosswalk stays forbidden

NRCan zones come from the Ouellet and Sherk (1967) index, reinterpolated by McKenney et al.
(2001, 2025). The 4th edition combines **seven** climate variables: coldest-month mean daily
minimum, frost-free days above 0 °C, June-to-November rainfall, warmest-month mean daily
maximum, a January-rainfall winter-harshness term, maximum snow depth, and maximum 30-year wind
gust. USDA zones are **one** variable, the mean annual extreme minimum temperature. Snow depth
alone can move a Canadian zone two steps against no change in winter minimum whatsoever, and the
disagreement runs in both directions depending on which term dominates locally. Toronto is NRCan
7a; nothing about that number is a claim that Toronto reaches −17.8 °C. Any table mapping one
system onto the other is fiction, and the union makes writing one impossible.

### What a Canadian site carries

Both ratings, neither derived from the other:

1. a **temperature** rating from `derivedHardiness`: the mean of thirty annual extreme minima
   from ERA5 daily minima via Open-Meteo. This is not a crosswalk. It is the same physical
   quantity PRISM measures, computed from reanalysis instead of read off a map, and it is what
   this code already did everywhere the PRISM grid has no coverage, which includes all of Canada. It's the rating `climateGate` reads.
2. the **NRCan zone** from `nrcanZoneAt`, carried verbatim. It's displayed and gates nothing: `siteExtremeMinC` iterates only ratings that pass `isTemperatureHardiness`, so
   an index zone has no temperature for the gate to find.

`SitePanel` renders them as two separate readouts, with `NRCAN_SCHEME_NOTE` beneath saying in plain
words that the two are different systems, that the zone doesn't convert to a USDA one, and that the
temperature beside it was measured separately.

### The rasterization

The source is vector, in EPSG:3978 Lambert conformal conic. Every vertex is unprojected to
lon/lat once, so the raster is built in the frame the app samples and there is one resampling
step rather than two. The rings are then scan-converted with the even-odd rule at 0.01° and each
0.05° cell takes its center subcell, or the majority of its 25 subcells when the center is
uncovered and the cell is at least half covered.

Both parts of that rule are needed. Plain nearest-center loses coastal cities whose cell center
lands in water: Vancouver, Quebec City and Iqaluit all read *no zone*. Plain majority-of-covered
fixes those but bleeds Canadian zones across the border: Buffalo and Niagara Falls, New York come
back 7a. The shipped rule does neither, at every probe measured.

**Measured error**, every third cell of a 0.005° rasterization of the same polygons, 7 539 568
land points:

| Shipped 0.05° vs 0.005° reference | Share |
|---|---|
| Identical zone | 94.54 % |
| Adjacent half-zone | 4.21 % |
| Two or more zones out, or uncovered | 1.25 % |

| Alternative | On disk | Identical | Adjacent |
|---|---|---|---|
| 0.03° | 374 kB | 96.14 % | 3.04 % |
| **0.05°, shipped** | **181 kB** | **94.54 %** | **4.21 %** |
| 0.06° | 136 kB | 93.72 % | 4.71 % |

0.03° buys 1.6 points of exact agreement for 2.1× the bytes. 0.05° lands where the 2023 PRISM
grid already sits (93.92 % exact against its own source) at less than a third of its weight, on
a source whose zones are broad generalized bands rather than an 800 m surface.

### Agreement with the published values

The 15 probes in `NRCAN_PROBES` are checked three ways in `public/data/manifest.json`: `source`
is exact point-in-polygon against the shapefile, `shipped` is the grid the app reads, and
`published` is what NRCan's own map service returns at that coordinate
(`.../PlantHardiness_en/MapServer/0/query`). **All three agree at all 15**, from Iqaluit 0a to
Vancouver 9a. `src/data/static-layers.test.ts` asserts that equality rather than trusting it.

## 5b. Botanical regions: the one layer that is not climate

`public/data/wgsrpd-level3.grid`, written by `scripts/fetch-plant-traits.mjs` from the TDWG World
Geographical Scheme for Recording Plant Distributions, level 3. It answers one question: which
botanical country a garden stands in, so that a plant checklist indexed by those regions can be
asked whether a species is native there.

**Why level 3 and not level 2.** Level 2 lumps California in with the rest of the south-western
United States, so a plant native to one state would be reported native to six. Level 3 is also the
resolution the World Checklist of Vascular Plants (WCVP) itself is indexed at, so there's no
aggregation step to get wrong.

**Why this forced a v2 of the encoding.** Level 3 has 369 areas and `AGDG v1` stores one byte per
cell, which tops out at 254 classes. `v2` is the identical layout with 16-bit cells and a
16-bit sentinel pair; `decodeClassGrid` reads both and picks the branch off the header. Every
climate layer above stays v1 and is untouched. At 0.5 degrees the whole world costs 35 kB, which
is smaller than any of the climate grids: the regions are large and the run-length coding likes
that.

**Why 0.5 degrees.** The regions are whole botanical countries. A finer cell would resolve
coastlines to a precision the checklist behind it doesn't claim, and would cost four times the bytes
to do it.

**No fallback, deliberately.** A missing Köppen grid can be recomputed from weather. There's nothing
to recompute a botanical region from, so `botanicalAreaAt` returns null and every surface downstream
says the native answer is unknown.

**What it is checked against.** This layer shipped without a manifest entry and without probes,
which is how a decoder bug reached production: `sampleClassGrid` tested for the 8-bit no-data
sentinel as well as the 16-bit one regardless of the width it had decoded, and 255 is `PAL`, so
every garden in TDWG Palestine read as "region unknown", permanently and indistinguishably from
being at sea. It now carries the same two checks the climate layers do.

Ten probes, in `public/data/manifest.json`, each recording `source` and `shipped`. `source` is
exact point-in-polygon on the published polygons with no raster in it; `shipped` is what the grid
answers. All ten agree, and `src/data/static-layers.test.ts` re-asks the question at each probe's
coordinate through the app's own `botanicalAreaAt`, so the decoder is in the loop and not just
the rasterizer. The suite must keep two probes: Jerusalem, which is inside `PAL` and is the 255 case, and a point in the mid-Atlantic, on no land. Without the second, a probe set that could only ever answer "an area" would pass.

`--validate` measures the cost of the half-degree cell, sampling at cell centers so the scan
converter isn't compared against its own input:

| | |
|---|---|
| points compared | 21 447 |
| same botanical country | **93.67 %** |
| a country whose border falls inside the sampled cell | 6.26 % |
| anything else | 0.07 % |

The 6.26 % comes from the resolution: at half a degree a border sits inside a cell and one side of
it rounds the wrong way. The 0.07 % is small islands.

## 6. What this costs the repository and the user

| File | On disk | Gzipped | Packed in `.git` |
|---|---|---|---|
| `public/data/koppen-beck-2018.grid` | 491 kB | 219 kB | 224 kB |
| `public/data/usda-phzm-2023.grid` | 590 kB | 228 kB | 235 kB |
| `public/data/nrcan-hardiness.grid` | 181 kB | 75 kB | 77 kB |
| `public/data/wgsrpd-level3.grid` | 35 kB | 15 kB | 15 kB |
| `public/data/manifest.json` | 17 kB | 5 kB | 5 kB |
| **Total** | **1 314 kB** | **542 kB** | **556 kB** |

**NRCan added 88 kB to the repository**, 86 kB of grid and 2 kB of manifest, taking the bundled
data from 461 kB packed to 549 kB, up 19 %. The packed column is measured, not estimated:
`git hash-object -w` then `git cat-file --batch-check '%(objectsize:disk)'`, which reproduces
the two figures a previous `git gc` gave. All three grids are immutable and regenerable; a
rebuild that changes a byte adds a second copy to history, so they should be rebuilt only when
an upstream actually revises.

All three are fetched once per session on the site-resolution path and cached, so a user pays
about 525 kB over the wire on a cold visit in an app whose main bundle is already 481 kB
gzipped. Every user pays the 75 kB Canadian layer, not only Canadian ones, exactly as every user
already pays the 228 kB CONUS-only PRISM layer: skipping a fetch by bounding box would put the
extent of each asset in a second place that could drift out of step with the asset itself.

## 7. The fallback still works

`loadGrid` returns null on a 404, a network failure, a truncated body, a wrong magic number, a
version it doesn't know, a class table that overruns its section, or a run-length stream that
doesn't fill the grid exactly. Every one of those paths returns null rather than throwing, and
`koppenAt` and `hardinessAt` then derive from Open-Meteo exactly as before, with the same honest
labeling. Offline, or deployed without `public/data`, the app keeps working on the lower-fidelity derivation.
`src/data/static-layers.test.ts` covers absence, truncation, junk bytes and single-byte header
corruption.

A Canadian site with no NRCan asset keeps its ERA5 temperature rating and simply loses the zone it
can't read: nothing invents a zone, and the climate gate is unaffected because the zone was never
gating.

## 8. Disagreement is reported, not hidden

Where the grid has coverage, `hardinessAt` still computes the Open-Meteo derivation and compares. If
the two land more than one half-zone apart it returns **both** ratings, with the sampled one first.
The climate gate takes the coldest rating across the list, so a disagreement can only tighten the
gate. `SitePanel` lists every rating, so the user sees both. Within one half-zone the two agree for
practical purposes and only the sampled band is returned.

Köppen has no equivalent: `koppenAt` returns a bare `string`, so a sampled/derived disagreement has
nowhere to go. Reporting one would need either a return-type change or a provenance channel.

An NRCan zone is never compared to either of them. It is not a rival reading of the same
quantity, so the app lists them separately, as measurements of different things.

## 9. Attribution is a license obligation

**Beck et al. 2018** is CC BY 4.0 and requires citation. `beck2018-koppen` is in the corpus, is
Crossref-verified, and is rendered by `SourcesPanel`.

**The 2023 PRISM grid is not public domain.** The terms of use shipped inside the download say Oregon State University (OSU) retains ownership, and set two conditions. Condition 2 is the one that binds us: altered data
may be redistributed only if there's *"an explicit and prominently displayed disclaimer that the
map is not the official USDA Plant Hardiness Zone Map"* and the USDA-ARS and OSU logos are
eliminated. Resampling 800 m to 0.02° is an alteration. We display no logos, so the disclaimer is
mandatory.

**The NRCan layer is Open Government Licence - Canada**, which requires an attribution statement
naming the source. `NRCAN_ATTRIBUTION` carries the required "Contains information licensed under the
Open Government Licence - Canada" wording and `staticLayerLicenses()` returns it, so the credit is a
property of the data layer and can't drift from what actually ships. `mckenney2025-canada-zones`,
`mckenney2001-canada-zones` and `ouellet1967-woody-zonation` are all in the corpus and
Crossref-verified.

**Kew's World Checklist of Vascular Plants is CC BY 4.0**, which requires attribution.
`WCVP_ATTRIBUTION` carries it, `govaerts2021-wcvp` is in the corpus and Crossref-verified, and
`WGSRPD_ATTRIBUTION` names the geographical scheme the checklist is indexed by. `WCVP_SCOPE_NOTE`
carries the limit that matters to a gardener rather than to a lawyer: a checklist records where a
wild species grows. It says nothing about the cultivar in a seed packet, and a native plant can still be hard to
grow.

`USDA_PHZM_DISCLAIMER` in `src/data/static-layers.ts` carries the PRISM text and
`staticLayerLicenses()` returns it as part of the USDA attribution. `src/ui/AttributionPanel.tsx`
now renders `staticLayerLicenses()` rather than a hardcoded credit list, so every shipped layer
reaches the screen with its own license text and the redistribution condition is met. One
follow-up remains: `docs/CITATIONS.csl.json` records `usda-phzm-2023` as
`accessLevel: "public-domain"`. The terms of use above contradict that; the librarian should
reclassify it and add the OPHZ 2012 vintage to the `ophz-hardiness-geojson` caveat.
