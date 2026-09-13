import { describe, expect, it } from 'bun:test'
import { preflight } from './preflight'

const all = { wasm: true, webgl2: true, offscreenCanvas: true }

describe('what the browser can do, before the scene is fetched', () => {
  it('mounts the scene and says nothing when everything is there', () => {
    expect(preflight(all)).toEqual({ scene: true, note: null })
  })

  it('refuses the scene without WebGL2, naming what is missing and what has it', () => {
    const result = preflight({ ...all, webgl2: false })
    expect(result.scene).toBe(false)
    expect(result.note).toBe(
      "This browser can't draw the garden or run the light check: it has no WebGL2. Current Chrome, Edge, Firefox and Safari can.",
    )
  })

  it('refuses the scene without WebAssembly too, and names both when both are missing', () => {
    expect(preflight({ ...all, wasm: false }).scene).toBe(false)
    expect(preflight({ ...all, wasm: false, webgl2: false }).note).toContain(
      'no WebAssembly or WebGL2',
    )
  })

  it('keeps the scene without an OffscreenCanvas and says the light check is slower', () => {
    const result = preflight({ ...all, offscreenCanvas: false })
    expect(result.scene).toBe(true)
    expect(result.note).toBe(
      'This browser has no OffscreenCanvas, so the light check runs on the slower path.',
    )
  })
})
