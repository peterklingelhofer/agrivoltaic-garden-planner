import { rotationConstraintFor, ruleEndpointMatches } from '../data/companions'
import { tekRule } from '../data/tek'
import { clamp } from '../data/util'
import { canopyCoverFromLai } from '../data/water'
import type { CitationId } from '../types/citation-ids.generated'
import type {
  CompanionRule,
  PartitionedCompanionRules,
  RotationConstraint,
  ScoreableCompanionRule,
} from '../types/companion'
import type { Crop, Trapezoid } from '../types/crop'
import { isScoreableGrade } from '../types/evidence'
import type { Bed, CanopyTier } from '../types/garden'
import type { CropId } from '../types/ids'
import type { BedLight } from '../types/light'
import type {
  CompatibilityTerm,
  CompatibilityTermKind,
  CompatibilityVerdict,
  CompatibilityWeights,
  PairCompatibility,
  PhOverlap,
  PhWindow,
} from '../types/polyculture'
import type { PvArray } from '../types/pv'
import type { Site } from '../types/site'
import type { TekDesignRule } from '../types/tek'
import type { Fraction, PhUnits } from '../types/units'
import { trapezoidMembership } from './membership'
import { ruleAppliesInContext, ruleEffect } from './stages/interactions'
import { seasonLightFor } from './stages/light-gate'
import { droughtPenaltyFor, hardPhEnvelope } from './stages/soil-water'
import { assignCanopyTier } from './stages/space'
import { cropLabel } from '../data/crops'

/**
 * Crop-vs-crop agronomy. Every gate the product already runs compares one crop
 * against the SITE; nothing compared two crops proposed for the same bed. Each
 * term below is computed from data the catalogue already holds, carries its own
 * verdict and its own citations, and is reported separately so a suggestion can
 * be argued with rather than merely trusted
 */
export interface PairContext {
  readonly bed: Bed
  readonly site: Site
  readonly light: BedLight
  readonly arrays: readonly PvArray[]
  readonly rules: PartitionedCompanionRules
  readonly rotation: readonly RotationConstraint[]
  readonly tekRules: readonly TekDesignRule[]
  readonly weights: CompatibilityWeights
  /** Share of the bed each crop's canopy covers, which sets how much shade it casts */
  readonly canopyShareByCropId: ReadonlyMap<CropId, Fraction>
}

export const DEFAULT_COMPATIBILITY_WEIGHTS: CompatibilityWeights = {
  'soil-ph': 0.3,
  'water-regime': 0.1,
  'root-stratification': 0.15,
  'canopy-tier': 0.15,
  'light-overtopping': 0.2,
  'shared-pest-or-pathogen': 0.1,
  'documented-companion': 0.25,
  allelopathy: 0,
}

/** FAO-56 depletion fractions further apart than this cannot share one irrigation schedule */
export const WATER_REGIME_CAUTION_GAP = 0.15

export const WATER_REGIME_MAX_GAP = 0.3

/** Rooting depths this far apart are fully complementary */
export const ROOT_COMPLEMENTARITY_DEPTH_M = 0.4

/** Below this height difference neither crop meaningfully overtops the other */
export const OVERTOPPING_HEIGHT_GAP_M = 0.3

export const TIER_ORDER: readonly CanopyTier[] = ['herb-ground', 'shrub', 'mid-canopy', 'overstory']

const FAO56_CITATIONS: readonly CitationId[] = ['allen1998-fao56']

const ROOT_CITATIONS: readonly CitationId[] = [
  'postma2012-polyculture-roots',
  'zhang2014-three-sisters-roots',
]

const term = (
  kind: CompatibilityTermKind,
  verdict: CompatibilityVerdict,
  signal: number,
  scores: boolean,
  grade: CompatibilityTerm['grade'],
  explanation: string,
  citations: readonly CitationId[],
  weights: CompatibilityWeights,
  tekRuleKey: CompatibilityTerm['tekRuleKey'] = null,
): CompatibilityTerm => ({
  kind,
  verdict,
  signal,
  contribution: scores ? weights[kind] * signal : 0,
  scores,
  grade,
  explanation,
  citations,
  tekRuleKey,
})

const phWindow = (low: number, high: number): PhWindow | null =>
  low <= high ? { lowPh: low as PhUnits, highPh: high as PhUnits } : null

const uniqueCitations = (ids: readonly CitationId[]): readonly CitationId[] => [...new Set(ids)]

