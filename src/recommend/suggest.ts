import { partitionCompanionRules } from '../data/companions'
import { cropLabel } from '../data/crops'
import { clamp, monthsInWindow } from '../data/util'
import { banded, interval, unsafeBandMidpoint } from '../types/band'
import type { Banded } from '../types/band'
import type { CompanionRule, RotationConstraint } from '../types/companion'
import type { Crop, DliClass } from '../types/crop'
import type { DataTier } from '../types/evidence'
import type { Bed, CanopyTier } from '../types/garden'
import type { CropId } from '../types/ids'
import type { BedLight, SeasonLight } from '../types/light'
import type {
  CompatibilityWeights,
  ConfidenceBand,
  InferredLightAdmission,
  PairCompatibility,
  PolycultureSuggestion,
  PreferenceKind,
  PreferenceSet,
  SpaceAccounting,
  SpaceAllocation,
  SpaceRefusal,
  SuggestionConfidence,
  SuggestionRefusal,
  SuggestionSet,
} from '../types/polyculture'
import type { GrowingAmbition } from '../types/onboarding'
import type { PvArray } from '../types/pv'
import type { LimitingFactor, RecommendationSet, YieldEstimate } from '../types/recommend'
import type { ExceedancePercentile, Site } from '../types/site'
import type { TekDesignRule, TekRuleKey } from '../types/tek'
import type { Fraction, SquareMeters } from '../types/units'
import { DEFAULT_COMPATIBILITY_WEIGHTS, evaluatePair } from './compatibility'
import type { PairContext } from './compatibility'
import { areaPerPlantM2, plantingDensity } from './planting'
import { scoreOf } from './stages/rank'
import { assignCanopyTier } from './stages/space'
import { NO_WILDLIFE_PREFERENCE, wildlifeMatch, type WildlifePreference } from './wildlife'
import { landEquivalentRatio } from './yield'

export interface SuggestionRequest {
  readonly bed: Bed
  readonly arrays: readonly PvArray[]
  readonly light: BedLight
  readonly site: Site
  readonly catalog: readonly Crop[]
  /** The same frost-risk setting the ranking reads light at, so a pairing term reads one season */
  readonly frostPercentile: ExceedancePercentile
  /** The per-crop pipeline output for this bed. Suggestions never re-gate a crop */
  readonly recommendations: RecommendationSet
  readonly preferences: PreferenceSet
  readonly companionRules: readonly CompanionRule[]
  readonly rotationConstraints: readonly RotationConstraint[]
  readonly tekRules: readonly TekDesignRule[]
  readonly energyRatio: Banded<Fraction>
  readonly weights?: CompatibilityWeights
  readonly maxCropsPerBed?: number
  readonly maxSuggestions?: number
  /**
   * The wildlife answers, together with the site's botanical area, read the same way the
   * ranking reads them in pipeline.ts. Absent when neither question was asked
   */
  readonly wildlife?: WildlifePreference
}

export const DEFAULT_MAX_CROPS_PER_BED = 4

export const DEFAULT_MAX_SUGGESTIONS = 5

export const SUGGESTION_WEIGHTS = {
  agronomic: 0.4,
  compatibility: 0.3,
  stratification: 0.15,
  portfolio: 0.2,
} as const

export const emptyPreferences = (): PreferenceSet => ({ entries: [], influence: 0.2 as Fraction })

export const cropIdsPreferred = (
  preferences: PreferenceSet,
  kind: PreferenceKind,
): readonly CropId[] =>
  preferences.entries.filter((entry) => entry.kind === kind).map((entry) => entry.cropId)

/** The pipeline's flat preference list, derived here so both stages read one object */
export const preferredCropIdsOf = (preferences: PreferenceSet): readonly CropId[] =>
  preferences.entries
    .filter((entry) => entry.kind === 'require' || entry.kind === 'prefer')
    .map((entry) => entry.cropId)

/**
 * Which crop classes each answer to the growing question names. "A bit of everything" names
 * the ordinary vegetable garden: without it the answer changed the shade
 * budget of the layout search and not one crop of the beds it placed
 */
