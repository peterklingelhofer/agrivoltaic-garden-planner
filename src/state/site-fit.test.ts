import { describe, expect, it } from 'bun:test'
import { CROP_ROWS } from '../data/catalog/rows'
import { expandRow } from '../data/catalog/schema'
import { DEFAULT_FROST_PERCENTILE } from '../data/site'
import type { CropPlan } from '../recommend/auto'
import { DEFAULT_TARGET_YEAR } from '../recommend/pipeline'
import { VERDICT_ORDER } from '../recommend/stages/rank'
import { hardPhEnvelope } from '../recommend/stages/soil-water'
import { matureWidthAt } from '../recommend/stages/space'
import { frostFreeSiteFixture, hotDesertSiteFixture, siteFixture } from '../recommend/testkit'
import type { Crop } from '../types/crop'
import type { LimitingFactorKind, RecommendationVerdict } from '../types/recommend'
import type { Site, SoilProfile } from '../types/site'
import { fraction } from '../types/units'
import { soilForSite } from './defaults'
import {
  cropsForConditions,
  openFieldBedLight,
  SITE_FIT_BED_ID,
  type SiteFit,
  type SiteFitInput,
  siteFitSoil,
} from './site-fit'

/**
 * The place finder: its light and soil arithmetic, and the verdicts it reaches by running the
 * planner's own rules over the whole catalog. Expectations come from the inputs wherever they
 * can. The few pinned counts are measured on `siteFixture()` and the catalog as it stands, so a
 * catalog or rule change moves them on purpose
 */

const CATALOG: readonly Crop[] = CROP_ROWS.map(expandRow)

type Verdict = RecommendationVerdict['verdict']

const cropOf = (id: string): Crop => {
  const crop = CATALOG.find((one) => one.id === id)
  if (crop === undefined) throw new Error(`${id} is not a catalog crop`)
  return crop
}

const planOf = (fit: SiteFit, id: string): CropPlan => {
  const plan = fit.ranked.find((one) => one.recommendation.cropId === id)
  if (plan === undefined) throw new Error(`${id} is not in the ranking`)
  return plan
}

const verdictOf = (plan: CropPlan): Verdict => plan.recommendation.outcome.verdict

const idsOf = (fit: SiteFit): string[] => fit.ranked.map((plan) => plan.recommendation.cropId)

const countOf = (fit: SiteFit, verdict: Verdict): number =>
  fit.ranked.filter((plan) => verdictOf(plan) === verdict).length

/** The crops whose limiting factor is of one kind */
const withCause = (fit: SiteFit, kind: LimitingFactorKind['kind']): CropPlan[] =>
  fit.ranked.filter((plan) => plan.limiting?.cause.kind === kind)

/** The temperate fixture in open sun on a neutral typed pH, watered by drip, at the 20th percentile */
const fitOf = (patch: Partial<SiteFitInput> = {}): SiteFit =>
  cropsForConditions({
    site: siteFixture(),
    catalog: CATALOG,
    shade: fraction(0),
    soil: { kind: 'own', phUnits: 6.5 },
    irrigation: 'drip',
    frostPercentile: 20,
    ...patch,
  })

const figures = (count: number, value: number): number[] =>
  Array.from({ length: count }, () => value)

const mean = (values: readonly number[]): number =>
  values.reduce((sum, value) => sum + value, 0) / values.length

/** Twelve figures, each within 1e-9 of the one beside it */
const expectMonths = (actual: readonly number[], expected: readonly number[]): void => {
  expect(actual).toHaveLength(12)
  expect(expected).toHaveLength(12)
  for (const [month, value] of actual.entries()) {
    expect(Math.abs(value - (expected[month] ?? Number.NaN))).toBeLessThan(1e-9)
  }
}

