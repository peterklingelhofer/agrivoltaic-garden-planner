import { describe, expect, it } from 'bun:test'
import { banded, interval, unsafeBandMidpoint } from '../types/band'
import type { Banded } from '../types/band'
import type { Crop } from '../types/crop'
import type { Bed } from '../types/garden'
import { cropId, bedId } from '../types/ids'
import type { PolycultureSuggestion } from '../types/polyculture'
import type { CropRecommendation, YieldEstimate } from '../types/recommend'
import type { Fraction } from '../types/units'
import {
  NATIVE_REGION_UNKNOWN,
  POINT_ESTIMATE_REFUSED,
  approxCount,
  approxPercent,
  approxPlural,
  assertBanded,
  attributionLabel,
  bedName,
  contributionFigure,
  cropName,
  cropResponseLabel,
  cropTieNote,
  dependenceNote,
  explainLimitingFactor,
  forageNote,
  nativeNote,
  nearestFivePercent,
  formatBandPercent,
  formatYieldEstimate,
  formatRsr,
  suggestionTieNote,
  tiedLeadingCropCount,
  tiedLeadingSuggestionCount,
  weakestScoreTerm,
  formatCelsius,
  formatRainMm,
  rootDepthRemedy,
  ROOT_DEPTH_RAISE_CAP_M,
} from './format'

const band = banded(
  interval(0.67 as Fraction, 1.56 as Fraction),
  0.95,
  'confidence',
  'crop-response',
  [
    { source: 'crop-response', halfWidthFraction: 0.44 as Fraction, note: 'Laub 95% CI' },
    { source: 'seasonal-par', halfWidthFraction: 0.1 as Fraction, note: 'seasonal PAR' },
  ],
)

const estimate: YieldEstimate = {
  cropId: cropId('solanum-lycopersicum'),
  bedId: bedId('bed-1'),
  laubGroup: 'fruity-vegetables',
  seasonCumulativeRsr: 0.4 as Fraction,
  relativeYield: band,
  absoluteYieldKgPerM2Season: null,
  waterLimited: false,
  caveats: [],
}

describe('plant counts the way a grower says them', () => {
  it('is exact to twenty and rounded past it, with "about" to say so', () => {
    expect(approxCount(1)).toBe('1')
    expect(approxCount(20)).toBe('20')
    expect(approxCount(21)).toBe('about 20')
    expect(approxCount(87)).toBe('about 90')
    expect(approxCount(266)).toBe('about 270')
    expect(approxCount(476)).toBe('about 480')
    expect(approxCount(1234)).toBe('about 1200')
    expect(approxPlural(1, 'plant', 'plants')).toBe('1 plant')
    expect(approxPlural(266, 'plant', 'plants')).toBe('about 270 plants')
  })

  it('says a harvest share to the nearest five percent, with "about" to say so', () => {
    expect(approxPercent(0.62)).toBe('about 60%')
    expect(approxPercent(0.625)).toBe('about 65%')
    expect(approxPercent(0.98)).toBe('about 100%')
    expect(approxPercent(0)).toBe('about 0%')
    expect(nearestFivePercent(0.734)).toBe(75)
    expect(nearestFivePercent(0.71)).toBe(70)
  })
})

