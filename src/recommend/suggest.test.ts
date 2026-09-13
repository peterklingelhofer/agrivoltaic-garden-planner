import { beforeAll, describe, expect, it } from 'bun:test'
import { loadCompanionRules, loadRotationConstraints } from '../data/companions'
import { loadCropCatalog } from '../data/crops'
import { loadTekRules } from '../data/tek'
import { banded, interval } from '../types/band'
import type { CompanionRule, RotationConstraint } from '../types/companion'
import type { Crop } from '../types/crop'
import type { Bed } from '../types/garden'
import type { CropId, PlantingId } from '../types/ids'
import type { BedLight } from '../types/light'
import type { CropPreference, PreferenceSet, SuggestionSet } from '../types/polyculture'
import type { RecommendationSet } from '../types/recommend'
import type { Site } from '../types/site'
import type { TekDesignRule } from '../types/tek'
import type { Fraction, Meters, MolPerM2Day, SquareMeters } from '../types/units'
import { cropCalendar } from './calendar'
import { runRecommendationPipeline } from './pipeline'
import { derivePlanting } from './planting'
import { DEFAULT_WEIGHTS } from './stages/rank'
import {
  allocateSpace,
  ambitionPreferences,
  AMBITION_CLASSES,
  emptyPreferences,
  measuredLightEnvelope,
  orchardScale,
  preferredCropIdsOf,
  suggestPolycultures,
  withAmbition,
} from './suggest'
import {
  PHOENIX_OPEN_SKY_DLI,
  bedFixture,
  bedLightFixture,
  hotDesertSiteFixture,
  monthly,
  plotFixture,
  siteFixture,
} from './testkit'

let catalog: readonly Crop[]
let companionRules: readonly CompanionRule[]
let rotationConstraints: readonly RotationConstraint[]
let tekRules: readonly TekDesignRule[]

const crop = (id: string): Crop => {
  const found = catalog.find((entry) => entry.id === (id as CropId))
  if (found === undefined) throw new Error(`no crop ${id}`)
  return found
}

const ACID_SOIL = {
  phUnits: 5,
  textureClass: 'loam',
  drainage: 'well',
  effectiveDepthM: 1.5 as Meters,
  organicMatterFraction: 0.04 as Fraction,
  sourceId: 'user',
} as const

const preferences = (entries: readonly CropPreference[], influence = 0.2): PreferenceSet => ({
  entries,
  influence: influence as Fraction,
})

const prefer = (cropId: string, kind: CropPreference['kind'], weight = 1): CropPreference => ({
  cropId: cropId as CropId,
  kind,
  weight: weight as Fraction,
})

const ENERGY_RATIO = banded(
  interval(0.8 as Fraction, 0.9 as Fraction),
  0.95,
  'confidence',
  'optical-geometry',
  [],
)

const suggest = (preferenceSet: PreferenceSet, phUnits = 5.4): SuggestionSet => {
  const soil = { ...ACID_SOIL, phUnits }
  const bed: Bed = bedFixture('bed-a', { soil })
  const plot = plotFixture([bed])
  const light = bedLightFixture('bed-a', 0.2)
  const site = siteFixture({ soil })
  const recommendations = runRecommendationPipeline({
    site,
    plot,
    bedLight: [light],
    catalog,
    companionRules,
    rotationConstraints,
    frostPercentile: 20,
    weights: DEFAULT_WEIGHTS,
    preferredCropIds: preferredCropIdsOf(preferenceSet),
  })[0]
  if (recommendations === undefined) throw new Error('no recommendation set')
  return suggestPolycultures({
    bed,
    arrays: plot.arrays,
    light,
    site,
    catalog,
    recommendations,
    preferences: preferenceSet,
    companionRules,
    rotationConstraints,
    tekRules,
    energyRatio: ENERGY_RATIO,
    maxSuggestions: 4,
  })
}

beforeAll(async () => {
  const [loaded, companion, rotation, tek] = await Promise.all([
    loadCropCatalog(),
    loadCompanionRules(),
    loadRotationConstraints(),
    loadTekRules(),
  ])
  catalog = loaded
  companionRules = companion
  rotationConstraints = rotation
  tekRules = tek
})

