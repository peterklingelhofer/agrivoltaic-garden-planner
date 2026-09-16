import type { Site } from '../types/site'
import type { Radians } from '../types/units'
import type { TmySeries } from '../types/weather'
import { DAYS_PER_MONTH } from './aggregate'
import { at, clamp, DEG_TO_RAD, RAD_TO_DEG } from './math'
import { spencerDeclination } from './time'
import { seriesOffsetMinutesAt } from './timezone'
import { saturationVapourPressureKpa } from './vapour'

/**
 * Which months a drawn deciduous tree is in leaf, from the Growing Season Index of Jolly, Nemani
 * and Running 2005 ("A generalized, bioclimatic index to predict foliar phenology in response to
 * climate", Global Change Biology 11(4): 619-632): three daily indicators, each running 0 to 1
 * between a floor and a ceiling, multiplied together and run through a moving mean. Four choices
 * on top of the paper's own rule are this app's: the mean is centred, ten days either side of
 * each day and wrapping past the typical year's end, so the paper's rule itself carries no added
 * lag; a calendar month counts as in leaf when the mean on its 15th day passes 0.5, because the
 * bake that reads this accumulates by month rather than by day; the day length behind the
 * photoperiod indicator is the standard sunrise-hour-angle formula on `spencerDeclination`, the
 * declination the solar geometry already carries; and a drawn tree reads the index with the
 * vapour-pressure-deficit indicator held at 1. The paper chose that indicator as a surrogate for
 * a soil water balance it could not compute, so that dry air stands for water the vegetation
 * cannot reach. A garden tree stands where the beds are watered, and on a real year at Seville
 * the full index read it bare in July and August, the months its shade matters most; the term
 * is kept in `growingSeasonIndex` for the landscape reading the paper validated
 */

// the paper's daily minimum-temperature indicator: 0 at or below the floor, 1 at or above the
// ceiling, linear between
export const GSI_TMIN_MIN_C = -2
export const GSI_TMIN_MAX_C = 5
// the paper's daily vapour-pressure-deficit indicator: 1 at or below the floor (moist air), 0 at
// or above the ceiling (dry air), linear between
export const GSI_VPD_MIN_PA = 900
export const GSI_VPD_MAX_PA = 4100
// the paper's daily photoperiod indicator: 0 at or below the floor, 1 at or above the ceiling
export const GSI_PHOTOPERIOD_MIN_H = 10
export const GSI_PHOTOPERIOD_MAX_H = 11
// the moving-average width the paper smooths the daily index with, and the threshold leaf onset
// and offset cross
export const GSI_WINDOW_DAYS = 21
export const GSI_LEAF_ON = 0.5

const DAYS_PER_YEAR = 365
const MINUTES_PER_HOUR = 60
const MINUTES_PER_DAY = MINUTES_PER_HOUR * 24
const KPA_TO_PA = 1000

const rampUp = (value: number, floor: number, ceiling: number): number =>
  clamp((value - floor) / (ceiling - floor), 0, 1)

const rampDown = (value: number, floor: number, ceiling: number): number =>
  clamp(1 - (value - floor) / (ceiling - floor), 0, 1)

/**
 * Hours of daylight at this latitude on this day of year: the standard sunrise-hour-angle
 * formula, 24 where the sun never sets that day and 0 where it never rises
 */
export const dayLengthHours = (latitudeDeg: number, dayOfYear: number): number => {
  const yearAngle = ((2 * Math.PI * (dayOfYear - 1)) / DAYS_PER_YEAR) as Radians
  const declination = spencerDeclination(yearAngle)
  const argument = -Math.tan(latitudeDeg * DEG_TO_RAD) * Math.tan(declination)
  if (argument <= -1) return 24
  if (argument >= 1) return 0
  return (2 / 15) * (Math.acos(argument) * RAD_TO_DEG)
}

interface DailyStats {
  readonly tMinC: Float64Array
  readonly tMeanC: Float64Array
  readonly dewMeanC: Float64Array
}

/**
 * One pass over the series' hours, bucketed to the local day the same way `dailyWeatherFromTmy`
 * in `src/data/water.ts` does (`seriesOffsetMinutesAt`, wrapped past the typical year's end),
 * since the two are sibling daily aggregates off the same hourly series
 */
