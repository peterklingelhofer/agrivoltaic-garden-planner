import { describe, expect, it } from 'bun:test'
import { ShapeGeometry } from 'three'
import { polygonOf, vec2 } from '../state/geom'
import type { Extent2D } from '../types/geo'
import { meters } from '../types/units'
import { fieldUv, fieldUvsOnto } from './overlayMaterial'
import { bedShape } from './sceneMath'

/** The raster from the e2e fixture's bake: it starts east of the plot's west edge */
const extent: Extent2D = {
  minXM: meters(-11.8),
  minYM: meters(-15.6),
  maxXM: meters(19.4),
  maxYM: meters(15.6),
}

describe('where the ground reads in the field texture', () => {
  it('runs 0 to 1 across the raster extent, whatever the extent is', () => {
    expect(fieldUv(-11.8, -15.6, extent)).toEqual([0, 0])
    const [u, v] = fieldUv(19.4, 15.6, extent)
    expect(u).toBeCloseTo(1, 12)
    expect(v).toBeCloseTo(1, 12)
    const [midU, midV] = fieldUv(3.8, 0, extent)
    expect(midU).toBeCloseTo(0.5, 12)
    expect(midV).toBeCloseTo(0.5, 12)
  })

  it('falls below 0 west of the raster, which is what the shader leaves undrawn', () => {
    expect(fieldUv(-16, 0, extent)[0]).toBeLessThan(0)
  })

  it('writes every vertex of the plot outline by where it stands', () => {
    const plot = polygonOf([vec2(-16, -12), vec2(16, -12), vec2(16, 12), vec2(-16, 12)])
    const geometry = fieldUvsOnto(new ShapeGeometry(bedShape(plot)), extent)
    const position = geometry.getAttribute('position')
    const uv = geometry.getAttribute('uv')
    expect(uv.count).toBe(position.count)
    for (let i = 0; i < position.count; i += 1) {
      const [u, v] = fieldUv(position.getX(i), position.getY(i), extent)
      expect(uv.getX(i)).toBeCloseTo(u, 6)
      expect(uv.getY(i)).toBeCloseTo(v, 6)
    }
    geometry.dispose()
  })
})