describe('band formatting', () => {
  it('renders an interval, never a single number', () => {
    const text = formatBandPercent(band)
    expect(text).toBe('67-156%')
    expect(text).toContain('-')
  })

  it('attributes the band to the crop term', () => {
    expect(formatYieldEstimate(estimate)).toContain('crop response')
    expect(attributionLabel('crop-response')).toContain('Laub')
  })

  it('names the curve and its study count in the attribution', () => {
    expect(formatYieldEstimate(estimate)).toContain(
      'dominated by crop response: the fruity vegetables curve, 3 studies (Laub et al. 2022)',
    )
    expect(cropResponseLabel('leafy-vegetables')).toBe(
      'crop response: the leafy vegetables curve, 4 studies (Laub et al. 2022)',
    )
    expect(cropResponseLabel('grain-legumes')).toBe(
      'crop response: the grain legumes curve, 14 studies (Laub et al. 2022)',
    )
  })

  /**
   * The one uncertainty source that is not about light, weather or ground. Without an arm of its
   * own it would fall to the final else, which labels everything it doesn't recognize 'soil and
   * water', so a build-cost band would read as dominated by soil moisture
   */
  it('names the mount structure a build cost spans rather than calling it soil and water', () => {
    expect(attributionLabel('mount-structure')).toBe('mount structure (Horowitz et al. 2020)')
    expect(attributionLabel('soil-water')).toBe('soil and water')
  })

  /** Crowding scales the band down, so its figure is the reduction and never a half-width */
  it('names crowding as this app’s own figure and prints its share as a reduction', () => {
    expect(attributionLabel('crowding')).toBe("crowding at this spacing: this app's own figure")
    expect(
      contributionFigure({ source: 'crowding', halfWidthFraction: 0.37 as Fraction, note: '' }),
    ).toBe('-37%')
    expect(
      contributionFigure({ source: 'seasonal-par', halfWidthFraction: 0.1 as Fraction, note: '' }),
    ).toBe('+/-10%')
  })

  it('refuses a collapsed point estimate at runtime', () => {
    const collapsed = unsafeBandMidpoint(band)
    expect(() => formatBandPercent(collapsed as unknown as Banded<Fraction>)).toThrowError(
      POINT_ESTIMATE_REFUSED,
    )
    expect(() => assertBanded(0.86 as unknown as Banded<Fraction>)).toThrowError(TypeError)
  })
})

describe('limiting factor prose', () => {
  it('names the month for a light gate failure, in words a gardener uses', () => {
    const text = explainLimitingFactor(
      {
        stage: 'light-gate',
        cause: { kind: 'dli-minimum', month: 5 },
        membership: 0.2 as Fraction,
        explanation: '',
      },
      'novice',
      [],
    )
    expect(text).toContain('May')
    // "daily light integral" and "the minimum" are the pipeline's own words for this. A
    // beginner reads "not enough light" as the same fact without the vocabulary lesson
    expect(text).toBe('not enough light in May')
  })

  /**
   * Every picker and list gives the gardener's name for a crop, and so does this sentence, which
   * gets the catalog passed in so it never prints a raw id such as `bean-bush`
   */
  it('names the other crop by its common name, not its catalog id', () => {
    const catalog = [
      { id: 'bean-bush', taxonomy: { commonNames: ['Bush beans'] } },
    ] as unknown as Parameters<typeof explainLimitingFactor>[2]
    const text = explainLimitingFactor(
      {
        stage: 'interactions',
        cause: { kind: 'shared-pest-or-pathogen', withCropId: 'bean-bush' as never },
        membership: 0.8 as Fraction,
        explanation: '',
      },
      'novice',
      catalog,
    )
    expect(text).toBe('shares a pest or disease with Bush beans')
    expect(text).not.toContain('bean-bush')
  })

  it('names the pathogen for a rotation failure', () => {
    expect(
      explainLimitingFactor(
        {
          stage: 'interactions',
          cause: { kind: 'rotation', pathogen: 'Plasmodiophora brassicae' },
          membership: 0 as Fraction,
          explanation: '',
        },
        'novice',
        [],
      ),
    ).toContain('Plasmodiophora brassicae')
  })

  it('keeps the pipeline stage and membership for an expert, and drops both for a novice', () => {
    const factor = {
      stage: 'light-gate' as const,
      cause: { kind: 'dli-minimum' as const, month: 5 as const },
      membership: 0.2 as Fraction,
      explanation: '',
    }
    const novice = explainLimitingFactor(factor, 'novice', [])
    const experienced = explainLimitingFactor(factor, 'experienced', [])
    expect(novice).toBe('not enough light in May')
    expect(novice).not.toContain('membership')
    expect(novice).not.toContain('light-gate')
    expect(experienced).toBe('not enough light in May (light-gate, membership 0.20)')
    // 'some' reads the same plain summary novice always got, per `showsFigures`
    expect(explainLimitingFactor(factor, 'some', [])).toBe(novice)
  })
})

