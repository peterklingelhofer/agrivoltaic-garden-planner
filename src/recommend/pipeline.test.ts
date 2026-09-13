import { describe, expect, it } from 'bun:test'
import type { SeasonLight } from '../types/light'
import { loadCompanionRules, loadRotationConstraints } from '../data/companions'
import { cropById, laubCurve, loadCropCatalog } from '../data/crops'
import type { Crop } from '../types/crop'
import type { BedId, CropId } from '../types/ids'
import type { Fraction } from '../types/units'
import { runRecommendationPipeline } from './pipeline'
import { bedFixture, bedLightFixture, plotFixture, siteFixture } from './testkit'
import {
  climateGate,
  chillGate,
  hardinessGate,
  seasonGddGate,
  siteExtremeMinC,
} from './stages/climate-gate'
import { lightGate, shadeBenefitBonus } from './stages/light-gate'
import { interactionsStage, rotationViolation } from './stages/interactions'
import { DEFAULT_WEIGHTS } from './stages/rank'
import { laubCentralRelativeYield, laubRelativeYield } from './yield'

const need = (catalog: readonly Crop[], id: string): Crop => {
  const crop = cropById(catalog, id as CropId)
  if (crop === undefined) throw new Error(`missing fixture crop ${id}`)
  return crop
}

const catalogPromise = loadCropCatalog()

/** Only `cumulativeRsr` is read by the bonus, which is the axis it is scaled on */
const SHADED = { cumulativeRsr: 0.4 } as unknown as SeasonLight

describe('stage 1: hard climate gate', () => {
  it('gates perennials on hardiness and leaves annuals alone', async () => {
    const catalog = await catalogPromise
    const cold = siteFixture({
      hardiness: [{ scheme: 'usda-2023', extremeMinTempC: -40 as never, zoneLabel: '3a' }],
    })
    expect(hardinessGate(need(catalog, 'fig'), cold).passed).toBe(false)
    // an annual is never excluded by winter minimum: that is a category error
    expect(hardinessGate(need(catalog, 'tomato'), cold).passed).toBe(true)
  })

  it('gates a Canadian site on its measured winter minimum, never on its NRCan zone', async () => {
    const catalog = await catalogPromise
    // Toronto: NRCan 7a beside a reanalysis-derived -24 C, which is USDA 5b. Reading the
    // index zone as if it were a USDA one would let a fig through
    const toronto = siteFixture({
      hardiness: [
        { scheme: 'usda-2023', extremeMinTempC: -24 as never, zoneLabel: '5b' },
        { scheme: 'nrcan', zoneLabel: '7a', indexTerms: [] },
      ],
    })
    expect(siteExtremeMinC(toronto)).toBeCloseTo(-24, 6)
    expect(hardinessGate(need(catalog, 'fig'), toronto).passed).toBe(false)
    expect(hardinessGate(need(catalog, 'fig'), toronto).limiting?.explanation).toContain('-24.0 C')
  })

  it('reads no temperature at all from a site rated only by composite index', () => {
    const indexOnly = siteFixture({
      hardiness: [{ scheme: 'nrcan', zoneLabel: '7a', indexTerms: [] }],
    })
    expect(siteExtremeMinC(indexOnly)).toBe(0)
  })

  it('gates deciduous fruit on chill, compared like with like', async () => {
    const catalog = await catalogPromise
    const mild = siteFixture({
      chill: { ...siteFixture().chill, chillingHours: 200 as never },
    })
    const outcome = chillGate(need(catalog, 'cherry-sour'), mild)
    expect(outcome.passed).toBe(false)
    expect(outcome.limiting?.cause).toEqual({ kind: 'chill' })
    expect(outcome.limiting?.explanation).toContain('chilling hours')
  })

  it('gates annuals on season degree-days', async () => {
    const catalog = await catalogPromise
    const short = siteFixture({
      seasonGdd: { base4C: 400 as never, base10C: 200 as never, percentile: 20 },
    })
    const outcome = seasonGddGate(need(catalog, 'watermelon'), short, 20)
    expect(outcome.passed).toBe(false)
    expect(outcome.limiting?.cause).toEqual({ kind: 'season-gdd' })
  })

  it('always attaches a limiting factor to a failure', async () => {
    const catalog = await catalogPromise
    const hostile = siteFixture({
      seasonGdd: { base4C: 10 as never, base10C: 10 as never, percentile: 20 },
    })
    for (const crop of catalog) {
      const outcome = climateGate(crop, hostile, 20)
      if (!outcome.passed) expect(outcome.limiting).not.toBeNull()
    }
  })
})

