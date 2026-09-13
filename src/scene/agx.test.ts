import { describe, expect, it } from 'bun:test'
import { agxForward, agxInverse, inverse3, luminance, sceneLuminance } from './agx'
import { TONE_MAPPING_EXPOSURE } from './lighting'

/**
 * The instrument, checked before it is used to make a claim. An inverse that drifts from the
 * curve the renderer applies would let a measurement of shaded ground say whatever the drift
 * says, which is exactly the failure the measurement exists to catch.
 */

const EXPOSURE = TONE_MAPPING_EXPOSURE

describe('the AgX inverse', () => {
  it('returns the radiance the forward curve was given', () => {
    // an eight-stop spread around middle grey, which is the range the garden lives in
    for (const scene of [0.5, 1, 2, 4, 5.7, 8, 16, 32]) {
      const grey = agxInverse(agxForward([scene, scene, scene], EXPOSURE), EXPOSURE)
      for (const channel of grey) expect(channel / scene).toBeCloseTo(1, 3)
    }
  })

  it('returns it for a beam that is not neutral, which the sun never is', () => {
    const warm: readonly [number, number, number] = [6.2, 5.4, 4.1]
    const back = agxInverse(agxForward(warm, EXPOSURE), EXPOSURE)
    for (const [index, channel] of back.entries())
      expect(channel).toBeCloseTo(warm[index] as number, 2)
  })

  it('recovers a luminance ratio, which is the only quantity it is used for', () => {
    const sunlit: readonly [number, number, number] = [6.2, 5.4, 4.1]
    const shaded: readonly [number, number, number] = [0.62, 0.78, 1.1]
    const trueRatio = luminance(shaded) / luminance(sunlit)
    const measured =
      luminance(agxInverse(agxForward(shaded, EXPOSURE), EXPOSURE)) /
      luminance(agxInverse(agxForward(sunlit, EXPOSURE), EXPOSURE))
    expect(measured / trueRatio).toBeCloseTo(1, 2)
  })

  /**
   * The 8-bit quantisation the screenshot goes through is the real error term, so this is the
   * size of it: a code either way at the shaded end is well under a percent of the ratio
   */
  it('is quantisation-limited, not model-limited, on an 8-bit screenshot', () => {
    const shaded: readonly [number, number, number] = [0.62, 0.78, 1.1]
    const display = agxForward(shaded, EXPOSURE)
    const bytes = display.map((c) =>
      Math.round((c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055) * 255),
    ) as unknown as readonly [number, number, number]
    expect(sceneLuminance(bytes, EXPOSURE) / luminance(shaded)).toBeCloseTo(1, 1)
  })

  it('inverts a matrix', () => {
    const m = [
      [2, 0, 1],
      [1, 3, 2],
      [1, 1, 4],
    ] as const
    const back = inverse3(inverse3(m))
    for (const [row, values] of back.entries())
      for (const [column, value] of values.entries())
        expect(value).toBeCloseTo(m[row]?.[column] as number, 6)
  })
})
