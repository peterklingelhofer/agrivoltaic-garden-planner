import { describe, expect, it } from 'bun:test'
import {
  MeshDepthMaterial,
  MeshStandardMaterial,
  type WebGLProgramParametersWithUniforms,
} from 'three'
import type { CanopyShape } from '../types/crop'
import { applyWind, canopyCards, LEAF_ALPHA_TEST, leafTexture, WIND_TIME } from './foliage'

const SHAPES: readonly CanopyShape[] = [
  'sphere',
  'hemisphere',
  'ellipsoid',
  'cone',
  'cylinder',
  'columnar',
  'vase',
  'spreading',
  'flat-disc',
  'irregular',
]

describe('canopy cards', () => {
  it('covers every canopy shape the catalogue can key, including the ones with no solid before', () => {
    for (const shape of SHAPES) {
      const geometry = canopyCards(shape, 6)
      expect(geometry.getAttribute('position').count).toBeGreaterThan(0)
      expect(geometry.getIndex()).not.toBeNull()
    }
  })

  it('stays inside the unit box the instance matrix scales, so a plant is the size the crop is', () => {
    for (const shape of SHAPES) {
      const position = canopyCards(shape, 8).getAttribute('position')
      for (let i = 0; i < position.count; i += 1) {
        expect(Math.abs(position.getX(i))).toBeLessThanOrEqual(1)
        expect(Math.abs(position.getZ(i))).toBeLessThanOrEqual(1)
        expect(position.getY(i)).toBeGreaterThanOrEqual(0)
        expect(position.getY(i)).toBeLessThanOrEqual(1.6)
      }
    }
  })

  it('never puts a vertex below the bed it is planted in', () => {
    const position = canopyCards('spreading', 8).getAttribute('position')
    for (let i = 0; i < position.count; i += 1) expect(position.getY(i)).toBeGreaterThanOrEqual(0)
  })

  it('keeps the silhouettes distinguishable: a column is not a spreading tree', () => {
    const widest = (shape: CanopyShape): number => {
      const position = canopyCards(shape, 10).getAttribute('position')
      let max = 0
      for (let i = 0; i < position.count; i += 1) {
        max = Math.max(max, Math.hypot(position.getX(i), position.getZ(i)))
      }
      return max
    }
    expect(widest('columnar')).toBeLessThan(widest('spreading'))
    expect(widest('columnar')).toBeLessThan(widest('flat-disc'))
  })

  it('is one geometry per shape and budget, so instancing is not paying to rebuild it', () => {
    expect(canopyCards('sphere', 6)).toBe(canopyCards('sphere', 6))
    expect(canopyCards('sphere', 6)).not.toBe(canopyCards('sphere', 3))
  })

  it('takes fewer cards on the low tier, which is the thing the tier turns down', () => {
    const count = (budget: number): number =>
      canopyCards('sphere', budget).getAttribute('position').count
    expect(count(3)).toBeLessThan(count(9))
  })

  /** Shading off the card's own plane is what makes card foliage read as flat paper */
  it('shades off a normal that leaves the canopy, not off the card', () => {
    const geometry = canopyCards('sphere', 9)
    const position = geometry.getAttribute('position')
    const normal = geometry.getAttribute('normal')
    let outward = 0
    for (let card = 0; card < position.count / 4; card += 1) {
      const i = card * 4
      const cx = (position.getX(i) + position.getX(i + 2)) / 2
      const cz = (position.getZ(i) + position.getZ(i + 2)) / 2
      if (normal.getX(i) * cx + normal.getZ(i) * cz >= 0) outward += 1
      expect(normal.getY(i)).toBeGreaterThan(0)
    }
    expect(outward).toBe(position.count / 4)
  })
})

describe('the leaf cut-out', () => {
  it('is a cut-out and not a rectangle, or a canopy would let no light past it', () => {
    const texture = leafTexture(64)
    const data = texture.image.data as Uint8Array
    let opaque = 0
    for (let i = 3; i < data.length; i += 4) if ((data[i] ?? 0) > 0) opaque += 1
    const coverage = opaque / (data.length / 4)
    expect(coverage).toBeGreaterThan(0.15)
    expect(coverage).toBeLessThan(0.75)
  })

  it('is opaque or clear, never in between, because the alpha test admits nothing in between', () => {
    const data = leafTexture(64).image.data as Uint8Array
    for (let i = 3; i < data.length; i += 4) expect([0, 255]).toContain(data[i])
    expect(LEAF_ALPHA_TEST).toBeGreaterThan(0)
    expect(LEAF_ALPHA_TEST).toBeLessThan(1)
  })

  it('is one texture per size, shared by every crop in the scene', () => {
    expect(leafTexture(64)).toBe(leafTexture(64))
  })
})

const compile = (source: string): WebGLProgramParametersWithUniforms =>
  ({
    uniforms: {},
    vertexShader: `void main() {\n${source}\n}`,
    fragmentShader: '',
  }) as unknown as WebGLProgramParametersWithUniforms

describe('wind', () => {
  it('displaces the vertex and reads the one clock the scene shares', () => {
    const material = applyWind(new MeshStandardMaterial())
    const shader = compile('#include <begin_vertex>')
    material.onBeforeCompile(shader, null as never)
    expect(shader.vertexShader).toContain('uniform float uWindTime;')
    expect(shader.vertexShader).toContain('transformed.x +=')
    expect(shader.uniforms.uWindTime).toBe(WIND_TIME)
  })

  /**
   * The shadow pass runs its own program. A swaying plant casting a still shadow is the kind of
   * fault that never gets noticed, so the depth material takes the same injection
   */
  it('reaches the depth material, so the shadow sways with the plant', () => {
    const depth = applyWind(new MeshDepthMaterial())
    const shader = compile('#include <begin_vertex>')
    depth.onBeforeCompile(shader, null as never)
    expect(shader.vertexShader).toContain('transformed.x +=')
    expect(shader.uniforms.uWindTime).toBe(WIND_TIME)
  })

  it('anchors the sway at the base: the bottom of a plant does not move', () => {
    const material = applyWind(new MeshStandardMaterial())
    const shader = compile('#include <begin_vertex>')
    material.onBeforeCompile(shader, null as never)
    expect(shader.vertexShader).toContain('transformed.y * transformed.y')
  })

  it('carries a cache key, so the patched program is not confused with the stock one', () => {
    expect(applyWind(new MeshStandardMaterial()).customProgramCacheKey()).not.toBe(
      new MeshStandardMaterial().customProgramCacheKey(),
    )
  })
})
