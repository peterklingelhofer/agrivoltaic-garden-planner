import { describe, expect, it } from 'bun:test'
import type { AccumulationRequest } from '../backend'
import { createCpuReferenceBackend } from '../cpu'
import { sunUnitVector } from '../solar'
import { createWebgl2Backend, isWebgl2Available } from './webgl2'
import type { Extent2D, GridSpec, Vec3M } from '../../types/geo'
import type { PanelPolygon } from '../../types/pv'
import type { CumulativeSky, SkyPatch, SunDirectionBin } from '../../types/weather'
import { arrayId, panelId } from '../../types/ids'
import { degrees, epochMillis, meters } from '../../types/units'

const GRID: GridSpec = {
  extent: {
    minXM: meters(-4.8),
    minYM: meters(-4.8),
    maxXM: meters(4.8),
    maxYM: meters(4.8),
  } satisfies Extent2D,
  cellSizeM: meters(0.3),
  cols: 32,
  rows: 32,
}

const panelQuad = (
  originXM: number,
  originYM: number,
  widthM: number,
  slantWidthM: number,
  tiltDeg: number,
  clearanceM: number,
): readonly Vec3M[] => {
  const tiltRad = (tiltDeg * Math.PI) / 180
  const lowZ = clearanceM
  const highY = originYM + slantWidthM * Math.cos(tiltRad)
  const highZ = clearanceM + slantWidthM * Math.sin(tiltRad)
  return [
    { xM: meters(originXM), yM: meters(originYM), zM: meters(lowZ) },
    { xM: meters(originXM + widthM), yM: meters(originYM), zM: meters(lowZ) },
    { xM: meters(originXM + widthM), yM: meters(highY), zM: meters(highZ) },
    { xM: meters(originXM), yM: meters(highY), zM: meters(highZ) },
  ]
}

// 2 rows x 2 modules, matching the layout the closure test is asked to cover
const PANELS: readonly PanelPolygon[] = [
  [-3, -2.5],
  [1, -2.5],
  [-3, 0.5],
  [1, 0.5],
].map(([originX, originY], i) => {
  const vertices = panelQuad(originX ?? 0, originY ?? 0, 1.6, 1.8, 20, 2)
  return {
    id: panelId(`panel-${i}`),
    arrayId: arrayId('array-1'),
    rowIndex: Math.floor(i / 2),
    columnIndex: i % 2,
    corners: { vertices },
    normal: { x: 0, y: -Math.sin((20 * Math.PI) / 180), z: Math.cos((20 * Math.PI) / 180) },
    tiltDeg: degrees(20),
    surfaceAzimuthDeg: degrees(180),
    atUtcMillis: epochMillis(0),
  }
})

const SUN_DIRECTIONS: readonly SunDirectionBin[] = [15, 30, 45, 60, 75].map((altitude, i) => {
  const azimuth = [150, 165, 180, 195, 210][i] ?? 180
  const dir = sunUnitVector(degrees(altitude), degrees(azimuth))
  return { x: dir.x, y: dir.y, z: dir.z, beamWeightWhPerM2: 200 + i * 40 }
})

const SKY_PATCHES: readonly SkyPatch[] = [-10, 15, 35, 55, 75, 90].map((altitude, i) => ({
  index: i,
  altitudeDeg: degrees(altitude),
  azimuthDeg: degrees((i * 60) % 360),
  solidAngleSr: 0.35,
  cumulativeRadianceWhPerM2: 40 + i * 15,
}))

const buildSky = (monthScale: number): CumulativeSky => ({
  subdivision: 'tregenza-mf1',
  patches: SKY_PATCHES.map((patch) => ({
    ...patch,
    cumulativeRadianceWhPerM2: patch.cumulativeRadianceWhPerM2 * monthScale,
  })),
  sunDirections: SUN_DIRECTIONS.map((bin) => ({
    ...bin,
    beamWeightWhPerM2: bin.beamWeightWhPerM2 * monthScale,
  })),
  substepsPerHour: 4,
  binningDeg: degrees(2),
})

const REQUEST: AccumulationRequest = {
  grid: GRID,
  panels: PANELS,
  sky: buildSky(1),
  monthlySkies: Array.from({ length: 12 }, (_unused, month) => buildSky(0.5 + month / 24)),
  windowSkies: [],
  beamPanels: null,
  passesPerFrame: 4,
  frameBudgetMs: 8,
}

describe('isWebgl2Available', () => {
  it('returns false without throwing outside a browser, where there is no canvas to ask', () => {
    expect(() => isWebgl2Available()).not.toThrow()
    expect(isWebgl2Available()).toBe(false)
  })
})

describe('createWebgl2Backend', () => {
  it('is safe to call without OffscreenCanvas and reports unavailable', async () => {
    const canvas =
      typeof OffscreenCanvas === 'undefined'
        ? (undefined as unknown as OffscreenCanvas)
        : new OffscreenCanvas(1, 1)
    const backend = createWebgl2Backend(canvas)
    expect(backend.available).toBe(false)
    await expect(backend.accumulate(REQUEST, () => {})).rejects.toThrow()
  })
})

// exercised for real by the Playwright functional project, which runs with --use-gl=angle
describe.skipIf(!isWebgl2Available())('webgl2 vs cpu-reference DLI closure', () => {
  it('agrees with the CPU oracle within tolerance on every cell', async () => {
    const cpuResult = await createCpuReferenceBackend().accumulate(REQUEST, () => {})
    const gpuBackend = createWebgl2Backend(new OffscreenCanvas(1, 1))
    expect(gpuBackend.available).toBe(true)
    const gpuResult = await gpuBackend.accumulate(REQUEST, () => {})
    gpuBackend.dispose()

    const closeEnough = (a: number, b: number): boolean => {
      const diff = Math.abs(a - b)
      const rel = diff / Math.max(Math.abs(a), Math.abs(b), 1e-9)
      return diff < 1e-4 || rel < 1e-3
    }

    const compare = (a: Float32Array, b: Float32Array, label: string): void => {
      for (let i = 0; i < a.length; i += 1) {
        expect(closeEnough(a[i] ?? 0, b[i] ?? 0), `${label}[${i}]`).toBe(true)
      }
    }

    compare(cpuResult.beamWhPerM2, gpuResult.beamWhPerM2, 'beamWhPerM2')
    compare(cpuResult.diffuseWhPerM2, gpuResult.diffuseWhPerM2, 'diffuseWhPerM2')
    compare(cpuResult.skyViewFactor, gpuResult.skyViewFactor, 'skyViewFactor')
    for (let m = 0; m < 12; m += 1) {
      const cpuBeam = cpuResult.monthlyBeamWhPerM2[m]
      const gpuBeam = gpuResult.monthlyBeamWhPerM2[m]
      const cpuDiffuse = cpuResult.monthlyDiffuseWhPerM2[m]
      const gpuDiffuse = gpuResult.monthlyDiffuseWhPerM2[m]
      if (cpuBeam !== undefined && gpuBeam !== undefined)
        compare(cpuBeam, gpuBeam, `monthlyBeam[${m}]`)
      if (cpuDiffuse !== undefined && gpuDiffuse !== undefined) {
        compare(cpuDiffuse, gpuDiffuse, `monthlyDiffuse[${m}]`)
      }
    }
  })
})