describe('openFieldBedLight', () => {
  const site = siteFixture()
  const normals = site.normals.monthlyMeanDliMolM2Day

  it('holds every month at the normals times what the shade leaves', () => {
    const light = openFieldBedLight(site, fraction(0.4))
    const under = normals.map((value) => value * 0.6)
    expectMonths(light.monthlyMeanDliMolM2Day, under)
    // no bake stands behind the figures, so the baked mean and the darkest cell are the mean
    expectMonths(light.monthlyBakedMeanDliMolM2Day, light.monthlyMeanDliMolM2Day)
    expectMonths(light.monthlyMinDliMolM2Day, light.monthlyMeanDliMolM2Day)
  })

  it('keeps the open sky as the normals and records the shade as the share of sky lost', () => {
    const light = openFieldBedLight(site, fraction(0.4))
    expectMonths(light.monthlyOpenSkyDliMolM2Day, normals)
    expectMonths(light.monthlyRsr, figures(12, 0.4))
    expect(light.skyViewFactor).toBeCloseTo(0.6, 9)
  })

  it('describes the bed as one uniform cell with the twelve-month average for its year', () => {
    const light = openFieldBedLight(site, fraction(0.4))
    expect(light.annualMeanDliMolM2Day).toBeCloseTo(mean(normals.map((value) => value * 0.6)), 9)
    expect(light.annualMeanDliMolM2Day).toBeCloseTo(mean(light.monthlyMeanDliMolM2Day), 9)
    expect(light.cellCount).toBe(1)
    expect(light.bedId).toBe(SITE_FIT_BED_ID)
    expect(light.homogeneity).toEqual({ coefficientOfVariation: 0, minOverMean: 1 })
  })

  it('leaves the mean at the open sky when there is no shade', () => {
    const light = openFieldBedLight(site, fraction(0))
    expectMonths(light.monthlyMeanDliMolM2Day, normals)
    expectMonths(light.monthlyMeanDliMolM2Day, light.monthlyOpenSkyDliMolM2Day)
    expectMonths(light.monthlyRsr, figures(12, 0))
    expect(light.skyViewFactor).toBe(1)
    expect(light.annualMeanDliMolM2Day).toBeCloseTo(mean(normals), 9)
  })

  it('reads a shade past 0 to 1 as the nearer end', () => {
    const dark = openFieldBedLight(site, fraction(1.4))
    const bright = openFieldBedLight(site, fraction(-0.2))
    expect(dark.monthlyMeanDliMolM2Day.every((value) => value === 0)).toBe(true)
    expect(dark.monthlyRsr.every((value) => value === 1)).toBe(true)
    expect(bright.monthlyMeanDliMolM2Day).toEqual(bright.monthlyOpenSkyDliMolM2Day)
    expect(bright.skyViewFactor).toBe(1)
  })

  it('throws when the normals do not hold twelve months', () => {
    for (const count of [11, 13]) {
      const odd = siteFixture({
        normals: { ...site.normals, monthlyMeanDliMolM2Day: figures(count, 20) },
      })
      expect(() => openFieldBedLight(odd, fraction(0.2))).toThrow(/twelve monthly figures/)
    }
  })
})

