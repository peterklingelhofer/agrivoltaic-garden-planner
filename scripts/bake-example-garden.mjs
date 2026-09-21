/**
 * Bakes the example garden that the app opens on when the browser holds no saved design.
 *
 *   node scripts/bake-example-garden.mjs            # fetch, bake, write public/data
 *   node scripts/bake-example-garden.mjs --dry-run  # bake and report, write nothing
 *   node scripts/bake-example-garden.mjs --no-cache # ignore the cached upstream responses
 *   bunx biome check --write public/data       # the written JSON is not formatted
 *
 * `--band=low|temperate|high` picks which of the three; all three ship.
 *
 * Nothing here authors a light number. The design below is authored: a plot, an array and four
 * beds, chosen so that one bed sits under a row, two sit in the inter-row strips and one sits in
 * open sky. Everything else is produced by the same code the browser runs, loaded straight out
 * of `src/` through Vite so there is no second implementation to drift:
 *
 *   `resolveSite`    real Open-Meteo weather (its body carries the elevation), soil and the bundled climate grids
 *   `runSimulation`  the CPU reference backend, which is the ground truth the GPU ones are
 *                    checked against, at the cell size and sky subdivision recorded below
 *   `runRecommendations` + `suggestPolycultures` + `derivePlanting`
 *                    the crops in the beds, ranked against the light this bake produced and
 *                    written through the one path that refuses a planting it cannot derive
 *
 * The raster is written by `encodeExampleRaster` from `src/data/example-raster.ts`, the same
 * module the browser decodes it with, so the format has one definition
 */
import { createServer } from 'vite'
import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const PUBLIC_DATA = join(ROOT, 'public', 'data')
const CACHE_DIR = join(ROOT, 'node_modules', '.cache', 'bake-example-garden')
/* ------------------------------- the authored part ------------------------------- */

/**
 * One example per latitude band, because a shade band baked at 42 N is the wrong sun for a
 * visitor at 33 N or 60 N and the app opens on it before anything has been asked. The bands and
 * the zone table that picks between them are generated from tzdb by
 * `scripts/generate-timezone-bands.mjs`; only ONE of these is ever fetched by a browser, so what
 * three of them cost is repository and deploy size, not load time.
 *
 * The design below is otherwise identical across the three: same array, same bed northings. That
 * is deliberate, because the whole point is to show what the same garden does under a different
 * sun
 */
const SITES = {
  low: { latitudeDeg: 33.4484, longitudeDeg: -112.074, label: 'Phoenix, Arizona' },
  temperate: { latitudeDeg: 42.3736, longitudeDeg: -72.5199, label: 'Amherst, Massachusetts' },
  high: { latitudeDeg: 60.3913, longitudeDeg: 5.3221, label: 'Bergen, Norway' },
}

const bandArg = process.argv.find((entry) => entry.startsWith('--band='))
const BAND = bandArg === undefined ? 'temperate' : bandArg.slice('--band='.length)
if (!Object.hasOwn(SITES, BAND)) {
  process.stderr.write(`unknown --band=${BAND}; expected one of ${Object.keys(SITES).join(', ')}\n`)
  process.exit(1)
}
const SITE = { latitudeDeg: SITES[BAND].latitudeDeg, longitudeDeg: SITES[BAND].longitudeDeg }
const SITE_LABEL = SITES[BAND].label

const DESIGN_OUT = join(PUBLIC_DATA, `example-garden-${BAND}.json`)
const RASTER_OUT = join(PUBLIC_DATA, `example-garden-${BAND}.raster`)

/**
 * 15:30 local (19:30 UTC) on 12 August. Late enough in the afternoon that each row throws a
 * shadow clear of its own footprint, so the alternating band the array actually makes is the
 * subject of the shot rather than a smear directly under the modules; late enough in the season
 * that a perennial is at full size and an annual sown in May is in its harvest window
 */
const SCENE_TIME_UTC_MILLIS = Date.UTC(2024, 7, 12, 19, 30, 0)

