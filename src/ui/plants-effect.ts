import type { Crop } from '../types/crop'
import type { CropId } from '../types/ids'
import { cropName } from './format'
import { joinWords } from './polyculture'

/**
 * How many of a bed's ranked crops count as its suggestion list, for want of a narrower count: the
 * number of combination cards a bed actually shows depends on how many fit it, so there's no fixed
 * count to read that off, and eight is this readout's own choice
 */
export const CHOICES_EFFECT_TOP_N = 8

/**
 * How many of the catalog's plants Kew's checklist records growing wild here, said as its own
 * sentence so a switch that moved nothing still has something to show for itself.
 *
 * Named outright at three or fewer, since a grower reads three names faster than a number. Past
 * that, the count alone is plainer than a list long enough to lose track of
 */
export const nativeCountSentence = (
  nativeCropIds: readonly CropId[],
  catalog: readonly Crop[],
): string => {
  const total = String(catalog.length)
  if (nativeCropIds.length === 0) {
    return `None of the ${total} plants in the catalog grow wild around here.`
  }
  if (nativeCropIds.length <= 3) {
    const names = joinWords(nativeCropIds.map((id) => cropName(catalog, id)))
    const verb = nativeCropIds.length === 1 ? 'grows' : 'grow'
    return `Only ${names}, of the ${total} plants in the catalog, ${verb} wild around here.`
  }
  return `${String(nativeCropIds.length)} of the ${total} plants in the catalog grow wild around here.`
}

/**
 * What a wildlife switch or a like, must-have or never pick changed on a bed's own ranking, said
 * once the change has landed, without leaving it for a visitor to notice by comparing two screens.
 *
 * `cause` is already the sentence's own opening clause ("Flowers for bees on", "Prefer tomato"),
 * computed from whichever input actually changed. This only ever compares the two id lists it
 * is handed. Two sentences when something moved, because the reminder that the beds themselves
 * are untouched only means anything once there's a move to react to. One when there isn't.
 *
 * `nativeCropIds` carries the catalog's own native crops for the site's area, passed only when
 * the change was the natives switch turning on. With nothing moved for it to show, it says how
 * many of the catalog grow wild here instead, so the switch never reads as one that failed
 */
export const choicesEffectSentence = (
  cause: string,
  bedLabel: string,
  before: readonly CropId[],
  after: readonly CropId[],
  catalog: readonly Crop[],
  nativeCropIds: readonly CropId[] | null = null,
): string => {
  const wasIn = new Set<string>(before)
  const isIn = new Set<string>(after)
  const movedIn = after.filter((id) => !wasIn.has(id))
  const movedOut = before.filter((id) => !isIn.has(id))
  const topLabel = `the top ${String(after.length)} for ${bedLabel}`

  if (movedIn.length === 0 && movedOut.length === 0) {
    const reordered = before.length !== after.length || before.some((id, i) => id !== after[i])
    const headline = `${cause}: ${topLabel} are ${reordered ? 'the same plants, in a different order' : 'unchanged'}`
    return nativeCropIds === null
      ? headline
      : `${headline}. ${nativeCountSentence(nativeCropIds, catalog)}`
  }

  const names = (ids: readonly CropId[]): string =>
    joinWords(ids.map((id) => cropName(catalog, id)))
  const sentences = [
    movedIn.length === 0 ? '' : `${names(movedIn)} moved into ${topLabel}`,
    movedOut.length === 0 ? '' : `${names(movedOut)} moved out`,
  ].filter((sentence) => sentence !== '')
  return `${cause}: ${sentences.join(', and ')}. The beds keep what's planted until you replant.`
}
