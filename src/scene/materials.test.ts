import { describe, expect, it } from 'bun:test'
import { makeBed } from '../state/defaults'
import type { Irrigation } from '../types/garden'
import { GROUND_COVERS, groundAlbedoOf } from '../types/ground'
import { fraction, millimetersPerYear } from '../types/units'
import {
  aluminumSurface,
  bedSoilAlbedo,
  bedSoilRoughness,
  bedWetness,
  driedBy,
  galvanizedSurface,
  groundSurface,
  laminateSurface,
  soilSurface,
  soilTint,
  surfaceGain,
  TIMBER_ALBEDO,
  timberSurface,
  tintedBy,
} from './materials'
import { fbm, luminance, srgbToLinear, type Surface } from './textures'

/**
 * The claim these tests exist for: the ground the camera sees reflects the fraction of light the
 * simulation assumed it reflects. Nothing else in the render is checkable against the model this
 * directly, and a ground that looks darker than its own albedo is the picture disagreeing with
 * the physics itself
 */

const SIZE = 32

const irrigation = (patch: Partial<Irrigation>): Irrigation => ({
  method: 'drip',
  available: true,
  appliedMmPerYear: millimetersPerYear(180),
  ...patch,
})

/** What the GPU averages a mipmapped tile down to, tinted the way the material tints it */
const renderedAlbedo = (surface: Surface, gain: number): number =>
  luminance(surface.meanAlbedo) * gain

describe('ground reflectance', () => {
  it('renders at exactly the albedo the model carries, at any albedo', () => {
    const surface = groundSurface(SIZE)
    for (const albedo of [0.08, 0.15, 0.2, 0.26, 0.4]) {
      expect(renderedAlbedo(surface, surfaceGain(surface, albedo))).toBeCloseTo(albedo, 10)
    }
  })

  /**
   * The self-test. A flat `#5d6f4a` ground, the `previous` below, has a luminance of 0.142 against
   * the 0.2 the plot carries and the sky bounces off its IBL ground plane: 30 percent darker than
   * its own physics. If `surfaceGain` ever stops being applied, this is the size of the error that
   * comes back
   */
  it('is a visible error to get wrong, which is what makes the check worth having', () => {
    const previous = [0x5d, 0x6f, 0x4a].map((byte) => srgbToLinear(byte / 255)) as [
      number,
      number,
      number,
    ]
    expect(luminance(previous)).toBeCloseTo(0.142, 3)
    expect(Math.abs(luminance(previous) - 0.2) / 0.2).toBeGreaterThan(0.25)
  })

  it('holds every cover near a unit gain at its own albedo, so no texel is driven past one', () => {
    for (const cover of GROUND_COVERS) {
      const gain = surfaceGain(groundSurface(SIZE, cover), groundAlbedoOf(cover))
      expect(gain).toBeGreaterThan(0.8)
      expect(gain).toBeLessThan(1.25)
    }
  })

  it('draws grass green and gravel gray, whatever albedo each is carried to', () => {
    const [gr, gg, gb] = groundSurface(SIZE, 'grass').meanAlbedo
    expect(gg).toBeGreaterThan(gr * 1.4)
    expect(gg).toBeGreaterThan(gb * 2)
    const [sr, sg, sb] = groundSurface(SIZE, 'light-gravel').meanAlbedo
    expect(Math.abs(sr - sb) / sg).toBeLessThan(0.12)
  })
})

describe('the module laminate', () => {
  /**
   * A module measures a few percent. Without mipmaps the texture samples as dark as the cells it
   * mostly is while averaging far brighter. With mipmaps the average is what shows
   */
  it('averages to the reflectance of a real module, not of its inter-cell gaps', () => {
    expect(luminance(laminateSurface(128).meanAlbedo)).toBeLessThan(0.08)
    expect(luminance(laminateSurface(128).meanAlbedo)).toBeGreaterThan(0.03)
  })

  it('is bluer than it is red, which is what an anti-reflective coating does', () => {
    const [r, , b] = laminateSurface(128).meanAlbedo
    expect(b).toBeGreaterThan(r)
  })
})

describe('metals', () => {
  it('are metal in the map the material reads, not in a constant beside it', () => {
    for (const surface of [aluminumSurface(SIZE), galvanizedSurface(SIZE)]) {
      const orm = surface.ormMap.image.data as Uint8Array
      expect(orm[2]).toBeGreaterThan(200)
    }
  })

  it('leaves every dielectric surface at zero metalness', () => {
    for (const surface of [groundSurface(SIZE), soilSurface(SIZE), timberSurface(SIZE)]) {
      const orm = surface.ormMap.image.data as Uint8Array
      expect(orm[2]).toBe(0)
    }
  })
})

