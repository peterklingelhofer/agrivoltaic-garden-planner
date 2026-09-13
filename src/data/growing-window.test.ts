import { describe, expect, it } from 'bun:test'
import { dailyMinimaFixture as dailyMinima, siteFixture } from '../recommend/testkit'
import type { FrostExceedanceCurve, Site } from '../types/site'
import type { Celsius, DayOfYear } from '../types/units'
import { frostExceedanceCurve } from './agronomy'
import { growingWindowFor } from './growing-window'
import { monthsInWindow } from './util'

const siteWith = (curve: FrostExceedanceCurve, southern: boolean, means: readonly number[]): Site =>
  siteFixture({
    frost: [curve],
    location: {
      ...siteFixture().location,
      latitudeDeg: (southern ? -37.8 : 42.4) as Site['location']['latitudeDeg'],
    },
    normals: { ...siteFixture().normals, monthlyMeanTempC: means.map((v) => v as Celsius) },
  })

const NORTH_MEANS = [-2, 0, 5, 11, 17, 22, 24, 23, 19, 12, 6, 0]
const SOUTH_MEANS = [24, 23, 19, 12, 6, 0, -2, 0, 5, 11, 17, 22]
const TROPICAL_MEANS = [21, 23, 27, 30, 30, 27, 25, 24, 25, 25, 22, 20]
const MELBOURNE_MEANS = [20, 20, 18, 15, 12, 9, 8, 9, 12, 14, 17, 19]

describe('the growing window a site gives', () => {
  it('runs from the last spring frost month to the first autumn frost month at Amherst', () => {
    // the fixture's curve: day 125 (5 May) to day 280 (7 October) at the usual 20% risk
    expect(growingWindowFor(siteFixture(), 20)).toEqual({ startMonth: 5, endMonth: 10 })
    // playing it safe waits for day 130 and stops at day 275, which is still May to October
    expect(growingWindowFor(siteFixture(), 10)).toEqual({ startMonth: 5, endMonth: 10 })
  })

  it('wraps past new year for a southern site', () => {
    const curve = frostExceedanceCurve(dailyMinima(8, 12, true), 0 as Celsius, true)
    // this synthetic year frosts from early June to early September, so September to June
    const window = growingWindowFor(siteWith(curve, true, SOUTH_MEANS), 20)
    expect(window).toEqual({ startMonth: 9, endMonth: 6 })
    expect(monthsInWindow(window.startMonth, window.endMonth)).toContain(1)
  })

  it('is the whole year where the record holds no frost and every month reaches 10 C', () => {
    const north = frostExceedanceCurve(dailyMinima(24, 4, false), 0 as Celsius, false)
    const south = frostExceedanceCurve(dailyMinima(24, 4, true), 0 as Celsius, true)
    expect(growingWindowFor(siteWith(north, false, TROPICAL_MEANS), 20)).toEqual({
      startMonth: 1,
      endMonth: 12,
    })
    expect(growingWindowFor(siteWith(south, true, TROPICAL_MEANS), 20)).toEqual({
      startMonth: 1,
      endMonth: 12,
    })
  })

  /**
   * Melbourne: light frosts in a few years of thirty, so the usual 20% setting names no frost
   * and the light step read "the growing season, January to December" over a place whose
   * winter months sit under 10 C. The months whose mean reaches 10 C, the usual base of a
   * growing-season degree-day count, are the season instead
   */
  it('gives a frost-free temperate site the months whose mean reaches 10 C', () => {
    const north = frostExceedanceCurve(dailyMinima(14, 6, false), 0 as Celsius, false)
    expect(growingWindowFor(siteWith(north, false, NORTH_MEANS), 20)).toEqual({
      startMonth: 4,
      endMonth: 10,
    })
    // frost in six years of thirty: a real pair at 10%, none at the 20% setting
    const south = frostExceedanceCurve(dailyMinima(12, 8, true, 6, 5), 0 as Celsius, true)
    expect(south.frostFree[10]).toBe(false)
    expect(south.frostFree[20]).toBe(true)
    expect(growingWindowFor(siteWith(south, true, MELBOURNE_MEANS), 20)).toEqual({
      startMonth: 9,
      endMonth: 5,
    })
  })

  it('gives the three warmest months where no day of the year is frost free', () => {
    const polar = frostExceedanceCurve(dailyMinima(-12, 8, false), 0 as Celsius, false)
    expect(growingWindowFor(siteWith(polar, false, NORTH_MEANS), 20)).toEqual({
      startMonth: 6,
      endMonth: 8,
    })
    const southPolar = frostExceedanceCurve(dailyMinima(-12, 8, true), 0 as Celsius, true)
    expect(growingWindowFor(siteWith(southPolar, true, SOUTH_MEANS), 20)).toEqual({
      startMonth: 12,
      endMonth: 2,
    })
  })

  it('reads the chosen percentile, so a bolder gardener can gain a month', () => {
    const curve: FrostExceedanceCurve = {
      ...siteFixture().frost[0]!,
      lastSpringFreeze: {
        10: 130 as DayOfYear,
        20: 125 as DayOfYear,
        30: 120 as DayOfYear,
        40: 115 as DayOfYear,
        50: 110 as DayOfYear,
      },
    }
    expect(growingWindowFor(siteWith(curve, false, NORTH_MEANS), 50).startMonth).toBe(4)
    expect(growingWindowFor(siteWith(curve, false, NORTH_MEANS), 20).startMonth).toBe(5)
  })
})
