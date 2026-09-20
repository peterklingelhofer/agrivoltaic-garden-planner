import { TMY_WIND_HEIGHT_M, windSpeedAt2m } from '../data/water'
import { at, clamp, lerp, mean } from '../data/util'
import { centroidOf, extentOf, extentSize, pointInPolygon, ringAreaM2 } from '../state/geom'
import { gridForExtent, panelSnapshot, sceneExtent } from '../sim/geometry'
import { cosDeg, sinDeg } from '../sim/math'
import type { Extent2D, GridSpec, Vec3M } from '../types/geo'
import type { Bed, GardenPlot } from '../types/garden'
import type { ArrayId } from '../types/ids'
import type { Degrees, EpochMillis, Fraction, Meters } from '../types/units'
import type { PanelSnapshot, PvArray } from '../types/pv'
import type { BedRain, DripCrossing, RainField, RainWind, RainWindBin } from '../types/water'
import type { TmySeries } from '../types/weather'
import {
  BEST_COEFFICIENT_A,
  BEST_RATE_EXPONENT,
  BEST_SHAPE_N,
  DRIP_DROP_MM,
  FALLBACK_RAIN_RATE_MM_H,
  GUNN_KINZER_ROWS,
  STILL_AIR_STRIP_M,
} from './rain-sources'

/**
 * A drop's terminal fall speed at its diameter: linear between Gunn and Kinzer's rows, clamped
 * to the first and last where a diameter falls outside the table
 */
export const fallSpeedMS = (diameterMm: number): number => {
  const table = GUNN_KINZER_ROWS
  const lastIndex = table.length - 1
  const first = table[0]
  const last = table[lastIndex]
  if (first === undefined || last === undefined) return 0
  const d = clamp(diameterMm, first[0], last[0])
  for (let i = 0; i < lastIndex; i += 1) {
    const lo = table[i]
    const hi = table[i + 1]
    if (lo === undefined || hi === undefined) continue
    if (d <= hi[0]) return lerp(lo[1], hi[1], (d - lo[0]) / (hi[0] - lo[0]))
  }
  return last[1]
}

/**
 * Best 1950's drop-size distribution as Elamri et al. 2018 Eq. 3 gives it: 1 - F =
 * exp(-(D / (1.30 I^0.232))^2.25), D the drop diameter in mm, I the rain rate in mm/h and F the
 * share of the liquid water *in the air* carried by drops smaller than D. Inverted here for the
 * diameter at air-content quantile q. The rain arriving at the ground is this distribution
 * weighted by each size's own fall speed, which is what `rainClassFallSpeedsMS` does with it
 */
export const dropDiameterMm = (rateMmH: number, massQuantile: number): number =>
  BEST_COEFFICIENT_A.value *
  rateMmH ** BEST_RATE_EXPONENT.value *
  (-Math.log(1 - massQuantile)) ** (1 / BEST_SHAPE_N.value)

/**
 * Uniform steps through Best's own quantile, which is where the distribution is smooth and
 * bounded: every step carries the same share of the air's water and the fall speed it reads off
 * Gunn and Kinzer's table is monotone in it, so no tail has to be truncated. The thirds' speeds
 * move by under 1e-4 m/s between this and a 40,000-step run
 */
const BEST_QUANTILE_STEPS = 1000

const classFallSpeedCache = new Map<number, [number, number, number]>()

/**
 * The fall speed of each third of the rain reaching the ground, slowest third first. Best's F is
 * the air's own water content by drop size, so the flux through the ground weights each size by its
 * fall speed: dF_flux is proportional to v(D) dF. This splits that flux-weighted distribution into
 * three equal thirds and gives each third the harmonic mean of its own fall speeds, 1 / E[1/v |
 * third], so the mean over the three thirds of 1/v is the exact flux-weighted mean of 1/v and a
 * slope taken as the mean of the classes carries no quadrature bias. Integrated by splitting the
 * boundary step, which is what makes each third carry exactly a third of the flux, and this app
 * measures the three thirds within 0.002 percent of the exact mean. Reading one drop at each
 * sextile of the air-content distribution leaves that mean 4 percent long at 20 mm/h and 15 percent
 * long at 0.5 mm/h, and reading one drop at each sextile of the flux-weighted distribution lands 6
 * to 7 percent short across the same rates. Memoized on the rate rounded to 0.1 mm/h, since hourly
 * rain arrives quantized and a rose reads the same rates thousands of times
 *
 * Three classes, since five cut the remaining edge-step error by about 2 points for 70 percent
 * more projected quads, and the wind-speed spread left unresolved inside a 30 degree bin is the
 * larger source
 */
