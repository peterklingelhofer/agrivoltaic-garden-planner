import { partitionCompanionRules } from '../data/companions'
import { laubCurve } from '../data/crops'
import type { CompanionRule, RotationConstraint } from '../types/companion'
import type { Crop } from '../types/crop'
import type { DataTier } from '../types/evidence'
import type { Bed, GardenPlot } from '../types/garden'
import type { BedId, CropId } from '../types/ids'
import type { BedLight } from '../types/light'
import type {
  CropRecommendation,
  LimitingFactor,
  RecommendationSet,
  RecommendationVerdict,
} from '../types/recommend'
import type { ExceedancePercentile, Site } from '../types/site'
import type { Fraction } from '../types/units'
import { climateGate, ecocropScore } from './stages/climate-gate'
import { interactionsStage } from './stages/interactions'
import { lightGate } from './stages/light-gate'
import { DEFAULT_WEIGHTS, rank, score } from './stages/rank'
import { soilWaterStage } from './stages/soil-water'
import { crowdingYieldPenalty, spaceStage } from './stages/space'
import type { ScoreWeights } from './stages/rank'
import { NO_WILDLIFE_PREFERENCE, wildlifeMatch, type WildlifePreference } from './wildlife'
import { estimateYield } from './yield'

export interface PipelineInput {
  readonly site: Site
  readonly plot: GardenPlot
  readonly bedLight: readonly BedLight[]
  readonly catalog: readonly Crop[]
  readonly companionRules: readonly CompanionRule[]
  readonly rotationConstraints: readonly RotationConstraint[]
  readonly frostPercentile: ExceedancePercentile
  readonly weights: ScoreWeights
  readonly preferredCropIds: readonly CropId[]
  /**
   * What the wildlife questions asked for, and the region the answer is judged against.
   * Optional because most callers ask for nothing, and a pipeline that has to be told so
   * explicitly is a pipeline every fixture and every internal caller has to be edited to keep
   */
  readonly wildlife?: WildlifePreference
}

export const DEFAULT_TARGET_YEAR = 5

/** Below this total the crop is reported as marginal */
export const MARGINAL_SCORE = 0.45

const excluded = (limiting: LimitingFactor): RecommendationVerdict => ({
  verdict: 'excluded',
  limiting,
})

const bedFor = (plot: GardenPlot, bedId: BedId): Bed | undefined =>
  plot.beds.find((bed) => bed.id === bedId)

/**
 * What the rotation rule reads for the live ranking: nothing. Reading the bed's own plantings as
 * this year's history would make a bed holding tomato refuse tomato, pepper and potato as "grown
 * here too recently", and a bed holding brussels sprouts refuse every other brassica: a grower
 * adding to a bed the app had just planted would meet "Not suited" beside the crop already growing
 * there. Rotation is a rule about what FOLLOWS a crop, and the seasons simulation applies it from
 * its own records (`simulation/season.ts`); what shares the bed this season is the companion
 * stage's question, and `familyClash` already answers it with a penalty
 */
const historyFor = (): ReadonlyMap<number, readonly CropId[]> => new Map()

/** The rotation rule reads families, and the history it reads holds ids */
export const familyLookup =
  (catalog: readonly Crop[]) =>
  (id: CropId): string | null =>
    catalog.find((crop) => crop.id === id)?.taxonomy.family ?? null

/**
 * Decision Record 10, stages 0 to 6. Stage 0 already ran in
 * `src/data/site.ts#resolveSite`, so this begins at the hard climate gate.
 * Every exclusion carries a LimitingFactor: there are no silent drops
 */
