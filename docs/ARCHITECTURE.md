# Architecture

Where this file and `docs/00-DECISIONS.md` disagree, the decision record wins.

`src/types/**` is the shared contract. A change there is a change to every module at once, so it's
made deliberately, as a change of its own.

## 1. Module boundary map

```
                          src/types/          leaf, zero runtime deps
                              |
              +---------------+----------------+
              |                                |
          src/sim/                         src/data/
     optics, geometry, DLI            network, static layers, catalog
     (framework-free)                        |
              |                          src/recommend/
              |                       gates, scoring, layout search
              +---------------+----------------+
                              |
                        src/simulation/
                 the garden run forward, season by season
                              |
                          src/state/
                       zustand store, orchestration
                              |
                          src/agent/
                    intent routing, no DOM, no GL
                              |
                +-------------+--------------+
                |                            |
            src/scene/                    src/ui/
        three.js / R3F scene graph      panels, formatting

  workers/proxy/          standalone Cloudflare Worker, imports nothing from src/
```

Dependency rule, one direction only:

```
types  ->  sim  ->  data  ->  recommend  ->  simulation  ->  state  ->  agent  ->  scene | ui
```

- `src/types/` imports nothing but `src/types/`.
- `src/sim/` imports only `src/types/` and `src/stub`.
- `src/data/` may import `types`, `sim`.
- `src/recommend/` may import `types`, `sim`, `data`.
- `src/simulation/` may import `types`, `sim`, `data`, `recommend`. It's pure: no store, no DOM, no
  GL. A season takes a value and returns a report. It runs on the same science as the
  recommendation, using the site as it was in one measured year (Decision Record 14).
- `src/state/` may import everything below it.
- `src/agent/` may import everything below it, including the store, and may import neither
  `src/scene/` nor `src/ui/`. It's the natural-language router: it turns a typed sentence into one
  of a closed list of intents and drives the store's own actions with the result. The restriction
  exists so the router stays provable without a DOM, a GL context or a mounted component, which is
  what makes the accuracy corpus in `src/agent/lexical.test.ts` runnable.
- `src/scene/` and `src/ui/` may import everything, but must not import each other's internals. They
  meet through `src/state/`.
- `workers/proxy/` is a separate TypeScript project (`tsconfig.worker.json`) and shares no code
  with the browser bundle. Duplicating the cache-key helper there is deliberate.

### 1.1 The hard rule: `src/sim/` has zero three.js and zero React

Physics must be unit-testable with no GL context and no renderer. That includes the GPU backends:
`src/sim/gpu/webgl2.ts` talks to a raw `WebGL2RenderingContext` on an `OffscreenCanvas`, and
`src/sim/gpu/webgpu.ts` talks to raw WebGPU. Neither goes through three.js. `src/scene/` only
renders.

Two mechanisms enforce this boundary, because a lint rule alone can be silenced.

**Mechanism 1: Biome `style/noRestrictedImports`, scoped by path.** It lives in `biome.jsonc` as one
`overrides` block per layer, each carrying the message that names the rule being broken:

- `src/sim/**/*.ts` may import neither `three`, `three-*`, `@react-three/*`, `react`, `react-dom`
  nor `zustand`, and no `data`, `recommend`, `state`, `scene` or `ui` module by `@/` alias or
  relative path.
- `src/types/**/*.ts` is a leaf and may only import from `src/types`.
- `workers/**/*.ts` is standalone and may not reach into `src/`.

Biome's rule has no `allowTypeImports` escape, so `import type { Vector3 } from 'three'` is also an
error. `biome.jsonc` is where a rule is added.

**Mechanism 2: a source-scanning unit test.** `src/sim/boundary.test.ts` globs every
non-test file under `src/sim/` with Bun's `Glob`, reads each one with `node:fs`, and asserts the
extracted import specifiers contain no forbidden package and no upstream layer. It runs on every
commit with the rest of the unit suite under `bun test` and survives an inline suppression
comment. Both mechanisms fail on a planted `import * as THREE from 'three'`.

## 2. Data flow

Each hop names the module that owns it. No hop is owned by two modules.

