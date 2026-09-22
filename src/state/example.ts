import { decodeExampleRaster } from '../data/example-raster'
import { bandForTimezone, type LatitudeBand } from '../data/timezone-bands'
import { bedLight } from '../sim/aggregate'
import { gridForExtent, sceneExtent } from '../sim/geometry'
import type { GardenPlot } from '../types/garden'
import type { BedLight, DliRaster } from '../types/light'
import type { EpochMillis, Meters } from '../types/units'
import { attempt, attemptAsync } from './safe'
import { decodeEnvelope, type PersistedDesign } from './persist'

export const exampleDesignPath = (band: LatitudeBand): string => `/data/example-garden-${band}.json`
export const exampleRasterPath = (band: LatitudeBand): string =>
  `/data/example-garden-${band}.raster`

/**
 * Which example to open on, and what to do when it's not there.
 *
 * The band comes from the browser's own time zone through a table generated from tzdb, so a visitor
 * at 33 N isn't shown a shade band computed for 42 N. The fallback chain matters as much as the
 * pick: a deploy carrying only some of the three, or a zone this build has never heard of, lands on
 * the temperate example, and a deploy carrying none of them opens the starting plot
 */
export const BAND_FALLBACK: LatitudeBand = 'temperate'

/**
 * Which bands actually have an example baked for them. All three, now.
 *
 * `low` is the Phoenix example, and it rests on two checks. The shade-benefit bonus reads whether
 * the bed has any shade in it: paid on site heat and water alone, it would make ramps, an eastern
 * North American woodland ephemeral, the only crop offered for beds reading 40.6 mol/m2/d of full
 * desert sun. A perennial is also scored against the hottest month, because
 * `growingSeasonMeanTempC` covers its growing window only and would never read the July that would
 * kill it.
 *
 * What it ships with is one empty bed of four, and that is the honest answer.
 * Bed 3 stands in 71 to 79 percent cumulative shade, above the ceiling of every annual in
 * the catalog. The only three crops carrying a measured ceiling above it are woodland
 * perennials that the climate gate rules out of Phoenix on the July they would have to stand
 * through. Nothing in a 163-crop catalog is both that shade-tolerant and that heat-tolerant, so
 * the bed is empty because the answer is empty. `ColdOpen` was already built for this: an empty
 * bed makes `lightDemandClause` return null and the narration falls back to its generic sentence
 */
export const SHIPPED_BANDS: readonly LatitudeBand[] = ['low', 'temperate', 'high']

/**
 * The bands to try in order. Filtered to what is shipped, so a band with nothing baked goes
 * straight to the fallback without paying for a 404 on first load
 */
export const bandsToTry = (band: LatitudeBand): readonly LatitudeBand[] =>
  [band, BAND_FALLBACK].filter(
    (entry, index, all) => SHIPPED_BANDS.includes(entry) && all.indexOf(entry) === index,
  )

export const browserBand = (): LatitudeBand => {
  const zone = attempt(() => Intl.DateTimeFormat().resolvedOptions().timeZone)
  return bandForTimezone(zone.ok ? zone.value : null)
}

/** The margin `runSimulation` puts around the scene, and the only reason the grids can be compared */
const SCENE_MARGIN_M = 5 as Meters

export const EXAMPLE_BANNER_TITLE = 'Example garden'

export const EXAMPLE_BANNER_BODY =
  'This garden is a worked example for Amherst, Massachusetts. The colors on the ground are the sunlight each spot gets over a year with these panels up, already computed. Change anything and it becomes your own. Clearing it gives you an empty plot to draw on'

/**
 * What the shipped asset says about itself. Every field is a record of how the raster beside it
 * was produced, because a DLI surface with no provenance is indistinguishable from an invented
 * one, and this app refuses to render an invented one anywhere else
 */
export interface ExampleProvenance {
  readonly label: string
  readonly generatedAtUtc: string
  readonly generator: string
  readonly siteLabel: string
  readonly weather: string
  readonly backend: string
  readonly targetCellSizeM: number
  readonly bakeElapsedMs: number
  /** The largest round-trip error the shipped encoding introduces, measured over every slice */
  readonly quantizationErrorMolM2Day: number
  readonly notes: readonly string[]
}