export const rainClassFallSpeedsMS = (rateMmH: number): [number, number, number] => {
  const key = Math.round(rateMmH * 10)
  const cached = classFallSpeedCache.get(key)
  if (cached !== undefined) return cached
  const rate = key / 10
  const speeds = new Float64Array(BEST_QUANTILE_STEPS)
  let fluxTotal = 0
  for (let i = 0; i < BEST_QUANTILE_STEPS; i += 1) {
    const speed = fallSpeedMS(dropDiameterMm(rate, (i + 0.5) / BEST_QUANTILE_STEPS))
    speeds[i] = speed
    fluxTotal += speed
  }
  const perClass = fluxTotal / 3
  const classes: number[] = []
  let step = 0
  // how much of step `step` the next third still has to take, in steps
  let carry = 1
  for (let c = 0; c < 3; c += 1) {
    let flux = 0
    let width = 0
    while (step < BEST_QUANTILE_STEPS) {
      const speed = speeds[step] ?? 0
      if (c < 2 && flux + speed * carry > perClass) {
        const take = (perClass - flux) / speed
        flux = perClass
        width += take
        carry -= take
        break
      }
      flux += speed * carry
      width += carry
      step += 1
      carry = 1
    }
    classes.push(width > 0 ? flux / width : 0)
  }
  const result = classes as [number, number, number]
  classFallSpeedCache.set(key, result)
  return result
}

/**
 * Wind speed over each third's own fall speed at this rain rate: the tangent of the rain's angle
 * off vertical at the record's 10 m, one entry per third of the rain reaching the ground
 */
export const rainSlopes = (speedMS: number, rateMmH: number): [number, number, number] =>
  rainClassFallSpeedsMS(rateMmH).map((fall) => speedMS / fall) as [number, number, number]

/** Gunn and Kinzer's terminal fall speed for the drip's own mass-mode diameter */
export const DRIP_FALL_MS = fallSpeedMS(DRIP_DROP_MM.value)

/** Fine enough to resolve a still-air drip strip, which is 20 cm wide before the wind moves it */
export const RAIN_CELL_M = 0.1 as Meters
/**
 * Twelve 30 degree bins of the direction the wind blows from: the rose's resolution, and every
 * bin equally likely where the weather record carries no direction
 */
export const WIND_DIRECTIONS = 12
/**
 * A one-hectare plot at 0.1 m is a million cells and 230 ms a field, a visible hitch on every
 * edit, so `rainCellM` grows the cell past this many cells rather than holding the resolution fixed
 */
export const RAIN_MAX_CELLS = 300_000

const GRAVITY_MS2 = 9.81
/** FAO-56's log profile is undefined at ground level, and a bed's own drip line still needs a height */
const MIN_WIND_HEIGHT_M = 0.5

const equalRose = (speedMS: number, slope: readonly [number, number, number]): RainWind => ({
  directed: false,
  bins: Array.from({ length: WIND_DIRECTIONS }, (_, k) => ({
    fromDeg: (360 / WIND_DIRECTIONS) * k,
    weight: 1 / WIND_DIRECTIONS,
    speedMS,
    slope,
  })),
})

interface RainSums {
  readonly weight: number[]
  readonly speedSum: number[]
  readonly slopeSum: readonly [number[], number[], number[]]
}

const newRainSums = (bins: number): RainSums => ({
  weight: new Array<number>(bins).fill(0),
  speedSum: new Array<number>(bins).fill(0),
  slopeSum: [
    new Array<number>(bins).fill(0),
    new Array<number>(bins).fill(0),
    new Array<number>(bins).fill(0),
  ],
})

/** Adds one hour's weight, wind and per-class slope contribution to bin k */
const addHour = (
  sums: RainSums,
  k: number,
  weight: number,
  speedMS: number,
  rateMmH: number,
): void => {
  sums.weight[k] = (sums.weight[k] ?? 0) + weight
  sums.speedSum[k] = (sums.speedSum[k] ?? 0) + weight * speedMS
  const falls = rainClassFallSpeedsMS(rateMmH)
  for (let c = 0; c < falls.length; c += 1) {
    const fall = falls[c] ?? 0
    const slopeSum = sums.slopeSum[c]
    if (slopeSum === undefined || fall === 0) continue
    slopeSum[k] = (slopeSum[k] ?? 0) + (weight * speedMS) / fall
  }
}

