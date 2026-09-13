import { citedInferred, type Cited } from '../types/cited'
import type { BedLight } from '../types/light'
import type { Fraction } from '../types/units'

/**
 * What a bed's sky view factor implies about frost, said in words and never in degrees.
 *
 * Every bake computes a sky view factor per ground cell, because the diffuse light and the
 * ground-to-module inter-reflection both need it. The app's frost dates, its degree-days and its
 * chill all come from the site, in the open, identically for a bed under a panel and a bed in the
 * clear.
 *
 * That gap is worth closing because the mechanism is not in doubt. A surface loses heat at night
 * by radiating it to a cold sky, and how much sky it can see is the geometric control on how much
 * it loses: that is Oke's result for street canyons and it is why a frost cloth works. A panel row
 * over a bed is the same geometry. `the agrivoltaics document` section 3.6 reached this
 * conclusion and wrote the sentence to output; this is that sentence.
 *
 * What is deliberately NOT here, and will not be added without a measurement:
 *
 * - **No temperature.** No published source gives a frost-margin figure, in degrees or in damage
 *   incidence, for a bed under an agrivoltaic array. A number here would be invented.
 * - **No adjusted frost dates.** The site's frost exceedance curve is measured in the open and it
 *   stays that way. Shifting a planting date on an unmeasured mechanism would move real sowings.
 * - **No adjusted degree-days.** Shade cuts daytime warming as surely as it cuts night-time
 *   cooling, and the agrivoltaics document section 3.2 finds soil cooling under panels to be the one temperature
 *   effect that is consistent across studies while air-temperature effects contradict each other
 *   between climates. Anyone reading "fewer frosts" as "a longer, warmer season" has it backwards
 */

export type FrostShelter = 'open' | 'partial' | 'sheltered'

export interface FrostReading {
  readonly skyViewFactor: Fraction
  readonly shelter: FrostShelter
  /** The sentence a grower reads, which carries its own sourcing */
  readonly claim: Cited<string>
}

/**
 * Above this the bed is effectively under open sky and there is nothing worth saying; below the
 * lower bound it is meaningfully roofed. The two edges are ours: no source bands this, and the
 * underlying relationship is smooth, so they are a reporting threshold and not a finding
 */
export const OPEN_SKY_ABOVE = 0.85
export const SHELTERED_BELOW = 0.6

export const shelterOf = (skyViewFactor: number): FrostShelter =>
  skyViewFactor >= OPEN_SKY_ABOVE
    ? 'open'
    : skyViewFactor < SHELTERED_BELOW
      ? 'sheltered'
      : 'partial'

const percent = (value: number): string => `${Math.round(value * 100).toString()}%`

const BASIS =
  'Oke 1981 establishes the sky view factor as the geometric control on nocturnal longwave loss, for street canyons; Snyder and de Melo-Abreu separate radiative frost, which a cover between the ground and the sky reduces, from advective frost, which it does not. Neither is about panel rows, and neither supports a quantity here: a systematic search for a frost-margin figure under an agrivoltaic array found none in any accessible source. So this states the measured geometry and names the direction'

const CAVEAT =
  'No temperature and no shifted frost date is derived from this. The planting dates on this bed still come from the site frost curve, measured in the open, and the winter chill this app checks fruit and berries against is the site figure too: milder nights under a panel would reduce chill accumulation, and that is not modelled either'

const sentence = (skyViewFactor: number, shelter: FrostShelter): string => {
  const seen = percent(skyViewFactor)
  if (shelter === 'open')
    return `This bed sees ${seen} of the sky, which is open ground as far as frost is concerned. Nothing overhead is holding its heat in on a clear night`
  const strength = shelter === 'sheltered' ? 'much of' : 'some of'
  return `This bed sees ${seen} of the sky, so on a still clear night what is overhead holds in ${strength} its heat and the rest radiates away. A frost cloth works the same way. That should make a late spring or early autumn radiative frost a little less likely here than out in the open. It is no help against a cold air mass moving through, which is a different kind of frost. No temperature is claimed here, because nobody has published one for a garden under panels`
}

export const frostReading = (light: BedLight): FrostReading => {
  const skyViewFactor = light.skyViewFactor
  const shelter = shelterOf(skyViewFactor)
  return {
    skyViewFactor,
    shelter,
    claim: citedInferred(
      sentence(skyViewFactor, shelter),
      ['oke1981-canyon-svf', 'snyder2005-fao-frost-protection'],
      BASIS,
      CAVEAT,
    ),
  }
}
