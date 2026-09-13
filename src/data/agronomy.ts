import type {
  ChillAccumulation,
  ExceedancePercentile,
  FrostExceedanceCurve,
  SeasonGdd,
} from '../types/site'
import type {
  Celsius,
  ChillHours,
  ChillPortions,
  DayOfYear,
  Days,
  DegreeDaysC,
  UtahChillUnits,
} from '../types/units'
import type { TmySeries } from '../types/weather'
import { at, DAYS_PER_YEAR, HOURS_PER_DAY, mean } from './util'

export const EXCEEDANCE_PERCENTILES: readonly ExceedancePercentile[] = [10, 20, 30, 40, 50]

export const FROST_THRESHOLDS_C: readonly number[] = [0, -2.2]

export interface DailyTemperature {
  readonly minC: Float32Array
  readonly maxC: Float32Array
  readonly meanC: Float32Array
}

export const dailyTemperature = (weather: TmySeries): DailyTemperature => {
  const minC = new Float32Array(DAYS_PER_YEAR).fill(Number.POSITIVE_INFINITY)
  const maxC = new Float32Array(DAYS_PER_YEAR).fill(Number.NEGATIVE_INFINITY)
  const meanC = new Float32Array(DAYS_PER_YEAR)
  for (let hour = 0; hour < weather.dryBulbC.length; hour += 1) {
    const day = Math.min(Math.floor(hour / HOURS_PER_DAY), DAYS_PER_YEAR - 1)
    const value = at(weather.dryBulbC, hour)
    if (value < at(minC, day)) minC[day] = value
    if (value > at(maxC, day)) maxC[day] = value
    meanC[day] = at(meanC, day) + value / HOURS_PER_DAY
  }
  return { minC, maxC, meanC }
}

export const gddDay = (
  minC: Celsius,
  maxC: Celsius,
  baseC: Celsius,
  upperCutoffC: Celsius | null,
): DegreeDaysC => {
  const cappedMax = upperCutoffC === null ? maxC : Math.min(maxC, upperCutoffC)
  const clippedMin = Math.max(minC, baseC)
  const clippedMax = Math.max(cappedMax, baseC)
  return Math.max((clippedMin + clippedMax) / 2 - baseC, 0) as DegreeDaysC
}

export const accumulatedGddCurve = (
  weather: TmySeries,
  baseC: Celsius,
  upperCutoffC: Celsius | null,
): Float32Array => {
  const daily = dailyTemperature(weather)
  const curve = new Float32Array(DAYS_PER_YEAR)
  let total = 0
  for (let day = 0; day < DAYS_PER_YEAR; day += 1) {
    total += gddDay(
      at(daily.minC, day) as Celsius,
      at(daily.maxC, day) as Celsius,
      baseC,
      upperCutoffC,
    )
    curve[day] = total
  }
  return curve
}

/** Wrap-aware: a southern-hemisphere season runs from spring in one year to autumn in the next */
const between = (curve: Float32Array, startDay: number, endDay: number): number => {
  const from = at(curve, Math.max(startDay, 1) - 1)
  const to = at(curve, Math.min(endDay, DAYS_PER_YEAR) - 1)
  const total = at(curve, DAYS_PER_YEAR - 1)
  return Math.max(endDay >= startDay ? to - from : total - from + to, 0)
}

export const seasonGdd = (
  weather: TmySeries,
  frost: FrostExceedanceCurve,
  percentile: ExceedancePercentile,
): SeasonGdd => {
  const start = frost.lastSpringFreeze[percentile]
  const end = frost.firstFallFreeze[percentile]
  return {
    base4C: between(accumulatedGddCurve(weather, 4.4 as Celsius, null), start, end) as DegreeDaysC,
    base10C: between(
      accumulatedGddCurve(weather, 10 as Celsius, 30 as Celsius),
      start,
      end,
    ) as DegreeDaysC,
    percentile,
  }
}

export const dayGddCrosses = (
  curve: Float32Array,
  startDay: DayOfYear,
  requirement: DegreeDaysC,
): DayOfYear | null => {
  const baseline = at(curve, Math.max(startDay, 1) - 1)
  for (let day: number = startDay; day <= DAYS_PER_YEAR; day += 1) {
    if (at(curve, day - 1) - baseline >= requirement) return day as DayOfYear
  }
  return null
}

export const chillingHours = (hourlyTempC: Float32Array): number => {
  let total = 0
  for (let index = 0; index < hourlyTempC.length; index += 1) {
    const temperature = at(hourlyTempC, index)
    if (temperature >= 0 && temperature <= 7.2) total += 1
  }
  return total
}

