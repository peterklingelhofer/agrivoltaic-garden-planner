import { ruleEndpointMatches } from '../../data/companions'
import { unsafeBandMidpoint } from '../../types/band'
import type {
  CompanionRule,
  ExperimentalCompanionRule,
  FolkloreCompanionRule,
  RotationConstraint,
  ScoreableCompanionRule,
} from '../../types/companion'
import type { Crop } from '../../types/crop'
import type { CropId } from '../../types/ids'
import type { LimitingFactor } from '../../types/recommend'
import type { Fraction } from '../../types/units'
import { cropLabel } from '../../data/crops'

export interface InteractionOutcome {
  readonly passed: boolean
  readonly bonus: number
  readonly penalty: number
  readonly applied: readonly ScoreableCompanionRule[]
  readonly experimental: readonly ExperimentalCompanionRule[]
  readonly folklore: readonly FolkloreCompanionRule[]
  readonly limiting: LimitingFactor | null
}

export interface InteractionContext {
  readonly candidate: Crop
  readonly selected: readonly Crop[]
  readonly historyByYear: ReadonlyMap<number, readonly CropId[]>
  /**
   * Which family a crop id in the history belongs to.
   *
   * A rotation constraint is published per FAMILY and the history holds crop ids, so without
   * this a tomato after a potato read as a clean rotation: the same soil-borne wilt under two
   * different ids. Null for an id the catalogue no longer carries
   */
  readonly familyOf: (cropId: CropId) => string | null
  readonly koppenCode: string
  readonly scale: 'bed' | 'plot' | 'field'
}

/** Grade A rules carry full weight; grade B is context-dependent and discounted */
export const GRADE_WEIGHT: Readonly<Record<'A' | 'B', number>> = { A: 1, B: 0.6 }

export const MAX_INTERACTION_BONUS = 0.4

export interface RuleEffect {
  readonly bonus: number
  readonly penalty: number
}

/** The one place a scoreable rule turns into numbers: the pair engine reads it too */
export const ruleEffect = (rule: ScoreableCompanionRule): RuleEffect => {
  const weighted = Math.abs(unsafeBandMidpoint(rule.effect) - 1) * GRADE_WEIGHT[rule.grade]
  const competition = rule.competitionPenalty * GRADE_WEIGHT[rule.grade]
  return rule.valence >= 0
    ? { bonus: weighted, penalty: competition }
    : { bonus: 0, penalty: weighted + competition }
}

const touchesCandidate = (rule: CompanionRule, crop: Crop): boolean =>
  ruleEndpointMatches(rule.objectRef, rule.objectRefType, crop.id, crop.taxonomy.family) ||
  (rule.direction === 'mutual' &&
    ruleEndpointMatches(rule.subjectRef, rule.subjectRefType, crop.id, crop.taxonomy.family))

const providedByNeighbour = (rule: CompanionRule, selected: readonly Crop[]): boolean =>
  selected.some(
    (crop) =>
      ruleEndpointMatches(rule.subjectRef, rule.subjectRefType, crop.id, crop.taxonomy.family) ||
      (rule.direction === 'mutual' &&
        ruleEndpointMatches(rule.objectRef, rule.objectRefType, crop.id, crop.taxonomy.family)),
  )

/**
 * Scope is a filter, not metadata. A result from 1 ha maize plots in Kenya
 * does not fire for a 2 square metre raised bed in Ohio.
 *
 * Any grade: the scoring stage only ever hands it A and B rules, but the season simulation asks
 * the same question of a folklore rule to know whether a grower has tried it, and one answer to
 * "does this rule concern these two plants here" is the point
 */
export const ruleAppliesInContext = (rule: CompanionRule, context: InteractionContext): boolean => {
  if (!rule.scope.validScales.includes(context.scale)) return false
  const koppen = rule.scope.validKoppenCodes
  if (koppen !== null && !koppen.includes(context.koppenCode)) return false
  if (!touchesCandidate(rule, context.candidate)) return false
  return providedByNeighbour(rule, context.selected)
}

/**
 * Rotation is a hard temporal constraint. Where rotation does not work at all,
 * as with allium white rot whose sclerotia survive 20 to 40 years, the crop is
 * excluded indefinitely: there is no real interval to offer
 */
export const rotationViolation = (
  context: InteractionContext,
  rotation: readonly RotationConstraint[],
): RotationConstraint | null => {
  const family = context.candidate.taxonomy.family
  const constraint = rotation.find((entry) => entry.groupRef === family)
  if (constraint === undefined) return null
  const years = [...context.historyByYear.keys()].sort((a, b) => b - a)
  // the family, not the crop: the pathogen the constraint names does not read labels
  const grewHere = (id: CropId): boolean =>
    id === context.candidate.id || context.familyOf(id) === family
  const mostRecent = years.find((year) => (context.historyByYear.get(year) ?? []).some(grewHere))
  if (mostRecent === undefined) return null
  if (!constraint.rotationEffective) return constraint
  const latest = years[0] ?? mostRecent
  const gap = latest + 1 - mostRecent
  return gap < (constraint.minIntervalYears ?? 0) ? constraint : null
}

const familyClash = (context: InteractionContext): Crop | null =>
  context.selected.find(
    (crop) =>
      crop.id !== context.candidate.id &&
      crop.taxonomy.family === context.candidate.taxonomy.family,
  ) ?? null

export const interactionsStage = (
  context: InteractionContext,
  scoreable: readonly ScoreableCompanionRule[],
  experimental: readonly ExperimentalCompanionRule[],
  folklore: readonly FolkloreCompanionRule[],
  rotation: readonly RotationConstraint[],
): InteractionOutcome => {
  const violation = rotationViolation(context, rotation)
  if (violation !== null) {
    return {
      passed: false,
      bonus: 0,
      penalty: 0,
      applied: [],
      experimental,
      folklore,
      limiting: {
        stage: 'interactions',
        cause: { kind: 'rotation', pathogen: violation.pathogen },
        membership: 0 as Fraction,
        explanation: violation.rotationEffective
          ? `${violation.pathogen} needs a ${String(violation.minIntervalYears ?? 0)} year gap between plantings of this family in the same bed`
          : `${violation.pathogen} persists ${String(violation.inoculumPersistenceYearsLow)} to ${String(violation.inoculumPersistenceYearsHigh)} years and no rotation interval works. ${violation.alternativeControl ?? ''}`.trim(),
      },
    }
  }

  const applied = scoreable.filter((rule) => ruleAppliesInContext(rule, context))
  let bonus = 0
  let penalty = 0
  for (const rule of applied) {
    const effect = ruleEffect(rule)
    bonus += effect.bonus
    penalty += effect.penalty
  }

  const clash = familyClash(context)
  if (clash !== null) {
    penalty += 0.1
  }

  return {
    passed: true,
    bonus: Math.min(bonus, MAX_INTERACTION_BONUS),
    penalty,
    applied,
    experimental,
    folklore,
    limiting:
      clash === null
        ? null
        : {
            stage: 'interactions',
            cause: { kind: 'shared-pest-or-pathogen', withCropId: clash.id },
            membership: 0.8 as Fraction,
            explanation: `Shares a family, and therefore pests and soil-borne pathogens, with ${cropLabel(clash)}`,
          },
  }
}

/** Management steps that must be rendered inline with the recommendation */
export const requiredManagement = (rules: readonly ScoreableCompanionRule[]): readonly string[] => [
  ...new Set(rules.flatMap((rule) => rule.scope.requiresManagement)),
]
