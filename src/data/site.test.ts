import { beforeEach, describe, expect, it, mock } from 'bun:test'
import { vi } from '../../test/vi'
import { siteFixture } from '../recommend/testkit'
import type { LatLon } from '../types/geo'
import type { Site } from '../types/site'
import { measuredYearFixture } from './testkit'

const fetchJson = vi.fn()

/* captured before the mock is installed, so the spread carries the real module */
const actualHttp = await import('./http')
mock.module('./http', () => ({ ...actualHttp, fetchJson }))

const { DEFAULT_FROST_PERCENTILE, resolveSite, siteForYear } = await import('./site')
const { resetStaticLayerCache } = await import('./static-layers')

const spring = (site: Site): number =>
  site.frost[0]?.lastSpringFreeze[DEFAULT_FROST_PERCENTILE] ?? Number.NaN
const frostFree = (site: Site): number =>
  site.frost[0]?.frostFreeDays[DEFAULT_FROST_PERCENTILE] ?? Number.NaN

describe('the site as it was in one measured year', () => {
  const base = siteFixture()

  it('reads the frost dates off the year rather than off the thirty-year normals', () => {
    const cold = siteForYear(base, measuredYearFixture({ year: 2019, meanC: 7, seasonalC: 14 }))
    const mild = siteForYear(base, measuredYearFixture({ year: 2020, meanC: 11, seasonalC: 12 }))
    expect(spring(cold)).toBeGreaterThan(spring(mild))
    expect(frostFree(cold)).toBeLessThan(frostFree(mild))
    // one year is one sample, so the curve is the same two dates at every percentile
    const curve = cold.frost[0]
    expect(curve?.lastSpringFreeze[10]).toBe(curve?.lastSpringFreeze[50])
    expect(curve?.firstFallFreeze[10]).toBe(curve?.firstFallFreeze[50])
  })

  it('accumulates the heat the year actually had', () => {
    const hot = siteForYear(base, measuredYearFixture({ meanC: 13 }))
    const cool = siteForYear(base, measuredYearFixture({ meanC: 7 }))
    expect(hot.seasonGdd.base10C).toBeGreaterThan(cool.seasonGdd.base10C)
    expect(hot.heatDaysAbove30C).toBeGreaterThan(cool.heatDaysAbove30C)
    expect(hot.normals.normalsPeriod).toBe('2021')
    expect(hot.normals.monthlyMeanTempC[6]).toBeGreaterThan(hot.normals.monthlyMeanTempC[0] ?? 0)
    expect(hot.normals.monthlyMaxTempC[6]).toBeGreaterThan(hot.normals.monthlyMinTempC[6] ?? 0)
  })

  it('balances water on the rain that fell, and on the normals where none was measured', () => {
    const dry = siteForYear(base, measuredYearFixture({ rainMmPerHour: 0 }))
    const wet = siteForYear(base, measuredYearFixture({ rainMmPerHour: 0.2 }))
    const unknown = siteForYear(base, measuredYearFixture({}))
    expect(dry.waterLimitation.rainfallMm).toBe(0)
    expect(dry.waterLimitation.limited).toBe(true)
    expect(wet.waterLimitation.rainfallMm).toBeCloseTo(1752, 0)
    expect(wet.waterLimitation.limited).toBe(false)
    expect(unknown.normals.monthlyPrecipMm).toEqual(base.normals.monthlyPrecipMm)
    const normal = base.normals.monthlyPrecipMm.reduce((total, value) => total + value, 0)
    expect(unknown.waterLimitation.rainfallMm).toBeCloseTo(normal, 0)
  })

  it('works the thirst out by Penman-Monteith when the year carries humidity and wind', () => {
    const year = siteForYear(base, measuredYearFixture({}))
    expect(year.waterLimitation.method).toBe('fao56-penman-monteith')
    // a temperate year's reference evapotranspiration: a year with no diurnal swing gives about a
    // seventh of it
    expect(year.waterLimitation.referenceEtMm).toBeGreaterThan(400)
    expect(year.waterLimitation.referenceEtMm).toBeLessThan(1200)
  })

  it('keeps what belongs to the place and not to the year', () => {
    const year = siteForYear(base, measuredYearFixture({}))
    expect(year.koppenCode).toBe(base.koppenCode)
    expect(year.soil).toBe(base.soil)
    expect(year.hardiness).toBe(base.hardiness)
    expect(year.location).toBe(base.location)
    expect(year.botanicalArea).toBe(base.botanicalArea)
  })
})

