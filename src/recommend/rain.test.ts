import { describe, expect, it } from 'bun:test'
import { cosDeg } from '../sim/math'
import { makeArray, makePlot } from '../state/defaults'
import { polygonAreaM2, polygonOf, rectangleRing, vec2 } from '../state/geom'
import type { Bed, GardenPlot } from '../types/garden'
import type { PvArray, RowGeometry, TrackerConfig } from '../types/pv'
import { degrees, type Meters } from '../types/units'
import type { TmySeries } from '../types/weather'
import { rainField, rainHourWindMS } from './rain'
import { bedFixture, plotFixture, tmyFixture } from './testkit'

const ORIGIN = vec2(10, 10)
const ROW_GEOMETRY: RowGeometry = {
  collectorWidthM: 3.524 as Meters,
  pitchM: 9 as Meters,
  rowLengthM: 13.6 as Meters,
  rowCount: 1,
  modulesPerRow: 12,
  clearanceHeightM: 2.5 as Meters,
  rowAzimuthDeg: degrees(90),
  originM: ORIGIN,
}
const SOUTH_FACING: TrackerConfig = {
  mode: 'fixed',
  tiltDeg: degrees(25),
  surfaceAzimuthDeg: degrees(180),
}
const NORTH_FACING: TrackerConfig = {
  mode: 'fixed',
  tiltDeg: degrees(25),
  surfaceAzimuthDeg: degrees(0),
}
const FLAT_TRACKER: TrackerConfig = {
  mode: 'single-axis-horizontal-ns',
  axisTiltDeg: degrees(0),
  // matched to `rowAzimuthDeg`, the way `ArrayPanel` seeds it: any other axis direction sets
  // the panel's own face along the row instead of across it, and collapses the plan quad to a line
  axisAzimuthDeg: degrees(90),
  maxRotationDeg: degrees(60),
  backtracking: false,
}

const HALF_SPAN_M = (3.524 * cosDeg(25)) / 2
const HALF_ROW_LEN_M = 13.6 / 2
const LOW_EDGE_Y = 10 - HALF_SPAN_M
const HIGH_EDGE_Y = 10 + HALF_SPAN_M
// the flat tracker's own half-span: tilt 0 means cos(tilt) is 1, so the full collector width
const FLAT_HALF_SPAN_M = 3.524 / 2
const FLAT_LOW_EDGE_Y = 10 - FLAT_HALF_SPAN_M
const FLAT_HIGH_EDGE_Y = 10 + FLAT_HALF_SPAN_M

const rowArray = (tracker: TrackerConfig): PvArray =>
  makeArray(1, { geometry: ROW_GEOMETRY, tracker })

const rectBed = (id: string, cx: number, cy: number, widthM: number, depthM: number): Bed => {
  const footprint = polygonOf(rectangleRing(vec2(cx, cy), widthM, depthM))
  return bedFixture(id, { footprint, areaM2: polygonAreaM2(footprint) })
}

const plotWith = (beds: readonly Bed[], arrays: readonly PvArray[]): GardenPlot => ({
  ...plotFixture(beds),
  arrays,
})

