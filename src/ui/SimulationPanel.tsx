import { useMemo, type ReactElement } from 'react'
import {
  BUILD_COST_CAVEAT,
  currencyOf,
  isTypedPrice,
  PAYBACK_CAVEAT,
  paybackBlocker,
} from '../data/economy'
import { EXPORT_CAVEAT, RETAIL_PRICE_CAVEAT } from '../data/retail-price'
import { shadeBenefitScale, WATER_LIMITED_INDEX } from '../data/water'
import { approxKwh, money, OUTCOME_LABEL, percent, seasonLine } from '../simulation/coach'
import { trialComparison, type TrialComparison, TRIALS_TO_REVEAL } from '../simulation/evidence'
import { pestYieldLoss } from '../simulation/pests'
import { lerWords, SEASONS_TO_STAND, standingOf } from '../simulation/score'
import {
  chooseYear,
  type SeasonYear,
  typicalYear,
  YEAR_CHOICE_LABEL,
  YEAR_CHOICES,
} from '../simulation/year'
import type { NoPanelsOutcome } from '../state/counterfactual'
import { seasonBlocker } from '../state/simulation'
import { EMPTY_LIST, type SidebarStep } from '../state/slices'
import { useAppStore } from '../state/store'
import type { CompanionRule, FolkloreCompanionRule } from '../types/companion'
import type { Crop } from '../types/crop'
import type { PriceInUse } from '../types/economy'
import type { Bed } from '../types/garden'
import type { RuleId } from '../types/ids'
import type {
  PlantingOutcome,
  SeasonEconomy,
  SeasonReport,
  Trial,
  YearChoice,
  YearSummary,
} from '../types/simulation'
import type { MeasuredYear, WeatherSourceId } from '../types/weather'
import { dayLabel } from './calendar'
import { Action, ChoiceGroup, Toggle } from './controls'
import { EconomyFields } from './EconomyFields'
import { SOURCE_NAME } from './format'
import {
  approxPercent,
  attributionLabel,
  bandBasisLabel,
  bedName,
  cropName,
  formatBandPercent,
  formatCelsius,
  formatRainMm,
  nearestFivePercent,
  plural,
} from './format'
import { Panel, Readout } from './Panel'
import { requirementKey, seasonRequirement } from './requirement'
import { RequirementNotice } from './RequirementNotice'
import { useSeasonSweep } from './useSeasonSweep'

/*
  Every sentence on this panel is written to the voice the author set on 2026-09-04 after reading
  the app and finding its text "written in riddles": plain adult English, literal, the real term
  with one gloss where it first appears, and every citation verbatim (`the voice document`, which wins
  over the grade 4-5 rewrite this panel used to follow). The figures are unchanged and the
  science is unchanged; what moved is the words, and the Latin, the bands and their intervals
  stay behind a "Why?" where the researcher who checked the rewrite can still find every one of
  them (`the convergence document` 7)
*/

const GRADE_LABEL: Readonly<Record<string, string>> = {
  A: 'measured in multi-site field trials',
  B: 'measured in field trials, results vary with conditions',
  C: 'how it works is shown, but no field trial has measured it',
  D: 'traditional practice, untested',
  E: 'no evidence, or contradicted by trials',
}

/**
 * The step that owns the fix the advice names. The advice says what to change. This is where
 * it's changed, so "Fix Bed 1" lands on the editor for it rather than lighting a bed in the
 * scene and stopping, which is what "Show me Bed 1" did and what every persona pressed and then
 * didn't know what to do with
 */
const STEP_FOR_ADVICE: Readonly<Record<string, SidebarStep>> = {
  refused: 'plants',
  pests: 'plants',
  frosted: 'plants',
  unripe: 'plants',
  'too-dark': 'panels',
  thirsty: 'ground',
}

/** A rule id is its own label in this corpus, and the hyphens are the only thing wrong with it */
const ruleLabel = (id: RuleId): string => (id as string).replace(/-/g, ' ')

const untested = (rule: CompanionRule): rule is FolkloreCompanionRule =>
  rule.grade === 'D' || rule.grade === 'E'

/** What the mode is for, before there's a season to read. Gone after the first one */
const HOW_IT_WORKS =
  'Pick a year, then press Run season 1. Every planting gets an outcome and a reason. Then change one thing on an earlier step: a different crop, wider panel rows, or water for a dry bed. Run the next season and compare the two.'

const describeRecord = (years: readonly MeasuredYear[], source: WeatherSourceId | null): string => {
  if (years.length === 0) {
    return 'This weather source holds no measured years, so every season runs on the typical year.'
  }
  const numbers = years.map((measured) => measured.year)
  const from = source === null ? '' : `, from ${SOURCE_NAME[source]}`
  return `Weather record: ${String(years.length)} measured years, ${String(Math.min(...numbers))} to ${String(Math.max(...numbers))}${from}. The typical year is a composite of them.`
}

