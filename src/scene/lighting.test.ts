import { describe, expect, it } from 'bun:test'
import { AgXToneMapping, SRGBColorSpace } from 'three'
import {
  beamIrradiance,
  keyLight,
  penumbraWidthM,
  RENDERER_SETTINGS,
  SUN_ANGULAR_DIAMETER_DEG,
  SUN_DISC_STERADIAN,
  TONE_MAPPING_EXPOSURE,
  horizonColour,
  HORIZON_HAZE,
} from './lighting'

/**
 * A port of three's `AgXToneMapping` and the sRGB output transfer function, present only so
 * the exposure can be pinned to the rule it claims to follow, with no number chosen by feel.
 * Kept literal against `tonemapping_pars_fragment.glsl.js`
 */
const mat3 =
  (c0: readonly number[], c1: readonly number[], c2: readonly number[]) =>
  (v: readonly number[]): number[] =>
    [0, 1, 2].map(
      (i) => (c0[i] ?? 0) * (v[0] ?? 0) + (c1[i] ?? 0) * (v[1] ?? 0) + (c2[i] ?? 0) * (v[2] ?? 0),
    )

const toRec2020 = mat3([0.6274, 0.0691, 0.0164], [0.3293, 0.9195, 0.088], [0.0433, 0.0113, 0.8956])
const toSrgb = mat3(
  [1.6605, -0.1246, -0.0182],
  [-0.5876, 1.1329, -0.1006],
  [-0.0728, -0.0083, 1.1187],
)
const inset = mat3(
  [0.856627153315983, 0.137318972929847, 0.11189821299995],
  [0.0951212405381588, 0.761241990602591, 0.0767994186031903],
  [0.0482516061458583, 0.101439036467562, 0.811302368396859],
)
const outset = mat3(
  [1.1271005818144368, -0.1413297634984383, -0.14132976349843826],
  [-0.11060664309660323, 1.157823702216272, -0.11060664309660294],
  [-0.016493938717834573, -0.016493938717834257, 1.2519364065950405],
)
const MIN_EV = -12.47393
const MAX_EV = 4.026069
const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x)
const sigmoid = (x: number): number => {
  const x2 = x * x
  const x4 = x2 * x2
  return (
    15.5 * x4 * x2 -
    40.14 * x4 * x +
    31.96 * x4 -
    6.868 * x2 * x +
    0.4298 * x2 +
    0.1191 * x -
    0.00232
  )
}

const agx = (linear: readonly number[], exposure: number): number[] => {
  const log = inset(toRec2020(linear.map((x) => x * exposure))).map((x) =>
    clamp01((Math.log2(Math.max(x, 1e-10)) - MIN_EV) / (MAX_EV - MIN_EV)),
  )
  return toSrgb(outset(log.map(sigmoid)).map((x) => Math.max(0, x) ** 2.2)).map(clamp01)
}

const code = (linear: number): number =>
  Math.round((linear <= 0.0031308 ? linear * 12.92 : 1.055 * linear ** (1 / 2.4) - 0.055) * 255)

const REFERENCE_ELEVATION_DEG = 60
const MIDDLE_GREY_REFLECTANCE = 0.18

describe('beamIrradiance', () => {
  it('reddens as the sun drops, because the blue path length grows fastest', () => {
    const ratio = (elevationDeg: number): number => {
      const [r, , b] = beamIrradiance(elevationDeg)
      return r / b
    }
    expect(ratio(90)).toBeCloseTo(1.5153, 3)
    expect(ratio(30)).toBeCloseTo(2.2901, 3)
    expect(ratio(10)).toBeGreaterThan(10)
    expect(ratio(5)).toBeGreaterThan(70)
  })

  it('falls monotonically with the sun and reaches zero at the shader cutoff', () => {
    const green = (elevationDeg: number): number => beamIrradiance(elevationDeg)[1]
    for (const [high, low] of [
      [90, 60],
      [60, 30],
      [30, 10],
      [10, 2],
    ] as const) {
      expect(green(high)).toBeGreaterThan(green(low))
    }
    // the earth-shadow hack in the Sky shader cuts off 2.3 deg below the horizon
    expect(green(-3)).toBe(0)
  })

  it('is an irradiance over the disc the shader paints, not the almanac sun', () => {
    // 0.533 deg limb to limb would be 6.8e-5 sr; three's disc is a 0.533 deg half-angle
    expect(SUN_DISC_STERADIAN).toBeCloseTo(2.7221e-4, 8)
  })
})

describe('keyLight', () => {
  it('splits the beam into a unit-peak colour and a scalar that multiply back to it', () => {
    for (const elevationDeg of [80, 45, 12]) {
      const beam = beamIrradiance(elevationDeg)
      const { colour, intensity } = keyLight(elevationDeg)
      expect(Math.max(...colour)).toBeCloseTo(1, 10)
      for (const channel of [0, 1, 2] as const) {
        expect(colour[channel] * intensity).toBeCloseTo(beam[channel], 10)
      }
    }
  })

  it('keeps a usable colour below the cutoff rather than a black light', () => {
    expect(keyLight(-10)).toEqual({ colour: [1, 1, 1], intensity: 0 })
  })
})

