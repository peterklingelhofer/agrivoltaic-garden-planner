/**
 * Procedural surface detail.
 *
 * Every map in the scene is generated here, from a seeded lattice noise, at load time. Nothing
 * is downloaded, so nothing carries a licence, and `public/` does not grow. The cost is one
 * pass over each texture on the CPU at startup, which is why the tiers below exist.
 *
 * Two conventions the rest of the scene depends on:
 *
 * 1. an albedo map is authored as sRGB bytes holding the surface's real linear reflectance,
 *    and `Surface.meanAlbedo` is the exact per-channel mean of those bytes after the decode
 *    the GPU applies. A material can therefore be tinted to a known area-average reflectance
 *    with `neutralGain`, which is what keeps the rendered ground agreeing with the albedo the
 *    simulation assumed instead of merely looking plausible.
 * 2. roughness and metalness share one map in the glTF channel order, G and B, so a surface
 *    costs three textures rather than four.
 */

import {
  DataTexture,
  LinearMipmapLinearFilter,
  LinearFilter,
  RGBAFormat,
  RepeatWrapping,
  SRGBColorSpace,
  UVMapping,
} from 'three'

export type Rgb = readonly [number, number, number]

/** Rec.709, the luminance weighting of the linear-sRGB working space three lights in */
export const luminance = (rgb: Rgb): number => 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2]

export const srgbToLinear = (channel: number): number =>
  channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4

export const linearToSrgb = (channel: number): number =>
  channel <= 0.0031308 ? channel * 12.92 : 1.055 * channel ** (1 / 2.4) - 0.055

/**
 * The neutral multiplier that carries a surface's authored mean reflectance to the one the
 * model uses. Neutral rather than per-channel on purpose: a per-channel fit would hit the same
 * luminance while quietly rewriting the hue the texture was authored with
 */
export const neutralGain = (meanAlbedo: Rgb, targetAlbedo: number): number => {
  const mean = luminance(meanAlbedo)
  return mean > 0 ? targetAlbedo / mean : 1
}

const clamp01 = (value: number): number => (value < 0 ? 0 : value > 1 ? 1 : value)

const lattice = (x: number, y: number, seed: number): number => {
  let h =
    Math.imul(x + 0x9e37, 374761393) ^
    Math.imul(y + 0x85eb, 668265263) ^
    Math.imul(seed, 2246822519)
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}

const smoothstep = (t: number): number => t * t * (3 - 2 * t)

/** Value noise on a lattice that wraps at `cells`, so every octave tiles and no seam appears */
const valueNoise = (x: number, y: number, cells: number, seed: number): number => {
  const x0 = Math.floor(x)
  const y0 = Math.floor(y)
  const fx = smoothstep(x - x0)
  const fy = smoothstep(y - y0)
  const wrap = (value: number): number => ((value % cells) + cells) % cells
  const xa = wrap(x0)
  const xb = wrap(x0 + 1)
  const ya = wrap(y0)
  const yb = wrap(y0 + 1)
  const top = lattice(xa, ya, seed) * (1 - fx) + lattice(xb, ya, seed) * fx
  const bottom = lattice(xa, yb, seed) * (1 - fx) + lattice(xb, yb, seed) * fx
  return top * (1 - fy) + bottom * fy
}

export interface FbmOptions {
  /** lattice cells across the tile at the first octave */
  readonly cells: number
  readonly octaves: number
  readonly seed: number
  /** anisotropy of the lattice: >1 stretches the noise along u, which is how grain reads */
  readonly stretch?: number
}

/** Fractional Brownian motion in [0, 1], tileable over the unit square */
export const fbm = (u: number, v: number, options: FbmOptions): number => {
  const stretch = options.stretch ?? 1
  let sum = 0
  let total = 0
  let amplitude = 1
  let cells = options.cells
  for (let octave = 0; octave < options.octaves; octave += 1) {
    const across = Math.max(1, Math.round(cells / stretch))
    sum += amplitude * valueNoise(u * across, v * cells, cells, options.seed + octave * 101)
    total += amplitude
    amplitude *= 0.5
    cells *= 2
  }
  return total > 0 ? sum / total : 0
}

