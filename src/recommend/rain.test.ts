import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'bun:test'
import { panelSnapshot } from '../sim/geometry'
import { cosDeg, sinDeg, tanDeg } from '../sim/math'
import { makeArray, makePlot } from '../state/defaults'
import { polygonAreaM2, polygonOf, rectangleRing, ringAreaM2, vec2 } from '../state/geom'
import type { Bed, GardenPlot } from '../types/garden'
import type { PvArray, RowGeometry, TrackerConfig } from '../types/pv'
import { degrees, type Degrees, type EpochMillis, type Meters } from '../types/units'
import type { RainField, RainWind } from '../types/water'
import type { TmySeries } from '../types/weather'
import {
  DRIP_FALL_MS,
  dripDriftM,
  dropDiameterMm,
  fallSpeedMS,
  rainClassFallSpeedsMS,
  rainField,
  rainGround,
  rainOnBed,
  rainSlopes,
  rainWind,
  windAtHeightMS,
} from './rain'
import {
  BEST_COEFFICIENT_A,
  BEST_RATE_EXPONENT,
  BEST_SHAPE_N,
  DRIP_DROP_MM,
  FALLBACK_RAIN_RATE_MM_H,
  GUNN_KINZER,
  LACY_REFERENCE_DROP_MM,
  LACY_REFERENCE_FALL_MS,
  LACY_WDR_COEFFICIENT_SM,
  MANNING_N_GLASS,
  PANEL_RETENTION_MM,
  type PinnedNumber,
  type Provenance,
  STILL_AIR_STRIP_M,
  TERMINAL_DISTANCE_M,
} from './rain-sources'
import { bedFixture, plotFixture, tmyFixture } from './testkit'

const GRAVITY_MS2 = 9.81

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
  // the panel's own face along the row, and collapses the plan quad to a line
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

/** The middle third's own fall speed at a moderate 2 mm/h rain, about 5.4 m/s */
const MIDDLE_FALL_MS = rainClassFallSpeedsMS(2)[1]

/** A bin's slope when every class falls at the same declared speed, standing in for all three */
const binsAt = (speedMS: number, fallMS = MIDDLE_FALL_MS): readonly [number, number, number] => [
  speedMS / fallMS,
  speedMS / fallMS,
  speedMS / fallMS,
]

/** Twelve equally likely bins, all at the same speed: a "one mean speed" wind, as a rose */
const symmetric = (speedMS: number): RainWind => ({
  directed: false,
  bins: Array.from({ length: 12 }, (_, k) => ({
    fromDeg: k * 30,
    weight: 1 / 12,
    speedMS,
    slope: binsAt(speedMS),
  })),
})

/** No wind at all: every bin present but carrying no speed, so nothing drifts or shears */
const stillAir = (): RainWind => symmetric(0)

/** All of the rain from one direction, at one speed: isolates a single bin's own physics */
const from = (fromDeg: number, speedMS: number): RainWind => ({
  directed: true,
  bins: [{ fromDeg, weight: 1, speedMS, slope: binsAt(speedMS) }],
})

const weatherWith = (
  windSpeedMS: number[],
  precipMm?: number[],
  windDirectionDeg?: number[],
): TmySeries => ({
  ...tmyFixture(),
  windSpeedMS: Float32Array.from(windSpeedMS),
  precipMm: precipMm === undefined ? undefined : Float32Array.from(precipMm),
  windDirectionDeg:
    windDirectionDeg === undefined ? undefined : Float32Array.from(windDirectionDeg),
})

/** The panels' own plan catchment, the same snapshot `rainField` itself takes */
const planAreaM2 = (arrays: readonly PvArray[]): number => {
  const snapshot = panelSnapshot(arrays, 0 as EpochMillis, -90 as Degrees, 0 as Degrees)
  return snapshot.panels.reduce((sum, panel) => sum + ringAreaM2(panel.corners.vertices), 0)
}

/** What the field actually laid down, in square meters, for comparing against the plan catchment */
const dripTotalM2 = (field: RainField): number => {
  const cellAreaM2 = field.grid.cellSizeM * field.grid.cellSizeM
  let total = 0
  for (const value of field.drip) total += value * cellAreaM2
  return total
}

/**
 * The bibliography read as text and parsed here, with no import, so `tsc` never has to walk a
 * 400-entry JSON file to type-check this suite
 */
const CITATIONS = JSON.parse(
  readFileSync(`${import.meta.dir}/../../docs/CITATIONS.csl.json`, 'utf8'),
) as readonly {
  readonly id?: string
  readonly custom?: { readonly backsClaims?: readonly string[]; readonly caveat?: string }
}[]

/** Everything one entry claims, its caveat included, as one string to search */
const claimText = (citation: string): string | undefined => {
  const entry = CITATIONS.find((candidate) => candidate.id === citation)
  if (entry === undefined) return undefined
  return [...(entry.custom?.backsClaims ?? []), entry.custom?.caveat ?? ''].join('\n')
}

const PINNED_NUMBERS: readonly PinnedNumber[] = [
  BEST_COEFFICIENT_A,
  BEST_RATE_EXPONENT,
  BEST_SHAPE_N,
  DRIP_DROP_MM,
  MANNING_N_GLASS,
  PANEL_RETENTION_MM,
  LACY_WDR_COEFFICIENT_SM,
  LACY_REFERENCE_FALL_MS,
  LACY_REFERENCE_DROP_MM,
]

const PINNED_SOURCES: readonly Provenance[] = [...PINNED_NUMBERS, GUNN_KINZER, TERMINAL_DISTANCE_M]

