import type { UnitVec3 } from '../types/geo'
import type { Fraction } from '../types/units'
import type { CumulativeSky, SkyPatch } from '../types/weather'
import type {
  AccumulationProgress,
  AccumulationRequest,
  AccumulationResult,
  SkyMatrixBackend,
} from './backend'
import { at, sinDeg } from './math'
import { isSeasonal, leaflessQuads } from './obstruction'
import { beamVisibilityRaster } from './shading'
import { sunUnitVector } from './solar'

const yieldToHost = (): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, 0)
  })

const addScaled = (target: Float32Array, source: Float32Array, scale: number): void => {
  if (scale === 0) return
  for (let i = 0; i < target.length; i += 1) target[i] = at(target, i) + at(source, i) * scale
}

const patchDirection = (patch: SkyPatch): UnitVec3 =>
  sunUnitVector(patch.altitudeDeg, patch.azimuthDeg)

// cos(zenith) x solid angle, normalised by pi so a clear hemisphere integrates to SVF = 1
const patchSvfWeight = (patch: SkyPatch): number =>
  (sinDeg(patch.altitudeDeg) * patch.solidAngleSr) / Math.PI

export const createCpuReferenceBackend = (): SkyMatrixBackend => ({
  kind: 'cpu-reference',
  available: true,
  async accumulate(
    request: AccumulationRequest,
    onProgress: (progress: AccumulationProgress) => void,
  ): Promise<AccumulationResult> {
    const started = Date.now()
    const cells = request.grid.cols * request.grid.rows
    const beamWhPerM2 = new Float32Array(cells)
    const diffuseWhPerM2 = new Float32Array(cells)
    const skyViewFactor = new Float32Array(cells)
    const monthlyBeamWhPerM2 = Array.from({ length: 12 }, () => new Float32Array(cells))
    const monthlyDiffuseWhPerM2 = Array.from({ length: 12 }, () => new Float32Array(cells))

    const { sky, monthlySkies, windowSkies, panels, grid, leafOnMonths } = request
    const alignedTo = (skies: readonly CumulativeSky[]): readonly CumulativeSky[] =>
      skies.filter(
        (other) =>
          other.patches.length === sky.patches.length &&
          other.sunDirections.length === sky.sunDirections.length,
      )
    const aligned = alignedTo(monthlySkies)
    const windows = alignedTo(windowSkies)
    const windowWhPerM2 = windows.map(() => new Float32Array(cells))
    const passesTotal = sky.sunDirections.length + sky.patches.length
    const chunk = Math.max(1, request.passesPerFrame)
    let passesDone = 0
    // a leafless pass that would just repeat the in-leaf one is skipped: no tree drawn, or an
    // all-evergreen one, both leave every quad's two figures equal
    const seasonQuadsDiffer = leafOnMonths !== null && isSeasonal(panels)

    for (let j = 0; j < sky.sunDirections.length; j += 1) {
      const bin = sky.sunDirections[j]
      if (bin !== undefined && bin.z > 0) {
        const posed = request.beamPanels === null ? panels : request.beamPanels(j)
        if (leafOnMonths === null) {
          const visibility = beamVisibilityRaster(grid, posed, bin, 0 as Fraction, 1)
          // the bin weight is DNI Wh/m2, so project onto the horizontal ground with dir.z
          addScaled(beamWhPerM2, visibility, bin.beamWeightWhPerM2 * bin.z)
          for (let m = 0; m < aligned.length; m += 1) {
            const monthBin = aligned[m]?.sunDirections[j]
            const target = monthlyBeamWhPerM2[m]
            if (monthBin !== undefined && target !== undefined) {
              addScaled(target, visibility, monthBin.beamWeightWhPerM2 * bin.z)
            }
          }
          for (let w = 0; w < windows.length; w += 1) {
            const windowBin = windows[w]?.sunDirections[j]
            const target = windowWhPerM2[w]
            if (windowBin !== undefined && target !== undefined) {
              addScaled(target, visibility, windowBin.beamWeightWhPerM2 * bin.z)
            }
          }
        } else {
          const visOn = beamVisibilityRaster(grid, posed, bin, 0 as Fraction, 1)
          const visOff = seasonQuadsDiffer
            ? beamVisibilityRaster(grid, leaflessQuads(posed), bin, 0 as Fraction, 1)
            : visOn
          // annual has no weight of its own here: it is the sum of the months below, each shaded
          // by the crown it actually had that month, the way annualFromMonthly sums the sky itself
          for (let m = 0; m < aligned.length; m += 1) {
            const monthBin = aligned[m]?.sunDirections[j]
            const target = monthlyBeamWhPerM2[m]
            if (monthBin !== undefined && target !== undefined) {
              const variant = leafOnMonths[m] === true ? visOn : visOff
              const weight = monthBin.beamWeightWhPerM2 * bin.z
              addScaled(target, variant, weight)
              addScaled(beamWhPerM2, variant, weight)
            }
          }
          // a time window reads the in-leaf figure whatever its months: the one window shipped is
          // the growing season, which the leaf-on months follow closely, and a window's weights
          // carry no month to pick a variant by. A documented approximation (Record 26)
          for (let w = 0; w < windows.length; w += 1) {
            const windowBin = windows[w]?.sunDirections[j]
            const target = windowWhPerM2[w]
            if (windowBin !== undefined && target !== undefined) {
              addScaled(target, visOn, windowBin.beamWeightWhPerM2 * bin.z)
            }
          }
        }
      }
      passesDone += 1
      if (passesDone % chunk === 0) {
        onProgress({ passesDone, passesTotal, elapsedMs: Date.now() - started })
        await yieldToHost()
      }
    }

    for (let i = 0; i < sky.patches.length; i += 1) {
      const patch = sky.patches[i]
      if (patch !== undefined && patch.altitudeDeg > 0) {
        const dir = patchDirection(patch)
        if (leafOnMonths === null) {
          const visibility = beamVisibilityRaster(grid, panels, dir, 0 as Fraction, 1)
          addScaled(diffuseWhPerM2, visibility, patch.cumulativeRadianceWhPerM2)
          addScaled(skyViewFactor, visibility, patchSvfWeight(patch))
          for (let m = 0; m < aligned.length; m += 1) {
            const monthPatch = aligned[m]?.patches[i]
            const target = monthlyDiffuseWhPerM2[m]
            if (monthPatch !== undefined && target !== undefined) {
              addScaled(target, visibility, monthPatch.cumulativeRadianceWhPerM2)
            }
          }
          for (let w = 0; w < windows.length; w += 1) {
            const windowPatch = windows[w]?.patches[i]
            const target = windowWhPerM2[w]
            if (windowPatch !== undefined && target !== undefined) {
              addScaled(target, visibility, windowPatch.cumulativeRadianceWhPerM2)
            }
          }
        } else {
          const visOn = beamVisibilityRaster(grid, panels, dir, 0 as Fraction, 1)
          const visOff = seasonQuadsDiffer
            ? beamVisibilityRaster(grid, leaflessQuads(panels), dir, 0 as Fraction, 1)
            : visOn
          // the sky-view factor reads the in-leaf figure too, the growing season being what the
          // beds are judged over: the same documented approximation as the windows above
          addScaled(skyViewFactor, visOn, patchSvfWeight(patch))
          for (let m = 0; m < aligned.length; m += 1) {
            const monthPatch = aligned[m]?.patches[i]
            const target = monthlyDiffuseWhPerM2[m]
            if (monthPatch !== undefined && target !== undefined) {
              const variant = leafOnMonths[m] === true ? visOn : visOff
              const weight = monthPatch.cumulativeRadianceWhPerM2
              addScaled(target, variant, weight)
              addScaled(diffuseWhPerM2, variant, weight)
            }
          }
          for (let w = 0; w < windows.length; w += 1) {
            const windowPatch = windows[w]?.patches[i]
            const target = windowWhPerM2[w]
            if (windowPatch !== undefined && target !== undefined) {
              addScaled(target, visOn, windowPatch.cumulativeRadianceWhPerM2)
            }
          }
        }
      }
      passesDone += 1
      if (passesDone % chunk === 0) {
        onProgress({ passesDone, passesTotal, elapsedMs: Date.now() - started })
        await yieldToHost()
      }
    }

    onProgress({ passesDone, passesTotal, elapsedMs: Date.now() - started })
    return {
      beamWhPerM2,
      diffuseWhPerM2,
      monthlyBeamWhPerM2,
      monthlyDiffuseWhPerM2,
      windowWhPerM2,
      skyViewFactor,
      backend: 'cpu-reference',
      elapsedMs: Date.now() - started,
    }
  },
  dispose() {},
})

