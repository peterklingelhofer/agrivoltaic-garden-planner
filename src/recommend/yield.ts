import { banded, interval } from '../types/band'
import { unsourcedClaim } from '../types/cited'
import type {
  Banded,
  LandEquivalentRatio,
  UncertaintyContribution,
  UncertaintySource,
} from '../types/band'
import type { LaubAnchor, LaubCurve } from '../types/crop'
import type { BedId, CropId } from '../types/ids'
import type { YieldCaveat, YieldEstimate } from '../types/recommend'
import type { Fraction, Ratio } from '../types/units'

export const SEASONAL_PAR_HALF_WIDTH: Fraction = 0.1 as Fraction

/**
 * The allowance is this app's own, from Decision Record 7's one line. Declared so it reaches the
 * sources step's ledger beside the crowding penalty it sits next to in every band
 * (Decision Record 23)
 */
export const SEASONAL_PAR_CLAIM = unsourcedClaim(
  SEASONAL_PAR_HALF_WIDTH,
  'The plus or minus 10 percent on a season’s total PAR (the light plants use) is this app’s own figure. No cited source gives an uncertainty for a season’s total light. The relative yield it widens is a ratio of two light totals from the same weather series',
)

export const SEASONAL_PAR_CONTRIBUTION: UncertaintyContribution = {
  source: 'seasonal-par',
  halfWidthFraction: SEASONAL_PAR_HALF_WIDTH,
  note: '',
}

export const CROP_RESPONSE_CONTRIBUTION: UncertaintyContribution = {
  source: 'crop-response',
  halfWidthFraction: 0.3 as Fraction,
  note: "The crop group's 95 percent confidence interval, from Laub et al. 2022 Table S2. Prediction intervals are drawn in the paper’s Fig. 3 and aren't tabulated, so this band is the confidence interval",
}

/**
 * The crowding term is a shift: both ends of the band are scaled down by the
 * penalty, so its `halfWidthFraction` carries the share it takes, and the renderer prints that
 * share as the reduction it is. The figure it scales is `MAX_CROWDING_YIELD_PENALTY`, declared
 * unsourced in the ledger
 */
export const CROWDING_CONTRIBUTION: UncertaintyContribution = {
  source: 'crowding',
  halfWidthFraction: 0 as Fraction,
  note: 'The share of the crop-response yield that crowding at catalog spacing takes off both ends of the band. It has no source, and the sources step lists it as a gap',
}

const LOG_FLOOR = 1e-4

const toLog = (value: number): number => Math.log10(Math.max(value, LOG_FLOOR))

const fromLog = (value: number): number => 10 ** value

/**
 * The published confidence bounds are symmetric on the log10 scale, so every
 * interpolation between anchors happens in log space
 */
const interpolateLog = (a: number, b: number, t: number): number =>
  fromLog(toLog(a) + (toLog(b) - toLog(a)) * t)

const ORIGIN: LaubAnchor = {
  rsr: 0 as Fraction,
  relativeYield: 1 as Fraction,
  ciLow: 1 as Fraction,
  ciHigh: 1 as Fraction,
}

interface Interpolated {
  readonly value: number
  readonly low: number
  readonly high: number
}

export const interpolateLaubAnchors = (
  anchors: readonly LaubAnchor[],
  rsr: number,
): Interpolated => {
  const points = [ORIGIN, ...anchors]
  const last = points[points.length - 1]
  if (last === undefined) return { value: 1, low: 1, high: 1 }
  if (rsr >= last.rsr) {
    return { value: last.relativeYield, low: last.ciLow, high: last.ciHigh }
  }
  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1]
    const current = points[index]
    if (previous === undefined || current === undefined) continue
    if (rsr <= current.rsr) {
      const span = current.rsr - previous.rsr
      const t = span <= 0 ? 0 : (rsr - previous.rsr) / span
      return {
        value: interpolateLog(previous.relativeYield, current.relativeYield, t),
        low: interpolateLog(previous.ciLow, current.ciLow, t),
        high: interpolateLog(previous.ciHigh, current.ciHigh, t),
      }
    }
  }
  return { value: last.relativeYield, low: last.ciLow, high: last.ciHigh }
}

