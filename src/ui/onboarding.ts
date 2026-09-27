import { SURROUNDINGS_SHADE } from '../recommend/surroundings'
import type { OnboardingStep } from '../state/slices'
import type {
  DesignScenario,
  GrowingAmbition,
  MountingPreference,
  OnboardingAnswers,
  ScenarioFlags,
  SiteExposure,
} from '../types/onboarding'
import type { Fraction } from '../types/units'
import type { ChoiceOption } from './controls'

/* --------------------------------- measurement --------------------------------- */

/** Exactly, by the 1959 international definition of the foot */
export const FEET_PER_METER = 1 / 0.3048
export const SQUARE_FEET_PER_SQUARE_METER = FEET_PER_METER * FEET_PER_METER

export const metersToFeet = (meters: number): number => meters * FEET_PER_METER
export const feetToMeters = (feet: number): number => feet / FEET_PER_METER

/** A tenth of a foot is about 3 cm, which is finer than anyone measures a garden */
export const roundTenth = (value: number): number => Math.round(value * 10) / 10

export const formatBothUnits = (meters: number): string =>
  `${roundTenth(meters).toFixed(1)} m (${roundTenth(metersToFeet(meters)).toFixed(1)} ft)`

export const formatAreaBothUnits = (squareMeters: number): string =>
  `${squareMeters.toFixed(1)} m² (${Math.round(squareMeters * SQUARE_FEET_PER_SQUARE_METER).toFixed(0)} sq ft)`

/* ------------------------------------ steps ------------------------------------ */

export interface StepCopy {
  readonly title: string
  readonly help: string
}

/**
 * Not one of these asks anything you would have to read a paper to answer. Tilt, pitch,
 * ground cover ratio, clearance and daily light integral are all downstream of these
 * answers, and turning an answer into one of them is the design engine's job.
 *
 * Read by the agent, which asks the questions in these words. The sidebar's steps carry their
 * own titles
 */
export const STEP_COPY: Readonly<Record<OnboardingStep, StepCopy>> = {
  location: {
    title: 'Where is the space?',
    help: 'The site location informs how much sun reaches it and how long things can grow. Search for a town or address here. Exact coordinates can be set later, in the Site panel of the editor.',
  },
  space: {
    title: 'How big is it?',
    help: 'A rough rectangle is enough. Pace it out or measure the widest and the deepest points.',
  },
  surroundings: {
    title: 'What is already around it?',
    help: 'Buildings, fences and trees shade a space before any panel does, so this impacts how much sun the ground starts with.',
  },
  growing: {
    title: 'What would you like to grow?',
    help: 'Some crops do well in shade and others perform poorly, so this sets how much shade the layout may cast.',
  },
  objective: {
    title: 'What do you want most from it?',
    help: 'This decides the balance of how much of the sunlight goes to the plants and how much goes to the panels. It comes after the growing question because what you want to grow makes this one answerable.',
  },
  mounting: {
    title: 'How should the panels sit?',
    help: 'Where the panels stand decides where their shade falls, and how much of the space you can still walk and dig in.',
  },
  height: {
    title: 'Is there a height limit?',
    help: "The limit might come from a local rule, a neighbor's view, or what you're willing to look at. Leave it off and the layout uses whatever height suits the garden best.",
  },
  water: {
    title: 'Can you water it in a dry spell?',
    help: 'Shade keeps the ground damper for longer, so whether you can water changes which layout suits your situation.',
  },
  natives: {
    title: 'Favor plants that grow wild near you (native plants)?',
    help: 'A plant that grows wild where you live feeds the local insects. Saying yes moves those plants up the list in priority.',
  },
  pollinators: {
    title: 'Favor plants that feed bees and other pollinators?',
    help: 'Saying yes moves plants whose flowers feed bees, hoverflies and other pollinators up the list in priority. Every crop also indicates whether its own harvest needs an insect visit.',
  },
  results: {
    title: 'Layouts to compare',
    help: 'A few layouts side by side, including the space with no panels at all so you can see the impacts of having panels on site.',
  },
  planting: {
    title: 'What would you like in the beds?',
    help: "Each of these fills every bed at once. Each is a mix your beds can carry in the light they now get. Pick what you'd most like to eat or plant (this can be changed later).",
  },
}

