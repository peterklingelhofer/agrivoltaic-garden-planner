/**
 * Render quality tiers. Capability-derived: a GPU allow-list ages
 * badly and misreads the software rasterizer the visual suite runs on, which reports plenty
 * of texture memory and should be measured as what it is
 */

import type { LightingQuality, QualityTier } from '../types/render'

export interface DeviceProfile {
  readonly cores: number
  /** `navigator.deviceMemory`, absent outside Chromium */
  readonly deviceMemoryGb: number | null
  readonly maxTextureSize: number
}

export const detectTier = (profile: DeviceProfile): QualityTier =>
  profile.cores < 8 ||
  profile.maxTextureSize < 8192 ||
  (profile.deviceMemoryGb !== null && profile.deviceMemoryGb < 4)
    ? 'low'
    : 'high'

export interface RenderQuality {
  readonly tier: QualityTier
  readonly shadowMapSize: number
  readonly cascades: number
  /** Cascades stop here. Beyond it the garden is background and gets no shadow budget */
  readonly shadowMaxFarM: number
  /** Cube face size for the sky IBL. Sky irradiance is very low frequency, so this is small */
  readonly environmentResolution: number
  /**
   * Edge of one procedural surface tile. Every one is rasterized on the CPU at load, so this is
   * a startup cost as much as a memory one. The ground gets twice this, being the surface the
   * camera spends the most pixels on
   */
  readonly surfaceTextureSize: number
  /** Cards per instanced canopy. Foliage is the scene's only real overdraw */
  readonly foliageCards: number
  /** Vertex-shader wind. The motion is free per vertex and costs a shader permutation */
  readonly wind: boolean
  /**
   * Anisotropy on the module glass, i.e. `MeshPhysicalMaterial` over standard, and the clearcoat on
   * wet soil
   */
  readonly glassClearcoat: boolean
  /** Horizon directions x steps the occlusion integral takes. Its whole cost is here */
  readonly occlusionSamples: number
  /** Taps in the Poisson denoise that turns those samples back into a smooth estimate */
  readonly occlusionDenoiseSamples: number
  /** Fraction of the drawing buffer the occlusion is estimated at, and its G-buffer with it */
  readonly occlusionScale: number
}

const HIGH: RenderQuality = {
  tier: 'high',
  shadowMapSize: 2048,
  cascades: 4,
  shadowMaxFarM: 90,
  environmentResolution: 128,
  surfaceTextureSize: 128,
  foliageCards: 9,
  wind: true,
  glassClearcoat: true,
  occlusionSamples: 16,
  occlusionDenoiseSamples: 16,
  occlusionScale: 1,
}

const LOW: RenderQuality = {
  tier: 'low',
  shadowMapSize: 1024,
  cascades: 2,
  shadowMaxFarM: 60,
  environmentResolution: 32,
  surfaceTextureSize: 64,
  foliageCards: 3,
  wind: false,
  glassClearcoat: false,
  // half resolution quarters the G-buffer and the integral both. The estimate it degrades to is
  // blurrier than the high tier's and equally strong, so shaded ground reads the same brightness
  occlusionSamples: 8,
  occlusionDenoiseSamples: 8,
  occlusionScale: 0.5,
}

export const qualityFor = (tier: QualityTier): RenderQuality => (tier === 'high' ? HIGH : LOW)

export const resolveQuality = (setting: LightingQuality, profile: DeviceProfile): RenderQuality =>
  qualityFor(setting === 'auto' ? detectTier(profile) : setting)

const DEFAULT_PROFILE: DeviceProfile = { cores: 4, deviceMemoryGb: null, maxTextureSize: 4096 }

export const deviceProfile = (maxTextureSize: number): DeviceProfile => {
  if (typeof navigator === 'undefined') return { ...DEFAULT_PROFILE, maxTextureSize }
  const memory = (navigator as { deviceMemory?: number }).deviceMemory
  return {
    cores: navigator.hardwareConcurrency || DEFAULT_PROFILE.cores,
    deviceMemoryGb: typeof memory === 'number' ? memory : null,
    maxTextureSize,
  }
}