/**
 * Season-cumulative RSR to a banded relative yield through the crop group's own
 * Laub et al. 2022 curve. Never a scalar, and this band alone is the crop-response
 * term (Decision Record 7). `estimateYield` adds the other terms and names whichever
 * moves the band most
 */
export const laubRelativeYield = (
  curve: LaubCurve,
  rsr: Fraction,
  waterLimited: boolean,
): Banded<Fraction> => {
  const raw = interpolateLaubAnchors(curve.anchors.value, rsr)
  // any "shade improves yield" pathway is gated on the water-limitation flag
  const cap = waterLimited ? Number.POSITIVE_INFINITY : 1
  const lower = Math.min(raw.low, cap)
  const upper = Math.min(raw.high, cap)
  return banded(
    interval(lower as Fraction, upper as Fraction),
    0.95,
    'confidence',
    'crop-response',
    [
      {
        ...CROP_RESPONSE_CONTRIBUTION,
        halfWidthFraction: (Math.max(upper - lower, 0) / 2) as Fraction,
        note: `${CROP_RESPONSE_CONTRIBUTION.note}. Crop group ${curve.group}, n=${String(curve.studyCount)} studies`,
      },
    ],
  )
}

export const laubCentralRelativeYield = (
  curve: LaubCurve,
  rsr: Fraction,
  waterLimited: boolean,
): number => {
  const raw = interpolateLaubAnchors(curve.anchors.value, rsr)
  return waterLimited ? raw.value : Math.min(raw.value, 1)
}

/** Groups with two to four studies carry a far weaker evidence base */
export const WEAK_EVIDENCE_STUDY_COUNT = 4

export const estimateYield = (
  cropId: CropId,
  bedId: BedId,
  curve: LaubCurve,
  rsr: Fraction,
  crowdingPenalty: Fraction,
  waterLimited: boolean,
  caveats: readonly YieldCaveat[],
): YieldEstimate => {
  const base = laubRelativeYield(curve, rsr, waterLimited)
  const retained = 1 - crowdingPenalty
  // the gain above full yield stays withheld after the PAR allowance too, or a planting at 1% shade
  // would read 110% beside the caveat that says the gain is withheld
  const cap = waterLimited ? Number.POSITIVE_INFINITY : 1
  const lower = Math.min(base.interval.lower * retained * (1 - SEASONAL_PAR_HALF_WIDTH), cap)
  const upper = Math.min(base.interval.upper * retained * (1 + SEASONAL_PAR_HALF_WIDTH), cap)
  /*
    Which term moves the band most, in absolute yield, so the attribution follows the numbers:
    half the published interval, the PAR allowance either side of its midpoint, and the whole
    crowding shift. Ties go to the crop response, then to PAR, so an unshaded and uncrowded
    bed reads as the PAR allowance it is
  */
  const mid = (base.interval.lower + base.interval.upper) / 2
  const widths: readonly (readonly [UncertaintySource, number])[] = [
    ['crop-response', (base.interval.upper - base.interval.lower) / 2],
    ['seasonal-par', SEASONAL_PAR_HALF_WIDTH * mid],
    ['crowding', crowdingPenalty * mid],
  ]
  const dominant = widths.reduce((max, entry) => (entry[1] > max[1] ? entry : max))[0]
  const relativeYield = banded(
    interval(lower as Fraction, upper as Fraction),
    base.confidence,
    base.intervalKind,
    dominant,
    [
      ...base.contributions,
      SEASONAL_PAR_CONTRIBUTION,
      { ...CROWDING_CONTRIBUTION, halfWidthFraction: crowdingPenalty },
    ],
  )

  const raw = interpolateLaubAnchors(curve.anchors.value, rsr)
  const extra: YieldCaveat[] = []
  if (!waterLimited && raw.value > 1) {
    extra.push({
      code: 'water-limitation-gated',
      message:
        "The curve predicts a yield gain at this shade level. That gain comes from less heat and evaporative stress, and this site isn't water-limited, so it's withheld",
    })
  }
  if (curve.studyCount <= WEAK_EVIDENCE_STUDY_COUNT) {
    // named apart from the pipeline's own 'tier-c-inference' caveat (crop.light.dliMinMolM2Day tier
    // C) because the two are different claims that happen to both be about a thin evidence base:
    // this one is about the Laub relative-yield curve, that one is about the DLI threshold. Sharing
    // one code would collide whenever a crop triggered both, duplicating a React list key
    extra.push({
      code: 'weak-evidence-base',
      message: `The ${curve.group} curve rests on only ${String(curve.studyCount)} studies, among the thinnest evidence bases of the nine groups`,
    })
  }
  extra.push({
    code: 'proxy-shade-cloth',
    message:
      "Shade type wasn't significant in the meta-analysis, so shade-cloth trials are pooled with panel trials",
  })
  if (curve.groupNote !== null) {
    extra.push({ code: 'group-is-a-proxy', message: curve.groupNote })
  }

  return {
    cropId,
    bedId,
    laubGroup: curve.group,
    seasonCumulativeRsr: rsr,
    relativeYield,
    absoluteYieldKgPerM2Season: null,
    waterLimited,
    caveats: [...caveats, ...extra],
  }
}