| # | Hop | Owning module | Key export |
|---|---|---|---|
| 0 | text query -> lat/lon, place label, country code. lat/lon -> the fallback timezone where no upstream names one | `src/data/geocode.ts` | `geocode`, `timezoneFor` |
| 1 | lat/lon -> Koppen, hardiness, frost normals, soil, climate normals | `src/data/static-layers.ts` | `koppenAt`, `hardinessAt`, `frostNormalsAt`, `soilAt` |
| 2 | lat/lon -> raw TMY payload -> `TmySeries` | `src/data/tmy.ts` | `fetchTmy`, `normalizeTmy` |
| 3 | TMY -> GDD curves, chill CH/CU/CP, heat days | `src/data/agronomy.ts` | `chillAccumulation`, `seasonGdd` |
| 4 | 0-3 assembled into one `Site` | `src/data/site.ts` | `resolveSite` |
| 5 | 8760 timestamps -> solar position, air mass, `E_0` | `src/sim/solar.ts` | `solarPositionSeries` |
| 6 | GHI-only source -> DNI + DHI (inert when all three present) | `src/sim/decomposition.ts` | `decompose`, `selectDecompositionModel` |
| 7 | POA transposition for the PV plane | `crates/agv-sim/src/transposition.rs`, run inside `agv_annual_chain` | `perez_transposition_1990` |
| 8 | `PvArray` + tracker + time -> `PanelPolygon[]` | `src/sim/geometry.ts` | `panelSnapshot` |
| 9 | sky discretization + cumulative weights + sun direction binning | `src/sim/skydome.ts` | `cumulativeSky`, `binSunDirections` |
| 10 | GPU cumulative-sky accumulation, with each cell's sky view factor | `src/sim/backend.ts` + `src/sim/gpu/*` + `src/sim/cpu.ts` | `SkyMatrixBackend.accumulate` |
| 11 | beam visibility, polygon shadow projection | `src/sim/shading.ts` | `beamVisibilityRaster`, `projectPanelToGround` |
| 12 | inter-reflection between the ground and the module undersides | `src/sim/viewfactor.ts` | `interreflectionGain` |
| 13 | accumulation -> `DliRaster` (annual + 12 monthly slices) | `src/sim/raster.ts` | `dliRasterFromAccumulation` |
| 14 | raster -> per-bed per-month `BedLight`, `SeasonLight`, RSR | `src/sim/aggregate.ts` | `bedLight`, `seasonLight` |
| 15 | geometry-only compliance from the raster | `src/sim/compliance.ts` | `checkMassachusettsSmart` |
| 16 | orchestration of 5-15 off the main thread | `src/sim/pipeline.ts` + `src/sim/worker/*` | `runSimulation`, `createSimClient` |
| 17 | crop catalog, ECOCROP envelopes, Laub curves, DLI class table | `src/data/crops.ts` | `loadCropCatalog`, `laubCurve` |
| 17b | CSL-JSON -> typed `CitationRecord` registry | `src/data/citations.ts` | `loadCitations` |
| 18 | companion rules, rotation constraints, traditional ecological knowledge (TEK) rules | `src/data/companions.ts`, `src/data/tek.ts` | `partitionCompanionRules` |
| 19 | gates 1-6 | `src/recommend/stages/*` | `climateGate`, `lightGate`, ... , `rank` |
| 19b | two crops in one bed -> per-term compatibility verdict | `src/recommend/compatibility.ts` | `evaluatePair`, `phOverlap` |
| 20 | RSR -> banded relative yield | `src/recommend/yield.ts` | `laubRelativeYield`, `estimateYield` |
| 20b | preferences + ranked set -> ranked polyculture combinations | `src/recommend/suggest.ts` | `suggestPolycultures`, `allocateSpace` |
| 20c | plot + a measured year + what grew before -> per-planting season outcomes | `src/simulation/season.ts` | `simulateSeason` |
| 20d | ten measured years -> the site as it was in one | `src/data/site.ts` | `siteForYear` |
| 21 | answers + site -> up to five candidate geometries, each baked (run through the light simulation) at full quality and ranked by the grower's objective | `src/recommend/design.ts` | `suggestDesigns`, `candidatesFor` |
| 21b | shipped example asset -> `PersistedDesign` + `DliRaster` | `src/state/example.ts`, `src/data/example-raster.ts` | `loadExampleGarden`, `decodeExampleRaster` |
| 22 | everything -> store slices | `src/state/slices.ts`, `src/state/store.ts` | `useAppStore` |
| 23 | store -> scene graph | `src/scene/*` | `GardenScene` |
| 24 | store -> panels, band formatting | `src/ui/*` | `formatBandPercent`, `bandBasisLabel` |

