/**
 * What this browser can do, asked once before the scene is fetched at all.
 *
 * Without WebAssembly every computation refuses (`requirePhysicsCore`), and without WebGL2
 * three.js cannot draw, so the honest thing is one sentence where the garden would be. Not
 * a boundary showing a stack trace. An OffscreenCanvas is only what the light check's worker
 * draws on: without it the bake still runs, on the slower CPU path (`createBackend`)
 */
export interface Capabilities {
  readonly wasm: boolean
  readonly webgl2: boolean
  readonly offscreenCanvas: boolean
}

export interface Preflight {
  /** Whether the 3D scene can be mounted at all */
  readonly scene: boolean
  /** The sentence to show, or null when there is nothing to say */
  readonly note: string | null
}

export const preflight = (can: Capabilities): Preflight => {
  const missing = [...(can.wasm ? [] : ['WebAssembly']), ...(can.webgl2 ? [] : ['WebGL2'])]
  if (missing.length > 0) {
    return {
      scene: false,
      note: `This browser can't draw the garden or run the light check: it has no ${missing.join(' or ')}. Current Chrome, Edge, Firefox and Safari can.`,
    }
  }
  if (!can.offscreenCanvas) {
    return {
      scene: true,
      note: 'This browser has no OffscreenCanvas, so the light check runs on the slower path.',
    }
  }
  return { scene: true, note: null }
}

const hasWebgl2 = (): boolean => {
  try {
    // no class, no context, and no probe: a probe on a canvas that cannot make one logs an error
    if (typeof WebGL2RenderingContext === 'undefined') return false
    const gl = document.createElement('canvas').getContext('webgl2')
    if (gl === null) return false
    // the probe's context is given back, so it never counts against the browser's few
    gl.getExtension('WEBGL_lose_context')?.loseContext()
    return true
  } catch {
    return false
  }
}

export const browserCapabilities = (): Capabilities => ({
  wasm: typeof WebAssembly === 'object',
  webgl2: hasWebgl2(),
  offscreenCanvas: typeof OffscreenCanvas === 'function',
})