describe('rain-sources: the numbers against the bibliography', () => {
  it('names an entry the bibliography carries, and quotes that entry word for word', () => {
    for (const pinned of PINNED_SOURCES) {
      const text = claimText(pinned.citation)
      expect(text, pinned.citation).toBeDefined()
      expect(text ?? '', `${pinned.citation}, ${pinned.locator}`).toContain(pinned.quote)
    }
  })

  it('spells its own value inside that quote', () => {
    for (const pinned of PINNED_NUMBERS) {
      expect(pinned.quote, `${pinned.citation}, ${pinned.locator}`).toContain(String(pinned.value))
    }
  })

  it("matches every locator, where the speeds were labeled 'Table 1' and the paper says Table 2", () => {
    // the one check that catches a mislabel: the Gunn and Kinzer speeds are the paper's Table 2,
    // and its Table 1 is indexed by the drop's log mass, so the entry and the code have to name the
    // same division of the same source
    for (const pinned of PINNED_SOURCES) {
      expect(claimText(pinned.citation) ?? '', pinned.citation).toContain(pinned.locator)
    }
  })
})

describe('rainField: shelter and drip over a single row', () => {
  it('reads shelteredFraction 1 and dripMultiple 0 for a bed wholly under a row, in still air', () => {
    const bed = rectBed('under-row', 10, 10, 2, 1)
    const field = rainField(plotWith([bed], [rowArray(SOUTH_FACING)]), stillAir())
    const under = field.beds.find((entry) => entry.bedId === bed.id)
    expect(under).toBeDefined()
    expect(under?.shelteredFraction).toBeCloseTo(1, 6)
    expect(under?.dripMultiple).toBe(0)
  })

  it("drips onto a bed south of a south-facing row, conserving the row's catchment", () => {
    // north edge 0.3 m past the low edge: comfortably past the still-air strip's 0.1 m half-width
    const bed = rectBed('south-strip', 10, LOW_EDGE_Y - 1, 16, 2.6)
    const field = rainField(plotWith([bed], [rowArray(SOUTH_FACING)]), stillAir())
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
    const field = rainField(plotWith([southBed, northBed], [rowArray(NORTH_FACING)]), stillAir())
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
    const field = rainField(
      plotWith([southBed, northBed, middleBed], [rowArray(FLAT_TRACKER)]),
      stillAir(),
    )
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
    const still = rainField(plotWith([bed], [array]), stillAir())
    const windy = rainField(plotWith([bed], [array]), symmetric(4))
    const stillBed = still.beds.find((entry) => entry.bedId === bed.id)
    const windyBed = windy.beds.find((entry) => entry.bedId === bed.id)
    expect(stillBed).toBeDefined()
    expect(windyBed).toBeDefined()
    if (stillBed === undefined || windyBed === undefined) throw new Error('no bed rain')

    expect(windyBed.crossings[0]?.stripWidthM).toBeGreaterThan(0.2)
    expect(
      Math.abs(windyBed.dripMultiple - stillBed.dripMultiple) / stillBed.dripMultiple,
    ).toBeLessThan(0.05)

    // a cell at the row's own end, away from any drip strip: some of the rose's bins still find
    // it under the shifted panel and some don't, once the wind has sheared the shadow
    const { grid, values } = windy
    const col = Math.floor((10 + HALF_ROW_LEN_M - grid.extent.minXM) / grid.cellSizeM)
    const row = Math.floor((10 - grid.extent.minYM) / grid.cellSizeM)
    const edgeValue = values[row * grid.cols + col] ?? Number.NaN
    expect(edgeValue).toBeGreaterThan(0)
    expect(edgeValue).toBeLessThan(1)
  })

  it('conserves water: the drip laid over the grid equals the panels catchment, still or windy', () => {
    const array = rowArray(SOUTH_FACING)
    const plot = plotWith([], [array])
    const plan = planAreaM2([array])
    for (const wind of [stillAir(), symmetric(4)]) {
      const total = dripTotalM2(rainField(plot, wind))
      expect(Math.abs(total - plan) / plan).toBeLessThan(0.01)
    }
  })

  it('lays every drop even where the coarsened cell is wider than the still-air strip', () => {
    // a 200 m plot coarsens the cell to 0.4 m, twice the strip: a strip narrower than a cell can
    // fall between two cell centers and lay its water nowhere, and a regular row spacing would lose
    // every row's drip at once
    const array = rowArray(SOUTH_FACING)
    const plot: GardenPlot = {
      ...plotWith([], [array]),
      boundary: polygonOf(rectangleRing(vec2(10, 10), 200, 200)),
    }
    const field = rainField(plot, stillAir())
    expect(field.grid.cellSizeM).toBeGreaterThan(STILL_AIR_STRIP_M.value)
    const plan = planAreaM2([array])
    expect(Math.abs(dripTotalM2(field) - plan) / plan).toBeLessThan(0.01)
  })

  it('catches more rain facing the wind, and less turned from it', () => {
    const array = rowArray(SOUTH_FACING)
    const plot = plotWith([], [array])
    const stillDrip = dripTotalM2(rainField(plot, stillAir()))

    // the same midZ and tan aR the field itself computes for this row (Elamri et al. 2018 Eq. 1),
    // from the bin's own slope: `from` gives every class the same one, so any index reads it
    const midZ = ROW_GEOMETRY.clearanceHeightM + (ROW_GEOMETRY.collectorWidthM * sinDeg(25)) / 2
    const tanAlpha = binsAt(5)[0] * windAtHeightMS(1, midZ)
    const tanTilt = tanDeg(25)

    const facingDrip = dripTotalM2(rainField(plot, from(180, 5)))
    const awayDrip = dripTotalM2(rainField(plot, from(0, 5)))

    const expectedFacing = stillDrip * (1 + tanAlpha * tanTilt)
    const expectedAway = stillDrip * (1 - tanAlpha * tanTilt)
    expect(Math.abs(facingDrip - expectedFacing) / expectedFacing).toBeLessThan(0.02)
    expect(Math.abs(awayDrip - expectedAway) / expectedAway).toBeLessThan(0.02)
  })

  it('lands the drip strip downwind of the low edge', () => {
    const array = rowArray(SOUTH_FACING)
    const plot = plotWith([], [array])

    const dripYs = (field: RainField): number[] => {
      const ys: number[] = []
      for (let i = 0; i < field.drip.length; i += 1) {
        if ((field.drip[i] ?? 0) <= 0) continue
        const row = Math.floor(i / field.grid.cols)
        ys.push(field.grid.extent.minYM + (row + 0.5) * field.grid.cellSizeM)
      }
      return ys
    }

    // wind from the north pushes the strip south, off the low edge and away from the panel
    const north = rainField(plot, from(0, 5))
    const northYs = dripYs(north)
    expect(northYs.length).toBeGreaterThan(0)
    for (const y of northYs) expect(y).toBeLessThan(LOW_EDGE_Y + north.grid.cellSizeM)

    // wind from the south pushes it north, under the panel it fell from
    const south = rainField(plot, from(180, 5))
    const southYs = dripYs(south)
    expect(southYs.length).toBeGreaterThan(0)
    for (const y of southYs) expect(y).toBeGreaterThan(LOW_EDGE_Y - south.grid.cellSizeM)
  })

  it('moves the rain shadow downwind, further at the high edge than the low', () => {
    const array = rowArray(SOUTH_FACING)
    const plot = plotWith([], [array])
    const field = rainField(plot, from(0, 5))

    const lowerZ = ROW_GEOMETRY.clearanceHeightM
    const upperZ = lowerZ + ROW_GEOMETRY.collectorWidthM * sinDeg(25)
    const midZ = (lowerZ + upperZ) / 2
    const tanAlpha = binsAt(5)[0] * windAtHeightMS(1, midZ)
    // about 1.6 m and 2.5 m at this wind: comfortably past the 0.3 m offsets probed below
    expect(lowerZ * tanAlpha).toBeGreaterThan(0.3)
    expect(upperZ * tanAlpha).toBeGreaterThan(0.3)

    const shelterAt = (x: number, y: number): number => {
      const col = Math.floor((x - field.grid.extent.minXM) / field.grid.cellSizeM)
      const row = Math.floor((y - field.grid.extent.minYM) / field.grid.cellSizeM)
      return field.shelter[row * field.grid.cols + col] ?? Number.NaN
    }
    expect(shelterAt(10, LOW_EDGE_Y - 0.3)).toBeGreaterThan(0.99)
    expect(shelterAt(10, HIGH_EDGE_Y - 0.3)).toBeLessThan(0.01)
  })

  it("reads the crossing's strip width off the cells the strip actually touched", () => {
    const bed = rectBed('south-strip', 10, LOW_EDGE_Y - 1, 16, 2.6)
    const array = rowArray(SOUTH_FACING)
    const still = rainField(plotWith([bed], [array]), stillAir())
    const stillBed = still.beds.find((entry) => entry.bedId === bed.id)
    expect(stillBed?.crossings.length).toBe(1)
    const stillWidth = stillBed?.crossings[0]?.stripWidthM ?? 0
    // two cell centers 0.1 m apart plus one cell is the still-air strip exactly, and the floating
    // subtraction of those centers lands at 0.10000000000000142, so the bound sits at the strip
    expect(stillWidth).toBeGreaterThanOrEqual(STILL_AIR_STRIP_M.value)
    expect(stillWidth).toBeLessThan(0.3)

    const windy = rainField(plotWith([bed], [array]), symmetric(4))
    const windyBed = windy.beds.find((entry) => entry.bedId === bed.id)
    const windyWidth = windyBed?.crossings[0]?.stripWidthM ?? 0
    expect(windyWidth).toBeGreaterThan(stillWidth)
  })
})