/**
 * Coarser than the app's own 0.12 m bake, to keep the shipped raster small. At 0.4 m a bed 1.5 m
 * deep spans 4 cells, enough to show a light gradient across it
 */
const TARGET_CELL_SIZE_M = 0.4
const SUBDIVISION = 'tregenza-mf1'
const SUBSTEPS_PER_HOUR = 2

/** Perennials at their mature size, which is the point of drawing growth stages at all */
const PLANT_YEAR = 3

/** Enough for a polyculture to be one, few enough that a 10.5 m2 bed is not a thicket */
const MAX_CROPS_PER_BED = 3
const FROST_PERCENTILE = 50

const BED_WIDTH_M = 7
const BED_DEPTH_M = 1.5

/**
 * Where each bed sits relative to the rows, which is the whole reason the four differ. The rows
 * stand at northings +9, 0 and -9 and face south, so their shadows sweep north across the year:
 * the deepest annual shade is a little north of a row and the brightest ground under the array
 * is a little south of the next one. One bed is put outside the array entirely, so the ranking
 * has a full-sun bed to disagree with the shaded ones about
 */
const BEDS = [
  { northingM: -13.5, note: 'open sky, clear of the southernmost row' },
  { northingM: -4.5, note: 'the strip between the southern and middle rows' },
  { northingM: 0.8, note: 'the shade band of the middle row' },
  { northingM: 4.5, note: 'the strip between the middle and northern rows' },
]

/* --------------------------------- module loading -------------------------------- */

const server = await createServer({
  root: ROOT,
  configFile: join(ROOT, 'vite.config.ts'),
  logLevel: 'warn',
  server: { middlewareMode: true, hmr: false, watch: null },
  appType: 'custom',
})
const load = (path) => server.ssrLoadModule(path)

/**
 * The climate grids are fetched from an app-absolute path in the browser. Node has no origin to
 * resolve that against, so the shipped files are served off disk: the site this example carries
 * is classified by the same rasters a visitor's browser samples, not by the fallback derivation
 */
const upstreamFetch = globalThis.fetch
const cacheUpstreams = !process.argv.includes('--no-cache')

/**
 * `/api/proxy/<upstream>/<path>` back to the upstream's own origin.
 *
 * Several lookups go through the Worker proxy so that it can identify itself to them. That path is
 * relative and only resolves against a page, so in Node it throws `ERR_INVALID_URL` and this script
 * cannot bake at all. There is no Worker here to proxy through, so the request goes where the proxy
 * would have sent it: `requestUrl` in `src/data/http.ts` is the one that builds these, and
 * `upstreamOrigin` is the table its unproxied branch reads
 */
const directUrl = (url) => {
  const prefix = `${http.WORKER_PROXY_BASE}/`
  if (!url.startsWith(prefix)) return url
  const rest = url.slice(prefix.length)
  const slash = rest.indexOf('/')
  if (slash < 0) return url
  return `${http.upstreamOrigin(rest.slice(0, slash))}${rest.slice(slash)}`
}

globalThis.fetch = async (input, init) => {
  const url = typeof input === 'string' ? input : input.url
  if (url.startsWith('/data/')) {
    const body = await readFile(join(ROOT, 'public', url.slice(1)))
    return new Response(body, { status: 200 })
  }
  const target = directUrl(url)
  // an archive year and a soil profile do not change between two runs of this script, and
  // Open-Meteo answers 429 to the third one in a row. `--no-cache` forces the network
  const key = join(
    CACHE_DIR,
    `${createHash('sha256').update(target).digest('hex').slice(0, 32)}.bin`,
  )
  if (cacheUpstreams) {
    const hit = await readFile(key).catch(() => null)
    if (hit !== null) return new Response(hit, { status: 200 })
  }
  const response = await upstreamFetch(target === url ? input : target, init)
  if (!cacheUpstreams || !response.ok) return response
  const body = Buffer.from(await response.arrayBuffer())
  await mkdir(CACHE_DIR, { recursive: true })
  await writeFile(key, body)
  return new Response(body, { status: response.status })
}

