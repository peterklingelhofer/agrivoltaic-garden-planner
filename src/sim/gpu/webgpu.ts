import type { SkyMatrixBackend } from '../backend'

// lib is ES2023+DOM only so GPUDevice/GPUAdapter types do not exist: detect through a
// narrow local interface on globalThis rather than referencing the WebGPU lib types
interface NavigatorWithGpu {
  readonly navigator?: { readonly gpu?: unknown }
}

export const isWebgpuAvailable = (): boolean => {
  try {
    return Boolean((globalThis as NavigatorWithGpu).navigator?.gpu)
  } catch {
    return false
  }
}

// deliberately deferred per docs/ARCHITECTURE.md section 5: WebGPU is a detected
// optimisation on top of the WebGL2 baseline, never a requirement, so this stub never
// fakes a result
export const createWebgpuBackend = (): Promise<SkyMatrixBackend> =>
  Promise.resolve({
    kind: 'webgpu-raycast',
    available: false,
    accumulate: () =>
      Promise.reject(new Error('WebGPU backend not implemented: use the WebGL2 baseline')),
    dispose: () => {},
  })
