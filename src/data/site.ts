import { molPerM2FromWhPerM2, PAR_FRACTION_DEFAULT } from '../sim/units'
import type { LatLon } from '../types/geo'
import type { SiteId } from '../types/ids'
import type { ExceedancePercentile, Site, SoilProfile } from '../types/site'
import type { Celsius, Millimeters } from '../types/units'
import type { WaterLimitation } from '../types/water'
import type { ClimateNormals, MeasuredYear, TmySeries } from '../types/weather'
import {
  chillAccumulation,
  dailyTemperature,
  FROST_THRESHOLDS_C,
  frostExceedanceCurve,
  heatDaysAbove,
  seasonGdd,
  type DailyTemperature,
} from './agronomy'
import { elevation, timezoneFor, utcOffsetHoursFor } from './geocode'
import { cacheKeyFor } from './http'
import {
  botanicalAreaAt,
  climateNormalsAt,
  dailyNormalsAt,
  frostNormalsAt,
  hardinessAt,
  koppenAt,
  soilAt,
} from './static-layers'
import { standardOffsetHours } from '../sim/timezone'
import { fetchWeather, preferredSourceFor } from './tmy'
import { at, DAYS_PER_YEAR, HOURS_PER_DAY, monthOfDay } from './util'
import { dailyWeatherFromTmy, et0MethodFor, referenceEt, waterLimitationOf } from './water'

export interface ResolvedSite {
  readonly site: Site
  readonly weather: TmySeries
  /** The measured years the typical one was assembled from, empty for a source that has none */
  readonly years: readonly MeasuredYear[]
}

export const DEFAULT_FROST_PERCENTILE: ExceedancePercentile = 20

/**
 * The site water-limitation index, from a FAO-56 daily balance over the TMY. An index can express
 * the gradient between Barron-Gafford's Arizona site and a temperate garden, which the boolean gate
 * of Decision Record 6 can't. That boolean is `waterLimitation.limited`
 */
export const siteWaterLimitation = (
  location: LatLon,
  elevationM: number | null,
  soil: SoilProfile,
  normals: ClimateNormals,
  weather: TmySeries,
): WaterLimitation => {
  const { method, reason } = et0MethodFor(weather)
  const days = dailyWeatherFromTmy(weather, location.latitudeDeg, elevationM)
  return waterLimitationOf({
    et0: referenceEt(days, method, reason, null),
    monthlyPrecipMm: normals.monthlyPrecipMm,
    texture: soil.textureClass,
    soilDepthM: soil.effectiveDepthM,
  })
}

export const siteCacheKey = (location: LatLon): string =>
  cacheKeyFor('open-meteo', location, 'site')

export const resolveSite = async (
  location: LatLon,
  label: string,
  signal: AbortSignal | null,
): Promise<ResolvedSite> => {
  const [elevationM, koppenCode, botanicalArea, hardiness, frost, normals, soil, record, daily] =
    await Promise.all([
      elevation(location, signal),
      koppenAt(location),
      botanicalAreaAt(location),
      hardinessAt(location),
      frostNormalsAt(location),
      climateNormalsAt(location),
      soilAt(location),
      fetchWeather({ location, source: preferredSourceFor(location), signal }),
      // the same cached answer the normals above read, for the zone it names
      dailyNormalsAt(location),
    ])
  // the zone the daily normals were aggregated in, and the nearest zone from `timezoneFor` only
  // where no upstream named one. The hourly series stays in UTC and carries the zone for its
  // readers. An answer of plain GMT for a place an hour or more off it is a request that asked for
  // UTC (an older cached body, or a stub), so `timezoneFor` is the better guess there
  const answered = daily.timezone ?? null
  const plainGmt = answered === 'GMT' || answered === 'UTC' || answered === 'Etc/UTC'
  const timezone =
    answered === null || (plainGmt && Math.abs(utcOffsetHoursFor(location)) >= 1)
      ? timezoneFor(location)
      : answered
  const utcOffsetHours = standardOffsetHours(
    timezone,
    daily.utcOffsetSeconds === null ? utcOffsetHoursFor(location) : daily.utcOffsetSeconds / 3600,
  )
  const inZone = (series: TmySeries): TmySeries => ({ ...series, timezone, utcOffsetHours })
  const weather = inZone(record.typical)
  const years = record.years.map((measured) => ({ ...measured, weather: inZone(measured.weather) }))

  const freezing = frost[0]
  if (freezing === undefined) throw new Error('no frost exceedance curve for site')

  const site: Site = {
    id: siteCacheKey(location) as SiteId,
    label,
    location,
    elevationM,
    timezone,
    utcOffsetHours,
    koppenCode,
    botanicalArea,
    hardiness,
    heatDaysAbove30C: heatDaysAbove(weather, 30 as Celsius),
    normals,
    chill: chillAccumulation(weather),
    frost,
    seasonGdd: seasonGdd(weather, freezing, DEFAULT_FROST_PERCENTILE),
    soil,
    waterLimitation: siteWaterLimitation(location, elevationM, soil, normals, weather),
  }

  return { site, weather, years }
}