describe('stage 2: light gate', () => {
  it('excludes a crop whose own window falls below its minimum DLI', async () => {
    const catalog = await catalogPromise
    const outcome = lightGate(need(catalog, 'tomato'), bedLightFixture('bed-a', 0.8), siteFixture())
    expect(outcome.passed).toBe(false)
    expect(outcome.limiting?.cause.kind).toBe('dli-minimum')
  })

  it('excludes maize well before it excludes lettuce', async () => {
    const catalog = await catalogPromise
    const light = bedLightFixture('bed-a', 0.35)
    const site = siteFixture()
    expect(lightGate(need(catalog, 'sweet-corn'), light, site).passed).toBe(false)
    expect(lightGate(need(catalog, 'lettuce-leaf'), light, site).passed).toBe(true)
  })

  it('reports the maximum design RSR as the limiting factor when light alone is adequate', async () => {
    const catalog = await catalogPromise
    const outcome = lightGate(
      need(catalog, 'sweet-corn'),
      bedLightFixture('bed-a', 0.3, 90),
      siteFixture(),
    )
    expect(outcome.passed).toBe(false)
    expect(outcome.limiting?.cause.kind).toBe('max-design-rsr')
  })

  it('computes season-cumulative RSR against the crop window, not the annual mean', async () => {
    const catalog = await catalogPromise
    const outcome = lightGate(
      need(catalog, 'lettuce-leaf'),
      bedLightFixture('bed-a', 0.25),
      siteFixture(),
    )
    expect(outcome.light.cumulativeRsr).toBeCloseTo(0.25, 5)
    expect(outcome.light.window).toEqual(need(catalog, 'lettuce-leaf').window)
  })

  it('gives no shade-benefit bonus unless the site is water-limited', async () => {
    const catalog = await catalogPromise
    const lettuce = need(catalog, 'lettuce-leaf')
    expect(lettuce.light.shadeBenefitingWhenWaterLimited).toBe(true)
    expect(shadeBenefitBonus(lettuce, siteFixture({ heatDaysAbove30C: 80 }), SHADED)).toBe(0)
    expect(
      shadeBenefitBonus(
        lettuce,
        siteFixture({
          heatDaysAbove30C: 80,
          waterLimitation: {
            ...siteFixture().waterLimitation,
            index: 0.7 as Fraction,
            limited: true,
          },
        }),
        SHADED,
      ),
    ).toBeGreaterThan(0)
  })

  it('gives no shade-benefit bonus without heat days even when water-limited', async () => {
    const catalog = await catalogPromise
    expect(
      shadeBenefitBonus(
        need(catalog, 'lettuce-leaf'),
        siteFixture({
          heatDaysAbove30C: 5,
          waterLimitation: {
            ...siteFixture().waterLimitation,
            index: 0.7 as Fraction,
            limited: true,
          },
        }),
        SHADED,
      ),
    ).toBe(0)
  })
})