/**
 * Agrivoltaic LER after Dupraz et al. 2011: the crop partial ratios plus the
 * electricity term. A total above 1 means the shared land as a whole out-produces
 * the sole uses.
 *
 * Every partial names its own denominator. Crops are measured against the same
 * crop unshaded on the same land, which is what the Laub curve returns at RSR 0.
 * Electricity is measured against the sole-use PV plant stated verbatim by
 * `REFERENCE_DEFINITION` in `src/sim/pv/ler.ts`, and that definition travels
 * with the report because the ratio is meaningless without it
 */
export const landEquivalentRatio = (
  estimates: readonly YieldEstimate[],
  energyRatio: Banded<Fraction>,
): LandEquivalentRatio => {
  const partialLerByCropId = new Map<string, Banded<Ratio>>()
  let lower = energyRatio.interval.lower as number
  let upper = energyRatio.interval.upper as number
  const contributions = [...energyRatio.contributions]
  for (const estimate of estimates) {
    // a species grown in several beds contributes one partial ratio for the plot
    const existing = partialLerByCropId.get(estimate.cropId as string)
    const partial = banded(
      interval(
        ((existing?.interval.lower ?? 0) + estimate.relativeYield.interval.lower) as Ratio,
        ((existing?.interval.upper ?? 0) + estimate.relativeYield.interval.upper) as Ratio,
      ),
      estimate.relativeYield.confidence,
      estimate.relativeYield.intervalKind,
      'crop-response',
      [...(existing?.contributions ?? []), ...estimate.relativeYield.contributions],
    )
    partialLerByCropId.set(estimate.cropId as string, partial)
    lower += estimate.relativeYield.interval.lower
    upper += estimate.relativeYield.interval.upper
    contributions.push(...estimate.relativeYield.contributions)
  }
  return {
    totalLer: banded(
      interval(lower as Ratio, upper as Ratio),
      0.95,
      'confidence',
      'crop-response',
      contributions,
    ),
    partialLerByCropId,
    electricity: banded(
      interval(
        energyRatio.interval.lower as number as Ratio,
        energyRatio.interval.upper as number as Ratio,
      ),
      energyRatio.confidence,
      energyRatio.intervalKind,
      energyRatio.dominantSource,
      energyRatio.contributions,
    ),
  }
}