const [
  defaults,
  geom,
  derive,
  units,
  siteData,
  crops,
  companions,
  simPipeline,
  pvReport,
  recommendBridge,
  rankStage,
  suggest,
  planting,
  compatibility,
  exampleRaster,
  persistTypes,
  tek,
  persist,
  http,
] = await Promise.all(
  [
    '/src/state/defaults.ts',
    '/src/state/geom.ts',
    '/src/state/derive.ts',
    '/src/types/units.ts',
    '/src/data/site.ts',
    '/src/data/crops.ts',
    '/src/data/companions.ts',
    '/src/sim/pipeline.ts',
    '/src/sim/pv/report.ts',
    '/src/state/recommend-bridge.ts',
    '/src/recommend/stages/rank.ts',
    '/src/recommend/suggest.ts',
    '/src/recommend/planting.ts',
    '/src/recommend/compatibility.ts',
    '/src/data/example-raster.ts',
    '/src/types/persist.ts',
    '/src/data/tek.ts',
    '/src/state/persist.ts',
    '/src/data/http.ts',
  ].map(load),
)

/* ------------------------------------ the design --------------------------------- */

const { degrees, meters } = units
const { polygonOf, rectangleRing, vec2 } = geom

const array = derive.withDerived({
  ...defaults.makeArray(1),
  label: 'Elevated south-facing rows',
  geometry: {
    ...defaults.DEFAULT_ROW_GEOMETRY,
    // rows run east-west and are spaced north-south, which is what the bed northings below are
    // measured against: row centres land on -9, 0 and +9. `rowAzimuthDeg` is the direction the
    // rows RUN, so east-west is 90; it read 180 until 2026-09-01, when `panelSnapshot` had its
    // two horizontal axes exchanged and 180 was what produced the arrangement this comment
    // describes. With that fixed, 180 would space the rows east-west and leave every bed in the
    // same place relative to them, which is how this was noticed: the four beds came back
    // within 3.4 mol/m2/day of each other instead of spanning the array
    rowAzimuthDeg: degrees(90),
    rowCount: 3,
    pitchM: meters(9),
    rowLengthM: meters(16),
    modulesPerRow: 14,
    clearanceHeightM: meters(2.6),
  },
})

const beds = BEDS.map((placement, index) =>
  defaults.makeBed(index + 1, {
    label: `Bed ${String(index + 1)}`,
    footprint: polygonOf(rectangleRing(vec2(0, placement.northingM), BED_WIDTH_M, BED_DEPTH_M)),
  }),
)

const plot = {
  ...defaults.makePlot(),
  label: 'Example agrivoltaic garden',
  boundary: polygonOf(rectangleRing(vec2(0, -1.5), 28, 36)),
  beds,
  arrays: [array],
}

/* -------------------------------------- the bake --------------------------------- */

const started = Date.now()
process.stdout.write(`resolving ${SITE_LABEL}\n`)
const { site, weather } = await siteData.resolveSite(SITE, SITE_LABEL, null)

const options = {
  ...simPipeline.FINAL_OPTIONS,
  windows: [],
  backend: 'cpu-reference',
  subdivision: SUBDIVISION,
  substepsPerHour: SUBSTEPS_PER_HOUR,
  targetCellSizeM: TARGET_CELL_SIZE_M,
}

/*
  The physics core is a wasm file the browser fetches from `/agv-sim.wasm`. Node has no origin
  to fetch it from, so it is read off disk and installed into the same module graph the
  pipeline was loaded from: a second graph would install into nothing this bake can see
*/
const [core, rustCoreModule] = await Promise.all([
  load('/src/sim/core.ts'),
  load('/src/sim/rust-core.ts'),
])
const wasm = await WebAssembly.compile(await readFile(join(ROOT, 'public', 'agv-sim.wasm')))
core.installPhysicsCore(rustCoreModule.rustCore(await WebAssembly.instantiate(wasm, {})))