describe('siteFitSoil', () => {
  /** A reading with a pH that rounds and a texture, drainage and organic matter unlike the assumed loam */
  const readingFrom = (sourceId: SoilProfile['sourceId']): Site =>
    siteFixture({
      soil: {
        ...siteFixture().soil,
        phUnits: 6.47,
        textureClass: 'clay',
        drainage: 'poor',
        organicMatterFraction: fraction(0.09),
        sourceId,
      },
    })

  it('marks a typed pH as the user and puts it in 2 m of soil', () => {
    const soil = siteFitSoil(readingFrom('soilgrids'), { kind: 'own', phUnits: 5.2 })
    expect(soil.phUnits).toBe(5.2)
    expect(soil.sourceId).toBe('user')
    expect(soil.effectiveDepthM).toBe(2)
  })

  it("takes the site's own pH, rounded to a tenth, for a map soil", () => {
    const soil = siteFitSoil(readingFrom('soilgrids'), { kind: 'map' })
    expect(soil.phUnits).toBe(6.5)
    expect(soil.sourceId).toBe('soilgrids')
    expect(soil.effectiveDepthM).toBe(2)
  })

  it('carries the source of whatever the site holds into a map soil', () => {
    for (const sourceId of ['soilgrids', 'ssurgo', 'user', 'default'] as const) {
      expect(siteFitSoil(readingFrom(sourceId), { kind: 'map' }).sourceId).toBe(sourceId)
    }
  })

  it('shapes the rest of the profile the way soilForSite does', () => {
    const site = readingFrom('soilgrids')
    expect(siteFitSoil(site, { kind: 'map' })).toEqual({ ...soilForSite(site), effectiveDepthM: 2 })
    expect(siteFitSoil(site, { kind: 'own', phUnits: 5.2 })).toEqual({
      ...soilForSite(site),
      phUnits: 5.2,
      sourceId: 'user',
      effectiveDepthM: 2,
    })
  })
})

describe('cropsForConditions', () => {
  it('judges every crop in the catalog once, each as a recommendation for the place bed', () => {
    const fit = fitOf()
    expect(fit.ranked).toHaveLength(CATALOG.length)
    expect(new Set(idsOf(fit))).toEqual(new Set(CATALOG.map((crop) => crop.id as string)))
    for (const plan of fit.ranked) expect(plan.recommendation.bedId).toBe(SITE_FIT_BED_ID)
  })

  it('hands back the light and the soil it judged by', () => {
    const site = siteFixture()
    const fit = fitOf({ site, shade: fraction(0.25), soil: { kind: 'own', phUnits: 5.8 } })
    expect(fit.light).toEqual(openFieldBedLight(site, fraction(0.25)))
    expect(fit.soil).toEqual(siteFitSoil(site, { kind: 'own', phUnits: 5.8 }))
  })

  it('ranks suited crops first, then limited ones, then unsuited ones', () => {
    const order = fitOf().ranked.map((plan) => VERDICT_ORDER[verdictOf(plan)])
    expect(order).toEqual([...order].sort((a, b) => a - b))
    // all three verdicts occur on this fixture, so the order is not vacuous
    expect(new Set(order).size).toBe(3)
  })

  it('gives every crop a calendar of its own', () => {
    for (const plan of fitOf().ranked) {
      expect(plan.calendar.cropId).toBe(plan.recommendation.cropId)
    }
  })

  it('names what limits every crop that is not recommended', () => {
    for (const plan of fitOf().ranked) {
      expect(plan.limiting === null).toBe(verdictOf(plan) === 'recommended')
    }
  })

  it('refuses no crop for want of room or soil depth', () => {
    for (const site of [siteFixture(), frostFreeSiteFixture(), hotDesertSiteFixture()]) {
      for (const irrigation of ['drip', 'none'] as const) {
        const kinds = fitOf({ site, irrigation }).ranked.map((plan) => plan.limiting?.cause.kind)
        expect(kinds).not.toContain('footprint')
        expect(kinds).not.toContain('root-depth')
      }
    }
  })

  it('offers soil as deep as the deepest roots and a bed as wide as the widest canopy in the catalog', () => {
    // a depth limit can hide behind an earlier one in the ranking, so this reads the catalog itself
    const depthM = fitOf().soil.effectiveDepthM
    const bedM2 = 20 * 20
    for (const crop of CATALOG) {
      expect(crop.roots.maxEffectiveDepthM, crop.id).toBeLessThanOrEqual(depthM)
      const canopyM2 = Math.PI * (matureWidthAt(crop, DEFAULT_TARGET_YEAR) / 2) ** 2
      expect(canopyM2, crop.id).toBeLessThanOrEqual(bedM2)
    }
  })

  it('returns the verdict counts measured on this fixture and catalog', () => {
    // measured on siteFixture() in open sun, typed pH 6.5, drip water and the 20th percentile,
    // against the catalog as it stands. A catalog or rule change fails here on purpose. Re-measured
    // when the ECOCROP pass filled the catalog's pH ranges (docs/ecocrop-ph.json): the counts held
    // once arugula's row carried its own 6 to 6.8 over ECOCROP's 7 to 8.5, which 6.5 sits under
    const fit = fitOf()
    expect(fit.ranked).toHaveLength(264)
    expect(countOf(fit, 'recommended')).toBe(175)
    expect(countOf(fit, 'marginal')).toBe(15)
    expect(countOf(fit, 'excluded')).toBe(74)
  })
})

