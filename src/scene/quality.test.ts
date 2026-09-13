import { describe, expect, it } from 'bun:test'
import { detectTier, qualityFor, resolveQuality, type DeviceProfile } from './quality'
import { cascadeShadowRadius, penumbraWidthM } from './lighting'

const WORKSTATION: DeviceProfile = { cores: 16, deviceMemoryGb: 8, maxTextureSize: 16384 }
const PHONE: DeviceProfile = { cores: 4, deviceMemoryGb: 4, maxTextureSize: 4096 }

describe('detectTier', () => {
  it('reads capabilities, not GPU names, so the software rasteriser is measured as it is', () => {
    expect(detectTier(WORKSTATION)).toBe('high')
    expect(detectTier({ ...WORKSTATION, cores: 6 })).toBe('low')
    expect(detectTier({ ...WORKSTATION, maxTextureSize: 4096 })).toBe('low')
    expect(detectTier({ ...WORKSTATION, deviceMemoryGb: 2 })).toBe('low')
    // absent outside Chromium, and absence is not evidence of a weak device
    expect(detectTier({ ...WORKSTATION, deviceMemoryGb: null })).toBe('high')
    expect(detectTier(PHONE)).toBe('low')
  })
})

describe('qualityFor', () => {
  it('reduces every dimension it can on the low tier', () => {
    const high = qualityFor('high')
    const low = qualityFor('low')
    expect(low.shadowMapSize).toBeLessThan(high.shadowMapSize)
    expect(low.cascades).toBeLessThan(high.cascades)
    expect(low.shadowMaxFarM).toBeLessThan(high.shadowMaxFarM)
    expect(low.environmentResolution).toBeLessThan(high.environmentResolution)
    expect(low.surfaceTextureSize).toBeLessThan(high.surfaceTextureSize)
    expect(low.foliageCards).toBeLessThan(high.foliageCards)
    expect(low.wind).toBe(false)
    expect(high.wind).toBe(true)
    expect(low.glassClearcoat).toBe(false)
    expect(low.occlusionSamples).toBeLessThan(high.occlusionSamples)
    expect(low.occlusionScale).toBeLessThan(high.occlusionScale)
  })

  /**
   * The occlusion is a correction to how bright shaded ground is, not an ornament, so the low
   * tier gets a blurrier estimate of the same quantity rather than none of it. Off is a choice
   * the grower makes in the panel, and it is the only way to be without it
   */
  it('degrades the sky occlusion rather than dropping it', () => {
    const low = qualityFor('low')
    expect(low.occlusionSamples).toBeGreaterThan(0)
    expect(low.occlusionDenoiseSamples).toBeGreaterThan(0)
    expect(low.occlusionScale).toBeGreaterThan(0)
  })

  it('keeps the sky IBL on at both tiers: it is the ambient, not an extra', () => {
    expect(qualityFor('low').environmentResolution).toBeGreaterThan(0)
  })

  it('still draws a plant and a surface on the low tier, only fewer of each', () => {
    const low = qualityFor('low')
    expect(low.foliageCards).toBeGreaterThan(1)
    expect(low.surfaceTextureSize).toBeGreaterThan(0)
  })
})

describe('resolveQuality', () => {
  it('defers to the probe on auto and obeys an explicit choice on either device', () => {
    expect(resolveQuality('auto', PHONE).tier).toBe('low')
    expect(resolveQuality('auto', WORKSTATION).tier).toBe('high')
    expect(resolveQuality('high', PHONE).tier).toBe('high')
    expect(resolveQuality('low', WORKSTATION).tier).toBe('low')
  })
})

describe('cascadeShadowRadius', () => {
  const HIGH = qualityFor('high')

  it('asks for the physical penumbra where the cascade can resolve it', () => {
    // a near cascade covering 15 m at 2048 is 7.3 mm a texel, finer than a 3.1 cm penumbra
    const penumbraM = penumbraWidthM(2.5, 60)
    expect(cascadeShadowRadius(15, HIGH.shadowMapSize, penumbraM)).toBeCloseTo(
      penumbraM / (2 * (15 / HIGH.shadowMapSize)),
      6,
    )
  })

  it('clamps to one texel where the map is already coarser than the penumbra', () => {
    // a far cascade covering 120 m is 5.9 cm a texel, twice the penumbra it would blur
    expect(cascadeShadowRadius(120, HIGH.shadowMapSize, penumbraWidthM(2.5, 60))).toBe(1)
  })

  it('never spreads nine taps so wide that they band instead of blurring', () => {
    expect(cascadeShadowRadius(4, HIGH.shadowMapSize, penumbraWidthM(4, 5))).toBe(4)
  })
})
