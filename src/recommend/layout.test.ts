import { describe, expect, it } from 'bun:test'
import { byMonth } from '../sim/units'
import { makeArray } from '../state/defaults'
import type { Polygon2D } from '../types/geo'
import type { DliRaster, GrowingWindow } from '../types/light'
import type { BedLayout, BedPlacement } from '../types/onboarding'
import type { PvArray } from '../types/pv'
import { degrees, meters, type Fraction, type Meters } from '../types/units'
import {
  BED_CEILING,
  bedCountFor,
  evenFootprints,
  BED_GAP_M,
  MAX_BEDS,
  MIN_BED_DEPTH_M,
  PLOT_MARGIN_M,
  POST_KEEP_CLEAR_M,
  placeBeds,
  twoLightClusters,
  type LayoutRequest,
} from './layout'

/**
 * The gap this closes: evenly spaced full-width rectangles down the middle of the plot never look
 * at the light. Under a row array the ground is banded, so a bed placed by geometry alone lands
 * half in the deep shade under a row and half in the bright gap beside it, and every crop decision
 * taken on that bed is taken against a daily light integral that is true of no part of it. These
 * tests assert the structure and the direction of the fix, never an absolute light figure: the
 * field below is synthetic, so a pinned number here would pin the fixture
 */

const WINDOW: GrowingWindow = { startMonth: 4, endMonth: 9 }
const CELL_M = 0.25
const OPEN_SHAPE = [4, 7, 12, 20, 28, 34, 36, 32, 24, 14, 6, 3]

/** Rows running east-west, so the light bands and the beds both run across the plot */
const rowArray = (rowCount: number, pitchM: number): PvArray =>
  makeArray(1, {
    geometry: {
      collectorWidthM: meters(3),
      pitchM: meters(pitchM),
      rowLengthM: meters(7),
      rowCount,
      modulesPerRow: 6,
      clearanceHeightM: meters(2.5),
      rowAzimuthDeg: degrees(90),
      originM: { xM: meters(0), yM: meters(0) },
    },
  })

const rowCentresM = (array: PvArray): readonly number[] =>
  Array.from(
    { length: array.geometry.rowCount },
    (_, row) => (row - (array.geometry.rowCount - 1) / 2) * array.geometry.pitchM,
  )

/** True where a panel row stands overhead, which is where the deep-shade strip is */
const underRow = (array: PvArray, halfBandM: number, yM: number): boolean =>
  rowCentresM(array).some((centre) => Math.abs(yM - centre) < halfBandM)

interface FieldSpec {
  readonly widthM: number
  readonly depthM: number
  readonly shadeAt: (xM: number, yM: number) => number
}

const rasterFixture = (spec: FieldSpec): DliRaster => {
  const marginM = 3
  const minXM = -spec.widthM / 2 - marginM
  const minYM = -spec.depthM / 2 - marginM
  const cols = Math.ceil((spec.widthM + 2 * marginM) / CELL_M)
  const rows = Math.ceil((spec.depthM + 2 * marginM) / CELL_M)
  const cells = cols * rows
  const shade = new Float32Array(cells)
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      shade[row * cols + col] = spec.shadeAt(
        minXM + (col + 0.5) * CELL_M,
        minYM + (row + 0.5) * CELL_M,
      )
    }
  }
  const open = byMonth((month) => new Float32Array(cells).fill(OPEN_SHAPE[month] ?? 0))
  const under = byMonth((month) => {
    const values = new Float32Array(cells)
    for (let index = 0; index < cells; index += 1) {
      values[index] = (OPEN_SHAPE[month] ?? 0) * (1 - (shade[index] ?? 0))
    }
    return values
  })
  return {
    grid: {
      extent: {
        minXM: minXM as Meters,
        minYM: minYM as Meters,
        maxXM: (minXM + cols * CELL_M) as Meters,
        maxYM: (minYM + rows * CELL_M) as Meters,
      },
      cellSizeM: CELL_M as Meters,
      cols,
      rows,
    },
    skyViewFactor: new Float32Array(cells).fill(1),
    annualUnderArrayMolM2Day: new Float32Array(cells),
    annualOpenSkyMolM2Day: new Float32Array(cells),
    monthlyUnderArrayMolM2Day: under,
    monthlyOpenSkyMolM2Day: open,
    windows: [],
    quality: {
      subdivision: 'tregenza-mf1',
      sunDirectionCount: 145,
      substepsPerHour: 1,
      parFraction: 0.45 as Fraction,
      photonConversionUmolPerJ: 4.57,
      interreflectionApplied: false,
      seasonalParHalfWidthFraction: 0.1 as Fraction,
    },
  }
}

