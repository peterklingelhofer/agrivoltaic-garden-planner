import type { GridSpec } from '../types/geo'
import type { PanelPolygon } from '../types/pv'
import type { SkyPatch } from '../types/weather'
import type { Degrees, Fraction, Meters } from '../types/units'
import { at, clamp, cosDeg, sinDeg } from './math'
import { sunUnitVector } from './solar'
import { beamVisibilityRaster } from './shading'

export const skyViewFactorRaster: (
  grid: GridSpec,
  panels: readonly PanelPolygon[],
  patches: readonly SkyPatch[],
) => Float32Array = (grid, panels, patches) => {
  const cells = grid.cols * grid.rows
  const result = new Float32Array(cells)
  for (const patch of patches) {
    const visibility = patchVisibilityRaster(grid, panels, patch)
    const weight = sinDeg(patch.altitudeDeg) * patch.solidAngleSr
    for (let i = 0; i < cells; i += 1) result[i] = at(result, i) + at(visibility, i) * weight
  }
  for (let i = 0; i < cells; i += 1) result[i] = at(result, i) / Math.PI
  return result
}

export const patchVisibilityRaster: (
  grid: GridSpec,
  panels: readonly PanelPolygon[],
  patch: SkyPatch,
) => Float32Array = (grid, panels, patch) => {
  const direction = sunUnitVector(patch.altitudeDeg, patch.azimuthDeg)
  return beamVisibilityRaster(grid, panels, direction, 0 as Fraction, 1)
}

const VF_GROUND_SKY_2D_MAX_ROWS = 10

export const vfGroundSky2dOracle: (
  collectorWidthM: Meters,
  pitchM: Meters,
  tiltDeg: Degrees,
  clearanceHeightM: Meters,
  samples: number,
) => Float32Array = (collectorWidthM, pitchM, tiltDeg, clearanceHeightM, samples) => {
  const height = clearanceHeightM + 0.5 * collectorWidthM * sinDeg(tiltDeg)
  const gcr = collectorWidthM / pitchM
  const halfWidth = (gcr * pitchM) / 2
  const dy = halfWidth * sinDeg(tiltDeg)
  const dx = halfWidth * cosDeg(tiltDeg)
  const span = 2 * VF_GROUND_SKY_2D_MAX_ROWS + 1
  const result = new Float32Array(samples)
  for (let i = 0; i < samples; i += 1) {
    const x = i / samples
    const lower = new Float64Array(span)
    const upper = new Float64Array(span)
    for (let k = -VF_GROUND_SKY_2D_MAX_ROWS; k <= VF_GROUND_SKY_2D_MAX_ROWS; k += 1) {
      const distance = (k - x) * pitchM
      const phiA = Math.atan2(height + dy, distance + dx)
      const phiB = Math.atan2(height - dy, distance - dx)
      const idx = k + VF_GROUND_SKY_2D_MAX_ROWS
      lower[idx] = Math.min(phiA, phiB)
      upper[idx] = Math.max(phiA, phiB)
    }
    let vf = 0
    for (let idx = 1; idx < span; idx += 1) {
      vf += Math.max(0, Math.cos(at(upper, idx)) - Math.cos(at(lower, idx - 1)))
    }
    result[i] = vf / 2
  }
  return result
}

// two-surface enclosure, E / (1 - rho_g (1 - SVF) rho_m). The geometric series is already summed
// so no iteration is needed (Decision Record section 3)
export const interreflectionGain: (
  skyViewFactor: Fraction,
  groundAlbedo: Fraction,
  moduleUndersideReflectance: Fraction,
) => number = (skyViewFactor, groundAlbedo, moduleUndersideReflectance) => {
  const loss = groundAlbedo * (1 - clamp(skyViewFactor, 0, 1)) * moduleUndersideReflectance
  return loss >= 1 ? 1 : 1 / (1 - loss)
}
