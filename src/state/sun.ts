import { getPosition, getTimes } from 'suncalc'
import { spaPosition } from '../sim/solar'
import type { LatLon } from '../types/geo'
import {
  celsius,
  meters,
  millibars,
  type DayOfYear,
  type EpochMillis,
  type Meters,
} from '../types/units'
import { attempt } from './safe'

/** The app's own clock is the reference day, so the sun, the scene and the agenda agree */
export const dayOfYearUtc = (millis: number): DayOfYear => {
  const start = Date.UTC(new Date(millis).getUTCFullYear(), 0, 1)
  return (Math.floor((millis - start) / 86_400_000) + 1) as DayOfYear
}

/**
 * The same day and hour, in another calendar year: what the scene's clock does when a season is
 * run on a year that happened (Decision Record 14.1).
 *
 * The day is kept and only the year moves, because the season being simulated is a whole year
 * and the grower is looking at whatever moment of it they had scrubbed to. February 29 in a year
 * that has no February 29 becomes March 1, which is `setUTCFullYear`'s own rounding and is the
 * right one: there was no such day in that year to draw
 */
export const atCalendarYear = (millis: EpochMillis, year: number): EpochMillis => {
  const moved = new Date(millis)
  moved.setUTCFullYear(year)
  return moved.getTime() as EpochMillis
}

/** The same year and the same hour, on another day of it. The sun scrubber's own arithmetic */
export const atDayOfYear = (millis: EpochMillis, day: number): EpochMillis => {
  const date = new Date(millis)
  const minutes = date.getUTCHours() * 60 + date.getUTCMinutes()
  return (Date.UTC(date.getUTCFullYear(), 0, 1) +
    (day - 1) * 86_400_000 +
    minutes * 60_000) as EpochMillis
}

export type SunSource = 'nrel-spa' | 'suncalc-fallback'

export interface SunState {
  readonly elevationDeg: number
  readonly apparentElevationDeg: number
  readonly azimuthDeg: number
  readonly x: number
  readonly y: number
  readonly z: number
  readonly daylight: boolean
  readonly source: SunSource
  readonly note: string | null
}

const DEG = Math.PI / 180

// Single source of truth: sky, shadows and the DLI overlay all read this vector.
// x east, y up, z south, matching the scene basis in geom.ts
export const sunVector = (
  elevationDeg: number,
  azimuthDeg: number,
): readonly [number, number, number] => {
  const el = elevationDeg * DEG
  const az = azimuthDeg * DEG
  return [Math.cos(el) * Math.sin(az), Math.sin(el), -Math.cos(el) * Math.cos(az)]
}

const fromAngles = (
  elevationDeg: number,
  apparentElevationDeg: number,
  azimuthDeg: number,
  source: SunSource,
  note: string | null,
): SunState => {
  const [x, y, z] = sunVector(elevationDeg, azimuthDeg)
  return {
    elevationDeg,
    apparentElevationDeg,
    azimuthDeg: ((azimuthDeg % 360) + 360) % 360,
    x,
    y,
    z,
    daylight: apparentElevationDeg > 0,
    source,
    note,
  }
}

export const sunAt = (
  location: LatLon,
  utcMillis: EpochMillis,
  elevationM: Meters = meters(0),
): SunState => {
  const spa = attempt(() =>
    spaPosition(utcMillis, {
      location,
      elevationM,
      pressureMb: millibars(1013.25),
      temperatureC: celsius(12),
    }),
  )
  if (spa.ok) {
    return fromAngles(
      spa.value.geometricElevationDeg,
      spa.value.apparentElevationDeg,
      spa.value.azimuthDeg,
      'nrel-spa',
      null,
    )
  }
  const position = getPosition(new Date(utcMillis), location.latitudeDeg, location.longitudeDeg)
  const elevationDeg = (position.altitude * 180) / Math.PI
  const azimuthDeg = (position.azimuth * 180) / Math.PI + 180
  return fromAngles(
    elevationDeg,
    elevationDeg,
    azimuthDeg,
    'suncalc-fallback',
    "The precise sun-position model (NREL SPA) is unavailable, so the shadows drawn use SunCalc's approximate sun position",
  )
}

export interface DayChrome {
  readonly sunriseMillis: number | null
  readonly sunsetMillis: number | null
  readonly solarNoonMillis: number | null
}

const finiteTime = (date: Date | null | undefined): number | null =>
  date && Number.isFinite(date.getTime()) ? date.getTime() : null

export const dayChrome = (location: LatLon, utcMillis: EpochMillis): DayChrome => {
  const times = attempt(() =>
    getTimes(new Date(utcMillis), location.latitudeDeg, location.longitudeDeg),
  )
  if (!times.ok) return { sunriseMillis: null, sunsetMillis: null, solarNoonMillis: null }
  return {
    sunriseMillis: finiteTime(times.value.sunrise),
    sunsetMillis: finiteTime(times.value.sunset),
    solarNoonMillis: finiteTime(times.value.solarNoon),
  }
}