/** Bin k's rain-weighted mean speed and per-class slopes, 0 where no weight landed in it */
const meanAt = (
  sums: RainSums,
  k: number,
): { speedMS: number; slope: readonly [number, number, number] } => {
  const w = sums.weight[k] ?? 0
  if (w === 0) return { speedMS: 0, slope: [0, 0, 0] }
  return {
    speedMS: (sums.speedSum[k] ?? 0) / w,
    slope: sums.slopeSum.map((s) => (s[k] ?? 0) / w) as [number, number, number],
  }
}

/**
 * One pass over the weather's hours, filed into whatever bin `binOf` returns and skipped where it
 * returns undefined: `all` counts every hour equally at `FALLBACK_RAIN_RATE_MM_H`, `wet` weighs
 * each wet hour by its own rain, at its own rate. Shared by the directed rose and the pooled
 * fallback rose below, so the wet-or-fallback rule lives in one place
 */
const accumulateRain = (
  weather: TmySeries,
  bins: number,
  binOf: (hour: number, speedMS: number) => number | undefined,
): { wet: RainSums; all: RainSums; wetTotal: number; allTotal: number } => {
  const { windSpeedMS, precipMm } = weather
  const hours = windSpeedMS.length
  const wet = newRainSums(bins)
  const all = newRainSums(bins)
  let wetTotal = 0
  let allTotal = 0
  for (let hour = 0; hour < hours; hour += 1) {
    const speed = at(windSpeedMS, hour)
    const k = binOf(hour, speed)
    if (k === undefined) continue
    addHour(all, k, 1, speed, FALLBACK_RAIN_RATE_MM_H.value)
    allTotal += 1
    const rain = precipMm !== undefined ? at(precipMm, hour) : 0
    if (rain > 0) {
      addHour(wet, k, rain, speed, rain)
      wetTotal += rain
    }
  }
  return { wet, all, wetTotal, allTotal }
}

/**
 * The equal twelve-way rose at the record's own rain-weighted wind and slopes, pooling every hour
 * into one bin before spreading it back across all twelve: used wherever the record carries no
 * wind direction, or carries direction but no hour either path can use
 */
const fallbackRose = (weather: TmySeries): RainWind => {
  const { wet, all, wetTotal } = accumulateRain(weather, 1, (_hour, speed) =>
    Number.isFinite(speed) ? 0 : undefined,
  )
  const useWet = weather.precipMm !== undefined && wetTotal > 0
  const { speedMS, slope } = meanAt(useWet ? wet : all, 0)
  return equalRose(speedMS, slope)
}

/**
 * The site's wind rose in its rain hours: twelve 30 degree bins of the direction the wind blows
 * from, each with the share of the site's rain that fell in it, that bin's own rain-weighted mean
 * speed and its rain-weighted mean slope per drop-mass class. Weighted by each hour's own
 * `precipMm`, because what is being averaged is the rain reaching the ground, and every
 * millimeter of it carries its own hour's wind and its own drop sizes. Falls back to the equal
 * twelve-way rose at the record's own pooled speed and slopes wherever the record carries no wind
 * direction, or carries direction but no rain at all
 */
export const rainWind = (weather: TmySeries | null): RainWind => {
  if (weather === null) return equalRose(0, rainSlopes(0, FALLBACK_RAIN_RATE_MM_H.value))
  const { windDirectionDeg } = weather
  if (windDirectionDeg === undefined) return fallbackRose(weather)

  const { wet, all, wetTotal, allTotal } = accumulateRain(
    weather,
    WIND_DIRECTIONS,
    (hour, speed) => {
      const dir = at(windDirectionDeg, hour)
      if (!Number.isFinite(speed) || !Number.isFinite(dir)) return undefined
      return Math.round((((dir % 360) + 360) % 360) / 30) % WIND_DIRECTIONS
    },
  )
  // the same wet-hour-or-fall-back-to-every-hour rule as the pooled rose, applied bin by bin
  const useWet = weather.precipMm !== undefined && wetTotal > 0
  const sums = useWet ? wet : all
  const total = useWet ? wetTotal : allTotal
  if (total === 0) return fallbackRose(weather)

  const bins: RainWindBin[] = sums.weight.map((w, k) => {
    const { speedMS, slope } = meanAt(sums, k)
    return { fromDeg: (360 / WIND_DIRECTIONS) * k, weight: w / total, speedMS, slope }
  })
  return { bins, directed: true }
}

