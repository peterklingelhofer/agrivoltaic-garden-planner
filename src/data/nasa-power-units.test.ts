import { describe, expect, it, mock } from 'bun:test'
import { vi } from '../../test/vi'
import type { LatLon } from '../types/geo'
import type { DegreesLatitude, DegreesLongitude } from '../types/units'
import {
  implausibleWeather,
  MAX_ANNUAL_RAIN_MM,
  MIN_ANNUAL_GHI_KWH_M2,
  normalizeWeather,
} from './tmy'

const AMHERST: LatLon = {
  latitudeDeg: 42.37 as DegreesLatitude,
  longitudeDeg: -72.52 as DegreesLongitude,
}

/**
 * The magnitudes NASA POWER's hourly product answered for Amherst on July 1, 2016, measured on
 * 2026-09-03 against the live API. Under `community=RE` irradiance is "Wh/m^2" and peaks at
 * 649.85. Under `community=AG` the same hour is "MJ/hr" and reads 2.34. `PRECTOTCORR` is
 * labeled "mm/day" in the hourly product, but its 24 hourly values SUM to the daily product's
 * figure: measured 2026-09-12 against the live API, Amherst 2016-07-01 hourly sum 7.78 against
 * daily 7.78, and Melbourne 2019-06-01 hourly sum 0.59 against daily 0.58. A 2026-09-03 reading
 * had found a rate instead (24 values summing to 50.20 on a 2.09 mm day); the live API no longer
 * answers that way, so each value is the millimeters that fell in its hour. The fixture is one
 * whole year so the decoder can stack it
 */
const powerBody = (year: number, noonGhi: number, rainMmPerHour: number): unknown => {
  const parameter: Record<string, Record<string, number>> = {
    ALLSKY_SFC_SW_DWN: {},
    ALLSKY_SFC_SW_DNI: {},
    ALLSKY_SFC_SW_DIFF: {},
    T2M: {},
    T2MDEW: {},
    WS10M: {},
    PS: {},
    PRECTOTCORR: {},
  }
  for (let t = Date.UTC(year, 0, 1); t < Date.UTC(year + 1, 0, 1); t += 3_600_000) {
    const stamp = new Date(t)
    const key = stamp.toISOString().slice(0, 13).replace(/[-T]/g, '')
    const hour = stamp.getUTCHours()
    const daylight = Math.max(0, Math.sin((Math.PI * (hour - 6)) / 12))
    parameter.ALLSKY_SFC_SW_DWN![key] = noonGhi * daylight
    parameter.ALLSKY_SFC_SW_DNI![key] = noonGhi * daylight * 0.8
    parameter.ALLSKY_SFC_SW_DIFF![key] = noonGhi * daylight * 0.2
    parameter.T2M![key] = 12 + 8 * daylight
    parameter.T2MDEW![key] = 6
    parameter.WS10M![key] = 2
    parameter.PS![key] = 101
    parameter.PRECTOTCORR![key] = rainMmPerHour
  }
  return { properties: { parameter } }
}

/** An Open-Meteo archive answer for whole years, hour by hour, with rain in mm per hour */
const openMeteoBody = (years: readonly number[], rainMmPerHour: number): unknown => {
  const time: string[] = []
  const ghi: number[] = []
  const temperature: number[] = []
  const constant = (value: number): number[] => Array.from({ length: time.length }, () => value)
  const rain: number[] = []
  for (const year of years) {
    for (let t = Date.UTC(year, 0, 1); t < Date.UTC(year + 1, 0, 1); t += 3_600_000) {
      const stamp = new Date(t)
      time.push(stamp.toISOString().slice(0, 16))
      const daylight = Math.max(0, Math.sin((Math.PI * (stamp.getUTCHours() - 6)) / 12))
      ghi.push(800 * daylight)
      temperature.push(10 + 8 * daylight)
      rain.push(rainMmPerHour)
    }
  }
  return {
    hourly: {
      time,
      shortwave_radiation: ghi,
      temperature_2m: temperature,
      dew_point_2m: constant(4),
      wind_speed_10m: constant(2),
      surface_pressure: constant(1010),
      precipitation: rain,
    },
  }
}