let lastReport = 0
const bakeStarted = Date.now()
const result = await simPipeline.runSimulation(site, plot, weather, options, (progress) => {
  if (Date.now() - lastReport < 2000) return
  lastReport = Date.now()
  const pct = ((progress.passesDone / Math.max(1, progress.passesTotal)) * 100).toFixed(0)
  process.stdout.write(`  bake ${pct}%\r`)
})
const bakeElapsedMs = Date.now() - bakeStarted
process.stdout.write(
  `baked ${String(result.raster.grid.cols)}x${String(result.raster.grid.rows)} cells at ${String(result.raster.grid.cellSizeM)} m in ${String((bakeElapsedMs / 1000).toFixed(1))} s\n`,
)

/* ------------------------------------ the planting -------------------------------- */

const catalog = await crops.loadCropCatalog()
const rules = await companions.loadCompanionRules()
const rotationConstraints = await companions.loadRotationConstraints()
const tekRules = await tek.loadTekRules()
const energy = pvReport.pvEnergyReport(site, plot.arrays, weather)

const run = await recommendBridge.runRecommendations({
  site,
  plot,
  bedLight: result.bedLight,
  catalog,
  companionRules: rules,
  rotationConstraints,
  frostPercentile: FROST_PERCENTILE,
  weights: rankStage.DEFAULT_WEIGHTS,
  preferredCropIds: [],
})
if (!run.ok) throw new Error(`ranking failed: ${run.message}`)
const calendars = run.value.calendars ?? []

const refusals = []
const plantedBeds = beds.map((bed) => {
  const light = result.bedLight.find((entry) => entry.bedId === bed.id)
  const recommendations = run.value.sets.find((entry) => entry.bedId === bed.id)
  if (light === undefined || recommendations === undefined) {
    refusals.push(`${bed.label}: nothing was ranked for it`)
    return bed
  }
  const suggested = suggest.suggestPolycultures({
    bed,
    arrays: plot.arrays,
    light,
    site,
    catalog,
    recommendations,
    preferences: suggest.emptyPreferences(),
    companionRules: rules,
    rotationConstraints,
    tekRules,
    energyRatio: energy.energyRatio,
    weights: compatibility.DEFAULT_COMPATIBILITY_WEIGHTS,
    maxCropsPerBed: MAX_CROPS_PER_BED,
  })
  const best = suggested.suggestions[0]
  if (best === undefined) {
    refusals.push(`${bed.label}: no polyculture the light and soil support`)
    return bed
  }
  const plantings = []
  for (const allocation of best.space.allocations) {
    const crop = catalog.find((entry) => entry.id === allocation.cropId)
    if (crop === undefined) continue
    const calendar = planting.calendarFor(calendars, bed.id, crop.id)
    const sowDay = (calendar === undefined ? null : planting.calendarSowDay(calendar)) ?? 1
    const derived = planting.derivePlanting({
      id: planting.plantingIdFor(bed.id, crop.id, sowDay),
      bed,
      crop,
      arrays: plot.arrays,
      calendar,
      sowDay,
      plantCount: allocation.plantCount,
    })
    if (!derived.ok) {
      refusals.push(`${bed.label}/${crop.id}: ${derived.reason}`)
      continue
    }
    plantings.push(derived.value)
  }
  return { ...bed, plantings }
})

const plantingCount = plantedBeds.reduce((total, bed) => total + bed.plantings.length, 0)
for (const bed of plantedBeds) {
  const index = beds.findIndex((entry) => entry.id === bed.id)
  const light = result.bedLight.find((entry) => entry.bedId === bed.id)
  process.stdout.write(
    `  ${bed.label} (${BEDS[index].note}) ${light.annualMeanDliMolM2Day.toFixed(1)} mol/m2/d: ${bed.plantings.map((p) => p.cropId).join(', ') || 'empty'}\n`,
  )
}
for (const refusal of refusals) process.stdout.write(`  refused: ${refusal}\n`)

/* ------------------------------------- the write ---------------------------------- */