describe('cropsForConditions under shade', () => {
  const at = (shade: number): SiteFit => fitOf({ shade: fraction(shade) })

  it('recommends no more crops under more shade', () => {
    const open = countOf(at(0), 'recommended')
    const partial = countOf(at(0.3), 'recommended')
    const heavy = countOf(at(0.7), 'recommended')
    expect(heavy).toBeLessThanOrEqual(partial)
    expect(partial).toBeLessThanOrEqual(open)
    // the shade does take crops out, so the three are not one number
    expect(heavy).toBeLessThan(open)
  })

  it('excludes crops on the shade ceiling and on a month under their floor at 70 percent shade', () => {
    const shaded = at(0.7)
    const overCeiling = withCause(shaded, 'max-design-rsr')
    const underFloor = withCause(shaded, 'dli-minimum')
    expect(overCeiling.length).toBeGreaterThan(0)
    expect(underFloor.length).toBeGreaterThan(0)
    for (const plan of [...overCeiling, ...underFloor]) {
      expect(verdictOf(plan)).toBe('excluded')
      expect(plan.limiting?.stage).toBe('light-gate')
    }
    // the ceiling refuses a crop only when its catalog ceiling sits under the shade
    for (const plan of overCeiling) {
      expect(cropOf(plan.recommendation.cropId).light.maxDesignRsr.value).toBeLessThan(0.7)
    }
    // and in the open it refuses none
    expect(withCause(at(0), 'max-design-rsr')).toHaveLength(0)
  })

  it('excludes a crop whose catalog ceiling is under the shade, and recommends it in the open', () => {
    const open = at(0)
    const shaded = at(0.7)
    // tomato carries the solanaceae ceiling of 0.2 and kale the leafy-greens 0.4. The light gate
    // reads a month under the floor before the ceiling, so the shade may reach either limit first,
    // and it excludes both
    for (const id of ['tomato', 'kale']) {
      expect(cropOf(id).light.maxDesignRsr.value, id).toBeLessThan(0.7)
      expect(verdictOf(planOf(open, id)), id).toBe('recommended')
      expect(verdictOf(planOf(shaded, id)), id).toBe('excluded')
    }
    // no crop with a ceiling under the shade gets through it, at whichever gate it stops
    for (const crop of CATALOG.filter((one) => one.light.maxDesignRsr.value < 0.7)) {
      expect(verdictOf(planOf(shaded, crop.id)), crop.id).toBe('excluded')
    }
  })
})

