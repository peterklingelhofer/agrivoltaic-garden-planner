import { beforeEach, describe, expect, it, mock } from 'bun:test'
import { vi } from '../../test/vi'

const fetchJson = vi.fn()

/* captured before the mock is installed, so the spread carries the real module */
const actualHttp = await import('./http')
mock.module('./http', () => ({ ...actualHttp, fetchJson }))

const { climateNormalsAt, dailyNormalsAt, hardinessAt, koppenAt, resetStaticLayerCache } =
  await import('./static-layers')
const { geocode, reverseGeocode } = await import('./geocode')
const { resolveSite } = await import('./site')
const { fetchNasaPowerTmy, normalizeTmy, parseCsvColumns, TMY_END_YEAR, TMY_YEAR_COUNT } =
  await import('./tmy')

const LOCATION = { latitudeDeg: 42.37, longitudeDeg: -72.52 } as Parameters<typeof koppenAt>[0]

const DAYS_PER_YEAR = 365
const YEARS = 30

const stamps = (): readonly string[] => {
  const out: string[] = []
  for (let year = 1991; year <= 2020; year += 1) {
    for (let day = 1; day <= DAYS_PER_YEAR; day += 1) {
      out.push(`${String(year)}-01-${String(day).padStart(2, '0')}`)
    }
  }
  return out
}

/** The exact shape Open-Meteo returns when it has no value: the timestamps, and nulls */
const dailyBody = (fill: number | null, count = YEARS * DAYS_PER_YEAR): unknown => {
  const time = stamps()
  const series = Array.from({ length: count }, () => fill)
  return {
    daily: {
      time,
      temperature_2m_min: series,
      temperature_2m_max: series,
      temperature_2m_mean: series,
      precipitation_sum: series,
      shortwave_radiation_sum: series,
    },
  }
}

beforeEach(() => {
  fetchJson.mockReset()
  resetStaticLayerCache()
  // the bundled rasters are absent in the test environment, so the loader derives
  globalThis.fetch = vi.fn().mockResolvedValue({ ok: false }) as unknown as typeof fetch
})

/**
 * `soilAt` guards against this: `null / 10` is 0 in JavaScript, so an unguarded no-data depth would
 * become pH 0 and exclude every crop with nothing on screen to say why. The daily normals have the
 * same shape, where writing `series?.[index] ?? 0` into every normals array would produce a site
 * classified Koppen EF and USDA 10a at once. So the daily read counts the values it actually wrote
 * and rejects a response below `MIN_COVERAGE`
 */
describe('a daily-normals response with no values', () => {
  it('refuses the read rather than fabricating a climate', async () => {
    fetchJson.mockResolvedValue(dailyBody(null))
    await expect(climateNormalsAt(LOCATION)).rejects.toThrow(/coverage/)
  })

  it('never reports a Koppen code or hardiness zone from zero observations', async () => {
    fetchJson.mockResolvedValue(dailyBody(null))
    // 0 C every month would read Koppen E (polar) and USDA 10a (coastal southern California) at the
    // same time, which is mutually impossible
    await expect(koppenAt(LOCATION)).rejects.toThrow()
    await expect(hardinessAt(LOCATION)).rejects.toThrow()
  })

  it('refuses a response that is merely truncated', async () => {
    // Padding 400 real readings out of 10 950 with zeros nobody reported would pull every month
    // below the only temperature the upstream actually sent
    fetchJson.mockResolvedValue(dailyBody(12, 400))
    await expect(climateNormalsAt(LOCATION)).rejects.toThrow(/coverage/)
  })

  it('accepts a response with only isolated gaps', async () => {
    const body = dailyBody(12) as { daily: Record<string, unknown[]> }
    for (const key of Object.keys(body.daily)) {
      if (key === 'time') continue
      const series = body.daily[key] as (number | null)[]
      for (let i = 0; i < series.length; i += 50) series[i] = null
    }
    fetchJson.mockResolvedValue(body)
    const normals = await climateNormalsAt(LOCATION)
    expect(Math.max(...normals.monthlyMeanTempC)).toBeCloseTo(12, 1)
  })
})

const place = (lat: unknown, lon: unknown): unknown => ({
  display_name: 'somewhere',
  lat,
  lon,
  address: { country_code: 'us' },
})