const dailyStatsFor = (weather: TmySeries): DailyStats => {
  const hours = weather.dryBulbC.length
  const tMinC = new Float64Array(DAYS_PER_YEAR).fill(Number.POSITIVE_INFINITY)
  const tempSum = new Float64Array(DAYS_PER_YEAR)
  const dewSum = new Float64Array(DAYS_PER_YEAR)
  const counts = new Float64Array(DAYS_PER_YEAR)

  for (let hour = 0; hour < hours; hour += 1) {
    const localMinutes =
      hour * MINUTES_PER_HOUR + seriesOffsetMinutesAt(weather, at(weather.utcMillis, hour))
    const day =
      ((Math.floor(localMinutes / MINUTES_PER_DAY) % DAYS_PER_YEAR) + DAYS_PER_YEAR) % DAYS_PER_YEAR
    const temp = at(weather.dryBulbC, hour)
    tMinC[day] = Math.min(at(tMinC, day), temp)
    tempSum[day] = at(tempSum, day) + temp
    dewSum[day] = at(dewSum, day) + at(weather.dewPointC, hour)
    counts[day] = at(counts, day) + 1
  }

  const tMeanC = new Float64Array(DAYS_PER_YEAR)
  const dewMeanC = new Float64Array(DAYS_PER_YEAR)
  for (let day = 0; day < DAYS_PER_YEAR; day += 1) {
    const samples = Math.max(at(counts, day), 1)
    tMeanC[day] = at(tempSum, day) / samples
    dewMeanC[day] = at(dewSum, day) / samples
    if (!Number.isFinite(at(tMinC, day))) tMinC[day] = 0
  }
  return { tMinC, tMeanC, dewMeanC }
}

/**
 * The Growing Season Index for every local day of the typical year: the centred 21-day mean of
 * `iTmin * iVPD * iPhoto`, one value per day, wrapping past the year's end so every day gets a
 * full window. `watered` holds the deficit indicator at 1, the reading a drawn tree takes
 */
export const growingSeasonIndex = (
  weather: TmySeries,
  latitudeDeg: number,
  watered = false,
): readonly number[] => {
  const { tMinC, tMeanC, dewMeanC } = dailyStatsFor(weather)
  const daily = new Float64Array(DAYS_PER_YEAR)
  for (let day = 0; day < DAYS_PER_YEAR; day += 1) {
    const vpdPa =
      (saturationVapourPressureKpa(at(tMeanC, day)) -
        saturationVapourPressureKpa(at(dewMeanC, day))) *
      KPA_TO_PA
    const iTmin = rampUp(at(tMinC, day), GSI_TMIN_MIN_C, GSI_TMIN_MAX_C)
    const iVpd = watered ? 1 : rampDown(vpdPa, GSI_VPD_MIN_PA, GSI_VPD_MAX_PA)
    const iPhoto = rampUp(
      dayLengthHours(latitudeDeg, day + 1),
      GSI_PHOTOPERIOD_MIN_H,
      GSI_PHOTOPERIOD_MAX_H,
    )
    daily[day] = iTmin * iVpd * iPhoto
  }

  const half = (GSI_WINDOW_DAYS - 1) / 2
  const smoothed = new Array<number>(DAYS_PER_YEAR)
  for (let day = 0; day < DAYS_PER_YEAR; day += 1) {
    let sum = 0
    for (let offset = -half; offset <= half; offset += 1) {
      sum += at(daily, (((day + offset) % DAYS_PER_YEAR) + DAYS_PER_YEAR) % DAYS_PER_YEAR)
    }
    smoothed[day] = sum / GSI_WINDOW_DAYS
  }
  return smoothed
}

/**
 * Which calendar months a deciduous tree is in leaf: the averaged Growing Season Index on each
 * month's 15th day, above 0.5, read for a watered garden tree (see the file comment).
 * `src/sim/obstruction.ts` re-exports this for `treeQuads`' callers, and
 * `src/data/canopy.ts#LEAF_SEASON_INDEX` cites the paper it reads
 */
export const leafOnMonthsFor = (site: Site, weather: TmySeries): readonly boolean[] => {
  const smoothed = growingSeasonIndex(weather, site.location.latitudeDeg, true)
  const months: boolean[] = []
  let cumulativeDays = 0
  for (let month = 0; month < 12; month += 1) {
    const dayOfYear = cumulativeDays + 15
    months.push(at(smoothed, dayOfYear - 1) > GSI_LEAF_ON)
    cumulativeDays += DAYS_PER_MONTH[month] ?? 30
  }
  return months
}
