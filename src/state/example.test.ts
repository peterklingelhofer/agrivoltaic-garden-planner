/// <reference types="node" />
// the shipped assets live in `public/`, which Vite doesn't transform, so disk is the only
// route to the bytes that really deploy
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { vi } from '../../test/vi'
import { encodeExampleRaster } from '../data/example-raster'
import { gridForExtent, sceneExtent } from '../sim/geometry'
import type { GardenPlot } from '../types/garden'
import type { DliRaster } from '../types/light'
import type { ByMonth, Meters } from '../types/units'
import { makeArray, makeBed, makePlot } from './defaults'
import { withDerived } from './derive'
import { DEFAULT_BAND, bandForTimezone } from '../data/timezone-bands'
import {
  bandsToTry,
  exampleDesignPath,
  exampleGridMatches,
  exampleRasterPath,
  loadExampleGarden,
  SHIPPED_BANDS,
} from './example'
import { polygonOf, rectangleRing, vec2 } from './geom'
import { SCHEMA_VERSION } from '../types/persist'
import { defaultDesign, PERSISTED_KEYS, snapshotDesign, STORAGE_KEY } from './persist'
import { degrees, meters } from '../types/units'
import { lightIsStale } from './light-freshness'
import { resetAppStore, showingExample, useAppStore } from './store'
import { designScenarioFixture } from './testkit'

const CELL_SIZE_M = 0.5 as Meters
const SCENE_MARGIN_M = 5 as Meters

const examplePlot = (): GardenPlot => ({
  ...makePlot(),
  beds: [
    makeBed(1, { footprint: polygonOf(rectangleRing(vec2(0, 4), 6, 1.4)) }),
    makeBed(2, { footprint: polygonOf(rectangleRing(vec2(0, -4), 6, 1.4)) }),
  ],
  arrays: [
    withDerived({
      ...makeArray(1),
      geometry: {
        ...makeArray(1).geometry,
        rowAzimuthDeg: degrees(180),
        rowCount: 2,
        pitchM: meters(9),
        rowLengthM: meters(10),
      },
    }),
  ],
})

const byMonth = <T>(make: () => T): ByMonth<T> =>
  Array.from({ length: 12 }, make) as unknown as ByMonth<T>

const rasterFor = (plot: GardenPlot): DliRaster => {
  const grid = gridForExtent(
    sceneExtent(
      plot.arrays,
      plot.beds.map((bed) => bed.footprint),
      SCENE_MARGIN_M,
      plot.boundary.exterior,
    ),
    CELL_SIZE_M,
  )
  const cells = grid.cols * grid.rows
  const ramp = (peak: number): Float32Array =>
    Float32Array.from(
      { length: cells },
      (_, i) => peak * (0.3 + (0.7 * (i % grid.cols)) / grid.cols),
    )
  return {
    grid,
    skyViewFactor: ramp(1),
    annualUnderArrayMolM2Day: ramp(30),
    annualOpenSkyMolM2Day: new Float32Array(cells).fill(41),
    monthlyUnderArrayMolM2Day: byMonth(() => ramp(25)),
    monthlyOpenSkyMolM2Day: byMonth(() => new Float32Array(cells).fill(34)),
    windows: [],
    quality: {
      subdivision: 'tregenza-mf1',
      sunDirectionCount: 1255,
      substepsPerHour: 2,
      parFraction: 0.45 as never,
      photonConversionUmolPerJ: 4.57,
      interreflectionApplied: true,
      seasonalParHalfWidthFraction: 0.1 as never,
    },
  }
}

const provenance = {
  label: 'Example agrivoltaic garden',
  generatedAtUtc: '2026-08-02T00:00:00.000Z',
  generator: 'scripts/bake-example-garden.mjs',
  siteLabel: 'Amherst, Massachusetts',
  weather: 'open-meteo typical meteorological year, 8760 hours',
  backend: 'tregenza-mf1',
  targetCellSizeM: 0.5,
  bakeElapsedMs: 1400,
  quantizationErrorMolM2Day: 0.0028,
  notes: ['baked on the CPU reference backend'],
}

const envelopeFor = (plot: GardenPlot, over: Record<string, unknown> = {}): string =>
  JSON.stringify({
    version: 1,
    savedAtUtcMillis: 1_700_000_000_000,
    sceneTimeUtcMillis: 1_723_491_000_000,
    example: provenance,
    design: { ...defaultDesign(), plot, plantYear: 3 },
    ...over,
  })

const bodyOf = (bytes: Uint8Array): ArrayBuffer =>
  bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer

