import { banded, type Banded, interval } from '../types/band'
import type { OutcomeKind, PlantingOutcome, SeasonReport } from '../types/simulation'
import { approxPercent, percent } from './coach'
import { pestYieldLoss } from './pests'
import type { Fraction } from '../types/units'

/**
 * Seasons before a standing is read. Five, so one bad year can't be the verdict on a garden and
 * one good one can't be either. A rule of the mode, an integer with nothing measured behind it
 */
export const SEASONS_TO_STAND = 5

/**
 * The share of a full crop the beds must average for the panels to count as sharing the ground
 * with them. Without a floor the land equivalent ratio is won by covering every bed: the
 * electricity term of a dense array alone reaches 1.32, more than any crop costs it. With the
 * floor, the question the mode asks is the agrivoltaic one. Half, a rule this mode sets by design
 */
export const FOOD_FLOOR: Fraction = 0.5 as Fraction

export interface Standing {
  readonly seasons: number
  /** Mean harvest index over the seasons that had something in the ground, or null with none */
  readonly food: Fraction | null
  /** Mean electricity share over the seasons that had panels, or null with none */
  readonly energy: Fraction | null
  /**
   * The land equivalent ratio after Dupraz et al. 2011, the crop partial plus the electricity
   * partial, as the planner's own `landEquivalentRatio` forms it. A band, because the crop
   * partial is one: its bounds are the published bands the seasons carried per planting,
   * averaged the way `food` averages the draws, with the electricity partial added to each.
   * Null until both terms exist
   */
  readonly ler: Banded<number> | null
  readonly foodFloorHeld: boolean
  readonly complete: boolean
  readonly verdict: string
}

const mean = (values: readonly number[]): number | null =>
  values.length === 0 ? null : values.reduce((total, value) => total + value, 0) / values.length

/**
 * "1.1 to 1.4". One decimal, because a second decimal would sit inside the band's own width, and
 * one figure where the two bounds round the same
 */
export const lerWords = (ler: Banded<number>): string => {
  const low = ler.interval.lower.toFixed(1)
  const high = ler.interval.upper.toFixed(1)
  return low === high ? low : `${low} to ${high}`
}

/** Every distinct way a planting fell short, pooled over the reports `shortfallOf` was given */
export interface Shortfall {
  readonly rotation: number
  readonly climateSoil: number
  readonly frost: number
  readonly unripe: number
  readonly shade: number
  /** mean yield share lost to pests, over the plantings that were harvested */
  readonly pests: number
  /** mean yield share lost to dry soil, over the plantings that were harvested */
  readonly drought: number
  /** mean yield share left over once pests and drought are accounted for: the shade itself */
  readonly light: number
}

const shareOf = (outcomes: readonly PlantingOutcome[], kinds: readonly OutcomeKind[]): number =>
  outcomes.length === 0
    ? 0
    : outcomes.filter((outcome) => kinds.includes(outcome.kind)).length / outcomes.length

/**
 * How much of the planned harvest each cause cost, pooled over every report handed in.
 *
 * Five causes are read off what never grew at all: a rotation refusal, a climate or soil gate,
 * frost, a season too short to mature the crop, and shade under the crop's own light minimum,
 * each a share of every planting the seasons planned. The other two are read off what a
 * HARVESTED planting actually brought in: the published band for its shade already prices some
 * loss in, so pests and drought are subtracted first, and what is left over is that band's own
 * cost, which is the shade the panels cast
 */
export const shortfallOf = (reports: readonly SeasonReport[]): Shortfall => {
  const outcomes = reports.flatMap((report) => report.outcomes)
  const harvested = outcomes.filter((outcome) => outcome.kind === 'harvested')
  const meanOver = (of: (outcome: PlantingOutcome) => number): number =>
    mean(harvested.map(of)) ?? 0
  return {
    rotation: shareOf(outcomes, ['refused']),
    climateSoil: shareOf(outcomes, ['climate', 'soil']),
    frost: shareOf(outcomes, ['frosted']),
    unripe: shareOf(outcomes, ['unripe']),
    shade: shareOf(outcomes, ['too-dark']),
    pests: meanOver((outcome) => pestYieldLoss(outcome.pestPressure)),
    drought: meanOver((outcome) => outcome.droughtPenalty),
    light: meanOver((outcome) =>
      Math.max(
        0,
        1 - outcome.realized - pestYieldLoss(outcome.pestPressure) - outcome.droughtPenalty,
      ),
    ),
  }
}

type ShortfallCause = 'rotation' | 'frost' | 'unripe' | 'pests' | 'drought' | 'shade'

/** Rounded to a whole planting: "12 of 33 plantings a season" reads, "11.6 of 32.8" doesn't */
const perSeason = (total: number, seasons: number): number =>
  seasons === 0 ? 0 : Math.round(total / seasons)

const rotationVerdict = (reports: readonly SeasonReport[]): string => {
  const outcomes = reports.flatMap((report) => report.outcomes)
  const refused = outcomes.filter((outcome) => outcome.kind === 'refused').length
  return `Most of the loss was beds left empty by the rotation rule: ${String(perSeason(refused, reports.length))} of ${String(perSeason(outcomes.length, reports.length))} plantings a season on average. Give those crop families another bed, or plant an unrelated family there.`
}

