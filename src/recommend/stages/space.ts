import { clamp } from '../../data/util'
import { unsourcedClaim } from '../../types/cited'
import type { Crop } from '../../types/crop'
import type { Bed, CanopyTier } from '../../types/garden'
import type { PvArray } from '../../types/pv'
import type { LimitingFactor } from '../../types/recommend'
import type { Fraction } from '../../types/units'

export interface SpaceOutcome {
  readonly passed: boolean
  readonly tier: CanopyTier
  readonly crowdingIndex: number
  readonly shadesPanels: boolean
  readonly limiting: LimitingFactor | null
}

/** Fraction of the array clearance height a plant may reach before it shades the modules */
export const PANEL_SHADING_HEIGHT_FRACTION = 0.85

/**
 * The most crowding at catalog spacing may cost a crop, declared unsourced so it appears in the
 * provenance ledger: no work in the corpus measures a garden bed's yield against its planting
 * density, and the index it scales is this app's own too
 */
export const MAX_CROWDING_YIELD_PENALTY = unsourcedClaim(
  0.45 as Fraction,
  'The most that crowding may cost a crop, 45 percent at a crowding index of 2, is this app’s own figure. No cited source measures a garden bed’s yield against its planting density. The crowding index is this app’s own as well: the overlap of catalog spacings plus the bed’s own area limit',
  'One curve for every crop, density responses differ by crop and none is tabulated here',
)

/**
 * The soil depth below which a crop's roots are refused outright, in meters.
 *
 * A crop's `maxEffectiveDepthM` is FAO-56 Table 22's Zr, the effective rooting depth for
 * water-balance work, and the table's own note says the smaller values apply in restricted
 * soils: it's not a minimum soil depth, and tomatoes grow in 30 cm of soil. So a bed shallower
 * than the roots would reach LIMITS a crop, which the ranking reports as marginal with the reason,
 * and only a bed shallower than this refuses it (Decision Record 16). A tray of seed compost isn't
 * a bed
 */
export const ROOT_DEPTH_FLOOR_M = 0.2

export const matureWidthAt = (crop: Crop, targetYear: number): number => {
  const years = crop.footprint.yearsToMature
  if (years === null || years <= 0) return crop.footprint.widthM.typicalM
  const progress = clamp(targetYear / years, 0.15, 1)
  return crop.footprint.widthM.typicalM * progress
}

export const matureHeightAt = (crop: Crop, targetYear: number): number => {
  const years = crop.footprint.yearsToMature
  if (years === null || years <= 0) return crop.footprint.heightM.typicalM
  const progress = clamp(targetYear / years, 0.15, 1)
  return crop.footprint.heightM.typicalM * progress
}

/**
 * Each plant is an exclusion disc of radius spacing/2. The index is the share
 * of a plant's own area that its neighbors overlap when the bed is filled at
 * catalog spacing, so 0 means no overlap
 */
export const crowdingIndex = (crop: Crop, bed: Bed): number => {
  const spacingM = crop.spacing.equidistantCm / 100
  if (spacingM <= 0) return 0
  const ownArea = Math.PI * (spacingM / 2) ** 2
  const canopyArea = Math.PI * (crop.footprint.widthM.typicalM / 2) ** 2
  const overlap = Math.max(canopyArea - ownArea, 0)
  const areaLimit = bed.areaM2 <= 0 ? 1 : Math.max(spacingM ** 2 / bed.areaM2, 0)
  return clamp(overlap / ownArea + areaLimit, 0, 2)
}

export const crowdingYieldPenalty = (index: number): Fraction =>
  (clamp(index / 2, 0, 1) ** 0.8 * MAX_CROWDING_YIELD_PENALTY.value) as Fraction

const clearanceOf = (arrays: readonly PvArray[]): number => {
  let lowest = Number.POSITIVE_INFINITY
  for (const array of arrays) lowest = Math.min(lowest, array.geometry.clearanceHeightM)
  return Number.isFinite(lowest) ? lowest : Number.POSITIVE_INFINITY
}

/**
 * TEK (traditional ecological knowledge) rule 1, vertical stratification: two to four explicit
 * tiers keyed to the light level under the array. Tier follows mature height relative to the array
 * clearance
 */
export const assignCanopyTier = (crop: Crop, arrays: readonly PvArray[]): CanopyTier => {
  const height = crop.footprint.heightM.typicalM
  const clearance = clearanceOf(arrays)
  if (Number.isFinite(clearance) && height >= clearance) return 'overstory'
  if (height >= 2) return 'mid-canopy'
  if (height >= 0.6) return 'shrub'
  return 'herb-ground'
}

export const spaceStage = (
  crop: Crop,
  bed: Bed,
  arrays: readonly PvArray[],
  targetYear: number,
): SpaceOutcome => {
  const tier = assignCanopyTier(crop, arrays)
  const index = crowdingIndex(crop, bed)
  const width = matureWidthAt(crop, targetYear)
  const height = matureHeightAt(crop, targetYear)
  const clearance = clearanceOf(arrays)
  const shadesPanels = Number.isFinite(clearance)
    ? height > clearance * PANEL_SHADING_HEIGHT_FRACTION
    : false

  const footprintArea = Math.PI * (width / 2) ** 2
  if (footprintArea > bed.areaM2) {
    return {
      passed: false,
      tier,
      crowdingIndex: index,
      shadesPanels,
      limiting: {
        stage: 'space-structure',
        cause: { kind: 'footprint' },
        membership: clamp(bed.areaM2 / Math.max(footprintArea, 0.01), 0, 1) as Fraction,
        explanation: `At year ${String(targetYear)} this crop spreads to about ${width.toFixed(1)} m across, more than the ${bed.areaM2.toFixed(1)} square meter bed can hold`,
      },
    }
  }

  const effectiveDepth = Math.min(bed.soil.effectiveDepthM + bed.raisedHeightM, 99)
  if (crop.roots.maxEffectiveDepthM > effectiveDepth) {
    const shallow = effectiveDepth < ROOT_DEPTH_FLOOR_M
    return {
      passed: !shallow,
      tier,
      crowdingIndex: index,
      shadesPanels,
      limiting: {
        stage: 'space-structure',
        cause: { kind: 'root-depth' },
        membership: clamp(effectiveDepth / crop.roots.maxEffectiveDepthM, 0, 1) as Fraction,
        explanation: shallow
          ? `This bed offers ${effectiveDepth.toFixed(2)} m of soil, less than the ${ROOT_DEPTH_FLOOR_M.toFixed(2)} m minimum for a bed, and roots would reach ${crop.roots.maxEffectiveDepthM.toFixed(2)} m in deep soil`
          : `Roots would reach ${crop.roots.maxEffectiveDepthM.toFixed(2)} m in deep soil and this bed offers ${effectiveDepth.toFixed(2)} m, so it will need watering more often`,
      },
    }
  }

  return { passed: true, tier, crowdingIndex: index, shadesPanels, limiting: null }
}
