import { derivedArrayMetrics, trackerRotationDeg } from '../sim/geometry'
import { DEFAULT_DC_AC_RATIO } from '../sim/pv/inverter'
import type { DerivedArrayMetrics, PvArray, TrackerConfig } from '../types/pv'
import { degrees, fraction, kilowattsAc, kilowattsDc, meters } from '../types/units'
import { attemptOr } from './safe'

const DEG = Math.PI / 180

const clamp = (value: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, value))

const fallbackMetrics = (array: PvArray): DerivedArrayMetrics => {
  const { collectorWidthM, pitchM, rowCount, modulesPerRow } = array.geometry
  const tiltDeg = array.tracker.mode === 'fixed' ? array.tracker.tiltDeg : degrees(0)
  const gcr = pitchM > 0 ? collectorWidthM / pitchM : 0
  const dcKw = (rowCount * modulesPerRow * array.module.nameplateWp) / 1000
  return {
    groundCoverRatio: fraction(gcr),
    projectedGroundCoverRatio: fraction(gcr * Math.cos(tiltDeg * DEG)),
    maxHeightM: meters(array.geometry.clearanceHeightM + collectorWidthM * Math.sin(tiltDeg * DEG)),
    nameplateDcKw: kilowattsDc(dcKw),
    nameplateAcKw: kilowattsAc(dcKw / DEFAULT_DC_AC_RATIO),
  }
}

// GCR comes from src/sim when the physics module is live and from the closed form otherwise,
// so the readout never disagrees with itself
export const arrayMetrics = (array: PvArray): DerivedArrayMetrics =>
  attemptOr(
    () => derivedArrayMetrics(array),
    () => fallbackMetrics(array),
  )

export const withDerived = (array: PvArray): PvArray => ({ ...array, derived: arrayMetrics(array) })

export interface PanelOrientation {
  readonly tiltDeg: number
  readonly surfaceAzimuthDeg: number
  readonly rotationDeg: number
}

const fallbackRotationDeg = (
  tracker: TrackerConfig,
  elevationDeg: number,
  azimuthDeg: number,
): number => {
  if (tracker.mode === 'fixed') return tracker.tiltDeg
  if (tracker.mode === 'dual-axis') return clamp(90 - elevationDeg, 0, tracker.maxRotationDeg)
  if (tracker.mode === 'agro-optimised') return tracker.maxRotationDeg
  const axis = tracker.axisAzimuthDeg * DEG
  const raw = Math.atan2(
    Math.cos(elevationDeg * DEG) * Math.sin(azimuthDeg * DEG - axis),
    Math.max(Math.sin(elevationDeg * DEG), 1e-4),
  )
  return clamp(raw / DEG, -tracker.maxRotationDeg, tracker.maxRotationDeg)
}

export const panelOrientation = (
  array: PvArray,
  elevationDeg: number,
  azimuthDeg: number,
): PanelOrientation => {
  const tracker = array.tracker
  const rotationDeg = attemptOr(
    () => trackerRotationDeg(tracker, degrees(elevationDeg), degrees(azimuthDeg)) as number,
    () => fallbackRotationDeg(tracker, elevationDeg, azimuthDeg),
  )
  if (tracker.mode === 'fixed') {
    return {
      tiltDeg: tracker.tiltDeg,
      surfaceAzimuthDeg: tracker.surfaceAzimuthDeg,
      rotationDeg: tracker.tiltDeg,
    }
  }
  if (tracker.mode === 'dual-axis') {
    return { tiltDeg: rotationDeg, surfaceAzimuthDeg: azimuthDeg, rotationDeg }
  }
  const axisAzimuthDeg =
    tracker.mode === 'agro-optimised' ? array.geometry.rowAzimuthDeg : tracker.axisAzimuthDeg
  return {
    tiltDeg: Math.abs(rotationDeg),
    surfaceAzimuthDeg: axisAzimuthDeg + (rotationDeg >= 0 ? 90 : -90),
    rotationDeg,
  }
}

export interface ModulePlacement {
  readonly key: string
  readonly rowIndex: number
  readonly columnIndex: number
  readonly stackIndex: number
  readonly position: readonly [number, number, number]
}

export interface ArrayLayout {
  readonly orientation: PanelOrientation
  readonly modules: readonly ModulePlacement[]
  readonly stackCount: number
  readonly posts: readonly (readonly [number, number, number])[]
  readonly torqueTubes: readonly (readonly [number, number, number])[]
}

export const arrayLayout = (
  array: PvArray,
  elevationDeg: number,
  azimuthDeg: number,
): ArrayLayout => {
  const orientation = panelOrientation(array, elevationDeg, azimuthDeg)
  const g = array.geometry
  const tilt = orientation.tiltDeg * DEG
  const axis = g.rowAzimuthDeg * DEG
  const slopeAz = orientation.surfaceAzimuthDeg * DEG
  const along = { x: Math.sin(axis), z: -Math.cos(axis) }
  const across = { x: Math.cos(axis), z: Math.sin(axis) }
  const downSlope = { x: Math.sin(slopeAz), z: -Math.cos(slopeAz) }
  const stackCount = Math.max(1, Math.round(g.collectorWidthM / array.module.heightM))
  const slopeStep = g.collectorWidthM / stackCount
  const spanM = Math.min(g.rowLengthM, g.modulesPerRow * array.module.widthM)
  const columnStep = g.modulesPerRow > 0 ? spanM / g.modulesPerRow : 0
  const modules: ModulePlacement[] = []
  const posts: (readonly [number, number, number])[] = []
  const torqueTubes: (readonly [number, number, number])[] = []
  const ox = g.originM.xM
  const oz = -g.originM.yM

  for (let row = 0; row < g.rowCount; row += 1) {
    const rowOffset = (row - (g.rowCount - 1) / 2) * g.pitchM
    const rx = ox + across.x * rowOffset
    const rz = oz + across.z * rowOffset
    const hubY = g.clearanceHeightM + (g.collectorWidthM / 2) * Math.sin(tilt)
    torqueTubes.push([rx, hubY, rz])
    const postCount = Math.max(2, Math.ceil(spanM / 6) + 1)
    for (let post = 0; post < postCount; post += 1) {
      const t = -spanM / 2 + (post * spanM) / (postCount - 1)
      posts.push([rx + along.x * t, hubY / 2, rz + along.z * t])
    }
    for (let column = 0; column < g.modulesPerRow; column += 1) {
      const alongOffset = (column - (g.modulesPerRow - 1) / 2) * columnStep
      for (let stack = 0; stack < stackCount; stack += 1) {
        const slope = (stack - (stackCount - 1) / 2) * slopeStep
        modules.push({
          key: `${row}-${column}-${stack}`,
          rowIndex: row,
          columnIndex: column,
          stackIndex: stack,
          position: [
            rx + along.x * alongOffset + downSlope.x * slope * Math.cos(tilt),
            hubY - slope * Math.sin(tilt),
            rz + along.z * alongOffset + downSlope.z * slope * Math.cos(tilt),
          ],
        })
      }
    }
  }
  return { orientation, modules, stackCount, posts, torqueTubes }
}

export { clamp }