export interface Texel {
  /** linear reflectance at this texel, before any material tint */
  readonly albedo: Rgb
  /** 0 to 1, differentiated into the normal map */
  readonly height: number
  readonly roughness: number
  readonly metalness: number
}

export interface Surface {
  readonly map: DataTexture
  readonly normalMap: DataTexture
  /** G is roughness and B is metalness, the glTF packing */
  readonly ormMap: DataTexture
  readonly meanAlbedo: Rgb
}

const configure = (texture: DataTexture, srgb: boolean): DataTexture => {
  texture.wrapS = RepeatWrapping
  texture.wrapT = RepeatWrapping
  texture.mapping = UVMapping
  texture.magFilter = LinearFilter
  texture.minFilter = LinearMipmapLinearFilter
  texture.generateMipmaps = true
  texture.anisotropy = 8
  if (srgb) texture.colorSpace = SRGBColorSpace
  texture.needsUpdate = true
  return texture
}

const byte = (value: number): number => Math.round(clamp01(value) * 255)

export interface SurfaceOptions {
  readonly size: number
  /** vertical relief of the height field in the same units as one tile width */
  readonly relief: number
  readonly field: (u: number, v: number) => Texel
}

/**
 * Rasterises a field into the three maps a `MeshStandardMaterial` reads. The normal map is a
 * central difference of the height field rather than a second noise, so the bumps a surface
 * shades with are the same bumps its albedo varies over
 */
export const buildSurface = ({ size, relief, field }: SurfaceOptions): Surface => {
  const albedo = new Uint8Array(size * size * 4)
  const normal = new Uint8Array(size * size * 4)
  const orm = new Uint8Array(size * size * 4)
  const heights = new Float32Array(size * size)
  const mean: [number, number, number] = [0, 0, 0]

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const index = y * size + x
      const texel = field(x / size, y / size)
      heights[index] = texel.height
      for (const channel of [0, 1, 2] as const) {
        const encoded = byte(linearToSrgb(clamp01(texel.albedo[channel])))
        albedo[index * 4 + channel] = encoded
        mean[channel] += srgbToLinear(encoded / 255)
      }
      albedo[index * 4 + 3] = 255
      orm[index * 4] = 255
      orm[index * 4 + 1] = byte(texel.roughness)
      orm[index * 4 + 2] = byte(texel.metalness)
      orm[index * 4 + 3] = 255
    }
  }

  const at = (x: number, y: number): number =>
    heights[(((y % size) + size) % size) * size + (((x % size) + size) % size)] ?? 0
  const scale = relief * size
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const dx = (at(x + 1, y) - at(x - 1, y)) * 0.5 * scale
      const dy = (at(x, y + 1) - at(x, y - 1)) * 0.5 * scale
      const length = Math.hypot(dx, dy, 1)
      const index = (y * size + x) * 4
      normal[index] = byte((-dx / length) * 0.5 + 0.5)
      normal[index + 1] = byte((-dy / length) * 0.5 + 0.5)
      normal[index + 2] = byte(1 / length / 2 + 0.5)
      normal[index + 3] = 255
    }
  }

  const texels = size * size
  return {
    map: configure(new DataTexture(albedo, size, size, RGBAFormat), true),
    normalMap: configure(new DataTexture(normal, size, size, RGBAFormat), false),
    ormMap: configure(new DataTexture(orm, size, size, RGBAFormat), false),
    meanAlbedo: [mean[0] / texels, mean[1] / texels, mean[2] / texels],
  }
}

export const disposeSurface = (surface: Surface): void => {
  surface.map.dispose()
  surface.normalMap.dispose()
  surface.ormMap.dispose()
}

export const mix = (a: Rgb, b: Rgb, t: number): Rgb => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
]
