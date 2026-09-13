import { loadCompanionRules, loadRotationConstraints } from '../data/companions'
import { NO_WILDLIFE_PREFERENCE, type WildlifePreference } from './wildlife'
import { loadCropCatalog } from '../data/crops'
import { DEFAULT_FROST_PERCENTILE } from '../data/site'
import { clamp } from '../data/util'
import type { BedCalendar, CalendarFeasibility, CropCalendar } from '../types/calendar'
import type { CompanionRule, RotationConstraint } from '../types/companion'
import type { Crop } from '../types/crop'
import type { GardenPlot } from '../types/garden'
import type { BedId, CropId } from '../types/ids'
import type { BedLight } from '../types/light'
import type { CropRecommendation, LimitingFactor } from '../types/recommend'
import type { ExceedancePercentile, Site } from '../types/site'
import { bedCalendar } from './calendar'
import { runRecommendationPipeline } from './pipeline'
import { DEFAULT_WEIGHTS, scoreOf, VERDICT_ORDER } from './stages/rank'
import type { ScoreWeights } from './stages/rank'

export interface AutoRecommendInput {
  readonly site: Site
  readonly plot: GardenPlot
  readonly bedLight: readonly BedLight[]
  readonly catalog: readonly Crop[]
  readonly companionRules: readonly CompanionRule[]
  readonly rotationConstraints: readonly RotationConstraint[]
  readonly frostPercentile?: ExceedancePercentile
  readonly weights?: ScoreWeights
  readonly preferredCropIds?: readonly CropId[]
  readonly wildlife?: WildlifePreference
}

export interface CropPlan {
  readonly recommendation: CropRecommendation
  readonly calendar: CropCalendar
  /** Always populated for anything short of a clean recommendation with a workable calendar */
  readonly limiting: LimitingFactor | null
  readonly score: number
}

export interface BedPlan {
  readonly bedId: BedId
  readonly ranked: readonly CropPlan[]
  readonly calendar: BedCalendar
}

export interface GardenPlan {
  readonly frostPercentile: ExceedancePercentile
  readonly beds: readonly BedPlan[]
}

/** A calendar with this much room between its earliest and latest sowing is unhurried */
export const COMFORTABLE_SLACK_DAYS = 30

export const TIGHT_FIT_CONFIDENCE = 0.85

export const INDOOR_START_CONFIDENCE = 0.8

export const NO_THERMAL_CONFIDENCE = 0.9

/**
 * How much of the pipeline score survives the calendar. A crop that cannot
 * finish or never sees its DLI keeps none of it, and a comfortable fit outranks
 * a fit that depends on sowing the one right week
 */
export const calendarConfidence = (feasibility: CalendarFeasibility): number => {
  switch (feasibility.kind) {
    case 'fits':
      return (
        TIGHT_FIT_CONFIDENCE +
        (1 - TIGHT_FIT_CONFIDENCE) * clamp(feasibility.slackDays / COMFORTABLE_SLACK_DAYS, 0, 1)
      )
    case 'needs-indoor-start':
      return INDOOR_START_CONFIDENCE
    case 'no-thermal-data':
      return NO_THERMAL_CONFIDENCE
    case 'season-too-short':
    case 'light-limited':
      return 0
  }
}

export const limitingOf = (recommendation: CropRecommendation): LimitingFactor | null =>
  recommendation.outcome.verdict === 'recommended' ? null : recommendation.outcome.limiting

const planScore = (recommendation: CropRecommendation, calendar: CropCalendar): number => {
  const base = scoreOf(recommendation)
  return base < 0 ? base : base * calendarConfidence(calendar.feasibility)
}

/**
 * One bed. Exposed on its own so a caller can walk the beds a chunk at a time
 * and abandon the walk between beds: nothing here holds state across calls
 */
export const planBed = (input: AutoRecommendInput, light: BedLight): BedPlan => {
  const percentile = input.frostPercentile ?? DEFAULT_FROST_PERCENTILE
  const calendar = bedCalendar(input.site, light, input.catalog, percentile)
  const byCrop = new Map(calendar.entries.map((entry) => [entry.cropId as string, entry]))
  const set = runRecommendationPipeline({
    site: input.site,
    plot: input.plot,
    bedLight: [light],
    catalog: input.catalog,
    companionRules: input.companionRules,
    rotationConstraints: input.rotationConstraints,
    frostPercentile: percentile,
    weights: input.weights ?? DEFAULT_WEIGHTS,
    preferredCropIds: input.preferredCropIds ?? [],
    wildlife: input.wildlife ?? NO_WILDLIFE_PREFERENCE,
  })[0]

  const ranked: CropPlan[] = []
  for (const recommendation of set?.ranked ?? []) {
    const entry = byCrop.get(recommendation.cropId as string)
    if (entry === undefined) continue
    ranked.push({
      recommendation,
      calendar: entry,
      limiting: limitingOf(recommendation),
      score: planScore(recommendation, entry),
    })
  }
  ranked.sort((a, b) => {
    const verdict =
      VERDICT_ORDER[a.recommendation.outcome.verdict] -
      VERDICT_ORDER[b.recommendation.outcome.verdict]
    if (verdict !== 0) return verdict
    const delta = b.score - a.score
    if (Math.abs(delta) > 1e-9) return delta
    return (a.recommendation.cropId as string).localeCompare(b.recommendation.cropId as string)
  })
  return { bedId: light.bedId, ranked, calendar }
}

/**
 * The single entry point the front end calls the moment a site, a plot and a
 * light solution exist. Pure and deterministic: same inputs, same plan
 */
export const autoRecommend = (input: AutoRecommendInput): GardenPlan => ({
  frostPercentile: input.frostPercentile ?? DEFAULT_FROST_PERCENTILE,
  beds: input.bedLight.map((light) => planBed(input, light)),
})

export interface AutoRecommendRequest {
  readonly site: Site
  readonly plot: GardenPlot
  readonly bedLight: readonly BedLight[]
  readonly frostPercentile?: ExceedancePercentile
  readonly weights?: ScoreWeights
  readonly preferredCropIds?: readonly CropId[]
  readonly wildlife?: WildlifePreference
}

/** The same call with the shipped catalogue and rule sets loaded for you */
export const autoRecommendWithCatalog = async (
  request: AutoRecommendRequest,
): Promise<GardenPlan> => {
  const [catalog, companionRules, rotationConstraints] = await Promise.all([
    loadCropCatalog(),
    loadCompanionRules(),
    loadRotationConstraints(),
  ])
  return autoRecommend({ ...request, catalog, companionRules, rotationConstraints })
}
