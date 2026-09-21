import type { GridSpec, Polygon2D, Ring2D, UnitVec3, Vec2M } from '../types/geo'
import type { Occluder } from '../types/pv'
import type { Degrees, Fraction, Meters, Radians } from '../types/units'
import { cosDeg, sinDeg } from './math'

export const projectPanelToGround: (panel: Occluder, sun: UnitVec3) => Polygon2D = (panel, sun) => {
  if (sun.z <= 1e-6) return { exterior: [], holes: [] }
  const exterior: Vec2M[] = panel.corners.vertices.map((corner) => {
    const t = corner.zM / sun.z
    return { xM: (corner.xM - sun.x * t) as Meters, yM: (corner.yM - sun.y * t) as Meters }
  })
  return { exterior, holes: [] }
}

const ringContains = (ring: Ring2D, point: Vec2M): boolean => {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const pi = ring[i] as Vec2M
    const pj = ring[j] as Vec2M
    const crosses =
      pi.yM > point.yM !== pj.yM > point.yM &&
      point.xM < ((pj.xM - pi.xM) * (point.yM - pi.yM)) / (pj.yM - pi.yM) + pi.xM
    if (crosses) inside = !inside
  }
  return inside
}

export const pointInPolygon: (point: Vec2M, polygon: Polygon2D) => boolean = (point, polygon) =>
  ringContains(polygon.exterior, point) && !polygon.holes.some((hole) => ringContains(hole, point))

interface GroundShadow {
  readonly polygon: Polygon2D
  readonly minX: number
  readonly maxX: number
  readonly minY: number
  readonly maxY: number
  readonly transmittance: Fraction
}

const ringBounds = (ring: Ring2D): Omit<GroundShadow, 'polygon' | 'transmittance'> => {
  let minX = Infinity
  let maxX = -Infinity
  let minY = Infinity
  let maxY = -Infinity
  for (const p of ring) {
    minX = Math.min(minX, p.xM)
    maxX = Math.max(maxX, p.xM)
    minY = Math.min(minY, p.yM)
    maxY = Math.max(maxY, p.yM)
  }
  return { minX, maxX, minY, maxY }
}

export const beamVisibilityRaster: (
  grid: GridSpec,
  panels: readonly Occluder[],
  sun: UnitVec3,
  moduleTransmittance: Fraction,
  subSamplesPerCell: number,
) => Float32Array = (grid, panels, sun, moduleTransmittance, subSamplesPerCell) => {
  const result = new Float32Array(grid.cols * grid.rows)
  if (sun.z <= 1e-6) return result

  const shadows: GroundShadow[] = []
  for (const panel of panels) {
    const polygon = projectPanelToGround(panel, sun)
    if (polygon.exterior.length === 0) continue
    shadows.push({
      polygon,
      ...ringBounds(polygon.exterior),
      transmittance: panel.transmittance ?? moduleTransmittance,
    })
  }

  const subSamples = Math.max(1, subSamplesPerCell)
  const totalSamples = subSamples * subSamples
  const step = grid.cellSizeM / subSamples

  for (let row = 0; row < grid.rows; row += 1) {
    const cellMinY = grid.extent.minYM + row * grid.cellSizeM
    for (let col = 0; col < grid.cols; col += 1) {
      const cellMinX = grid.extent.minXM + col * grid.cellSizeM
      let total = 0
      for (let si = 0; si < subSamples; si += 1) {
        const sampleX = cellMinX + (si + 0.5) * step
        for (let sj = 0; sj < subSamples; sj += 1) {
          const sampleY = cellMinY + (sj + 0.5) * step
          const point: Vec2M = { xM: sampleX as Meters, yM: sampleY as Meters }
          // the open figure is 1; a sample under one or more shadows keeps the smallest of their
          // transmittances, so a ray through two faces of one crown counts once
          let sampleTransmittance = 1
          for (const shadow of shadows) {
            if (
              sampleX >= shadow.minX &&
              sampleX <= shadow.maxX &&
              sampleY >= shadow.minY &&
              sampleY <= shadow.maxY &&
              pointInPolygon(point, shadow.polygon)
            ) {
              if (shadow.transmittance < sampleTransmittance)
                sampleTransmittance = shadow.transmittance
              if (sampleTransmittance === 0) break
            }
          }
          total += sampleTransmittance
        }
      }
      result[row * grid.cols + col] = total / totalSamples
    }
  }
  return result
}

export const shadedGroundFractionInfiniteRows: (
  collectorWidthM: Meters,
  pitchM: Meters,
  tiltDeg: Degrees,
  profileAngleRad: Radians,
  side: -1 | 0 | 1,
) => Fraction = (collectorWidthM, pitchM, tiltDeg, profileAngleRad, side) => {
  if (profileAngleRad <= 0) return 1 as Fraction
  const shaded =
    (collectorWidthM / pitchM) *
    Math.abs(cosDeg(tiltDeg) + (side * sinDeg(tiltDeg)) / Math.tan(profileAngleRad))
  return Math.min(1, shaded) as Fraction
}

// the Sun's mean angular diameter, 0.533 deg limb to limb, so the width needs no doubling
const SUN_ANGULAR_DIAMETER_RAD = 0.0093

/** The penumbra's width across the ray at a slant distance; on the ground it is 1/sin(elevation) wider */
export const penumbraWidthM: (slantDistanceM: Meters) => Meters = (slantDistanceM) =>
  (SUN_ANGULAR_DIAMETER_RAD * slantDistanceM) as Meters

export const rowSelfShadeFraction: (
  collectorWidthM: Meters,
  pitchM: Meters,
  tiltDeg: Degrees,
  profileAngleRad: Radians,
  side: -1 | 0 | 1,
) => Fraction = (collectorWidthM, pitchM, tiltDeg, profileAngleRad, side) => {
  if (profileAngleRad <= 0) return 0 as Fraction
  const d =
    collectorWidthM *
    Math.abs(cosDeg(tiltDeg) + (side * sinDeg(tiltDeg)) / Math.tan(profileAngleRad))
  return d <= pitchM ? (0 as Fraction) : ((1 - pitchM / d) as Fraction)
}
