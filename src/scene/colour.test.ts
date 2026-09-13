import { describe, expect, it } from 'bun:test'
import { DataUtils, LinearFilter, NearestFilter, SRGBColorSpace } from 'three'
import {
  CONTOUR_LINE_FACTOR,
  contourStep,
  contourValues,
  rgbCss,
  viridis,
  type Rgb,
} from '../state/colormap'
import { contourUniforms, fieldTexture, viridisRamp } from './overlayMaterial'
import { meters } from '../types/units'
import type { GridSpec } from '../types/geo'

/**
 * The overlay is simulation output, so it has to arrive on screen as the colour the legend
 * beside it advertises. Three things make that true, and each is pinned here:
 *
 * 1. the ramp texture is tagged sRGB, so the GPU decodes it to the linear working space
 * 2. the overlay's shader applies no tone curve, only `colorspace_fragment`
 * 3. the renderer's output transfer function re-encodes it, closing the round trip
 *
 * The model of the pipeline below is not decoration: without (1) the render is still a valid
 * image, just the wrong colours, and only a numeric check catches that. The self-test at the
 * end proves this check can fail.
 */

/** The sRGB EOTF, which `sRGB8_ALPHA8` sampling applies in hardware for a tagged texture */
const decode = (byte: number): number => {
  const c = byte / 255
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
}

/** `colorspace_fragment`, the renderer's output transfer function for SRGBColorSpace */
const encode = (linear: number): number => {
  const c = linear <= 0.0031308 ? linear * 12.92 : 1.055 * linear ** (1 / 2.4) - 0.055
  return Math.round(c * 255)
}

/** Untagged: the byte is handed to the shader as if it were already linear */
const asLinear = (byte: number): number => byte / 255

const pipeline = (texel: Rgb, tagged: boolean): Rgb => {
  const sample = tagged ? decode : asLinear
  return [encode(sample(texel[0])), encode(sample(texel[1])), encode(sample(texel[2]))]
}

const GRID: GridSpec = {
  extent: { minXM: meters(0), minYM: meters(0), maxXM: meters(3), maxYM: meters(1) },
  cellSizeM: meters(1),
  cols: 3,
  rows: 1,
}

/** How far a rendered colour sits from the nearest colour the legend can name */
const distanceToRamp = (colour: Rgb): number =>
  Math.min(
    ...Array.from({ length: 257 }, (_, i) => {
      const stop = viridis(i / 256)
      return Math.hypot(...([0, 1, 2] as const).map((c) => colour[c] - stop[c]))
    }),
  )

const texelAt = (data: Uint8Array, index: number): Rgb => [
  data[index * 4] ?? 0,
  data[index * 4 + 1] ?? 0,
  data[index * 4 + 2] ?? 0,
]

describe('the ramp the GPU reads', () => {
  it('tags it sRGB, which is the colour space viridis is uniform in', () => {
    expect(viridisRamp().colorSpace).toBe(SRGBColorSpace)
  })

  it('holds the same bytes the legend gradient is built from', () => {
    const data = viridisRamp().image.data as Uint8Array
    for (const t of [0, 0.25, 0.5, 0.75, 1]) {
      expect(texelAt(data, Math.round(t * 255))).toEqual(viridis(t))
    }
  })

  /**
   * Nearest, not linear. A filtered ramp returns blends of two entries, and a blend of two
   * perceptually uniform colours is not one: it is a colour the legend beside it does not have
   */
  it('is sampled without filtering, so no pixel is a colour between two ramp entries', () => {
    expect(viridisRamp().magFilter).toBe(NearestFilter)
    expect(viridisRamp().minFilter).toBe(NearestFilter)
  })
})

describe('the field the GPU reads', () => {
  it('normalises to the legend range, so the ramp lookup is the legend lookup', () => {
    const texture = fieldTexture(new Float32Array([0, 5, 10]), GRID, 0, 10)
    const data = texture.image.data as Uint16Array
    expect([...data].map((half) => DataUtils.fromHalfFloat(half))).toEqual([0, 0.5, 1])
    texture.dispose()
  })

  it('interpolates the quantity rather than the colour, which is why it is filtered', () => {
    const texture = fieldTexture(new Float32Array([0, 5, 10]), GRID, 0, 10)
    expect(texture.magFilter).toBe(LinearFilter)
    texture.dispose()
  })

  it('draws a cell with no value at the bottom of the ramp rather than the middle', () => {
    const texture = fieldTexture(new Float32Array([Number.NaN, 5, 10]), GRID, 0, 10)
    const data = texture.image.data as Uint16Array
    expect(DataUtils.fromHalfFloat(data[0] ?? 0)).toBe(0)
    texture.dispose()
  })
})

