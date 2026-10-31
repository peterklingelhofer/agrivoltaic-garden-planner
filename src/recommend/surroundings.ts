import { clamp } from '../data/util'
import { unsourcedClaim } from '../types/cited'
import type { Obstruction } from '../types/garden'
import type { BedLight } from '../types/light'
import type { OnboardingAnswers, SiteExposure } from '../types/onboarding'
import type { ByMonth, Fraction, MolPerM2Day } from '../types/units'

/**
 * How much of the sky's light the things already around a space take before any panel does,
 * as a share of the open-sky figure, per answer to "What is already around the space?".
 *
 * One table for two readers. The layout search spends what is left of a crop's shade budget on
 * panels (`shadeBudgetFor` in `design.ts` scales the budget by one minus this), and every bed's
 * light is dimmed by the same share before the crop ranking reads it (`shadedBySurroundings`).
 * Without the second, a grower who said the space was in shade most of the day would get the same
 * crop list as one with open sky, because the light bake holds only the houses and trees that are
 * drawn, and nothing else would apply the answer to the light.
 *
 * The shares are this app's own reading of the three answers, declared unsourced below so they
 * show on the sources step: a third of the day's light for a space shaded in the morning or the
 * evening, and three fifths for one something tall stands over for most of the day. They stand
 * in for shade that is never uniform in a real yard, which is what a three-answer question can
 * carry and no more. Drawing the house is the upgrade.
 *
 * A figure the person types stands in for the three cards (`surroundingsShare`), and the claim
 * below stays with the cards: their shares are this app's, and a typed figure is the person's own
 */
export const SURROUNDINGS_SHADE: Readonly<Record<SiteExposure, Fraction>> = {
  open: 0 as Fraction,
  'partly-sheltered': 0.3 as Fraction,
  overshadowed: 0.6 as Fraction,
}

export const SURROUNDINGS_CLAIM = unsourcedClaim(
  SURROUNDINGS_SHADE,
  'The share of open-sky light taken by what already surrounds a space (0 for open sky, 0.3 for a space shaded part of the day, 0.6 for one in shade most of the day) is a design choice of this app: the question offers three answers and no source tabulates a light share for any of them',
)

const scaled = (values: ByMonth<MolPerM2Day>, keep: number): ByMonth<MolPerM2Day> =>
  values.map((value) => (value * keep) as MolPerM2Day) as unknown as ByMonth<MolPerM2Day>

/** The two answers to what is already around the space: a card, and a figure that overrides it */
type SurroundingsAnswers = Pick<OnboardingAnswers, 'exposure' | 'surroundingsShadePercent'>

/**
 * The share the grower's answer takes: their typed figure over 100, held to 0 to 1, when they
 * typed one, or the card's share from the table above
 */
export const surroundingsShare = (answers: SurroundingsAnswers): Fraction =>
  answers.surroundingsShadePercent === null
    ? SURROUNDINGS_SHADE[answers.exposure]
    : (clamp(answers.surroundingsShadePercent / 100, 0, 1) as Fraction)

/**
 * Which answers the share actually reads: the grower's own, card or figure, unless a house is
 * drawn. A drawn house is the answer to what is already around the space, so the answers stand
 * only while nothing is drawn (Decision Record 26). With one drawn they read as open sky and no
 * figure, which is what the layout search is handed
 */
export const answersInForce = <T extends SurroundingsAnswers>(
  obstructions: readonly Obstruction[],
  answers: T,
): T =>
  obstructions.length > 0
    ? { ...answers, exposure: 'open', surroundingsShadePercent: null }
    : answers

/** The share the answers in force take: 0 while anything is drawn, the grower's share otherwise */
export const surroundingsInForce = (
  obstructions: readonly Obstruction[],
  answers: SurroundingsAnswers,
): Fraction => surroundingsShare(answersInForce(obstructions, answers))

/**
 * A bed's light with the surroundings' share taken off it.
 *
 * The under-array figures are dimmed and the open-sky reference is left alone, so the dimmed
 * figures carry the compounded shade: a bed the panels shade by a fifth in a space that already
 * loses three tenths reads as shaded by 1 - 0.8 x 0.7, which is the shade the plant stands in.
 * `monthlyBakedMeanDliMolM2Day` stays as the bake left it, the panels and anything drawn, so the
 * design ceiling reads that share on its own. A share of 0 returns the same object, so a bake in
 * open sky isn't copied for nothing
 */
export const shadedBySurroundings = (light: BedLight, share: Fraction): BedLight => {
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
 * grower's answer took off the figures, when it took anything: their typed figure as they typed
 * it, or the three-answer card's share (`SURROUNDINGS_SHADE`).
 *
 * Leads with `drawnPhrase` capitalized: `drawnPhrase` already
 * carries its own article or count ("a house", "2 houses"), and "The" in front of that doubles
 * the determiner ("The a house you drew")
 */
export const surroundingsNote = (
  answers: SurroundingsAnswers,
  obstructions: readonly Obstruction[],
): string | null => {
  if (obstructions.length > 0) {
    const phrase = drawnPhrase(obstructions)
    const capitalized = phrase.charAt(0).toUpperCase() + phrase.slice(1)
    const shades = obstructions.length === 1 ? 'shades' : 'shade'
    return `${capitalized} you drew ${shades} every figure here and the map on the ground. Your answer to what is around the space isn't applied while a house or a tree is drawn.`
  }
  const share = surroundingsShare(answers)
  if (share === 0) return null
  if (answers.surroundingsShadePercent !== null) {
    const typed = String(Math.round(answers.surroundingsShadePercent))
    return `Your figure of ${typed}% shade takes ${typed}% off every figure here before the panels do. The map on the ground shows the panels' shade alone.`
  }
  const percent = String(Math.round(share * 100))
  const answer =
    answers.exposure === 'overshadowed' ? 'in shade most of the day' : 'shaded for part of the day'
  return `Your answer that the space is ${answer} takes about ${percent}% off every figure here before the panels do. The map on the ground shows the panels' shade alone.`
}