describe('bed soil', () => {
  it('darkens with organic matter, and stops darkening once the soil is black', () => {
    const bed = makeBed(1)
    const lean = { ...bed, soil: { ...bed.soil, organicMatterFraction: fraction(0) } }
    const rich = { ...bed, soil: { ...bed.soil, organicMatterFraction: fraction(0.06) } }
    const richer = { ...bed, soil: { ...bed.soil, organicMatterFraction: fraction(0.3) } }
    expect(bedSoilAlbedo(rich, 0.2)).toBeLessThan(bedSoilAlbedo(lean, 0.2))
    expect(bedSoilAlbedo(richer, 0.2)).toBeCloseTo(bedSoilAlbedo(rich, 0.2), 12)
  })

  it('reads the surface an irrigation method wets, not the water it delivers', () => {
    const bed = makeBed(1)
    const wetted = (method: Irrigation['method']): number => bedWetness(irrigation({ method }))
    expect(wetted('sprinkler')).toBe(1)
    expect(wetted('flood')).toBe(1)
    expect(wetted('drip')).toBeGreaterThan(0)
    expect(wetted('drip')).toBeLessThan(1)
    // the method that delivers the most water to the root zone and none to the surface
    expect(wetted('subsurface-drip')).toBe(0)
    expect(wetted('none')).toBe(0)
    expect(bedWetness(irrigation({ available: false, method: 'sprinkler' }))).toBe(0)
    expect(bedWetness(irrigation({ appliedMmPerYear: millimetersPerYear(0) }))).toBe(0)
    expect(
      bedSoilRoughness({ ...bed, irrigation: irrigation({ method: 'sprinkler' }) }),
    ).toBeLessThan(bedSoilRoughness({ ...bed, irrigation: irrigation({ method: 'none' }) }))
  })

  it('stays anchored to the one albedo the plot carries', () => {
    const bed = makeBed(1)
    expect(bedSoilAlbedo(bed, 0.3) / bedSoilAlbedo(bed, 0.15)).toBeCloseTo(2, 12)
    const surface = soilSurface(SIZE)
    expect(renderedAlbedo(surface, soilTint(surface, bed, 0.2))).toBeCloseTo(
      bedSoilAlbedo(bed, 0.2),
      10,
    )
  })

  it('never renders a bed brighter than the ground it sits in', () => {
    const bed = makeBed(1)
    expect(bedSoilAlbedo(bed, 0.2)).toBeLessThan(0.2)
  })
})

describe('timber', () => {
  it('renders at the reflectance of weathered softwood', () => {
    const surface = timberSurface(SIZE)
    expect(renderedAlbedo(surface, surfaceGain(surface, TIMBER_ALBEDO))).toBeCloseTo(
      TIMBER_ALBEDO,
      10,
    )
  })
})

describe('selection', () => {
  it('multiplies the material rather than replacing it, and is neutral when unselected', () => {
    expect(tintedBy(0.7, false)).toEqual([0.7, 0.7, 0.7])
    const [r, g, b] = tintedBy(0.7, true)
    expect(r).toBeGreaterThan(0.7)
    expect(r).toBeGreaterThan(g)
    expect(g).toBeGreaterThan(b)
  })

  it('can be taken at half strength, for a surface whose own reflectance is already high', () => {
    const [full] = tintedBy(1, true)
    const [half] = tintedBy(1, true, 0.5)
    expect(half).toBeLessThan(full)
    expect(half).toBeGreaterThan(1)
  })
})

describe('the noise the surfaces are built from', () => {
  it('tiles: the field is periodic over the unit square, so no seam shows', () => {
    const options = { cells: 4, octaves: 3, seed: 5 }
    for (const t of [0.13, 0.37, 0.62, 0.91]) {
      expect(fbm(t, 0, options)).toBeCloseTo(fbm(t, 1, options), 12)
      expect(fbm(0, t, options)).toBeCloseTo(fbm(1, t, options), 12)
    }
  })

  it("stays inside the unit interval, so a reflectance built from it can't run away", () => {
    const options = { cells: 3, octaves: 5, seed: 9, stretch: 6 }
    for (let i = 0; i < 400; i += 1) {
      const value = fbm((i % 20) / 20, Math.floor(i / 20) / 20, options)
      expect(value).toBeGreaterThanOrEqual(0)
      expect(value).toBeLessThanOrEqual(1)
    }
  })
})

describe('dry soil is paler and warmer, and still a reflectance multiplier', () => {
  it('leaves a watered bed alone and lifts a thirsty one, red most and blue least', () => {
    expect(driedBy([0.5, 0.5, 0.5], 0)).toEqual([0.5, 0.5, 0.5])
    const [r, g, b] = driedBy([0.5, 0.5, 0.5], 1)
    expect(r).toBeGreaterThan(g)
    expect(g).toBeGreaterThan(b)
    expect(b).toBeGreaterThan(0.5)
  })

  it('never lifts past the whole way, whatever the season reports', () => {
    expect(driedBy([0.5, 0.5, 0.5], 4)).toEqual(driedBy([0.5, 0.5, 0.5], 1))
  })
})
