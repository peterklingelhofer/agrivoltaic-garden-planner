import type { Extent2D, GridSpec, Polygon2D, Ring2D, Vec3M } from '../types/geo'
import { panelId } from '../types/ids'
import type {
  DerivedArrayMetrics,
  PanelPolygon,
  PanelSnapshot,
  PvArray,
  TrackerConfig,
} from '../types/pv'
import type {
  Degrees,
  EpochMillis,
  Fraction,
  KilowattsDc,
  Meters,
  Radians,
  SquareMeters,
} from '../types/units'
import { clamp, cosDeg, normalizeDegrees, radiansToDegrees, sinDeg } from './math'
import { nameplateAcKw } from './pv/inverter'

export const groundCoverRatio: (collectorWidthM: Meters, pitchM: Meters) => number = (
  collectorWidthM,
  pitchM,
) => collectorWidthM / pitchM

export const projectedGroundCoverRatio: (
  collectorWidthM: Meters,
  pitchM: Meters,
  tiltDeg: Degrees,
) => number = (collectorWidthM, pitchM, tiltDeg) => (collectorWidthM * cosDeg(tiltDeg)) / pitchM

const referenceTiltDeg = (tracker: TrackerConfig): Degrees => {
  switch (tracker.mode) {
    case 'fixed':
      return tracker.tiltDeg
    case 'single-axis-tilted':
      return tracker.axisTiltDeg
    default:
      return 0 as Degrees
  }
}

/** How many modules stack up the slope, implied by collector width over module height */
export const moduleStackCount: (array: PvArray) => number = (array) =>
  Math.max(1, Math.round(array.geometry.collectorWidthM / array.module.heightM))

export const moduleCount: (array: PvArray) => number = (array) =>
  array.geometry.rowCount * array.geometry.modulesPerRow * moduleStackCount(array)

export const apertureAreaM2: (array: PvArray) => SquareMeters = (array) =>
  (moduleCount(array) * array.module.widthM * array.module.heightM) as SquareMeters

export const nameplateDcKw: (array: PvArray) => KilowattsDc = (array) =>
  ((moduleCount(array) * array.module.nameplateWp) / 1000) as KilowattsDc

export const derivedArrayMetrics: (array: PvArray) => DerivedArrayMetrics = (array) => {
  const { geometry, tracker } = array
  const tiltDeg = referenceTiltDeg(tracker)
  return {
    groundCoverRatio: groundCoverRatio(geometry.collectorWidthM, geometry.pitchM) as Fraction,
    projectedGroundCoverRatio: projectedGroundCoverRatio(
      geometry.collectorWidthM,
      geometry.pitchM,
      tiltDeg,
    ) as Fraction,
    maxHeightM: (geometry.clearanceHeightM + geometry.collectorWidthM * sinDeg(tiltDeg)) as Meters,
    nameplateDcKw: nameplateDcKw(array),
    nameplateAcKw: nameplateAcKw(nameplateDcKw(array)),
  }
}

export interface SurfaceOrientation {
  readonly tiltDeg: Degrees
  readonly surfaceAzimuthDeg: Degrees
  readonly rotationDeg: Degrees
}

/** Single source of the tracker pose used by both the panel snapshot and the PV energy chain */
export const surfaceOrientation: (
  array: PvArray,
  solarElevationDeg: Degrees,
  solarAzimuthDeg: Degrees,
) => SurfaceOrientation = (array, solarElevationDeg, solarAzimuthDeg) => {
  const { geometry, tracker } = array
  const rotationDeg = trackerRotationDeg(tracker, solarElevationDeg, solarAzimuthDeg)
  const isSingleAxis =
    tracker.mode === 'single-axis-horizontal-ns' || tracker.mode === 'single-axis-tilted'
  const axisAzimuthDeg = isSingleAxis ? tracker.axisAzimuthDeg : geometry.rowAzimuthDeg
  return {
    rotationDeg,
    tiltDeg: Math.abs(rotationDeg) as Degrees,
    // every tracking mode here turns about an axis that runs ALONG the rows, so the face it
    // presents is perpendicular to that axis, on whichever side it has turned toward. Returning
    // `rowAzimuthDeg` itself for the last two modes would aim the panel straight down its own
    // torque tube
    surfaceAzimuthDeg:
      tracker.mode === 'fixed'
        ? tracker.surfaceAzimuthDeg
        : (normalizeDegrees(axisAzimuthDeg + (rotationDeg >= 0 ? 90 : -90)) as Degrees),
  }
}

