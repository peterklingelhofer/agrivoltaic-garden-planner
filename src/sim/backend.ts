import type { GridSpec } from '../types/geo'
import type { PanelPolygon } from '../types/pv'
import type { CumulativeSky } from '../types/weather'
import { createCpuReferenceBackend } from './cpu'
import { createWebgl2Backend, isWebgl2Available } from './gpu/webgl2'
import { createWebgpuBackend, isWebgpuAvailable } from './gpu/webgpu'

export type BackendKind = 'webgpu-raycast' | 'webgl2-shadowmap' | 'cpu-reference'

export interface AccumulationRequest {
  readonly grid: GridSpec
  readonly panels: readonly PanelPolygon[]
  readonly sky: CumulativeSky
  readonly monthlySkies: readonly CumulativeSky[]
  // index-aligned with sky.sunDirections and sky.patches, same as monthlySkies; each window is
  // one extra weight vector, so it adds accumulator writes but never a visibility pass
  readonly windowSkies: readonly CumulativeSky[]
  // a tracking array's pose is a function of the sun direction, so the beam term can be posed
  // per bin at no extra pass cost; omit it and every direction sees request.panels
  readonly beamPanels: ((directionIndex: number) => readonly PanelPolygon[]) | null
  readonly passesPerFrame: number
  readonly frameBudgetMs: number
}

export interface AccumulationProgress {
  readonly passesDone: number
  readonly passesTotal: number
  readonly elapsedMs: number
}

export interface AccumulationResult {
  readonly beamWhPerM2: Float32Array
  readonly diffuseWhPerM2: Float32Array
  readonly monthlyBeamWhPerM2: readonly Float32Array[]
  readonly monthlyDiffuseWhPerM2: readonly Float32Array[]
  // beam and diffuse are only ever summed downstream, so a window needs one channel, not two
  readonly windowWhPerM2: readonly Float32Array[]
  readonly skyViewFactor: Float32Array
  readonly backend: BackendKind
  readonly elapsedMs: number
}

export interface SkyMatrixBackend {
  readonly kind: BackendKind
  readonly available: boolean
  accumulate(
    request: AccumulationRequest,
    onProgress: (progress: AccumulationProgress) => void,
  ): Promise<AccumulationResult>
  dispose(): void
}

export const detectBackendKind = (): BackendKind => {
  if (isWebgpuAvailable()) return 'webgpu-raycast'
  if (isWebgl2Available()) return 'webgl2-shadowmap'
  return 'cpu-reference'
}

// WebGPU resolves asynchronously, so the synchronous factory hands back the WebGL2 baseline
// and callers who want the compute path await createWebgpuBackend directly
export const createBackend = (kind: BackendKind): SkyMatrixBackend => {
  if ((kind === 'webgl2-shadowmap' || kind === 'webgpu-raycast') && isWebgl2Available()) {
    const backend = createWebgl2Backend(new OffscreenCanvas(1, 1))
    if (backend.available) return backend
  }
  return createCpuReferenceBackend()
}

export const createBackendAsync = async (kind: BackendKind): Promise<SkyMatrixBackend> => {
  if (kind === 'webgpu-raycast') {
    const backend = await createWebgpuBackend()
    if (backend.available) return backend
  }
  return createBackend(kind)
}

export const monthsOf = <T>(build: (month: number) => T): T[] =>
  Array.from({ length: 12 }, (_unused, month) => build(month))

// with no occluders every direction is fully visible, so the open-sky reference is a closed
// form: no ray casting, and it stays bit-identical to what either backend would produce
export const openSkyAccumulation = (
  grid: GridSpec,
  sky: CumulativeSky,
  monthlySkies: readonly CumulativeSky[],
  windowSkies: readonly CumulativeSky[] = [],
): AccumulationResult => {
  const cells = grid.cols * grid.rows
  const beam = (target: CumulativeSky | undefined): number =>
    target === undefined
      ? 0
      : target.sunDirections.reduce(
          (total, bin, j) =>
            total + bin.beamWeightWhPerM2 * Math.max(0, sky.sunDirections[j]?.z ?? 0),
          0,
        )
  const diffuse = (target: CumulativeSky | undefined): number =>
    target === undefined
      ? 0
      : target.patches.reduce(
          (total, patch) => total + (patch.altitudeDeg > 0 ? patch.cumulativeRadianceWhPerM2 : 0),
          0,
        )
  const filled = (value: number): Float32Array => new Float32Array(cells).fill(value)
  const aligned = monthlySkies.filter(
    (month) =>
      month.patches.length === sky.patches.length &&
      month.sunDirections.length === sky.sunDirections.length,
  )
  const svf = sky.patches.reduce(
    (total, patch) =>
      total +
      (patch.altitudeDeg > 0
        ? (Math.sin((patch.altitudeDeg * Math.PI) / 180) * patch.solidAngleSr) / Math.PI
        : 0),
    0,
  )
  return {
    beamWhPerM2: filled(beam(sky)),
    diffuseWhPerM2: filled(diffuse(sky)),
    monthlyBeamWhPerM2: monthsOf((month) => filled(beam(aligned[month]))),
    monthlyDiffuseWhPerM2: monthsOf((month) => filled(diffuse(aligned[month]))),
    windowWhPerM2: windowSkies.map((window) => filled(beam(window) + diffuse(window))),
    skyViewFactor: filled(svf),
    backend: 'cpu-reference',
    elapsedMs: 0,
  }
}
