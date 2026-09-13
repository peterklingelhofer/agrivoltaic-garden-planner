import { isNativeIn } from '../data/catalog/native-ranges'
import type { Crop, PollinatorForage } from '../types/crop'
import type { Fraction } from '../types/units'

/**
 * What a grower asked for on the wildlife questions, and where their garden is.
 *
 * `botanicalArea` is a TDWG level 3 code sampled from the region grid at the site, or null when
 * the site is not resolved or falls off it. Null does not mean "no natives here": it means
 * nobody can say, and `wildlifeMatch` treats it that way
 */
export interface WildlifePreference {
  readonly favourNative: boolean
  readonly favourPollinators: boolean
  readonly botanicalArea: string | null
}

export const NO_WILDLIFE_PREFERENCE: WildlifePreference = {
  favourNative: false,
  favourPollinators: false,
  botanicalArea: null,
}

/** Forage runs on a scale and the middle of it is real: orchard blossom is not nothing */
const FORAGE_SCORE: Readonly<Record<PollinatorForage, number>> = { high: 1, some: 0.5, none: 0 }

/**
 * How well one crop answers the wildlife questions, or null when neither was asked.
 *
 * The mean of the terms the grower actually turned on, so asking for one thing is not diluted by
 * a second they did not ask for. A term the data cannot answer, which is a crop the checklist
 * has no accepted name for or a garden off the region grid, is dropped from the mean rather
 * than scored zero: a plant nobody has checked must not sink below one that was checked and
 * found to be introduced here
 */
export const wildlifeMatch = (crop: Crop, preference: WildlifePreference): Fraction | null => {
  const terms: number[] = []
  if (preference.favourNative) {
    const native = isNativeIn(crop.id, preference.botanicalArea)
    if (native !== null) terms.push(native ? 1 : 0)
  }
  if (preference.favourPollinators) terms.push(FORAGE_SCORE[crop.wildlife.forage.value])
  if (terms.length === 0) return null
  return (terms.reduce((total, term) => total + term, 0) / terms.length) as Fraction
}

export const asksAnything = (preference: WildlifePreference): boolean =>
  preference.favourNative || preference.favourPollinators
