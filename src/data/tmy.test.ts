import { describe, expect, it } from 'bun:test'
import type { LatLon } from '../types/geo'
import type { DegreesLatitude, DegreesLongitude } from '../types/units'
import { HOURS_PER_TMY } from '../types/weather'
import { normaliseTmy, normaliseWeather, TMY_END_YEAR } from './tmy'

const AMHERST: LatLon = {
  latitudeDeg: 42.37 as DegreesLatitude,
  longitudeDeg: -72.52 as DegreesLongitude,
}

/**
 * An Open-Meteo archive answer for whole calendar years, hour by hour, with the rain a caller
 * asks for or without it. The second year is a leap year on purpose: 8,784 hours arrive and
 * 29 February has to be dropped for the year to land on the 8,760 hour grid
 */
const openMeteoBody = (years: readonly number[], rainMmPerHour: number | null): unknown => {
  const time: string[] = []
  const ghi: number[] = []
  const temperature: number[] = []
  const dew: number[] = []
  const wind: number[] = []
  const pressure: number[] = []
  const rain: number[] = []
  for (const year of years) {
    for (let t = Date.UTC(year, 0, 1); t < Date.UTC(year + 1, 0, 1); t += 3_600_000) {
      const stamp = new Date(t)
      time.push(stamp.toISOString().slice(0, 16))
      const hour = stamp.getUTCHours()
      const daylight = Math.max(0, Math.sin((Math.PI * (hour - 6)) / 12))
      ghi.push(800 * daylight)
      temperature.push(10 + 8 * daylight + (year - years[0]!))
      dew.push(4)
      wind.push(2)
      pressure.push(1010)
      rain.push(rainMmPerHour === null ? 0 : rainMmPerHour * (year === years[0] ? 1 : 2))
    }
  }
  return {
    hourly: {
      time,
      shortwave_radiation: ghi,
      temperature_2m: temperature,
      dew_point_2m: dew,
      wind_speed_10m: wind,
      surface_pressure: pressure,
      ...(rainMmPerHour === null ? {} : { precipitation: rain }),
    },
  }
}

const sum = (values: Float32Array | undefined): number =>
  values === undefined ? Number.NaN : values.reduce((total, value) => total + value, 0)

describe('the weather record keeps the years the typical one was assembled from', () => {
  const record = normaliseWeather(
    { source: 'open-meteo', body: openMeteoBody([2023, 2024], 0.1) },
    AMHERST,
  )

  it('hands back every measured year, in order, each on the 8,760 hour grid', () => {
    expect(record.years.map((entry) => entry.year)).toEqual([2023, 2024])
    for (const { year, weather } of record.years) {
      expect(weather.utcMillis).toHaveLength(HOURS_PER_TMY)
      expect(weather.startUtcMillis).toBe(Date.UTC(year, 0, 1))
      expect(weather.provenance.yearsCovered).toEqual([year])
      expect(weather.provenance.isTypicalMeteorologicalYear).toBe(false)
      expect(weather.provenance.datasetLabel).toContain(String(year))
    }
  })

  it('still assembles the typical year, labelled as one, from those same years', () => {
    expect(record.typical.provenance.isTypicalMeteorologicalYear).toBe(true)
    expect(record.typical.startUtcMillis).toBe(Date.UTC(TMY_END_YEAR, 0, 1))
    expect(record.typical.provenance.yearsCovered).toHaveLength(12)
    for (const chosen of record.typical.provenance.yearsCovered) {
      expect([2023, 2024]).toContain(chosen)
    }
    // the second year is a degree warmer in every hour, so the typical year is never colder than
    // the first and never warmer than the second
    const first = record.years[0]?.weather.dryBulbC ?? new Float32Array()
    const second = record.years[1]?.weather.dryBulbC ?? new Float32Array()
    expect(sum(record.typical.dryBulbC)).toBeGreaterThanOrEqual(sum(first) - 1e-3)
    expect(sum(record.typical.dryBulbC)).toBeLessThanOrEqual(sum(second) + 1e-3)
  })

  it('carries the rain the source answered, year by year', () => {
    // 0.1 mm in every hour of 2023, 0.2 mm in every hour of 2024 with 29 February dropped
    expect(sum(record.years[0]?.weather.precipMm)).toBeCloseTo(876, 0)
    expect(sum(record.years[1]?.weather.precipMm)).toBeCloseTo(1752, 0)
    expect(record.typical.precipMm).toBeDefined()
  })

  it('leaves the rain column absent, not zero, where the source did not answer it', () => {
    const dry = normaliseWeather(
      { source: 'open-meteo', body: openMeteoBody([2023, 2024], null) },
      AMHERST,
    )
    expect(dry.typical.precipMm).toBeUndefined()
    for (const { weather } of dry.years) expect(weather.precipMm).toBeUndefined()
  })

  it('is what normaliseTmy has always returned', () => {
    const typical = normaliseTmy(
      { source: 'open-meteo', body: openMeteoBody([2023, 2024], 0.1) },
      AMHERST,
    )
    expect(typical.provenance).toMatchObject({
      isTypicalMeteorologicalYear: true,
      yearsCovered: record.typical.provenance.yearsCovered,
    })
    expect(sum(typical.ghiWM2)).toBeCloseTo(sum(record.typical.ghiWM2), 3)
  })
})