describe('space is a first-class constraint', () => {
  it('refuses a combination that does not fit and states the shortfall', () => {
    const accounting = allocateSpace(
      [crop('blueberry'), crop('apple'), crop('sweet-corn')],
      2 as SquareMeters,
    )
    expect(accounting.fits).toBe(false)
    expect(accounting.shortfallM2).toBeGreaterThan(0)
    expect(accounting.requiredAreaM2).toBeGreaterThan(accounting.bedAreaM2)
    expect(accounting.allocations).toEqual([])
  })

  it('gives every crop at least one plant before anything gets a second', () => {
    const accounting = allocateSpace([crop('blueberry'), crop('teaberry')], 12 as SquareMeters)
    expect(accounting.fits).toBe(true)
    expect(accounting.shortfallM2).toBe(0)
    for (const allocation of accounting.allocations) {
      expect(allocation.plantCount).toBeGreaterThanOrEqual(1)
      expect(allocation.allocatedAreaM2).toBeGreaterThanOrEqual(allocation.areaPerPlantM2)
    }
    const used = accounting.allocations.reduce((total, entry) => total + entry.allocatedAreaM2, 0)
    expect(used).toBeCloseTo(accounting.bedAreaM2, 6)
  })

  it('never places a suggestion it cannot fit in the bed', () => {
    const set = suggest(preferences([prefer('blueberry', 'require')]))
    for (const suggestion of set.suggestions) {
      expect(suggestion.fits).toBe(true)
      expect(suggestion.space.shortfallM2).toBe(0)
    }
  })
})

describe('a blueberry anchor', () => {
  it('builds acid-soil polycultures around it and never offers a brassica', () => {
    const set = suggest(preferences([prefer('blueberry', 'require')]))
    expect(set.anchorCropIds).toEqual(['blueberry' as CropId])
    expect(set.suggestions.length).toBeGreaterThan(0)
    const partners = new Set(
      set.suggestions.flatMap((entry) => entry.cropIds.map((id) => id as string)),
    )
    expect(partners.has('blueberry')).toBe(true)
    for (const suggestion of set.suggestions) {
      expect(suggestion.cropIds).toContain('blueberry' as CropId)
      for (const cropId of suggestion.cropIds) {
        expect(crop(cropId as string).envelope.soilPh.optimumMin).toBeLessThanOrEqual(5.5)
      }
    }
    const refusedKale = set.refused.find((entry) => entry.cropId === ('kale' as CropId))
    expect(refusedKale?.reason).toMatch(/pH/)
    expect(refusedKale?.conflictsWithCropId).toBe('blueberry' as CropId)
  })

  it('carries a per-term breakdown, a banded LER and an honest confidence', () => {
    const [best] = suggest(preferences([prefer('blueberry', 'require')])).suggestions
    expect(best).toBeDefined()
    if (best === undefined) return
    expect(best.pairs.length).toBeGreaterThan(0)
    expect(
      new Set(best.pairs.flatMap((pair) => pair.terms.map((term) => term.kind))).size,
    ).toBeGreaterThanOrEqual(5)
    expect(best.ler.totalLer.interval.lower).toBeLessThan(best.ler.totalLer.interval.upper)
    expect(best.ler.totalLer.intervalKind).toBe('confidence')
    expect(['low', 'moderate', 'high']).toContain(best.confidence.band)
    expect(best.confidence.weakestDataTier).toBe('C')
    expect(best.tekRuleKeys).toContain('polyculture-risk-spreading')
  })

  it('refuses the anchor outright, with the limiting factor, where the bed cannot grow it', () => {
    const set = suggest(preferences([prefer('blueberry', 'require')]), 7.2)
    expect(set.anchorCropIds).toEqual([])
    expect(set.suggestions).toEqual([])
    const refusal = set.refused.find((entry) => entry.cropId === ('blueberry' as CropId))
    expect(refusal?.limiting?.cause).toEqual({ kind: 'fao-ecocrop', parameter: 'soil-ph' })
    expect(refusal?.reason.length).toBeGreaterThan(0)
  })
})

/**
 * A combination is built around something to eat. Support plants (an insectary, a cover crop, a
 * nurse, a trap) score well on the compatibility and stratification terms, so seeding combinations
 * with them would hand the grower eastern teaberry in every bed of a plot where tomatoes fit. They
 * may still join a combination once a food crop has started it
 */
describe('suggestions lead with food', () => {
  it('never puts a support plant first in a combination', () => {
    const set = suggest(emptyPreferences(), 6.5)
    expect(set.suggestions.length).toBeGreaterThan(0)
    for (const suggestion of set.suggestions) {
      const lead = crop(suggestion.cropIds[0] as string)
      expect(lead.role, `${lead.id as string} leads ${suggestion.cropIds.join('+')}`).toBeNull()
    }
  })
})

/**
 * A perennial taller than a bed's trellis is an orchard or arbour decision. The stratification term
 * rewards a tall tier over a low one, so on a sunny plot whose grower answered "Tomatoes, peppers
 * and berries" it would put hops (6 m, three years to a first harvest) in six of eleven beds. Such
 * a crop joins only when the grower names it, and the refusal says so
 */