describe('rainField: the field is sized to hold every strip', () => {
  it('lays a tall row whole in a strong rose, where a fixed margin dropped its water', () => {
    // a flat panel's projected quad is its plan quad however hard the rain slants, so the whole
    // catchment laid has to be the plan area exactly, whatever the drift carries it. A fixed 3 m
    // margin would lose 5.6% of it at 8 m/s and 64% at 14 m/s: the strip drifts off the field and
    // `cellsAlongEdge` finds no cell out there
    const array = makeArray(1, {
      geometry: { ...ROW_GEOMETRY, clearanceHeightM: 8 as Meters },
      tracker: FLAT_TRACKER,
    })
    const plot = plotWith([], [array])
    const plan = planAreaM2([array])
    for (const speedMS of [3, 8, 14]) {
      const field = rainField(plot, symmetric(speedMS))
      expect(Math.abs(dripTotalM2(field) - plan) / plan).toBeLessThan(1e-4)
    }
    // and the margin grew for it: an 8 m edge at 14 m/s drifts over 11 m
    const still = rainField(plot, stillAir())
    const windy = rainField(plot, symmetric(14))
    expect(windy.grid.extent.maxYM - windy.grid.extent.minYM).toBeGreaterThan(
      still.grid.extent.maxYM - still.grid.extent.minYM,
    )
  })
})

describe('rainField: cell size', () => {
  it('grows the cell past 3,000 m² of extent, and keeps the default plot at 0.1 m', () => {
    const big: GardenPlot = {
      ...plotFixture([]),
      boundary: polygonOf(rectangleRing(vec2(50, 50), 100, 100)),
    }
    expect(rainField(big, stillAir()).grid.cellSizeM).toBeCloseTo(0.2, 6)
    expect(rainField(makePlot(), stillAir()).grid.cellSizeM).toBeCloseTo(0.1, 6)
  })
})

