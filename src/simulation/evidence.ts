import { unsafeBandMidpoint } from '../types/band'
import type { Banded } from '../types/band'
import type {
  CompanionRule,
  FolkloreCompanionRule,
  ScoreableCompanionRule,
} from '../types/companion'
import type { RuleId } from '../types/ids'
import type { PlantingOutcome, SeasonReport } from '../types/simulation'
import type { Fraction, Ratio } from '../types/units'

/**
 * A seeded draw in [0, 1) from three integers, so a garden replays exactly and a trial cannot be
 * re-rolled by asking again. xorshift over a linear mix; nothing here needs to be better than
 * uniform and stable
 */
export const unit = (a: number, b: number, c: number): number => {
  let x =
    (Math.imul(a, 374_761_393) + Math.imul(b, 668_265_263) + Math.imul(c, 2_246_822_519)) >>> 0
  x ^= x >>> 13
  x = Math.imul(x, 1_274_126_177) >>> 0
  x ^= x >>> 16
  return (x >>> 0) / 0x1_0000_0000
}

/** A stable integer for a string, so a rule or a planting can take part in a draw */
export const codeOf = (text: string): number => {
  let code = 0
  for (let index = 0; index < text.length; index += 1) {
    code = (Math.imul(code, 31) + text.charCodeAt(index)) | 0
  }
  return code
}

/**
 * Whether a claim the evidence cannot settle happens to be true in THIS garden.
 *
 * Rolled once per garden from its seed, at even odds because nobody has measured the odds, never
 * re-rolled and never shown. That is the mechanic Decision Record 14 admits: a grade D or E rule
 * is a hypothesis a grower can test in play, the simulation's confidence in it is exactly the
 * repository's, and neither knows the answer in advance. A claim with a paper against it is false
 * in every garden, because that is not an open question
 */
export const hiddenTruth = (rule: FolkloreCompanionRule, seed: number): boolean =>
  rule.contradictedBy.length > 0 ? false : unit(seed, codeOf(rule.id), 7) < 0.5

/**
 * What a folklore claim does where it happens to be true: the median measured effect of the grade
 * A and B rules of the same kind. The corpus measured nothing about the claim itself, and the
 * only alternative to borrowing a measured size is inventing one. Null where the corpus has no
 * measured rule of that kind, in which case a true claim does nothing the numbers can see and the
 * reveal says so
 */
export const measuredEffectLike = (
  rule: CompanionRule,
  scoreable: readonly ScoreableCompanionRule[],
): Banded<Ratio> | null => {
  const peers = scoreable
    .filter((peer) => peer.kind === rule.kind)
    .sort((a, b) => unsafeBandMidpoint(a.effect) - unsafeBandMidpoint(b.effect))
  const median = peers[Math.floor((peers.length - 1) / 2)]
  return median === undefined ? null : median.effect
}

/**
 * Seasons of a trial before the literature is offered. Three, because a season is a year here
 * and the point is that a grower cannot tell a hypothesis from the weather in one. It is a rule
 * of the mode, a whole count of seasons chosen on purpose
 */
export const TRIALS_TO_REVEAL = 3

/**
 * The two sides of a trial: the harvested plantings that ran a rule, and the harvested plantings
 * of the SAME seasons that did not
 */
export interface TrialComparison {
  readonly triedMean: Fraction
  readonly triedPlantings: number
  /** Zero where every harvested planting of those seasons ran the rule, and the mean is then 0 */
  readonly withoutMean: Fraction
  readonly withoutPlantings: number
}

const meanRealised = (outcomes: readonly PlantingOutcome[]): Fraction =>
  (outcomes.length === 0
    ? 0
    : outcomes.reduce((total, outcome) => total + outcome.realised, 0) /
      outcomes.length) as Fraction

/**
 * What a trial has to compare itself against, read back off the seasons already run.
 *
 * Every planting a rule concerns runs it, so "the beds trying it made 65% of a full crop" is the
 * whole garden's number with nothing beside it unless a control group is built from the same
 * seasons. Where some beds did not run it, `PlantingOutcome.tried` says which, and that is the
 * comparison. Where all of them did, saying so is the lesson, and an empty control group is
 * counted as zero.
 *
 * Harvested on both sides, because `tried` is only ever set on a harvested outcome and a frosted
 * or refused bed on the control side would be answering a different question. Only the seasons
 * that ran the rule count, because the whole reason to compare inside one garden is that both
 * sides stood in the same weather. Null where no season on record ran it at all, which leaves the
 * row with nothing to add
 */
export const trialComparison = (
  reports: readonly SeasonReport[],
  ruleId: RuleId,
): TrialComparison | null => {
  const ran = (outcome: PlantingOutcome): boolean => outcome.tried.includes(ruleId)
  const harvested = reports
    .map((report) => report.outcomes.filter((outcome) => outcome.kind === 'harvested'))
    .filter((outcomes) => outcomes.some(ran))
    .flat()
  if (harvested.length === 0) return null
  const tried = harvested.filter(ran)
  const without = harvested.filter((outcome) => !ran(outcome))
  return {
    triedMean: meanRealised(tried),
    triedPlantings: tried.length,
    withoutMean: meanRealised(without),
    withoutPlantings: without.length,
  }
}
