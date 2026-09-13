import { describe, expect, it } from 'bun:test'
import {
  chillingHours,
  dynamicChillPortions,
  frostExceedanceCurve,
  gddDay,
  utahChillUnits,
} from './agronomy'
import { dailyMinimaFixture } from '../recommend/testkit'
import type { Celsius } from '../types/units'

const celsius = (value: number): Celsius => value as Celsius

const constant = (temperature: number, hours: number): Float32Array =>
  new Float32Array(hours).fill(temperature)

describe('growing degree days', () => {
  it('clips the daily minimum up to the base temperature', () => {
    // without the horizontal cutoff this would be (0 + 20)/2 - 10 = 0
    expect(gddDay(celsius(0), celsius(20), celsius(10), null)).toBeCloseTo(5)
  })

  it('applies the upper cutoff to the daily maximum', () => {
    expect(gddDay(celsius(15), celsius(40), celsius(10), celsius(30))).toBeCloseTo(12.5)
    expect(gddDay(celsius(15), celsius(40), celsius(10), null)).toBeCloseTo(17.5)
  })

  it('never returns a negative accumulation', () => {
    expect(gddDay(celsius(-10), celsius(2), celsius(10), null)).toBe(0)
  })
})

describe('chill models', () => {
  it('counts chilling hours only inside the Weinberger band', () => {
    expect(chillingHours(constant(5, 100))).toBe(100)
    expect(chillingHours(constant(-1, 100))).toBe(0)
    expect(chillingHours(constant(8, 100))).toBe(0)
  })

  it('gives Utah units negative weight for warm hours', () => {
    expect(utahChillUnits(constant(5, 100))).toBeCloseTo(100)
    expect(utahChillUnits(constant(20, 100))).toBeCloseTo(-100)
    expect(utahChillUnits(constant(14, 100))).toBeCloseTo(0)
  })

  it('accumulates chill portions irreversibly under the Dynamic model', () => {
    const portions = dynamicChillPortions(constant(5, 1000))
    expect(portions).toBeGreaterThan(0)
    // a warm spell after accumulation cannot destroy the stable fraction
    const withWarmSpell = new Float32Array(1200)
    withWarmSpell.fill(5, 0, 1000)
    withWarmSpell.fill(22, 1000, 1200)
    expect(dynamicChillPortions(withWarmSpell)).toBeGreaterThanOrEqual(portions * 0.99)
  })

  it('produces three values that are not interconvertible', () => {
    const cold = constant(4, 1500)
    const mild = new Float32Array(1500)
    for (let index = 0; index < mild.length; index += 1) {
      mild[index] = index % 24 < 8 ? 6 : 17
    }
    const ratios = [cold, mild].map(
      (series) => chillingHours(series) / Math.max(dynamicChillPortions(series), 1e-6),
    )
    const [coldRatio = 0, mildRatio = 0] = ratios
    // if the metrics were interconvertible these two ratios would agree
    expect(Math.abs(coldRatio - mildRatio)).toBeGreaterThan(1)
  })
})

describe('frost exceedance curves', () => {
  const years = Array.from({ length: 30 }, (_, year) => {
    const series = new Float32Array(365)
    for (let day = 0; day < 365; day += 1) {
      const springEnd = 100 + year
      const fallStart = 290 - year
      series[day] = day < springEnd || day > fallStart ? -3 : 12
    }
    return series
  })

  it('orders the conservative percentile later in spring and earlier in autumn', () => {
    const curve = frostExceedanceCurve(years, 0 as Celsius)
    expect(curve.lastSpringFreeze[10]).toBeGreaterThanOrEqual(curve.lastSpringFreeze[50])
    expect(curve.firstFallFreeze[10]).toBeLessThanOrEqual(curve.firstFallFreeze[50])
    expect(curve.frostFreeDays[10]).toBeLessThanOrEqual(curve.frostFreeDays[50])
  })

  it('keeps every frost-free span non-negative', () => {
    const curve = frostExceedanceCurve(years, 0 as Celsius)
    for (const percentile of [10, 20, 30, 40, 50] as const) {
      expect(curve.frostFreeDays[percentile]).toBeGreaterThanOrEqual(0)
      expect(curve.frostFree[percentile]).toBe(false)
    }
    expect(curve.frostYears).toBe(30)
  })

  /**
   * Pune: no day of the thirty years at or below the threshold. The pick used to land on the
   * two sentinel days and print as "frost ends around 1 Jan and returns around 31 Dec", so a
   * percentile whose pick is the sentinel pair is marked instead of read as two frosts
   */
  it('marks every percentile frost free where no year crossed the threshold', () => {
    const curve = frostExceedanceCurve(dailyMinimaFixture(16, 8, false), 0 as Celsius)
    expect(curve.frostYears).toBe(0)
    for (const percentile of [10, 20, 30, 40, 50] as const) {
      expect(curve.frostFree[percentile]).toBe(true)
      expect(curve.frostFreeDays[percentile]).toBe(365)
    }
  })

  /**
   * Melbourne: light frosts in some years, so the safest setting names a real pair that wraps
   * the year end and the usual one names none. The mark is per percentile for that reason
   */
  it('names a real wrapped pair at one percentile and no frost at another, south of the equator', () => {
    const curve = frostExceedanceCurve(dailyMinimaFixture(12, 8, true, 6, 5), 0 as Celsius, true)
    expect(curve.frostYears).toBe(6)
    expect(curve.frostFree[10]).toBe(false)
    // the last spring frost falls in August and the first autumn one the following June
    expect(curve.lastSpringFreeze[10]).toBeGreaterThan(curve.firstFallFreeze[10])
    expect(curve.frostFreeDays[10]).toBe(
      (curve.firstFallFreeze[10] - curve.lastSpringFreeze[10] + 365) % 365,
    )
    expect(curve.frostFreeDays[10]).toBeGreaterThan(300)
    for (const percentile of [20, 30, 40, 50] as const) {
      expect(curve.frostFree[percentile]).toBe(true)
      expect(curve.frostFreeDays[percentile]).toBe(365)
    }
  })
})
