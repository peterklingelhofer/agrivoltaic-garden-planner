import type { Banded } from './band'
import type { NonEmpty } from './cited'
import type { CitationId } from './citation-ids.generated'
import type { ExperimentalGrade, FolkloreGrade, ScoreableGrade } from './evidence'
import type { RuleId } from './ids'
import type { Days, Fraction, Ratio, SquareMeters } from './units'

export type InteractionKind =
  | 'host-finding-disruption'
  | 'trap-crop'
  | 'repellent-volatile'
  | 'natural-enemy-provision'
  | 'pollinator-provision'
  | 'nitrogen-fixation-transfer'
  | 'nitrogen-residual'
  | 'allelopathy-inhibitory'
  | 'allelopathy-stimulatory'
  | 'biofumigation'
  | 'nematode-suppression'
  | 'physical-support'
  | 'living-mulch-shade'
  | 'wind-shelter'
  | 'nurse-shade'
  | 'resource-competition'
  | 'shared-pathogen'
  | 'shared-pest'
  | 'root-niche-complementarity'
  | 'canopy-niche-complementarity'
  | 'phenological-complementarity'

export type RefType = 'taxon' | 'group' | 'family'
export type InteractionDirection = 'subject-affects-object' | 'mutual'
export type Valence = -1 | 0 | 1
export type EffectMetric = 'ler' | 'yield-pct' | 'pest-density-pct' | 'nitrogen-transfer-pct'

export interface RuleScope {
  readonly validScales: readonly ('bed' | 'plot' | 'field')[]
  readonly validKoppenCodes: readonly string[] | null
  readonly validRegions: readonly string[] | null
  readonly validPestTargets: readonly string[] | null
  readonly requiresManagement: readonly string[]
  readonly minAreaFraction: Fraction | null
  readonly minStandAreaM2: SquareMeters | null
  readonly minDurationDays: Days | null
  readonly seasonOffsetDays: Days
}

interface CompanionRuleCore {
  readonly id: RuleId
  readonly subjectRef: string
  readonly subjectRefType: RefType
  readonly objectRef: string
  readonly objectRefType: RefType
  readonly kind: InteractionKind
  readonly direction: InteractionDirection
  readonly valence: Valence
  readonly scope: RuleScope
  readonly citations: readonly CitationId[]
  readonly notes: string | null
}

export interface ScoreableCompanionRule extends CompanionRuleCore {
  readonly grade: ScoreableGrade
  /** A grade A or B rule that cannot cite a work is a contradiction in terms */
  readonly citations: NonEmpty<CitationId>
  readonly mechanism: string
  readonly effectMetric: EffectMetric
  readonly effect: Banded<Ratio>
  readonly studyCount: number
  readonly competitionPenalty: Fraction
}

export interface ExperimentalCompanionRule extends CompanionRuleCore {
  readonly grade: ExperimentalGrade
  readonly mechanism: string
  readonly display: 'experimental'
}

export interface FolkloreCompanionRule extends CompanionRuleCore {
  readonly grade: FolkloreGrade
  readonly mechanism: string | null
  readonly display: 'folklore-panel'
  readonly contradictedBy: readonly CitationId[]
}

export type CompanionRule =
  | ScoreableCompanionRule
  | ExperimentalCompanionRule
  | FolkloreCompanionRule

export interface PartitionedCompanionRules {
  readonly scoreable: readonly ScoreableCompanionRule[]
  readonly experimental: readonly ExperimentalCompanionRule[]
  readonly folklore: readonly FolkloreCompanionRule[]
}

export interface RotationConstraint {
  readonly id: RuleId
  readonly groupRef: string
  readonly pathogen: string
  readonly minIntervalYears: number | null
  readonly inoculumPersistenceYearsLow: number
  readonly inoculumPersistenceYearsHigh: number
  readonly rotationEffective: boolean
  readonly alternativeControl: string | null
  readonly grade: ScoreableGrade | ExperimentalGrade
  readonly citations: NonEmpty<CitationId>
}
