import type { LandEquivalentRatio } from './band'
import type { CitationId } from './citation-ids.generated'
import type {
  ExperimentalCompanionRule,
  FolkloreCompanionRule,
  ScoreableCompanionRule,
} from './companion'
import type { SpacingBasis } from './crop'
import type { DataTier, EvidenceGrade } from './evidence'
import type { CanopyTier } from './garden'
import type { BedId, CropId } from './ids'
import type { LimitingFactor } from './recommend'
import type { TekRuleKey } from './tek'
import type { Fraction, PhUnits, SquareMeters } from './units'

/**
 * What the grower asked for. `require` and `exclude` are constraints the
 * generator may not trade away; `prefer` and `avoid` carry the grower's own
 * strength, so no single blend is baked in
 */
export type PreferenceKind = 'require' | 'prefer' | 'avoid' | 'exclude'

export interface CropPreference {
  readonly cropId: CropId
  readonly kind: PreferenceKind
  /** Read only for `prefer` and `avoid`; a constraint has no strength to tune */
  readonly weight: Fraction
}

export interface PreferenceSet {
  readonly entries: readonly CropPreference[]
  /** How far a preference may move a suggestion against its agronomic fit */
  readonly influence: Fraction
}

export type CompatibilityTermKind =
  | 'soil-ph'
  | 'water-regime'
  | 'root-stratification'
  | 'canopy-tier'
  | 'light-overtopping'
  | 'shared-pest-or-pathogen'
  | 'documented-companion'
  | 'allelopathy'

export type CompatibilityVerdict = 'conflict' | 'caution' | 'neutral' | 'benefit'

export type CompatibilityWeights = Readonly<Record<CompatibilityTermKind, number>>

export interface CompatibilityTerm {
  readonly kind: CompatibilityTermKind
  readonly verdict: CompatibilityVerdict
  /** In -1 to 1 before weighting, so a UI can render the term without the weights */
  readonly signal: number
  /** Weighted and signed, and always zero where `scores` is false */
  readonly contribution: number
  /** Grade C, D and E evidence is reported and never allowed to move a number */
  readonly scores: boolean
  readonly grade: EvidenceGrade | null
  readonly explanation: string
  readonly citations: readonly CitationId[]
  /** Set where a named TEK design rule is the basis, so the UI can attribute it */
  readonly tekRuleKey: TekRuleKey | null
}

export interface PhWindow {
  readonly lowPh: PhUnits
  readonly highPh: PhUnits
}

export interface PhOverlap {
  readonly optimum: PhWindow | null
  readonly tolerated: PhWindow | null
  /** The pH a grower would have to hold, present only where the optima are disjoint */
  readonly compromisePh: PhUnits | null
  /** The best membership both crops can hold at once, 0 when no pH suits both */
  readonly jointMembership: Fraction
  /** Crops whose narrow envelope is a matter of physiology */
  readonly hardEnvelopeCropIds: readonly CropId[]
}

export interface PairCompatibility {
  readonly cropIds: readonly [CropId, CropId]
  readonly terms: readonly CompatibilityTerm[]
  readonly ph: PhOverlap
  readonly conflicts: readonly CompatibilityTerm[]
  readonly compatible: boolean
  readonly score: number
  readonly applied: readonly ScoreableCompanionRule[]
  readonly experimental: readonly ExperimentalCompanionRule[]
  readonly folklore: readonly FolkloreCompanionRule[]
}

export interface SpaceAllocation {
  readonly cropId: CropId
  readonly basis: SpacingBasis
  readonly areaPerPlantM2: number
  readonly allocatedAreaM2: SquareMeters
  readonly plantCount: number
}

export interface SpaceRefusal {
  readonly cropId: CropId
  readonly reason: string
}

export interface SpaceAccounting {
  readonly bedAreaM2: SquareMeters
  readonly allocations: readonly SpaceAllocation[]
  readonly refusals: readonly SpaceRefusal[]
  /** One plant of every crop at catalogue spacing: the floor a combination cannot go under */
  readonly requiredAreaM2: SquareMeters
  readonly fits: boolean
  /** How much more bed the combination needs. Zero when it fits, never a silent truncation */
  readonly shortfallM2: SquareMeters
}

export type ConfidenceBand = 'low' | 'moderate' | 'high'

/** The two light thresholds a bed can sit on the permissive side of */
export type InferredLightThreshold = 'dli-minimum' | 'max-design-rsr'

/**
 * One crop admitted to one bed by a class-level inference that reaches past every MEASURED
 * figure of the same kind in the loaded catalogue. It is not a claim that the crop fails here:
 * it is the statement that nothing measured says it succeeds, and it is recorded because the
 * same bed refuses other crops on figures that were measured
 */
export interface InferredLightAdmission {
  readonly cropId: CropId
  readonly threshold: InferredLightThreshold
  /** The crop's own inferred figure, mol/m2/day for a floor and a shade fraction for a ceiling */
  readonly inferredValue: number
  /** How far the measured entries in the catalogue reach, in the same units */
  readonly measuredEnvelopeValue: number
  readonly explanation: string
}

export interface SuggestionConfidence {
  readonly band: ConfidenceBand
  /** Weakest tier across every light threshold the gate reads, not the minimum alone */
  readonly weakestDataTier: DataTier
  readonly scoredTermCount: number
  /** Experimental and folklore claims shown alongside the suggestion, none of which scored */
  readonly unscoredClaimCount: number
  /**
   * Empty is the gate a caller reads to show only combinations whose weakest crop rests on measured
   * light data. Never empty on one combination and non-empty on another for the same bed: a bed
   * either sits inside the measured envelope or outside it, so this is a property of the bed as
   * much as the crops
   */
  readonly inferredLightAdmissions: readonly InferredLightAdmission[]
  readonly reasons: readonly string[]
}

export interface SuggestionScore {
  readonly agronomic: number
  readonly compatibility: number
  readonly preference: number
  readonly stratification: number
  /** The crop half of the land equivalent ratio: TEK rule 7's portfolio, not one crop maximised */
  readonly portfolio: number
  readonly total: number
}

export interface PolycultureSuggestion {
  readonly bedId: BedId
  readonly anchorCropIds: readonly CropId[]
  readonly cropIds: readonly CropId[]
  readonly space: SpaceAccounting
  readonly pairs: readonly PairCompatibility[]
  readonly tiers: readonly CanopyTier[]
  /** Area-weighted partials, so the total reads as what this bed contributes */
  readonly ler: LandEquivalentRatio
  readonly score: SuggestionScore
  readonly confidence: SuggestionConfidence
  readonly tekRuleKeys: readonly TekRuleKey[]
  readonly fits: boolean
}

export interface SuggestionRefusal {
  readonly cropId: CropId
  readonly reason: string
  readonly conflictsWithCropId: CropId | null
  readonly limiting: LimitingFactor | null
  /** which term refused, so grouping keys only on structure */
  readonly termKind: CompatibilityTermKind | null
}

export interface SuggestionSet {
  readonly bedId: BedId
  readonly anchorCropIds: readonly CropId[]
  readonly suggestions: readonly PolycultureSuggestion[]
  readonly refused: readonly SuggestionRefusal[]
}