/** Richardson, Seeley and Walker 1974 (HortScience 9:331-332), the Utah model's bands */
const utahWeight = (temperature: number): number => {
  if (temperature <= 1.4) return 0
  if (temperature <= 2.4) return 0.5
  if (temperature <= 9.1) return 1
  if (temperature <= 12.4) return 0.5
  if (temperature <= 15.9) return 0
  if (temperature <= 18) return -0.5
  return -1
}

export const utahChillUnits = (hourlyTempC: Float32Array): number => {
  let total = 0
  for (let index = 0; index < hourlyTempC.length; index += 1) {
    total += utahWeight(at(hourlyTempC, index))
  }
  return total
}

/**
 * The Dynamic model's constants, as fitted for peach by Fishman, Erez and Couvillon 1987
 * (J. Theor. Biol. 126:309-321) and restated by Erez, Fishman, Linsley-Noakes and Allan 1990
 * (Acta Hortic. 276:165-174). Rates are per hour and the energies are E/R, in kelvin
 */
const DYNAMIC = {
  /** activation energy of precursor formation */
  E0: 4153.5,
  /** activation energy of precursor destruction */
  E1: 12888.8,
  /** pre-exponential factor of formation */
  A0: 139500,
  /** pre-exponential factor of destruction */
  A1: 2.567e18,
  /** slope of the cooperative transition at its midpoint */
  SLOPE: 1.6,
  /** midpoint temperature of that transition */
  THETA_M: 277,
} as const

/**
 * The Dynamic model of Fishman, Erez and Couvillon 1987 (J. Theor. Biol. 124:473-483).
 *
 * Chill is a two-step process. Cold forms a thermally labile precursor at an Arrhenius rate
 * k0 = A0 exp(-E0/T) and warmth destroys it at k1 = A1 exp(-E1/T), so over one hour at
 * temperature T the precursor x relaxes toward its steady state xs = k0/k1:
 * x' = xs - (xs - x) exp(-k1). When x reaches the critical level, 1 on the model's scale, a
 * fraction of it moves irreversibly into a stable product. That fraction is the equilibrium of
 * a two-state cooperative transition, K/(1 + K) with ln K = slope * theta_m * (T - theta_m) / T,
 * and the sum of what moves over is the season's Chill Portions.
 *
 * Never convert the result to Chilling Hours or Utah units: Luedeling & Brown 2011 measured
 * CH/CP spanning 0-34 across global sites
 */
export const dynamicChillPortions = (hourlyTempC: Float32Array): number => {
  const { A0, A1, E0, E1, SLOPE, THETA_M } = DYNAMIC
  const steadyStateScale = A0 / A1
  const energyGap = E1 - E0
  let precursor = 0
  let portions = 0
  // the first hour sets the initial state; each later hour relaxes it
  for (let index = 1; index < hourlyTempC.length; index += 1) {
    const kelvin = at(hourlyTempC, index) + 273
    const steadyState = steadyStateScale * Math.exp(energyGap / kelvin)
    const destruction = A1 * Math.exp(-E1 / kelvin)
    const transition = Math.exp((SLOPE * THETA_M * (kelvin - THETA_M)) / kelvin)
    const fraction = transition / (1 + transition)
    precursor = steadyState - (steadyState - precursor) * Math.exp(-destruction)
    if (precursor >= 1) {
      const portion = precursor * fraction
      portions += portion
      precursor -= portion
    }
  }
  return portions
}

export const isNorthernHemisphere = (weather: TmySeries): boolean => {
  const daily = dailyTemperature(weather)
  const slice = (from: number, to: number): number[] => {
    const values: number[] = []
    for (let day = from; day < to; day += 1) values.push(at(daily.meanC, day))
    return values
  }
  const boreal = mean([...slice(151, 243)])
  const austral = mean([...slice(0, 59), ...slice(334, DAYS_PER_YEAR)])
  return boreal >= austral
}

export const CHILL_SEASON_NORTH = { start: 305 as DayOfYear, end: 59 as DayOfYear }
export const CHILL_SEASON_SOUTH = { start: 121 as DayOfYear, end: 243 as DayOfYear }

const hoursBetween = (weather: TmySeries, startDay: number, endDay: number): Float32Array => {
  const wraps = endDay < startDay
  const length = wraps
    ? (DAYS_PER_YEAR - startDay + 1 + endDay) * HOURS_PER_DAY
    : (endDay - startDay + 1) * HOURS_PER_DAY
  const out = new Float32Array(length)
  let cursor = 0
  const push = (fromDay: number, toDay: number): void => {
    for (let day = fromDay; day <= toDay; day += 1) {
      for (let hour = 0; hour < HOURS_PER_DAY; hour += 1) {
        out[cursor] = at(weather.dryBulbC, (day - 1) * HOURS_PER_DAY + hour)
        cursor += 1
      }
    }
  }
  if (wraps) {
    push(startDay, DAYS_PER_YEAR)
    push(1, endDay)
  } else {
    push(startDay, endDay)
  }
  return out.subarray(0, cursor)
}

