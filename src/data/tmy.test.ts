import { describe, expect, it } from 'bun:test'
import type { LatLon } from '../types/geo'
import type { DegreesLatitude, DegreesLongitude } from '../types/units'
import { HOURS_PER_TMY } from '../types/weather'
import {
  elevationOfPayload,
  mergedPowerBody,
  powerSpans,
  NSRDB_DEFAULT_WIND_10M_MS,
  NSRDB_MIN_MEAN_WIND_MS,
  normaliseTmy,
  normaliseWeather,
  type PowerBody,
  TMY_END_YEAR,
} from './tmy'
import { TMY_WIND_HEIGHT_M, windSpeedAt2m } from './water'

const AMHERST: LatLon = {
  latitudeDeg: 42.37 as DegreesLatitude,
  longitudeDeg: -72.52 as DegreesLongitude,
}

/**
 * An Open-Meteo archive answer for whole calendar years, hour by hour, with the rain and wind
 * direction a caller asks for or without either, and the top-level elevation the live archive
 * carries. The second year is a leap year on purpose: 8,784 hours arrive and 29 February has to
 * be dropped for the year to land on the 8,760 hour grid
 */
const openMeteoBody = (
  years: readonly number[],
  rainMmPerHour: number | null,
  windDirectionDeg: number | null = null,
  elevationM: number | null = 15,
): unknown => {
  const time: string[] = []
  const ghi: number[] = []
  const temperature: number[] = []
  const dew: number[] = []
  const wind: number[] = []
  const pressure: number[] = []
  const rain: number[] = []
  const windDirection: number[] = []
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
      windDirection.push(windDirectionDeg ?? 0)
    }
  }
  return {
    ...(elevationM === null ? {} : { elevation: elevationM }),
    hourly: {
      time,
      shortwave_radiation: ghi,
      temperature_2m: temperature,
      dew_point_2m: dew,
      wind_speed_10m: wind,
      surface_pressure: pressure,
      ...(rainMmPerHour === null ? {} : { precipitation: rain }),
      ...(windDirectionDeg === null ? {} : { wind_direction_10m: windDirection }),
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

  it('carries the wind direction the source answered, year by year', () => {
    const breezy = normaliseWeather(
      { source: 'open-meteo', body: openMeteoBody([2023, 2024], 0.1, 200) },
      AMHERST,
    )
    expect(breezy.typical.windDirectionDeg).toHaveLength(HOURS_PER_TMY)
    expect(sum(breezy.typical.windDirectionDeg)).toBeCloseTo(200 * HOURS_PER_TMY, 0)
    for (const { weather } of breezy.years) {
      expect(weather.windDirectionDeg).toHaveLength(HOURS_PER_TMY)
      expect(sum(weather.windDirectionDeg)).toBeCloseTo(200 * HOURS_PER_TMY, 0)
    }
  })

  it('leaves the wind direction column absent where the source did not answer it, never zero', () => {
    expect(record.typical.windDirectionDeg).toBeUndefined()
    for (const { weather } of record.years) expect(weather.windDirectionDeg).toBeUndefined()
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

/**
 * A PVGIS v5.3 TMY answer: HOURS_PER_TMY rows under the column names the live API uses, with
 * a wind direction column when a caller asks for one, and the point's elevation where PVGIS
 * reports it
 */
const pvgisBody = (
  windDirectionDeg: number | null,
  windSpeedMS = 2,
  elevationM: number | null = 62,
): unknown => ({
  ...(elevationM === null ? {} : { inputs: { location: { elevation: elevationM } } }),
  outputs: {
    tmy_hourly: Array.from({ length: HOURS_PER_TMY }, (_, hour) => {
      const daylight = Math.max(0, Math.sin((Math.PI * ((hour % 24) - 6)) / 12))
      return {
        'G(h)': 800 * daylight,
        T2m: 10 + 8 * daylight,
        WS10m: windSpeedMS,
        SP: 101_000,
        RH: 60,
        ...(windDirectionDeg === null ? {} : { WD10m: windDirectionDeg }),
      }
    }),
  },
})

describe('PVGIS carries a wind direction column when it answers one', () => {
  it('reads WD10m into every hour of the typical year', () => {
    const record = normaliseWeather({ source: 'pvgis-sarah3', body: pvgisBody(220) }, AMHERST)
    expect(record.typical.windDirectionDeg).toHaveLength(HOURS_PER_TMY)
    expect(sum(record.typical.windDirectionDeg)).toBeCloseTo(220 * HOURS_PER_TMY, 0)
  })

  it('leaves the column absent where the body carries no WD10m', () => {
    const record = normaliseWeather({ source: 'pvgis-sarah3', body: pvgisBody(null) }, AMHERST)
    expect(record.typical.windDirectionDeg).toBeUndefined()
  })
})

/**
 * A NASA POWER hourly answer for one whole year, keyed the way the live API keys it, with
 * WD10M alongside the parameters `fromNasaPower` already reads, and the point POWER answers for,
 * whose third coordinate is its elevation
 */
const powerBody = (
  year: number,
  windDirectionDeg: number | null,
  elevationM: number | null = 153,
): unknown => {
  const parameter: Record<string, Record<string, number>> = {
    ALLSKY_SFC_SW_DWN: {},
    ALLSKY_SFC_SW_DNI: {},
    ALLSKY_SFC_SW_DIFF: {},
    T2M: {},
    T2MDEW: {},
    WS10M: {},
    PS: {},
    PRECTOTCORR: {},
    ...(windDirectionDeg === null ? {} : { WD10M: {} }),
  }
  for (let t = Date.UTC(year, 0, 1); t < Date.UTC(year + 1, 0, 1); t += 3_600_000) {
    const stamp = new Date(t)
    const key = stamp.toISOString().slice(0, 13).replace(/[-T]/g, '')
    const hour = stamp.getUTCHours()
    const daylight = Math.max(0, Math.sin((Math.PI * (hour - 6)) / 12))
    parameter.ALLSKY_SFC_SW_DWN![key] = 649.85 * daylight
    parameter.ALLSKY_SFC_SW_DNI![key] = 649.85 * daylight * 0.8
    parameter.ALLSKY_SFC_SW_DIFF![key] = 649.85 * daylight * 0.2
    parameter.T2M![key] = 12 + 8 * daylight
    parameter.T2MDEW![key] = 6
    parameter.WS10M![key] = 2
    parameter.PS![key] = 101
    parameter.PRECTOTCORR![key] = 0.1
    if (windDirectionDeg !== null) parameter.WD10M![key] = windDirectionDeg
  }
  const point = {
    type: 'Point',
    coordinates: [AMHERST.longitudeDeg, AMHERST.latitudeDeg, elevationM],
  }
  return { ...(elevationM === null ? {} : { geometry: point }), properties: { parameter } }
}

describe('NASA POWER carries a wind direction column when it answers one', () => {
  it('reads WD10M into every hour of the typical year and the measured year alike', () => {
    const record = normaliseWeather({ source: 'nasa-power', body: powerBody(2023, 150) }, AMHERST)
    expect(record.typical.windDirectionDeg).toHaveLength(HOURS_PER_TMY)
    expect(sum(record.typical.windDirectionDeg)).toBeCloseTo(150 * HOURS_PER_TMY, 0)
    expect(sum(record.years[0]?.weather.windDirectionDeg)).toBeCloseTo(150 * HOURS_PER_TMY, 0)
  })

  it('leaves the column absent where POWER answers no WD10M', () => {
    const record = normaliseWeather({ source: 'nasa-power', body: powerBody(2023, null) }, AMHERST)
    expect(record.typical.windDirectionDeg).toBeUndefined()
    expect(record.years[0]?.weather.windDirectionDeg).toBeUndefined()
  })
})

/**
 * An NSRDB-style CSV, a full year long so a wind-guard mean over the record means something,
 * with a Wind Direction column when a caller asks for one and a Wind Speed column, read at the
 * NSRDB's own 2 m, when a caller passes a speed. The two metadata lines NSRDB writes above the
 * column header come first, the field names on one and their values on the next
 */
const nsrdbCsv = (
  withWindDirection: boolean,
  windSpeedMS?: number,
  elevationM: number | null = 52,
): string => {
  const header = [
    'GHI',
    'Temperature',
    ...(withWindDirection ? ['Wind Direction'] : []),
    ...(windSpeedMS === undefined ? [] : ['Wind Speed']),
  ].join(',')
  const rows = Array.from({ length: HOURS_PER_TMY }, (_, hour) => {
    const cells = [String(500 + hour), String(18 + hour)]
    if (withWindDirection) cells.push(String(10 * hour))
    if (windSpeedMS !== undefined) cells.push(String(windSpeedMS))
    return cells.join(',')
  })
  const metadata =
    elevationM === null
      ? []
      : [
          'Source,Location ID,Latitude,Longitude,Elevation',
          `NSRDB,149417,42.37,-72.52,${String(elevationM)}`,
        ]
  return [...metadata, header, ...rows].join('\n')
}

describe('a CSV carries a wind direction column when its header has one', () => {
  it('reads the Wind Direction column NSRDB style', () => {
    const record = normaliseWeather({ source: 'nsrdb-psm3', body: nsrdbCsv(true) }, AMHERST)
    expect(record.typical.windDirectionDeg).toBeDefined()
    expect(record.typical.windDirectionDeg?.[3]).toBeCloseTo(30, 5)
  })

  it('leaves the column absent where the header has none', () => {
    const record = normaliseWeather({ source: 'nsrdb-psm3', body: nsrdbCsv(false) }, AMHERST)
    expect(record.typical.windDirectionDeg).toBeUndefined()
  })
})

describe('NSRDB wind arrives at 2 m and is scaled to the 10 m convention every other source uses', () => {
  it('scales a 3 m/s NSRDB wind to about 4.01 m/s', () => {
    const record = normaliseWeather({ source: 'nsrdb-psm3', body: nsrdbCsv(false, 3) }, AMHERST)
    expect(record.typical.windSpeedMS[0]).toBeCloseTo(3 / windSpeedAt2m(1, TMY_WIND_HEIGHT_M), 5)
    expect(record.typical.provenance.datasetLabel).not.toContain('FAO-56 default')
  })

  it('leaves a PVGIS wind already at 10 m unchanged', () => {
    const record = normaliseWeather({ source: 'pvgis-sarah3', body: pvgisBody(null, 3) }, AMHERST)
    expect(record.typical.windSpeedMS[0]).toBeCloseTo(3, 5)
  })
})

describe('the near-zero wind guard replaces NSRDB wind under 1 m/s with the FAO-56 default', () => {
  it('replaces a whole year averaging 0.2 m/s with the default, and notes the swap', () => {
    const record = normaliseWeather({ source: 'nsrdb-psm3', body: nsrdbCsv(false, 0.2) }, AMHERST)
    expect(
      record.typical.windSpeedMS.every(
        (value) => Math.abs(value - NSRDB_DEFAULT_WIND_10M_MS) < 1e-5,
      ),
    ).toBe(true)
    expect(record.typical.provenance.datasetLabel).toContain('FAO-56 default')
  })

  it('guards the boundary: a scaled mean just above the threshold is left alone', () => {
    const rawMS = (NSRDB_MIN_MEAN_WIND_MS + 0.1) * windSpeedAt2m(1, TMY_WIND_HEIGHT_M)
    const record = normaliseWeather({ source: 'nsrdb-psm3', body: nsrdbCsv(false, rawMS) }, AMHERST)
    expect(record.typical.windSpeedMS[0]).toBeCloseTo(NSRDB_MIN_MEAN_WIND_MS + 0.1, 5)
    expect(record.typical.provenance.datasetLabel).not.toContain('FAO-56 default')
  })

  it('guards the boundary: a scaled mean just below the threshold is replaced', () => {
    const rawMS = (NSRDB_MIN_MEAN_WIND_MS - 0.1) * windSpeedAt2m(1, TMY_WIND_HEIGHT_M)
    const record = normaliseWeather({ source: 'nsrdb-psm3', body: nsrdbCsv(false, rawMS) }, AMHERST)
    expect(
      record.typical.windSpeedMS.every(
        (value) => Math.abs(value - NSRDB_DEFAULT_WIND_10M_MS) < 1e-5,
      ),
    ).toBe(true)
    expect(record.typical.provenance.datasetLabel).toContain('FAO-56 default')
  })

  it('leaves a genuinely calm PVGIS year untouched', () => {
    const record = normaliseWeather(
      { source: 'pvgis-sarah3', body: pvgisBody(null, 0.05) },
      AMHERST,
    )
    expect(record.typical.windSpeedMS[0]).toBeCloseTo(0.05, 5)
    expect(record.typical.provenance.datasetLabel).not.toContain('FAO-56 default')
  })
})

/**
 * The height above sea level comes with the weather. Every source answers with the elevation of
 * the cell its year was read from, each in its own spelling, so the one weather fetch a site
 * already makes carries the number and a lookup depends on no separate elevation service
 */
describe('the elevation the weather body carries', () => {
  it('reads the top-level elevation of an Open-Meteo archive answer', () => {
    expect(
      elevationOfPayload({ source: 'open-meteo', body: openMeteoBody([2023, 2024], 0.1) }),
    ).toBe(15)
  })

  it("reads PVGIS's elevation from the location it echoes back", () => {
    expect(elevationOfPayload({ source: 'pvgis-sarah3', body: pvgisBody(null) })).toBe(62)
  })

  it('reads the third coordinate of the point NASA POWER answered for', () => {
    expect(elevationOfPayload({ source: 'nasa-power', body: powerBody(2023, null) })).toBe(153)
  })

  it('reads the Elevation field of a CSV metadata header, NSRDB and upload alike', () => {
    expect(elevationOfPayload({ source: 'nsrdb-psm3', body: nsrdbCsv(true) })).toBe(52)
    expect(elevationOfPayload({ source: 'user-upload', body: nsrdbCsv(false) })).toBe(52)
  })

  it('is null where a body names none, for every source', () => {
    expect(
      elevationOfPayload({ source: 'open-meteo', body: openMeteoBody([2023], 0.1, null, null) }),
    ).toBeNull()
    expect(
      elevationOfPayload({ source: 'pvgis-sarah3', body: pvgisBody(null, 2, null) }),
    ).toBeNull()
    expect(
      elevationOfPayload({ source: 'nasa-power', body: powerBody(2023, null, null) }),
    ).toBeNull()
    expect(
      elevationOfPayload({ source: 'nsrdb-psm3', body: nsrdbCsv(false, undefined, null) }),
    ).toBeNull()
  })

  it('keeps a real 0 m, because sea level is an elevation and an absent answer is not', () => {
    expect(
      elevationOfPayload({ source: 'open-meteo', body: openMeteoBody([2023], 0.1, null, 0) }),
    ).toBe(0)
  })

  it('reaches the record the site takes its typical year from', () => {
    const record = normaliseWeather(
      { source: 'open-meteo', body: openMeteoBody([2023, 2024], 0.1) },
      AMHERST,
    )
    expect(record.elevationM).toBe(15)
  })

  /**
   * POWER's ten years arrive as five merged chunks and the point travels with them, so the
   * elevation survives the join the parameters go through
   */
  it('asks POWER for the ten years in spans no longer than the cap, tiling the window', () => {
    const spans = powerSpans(2015, 2024)
    expect(spans[0]?.[0]).toBe(2015)
    expect(spans[spans.length - 1]?.[1]).toBe(2024)
    for (const [first, last] of spans) expect(last - first + 1).toBeLessThanOrEqual(3)
    for (let i = 1; i < spans.length; i += 1)
      expect(spans[i]?.[0]).toBe((spans[i - 1]?.[1] ?? 0) + 1)
  })

  it("survives the merge of POWER's chunked answers", () => {
    const merged = mergedPowerBody([
      powerBody(2023, null) as PowerBody,
      powerBody(2024, null) as PowerBody,
    ])
    expect(elevationOfPayload({ source: 'nasa-power', body: merged })).toBe(153)
  })
})