Two Perez models exist and must not be collapsed: `perez_transposition_1990` in
`crates/agv-sim/src/transposition.rs` (48-coefficient `allsitescomposite1990` POA transposition) and
`perezSkyRadianceDistribution1993` in `src/sim/skydome.ts` (the sky radiance dome feeding the 577
patches). Decision Record 2.3 requires PV yield and ground DLI to read one sky, and that shared sky
is `CumulativeSky`.

RSR (relative shade ratio) and "shade fraction" are the same quantity. The canonical name is RSR,
and `src/sim/units.ts#relativeShadeRatio` is the single definition.

Hop 2, `fetchWeather`, asks four sources in turn: Open-Meteo's ten-year hourly archive, then PVGIS,
then NASA POWER, then NSRDB. PVGIS comes second because it answers its whole typical year in about 4
s where POWER's hourly endpoint is five sequential two-year chunks at up to 12 s each. The cost is
that PVGIS gives a typical year with no measured years behind it, and the season simulation tells
the user so. The weather's dataset label carries the radiation database PVGIS chose for the place
(`PVGIS-ERA5` at Amherst, `PVGIS-SARAH3` on the Meteosat disk). A source whose year can't have
happened (`implausibleWeather`) counts as failed and the chain moves on.

### Hop 23: what owns the pointer in Move mode, and why `dragging` exists

Two things in the scene take the pointer for a drag: the plot's corner handles in
`scene/PlotBoundary.tsx` (spheres, shown only in Move mode) and `useGroundDrag` in
`scene/useGroundDrag.ts`, which moves a bed with its plants, a row of panels or a corner across the
ground while the camera holds still, and writes the store once on release. A corner drag on a
rectangle holds the opposite corner and resizes (`movedCorner` in `src/state/geom.ts`). Decision
Record 22 gives the reasons for choosing this over a `TransformControls` gizmo.

A gizmo shows why `dragging` exists. r3f's raycast passes straight through a gizmo's arrows to the
ground behind, so pressing an arrow reaches `Ground.onPointerDown` first, which calls
`selectBed(null)`, which unmounts the gizmo in the same tick it grabbed the axis. The arrows draw,
the controls report the correct axis, and nothing moves. The corner handles sit over that same
ground, so they face the same problem.

`AppState.dragging` carries the rule. Three things about it are load-bearing:

- While it's raised, a direct-manipulation handle owns the pointer.
- The handle raises it on the press and lowers it on release. `useGroundDrag` also captures the
  pointer, so a drag keeps going after the pointer leaves the object it started on.
- `Ground`, `BedMesh` and `PlantInstances` all consult it before treating a press as a click. A
  fourth click target added to the scene must do the same. Otherwise a drag over it clears the
  selection, and the cause sits in a file that never mentions `dragging`.

### Hops 13-15 describe one arrangement, and must record which

`DliRaster`, `BedLight` and the compliance checks are all functions of a particular arrangement of
panels and beds. Nothing recomputes them when that arrangement changes, so an edit leaves every one
of them describing a garden that is no longer on screen. Without a guard, dragging a panel moves the
panel, leaves the ground colors, the crop ranking and the checks where they were, and the editor
goes on reporting `Simulation: ready`.

`src/state/light-freshness.ts` is the answer, and its shape is the part worth preserving.
`lightGeometryKey(plot)` serializes everything hop 13 reads, **excluding plantings only**. Plantings
use the light answer and don't change it, so planting a bed must not send a grower back to the
simulation. A bake stamps that key onto `lightGeometry`, and `lightIsStale(state)` compares it
against the plot as it stands.

The key is derived from the plot on purpose. A `lightStale` flag set by each editing action is the
design to avoid: a one-shot boolean that the next code path forgets to set fails silently and looks
like a different bug. Every field on an array or a bed joins the key by being spread, so a geometry
field added later is covered without a second edit.

`src/ui/useAutoLight.ts` closes the loop by re-running the bake once the geometry stops changing. It
debounces on the key, for the same reason: a boolean goes true on the first nudge and stays true, so
a timer keyed on it fires part-way through the third adjustment when it should fire after the last
one.

## 3. Uncertainty is a type-system requirement

Decision Record 7 says never render a single-point yield number. The types enforce that.

`src/types/brand.ts` declares one phantom symbol:

```ts
declare const phantom: unique symbol
export type Brand<T, Tag extends string> = T & { readonly [phantom]: Tag }
export type Sealed<Tag extends string> = { readonly [phantom]: Tag }
```

`phantom` is `declare`d, so it has no runtime existence: branded values survive `postMessage`
structured clone unchanged, which matters because rasters and estimates cross the worker boundary.
It's not exported, so no module outside `src/types/` can produce a `[phantom]` key. Sealing
therefore gives nominal typing.