export const chillAccumulation = (weather: TmySeries): ChillAccumulation => {
  const season = isNorthernHemisphere(weather) ? CHILL_SEASON_NORTH : CHILL_SEASON_SOUTH
  const hourly = hoursBetween(weather, season.start, season.end)
  return {
    chillingHours: chillingHours(hourly) as ChillHours,
    utahChillUnits: utahChillUnits(hourly) as UtahChillUnits,
    dynamicChillPortions: dynamicChillPortions(hourly) as ChillPortions,
    seasonStart: season.start,
    seasonEnd: season.end,
  }
}

export const heatDaysAbove = (weather: TmySeries, thresholdC: Celsius): number => {
  const daily = dailyTemperature(weather)
  let count = 0
  for (let day = 0; day < DAYS_PER_YEAR; day += 1) {
    if (at(daily.maxC, day) >= thresholdC) count += 1
  }
  return count
}

/** One year's last spring or first autumn frost, or the half-year's sentinel day when it had none */
interface FrostDay {
  readonly day: number
  readonly frost: boolean
}

/**
 * Empirical exceedance curve from a stack of yearly daily-minimum series.
 * `years[y][d]` is the daily minimum for day d of year y. South of the equator
 * the year is read rotated by half a turn so that winter sits at the boundary
 * and the spring and autumn freezes keep their seasonal meaning
 *
 * A half-year with no frost keeps its sentinel, the first or last day of the rotated year, so
 * the pick has a day number to sort on; a percentile whose pick lands on both sentinels is
 * marked `frostFree` rather than read as a frost on those two days
 */
export const frostExceedanceCurve = (
  years: readonly Float32Array[],
  thresholdC: Celsius,
  southernHemisphere = false,
): FrostExceedanceCurve => {
  const midYear = Math.floor(DAYS_PER_YEAR / 2)
  const shift = southernHemisphere ? midYear : 0
  const dayOf = (index: number): number => ((index + shift) % DAYS_PER_YEAR) + 1
  const springs: FrostDay[] = []
  const falls: FrostDay[] = []
  let frostYears = 0
  for (const year of years) {
    let lastSpring: FrostDay = { day: dayOf(0), frost: false }
    let firstFall: FrostDay = { day: dayOf(DAYS_PER_YEAR - 1), frost: false }
    for (let index = 0; index < midYear; index += 1) {
      if (at(year, (index + shift) % DAYS_PER_YEAR) <= thresholdC)
        lastSpring = { day: dayOf(index), frost: true }
    }
    for (let index = DAYS_PER_YEAR - 1; index >= midYear; index -= 1) {
      if (at(year, (index + shift) % DAYS_PER_YEAR) <= thresholdC)
        firstFall = { day: dayOf(index), frost: true }
    }
    if (lastSpring.frost || firstFall.frost) frostYears += 1
    springs.push(lastSpring)
    falls.push(firstFall)
  }
  // a sentinel is the earliest spring and the latest autumn, before and after a frost on its day
  springs.sort((a, b) => a.day - b.day || Number(a.frost) - Number(b.frost))
  falls.sort((a, b) => a.day - b.day || Number(b.frost) - Number(a.frost))

  const pick = (sorted: readonly FrostDay[], quantile: number): FrostDay | undefined =>
    sorted[Math.min(sorted.length - 1, Math.max(0, Math.round(quantile * (sorted.length - 1))))]

  const spring = {} as Record<ExceedancePercentile, DayOfYear>
  const fall = {} as Record<ExceedancePercentile, DayOfYear>
  const frostFree = {} as Record<ExceedancePercentile, Days>
  const noFrost = {} as Record<ExceedancePercentile, boolean>
  for (const percentile of EXCEEDANCE_PERCENTILES) {
    // a 10 % exceedance date is late in spring and early in fall: the conservative pair
    const conservative = 1 - percentile / 100
    const springDay = pick(springs, conservative)
    const fallDay = pick(falls, 1 - conservative)
    const free =
      springDay !== undefined && fallDay !== undefined && !springDay.frost && !fallDay.frost
    spring[percentile] = (springDay?.day ?? 0) as DayOfYear
    fall[percentile] = (fallDay?.day ?? 0) as DayOfYear
    noFrost[percentile] = free
    frostFree[percentile] = (
      free
        ? DAYS_PER_YEAR
        : ((((fallDay?.day ?? 0) - (springDay?.day ?? 0)) % DAYS_PER_YEAR) + DAYS_PER_YEAR) %
          DAYS_PER_YEAR
    ) as Days
  }
  return {
    thresholdC,
    lastSpringFreeze: spring,
    firstFallFreeze: fall,
    frostFreeDays: frostFree,
    frostFree: noFrost,
    frostYears,
  }
}
