/**
 * Foliage, as alpha cards rather than solid primitives.
 *
 * A plant used to be one low-poly solid per `CanopyShape`, which shades like a billiard ball and
 * casts a billiard ball's shadow. Since plants shading each other is part of what this tool
 * models, the shadow is not decoration: a canopy has to let light through the way a canopy does.
 * Each shape is now a cluster of leaf cards whose silhouette follows the same profile the solid
 * had, alpha-tested rather than blended so the depth pass sees exactly what the colour pass does,
 * and shaded off a normal that points out of the canopy volume rather than off the card, which is
 * what stops the cards reading as flat paper.
 *
 * Everything here is one geometry and one material per shape, so the instancing the scene already
 * depends on is unchanged.
 */

import {
  BufferGeometry,
  ClampToEdgeWrapping,
  DataTexture,
  Float32BufferAttribute,
  LinearMipmapLinearFilter,
  LinearFilter,
  RGBAFormat,
  SRGBColorSpace,
  Uint16BufferAttribute,
  Vector3,
  type Material,
} from 'three'
import type { CanopyShape } from '../types/crop'

/**
 * The canopy profile: radius as a share of the instance's width at height `t`, plus how far the
 * cards at that height lie over towards horizontal. Each silhouette follows the shape it is named
 * for, so a crop keyed to `spreading` reads as spreading
 */
interface Form {
  readonly radius: (t: number) => number
  /** cards per unit of the tier budget: a tree needs more than a rosette to close its outline */
  readonly density: number
  readonly cardScale: number
  /** 0 upright, 1 flat */
  readonly lay: number
}

const dome = (t: number): number => Math.sqrt(Math.max(0, 1 - t * t))
const ball = (t: number): number => Math.sqrt(Math.max(0, 1 - (2 * t - 1) ** 2))

const FORMS: Readonly<Record<CanopyShape, Form>> = {
  sphere: { radius: (t) => 0.5 * ball(t), density: 1, cardScale: 0.42, lay: 0.25 },
  hemisphere: { radius: (t) => 0.5 * dome(t), density: 1, cardScale: 0.42, lay: 0.35 },
  ellipsoid: { radius: (t) => 0.4 * ball(t), density: 1, cardScale: 0.38, lay: 0.2 },
  cone: { radius: (t) => 0.5 * (1 - t) ** 0.8, density: 1.1, cardScale: 0.34, lay: 0.4 },
  cylinder: { radius: (t) => 0.42 - 0.1 * t, density: 1, cardScale: 0.34, lay: 0.2 },
  columnar: { radius: () => 0.2, density: 1.2, cardScale: 0.26, lay: 0.15 },
  vase: { radius: (t) => 0.12 + 0.38 * t ** 0.7, density: 1.1, cardScale: 0.34, lay: 0.3 },
  spreading: {
    radius: (t) => 0.5 * dome(1 - t) * (0.4 + 0.6 * t),
    density: 1.2,
    cardScale: 0.4,
    lay: 0.6,
  },
  'flat-disc': { radius: () => 0.48, density: 0.9, cardScale: 0.4, lay: 0.9 },
  irregular: {
    radius: (t) => 0.5 * ball(t) * (0.7 + 0.5 * ((t * 7) % 1)),
    density: 1.1,
    cardScale: 0.36,
    lay: 0.3,
  },
}

const prng = (seed: number): (() => number) => {
  let state = seed || 1
  return () => {
    state = (state + 0x6d2b79f5) | 0
    let t = Math.imul(state ^ (state >>> 15), 1 | state)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5))
const UP = new Vector3(0, 1, 0)
const cache = new Map<string, BufferGeometry>()

/**
 * A unit canopy: x and z in [-0.5, 0.5], y in [0, 1], which is the box the instance matrix scales
 * by the crop's own width and height. Cards are placed on a Vogel spiral so the outline closes
 * evenly at any count, and the count is what the GPU tier turns down
 */