/** `Number(place.lat ?? 0)` would put a malformed geocode at 0, 0 in the Gulf of Guinea */
describe('a geocode result with no usable coordinates', () => {
  it('is rejected rather than placed at 0, 0', async () => {
    fetchJson.mockResolvedValue([place(undefined, undefined)])
    await expect(geocode('somewhere', null)).rejects.toThrow(
      /Nominatim returned 1 result with no usable coordinates/,
    )
  })

  it("is rejected when the coordinates aren't numbers", async () => {
    fetchJson.mockResolvedValue([place('n/a', 'n/a')])
    await expect(geocode('somewhere', null)).rejects.toThrow(/no usable coordinates/)
  })

  it('is rejected when the coordinates are out of range', async () => {
    fetchJson.mockResolvedValue([place('420', '-72.52')])
    await expect(geocode('somewhere', null)).rejects.toThrow(/no usable coordinates/)
  })

  it('keeps the usable results and drops only the malformed ones', async () => {
    fetchJson.mockResolvedValue([place(undefined, undefined), place('42.37', '-72.52')])
    const hits = await geocode('somewhere', null)
    expect(hits).toHaveLength(1)
    expect(hits[0]?.location.latitudeDeg).toBe(42.37)
  })

  it('returns nothing, and refuses nothing, when the search simply found no place', async () => {
    fetchJson.mockResolvedValue([])
    await expect(geocode('somewhere', null)).resolves.toEqual([])
  })

  /**
   * Seven Amhersts: in the upstream's own order, a grower in Massachusetts can end up building a
   * garden in Virginia. With a place to lean on, the search carries it, coarsened so a town's
   * visitors share one cached answer. Without one it asks plainly
   */
  it('leans a search toward the current place, and asks plainly without one', async () => {
    fetchJson.mockResolvedValue([place('42.37', '-72.52')])
    await geocode('amherst', null, LOCATION)
    const leaned = fetchJson.mock.calls[0]?.[2] as URLSearchParams
    expect(leaned.get('viewbox')).toBe('-75.5,39.4,-69.5,45.4')
    expect(leaned.get('bounded')).toBeNull()
    fetchJson.mockClear()
    await geocode('amherst', null)
    const plain = fetchJson.mock.calls[0]?.[2] as URLSearchParams
    expect(plain.get('viewbox')).toBeNull()
  })

  it('refuses a reverse geocode rather than answering 0, 0', async () => {
    fetchJson.mockResolvedValue(place(undefined, undefined))
    await expect(reverseGeocode(LOCATION, null)).rejects.toThrow(/no usable coordinates/)
  })
})

const HOURS = 8760

const hourlyBody = (fill: number | null, shortwave: number | null = fill): unknown => {
  const series = Array.from({ length: HOURS }, () => fill)
  return {
    // the height above sea level the archive answers with, which is where a site's elevation
    // comes from
    elevation: 50,
    hourly: {
      time: Array.from(
        { length: HOURS },
        (_, i) => `2024-01-01T${String(i % 24).padStart(2, '0')}:00`,
      ),
      shortwave_radiation: Array.from({ length: HOURS }, () => shortwave),
      temperature_2m: series,
    },
  }
}

/** POWER's daily body for the years asked, keyed the way POWER keys days, one value throughout */
const powerDailyBody = (firstYear: number, lastYear: number, fill: number): unknown => {
  const keys: string[] = []
  for (let year = firstYear; year <= lastYear; year += 1) {
    for (let day = 0; day < DAYS_PER_YEAR; day += 1) {
      keys.push(new Date(Date.UTC(year, 0, 1 + day)).toISOString().slice(0, 10).replace(/-/g, ''))
    }
  }
  const series = Object.fromEntries(keys.map((key) => [key, fill]))
  return {
    properties: {
      parameter: {
        T2M_MIN: series,
        T2M_MAX: series,
        T2M: series,
        PRECTOTCORR: series,
        ALLSKY_SFC_SW_DWN: series,
      },
    },
  }
}

const yearsOf = (params: URLSearchParams): readonly [number, number] => [
  Number(String(params.get('start')).slice(0, 4)),
  Number(String(params.get('end')).slice(0, 4)),
]

const openMeteoRefuses = (): Promise<never> =>
  Promise.reject(
    new actualHttp.UpstreamError('open-meteo', 429, 'open-meteo responded 429: hourly', 'hour'),
  )