describe('score readouts', () => {
  it('always exposes a weakest term for a recommended crop', () => {
    expect(
      weakestScoreTerm({
        verdict: 'recommended',
        score: {
          lightFit: 0.4 as Fraction,
          shadeBenefitBonus: 0 as Fraction,
          climateFit: 0.9 as Fraction,
          soilFit: 0.8 as Fraction,
          interactionBonus: 0,
          competitionPenalty: 0,
          userPreferenceMatch: 0 as Fraction,
          total: 0.7,
        },
        estimate,
      }),
    ).toBe('how much light it gets')
  })

  it('formats RSR as a shade percentage', () => {
    expect(formatRsr(0.38 as Fraction)).toBe('38% shade (RSR)')
  })
})

/** Only the total score and the verdict matter to the tie helpers, so the rest is filler */
const recommendedAt = (total: number): CropRecommendation =>
  ({
    outcome: {
      verdict: 'recommended',
      score: {
        lightFit: 0 as Fraction,
        shadeBenefitBonus: 0 as Fraction,
        climateFit: 0 as Fraction,
        soilFit: 0 as Fraction,
        interactionBonus: 0,
        competitionPenalty: 0,
        userPreferenceMatch: 0 as Fraction,
        total,
      },
      estimate,
    },
  }) as unknown as CropRecommendation

const excludedEntry = (): CropRecommendation =>
  ({
    outcome: {
      verdict: 'excluded',
      limiting: {
        stage: 'light-gate',
        cause: { kind: 'dli-minimum', month: 5 },
        membership: 0 as Fraction,
        explanation: '',
      },
    },
  }) as unknown as CropRecommendation

describe("the ranking says when it can't tell crops apart", () => {
  it('says nothing when the leader has clear daylight below it', () => {
    const ranked = [recommendedAt(0.9), recommendedAt(0.5), recommendedAt(0.1)]
    expect(tiedLeadingCropCount(ranked)).toBe(0)
  })

  it('says nothing for a single recommended crop, which has nobody to tie with', () => {
    expect(tiedLeadingCropCount([recommendedAt(0.9)])).toBe(0)
  })

  it("counts a leading run bunched within a small share of this bed's own spread", () => {
    // spread across the recommended crops is 0.9 - 0.1 = 0.8, so the margin is 0.04 (5%): the
    // first three sit inside a 0.03 band at the top and the fourth is 0.3 clear of them
    const ranked = [
      recommendedAt(0.9),
      recommendedAt(0.88),
      recommendedAt(0.87),
      recommendedAt(0.57),
      recommendedAt(0.1),
    ]
    expect(tiedLeadingCropCount(ranked)).toBe(3)
    expect(cropTieNote(3)).toContain('top 3')
    expect(cropTieNote(3)).not.toContain('membership')
  })

  it('never counts marginal or excluded crops toward the tie, whatever they score', () => {
    // spread is read off the 5 RECOMMENDED scores alone (0.9 - 0.2 = 0.7, margin 0.035): the
    // excluded entries carry no score.total at all, so letting them in would break the math
    // as well as the meaning
    const ranked = [
      recommendedAt(0.9),
      recommendedAt(0.895),
      excludedEntry(),
      recommendedAt(0.86),
      recommendedAt(0.5),
      excludedEntry(),
      recommendedAt(0.2),
    ]
    expect(tiedLeadingCropCount(ranked)).toBe(2)
  })

  it('calls the whole leading run tied when every recommended crop reads identically', () => {
    const ranked = [recommendedAt(0.5), recommendedAt(0.5), recommendedAt(0.5)]
    expect(tiedLeadingCropCount(ranked)).toBe(3)
  })
})

/** Only what `tiedLeadingSuggestionCount` reads: the score total and the inference flag */
const suggestionAt = (total: number, restsOnInference = false): PolycultureSuggestion =>
  ({
    score: {
      agronomic: 0,
      compatibility: 0,
      preference: 0,
      stratification: 0,
      portfolio: 0,
      total,
    },
    confidence: {
      inferredLightAdmissions: restsOnInference ? [{ threshold: 'minimum' }] : [],
    },
  }) as unknown as PolycultureSuggestion

