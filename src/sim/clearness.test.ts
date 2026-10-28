import { describe, expect, it } from 'bun:test'
import { CLOUD_WINDOW_HALF_DAYS, cloudCover, cloudOverDays, KT_CLEAR } from './clearness'

describe('cloud read off the clearness index', () => {
  it('is clear at the clear-sky ceiling and above, and fully clouded with no sun at all', () => {
    expect(cloudCover(KT_CLEAR)).toBe(0)
    expect(cloudCover(0.9)).toBe(0)
    expect(cloudCover(0)).toBe(1)
  })

  it('is half way at half the clear-sky sun', () => {
    expect(cloudCover(KT_CLEAR / 2)).toBeCloseTo(0.5, 6)
  })
})

const DAYS = 365
const OUTSIDE_WH_M2_DAY = 10_000
const outside = (): number => OUTSIDE_WH_M2_DAY
const CLEAR_WH_M2_DAY = KT_CLEAR * OUTSIDE_WH_M2_DAY

/** A year in which each day delivers `whM2(day)`, spread over twelve even hours of its 24 */
const yearOf = (whM2: (day: number) => number): Float64Array => {
  const ghiWM2 = new Float64Array(DAYS * 24)
  for (let day = 0; day < DAYS; day += 1) {
    for (let hour = 6; hour < 18; hour += 1) ghiWM2[day * 24 + hour] = whM2(day) / 12
  }
  return ghiWM2
}

describe('cloud read over the days around the clock', () => {
  it('reads clear days as clear, and a third of that sun as two thirds clouded', () => {
    const clear = yearOf(() => CLEAR_WH_M2_DAY)
    const dim = clear.map((value) => value / 3)
    // the first and last days take their windows from the other end of the year
    for (const day of [0, 180, 364]) {
      expect(cloudOverDays(clear, outside, day, CLOUD_WINDOW_HALF_DAYS)).toBeCloseTo(0, 6)
      expect(cloudOverDays(dim, outside, day, CLOUD_WINDOW_HALF_DAYS)).toBeCloseTo(2 / 3, 6)
    }
  })

  it('moves by one day of the window at most when the clock moves one day', () => {
    // the worst case: twenty fully dark days, then twenty clear ones, through the whole year
    const worst = yearOf((day) => (Math.floor(day / 20) % 2 === 0 ? 0 : CLEAR_WH_M2_DAY))
    const cloudOn = (day: number): number =>
      cloudOverDays(worst, outside, day, CLOUD_WINDOW_HALF_DAYS)
    let steepest = 0
    for (let day = 0; day < DAYS; day += 1) {
      steepest = Math.max(steepest, Math.abs(cloudOn(day + 1) - cloudOn(day)))
    }
    const oneDay = 1 / (2 * CLOUD_WINDOW_HALF_DAYS + 1)
    expect(steepest).toBeLessThanOrEqual(oneDay + 1e-9)
    // and the swing reaches that step exactly, so the bound is met
    expect(steepest).toBeCloseTo(oneDay, 6)
  })

  it('says nothing where no sun reaches the top of the atmosphere', () => {
    const none = (): number => 0
    expect(cloudOverDays(yearOf(none), none, 10, CLOUD_WINDOW_HALF_DAYS)).toBe(0)
  })
})
