import { TMY_WIND_HEIGHT_M, windSpeedAt2m } from '../data/water'
import { at, clamp, mean } from '../data/util'
import { centroidOf, extentOf, pointInPolygon, ringAreaM2 } from '../state/geom'
import { gridForExtent, panelSnapshot, sceneExtent } from '../sim/geometry'
import type { GridSpec, Ring2D } from '../types/geo'
import type { Bed, GardenPlot } from '../types/garden'
import type { ArrayId } from '../types/ids'
import type { Degrees, EpochMillis, Fraction, Meters } from '../types/units'
import type { PanelSnapshot, PvArray } from '../types/pv'
import type { BedRain, DripCrossing, RainField } from '../types/water'
import type { TmySeries } from '../types/weather'

/** Elamri et al. 2018: at low tilt about 90% of a panel's water leaves through a 20 cm outlet */
export const STILL_AIR_STRIP_M = 0.2
/** Gunn and Kinzer 1949: a 2 mm raindrop's terminal fall speed */
export const RAINDROP_FALL_MS = 6.5
/** Gunn and Kinzer 1949: a 4 mm drip's terminal fall speed */
export const DRIP_FALL_MS = 8.8
/** Fine enough to resolve a still-air drip strip, which is 20 cm wide before the wind widens it */
export const RAIN_CELL_M = 0.1 as Meters
/** The weather record carries no wind direction, so every one of these is taken as equally likely */
export const WIND_DIRECTIONS = 12

const GRAVITY_MS2 = 9.81
/** FAO-56's log profile is undefined at ground level, and a bed's own drip line still needs a height */
const MIN_WIND_HEIGHT_M = 0.5

/**
 * The site's mean wind in the hours it actually rained, from `windSpeedMS`. Falls back to the
 * mean over every hour when the source ships no `precipMm` column (PVGIS, NSRDB) or none of its
 * hours are wet, since a typical year built from monthly normals can land here with real rain but
 * no hour marked as carrying it
 */
