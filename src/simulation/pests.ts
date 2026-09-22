import { unsafeBandMidpoint } from '../types/band'
import { unsourcedClaim } from '../types/cited'
import type { CompanionRule, InteractionKind, ScoreableCompanionRule } from '../types/companion'
import type { GardenPlot } from '../types/garden'
import type { CropId } from '../types/ids'
import type { Site } from '../types/site'
import type { Fraction } from '../types/units'
import { hiddenTruth, measuredEffectLike } from './evidence'

/**
 * The interaction kinds in the corpus that are about pest numbers.
 *
 * Keyed off `InteractionKind`, and never a list of rule ids, so a rule is recognised by what it
 * IS. The grade A and B pest rules also carry `effectMetric: 'pest-density-pct'` and their
 * measured band is applied directly; the grade C, D and E ones carry no effect figure at all, so
 * their kind is the only thing that says what they are for. A rule of one of these kinds acts on
 * pests and never on the harvest, so one hypothesis is paid once
 */
export const PEST_KINDS: ReadonlySet<InteractionKind> = new Set<InteractionKind>([
  'host-finding-disruption',
  'trap-crop',
  'natural-enemy-provision',
  'nematode-suppression',
  'repellent-volatile',
])

export interface Crowding {
  /** Share of the garden's green area that is this family: 1 on bare ground, 0 in a full mix */
  readonly crowding: Fraction
  readonly hostAreaM2: number
  readonly greenAreaM2: number
}

/**
 * How much of what grows in this garden is the same family as this bed.
 *
 * The mechanism is the corpus's own. `undersown-cover-host-finding` is grade A off twelve studies
 * and its mechanism field reads: "Appropriate and inappropriate landings: non-host green surface
 * area dilutes the landing sequence so specialist flies leave before ovipositing. The mechanism
 * is green surface area, not smell." So what protects a bed is other GREEN that is not its host,
 * and bare ground is not green: a lone bed in an otherwise bare plot is fully exposed, which is
 * the classic result and the reason undersowing works at all. Green area is every planted bed,
 * weighted by the share of its plantings that are the host family; a garden with nothing planted
 * around the bed has nothing to lose a fly in.
 *
 * The general form of a specialist claim, and said so: the studies are brassica and allium
 * studies, and every family here gets the same dilution response, which is the honest
 * generalisation of "every crop has specialists and monoculture concentrates them" and is more
 * than any one of those papers measured
 */
export const crowdingOf = (
  plot: GardenPlot,
  family: string,
  familyOf: (cropId: CropId) => string | null,
): Crowding => {
  let hostAreaM2 = 0
  let greenAreaM2 = 0
  for (const bed of plot.beds) {
    if (bed.plantings.length === 0) continue
    const host = bed.plantings.filter((planting) => familyOf(planting.cropId) === family).length
    hostAreaM2 += (bed.areaM2 * host) / bed.plantings.length
    greenAreaM2 += bed.areaM2
  }
  return {
    crowding: (greenAreaM2 <= 0 ? 1 : hostAreaM2 / greenAreaM2) as Fraction,
    hostAreaM2,
    greenAreaM2,
  }
}

/**
 * How many more times over the same arrangement gets tested in this year than in a typical one.
 *
 * Insect development rate is close to linear in accumulated heat above a threshold, which is what
 * every extension IPM programme forecasts generations from, and 10 C is the conventional base for
 * the pests these companion rules are about. The site's own typical year is the reference, so
 * nothing here says how many generations a season fits, only that a hotter year here fits more
 * of them than a cooler one here; between sites the crowding term alone speaks
 */
export const heatRatio = (year: Site, typical: Site): number =>
  year.seasonGdd.base10C / Math.max(typical.seasonGdd.base10C, 1)

export const untreatedPressure = (crowding: Fraction, ratio: number): Fraction =>
  Math.min(1, crowding * ratio) as Fraction

/**
 * The one number in the season simulation with no source, declared as such.
 *
 * The companion rules measure pest DENSITY, and nothing in this repository publishes what a given
 * density costs a harvest: that is a dose-response curve per pest and per crop that the corpus
 * does not hold. It is a scale: which practice suppresses pests, and by how much, is read off
 * the rules themselves, and it appears in the provenance ledger with the other gaps
 */
export const PEST_YIELD_LOSS_AT_FULL_PRESSURE = unsourcedClaim(
  0.4 as Fraction,
  'The companion rules measure pest density, and no source in the corpus converts a density into a share of harvest lost. Four tenths of a crop at full pressure is a scale chosen so that a bed hemmed in by its own family still brings something in',
  'Dose-response varies by pest and by crop, this is one figure for all of them',
)

export const pestYieldLoss = (pressure: Fraction): Fraction =>
  (pressure * PEST_YIELD_LOSS_AT_FULL_PRESSURE.value) as Fraction

/** A measured band on pest density, applied as measured; a band above one is counting enemies */
const densityMultiplier = (midpoint: number): number => (midpoint >= 1 ? 1 : midpoint)

/**
 * What a rule about pests multiplies a bed's pest pressure by.
 *
 * The same three-grade epistemics as the harvest, pointed at the other half of the corpus:
 * a measured effect is applied as measured, a mechanism with no measured effect does nothing
 * the numbers can see, and an untested claim does what the hidden truth of this garden says.
 *
 * The trap this exists to avoid: `insectary-strip-enemy-abundance` is grade A off 43 studies,
 * carries `effectMetric: 'pest-density-pct'`, and its band is 1.5 to 3.0. Multiply pest pressure
 * by that and the best-evidenced rule on the list more than doubles the pests. It counts natural
 * ENEMIES, its own notes say the translation into suppression is a separate grade B claim, and
 * that claim is `insectary-pest-suppression`, 0.7 to 0.95. A band at or above one on this metric
 * is read as counting the wrong animal and applied to nothing
 */
export const pestSuppression = (
  rule: CompanionRule,
  scoreable: readonly ScoreableCompanionRule[],
  seed: number,
): number => {
  if (!PEST_KINDS.has(rule.kind)) return 1
  switch (rule.grade) {
    case 'A':
    case 'B':
      return rule.effectMetric === 'pest-density-pct'
        ? densityMultiplier(unsafeBandMidpoint(rule.effect))
        : 1
    case 'C':
      return 1
    default: {
      if (!hiddenTruth(rule, seed)) return 1
      // borrowed from the measured pest-density rules that point the right way, never from the
      // enemy count, so a true folklore claim is worth what a measured one of its kind is worth
      const measured = scoreable.filter(
        (peer) => peer.effectMetric === 'pest-density-pct' && unsafeBandMidpoint(peer.effect) < 1,
      )
      const like = measuredEffectLike(rule, measured)
      return like === null ? 1 : densityMultiplier(unsafeBandMidpoint(like))
    }
  }
}