export const canopyCards = (shape: CanopyShape, budget: number): BufferGeometry => {
  const key = `${shape}:${String(budget)}`
  const hit = cache.get(key)
  if (hit) return hit

  const form = FORMS[shape]
  const count = Math.max(2, Math.round(budget * form.density))
  const random = prng(count * 7919 + shape.length * 104729)
  const positions: number[] = []
  const normals: number[] = []
  const uvs: number[] = []
  const indices: number[] = []
  const centre = new Vector3()
  const radial = new Vector3()
  const tangent = new Vector3()
  const cardUp = new Vector3()
  const normal = new Vector3()
  const corner = new Vector3()

  for (let card = 0; card < count; card += 1) {
    const t = (card + 0.5) / count
    const theta = card * GOLDEN_ANGLE
    radial.set(Math.cos(theta), 0, Math.sin(theta))
    tangent.set(-Math.sin(theta), 0, Math.cos(theta))
    const r = form.radius(t) * (0.45 + 0.55 * random())
    centre
      .copy(radial)
      .multiplyScalar(r)
      .setY(t * 0.92 + 0.04)
    const lay = Math.min(1, Math.max(0, form.lay + (random() - 0.5) * 0.24))
    cardUp
      .copy(UP)
      .multiplyScalar(1 - lay)
      .addScaledVector(radial, lay)
      .normalize()
    normal
      .copy(radial)
      .multiplyScalar(1 - lay)
      .addScaledVector(UP, lay + 0.4)
      .normalize()
    const half = form.cardScale * (0.7 + 0.6 * random())
    const base = card * 4
    // the same leaf cluster on every card would read as a repeated stamp, so each one takes the
    // texture at one of eight orientations: four quarter turns, optionally mirrored
    const spin = Math.floor(random() * 4)
    const flip = random() < 0.5
    const corners = [
      [-1, -1],
      [1, -1],
      [1, 1],
      [-1, 1],
    ] as const
    for (const [index, [du, dv]] of corners.entries()) {
      corner
        .copy(centre)
        .addScaledVector(tangent, du * half)
        .addScaledVector(cardUp, dv * half)
      positions.push(corner.x, Math.max(0, corner.y), corner.z)
      normals.push(normal.x, normal.y, normal.z)
      const [su, sv] = corners[(index + spin) % 4] ?? corners[0]
      uvs.push((flip ? -su : su) / 2 + 0.5, sv / 2 + 0.5)
    }
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3)
  }

  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3))
  geometry.setAttribute('normal', new Float32BufferAttribute(normals, 3))
  geometry.setAttribute('uv', new Float32BufferAttribute(uvs, 2))
  geometry.setIndex(new Uint16BufferAttribute(indices, 1))
  geometry.computeBoundingSphere()
  cache.set(key, geometry)
  return geometry
}

/* ---------------------------------- the leaves ----------------------------------- */

interface Leaf {
  readonly x: number
  readonly y: number
  readonly angle: number
  readonly length: number
  readonly width: number
}

const LEAVES = 15

const leafCluster = (): readonly Leaf[] => {
  const random = prng(20260801)
  return Array.from({ length: LEAVES }, (_, index) => {
    const spread = index / LEAVES
    return {
      x: 0.5 + (random() - 0.5) * 0.4,
      y: 0.5 + (random() - 0.5) * 0.4,
      angle: spread * Math.PI * 2 + random(),
      length: 0.16 + random() * 0.1,
      width: 0.075 + random() * 0.04,
    }
  })
}

const textures = new Map<number, DataTexture>()

/**
 * One cluster of leaves with an alpha cut-out. The colour channels are a shading multiplier, not
 * a colour: the hue comes from the instance colour the planting carries, so two crops share this
 * texture and still look like two crops
 */