const CAUSE_VERDICT: Readonly<Record<Exclude<ShortfallCause, 'rotation'>, string>> = {
  frost: 'Most of the loss was frost: sow later, harvest earlier, or choose hardier crops.',
  unripe:
    'Most of the loss was crops that ran out of season: pick faster ones or start them indoors.',
  pests: "Most of the loss was pests, which the shade doesn't change.",
  drought: 'Most of the loss was dry soil: water more, or catch the panel run-off.',
  shade: 'The panels shade the beds too much: open the rows, or move the beds out from under them.',
}

/**
 * Which cause the failing verdict names, the largest of the shares `shortfallOf` reads.
 *
 * A climate or soil gate has no sentence of its own: neither names the panels, and both are rare in
 * a plan already ranked against this place. `shade` is the tie-break winner, first in the list
 * below and standing in for the climate and soil gates too, so a plot with nothing yet to explain a
 * loss gets the shade sentence
 */
const dominantCause = (shortfall: Shortfall): ShortfallCause => {
  const ranked: readonly (readonly [ShortfallCause, number])[] = [
    ['shade', Math.max(shortfall.shade, shortfall.light, shortfall.climateSoil)],
    ['rotation', shortfall.rotation],
    ['frost', shortfall.frost],
    ['unripe', shortfall.unripe],
    ['pests', shortfall.pests],
    ['drought', shortfall.drought],
  ]
  return ranked.reduce((max, entry) => (entry[1] > max[1] ? entry : max))[0]
}

const shortfallVerdict = (reports: readonly SeasonReport[]): string => {
  const cause = dominantCause(shortfallOf(reports))
  return cause === 'rotation' ? rotationVerdict(reports) : CAUSE_VERDICT[cause]
}

/**
 * Where the garden stands after the seasons it has run.
 *
 * Read straight off the reports, and stated in this app's own terms: a crop partial
 * against the same crops unshaded, an electricity partial against a sole-use solar plant on the
 * same land, and their sum. The floor is what makes this a standing: without it, a solar farm wins
 * by default just by covering every bed
 */
export const standingOf = (reports: readonly SeasonReport[]): Standing => {
  const seasons = reports.length
  const food = mean(
    reports
      .map((report) => report.harvestIndex ?? null)
      .filter((value): value is Fraction => value !== null),
  ) as Fraction | null
  const energy = mean(
    reports
      // a report stored before the term existed carries no field at all, which isn't a share
      .map((report) => report.energyShare ?? null)
      .filter((value): value is Fraction => value !== null),
  ) as Fraction | null
  /*
    The crop partial's bounds: the published band at each planting's shade, averaged over every
    planting planned exactly as `harvestIndex` averages the draws, a planting that grew nothing
    counting as zero at both bounds. A report saved before outcomes carried a band reads as zero
    too, and only the seasons `food` counts are counted
  */
  const foodBound = (edge: 'lower' | 'upper'): number | null =>
    mean(
      reports
        .filter((report) => report.harvestIndex != null)
        .map(
          (report) =>
            mean(report.outcomes.map((outcome) => outcome.band?.interval[edge] ?? 0)) ?? 0,
        ),
    )
  const foodLower = foodBound('lower')
  const foodUpper = foodBound('upper')
  const ler =
    food === null || energy === null || foodLower === null || foodUpper === null
      ? null
      : banded(
          interval(foodLower + energy, foodUpper + energy),
          0.95,
          'confidence',
          'crop-response',
          [],
        )
  const foodFloorHeld = food !== null && food >= FOOD_FLOOR
  const complete = seasons >= SEASONS_TO_STAND
  /*
    Named, numbered and cited, in this app's own voice: the term a reader can search, the number
    beside it, the citation after the number, and the floor named as a rule this application sets,
    because it's one (see FOOD_FLOOR) and a sentence that hid that would be overclaiming
  */
  // says what is still waiting, because a bare "Results are read after 5 seasons" under a year that
  // has just printed its harvest reads as the harvest not counting
  const verdict = !complete
    ? `${String(seasons)} of ${String(SEASONS_TO_STAND)} seasons run. After ${String(SEASONS_TO_STAND)} the app says whether beds and panels together beat either one alone.`
    : food === null
      ? `${String(seasons)} seasons run with nothing in the ground. Plant something, then run them again.`
      : energy === null || ler === null
        ? `Over ${String(seasons)} seasons the beds averaged ${approxPercent(food)} of full yield. There are no panels on this plot, so there's no land equivalent ratio to report.`
        : foodFloorHeld
          ? `Over ${String(seasons)} seasons the beds averaged ${approxPercent(food)} of full yield. The panels made ${percent(energy)} of the electricity a solar farm on this land would. Land equivalent ratio ${lerWords(ler)} (Dupraz et al. 2011). Yield stayed above the ${percent(FOOD_FLOOR)} floor this app sets, so the panels share the ground.`
          : `Over ${String(seasons)} seasons the beds averaged ${approxPercent(food)} of full yield, below the ${percent(FOOD_FLOOR)} floor this app sets. The panels made ${percent(energy)} of the electricity a solar farm on this land would. ${shortfallVerdict(reports)}`
  return { seasons, food, energy, ler, foodFloorHeld, complete, verdict }
}
