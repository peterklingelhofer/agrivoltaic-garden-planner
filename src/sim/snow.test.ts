import { describe, expect, it } from 'bun:test'
import { groundSnowCover, snowCoverSeries } from './snow'

/**
 * The same monthly-normals weighting that draws the winter ground, also read by the PV chain. That
 * is why these matter: it is more than a picture
 */
describe('how covered the winter ground is', () => {
  const COLD_WET = [-6, -5, 0, 6, 12, 17, 20, 19, 15, 9, 3, -3]
  const WET = Array.from({ length: 12 }, () => 60)

  it('covers a cold wet month and leaves a warm one bare', () => {
    expect(groundSnowCover(COLD_WET, WET, 15)).toBeGreaterThan(0.9)
    expect(groundSnowCover(COLD_WET, WET, 196)).toBe(0)
  })

  it('crosses the seasons rather than stepping between months', () => {
    const march = groundSnowCover(COLD_WET, WET, 70)
    const april = groundSnowCover(COLD_WET, WET, 105)
    expect(march).toBeGreaterThan(april)
    // and it is continuous: a day either side of a month boundary is a small step, not a jump
    expect(
      Math.abs(groundSnowCover(COLD_WET, WET, 59) - groundSnowCover(COLD_WET, WET, 61)),
    ).toBeLessThan(0.1)
  })

  it('leaves a cold DRY winter bare, because there is nothing to lie there', () => {
    const dry = Array.from({ length: 12 }, () => 6)
    expect(groundSnowCover(COLD_WET, dry, 15)).toBe(0)
  })

  it('draws summer, not a snowfield, when the site has no normals to read', () => {
    expect(groundSnowCover([], [], 15)).toBe(0)
    expect(groundSnowCover([1, 2], [3, 4], 15)).toBe(0)
  })
})

describe('the hourly series the chain reads', () => {
  const COLD_WET = [-6, -5, 0, 6, 12, 17, 20, 19, 15, 9, 3, -3]
  const WET = Array.from({ length: 12 }, () => 60)
  const normals = {
    monthlyMeanTempC: COLD_WET,
    monthlyPrecipMm: WET,
  } as never

  const hours = (count: number): Float64Array => {
    const utcMillis = new Float64Array(count)
    const start = Date.UTC(2021, 0, 1)
    for (let i = 0; i < count; i += 1) utcMillis[i] = start + i * 3_600_000
    return utcMillis
  }

  it('is one value per hour, on the weather timestamps it is given', () => {
    expect(snowCoverSeries(normals, hours(8760)).length).toBe(8760)
  })

  it('is white in January and bare in July, at the same site', () => {
    const cover = snowCoverSeries(normals, hours(8760))
    expect(cover[24 * 14] as number).toBeGreaterThan(0.9)
    expect(cover[24 * 195] as number).toBe(0)
  })

  /**
   * Deep winter and high summer both saturate, so the day this checks is a thawing one in
   * March: the flat stretch has to be a day wide and no wider, and a series that recomputed per
   * hour or cached per year would fail on one side or the other
   */
  it('holds one value across a whole day and moves to the next, on a day that is moving', () => {
    const cover = snowCoverSeries(normals, hours(8760))
    const noon = 24 * 69 + 12
    for (let i = 24 * 69; i < 24 * 70; i += 1) expect(cover[i], String(i)).toBe(cover[noon])
    expect(cover[24 * 70]).not.toBe(cover[noon])
  })
})