describe("rainField: Elamri et al. 2018's rig, in still air", () => {
  it("reproduces the shape of the paper's own drip-line measurement", () => {
    const geometry: RowGeometry = {
      collectorWidthM: 2 as Meters,
      pitchM: 6.4 as Meters,
      rowLengthM: 20 as Meters,
      rowCount: 4,
      modulesPerRow: 12,
      clearanceHeightM: 5 as Meters,
      rowAzimuthDeg: degrees(0),
      originM: vec2(0, 0),
    }
    // flat, and matched to the row azimuth for the same reason FLAT_TRACKER above is
    const tracker: TrackerConfig = { ...FLAT_TRACKER, axisAzimuthDeg: degrees(0) }
    const array = makeArray(1, { geometry, tracker })
    const plot: GardenPlot = {
      ...plotFixture([]),
      boundary: polygonOf(rectangleRing(vec2(0, 0), 40, 40)),
      arrays: [array],
    }
    const field = rainField(plot, stillAir())
    const { grid } = field

    const valueAt = (x: number, y: number): number => {
      const col = Math.floor((x - grid.extent.minXM) / grid.cellSizeM)
      const row = Math.floor((y - grid.extent.minYM) / grid.cellSizeM)
      return field.values[row * grid.cols + col] ?? Number.NaN
    }
    const shelterAt = (x: number, y: number): number => {
      const col = Math.floor((x - grid.extent.minXM) / grid.cellSizeM)
      const row = Math.floor((y - grid.extent.minYM) / grid.cellSizeM)
      return field.shelter[row * grid.cols + col] ?? Number.NaN
    }

    // row centers in x, at (k - 1.5) * 6.4 for the 4 rows k = 0..3
    const rowXs = [0, 1, 2, 3].map((k) => (k - 1.5) * 6.4)
    const secondRowX = rowXs[1] ?? 0

    // (1) dead center of a row, mid length: fully sheltered
    expect(shelterAt(secondRowX, 0)).toBeCloseTo(1, 2)
    expect(valueAt(secondRowX, 0)).toBeCloseTo(0, 2)

    // (2) midway between two rows: fully open
    const midwayX = ((rowXs[0] ?? 0) + secondRowX) / 2
    expect(valueAt(midwayX, 0)).toBeCloseTo(1, 2)

    // (3) the west edge of the second row, mid length: the drip strip's own mean value. Half the
    // 2 m collector width sheds into the 0.2 m strip, so the line-averaged density is
    // 1 m / 0.2 m = 5, independent of how many modules the row is cut into
    const westEdgeX = secondRowX - geometry.collectorWidthM / 2
    let dripSum = 0
    let dripCount = 0
    for (let i = 0; i < field.drip.length; i += 1) {
      const value = field.drip[i] ?? 0
      if (value <= 0) continue
      const col = i % grid.cols
      const row = Math.floor(i / grid.cols)
      const x = grid.extent.minXM + (col + 0.5) * grid.cellSizeM
      const y = grid.extent.minYM + (row + 0.5) * grid.cellSizeM
      if (Math.abs(x - westEdgeX) < 1 && Math.abs(y) < 0.5) {
        dripSum += value
        dripCount += 1
      }
    }
    expect(dripCount).toBeGreaterThan(0)
    const meanDrip = dripSum / dripCount
    expect(Math.abs(meanDrip - 5) / 5).toBeLessThan(0.3)

    // (4) sampled the way the paper did, in one of its own 0.3 m collectors centered on the drip
    // line. The model sheds a nominally flat panel to both long edges, half each, because the app
    // can't know which way a tracker leans, where the paper says "the panels are never strictly
    // flat, so any transverse slope of comparable order will have the consequence of redirecting
    // all the collected water toward a narrow outlet": its event 07 read 24 mm in a 0.3 m
    // collector out of a 3.0 mm rain, which is a 2 m panel's whole catchment to one side
    let windowSum = 0
    let windowDripSum = 0
    let windowCount = 0
    for (let i = 0; i < field.values.length; i += 1) {
      const col = i % grid.cols
      const row = Math.floor(i / grid.cols)
      const x = grid.extent.minXM + (col + 0.5) * grid.cellSizeM
      const y = grid.extent.minYM + (row + 0.5) * grid.cellSizeM
      if (Math.abs(x - westEdgeX) <= 0.15 && Math.abs(y) < 0.5) {
        windowSum += field.values[i] ?? 0
        windowDripSum += field.drip[i] ?? 0
        windowCount += 1
      }
    }
    expect(windowCount).toBeGreaterThan(0)
    // the model's own figure, half the catchment each way: this app measures 3.93 times open ground
    const collectorMean = windowSum / windowCount
    expect(collectorMean).toBeGreaterThan(3.7)
    expect(collectorMean).toBeLessThan(4.2)

    // the same collector under the paper's own one-sided drainage, which is this window's shelter
    // with the whole catchment in it: the drip doubles where the shadow doesn't. Event 07 read
    // 24 mm in a 0.3 m collector out of a 3.0 mm rain, 8 times open ground, and the model lands
    // about a tenth below it because its strip is 0.2 m wide and centered on the edge where the
    // paper's collector is 0.3 m across. The same paper's event 06 read 11 times in the text and
    // about 16 in Fig. 6c, which is the beading through a 20 cm outlet that a field averaged
    // along the edge can't draw
    const oneSidedMean = collectorMean + windowDripSum / windowCount
    const eventO7Ratio = 24 / 3
    expect(Math.abs(oneSidedMean - eventO7Ratio) / eventO7Ratio).toBeLessThan(0.2)
  })
})