const sum = (values: Float32Array | undefined): number =>
  values === undefined ? Number.NaN : values.reduce((total, value) => total + value, 0)

describe('what NASA POWER means by its hourly numbers', () => {
  const record = normalizeWeather(
    // a tenth of a millimeter in every hour: 876 mm over the year, an Amherst-sized total
    { source: 'nasa-power', body: powerBody(2023, 649.85, 0.1) },
    AMHERST,
  )
  const year = record.years[0]?.weather

  it('reads irradiance as the W/m² the RE community answers, noon at 650 and not at 2', () => {
    const noon = 12 + 31 * 24 // February 1, 12:00 UTC
    expect(year?.ghiWM2[noon]).toBeCloseTo(649.85, 1)
  })

  it('reads each hourly rain value as the millimeters that fell in that hour', () => {
    // 0.1 mm in every hour of the year is 2.4 mm on every one of 365 days
    expect(sum(year?.precipMm)).toBeCloseTo(0.1 * 24 * 365, 0)
    // reading the label as a daily rate would give a 24th of that: 36.5 mm a year
    expect(sum(year?.precipMm)).toBeGreaterThan(800)
    expect(sum(year?.precipMm)).toBeLessThan(MAX_ANNUAL_RAIN_MM)
  })

  it('is a year that can have happened', () => {
    expect(implausibleWeather(record)).toBeNull()
  })
})

describe("a year that can't have happened is refused, whichever source answered it", () => {
  it('rejects a sun read in the wrong unit', () => {
    const dim = normalizeWeather(
      // the AG community's MJ/hr magnitude, read as W/m²: the sun 280 times too weak
      { source: 'nasa-power', body: powerBody(2023, 2.34, 0.5) },
      AMHERST,
    )
    const why = implausibleWeather(dim)
    expect(why).toMatch(/kWh\/m² of sun/)
    expect(why).toMatch(/no place on Earth/)
  })

  it('rejects rain summed in the wrong unit', () => {
    const drowned = normalizeWeather(
      // 9.47 mm in every hour of the year: 83 meters of rain, which no place on Earth gets
      { source: 'nasa-power', body: powerBody(2023, 649.85, 9.47) },
      AMHERST,
    )
    expect(implausibleWeather(drowned)).toMatch(/mm of rain/)
  })

  it('keeps the floor below the darkest inhabited place', () => {
    expect(MIN_ANNUAL_GHI_KWH_M2).toBeLessThan(700)
  })
})

/**
 * And the chain falls through such a year. Open-Meteo answers a VALID body whose rain is in the
 * wrong unit, NASA POWER answers a sane one, and the record that comes back is POWER's: the
 * first source failed the way a timeout fails, silently to the caller and loudly in the log
 */
describe('the fallback chain treats an impossible year as a failed source', () => {
  it('falls through to the next source and hands back its record', async () => {
    const fetchJson = vi.fn((upstream: string) =>
      Promise.resolve(
        upstream === 'open-meteo' ? openMeteoBody([2023, 2024], 500) : powerBody(2023, 649.85, 0.1),
      ),
    )
    /*
      Vitest hoisted a mock and then reset the module registry so the next import got a fresh
      `./tmy`. Bun has neither: `mock.module` swaps the module in place, and because ESM bindings
      are live the `./tmy` already imported at the top of this file starts calling the stub. So
      the mock goes in, the call is made, and the real module goes back at the end rather than
      the registry being torn down
    */
    const actualHttp = await import('./http')
    mock.module('./http', () => ({ ...actualHttp, fetchJson }))
    const { fetchWeather } = await import('./tmy')
    const record = await fetchWeather({ location: AMHERST, source: 'open-meteo', signal: null })
    expect(record.typical.source).toBe('nasa-power')
    expect(fetchJson.mock.calls.map(([upstream]) => upstream)).toContain('open-meteo')
    mock.module('./http', () => actualHttp)
  })
})
