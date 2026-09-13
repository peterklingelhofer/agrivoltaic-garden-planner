import { describe, expect, it } from 'bun:test'
import { siteFixture } from '../recommend/testkit'
import type { Site } from '../types/site'
import { DEFAULT_FROST_PERCENTILE, siteForYear } from './site'
import { measuredYearFixture } from './testkit'

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