describe('rainWind', () => {
  it('is rain-weighted: each bin carries the rain that fell in it, whatever its hour count', () => {
    // two wet hours, 90 and 270 degrees, and dry hours from 0 degrees that must not count
    const weather = weatherWith([4, 2, 9, 9], [3, 1, 0, 0], [90, 270, 0, 0])
    const wind = rainWind(weather)
    expect(wind.directed).toBe(true)
    expect(wind.bins.length).toBe(12)
    expect(wind.bins[3]?.weight).toBeCloseTo(0.75, 6)
    expect(wind.bins[3]?.speedMS).toBeCloseTo(4, 6)
    expect(wind.bins[9]?.weight).toBeCloseTo(0.25, 6)
    expect(wind.bins[9]?.speedMS).toBeCloseTo(2, 6)
    for (let k = 0; k < 12; k += 1) {
      if (k === 3 || k === 9) continue
      expect(wind.bins[k]?.weight).toBe(0)
    }
  })

  it('pools into the equal rose at the rain-weighted mean with no direction column', () => {
    const weather = weatherWith([1, 2, 3, 4], [0, 5, 0, 2])
    const wind = rainWind(weather)
    expect(wind.directed).toBe(false)
    expect(wind.bins.length).toBe(12)
    for (const bin of wind.bins) {
      expect(bin.weight).toBeCloseTo(1 / 12, 6)
      expect(bin.speedMS).toBeCloseTo((2 * 5 + 4 * 2) / 7, 6)
    }
  })

  it('falls back to the mean of every hour where no hour is marked wet', () => {
    // a source with no `precipMm` column at all (PVGIS, NSRDB), and one whose column is all zero:
    // a typical year built from monthly normals lands here with real rain and no hour carrying it
    for (const weather of [weatherWith([1, 2, 3, 4]), weatherWith([1, 2, 3, 4], [0, 0, 0, 0])]) {
      for (const bin of rainWind(weather).bins) {
        expect(bin.speedMS).toBeCloseTo((1 + 2 + 3 + 4) / 4, 6)
      }
    }
  })

  it('carries no speed for an empty series, and leaves an unusable hour out of the pool', () => {
    for (const bin of rainWind(weatherWith([])).bins) expect(bin.speedMS).toBe(0)
    // the pooled path divides by the count of usable hours alone
    for (const bin of rainWind(weatherWith([3, Number.NaN, 5])).bins) {
      expect(bin.speedMS).toBeCloseTo(4, 6)
    }
  })

  it('slopes a bin rain-weighted: two wet hours at the same wind favor the heavier rain', () => {
    // one light hour and one heavy hour, both from 90 degrees at the same wind
    const weather = weatherWith([5, 5], [0.5, 10], [90, 90])
    const bin = rainWind(weather).bins[3]
    expect(bin).toBeDefined()
    if (bin === undefined) throw new Error('no bin')

    const light = rainSlopes(5, 0.5)
    const heavy = rainSlopes(5, 10)
    for (let c = 0; c < 3; c += 1) {
      const lightSlope = light[c] ?? 0
      const heavySlope = heavy[c] ?? 0
      const blended = bin.slope[c] ?? 0
      expect(blended).toBeGreaterThan(Math.min(lightSlope, heavySlope))
      expect(blended).toBeLessThan(Math.max(lightSlope, heavySlope))
      // the heavy hour carries twenty times the rain, so the blend sits nearer its own slope
      expect(Math.abs(blended - heavySlope)).toBeLessThan(Math.abs(blended - lightSlope))
    }
    expect(bin.slope[0]).toBeGreaterThan(bin.slope[1])
    expect(bin.slope[1]).toBeGreaterThan(bin.slope[2])
  })

  it('slopes every bin at FALLBACK_RAIN_RATE_MM_H when the record carries wind but no precip', () => {
    const weather = weatherWith([3, 5, 3, 5], undefined, [0, 0, 90, 90])
    const wind = rainWind(weather)
    expect(wind.directed).toBe(true)
    for (const bin of wind.bins) {
      if (bin.weight === 0) continue
      const expected = rainSlopes(bin.speedMS, FALLBACK_RAIN_RATE_MM_H.value)
      for (let c = 0; c < 3; c += 1) expect(bin.slope[c]).toBeCloseTo(expected[c] ?? 0, 6)
    }
  })
})

describe('fallSpeedMS', () => {
  it("returns every one of Gunn and Kinzer's own 26 rows, read from the source module", () => {
    // a loop over the table itself, since four hand-copied rows let a misread fifth row pass
    for (const [diameterMm, rowFallSpeedMS] of GUNN_KINZER.rows) {
      expect(fallSpeedMS(diameterMm)).toBeCloseTo(rowFallSpeedMS, 10)
    }
  })

  it('reads Gunn and Kinzer off the table, interpolating between rows', () => {
    expect(Math.abs(fallSpeedMS(2.0) - 6.49)).toBeLessThan(0.01)
    expect(Math.abs(fallSpeedMS(4.0) - 8.83)).toBeLessThan(0.01)
    expect(Math.abs(fallSpeedMS(1.5) - 5.41)).toBeLessThan(0.01)
  })

  it('clamps to the first and last rows past the table', () => {
    expect(fallSpeedMS(0.1)).toBeCloseTo(1.17, 6)
    expect(fallSpeedMS(8)).toBeCloseTo(9.17, 6)
  })
})

describe('dropDiameterMm', () => {
  it('reads Best 1950 off the record rain rate', () => {
    expect(Math.abs(dropDiameterMm(1, 1 / 2) - 1.1)).toBeLessThan(0.01)
    expect(Math.abs(dropDiameterMm(20, 1 / 2) - 2.21)).toBeLessThan(0.01)
  })

  it('grows with the air-content quantile', () => {
    const sextile = dropDiameterMm(2, 1 / 6)
    const median = dropDiameterMm(2, 1 / 2)
    const fiveSextile = dropDiameterMm(2, 5 / 6)
    expect(sextile).toBeLessThan(median)
    expect(median).toBeLessThan(fiveSextile)
  })

  it("round-trips Best's own distribution: its cdf at a quantile's drop returns that quantile", () => {
    // written from Best's equation and its three pinned coefficients, so a drifted coefficient or
    // a mis-inverted exponent fails here, with the code's own output left out of it
    const airContentBelow = (rateMmH: number, diameterMm: number): number =>
      1 -
      Math.exp(
        -(
          (diameterMm / (BEST_COEFFICIENT_A.value * rateMmH ** BEST_RATE_EXPONENT.value)) **
          BEST_SHAPE_N.value
        ),
      )
    for (const rateMmH of [0.5, 1, 2, 5, 20]) {
      for (const quantile of [0.1, 1 / 3, 0.5, 2 / 3, 0.9]) {
        expect(airContentBelow(rateMmH, dropDiameterMm(rateMmH, quantile))).toBeCloseTo(
          quantile,
          10,
        )
      }
    }
  })
})