describe('stage 5: interactions', () => {
  it('treats rotation as a hard constraint', async () => {
    const catalog = await catalogPromise
    const rotation = await loadRotationConstraints()
    const tomato = need(catalog, 'tomato')
    const violation = rotationViolation(
      {
        candidate: tomato,
        selected: [],
        historyByYear: new Map([[0, [tomato.id]]]),
        familyOf: () => null,
        koppenCode: 'Dfa',
        scale: 'bed',
      },
      rotation,
    )
    expect(violation?.pathogen).toContain('Verticillium')
  })

  it('never offers a rotation interval for allium white rot', async () => {
    const rotation = await loadRotationConstraints()
    const whiteRot = rotation.find((entry) => entry.groupRef === 'Amaryllidaceae')
    expect(whiteRot?.rotationEffective).toBe(false)
    expect(whiteRot?.minIntervalYears).toBeNull()
  })

  it('lets no grade C, D or E rule reach the score', async () => {
    const catalog = await catalogPromise
    const rules = await loadCompanionRules()
    const experimental = rules.filter((rule) => rule.grade === 'C')
    const folklore = rules.filter((rule) => rule.grade === 'D' || rule.grade === 'E')
    const outcome = interactionsStage(
      {
        candidate: need(catalog, 'tomato'),
        selected: [need(catalog, 'basil')],
        historyByYear: new Map(),
        familyOf: () => null,
        koppenCode: 'Dfa',
        scale: 'bed',
      },
      [],
      experimental as never,
      folklore as never,
      [],
    )
    expect(outcome.bonus).toBe(0)
    expect(outcome.applied).toHaveLength(0)
  })

  it('does not fire a field-scoped rule for a bed', async () => {
    const catalog = await catalogPromise
    const rules = await loadCompanionRules()
    const scoreable = rules.filter((rule) => rule.grade === 'A' || rule.grade === 'B')
    const outcome = interactionsStage(
      {
        candidate: need(catalog, 'sweet-corn'),
        selected: [need(catalog, 'desmodium')],
        historyByYear: new Map(),
        familyOf: () => null,
        koppenCode: 'Aw',
        scale: 'bed',
      },
      scoreable as never,
      [],
      [],
      [],
    )
    expect(outcome.applied.some((rule) => rule.id === 'desmodium-interception')).toBe(false)
  })
})

describe('crop response', () => {
  it('withholds a shade-driven yield gain unless the site is water-limited', () => {
    const berries = laubCurve('berries')
    const dryland = laubRelativeYield(berries, 0.3 as Fraction, true)
    const temperate = laubRelativeYield(berries, 0.3 as Fraction, false)
    expect(dryland.interval.upper).toBeGreaterThan(1)
    expect(temperate.interval.upper).toBeLessThanOrEqual(1)
  })

  it('is never a scalar and always attributes the band to the crop term', () => {
    const band = laubRelativeYield(laubCurve('maize-c4'), 0.4 as Fraction, false)
    expect(band.dominantSource).toBe('crop-response')
    expect(band.interval.lower).toBeLessThanOrEqual(band.interval.upper)
    expect(band.contributions[0]?.note).toContain('CONFIDENCE')
  })

  it('rejects the linear "percent shade equals percent loss" model', () => {
    // RSR squared is significant at p = 0.0015, so the linear model is wrong
    for (const group of ['leafy-vegetables', 'berries', 'maize-c4'] as const) {
      const central = laubCentralRelativeYield(laubCurve(group), 0.4 as Fraction, true)
      expect(Math.abs(central - (1 - 0.4))).toBeGreaterThan(0.1)
    }
  })

  it('separates the nine crop groups at the same shade level', () => {
    const rsr = 0.4 as Fraction
    const leafy = laubCentralRelativeYield(laubCurve('leafy-vegetables'), rsr, true)
    const maize = laubCentralRelativeYield(laubCurve('maize-c4'), rsr, true)
    expect(leafy).toBeGreaterThan(maize + 0.3)
  })
})