export const AMBITION_CLASSES: Readonly<Record<GrowingAmbition, readonly DliClass[]>> = {
  'leafy-and-herbs': ['leafy-greens', 'understory-herbs'],
  'fruiting-and-berries': ['solanaceae', 'strawberry', 'cane-bush-berries', 'cucurbits'],
  'mixed-vegetables': [
    'brassicas',
    'root-tuber',
    'alliums',
    'grain-legumes',
    'cucurbits',
    'solanaceae',
    'leafy-greens',
  ],
}

/** A lean: half the weight of a crop the grower named themselves */
export const AMBITION_WEIGHT = 0.5 as Fraction

/**
 * The height above which a perennial is a tree, a vine on a permanent trellis or an orchard
 * row, in metres. Hops (6 m), hardy kiwi (5 m),
 * grape, elderberry and every fruit tree in the catalogue sit above it; blackberry and aronia
 * (2 m) sit on it and stay
 */
export const BED_PERENNIAL_HEIGHT_M = 2

/**
 * A perennial that stands taller than a bed's trellis is an orchard or arbour decision, so it
 * joins a combination only when the grower names it. The stratification term rewards a tall
 * tier over a low one, and with nothing to say otherwise it put hops in six of eleven beds of a
 * plot whose grower had answered "Tomatoes, peppers and berries" (Decision Record 19)
 */
export const orchardScale = (crop: Crop): boolean =>
  crop.lifeCycle !== 'annual' &&
  crop.lifeCycle !== 'biennial' &&
  crop.footprint.heightM.typicalM > BED_PERENNIAL_HEIGHT_M

/**
 * The growing answer as preferences: a `prefer` entry for every food crop in the classes it names.
 * Without this, the growing answer would reach the layout search's shade budget alone, so a "mixed
 * vegetables" answer could still surface hops, sorrel and tomatillo. This is how it reaches them,
 * through the same preference term a named crop moves, so it can lean the ranking and the
 * combinations without ever excluding anything
 */
export const ambitionPreferences = (
  ambition: GrowingAmbition,
  catalog: readonly Crop[],
): PreferenceSet => ({
  entries: catalog
    .filter(
      (crop) =>
        crop.role === null &&
        !orchardScale(crop) &&
        AMBITION_CLASSES[ambition].includes(crop.dliClass),
    )
    .map((crop) => ({ cropId: crop.id, kind: 'prefer' as const, weight: AMBITION_WEIGHT })),
  influence: 0 as Fraction,
})

/**
 * The grower's own entries with the growing answer merged UNDER them: an explicit entry for a
 * crop wins, whatever it says, and the answer fills in around it. The influence is the grower's
 * own, so the answer moves a score by exactly as much as they let a named crop move it
 */
export const withAmbition = (
  preferences: PreferenceSet,
  ambition: GrowingAmbition,
  catalog: readonly Crop[],
): PreferenceSet => {
  const named = new Set(preferences.entries.map((entry) => entry.cropId as string))
  const leaned = ambitionPreferences(ambition, catalog).entries.filter(
    (entry) => !named.has(entry.cropId as string),
  )
  return leaned.length === 0
    ? preferences
    : { ...preferences, entries: [...preferences.entries, ...leaned] }
}

/** -1 to 1. `exclude` never reaches here: it removes the crop */
export const preferenceSignal = (preferences: PreferenceSet, cropId: CropId): number => {
  const entry = preferences.entries.find((candidate) => candidate.cropId === cropId)
  if (entry === undefined) return 0
  switch (entry.kind) {
    case 'require':
      return 1
    case 'prefer':
      return clamp(entry.weight, 0, 1)
    case 'avoid':
      return -clamp(entry.weight, 0, 1)
    case 'exclude':
      return -1
  }
}

/**
 * What a crop carries into the combinations: whatever the grower named, plus a wildlife lean the
 * size of the growing answer's own, capped at 1. A native that's also in what the grower asked to
 * grow, or a forage plant that's also asked for, scores like a named pick, and one that's only
 * native, only forage or only asked scores half. A named avoid or exclude stands, whatever the
 * wildlife answers say
 *
 * At full strength a native outscored the growing answer two to one, and with the natives switch
 * on a food garden came out all native. The ranking's preference term in pipeline.ts still takes
 * the strongest single ask, so the two rules differ here on purpose
 */