export const trackerRotationDeg: (
  tracker: TrackerConfig,
  solarElevationDeg: Degrees,
  solarAzimuthDeg: Degrees,
) => Degrees = (tracker, solarElevationDeg, solarAzimuthDeg) => {
  switch (tracker.mode) {
    case 'fixed':
      return tracker.tiltDeg
    case 'single-axis-horizontal-ns':
    case 'single-axis-tilted': {
      if (solarElevationDeg <= 0) return 0 as Degrees
      const zenithDeg = 90 - solarElevationDeg
      const deltaAzDeg = solarAzimuthDeg - tracker.axisAzimuthDeg
      const xp = sinDeg(zenithDeg) * sinDeg(deltaAzDeg)
      const zp =
        sinDeg(zenithDeg) * cosDeg(deltaAzDeg) * sinDeg(tracker.axisTiltDeg) +
        cosDeg(zenithDeg) * cosDeg(tracker.axisTiltDeg)
      const rotation = radiansToDegrees(Math.atan2(xp, zp))
      return clamp(rotation, -tracker.maxRotationDeg, tracker.maxRotationDeg) as Degrees
    }
    case 'dual-axis': {
      if (solarElevationDeg < tracker.minElevationDeg) return 0 as Degrees
      return Math.min(90 - solarElevationDeg, tracker.maxRotationDeg) as Degrees
    }
    case 'agro-optimized': {
      // the ground-DLI target is applied by the layout optimizer, which owns pitch
      if (solarElevationDeg <= 0) return 0 as Degrees
      const zenithDeg = 90 - solarElevationDeg
      const rotation = radiansToDegrees(
        Math.atan2(sinDeg(zenithDeg) * sinDeg(solarAzimuthDeg), cosDeg(zenithDeg)),
      )
      return clamp(rotation, -tracker.maxRotationDeg, tracker.maxRotationDeg) as Degrees
    }
  }
}

export const backtrackRotationDeg: (
  trueRotationDeg: Degrees,
  pitchM: Meters,
  collectorWidthM: Meters,
  profileAngleRad: Radians,
) => Degrees = (trueRotationDeg, pitchM, collectorWidthM, profileAngleRad) => {
  // the solar geometry document section 3.2 writes cos(psi); that is a doc slip, sin(psi) is the algebraically correct form
  const correctionRad = Math.acos(
    clamp((pitchM / collectorWidthM) * Math.sin(profileAngleRad), -1, 1),
  )
  return (trueRotationDeg - Math.sign(trueRotationDeg) * radiansToDegrees(correctionRad)) as Degrees
}

export const minimumPitchM: (
  collectorWidthM: Meters,
  tiltDeg: Degrees,
  minProfileAngleRad: Radians,
) => Meters = (collectorWidthM, tiltDeg, minProfileAngleRad) =>
  (collectorWidthM * (cosDeg(tiltDeg) + sinDeg(tiltDeg) / Math.tan(minProfileAngleRad))) as Meters

export const panelSnapshot: (
  arrays: readonly PvArray[],
  utcMillis: EpochMillis,
  solarElevationDeg: Degrees,
  solarAzimuthDeg: Degrees,
) => PanelSnapshot = (arrays, utcMillis, solarElevationDeg, solarAzimuthDeg) => {
  const panels: PanelPolygon[] = []
  for (const array of arrays) {
    const { geometry } = array
    const { tiltDeg, surfaceAzimuthDeg } = surfaceOrientation(
      array,
      solarElevationDeg,
      solarAzimuthDeg,
    )

    // `rowAzimuthDeg` is the direction the rows RUN. That's what the editor calls it ("Which
    // way the rows run"), what `arrayLayout` in `state/derive.ts` draws, and what a single-axis
    // tracker's torque tube lies along, which is why `ArrayPanel` seeds `axisAzimuthDeg` from it.
    //
    // `a` is therefore the along-row direction, which modules are laid end to end along, and `u`
    // is the across-row direction, which the rows step along one pitch at a time. These two were
    // exchanged until 2026-09-01. The consequence wasn't subtle: it left every panel edge on to
    // the direction its own row stepped, so a tilted array had zero width across its pitch, its
    // rows stood shoulder to shoulder instead of behind one another, and the modules of one row
    // overlapped each other threefold. Rows in that pose shade almost nothing, and the bake
    // reported about 23% more light under an array than reaches it
    const ax = sinDeg(geometry.rowAzimuthDeg)
    const ay = cosDeg(geometry.rowAzimuthDeg)
    const ux = cosDeg(geometry.rowAzimuthDeg)
    const uy = -sinDeg(geometry.rowAzimuthDeg)
    const fx = sinDeg(surfaceAzimuthDeg)
    const fy = cosDeg(surfaceAzimuthDeg)

    const halfSpanW = (geometry.collectorWidthM * cosDeg(tiltDeg)) / 2
    const riseH = geometry.collectorWidthM * sinDeg(tiltDeg)
    const moduleLengthM = geometry.rowLengthM / geometry.modulesPerRow
    const halfLen = moduleLengthM / 2
    const lowerZ = geometry.clearanceHeightM
    const upperZ = (geometry.clearanceHeightM + riseH) as Meters
    const normal = { x: fx * sinDeg(tiltDeg), y: fy * sinDeg(tiltDeg), z: cosDeg(tiltDeg) }

    for (let k = 0; k < geometry.rowCount; k += 1) {
      const rowOffset = (k - (geometry.rowCount - 1) / 2) * geometry.pitchM
      const rowCenterX = geometry.originM.xM + ux * rowOffset
      const rowCenterY = geometry.originM.yM + uy * rowOffset
      for (let j = 0; j < geometry.modulesPerRow; j += 1) {
        const colOffset = (j - (geometry.modulesPerRow - 1) / 2) * moduleLengthM
        const baseX = rowCenterX + ax * colOffset
        const baseY = rowCenterY + ay * colOffset
        const lowerX = baseX + fx * halfSpanW
        const lowerY = baseY + fy * halfSpanW
        const upperX = baseX - fx * halfSpanW
        const upperY = baseY - fy * halfSpanW
        const vertices: Vec3M[] = [
          {
            xM: (lowerX - ax * halfLen) as Meters,
            yM: (lowerY - ay * halfLen) as Meters,
            zM: lowerZ,
          },
          {
            xM: (lowerX + ax * halfLen) as Meters,
            yM: (lowerY + ay * halfLen) as Meters,
            zM: lowerZ,
          },
          {
            xM: (upperX + ax * halfLen) as Meters,
            yM: (upperY + ay * halfLen) as Meters,
            zM: upperZ,
          },
          {
            xM: (upperX - ax * halfLen) as Meters,
            yM: (upperY - ay * halfLen) as Meters,
            zM: upperZ,
          },
        ]
        panels.push({
          id: panelId(`${array.id}-r${k}-c${j}`),
          arrayId: array.id,
          rowIndex: k,
          columnIndex: j,
          corners: { vertices },
          normal,
          tiltDeg,
          surfaceAzimuthDeg,
          atUtcMillis: utcMillis,
        })
      }
    }
  }
  return { atUtcMillis: utcMillis, panels }
}