export const leafTexture = (size: number): DataTexture => {
  const hit = textures.get(size)
  if (hit) return hit
  const leaves = leafCluster()
  const data = new Uint8Array(size * size * 4)
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const u = (x + 0.5) / size
      const v = (y + 0.5) / size
      let alpha = 0
      let shade = 0
      for (const leaf of leaves) {
        const dx = u - leaf.x
        const dy = v - leaf.y
        const along = dx * Math.cos(leaf.angle) + dy * Math.sin(leaf.angle)
        const across = -dx * Math.sin(leaf.angle) + dy * Math.cos(leaf.angle)
        const s = along / leaf.length
        if (s < -1 || s > 1) continue
        // tapered to a tip at s = 1 and a stalk at s = -1, which is what makes it read as a leaf
        const halfWidth = leaf.width * Math.sqrt(Math.max(0, 1 - s * s)) * (1 - 0.45 * s)
        if (halfWidth <= 0 || Math.abs(across) > halfWidth) continue
        const rib = Math.abs(across) / halfWidth
        alpha = 1
        shade = Math.max(shade, 0.62 + 0.3 * (1 - rib) + 0.12 * (1 - Math.abs(s)))
      }
      const index = (x + y * size) * 4
      const level = Math.round(Math.min(1, shade) * 255)
      data[index] = level
      data[index + 1] = level
      data[index + 2] = level
      data[index + 3] = alpha > 0 ? 255 : 0
    }
  }
  const texture = new DataTexture(data, size, size, RGBAFormat)
  texture.wrapS = ClampToEdgeWrapping
  texture.wrapT = ClampToEdgeWrapping
  texture.magFilter = LinearFilter
  texture.minFilter = LinearMipmapLinearFilter
  texture.generateMipmaps = true
  texture.anisotropy = 4
  texture.colorSpace = SRGBColorSpace
  texture.needsUpdate = true
  textures.set(size, texture)
  return texture
}

/** Low enough that a mipmapped card does not thin out with distance, high enough to keep an edge */
export const LEAF_ALPHA_TEST = 0.28

/* ----------------------------------- the wind ------------------------------------ */

/** One clock for every canopy in the scene, so nothing drifts out of phase with anything else */
export const WIND_TIME = { value: 0 }

/** Metres of sway at the top of a one-metre plant, before the instance scale multiplies it */
const WIND_AMPLITUDE = 0.055

/**
 * Sway anchored at the base and quadratic in height, phase-shifted by where the plant stands, so
 * a bed does not move as one object. The displacement is in the unit canopy's own space and the
 * instance matrix scales it, which is why a tree sways further than a lettuce for free
 */
const WIND_GLSL = /* glsl */ `
#ifdef USE_INSTANCING
  vec3 windAnchor = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
#else
  vec3 windAnchor = vec3(0.0);
#endif
  float windBend = transformed.y * transformed.y;
  float windGust = 0.55 + 0.45 * sin(uWindTime * 0.37 + windAnchor.x * 0.09 + windAnchor.z * 0.07);
  transformed.x += windBend * windGust * ${WIND_AMPLITUDE.toFixed(4)} *
    sin(uWindTime * 1.7 + windAnchor.x * 0.8 + windAnchor.z * 0.45);
  transformed.z += windBend * windGust * ${(WIND_AMPLITUDE * 0.6).toFixed(4)} *
    cos(uWindTime * 1.3 + windAnchor.z * 0.9);
`

/**
 * Note for whoever enrols these materials in the cascaded shadow maps: `CSM.setupMaterial`
 * assigns `onBeforeCompile` rather than composing with it, so it would drop this. `SunRig`
 * chains the two
 */
export const applyWind = <T extends Material>(material: T): T => {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uWindTime = WIND_TIME
    shader.vertexShader = shader.vertexShader
      .replace('void main() {', 'uniform float uWindTime;\nvoid main() {')
      .replace('#include <begin_vertex>', `#include <begin_vertex>\n${WIND_GLSL}`)
  }
  material.customProgramCacheKey = () => 'foliage-wind'
  return material
}
