import { describe, expect, it, mock } from 'bun:test'
import type { LatLon } from '../types/geo'
import type { DegreesLatitude, DegreesLongitude } from '../types/units'
import type { WeatherRecord } from '../types/weather'
import {
  implausibleWeather,
  MAX_ANNUAL_RAIN_MM,
  MIN_ANNUAL_GHI_KWH_M2,
  normalizeWeather,
  preferredSourceFor,
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

/**
 * A PVGIS v5.3 TMY answer: 8,760 rows under the column names the live API uses, and the
 * radiation database it chose for the place named in `inputs`, as measured at Amherst on
 * 2026-09-17 (PVGIS-ERA5, since SARAH-3 is the Meteosat disk)
 */
const pvgisBody = (noonGhi: number): unknown => ({
  inputs: { meteo_data: { radiation_db: 'PVGIS-ERA5' } },
  outputs: {
    tmy_hourly: Array.from({ length: 8760 }, (_, hour) => {
      const daylight = Math.max(0, Math.sin((Math.PI * ((hour % 24) - 6)) / 12))
      return {
        'G(h)': noonGhi * daylight,
        'Gb(n)': noonGhi * daylight * 0.8,
        'Gd(h)': noonGhi * daylight * 0.2,
        T2m: 10 + 8 * daylight,
        RH: 60,
        WS10m: 2,
        SP: 101_000,
      }
    }),
  },
})

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
  /*
    Vitest hoisted a mock and then reset the module registry so the next import got a fresh
    `./tmy`. Bun has neither: `mock.module` swaps the module in place, and because ESM bindings
    are live the `./tmy` already imported at the top of this file starts calling the stub. So
    the mock goes in, the call is made, and the real module goes back at the end rather than
    the registry being torn down. NSRDB is fetched as text, so both entry points are stubbed
  */
  const run = async (
    answer: (upstream: string) => Promise<unknown>,
    location: LatLon = AMHERST,
  ): Promise<{
    readonly settled: PromiseSettledResult<WeatherRecord>
    readonly asked: readonly string[]
  }> => {
    const asked: string[] = []
    const stub = (upstream: string): Promise<unknown> => {
      asked.push(upstream)
      return answer(upstream)
    }
    const actualHttp = await import('./http')
    mock.module('./http', () => ({ ...actualHttp, fetchJson: stub, fetchText: stub }))
    const { fetchWeather } = await import('./tmy')
    const [settled] = await Promise.allSettled([
      fetchWeather({ location, source: preferredSourceFor(location), signal: null }),
    ])
    mock.module('./http', () => actualHttp)
    return { settled, asked: [...new Set(asked)] }
  }

  it('falls through to PVGIS, whose typical year lands in seconds, and names its database', async () => {
    const { settled, asked } = await run((upstream) =>
      Promise.resolve(
        upstream === 'open-meteo' ? openMeteoBody([2023, 2024], 500) : pvgisBody(500),
      ),
    )
    expect(settled.status).toBe('fulfilled')
    if (settled.status !== 'fulfilled') return
    expect(settled.value.typical.source).toBe('pvgis-sarah3')
    expect(settled.value.typical.provenance.datasetLabel).toBe('PVGIS v5.3 TMY (PVGIS-ERA5)')
    expect(settled.value.years).toEqual([])
    expect(asked).toEqual(['open-meteo', 'pvgis'])
  })

  it('reaches NASA POWER only once PVGIS has failed too', async () => {
    const { settled, asked } = await run((upstream) =>
      upstream === 'pvgis'
        ? Promise.reject(new Error('PVGIS is down'))
        : Promise.resolve(
            upstream === 'open-meteo'
              ? openMeteoBody([2023, 2024], 500)
              : powerBody(2023, 649.85, 0.1),
          ),
    )
    expect(settled.status).toBe('fulfilled')
    if (settled.status !== 'fulfilled') return
    expect(settled.value.typical.source).toBe('nasa-power')
    expect(asked).toEqual(['open-meteo', 'pvgis', 'nasa-power'])
  })

  it('asks a polar site, whose preferred source is POWER, for POWER once', async () => {
    const pole: LatLon = {
      latitudeDeg: 86 as DegreesLatitude,
      longitudeDeg: 20 as DegreesLongitude,
    }
    const { settled, asked } = await run(() => Promise.reject(new Error('nothing answers')), pole)
    expect(settled.status).toBe('rejected')
    expect(asked).toEqual(['nasa-power', 'pvgis', 'nsrdb'])
  })
})