/**
 * Both memberships are piecewise linear, so the pH where they are jointly
 * highest is either a trapezoid breakpoint or a crossing between two of them.
 * Enumerating those exactly beats sampling a grid and never drifts with a step
 */
const bestJointPh = (
  a: Trapezoid<PhUnits>,
  b: Trapezoid<PhUnits>,
  within: PhWindow,
): { readonly ph: PhUnits; readonly membership: Fraction } => {
  const breaks = [
    within.lowPh,
    within.highPh,
    ...[a, b].flatMap((shape) => [
      shape.absoluteMin,
      shape.optimumMin,
      shape.optimumMax,
      shape.absoluteMax,
    ]),
  ]
    .filter((value) => value >= within.lowPh && value <= within.highPh)
    .sort((left, right) => left - right)

  const joint = (ph: number): number =>
    Math.min(trapezoidMembership(ph as PhUnits, a), trapezoidMembership(ph as PhUnits, b))

  let bestPh = within.lowPh as number
  let best = joint(bestPh)
  const consider = (ph: number): void => {
    const value = joint(ph)
    if (value > best + 1e-9) {
      best = value
      bestPh = ph
    }
  }
  for (let index = 0; index < breaks.length; index += 1) {
    const low = breaks[index] ?? 0
    consider(low)
    const high = breaks[index + 1]
    if (high === undefined) continue
    // one linear crossing per segment, where min() switches which crop is limiting
    const gapLow = trapezoidMembership(low as PhUnits, a) - trapezoidMembership(low as PhUnits, b)
    const gapHigh =
      trapezoidMembership(high as PhUnits, a) - trapezoidMembership(high as PhUnits, b)
    if (gapLow === 0 || gapHigh === 0 || gapLow * gapHigh > 0) continue
    consider(low + ((high - low) * gapLow) / (gapLow - gapHigh))
  }
  return { ph: bestPh as PhUnits, membership: best as Fraction }
}

export const phOverlap = (a: Crop, b: Crop): PhOverlap => {
  const left = a.envelope.soilPh
  const right = b.envelope.soilPh
  const optimum = phWindow(
    Math.max(left.optimumMin, right.optimumMin),
    Math.min(left.optimumMax, right.optimumMax),
  )
  const tolerated = phWindow(
    Math.max(left.absoluteMin, right.absoluteMin),
    Math.min(left.absoluteMax, right.absoluteMax),
  )
  const best = tolerated === null ? null : bestJointPh(left, right, tolerated)
  return {
    optimum,
    tolerated,
    compromisePh: optimum === null ? (best?.ph ?? null) : null,
    jointMembership: (best?.membership ?? 0) as Fraction,
    hardEnvelopeCropIds: [a, b].filter(hardPhEnvelope).map((crop) => crop.id),
  }
}

/**
 * A crop whose absolute pH span is narrow enough to be physiology rather than a
 * preference cannot be moved to a compromise, so disjoint optima where either
 * side is that narrow is a hard conflict, not a warning. Blueberry, alone in
 * this catalogue in optimising below pH 6.2, is exactly that crop
 */
export const phTerm = (a: Crop, b: Crop, weights: CompatibilityWeights): CompatibilityTerm => {
  const overlap = phOverlap(a, b)
  const citations = uniqueCitations([...a.envelope.citations, ...b.envelope.citations])
  const range = (crop: Crop): string =>
    `${cropLabel(crop)} optimises at pH ${crop.envelope.soilPh.optimumMin.toFixed(1)} to ${crop.envelope.soilPh.optimumMax.toFixed(1)}`

  if (overlap.tolerated === null) {
    return term(
      'soil-ph',
      'conflict',
      -1,
      true,
      'B',
      `No soil pH suits both: ${range(a)} and ${range(b)}, and their tolerated ranges don't overlap`,
      citations,
      weights,
    )
  }
  if (overlap.optimum !== null) {
    return term(
      'soil-ph',
      'benefit',
      1,
      true,
      'B',
      `Both are at their optimum between pH ${overlap.optimum.lowPh.toFixed(1)} and ${overlap.optimum.highPh.toFixed(1)}, so one soil serves both`,
      citations,
      weights,
    )
  }
  const compromise = (overlap.compromisePh ?? 0).toFixed(1)
  if (overlap.hardEnvelopeCropIds.length > 0) {
    const hard = [a, b].filter((crop) => overlap.hardEnvelopeCropIds.includes(crop.id))
    return term(
      'soil-ph',
      'conflict',
      -1,
      true,
      'B',
      `${range(a)} and ${range(b)}. The best either can share is pH ${compromise}. ${hard.map(cropLabel).join(' and ')} needs its narrow range for physiological reasons, so no soil compromise reconciles this pairing`,
      citations,
      weights,
    )
  }
  return term(
    'soil-ph',
    'caution',
    2 * overlap.jointMembership - 1,
    true,
    'B',
    `${range(a)} and ${range(b)}, so neither is at its optimum. The compromise is pH ${compromise}, where each sits at about ${Math.round(overlap.jointMembership * 100)} percent of its envelope (how well that pH suits it, with 100 at its optimum)`,
    citations,
    weights,
  )
}

