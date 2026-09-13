import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { vi } from '../../test/vi'
import { loadCropCatalog } from '../data/crops'
import { encodeExampleRaster } from '../data/example-raster'
import { bedFixture, bedLightFixture, plotFixture } from '../recommend/testkit'
import { gridForExtent, sceneExtent } from '../sim/geometry'
import { makeArray, makeBed, makePlot } from '../state/defaults'
import { withDerived } from '../state/derive'
import { exampleDesignPath, exampleRasterPath } from '../state/example'
import { polygonOf, rectangleRing, vec2 } from '../state/geom'
import { defaultDesign } from '../state/persist'
import { getAppState, resetAppStore, showingExample, useAppStore } from '../state/store'
import type { Crop } from '../types/crop'
import type { GardenPlot } from '../types/garden'
import type { BedId, CropId, PlantingId } from '../types/ids'
import type { BedLight, DliRaster } from '../types/light'
import type { ByMonth, Meters, MolPerM2Day } from '../types/units'
import { dayOfYear, degrees, meters } from '../types/units'
import { ColdOpen, COLD_OPEN_DWELL_MS } from './ColdOpen'
import { coldOpenReading, lightDemandClause } from './cold-open'
import { mount } from './testkit'

/* ------------------------------ shared fixtures ------------------------------ */

const atDli = (bedId: string, molM2Day: number): BedLight => ({
  ...bedLightFixture(bedId, 0),
  annualMeanDliMolM2Day: molM2Day as MolPerM2Day,
})

const planted = (bedId: string, cropIds: readonly string[]) =>
  bedFixture(bedId, {
    label: bedId,
    plantings: cropIds.map((cropId) => ({
      id: `${bedId}:${cropId}` as PlantingId,
      bedId: bedId as BedId,
      cropId: cropId as CropId,
      cultivarId: null,
      role: 'target-crop' as const,
      tier: 'herb-ground' as const,
      sowDay: dayOfYear(120),
      harvestStartDay: dayOfYear(200),
      harvestEndDay: dayOfYear(214),
      plantCount: 10,
    })),
  })

let catalog: readonly Crop[] = []

/* --------------------------- the shipped-asset stub --------------------------- */

const CELL_SIZE_M = 0.5 as Meters
const SCENE_MARGIN_M = 5 as Meters

const byMonth = <T,>(make: () => T): ByMonth<T> =>
  Array.from({ length: 12 }, make) as unknown as ByMonth<T>

