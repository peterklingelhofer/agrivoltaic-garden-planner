import { WEIGHTS_CLAIM } from '../recommend/stages/rank'
import { SURROUNDINGS_CLAIM } from '../recommend/surroundings'
import { MAX_CROWDING_YIELD_PENALTY } from '../recommend/stages/space'
import { PEST_YIELD_LOSS_AT_FULL_PRESSURE } from '../simulation/pests'
import { isUnsourced } from '../types/cited'
import type { Cited } from '../types/cited'
import { HABIT_CANOPY_CLAIM } from './catalog/schema'
import { LEAF_SEASON_CLAIM } from './canopy'
import { loadCompanionRules } from './companions'
import { loadCropCatalog } from './crops'
import { dehesaGradient, loadTekRules } from './tek'

export type GapArea =
  | 'crop-light'
  | 'crop-hardiness'
  | 'crop-envelope'
  | 'companion-rule'
  | 'tek-attribution'
  | 'distance-gradient'
  | 'model-constant'

export interface ProvenanceGap {
  readonly area: GapArea
  readonly subject: string
  readonly field: string
  readonly reason: string
}

const gapOf = <T>(
  area: GapArea,
  subject: string,
  field: string,
  cited: Cited<T> | null,
): ProvenanceGap | null =>
  cited !== null && isUnsourced(cited)
    ? { area, subject, field, reason: cited.justification }
    : null

/**
 * The ledger is derived from the shipped data, never hand-maintained, so a new
 * uncited claim cannot be added without appearing here and in the UI
 */
export const provenanceLedger = async (): Promise<readonly ProvenanceGap[]> => {
  const [catalog, rules, tek] = await Promise.all([
    loadCropCatalog(),
    loadCompanionRules(),
    loadTekRules(),
  ])
  const gaps: ProvenanceGap[] = []

  for (const crop of catalog) {
    const candidates = [
      gapOf('crop-light', crop.id, 'dliMinMolM2Day', crop.light.dliMinMolM2Day),
      gapOf('crop-light', crop.id, 'dliTargetMolM2Day', crop.light.dliTargetMolM2Day),
      gapOf(
        'crop-light',
        crop.id,
        'dliMaxBeforeDisorderMolM2Day',
        crop.light.dliMaxBeforeDisorderMolM2Day,
      ),
      gapOf('crop-light', crop.id, 'maxDesignRsr', crop.light.maxDesignRsr),
      gapOf('crop-hardiness', crop.id, 'coldHardinessMinC', crop.coldHardinessMinC),
    ]
    for (const gap of candidates) if (gap !== null) gaps.push(gap)
    // the crop-vs-crop pH verdict cites the envelope, so an envelope with no work behind it
    // is a claim the suggestion engine would otherwise make silently
    if (crop.envelope.citations.length === 0) {
      gaps.push({
        area: 'crop-envelope',
        subject: crop.id,
        field: 'envelope.citations',
        reason:
          'ECOCROP-style trapezoids curated under the catalogue provenance with no work in the corpus tabulating these numbers',
      })
    }
  }

  for (const rule of rules) {
    if (rule.citations.length === 0) {
      gaps.push({
        area: 'companion-rule',
        subject: rule.id,
        field: 'citations',
        reason: `grade ${rule.grade} rule with no work in the verified corpus, excluded from scoring`,
      })
    }
  }

  for (const rule of tek) {
    if (rule.attribution.citations.length === 0) {
      gaps.push({
        area: 'tek-attribution',
        subject: rule.key,
        field: 'attribution.citations',
        reason: 'named peoples without a verified published source',
      })
    }
  }

  const dehesa = dehesaGradient()
  const dehesaGap = gapOf('distance-gradient', dehesa.key, 'samples', dehesa.samples)
  if (dehesaGap !== null) gaps.push(dehesaGap)

  // the model constants declared unsourced outside the catalogue rows (Decision Record 23)
  gaps.push(
    {
      area: 'model-constant',
      subject: 'plant habits',
      field: 'leafAreaIndex and lightExtinctionK',
      reason: HABIT_CANOPY_CLAIM.justification,
    },
    {
      area: 'model-constant',
      subject: 'crop ranking',
      field: 'weights',
      reason: WEIGHTS_CLAIM.justification,
    },
    {
      area: 'model-constant',
      subject: 'surroundings',
      field: 'shade share per answer',
      reason: SURROUNDINGS_CLAIM.justification,
    },
    {
      area: 'model-constant',
      subject: 'yield band',
      field: 'maxCrowdingYieldPenalty',
      reason: MAX_CROWDING_YIELD_PENALTY.justification,
    },
    {
      area: 'model-constant',
      subject: 'season pests',
      field: 'pestYieldLossAtFullPressure',
      reason: PEST_YIELD_LOSS_AT_FULL_PRESSURE.justification,
    },
    {
      area: 'model-constant',
      subject: 'tree',
      field: 'months in leaf',
      reason: LEAF_SEASON_CLAIM.justification,
    },
  )

  return gaps
}

export const gapsByArea = (gaps: readonly ProvenanceGap[]): ReadonlyMap<GapArea, number> => {
  const counts = new Map<GapArea, number>()
  for (const gap of gaps) counts.set(gap.area, (counts.get(gap.area) ?? 0) + 1)
  return counts
}
