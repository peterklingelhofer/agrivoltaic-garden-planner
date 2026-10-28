/**
 * How cloudy the sky was, read off the record.
 *
 * The clearness index is the measured global horizontal irradiance over the extraterrestrial
 * irradiance on the same horizontal plane (Liu and Jordan 1960): 1 would be no atmosphere at
 * all, a clear sky sits around 0.7 to 0.8, and overcast falls below 0.3. The scene reads the
 * cloud as how far the measured sun fell short of a clear one, which is the only cloud claim
 * the model can make, because the record is what the season ran on. It reads the fortnight
 * around the clock (`cloudOverDays`), because one hour's cloud differs from the next and a clock
 * that steps by days would flash the light
 */

import { at } from './math'

/** The clearness index of a clear sky at low air mass, the ceiling the cloud is read against */
export const KT_CLEAR = 0.75

const HOURS_PER_DAY = 24

/**
 * The days either side of the clock that the cloud is read over, 15 in all. A playback step
 * covers two to four days, so it changes at most 4/15 of the window and the light can only drift.
 * An hour's cloud would flip the key light between full and off on every step, which is a flash
 */
export const CLOUD_WINDOW_HALF_DAYS = 7

/** 0 for a clear sky, 1 for one in which the sun didn't reach the ground at all */
export const cloudCover = (kt: number): number => Math.min(1, Math.max(0, 1 - kt / KT_CLEAR))

/**
 * 0 clear to 1 overcast for the days around `dayIndex`, read as the daily clearness index of the
 * stretch: the measured sun summed over the window against the sun outside the atmosphere summed
 * over the same days. `ghiWM2` is the hourly series, indexed by hour of the year with 24 values a
 * day, and the window wraps past either end of the year. The sun outside the atmosphere comes in
 * as `extraterrestrialWhM2Day`, because it lives in `src/data`, which `src/sim` may not import.
 * A stretch with none (polar night) reads clear, because the index says nothing there
 */
export const cloudOverDays = (
  ghiWM2: ArrayLike<number>,
  extraterrestrialWhM2Day: (dayIndex: number) => number,
  dayIndex: number,
  halfWindowDays: number,
): number => {
  const days = Math.floor(ghiWM2.length / HOURS_PER_DAY)
  let measured = 0
  let available = 0
  for (let offset = -halfWindowDays; offset <= halfWindowDays; offset += 1) {
    const day = (((dayIndex + offset) % days) + days) % days
    for (let hour = 0; hour < HOURS_PER_DAY; hour += 1) {
      measured += Math.max(0, at(ghiWM2, day * HOURS_PER_DAY + hour))
    }
    available += extraterrestrialWhM2Day(day)
  }
  return available > 0 ? cloudCover(measured / available) : 0
}