describe('orchard-scale perennials wait to be asked for', () => {
  const ASKED_FOR = 'only when you ask for it'

  it('keeps every orchard-scale crop out of every combination, and says why', () => {
    const set = suggest(emptyPreferences(), 6.5)
    expect(set.suggestions.length).toBeGreaterThan(0)
    for (const suggestion of set.suggestions) {
      for (const id of suggestion.cropIds) {
        expect(orchardScale(crop(id as string)), `${id as string} in a bed`).toBe(false)
      }
    }
    const kept = set.refused.filter((entry) => entry.reason.includes(ASKED_FOR))
    expect(kept.length).toBeGreaterThan(0)
    for (const refusal of kept) expect(orchardScale(crop(refusal.cropId as string))).toBe(true)
    expect(orchardScale(crop('hops'))).toBe(true)
    expect(orchardScale(crop('tomato'))).toBe(false)
    expect(orchardScale(crop('raspberry'))).toBe(false)
  })

  it('leaves a named one in the pool', () => {
    const named = suggest(emptyPreferences(), 6.5).refused.find((entry) =>
      entry.reason.includes(ASKED_FOR),
    )
    if (named === undefined) throw new Error('nothing to name')
    const set = suggest(preferences([prefer(named.cropId as string, 'prefer')], 0.9), 6.5)
    expect(set.refused.some((entry) => entry.cropId === named.cropId)).toBe(false)
  })

  it('is what the growing answer leaves out of its lean', () => {
    const leaned = ambitionPreferences('fruiting-and-berries', catalog)
    expect(leaned.entries.some((entry) => (entry.cropId as string) === 'hops')).toBe(false)
    expect(leaned.entries.some((entry) => (entry.cropId as string) === 'raspberry')).toBe(true)
  })
})

/**
 * The growing answer reaches the combinations and the ranking as preferences, merged under the
 * grower's own entries: an explicit entry for a crop wins, and the answer leans everything else
 */
describe('the growing answer leans the combinations', () => {
  it('names food crops of the classes the answer names, and nothing else', () => {
    const leaned = ambitionPreferences('fruiting-and-berries', catalog)
    expect(leaned.entries.length).toBeGreaterThan(0)
    for (const entry of leaned.entries) {
      const named = crop(entry.cropId as string)
      expect(entry.kind).toBe('prefer')
      expect(named.role).toBeNull()
      expect(AMBITION_CLASSES['fruiting-and-berries']).toContain(named.dliClass)
    }
    expect(leaned.entries.some((entry) => (entry.cropId as string) === 'tomato')).toBe(true)
  })

  it('merges under the grower own entries, so an explicit answer about a crop wins', () => {
    const own = preferences([prefer('tomato', 'avoid')], 0.4)
    const merged = withAmbition(own, 'fruiting-and-berries', catalog)
    expect(merged.influence).toBe(own.influence)
    expect(merged.entries.filter((entry) => (entry.cropId as string) === 'tomato')).toEqual([
      prefer('tomato', 'avoid'),
    ])
    expect(merged.entries.length).toBeGreaterThan(own.entries.length)
    // and the pipeline's flat list carries the lean, which is how the ranking sees it
    expect(preferredCropIdsOf(merged).length).toBeGreaterThan(0)
  })

  it('seeds a fruiting crop for one answer and a leafy green for another, on the same bed', () => {
    const leadOf = (ambition: 'fruiting-and-berries' | 'leafy-and-herbs'): Crop => {
      const set = suggest(withAmbition(preferences([], 0.9), ambition, catalog), 6.5)
      const first = set.suggestions[0]
      if (first === undefined) throw new Error(`no combination for ${ambition}`)
      return crop(first.cropIds[0] as string)
    }
    expect(['solanaceae', 'cucurbits']).toContain(leadOf('fruiting-and-berries').dliClass)
    expect(['leafy-greens', 'understory-herbs']).toContain(leadOf('leafy-and-herbs').dliClass)
  })
})