describe('TONE_MAPPING_EXPOSURE', () => {
  it('puts an 18% surface normal to the beam at 60 deg elevation on middle grey', () => {
    const beam = beamIrradiance(REFERENCE_ELEVATION_DEG)
    // Lambertian, normal to the beam: outgoing radiance is albedo / pi times the irradiance
    const grey = beam.map((e) => (MIDDLE_GREY_REFLECTANCE / Math.PI) * e)
    const rendered = agx(grey, TONE_MAPPING_EXPOSURE)
    const luminance =
      0.2126 * (rendered[0] ?? 0) + 0.7152 * (rendered[1] ?? 0) + 0.0722 * (rendered[2] ?? 0)
    expect(code(luminance)).toBe(118)
    // and it is warm, because the beam it is lit by is
    expect(rendered.map(code)).toEqual([125, 117, 104])
  })

  it('leaves the sunlit ground short of clipping and the deep shade off the floor', () => {
    const beam = beamIrradiance(REFERENCE_ELEVATION_DEG)
    const sunlitSoil = beam.map((e) => (0.2 / Math.PI) * e * Math.sin((60 * Math.PI) / 180))
    // panel shade is diffuse-only, on the order of a tenth of the open irradiance
    const shadedSoil = sunlitSoil.map((v) => v * 0.13)
    expect(Math.max(...agx(sunlitSoil, TONE_MAPPING_EXPOSURE).map(code))).toBeLessThan(200)
    expect(Math.max(...agx(shadedSoil, TONE_MAPPING_EXPOSURE).map(code))).toBeGreaterThan(20)
  })
})

describe('RENDERER_SETTINGS', () => {
  it('is what the canvas is given, stated rather than inherited', () => {
    expect(RENDERER_SETTINGS.toneMapping).toBe(AgXToneMapping)
    expect(RENDERER_SETTINGS.outputColorSpace).toBe(SRGBColorSpace)
    expect(RENDERER_SETTINGS.toneMappingExposure).toBe(TONE_MAPPING_EXPOSURE)
  })
})

describe('penumbraWidthM', () => {
  it('matches the geometry recorded in docs/00-DECISIONS.md section 3', () => {
    expect(SUN_ANGULAR_DIAMETER_DEG).toBe(0.533)
    // 3.72 cm at 4 m under an overhead sun, half the 7.5 cm a doubled angle would give
    expect(penumbraWidthM(4, 90)).toBeCloseTo(0.0372, 4)
    // 14.9 cm at 30 deg: the same width divided by sin squared of the elevation
    expect(penumbraWidthM(4, 30)).toBeCloseTo(0.14885, 5)
  })

  it('grows with the occluder and with a lower sun, and stops growing near the horizon', () => {
    expect(penumbraWidthM(8, 90)).toBeCloseTo(2 * penumbraWidthM(4, 90), 6)
    expect(penumbraWidthM(4, 15)).toBeGreaterThan(penumbraWidthM(4, 45))
    expect(penumbraWidthM(4, 0)).toBe(penumbraWidthM(4, 3))
  })
})

/**
 * The colour the far ground fades into, which has to be the sky's own or the fade shows as a
 * band of the wrong hue where the two meet. Derived from the same Preetham extinction the sky
 * dome is drawn with, so it tracks the sun and never sits at a fixed grey
 */
describe('the horizon colour the fog takes', () => {
  it('is pale and near-neutral with the sun high, the way a hazy horizon is', () => {
    const [r, g, b] = horizonColour(60)
    for (const channel of [r, g, b]) {
      expect(channel).toBeGreaterThan(HORIZON_HAZE)
      expect(channel).toBeLessThanOrEqual(1)
    }
    /*
      Warm, because that is the physics: what reaches the eye along a
      horizon path is what survived the air, and Rayleigh takes the blue out first, which is
      the same reason a low sun is orange. A high sun leaves it barely warm
    */
    expect(r).toBeGreaterThanOrEqual(b)
    expect(r - b).toBeLessThan(0.25)
  })

  it('warms as the sun drops, because the long path takes the blue out first', () => {
    const high = horizonColour(60)
    const low = horizonColour(2)
    const warmth = (c: readonly number[]): number => (c[0] ?? 0) - (c[2] ?? 0)
    expect(warmth(low)).toBeGreaterThan(warmth(high))
  })

  it('answers a colour below the horizon rather than a division by zero', () => {
    const [r, g, b] = horizonColour(-10)
    for (const channel of [r, g, b]) expect(Number.isFinite(channel)).toBe(true)
  })
})