/**
 * The daily normals fall through to NASA POWER the same way the hourly leg does, so one 429 from
 * Open-Meteo alone can't fail the whole site resolve, and they say which service answered
 */
describe('the daily normals fall back to NASA POWER', () => {
  const powerAnswers =
    (fill: number) =>
    (upstream: unknown, _path: unknown, params: URLSearchParams): Promise<unknown> =>
      upstream === 'open-meteo'
        ? openMeteoRefuses()
        : Promise.resolve(powerDailyBody(...yearsOf(params), fill))

  it('answers from POWER when Open-Meteo refuses, and names the source', async () => {
    fetchJson.mockImplementation(powerAnswers(12))
    const normals = await climateNormalsAt(LOCATION)
    expect(normals.source).toBe('nasa-power')
    expect(Math.max(...normals.monthlyMeanTempC)).toBeCloseTo(12, 1)
  })

  it('asks POWER for the five daily variables, browser-direct, in spans its JSON will carry', async () => {
    fetchJson.mockImplementation(powerAnswers(12))
    await climateNormalsAt(LOCATION)
    const power = fetchJson.mock.calls.filter(([upstream]) => upstream === 'nasa-power')
    expect(power.length).toBeGreaterThan(1)
    const spans = power.map(([, path, params]) => {
      const search = params as URLSearchParams
      expect(path).toBe('/api/temporal/daily/point')
      expect(search.get('community')).toBe('RE')
      expect(search.get('parameters')).toBe('T2M_MIN,T2M_MAX,T2M,PRECTOTCORR,ALLSKY_SFC_SW_DWN')
      expect(search.get('format')).toBe('JSON')
      return yearsOf(search)
    })
    for (const [first, last] of spans) expect(last - first + 1).toBeLessThanOrEqual(4)
    const covered = spans.flatMap(([first, last]) =>
      Array.from({ length: last - first + 1 }, (_unused, index) => first + index),
    )
    expect(covered.slice().sort((a, b) => a - b)).toEqual(
      Array.from({ length: 30 }, (_unused, index) => 1991 + index),
    )
  })

  it('reads POWER daily irradiance as kWh/m², which Open-Meteo sums in MJ/m²', async () => {
    fetchJson.mockResolvedValue(dailyBody(18))
    const openMeteo = await climateNormalsAt(LOCATION)
    resetStaticLayerCache()
    // 5 kWh/m²/day is 18 MJ/m²/day, so the two answers read the same daily light
    fetchJson.mockImplementation(powerAnswers(5))
    const power = await climateNormalsAt(LOCATION)
    expect(power.monthlyMeanDliMolM2Day[6]).toBeCloseTo(openMeteo.monthlyMeanDliMolM2Day[6] ?? 0, 6)
  })

  it('raises the Open-Meteo refusal itself when POWER fails as well', async () => {
    fetchJson.mockImplementation((upstream: unknown) =>
      upstream === 'open-meteo'
        ? openMeteoRefuses()
        : Promise.reject(
            new actualHttp.UpstreamError('nasa-power', 503, 'nasa-power responded 503'),
          ),
    )
    await expect(climateNormalsAt(LOCATION)).rejects.toThrow(
      /answered as many requests as it allows from this connection this hour/,
    )
  })

  it('asks again after a refusal rather than replaying the cached rejection', async () => {
    fetchJson.mockImplementation(() => openMeteoRefuses())
    await expect(climateNormalsAt(LOCATION)).rejects.toThrow()
    fetchJson.mockResolvedValue(dailyBody(12))
    await expect(climateNormalsAt(LOCATION)).resolves.toBeDefined()
  })
})

describe('the daily normals are aggregated on local days and name their zone', () => {
  it('asks Open-Meteo for the zone and keeps what it names', async () => {
    fetchJson.mockResolvedValue({
      ...(dailyBody(12) as object),
      timezone: 'America/New_York',
      utc_offset_seconds: -18000,
    })
    const daily = await dailyNormalsAt(LOCATION)
    expect(daily.timezone).toBe('America/New_York')
    expect(daily.utcOffsetSeconds).toBe(-18000)
    expect(daily.source).toBe('open-meteo')
    const params = fetchJson.mock.calls[0]?.[2] as URLSearchParams
    expect(params.get('timezone')).toBe('auto')
  })

  it('names no zone where the answer carries none', async () => {
    fetchJson.mockResolvedValue(dailyBody(12))
    const daily = await dailyNormalsAt(LOCATION)
    expect(daily.timezone).toBeNull()
    expect(daily.utcOffsetSeconds).toBeNull()
  })
})