/**
 * The drip's own equations at a step fine enough to leave no step error worth naming, written from
 * the equations themselves: the reference the weak-wind limit below is held against
 */
const fineDriftM = (heightM: number, wind10MS: number): number => {
  const dragK = GRAVITY_MS2 / DRIP_FALL_MS ** 2
  const dt = 1e-5
  let vx = 0
  let vz = 0
  let x = 0
  let z = 0
  while (z < heightM) {
    const windMS = windAtHeightMS(wind10MS, heightM - z)
    const r = Math.hypot(windMS - vx, vz)
    vx += dragK * r * (windMS - vx) * dt
    vz += (GRAVITY_MS2 - dragK * r * vz) * dt
    x += vx * dt
    z += vz * dt
  }
  return x - (vx * (z - heightM)) / vz
}

describe('dripDriftM', () => {
  it('is 0 with no wind to carry it, and 0 off an edge sitting on the ground', () => {
    expect(dripDriftM(2.5, 0)).toBe(0)
    expect(dripDriftM(2.5, -1)).toBe(0)
    // a clearance of 0 is a setting the editor allows, and a NaN drift there would lay no water at
    // all
    expect(dripDriftM(0, 3)).toBe(0)
    expect(dripDriftM(-1, 3)).toBe(0)
  })

  it('matches a fine-step integration of the same fall, within the step error', () => {
    // dt = 1e-5 values for this same integration, the second argument the record's own 10 m wind
    // and the profile read at each step's own height: DRIP_FALL_MS = fallSpeedMS(3.8) = 8.72
    const cases: readonly (readonly [heightM: number, wind10MS: number, referenceM: number])[] = [
      [2.5, 1, 0.059384],
      [2.5, 3, 0.238776],
      [2.5, 6, 0.691722],
      [5, 0.78, 0.142672],
      [1.5, 3, 0.107751],
    ]
    for (const [heightM, wind10MS, referenceM] of cases) {
      const driftM = dripDriftM(heightM, wind10MS)
      expect(Math.abs(driftM - referenceM) / referenceM).toBeLessThan(0.01)
    }
  })

  it('reaches the weak-wind closed form the old code used', () => {
    // at 0.05 m/s the drop's own horizontal speed never approaches the wind, so the drag along its
    // fall speed is all that carries it and the drift goes to U sqrt(g) (2h)^1.5 / (6 v^2), the
    // weak-wind closed form. Held at MIN_WIND_HEIGHT_M, the one height where the log profile gives
    // the whole fall a single wind, so U is unambiguous
    const heightM = 0.5
    const windMS = windAtHeightMS(0.05, heightM)
    const closedM =
      (windMS * Math.sqrt(GRAVITY_MS2) * (2 * heightM) ** 1.5) / (6 * DRIP_FALL_MS ** 2)
    expect(Math.abs(fineDriftM(heightM, 0.05) - closedM) / closedM).toBeLessThan(0.01)
    // the production 0.005 s step is the whole of the rest: over a 0.32 s fall it ends the drop
    // half a step early, which this app measures at 2.1% low
    expect(Math.abs(dripDriftM(heightM, 0.05) - closedM) / closedM).toBeLessThan(0.03)
  })
})

describe('the drip against a second source', () => {
  it("falls to terminal over Wang and Pruppacher 1977's own distances, within 20 percent", () => {
    // the vertical equation alone, no wind: how far a drop of this diameter falls from rest before
    // it reaches 99 percent of its own terminal speed, under the same quadratic drag the drip uses
    const fallTo99PercentM = (diameterMm: number): number => {
      const terminalMS = fallSpeedMS(diameterMm)
      const dragK = GRAVITY_MS2 / terminalMS ** 2
      const dt = 1e-4
      let vz = 0
      let z = 0
      while (vz < 0.99 * terminalMS) {
        vz += (GRAVITY_MS2 - dragK * vz * vz) * dt
        z += vz * dt
      }
      return z
    }
    for (const [diameterMm, distanceM] of TERMINAL_DISTANCE_M.rows) {
      const gotM = fallTo99PercentM(diameterMm)
      expect(Math.abs(gotM - distanceM) / distanceM, `${diameterMm} mm drop`).toBeLessThan(0.2)
    }
  })

  it("holds Lacy's 4.5 m/s, through Blocken and Carmeliet 2004, within 15 percent", () => {
    // Lacy's coefficient is "the inverse of the raindrop terminal velocity of fall", one speed for
    // the whole of an hour's rain, so what holds it is the rain's own harmonic-mean fall speed:
    // the mean over the three thirds of 1/v, which is what the mean slope over the classes divides
    // by. The middle third alone runs faster than Lacy's drop once the rain is weighted by fall
    // speed, and at 2 mm/h this app measures it 21 percent above the 4.5
    for (const rateMmH of [1, 2]) {
      const classes = rainClassFallSpeedsMS(rateMmH)
      const harmonicMS = 3 / classes.reduce((sum, fall) => sum + 1 / fall, 0)
      expect(
        Math.abs(harmonicMS - LACY_REFERENCE_FALL_MS.value) / LACY_REFERENCE_FALL_MS.value,
      ).toBeLessThan(0.15)
      expect(harmonicMS).toBeCloseTo(1 / LACY_WDR_COEFFICIENT_SM.value, 0)
    }
    // and the middle third at the light rate Lacy's own 1.2 mm drop sits at in Best's distribution
    expect(
      Math.abs(rainClassFallSpeedsMS(1)[1] - LACY_REFERENCE_FALL_MS.value) /
        LACY_REFERENCE_FALL_MS.value,
    ).toBeLessThan(0.15)

    // and the diameter Gunn and Kinzer give 4.5 m/s to, against Lacy's own 1.2 mm
    let lowMm = GUNN_KINZER.rows[0]?.[0] ?? 0
    let highMm = GUNN_KINZER.rows[GUNN_KINZER.rows.length - 1]?.[0] ?? 0
    for (let step = 0; step < 60; step += 1) {
      const midMm = (lowMm + highMm) / 2
      if (fallSpeedMS(midMm) < LACY_REFERENCE_FALL_MS.value) lowMm = midMm
      else highMm = midMm
    }
    const atLacySpeedMm = (lowMm + highMm) / 2
    expect(
      Math.abs(atLacySpeedMm - LACY_REFERENCE_DROP_MM.value) / LACY_REFERENCE_DROP_MM.value,
    ).toBeLessThan(0.15)
  })
})

