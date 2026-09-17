import { unsourcedClaim } from '../types/cited'
import type { Obstruction } from '../types/garden'
import type { BedLight } from '../types/light'
import type { SiteExposure } from '../types/onboarding'
import type { ByMonth, Fraction, MolPerM2Day } from '../types/units'

/**
 * How much of the sky's light the things already around a space take before any panel does,
 * as a share of the open-sky figure, per answer to "What is already around the space?".
 *
 * One table for two readers. The layout search spends what is left of a crop's shade budget on
 * panels (`shadeBudgetFor` in `design.ts` scales the budget by one minus this), and every bed's
 * light is dimmed by the same share before the crop ranking reads it (`shadedBySurroundings`).
 * Without the second, a grower who said the space was in shade most of the day would get the same
 * crop list as one with open sky, because the light bake holds no house, fence or tree and nothing
 * else would apply the answer to the light.
 *
 * The shares are this app's own reading of the three answers, declared unsourced below so they
 * show on the sources step: a third of the day's light for a space shaded in the morning or the
 * evening, and three fifths for one something tall stands over for most of the day. They stand
 * in for shade that is never uniform in a real yard, which is what a three-answer question can
 * carry and no more; drawing the house is the upgrade
 */
export const SURROUNDINGS_SHADE: Readonly<Record<SiteExposure, Fraction>> = {
  open: 0 as Fraction,
  'partly-sheltered': 0.3 as Fraction,
  overshadowed: 0.6 as Fraction,
}

export const SURROUNDINGS_CLAIM = unsourcedClaim(
  SURROUNDINGS_SHADE,
  'The share of open-sky light taken by what already surrounds a space (0 for open sky, 0.3 for a space shaded part of the day, 0.6 for one in shade most of the day) is a design choice of this app: the question offers three answers and no source tabulates a light share for any of them',
  'It dims every bed’s light before the crop ranking reads it and shrinks the shade budget the layout search spends on panels, the light map on the ground shows the panels’ shade alone',
)

const scaled = (values: ByMonth<MolPerM2Day>, keep: number): ByMonth<MolPerM2Day> =>
  values.map((value) => (value * keep) as MolPerM2Day) as unknown as ByMonth<MolPerM2Day>

/**
 * A bed's light with the surroundings' share taken off it.
 *
 * The under-array figures are dimmed and the open-sky reference is left alone, so the relative
 * shade ratio compounds by itself: a bed the panels shade by a fifth in a space that already
 * loses a third reads as shaded by 1 - 0.8 x 0.7, which is the shade the plant stands in. The
 * open answer returns the same object, so a bake in open sky is not copied for nothing
 */
/**
 * Which answer the three-answer share actually reads: the grower's own, unless a house is
 * drawn. A drawn house is the answer to what is already around the space, so the share stands
 * only while nothing is drawn (Decision Record 26)
 */
export const exposureInForce = (
  obstructions: readonly Obstruction[],
  exposure: SiteExposure,
): SiteExposure => (obstructions.length > 0 ? 'open' : exposure)

export const shadedBySurroundings = (light: BedLight, exposure: SiteExposure): BedLight => {
  const share = SURROUNDINGS_SHADE[exposure]
  if (share === 0) return light
  const keep = 1 - share
  return {
    ...light,
    monthlyMeanDliMolM2Day: scaled(light.monthlyMeanDliMolM2Day, keep),
    monthlyMinDliMolM2Day: scaled(light.monthlyMinDliMolM2Day, keep),
    monthlyRsr: light.monthlyRsr.map(
      (rsr) => (1 - (1 - rsr) * keep) as Fraction,
    ) as unknown as ByMonth<Fraction>,
    annualMeanDliMolM2Day: (light.annualMeanDliMolM2Day * keep) as MolPerM2Day,
  }
}

const countWord = (count: number, singular: string, plural: string): string =>
  count === 1 ? `a ${singular}` : `${String(count)} ${plural}`

/**
 * What is drawn, read out: a house, a tree, or both, however many of each. "A house", "a tree",
 * "a house and a tree", "2 houses", "2 houses and a tree" (Decision Record 26)
 */
export const drawnPhrase = (obstructions: readonly Obstruction[]): string => {
  const houses = obstructions.filter((o) => o.kind === 'house').length
  const trees = obstructions.filter((o) => o.kind === 'tree').length
  const parts: string[] = []
  if (houses > 0) parts.push(countWord(houses, 'house', 'houses'))
  if (trees > 0) parts.push(countWord(trees, 'tree', 'trees'))
  return parts.join(' and ')
}

/**
 * The sentence the light step prints beside the figures. When something is drawn it names what is
 * drawn, since the drawing answers the surroundings question then. Otherwise it says what the
 * three-answer share (`SURROUNDINGS_SHADE`) took off the figures, when it took anything.
 *
 * Leads with `drawnPhrase` capitalised rather than "The" plus the phrase: `drawnPhrase` already
 * carries its own article or count ("a house", "2 houses"), and "The" in front of that doubles
 * the determiner ("The a house you drew")
 */
export const surroundingsNote = (
  exposure: SiteExposure,
  obstructions: readonly Obstruction[],
): string | null => {
  if (obstructions.length > 0) {
    const phrase = drawnPhrase(obstructions)
    const capitalised = phrase.charAt(0).toUpperCase() + phrase.slice(1)
    const shades = obstructions.length === 1 ? 'shades' : 'shade'
    return `${capitalised} you drew ${shades} every figure here and the map on the ground. Your answer to what is around the space isn't applied while a house or a tree is drawn.`
  }
  const share = SURROUNDINGS_SHADE[exposure]
  if (share === 0) return null
  const percent = String(Math.round(share * 100))
  const answer =
    exposure === 'overshadowed' ? 'in shade most of the day' : 'shaded for part of the day'
  return `Your answer that the space is ${answer} takes about ${percent}% off every figure here before the panels do. The map on the ground shows the panels' shade alone.`
}
