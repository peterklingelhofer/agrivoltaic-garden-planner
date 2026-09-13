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
 * What a wildlife switch or a like, must-have or never pick changed on a bed's own ranking, said
 * once the change has landed rather than left for a visitor to notice by comparing two screens.
 *
 * `cause` is already the sentence's own opening clause ("Flowers for bees on", "Prefer tomato"),
 * computed from whichever input actually changed; this only ever compares the two id lists it
 * is handed. Two sentences when something moved, because the reminder that the beds themselves
 * are untouched only means anything once there's a move to react to; one when there isn't
 */
export const choicesEffectSentence = (
  cause: string,
  bedLabel: string,
  before: readonly CropId[],
  after: readonly CropId[],
  catalog: readonly Crop[],
): string => {
  const wasIn = new Set<string>(before)
  const isIn = new Set<string>(after)
  const movedIn = after.filter((id) => !wasIn.has(id))
  const movedOut = before.filter((id) => !isIn.has(id))
  const topLabel = `the top ${String(after.length)} for ${bedLabel}`

  if (movedIn.length === 0 && movedOut.length === 0) {
    const reordered = before.length !== after.length || before.some((id, i) => id !== after[i])
    return `${cause}: ${topLabel} are ${reordered ? 'the same plants, in a different order' : 'unchanged'}`
  }

  const names = (ids: readonly CropId[]): string =>
    joinWords(ids.map((id) => cropName(catalog, id)))
  const sentences = [
    movedIn.length === 0 ? '' : `${names(movedIn)} moved into ${topLabel}`,
    movedOut.length === 0 ? '' : `${names(movedOut)} moved out`,
  ].filter((sentence) => sentence !== '')
  return `${cause}: ${sentences.join('; ')}. The beds keep what's planted until you replant.`
}
