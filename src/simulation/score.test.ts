import { describe, expect, it } from 'bun:test'
import { banded, type Banded, interval } from '../types/band'
import type { BedId, CropId, PlantingId } from '../types/ids'
import type { PlantingOutcome, SeasonReport } from '../types/simulation'
import type { DayOfYear, Fraction } from '../types/units'
import { FOOD_FLOOR, lerWords, SEASONS_TO_STAND, shortfallOf, standingOf } from './score'

const bandOf = (lower: number, upper: number): Banded<Fraction> =>
  banded(interval(lower as Fraction, upper as Fraction), 0.95, 'confidence', 'crop-response', [])

/** A full-yield harvest by default: the filler that costs a shortfall scenario nothing */
const outcome = (
  kind: PlantingOutcome['kind'],
  overrides: Partial<PlantingOutcome> = {},
): PlantingOutcome => ({
  bedId: 'bed-1' as BedId,
  plantingId: 'planting-1' as PlantingId,
  cropId: 'crop-1' as CropId,
  kind,
  band: null,
  realised: (kind === 'harvested' ? 1 : 0) as Fraction,
  pestPressure: 0 as Fraction,
  droughtPenalty: 0 as Fraction,
  companions: [],
  tried: [],
  explanation: '',
  ...overrides,
})

/**
 * Left unsaid, the outcomes are one harvested planting at the given share, carrying a published
 * band a tenth either side of it, so a standing read off these reports has a ratio band to read
 */
const report = (
  season: number,
  harvestIndex: number | null,
  energyShare: number | null,
  outcomes?: readonly PlantingOutcome[],
): SeasonReport => ({
  season,
  year: {
    year: null,
    label: 'a typical year',
    rainfallMm: 900,
    rainMeasured: false,
    referenceEtMm: 700,
    waterIndex: 0.2 as Fraction,
    waterLimited: false,
    gddBase10C: 1600,
    frostFreeDays: 155,
    lastSpringFreeze: 125 as DayOfYear,
    firstFallFreeze: 280 as DayOfYear,
    heatDaysAbove30C: 12,
  },
  outcomes:
    outcomes ??
    (harvestIndex === null
      ? []
      : [
          outcome('harvested', {
            realised: harvestIndex as Fraction,
            band: bandOf(harvestIndex - 0.1, harvestIndex + 0.1),
          }),
        ]),
  harvestIndex: harvestIndex as Fraction | null,
  energyKwh: energyShare === null ? null : 1000,
  energyShare: energyShare as Fraction | null,
  advice: { id: 'status', text: '', bedId: null },
})

const seasons = (food: number | null, energy: number | null, count = SEASONS_TO_STAND) =>
  Array.from({ length: count }, (_, index) => report(index + 1, food, energy))

/** The same outcomes, repeated across every one of the seasons the standing is read from */
const seasonsWithOutcomes = (
  outcomes: readonly PlantingOutcome[],
  count = SEASONS_TO_STAND,
): readonly SeasonReport[] =>
  Array.from({ length: count }, (_, index) => report(index + 1, 0.4, 0.6, outcomes))

describe('where the garden stands', () => {
  it('reads nothing into fewer seasons than the rule asks for', () => {
    const standing = standingOf(seasons(0.8, 0.6, SEASONS_TO_STAND - 1))
    expect(standing.complete).toBe(false)
    expect(standing.verdict).toMatch(/of 5 seasons/)
    expect(standing.ler?.interval.lower).toBeCloseTo(1.3, 6)
    expect(standing.ler?.interval.upper).toBeCloseTo(1.5, 6)
  })

  it('sums the crop partial and the electricity partial, the way the designer does', () => {
    const standing = standingOf(seasons(0.7, 0.8))
    expect(standing.food).toBeCloseTo(0.7, 6)
    expect(standing.energy).toBeCloseTo(0.8, 6)
    // the published band a tenth either side of 0.7, plus the electricity term
    expect(standing.ler?.interval.lower).toBeCloseTo(1.4, 6)
    expect(standing.ler?.interval.upper).toBeCloseTo(1.6, 6)
    expect(standing.foodFloorHeld).toBe(true)
    expect(standing.verdict).toMatch(/share the ground/)
    expect(standing.verdict).toContain('Land equivalent ratio 1.4 to 1.6 (Dupraz et al. 2011)')
    expect(standing.verdict).not.toMatch(/\d\.\d\d/)
  })

  it('bands the ratio from the published bands the seasons carried, never from the draws', () => {
    const outcomes = [
      outcome('harvested', { realised: 0.6 as Fraction, band: bandOf(0.5, 0.9) }),
      // never grew, so it carries no band and counts as zero at both bounds
      outcome('refused'),
    ]
    // `seasonsWithOutcomes` fixes the electricity share at 0.6
    const standing = standingOf(seasonsWithOutcomes(outcomes))
    expect(standing.ler?.interval.lower).toBeCloseTo((0.5 + 0) / 2 + 0.6, 6)
    expect(standing.ler?.interval.upper).toBeCloseTo((0.9 + 0) / 2 + 0.6, 6)
    expect(standing.ler?.confidence).toBe(0.95)
    expect(standing.ler?.intervalKind).toBe('confidence')
    expect(standing.ler?.dominantSource).toBe('crop-response')
  })

  it('says the ratio to one decimal as a range, and as one figure where the bounds meet', () => {
    expect(lerWords(bandOf(1.1234, 1.4321))).toBe('1.1 to 1.4')
    expect(lerWords(bandOf(1.04, 1.06))).toBe('1.0 to 1.1')
    expect(lerWords(bandOf(0.6, 0.6))).toBe('0.6')
  })

  it('refuses to let a solar farm win by taking every bed', () => {
    const standing = standingOf(seasons(FOOD_FLOOR - 0.1, 1.3))
    expect(standing.ler?.interval.lower).toBeGreaterThan(1)
    expect(standing.foodFloorHeld).toBe(false)
    expect(standing.verdict).toMatch(/shade the beds too much/)
  })

  it('has no ratio to offer an ordinary garden, or an empty one', () => {
    expect(standingOf(seasons(0.9, null)).ler).toBeNull()
    expect(standingOf(seasons(0.9, null)).verdict).toMatch(/no ratio to report/)
    expect(standingOf(seasons(null, 0.9)).food).toBeNull()
    expect(standingOf(seasons(null, 0.9)).verdict).toMatch(/nothing in the ground/)
    expect(standingOf([]).seasons).toBe(0)
  })

  it('averages only the seasons that had the term to average', () => {
    const mixed = [report(1, 0.8, null), report(2, null, 0.7), report(3, 0.6, 0.5)]
    const standing = standingOf(mixed)
    expect(standing.food).toBeCloseTo(0.7, 6)
    expect(standing.energy).toBeCloseTo(0.6, 6)
  })
})