/* ---------------------------------- the answers -------------------------------- */

export const AMBITION_OPTIONS: readonly ChoiceOption<GrowingAmbition>[] = [
  {
    value: 'leafy-and-herbs',
    label: 'Salad leaves and herbs',
    help: 'Lettuce, spinach, chard, parsley: picked young, and fine out of full sun',
  },
  {
    value: 'mixed-vegetables',
    label: 'A bit of everything',
    help: 'Roots, beans, brassicas and salad across the season',
  },
  {
    value: 'fruiting-and-berries',
    label: 'Tomatoes, peppers and berries',
    help: 'Crops that have to set fruit, and need the brightest spot you have',
  },
]

const shadePercent = (exposure: SiteExposure): string =>
  String(Math.round(SURROUNDINGS_SHADE[exposure] * 100))

/**
 * Why the surroundings question is asked before any panel exists, and what the answer does: it
 * dims the light every bed is judged by, from the one table the layout search spends its shade
 * budget from
 */
export const EXPOSURE_HELP = `Buildings, fences and trees shade a space before any panel does. Shaded for part of the day takes about ${shadePercent('partly-sheltered')}% off the light every bed gets, in shade most of the day takes ${shadePercent('overshadowed')}%`

export const EXPOSURE_OPTIONS: readonly ChoiceOption<SiteExposure>[] = [
  {
    value: 'open',
    label: 'Open sky all day',
    help: 'Nothing tall is close by: full sun from morning to evening',
  },
  {
    value: 'partly-sheltered',
    label: 'Shaded for part of the day',
    help: 'A house, a fence, or trees shade it for the morning or the evening',
  },
  {
    value: 'overshadowed',
    label: 'Shaded most of the day',
    help: 'Tall structures or trees block sun for most of the day',
  },
]

export const MOUNTING_OPTIONS: readonly ChoiceOption<MountingPreference>[] = [
  {
    value: 'any',
    label: 'No preference, suggest something',
    help: 'Display every possible arrangement to select from',
  },
  {
    value: 'overhead-canopy',
    label: 'Above the beds',
    help: 'You walk, plant and weed underneath them',
  },
  {
    value: 'ground-rows',
    label: 'In rows beside the beds',
    help: 'Lower and within reach, easier to clean and to build',
  },
  {
    value: 'vertical-bifacial',
    label: 'Upright, between the beds',
    help: 'They catch the morning and evening sun, and little of the midday sun',
  },
]

/**
 * The five questions the steps ask in these words. The controls are labeled from this table, so
 * these aren't a description of the questions: they ARE the questions, and anything reporting
 * one of these answers back quotes the entry directly, so no copy of it can be reworded on
 * one side only.
 *
 * Three of them are choices and read as questions. The last two are switches and read as
 * statements, because that is how a switch has to be labeled to say what checking it means
 */
export const ANSWER_QUESTIONS: Readonly<
  Record<'ambition' | 'exposure' | 'mounting' | 'maxHeightM' | 'irrigationAvailable', string>
> = {
  ambition: 'What would you like out of the beds?',
  exposure: 'What is already around the space?',
  mounting: 'How would you like the panels arranged?',
  maxHeightM: "There's a limit on how tall this can be",
  irrigationAvailable: 'I can water it through a dry spell',
}

export type Experience = OnboardingAnswers['experience']

/**
 * A switch that sits above the layout comparison. What it decides is how much the results show, so
 * it belongs where the results are, live enough to press back the moment it shows too much.
 *
 * Each option is a pill the width of its own label and its effect is visible the moment it is
 * pressed, so none of them carries a help line: the labels say what you get, because what
 * you get is the only thing this changes.
 *
 * Two of the three `Experience` values, and that is the honest count. `showsFigures` is what
 * every reader of this answer asks, and it splits the three into two: `some` shows a novice's
 * summary and always has. Offered as a middle pill it read as a middle amount of detail that
 * this product would then not deliver, so it's not offered. The value stays legal, and
 * anything already holding it still gets the plain summary it always got
 */
export const EXPERIENCE_OPTIONS: readonly ChoiceOption<Experience>[] = [
  { value: 'novice', label: 'Keep it plain' },
  { value: 'experienced', label: 'Show me the figures' },
]