interface Served {
  readonly design?: string
  readonly raster?: ArrayBuffer
  readonly designStatus?: number
  readonly rasterStatus?: number
}

const serve = (served: Served): void => {
  vi.stubGlobal('fetch', (input: string) => {
    if (input === exampleDesignPath('temperate')) {
      return Promise.resolve(
        new Response(served.design ?? '', { status: served.designStatus ?? 200 }),
      )
    }
    if (input === exampleRasterPath('temperate')) {
      return Promise.resolve(
        new Response(served.raster ?? new ArrayBuffer(0), { status: served.rasterStatus ?? 200 }),
      )
    }
    return Promise.reject(new Error(`unexpected fetch ${input}`))
  })
}

const goodAssets = (): Served => {
  const plot = examplePlot()
  return { design: envelopeFor(plot), raster: bodyOf(encodeExampleRaster(rasterFor(plot))) }
}

beforeEach(() => {
  localStorage.clear()
  resetAppStore()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('loading the shipped example', () => {
  it('reads the design through the same decoders as a restored one, and derives the rest', async () => {
    serve(goodAssets())
    const example = await loadExampleGarden()
    expect(example).not.toBeNull()
    expect(example?.design.plot?.beds).toHaveLength(2)
    expect(example?.design.plantYear).toBe(3)
    expect(example?.provenance.generator).toBe('scripts/bake-example-garden.mjs')
    // nothing derived is shipped: the per-bed light is computed here, and the compliance checks
    // by the store, over the site's own growing window
    expect(example?.bedLight).toHaveLength(2)
    expect(example?.bedLight[0]?.cellCount).toBeGreaterThan(0)
  })

  it("refuses a design the browser can't fetch", async () => {
    serve({ ...goodAssets(), designStatus: 404 })
    expect(await loadExampleGarden()).toBeNull()
  })

  it("refuses a raster the browser can't fetch", async () => {
    serve({ ...goodAssets(), rasterStatus: 404 })
    expect(await loadExampleGarden()).toBeNull()
  })

  it('refuses an envelope with no schema version', async () => {
    serve({ ...goodAssets(), design: JSON.stringify({ design: {} }) })
    expect(await loadExampleGarden()).toBeNull()
  })

  /** Stricter than a saved design on purpose: an example that is half itself is worse than none */
  it("refuses a design with any field this build can't read", async () => {
    const plot = examplePlot()
    const design = { ...defaultDesign(), plot, overlay: { visible: 'yes' } }
    serve({
      design: JSON.stringify({
        version: 1,
        sceneTimeUtcMillis: 1,
        example: provenance,
        design,
      }),
      raster: bodyOf(encodeExampleRaster(rasterFor(plot))),
    })
    expect(await loadExampleGarden()).toBeNull()
  })

  it('refuses an asset with no provenance record for its light field', async () => {
    serve({ ...goodAssets(), design: envelopeFor(examplePlot(), { example: { label: 'x' } }) })
    expect(await loadExampleGarden()).toBeNull()
  })

  it("refuses a raster whose bytes don't account for themselves", async () => {
    serve({ ...goodAssets(), raster: new ArrayBuffer(200) })
    expect(await loadExampleGarden()).toBeNull()
  })

  /**
   * The drift guard. A raster and a design that no longer describe the same scene would paint
   * the shade band on the wrong ground, and the picture would be no less convincing for it
   */
  it('refuses a raster baked for a different scene', async () => {
    const plot = examplePlot()
    const wider: GardenPlot = {
      ...plot,
      beds: [...plot.beds, makeBed(3, { footprint: polygonOf(rectangleRing(vec2(30, 0), 4, 4)) })],
    }
    expect(exampleGridMatches(plot, rasterFor(wider))).toBe(false)
    serve({ design: envelopeFor(plot), raster: bodyOf(encodeExampleRaster(rasterFor(wider))) })
    expect(await loadExampleGarden()).toBeNull()
  })
})

/**
 * The app opens on a worked example before anything has been asked, and one baked at 42 N is the
 * wrong sun for a visitor at 60 N. The band is read from the browser's time zone through a table
 * generated from tzdb coordinates, so two zones with the same name prefix, six degrees of latitude
 * apart, aren't lumped together
 */
describe('which example a visitor opens on', () => {
  it('reads the band off real tzdb coordinates rather than the zone name', () => {
    expect(bandForTimezone('Europe/Oslo')).toBe('high')
    expect(bandForTimezone('America/New_York')).toBe('temperate')
    expect(bandForTimezone('America/Phoenix')).toBe('low')
    // the pair a hand-written prefix table gets wrong: same continent, six degrees apart
    expect(bandForTimezone('America/Denver')).toBe('temperate')
    expect(bandForTimezone('Asia/Singapore')).toBe('low')
    // southern hemisphere is a latitude too
    expect(bandForTimezone('Pacific/Auckland')).toBe('temperate')
    expect(bandForTimezone(null)).toBe(DEFAULT_BAND)
    expect(bandForTimezone('Mars/Olympus_Mons')).toBe(DEFAULT_BAND)
  })

  it('never asks for a band with nothing baked for it', () => {
    for (const band of ['low', 'temperate', 'high'] as const) {
      const tried = bandsToTry(band)
      expect(tried.length).toBeGreaterThan(0)
      for (const entry of tried) expect(SHIPPED_BANDS).toContain(entry)
      expect(new Set(tried).size).toBe(tried.length)
    }
    // all three are baked, so every band asks for its own sun first and keeps the temperate one
    // behind it. The filter is what stops a band with nothing baked from paying a 404 on first
    // load, which is the case a half-deployed `public/data` hits
    expect(bandsToTry('low')).toEqual(['low', 'temperate'])
    expect(bandsToTry('high')).toEqual(['high', 'temperate'])
  })

  it("falls back to the temperate example when the regional one isn't there", async () => {
    const plot = examplePlot()
    const assets = {
      design: envelopeFor(plot),
      raster: bodyOf(encodeExampleRaster(rasterFor(plot))),
    }
    const asked: string[] = []
    vi.stubGlobal('fetch', (input: string) => {
      asked.push(input)
      if (input.includes('-high.')) return Promise.resolve(new Response('', { status: 404 }))
      if (input === exampleDesignPath('temperate')) {
        return Promise.resolve(new Response(assets.design, { status: 200 }))
      }
      return Promise.resolve(new Response(assets.raster, { status: 200 }))
    })
    expect(await loadExampleGarden('high')).not.toBeNull()
    expect(asked.some((path) => path.includes('-high.'))).toBe(true)
    expect(asked).toContain(exampleDesignPath('temperate'))
  })
})

describe('the store shows the example without adopting it', () => {
  it('puts the design, its raster and its hour on screen, and writes nothing', async () => {
    serve(goodAssets())
    const setItem = vi.spyOn(Storage.prototype, 'setItem')
    await useAppStore.getState().loadExample()

    const state = useAppStore.getState()
    expect(state.example).toBe('showing')
    expect(state.exampleProvenance?.siteLabel).toBe('Amherst, Massachusetts')
    expect(state.raster.status).toBe('ready')
    expect(state.bedLight).toHaveLength(2)
    expect(state.timeUtcMillis).toBe(1_723_491_000_000)
    // the shipped raster is stamped with the arrangement it was baked over, so an edit made on top
    // of the example reads as stale and is computed again. Left null, the example's light would
    // outlive every change made to it, an applied layout included
    expect(state.lightGeometry).not.toBeNull()
    expect(lightIsStale(state)).toBe(false)
    useAppStore.getState().upsertBed(makeBed(1, { label: 'moved' }))
    expect(lightIsStale(useAppStore.getState())).toBe(true)
    // the design on screen isn't the visitor's, so the writer never sees it
    expect(setItem).not.toHaveBeenCalledWith(STORAGE_KEY, expect.anything())
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull()
    setItem.mockRestore()
  })

  /**
   * The banner reads whose garden this is off the design itself, so anything that replaces the
   * example takes it down, including edits nobody has thought of yet. A flag cleared only by the
   * Clear button would leave "Nothing here is yours yet" standing over the grower's own garden
   * after a guided layout is applied, which reads as the suggestion never having been applied
   */
  it('stops calling it the example the moment anything on screen is the visitor own', async () => {
    serve(goodAssets())
    await useAppStore.getState().loadExample()
    expect(showingExample(useAppStore.getState())).toBe(true)

    // the guided path: applying a layout replaces the plot, the array and every planting
    await useAppStore.getState().applyDesign(designScenarioFixture('balanced'))
    expect(showingExample(useAppStore.getState())).toBe(false)
  })

  /**
   * The other direction. Comparing the whole `PersistedDesign` would take the label off a scene
   * that is still entirely the shipped example as soon as the visitor opens the questions and lets
   * them resolve a location
   */
  it('keeps calling it the example while the garden on screen is still the example', async () => {
    serve(goodAssets())
    await useAppStore.getState().loadExample()

    useAppStore.getState().setSidebarStep('plants')
    expect(showingExample(useAppStore.getState())).toBe(true)

    useAppStore.setState({ location: { latitudeDeg: 1 as never, longitudeDeg: 2 as never } })
    useAppStore.setState({ locationLabel: 'somewhere else' })
    expect(showingExample(useAppStore.getState())).toBe(true)

    useAppStore.getState().setOverlay({ opacity: 0.4 as never })
    expect(showingExample(useAppStore.getState())).toBe(true)
  })

  it('stops calling it the example after a plot edit made by hand', async () => {
    serve(goodAssets())
    await useAppStore.getState().loadExample()
    expect(showingExample(useAppStore.getState())).toBe(true)

    const plot = useAppStore.getState().plot
    expect(plot).not.toBeNull()
    useAppStore.getState().setPlot({ ...(plot as GardenPlot), label: 'my own plot' })
    expect(showingExample(useAppStore.getState())).toBe(false)
  })

  it('clears back to the design the app opens on, and never loads twice', async () => {
    serve(goodAssets())
    await useAppStore.getState().loadExample()
    useAppStore.getState().clearExample()

    const state = useAppStore.getState()
    expect(state.example).toBe('cleared')
    expect(state.exampleProvenance).toBeNull()
    expect(state.raster.status).toBe('idle')
    expect(state.bedLight).toEqual([])
    expect(snapshotDesign(state).plot).toEqual(defaultDesign().plot)
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull()

    await useAppStore.getState().loadExample()
    expect(useAppStore.getState().example).toBe('cleared')
  })

  it('yields to an edit the visitor made while the asset was still in flight', async () => {
    serve(goodAssets())
    const pending = useAppStore.getState().loadExample()
    useAppStore.getState().upsertBed(makeBed(7))
    await pending
    expect(useAppStore.getState().example).toBe('absent')
    expect(useAppStore.getState().plot?.beds.some((bed) => bed.id === 'bed-7')).toBe(true)
  })
})

/**
 * The assets that actually deploy, read off disk.
 *
 * Every other test in this file feeds the loader something it made up, which is the right way to
 * test a loader and leaves the shipped asset untested. `state/example.ts` doesn't top up a stored
 * design that is missing a persisted field: it counts the field as one it couldn't read, so a key
 * added to `PERSISTED_KEYS` breaks every baked example until it's baked again. Without this test
 * only an end-to-end run would catch that, failing thirty tests at once with the cause several
 * steps removed from the failure
 */
describe('the baked example assets on disk', () => {
  // off the working directory: `import.meta.url` would differ, since this file runs in jsdom, where
  // that resolves to a document URL and lands the read at the filesystem root
  const dataFile = (name: string): string => join(process.cwd(), 'public', 'data', name)

  it.each([...SHIPPED_BANDS])('ships a %s design carrying exactly the persisted keys', (band) => {
    const envelope = JSON.parse(readFileSync(dataFile(`example-garden-${band}.json`), 'utf8')) as {
      readonly version: number
      readonly design: Readonly<Record<string, unknown>>
    }
    expect(envelope.version).toBeLessThanOrEqual(SCHEMA_VERSION)
    // set equality both ways: a missing key is the break above, and a key that is no longer
    // persisted is the same bug seen from the other side, silently dropped on load
    expect(Object.keys(envelope.design).sort()).toEqual([...PERSISTED_KEYS].sort())
  })

  it.each([...SHIPPED_BANDS])('ships a %s light field beside it', (band) => {
    expect(readFileSync(dataFile(`example-garden-${band}.raster`)).byteLength).toBeGreaterThan(0)
  })
})

describe('a new place ends the example', () => {
  /**
   * Typing a town over the shipped example is the press the banner offers, made by another route.
   * Left up, the example's beds and its "example garden for Amherst" line would stay on screen
   * under a heading that named the new town
   */
  it('clears the example when a different place is looked up', async () => {
    serve(goodAssets())
    await useAppStore.getState().loadExample()
    expect(showingExample(useAppStore.getState())).toBe(true)
    const lookup = useAppStore
      .getState()
      .resolveSite(
        { latitudeDeg: degrees(42.32) as never, longitudeDeg: degrees(-72.63) as never },
        'Northampton',
      )
    expect(showingExample(useAppStore.getState())).toBe(false)
    expect(useAppStore.getState().example).toBe('cleared')
    expect(useAppStore.getState().locationLabel).toBe('Northampton')
    await lookup.catch(() => undefined)
  })
})