/** "(12 more than the typical year)", or nothing where there's no typical year to compare with */
const versusTypical = (value: number, typical: number | null): string => {
  if (typical === null || value === typical) return ''
  const gap = Math.abs(value - typical)
  return ` (${String(gap)} ${value > typical ? 'more' : 'fewer'} than the typical year)`
}

/**
 * Whether this year was dry enough for panel shade to pay the plants back, and the plain
 * sentence either way.
 *
 * At a temperate place even the thirstiest year on record can sit below the foot of the
 * designer's own shade-benefit ramp, so the yield gain under panels that this mode exists to
 * show never arrives and a card promising the thirstiest year promises a thirst that never
 * comes (`the convergence document` 7.1, item 8). Decision Record 6 is why: the 2 to 3 times gains
 * measured in Arizona come from relieved water stress, and a well watered garden has none to
 * relieve. Where the line falls is `shadeBenefitScale`'s to say and never a comparison written
 * here, and the line itself is `WATER_LIMITED_INDEX`
 */
const thirstLine = (year: YearSummary, subject: string): string =>
  shadeBenefitScale({ index: year.waterIndex }) > 0
    ? 'Dry enough here for panel shade to raise yield.'
    : `${subject} wasn't dry enough for shade to raise yield. Rain left about ${percent(year.waterIndex)} of the season's water demand unmet. Shade raises yield only past ${percent(WATER_LIMITED_INDEX)}.`

const describeYear = (year: YearSummary, typical: YearSummary | null): string => {
  const usual = year.year === null ? null : typical
  const rain = `${formatRainMm(year.rainfallMm)} of rain${year.rainMeasured ? '' : " (the typical-year figure; this source didn't measure rainfall)"}`
  const water = `Reference evapotranspiration ${formatRainMm(year.referenceEtMm)}: the season's water demand, defined for a short grass crop.${year.waterLimited ? ' The beds ran short of water.' : ''}`
  /*
    Which record these dates came from, because they differ from the ones on the site step and could
    read as the app contradicting itself. The site step's frost dates are the thirty-year daily
    normals, 1991 to 2020. These are the frosts in the hours of the year that actually ran, which
    for a measured year is that year's own weather and for the typical year is the composite
    assembled from the last ten. Both are honest and they're different records, so each says which
    it is
  */
  const source =
    year.year === null
      ? ' These are the frosts in the typical year the app assembles from the measured record, so they differ a little from the thirty-year frost dates on the site step.'
      : ` These are ${String(year.year)}'s own frosts, so they differ from the thirty-year frost dates on the site step.`
  return [
    // a frost-free year arrives with a 365-day span and both anchors on the origin: no dates to print
    year.frostFreeDays >= 365
      ? `No frost in ${year.year === null ? 'the typical year' : String(year.year)}.`
      : `Frost-free from ${dayLabel(year.lastSpringFreeze)} to ${dayLabel(year.firstFallFreeze)}, ${String(year.frostFreeDays)} days${versusTypical(year.frostFreeDays, usual?.frostFreeDays ?? null)}.${source}`,
    `${rain}.`,
    water,
    `${String(year.heatDaysAbove30C)} days above ${formatCelsius(30)}${versusTypical(year.heatDaysAbove30C, usual?.heatDaysAbove30C ?? null)}.`,
    thirstLine(year, 'This year'),
  ].join(' ')
}

const EXTREMES: readonly YearChoice[] = ['driest', 'wettest', 'hottest', 'coolest']

/**
 * The year each card names, and its two headline numbers, before any press. A card that said
 * "the hottest year on record here" and no more made it possible to run the hottest and the
 * driest years back to back and get the same season twice, because at this place they are the
 * same year; now the card says so
 */
const cardHelp = (
  choice: YearChoice,
  typical: SeasonYear | null,
  years: readonly SeasonYear[],
): string | undefined => {
  if (years.length === 0) return undefined
  if (choice === 'typical') return 'A composite of every year on record'
  if (choice === 'random') return 'One measured year, drawn when you run the season'
  if (typical === null) return undefined
  const chosen = chooseYear(choice, typical, years, 0)
  const alsoThe = EXTREMES.filter(
    (other) =>
      other !== choice && chooseYear(other, typical, years, 0).summary.year === chosen.summary.year,
  ).map((other) => YEAR_CHOICE_LABEL[other].toLowerCase())
  const named = `${String(chosen.summary.year)}: ${String(chosen.summary.heatDaysAbove30C)} days above ${formatCelsius(30)}, ${formatRainMm(chosen.summary.rainfallMm)} of rain.${alsoThe.length > 0 ? ` Also the ${alsoThe.join(' and the ')}.` : ''}`
  // only the driest card: it's the one whose promise the ramp can quietly fail to keep
  return choice === 'driest' ? `${named} ${thirstLine(chosen.summary, 'Even this year')}` : named
}

