import { describe, expect, it } from 'bun:test'
import type { BedId, CropId, PlantingId } from '../types/ids'
import type { OutcomeKind, PlantingOutcome, SeasonReport } from '../types/simulation'
import type { DayOfYear, Fraction } from '../types/units'
import { approxKwh, approxPercent, money, seasonLine } from './coach'

const outcome = (kind: OutcomeKind, index: number): PlantingOutcome => ({
  bedId: 'bed-a' as BedId,
  plantingId: `p-${String(index)}` as PlantingId,
  cropId: 'tomato' as CropId,
  kind,
  band: null,
  realised: 0 as Fraction,
  pestPressure: 0 as Fraction,
  droughtPenalty: 0 as Fraction,
  companions: [],
  tried: [],
  explanation: '',
})

const report = (
  kinds: readonly OutcomeKind[],
  harvestIndex: number | null,
  energyKwh: number | null,
): SeasonReport => ({
  season: 1,
  year: {
    year: 2018,
    label: '2018',
    rainfallMm: 400,
    rainMeasured: true,
    referenceEtMm: 900,
    waterIndex: 0.6 as Fraction,
    waterLimited: true,
    gddBase10C: 1800,
    frostFreeDays: 150,
    lastSpringFreeze: 120 as DayOfYear,
    firstFallFreeze: 280 as DayOfYear,
    heatDaysAbove30C: 20,
  },
  outcomes: kinds.map(outcome),
  harvestIndex: harvestIndex as Fraction | null,
  energyKwh,
  energyShare: null,
  advice: { id: 'status', text: '', bedId: null },
})

describe('one season in one line', () => {
  it('gives the harvest, the electricity and what did not come in', () => {
    const line = seasonLine(report(['harvested', 'frosted', 'frosted'], 0.42, 3900))
    expect(line).toBe('about 40% of full yield, about 3,900 kWh, lost to frost (2 of 3)')
  })

  it('names the commonest reason and not every reason', () => {
    const line = seasonLine(report(['too-dark', 'too-dark', 'frosted'], 0.1, null))
    expect(line).toContain("below the crop's light minimum (2 of 3)")
    expect(line).not.toContain('frost')
  })

  it('says nothing about panels there are none of, or losses there were none of', () => {
    expect(seasonLine(report(['harvested'], 0.9, null))).toBe('about 90% of full yield')
  })

  it('reads as a sentence for the kinds whose label is a clause', () => {
    expect(seasonLine(report(['climate', 'climate', 'harvested'], 0.3, null))).toBe(
      'about 30% of full yield, not planted, climate limit (2 of 3)',
    )
  })

  it('does not report a harvest from a season with nothing in the ground', () => {
    expect(seasonLine(report([], null, 1200))).toBe('nothing in the ground, about 1,200 kWh')
  })
})

/**
 * Money is the one figure in this mode nobody can check against their own garden, so it says only
 * as much as the benchmark behind it supports and rounds where it stops supporting it
 */
describe('money, said as loosely as it is known', () => {
  // the runtime's own en-US format, which is what the suite and the browsers under test run in
  it('rounds to two figures so a guess never reads as a quote', () => {
    expect(money(4712, 'USD')).toBe('$4,700')
    expect(money(5981.44, 'USD')).toBe('$6,000')
    expect(money(365.76, 'USD')).toBe('$370')
    expect(money(14.3, 'USD')).toBe('$14')
  })

  it('separates thousands and never shows cents', () => {
    expect(money(1_234_567, 'USD')).toBe('$1,200,000')
    expect(money(0, 'USD')).toBe('$0')
    expect(money(Number.NaN, 'USD')).toBe('$0')
  })

  it('writes a typed currency in its own symbol, to the same two figures', () => {
    expect(money(4712, 'EUR')).toBe('€4,700')
    expect(money(365.76, 'GBP')).toBe('£370')
  })

  it('falls back to the code before the figure when the runtime has no format for it', () => {
    expect(money(1234, 'XX')).toBe('XX 1,200')
    expect(money(0, 'XX')).toBe('XX 0')
  })

  it('says a harvest share to the nearest five, with about', () => {
    expect(approxPercent(0.62)).toBe('about 60%')
    expect(approxPercent(0.42)).toBe('about 40%')
  })

  it('says a year of electricity to the same two figures, with about', () => {
    expect(approxKwh(37_850)).toBe('about 38,000 kWh')
    expect(approxKwh(4_120)).toBe('about 4,100 kWh')
    expect(approxKwh(985)).toBe('about 990 kWh')
    expect(approxKwh(0)).toBe('about 0 kWh')
  })
})