/**
 * The 10 m wind the weather record carries, brought to height `heightM` through FAO-56's log
 * profile: down to 2 m by `windSpeedAt2m`, then back up by the same formula inverted. Clamped to
 * at least `MIN_WIND_HEIGHT_M`, where the profile is undefined
 */
export const windAtHeightMS = (wind10MS: number, heightM: number): number => {
  const u2 = windSpeedAt2m(wind10MS, TMY_WIND_HEIGHT_M)
  const h = Math.max(heightM, MIN_WIND_HEIGHT_M)
  return (u2 * Math.log(67.8 * h - 5.42)) / 4.87
}

/**
 * A drip leaves the edge at height h from rest into the site's own wind profile, falling under
 * quadratic drag k = g / v^2 acting along its velocity relative to the wind, v its terminal fall
 * speed `DRIP_FALL_MS`: with the drop's velocity (vx, vz), z measured downward and U the wind at
 * the drop's own height above ground, r = hypot(U - vx, vz), dvx/dt = k r (U - vx) and dvz/dt = g -
 * k r vz. U is read at each step's own height, since the log profile falls off steeply near the
 * ground and holding the wind at the edge's height for the whole fall overstated the drift by 8 to
 * 10 percent. Integrated by semi-implicit Euler at 0.005 s, since the drop is accelerating for most
 * of a garden-height fall: Gunn and Kinzer 1949 measured that even their largest drops "reached
 * their terminal velocity after falling about 12 meters". This fall from rest is what both Elamri
 * et al. 2018 Eq. 5 (a constant wind push over a free-fall time) and the closed form `U sqrt(g)
 * (2h)^1.5 / (6 v^2)` (drag along the fall speed only) approximate: the closed form is this fall's
 * own weak-wind limit, and Eq. 5 comes closest between about 5 and 9 m/s from a 2.5 m edge, where
 * it crosses. At 3 m/s from that edge Eq. 5 reads 35 percent under this fall and the closed form 38
 * percent under
 */
export const dripDriftM = (heightM: number, wind10MS: number): number => {
  // a panel clearance of 0 is a setting the editor allows, and the loop below never runs at it,
  // which would leave the overshoot correction dividing by a fall speed of 0 and reading NaN
  if (heightM <= 0 || wind10MS <= 0) return 0
  const dragK = GRAVITY_MS2 / DRIP_FALL_MS ** 2
  const dt = 0.005
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
  // take back the last step's overshoot past `heightM`
  return x - (vx * (z - heightM)) / vz
}

/**
 * The field's own cell size: `RAIN_CELL_M` up to `RAIN_MAX_CELLS` of extent, coarser past it.
 * 3,000 m² is the last extent that still fits at 0.1 m. A one-hectare plot lands at 0.2 m, which
 * still resolves the 0.2 m still-air strip as one cell
 */
export const rainCellM = (extent: Extent2D): Meters => {
  const [widthM, heightM] = extentSize(extent)
  const areaM2 = widthM * heightM
  return Math.max(RAIN_CELL_M, Math.ceil(Math.sqrt(areaM2 / RAIN_MAX_CELLS) * 20) / 20) as Meters
}

interface CellRange {
  readonly colStart: number
  readonly colEnd: number
  readonly rowStart: number
  readonly rowEnd: number
}

/** The grid's own cell-center convention: index = row x cols + col, row 0 at the grid's south edge */
const cellCenter = (grid: GridSpec, index: number): readonly [number, number] => {
  const col = index % grid.cols
  const row = Math.floor(index / grid.cols)
  return [
    grid.extent.minXM + (col + 0.5) * grid.cellSizeM,
    grid.extent.minYM + (row + 0.5) * grid.cellSizeM,
  ]
}

/** The inclusive col/row span a bounding box touches, clamped to the grid it is read against */
const cellRange = (
  grid: GridSpec,
  minX: number,
  maxX: number,
  minY: number,
  maxY: number,
): CellRange => {
  const { extent, cellSizeM, cols, rows } = grid
  return {
    colStart: clamp(Math.floor((minX - extent.minXM) / cellSizeM), 0, cols - 1),
    colEnd: clamp(Math.ceil((maxX - extent.minXM) / cellSizeM), 0, cols - 1),
    rowStart: clamp(Math.floor((minY - extent.minYM) / cellSizeM), 0, rows - 1),
    rowEnd: clamp(Math.ceil((maxY - extent.minYM) / cellSizeM), 0, rows - 1),
  }
}

