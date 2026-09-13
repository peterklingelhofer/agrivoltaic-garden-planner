/**
 * Measures how far a design's ranking numbers move between a preview-quality bake and a
 * FINAL_OPTIONS bake, on real Open-Meteo weather, so `BAKE_RSR_RESOLUTION` and
 * `BAKE_CROP_SHARE_RESOLUTION` in `src/recommend/design.ts` can be re-measured from a checked-in
 * harness instead of a throwaway script whose settings nobody wrote down.
 *
 *   node scripts/measure-bake-resolution.mjs                    # all eight pairs, markdown table
 *   node scripts/measure-bake-resolution.mjs --site=amherst-small
 *   node scripts/measure-bake-resolution.mjs --json=/path/to/out.json
 *
 * For each site+plot pair this runs `suggestDesigns` twice against the SAME resolved site and
 * weather year, once at `PREVIEW_OPTIONS` and once at `FINAL_OPTIONS`, and reads off two things
 * per archetype: `scenario.light.meanShadeRatio`, and the crop-share term
 * `min(1, cropsAvailable.length / max(controlCropsAvailable, 1))` that `design.ts` builds
 * `foodRaw` from, using the `no-array-control` scenario of THAT SAME run as the control so a run
 * is never compared against a different run's crop count. The per-site figure reported is the
 * MAXIMUM absolute movement across archetypes, matching the table at `design.ts:1032-1055` and
 * `docs/00-DECISIONS.md:610-640` so a re-measurement is directly comparable to the one on file.
 *
 * The wizard answers held fixed across every pair are `DEFAULT_WIZARD_ANSWERS` from
 * `src/state/onboarding.ts`, with only the plot boundary, `location` and `locationLabel`
 * varied per pair. Because that default can change after this file is written, its values as of
 * this measurement are recorded here rather than left implicit:
 *
 *   objective: { food: 0.35, energy: 0.35, water: 0.15, simplicity: 0.15 } (the "balanced" preset)
 *   ambition: 'mixed-vegetables', exposure: 'open', mounting: 'any', maxHeightM: null,
 *   irrigationAvailable: true, experience: 'novice'
 *
 * If a future run of this script reports different `DEFAULT_WIZARD_ANSWERS` values than the ones
 * above, the two measurements are not the same experiment and should not be diffed against each
 * other without saying so
 */
import { createServer } from 'vite'
import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const CACHE_DIR = join(ROOT, 'node_modules', '.cache', 'measure-bake-resolution')

/* ------------------------------- the eight site+plot pairs ------------------------------- */

/**
 * One entry per row of the table this script reproduces. `site` groups pairs that share
 * coordinates (Bergen and Amherst each appear twice, at two plot sizes) so `resolveSite` is
 * called once per location and the same resolved weather feeds both plots, which is what keeps a
 * different archive fetch between two plot sizes from putting weather noise into a number that is
 * supposed to be bake error alone
 */
const SITES = {
  tromso: { location: { latitudeDeg: 69.6489, longitudeDeg: 18.9551 }, label: 'Tromso, Norway' },
  bergen: { location: { latitudeDeg: 60.3913, longitudeDeg: 5.3221 }, label: 'Bergen, Norway' },
  edinburgh: {
    location: { latitudeDeg: 55.9533, longitudeDeg: -3.1883 },
    label: 'Edinburgh, United Kingdom',
  },
  amherst: {
    location: { latitudeDeg: 42.3736, longitudeDeg: -72.5199 },
    label: 'Amherst, Massachusetts',
  },
  phoenix: {
    location: { latitudeDeg: 33.4484, longitudeDeg: -112.074 },
    label: 'Phoenix, Arizona',
  },
  singapore: { location: { latitudeDeg: 1.3521, longitudeDeg: 103.8198 }, label: 'Singapore' },
}