/**
 * The ground the light is computed over: the panels and beds plus a margin, united with the
 * plot's own outline. The plot joins without a margin, so the overlay drawn on it reaches every
 * edge of the plot and no further than the margin already went
 */
export const sceneExtent: (
  arrays: readonly PvArray[],
  beds: readonly Polygon2D[],
  marginM: Meters,
  plotRing?: Ring2D,
) => Extent2D = (arrays, beds, marginM, plotRing = []) => {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  const extend = (x: number, y: number): void => {
    minX = Math.min(minX, x)
    minY = Math.min(minY, y)
    maxX = Math.max(maxX, x)
    maxY = Math.max(maxY, y)
  }
  const snapshot = panelSnapshot(arrays, 0 as EpochMillis, 90 as Degrees, 0 as Degrees)
  for (const panel of snapshot.panels)
    for (const vertex of panel.corners.vertices) extend(vertex.xM, vertex.yM)
  for (const bed of beds)
    for (const point of [...bed.exterior, ...bed.holes.flat()]) extend(point.xM, point.yM)
  if (!Number.isFinite(minX)) {
    minX = -marginM
    minY = -marginM
    maxX = marginM
    maxY = marginM
  } else {
    minX -= marginM
    minY -= marginM
    maxX += marginM
    maxY += marginM
  }
  for (const point of plotRing) extend(point.xM, point.yM)
  return {
    minXM: minX as Meters,
    minYM: minY as Meters,
    maxXM: maxX as Meters,
    maxYM: maxY as Meters,
  }
}

const GRID_CELL_CAP = 1024

export const gridForExtent: (extent: Extent2D, targetCellSizeM: Meters) => GridSpec = (
  extent,
  targetCellSizeM,
) => {
  const width = extent.maxXM - extent.minXM
  const height = extent.maxYM - extent.minYM
  const rawCols = Math.max(1, Math.ceil(width / targetCellSizeM))
  const rawRows = Math.max(1, Math.ceil(height / targetCellSizeM))
  const cellSizeM = (
    rawCols > GRID_CELL_CAP || rawRows > GRID_CELL_CAP
      ? Math.max(width, height) / GRID_CELL_CAP
      : targetCellSizeM
  ) as Meters
  const cols = Math.min(GRID_CELL_CAP, Math.max(1, Math.ceil(width / cellSizeM)))
  const rows = Math.min(GRID_CELL_CAP, Math.max(1, Math.ceil(height / cellSizeM)))
  return {
    extent: {
      minXM: extent.minXM,
      minYM: extent.minYM,
      maxXM: (extent.minXM + cols * cellSizeM) as Meters,
      maxYM: (extent.minYM + rows * cellSizeM) as Meters,
    },
    cellSizeM,
    cols,
    rows,
  }
}