describe("the polyculture suggestions say when they can't tell combinations apart", () => {
  it('carries the same tie pattern the crop ranking does, off the same kind of score total', () => {
    const suggestions = [suggestionAt(0.9), suggestionAt(0.89), suggestionAt(0.5)]
    expect(tiedLeadingSuggestionCount(suggestions)).toBe(2)
    expect(suggestionTieNote(2)).toContain('top 2')
  })

  it("never ties a combination that rests on an inferred admission with one that doesn't", () => {
    const suggestions = [suggestionAt(0.9), suggestionAt(0.899, true), suggestionAt(0.5, true)]
    expect(tiedLeadingSuggestionCount(suggestions)).toBe(0)
  })
})

describe('naming a crop or a bed the way a gardener would', () => {
  const bushBean = {
    id: cropId('bean-bush'),
    taxonomy: { commonNames: ['bush bean', 'string bean'] },
  } as unknown as Crop

  const bedOne: Bed = { id: bedId('bed-1'), label: 'Bed 1' } as unknown as Bed

  it('reads the common name off the catalog, not the id', () => {
    expect(cropName([bushBean], cropId('bean-bush'))).toBe('bush bean')
    expect(bedName([bedOne], bedId('bed-1'))).toBe('Bed 1')
  })

  it("falls back to the id when the catalog hasn't loaded or doesn't carry it", () => {
    expect(cropName([], cropId('bean-bush'))).toBe('bean-bush')
    expect(cropName([bushBean], cropId('pepper-hot'))).toBe('pepper-hot')
    expect(bedName([], bedId('bed-1'))).toBe('bed-1')
  })

  it('falls back to the id rather than crash on a crop with no common name on record', () => {
    const nameless = {
      id: cropId('mystery-crop'),
      taxonomy: { commonNames: [] },
    } as unknown as Crop
    expect(cropName([nameless], cropId('mystery-crop'))).toBe('mystery-crop')
  })
})

/**
 * The wildlife sentences, which are the only place a grower meets these three answers. Every
 * test here is about a distinction the words have to keep: exactly three native states,
 * and exactly two pollinator traits
 */