/** A plan point, x east and y north */
type Point = readonly [number, number]

/**
 * Whether a cell in bin k is under the panel's rain shadow, and how much of the panel's rain that
 * bin catches, both read off one shape per drop-mass class: the plan quad's four corners slid
 * downwind by their own height times tan aR, that class's own rain angle off vertical in this
 * bin's wind (Elamri et al. 2018 Eq. 1: tan aR = wind speed over a raindrop's fall speed, one
 * fall speed per class here, so the slow small-drop class shears the shadow further and blurs
 * its downwind edge). The low edge and the high edge sit at different heights, so a tilted
 * panel's quad comes out a parallelogram sheared further at its high edge, where a fixed shift
 * would have kept the plan rectangle. `shelterQuad` below sets bit k of that class's own bit set
 * for every cell inside its quad, and the same quad's own area (by `ringAreaM2`, at the call
 * site) is the panel's catchment for that class in this bin (Elamri et al. 2018 Eq. 4 / Van Hamme
 * 1992), bigger than the plan area when the panel faces the rain, smaller turned away from it,
 * and equal to it flat or still. The three classes' catchments average to the panel's own
 * catchment in the bin, since a third of the rain falls as each
 */
const project = (v: Vec3M, tanAlpha: number, downwind: Point): Point => [
  v.xM + v.zM * tanAlpha * downwind[0],
  v.yM + v.zM * tanAlpha * downwind[1],
]

/**
 * Sets bit k of every cell whose center lies inside the parallelogram `quad` (already projected for
 * bin k and one drop-mass class) by the quad's own exact inverse: e = p1 - p0, f = p3 - p0, and a
 * cell center is inside where its own (s, t) in that basis both fall within 0 and 1. A
 * two-dot-product test only fits a fixed rectangle, and a sheared quad isn't one
 */
const shelterQuad = (
  quad: readonly Point[],
  k: number,
  grid: GridSpec,
  bits: Uint16Array,
): void => {
  const [p0, p1, , p3] = quad
  if (p0 === undefined || p1 === undefined || p3 === undefined) return
  const ex = p1[0] - p0[0]
  const ey = p1[1] - p0[1]
  const fx = p3[0] - p0[0]
  const fy = p3[1] - p0[1]
  const det = ex * fy - ey * fx
  if (Math.abs(det) < 1e-9) return
  let minX = Infinity
  let maxX = -Infinity
  let minY = Infinity
  let maxY = -Infinity
  for (const [x, y] of quad) {
    minX = Math.min(minX, x)
    maxX = Math.max(maxX, x)
    minY = Math.min(minY, y)
    maxY = Math.max(maxY, y)
  }
  const range = cellRange(grid, minX, maxX, minY, maxY)
  const bit = 1 << k
  for (let row = range.rowStart; row <= range.rowEnd; row += 1) {
    for (let col = range.colStart; col <= range.colEnd; col += 1) {
      const cx = grid.extent.minXM + (col + 0.5) * grid.cellSizeM - p0[0]
      const cy = grid.extent.minYM + (row + 0.5) * grid.cellSizeM - p0[1]
      const s = (cx * fy - cy * fx) / det
      const t = (ex * cy - ey * cx) / det
      if (s >= 0 && s <= 1 && t >= 0 && t <= 1) {
        const idx = row * grid.cols + col
        bits[idx] = (bits[idx] ?? 0) | bit
      }
    }
  }
}

interface DripEdge {
  readonly ax: number
  readonly ay: number
  readonly bx: number
  readonly by: number
  readonly share: number
  readonly z: number
}

/**
 * The cells within `halfWidthM` of the edge segment, measured perpendicular to it, whose
 * projection onto it falls within the segment's own length: a rectangular strip with square ends,
 * so a drip never reaches past the module it fell from
 */