export const runRecommendationPipeline = (input: PipelineInput): readonly RecommendationSet[] => {
  const { scoreable, experimental, folklore } = partitionCompanionRules(input.companionRules)
  const weights = (input.weights as ScoreWeights | undefined) ?? DEFAULT_WEIGHTS
  const preferred = new Set(input.preferredCropIds.map((id) => id as string))
  const familyOf = familyLookup(input.catalog)
  // the evidence behind each crop's light threshold, the tie-break among equal scores
  const tiers = new Map(input.catalog.map((crop) => [crop.id, crop.light.dliMinMolM2Day.tier]))
  const tierOf = (id: CropId): DataTier => tiers.get(id) ?? 'C'
  const sets: RecommendationSet[] = []

  for (const light of input.bedLight) {
    const bed = bedFor(input.plot, light.bedId)
    if (bed === undefined) continue
    const selected = input.catalog.filter((crop) =>
      bed.plantings.some((planting) => planting.cropId === crop.id),
    )
    const candidates: CropRecommendation[] = []

    for (const crop of input.catalog) {
      const climate = climateGate(crop, input.site, input.frostPercentile)
      const lightOutcome = lightGate(crop, light, input.site, input.frostPercentile)
      const base: Omit<CropRecommendation, 'outcome'> = {
        cropId: crop.id,
        cultivarId: null,
        bedId: light.bedId,
        light: lightOutcome.light,
        supportingRules: [],
        requiresManagement: [],
      }

      if (!climate.passed && climate.limiting !== null) {
        candidates.push({ ...base, outcome: excluded(climate.limiting) })
        continue
      }
      if (!lightOutcome.passed && lightOutcome.limiting !== null) {
        candidates.push({ ...base, outcome: excluded(lightOutcome.limiting) })
        continue
      }

      const soil = soilWaterStage(crop, bed, input.site)
      if (!soil.passed && soil.limiting !== null) {
        candidates.push({ ...base, outcome: excluded(soil.limiting) })
        continue
      }

      const space = spaceStage(crop, bed, input.plot.arrays, DEFAULT_TARGET_YEAR)
      if (!space.passed && space.limiting !== null) {
        candidates.push({ ...base, outcome: excluded(space.limiting) })
        continue
      }

      const interactions = interactionsStage(
        {
          candidate: crop,
          selected,
          historyByYear: historyFor(),
          familyOf,
          koppenCode: input.site.koppenCode,
          scale: 'bed',
        },
        scoreable,
        experimental,
        folklore,
        input.rotationConstraints,
      )
      if (!interactions.passed && interactions.limiting !== null) {
        candidates.push({ ...base, outcome: excluded(interactions.limiting) })
        continue
      }

      const climateScore = ecocropScore(
        crop,
        input.site,
        input.frostPercentile,
        bed.irrigation.available,
      )
      const breakdown = score(
        lightOutcome.fit,
        lightOutcome.shadeBenefitBonus,
        climateScore.overall,
        soil.fit,
        interactions.bonus,
        interactions.penalty + soil.droughtPenalty,
        /**
         * The strongest thing the grower asked for about this crop, not the sum of them.
         * Naming a crop outright and asking for natives are the same KIND of request, so they
         * share the one preference weight, and never stack into a term that could outrank
         * whether the plant can grow in the light it has
         */
        Math.max(
          preferred.has(crop.id as string) ? 1 : 0,
          wildlifeMatch(crop, input.wildlife ?? NO_WILDLIFE_PREFERENCE) ?? 0,
        ) as Fraction,
        weights,
      )

      const estimate = estimateYield(
        crop.id,
        light.bedId,
        laubCurve(crop.laubGroup, crop.laubGroupNote),
        lightOutcome.light.cumulativeRsr,
        crowdingYieldPenalty(space.crowdingIndex),
        input.site.waterLimitation.limited,
        crop.light.dliMinMolM2Day.tier === 'C'
          ? [
              {
                // keep this apart from yield.ts's 'weak-evidence-base': that caveat is about the
                // Laub curve's own study count, this one is about the DLI threshold being inferred
                // from the crop's sun-hour class. A crop can trigger both at once, and one shared
                // code would duplicate a React list key
                code: 'tier-c-inference',
                message:
                  'The DLI threshold for this crop is inferred from its sun-hour class. Trust the ranking order, and treat the number itself as provisional',
              },
            ]
          : [],
      )

      /*
        A climate fit under the marginal line holds a crop back on its own, whatever the light and
        the soil add up to. The total is a weighted sum, so without this a bed that lit and drained
        a woodland herb well would carry it to "recommended" at Mumbai on a climate fit of 0.05: the
        hottest month sits a fraction inside its envelope, the gate passes, and the other terms
        outvote it. Liebig's law decides the gate; this is the same law at the verdict, and it names
        the limb of the envelope that bites
      */
      const climateLimit: LimitingFactor | null =
        climateScore.overall < MARGINAL_SCORE
          ? {
              stage: 'climate-gate',
              cause: { kind: 'fao-ecocrop', parameter: climateScore.limitingParameter },
              membership: climateScore.overall,
              explanation: `The site sits at the edge of this crop's ECOCROP ${climateScore.limitingParameter} envelope`,
            }
          : null
      // a shallow bed limits a crop (see `ROOT_DEPTH_FLOOR_M`), so it
      // joins the chain of what holds a passing crop back
      const limiting =
        lightOutcome.limiting ??
        climateLimit ??
        soil.limiting ??
        space.limiting ??
        interactions.limiting
      candidates.push({
        ...base,
        supportingRules: interactions.applied,
        requiresManagement: [
          ...new Set(interactions.applied.flatMap((rule) => rule.scope.requiresManagement)),
        ],
        outcome:
          breakdown.total >= MARGINAL_SCORE && limiting === null
            ? { verdict: 'recommended', score: breakdown, estimate }
            : {
                verdict: 'marginal',
                score: breakdown,
                estimate,
                limiting: limiting ?? {
                  stage: 'rank',
                  cause: { kind: 'low-combined-score' },
                  membership: breakdown.total as Fraction,
                  explanation:
                    'Nothing excludes this crop, but its combined fit is low enough that better options exist for this bed',
                },
              },
      })
    }

    const set = rank(candidates, tierOf)
    sets.push({ ...set, bedId: light.bedId })
  }

  return sets
}