export const OBJECTIVE_LABELS: Readonly<Record<string, string>> = {
  food: 'Food from the beds',
  energy: 'Electricity from the panels',
  water: 'Using less water',
  simplicity: 'Keeping it simple to build and look after',
}

/** The only thing `experience` hides is detail. A caveat is never detail */
export const showsFigures = (experience: Experience): boolean => experience === 'experienced'

/* ---------------------------------- the results -------------------------------- */

/** How much of today's light is left on the ground, which is the comparison that matters */
export const lightLeftSentence = (meanShadeRatio: Fraction): string =>
  `Lets roughly ${String(Math.round((1 - meanShadeRatio) * 100))}% of the light this plot gets hit the ground`

/**
 * The crops lost are measured against the open sky, which is baked first, so the number is
 * what the panels cost and never what the site can't grow. The control loses nothing by
 * construction, so it says what it is without reporting a zero
 */
export const cropSentence = (available: number, lost: number, baseline: boolean): string =>
  baseline
    ? `${String(available)} ${available === 1 ? 'crop' : 'crops'} in the catalog suit this space as it stands today, with nothing over it. This is the base option that every other option, which has more shade, is compared against.`
    : `${String(available)} ${available === 1 ? 'crop' : 'crops'} in the catalog would still suit this space, and ${String(lost)} that grow here with no panels would drop out`

/** A daylight point, and a twentieth of the electricity: a difference a grower can see */
const DAYLIGHT_CLEAR_POINTS = 1
const ENERGY_CLEAR_SHARE = 0.05

/**
 * The layouts with panels that keep at least as much daylight AND make at least as much
 * electricity as this one, one of the two clearly. The names say what each design tries for
 * and the figures say what it got on this plot, and the two disagree often enough to be asked
 * about: "Food first" kept 85 percent of the daylight beside a "Balanced" that kept 86, and an
 * "Energy first" kept more daylight than "Balanced" and made more electricity. A card that is
 * beaten on both counts says so, so nobody has to find it by reading five tabs
 */
export const beatenBy = (
  shown: DesignScenario,
  scenarios: readonly DesignScenario[],
): readonly DesignScenario[] => {
  const daylight = (entry: DesignScenario): number =>
    Math.round((1 - entry.light.meanShadeRatio) * 100)
  const energy = (entry: DesignScenario): number => entry.production.annualAcKwh as number
  return scenarios.filter(
    (other) =>
      other !== shown &&
      other.candidate.archetype !== 'no-array-control' &&
      daylight(other) >= daylight(shown) &&
      energy(other) >= energy(shown) &&
      (daylight(other) - daylight(shown) >= DAYLIGHT_CLEAR_POINTS ||
        energy(other) >= energy(shown) * (1 + ENERGY_CLEAR_SHARE)),
  )
}

/** The sentence under a beaten card's figures */
export const beatenSentence = (
  beaten: readonly DesignScenario[],
  suggested: boolean,
): string | null => {
  const first = beaten[0]
  if (first === undefined) return null
  const names = beaten.map((entry) => entry.candidate.label)
  const verb = beaten.length === 1 ? 'keeps' : 'keep'
  const make = beaten.length === 1 ? 'makes' : 'make'
  const lead = `${names.join(' and ')} ${verb} as much daylight and ${make} as much electricity as this layout on this plot, or more`
  if (!suggested) return lead
  return `${lead}. This one is suggested because the score also counts shade (which keeps the ground damp) and a simpler build`
}

/**
 * The land figure is a PORTFOLIO ratio: a whole basket of crops plus the electricity, each
 * measured against growing or generating that one thing alone on land of its own, summed.
 * It lands well above 1 and isn't a multiple of anyone's harvest, so it never appears
 * without this sentence and never appears in the novice summary at all
 */
export const PORTFOLIO_LABEL = 'Portfolio ratio, whole basket plus electricity'

export const PORTFOLIO_NOTE =
  "The portfolio ratio adds up every crop in the basket and the electricity, and compares the total with the land required to support it. A figure of 4 doesn't mean four times the food: it means the basket and the panels together would otherwise need about four times this much land"