describe('rainField: the three drop-mass classes', () => {
  it('blurs the shadow: a cell only the slow class reaches, and a cell all three reach', () => {
    const array = rowArray(SOUTH_FACING)
    const plot = plotWith([], [array])
    const wind: RainWind = {
      directed: true,
      bins: [{ fromDeg: 0, weight: 1, speedMS: 5, slope: [0.4, 0.25, 0.1] }],
    }
    const field = rainField(plot, wind)
    const shelterAt = (x: number, y: number): number => {
      const col = Math.floor((x - field.grid.extent.minXM) / field.grid.cellSizeM)
      const row = Math.floor((y - field.grid.extent.minYM) / field.grid.cellSizeM)
      return field.shelter[row * field.grid.cols + col] ?? Number.NaN
    }
    // deep under the panel, short of any edge: all three classes' shadows still cover it
    expect(shelterAt(10, LOW_EDGE_Y + 1)).toBeCloseTo(1, 2)
    // past where the faster two classes' shadows end, only the slow class still reaches
    expect(shelterAt(10, LOW_EDGE_Y - 0.7)).toBeCloseTo(1 / 3, 2)
  })
})

describe("rainField: Elamri et al. 2018's Eq. 4, in geometric form", () => {
  it("projects a panel's catchment to its plan area times |1 - tan aR tan tilt cos(azimuth - bearing)|", () => {
    // written from the trigonometry alone, with the field's own projection left out of it: a plan
    // rectangle's across-row edge is the panel's own facing direction and its high edge sits a rise
    // above its low one, so sliding the corners downwind by their own height times tan aR scales
    // the area by that factor. `tan aR` is pinned at 0.25 whatever the tilt, so the factor stays clear of 0 where a
    // relative tolerance would mean nothing, and the bin carries no speed, so no drift moves the
    // strip off the field and the whole catchment is still there to measure
    const tanAlpha = 0.25
    // a deterministic dozen, so a failure is the same failure twice
    let seed = 12345
    const random = (): number => {
      seed = (seed * 1103515245 + 12345) % 2147483648
      return seed / 2147483648
    }
    for (let trial = 0; trial < 12; trial += 1) {
      const tiltDeg = 5 + random() * 55
      const azimuthDeg = random() * 360
      const fromDeg = random() * 360
      const array = makeArray(1, {
        geometry: {
          ...ROW_GEOMETRY,
          modulesPerRow: 1,
          rowLengthM: 4 as Meters,
          // the rows run across the panel's own facing direction, the way `ArrayPanel` seeds them
          rowAzimuthDeg: degrees(azimuthDeg + 90),
        },
        tracker: {
          mode: 'fixed',
          tiltDeg: degrees(tiltDeg),
          surfaceAzimuthDeg: degrees(azimuthDeg),
        },
      })
      const midZ =
        ROW_GEOMETRY.clearanceHeightM + (ROW_GEOMETRY.collectorWidthM * sinDeg(tiltDeg)) / 2
      const slope = tanAlpha / windAtHeightMS(1, midZ)
      const wind: RainWind = {
        directed: true,
        bins: [{ fromDeg, weight: 1, speedMS: 0, slope: [slope, slope, slope] }],
      }
      // the bearing the wind blows toward, which is the sense Eq. 4's own minus sign reads in
      const windBearingDeg = fromDeg + 180
      const planM2 = planAreaM2([array])
      const expectedM2 =
        planM2 * Math.abs(1 - tanAlpha * tanDeg(tiltDeg) * cosDeg(azimuthDeg - windBearingDeg))
      const laidM2 = dripTotalM2(rainField(plotWith([], [array]), wind))
      expect(Math.abs(laidM2 - expectedM2) / expectedM2, `tilt ${String(tiltDeg)}`).toBeLessThan(
        0.01,
      )
    }
  })
})