export const askedForSignal = (request: SuggestionRequest, crop: Crop): number => {
  const named = preferenceSignal(request.preferences, crop.id)
  if (named < 0) return named
  const wildlife = wildlifeMatch(crop, request.wildlife ?? NO_WILDLIFE_PREFERENCE) ?? 0
  return Math.min(1, named + AMBITION_WEIGHT * wildlife)
}

/**
 * Every crop gets one plant's worth of bed at catalogue spacing before anything
 * gets a second, and the surplus is then split evenly. A combination whose
 * floor exceeds the bed is reported as not fitting with the shortfall: it is
 * never quietly trimmed to whatever happened to fit
 */
export const allocateSpace = (crops: readonly Crop[], bedAreaM2: SquareMeters): SpaceAccounting => {
  const refusals: SpaceRefusal[] = []
  const floors: { readonly crop: Crop; readonly areaM2: number }[] = []
  for (const crop of crops) {
    const spacing = areaPerPlantM2(crop.spacing)
    if (spacing === null) {
      refusals.push({
        cropId: crop.id,
        reason: `${cropLabel(crop)} carries no usable spacing in the catalogue, so its share of the bed cannot be derived`,
      })
      continue
    }
    floors.push({ crop, areaM2: spacing.areaM2 })
  }
  const requiredAreaM2 = floors.reduce((total, entry) => total + entry.areaM2, 0)
  const shortfall = Math.max(requiredAreaM2 - bedAreaM2, 0)
  const fits = refusals.length === 0 && floors.length > 0 && shortfall === 0

  const allocations: SpaceAllocation[] = []
  if (fits) {
    const surplus = (bedAreaM2 - requiredAreaM2) / floors.length
    for (const entry of floors) {
      const allocatedAreaM2 = entry.areaM2 + surplus
      const density = plantingDensity(entry.crop, allocatedAreaM2)
      if (!density.ok) {
        refusals.push({ cropId: entry.crop.id, reason: density.reason })
        continue
      }
      allocations.push({
        cropId: entry.crop.id,
        basis: density.value.basis,
        areaPerPlantM2: density.value.areaPerPlantM2,
        allocatedAreaM2: allocatedAreaM2 as SquareMeters,
        plantCount: density.value.plantCount,
      })
    }
  }

  return {
    bedAreaM2,
    allocations,
    refusals,
    requiredAreaM2: requiredAreaM2 as SquareMeters,
    fits: fits && refusals.length === 0,
    shortfallM2: shortfall as SquareMeters,
  }
}

const canopyShares = (
  space: SpaceAccounting,
  bedAreaM2: SquareMeters,
): ReadonlyMap<CropId, Fraction> =>
  new Map(
    space.allocations.map((entry) => [
      entry.cropId,
      clamp(entry.allocatedAreaM2 / Math.max(bedAreaM2, 1e-6), 0, 1) as Fraction,
    ]),
  )

const pairKey = (a: CropId, b: CropId): string =>
  [a as string, b as string].sort((left, right) => left.localeCompare(right)).join('|')

const TIER_CAP = 4

const scaleEstimate = (estimate: YieldEstimate, share: number): YieldEstimate => ({
  ...estimate,
  relativeYield: banded(
    interval(
      (estimate.relativeYield.interval.lower * share) as Fraction,
      (estimate.relativeYield.interval.upper * share) as Fraction,
    ),
    estimate.relativeYield.confidence,
    estimate.relativeYield.intervalKind,
    estimate.relativeYield.dominantSource,
    estimate.relativeYield.contributions,
  ),
})

const WORST_TIER: readonly DataTier[] = ['C', 'B', 'A']

/**
 * Every light threshold the gate reads, not the minimum alone. Reading only the minimum would say
 * nothing about the ceiling that admits a shade-tolerant crop to a dark bed, which is the one doing
 * the work there
 */
const lightTiersOf = (crop: Crop): readonly DataTier[] => {
  const disorder = crop.light.dliMaxBeforeDisorderMolM2Day
  return [
    crop.light.dliMinMolM2Day.tier,
    crop.light.maxDesignRsr.tier,
    ...(disorder === null || disorder.tier === null ? [] : [disorder.tier]),
  ]
}

