import type { GardenPlot } from '../types/garden'
import type { BedId } from '../types/ids'
import type {
  Advice,
  OutcomeKind,
  PlantingOutcome,
  SeasonReport,
  YearSummary,
} from '../types/simulation'

/** What happened to a planting, in two or three words, for every surface that names it */
export const OUTCOME_LABEL: Readonly<Record<OutcomeKind, string>> = {
  refused: 'not planted, rotation rule',
  climate: 'not planted, climate limit',
  soil: 'not planted, soil limit',
  frosted: 'lost to frost',
  unripe: "didn't mature in time",
  'too-dark': "below the crop's light minimum",
  unlit: 'light not simulated yet',
  harvested: 'harvested',
}

const bedLabel = (plot: GardenPlot, bedId: BedId): string =>
  plot.beds.find((bed) => bed.id === bedId)?.label ?? 'a bed that is no longer here'

/**
 * The two numbers this mode says out loud, formatted once. Exported so the panel says both of them
 * the same way: "62%" beside "62 %" is the sort of drift a shared helper ends
 */
export const percent = (value: number): string => `${String(Math.round(value * 100))}%`

/**
 * A harvest share to the nearest five percent. A season's harvest is one random draw inside a
 * published band, and "62%" reads as a measurement of something. "about 60%" reads as the draw it
 * is, with the band beside it. The rounding is shared here so the panel's formatting, the
 * explanation the season writes and the verdict it gives all agree
 */
export const nearestFivePercent = (value: number): number => Math.round(value * 20) * 5

export const approxPercent = (value: number): string =>
  `about ${String(nearestFivePercent(value))}%`

/** Thousands separated, without asking the browser for a locale the rest of the copy is not in */
const grouped = (value: number): string =>
  String(Math.round(value)).replace(/\B(?=(\d{3})+(?!\d))/g, ',')

export const kwh = (value: number): string => `${grouped(value)} kWh`

/** Rain in the unit a gardener in the United States reads it in, beside the millimetres */
export const inches = (mm: number): string => (mm / 25.4).toFixed(mm >= 254 ? 0 : 1)

/**
 * How many digits of a dollar figure this mode is entitled to say out loud.
 *
 * Two, because every money figure here is an end of a band read off a national benchmark for
 * systems a hundred times a garden's size (`data/economy.ts`). "$4,712" reads as a quote somebody
 * could be held to; "$4,700" reads as the guess it is, and the rounding is visible on the page
 */
const MONEY_FIGURES = 2

const toSignificantFigures = (value: number, figures: number): number => {
  if (!Number.isFinite(value) || value === 0) return 0
  const step = 10 ** (Math.floor(Math.log10(Math.abs(value))) - figures + 1)
  return Math.round(value / step) * step
}

/**
 * A sum in the currency it was typed or published in, no cents, rounded to what the source
 * supports, for every money figure this mode says. The runtime writes the symbol and the
 * grouping; a code it has no format for is written as the code itself before the figure
 */
export const money = (amount: number, currency: string): string => {
  const value = Number.isFinite(amount) ? amount : 0
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency,
      maximumSignificantDigits: MONEY_FIGURES,
    }).format(value)
  } catch {
    return `${currency} ${grouped(toSignificantFigures(value, MONEY_FIGURES))}`
  }
}

/**
 * A year of electricity to the same two figures, and "about" to say so: the figure is a model chain
 * run on a typical weather year, and "4,120 kWh" reads as a meter reading
 */
export const approxKwh = (value: number): string =>
  `about ${grouped(toSignificantFigures(value, MONEY_FIGURES))} kWh`

/**
 * One season, in one line, for the record of every season run.
 *
 * The same three facts the readouts give for the newest season, so a grower comparing season 4
 * against season 1 is comparing like with like, and the tail names what went wrong: a count of
 * what did not come in, and the commonest reason, which is the thing a changed layout is
 * supposed to move
 */
export const seasonLine = (report: SeasonReport): string => {
  const lost = report.outcomes.filter((outcome) => outcome.kind !== 'harvested')
  const commonest = lost.reduce<Record<string, number>>((tally, outcome) => {
    tally[outcome.kind] = (tally[outcome.kind] ?? 0) + 1
    return tally
  }, {})
  const worst = Object.entries(commonest).sort(([, a], [, b]) => b - a)[0]
  return [
    report.harvestIndex === null
      ? 'nothing in the ground'
      : `${approxPercent(report.harvestIndex)} of full yield`,
    report.energyKwh === null ? null : approxKwh(report.energyKwh),
    // label first: "not planted, climate limit (2 of 5)" reads, and "2 of 5 not planted" does not
    worst === undefined
      ? null
      : `${OUTCOME_LABEL[worst[0] as OutcomeKind]} (${String(worst[1])} of ${String(report.outcomes.length)})`,
  ]
    .filter((part) => part !== null)
    .join(', ')
}