const LOST: ReadonlySet<PlantingOutcome['kind']> = new Set(['frosted', 'unripe', 'too-dark'])

/** Losses first, because what didn't come in is what a grower looks for first */
const inReadingOrder = (outcomes: readonly PlantingOutcome[]): readonly PlantingOutcome[] =>
  [...outcomes].sort((a, b) => Number(a.kind === 'harvested') - Number(b.kind === 'harvested'))

/**
 * "harvested, about 60% of full yield. The published range at this shade, before pests, is
 * 45-78%. Pests took about 8%. Water shortage took about 12%". The harvest is one random draw
 * inside that range, so it's said to the nearest five with the range beside it. The exact
 * draw, the interval kind and its source stay behind the Why?. The range is said to be before
 * pests because the draw is cut by them afterward, so the harvest can sit below it
 */
const headline = (outcome: PlantingOutcome): string => {
  if (outcome.kind !== 'harvested') return OUTCOME_LABEL[outcome.kind]
  const pests = pestYieldLoss(outcome.pestPressure)
  const cutShort =
    outcome.frostCutDay === undefined
      ? ''
      : `, cut short by frost on ${dayLabel(outcome.frostCutDay)}`
  return [
    `harvested, ${approxPercent(outcome.realized)} of full yield${cutShort}`,
    outcome.band === null
      ? null
      : `The published range at this shade, before pests, is ${formatBandPercent(outcome.band)}`,
    pests > 0.005 ? `Pests took about ${percent(pests)}` : null,
    outcome.droughtPenalty > 0.02
      ? `Water shortage took about ${percent(outcome.droughtPenalty)}`
      : null,
  ]
    .filter((part) => part !== null)
    .join('. ')
}

/**
 * "(down from about 65%)", against the season before, or nothing on the first. Both seasons are
 * said to the nearest five, so the direction is read between the two figures on screen
 */
const versusLast = (report: SeasonReport, previous: SeasonReport | undefined): string => {
  if (report.harvestIndex === null || previous?.harvestIndex == null) return ''
  const now = nearestFivePercent(report.harvestIndex)
  const then = nearestFivePercent(previous.harvestIndex)
  if (now === then) return ' (about the same as last season)'
  return ` (${now > then ? 'up' : 'down'} from about ${String(then)}%)`
}

/**
 * "Without panels this year: about 90%", or what became of the planting instead, for one crop.
 * Both harvests are said to the nearest five, so the gap is read between the two figures on
 * screen rather than between the draws behind them
 */
const withoutPanelsLine = (real: PlantingOutcome, other: NoPanelsOutcome): string => {
  if (other.kind !== 'harvested') return `Without panels this year: ${OUTCOME_LABEL[other.kind]}.`
  if (real.kind !== 'harvested')
    return `Without panels this year: harvested, ${approxPercent(other.realized)} of full yield.`
  const gap = nearestFivePercent(other.realized) - nearestFivePercent(real.realized)
  const direction =
    gap === 0
      ? 'the same as under the panels'
      : `${plural(Math.abs(gap), 'point', 'points')} ${gap > 0 ? 'more' : 'less'} than under them`
  return `Without panels this year: ${approxPercent(other.realized)} of full yield, ${direction}.`
}

const Outcome = ({
  outcome,
  catalog,
  beds,
  withoutPanels,
}: {
  readonly outcome: PlantingOutcome
  readonly catalog: readonly Crop[]
  readonly beds: readonly Bed[]
  /** The same planting in the year with no panels, once that comparison has run for this season */
  readonly withoutPanels: NoPanelsOutcome | null
}): ReactElement => (
  <li data-testid={`item-seasons-outcome-${outcome.kind}`} data-kind={outcome.kind}>
    <strong>
      {cropName(catalog, outcome.cropId)}, {bedName(beds, outcome.bedId)}
    </strong>
    : {headline(outcome)}.
    {withoutPanels === null ? null : (
      <span data-testid={`readout-seasons-without-panels-${outcome.plantingId}`}>
        {' '}
        {withoutPanelsLine(outcome, withoutPanels)}
      </span>
    )}
    <details className="wizard-advanced">
      <summary>Why?</summary>
      <p data-testid={`readout-seasons-why-${outcome.plantingId}`}>
        {outcome.explanation}
        {outcome.explanation.endsWith('.') ? '' : '.'}
        {outcome.band === null
          ? ''
          : ` That range is the ${bandBasisLabel(outcome.band)}. Most of its uncertainty comes from ${attributionLabel(outcome.band.dominantSource)}.`}
        {outcome.kind === 'harvested'
          ? ' The pest and water-shortage figures are estimates this app makes; no published figure exists.'
          : ''}
      </p>
    </details>
  </li>
)

