import type { AsyncState } from '../state/slices'

/**
 * The sentence the place lookup prints in each of its states, and null once it is ready.
 *
 * Apart from `SiteNotice` itself, because a caller has to be able to ask whether two notices would
 * say the same thing: the site panel shows the place and the weather, both written by the same
 * lookup, so one failure could print one message twice, and a doubled paragraph reads as the screen
 * glitching
 */
export const siteNoticeText = <T>(
  state: AsyncState<T>,
  idleLabel: string,
  locationLabel: string,
): string | null =>
  state.status === 'ready'
    ? null
    : state.status === 'error'
      ? state.message
      : state.status === 'loading'
        ? `Looking up the weather, soil and frost dates for ${locationLabel}…`
        : idleLabel

/**
 * The upstream sentence arrives lowercase ("the weather service has answered..."), which reads
 * right after a colon and wrong at the head of a paragraph on its own
 */
export const capitalizeSentence = (sentence: string): string =>
  sentence.length === 0 ? sentence : `${sentence.charAt(0).toUpperCase()}${sentence.slice(1)}`

/**
 * A wait, in the unit a reader would use for it. Seconds while a minute is in sight, minutes
 * for the rest of an hour, hours and minutes beyond that: Open-Meteo refusing for the day comes
 * back after midnight UTC, and "Trying again in 31,260 s" is a number nobody can read as a time
 */
export const waitLabel = (seconds: number): string => {
  if (seconds < 90) return `${String(seconds)} s`
  const minutes = Math.ceil(seconds / 60)
  if (minutes < 90) return `${String(minutes)} min`
  const hours = Math.floor(minutes / 60)
  const rest = minutes - hours * 60
  return rest === 0 ? `${String(hours)} h` : `${String(hours)} h ${String(rest)} min`
}

/**
 * What the soil map answered, where it answered anything other than the point itself. SoilGrids
 * masks built-up ground, so the centre of nearly every town has no reading and the nearest one
 * a few kilometres out stands in; the sentence says how far, so a reader knows it is the area's
 * soil and not the garden's. Null where the reading is the point's own or there is none
 */
export const soilSampledNote = (soil: { readonly sampledKm?: number }): string | null =>
  soil.sampledKm === undefined
    ? null
    : `The soil map has no reading at this exact spot, so the pH comes from the nearest reading, about ${String(soil.sampledKm)} km away. Every bed starts from it until you type your own soil.`