/**
 * One sentence about what to do next, read off the season itself.
 *
 * A scripted tutorial goes stale the first time the rules move and then teaches the previous
 * game. Every branch here names a state that is true of the season just run, so when a rule
 * changes the sentence stops firing on its own. The branches are in the order a grower would
 * look at them: what the ground refused, what the weather took, what the panels took, what the
 * pests took, and only then how it went. The last branch is a status line and not an
 * instruction, because a mode that always has an instruction for you is one you are not yet
 * practising in
 */
export const advise = (
  outcomes: readonly PlantingOutcome[],
  year: YearSummary,
  plot: GardenPlot,
  harvestIndex: number | null,
  energyKwh: number | null,
): Advice => {
  if (outcomes.length === 0) {
    return {
      id: 'plant',
      text: 'Nothing is planted. Put a crop in a bed on the plants step, then run a season here.',
      bedId: null,
    }
  }
  const of = (kind: OutcomeKind): readonly PlantingOutcome[] =>
    outcomes.filter((outcome) => outcome.kind === kind)

  const refused = of('refused')[0]
  if (refused !== undefined) {
    return {
      id: 'refused',
      text: `A rotation rule blocked a planting in ${bedLabel(plot, refused.bedId)}. ${refused.explanation}. Move that crop family to another bed, or plant an unrelated family there.`,
      bedId: refused.bedId,
    }
  }

  const frosted = of('frosted')
  if (frosted.length > 0) {
    const first = frosted[0]
    return {
      id: 'frosted',
      text: `${String(frosted.length)} planting${frosted.length === 1 ? '' : 's'} lost to frost. The last spring frost fell on day ${String(year.lastSpringFreeze)} and the first fall frost on day ${String(year.firstFallFreeze)}. Sow later, harvest earlier, or choose a frost-hardy crop.`,
      bedId: first?.bedId ?? null,
    }
  }

  const unripe = of('unripe')
  if (unripe.length > 0) {
    const first = unripe[0]
    return {
      id: 'unripe',
      text: `${String(unripe.length)} planting${unripe.length === 1 ? '' : 's'} didn't mature before the first fall frost. This year had ${String(year.frostFreeDays)} frost-free days. Sow earlier, set out transplants, or choose a faster crop.`,
      bedId: first?.bedId ?? null,
    }
  }

  const dark = of('too-dark')
  if (dark.length > 0) {
    const first = dark[0]
    return {
      id: 'too-dark',
      text: `${String(dark.length)} planting${dark.length === 1 ? '' : 's'} under the panels fell below the crop's light minimum. The plants step ranks crops by shade tolerance, the panels step can widen the rows.`,
      bedId: first?.bedId ?? null,
    }
  }

  const eaten = outcomes
    .filter((outcome) => outcome.kind === 'harvested')
    .reduce<PlantingOutcome | null>(
      (worst, outcome) =>
        worst === null || outcome.pestPressure > worst.pestPressure ? outcome : worst,
      null,
    )
  if (eaten !== null && eaten.pestPressure > 0.6) {
    return {
      id: 'pests',
      text: `Pest pressure reached ${percent(eaten.pestPressure)} in ${bedLabel(plot, eaten.bedId)}. Too much of this plot is one crop family. Plant an unrelated family in the beds around it, or undersow it.`,
      bedId: eaten.bedId,
    }
  }

  const thirsty = outcomes
    .filter((outcome) => outcome.kind === 'harvested')
    .reduce<PlantingOutcome | null>(
      (worst, outcome) =>
        worst === null || outcome.droughtPenalty > worst.droughtPenalty ? outcome : worst,
      null,
    )
  if (thirsty !== null && thirsty.droughtPenalty > 0.1) {
    return {
      id: 'thirsty',
      /*
        The two totals cannot stand alone: a year with more rain than demand reads as a
        contradiction, because "ran short of water: 1098 mm of rain against 950 mm" says nothing
        about when the rain fell. The shortfall is in the daily balance between rains, where the
        root zone holds only so much of a downpour and dries out before the next one
      */
      text: `${bedLabel(plot, thirsty.bedId)} ran short of water in the dry spells between rains. Over the year ${String(Math.round(year.rainfallMm))} mm (${inches(year.rainfallMm)} in) fell against ${String(Math.round(year.referenceEtMm))} mm (${inches(year.referenceEtMm)} in) of evaporative demand, and the soil holds only so much of a downpour, so the bed dried out between them. Water it on the ground step, or move it under the panels, which cut that demand.`,
      bedId: thirsty.bedId,
    }
  }

  const harvested = of('harvested').length
  const energy = energyKwh === null ? '' : ` The panels made ${approxKwh(energyKwh)}.`
  return {
    id: 'status',
    // the harvest share averages over every planting planned, the ones that grew nothing included,
    // so the count is named here too
    text: `${String(harvested)} of ${String(outcomes.length)} plantings harvested in ${year.label}, averaging ${approxPercent(harvestIndex ?? 0)} of full yield across all ${String(outcomes.length)}.${energy}`,
    bedId: null,
  }
}