describe('rainField: shelter and drip over a single row', () => {
  it('reads shelteredFraction 1 and dripMultiple 0 for a bed wholly under a row, in still air', () => {
    const bed = rectBed('under-row', 10, 10, 2, 1)
    const field = rainField(plotWith([bed], [rowArray(SOUTH_FACING)]), 0)
    const under = field.beds.find((entry) => entry.bedId === bed.id)
    expect(under).toBeDefined()
    expect(under?.shelteredFraction).toBeCloseTo(1, 6)
    expect(under?.dripMultiple).toBe(0)
  })

  it("drips onto a bed south of a south-facing row, conserving the row's catchment", () => {
    // north edge 0.3 m past the low edge: comfortably past the still-air strip's 0.1 m half-width
    const bed = rectBed('south-strip', 10, LOW_EDGE_Y - 1, 16, 2.6)
    const field = rainField(plotWith([bed], [rowArray(SOUTH_FACING)]), 0)
    const south = field.beds.find((entry) => entry.bedId === bed.id)
    expect(south).toBeDefined()
    if (south === undefined) throw new Error('no bed rain')

    const catchmentM2 = 3.524 * cosDeg(25) * 13.6
    const expectedDripMultiple = catchmentM2 / (16 * 2.6)
    expect(south.dripMultiple).toBeGreaterThan(0)
    expect(Math.abs(south.dripMultiple - expectedDripMultiple) / expectedDripMultiple).toBeLessThan(
      0.05,
    )

    // the overhang the bed's north edge takes into the row's own footprint is thin against the
    // bed's full depth, so the bed reads mostly open with a small sheltered share
    expect(south.shelteredFraction).toBeGreaterThan(0)
    expect(south.shelteredFraction).toBeLessThan(0.15)

    expect(south.crossings.length).toBe(1)
    expect(south.crossings[0]?.side).toBe('north')
    expect(south.crossings[0]?.rowIndex).toBe(0)
    expect(south.crossings[0]?.rowCount).toBe(1)
  })

  it('drips north instead when the same row faces north', () => {
    const southBed = rectBed('south-of-row', 10, LOW_EDGE_Y - 1, 16, 2.6)
    const northBed = rectBed('north-of-row', 10, HIGH_EDGE_Y + 1, 16, 2.6)
    const field = rainField(plotWith([southBed, northBed], [rowArray(NORTH_FACING)]), 0)
    const south = field.beds.find((entry) => entry.bedId === southBed.id)
    const north = field.beds.find((entry) => entry.bedId === northBed.id)
    expect(south?.dripMultiple).toBe(0)
    expect(south?.crossings.length).toBe(0)
    expect(north?.dripMultiple).toBeGreaterThan(0)
    expect(north?.crossings.length).toBe(1)
  })

  it('sheds a flat tracker to both long edges, half each, evenly either side', () => {
    const southBed = rectBed('flat-south', 10, FLAT_LOW_EDGE_Y - 1, 16, 2.6)
    const northBed = rectBed('flat-north', 10, FLAT_HIGH_EDGE_Y + 1, 16, 2.6)
    const middleBed = rectBed('flat-middle', 10, 10, 2, 1)
    const field = rainField(plotWith([southBed, northBed, middleBed], [rowArray(FLAT_TRACKER)]), 0)
    const south = field.beds.find((entry) => entry.bedId === southBed.id)
    const north = field.beds.find((entry) => entry.bedId === northBed.id)
    const middle = field.beds.find((entry) => entry.bedId === middleBed.id)
    expect(south?.dripMultiple).toBeGreaterThan(0)
    expect(north?.dripMultiple).toBeGreaterThan(0)
    if (south === undefined || north === undefined) throw new Error('no bed rain')
    expect(Math.abs(south.dripMultiple - north.dripMultiple) / south.dripMultiple).toBeLessThan(0.1)
    expect(middle?.shelteredFraction).toBeGreaterThan(0.9)
  })

  it('widens the strip with wind, conserving the same drip multiple a wider bed still holds whole', () => {
    // north edge 0.7 m past the low edge: past even the wind-widened strip's half-width
    const bed = rectBed('wide-strip', 10, LOW_EDGE_Y - 1, 16, 3.4)
    const array = rowArray(SOUTH_FACING)
    const still = rainField(plotWith([bed], [array]), 0)
    const windy = rainField(plotWith([bed], [array]), 4)
    const stillBed = still.beds.find((entry) => entry.bedId === bed.id)
    const windyBed = windy.beds.find((entry) => entry.bedId === bed.id)
    expect(stillBed).toBeDefined()
    expect(windyBed).toBeDefined()
    if (stillBed === undefined || windyBed === undefined) throw new Error('no bed rain')

    expect(windyBed.crossings[0]?.stripWidthM).toBeGreaterThan(0.2)
    expect(
      Math.abs(windyBed.dripMultiple - stillBed.dripMultiple) / stillBed.dripMultiple,
    ).toBeLessThan(0.05)

    // a cell at the row's own end, away from any drip strip: some of the wind's twelve
    // directions still find it under the panel and some do not, once the wind has moved it
    const { grid, values } = windy
    const col = Math.floor((10 + HALF_ROW_LEN_M - grid.extent.minXM) / grid.cellSizeM)
    const row = Math.floor((10 - grid.extent.minYM) / grid.cellSizeM)
    const edgeValue = values[row * grid.cols + col] ?? Number.NaN
    expect(edgeValue).toBeGreaterThan(0)
    expect(edgeValue).toBeLessThan(1)
  })
})

describe('rainHourWindMS', () => {
  const weatherWith = (windSpeedMS: number[], precipMm?: number[]): TmySeries => ({
    ...tmyFixture(),
    windSpeedMS: Float32Array.from(windSpeedMS),
    precipMm: precipMm === undefined ? undefined : Float32Array.from(precipMm),
  })

  it('averages wind over the hours the record marks wet, and no others', () => {
    const weather = weatherWith([1, 2, 3, 4], [0, 5, 0, 2])
    expect(rainHourWindMS(weather)).toBeCloseTo((2 + 4) / 2, 6)
  })

  it('falls back to the mean of every hour with no precip column at all', () => {
    const weather = weatherWith([1, 2, 3, 4])
    expect(rainHourWindMS(weather)).toBeCloseTo((1 + 2 + 3 + 4) / 4, 6)
  })

  it('falls back to the mean of every hour when the precip column carries no wet hour', () => {
    const weather = weatherWith([1, 2, 3, 4], [0, 0, 0, 0])
    expect(rainHourWindMS(weather)).toBeCloseTo((1 + 2 + 3 + 4) / 4, 6)
  })

  it('is 0 for an empty series', () => {
    expect(rainHourWindMS(weatherWith([]))).toBe(0)
  })
})

describe('rainField over the default plot', () => {
  it('computes well within the interaction budget, every value finite and non-negative', () => {
    const plot = makePlot()
    const started = performance.now()
    const field = rainField(plot, 3)
    const elapsedMs = performance.now() - started
    expect(elapsedMs).toBeLessThan(100)
    for (let i = 0; i < field.values.length; i += 1) {
      const value = field.values[i] ?? Number.NaN
      expect(Number.isFinite(value)).toBe(true)
      expect(value).toBeGreaterThanOrEqual(0)
    }
  })
})