const HALF_BAND_M = 1.5
const ARRAY = rowArray(3, 6)
const WIDTH_M = 8
const DEPTH_M = 12

const bandedRequest = (over: Partial<LayoutRequest> = {}): LayoutRequest => ({
  plotWidthM: WIDTH_M,
  plotDepthM: DEPTH_M,
  arrays: [ARRAY],
  raster: rasterFixture({
    widthM: WIDTH_M,
    depthM: DEPTH_M,
    shadeAt: (_xM, yM) => (underRow(ARRAY, HALF_BAND_M, yM) ? 0.55 : 0.05),
  }),
  window: WINDOW,
  ...over,
})

const banded = (over: Partial<LayoutRequest> = {}): BedLayout => {
  const placed = placeBeds(bandedRequest(over))
  expect(placed.ok, placed.ok ? '' : placed.reason).toBe(true)
  if (!placed.ok) throw new Error(placed.reason)
  return placed.value
}

const extentAlongY = (footprint: Polygon2D): readonly [number, number] => {
  const ys = footprint.exterior.map((point) => point.yM as number)
  return [Math.min(...ys), Math.max(...ys)]
}

describe('beds are placed by the light, not by the geometry', () => {
  it('never lets one bed straddle the edge between a shaded band and a bright gap', () => {
    for (const bed of banded().beds) {
      const [lo, hi] = extentAlongY(bed.footprint)
      const samples = Array.from({ length: 25 }, (_, index) => lo + ((hi - lo) * index) / 24)
      const shaded = samples.map((yM) => underRow(ARRAY, HALF_BAND_M, yM))
      expect(new Set(shaded).size, `${bed.label} spans a shade boundary`).toBe(1)
      expect(bed.zone).toBe(shaded[0] === true ? 'shaded-band' : 'bright-gap')
    }
  })

  it('produces a mix that genuinely differs in light rather than four of the same bed', () => {
    const layout = banded()
    const zones = new Set(layout.beds.map((bed) => bed.zone))
    expect(zones).toContain('bright-gap')
    expect(zones).toContain('shaded-band')
    const shades = layout.beds.map((bed) => bed.summary.shadeRatio as number)
    // the spread, not a value: what matters is that the beds are deliberately unalike
    expect(Math.max(...shades) - Math.min(...shades)).toBeGreaterThan(0.2)
    const dli = layout.beds.map((bed) => bed.summary.meanGrowingSeasonDli as number)
    expect(Math.max(...dli)).toBeGreaterThan(Math.min(...dli))
  })

  it('reports each bed its own mean, worst cell and shade ratio', () => {
    for (const bed of banded().beds) {
      expect(bed.summary.meanGrowingSeasonDli).toBeGreaterThan(0)
      expect(bed.summary.worstCellGrowingSeasonDli).toBeGreaterThan(0)
      expect(bed.summary.worstCellGrowingSeasonDli).toBeLessThanOrEqual(
        bed.summary.meanGrowingSeasonDli,
      )
      expect(bed.summary.shadeRatio).toBeGreaterThanOrEqual(0)
      expect(bed.light.bedId).toBe(bed.bedId)
      expect(bed.light.cellCount).toBeGreaterThan(0)
    }
  })

  it('explains the mix in words a novice can act on, naming both kinds of bed', () => {
    const layout = banded()
    expect(layout.banded).toBe(true)
    expect(layout.explanation).toMatch(/two levels/i)
    expect(layout.explanation).toMatch(/out of full sun/i)
    expect(layout.explanation).toMatch(/set fruit/i)
    for (const bed of layout.beds) expect(bed.reason.length).toBeGreaterThan(40)
  })
})