// xorshift32 keeps the sampler deterministic across platforms
const randomStream = (seed: number): (() => number) => {
  let state = seed === 0 ? 0x9e3779b9 : seed >>> 0
  return () => {
    state ^= state << 13
    state ^= state >>> 17
    state ^= state << 5
    return ((state >>> 0) % 0x1000000) / 0x1000000
  }
}

export const monteCarloSkyViewFactor = (
  visibility: (dirX: number, dirY: number, dirZ: number) => number,
  sampleCount: number,
  seed: number,
): { readonly svf: number; readonly standardError: number } => {
  const samples = Math.max(1, sampleCount)
  const random = randomStream(seed)
  let total = 0
  for (let i = 0; i < samples; i += 1) {
    // cosine-weighted hemisphere: theta = asin(sqrt(u1)) measured from the horizon
    const u1 = random()
    const u2 = random()
    const sinTheta = Math.sqrt(u1)
    const cosTheta = Math.sqrt(Math.max(0, 1 - u1))
    const phi = 2 * Math.PI * u2
    total += visibility(cosTheta * Math.cos(phi), cosTheta * Math.sin(phi), sinTheta)
  }
  const svf = total / samples
  return { svf, standardError: Math.sqrt(Math.max(0, svf * (1 - svf)) / samples) }
}
