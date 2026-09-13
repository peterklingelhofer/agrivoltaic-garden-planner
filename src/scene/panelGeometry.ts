import { CylinderGeometry, ExtrudeGeometry, PlaneGeometry, Shape, type BufferGeometry } from 'three'

const cache = new Map<string, BufferGeometry>()

const memo = <T extends BufferGeometry>(key: string, build: () => T): T => {
  const hit = cache.get(key)
  if (hit) return hit as T
  const made = build()
  cache.set(key, made)
  return made
}

/**
 * Texel density is baked into the UVs rather than set as a texture repeat, because a post and a
 * thirteen-metre torque tube are the same galvanised steel and would otherwise have to be two
 * textures to be two densities. `metresPerTile` is the world size one tile of the surface covers
 */
const scaleUv = <T extends BufferGeometry>(geometry: T, uTiles: number, vTiles: number): T => {
  const uv = geometry.getAttribute('uv')
  for (let i = 0; i < uv.count; i += 1) uv.setXY(i, uv.getX(i) * uTiles, uv.getY(i) * vTiles)
  uv.needsUpdate = true
  return geometry
}

/** `ExtrudeGeometry` emits UVs in world metres, so this is the tiles-per-metre the frame wants */
const perMetre = (metresPerTile: number): number => 1 / metresPerTile

export const FRAME_M = 0.035
export const MODULE_THICKNESS_M = 0.04
const ALUMINIUM_TILE_M = 0.12
const STEEL_TILE_M = 0.22

// A real module: an extruded aluminium frame with a laminate inside it, not a box
export const moduleFrameGeometry = (widthM: number, heightM: number): ExtrudeGeometry =>
  memo(`frame:${widthM}:${heightM}`, () => {
    const outer = new Shape()
    const hw = widthM / 2
    const hh = heightM / 2
    outer.moveTo(-hw, -hh)
    outer.lineTo(hw, -hh)
    outer.lineTo(hw, hh)
    outer.lineTo(-hw, hh)
    outer.closePath()
    const hole = new Shape()
    const iw = hw - FRAME_M
    const ih = hh - FRAME_M
    hole.moveTo(-iw, -ih)
    hole.lineTo(iw, -ih)
    hole.lineTo(iw, ih)
    hole.lineTo(-iw, ih)
    hole.closePath()
    outer.holes.push(hole)
    const geometry = new ExtrudeGeometry(outer, {
      depth: MODULE_THICKNESS_M,
      bevelEnabled: false,
    })
    geometry.translate(0, 0, -MODULE_THICKNESS_M / 2)
    const tiles = perMetre(ALUMINIUM_TILE_M)
    return scaleUv(geometry, tiles, tiles)
  })

/**
 * Cells per module. The laminate texture is one cell and the plane's UVs tile it, which is what
 * lets the gap between cells be a millimetre wide: a whole-module texture would have to be
 * several thousand pixels across before a 2 mm gap survived being rasterised at all
 */
export const MODULE_CELLS = { cols: 6, rows: 10 } as const

export const laminateGeometry = (widthM: number, heightM: number): PlaneGeometry =>
  memo(`laminate:${widthM}:${heightM}`, () => {
    const geometry = new PlaneGeometry(widthM - 2 * FRAME_M, heightM - 2 * FRAME_M)
    geometry.translate(0, 0, MODULE_THICKNESS_M / 2)
    return scaleUv(geometry, MODULE_CELLS.cols, MODULE_CELLS.rows)
  })

const POST_RADIUS_M = 0.06
const TUBE_RADIUS_M = 0.08

export const postGeometry = (heightM: number): CylinderGeometry =>
  memo(`post:${heightM.toFixed(2)}`, () =>
    scaleUv(
      new CylinderGeometry(POST_RADIUS_M, POST_RADIUS_M, heightM, 10),
      (2 * Math.PI * POST_RADIUS_M) / STEEL_TILE_M,
      heightM / STEEL_TILE_M,
    ),
  )

export const torqueTubeGeometry = (lengthM: number): CylinderGeometry =>
  memo(`tube:${lengthM.toFixed(2)}`, () => {
    const geometry = scaleUv(
      new CylinderGeometry(TUBE_RADIUS_M, TUBE_RADIUS_M, lengthM, 14),
      (2 * Math.PI * TUBE_RADIUS_M) / STEEL_TILE_M,
      lengthM / STEEL_TILE_M,
    )
    geometry.rotateZ(Math.PI / 2)
    return geometry
  })