/** The dimmest bed and the deepest shade the catalogue's measured figures reach */
export interface MeasuredLightEnvelope {
  readonly lowestFloorMolM2Day: number
  readonly deepestRsr: number
}

/**
 * Read off the loaded catalogue, and never written down, so a single new measured row moves it
 * and nothing here has to be re-tuned by hand. Today it is 5.8 mol/m2/d, from lettuce, and a
 * 0.5 season-cumulative shade ratio, from potato.
 *
 * A catalogue with no measured entry of a kind yields an envelope no bed can fall outside,
 * because with nothing measured there is no comparison to make and inventing one would be the
 * same error in the other direction
 */
export const measuredLightEnvelope = (catalog: readonly Crop[]): MeasuredLightEnvelope => {
  const floors = catalog
    .filter((crop) => crop.light.dliMinMolM2Day.provenance !== 'inferred')
    .map((crop) => crop.light.dliMinMolM2Day.value as number)
  const ceilings = catalog
    .filter((crop) => crop.light.maxDesignRsr.provenance !== 'inferred')
    .map((crop) => crop.light.maxDesignRsr.value as number)
  return {
    lowestFloorMolM2Day: floors.length === 0 ? Number.NEGATIVE_INFINITY : Math.min(...floors),
    deepestRsr: ceilings.length === 0 ? Number.POSITIVE_INFINITY : Math.max(...ceilings),
  }
}

const dimmestMonthInWindow = (light: BedLight, seasonLight: SeasonLight): number => {
  const months = monthsInWindow(seasonLight.window.startMonth, seasonLight.window.endMonth)
  let dimmest = Number.POSITIVE_INFINITY
  for (const month of months)
    dimmest = Math.min(dimmest, light.monthlyMeanDliMolM2Day[month - 1] ?? 0)
  return Number.isFinite(dimmest) ? dimmest : 0
}

/**
 * The thresholds that admitted this crop to this bed and could not have refused it, because they
 * are class-level inferences pitched beyond every measured figure of their kind. Fourteen crops
 * in the shipped catalogue carry a shade ceiling past potato's measured 0.5 and every one of them
 * is inferred, so past that point a bed admits nothing on evidence: at Phoenix a 55 percent shade
 * band refuses sixty-nine crops including lettuce, spinach and kale on their measured ceilings and
 * keeps claytonia, mache, chervil, cilantro and parsley on an unmeasured 0.6.
 *
 * Deeper than that the bed keeps nothing at all. The only ceilings past 0.6 belong to teaberry,
 * wild ginger and ramps, and the climate gate rules all three out of a desert bed on the July they
 * stand through before light is ever consulted, so a 72 percent Phoenix band returns no suggestion.
 *
 * This is deliberately not an exclusion. Nothing measured says a woodland perennial fails at 72
 * percent shade either, and asserting that it does would fabricate the same confidence in the
 * opposite direction; what it does is stop the inference being presented as the equal of the
 * numbers it outlived
 */
export const inferredLightAdmissionsOf = (
  crop: Crop,
  light: BedLight,
  seasonLight: SeasonLight,
  envelope: MeasuredLightEnvelope,
): readonly InferredLightAdmission[] => {
  const admissions: InferredLightAdmission[] = []
  const ceiling = crop.light.maxDesignRsr
  if (
    ceiling.provenance === 'inferred' &&
    ceiling.value > envelope.deepestRsr &&
    seasonLight.cumulativeRsr > envelope.deepestRsr
  ) {
    admissions.push({
      cropId: crop.id,
      threshold: 'max-design-rsr',
      inferredValue: ceiling.value,
      measuredEnvelopeValue: envelope.deepestRsr,
      explanation: `This bed is ${(seasonLight.cumulativeRsr * 100).toFixed(0)} percent shaded across ${crop.id as string}'s season, and the only figure that lets it into this bed is a class-level inference of ${(ceiling.value * 100).toFixed(0)} percent. The deepest shade that any measured figure in this catalogue supports is ${(envelope.deepestRsr * 100).toFixed(0)} percent`,
    })
  }
  const floor = crop.light.dliMinMolM2Day
  const dimmest = dimmestMonthInWindow(light, seasonLight)
  if (
    floor.provenance === 'inferred' &&
    floor.value < envelope.lowestFloorMolM2Day &&
    dimmest < envelope.lowestFloorMolM2Day
  ) {
    admissions.push({
      cropId: crop.id,
      threshold: 'dli-minimum',
      inferredValue: floor.value,
      measuredEnvelopeValue: envelope.lowestFloorMolM2Day,
      explanation: `This bed falls to ${dimmest.toFixed(1)} mol/m²/d in ${crop.id as string}'s season, and the only figure that lets it into this bed is a class-level inference of ${floor.value.toFixed(1)}. The lowest floor that any measured figure in this catalogue supports is ${envelope.lowestFloorMolM2Day.toFixed(1)}`,
    })
  }
  return admissions
}