describe('iso-contours', () => {
  it('picks an interval a reader can add up, and enough of them to read a gradient by', () => {
    expect(contourStep(0, 39.4)).toBe(5)
    expect(contourStep(0, 1)).toBeCloseTo(0.2, 10)
    expect(contourStep(0.3, 1)).toBeCloseTo(0.1, 10)
    expect(contourStep(0, 12)).toBe(2)
  })

  it('has no interval for a field with no range, where every line would sit on the last', () => {
    expect(contourStep(4, 4)).toBe(0)
    expect(contourValues(4, 4)).toEqual([])
    expect(contourStep(0, Number.NaN)).toBe(0)
  })

  it('draws every line at a multiple of the interval, inside the range and nowhere else', () => {
    expect(contourValues(0, 39.4)).toEqual([5, 10, 15, 20, 25, 30, 35])
    for (const value of contourValues(11, 47)) expect(value % contourStep(11, 47)).toBeCloseTo(0, 9)
  })

  /**
   * The shader draws a line wherever `t * contourScale + contourOffset` reaches a whole number,
   * so this is the join between the lines on the ground and the numbers on the legend: every
   * value the legend prints has to be a whole number of intervals, whatever the range
   */
  it('puts a whole interval at exactly the values the legend prints beside the ramp', () => {
    for (const [min, max] of [
      [0, 39.4],
      [11, 47],
      [0.3, 1],
    ] as const) {
      const { contourScale, contourOffset } = contourUniforms(min, max)
      for (const value of contourValues(min, max)) {
        const steps = ((value - min) / (max - min)) * contourScale + contourOffset
        expect(steps - Math.round(steps)).toBeCloseTo(0, 9)
      }
    }
  })

  it('leaves no interval for the shader to count when the field has no range', () => {
    expect(contourUniforms(4, 4)).toEqual({ contourScale: 0, contourOffset: 0 })
  })

  /**
   * A line is a multiple of the ramp colour under it, and a multiple of a perceptually uniform
   * ramp entry is not another entry: `e2e/overlay-colour.spec.ts` finds these colours in the
   * rendered pixels, and this is why finding one is unambiguous
   */
  it('draws the line in a colour the ramp has not got, so it cannot read as a lower value', () => {
    for (let i = 0; i <= 32; i += 1) {
      const line = viridis(i / 32).map((byte) =>
        encode(decode(byte) * CONTOUR_LINE_FACTOR),
      ) as unknown as Rgb
      expect(distanceToRamp(line)).toBeGreaterThan(20)
    }
  })
})

describe('the overlay colour survives the renderer', () => {
  it('returns every ramp stop unchanged, so the overlay matches its legend', () => {
    for (let i = 0; i <= 32; i += 1) {
      const stop = viridis(i / 32)
      const rendered = pipeline(stop, true)
      // an 8-bit round trip through a float working space, so one code of slack
      for (const channel of [0, 1, 2] as const) {
        expect(Math.abs(rendered[channel] - stop[channel])).toBeLessThanOrEqual(1)
      }
    }
  })

  it('agrees with the CSS the legend renders for the same value', () => {
    for (const t of [0, 0.25, 0.5, 0.75, 1]) {
      expect(rgbCss(pipeline(viridis(t), true))).toBe(rgbCss(viridis(t)))
    }
  })

  /**
   * The self-test, proving the check above can fail. This is what the overlay would look like
   * if the sRGB decode were ever lost, and the failure is not subtle: the midpoint leaves as
   * rgb(31 158 137) and lands somewhere that is not on the ramp at all
   */
  it('is visibly wrong without the sRGB decode, which is what makes the check worth having', () => {
    const midpoint = viridis(0.5)
    const untagged = pipeline(midpoint, false)
    expect(untagged).not.toEqual(midpoint)
    const drift = Math.max(...([0, 1, 2] as const).map((c) => untagged[c] - midpoint[c]))
    expect(drift).toBeGreaterThan(50)
    // and it is not merely a brighter version of the right colour: it leaves the ramp
    expect(distanceToRamp(untagged)).toBeGreaterThan(30)
  })
})