/**
 * The hourly weather stays in UTC; what changes is that every series carries the zone the
 * site keeps its clock in, so the readers that split hours into local days read that zone at
 * each instant rather than a whole-hour guess from the longitude
 */
describe('a resolved site keeps the zone its normals were aggregated in', () => {
  it('stamps the IANA zone on the site and on every weather series, at standard time', async () => {
    fetchJson.mockImplementation((upstream: unknown, _path: unknown, params: URLSearchParams) => {
      if (upstream === 'open-meteo') {
        return Promise.resolve(
          params.has('daily')
            ? {
                ...(dailyBody(12) as object),
                timezone: 'America/New_York',
                utc_offset_seconds: -14400,
              }
            : hourlyBody(12, 200),
        )
      }
      return Promise.reject(new Error(`${String(upstream)} isn't answered here`))
    })
    const { site, weather, years } = await resolveSite(LOCATION, 'Amherst', null)
    expect(site.timezone).toBe('America/New_York')
    // the standard offset, whatever offset the answer happened to carry when it was made
    expect(site.utcOffsetHours).toBe(-5)
    expect(weather.timezone).toBe('America/New_York')
    expect(weather.utcOffsetHours).toBe(-5)
    expect(years.length).toBeGreaterThan(0)
    expect(years.every((measured) => measured.weather.timezone === 'America/New_York')).toBe(true)
    // the soil map wasn't answered, and the site says so rather than claiming a gardener's test
    expect(site.soil.sourceId).toBe('default')
    expect(site.normals.source).toBe('open-meteo')
  })

  // the nearest tzdb zone to the point, and the site says that is how it was found. The longitude
  // rule answers only when the zone table is empty
  it('falls back to the nearest time zone on record where no upstream names one', async () => {
    fetchJson.mockImplementation((upstream: unknown, _path: unknown, params: URLSearchParams) => {
      if (upstream === 'open-meteo') {
        return Promise.resolve(params.has('daily') ? dailyBody(12) : hourlyBody(12, 200))
      }
      return Promise.reject(new Error(`${String(upstream)} isn't answered here`))
    })
    const { site, weather } = await resolveSite(LOCATION, 'Amherst', null)
    expect(site.timezone).toBe('America/New_York')
    expect(site.timezoneBasis).toBe('nearest-zone')
    expect(site.utcOffsetHours).toBe(-5)
    expect(weather.timezone).toBe('America/New_York')
  })
})

/**
 * Reading the hourly TMY with `series?.[index] ?? 0` would turn an all-null Open-Meteo archive into
 * a real 0 W/m2, 0 C typical year: every bed dark, every crop excluded, nothing on screen to say
 * why. Only irradiance and dry bulb are counted: absent components fall back to Erbs, absent wind
 * and humidity to Hargreaves-Samani
 */