/** True where the light-gate threshold that turned this crop away was measured, not inferred */
const refusedOnMeasuredLight = (crop: Crop, limiting: LimitingFactor): boolean => {
  if (limiting.stage !== 'light-gate') return false
  switch (limiting.cause.kind) {
    case 'dli-minimum':
      return crop.light.dliMinMolM2Day.provenance !== 'inferred'
    case 'max-design-rsr':
      return crop.light.maxDesignRsr.provenance !== 'inferred'
    default:
      return false
  }
}

const confidenceOf = (
  crops: readonly Crop[],
  pairs: readonly PairCompatibility[],
  inferredLightAdmissions: readonly InferredLightAdmission[],
): SuggestionConfidence => {
  const weakestDataTier =
    WORST_TIER.find((tier) => crops.some((crop) => lightTiersOf(crop).includes(tier))) ?? 'A'
  const terms = pairs.flatMap((pair) => pair.terms)
  const scoredTermCount = terms.filter((entry) => entry.scores).length
  const unscoredClaimCount =
    terms.filter((entry) => !entry.scores).length +
    pairs.reduce((total, pair) => total + pair.experimental.length + pair.folklore.length, 0)
  const cautions = terms.filter((entry) => entry.verdict === 'caution')
  const reasons: string[] = []
  if (weakestDataTier === 'C') {
    reasons.push(
      'At least one crop here carries a Tier C DLI threshold, inferred from its sun-hour class. Trust the ordering, and treat the light numbers as provisional',
    )
  }
  for (const admission of inferredLightAdmissions) {
    reasons.push(admission.explanation)
  }
  // three pairs of the same family carry the identical sentence, and the UI keys this list on
  // the sentence, so each distinct one lands here once, in the order it was first seen
  const seenCautions = new Set<string>()
  for (const caution of cautions) {
    if (seenCautions.has(caution.explanation)) continue
    seenCautions.add(caution.explanation)
    reasons.push(caution.explanation)
  }
  if (unscoredClaimCount > 0) {
    reasons.push(
      `${String(unscoredClaimCount)} claim(s) about this combination are shown for information. Their evidence grade doesn't allow them to move its score`,
    )
  }
  // an admission nothing measured stands behind is low whatever else is right about it
  const band: ConfidenceBand =
    inferredLightAdmissions.length > 0
      ? 'low'
      : cautions.length === 0 && weakestDataTier !== 'C'
        ? 'high'
        : cautions.length > pairs.length || (weakestDataTier === 'C' && scoredTermCount < 2)
          ? 'low'
          : 'moderate'
  return {
    band,
    weakestDataTier,
    scoredTermCount,
    unscoredClaimCount,
    inferredLightAdmissions,
    reasons,
  }
}

const tekKeysFor = (
  crops: readonly Crop[],
  tiers: readonly CanopyTier[],
  tekRules: readonly TekDesignRule[],
): readonly TekRuleKey[] => {
  const available = new Set(tekRules.map((rule) => rule.key))
  const keys: TekRuleKey[] = []
  if (tiers.length >= 2) keys.push('vertical-stratification')
  if (crops.some((crop) => crop.role === 'nurse')) keys.push('nurse-plants')
  keys.push('polyculture-risk-spreading')
  return keys.filter((key) => available.has(key))
}