/**
 * Built ON TOP of `defaultDesign()`, because a design written out key by key carries whatever the
 * persisted shape was on the day it was last edited, and the loader counts a persisted field
 * missing from a stored design as a field it could not read. Spreading the defaults means a new key
 * arrives here the moment it is added, and the authored values below are the only difference
 * between this and a design nobody has touched
 */
const design = {
  ...persist.defaultDesign(),
  location: SITE,
  locationLabel: SITE_LABEL,
  frostPercentile: FROST_PERCENTILE,
  plot: { ...plot, beds: plantedBeds },
  preferences: suggest.emptyPreferences(),
  compatibilityWeights: compatibility.DEFAULT_COMPATIBILITY_WEIGHTS,
  maxCropsPerBed: MAX_CROPS_PER_BED,
  overlay: defaults.DEFAULT_OVERLAY,
  effects: defaults.DEFAULT_EFFECTS,
  plantYear: PLANT_YEAR,
  // no seasons run: the example is a design, and the seasons are the visitor's to run on it. The
  // seed is the default one, which the store replaces from the place when the first season runs
  simulation: {
    seed: 1,
    season: 0,
    yearChoice: 'typical',
    history: [],
    reports: [],
    trials: [],
    revealed: [],
  },
}

// the authored keys have to BE persisted keys, or an override here is silently dropped on load
const stray = Object.keys(design).filter((key) => !persist.PERSISTED_KEYS.includes(key))
if (stray.length > 0) throw new Error(`not persisted keys: ${stray.join(', ')}`)

const encoded = exampleRaster.encodeExampleRaster(result.raster)
const quantisationErrorMolM2Day = exampleRaster.quantisationErrorOf(result.raster)

// never defaulted: a build that renamed the constant must fail here rather than stamp a version
// the app would then happily migrate from
if (typeof persistTypes.SCHEMA_VERSION !== 'number') {
  throw new Error('src/types/persist.ts no longer exports SCHEMA_VERSION')
}

const envelope = {
  version: persistTypes.SCHEMA_VERSION,
  savedAtUtcMillis: Date.now(),
  sceneTimeUtcMillis: SCENE_TIME_UTC_MILLIS,
  example: {
    label: 'Example agrivoltaic garden, Amherst, Massachusetts',
    generatedAtUtc: new Date().toISOString(),
    generator: 'scripts/bake-example-garden.mjs',
    siteLabel: SITE_LABEL,
    weather: `${weather.source} typical meteorological year, ${String(weather.utcMillis.length)} hours`,
    backend: result.raster.quality.subdivision,
    targetCellSizeM: result.raster.grid.cellSizeM,
    bakeElapsedMs,
    quantisationErrorMolM2Day,
    notes: [
      `${String(result.raster.grid.cols)} x ${String(result.raster.grid.rows)} cells at ${String(result.raster.grid.cellSizeM)} m, baked on the CPU reference backend`,
      `${String(result.raster.quality.sunDirectionCount)} binned sun directions, ${SUBDIVISION} sky, ${String(SUBSTEPS_PER_HOUR)} sub-steps per hour`,
      `${String(plantingCount)} plantings, each ranked against this bake and derived through derivePlanting`,
      ...refusals,
    ],
  },
  design,
}

const dryRun = process.argv.includes('--dry-run')
const json = `${JSON.stringify(envelope, null, 1)}\n`
if (!dryRun) {
  await mkdir(PUBLIC_DATA, { recursive: true })
  await writeFile(DESIGN_OUT, json)
  await writeFile(RASTER_OUT, encoded)
}

const kb = (bytes) => `${(bytes / 1024).toFixed(1)} kB`
process.stdout.write(
  [
    '',
    `design   ${kb(Buffer.byteLength(json))}${dryRun ? ' (not written)' : ''}`,
    `raster   ${kb(encoded.length)}${dryRun ? ' (not written)' : ''}`,
    `worst quantisation error ${quantisationErrorMolM2Day.toExponential(2)} mol/m2/day`,
    `total elapsed ${((Date.now() - started) / 1000).toFixed(1)} s`,
    '',
  ].join('\n'),
)

await server.close()
