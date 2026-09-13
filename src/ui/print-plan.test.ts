import { describe, expect, it } from 'bun:test'
import { makeArray, makeBed, makePlot } from '../state/defaults'
import { withDerived } from '../state/derive'
import { polygonOf, rectangleRing, vec2 } from '../state/geom'
import { bedId, cropId, plantingId } from '../types/ids'
import { degrees, meters } from '../types/units'
import { frostFreeSiteFixture, siteFixture } from '../recommend/testkit'
import { buildPrintSheet, compassLabel, panelLine } from './print-plan'

const lettuce = {
  id: cropId('lactuca-sativa'),
  taxonomy: { commonNames: ['lettuce'] },
} as unknown as Parameters<typeof buildPrintSheet>[0]['catalog'][number]

describe('the printed plan', () => {
  it('names the place, sizes the plot and the beds, and lists every planting with its dates', () => {
    const bed = makeBed(1, {
      footprint: polygonOf(rectangleRing(vec2(0, 0), 8, 1.4)),
      plantings: [
        {
          id: plantingId('p1'),
          bedId: bedId('bed-1'),
          cropId: cropId('lactuca-sativa'),
          cultivarId: null,
          role: 'target-crop',
          tier: 'herb-ground',
          sowDay: 100,
          harvestStartDay: 150,
          harvestEndDay: 170,
          plantCount: 42,
        } as never,
      ],
    })
    const plot = { ...makePlot(), beds: [bed] }
    const sheet = buildPrintSheet({
      locationLabel: 'Arlington, Virginia',
      site: null,
      frostPercentile: 20,
      plot,
      catalog: [lettuce],
      calendars: [],
      reports: [],
      today: 1,
    })
    expect(sheet.title).toBe('Garden plan for Arlington, Virginia')
    expect(sheet.season).toBeNull()
    expect(sheet.plot).toMatch(/^32\.0 x 24\.0 m \(768 m²\), 1 bed$/)
    expect(sheet.panels).toHaveLength(1)
    expect(sheet.beds[0]?.label).toBe('Bed 1')
    expect(sheet.beds[0]?.size).toContain('8.0 x 1.4 m (11.2 m²)')
    expect(sheet.beds[0]?.size).toContain('pH 6.5')
    expect(sheet.beds[0]?.plantings[0]).toEqual({
      crop: 'lettuce',
      line: 'Sow 10 Apr, harvest 30 May to 19 Jun, about 40 plants',
    })
    // no calendars, so no dated jobs and no seasons yet
    expect(sheet.jobs).toEqual([])
    expect(sheet.standing).toBeNull()
  })

  it('prints the frost dates where the record holds them and says the whole year where it holds none', () => {
    const sheetFor = (site: Parameters<typeof buildPrintSheet>[0]['site']): string | null =>
      buildPrintSheet({
        locationLabel: 'x',
        site,
        frostPercentile: 20,
        plot: null,
        catalog: [],
        calendars: [],
        reports: [],
        today: 1,
      }).season
    expect(sheetFor(siteFixture())).toBe(
      'Frost usually ends around 5 May and returns around 7 Oct: about 155 growing days, with one year in 5 seeing frost outside those dates',
    )
    expect(sheetFor(frostFreeSiteFixture())).toBe(
      'No frost in the thirty-year record for this place, 1991 to 2020, so the growing season is the whole year. The records come from Open-Meteo',
    )
  })

  it('says how the panels stand in the words the panel uses', () => {
    const array = withDerived({
      ...makeArray(1),
      geometry: { ...makeArray(1).geometry, rowAzimuthDeg: degrees(90), pitchM: meters(9) },
    })
    expect(panelLine(array)).toBe(
      '3 rows of 12 panels running east to west, 9.0 m apart, 2.5 m of headroom, fixed at 25 degrees facing south',
    )
    expect(compassLabel(0)).toBe('north')
    expect(compassLabel(135)).toBe('south-east')
    expect(compassLabel(359)).toBe('north')
  })
})