const PAIRS = [
  {
    key: 'tromso',
    site: 'tromso',
    tableSite: 'Tromso NO',
    plotLabel: '3.5 x 2.4 m',
    widthM: 3.5,
    depthM: 2.4,
  },
  {
    key: 'bergen-small',
    site: 'bergen',
    tableSite: 'Bergen NO',
    plotLabel: '3.5 x 2.4 m',
    widthM: 3.5,
    depthM: 2.4,
  },
  {
    key: 'bergen-large',
    site: 'bergen',
    tableSite: 'Bergen NO',
    plotLabel: '16 x 11 m',
    widthM: 16,
    depthM: 11,
  },
  {
    key: 'edinburgh',
    site: 'edinburgh',
    tableSite: 'Edinburgh GB',
    plotLabel: '3.5 x 2.4 m',
    widthM: 3.5,
    depthM: 2.4,
  },
  {
    key: 'amherst-small',
    site: 'amherst',
    tableSite: 'Amherst MA',
    plotLabel: '3.5 x 2.4 m',
    widthM: 3.5,
    depthM: 2.4,
  },
  {
    key: 'amherst-large',
    site: 'amherst',
    tableSite: 'Amherst MA',
    plotLabel: '16 x 11 m',
    widthM: 16,
    depthM: 11,
  },
  {
    key: 'phoenix',
    site: 'phoenix',
    tableSite: 'Phoenix AZ',
    plotLabel: '3.5 x 2.4 m',
    widthM: 3.5,
    depthM: 2.4,
  },
  {
    key: 'singapore',
    site: 'singapore',
    tableSite: 'Singapore',
    plotLabel: '3.5 x 2.4 m',
    widthM: 3.5,
    depthM: 2.4,
  },
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
 * resolve that against, so the shipped files are served off disk, matching what
 * `bake-example-garden.mjs` does for the same reason. Everything else is cached to disk keyed by
 * a hash of the URL, which is what makes a re-run free and what stops Open-Meteo answering 429 to
 * a request this script already made
 */
const upstreamFetch = globalThis.fetch
const cacheUpstreams = !process.argv.includes('--no-cache')
/*
 * Spacing is for the ten-year hourly archive and for nothing else. `MIN_INTERVAL_MS` in
 * `src/data/http.ts` already carries a per-upstream rate for every host this touches, and it is
 * observed by the same code path the browser runs, so a blanket delay here would be a second
 * policy competing with that one: it made a single site take four minutes of sleeping. What
 * `http.ts` does not know is that this script asks for eight sites back to back, which is the
 * shape Open-Meteo answers 429 to
 */
const SPACED_ORIGIN = 'https://archive-api.open-meteo.com'
let lastRealFetchAt = 0
const NETWORK_SPACING_MS = 25_000
const sleep = (ms) => new Promise((done) => setTimeout(done, ms))

/** Archive fills in flight, keyed by cache path, awaited by `resolvedFor` between attempts */
const warming = new Map()

const warm = async (url, key, init) => {
  const sinceLast = Date.now() - lastRealFetchAt
  if (sinceLast < NETWORK_SPACING_MS) await sleep(NETWORK_SPACING_MS - sinceLast)
  lastRealFetchAt = Date.now()
  const started = Date.now()
  // the caller's headers, never the caller's signal: this outlives the request that asked for it
  const response = await upstreamFetch(url, { headers: init?.headers }).catch((error) => {
    process.stdout.write(`  archive fill threw: ${String(error)}\n`)
    return null
  })
  if (response === null || !response.ok) {
    if (response !== null) process.stdout.write(`  archive fill ${String(response.status)}\n`)
    warming.delete(key)
    return
  }
  const body = Buffer.from(await response.arrayBuffer())
  await mkdir(CACHE_DIR, { recursive: true })
  await writeFile(key, body)
  process.stdout.write(
    `  archive filled: ${String((body.length / 1e6).toFixed(1))} MB in ${String(((Date.now() - started) / 1000).toFixed(1))} s\n`,
  )
}
globalThis.fetch = async (input, init) => {
  const url = typeof input === 'string' ? input : input.url
  if (url.startsWith('/data/')) {
    const body = await readFile(join(ROOT, 'public', url.slice(1)))
    return new Response(body, { status: 200 })
  }
  /*
   * PVGIS and NSRDB reach their origins through the Cloudflare worker at `WORKER_PROXY_BASE`, and
   * there is no worker in front of a Vite dev server in middleware mode. Answered 502 at once so
   * `tmy.ts` reads them as unavailable and moves on, which is what they ARE here. Left to the
   * network they instead burn the full 12 s response deadline each, three retries deep, per
   * fallback, per attempt: Tromso spent four minutes failing to reach a host this script was
   * never going to have. Refusing immediately is also the honest answer, since a run that
   * silently reached a real NSRDB would be measuring a different weather year from every other
   */
  if (url.startsWith('/api/')) return new Response(null, { status: 502 })
  const key = join(CACHE_DIR, `${createHash('sha256').update(url).digest('hex').slice(0, 32)}.bin`)
  if (cacheUpstreams) {
    const hit = await readFile(key).catch(() => null)
    if (hit !== null) return new Response(hit, { status: 200 })
  }
  /*
   * The ten-year archive is filled OUT OF BAND rather than answered here, and the reason is that
   * `http.ts` gives an upstream 12 s to send response headers. That deadline is right for a
   * browser, where a visitor is watching a spinner, and it is unmeetable for eight 4 MB archive
   * queries in a row: Open-Meteo starts pacing the fourth one, the deadline fires, and the
   * fallback chain walks off to hosts this script cannot reach. Racing the app's own deadline by
   * relaxing it here would be measuring a build nobody ships.
   *
   * So this attempt is refused at once and a patient fetch is started behind it, carrying neither
   * the caller's abort signal nor any deadline. `resolvedFor` waits for those before it retries,
   * and the retry reads the cache. What the app sees is one upstream that was briefly unavailable,
   * which is exactly what it was
   */
  // gated on the cache, because filling one nobody will read leaves the archive unreachable
  if (cacheUpstreams && url.startsWith(SPACED_ORIGIN)) {
    if (!warming.has(key)) warming.set(key, warm(url, key, init))
    return new Response(null, { status: 503 })
  }
  /*
   * Failures are reported, always, and this is not debugging left in. `resolveSite` falls through
   * a chain of weather sources and reports only the LAST one's error, so a run where Open-Meteo
   * quietly failed and NASA POWER answered instead would look identical to a healthy one while
   * measuring a different weather year. What upstream a figure came from is provenance, and this
   * is the only place that sees it
   */
  const response = await upstreamFetch(input, init).catch((error) => {
    process.stdout.write(`  upstream threw: ${url.slice(0, 90)}: ${String(error)}\n`)
    throw error
  })
  if (!response.ok) process.stdout.write(`  upstream ${response.status}: ${url.slice(0, 90)}\n`)
  if (!cacheUpstreams || !response.ok) return response
  const body = Buffer.from(await response.arrayBuffer())
  await mkdir(CACHE_DIR, { recursive: true })
  await writeFile(key, body)
  return new Response(body, { status: response.status })
}

const [siteData, crops, companions, simPipeline, design, onboarding, units, defaults, geom] =
  await Promise.all(
    [
      '/src/data/site.ts',
      '/src/data/crops.ts',
      '/src/data/companions.ts',
      '/src/sim/pipeline.ts',
      '/src/recommend/design.ts',
      '/src/state/onboarding.ts',
      '/src/types/units.ts',
      '/src/state/defaults.ts',
      '/src/state/geom.ts',
    ].map(load),
  )

const { meters } = units

/* ------------------------------------- resolving sites ------------------------------------ */

/**
 * `resolveSite` fans out to several upstreams under a 12 s header deadline (`src/data/http.ts`),
 * and from a laptop that deadline is missed often enough that a first attempt at a fresh site
 * throws about half the time. Retrying rather than dying is not papering over that: the fetch
 * cache above keeps whatever DID arrive, so each attempt starts closer than the last, and the
 * alternative is losing seven completed pairs to the eighth site's archive query
 */
const RESOLVE_ATTEMPTS = 4

// resolved once per location and reused across every pair sharing it, and across the preview and
// final runs of a single pair: both are the point, per the module comment above
const resolvedSites = new Map()
const resolvedFor = async (siteKey) => {
  const cached = resolvedSites.get(siteKey)
  if (cached !== undefined) return cached
  const spec = SITES[siteKey]
  for (let attempt = 1; ; attempt += 1) {
    process.stdout.write(
      `resolving ${spec.label}${attempt === 1 ? '' : ` (attempt ${String(attempt)})`}\n`,
    )
    try {
      const resolved = await siteData.resolveSite(spec.location, spec.label, null)
      resolvedSites.set(siteKey, resolved)
      return resolved
    } catch (error) {
      if (attempt >= RESOLVE_ATTEMPTS) throw error
      process.stdout.write(`  ${String(error)}, retrying\n`)
      // whatever the archive fill above started, finished, so the retry reads it off disk
      await Promise.all([...warming.values()])
    }
  }
}

/* ------------------------------------- the measurement ------------------------------------- */

const catalog = await crops.loadCropCatalog()
const companionRules = await companions.loadCompanionRules()
const rotationConstraints = await companions.loadRotationConstraints()

/** Matches `foodRaw`'s crop-share term at `design.ts:1202-1210` exactly */
const cropShareOf = (scenario, controlCropsAvailable) =>
  Math.min(1, scenario.production.cropsAvailable.length / Math.max(controlCropsAvailable, 1))

const runAt = async (answers, site, weather, options) => {
  const started = Date.now()
  const result = await design.suggestDesigns(answers, {
    site,
    weather,
    catalog,
    companionRules,
    rotationConstraints,
    backend: 'cpu-reference',
    targetCellSizeM: options.targetCellSizeM,
    subdivision: options.subdivision,
    substepsPerHour: options.substepsPerHour,
  })
  return { result, elapsedMs: Date.now() - started }
}

/**
 * Per-archetype movement between a preview run and a final run of the SAME pair. The two runs are
 * expected to offer the same archetype set, because `candidatesFor` depends on the answers and the
 * site's geometry, neither of which differs between them; a mismatch here means the harness itself
 * is comparing two different searches and is a bug worth stopping on rather than averaging over
 */
const diffsFor = (preview, final) => {
  const previewControl = preview.scenarios.find((s) => s.candidate.archetype === 'no-array-control')
  const finalControl = final.scenarios.find((s) => s.candidate.archetype === 'no-array-control')
  if (previewControl === undefined || finalControl === undefined) {
    throw new Error('no-array-control scenario missing from a run')
  }
  const previewControlCrops = previewControl.production.cropsAvailable.length
  const finalControlCrops = finalControl.production.cropsAvailable.length
  return preview.scenarios.map((previewScenario) => {
    const archetype = previewScenario.candidate.archetype
    const finalScenario = final.scenarios.find((s) => s.candidate.archetype === archetype)
    if (finalScenario === undefined) {
      throw new Error(
        `archetype ${archetype} present at preview quality but missing at final quality`,
      )
    }
    const previewCropShare = cropShareOf(previewScenario, previewControlCrops)
    const finalCropShare = cropShareOf(finalScenario, finalControlCrops)
    return {
      archetype,
      previewRsr: previewScenario.light.meanShadeRatio,
      finalRsr: finalScenario.light.meanShadeRatio,
      rsrMoved: Math.abs(finalScenario.light.meanShadeRatio - previewScenario.light.meanShadeRatio),
      previewCropShare,
      finalCropShare,
      cropShareMoved: Math.abs(finalCropShare - previewCropShare),
      previewScore: previewScenario.score,
      finalScore: finalScenario.score,
      scoreMoved: Math.abs(finalScenario.score - previewScenario.score),
    }
  })
}

const maxOf = (perArchetype, field) => Math.max(...perArchetype.map((entry) => entry[field]))

const measurePair = async (pair) => {
  const { site, weather } = await resolvedFor(pair.site)
  // the plot's own boundary is the one source of its size, so the pair's rectangle is a plot
  const answers = onboarding.answersOf(
    onboarding.DEFAULT_WIZARD_ANSWERS,
    SITES[pair.site].location,
    SITES[pair.site].label,
    {
      ...defaults.makePlot(),
      boundary: geom.polygonOf(
        geom.rectangleRing(geom.vec2(0, 0), meters(pair.widthM), meters(pair.depthM)),
      ),
    },
  )
  process.stdout.write(`  ${pair.tableSite} ${pair.plotLabel}: preview bake\n`)
  const preview = await runAt(answers, site, weather, simPipeline.PREVIEW_OPTIONS)
  process.stdout.write(`    preview done in ${(preview.elapsedMs / 1000).toFixed(1)} s\n`)
  process.stdout.write(`  ${pair.tableSite} ${pair.plotLabel}: final bake\n`)
  const final = await runAt(answers, site, weather, simPipeline.FINAL_OPTIONS)
  process.stdout.write(`    final done in ${(final.elapsedMs / 1000).toFixed(1)} s\n`)

  const perArchetype = diffsFor(preview.result, final.result)
  return {
    key: pair.key,
    tableSite: pair.tableSite,
    plotLabel: pair.plotLabel,
    previewElapsedMs: preview.elapsedMs,
    finalElapsedMs: final.elapsedMs,
    maxRsrMoved: maxOf(perArchetype, 'rsrMoved'),
    maxCropShareMoved: maxOf(perArchetype, 'cropShareMoved'),
    maxScoreMoved: maxOf(perArchetype, 'scoreMoved'),
    perArchetype,
  }
}

/* ------------------------------------------ CLI -------------------------------------------- */

const siteArg = process.argv.find((entry) => entry.startsWith('--site='))
const jsonArg = process.argv.find((entry) => entry.startsWith('--json='))
const selectedKey = siteArg === undefined ? null : siteArg.slice('--site='.length)
const jsonPath = jsonArg === undefined ? null : jsonArg.slice('--json='.length)

if (selectedKey !== null && !PAIRS.some((pair) => pair.key === selectedKey)) {
  process.stderr.write(
    `unknown --site=${selectedKey}; expected one of ${PAIRS.map((pair) => pair.key).join(', ')}\n`,
  )
  process.exit(1)
}

const pairsToRun = selectedKey === null ? PAIRS : PAIRS.filter((pair) => pair.key === selectedKey)

/*
 * A pair that cannot resolve its site is reported and stepped over rather than thrown out of the
 * whole sweep. Bergen's archive query missed the 12 s header deadline four attempts running and
 * took seven finished pairs down with it, and the bakes are the expensive part: an incomplete
 * table that says which row is missing is worth more than no table. The upstream cache means a
 * re-run resumes rather than repeats, so the honest recovery is to run this again
 */
const rows = []
const failed = []
for (const pair of pairsToRun) {
  try {
    rows.push(await measurePair(pair))
  } catch (error) {
    process.stdout.write(`  ${pair.tableSite} ${pair.plotLabel} FAILED: ${String(error)}\n`)
    failed.push({ key: pair.key, tableSite: pair.tableSite, error: String(error) })
  }
}

/* ----------------------------------------- report ------------------------------------------ */

const fmt4 = (value) => value.toFixed(4)

const tableLines = [
  '| site | plot | season RSR moved | crop share moved | score moved |',
  '|---|---|---|---|---|',
  ...rows.map(
    (row) =>
      `| ${row.tableSite} | ${row.plotLabel} | ${fmt4(row.maxRsrMoved)} | ${fmt4(row.maxCropShareMoved)} | ${fmt4(row.maxScoreMoved)} |`,
  ),
]
process.stdout.write(`\n${tableLines.join('\n')}\n\n`)

if (rows.length > 0) {
  const worstCropShare = rows.reduce((a, b) => (b.maxCropShareMoved > a.maxCropShareMoved ? b : a))
  const worstRsr = rows.reduce((a, b) => (b.maxRsrMoved > a.maxRsrMoved ? b : a))
  process.stdout.write(
    `worst crop-share movement: ${fmt4(worstCropShare.maxCropShareMoved)} at ${worstCropShare.tableSite} ${worstCropShare.plotLabel}\n`,
  )
  process.stdout.write(
    `worst RSR movement: ${fmt4(worstRsr.maxRsrMoved)} at ${worstRsr.tableSite} ${worstRsr.plotLabel}\n`,
  )
}

// said loudly, because the two constants are the WORST value in the table and a table missing a
// row cannot support a claim about the worst of anything
if (failed.length > 0) {
  process.stdout.write(
    `\nINCOMPLETE: ${String(failed.length)} pair(s) did not run: ${failed.map((entry) => entry.key).join(', ')}\n`,
  )
}

if (jsonPath !== null) {
  const envelope = {
    generatedAtUtc: new Date().toISOString(),
    generator: 'scripts/measure-bake-resolution.mjs',
    previewOptions: simPipeline.PREVIEW_OPTIONS,
    finalOptions: simPipeline.FINAL_OPTIONS,
    wizardAnswers: onboarding.DEFAULT_WIZARD_ANSWERS,
    rows,
    failed,
  }
  await mkdir(dirname(resolve(jsonPath)), { recursive: true })
  await writeFile(resolve(jsonPath), `${JSON.stringify(envelope, null, 1)}\n`)
  process.stdout.write(`raw results written to ${resolve(jsonPath)}\n`)
}

await server.close()