const cellsAlongEdge = (edge: DripEdge, halfWidthM: number, grid: GridSpec): number[] => {
  const dx = edge.bx - edge.ax
  const dy = edge.by - edge.ay
  const length = Math.hypot(dx, dy)
  if (length < 1e-9) return []
  const ux = dx / length
  const uy = dy / length
  const nx = -uy
  const ny = ux
  const range = cellRange(
    grid,
    Math.min(edge.ax, edge.bx) - halfWidthM,
    Math.max(edge.ax, edge.bx) + halfWidthM,
    Math.min(edge.ay, edge.by) - halfWidthM,
    Math.max(edge.ay, edge.by) + halfWidthM,
  )
  const indices: number[] = []
  for (let row = range.rowStart; row <= range.rowEnd; row += 1) {
    for (let col = range.colStart; col <= range.colEnd; col += 1) {
      const cx = grid.extent.minXM + (col + 0.5) * grid.cellSizeM
      const cy = grid.extent.minYM + (row + 0.5) * grid.cellSizeM
      const px = cx - edge.ax
      const py = cy - edge.ay
      const t = px * ux + py * uy
      if (t < 0 || t > length) continue
      if (Math.abs(px * nx + py * ny) > halfWidthM) continue
      indices.push(row * grid.cols + col)
    }
  }
  return indices
}

interface RowGroup {
  readonly arrayId: ArrayId
  readonly rowIndex: number
  readonly xs: number[]
  readonly ys: number[]
  /** The row's low edge direction (v0->v1 of the first panel seen), turned 90 degrees */
  readonly normal: Point
}

const bedRainOf = (
  bed: Bed,
  arrays: readonly PvArray[],
  snapshot: PanelSnapshot,
  grid: GridSpec,
  shelter: Float32Array,
  drip: Float32Array,
  owner: Int32Array,
): BedRain => {
  const box = extentOf([bed.footprint.exterior])
  const range = cellRange(grid, box.minXM, box.maxXM, box.minYM, box.maxYM)
  const cells: number[] = []
  for (let row = range.rowStart; row <= range.rowEnd; row += 1) {
    for (let col = range.colStart; col <= range.colEnd; col += 1) {
      const [cx, cy] = cellCenter(grid, row * grid.cols + col)
      if (pointInPolygon(bed.footprint, cx, cy)) cells.push(row * grid.cols + col)
    }
  }
  if (cells.length === 0) {
    return { bedId: bed.id, shelteredFraction: 0 as Fraction, dripMultiple: 0, crossings: [] }
  }

  let shelterSum = 0
  let dripSum = 0
  const groups = new Map<string, RowGroup>()
  for (const i of cells) {
    shelterSum += shelter[i] ?? 0
    dripSum += drip[i] ?? 0
    const ownerIndex = owner[i] ?? 0
    if (ownerIndex === 0) continue
    const panel = snapshot.panels[ownerIndex - 1]
    if (panel === undefined) continue
    const key = `${panel.arrayId}:${String(panel.rowIndex)}`
    const [cx, cy] = cellCenter(grid, i)
    const group = groups.get(key)
    if (group === undefined) {
      const [rowV0, rowV1] = panel.corners.vertices
      const ux = rowV0 !== undefined && rowV1 !== undefined ? rowV1.xM - rowV0.xM : 1
      const uy = rowV0 !== undefined && rowV1 !== undefined ? rowV1.yM - rowV0.yM : 0
      const uLen = Math.hypot(ux, uy) || 1
      groups.set(key, {
        arrayId: panel.arrayId,
        rowIndex: panel.rowIndex,
        xs: [cx],
        ys: [cy],
        normal: [-uy / uLen, ux / uLen],
      })
    } else {
      group.xs.push(cx)
      group.ys.push(cy)
    }
  }

  const bedCenter = centroidOf(bed.footprint.exterior)
  const crossings: DripCrossing[] = [...groups.values()].map((group) => {
    const array = arrays.find((candidate) => candidate.id === group.arrayId)
    const [nx, ny] = group.normal
    let minProj = Infinity
    let maxProj = -Infinity
    for (let i = 0; i < group.xs.length; i += 1) {
      const proj = (group.xs[i] ?? 0) * nx + (group.ys[i] ?? 0) * ny
      minProj = Math.min(minProj, proj)
      maxProj = Math.max(maxProj, proj)
    }
    const dx = mean(group.xs) - bedCenter.xM
    const dy = mean(group.ys) - bedCenter.yM
    const side: DripCrossing['side'] =
      Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'east' : 'west') : dy > 0 ? 'north' : 'south'
    return {
      arrayId: group.arrayId,
      rowIndex: group.rowIndex,
      rowCount: array?.geometry.rowCount ?? 1,
      side,
      stripWidthM: (maxProj - minProj + grid.cellSizeM) as Meters,
    }
  })

  return {
    bedId: bed.id,
    shelteredFraction: (shelterSum / cells.length) as Fraction,
    dripMultiple: dripSum / cells.length,
    crossings,
  }
}