/**
 * Nothing here reaches high confidence, because every option rests on provisional crop
 * light thresholds, so the scale isn't presented as if it could
 */
export const CONFIDENCE_CEILING =
  'Confidence goes no higher than moderate anywhere in this comparison: the crop light thresholds behind it are provisional. It drops to low where a layout tracks the sun, casts deeper shade than the published crop studies cover, or sits on a site short of water'

/**
 * Estimate language only. No regime is self-verifiable, so neither of these reads as a
 * determination and neither says whether anything is allowed.
 *
 * The regime is NAMED. "Meets the expedited design parameters" is a term of art from the
 * Massachusetts SMART dual-use program. On the card being chosen between, with no owner and no
 * gloss, it would leave a first-time grower unable to tell whether it's a law, a grant scheme or
 * this tool's own opinion, and it would measure a grower outside Massachusetts against a
 * Massachusetts yardstick without saying so. So the term of art is left out: what stays is whose
 * rules they are and, in plain words, what kind of rules they are. `CompliancePanel` and
 * `format.ts` carry the program's own words for anyone who needs to quote them
 */
export const clearanceNote = (flags: ScenarioFlags): string =>
  flags.meetsExpeditedClearance
    ? 'Panel height meets the Massachusetts fast-track rules for growing under panels'
    : 'Panel height would need an exception request under the Massachusetts fast-track rules for growing under panels'

// the second half of a pair, so it names the regime by reference, without repeating fifteen
// words of it directly under the line that has just said them. The miss spells out what an
// exception request is, in plain words, because the bare term alone doesn't say what it means
export const groundLightNote = (flags: ScenarioFlags): string =>
  flags.fiftyPercentEverywhere
    ? 'Ground light meets the same fast-track rules everywhere in the plot'
    : 'Part of the plot gets less than half its daylight. Under the same fast-track rules, a layout that misses one limit (height, spacing, or half the sunlight on every part of the ground) can still qualify through an exception request.'

const percent = (ratio: number): string => `${String(Math.round(ratio * 100))}%`

/**
 * The one flag here that is about the grower's own answer. It names
 * both numbers, because the interesting case is the one where the footprint was sized inside the
 * budget and the measured shade still came out over it, and a grower shown only the verdict would
 * have no way to see how that happened
 */
export const shadeBudgetNote = (flags: ScenarioFlags): string => {
  const { maxRatio, measuredRatio, withinBudget } = flags.shade
  const measured = `Over the growing season this takes about ${percent(measuredRatio)} of the light off the ground`
  return withinBudget
    ? `${measured}, within the ${percent(maxRatio)} the plants you asked for can tolerate`
    : `${measured}, more than the ${percent(maxRatio)} the plants you asked for can tolerate. The panels' footprint was sized to stay inside that limit. On a plot this size the rows sit close together, so their shade adds up to more than the footprint alone suggests. Expect the shade-sensitive plants on the list to do less well than the figures beside them say`
}

/**
 * The sentence that keeps every line above it honest, in words a first-time grower can read.
 *
 * The exact wording, "Estimated from the geometry alone and not a determination: only the program
 * itself determines anything", is opaque twice over: "the geometry" is the shapes and the sun, and
 * "the program" reads as this software, when it should mean the scheme whose rules are being
 * quoted. So the determination clause is said once for the whole app, in `SCOPE_STATEMENT` below,
 * and `onboarding.test.ts` reads it there
 */
export const NOT_A_DETERMINATION = 'An estimate from the shapes and the sun alone'

/**
 * The one caveat that covers the whole app. Everything else in this file and in `dli.ts` disclaims
 * one figure or one regime. This says, once, that the figures themselves are a model's output, for
 * a professional to check. Rendered at the top of Sources, unconditionally: per `showsFigures`
 * above, a caveat is never detail, so it isn't behind that gate, in a `<details>` or behind
 * anything else
 */
export const SCOPE_HEADLINE = 'Everything here is a planning estimate'

export const SCOPE_STATEMENT =
  'Every figure here comes out of a model of sun, shade and crop demand, run over the shapes you drew. Nothing on any panel is a determination of what a regulation permits, the compliance checks included. Before you spend money on any of this, take the plan to your local extension service, agriculture department or a qualified professional, and let them look at the site itself.'