/*
  The row's own number is the whole garden's: every planting the rule concerns runs it, so there
  was nothing beside it to read it against until the reveal (`the convergence document` 7.1, item 8).
  `trialComparison` reads the other beds of the same seasons off the reports, and where there are
  none the row says so, because a trial that left no bed out is the lesson
*/
const TrialRow = ({
  trial,
  rule,
  comparison,
  revealed,
  onReveal,
}: {
  readonly trial: Trial
  readonly rule: CompanionRule | null
  readonly comparison: TrialComparison | null
  readonly revealed: boolean
  readonly onReveal: () => void
}): ReactElement => (
  <li data-testid={`item-seasons-trial-${trial.ruleId}`} data-grade={rule?.grade ?? ''}>
    <strong>{ruleLabel(trial.ruleId)}</strong>
    {rule === null ? '' : ` (${GRADE_LABEL[rule.grade] ?? ''})`}: after{' '}
    {plural(trial.seasons, 'season', 'seasons')}, beds running it averaged{' '}
    {/* the same seasons as the control beside it: the reports keep the last twelve, the tally every one */}
    {approxPercent(
      comparison === null
        ? trial.bedSeasons === 0
          ? 0
          : trial.totalRealized / trial.bedSeasons
        : comparison.triedMean,
    )}{' '}
    of full yield.{' '}
    {comparison === null ? null : (
      <>
        <span data-testid={`readout-seasons-control-${trial.ruleId}`}>
          {comparison.withoutPlantings === 0
            ? "Every bed ran it, so there's nothing to compare it with. A trial needs beds without it."
            : `Beds without it averaged ${approxPercent(comparison.withoutMean)} of full yield.`}
        </span>{' '}
      </>
    )}
    {comparison === null ? null : (
      <details className="wizard-advanced">
        <summary>Why?</summary>
        <p data-testid={`readout-seasons-why-control-${trial.ruleId}`}>
          Beds compared in the same seasons had the same weather, which is a fairer test than one
          year against the next. The beds still differ from each other: one gets more sun, another
          better soil. Treat a difference as a lead to check.
        </p>
      </details>
    )}
    {revealed ? (
      <p data-testid={`readout-seasons-revealed-${trial.ruleId}`}>
        <strong>Published evidence.</strong> {rule?.notes ?? 'Nothing recorded'}.
        {rule !== null && untested(rule)
          ? rule.contradictedBy.length > 0
            ? ` Contradicted by ${rule.contradictedBy.join(', ')}.`
            : ' No published study supports it, and none contradicts it.'
          : ''}
        {rule !== null && rule.citations.length > 0 ? ` Cited: ${rule.citations.join(', ')}.` : ''}
      </p>
    ) : trial.seasons >= TRIALS_TO_REVEAL ? (
      <Action testId={`control-seasons-reveal-${trial.ruleId}`} onClick={onReveal}>
        Show the published evidence
      </Action>
    ) : (
      <span data-testid={`readout-seasons-trial-wait-${trial.ruleId}`}>
        The published evidence is shown after {String(TRIALS_TO_REVEAL)} seasons.
      </span>
    )}
  </li>
)

/** "● ● ○ ○ ○", the five seasons a standing is read after, drawn as a track */
const slots = (run: number): string =>
  Array.from({ length: SEASONS_TO_STAND }, (_, index) => (index < run ? '●' : '○')).join(' ')

const countOf = (report: SeasonReport) => ({
  harvested: report.outcomes.filter((outcome) => outcome.kind === 'harvested').length,
  lost: report.outcomes.filter((outcome) => LOST.has(outcome.kind)).length,
  refused: report.outcomes.filter(
    (outcome) => outcome.kind !== 'harvested' && !LOST.has(outcome.kind),
  ).length,
})

/**
 * The economy worth putting a heading over, or null.
 *
 * A garden with no panels and no rule asking anything of it has nothing to cost, and a heading
 * with only a disclaimer under it is worse than no block at all. Absent, too, on a report saved
 * before any of this existed, which is why `SeasonReport.economy` is optional
 */
const worthSaying = (economy: SeasonEconomy | undefined): SeasonEconomy | null =>
  economy !== undefined && (economy.buildCostUsd !== null || economy.managementTasks.length > 0)
    ? economy
    : null

const sentence = (text: string): string => (text.endsWith('.') ? text : `${text}.`)

/** Which price valued the year, in the readout's own words: the state average or the grower's own */
const priceLabel = (price: PriceInUse): string =>
  isTypedPrice(price) ? 'your tariff' : `the state average price for ${price.stateCode}`