/**
 * The rain the rows shed and keep off the ground, over the plot's own panel geometry: sheltered
 * under the panels, concentrated into a drip strip along each row's low edge (both long edges,
 * half each, for a flat panel that has no low edge), open everywhere else. `plot.northOffsetDeg`
 * is ignored, the way the light bake ignores it: `panelSnapshot`'s plot frame is +x east, +y north
 * already. None of it depends on where a bed sits, so `rainGround` builds it once per plot and
 * `rainOnBed` reads it for as many footprints as a search needs to try
 */
export interface RainGround {
  readonly grid: GridSpec
  readonly wind: RainWind
  /** Share of each cell in the panels' rain shadow, over the site's rain-hour wind rose: 0 open, 1 fully sheltered */
  readonly shelter: Float32Array
  /** Panel runoff landing on each cell, as a multiple of what the same ground would get open to the sky */
  readonly drip: Float32Array
  /** Rain reaching each cell as a multiple of open ground: 0 in shadow, 1 open, a strip several. Equals 1 - shelter + drip */
  readonly values: Float32Array
  /** The panel whose drip strip laid water on each cell, a 1-based index into `snapshot.panels`, 0 where no strip reached it */
  readonly owner: Int32Array
  readonly snapshot: PanelSnapshot
}

/**
 * Builds the ground the plot's own panels give it: the shelter, drip and per-cell values
 * `rainOnBed` reads for one bed at a time, plus the panel snapshot it reads them against
 */