/**
 * Two crops in one bed share one irrigation schedule. FAO-56 Table 22's
 * depletion fraction p is how much of the available water each will draw before
 * it stresses, so a wide gap means one is watered wrong whatever the schedule
 */
export const waterRegimeTerm = (
  a: Crop,
  b: Crop,
  context: PairContext,
  weights: CompatibilityWeights,
): CompatibilityTerm => {
  const gap = Math.abs(a.roots.depletionFraction - b.roots.depletionFraction)
  const signal = clamp(1 - (2 * gap) / WATER_REGIME_MAX_GAP, -1, 1)
  const thirsty = [a, b].filter((crop) => droughtPenaltyFor(crop, context.bed, context.site) > 0)
  const schedule = context.bed.irrigation.available
    ? `the bed's ${context.bed.irrigation.method} irrigation`
    : 'rainfall alone'
  if (gap >= WATER_REGIME_CAUTION_GAP) {
    return term(
      'water-regime',
      'caution',
      signal,
      true,
      'B',
      `${cropLabel(a)} draws down ${(a.roots.depletionFraction * 100).toFixed(0)} percent of available soil water before it stresses and ${cropLabel(b)} draws ${(b.roots.depletionFraction * 100).toFixed(0)} percent, so ${schedule} cannot suit both without splitting the bed into zones`,
      FAO56_CITATIONS,
      weights,
    )
  }
  if (thirsty.length > 0) {
    return term(
      'water-regime',
      'caution',
      Math.min(signal, 0),
      true,
      'B',
      `Their water demands match, but ${thirsty.map(cropLabel).join(' and ')} is drought-sensitive on an unirrigated bed at this site, so the pairing raises the watering the whole bed needs`,
      FAO56_CITATIONS,
      weights,
    )
  }
  return term(
    'water-regime',
    gap <= WATER_REGIME_CAUTION_GAP / 2 ? 'benefit' : 'neutral',
    signal,
    true,
    'B',
    `Both stress at a similar soil-water depletion, so one schedule on ${schedule} suits them together`,
    FAO56_CITATIONS,
    weights,
  )
}

/** Complementary rooting depth is the documented below-ground intercropping mechanism */
export const rootStratificationTerm = (
  a: Crop,
  b: Crop,
  weights: CompatibilityWeights,
): CompatibilityTerm => {
  const separation = Math.abs(a.roots.maxEffectiveDepthM - b.roots.maxEffectiveDepthM)
  const ratio = clamp(separation / ROOT_COMPLEMENTARITY_DEPTH_M, 0, 1)
  const depths = `${cropLabel(a)} roots to ${a.roots.maxEffectiveDepthM.toFixed(2)} m and ${cropLabel(b)} to ${b.roots.maxEffectiveDepthM.toFixed(2)} m`
  if (a.roots.stratum !== b.roots.stratum) {
    return term(
      'root-stratification',
      'benefit',
      ratio,
      true,
      'B',
      `${depths}, so they forage different soil layers and total soil exploration rises`,
      ROOT_CITATIONS,
      weights,
    )
  }
  if (a.roots.stratum === 'shallow') {
    return term(
      'root-stratification',
      'caution',
      -(1 - ratio),
      true,
      'B',
      `${depths}. Both are shallow-rooted, so they compete for the same water and nutrients in the top of the profile`,
      ROOT_CITATIONS,
      weights,
    )
  }
  return term(
    'root-stratification',
    'neutral',
    0,
    true,
    'B',
    `${depths}, both in the ${a.roots.stratum} stratum, so there is no depth partitioning to claim either way`,
    ROOT_CITATIONS,
    weights,
  )
}