describe('preferences move the result', () => {
  it('raises the rank of a preferred crop', () => {
    const rankOf = (set: SuggestionSet, cropId: string): number =>
      set.suggestions.findIndex((entry) => entry.cropIds.includes(cropId as CropId))
    const base = suggest(preferences([prefer('blueberry', 'require')]))
    const target = base.suggestions
      .flatMap((entry) => entry.cropIds.map((id) => id as string))
      .find((cropId) => cropId !== 'blueberry' && rankOf(base, cropId) > 0)
    expect(target).toBeDefined()
    if (target === undefined) return
    const boosted = suggest(
      preferences([prefer('blueberry', 'require'), prefer(target, 'prefer')], 0.9),
    )
    expect(rankOf(boosted, target)).toBeLessThan(rankOf(base, target))
  })

  it('removes an excluded crop entirely rather than merely down-weighting it', () => {
    const base = suggest(preferences([prefer('blueberry', 'require')]))
    const victim = base.suggestions
      .flatMap((entry) => entry.cropIds.map((id) => id as string))
      .find((cropId) => cropId !== 'blueberry')
    expect(victim).toBeDefined()
    if (victim === undefined) return
    const filtered = suggest(
      preferences([prefer('blueberry', 'require'), prefer(victim, 'exclude')]),
    )
    for (const suggestion of filtered.suggestions) {
      expect(suggestion.cropIds).not.toContain(victim as CropId)
    }
  })

  it('lets an avoid weight push a crop down without banning it', () => {
    const set = suggest(
      preferences([prefer('blueberry', 'require'), prefer('teaberry', 'avoid', 1)], 0.9),
    )
    const withTeaberry = set.suggestions.filter((entry) =>
      entry.cropIds.includes('teaberry' as CropId),
    )
    for (const suggestion of withTeaberry) {
      expect(suggestion.score.preference).toBeLessThan(1)
    }
  })
})

const phoenixLight = (rsr: number): BedLight => ({
  ...bedLightFixture('bed-a', rsr),
  monthlyMeanDliMolM2Day: monthly(
    PHOENIX_OPEN_SKY_DLI.map((value) => (value * (1 - rsr)) as MolPerM2Day),
  ),
  monthlyMinDliMolM2Day: monthly(
    PHOENIX_OPEN_SKY_DLI.map((value) => (value * (1 - rsr) * 0.9) as MolPerM2Day),
  ),
  monthlyOpenSkyDliMolM2Day: monthly(PHOENIX_OPEN_SKY_DLI.map((value) => value as MolPerM2Day)),
})

interface PhoenixRun {
  readonly bed: Bed
  readonly site: Site
  readonly light: BedLight
  readonly recommendations: RecommendationSet
  readonly set: SuggestionSet
}

const atPhoenix = (rsr: number): PhoenixRun => {
  const bed = bedFixture('bed-a')
  const plot = plotFixture([bed])
  const site = hotDesertSiteFixture()
  const light = phoenixLight(rsr)
  const recommendations = runRecommendationPipeline({
    site,
    plot,
    bedLight: [light],
    catalog,
    companionRules,
    rotationConstraints,
    frostPercentile: 20,
    weights: DEFAULT_WEIGHTS,
    preferredCropIds: [],
  })[0]
  if (recommendations === undefined) throw new Error('no recommendation set')
  return {
    bed,
    site,
    light,
    recommendations,
    set: suggestPolycultures({
      bed,
      arrays: plot.arrays,
      light,
      site,
      catalog,
      recommendations,
      preferences: emptyPreferences(),
      companionRules,
      rotationConstraints,
      tekRules,
      energyRatio: ENERGY_RATIO,
      maxSuggestions: 5,
    }),
  }
}

