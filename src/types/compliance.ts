import type { Banded } from './band'
import type { NonEmpty } from './cited'
import type { CitationId } from './citation-ids.generated'
import type { Fraction } from './units'

export type ComplianceRegimeId =
  | 'us-ma-smart'
  | 'de-din-spec-91434'
  | 'jp-maff'
  | 'it-dm-436-2023'
  | 'fr-decret-2024-318'

// No regime is self-verifiable. MA SMART looked self-verifiable from geometry alone but is not:
// DOER mandates its own Shading Analysis Tool, the regulation does not say whether the 50% test is
// cumulative or worst-instantaneous, and every parameter is waivable. The raster does resolve
// Growing Season Hours
export type Verifiability = 'estimate-only'

export interface ComplianceRegime {
  readonly id: ComplianceRegimeId
  readonly label: string
  readonly verifiability: Verifiability
  readonly determinationBarrier: string
  readonly citations: NonEmpty<CitationId>
}

export interface Criterion {
  readonly key: string
  readonly label: string
  readonly thresholdText: string
}

interface CriterionCore {
  readonly criterion: Criterion
}

// 'meets' / 'misses' rather than pass/fail: these are design parameters for an expedited
// track, not a determination, and pass/fail language must never reach a user
export interface MeetsResult extends CriterionCore {
  readonly outcome: 'meets'
  readonly measured: number
  readonly threshold: number
  readonly unit: string
}

export interface MissesResult extends CriterionCore {
  readonly outcome: 'misses'
  readonly measured: number
  readonly threshold: number
  readonly unit: string
  readonly remedy: string
  readonly worstCellFraction: Fraction | null
}

// the measured quantity is close to but not exactly the one the rule specifies, or the rule
// itself is ambiguous about what it asks for; windowDisclaimer says which
export interface ApproximateResult extends CriterionCore {
  readonly outcome: 'approximate'
  readonly measured: number
  readonly threshold: number
  readonly unit: string
  readonly windowDisclaimer: string
  readonly remedy: string | null
}

export interface EstimateResult extends CriterionCore {
  readonly outcome: 'estimate'
  readonly estimated: Banded<Fraction>
  readonly threshold: number
  readonly unit: string
  readonly requiresFieldAgronomy: true
  readonly disclaimer: string
}

export interface NotApplicableResult extends CriterionCore {
  readonly outcome: 'not-applicable'
  readonly reason: string
}

export type CriterionResult =
  | MeetsResult
  | MissesResult
  | ApproximateResult
  | EstimateResult
  | NotApplicableResult

// three-state by construction, and 'compliant' is not one of the states
export type ComplianceOutcome =
  | 'meets-expedited-parameters'
  | 'requires-exception-request'
  | 'indeterminate'

export interface ComplianceCheck {
  readonly regime: ComplianceRegime
  readonly results: readonly CriterionResult[]
  readonly overall: ComplianceOutcome
  readonly isDetermination: false
  readonly waiverNote: string
}