describe('a bed you cannot reach into is refused', () => {
  it('keeps every bed inside the working margin', () => {
    for (const bed of banded().beds) {
      const [lo, hi] = extentAlongY(bed.footprint)
      expect(lo).toBeGreaterThanOrEqual(-DEPTH_M / 2 + PLOT_MARGIN_M - 1e-9)
      expect(hi).toBeLessThanOrEqual(DEPTH_M / 2 - PLOT_MARGIN_M + 1e-9)
      for (const point of bed.footprint.exterior) {
        expect(Math.abs(point.xM)).toBeLessThanOrEqual(WIDTH_M / 2 - PLOT_MARGIN_M + 1e-9)
      }
    }
  })

  it('leaves a working gap between one bed and the next', () => {
    const spans = banded()
      .beds.map((bed) => extentAlongY(bed.footprint))
      .sort((a, b) => a[0] - b[0])
    for (let index = 1; index < spans.length; index += 1) {
      const previous = spans[index - 1] as readonly [number, number]
      const current = spans[index] as readonly [number, number]
      expect(current[0] - previous[1]).toBeGreaterThanOrEqual(BED_GAP_M - 1e-9)
    }
  })

  it('never digs a bed where the array stands', () => {
    for (const bed of banded().beds) {
      const [lo, hi] = extentAlongY(bed.footprint)
      for (const centre of rowCentresM(ARRAY)) {
        const overlaps = lo < centre + POST_KEEP_CLEAR_M && hi > centre - POST_KEEP_CLEAR_M
        expect(overlaps, `${bed.label} sits on the row at ${String(centre)} m`).toBe(false)
      }
    }
  })
})

describe('the same answers always place the same beds', () => {
  it('is deterministic, with no seed and no iteration behind it', () => {
    const shape = (layout: BedLayout): unknown =>
      layout.beds.map((bed: BedPlacement) => [bed.bedId, bed.zone, bed.footprint])
    expect(shape(banded())).toEqual(shape(banded()))
    expect(banded().explanation).toBe(banded().explanation)
  })

  it('finds the two populations exactly rather than approximately', () => {
    const clusters = twoLightClusters([1, 1, 1, 9, 9, 9])
    expect(clusters?.thresholdMolM2Day).toBe(5)
    expect(clusters?.darkMeanMolM2Day).toBe(1)
    expect(clusters?.brightMeanMolM2Day).toBe(9)
    expect(twoLightClusters([4])).toBeNull()
  })
})

describe('a plot with no bands gets no invented ones', () => {
  it('gives the open-sky control an even layout and says why', () => {
    const placed = placeBeds({
      plotWidthM: WIDTH_M,
      plotDepthM: DEPTH_M,
      arrays: [],
      raster: rasterFixture({ widthM: WIDTH_M, depthM: DEPTH_M, shadeAt: () => 0 }),
      window: WINDOW,
    })
    expect(placed.ok).toBe(true)
    if (!placed.ok) return
    expect(placed.value.banded).toBe(false)
    expect(placed.value.beds.every((bed) => bed.zone === 'even-light')).toBe(true)
    expect(placed.value.explanation).toMatch(/no panels over it/i)
    const shades = placed.value.beds.map((bed) => bed.summary.shadeRatio as number)
    expect(Math.max(...shades) - Math.min(...shades)).toBeLessThan(0.02)
    const spans = placed.value.beds
      .map((bed) => extentAlongY(bed.footprint))
      .sort((a, b) => a[0] - b[0])
    for (let index = 1; index < spans.length; index += 1) {
      const previous = spans[index - 1] as readonly [number, number]
      const current = spans[index] as readonly [number, number]
      expect(current[0] - previous[1]).toBeCloseTo(BED_GAP_M, 6)
    }
  })

  it('falls back to an even spread when the two strips barely differ', () => {
    const layout = banded({
      raster: rasterFixture({
        widthM: WIDTH_M,
        depthM: DEPTH_M,
        shadeAt: (_xM, yM) => (underRow(ARRAY, HALF_BAND_M, yM) ? 0.06 : 0.03),
      }),
    })
    expect(layout.banded).toBe(false)
    expect(layout.explanation).toMatch(/too little to plant them differently/i)
  })
})