/** TEK design rule 1, using the same tier assignment the optimiser scores stratification with */
export const canopyTierTerm = (
  a: Crop,
  b: Crop,
  context: PairContext,
  weights: CompatibilityWeights,
): CompatibilityTerm => {
  const rule = tekRule(context.tekRules, 'vertical-stratification')
  const tierA = assignCanopyTier(a, context.arrays)
  const tierB = assignCanopyTier(b, context.arrays)
  const distance = Math.abs(TIER_ORDER.indexOf(tierA) - TIER_ORDER.indexOf(tierB))
  const attribution = `Vertical stratification is attributed to ${rule.attribution.peoples.join(' and ')}`
  return distance === 0
    ? term(
        'canopy-tier',
        'caution',
        -1,
        true,
        'B',
        `Both occupy the ${tierA} tier, so they compete in one light layer instead of stacking. ${attribution}`,
        rule.attribution.citations,
        weights,
        rule.key,
      )
    : term(
        'canopy-tier',
        'benefit',
        distance / (TIER_ORDER.length - 1),
        true,
        'B',
        `${cropLabel(a)} occupies the ${tierA} tier and ${cropLabel(b)} the ${tierB} tier, which is the explicit tiering the design rule asks for. ${attribution}`,
        rule.attribution.citations,
        weights,
        rule.key,
      )
}

/**
 * The differentiator. Under an array the bed already has a DLI budget, so a
 * crop that overtops another spends part of it. Transmission through the taller
 * canopy is Beer-Lambert on the catalogue's own leaf area index and extinction
 * coefficient, weighted by the share of the bed that canopy actually covers,
 * and the result is checked against the shorter crop's own DLI minimum
 */
export const lightOvertoppingTerm = (
  a: Crop,
  b: Crop,
  context: PairContext,
  weights: CompatibilityWeights,
): CompatibilityTerm => {
  const [taller, shorter] =
    a.footprint.heightM.typicalM >= b.footprint.heightM.typicalM ? [a, b] : [b, a]
  const drop = taller.footprint.heightM.typicalM - shorter.footprint.heightM.typicalM
  const tier = shorter.light.dliMinMolM2Day.tier
  const scores = isScoreableGrade(tier)
  const citations = shorter.light.dliMinMolM2Day.citations
  if (drop < OVERTOPPING_HEIGHT_GAP_M) {
    return term(
      'light-overtopping',
      'neutral',
      0,
      scores,
      tier,
      `Their mature heights are within ${OVERTOPPING_HEIGHT_GAP_M.toFixed(1)} m, so neither overtops the other`,
      citations,
      weights,
    )
  }
  const share = context.canopyShareByCropId.get(taller.id) ?? 0.5
  const cover =
    share * canopyCoverFromLai(taller.footprint.leafAreaIndex, taller.footprint.lightExtinctionK)
  const open = seasonLightFor(shorter, context.light, context.site).meanDliMolM2Day
  const under = open * (1 - cover)
  const minimum = shorter.light.dliMinMolM2Day.value
  const target = shorter.light.dliTargetMolM2Day.value
  const measured = `${cropLabel(taller)} stands ${taller.footprint.heightM.typicalM.toFixed(1)} m tall over ${cropLabel(shorter)} and covers ${Math.round(share * 100)} percent of the bed, cutting the ${open.toFixed(1)} mol/m²/d this bed gets in ${cropLabel(shorter)}'s season to about ${under.toFixed(1)}`
  if (under < minimum) {
    return term(
      'light-overtopping',
      'conflict',
      -1,
      scores,
      tier,
      `${measured}, below the ${minimum.toFixed(1)} mol/m²/d ${cropLabel(shorter)} needs. The array already takes most of this bed's light, and this pairing takes more of what is left`,
      citations,
      weights,
    )
  }
  const span = Math.max(target - minimum, 1e-6)
  return under < target
    ? term(
        'light-overtopping',
        'caution',
        -clamp((target - under) / span, 0, 1),
        scores,
        tier,
        `${measured}, above the ${minimum.toFixed(1)} mol/m²/d minimum but under the ${target.toFixed(1)} it wants`,
        citations,
        weights,
      )
    : term(
        'light-overtopping',
        'neutral',
        0,
        scores,
        tier,
        `${measured}, still above the ${target.toFixed(1)} mol/m²/d ${cropLabel(shorter)} wants`,
        citations,
        weights,
      )
}