/** Two beds eight meters apart under a two-row array, which is what makes them read differently */
const examplePlotFixture = (): GardenPlot => ({
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
  // a north-south gradient, so the two beds sit at different points on it and the narration has
  // a real brightest and a real dimmest to quote
  const ramp = (peak: number): Float32Array =>
    Float32Array.from(
      { length: cells },
      (_, i) => peak * (0.2 + (0.8 * Math.floor(i / grid.cols)) / grid.rows),
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

const serveExample = (): void => {
  const plot = examplePlotFixture()
  const raster = encodeExampleRaster(rasterFor(plot))
  const body = JSON.stringify({
    version: 1,
    savedAtUtcMillis: 1_700_000_000_000,
    sceneTimeUtcMillis: 1_723_491_000_000,
    example: {
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
    },
    design: { ...defaultDesign(), plot },
  })
  vi.stubGlobal('fetch', (input: string) => {
    if (input === exampleDesignPath('temperate')) return Promise.resolve(new Response(body))
    if (input === exampleRasterPath('temperate')) {
      return Promise.resolve(
        new Response(
          raster.buffer.slice(
            raster.byteOffset,
            raster.byteOffset + raster.byteLength,
          ) as ArrayBuffer,
        ),
      )
    }
    return Promise.reject(new Error(`unexpected fetch ${input}`))
  })
}

beforeEach(async () => {
  localStorage.clear()
  resetAppStore()
  catalog = await loadCropCatalog()
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

/* ---------------------------------- the words --------------------------------- */

describe('what the cold open is allowed to say', () => {
  it('quotes the measured brightest and dimmest beds, and nothing in between', () => {
    const plot = plotFixture([planted('bed-1', []), planted('bed-2', []), planted('bed-3', [])])
    const reading = coldOpenReading(
      plot,
      [atDli('bed-1', 28.7), atDli('bed-2', 20.5), atDli('bed-3', 10.97)],
      catalog,
    )
    expect(reading?.dim.label).toBe('bed-3')
    expect(reading?.bright.label).toBe('bed-1')
    // formatted exactly as the legend and the bed panel print it, off the same helper
    expect(reading?.body).toContain('11.0 mol/m²/d')
    expect(reading?.body).toContain('28.7 mol/m²/d')
    expect(reading?.body).not.toContain('20.5')
  })

  it("says nothing at all rather than a placeholder when there's no light field yet", () => {
    const plot = plotFixture([planted('bed-1', []), planted('bed-2', [])])
    expect(coldOpenReading(plot, [], catalog)).toBeNull()
    expect(coldOpenReading(plot, [atDli('bed-1', 12)], catalog)).toBeNull()
    expect(coldOpenReading(null, [atDli('bed-1', 12), atDli('bed-2', 30)], catalog)).toBeNull()
  })

  it('refuses the comparison when both ends print the same figure', () => {
    const plot = plotFixture([planted('bed-1', []), planted('bed-2', [])])
    expect(
      coldOpenReading(plot, [atDli('bed-1', 18.02), atDli('bed-2', 18.04)], catalog),
    ).toBeNull()
  })

  it('names crop TYPES read out of the catalog, never a crop and never a cultivar', () => {
    const plot = plotFixture([
      planted('bed-dim', ['ramps', 'wild-ginger']),
      planted('bed-bright', ['bean-pole', 'brussels-sprouts']),
    ])
    const clause = lightDemandClause(catalog, plot, 'bed-dim' as BedId, 'bed-bright' as BedId)
    expect(clause).toBe('Beans and peas want more light than shade-tolerant herbs do.')
    // the crops standing in the beds are what the classes were derived FROM, so neither the
    // crop nor its cultivar is ever the thing the sentence promises anything about
    expect(clause).not.toContain('ramps')
    expect(clause).not.toContain('bean')
  })

  it('drops the crop clause rather than say the opposite of its own numbers', () => {
    const backward = plotFixture([
      planted('bed-dim', ['bean-pole']),
      planted('bed-bright', ['ramps']),
    ])
    expect(
      lightDemandClause(catalog, backward, 'bed-dim' as BedId, 'bed-bright' as BedId),
    ).toBeNull()

    const sameGroup = plotFixture([
      planted('bed-dim', ['ramps']),
      planted('bed-bright', ['sorrel']),
    ])
    expect(
      lightDemandClause(catalog, sameGroup, 'bed-dim' as BedId, 'bed-bright' as BedId),
    ).toBeNull()

    const empty = plotFixture([planted('bed-dim', []), planted('bed-bright', ['bean-pole'])])
    expect(lightDemandClause(catalog, empty, 'bed-dim' as BedId, 'bed-bright' as BedId)).toBeNull()

    // and the reading still comes back: the measured half of it never depended on the catalog
    const reading = coldOpenReading(empty, [atDli('bed-dim', 11), atDli('bed-bright', 29)], catalog)
    expect(reading?.body).toContain('Crops differ in how much light they want')
  })

  it('makes no promise about any one crop, and says so in its own last line', () => {
    const plot = plotFixture([planted('bed-dim', ['ramps']), planted('bed-bright', ['bean-pole'])])
    const reading = coldOpenReading(plot, [atDli('bed-dim', 11), atDli('bed-bright', 29)], catalog)
    expect(reading?.caveat).toContain('provisional')
    // `src/ui/dli.ts` is explicit that the absolutes are the weak claim, so no sentence here may
    // say a named crop will do well anywhere
    expect(reading?.body).not.toMatch(/\b(will thrive|does well|guaranteed|best crop)\b/i)
  })
})

/* --------------------------------- the surface -------------------------------- */

describe('the cold open on screen', () => {
  it('says nothing over a garden that is not the example', async () => {
    useAppStore.setState({
      plot: plotFixture([planted('bed-1', []), planted('bed-2', [])]),
      bedLight: [atDli('bed-1', 11), atDli('bed-2', 29)],
    })
    expect(showingExample(getAppState())).toBe(false)
    const harness = await mount(<ColdOpen />)
    expect(harness.find('panel-cold-open')).toBeNull()
    await harness.unmount()
  })

  it('narrates the example, with the figures its own bake produced', async () => {
    serveExample()
    await getAppState().loadExample()
    expect(showingExample(getAppState())).toBe(true)

    const harness = await mount(<ColdOpen />)
    const panel = harness.get('panel-cold-open')
    const dim = Math.min(...getAppState().bedLight.map((light) => light.annualMeanDliMolM2Day))
    const bright = Math.max(...getAppState().bedLight.map((light) => light.annualMeanDliMolM2Day))
    expect(panel.textContent).toContain(dim.toFixed(1))
    expect(panel.textContent).toContain(bright.toFixed(1))
    // passive: there's nothing here to press, which is what keeps it off the interaction budget
    expect(panel.querySelectorAll('button, a, input, select, [tabindex]')).toHaveLength(0)
    await harness.unmount()
  })

  it('ends the moment the visitor takes over, and leaves the sentence behind', async () => {
    serveExample()
    await getAppState().loadExample()
    const harness = await mount(<ColdOpen />)
    const said = harness.get('panel-cold-open').textContent

    await act(async () => {
      globalThis.dispatchEvent(new Event('pointerdown'))
    })
    expect(harness.get('panel-cold-open').getAttribute('data-phase')).toBe('leaving')

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 300))
    })
    const settled = harness.get('panel-cold-open')
    expect(settled.className).toBe('visually-hidden')
    // out of the picture, still in the accessibility tree: the sentence survives the graphic
    expect(settled.textContent).toBe(said)
    await harness.unmount()
  })

  it('gets out of the way on its own, with nothing asked of anybody', async () => {
    serveExample()
    await getAppState().loadExample()
    vi.useFakeTimers()
    const harness = await mount(<ColdOpen />)
    expect(harness.get('panel-cold-open').className).toBe('cold-open')

    await act(async () => {
      vi.advanceTimersByTime(COLD_OPEN_DWELL_MS)
    })
    // the dwell hands over to the fade, which is what the second advance is: two timers, because
    // the element goes on being drawn for as long as it's fading and only then stops being drawn
    expect(harness.get('panel-cold-open').getAttribute('data-phase')).toBe('leaving')
    await act(async () => {
      vi.advanceTimersByTime(1_000)
    })
    expect(harness.get('panel-cold-open').className).toBe('visually-hidden')
    await harness.unmount()
  })
})
