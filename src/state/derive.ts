import {
  derivedArrayMetrics,
  edgeHeightsM,
  minClearanceHeightM,
  trackerRotationDeg,
} from '../sim/geometry'
import type { PvArray } from '../types/pv'
import { degrees, meters } from '../types/units'

const DEG = Math.PI / 180

/**
 * A tracker's rows pass through flat, so its pitch is at least the collector width. Its axis
 * stands at least as high as the lower edge dips at the stop, so no edge goes underground
 */
const settled = (array: PvArray): PvArray => {
  if (array.tracker.mode === 'fixed') return array
  const { clearanceHeightM, collectorWidthM, pitchM } = array.geometry
  const floorM = minClearanceHeightM(array)
  if (clearanceHeightM >= floorM && pitchM >= collectorWidthM) return array
  return {
    ...array,
    geometry: {
      ...array.geometry,
      clearanceHeightM: meters(Math.max(clearanceHeightM, floorM)),
      pitchM: meters(Math.max(pitchM, collectorWidthM)),
    },
  }
}

export const withDerived = (array: PvArray): PvArray => {
  const next = settled(array)
  return { ...next, derived: derivedArrayMetrics(next) }
}

export interface PanelOrientation {
  readonly tiltDeg: number
  readonly surfaceAzimuthDeg: number
  readonly rotationDeg: number
}

export const panelOrientation = (
  array: PvArray,
  elevationDeg: number,
  azimuthDeg: number,
): PanelOrientation => {
  const tracker = array.tracker
  const rotationDeg = trackerRotationDeg(
    array,
    degrees(elevationDeg),
    degrees(azimuthDeg),
  ) as number
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
    tracker.mode === 'agro-optimized' ? array.geometry.rowAzimuthDeg : tracker.axisAzimuthDeg
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
  /** How tall each post stands, from the ground up to the torque tube */
  readonly postHeightM: number
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
  // the torque tube sits midway between the edges, half the rise above a fixed row's lower edge
  // and at the clearance height on a tracker
  const { lowerM, upperM } = edgeHeightsM(array, degrees(orientation.tiltDeg))
  const hubY = (lowerM + upperM) / 2

  for (let row = 0; row < g.rowCount; row += 1) {
    const rowOffset = (row - (g.rowCount - 1) / 2) * g.pitchM
    const rx = ox + across.x * rowOffset
    const rz = oz + across.z * rowOffset
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
  return { orientation, modules, stackCount, posts, postHeightM: hubY, torqueTubes }
}
