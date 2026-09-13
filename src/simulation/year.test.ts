import { describe, expect, it } from 'bun:test'
import { measuredYearFixture } from '../data/testkit'
import { siteFixture, tmyFixture } from '../recommend/testkit'
import { chooseYear, measuredSeasonYear, typicalYear, YEAR_CHOICES } from './year'

describe('the years a season can be run on', () => {
  const site = siteFixture()
  const typical = typicalYear(site, tmyFixture())
  const years = [
    measuredSeasonYear(site, measuredYearFixture({ year: 2018, meanC: 12, rainMmPerHour: 0.02 })),
    measuredSeasonYear(site, measuredYearFixture({ year: 2019, meanC: 8, rainMmPerHour: 0.15 })),
    measuredSeasonYear(site, measuredYearFixture({ year: 2020, meanC: 10, rainMmPerHour: 0.08 })),
  ]

  it('summarises the typical year as no single year, off the site it was given', () => {
    expect(typical.summary.year).toBeNull()
    expect(typical.summary.gddBase10C).toBe(site.seasonGdd.base10C)
    expect(typical.summary.waterLimited).toBe(site.waterLimitation.limited)
    expect(typical.summary.rainMeasured).toBe(false)
  })

  it('summarises a measured year off the site as it was that year', () => {
    const hot = years[0]
    expect(hot?.summary.year).toBe(2018)
    expect(hot?.summary.label).toBe('2018')
    expect(hot?.summary.rainMeasured).toBe(true)
    expect(hot?.summary.rainfallMm).toBeCloseTo(0.02 * 8760, 0)
    expect(hot?.site.normals.normalsPeriod).toBe('2018')
  })

  it('names the extremes by the site own measures', () => {
    expect(chooseYear('hottest', typical, years, 0).summary.year).toBe(2018)
    expect(chooseYear('coolest', typical, years, 0).summary.year).toBe(2019)
    expect(chooseYear('driest', typical, years, 0).summary.year).toBe(2018)
    expect(chooseYear('wettest', typical, years, 0).summary.year).toBe(2019)
  })

  it('draws a random year from the record with the number it is handed, and replays it', () => {
    expect(chooseYear('random', typical, years, 0).summary.year).toBe(2018)
    expect(chooseYear('random', typical, years, 0.99).summary.year).toBe(2020)
    expect(chooseYear('random', typical, years, 0.5)).toBe(
      chooseYear('random', typical, years, 0.5),
    )
  })

  it('falls back to the typical year where the source kept no measured ones', () => {
    for (const choice of YEAR_CHOICES) {
      expect(chooseYear(choice, typical, [], 0.3)).toBe(typical)
    }
  })
})