const LOCATION = { latitudeDeg: 42.37, longitudeDeg: -72.52 } as LatLon

const DAYS_PER_YEAR = 365
const NORMALS_YEARS = 30

const stamps = (): readonly string[] => {
  const out: string[] = []
  for (let year = 1991; year <= 2020; year += 1) {
    for (let day = 1; day <= DAYS_PER_YEAR; day += 1) {
      out.push(`${String(year)}-01-${String(day).padStart(2, '0')}`)
    }
  }
  return out
}

/** The exact shape Open-Meteo returns for the daily normals, with or without a named zone */
const dailyBody = (fill: number): unknown => {
  const time = stamps()
  const series = Array.from({ length: NORMALS_YEARS * DAYS_PER_YEAR }, () => fill)
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

const HOURS_PER_TMY = 8760

const hourlyBody = (fill: number, shortwave: number): unknown => ({
  hourly: {
    time: Array.from(
      { length: HOURS_PER_TMY },
      (_, i) => `2024-01-01T${String(i % 24).padStart(2, '0')}:00`,
    ),
    shortwave_radiation: Array.from({ length: HOURS_PER_TMY }, () => shortwave),
    temperature_2m: Array.from({ length: HOURS_PER_TMY }, () => fill),
  },
})

beforeEach(() => {
  fetchJson.mockReset()
  resetStaticLayerCache()
  // the bundled rasters are absent in the test environment, so the loader derives
  globalThis.fetch = vi.fn().mockResolvedValue({ ok: false }) as unknown as typeof fetch
})

/**
 * `resolveSite` marks which zone it got and how it got there: `timezoneBasis` reads 'upstream'
 * where the daily normals named one and 'nearest-zone' where nothing did and the nearest
 * zone.tab city stood in. Amherst MA answers to `America/New_York` either way, so the two tests
 * below share a result and differ only in how it was reached
 */
describe('resolveSite marks whether the zone came from the weather service or the nearest zone.tab city', () => {
  it('marks upstream when the daily normals name a zone', async () => {
    fetchJson.mockImplementation((upstream: unknown, _path: unknown, params: URLSearchParams) => {
      if (upstream === 'open-meteo') {
        return Promise.resolve(
          params.has('daily')
            ? {
                ...(dailyBody(12) as object),
                timezone: 'America/New_York',
                utc_offset_seconds: -18000,
              }
            : hourlyBody(12, 200),
        )
      }
      if (upstream === 'open-elevation') return Promise.resolve({ results: [{ elevation: 50 }] })
      return Promise.reject(new Error(`${String(upstream)} is not answered here`))
    })
    const { site } = await resolveSite(LOCATION, 'Amherst', null)
    expect(site.timezone).toBe('America/New_York')
    expect(site.timezoneBasis).toBe('upstream')
  })

  it('marks nearest-zone when no upstream names one', async () => {
    fetchJson.mockImplementation((upstream: unknown, _path: unknown, params: URLSearchParams) => {
      if (upstream === 'open-meteo') {
        return Promise.resolve(params.has('daily') ? dailyBody(12) : hourlyBody(12, 200))
      }
      if (upstream === 'open-elevation') return Promise.resolve({ results: [{ elevation: 50 }] })
      return Promise.reject(new Error(`${String(upstream)} is not answered here`))
    })
    const { site } = await resolveSite(LOCATION, 'Amherst', null)
    expect(site.timezone).toBe('America/New_York')
    expect(site.timezoneBasis).toBe('nearest-zone')
  })
})
