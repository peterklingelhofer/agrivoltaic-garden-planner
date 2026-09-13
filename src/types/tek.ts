import type { Cited, NonEmpty } from './cited'
import type { CitationId } from './citation-ids.generated'
import type { TekRuleId } from './ids'
import type { Fraction, Meters } from './units'

export type TekRuleKey =
  | 'vertical-stratification'
  | 'nurse-plants'
  | 'wind-thermal-buffering'
  | 'water-harvesting-geometry'
  | 'temporal-succession'
  | 'landrace-adaptation'
  | 'polyculture-risk-spreading'

export type PracticeStatus = 'historical' | 'living'

export interface TekAttribution {
  readonly peoples: readonly string[]
  readonly individualInnovators: readonly string[]
  readonly practiceStatus: PracticeStatus
  readonly researcherAccountOnly: boolean
  readonly communityEndorsementSought: false
  readonly sourceType: 'published-literature'
  readonly citations: NonEmpty<CitationId>
}

export interface TekDesignRule {
  readonly id: TekRuleId
  readonly key: TekRuleKey
  readonly title: string
  readonly guidance: string
  readonly attribution: TekAttribution
}

export type SampleOrigin = 'measured' | 'interpolated'

export interface DistanceGradientSample {
  readonly distanceFromEdgeM: Meters
  readonly transmittedRadiationFraction: Fraction
  readonly relativeSoilMoisture: Fraction
  readonly origin: SampleOrigin
}

export interface DistanceGradientTemplate {
  readonly key: 'dehesa-montado'
  readonly samples: Cited<readonly DistanceGradientSample[]>
  readonly validRangeM: { readonly min: Meters; readonly max: Meters }
  readonly attribution: TekAttribution
  /** Provisional magnitudes: intermediates are interpolated between measured endpoints */
  readonly caveat: string | null
}