export const rainHourWindMS = (weather: TmySeries): number => {
  const { windSpeedMS, precipMm } = weather
  const hours = windSpeedMS.length
  if (hours === 0) return 0
  let wetSum = 0
  let wetCount = 0
  let allSum = 0
  for (let hour = 0; hour < hours; hour += 1) {
    const wind = at(windSpeedMS, hour)
    allSum += wind
    if (precipMm !== undefined && at(precipMm, hour) > 0) {
      wetSum += wind
      wetCount += 1
    }
  }
  return wetCount > 0 ? wetSum / wetCount : allSum / hours
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

/** A panel's rain shadow at height h in wind U moves by h x U over a raindrop's fall speed */
export const shadowShiftM = (heightM: number, windAtHeightMSValue: number): number =>
  (heightM * windAtHeightMSValue) / RAINDROP_FALL_MS

/**
 * A drip leaving an edge at height h from rest drifts under quadratic drag while its fall speed
 * is still growing, which holds below about 4 m: x = U sqrt(g) (2h)^1.5 / (6 v^2) with v the
 * drip's terminal speed. At the default 2.5 m clearance that is 0.075 m per m/s of wind, at
 * Elamri et al. 2018's 5 m rig 0.21, which is why the wind ruled their plot
 */
export const dripDriftM = (heightM: number, windAtHeightMSValue: number): number =>
  (windAtHeightMSValue * Math.sqrt(GRAVITY_MS2) * (2 * heightM) ** 1.5) / (6 * DRIP_FALL_MS ** 2)

interface CellRange {
  readonly colStart: number
  readonly colEnd: number
  readonly rowStart: number
  readonly rowEnd: number
}

/** The grid's own cell-centre convention: index = row x cols + col, row 0 at the grid's south edge */
const cellCentre = (grid: GridSpec, index: number): readonly [number, number] => {
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

const popcount = (bits: number): number => {
  let n = bits
  let count = 0
  while (n > 0) {
    count += n & 1
    n >>= 1
  }
  return count
}

/** The wind's directions, laid out once: the shelter loop below runs them per cell per panel */
const DIRECTIONS: readonly (readonly [number, number])[] = Array.from(
  { length: WIND_DIRECTIONS },
  (_, k) => {
    const theta = (2 * Math.PI * k) / WIND_DIRECTIONS
    return [Math.cos(theta), Math.sin(theta)] as const
  },
)

/**
 * Sets, for every cell near the panel's plan quad, one bit per wind direction: bit k is set where
 * the cell's centre, pushed out by the shadow shift `r` towards direction k, still lands inside
 * the quad. Averaged over the 12 directions this is the share of the wind's possible directions
 * that leave the cell under the panel, which is symmetric in the shift's own sign, so which way
 * `r` is read as pointing never has to be decided.
 *
 * The quad is a tilted rectangle seen from above, so it is a parallelogram, and a point is inside
 * it where its two coordinates along the edges from `v0` both fall within the edge lengths: two
 * dot products in place of a ray cast: the default plot's field at a 6 m/s wind took 39 ms with
 * the ray cast and takes 12 with this, and the field is recomputed on every move of a drag
 */
const shelterPanel = (ring: Ring2D, r: number, grid: GridSpec, bits: Uint16Array): void => {
  const [v0, v1, , v3] = ring
  if (v0 === undefined || v1 === undefined || v3 === undefined) return
  const ex = v1.xM - v0.xM
  const ey = v1.yM - v0.yM
  const fx = v3.xM - v0.xM
  const fy = v3.yM - v0.yM
  const eLen2 = ex * ex + ey * ey
  const fLen2 = fx * fx + fy * fy
  if (eLen2 < 1e-12 || fLen2 < 1e-12) return
  const box = extentOf([ring])
  const range = cellRange(grid, box.minXM - r, box.maxXM + r, box.minYM - r, box.maxYM + r)
  for (let row = range.rowStart; row <= range.rowEnd; row += 1) {
    for (let col = range.colStart; col <= range.colEnd; col += 1) {
      const idx = row * grid.cols + col
      const cx = grid.extent.minXM + (col + 0.5) * grid.cellSizeM - v0.xM
      const cy = grid.extent.minYM + (row + 0.5) * grid.cellSizeM - v0.yM
      let mask = 0
      for (let k = 0; k < WIND_DIRECTIONS; k += 1) {
        const [dx, dy] = DIRECTIONS[k] ?? [1, 0]
        const px = cx + r * dx
        const py = cy + r * dy
        const s = (px * ex + py * ey) / eLen2
        const t = (px * fx + py * fy) / fLen2
        if (s >= 0 && s <= 1 && t >= 0 && t <= 1) mask |= 1 << k
      }
      bits[idx] = (bits[idx] ?? 0) | mask
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
 * projection onto it falls within the segment's own length: a rectangular strip, not a capsule
 * rounded at the ends, so a drip never reaches past the module it fell from
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

const bedRainOf = (
  bed: Bed,
  arrays: readonly PvArray[],
  snapshot: PanelSnapshot,
  grid: GridSpec,
  bits: Uint16Array,
  drip: Float32Array,
  owner: Int32Array,
  wind10MS: number,
): BedRain => {
  const box = extentOf([bed.footprint.exterior])
  const range = cellRange(grid, box.minXM, box.maxXM, box.minYM, box.maxYM)
  const cells: number[] = []
  for (let row = range.rowStart; row <= range.rowEnd; row += 1) {
    for (let col = range.colStart; col <= range.colEnd; col += 1) {
      const [cx, cy] = cellCentre(grid, row * grid.cols + col)
      if (pointInPolygon(bed.footprint, cx, cy)) cells.push(row * grid.cols + col)
    }
  }
  if (cells.length === 0) {
    return { bedId: bed.id, shelteredFraction: 0 as Fraction, dripMultiple: 0, crossings: [] }
  }

  let shelterSum = 0
  let dripSum = 0
  const groups = new Map<
    string,
    {
      readonly arrayId: ArrayId
      readonly rowIndex: number
      readonly xs: number[]
      readonly ys: number[]
    }
  >()
  for (const i of cells) {
    shelterSum += popcount(bits[i] ?? 0) / WIND_DIRECTIONS
    dripSum += drip[i] ?? 0
    const ownerIndex = owner[i] ?? 0
    if (ownerIndex === 0) continue
    const panel = snapshot.panels[ownerIndex - 1]
    if (panel === undefined) continue
    const key = `${panel.arrayId} ${String(panel.rowIndex)}`
    const group = groups.get(key) ?? {
      arrayId: panel.arrayId,
      rowIndex: panel.rowIndex,
      xs: [],
      ys: [],
    }
    const [cx, cy] = cellCentre(grid, i)
    group.xs.push(cx)
    group.ys.push(cy)
    groups.set(key, group)
  }

  const bedCentre = centroidOf(bed.footprint.exterior)
  const crossings: DripCrossing[] = [...groups.values()].map((group) => {
    const array = arrays.find((candidate) => candidate.id === group.arrayId)
    const clearanceHeightM = array?.geometry.clearanceHeightM ?? 0
    const d = dripDriftM(clearanceHeightM, windAtHeightMS(wind10MS, clearanceHeightM))
    const dx = mean(group.xs) - bedCentre.xM
    const dy = mean(group.ys) - bedCentre.yM
    const side: DripCrossing['side'] =
      Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'east' : 'west') : dy > 0 ? 'north' : 'south'
    return {
      arrayId: group.arrayId,
      rowIndex: group.rowIndex,
      rowCount: array?.geometry.rowCount ?? 1,
      side,
      stripWidthM: (STILL_AIR_STRIP_M + 2 * d) as Meters,
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
 * Where the site's rain lands, over the plot's own panel geometry: sheltered under the panels,
 * concentrated into a drip strip along each row's low edge (both long edges, half each, for a
 * flat panel that has no low edge), open everywhere else. `plot.northOffsetDeg` is ignored, the
 * way the light bake ignores it: `panelSnapshot`'s plot frame is +x east, +y north already
 */
export const rainField = (plot: GardenPlot, wind10MS: number): RainField => {
  const snapshot = panelSnapshot(plot.arrays, 0 as EpochMillis, -90 as Degrees, 0 as Degrees)
  const grid = gridForExtent(
    sceneExtent(
      plot.arrays,
      plot.beds.map((bed) => bed.footprint),
      3 as Meters,
      plot.boundary.exterior,
    ),
    RAIN_CELL_M,
  )
  const cellCount = grid.cols * grid.rows
  const cellAreaM2 = grid.cellSizeM * grid.cellSizeM

  const bits = new Uint16Array(cellCount)
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
    const ring: Ring2D = [v0, v1, v2, v3]
    const flat = v2.zM - v0.zM < 1e-3
    const midZ = (v0.zM + v2.zM) / 2
    shelterPanel(ring, shadowShiftM(midZ, windAtHeightMS(wind10MS, midZ)), grid, bits)

    const area = ringAreaM2(ring)
    const edges: readonly DripEdge[] = flat
      ? [
          { ax: v0.xM, ay: v0.yM, bx: v1.xM, by: v1.yM, share: 0.5, z: v0.zM },
          { ax: v3.xM, ay: v3.yM, bx: v2.xM, by: v2.yM, share: 0.5, z: v2.zM },
        ]
      : [{ ax: v0.xM, ay: v0.yM, bx: v1.xM, by: v1.yM, share: 1, z: v0.zM }]

    for (const edge of edges) {
      const halfWidthM =
        STILL_AIR_STRIP_M / 2 + dripDriftM(edge.z, windAtHeightMS(wind10MS, edge.z))
      const indices = cellsAlongEdge(edge, halfWidthM, grid)
      if (indices.length === 0) continue
      const perCell = (area * edge.share) / (indices.length * cellAreaM2)
      for (const i of indices) {
        drip[i] = (drip[i] ?? 0) + perCell
        owner[i] = p + 1
      }
    }
  }

  const values = new Float32Array(cellCount)
  for (let i = 0; i < cellCount; i += 1) {
    values[i] = 1 - popcount(bits[i] ?? 0) / WIND_DIRECTIONS + (drip[i] ?? 0)
  }

  return {
    grid,
    values,
    beds: plot.beds.map((bed) =>
      bedRainOf(bed, plot.arrays, snapshot, grid, bits, drip, owner, wind10MS),
    ),
  }
}