describe('stages 0 to 6 end to end', () => {
  it('explains every exclusion and produces a ranked set per bed', async () => {
    const catalog = await catalogPromise
    const [rules, rotation] = await Promise.all([loadCompanionRules(), loadRotationConstraints()])
    const beds = [bedFixture('bed-a'), bedFixture('bed-b')]
    const sets = runRecommendationPipeline({
      site: siteFixture(),
      plot: plotFixture(beds),
      bedLight: [bedLightFixture('bed-a', 0.25), bedLightFixture('bed-b', 0.55)],
      catalog,
      companionRules: rules,
      rotationConstraints: rotation,
      frostPercentile: 20,
      weights: DEFAULT_WEIGHTS,
      preferredCropIds: [],
    })

    expect(sets).toHaveLength(2)
    for (const set of sets) {
      expect(set.ranked.length).toBe(catalog.length)
      for (const recommendation of set.ranked) {
        if (recommendation.outcome.verdict === 'excluded') {
          expect(recommendation.outcome.limiting).toBeDefined()
          expect(recommendation.outcome.limiting.explanation.length).toBeGreaterThan(10)
        }
      }
    }
  })

  /**
   * Reading the bed's own plantings as this year's history and running the rotation rule over them
   * would have a bed holding tomato refuse tomato, pepper and potato as "grown here too recently".
   * Rotation is what follows a crop and the seasons apply it from their records; what shares a bed
   * this season is a companion question, answered by the family-clash penalty
   */
  it('never refuses a crop for rotation against what shares the bed this season', async () => {
    const catalog = await catalogPromise
    const [rules, rotation] = await Promise.all([loadCompanionRules(), loadRotationConstraints()])
    const tomato = need(catalog, 'tomato')
    const planted = bedFixture('bed-a', {
      plantings: [
        {
          id: 'bed-a:tomato:100' as never,
          bedId: 'bed-a' as BedId,
          cropId: tomato.id,
          cultivarId: null,
          role: 'target-crop',
          tier: 'mid-canopy',
          sowDay: 100 as never,
          harvestStartDay: 200 as never,
          harvestEndDay: 260 as never,
          plantCount: 4,
        },
      ],
    })
    const [set] = runRecommendationPipeline({
      site: siteFixture(),
      plot: plotFixture([planted]),
      bedLight: [bedLightFixture('bed-a', 0.1)],
      catalog,
      companionRules: rules,
      rotationConstraints: rotation,
      frostPercentile: 20,
      weights: DEFAULT_WEIGHTS,
      preferredCropIds: [],
    })
    for (const id of ['tomato', 'pepper-sweet', 'potato']) {
      const entry = set?.ranked.find((item) => (item.cropId as string) === id)
      expect(entry, id).toBeDefined()
      const rotated =
        entry?.outcome.verdict === 'excluded' && entry.outcome.limiting.cause.kind === 'rotation'
      expect(rotated, id).toBe(false)
    }
  })

  it('ranks a deeply shaded bed lower than a lightly shaded one', async () => {
    const catalog = await catalogPromise
    const [rules, rotation] = await Promise.all([loadCompanionRules(), loadRotationConstraints()])
    const beds = [bedFixture('bed-a'), bedFixture('bed-b')]
    const sets = runRecommendationPipeline({
      site: siteFixture(),
      plot: plotFixture(beds),
      bedLight: [bedLightFixture('bed-a', 0.1), bedLightFixture('bed-b', 0.65)],
      catalog,
      companionRules: rules,
      rotationConstraints: rotation,
      frostPercentile: 20,
      weights: DEFAULT_WEIGHTS,
      preferredCropIds: [],
    })
    const viable = (index: number): number =>
      (sets[index]?.ranked ?? []).filter((entry) => entry.outcome.verdict !== 'excluded').length
    expect(viable(0)).toBeGreaterThan(viable(1))
  })

  it('is deterministic across runs', async () => {
    const catalog = await catalogPromise
    const [rules, rotation] = await Promise.all([loadCompanionRules(), loadRotationConstraints()])
    const input = {
      site: siteFixture(),
      plot: plotFixture([bedFixture('bed-a')]),
      bedLight: [bedLightFixture('bed-a', 0.3)],
      catalog,
      companionRules: rules,
      rotationConstraints: rotation,
      frostPercentile: 20 as const,
      weights: DEFAULT_WEIGHTS,
      preferredCropIds: [],
    }
    const first = runRecommendationPipeline(input)
    const second = runRecommendationPipeline(input)
    expect(first[0]?.ranked.map((entry) => entry.cropId)).toEqual(
      second[0]?.ranked.map((entry) => entry.cropId),
    )
  })
})
