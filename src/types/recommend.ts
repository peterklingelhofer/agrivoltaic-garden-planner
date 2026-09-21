import type { Banded } from './band'
import type { ScoreableCompanionRule } from './companion'
import type { EcocropParameter, LaubCropGroup } from './crop'
import type { BedId, CropId, CultivarId } from './ids'
import type { SeasonLight } from './light'
import type { Fraction, KgPerM2Season, MonthIndex } from './units'

export type PipelineStage =
  | 'site-resolution'
  | 'climate-gate'
  | 'light-gate'
  | 'soil-water'
  | 'space-structure'
  | 'interactions'
  | 'rank'

export type LimitingFactorKind =
  | { readonly kind: 'fao-ecocrop'; readonly parameter: EcocropParameter }
  | { readonly kind: 'hardiness' }
  | { readonly kind: 'chill' }
  | { readonly kind: 'cold-winter' }
  | { readonly kind: 'season-gdd' }
  | { readonly kind: 'dli-minimum'; readonly month: MonthIndex }
  | { readonly kind: 'dli-disorder-ceiling'; readonly month: MonthIndex }
  | { readonly kind: 'max-design-rsr' }
  | { readonly kind: 'soil-ph' }
  | { readonly kind: 'water' }
  | { readonly kind: 'footprint' }
  | { readonly kind: 'root-depth' }
  | { readonly kind: 'rotation'; readonly pathogen: string }
  | { readonly kind: 'shared-pest-or-pathogen'; readonly withCropId: CropId }
  | { readonly kind: 'low-combined-score' }

export interface LimitingFactor {
  readonly stage: PipelineStage
  readonly cause: LimitingFactorKind
  readonly membership: Fraction
  readonly explanation: string
}

export interface YieldCaveat {
  readonly code: // the DLI threshold's own evidence tier is inferred rather than measured: a claim about
  // the light gate, distinct from 'weak-evidence-base' below, which is a claim about the Laub
  // relative-yield curve. One shared code would collide whenever a crop is both, which would
  // duplicate a React list key
    | 'tier-c-inference'
    | 'proxy-shade-cloth'
    // the crop's Laub group is an analogy: an excluded species, a different harvested organ, or
    // a family no group holds. Carried per crop from the catalogue row
    | 'group-is-a-proxy'
    | 'water-limitation-gated'
    | 'paywalled-source'
    | 'weak-evidence-base'
  readonly message: string
}

export interface YieldEstimate {
  readonly cropId: CropId
  readonly bedId: BedId
  readonly laubGroup: LaubCropGroup
  readonly seasonCumulativeRsr: Fraction
  readonly relativeYield: Banded<Fraction>
  readonly absoluteYieldKgPerM2Season: Banded<KgPerM2Season> | null
  readonly waterLimited: boolean
  readonly caveats: readonly YieldCaveat[]
}

export interface ScoreBreakdown {
  readonly lightFit: Fraction
  /** Kept separate from lightFit so the UI can attribute it to the water-limitation gate */
  readonly shadeBenefitBonus: Fraction
  readonly climateFit: Fraction
  readonly soilFit: Fraction
  readonly interactionBonus: number
  readonly competitionPenalty: number
  readonly userPreferenceMatch: Fraction
  readonly total: number
}

export type RecommendationVerdict =
  | {
      readonly verdict: 'recommended'
      readonly score: ScoreBreakdown
      readonly estimate: YieldEstimate
    }
  | {
      readonly verdict: 'marginal'
      readonly score: ScoreBreakdown
      readonly estimate: YieldEstimate
      readonly limiting: LimitingFactor
    }
  | { readonly verdict: 'excluded'; readonly limiting: LimitingFactor }

export interface CropRecommendation {
  readonly cropId: CropId
  readonly cultivarId: CultivarId | null
  readonly bedId: BedId
  readonly light: SeasonLight
  readonly outcome: RecommendationVerdict
  readonly supportingRules: readonly ScoreableCompanionRule[]
  /** Preconditions from the applied rules' scope, rendered inline per the horticulture document rule 4 */
  readonly requiresManagement: readonly string[]
}

export interface RecommendationSet {
  readonly bedId: BedId
  readonly ranked: readonly CropRecommendation[]
  readonly generatedAtStage: PipelineStage
}