describe('an inference never passes for a measurement', () => {
  it('reads the measured envelope off the catalogue rather than off a constant', () => {
    const envelope = measuredLightEnvelope(catalog)
    // lettuce at 5.8 mol/m2/d (Pennisi et al. 2020, the lowest level a cited trial grew it at),
    // and potato's 0.5 design ceiling: the only measured ends
    expect(envelope.lowestFloorMolM2Day).toBe(5.8)
    expect(envelope.deepestRsr).toBe(0.5)
    for (const entry of catalog) {
      if (entry.light.maxDesignRsr.value > envelope.deepestRsr) {
        expect(entry.light.maxDesignRsr.provenance).toBe('inferred')
      }
    }
  })

  /**
   * The defect this reproduces. A Phoenix shade band at 55 percent season-cumulative shade
   * refuses lettuce, spinach and sixty-odd others on shade ceilings that were MEASURED, and keeps
   * claytonia on an inferred 0.6 that is 0.1 past anything measured. Nothing here claims claytonia
   * fails: no measured figure says that either. What it refuses to do is present the survivor as
   * the equal of the numbers it outlived
   *
   * The band used to be 72 percent and the survivor used to be ramps, which is no longer
   * admissible at Phoenix at any shade: the climate gate now judges a perennial on the July it
   * stands through rather than on its March-to-May window alone, so a woodland ephemeral is ruled
   * out of a desert bed on temperature before light is ever consulted. That is the outcome
   * `dli.ts` promises the user on screen; this test's subject was always the inference, not ramps
   */
  it('names the inference a deep shade band rests on, and the figures it overrode', () => {
    const { set } = atPhoenix(0.55)
    const [best] = set.suggestions
    expect(best).toBeDefined()
    if (best === undefined) return
    expect(best.cropIds).toContain('claytonia' as CropId)
    // the crops are in the order the combination was built in, so the admission is found by
    // name rather than taken as the first
    const admission = best.confidence.inferredLightAdmissions.find(
      (entry) => entry.cropId === ('claytonia' as CropId),
    )
    expect(admission?.cropId).toBe('claytonia' as CropId)
    expect(admission?.threshold).toBe('max-design-rsr')
    expect(admission?.inferredValue).toBe(0.6)
    expect(admission?.measuredEnvelopeValue).toBe(0.5)
    expect(best.confidence.band).toBe('low')
    expect(best.confidence.reasons.some((reason) => reason.includes('class-level inference'))).toBe(
      true,
    )

    // and the measured refusals it stands on top of are legible, not silently dropped
    const lettuce = set.refused.find((entry) => entry.cropId === ('lettuce-leaf' as CropId))
    expect(lettuce?.limiting?.cause).toEqual({ kind: 'max-design-rsr' })
    expect(lettuce?.reason).toMatch(/design ceiling/)
    for (const refusal of set.refused) {
      expect(refusal.limiting?.cause).toEqual({ kind: 'max-design-rsr' })
      expect(crop(refusal.cropId as string).light.maxDesignRsr.provenance).not.toBe('inferred')
    }
  })

  it('leaves a bed inside the measured envelope alone', () => {
    const { set } = atPhoenix(0.02)
    expect(set.suggestions.length).toBeGreaterThan(0)
    for (const suggestion of set.suggestions) {
      expect(suggestion.confidence.inferredLightAdmissions).toEqual([])
    }
    // nothing overrode a measured figure here, so no measured refusal is surfaced either
    expect(set.refused.filter((entry) => entry.limiting !== null)).toEqual([])
  })

  it('sorts a combination resting on an inference below every one that does not', () => {
    for (const rsr of [0.02, 0.45, 0.72]) {
      const rested = atPhoenix(rsr).set.suggestions.map(
        (suggestion) => suggestion.confidence.inferredLightAdmissions.length > 0,
      )
      expect(rested).toEqual([...rested].sort((left, right) => Number(left) - Number(right)))
    }
  })

  /**
   * The other half of the original defect, and the reason it is checked from here: a suggestion
   * whose plantings are then refused is not a suggestion. `seasonOrigin` is the site's coldest
   * month (`calendar.ts`). A fixed 120 day lead before the last spring freeze would wrap it to day
   * 280 at Phoenix, which freezes on day 35, and crops would come back `season-too-short` at a site
   * with a 287 day frost-free window. This asserts that nothing offered comes back refused
   */
  it('offers nothing whose plantings the calendar then refuses', () => {
    const { bed, site, light, set } = atPhoenix(0.02)
    const [best] = set.suggestions
    expect(best).toBeDefined()
    if (best === undefined) return
    expect(best.cropIds.length).toBeGreaterThan(1)
    for (const cropId of best.cropIds) {
      const candidate = crop(cropId as string)
      const calendar = cropCalendar({ crop: candidate, site, light, percentile: 20 })
      const planting = derivePlanting({
        id: `${bed.id as string}:${cropId as string}` as PlantingId,
        bed,
        crop: candidate,
        arrays: [],
        calendar,
      })
      expect(planting.ok ? '' : planting.reason).toBe('')
    }
  })
})

describe('determinism', () => {
  it('produces an identical ranking on a repeated run', () => {
    const preferenceSet = preferences([prefer('blueberry', 'require')])
    const first = suggest(preferenceSet)
    const second = suggest(preferenceSet)
    expect(second.suggestions.map((entry) => entry.cropIds)).toEqual(
      first.suggestions.map((entry) => entry.cropIds),
    )
    expect(second.suggestions.map((entry) => entry.score.total)).toEqual(
      first.suggestions.map((entry) => entry.score.total),
    )
  })

  it('sorts refusals and suggestions rather than leaving map order to chance', () => {
    const set = suggest(preferences([prefer('blueberry', 'require')]))
    const ids = set.refused.map((entry) => entry.cropId as string)
    expect(ids).toEqual([...ids].sort())
    const totals = set.suggestions.map((entry) => entry.score.total)
    expect(totals).toEqual([...totals].sort((left, right) => right - left))
  })
})
