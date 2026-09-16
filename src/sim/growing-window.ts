import type { GrowingWindow } from '../types/light'
import type { ExceedancePercentile, Site } from '../types/site'
import { DAYS_PER_MONTH, monthsInWindow } from './aggregate'

const MONTHS_PER_YEAR = 12
/**
 * The usual base of a growing-season degree-day count, and the mean a month has to reach to count
 * as warm
 */
const GROWING_MONTH_MEAN_C = 10
const DAYS_PER_YEAR = 365
const WHOLE_YEAR: GrowingWindow = { startMonth: 1, endMonth: 12 }

/** A day of year is 1-based, and `monthOfDay` counts from 0 */
const monthOfDay = (day: number): number => {
  let cumulative = 0
  for (let month = 0; month < MONTHS_PER_YEAR; month += 1) {
    cumulative += DAYS_PER_MONTH[month] ?? 30
    if (day < cumulative) return month + 1
  }
  return MONTHS_PER_YEAR
}

/** The three consecutive months with the highest mean temperature, wrapping past December */
const warmestQuarter = (monthlyMeanTempC: readonly number[]): GrowingWindow => {
  let best = 0
  let bestSum = Number.NEGATIVE_INFINITY
  for (let start = 0; start < MONTHS_PER_YEAR; start += 1) {
    const sum =
      (monthlyMeanTempC[start] ?? 0) +
      (monthlyMeanTempC[(start + 1) % MONTHS_PER_YEAR] ?? 0) +
      (monthlyMeanTempC[(start + 2) % MONTHS_PER_YEAR] ?? 0)
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
    while (length < MONTHS_PER_YEAR && (warm[(start + length) % MONTHS_PER_YEAR] ?? false)) {
      length += 1
    }
    if (length > best.length) best = { start, length }
  }
  return best.length < 3
    ? warmestQuarter(monthlyMeanTempC)
    : {
        startMonth: best.start + 1,
        endMonth: ((best.start + best.length - 1) % MONTHS_PER_YEAR) + 1,
      }
}

/**
 * The months a garden at this site grows in: from the month of the last spring frost to the
 * month of the first autumn frost at the chosen risk, wrapping past new year south of the
 * equator. A record with no frost in it at that risk gives its warm months. A place whose
 * frost-free stretch doesn't reach three months gives its three warmest months, which is the
 * same rule the summer-only far north and a mountain top land on.
 *
 * Reads the frost curve directly rather than through `seasonAnchors` in
 * `src/recommend/calendar.ts`: this is `src/sim`, which may import only `src/types` (and other
 * `src/sim` modules), never `src/recommend` (`docs/ARCHITECTURE.md`, `biome.jsonc`'s
 * `noRestrictedImports`, enforced again by `src/sim/boundary.test.ts`). The two give the same
 * anchors for a bounded season; `seasonAnchors`' extra `origin` anchor exists only for the
 * frost-free case, where this function already takes the `warmMonths` branch instead.
 *
 * The one definition: `src/data/growing-window.ts` re-exports this unchanged for the recommender
 * and the state layer. A drawn deciduous tree's leaf-on months no longer read this: they follow
 * the Growing Season Index instead, off the site's own weather rather than its frost record
 * (`src/sim/phenology.ts`, Decision Record 26)
 */
export const growingWindowFor = (site: Site, percentile: ExceedancePercentile): GrowingWindow => {
  const curve = site.frost[0]
  const frostFree = curve?.frostFree[percentile] ?? false
  if (frostFree) return warmMonths(site.normals.monthlyMeanTempC)
  const window: GrowingWindow = {
    startMonth: monthOfDay((curve?.lastSpringFreeze[percentile] ?? 1) - 1),
    endMonth: monthOfDay((curve?.firstFallFreeze[percentile] ?? DAYS_PER_YEAR) - 1),
  }
  return monthsInWindow(window).length < 3 ? warmestQuarter(site.normals.monthlyMeanTempC) : window
}
