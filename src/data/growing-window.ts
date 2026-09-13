import { seasonAnchors } from '../recommend/calendar'
import type { GrowingWindow } from '../types/light'
import type { ExceedancePercentile, Site } from '../types/site'
import { at, monthOfDay, monthsInWindow } from './util'

const MONTHS_PER_YEAR = 12
const WHOLE_YEAR: GrowingWindow = { startMonth: 1, endMonth: 12 }
/**
 * The usual base of a growing-season degree-day count, and the mean a month has to reach to count
 * as warm
 */
const GROWING_MONTH_MEAN_C = 10

/** The three consecutive months with the highest mean temperature, wrapping past December */
const warmestQuarter = (monthlyMeanTempC: readonly number[]): GrowingWindow => {
  let best = 0
  let bestSum = Number.NEGATIVE_INFINITY
  for (let start = 0; start < MONTHS_PER_YEAR; start += 1) {
    const sum =
      at(monthlyMeanTempC, start) +
      at(monthlyMeanTempC, (start + 1) % MONTHS_PER_YEAR) +
      at(monthlyMeanTempC, (start + 2) % MONTHS_PER_YEAR)
    if (sum > bestSum) {
      bestSum = sum
      best = start
    }
  }
  return { startMonth: best + 1, endMonth: ((best + 2) % MONTHS_PER_YEAR) + 1 }
}

/**
 * With no frost to bound the season, the longest run of months whose mean reaches 10 C, the
 * usual base of a growing-season degree-day count: the whole year where every month does, as in
 * the tropics, and the warm half of the year at a mild temperate site. Fewer than three such
 * months falls back to the warmest quarter, as a frosted site does
 */
const warmMonths = (monthlyMeanTempC: readonly number[]): GrowingWindow => {
  const warm = monthlyMeanTempC.map((value) => value >= GROWING_MONTH_MEAN_C)
  if (warm.every(Boolean)) return WHOLE_YEAR
  let best = { start: 0, length: 0 }
  for (let start = 0; start < MONTHS_PER_YEAR; start += 1) {
    let length = 0
    while (length < MONTHS_PER_YEAR && (warm[(start + length) % MONTHS_PER_YEAR] ?? false))
      length += 1
    if (length > best.length) best = { start, length }
  }
  return best.length < 3
    ? warmestQuarter(monthlyMeanTempC)
    : {
        startMonth: best.start + 1,
        endMonth: ((best.start + best.length - 1) % MONTHS_PER_YEAR) + 1,
      }
}

/** A day of year is 1-based; `monthOfDay` counts from 0 */
const monthOf = (dayOfYear: number): number => monthOfDay(dayOfYear - 1)

/**
 * The months a garden at this site grows in: from the month of the last spring frost to the
 * month of the first autumn frost at the chosen risk, wrapping past new year south of the
 * equator. A record with no frost in it at that risk gives its warm months; a place whose
 * frost-free stretch does not reach three months gives its three warmest months, which is the
 * same rule the summer-only far north and a mountain top land on
 */
export const growingWindowFor = (site: Site, percentile: ExceedancePercentile): GrowingWindow => {
  const anchors = seasonAnchors(site, percentile)
  if (anchors.frostFree) return warmMonths(site.normals.monthlyMeanTempC)
  const window = {
    startMonth: monthOf(anchors.lastSpringFreeze),
    endMonth: monthOf(anchors.firstFallFreeze),
  }
  return monthsInWindow(window.startMonth, window.endMonth).length < 3
    ? warmestQuarter(site.normals.monthlyMeanTempC)
    : window
}