`src/types/band.ts` builds on it:

```ts
export interface Interval<T extends number> extends Sealed<'Interval'> { lower: T; upper: T }
export interface Banded<T extends number> extends Sealed<'Banded'> {
  interval: Interval<T>
  confidence: ConfidenceLevel
  dominantSource: UncertaintySource
  contributions: readonly UncertaintyContribution[]
}
```

Consequences, all verified by `@ts-expect-error` assertions in `src/types/contract.test.ts` (a
directive that stops erroring is itself a compile error, so the invariants can't silently rot):

1. `const y: Banded<Fraction> = 0.86` doesn't compile. A number isn't a band.
2. An object literal `{ interval: { lower, upper } }` doesn't compile. Only `banded()` and
   `interval()`, exported from `src/types/band.ts`, can mint one.
3. `YieldEstimate.relativeYield` is `Banded<Fraction>` and `absoluteYieldKgPerM2Season` is
   `Banded<KgPerM2Season> | null`. There's no scalar yield field anywhere in the type graph, so
   `const n: number = estimate.relativeYield` doesn't compile.
4. `Banded` carries `dominantSource: UncertaintySource` and an itemized `contributions` list. The UI
   formatter `src/ui/format.ts#attributionLabel` consumes it, so Decision Record 7's requirement to
   attribute the band to the crop term is met by a field on the type.
5. Collapsing a band is possible only through `unsafeBandMidpoint`, which returns
   `PointEstimate<T>` (a distinct brand). No formatter in `src/ui/format.ts` accepts a
   `PointEstimate`, so a collapsed value has nowhere to be rendered.

Where the band is computed: `src/recommend/yield.ts#laubRelativeYield` is the only producer of a
yield band. It interpolates the Laub 95% **confidence** intervals (`LaubCurve.anchors`, per the nine
crop groups) and widens with the +/-10% seasonal cumulative PAR term via `widenBand`. Optics
tolerance is one contribution, and `dominantSource` is `'crop-response'` for every yield band, as
Decision Record 7 requires.

`RasterQuality.seasonalParHalfWidthFraction` carries the optical +/-10% down from `src/sim` so the
recommender doesn't hard-code it.

### 3.1 Interval kind is a typed field

`Banded<T>` carries `intervalKind: 'confidence' | 'prediction' | 'tolerance' | 'range'` and
`banded()` requires it. `src/ui/format.ts#intervalNoun` is the only place that turns that into
English, so no renderer can name an interval type in a hardcoded string. A hardcoded noun is how a
confidence interval comes to be labeled a prediction interval.

`LaubCurve.intervalKind` goes further and is pinned to the literal `'confidence-95'`: Laub
tabulates only confidence intervals (Decision Record 7), so the wrong value is unrepresentable.

### 3.2 Provenance: an uncited scientific value is unrepresentable

`docs/CITATIONS.csl.json` (153 CSL-JSON entries) is the single source of truth for every
bibliographic field. No author, title, year, DOI or URL string may be written in TypeScript.

- `scripts/generate-citations.mjs` (`bun run generate`) reads the CSL-JSON and emits
  `src/types/citation-ids.generated.ts`, a `CITATION_IDS` const array plus `type CitationId =
  (typeof CITATION_IDS)[number]`. `CitationId` is therefore a **literal union of the 153 real
  citekeys**, so a typo is a compile error and a work that doesn't exist can't be referenced.
  `src/data/citations.test.ts` pins the union to the JSON.
- `src/data/citations.ts` is the single loader. It dynamically imports the CSL-JSON (Vite splits
  it into its own ~37 kB gzipped chunk), validates every id against the generated union and
  projects each entry into a `CitationRecord`. Everything else in the tree refers to works by
  `CitationId` alone.

`src/types/cited.ts` mirrors the `Banded` technique. `Cited<T>` is a `Sealed<'Cited'>`
discriminated union on `provenance`:

| Variant | Meaning | Extra obligation |
|---|---|---|
| `verbatim` | quoted from the source | `citations: NonEmpty<CitationId>` |
| `derived` | algebraically recovered, e.g. the Laub b1/b2 coefficients | `derivation: string` |
| `inferred` | Tier C class-level inference, most per-crop DLI values | `basis: string`, `tier` pinned to `'C'` |
| `computed` | produced by this app's own model | `model: string` |
| `unsourced` | explicitly acknowledged as having no backing | `justification: string`, `citations: readonly []` |

`NonEmpty<T> = readonly [T, ...T[]]`, so `citations: []` doesn't compile on any cited variant. The
seal means only the factories in `src/types/cited.ts` can mint one. `SourcedCited<T>` excludes the
unsourced variant, so a function that requires backing simply takes `SourcedCited<T>` and an
unsourced value is rejected at compile time. Verified by seven `@ts-expect-error` assertions in
`src/types/cited.test.ts`.

Applied at: `LightRequirement.dliMinMolM2Day`/`dliTargetMolM2Day`/`maxDesignRsr` (all
`SourcedCited`), `Crop.coldHardinessMinC`, `LaubCurve.anchors` (`VerbatimCited`),
`LaubCurve.coefficients` (**`DerivedCited`** as a static type, so the recovered coefficients can
never be presented as Laub's own published values), and `DistanceGradientTemplate.samples` (`Cited`,
because the middle points of the dehesa gradient are interpolated).

`src/data/catalog/schema.ts` maps Decision Record 7 directly onto the type: a Tier C row becomes
`citedInferred`, and only tier A and B rows may claim `citedVerbatim`.

### 3.3 Every `unsourced` value is registered and shown

Three mechanisms, each enforced in code:

1. `unsourcedClaim(value, justification)` is the only constructor and the justification is required.
2. `src/data/gaps.test.ts` globs the whole `src` tree and asserts that the set of files calling
   `unsourcedClaim(` equals a declared allowlist. A new uncited claim fails the build until it's
   registered.
3. `src/data/gaps.ts#provenanceLedger()` walks the shipped catalog, companion rules, TEK rules and
   distance gradients and returns every gap. The ledger is **derived from the data**, and
   `src/ui/SourcesPanel.tsx` renders it to users next to the full reference list with DOI links,
   access level and peer-review status.

Companion rules follow the same rule: `ScorableCompanionRule.citations` is `NonEmpty<CitationId>`,
so a grade A or B rule that can't cite a verified work doesn't typecheck. Three rules whose only
sources are absent from the corpus (`marigold-cover-nematode`, `biofumigation-macerated`,
`sorghum-residue-weed-suppression`) are grade C experimental and appear in the gaps ledger, where
they move no scores.

### 3.4 Companion evidence: D and E are unscorable by construction

`src/types/companion.ts` is a discriminated union on `grade`:

- `ScorableCompanionRule` has `grade: 'A' | 'B'` and is the only variant with `effect: Banded<Ratio>`,
  `effectMetric`, `studyCount` and `competitionPenalty`.
- `ExperimentalCompanionRule` has `grade: 'C'` and `display: 'experimental'`.
- `FolkloreCompanionRule` has `grade: 'D' | 'E'`, `display: 'folklore-panel'` and `contradictedBy`.

Every scoring signature takes `readonly ScorableCompanionRule[]`. Passing `CompanionRule[]`,
`ExperimentalCompanionRule[]` or `FolkloreCompanionRule[]` is a compile error, so the only route
into scoring is `src/data/companions.ts#partitionCompanionRules`, which returns three separately
typed arrays. Grade D/E rules can only reach `src/ui/FolklorePanel.tsx`, which accepts exactly
`FolkloreCompanionRule[]`. "Aromatic herbs repel pests" is grade E and is structurally incapable of
moving a layout.

`src/types/evidence.ts` also carries the orthogonal per-field data tier (`DataTier = 'A' | 'B' | 'C'`,
Decision Record 7: most per-crop DLI values are Tier C). `Sourced<T>` wraps a value with its tier
and citations, and `Crop.light` uses it on every DLI field.

### 3.5 Units

Every numeric field either names its unit in the property (`clearanceHeightM`, `dliMinMolM2Day`,
`monthlyPrecipMm`) or carries a branded type from `src/types/units.ts`. Angles and irradiance are
always branded, because those are the mixing bugs that actually happen:

`Degrees`, `Radians`, `DegreesLatitude`, `DegreesLongitude`, `WattsPerM2`, `WattsPerM2Sr`,
`MegajoulesPerM2Day`, `KwhPerM2Day`, `MicromolPerM2Sec`, `MolPerM2Day`, plus `Meters`, `Celsius`,
`Millibars`, `Fraction`, `Ratio`, `ChillHours`, `UtahChillUnits`, `ChillPortions`, `DegreeDaysC`,
`KgPerM2Season`, and the rest.

Brands are erased at runtime, so `Float32Array` payloads stay plain. Constructors (`degrees(x)`,
`molPerM2Day(x)`) are unchecked casts by design: validation belongs at the data boundary, where a value
enters once. `Radians` and `Degrees` are mutually unassignable, which is the whole reason
`toRadians`/`toDegrees` exist in `src/sim/units.ts`.

Discriminated unions replace optional-field soup throughout: `TrackerConfig` (four variants),
`CriterionResult` (meets/misses/approximate/estimate/not-applicable), `RecommendationVerdict`
(recommended/marginal/excluded), `LimitingFactorKind`, `AsyncState<T>`, `CompanionRule`.

## 4. Workers

Two unrelated things are called "worker". They share no code.

### 4.1 Cloudflare Worker edge proxy (`workers/proxy/`)

Responsibilities, and nothing else:

1. Proxy **PVGIS v5.3**, which forbids AJAX by written policy (Decision Record 9).
2. Proxy **NREL NSRDB**, to keep the API key server-side. Host is an env binding, so a host change
   such as `developer.nrel.gov` -> `developer.nlr.gov` is a config change. The route paths live in
   `workers/proxy/routes.ts` and have to be edited when the dataset changes. The dataset is GOES TMY
   v4.0.0.
3. Proxy **Open-Meteo**, which needs no credential and is here so the cache absorbs repeat requests.
4. Cache each of them aggressively at the edge.
5. Emit CORS headers scoped to the configured origins.

**The two reasons are different and must not be confused.** PVGIS and NSRDB are here because a
browser can't hold the credential or the policy exemption. Open-Meteo is here because it's free,
unauthenticated, rate limited per IP, and called on **every** site resolve: one developer reloading
a handful of times in a minute earns a 429, and a lecture hall opening the app at once is thirty
identical requests from thirty addresses for a town. Behind the cache that's one upstream request
per town per year. When adding another upstream, decide which reason applies. Routing something
through for neither reason burns the free tier for nothing.

The site's height above sea level comes with the weather, from the archive body's own `elevation`
field, so there's no elevation upstream to proxy. Decision Record 9b has the reason.

The Worker does **not** proxy NASA POWER, SoilGrids or Overpass. Those stay browser-direct (CORS
verified). Nominatim and Photon are proxied and held for a week (`TTL_GEOCODE_SECONDS`): a place
name is a text search against a live index, so its answer is good for days where a TMY's is good for
a year. A place-name lookup carries its own key, separate from the coordinate key below.

It doesn't transform payloads. Normalization into `TmySeries` happens in
`src/data/tmy.ts#normalizeTmy`, in the browser, where it's unit-testable.

**Cache key scheme** (`workers/proxy/cache.ts`):

```
v{schemaVersion}/{upstream}/{lat}/{lon}/{dataset}/{variant}
```

- `lat`/`lon` quantized to 0.01 deg (Decision Record 9) and rendered with `toFixed(2)`, so
  `42.3736` and `42.3701` collapse to the same key. At mid-latitudes 0.01 deg is ~1.1 km, well
  inside TMY spatial resolution.
- `dataset` distinguishes e.g. `tmy` from `seriescalc`, `upstream` is one of the ones above.
- `variant` is what tells two answers from one dataset apart. For PVGIS and NSRDB it holds a year
  range, which is all they vary by. **Open-Meteo serves the 1991-2020 climate normals and the
  2015-2024 hourly record from one path**, `/v1/archive`, distinguished only by the `daily=` or
  `hourly=` parameter, so a key built from path and location alone would answer a request for 8,760
  hourly records with thirty years of daily means, and nothing would catch the mistake.
  `Route.variant` folds the query in, **excluding the location**: the coordinates are already in the
  key, quantized, and folding the raw pair back in would give every visitor an entry of their own
  and cache nothing.
- `schemaVersion` is the manual cache-bust. Bump it when a normalizer changes meaning.
- The client's URL and the Worker's allowlist are checked against each other in
  `src/data/http.test.ts`, with no hardcoded copy on either side. A path that drifted on either side
  causes a silent outage: nothing in the client can tell a blocked path from a dead upstream.
- Key is materialized as a synthetic `https://cache.invalid/{key}` request for the Cache API.

TTLs: `TTL_TMY_SECONDS` is one year (a TMY for a fixed point doesn't change). `TTL_ERROR_SECONDS` is
60 for a 4xx and `TTL_OUTAGE_SECONDS` is 10 for a 5xx, so an upstream outage isn't pinned for a
year, or for the minute the client waits before it asks again. Held for a minute, a 502 would answer
the client's first scheduled retry with the failure it had already read. A 429 is forwarded and held
for the full 60 s, which turns a stampede into one upstream request a minute. `withRetry` in
`src/data/http.ts` correspondingly does **not** retry a 429, because the backoff there is a quarter
of a second and a retry spends two more of the requests the limit is counting. The client's deadline
for the response headers is `RESPONSE_DEADLINE_MS` (12 s) on an upstream it reaches itself and
`PROXIED_DEADLINE_MS` (20 s) through the Worker. The Worker bounds its own wait for an upstream at
`UPSTREAM_TIMEOUT_MS` (15 s) and answers 504 past it, so the client outlasts it and reads either the
upstream's answer or the 504.

`bun run dev` has no Worker behind it, so `vite.config.ts` sends `/api/proxy/open-meteo/*` straight
to its upstream. PVGIS and NSRDB can fall back silently when nothing is on `:8787`, because both
have fallbacks. The weather has none. `wrangler dev` fetches from the developer's own IP, so the
rate-limit relief the Worker exists for can't be shown locally.

### 4.2 Simulation web worker (`src/sim/worker/`)

A bake, budgeted at 0.55 s, must not block the main thread. `createSimClient()` owns a dedicated
worker, and `handleSimRequest` runs `runSimulation` inside it.

- Protocol is `SimRequest` / `SimResponse` in `src/sim/worker/protocol.ts`, a discriminated union on
  `type`. `run` carries a `cacheKey`, `cancel` carries the request id.
- Results come back with `Float32Array` buffers in the `transfer` list
  (`src/sim/raster.ts#rasterTransferables`), which moves each buffer without a copy.
- Client-side memo key is `src/sim/worker/client.ts#simCacheKey(site, plot, weather, options)`,
  hashing site coordinates, array geometry, bed footprints, TMY provenance and simulation options.
  Moving the camera, changing the month overlay or reranking crops must leave it valid. Changing
  tilt, pitch, clearance height, tracking mode or cell size must invalidate it.
- A new `run` cancels the one in flight. Progress is reported per chunk so the UI can show a
  progressive raster.

If `OffscreenCanvas` is unavailable, `createBackend` falls back to `'cpu-reference'` and the same
protocol is used, only the wall clock changes.

## 5. Performance budget

Decision Record 5 fixes the target: ~1300 passes at ~0.2 ms GPU each is ~260 ms of GPU work, chunked
40 passes per frame at an 8 ms budget, giving **~0.55 s wall clock** for a final bake. Allocation of
that 550 ms, plus the surrounding one-off costs:

| Subsystem | Owner | Budget | Note |
|---|---|---|---|
| SPA, 8760 h + 4 sub-steps | `src/sim/solar.ts` | 8 ms | Decision Record 2.4 quotes 3-8 ms, bake to `Float32Array` once per site |
| Decomposition adapter | `src/sim/decomposition.ts` | 5 ms | 0 ms on Open-Meteo/PVGIS/NSRDB, which ship all three components |
| Perez transposition, 8760 h | `crates/agv-sim/src/transposition.rs` | 3 ms | ~40 flops per timestep |
| Sky patch build + cumulative weights + sun binning | `src/sim/skydome.ts` | 25 ms | 577 patches, dedupe to 600-900 directions on a 2 deg grid |
| Panel polygon generation | `src/sim/geometry.ts` | 4 ms | once per snapshot |
| **GPU accumulation** | `src/sim/gpu/webgl2.ts` | **450 ms** | ~1300 passes, 8 ms/frame budget, 40 passes/frame, adaptive on an EMA of submission time, one draw capped by `MAX_RAY_TESTS_PER_DRAW` |
| Readback + `DliRaster` assembly | `src/sim/raster.ts` | 25 ms | one `readPixels` for the whole bake, ~1 MB at 512^2 |
| Per-bed aggregation | `src/sim/aggregate.ts` | 15 ms | polygon rasterization is cached per bed geometry |
| Compliance | `src/sim/compliance.ts` | 5 ms | one pass over the growing-season raster |
| Worker transfer | `src/sim/worker/*` | 10 ms | transferables |
| **Total bake** | | **~550 ms** | matches Decision Record 5 |

Separate budgets outside the 550 ms:

| Path | Budget | Note |
|---|---|---|
| Interactive sun scrub | 16.6 ms/frame | one shadow map per frame, `src/scene/SunRig.tsx` |
| Recommendation pipeline, 200 crops x 20 beds | 120 ms | runs on the main thread. If it goes over, move `src/recommend/pipeline.ts` into the simulation worker |
| Layout search | five candidate bakes at full quality, 1.4 to 3.4 s on an M-series GPU for plots from 10 x 7 m to 30 x 20 m (Decision Record 10c), the site's sky computed once for all five | reports progress per candidate through `DesignProgress` |
| Site resolution | network-bound | show partial `Site` as fields land, and keep the canvas responsive |
| Crop catalog | 600 KB gzipped | columnar JSON, lazy-loaded after first paint |

The frame rate during a bake was measured in headless Chromium on Metal, with an M-series GPU, a 120
Hz display, the starting plot and two runs, as `requestAnimationFrame` gaps on the main thread. The
scene keeps the display's cadence through the GPU work: while the draws run, the median gap is 8.3
ms and no gap passes 17 ms, for the first light bake and for the layout search's five bakes alike.
The frame where a bake lands is one more 8.3 ms frame. Three things keep the frame rate steady. The
bake runs in a Worker on an `OffscreenCanvas`, so its JavaScript never holds the thread that draws.
A draw is capped at `MAX_RAY_TESTS_PER_DRAW` cell-direction-panel tests (`src/sim/gpu/webgl2.ts`),
about 20 ms of GPU, because the GPU's watchdog judges command buffers. And the loop paces itself on
the GPU's own progress: a fence sync after every batch of draws, polled between tasks, at most
`IN_FLIGHT` batches submitted ahead of the fences that settle them, each batch sized in whole draws
to `frameBudgetMs` of GPU time from the cost per direction the fences measure, and the readback
issued only once the last fence has signaled. `AccumulationRequest.passesPerFrame` is the first
batch's size, before anything has been measured.

The `IN_FLIGHT` depth sets the balance between the bake's speed and the scene's frame rate. The
scene's frames share the GPU with the bake, and a frame waits behind any bake work already committed
to the GPU. `IN_FLIGHT` is four, so a frame waits at most four batches of 8 ms. At six, a fifth of
the layout search's frames stretch past 20 ms, and at twelve, half do. With the whole bake queued at
once, the landing is a 330 ms freeze with the page's main thread idle throughout: the worker's
`readPixels` waits for the backlog inside the GPU process, and the compositor waits behind it. A
bake takes about a tenth longer than it would with the whole of it queued, 0.87 s against 0.79 s for
the starting plot, and that tenth is the GPU time the scene's frames get while it runs.

The frames that do stretch are on the main thread, where a result lands: two hitches of 25 and
33 ms in the first 150 ms of the first bake as the site and its weather land, and 40 to 100 ms
once per candidate during the layout search as each one is evaluated, plus one of about 85 ms at
the search's start (the solar year and the tilt sweep `design.ts` runs before the first bake).
Those are the figures to hold the budget table above against.

WebGPU (`src/sim/gpu/webgpu.ts`) reduces the accumulation term to ~30 ms where available.
`detectBackendKind()` turns it on only where the browser supports it. WebGL2 shadow maps are the
baseline.

## 6. Resolution and correctness constants

Fixed by the Decision Record, and encoded as constants so code review doesn't reopen them:

- `src/sim/skydome.ts`: `REINHART_MF2_PATCH_COUNT = 577`, `TREGENZA_PATCH_COUNT = 145`,
  `DEFAULT_SUBSTEPS_PER_HOUR = 4`, `DEFAULT_SUN_BINNING_DEG = 2`. The beam is never binned into
  sky patches.
- `src/sim/units.ts`: `PAR_FRACTION_DEFAULT = 0.45`, `PHOTON_CONVERSION_UMOL_PER_J = 4.57`,
  `BROADBAND_UMOL_PER_J = 2.06`, `SOLAR_CONSTANT_W_M2 = 1361.1`.
- `src/sim/pipeline.ts`: `FINAL_OPTIONS.targetCellSizeM = 0.12`, the one quality every bake runs
  at.
- Ground shading is explicit per-panel polygon projection
  (`src/sim/shading.ts#projectPanelToGround`). `vfGroundSky2dOracle` in
  `src/sim/viewfactor.ts` exists solely as a unit-test oracle for the degenerate infinite-row case
  and must never appear on a user path.
- The planner runs on the typical year. A season in the simulation mode runs on a measured calendar
  year, whose `WeatherProvenance.isTypicalMeteorologicalYear` is false and whose `datasetLabel`
  names the year, or on the typical year where the grower picks it or the source has no measured
  years (Decision Record 14.1).