describe('a space with no room for a bed is refused, with the reason', () => {
  it('refuses rather than placing a bed nobody can work in', () => {
    const placed = placeBeds(bandedRequest({ plotWidthM: 1.2, plotDepthM: 1.4 }))
    expect(placed.ok).toBe(false)
    if (placed.ok) return
    expect(placed.reason).toContain(MIN_BED_DEPTH_M.toFixed(1))
    expect(placed.reason).toMatch(/reach into/i)
  })

  it('honours the width and the depth it was given', () => {
    const wide = banded({ plotWidthM: 14 })
    for (const bed of wide.beds) {
      const xs = bed.footprint.exterior.map((point) => point.xM as number)
      expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(14 - 2 * PLOT_MARGIN_M, 6)
    }
  })
})

/**
 * How many beds a plot is cut into.
 *
 * A back garden gets four beds, and a field gets a share of its ground, up to a ceiling set by what
 * a person can read and the engine can rank
 */
describe('the bed count for a plot', () => {
  it('keeps four for a garden and gives a field the ceiling', () => {
    expect(bedCountFor(8, 6)).toBe(MAX_BEDS)
    expect(bedCountFor(12, 8)).toBe(MAX_BEDS)
    expect(bedCountFor(60, 40)).toBe(BED_CEILING)
    // and rises between the two rather than jumping
    const middling = bedCountFor(30, 20)
    expect(middling).toBeGreaterThan(MAX_BEDS)
    expect(middling).toBeLessThanOrEqual(BED_CEILING)
  })

  it('never asks for fewer than one bed, whatever the numbers are', () => {
    expect(bedCountFor(0, 0)).toBe(MAX_BEDS)
    expect(bedCountFor(-5, 10)).toBe(MAX_BEDS)
  })

  it('places more than four beds on a field-sized plot', () => {
    const fieldWidthM = 60
    const fieldDepthM = 40
    const field = rowArray(6, 8)
    const placed = placeBeds({
      plotWidthM: fieldWidthM,
      plotDepthM: fieldDepthM,
      arrays: [field],
      raster: rasterFixture({
        widthM: fieldWidthM,
        depthM: fieldDepthM,
        shadeAt: (_xM, yM) => (underRow(field, HALF_BAND_M, yM) ? 0.55 : 0.05),
      }),
      window: WINDOW,
    })
    expect(placed.ok).toBe(true)
    if (!placed.ok) return
    expect(placed.value.beds.length).toBeGreaterThan(MAX_BEDS)
    // every one still has its own light, so a bigger plot is not a coarser answer
    expect(new Set(placed.value.beds.map((bed) => bed.bedId)).size).toBe(placed.value.beds.length)
  })
})

describe('the bed cap', () => {
  it('caps the geometry-only preview at the number asked for, and never below one', () => {
    expect(evenFootprints(40, 30)).toHaveLength(bedCountFor(40, 30))
    expect(evenFootprints(40, 30, 4)).toHaveLength(4)
    expect(evenFootprints(40, 30, 0)).toHaveLength(1)
  })
})
