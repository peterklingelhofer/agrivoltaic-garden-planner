import { clamp } from '../../data/util'
import type { Crop } from '../../types/crop'
import type { Bed } from '../../types/garden'
import type { LimitingFactor } from '../../types/recommend'
import type { Site } from '../../types/site'
import type { Fraction } from '../../types/units'
import { trapezoidMembership } from '../membership'

export interface SoilWaterOutcome {
  readonly passed: boolean
  readonly fit: Fraction
  readonly droughtPenalty: Fraction
  readonly limiting: LimitingFactor | null
}

/**
 * A pH envelope narrower than this is a real physiological constraint rather
 * than a preference, so it stays hard. Blueberry at 4.5 to 5.5 is the case
 */
export const HARD_PH_ENVELOPE_WIDTH = 2

export const MAX_DROUGHT_PENALTY = 0.35

/** The single test for "this crop's pH is physiology, not a preference" */
export const hardPhEnvelope = (crop: Crop): boolean =>
  crop.envelope.soilPh.absoluteMax - crop.envelope.soilPh.absoluteMin <= HARD_PH_ENVELOPE_WIDTH

export const hardPhConstraint = (crop: Crop, bed: Bed): boolean => {
  const envelope = crop.envelope.soilPh
  if (!hardPhEnvelope(crop)) return false
  return bed.soil.phUnits < envelope.absoluteMin || bed.soil.phUnits > envelope.absoluteMax
}

/**
 * Dryness at a water-limitation index of 0: the ramp on the graded index runs from here to 1
 */
export const DRYNESS_FLOOR = 0.4

export const drynessOf = (site: Site): number =>
  DRYNESS_FLOOR + (1 - DRYNESS_FLOOR) * clamp(site.waterLimitation.index, 0, 1)

/**
 * Crops with a low FAO-56 depletion fraction p deplete little of the available
 * soil water before they stress. They are the drought-sensitive ones, and also
 * exactly the crops that gain most from panel shade cutting evaporative demand
 */
export const droughtPenaltyFor = (crop: Crop, bed: Bed, site: Site): Fraction => {
  if (bed.irrigation.available) return 0 as Fraction
  const sensitivity = clamp((0.5 - crop.roots.depletionFraction) / 0.3, 0, 1)
  return (sensitivity * drynessOf(site) * MAX_DROUGHT_PENALTY) as Fraction
}

export const soilWaterStage = (crop: Crop, bed: Bed, site: Site): SoilWaterOutcome => {
  const phFit = trapezoidMembership(bed.soil.phUnits, crop.envelope.soilPh)
  const droughtPenalty = droughtPenaltyFor(crop, bed, site)

  if (hardPhConstraint(crop, bed)) {
    return {
      passed: false,
      fit: phFit,
      droughtPenalty,
      limiting: {
        stage: 'soil-water',
        cause: { kind: 'soil-ph' },
        membership: phFit,
        explanation: `This crop needs soil between pH ${crop.envelope.soilPh.absoluteMin.toFixed(1)} and ${crop.envelope.soilPh.absoluteMax.toFixed(1)}; this bed measures ${bed.soil.phUnits.toFixed(1)}`,
      },
    }
  }

  if (phFit === 0) {
    return {
      passed: false,
      fit: phFit,
      droughtPenalty,
      limiting: {
        stage: 'soil-water',
        cause: { kind: 'soil-ph' },
        membership: phFit,
        explanation: `Bed pH ${bed.soil.phUnits.toFixed(1)} is outside this crop's tolerated range`,
      },
    }
  }

  if (
    !bed.irrigation.available &&
    site.waterLimitation.limited &&
    crop.roots.depletionFraction <= 0.3
  ) {
    return {
      passed: true,
      fit: phFit,
      droughtPenalty,
      limiting: {
        stage: 'soil-water',
        cause: { kind: 'water' },
        membership: (1 - droughtPenalty) as Fraction,
        explanation: `Drought-sensitive crop with no irrigation on a site whose season deficit index is ${site.waterLimitation.index.toFixed(2)}. Panel shade cuts evaporative demand and doesn't replace watering`,
      },
    }
  }

  return { passed: true, fit: phFit, droughtPenalty, limiting: null }
}