export interface ExampleGarden {
  readonly design: PersistedDesign
  readonly raster: DliRaster
  /**
   * Derived here, for the same reason no derived slice is ever persisted.
   * The compliance checks are the store's, since they read the site's growing window
   */
  readonly bedLight: readonly BedLight[]
  readonly provenance: ExampleProvenance
  /** The hour the scene is posed at, chosen with the framing so the shade band is legible */
  readonly sceneTimeUtcMillis: EpochMillis
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const num = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value)
const str = (value: unknown): value is string => typeof value === 'string'

const decodeProvenance = (value: unknown): ExampleProvenance | null =>
  isRecord(value) &&
  str(value.label) &&
  str(value.generatedAtUtc) &&
  str(value.generator) &&
  str(value.siteLabel) &&
  str(value.weather) &&
  str(value.backend) &&
  num(value.targetCellSizeM) &&
  num(value.bakeElapsedMs) &&
  num(value.quantizationErrorMolM2Day) &&
  Array.isArray(value.notes) &&
  value.notes.every(str)
    ? (value as unknown as ExampleProvenance)
    : null

/**
 * The grid the shipped design would be baked on today. Comparing it to the grid inside the
 * shipped raster is what stops the two halves of the asset drifting apart: a change to the
 * scene margin, the grid sizing or the array geometry makes the pair inconsistent, and an
 * overlay drawn on the wrong cells is a lie the picture tells convincingly
 */
export const exampleGridMatches = (plot: GardenPlot, raster: DliRaster): boolean => {
  const grid = gridForExtent(
    sceneExtent(
      plot.arrays,
      plot.beds.map((bed) => bed.footprint),
      SCENE_MARGIN_M,
      plot.boundary.exterior,
    ),
    raster.grid.cellSizeM,
  )
  return grid.cols === raster.grid.cols && grid.rows === raster.grid.rows
}

const fetchAsset = async (path: string): Promise<Response | null> => {
  const result = await attemptAsync(() => fetch(path))
  return result.ok && result.value.ok ? result.value : null
}

/**
 * Reads the pre-baked example, or returns null. Null is the whole error surface: a missing asset, a
 * 404, an envelope this build can't decode, a stored field that failed its shape check, a raster
 * whose bytes don't account for themselves, or a raster and a design that no longer describe the
 * same scene. A deploy without `public/data` opens on the starting plot with no light run
 */
export const loadExampleGarden = async (
  band: LatitudeBand = browserBand(),
): Promise<ExampleGarden | null> => {
  for (const candidate of bandsToTry(band)) {
    const loaded = await loadBand(candidate)
    if (loaded !== null) return loaded
  }
  return null
}

const loadBand = async (band: LatitudeBand): Promise<ExampleGarden | null> => {
  const [designResponse, rasterResponse] = await Promise.all([
    fetchAsset(exampleDesignPath(band)),
    fetchAsset(exampleRasterPath(band)),
  ])
  if (designResponse === null || rasterResponse === null) return null

  const payload = await attemptAsync(() => designResponse.text())
  if (!payload.ok) return null
  const envelope = decodeEnvelope(payload.value)
  // a dropped field means the asset predates or postdates this build's schema. An example that
  // is half itself is worse than none, so the bar here is stricter than for a saved design
  if (!envelope.ok || envelope.decoded.dropped.length > 0) return null
  const design = envelope.decoded.design
  if (design.plot === null) return null

  const provenance = decodeProvenance(envelope.envelope.example)
  const sceneTime = envelope.envelope.sceneTimeUtcMillis
  if (provenance === null || !num(sceneTime)) return null

  const raw = await attemptAsync(() => rasterResponse.arrayBuffer())
  if (!raw.ok) return null
  const raster = decodeExampleRaster(raw.value)
  if (raster === null || !exampleGridMatches(design.plot, raster)) return null

  const plot = design.plot
  return {
    design,
    raster,
    bedLight: plot.beds.map((bed) => bedLight(raster, bed.id, bed.footprint)),
    provenance,
    sceneTimeUtcMillis: sceneTime as EpochMillis,
  }
}