/** Family conflicts are already hard constraints elsewhere; this reads the same table */
export const sharedPestTerm = (
  a: Crop,
  b: Crop,
  context: PairContext,
  weights: CompatibilityWeights,
): CompatibilityTerm | null => {
  if (a.taxonomy.family !== b.taxonomy.family) return null
  const constraint = rotationConstraintFor(context.rotation, a.taxonomy.family)
  if (constraint !== undefined) {
    return term(
      'shared-pest-or-pathogen',
      'conflict',
      -1,
      true,
      constraint.grade,
      `Both are ${a.taxonomy.family} and that family carries a hard rotation constraint for ${constraint.pathogen}, so they may not share a bed`,
      constraint.citations,
      weights,
    )
  }
  return term(
    'shared-pest-or-pathogen',
    'caution',
    -1,
    false,
    null,
    `Both are ${a.taxonomy.family}, so they share pests and soil-borne pathogens. No work in the corpus quantifies the cost for this family, so this is a warning with no effect on the score`,
    [],
    weights,
  )
}

const matchesCrop = (ref: string, refType: 'taxon' | 'group' | 'family', crop: Crop): boolean =>
  ruleEndpointMatches(ref, refType, crop.id, crop.taxonomy.family)

/** A rule is between this pair when its two endpoints land on the two crops, either way round */
export const ruleJoinsPair = (rule: CompanionRule, a: Crop, b: Crop): boolean =>
  (matchesCrop(rule.subjectRef, rule.subjectRefType, a) &&
    matchesCrop(rule.objectRef, rule.objectRefType, b)) ||
  (matchesCrop(rule.subjectRef, rule.subjectRefType, b) &&
    matchesCrop(rule.objectRef, rule.objectRefType, a))

const appliesBetween = (
  rule: ScoreableCompanionRule,
  a: Crop,
  b: Crop,
  context: PairContext,
): boolean => {
  const scope = {
    historyByYear: new Map(),
    // an empty history has no families to look up
    familyOf: () => null,
    koppenCode: context.site.koppenCode,
    scale: 'bed' as const,
  }
  return (
    ruleAppliesInContext(rule, { candidate: a, selected: [b], ...scope }) ||
    ruleAppliesInContext(rule, { candidate: b, selected: [a], ...scope })
  )
}

const ALLELOPATHY_KINDS = ['allelopathy-inhibitory', 'allelopathy-stimulatory']

export const evaluatePair = (a: Crop, b: Crop, context: PairContext): PairCompatibility => {
  const [left, right] = (a.id as string).localeCompare(b.id as string) <= 0 ? [a, b] : [b, a]
  const weights = context.weights

  const applied = context.rules.scoreable.filter((rule) =>
    appliesBetween(rule, left, right, context),
  )
  const experimental = context.rules.experimental.filter((rule) => ruleJoinsPair(rule, left, right))
  const folklore = context.rules.folklore.filter((rule) => ruleJoinsPair(rule, left, right))

  const terms: CompatibilityTerm[] = [
    phTerm(left, right, weights),
    waterRegimeTerm(left, right, context, weights),
    rootStratificationTerm(left, right, weights),
    canopyTierTerm(left, right, context, weights),
    lightOvertoppingTerm(left, right, context, weights),
  ]
  const shared = sharedPestTerm(left, right, context, weights)
  if (shared !== null) terms.push(shared)

  for (const rule of applied) {
    const effect = ruleEffect(rule)
    const signal = clamp(effect.bonus - effect.penalty, -1, 1)
    terms.push(
      term(
        'documented-companion',
        signal >= 0 ? 'benefit' : 'caution',
        signal,
        true,
        rule.grade,
        rule.mechanism,
        rule.citations,
        weights,
      ),
    )
  }
  for (const rule of [...experimental, ...folklore]) {
    if (!ALLELOPATHY_KINDS.includes(rule.kind)) continue
    terms.push(
      term(
        'allelopathy',
        'caution',
        0,
        false,
        rule.grade,
        `${rule.mechanism ?? rule.notes ?? 'No mechanism proposed'}. Grade ${rule.grade}, so it is shown as a caution with no effect on the score`,
        rule.citations,
        weights,
      ),
    )
  }

  const conflicts = terms.filter((entry) => entry.verdict === 'conflict')
  return {
    cropIds: [left.id, right.id],
    terms,
    ph: phOverlap(left, right),
    conflicts,
    compatible: conflicts.length === 0,
    score: terms.reduce((total, entry) => total + entry.contribution, 0),
    applied,
    experimental,
    folklore,
  }
}