export const rainGround = (plot: GardenPlot, wind: RainWind): RainGround => {
  const snapshot = panelSnapshot(plot.arrays, 0 as EpochMillis, -90 as Degrees, 0 as Degrees)

  // every edge of a row shares a height, and a rose has only twelve speeds, so the same
  // (height, wind) pair recurs across a plot's whole panel count: cache the integration on it
  const dripDriftCache = new Map<string, number>()
  const cachedDripDriftM = (heightM: number, wind10MS: number): number => {
    const key = `${heightM}:${wind10MS}`
    const cached = dripDriftCache.get(key)
    if (cached !== undefined) return cached
    const value = dripDriftM(heightM, wind10MS)
    dripDriftCache.set(key, value)
    return value
  }

  // a strip that drifts past the field's own edge lays its water nowhere, since `cellsAlongEdge`
  // finds no cell out there and the loop below skips it: the margin is the largest drift the rose
  // carries off any panel edge height, plus the strip's own half width, and never under the 3 m a
  // still plot needs for its shadows
  let maxDriftM = 0
  for (const panel of snapshot.panels) {
    for (const vertex of panel.corners.vertices) {
      for (const bin of wind.bins) {
        if (bin.weight <= 0) continue
        maxDriftM = Math.max(maxDriftM, cachedDripDriftM(vertex.zM, bin.speedMS))
      }
    }
  }
  const extent = sceneExtent(
    plot.arrays,
    plot.beds.map((bed) => bed.footprint),
    Math.max(3, maxDriftM + STILL_AIR_STRIP_M.value / 2) as Meters,
    plot.boundary.exterior,
  )
  const grid = gridForExtent(extent, rainCellM(extent))
  const cellCount = grid.cols * grid.rows
  const cellAreaM2 = grid.cellSizeM * grid.cellSizeM
  // a strip narrower than a cell can fall between two cell centers and lay its water nowhere: on
  // a coarsened grid the strip is at least one cell wide, and the total it lays is unchanged
  const halfStripM = Math.max(STILL_AIR_STRIP_M.value / 2, grid.cellSizeM / 2)

  // one bit set per drop-mass class, since each shears the panel's shadow by its own amount
  const bits: readonly [Uint16Array, Uint16Array, Uint16Array] = [
    new Uint16Array(cellCount),
    new Uint16Array(cellCount),
    new Uint16Array(cellCount),
  ]
  const drip = new Float32Array(cellCount)
  const owner = new Int32Array(cellCount)

  for (let p = 0; p < snapshot.panels.length; p += 1) {
    const panel = snapshot.panels[p]
    const [v0, v1, v2, v3] = panel?.corners.vertices ?? []
    if (
      panel === undefined ||
      v0 === undefined ||
      v1 === undefined ||
      v2 === undefined ||
      v3 === undefined
    ) {
      continue
    }
    const flat = v2.zM - v0.zM < 1e-3
    const midZ = (v0.zM + v2.zM) / 2
    const edges: readonly DripEdge[] = flat
      ? [
          { ax: v0.xM, ay: v0.yM, bx: v1.xM, by: v1.yM, share: 0.5, z: v0.zM },
          { ax: v3.xM, ay: v3.yM, bx: v2.xM, by: v2.yM, share: 0.5, z: v2.zM },
        ]
      : [{ ax: v0.xM, ay: v0.yM, bx: v1.xM, by: v1.yM, share: 1, z: v0.zM }]

    for (let k = 0; k < wind.bins.length; k += 1) {
      const bin = wind.bins[k]
      if (bin === undefined || bin.weight <= 0) continue
      // windAtHeightMS is linear in its speed argument, so at speed 1 it is just the profile's
      // own height factor, shared by all three classes at this panel's mid height
      const heightFactor = windAtHeightMS(1, midZ)
      const downwind: Point = [-sinDeg(bin.fromDeg), -cosDeg(bin.fromDeg)]

      let catchSumM2 = 0
      for (let c = 0; c < 3; c += 1) {
        const tanAlpha = (bin.slope[c] ?? 0) * heightFactor
        const quad: readonly Point[] = [
          project(v0, tanAlpha, downwind),
          project(v1, tanAlpha, downwind),
          project(v2, tanAlpha, downwind),
          project(v3, tanAlpha, downwind),
        ]
        const classBits = bits[c]
        if (classBits !== undefined) shelterQuad(quad, k, grid, classBits)
        catchSumM2 += Math.abs(
          ringAreaM2(quad.map(([x, y]) => ({ xM: x as Meters, yM: y as Meters }))),
        )
      }
      // a third of the rain falls as each class, so the panel's own catchment in this bin is
      // their mean
      const catchM2 = catchSumM2 / 3

      for (const edge of edges) {
        const d = cachedDripDriftM(edge.z, bin.speedMS)
        const shifted: DripEdge = {
          ax: edge.ax + d * downwind[0],
          ay: edge.ay + d * downwind[1],
          bx: edge.bx + d * downwind[0],
          by: edge.by + d * downwind[1],
          share: edge.share,
          z: edge.z,
        }
        const indices = cellsAlongEdge(shifted, halfStripM, grid)
        if (indices.length === 0) continue
        const perCell = (catchM2 * edge.share * bin.weight) / (indices.length * cellAreaM2)
        for (const i of indices) {
          drip[i] = (drip[i] ?? 0) + perCell
          owner[i] = p + 1
        }
      }
    }
  }

  const shelter = new Float32Array(cellCount)
  for (let i = 0; i < cellCount; i += 1) {
    let sum = 0
    for (let c = 0; c < 3; c += 1) {
      const mask = bits[c]?.[i] ?? 0
      if (mask === 0) continue
      let classSum = 0
      for (let k = 0; k < wind.bins.length; k += 1) {
        if (mask & (1 << k)) classSum += wind.bins[k]?.weight ?? 0
      }
      // weights sum to 1 so this can't exceed 1, but floating sums can land at 1.0000001
      sum += Math.min(1, classSum)
    }
    // each class shelters its own third of the rain, so the cell's own share is their mean
    shelter[i] = sum / 3
  }

  const values = new Float32Array(cellCount)
  for (let i = 0; i < cellCount; i += 1) {
    values[i] = 1 - (shelter[i] ?? 0) + (drip[i] ?? 0)
  }

  return { grid, wind, shelter, drip, values, owner, snapshot }
}

/**
 * One bed's own rain, read off a ground already built for the plot: a thin call into `bedRainOf`
 * so a search can try as many footprints as it needs against the same ground without paying for
 * the panel loop again
 */
export const rainOnBed = (ground: RainGround, arrays: readonly PvArray[], bed: Bed): BedRain =>
  bedRainOf(bed, arrays, ground.snapshot, ground.grid, ground.shelter, ground.drip, ground.owner)

/**
 * Where the site's rain lands, over the plot's own panel geometry, for every bed the plot already
 * holds: `rainGround` once for the whole plot, then `rainOnBed` for each of its beds. Kept for the
 * callers that already have a plot's own beds and want the whole field back in one call
 */
export const rainField = (plot: GardenPlot, wind: RainWind): RainField => {
  const ground = rainGround(plot, wind)
  return {
    grid: ground.grid,
    wind: ground.wind,
    shelter: ground.shelter,
    drip: ground.drip,
    values: ground.values,
    beds: plot.beds.map((bed) => rainOnBed(ground, plot.arrays, bed)),
  }
}
