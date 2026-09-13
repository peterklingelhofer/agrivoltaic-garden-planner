import type { CropId } from '../../types/ids'
import { NATIVE_RANGES } from './native-ranges.generated'

/**
 * Where Kew's checklist records a crop growing wild, and the three answers that are not two.
 *
 * `true` and `false` are the easy ones. The third is `null`, and keeping it is the whole point:
 * one catalogue binomial matched no accepted species in the checklist, and a garden whose
 * coordinates fall outside the region grid has no region to test against either. Collapsing
 * either case into `false` would print "not native here" over a plant nobody has checked, which
 * is a claim the checklist has not made
 */
export const nativeAreasOf = (cropId: CropId): readonly string[] | null =>
  NATIVE_RANGES[cropId as string] ?? null

export const isNativeIn = (cropId: CropId, botanicalArea: string | null): boolean | null => {
  if (botanicalArea === null) return null
  const areas = nativeAreasOf(cropId)
  return areas === null ? null : areas.includes(botanicalArea)
}