describe('cropsForConditions on soil', () => {
  const mapSiteAt = (phUnits: number): Site =>
    siteFixture({ soil: { ...siteFixture().soil, phUnits, sourceId: 'soilgrids' } })

  it('excludes a crop on a typed pH under its range', () => {
    // tomato carries ECOCROP's pH trapezoid for Lycopersicon esculentum, 5 to 7.5
    const { absoluteMin, absoluteMax } = cropOf('tomato').envelope.soilPh
    expect([absoluteMin, absoluteMax]).toEqual([5, 7.5])
    const plan = planOf(fitOf({ soil: { kind: 'own', phUnits: 4.6 } }), 'tomato')
    expect(verdictOf(plan)).toBe('excluded')
    expect(plan.limiting?.stage).toBe('soil-water')
    expect(plan.limiting?.cause.kind).toBe('soil-ph')
  })

  it("only lowers a crop's standing for the same pH read off the soil map", () => {
    const mapped = planOf(fitOf({ site: mapSiteAt(4.6), soil: { kind: 'map' } }), 'tomato')
    expect(verdictOf(mapped)).toBe('marginal')
    expect(mapped.limiting?.stage).toBe('soil-water')
    expect(mapped.limiting?.cause.kind).toBe('soil-ph')
    expect(mapped.score).toBeLessThan(planOf(fitOf(), 'tomato').score)
  })

  it('excludes a crop with a hard pH envelope on a typed pH outside it, and keeps it on a map pH', () => {
    const blueberry = cropOf('blueberry')
    expect(hardPhEnvelope(blueberry)).toBe(true)
    const typed = planOf(fitOf({ soil: { kind: 'own', phUnits: 7.5 } }), 'blueberry')
    expect(verdictOf(typed)).toBe('excluded')
    expect(typed.limiting?.cause.kind).toBe('soil-ph')
    const mapped = planOf(fitOf({ site: mapSiteAt(7.5), soil: { kind: 'map' } }), 'blueberry')
    expect(verdictOf(mapped)).not.toBe('excluded')
  })
})

describe('cropsForConditions on watering', () => {
  it('flags the drought-sensitive crops of a dry site that gets no water, and none once it is watered', () => {
    // Pune. Phoenix is water-limited too, but at 200 mm of rain the rainfall envelope holds back
    // almost every crop that gets past the climate gate, and the pipeline lists that limit ahead of
    // this advisory (see the Phoenix test below)
    const site = frostFreeSiteFixture()
    expect(site.waterLimitation.limited).toBe(true)
    const flagged = withCause(fitOf({ site, irrigation: 'none' }), 'water')
    expect(flagged.length).toBeGreaterThan(0)
    expect(withCause(fitOf({ site, irrigation: 'drip' }), 'water')).toHaveLength(0)
    // an advisory from the soil-water stage: the crop stays in, and it depletes its soil water early
    for (const plan of flagged) {
      expect(plan.limiting?.stage).toBe('soil-water')
      expect(verdictOf(plan)).toBe('marginal')
      expect(cropOf(plan.recommendation.cropId).roots.depletionFraction).toBeLessThanOrEqual(0.3)
    }
  })

  it('recommends fewer crops at Phoenix without water than with it, and holds the rest back on rain', () => {
    const site = hotDesertSiteFixture()
    expect(site.waterLimitation.limited).toBe(true)
    const dry = fitOf({ site, irrigation: 'none' })
    const watered = fitOf({ site, irrigation: 'drip' })
    expect(countOf(dry, 'recommended')).toBeLessThan(countOf(watered, 'recommended'))
    const heldBack = withCause(dry, 'fao-ecocrop').filter((plan) => verdictOf(plan) === 'marginal')
    expect(heldBack.length).toBeGreaterThan(0)
    for (const plan of heldBack) {
      const cause = plan.limiting?.cause
      expect(cause?.kind === 'fao-ecocrop' ? cause.parameter : null).toBe('rainfall')
    }
  })
})

describe('cropsForConditions on the frost percentile', () => {
  it('ranks the same crops in the same order with no percentile as with the default', () => {
    const omitted = idsOf(fitOf({ frostPercentile: undefined }))
    expect(idsOf(fitOf({ frostPercentile: DEFAULT_FROST_PERCENTILE }))).toEqual(omitted)
    // the other tests in this file pass 20 and rely on it being the default
    expect(idsOf(fitOf({ frostPercentile: 20 }))).toEqual(omitted)
  })

  it('reads a percentile it is given', () => {
    expect(idsOf(fitOf({ frostPercentile: 10 }))).not.toEqual(idsOf(fitOf({ frostPercentile: 50 })))
  })
})