describe('what a wildlife preference says about a crop', () => {
  it('never calls an unchecked plant introduced', () => {
    const unknown = nativeNote(null)
    expect(unknown).toMatch(/isn't known whether this is native/i)
    // the specific failure this exists to stop: `null` reading as `false` in a two-way ternary
    expect(unknown).not.toMatch(/^not native/i)
    expect(unknown).toMatch(/isn't marked as introduced/i)
    expect(nativeNote(false)).toMatch(/not native here/i)
    expect(nativeNote(true)).toMatch(/native here/i)
  })

  it('says what a plant offers and what a crop needs in two separate sentences', () => {
    const offers = forageNote('high')
    const needs = dependenceNote('essential')
    expect(offers).toMatch(/feeds pollinators/i)
    expect(needs).toMatch(/needs insect visits/i)
    // neither sentence answers the other's question, which is the whole reason there are two
    expect(offers).not.toMatch(/needs/i)
    expect(needs).not.toMatch(/feeds/i)
  })

  it('gives every class of both traits a sentence of its own', () => {
    const forage = (['high', 'some', 'none'] as const).map(forageNote)
    expect(new Set(forage).size).toBe(forage.length)
    const dependence = (['essential', 'great', 'modest', 'little', 'none'] as const).map(
      dependenceNote,
    )
    expect(new Set(dependence).size).toBe(dependence.length)
    // the two ends of each scale are read by a grower deciding where a crop goes, so neither is
    // allowed to come out blank the way an unhandled class would
    expect(forageNote('none')).toMatch(/nothing/i)
    expect(dependenceNote('none')).toMatch(/no insect visits/i)
  })

  it("says that favoring natives does nothing until there's a region", () => {
    expect(NATIVE_REGION_UNKNOWN).toMatch(/changes nothing/i)
  })
})

/**
 * Both units, the way every size in this app already prints meters and feet. "28 days above
 * 30 °C" on a screen that has already given 9 by 6 meters in feet leaves the one figure a grower
 * gardens by unconverted
 */
describe('temperature and rain, in both units', () => {
  it('prints a whole threshold as a whole number, with the Fahrenheit beside it', () => {
    expect(formatCelsius(30)).toBe('30 °C (86 °F)')
    expect(formatCelsius(0)).toBe('0 °C (32 °F)')
    expect(formatCelsius(-12)).toBe('-12 °C (10 °F)')
  })

  it('keeps one decimal for a measured temperature', () => {
    expect(formatCelsius(21.5)).toBe('21.5 °C (71 °F)')
  })

  it('prints rain in millimeters and inches, coarser as it grows', () => {
    expect(formatRainMm(1098)).toBe('1098 mm (43 in)')
    expect(formatRainMm(25.4)).toBe('25 mm (1.0 in)')
    expect(formatRainMm(0)).toBe('0 mm (0.0 in)')
  })
})

/**
 * The raise a shallow bed is offered, and what it says once the bed is deep enough.
 *
 * Raise a bed ten centimeters past what a tomato asks for and two things have to happen: the
 * ranking re-runs, which `autoRunKey` covers, and this sentence has a case for a bed that already
 * fits
 */
describe('the raise a shallow bed is offered', () => {
  // only the two depths matter here, and they're the two the remedy compares
  const bedAt = (effectiveDepthM: number, raisedHeightM: number): Bed =>
    ({ raisedHeightM, soil: { effectiveDepthM } }) as unknown as Bed
  const rooting = (maxEffectiveDepthM: number): Crop =>
    ({ roots: { maxEffectiveDepthM } }) as unknown as Crop

  it('rounds the target up so the press is a promise the app keeps', () => {
    const remedy = rootDepthRemedy(rooting(1.1), bedAt(0.95, 0))
    expect(remedy.shortfallM).toBeCloseTo(0.15, 6)
    // 1.10 - 0.95 = 0.15, rounded up to the 0.05 step, and it's the bed's new height
    expect(remedy.raiseToM).toBeCloseTo(0.15, 6)
    expect((remedy.raiseToM ?? 0) + 0.95).toBeGreaterThanOrEqual(1.1)
  })

  it('offers no raise once the bed already holds the roots', () => {
    const remedy = rootDepthRemedy(rooting(1.1), bedAt(0.95, 0.25))
    expect(remedy.shortfallM).toBeLessThan(0)
    expect(remedy.raiseToM).toBeNull()
  })

  it('offers no raise past the cap, because that is a different kind of bed', () => {
    const remedy = rootDepthRemedy(rooting(2.5), bedAt(0.4, 0))
    expect(remedy.shortfallM).toBeGreaterThan(ROOT_DEPTH_RAISE_CAP_M)
    expect(remedy.raiseToM).toBeNull()
  })

  /** A shallow bed only limits a crop, and the plain sentence says what it costs */
  it('says a shallow bed means more watering, and what a raise would give', () => {
    const factor = {
      stage: 'space-structure' as const,
      cause: { kind: 'root-depth' as const },
      membership: 0.3 as Fraction,
      explanation: '',
    }
    const limited = explainLimitingFactor(factor, 'novice', [], rooting(1.1), bedAt(0.3, 0))
    expect(limited).toContain("in deep soil they'd reach 1.10 m")
    expect(limited).toContain("it'll need watering more often")
    expect(limited).toContain('Raising the bed by 0.80 m would give them room')
    // under the floor it is a refusal, and the sentence says so instead
    const refused = explainLimitingFactor(factor, 'novice', [], rooting(1.1), bedAt(0.1, 0))
    expect(refused).toContain('under the 0.20 m a bed needs')
    // and with no crop or bed to hand, the plain fragment every other caller gets: above the
    // floor a shallow bed only limits, so the fragment says what limiting costs
    expect(explainLimitingFactor(factor, 'novice', [])).toBe(
      "the soil here is shallower than its roots would reach, so it'll need watering more often",
    )
    expect(refused).toContain('the soil here is too shallow for it')
  })
})
