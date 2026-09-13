import { describe, expect, it } from 'bun:test'
import { clearnessIndex, cloudCover, KT_CLEAR } from './clearness'

const I0 = 1361

describe('the clearness index', () => {
  it('is the measured sun over the sun outside the atmosphere, on the same flat ground', () => {
    // sun overhead, 1000 W/m² reaching the ground of 1361 available
    expect(clearnessIndex(1000, 0, I0)).toBeCloseTo(1000 / I0, 6)
    // sun at 60 degrees zenith: half the extraterrestrial irradiance reaches a flat plane
    expect(clearnessIndex(500, 60, I0)).toBeCloseTo(500 / (I0 * 0.5), 6)
  })

  it('says nothing on the horizon or at night', () => {
    expect(clearnessIndex(30, 88, I0)).toBeNull()
    expect(clearnessIndex(0, 120, I0)).toBeNull()
    expect(clearnessIndex(500, 30, 0)).toBeNull()
  })

  it('never goes negative on a fill value', () => {
    expect(clearnessIndex(-999, 30, I0)).toBe(0)
  })
})

describe('cloud read off the clearness index', () => {
  it('is clear at the clear-sky ceiling and above, and fully clouded with no sun at all', () => {
    expect(cloudCover(KT_CLEAR)).toBe(0)
    expect(cloudCover(0.9)).toBe(0)
    expect(cloudCover(0)).toBe(1)
  })

  it('is half way at half the clear-sky sun, and nothing when the index says nothing', () => {
    expect(cloudCover(KT_CLEAR / 2)).toBeCloseTo(0.5, 6)
    expect(cloudCover(null)).toBe(0)
  })
})