describe('a typical meteorological year with no values', () => {
  const asPayload = (source: string, body: unknown): Parameters<typeof normalizeTmy>[0] =>
    ({ source, body }) as Parameters<typeof normalizeTmy>[0]

  it('refuses an all-null Open-Meteo archive, naming the upstream', () => {
    expect(() => normalizeTmy(asPayload('open-meteo', hourlyBody(null)), LOCATION)).toThrow(
      /Open-Meteo returned 0 of 17520 expected hourly values.*coverage/s,
    )
  })

  it('accepts an archive that carries its irradiance and temperature', () => {
    const series = normalizeTmy(asPayload('open-meteo', hourlyBody(12)), LOCATION)
    expect(series.dryBulbC.some((value) => value === 12)).toBe(true)
  })

  it('refuses a NASA POWER response that is entirely fill values', () => {
    const keys = Array.from({ length: 24 }, (_, i) => `20240101${String(i).padStart(2, '0')}`)
    const filled = Object.fromEntries(keys.map((key) => [key, -999]))
    const body = {
      properties: { parameter: { T2M: filled, ALLSKY_SFC_SW_DWN: filled } },
    }
    expect(() => normalizeTmy(asPayload('nasa-power', body), LOCATION)).toThrow(
      /NASA POWER returned 0 of 48 expected hourly values.*coverage/s,
    )
  })

  it('refuses a PVGIS response whose rows carry no irradiance', () => {
    const body = { outputs: { tmy_hourly: Array.from({ length: 24 }, () => ({ WS10m: 2 })) } }
    expect(() => normalizeTmy(asPayload('pvgis-sarah3', body), LOCATION)).toThrow(
      /PVGIS returned 0 of 48 expected hourly values.*coverage/s,
    )
  })

  it('refuses a CSV with no recognizable irradiance column', () => {
    expect(() => parseCsvColumns('year,month,day\n2024,1,1\n', 'NSRDB')).toThrow(
      /NSRDB carries no recognizable global horizontal irradiance column/,
    )
  })

  it('refuses a CSV whose irradiance column is empty', () => {
    const csv = ['GHI,Temperature', ...Array.from({ length: 24 }, () => ',')].join('\n')
    expect(() => parseCsvColumns(csv, 'NSRDB')).toThrow(
      /NSRDB returned 0 of 48 expected hourly values.*coverage/s,
    )
  })
})

/**
 * POWER refuses a request for ten years of hourly JSON with a 422 and "please shorten your
 * requested time extent for a JSON formatted data request". Asked that way, the fallback it is at
 * an ordinary site would never answer, and beyond 85 degrees of latitude, where
 * `preferredSourceFor` puts it FIRST, nothing else is reached before it.
 *
 * A stubbed response is how that stayed invisible: the parser was tested and the request wasn't.
 * What is pinned here is the request, and specifically the two ways of getting the fix wrong.
 * Shortening the window would trade a climatology for a sample without labeling it, and a gap or
 * an overlap between the spans would raise no error and show up as a typical year weighted
 * toward whichever years were asked for twice
 */
describe('the NASA POWER window is fetched in spans its own JSON encoding will carry', () => {
  const yearsRequested = (): readonly (readonly [number, number])[] =>
    fetchJson.mock.calls.map(([, , params]) => {
      const search = params as URLSearchParams
      return [
        Number(String(search.get('start')).slice(0, 4)),
        Number(String(search.get('end')).slice(0, 4)),
      ]
    })

  beforeEach(() => {
    fetchJson.mockReset()
    // each chunk answers with one reading, keyed the way POWER keys them, so the merge is visible
    fetchJson.mockImplementation((_upstream: unknown, _path: unknown, params: URLSearchParams) =>
      Promise.resolve({
        properties: { parameter: { T2M: { [`${String(params.get('start'))}00`]: 1 } } },
      }),
    )
  })

  it('covers every year of the window exactly once, in spans of at most four', async () => {
    await fetchNasaPowerTmy({ location: LOCATION, source: 'nasa-power', signal: null })
    const spans = yearsRequested()
    expect(spans.length).toBeGreaterThan(1)
    // measured at Bergen, Singapore and Tromso: three years encode, four are refused
    for (const [first, last] of spans) expect(last - first + 1).toBeLessThanOrEqual(4)

    const covered = spans.flatMap(([first, last]) =>
      Array.from({ length: last - first + 1 }, (_unused, index) => first + index),
    )
    const expected = Array.from(
      { length: TMY_YEAR_COUNT },
      (_unused, index) => TMY_END_YEAR - TMY_YEAR_COUNT + 1 + index,
    )
    // no year missing, and none asked for twice, which would weight the typical year toward it
    expect(covered.slice().sort((a, b) => a - b)).toEqual(expected)
  })

  it('asks for whole years and stitches every chunk into one body', async () => {
    const payload = await fetchNasaPowerTmy({
      location: LOCATION,
      source: 'nasa-power',
      signal: null,
    })
    for (const [, , params] of fetchJson.mock.calls) {
      const search = params as URLSearchParams
      expect(String(search.get('start')).slice(4)).toBe('0101')
      expect(String(search.get('end')).slice(4)).toBe('1231')
    }
    const merged = payload.body as { properties: { parameter: { T2M: Record<string, number> } } }
    expect(Object.keys(merged.properties.parameter.T2M)).toHaveLength(fetchJson.mock.calls.length)
  })
})