/** "about 3 years", or "under a year" where the rounding would have said "about 0 years" */
const paybackWords = (years: number): string => {
  const rounded = Math.round(years)
  return rounded < 1 ? 'under a year' : `about ${plural(rounded, 'year', 'years')}`
}

/**
 * The benchmark is in US dollars. Beside a price typed in any other currency its symbol says which
 * dollar, since a bare "$" next to an AUD tariff reads as Australian dollars
 */
const benchmarkMoney = (amount: number, beside: PriceInUse | null): string => {
  const said = money(amount, 'USD')
  return beside === null || currencyOf(beside) === 'USD' ? said : said.replace(/^\$/, 'US$')
}

/**
 * Where the money came from, in the words of the sources it came from.
 *
 * The caveats are the data layer's own exported strings rather than the ones hanging off these
 * particular values, so a figure can never reach a reader without the warning that belongs to it:
 * a caveat is a property of the source and not of one season's copy of a number. Each figure
 * brings its own, so a block with no price never says a word about export tariffs, and a typed
 * figure names the grower as its source the way a typed soil pH does
 */
const whyItCosts = (economy: SeasonEconomy): string =>
  [
    economy.installedCost !== null
      ? `Build cost: the figure you typed, ${money(economy.installedCost.amount, economy.installedCost.currency)}`
      : economy.buildCostUsd === null
        ? null
        : `Build cost: a National Renewable Energy Laboratory (NREL) benchmark for photovoltaic systems installed over crops (Horowitz et al. 2020). The band spans the cheapest and the dearest of the three crop-mount designs that report prices. Which of the three an array here would use isn't known. ${BUILD_COST_CAVEAT}`,
    economy.price === null
      ? null
      : isTypedPrice(economy.price)
        ? `Electricity price: your tariff, ${String(economy.price.perKwh)} ${economy.price.currency} per kWh as typed. ${EXPORT_CAVEAT}`
        : `Electricity price: the ${economy.price.stateCode} residential average for ${String(economy.price.year)}, published by the US Energy Information Administration. ${RETAIL_PRICE_CAVEAT}`,
    economy.paybackYears === null ? null : PAYBACK_CAVEAT,
    'Management tasks are listed without a price, and no figure above includes labor.',
  ]
    .filter((part) => part !== null)
    .map((part) => sentence(part.trim()))
    .join(' ')

/**
 * What the panels cost, what a year of them was worth, and what the planting asks of you.
 *
 * Below the standing and outside it on purpose (Decision Record 14): none of this is in the
 * verdict and none of it is in a score, because a garden worth having and a garden that pays for
 * itself are two different questions and this app only answers the first. Every figure is the
 * season report's own, and each readout is absent rather than zeroed where its source is missing
 */
const WhatItCosts = ({ economy }: { readonly economy: SeasonEconomy }): ReactElement => {
  // a valued year with no payback says why in one sentence, and the sentence is the data layer's
  const blocker = paybackBlocker(economy.installedCost, economy.electricityValue, economy.price)
  return (
    <>
      <h3>Cost, payback and work</h3>
      <div className="readouts">
        {economy.installedCost !== null ? (
          <Readout
            id="seasons-cost"
            label="Build cost"
            value={
              <span data-source="user">
                {money(economy.installedCost.amount, economy.installedCost.currency)}, the cost you
                typed
              </span>
            }
          />
        ) : economy.buildCostUsd === null ? null : (
          <Readout
            id="seasons-cost"
            label="Build cost"
            value={`about ${benchmarkMoney(economy.buildCostUsd.value.interval.lower, economy.price)} to ${benchmarkMoney(economy.buildCostUsd.value.interval.upper, economy.price)}`}
          />
        )}
        {economy.electricityValue === null || economy.price === null ? null : (
          <Readout
            id="seasons-electricity-value"
            label="Electricity value, one year"
            value={
              <span data-source={isTypedPrice(economy.price) ? 'user' : 'eia'}>
                about {money(economy.electricityValue, currencyOf(economy.price))} at{' '}
                {priceLabel(economy.price)}
              </span>
            }
          />
        )}
        {economy.paybackYears === null ? null : (
          <Readout
            id="seasons-payback"
            label="Simple payback"
            value={
              'sourceId' in economy.paybackYears
                ? `${paybackWords(economy.paybackYears.years)} at the cost you typed`
                : `about ${String(Math.round(economy.paybackYears.value.interval.lower))} to ${String(Math.round(economy.paybackYears.value.interval.upper))} years`
            }
          />
        )}
      </div>
      {economy.buildCostUsd === null ? null : <EconomyFields />}
      {economy.managementTasks.length === 0 ? null : (
        // a list and not a readout: four tasks in a readout's narrow cell wrapped into a column of
        // single words, and a task is a sentence to read rather than a figure to compare
        <div data-testid="readout-seasons-tasks">
          <p>Management tasks the plantings you chose require:</p>
          <ul className="list">
            {economy.managementTasks.map((task) => (
              <li key={task}>{task}</li>
            ))}
          </ul>
        </div>
      )}
      <p data-testid="readout-seasons-cost-note">
        {economy.installedCost === null
          ? "An estimate from the National Renewable Energy Laboratory's (NREL) 2020 benchmark for 500 kW crop-mounted systems. A small array costs more per watt."
          : 'The build cost is the figure you typed.'}
        {economy.price === null
          ? " No electricity price is known for this location, so this year's electricity isn't given a value."
          : ''}
        {blocker === null ? null : <span data-testid="status-seasons-payback"> {blocker}</span>}
      </p>
      <details className="wizard-advanced">
        <summary>Why?</summary>
        <p data-testid="readout-seasons-why-cost">{whyItCosts(economy)}</p>
      </details>
    </>
  )
}