describe('shortfallOf: what each cause cost, pooled over the reports', () => {
  it('reads a share of every planned planting for the causes that never grew', () => {
    const outcomes = [
      outcome('refused'),
      outcome('refused'),
      outcome('frosted'),
      outcome('harvested'),
    ]
    const shortfall = shortfallOf([report(1, 0.5, 0.5, outcomes)])
    expect(shortfall.rotation).toBeCloseTo(0.5, 6)
    expect(shortfall.frost).toBeCloseTo(0.25, 6)
    expect(shortfall.climateSoil).toBe(0)
    expect(shortfall.unripe).toBe(0)
    expect(shortfall.shade).toBe(0)
  })

  it('reads pests, drought and the rest off only the harvested plantings', () => {
    const outcomes = [
      outcome('harvested', {
        realised: 0.6 as Fraction,
        pestPressure: 0.5 as Fraction,
        droughtPenalty: 0.1 as Fraction,
      }),
      outcome('refused'),
    ]
    const shortfall = shortfallOf([report(1, 0.5, 0.5, outcomes)])
    // pestYieldLoss(0.5) = 0.5 * the app's own pest-loss-at-full-pressure scale, 0.4 -> 0.2
    expect(shortfall.pests).toBeCloseTo(0.2, 6)
    expect(shortfall.drought).toBeCloseTo(0.1, 6)
    // shortfall 1 - 0.6 = 0.4, minus 0.2 pests minus 0.1 drought leaves 0.1 for the shade band
    expect(shortfall.light).toBeCloseTo(0.1, 6)
  })

  it('is all zero with nothing planned', () => {
    expect(shortfallOf([report(1, null, null, [])])).toEqual({
      rotation: 0,
      climateSoil: 0,
      frost: 0,
      unripe: 0,
      shade: 0,
      pests: 0,
      drought: 0,
      light: 0,
    })
  })
})

describe('the failing verdict names its largest cause', () => {
  it('names the rotation rule when refusals are what cost the most', () => {
    const outcomes = [
      ...Array.from({ length: 12 }, () => outcome('refused')),
      ...Array.from({ length: 21 }, () => outcome('harvested')),
    ]
    const standing = standingOf(seasonsWithOutcomes(outcomes))
    expect(standing.verdict).toMatch(/rotation rule/)
    expect(standing.verdict).toContain('12 of 33 plantings a season on average')
  })

  it('names frost when frost is what cost the most', () => {
    const outcomes = [
      ...Array.from({ length: 15 }, () => outcome('frosted')),
      ...Array.from({ length: 18 }, () => outcome('harvested')),
    ]
    const standing = standingOf(seasonsWithOutcomes(outcomes))
    expect(standing.verdict).toMatch(/Most of the loss was frost/)
  })

  it('names crops that ran out of season when that is what cost the most', () => {
    const outcomes = [
      ...Array.from({ length: 10 }, () => outcome('unripe')),
      ...Array.from({ length: 5 }, () => outcome('harvested')),
    ]
    const standing = standingOf(seasonsWithOutcomes(outcomes))
    expect(standing.verdict).toMatch(/ran out of season/)
  })

  it('names pests when the harvested plantings lost most of their yield to pests', () => {
    const outcomes = Array.from({ length: 10 }, () =>
      outcome('harvested', { realised: 0.6 as Fraction, pestPressure: 1 as Fraction }),
    )
    const standing = standingOf(seasonsWithOutcomes(outcomes))
    expect(standing.verdict).toMatch(/Most of the loss was pests/)
  })

  it('names dry soil when the harvested plantings lost most of their yield to drought', () => {
    const outcomes = Array.from({ length: 10 }, () =>
      outcome('harvested', { realised: 0.5 as Fraction, droughtPenalty: 0.5 as Fraction }),
    )
    const standing = standingOf(seasonsWithOutcomes(outcomes))
    expect(standing.verdict).toMatch(/Most of the loss was dry soil/)
  })

  it('falls back to the panels sentence for shade, and for a climate or soil gate', () => {
    const shaded = standingOf(
      seasonsWithOutcomes(Array.from({ length: 10 }, () => outcome('too-dark'))),
    )
    expect(shaded.verdict).toMatch(/shade the beds too much/)
    const gated = standingOf(
      seasonsWithOutcomes(Array.from({ length: 10 }, () => outcome('climate'))),
    )
    expect(gated.verdict).toMatch(/shade the beds too much/)
  })
})
