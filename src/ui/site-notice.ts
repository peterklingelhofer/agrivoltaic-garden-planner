import { SITE_PARTS, type SitePart } from '../data/site'
import { LIMED_BED_PH_MAX, LIMED_BED_PH_MIN } from '../recommend/stages/soil-water'
import type { AsyncState } from '../state/slices'
import { isMapSoil, type SoilProfile } from '../types/site'

const LOOKING_UP_EVERYTHING = 'Looking up the weather, soil and frost dates for this place…'

/** How a reader names each part */
const PART_WORDS: Readonly<Record<SitePart, string>> = {
  weather: 'weather',
  soil: 'soil',
  frost: 'frost dates',
}

/** Two parts joined by "and", three as a list, so all three read as the first sentence names them */
const named = (parts: readonly SitePart[]): string => {
  const words = parts.map((part) => PART_WORDS[part])
  if (words.length <= 2) return words.join(' and ')
  return `${words.slice(0, -1).join(', ')} and ${String(words.at(-1))}`
}

/**
 * The loading sentence. The requests run side by side and the slowest sets the pace, so once a part
 * has landed it says which are in and which are still out, and a reader can see the late one. Until
 * a part lands it names all three. An empty list means every part has reported and the lookup is
 * putting its answer together, which lasts a render or two before the notice leaves, so that
 * sentence says all three are in: it's the one a screen reader hears the lookup end on. Parts go in
 * the order `SITE_PARTS` has them, whatever order `pending` arrives in
 */
const lookingUpText = (pending: readonly SitePart[]): string => {
  const waiting = SITE_PARTS.filter((part) => pending.includes(part))
  const landed = SITE_PARTS.filter((part) => !pending.includes(part))
  if (landed.length === 0) return LOOKING_UP_EVERYTHING
  // "is" for one singular part, "are" for the plural frost dates or for two parts
  const verb = landed.length === 1 && landed[0] !== 'frost' ? 'is' : 'are'
  if (waiting.length === 0) return `The ${named(landed)} ${verb} ready.`
  return `The ${named(landed)} ${verb} ready. Still looking up the ${named(waiting)}…`
}

/**
 * The sentence the place lookup prints in each of its states, and null once it's ready.
 *
 * Apart from `SiteNotice` itself, because a caller has to be able to ask whether two notices would
 * say the same thing: the site panel shows the place and the weather, both written by the same
 * lookup, so one failure could print one message twice, and a doubled paragraph reads as the screen
 * glitching. The same holds for the loading sentence, which both build from the one `pending` list
 */
export const siteNoticeText = <T>(
  state: AsyncState<T>,
  idleLabel: string,
  pending: readonly SitePart[],
): string | null =>
  state.status === 'ready'
    ? null
    : state.status === 'error'
      ? state.message
      : state.status === 'loading'
        ? lookingUpText(pending)
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
 * The elevation readout where the weather record carried no height above sea level.
 *
 * The elevation arrives with the weather: every source answers with the height of the cell its
 * year was read from, so the readout names the record that was read. A record carrying none
 * leaves the sun's air mass on the sea-level reference, and the sentence says both
 */
export const elevationUnknownWords = (weatherRecord: string | null): string =>
  `${weatherRecord ?? 'The weather record'} has no elevation for this place, so the sun's path is computed at sea level`

/**
 * What the soil map answered, where it answered anything other than the point itself. SoilGrids
 * masks built-up ground, so the center of nearly every town has no reading and the nearest one
 * a few kilometers out stands in. The sentence says how far, so a reader knows it is the area's
 * soil. Null where the reading is the point's own or there is none
 */
export const soilSampledNote = (soil: { readonly sampledKm?: number }): string | null =>
  soil.sampledKm === undefined
    ? null
    : `Soil pH from the nearest map reading, about ${String(soil.sampledKm)} km away. Beds start from it until you type your own.`

/**
 * What a pH read off the soil map does to the ranking. The map gives the native soil's estimate
 * and a vegetable bed is usually limed, so a reading outside the limed band counts against a
 * crop that wants a different pH and never rules it out. Null for a typed value, the assumed
 * loam, or a map reading inside the band
 */
export const soilPhNote = (soil: Pick<SoilProfile, 'phUnits' | 'sourceId'>): string | null =>
  isMapSoil(soil) && (soil.phUnits < LIMED_BED_PH_MIN || soil.phUnits > LIMED_BED_PH_MAX)
    ? `The soil map reads pH ${soil.phUnits.toFixed(1)} here. Vegetable beds are usually limed to ${String(LIMED_BED_PH_MIN)} to ${String(LIMED_BED_PH_MAX)}, so this reading counts against a crop that wants a different pH without ruling it out. Type your bed's pH if you've tested it.`
    : null