const MONTHS = [...Array(12).keys()]

/**
 * The climate normals a single year would have written, from its own hours.
 *
 * The thirty-year normals are what a place is like, and these are what it was like that year, so
 * everything downstream that reads a monthly mean (the season origin, the snow cover in the PV
 * chain, the crop calendar's brightest month) sees the year rather than the average. Rain is the
 * year's own only where the source carried it. Otherwise the normals stand, because an absent
 * column says nothing about the rain, and a zero would claim a dry year
 */
const normalsOfYear = (
  base: ClimateNormals,
  weather: TmySeries,
  daily: DailyTemperature,
  year: number,
  heatDaysAbove30C: number,
): ClimateNormals => {
  const meanSum = new Array<number>(12).fill(0)
  const minSum = new Array<number>(12).fill(0)
  const maxSum = new Array<number>(12).fill(0)
  const days = new Array<number>(12).fill(0)
  for (let day = 0; day < DAYS_PER_YEAR; day += 1) {
    const month = monthOfDay(day) - 1
    meanSum[month] = at(meanSum, month) + at(daily.meanC, day)
    minSum[month] = at(minSum, month) + at(daily.minC, day)
    maxSum[month] = at(maxSum, month) + at(daily.maxC, day)
    days[month] = at(days, month) + 1
  }
  const ghiWh = new Array<number>(12).fill(0)
  const rainMm = new Array<number>(12).fill(0)
  const precip = weather.precipMm
  for (let hour = 0; hour < weather.ghiWM2.length; hour += 1) {
    const month = monthOfDay(Math.min(Math.floor(hour / HOURS_PER_DAY), DAYS_PER_YEAR - 1)) - 1
    ghiWh[month] = at(ghiWh, month) + at(weather.ghiWM2, hour)
    if (precip !== undefined) rainMm[month] = at(rainMm, month) + at(precip, hour)
  }
  const perDay = (sums: readonly number[]): Celsius[] =>
    MONTHS.map((month) => (at(sums, month) / Math.max(at(days, month), 1)) as Celsius)
  return {
    monthlyMeanTempC: perDay(meanSum),
    monthlyMinTempC: perDay(minSum),
    monthlyMaxTempC: perDay(maxSum),
    monthlyPrecipMm:
      precip === undefined
        ? base.monthlyPrecipMm
        : MONTHS.map((month) => at(rainMm, month) as Millimeters),
    monthlyMeanDliMolM2Day: MONTHS.map((month) =>
      molPerM2FromWhPerM2(at(ghiWh, month) / Math.max(at(days, month), 1), PAR_FRACTION_DEFAULT),
    ),
    heatDaysAbove30C,
    normalsPeriod: String(year),
    source: weather.source,
  }
}

/**
 * The site as it was in one measured year.
 *
 * A `Site` is a place's climate summarized into the numbers the rest of the application reads:
 * frost dates, degree-days, chill, heat days, a water index. Every one of those is computed from
 * weather, so a year's weather produces a year's site, and everything that takes a `Site` runs on
 * the year unchanged. That's the whole mechanism behind a season simulation (Decision Record
 * 14): the recommendation is this science on the typical year, a season is the same science on
 * the year that happened. The static layers (Koppen class, hardiness, botanical area, soil) are
 * the place's and stay.
 *
 * The frost curve of a single year is its own two dates at every percentile, which is what an
 * exceedance curve degenerates to with one sample, and is exactly what a season wants: the frost
 * there was
 */
export const siteForYear = (site: Site, measured: MeasuredYear): Site => {
  const { weather, year } = measured
  const daily = dailyTemperature(weather)
  const southern = site.location.latitudeDeg < 0
  const frost = FROST_THRESHOLDS_C.map((thresholdC) =>
    frostExceedanceCurve([daily.minC], thresholdC as Celsius, southern),
  )
  const freezing = frost[0]
  if (freezing === undefined) throw new Error(`no frost exceedance curve for ${String(year)}`)
  const heatDaysAbove30C = heatDaysAbove(weather, 30 as Celsius)
  const normals = normalsOfYear(site.normals, weather, daily, year, heatDaysAbove30C)
  return {
    ...site,
    heatDaysAbove30C,
    normals,
    chill: chillAccumulation(weather),
    frost,
    seasonGdd: seasonGdd(weather, freezing, DEFAULT_FROST_PERCENTILE),
    waterLimitation: siteWaterLimitation(
      site.location,
      site.elevationM,
      site.soil,
      normals,
      weather,
    ),
  }
}