export const suggestPolycultures = (request: SuggestionRequest): SuggestionSet => {
  const weights = request.weights ?? DEFAULT_COMPATIBILITY_WEIGHTS
  const maxCrops = request.maxCropsPerBed ?? DEFAULT_MAX_CROPS_PER_BED
  const maxSuggestions = request.maxSuggestions ?? DEFAULT_MAX_SUGGESTIONS
  const rules = partitionCompanionRules(request.companionRules)
  const bedId = request.bed.id
  const cropOf = (cropId: CropId): Crop | undefined =>
    request.catalog.find((crop) => crop.id === cropId)

  const refused: SuggestionRefusal[] = []
  const excluded = new Set(
    cropIdsPreferred(request.preferences, 'exclude').map((id) => id as string),
  )
  const byCropId = new Map(request.recommendations.ranked.map((entry) => [entry.cropId, entry]))
  const envelope = measuredLightEnvelope(request.catalog)
  const admissionsOf = (crops: readonly Crop[]): readonly InferredLightAdmission[] =>
    crops.flatMap((crop) => {
      const seasonLight = byCropId.get(crop.id)?.light
      return seasonLight === undefined
        ? []
        : inferredLightAdmissionsOf(crop, request.light, seasonLight, envelope)
    })

  const anchors: Crop[] = []
  for (const cropId of cropIdsPreferred(request.preferences, 'require')) {
    const crop = cropOf(cropId)
    const recommendation = byCropId.get(cropId)
    if (crop === undefined) {
      refused.push({
        cropId,
        reason: `${cropId as string} is not in the loaded catalogue`,
        conflictsWithCropId: null,
        limiting: null,
        termKind: null,
      })
      continue
    }
    if (recommendation === undefined || recommendation.outcome.verdict === 'excluded') {
      refused.push({
        cropId,
        reason:
          recommendation?.outcome.verdict === 'excluded'
            ? recommendation.outcome.limiting.explanation
            : `${cropId as string} was never evaluated for this bed`,
        conflictsWithCropId: null,
        termKind: null,
        limiting:
          recommendation?.outcome.verdict === 'excluded' ? recommendation.outcome.limiting : null,
      })
      continue
    }
    anchors.push(crop)
  }

  // a required crop that cannot grow here is not quietly swapped for something else
  if (refused.length > 0) {
    return { bedId, anchorCropIds: [], suggestions: [], refused }
  }

  const anchorIds = new Set(anchors.map((crop) => crop.id as string))
  // named: a required crop is already an anchor, so this is the grower's own "prefer"
  const named = new Set(cropIdsPreferred(request.preferences, 'prefer').map((id) => id as string))
  const pool = request.recommendations.ranked
    .filter(
      (entry) =>
        entry.outcome.verdict !== 'excluded' &&
        !excluded.has(entry.cropId as string) &&
        !anchorIds.has(entry.cropId as string),
    )
    .map((entry) => cropOf(entry.cropId))
    .filter((crop): crop is Crop => crop !== undefined)
    .filter((crop) => {
      if (!orchardScale(crop) || named.has(crop.id as string)) return true
      refused.push({
        cropId: crop.id,
        reason: `${cropLabel(crop)} grows to ${String(crop.footprint.heightM.typicalM)} m and stays for years, so it joins a bed only when you ask for it`,
        conflictsWithCropId: null,
        limiting: null,
        termKind: null,
      })
      return false
    })
    .sort((left, right) => (left.id as string).localeCompare(right.id as string))

  const cache = new Map<string, PairCompatibility>()
  const pairOf = (a: Crop, b: Crop, space: SpaceAccounting): PairCompatibility => {
    const context: PairContext = {
      bed: request.bed,
      site: request.site,
      light: request.light,
      arrays: request.arrays,
      rules,
      rotation: request.rotationConstraints,
      tekRules: request.tekRules,
      weights,
      canopyShareByCropId: canopyShares(space, request.bed.areaM2),
      percentile: request.frostPercentile,
    }
    return evaluatePair(a, b, context)
  }
  const anchorPair = (a: Crop, b: Crop): PairCompatibility => {
    const key = pairKey(a.id, b.id)
    const hit = cache.get(key)
    if (hit !== undefined) return hit
    const value = pairOf(a, b, allocateSpace([a, b], request.bed.areaM2))
    cache.set(key, value)
    return value
  }

  const compatibleWithAnchors: Crop[] = []
  for (const crop of pool) {
    const clash = anchors.map((anchor) => anchorPair(anchor, crop)).find((pair) => !pair.compatible)
    if (clash === undefined) {
      compatibleWithAnchors.push(crop)
      continue
    }
    const conflict = clash.conflicts[0]
    refused.push({
      cropId: crop.id,
      reason: conflict?.explanation ?? 'incompatible with a required crop',
      conflictsWithCropId: clash.cropIds.find((id) => id !== crop.id) ?? null,
      limiting: null,
      termKind: conflict?.kind ?? null,
    })
  }

  const tiersOf = (crops: readonly Crop[]): readonly CanopyTier[] => [
    ...new Set(crops.map((crop) => assignCanopyTier(crop, request.arrays))),
  ]

  /**
   * One pass per candidate combination. Space is settled first because the
   * canopy shares it produces are what the light term shades with, so a
   * combination is always scored on the layout it would actually be planted at
   */
  const evaluate = (crops: readonly Crop[]): PolycultureSuggestion => {
    const space = allocateSpace(crops, request.bed.areaM2)
    const shares = canopyShares(space, request.bed.areaM2)
    const context: PairContext = {
      bed: request.bed,
      site: request.site,
      light: request.light,
      arrays: request.arrays,
      rules,
      rotation: request.rotationConstraints,
      tekRules: request.tekRules,
      weights,
      canopyShareByCropId: shares,
      percentile: request.frostPercentile,
    }
    const pairs: PairCompatibility[] = []
    for (let index = 0; index < crops.length; index += 1) {
      for (let other = index + 1; other < crops.length; other += 1) {
        const a = crops[index]
        const b = crops[other]
        if (a === undefined || b === undefined) continue
        pairs.push(evaluatePair(a, b, context))
      }
    }
    const tiers = tiersOf(crops)
    const estimates = crops
      .map((crop) => {
        const recommendation = byCropId.get(crop.id)
        if (recommendation === undefined || recommendation.outcome.verdict === 'excluded') {
          return null
        }
        return scaleEstimate(recommendation.outcome.estimate, shares.get(crop.id) ?? 0)
      })
      .filter((estimate): estimate is YieldEstimate => estimate !== null)
    const ler = landEquivalentRatio(estimates, request.energyRatio)

    const agronomic =
      crops.reduce((total, crop) => {
        const recommendation = byCropId.get(crop.id)
        return total + (recommendation === undefined ? 0 : Math.max(scoreOf(recommendation), 0))
      }, 0) / Math.max(crops.length, 1)
    const compatibility =
      pairs.length === 0 ? 0 : pairs.reduce((total, pair) => total + pair.score, 0) / pairs.length
    const preference =
      crops.reduce((total, crop) => total + askedForSignal(request, crop), 0) /
      Math.max(crops.length, 1)
    const stratification = Math.min(tiers.length, TIER_CAP) / TIER_CAP
    // the crop half of the ratio only: the electricity partial is the same for every combination
    const portfolio = unsafeBandMidpoint(ler.totalLer) - unsafeBandMidpoint(ler.electricity)

    return {
      bedId,
      anchorCropIds: anchors.map((crop) => crop.id),
      cropIds: crops.map((crop) => crop.id),
      space,
      pairs,
      tiers,
      ler,
      score: {
        agronomic,
        compatibility,
        preference,
        stratification,
        portfolio,
        total:
          SUGGESTION_WEIGHTS.agronomic * agronomic +
          SUGGESTION_WEIGHTS.compatibility * compatibility +
          SUGGESTION_WEIGHTS.stratification * stratification +
          SUGGESTION_WEIGHTS.portfolio * portfolio +
          request.preferences.influence * preference,
      },
      confidence: confidenceOf(crops, pairs, admissionsOf(crops)),
      tekRuleKeys: tekKeysFor(crops, tiers, request.tekRules),
      fits: space.fits,
    }
  }

  const grow = (seed: readonly Crop[]): readonly Crop[] => {
    const chosen = [...seed]
    while (chosen.length < maxCrops) {
      let best: Crop | null = null
      let bestGain = 0
      const baseline = evaluate(chosen).score.total
      for (const crop of compatibleWithAnchors) {
        if (chosen.some((entry) => entry.id === crop.id)) continue
        const trial = [...chosen, crop]
        const candidate = evaluate(trial)
        if (!candidate.fits) continue
        if (candidate.pairs.some((pair) => !pair.compatible)) continue
        const gain = candidate.score.total - baseline
        if (gain > bestGain + 1e-9) {
          bestGain = gain
          best = crop
        }
      }
      if (best === null) break
      chosen.push(best)
    }
    return chosen
  }

  /*
    Seeds are food crops. Support plants (an insectary, a cover crop, a nurse, a trap) score well on
    the compatibility and stratification terms, so seeding with them would hand the grower eastern
    teaberry in every bed of a plot where tomatoes fit. They still join a combination when they
    raise its score. Where no food crop is compatible with the anchors the whole pool seeds, so a
    bed that can only carry support plants is not left empty
  */
  const food = compatibleWithAnchors.filter((crop) => crop.role === null)
  const seedPool = food.length === 0 ? compatibleWithAnchors : food
  const seeds: (readonly Crop[])[] =
    seedPool.length === 0
      ? anchors.length === 0
        ? []
        : [anchors]
      : seedPool
          .map((crop) => [...anchors, crop])
          .sort((left, right) => evaluate(right).score.total - evaluate(left).score.total)
          .slice(0, maxSuggestions)

  const seen = new Set<string>()
  const suggestions: PolycultureSuggestion[] = []
  for (const seed of seeds) {
    // in the order they were chosen, so the crop a combination was built around comes first
    // and the sentence a card prints leads with it; two combinations of the same crops in a
    // different order are one combination, which the sorted key says
    const crops = grow(seed)
    const key = crops
      .map((crop) => crop.id as string)
      .sort((left, right) => left.localeCompare(right))
      .join('|')
    if (seen.has(key)) continue
    seen.add(key)
    suggestions.push(evaluate(crops))
  }

  suggestions.sort((left, right) => {
    // an inference nothing measured stands behind never outranks evidence, whatever it scores
    const evidence =
      Math.sign(left.confidence.inferredLightAdmissions.length) -
      Math.sign(right.confidence.inferredLightAdmissions.length)
    if (evidence !== 0) return evidence
    const delta = right.score.total - left.score.total
    if (Math.abs(delta) > 1e-9) return delta
    return left.cropIds.join('|').localeCompare(right.cropIds.join('|'))
  })

  /**
   * The refusals that explain what survived. Where a bed keeps a crop only on an inference past the
   * measured envelope, it has just turned away better-suited crops on figures that WERE measured,
   * and a caller shown the survivor and not those refusals cannot tell the two apart: at a 55
   * percent Phoenix shade band that is five understory greens kept on an inferred 0.6 against
   * sixty-nine crops refused on real ceilings. Only the same threshold is surfaced, so these are
   * the measured figures the inference actually overrode, and only when one got through, because
   * otherwise the per-crop pipeline output already says it
   */
  const overridden = new Set(
    suggestions.flatMap((entry) =>
      entry.confidence.inferredLightAdmissions.map((admission) => admission.threshold as string),
    ),
  )
  if (overridden.size > 0) {
    const already = new Set(refused.map((entry) => entry.cropId as string))
    for (const entry of request.recommendations.ranked) {
      if (entry.outcome.verdict !== 'excluded') continue
      const limiting = entry.outcome.limiting
      const crop = cropOf(entry.cropId)
      if (crop === undefined || already.has(entry.cropId as string)) continue
      if (!overridden.has(limiting.cause.kind) || !refusedOnMeasuredLight(crop, limiting)) continue
      already.add(entry.cropId as string)
      refused.push({
        cropId: entry.cropId,
        reason: limiting.explanation,
        conflictsWithCropId: null,
        limiting,
        termKind: null,
      })
    }
  }

  return {
    bedId,
    anchorCropIds: anchors.map((crop) => crop.id),
    suggestions,
    refused: [...refused].sort((left, right) =>
      (left.cropId as string).localeCompare(right.cropId as string),
    ),
  }
}