describe('rainField over the default plot', () => {
  it('computes well within the interaction budget, every value finite and non-negative', () => {
    const plot = makePlot()
    const started = performance.now()
    const field = rainField(plot, symmetric(3))
    const elapsedMs = performance.now() - started
    expect(elapsedMs).toBeLessThan(100)
    for (let i = 0; i < field.values.length; i += 1) {
      const value = field.values[i] ?? Number.NaN
      expect(Number.isFinite(value)).toBe(true)
      expect(value).toBeGreaterThanOrEqual(0)
    }
  })

  it('reads rainOnBed off a shared rainGround the same as rainField, for any footprint', () => {
    const plot = makePlot()
    const wind = symmetric(3)
    const ground = rainGround(plot, wind)
    const field = rainField(plot, wind)

    for (const bed of plot.beds) {
      const fromField = field.beds.find((entry) => entry.bedId === bed.id)
      expect(fromField).toBeDefined()
      expect(rainOnBed(ground, plot.arrays, bed)).toEqual(fromField)
    }

    // a footprint the plot never held, read off the same ground with no second pass over the panels
    const outside = rainOnBed(ground, plot.arrays, rectBed('outside-the-plot', 0, 6, 2, 2))
    expect(Number.isFinite(outside.shelteredFraction)).toBe(true)
    expect(outside.shelteredFraction).toBeGreaterThanOrEqual(0)
    expect(outside.shelteredFraction).toBeLessThanOrEqual(1)
    expect(Number.isFinite(outside.dripMultiple)).toBe(true)
    expect(outside.dripMultiple).toBeGreaterThanOrEqual(0)
  })

  /**
   * The tests above hold every constant to its citation, and this one holds the field itself:
   * the default plot's three beds and its three-row array, under still air, the equal rose at
   * 3 and 6 m/s, and one bin from the south-west and one from the north, all at the production
   * slopes (this file's `symmetric` above stands in with one fall speed for every class)
   *
   * A change to the physics moves them on purpose, and the commit that does it re-pins them with
   * the reason
   */
  it("holds the starting plot's own figures, so a change to the physics moves them on purpose", () => {
    const productionRose = (speedMS: number): RainWind => ({
      directed: false,
      bins: Array.from({ length: 12 }, (_, k) => ({
        fromDeg: k * 30,
        weight: 1 / 12,
        speedMS,
        slope: rainSlopes(speedMS, FALLBACK_RAIN_RATE_MM_H.value),
      })),
    })
    const productionBin = (fromDeg: number, speedMS: number): RainWind => ({
      directed: true,
      bins: [
        { fromDeg, weight: 1, speedMS, slope: rainSlopes(speedMS, FALLBACK_RAIN_RATE_MM_H.value) },
      ],
    })

    type ExpectedCrossing = {
      readonly arrayId: string
      readonly rowIndex: number
      readonly rowCount: number
      readonly side: 'north' | 'south' | 'east' | 'west'
      readonly stripWidthM: number
    }
    type ExpectedBed = {
      readonly bedId: string
      readonly sheltered: number
      readonly dripMultiple: number
      readonly crossings: readonly ExpectedCrossing[]
    }
    type Scenario = {
      readonly label: string
      readonly wind: RainWind
      readonly meanShelter: number
      readonly meanDrip: number
      readonly peak: number
      readonly beds: readonly ExpectedBed[]
    }

    const scenarios: readonly Scenario[] = [
      {
        label: 'still air',
        wind: rainWind(null),
        meanShelter: 0.15,
        meanDrip: 0.15,
        peak: 17.45,
        beds: [
          { bedId: 'bed-1', sheltered: 0, dripMultiple: 0, crossings: [] },
          { bedId: 'bed-2', sheltered: 1, dripMultiple: 0, crossings: [] },
          { bedId: 'bed-3', sheltered: 0, dripMultiple: 0, crossings: [] },
        ],
      },
      {
        label: 'the equal rose at 3 m/s',
        wind: productionRose(3),
        meanShelter: 0.15,
        meanDrip: 0.15,
        peak: 8.62,
        beds: [
          { bedId: 'bed-1', sheltered: 0.095, dripMultiple: 0, crossings: [] },
          { bedId: 'bed-2', sheltered: 0.77, dripMultiple: 0, crossings: [] },
          { bedId: 'bed-3', sheltered: 0.214, dripMultiple: 0, crossings: [] },
        ],
      },
      {
        label: 'the equal rose at 6 m/s',
        wind: productionRose(6),
        meanShelter: 0.146,
        meanDrip: 0.15,
        peak: 6.62,
        beds: [
          {
            bedId: 'bed-1',
            sheltered: 0.286,
            dripMultiple: 0.049,
            crossings: [
              { arrayId: 'array-1', rowIndex: 1, rowCount: 3, side: 'north', stripWidthM: 0.1 },
            ],
          },
          { bedId: 'bed-2', sheltered: 0.378, dripMultiple: 0, crossings: [] },
          { bedId: 'bed-3', sheltered: 0.365, dripMultiple: 0, crossings: [] },
        ],
      },
      {
        label: 'one bin from the south-west at 3 m/s',
        wind: productionBin(240, 3),
        meanShelter: 0.169,
        meanDrip: 0.168,
        peak: 19.45,
        beds: [
          { bedId: 'bed-1', sheltered: 0, dripMultiple: 0, crossings: [] },
          { bedId: 'bed-2', sheltered: 1, dripMultiple: 0, crossings: [] },
          { bedId: 'bed-3', sheltered: 0.238, dripMultiple: 0, crossings: [] },
        ],
      },
      {
        label: 'one bin from the north at 3 m/s',
        wind: productionBin(0, 3),
        meanShelter: 0.114,
        meanDrip: 0.113,
        peak: 12.47,
        beds: [
          { bedId: 'bed-1', sheltered: 0.429, dripMultiple: 0, crossings: [] },
          { bedId: 'bed-2', sheltered: 0.333, dripMultiple: 0, crossings: [] },
          { bedId: 'bed-3', sheltered: 0, dripMultiple: 0, crossings: [] },
        ],
      },
    ]

    const plot = makePlot()
    for (const scenario of scenarios) {
      const field = rainField(plot, scenario.wind)
      expect(field.grid.cellSizeM, scenario.label).toBe(0.1)
      expect(field.grid.cols, scenario.label).toBe(320)
      expect(field.grid.rows, scenario.label).toBe(272)

      let peak = 0
      let shelterSum = 0
      let dripSum = 0
      for (const value of field.values) peak = Math.max(peak, value)
      for (const value of field.shelter) shelterSum += value
      for (const value of field.drip) dripSum += value
      const cellCount = field.values.length
      expect(shelterSum / cellCount, scenario.label).toBeCloseTo(scenario.meanShelter, 3)
      expect(dripSum / cellCount, scenario.label).toBeCloseTo(scenario.meanDrip, 3)
      expect(peak, scenario.label).toBeCloseTo(scenario.peak, 2)

      for (const bedCase of scenario.beds) {
        const label = `${scenario.label}: ${bedCase.bedId}`
        const bed = field.beds.find((entry) => entry.bedId === bedCase.bedId)
        expect(bed, label).toBeDefined()
        if (bed === undefined) throw new Error('no bed rain')
        expect(bed.shelteredFraction, label).toBeCloseTo(bedCase.sheltered, 3)
        expect(bed.dripMultiple, label).toBeCloseTo(bedCase.dripMultiple, 3)
        expect(bed.crossings, label).toEqual(bedCase.crossings)
      }
    }
  })
})
