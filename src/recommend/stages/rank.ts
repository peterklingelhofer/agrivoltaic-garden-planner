import { unsourcedClaim } from '../../types/cited'
import type { DataTier } from '../../types/evidence'
import type { BedId, CropId } from '../../types/ids'
import type { CropRecommendation, RecommendationSet, ScoreBreakdown } from '../../types/recommend'
import type { Fraction } from '../../types/units'

export interface ScoreWeights {
  readonly light: number
  readonly climate: number
  readonly soil: number
  readonly interaction: number
  readonly competition: number
  readonly userPreference: number
}

/**
 * A design choice of this app, with no study behind the numbers. The order says what matters
 * most for a bed: light first, because the daily light integral is the gate every other term
 * sits behind and the one thing an array changes; climate next, because a crop outside its
 * envelope fails whatever the light; soil third, a texture and depth fit the gardener can amend.
 * Companion interaction and crowding are small because their evidence is thin (Decision Record
 * 11 grades most companion rules B or below), and the gardener's own preference is a tie-break,
 * so a favourite crop is never lifted over an unsuitable bed. The six sum to 1, so a total reads
 * as a fraction of the best possible fit. Declared unsourced below so the choice shows on the
 * sources step (Decision Record 23)
 */
export const DEFAULT_WEIGHTS: ScoreWeights = {
  light: 0.35,
  climate: 0.25,
  soil: 0.15,
  interaction: 0.1,
  competition: 0.1,
  userPreference: 0.05,
}

export const WEIGHTS_CLAIM = unsourcedClaim(
  DEFAULT_WEIGHTS,
  'The ranking weights (light 0.35, climate 0.25, soil 0.15, companion interaction 0.1, crowding 0.1, preference 0.05) are a design choice of this app: no study calibrates the relative weight of these terms for a garden bed',
  'They order the crops that pass every gate and never admit a crop a gate refused',
)

export const score = (
  lightFit: Fraction,
  shadeBenefitBonus: Fraction,
  climateFit: Fraction,
  soilFit: Fraction,
  interactionBonus: number,
  competitionPenalty: number,
  userPreferenceMatch: Fraction,
  weights: ScoreWeights,
): ScoreBreakdown => ({
  lightFit,
  shadeBenefitBonus,
  climateFit,
  soilFit,
  interactionBonus,
  competitionPenalty,
  userPreferenceMatch,
  total:
    weights.light * (lightFit + shadeBenefitBonus) +
    weights.climate * climateFit +
    weights.soil * soilFit +
    weights.interaction * interactionBonus -
    weights.competition * competitionPenalty +
    weights.userPreference * userPreferenceMatch,
})

export const scoreOf = (recommendation: CropRecommendation): number =>
  recommendation.outcome.verdict === 'excluded' ? -1 : recommendation.outcome.score.total

export const VERDICT_ORDER = { recommended: 0, marginal: 1, excluded: 2 } as const

const TIER_ORDER: Readonly<Record<DataTier, number>> = { A: 0, B: 1, C: 2 }

/**
 * Deterministic ordering: verdict, then score, then the evidence behind the crop's light
 * threshold (a measured figure before a class-level inference), then crop id, so two runs over
 * the same input always produce the same list.
 *
 * The evidence tie-break is the answer to a frost-free site, where twenty-odd crops of the kind
 * a grower asked for all fit the light, the climate and the soil and tie on score: among equals,
 * the ones whose light needs were measured are listed first, and the list says so
 */
export const rank = (
  candidates: readonly CropRecommendation[],
  tierOf: (cropId: CropId) => DataTier = () => 'C',
): RecommendationSet => {
  const ranked = [...candidates].sort((a, b) => {
    const verdict = VERDICT_ORDER[a.outcome.verdict] - VERDICT_ORDER[b.outcome.verdict]
    if (verdict !== 0) return verdict
    const delta = scoreOf(b) - scoreOf(a)
    if (Math.abs(delta) > 1e-9) return delta
    const tier = TIER_ORDER[tierOf(a.cropId)] - TIER_ORDER[tierOf(b.cropId)]
    if (tier !== 0) return tier
    return (a.cropId as string).localeCompare(b.cropId as string)
  })
  return {
    bedId: (ranked[0]?.bedId ?? ('' as BedId)) as BedId,
    ranked,
    generatedAtStage: 'rank',
  }
}