/**
 * The garden run forward, a season at a time (Decision Record 14).
 *
 * The panel owns no state: what it shows is the reports the store kept. Why a season can't run
 * is one sentence from `seasonBlocker`, which the store consults before it runs, so the button
 * and the store can't disagree about it, and the press that settles it is borrowed from the
 * step that owns the fix rather than restated here.
 *
 * The order is the loop the mode is: what this is, what years there are, which one, run it,
 * what happened, every season so far, where that leaves the garden, what it costs, and what it's
 * testing
 */
export const SimulationPanel = (): ReactElement => {
  const simulation = useAppStore((s) => s.simulation)
  const notice = useAppStore((s) => s.simulationNotice)
  // the sentence is the subscription and the requirement is built from a read: every builder in
  // `requirement.ts` returns a fresh object, and a selector that returns one re-renders forever.
  // The key is subscribed to as well, because the borrowed remedy goes busy on `raster.status`
  // and the sentence doesn't change when it does
  const blocker = useAppStore((s) => seasonBlocker(s))
  useAppStore(requirementKey)
  const requirement = blocker === null ? null : seasonRequirement(useAppStore.getState())
  const years = useAppStore((s) => s.years)
  const seasonYears = useAppStore((s) => s.seasonYears)
  const site = useAppStore((s) => s.site)
  const weather = useAppStore((s) => s.weather)
  const beds = useAppStore((s) => s.plot?.beds ?? EMPTY_LIST)
  const selectBed = useAppStore((s) => s.selectBed)
  const setSidebarStep = useAppStore((s) => s.setSidebarStep)
  const catalog = useAppStore((s) =>
    s.catalog.status === 'ready' ? s.catalog.value : (EMPTY_LIST as readonly Crop[]),
  )
  // the async slice itself, which is referentially stable: a selector that built the flat list
  // would return a new array on every call and re-render the panel forever
  const companionRules = useAppStore((s) => s.companionRules)
  const rules = useMemo<readonly CompanionRule[]>(
    () =>
      companionRules.status === 'ready'
        ? [
            ...companionRules.value.scorable,
            ...companionRules.value.experimental,
            ...companionRules.value.folklore,
          ]
        : EMPTY_LIST,
    [companionRules],
  )
  const { run: runSeason, playing } = useSeasonSweep()
  const setYearChoice = useAppStore((s) => s.setYearChoice)
  const resetSimulation = useAppStore((s) => s.resetSimulation)
  const revealRule = useAppStore((s) => s.revealRule)
  const noPanels = useAppStore((s) => s.noPanels)
  const compareWithoutPanels = useAppStore((s) => s.compareWithoutPanels)
  const hasArrays = useAppStore((s) => (s.plot?.arrays.length ?? 0) > 0)
  const overlayOnSeasons = useAppStore((s) => s.overlayOnSeasons)
  const setOverlayOnSeasons = useAppStore((s) => s.setOverlayOnSeasons)

  // the typical year as the cards and the comparisons see it, once per place
  const typical = useMemo<SeasonYear | null>(
    () =>
      site.status === 'ready' && weather.status === 'ready'
        ? typicalYear(site.value, weather.value)
        : null,
    [site, weather],
  )
  const source: WeatherSourceId | null = weather.status === 'ready' ? weather.value.source : null

  const latest = simulation.reports[simulation.reports.length - 1]
  const previous = simulation.reports[simulation.reports.length - 2]
  const standing = standingOf(simulation.reports)
  const ruleById = (id: RuleId): CompanionRule | null =>
    rules.find((rule) => rule.id === id) ?? null
  const fixStep = latest === undefined ? undefined : STEP_FOR_ADVICE[latest.advice.id]
  const economy = worthSaying(latest?.economy)
  const counts = latest === undefined ? null : countOf(latest)

  return (
    <Panel
      id="seasons"
      title="Simulation"
      subtitle="Run the garden through one year, then another. The design stays as it is"
    >
      <Toggle
        testId="control-seasons-show-light"
        label="Show the light colors on the ground"
        checked={overlayOnSeasons}
        onChange={setOverlayOnSeasons}
      />
      {simulation.season === 0 ? <p data-testid="readout-seasons-how">{HOW_IT_WORKS}</p> : null}
      <p className="notice notice-idle" data-testid="status-seasons-record">
        {describeRecord(years, source)}
      </p>
      <ChoiceGroup
        testId="control-seasons-year"
        name="seasons-year"
        legend="Year to run next"
        options={YEAR_CHOICES.map((choice) => ({
          value: choice,
          label: YEAR_CHOICE_LABEL[choice],
          help: cardHelp(choice, typical, seasonYears ?? EMPTY_LIST),
        }))}
        value={simulation.yearChoice}
        onChange={setYearChoice}
      />
      <div className="panel-actions">
        <Action
          testId="control-seasons-run"
          tone="primary"
          disabled={blocker !== null}
          onClick={runSeason}
        >
          {playing ? 'Running the season...' : `Run season ${String(simulation.season + 1)}`}
        </Action>
        <Action
          testId="control-seasons-reset"
          disabled={simulation.season === 0}
          onClick={resetSimulation}
        >
          Start over
        </Action>
      </div>
      {requirement === null ? null : (
        <RequirementNotice requirement={requirement} testId="status-seasons" />
      )}
      {requirement === null && notice !== null ? (
        <p className="notice notice-idle" data-testid="status-seasons">
          {notice}
        </p>
      ) : null}
      {latest === undefined || counts === null ? null : (
        <>
          <p
            className="notice notice-ready"
            data-testid="readout-seasons-advice"
            aria-live="polite"
          >
            {latest.advice.text}
          </p>
          {/* the advice names a bed and a change. The press lands on the step that makes it,
              with that bed selected, rather than lighting the bed and stopping */}
          {latest.advice.bedId === null ? null : (
            <div className="panel-actions">
              <Action
                testId="control-seasons-show-bed"
                onClick={() => {
                  selectBed(latest.advice.bedId)
                  if (fixStep !== undefined) setSidebarStep(fixStep)
                }}
              >
                Fix {bedName(beds, latest.advice.bedId)}
              </Action>
            </div>
          )}
          <div className="readouts">
            <Readout id="seasons-harvested" label="Harvested" value={counts.harvested} />
            <Readout
              id="seasons-lost"
              label="Lost to frost, shade or a short season"
              value={counts.lost}
            />
            <Readout id="seasons-refused" label="Not planted" value={counts.refused} />
            <Readout
              id="seasons-harvest"
              label="Harvest, share of full yield"
              // the mean of random draws, said to the nearest five like each draw. The exact
              // figure rides on the attribute
              value={
                latest.harvestIndex === null ? (
                  'nothing was in the ground'
                ) : (
                  <span data-harvest-index={String(latest.harvestIndex)}>
                    {approxPercent(latest.harvestIndex)} across the{' '}
                    {plural(latest.outcomes.length, 'planting', 'plantings')} you planned
                    {versusLast(latest, previous)}
                  </span>
                )
              }
            />
            <Readout
              id="seasons-energy"
              label="Electricity from the panels"
              value={
                latest.energyKwh === null ? (
                  'no panels'
                ) : (
                  <span data-kwh={String(latest.energyKwh)}>{approxKwh(latest.energyKwh)}</span>
                )
              }
            />
            <Readout
              id="seasons-year"
              label={`Season ${String(latest.season)}, ${latest.year.label}`}
              value={describeYear(latest.year, typical?.summary ?? null)}
            />
          </div>
          {hasArrays ? (
            <div className="panel-actions">
              <Action
                testId="action-seasons-no-panels"
                disabled={noPanels.status === 'loading'}
                onClick={() => void compareWithoutPanels()}
              >
                {noPanels.status === 'loading'
                  ? 'Computing the light without panels...'
                  : 'Compare with no panels'}
              </Action>
            </div>
          ) : null}
          {hasArrays && noPanels.status === 'ready' ? (
            <>
              <p data-testid="readout-seasons-no-panels">
                {noPanels.value.harvestIndex === null
                  ? 'The same year with no panels: nothing was in the ground.'
                  : `The same year with no panels: ${approxPercent(noPanels.value.harvestIndex)} of full yield across the same plantings.`}
              </p>
              <p className="readout-note">
                A light run of the plot with every panel row removed, using the same weather year
                and the same random draws, so only the shade changed.
              </p>
            </>
          ) : null}
          {hasArrays && noPanels.status === 'error' ? (
            <p className="notice notice-idle" data-testid="status-seasons-no-panels">
              {noPanels.message}
            </p>
          ) : null}
          <details className="wizard-advanced">
            <summary>Why?</summary>
            <p data-testid="readout-seasons-why-harvest">
              A planting that grew nothing counts as zero, including one that was never sown. The
              share covers every planting you planned, because the ground planned for each one
              counts. Every season is counted like this, and the results so far are those seasons
              averaged.
            </p>
          </details>
          <ul className="list" data-testid="list-seasons-outcomes">
            {inReadingOrder(latest.outcomes).map((outcome) => (
              <Outcome
                key={outcome.plantingId}
                outcome={outcome}
                catalog={catalog}
                beds={beds}
                // the same planting in the year with no panels, once that comparison has run for
                // this season: the panels help some crops and cost others, and the garden's
                // average above hides which
                withoutPanels={
                  noPanels.status === 'ready' && noPanels.value.season === latest.season
                    ? (noPanels.value.outcomes.find(
                        (entry) => entry.plantingId === outcome.plantingId,
                      ) ?? null)
                    : null
                }
              />
            ))}
          </ul>
        </>
      )}
      {/*
        Every season kept, oldest first. The mode is a comparison, and with only the newest season
        on screen the one thing it exists to show, that this change made that difference, would have
        to be held in the grower's head. `SEASON_REPORTS_KEPT` bounds the list
      */}
      {simulation.reports.length < 2 ? null : (
        <>
          <h3>Every season so far</h3>
          <ol className="list" data-testid="list-seasons-record">
            {simulation.reports.map((report) => (
              <li
                key={report.season}
                data-testid={`item-seasons-record-${String(report.season)}`}
                data-harvest-index={
                  report.harvestIndex === null ? undefined : String(report.harvestIndex)
                }
                data-kwh={report.energyKwh === null ? undefined : String(report.energyKwh)}
              >
                <strong>
                  Season {report.season}, {report.year.label}
                </strong>
                : {seasonLine(report)}
              </li>
            ))}
          </ol>
        </>
      )}
      {latest === undefined ? null : (
        <>
          <h3>Results so far</h3>
          <p className="notice notice-idle">
            {/* a picture of five dots, read aloud as the count it draws */}
            <span
              role="img"
              data-testid="readout-seasons-slots"
              aria-label={`${String(Math.min(simulation.season, SEASONS_TO_STAND))} of ${String(SEASONS_TO_STAND)} seasons run`}
            >
              {slots(simulation.season)}
            </span>{' '}
            <span data-testid="readout-seasons-progress">
              Season {String(Math.min(simulation.season, SEASONS_TO_STAND))} of{' '}
              {String(SEASONS_TO_STAND)}
            </span>
          </p>
          <p
            className={`notice notice-${standing.complete ? 'ready' : 'idle'}`}
            data-testid="readout-seasons-standing"
            data-complete={String(standing.complete)}
            data-floor-held={String(standing.foodFloorHeld)}
          >
            {standing.verdict}
          </p>
          {standing.ler === null ? null : (
            <>
              <div className="readouts">
                <Readout
                  id="seasons-ler"
                  label="Land equivalent ratio (LER)"
                  value={lerWords(standing.ler)}
                />
              </div>
              {/* the term carries its gloss the first and only time it appears on this step, and
                  the range names what it is: the crop partial is the published band at each
                  bed's shade, and the electricity partial is added to both ends of it */}
              <p className="readout-note">
                A separate solar farm beside a separate garden would need {lerWords(standing.ler)}{' '}
                times this land to give what the beds and panels give together. Above 1, the two
                share the ground well (Dupraz et al. 2011). The range is the{' '}
                {bandBasisLabel(standing.ler)}, and most of its uncertainty comes from{' '}
                {attributionLabel(standing.ler.dominantSource)}.
              </p>
            </>
          )}
        </>
      )}
      {economy === null ? null : <WhatItCosts economy={economy} />}
      {simulation.trials.length === 0 ? null : (
        <>
          <h3>Companion-planting claims under trial</h3>
          <p className="panel-sub" data-testid="readout-seasons-trials-note">
            This app draws each outcome from its own rules, and a real garden can differ.
          </p>
          <ul className="list" data-testid="list-seasons-trials">
            {simulation.trials.map((trial) => (
              <TrialRow
                key={trial.ruleId}
                trial={trial}
                rule={ruleById(trial.ruleId)}
                comparison={trialComparison(simulation.reports, trial.ruleId)}
                revealed={simulation.revealed.includes(trial.ruleId)}
                onReveal={() => revealRule(trial.ruleId)}
              />
            ))}
          </ul>
        </>
      )}
    </Panel>
  )
}
