import { cropById, cropLabel, laubCurve } from '../data/crops'
import {
  buildCostUsdBand,
  electricityValue,
  paybackOf,
  priceInUse,
  typedCostOf,
} from '../data/economy'
import {
  forwardDays,
  frostHardy,
  INDOOR_RAISING_DAYS,
  seasonAnchors,
  siteMaturityDays,
  wrapDayOfYear,
} from '../recommend/calendar'
import { DEFAULT_TARGET_YEAR } from '../recommend/pipeline'
import { climateGate } from '../recommend/stages/climate-gate'
import {
  type InteractionContext,
  rotationViolation,
  ruleAppliesInContext,
} from '../recommend/stages/interactions'
import { lightGate } from '../recommend/stages/light-gate'
import { soilWaterStage } from '../recommend/stages/soil-water'
import { crowdingYieldPenalty, spaceStage } from '../recommend/stages/space'
import { estimateYield } from '../recommend/yield'
import { chainOptionsFor } from '../sim/pv/chain'
import { pvEnergyReport } from '../sim/pv/report'
import type { Banded } from '../types/band'
import { unsafeBandMidpoint } from '../types/band'
import type {
  CompanionRule,
  FolkloreCompanionRule,
  PartitionedCompanionRules,
  RotationConstraint,
  ScoreableCompanionRule,
} from '../types/companion'
import type { Crop, LifeCycle } from '../types/crop'
import type { EconomyInputs, RetailPrice } from '../types/economy'
import type { Bed, GardenPlot, Planting } from '../types/garden'
import type { BedId, CropId, RuleId } from '../types/ids'
import type { BedLight } from '../types/light'
import type {
  OutcomeKind,
  PlantingOutcome,
  SeasonEconomy,
  SeasonRecord,
  SeasonReport,
} from '../types/simulation'
import type { ExceedancePercentile, Site } from '../types/site'
import type { Fraction } from '../types/units'
import { advise, approxPercent } from './coach'
import { codeOf, hiddenTruth, measuredEffectLike, unit } from './evidence'
import { historyByYear } from './history'
import {
  crowdingOf,
  heatRatio,
  PEST_KINDS,
  pestSuppression,
  pestYieldLoss,
  untreatedPressure,
} from './pests'
import type { SeasonYear } from './year'

export interface SeasonInput {
  /** The site's typical year, which the year's pest heat is scaled against */
  readonly site: Site
  readonly year: SeasonYear
  readonly plot: GardenPlot
  /** The bake, per bed, on the typical year: shade is geometry and the year varies the rest */
  readonly bedLight: readonly BedLight[]
  readonly catalog: readonly Crop[]
  readonly rules: PartitionedCompanionRules
  readonly rotation: readonly RotationConstraint[]
  readonly history: readonly SeasonRecord[]
  /** One-based: the season about to be run */
  readonly season: number
  readonly seed: number
  readonly frostPercentile: ExceedancePercentile
  /**
   * What a kilowatt-hour costs to buy at this site, or null: off the US grid, before the lookup
   * lands, and whenever it fails. Null is a supported season everywhere and simply leaves the
   * year's electricity unvalued, because a borrowed price is worse than no price
   */
  readonly retailPrice: RetailPrice | null
  /** What the grower typed about money, which stands in for the price and the benchmark where typed */
  readonly economyInputs: EconomyInputs
}

export interface TriedRule {
  readonly ruleId: RuleId
  readonly bedId: BedId
  readonly realised: Fraction
}

export interface SeasonResult {
  readonly report: SeasonReport
  /** What stood in each bed, for the ground to remember */
  readonly records: readonly SeasonRecord[]
  readonly tried: readonly TriedRule[]
}

const LOG_FLOOR = 1e-4

/**
 * What this season brought in, drawn inside the literature's own band.
 *
 * The band is Laub's 95% confidence interval, symmetric in log space, so the draw is uniform in
 * log space between its bounds. That is the whole of the season's luck: no invented variance,
 * and a bed under panels varies exactly as much as the meta-analysis says the answer is unsure.
 * Decision Record 7 notes a single garden is at the plot scale the authors call MORE uncertain
 * than the interval, so this is the optimistic end of honest (Decision Record 14)
 */
const drawInBand = (band: Banded<Fraction>, draw: number): Fraction => {
  const low = Math.log10(Math.max(band.interval.lower, LOG_FLOOR))
  const high = Math.log10(Math.max(band.interval.upper, LOG_FLOOR))
  return (10 ** (low + (high - low) * draw)) as Fraction
}

/** The life cycles that stay in the ground between seasons rather than being sown again */
const PERENNIAL: ReadonlySet<LifeCycle> = new Set<LifeCycle>(['perennial', 'woody-perennial'])

const measured = (rule: CompanionRule): rule is ScoreableCompanionRule =>
  rule.grade === 'A' || rule.grade === 'B'

const untested = (rule: CompanionRule): rule is FolkloreCompanionRule =>
  rule.grade === 'D' || rule.grade === 'E'

/** Only a rule whose figure is a harvest may multiply a harvest: eight of the twelve are not */
const measuresYield = (rule: ScoreableCompanionRule): boolean =>
  rule.effectMetric === 'ler' || rule.effectMetric === 'yield-pct'

const percent = (value: number): string => `${String(Math.round(value * 100))}%`

const outcomeOf = (
  bed: Bed,
  planting: Planting,
  kind: OutcomeKind,
  explanation: string,
  rest: Partial<PlantingOutcome> = {},
): PlantingOutcome => ({
  bedId: bed.id,
  plantingId: planting.id,
  cropId: planting.cropId,
  kind,
  band: null,
  realised: 0 as Fraction,
  pestPressure: 0 as Fraction,
  droughtPenalty: 0 as Fraction,
  companions: [],
  tried: [],
  explanation,
  ...rest,
})

/** "clubroot" out of "Plasmodiophora brassicae (clubroot)", or the whole name where there is none */
const commonName = (pathogen: string): string => /\(([^)]+)\)/.exec(pathogen)?.[1] ?? pathogen

/** Kinds where the plants were in the ground long enough for the ground to remember them */
const REMEMBERED: ReadonlySet<OutcomeKind> = new Set<OutcomeKind>([
  'harvested',
  'frosted',
  'unripe',
  'too-dark',
  'unlit',
])

/**
 * One season of the garden, on one year, as a value.
 *
 * The recommendation pipeline is the same science run on the typical year with no history; this is
 * that science run on the year that happened, with the ground remembering. Per planting, in the
 * order a grower meets them: the ground can refuse it (rotation), the climate can refuse it (the
 * recommendation pipeline's own gate), the soil can refuse it (pH), the year's frost can kill it,
 * the year's season can be too short for it, the panels can starve it, and only then is there a
 * harvest, drawn inside the literature's band and cut by thirst, by pests and by the companions it
 * grew beside. Every term is the application's own, or is declared as unsourced where it is not
 */
export const simulateSeason = (input: SeasonInput): SeasonResult => {
  const { site, year, plot, catalog, rules, rotation, season, seed, frostPercentile } = input
  const familyOf = (id: CropId): string | null => cropById(catalog, id)?.taxonomy.family ?? null
  const anchors = seasonAnchors(year.site, frostPercentile)
  const ratio = heatRatio(year.site, site)
  const outcomes: PlantingOutcome[] = []
  const tried: TriedRule[] = []
  // what the rules that actually fired ask of a gardener, deduplicated across every bed: two
  // beds undersown with the same cover is one job to learn, not two
  const managementTasks = new Set<string>()

  for (const bed of plot.beds) {
    const light = input.bedLight.find((entry) => entry.bedId === bed.id)
    const history = historyByYear(input.history, bed.id, season)
    const bedCrops = bed.plantings.map((entry) => ({
      planting: entry,
      crop: cropById(catalog, entry.cropId),
    }))

    for (const { planting, crop } of bedCrops) {
      if (crop === undefined) continue
      const selected = bedCrops
        .filter((other) => other.planting.id !== planting.id && other.crop !== undefined)
        .map((other) => other.crop as Crop)
      const context: InteractionContext = {
        candidate: crop,
        selected,
        historyByYear: history,
        familyOf,
        koppenCode: year.site.koppenCode,
        scale: 'bed',
      }

      /*
        A perennial that stood in this bed last season is standing, not sown, and rotation is a rule
        about what FOLLOWS a crop. Re-sowing every planting every season would ask it of plants that
        never left, and tell a ramps bed it was banned from itself for forty years. In the season it
        is first planted the rule applies as it does to anything else, because a new perennial after
        an infected crop of the same family is a real rotation question and the recommendation
        pipeline asks it too. The ground remembers it every season it stands, either way
      */
      const standing =
        PERENNIAL.has(crop.lifeCycle) && (history.get(season - 1) ?? []).includes(crop.id)

      const violation = standing ? null : rotationViolation(context, rotation)
      if (violation !== null) {
        outcomes.push(
          outcomeOf(
            bed,
            planting,
            'refused',
            // the plain name first and the Latin after it: a sentence opening with
            // "Plasmodiophora brassicae (clubroot)" reads as another language and stops the reader
            violation.rotationEffective
              ? `This crop family grew here too recently and the soil still carries ${commonName(violation.pathogen)}. The family needs ${String(violation.minIntervalYears ?? 0)} years off this bed (${violation.pathogen})`
              : `${commonName(violation.pathogen)} survives in this soil for ${String(violation.inoculumPersistenceYearsLow)} to ${String(violation.inoculumPersistenceYearsHigh)} years, and no rest period clears it. ${violation.alternativeControl ?? ''} (${violation.pathogen})`.trim(),
          ),
        )
        continue
      }

      const climate = climateGate(crop, year.site, frostPercentile)
      if (!climate.passed) {
        outcomes.push(
          outcomeOf(
            bed,
            planting,
            'climate',
            climate.limiting?.explanation ?? "The climate here is outside this crop's range",
          ),
        )
        continue
      }

      const soil = soilWaterStage(crop, bed, year.site)
      if (!soil.passed) {
        outcomes.push(
          outcomeOf(
            bed,
            planting,
            'soil',
            soil.limiting?.explanation ?? "This bed's soil is outside this crop's tolerated range",
          ),
        )
        continue
      }

      /*
        The frost this year actually had, against this planting's own dates.

        `seasonAnchors` on the year's site returns the year's own two dates at any percentile,
        and `frostHardy` is the designer's own reading of whether a crop minds one. A tender crop
        in the open before the last spring frost is lost at sowing; one whose harvest starts after
        the first fall frost is lost before it; one that cannot mature in the days between is
        unripe. A hardy crop skips all three, because it overwinters.

        A crop of a class the calendar raises under cover is sown indoors: its sow day is the
        calendar's indoor start, `INDOOR_RAISING_DAYS` before the day it is set out, and the frost
        it can meet is the one on the day it goes out. Read as a seedling in frozen ground, the
        example garden's tomato (sown day 88 for a day 130 setting out, picked from September) would
        be lost to frost every season
      */
      // with no frost at this setting there is no freeze to ripen against, so nothing is unripe
      const hardy = frostHardy(crop, anchors.thresholdC) || anchors.frostFree
      const window = anchors.frostFreeDays
      const sownAfter = forwardDays(anchors.lastSpringFreeze, planting.sowDay)
      const raisingDays = INDOOR_RAISING_DAYS[crop.dliClass]
      const raised = raisingDays > 0 && sownAfter > window
      const setOutDay = raised ? wrapDayOfYear(planting.sowDay + raisingDays) : planting.sowDay
      const outAfter = forwardDays(anchors.lastSpringFreeze, setOutDay)
      if (!hardy && outAfter > window) {
        outcomes.push(
          outcomeOf(
            bed,
            planting,
            'frosted',
            `${raised ? `Sown under cover on day ${String(planting.sowDay)} and set out on day ${String(setOutDay)}` : `Sown on day ${String(planting.sowDay)}`}, outside this year's frost-free window from day ${String(anchors.lastSpringFreeze)} to day ${String(anchors.firstFallFreeze)}. ${cropLabel(crop)} doesn't tolerate frost`,
          ),
        )
        continue
      }
      const harvestAfter = forwardDays(anchors.lastSpringFreeze, planting.harvestStartDay)
      if (!hardy && harvestAfter > window) {
        outcomes.push(
          outcomeOf(
            bed,
            planting,
            'frosted',
            `The first fall frost came on day ${String(anchors.firstFallFreeze)}, before a harvest that starts on day ${String(planting.harvestStartDay)}`,
          ),
        )
        continue
      }
      // the maturity clock runs from the day the catalogue's figure counts from: sowing, indoors
      // or out, for a sow-referenced figure, and the setting-out day for a transplant-referenced one
      const needed = siteMaturityDays(crop, year.site, anchors.frostFreeDays)
      const clockFrom = crop.thermal?.dtmReference === 'transplant' ? setOutDay : planting.sowDay
      const daysToFrost = forwardDays(clockFrom, anchors.firstFallFreeze)
      if (!hardy && needed > daysToFrost) {
        outcomes.push(
          outcomeOf(
            bed,
            planting,
            'unripe',
            `${cropLabel(crop)} needs about ${String(needed)} days to mature here and this sowing had ${String(daysToFrost)} before the first fall frost`,
          ),
        )
        continue
      }
      // a harvest window that runs past the first fall frost is cut short by it, and says so;
      // the draw below is for the whole window, since nothing here prices the days lost
      const frostCutDay =
        !hardy && forwardDays(anchors.lastSpringFreeze, planting.harvestEndDay) > window
          ? anchors.firstFallFreeze
          : undefined

      if (light === undefined) {
        outcomes.push(
          outcomeOf(
            bed,
            planting,
            'unlit',
            "The light in this bed hasn't been simulated yet. Run the light simulation first",
          ),
        )
        continue
      }
      const gate = lightGate(crop, light, year.site)
      if (!gate.passed) {
        outcomes.push(
          outcomeOf(
            bed,
            planting,
            'too-dark',
            gate.limiting?.explanation ?? "Light in this bed is below this crop's minimum",
          ),
        )
        continue
      }

      const space = spaceStage(crop, bed, plot.arrays, DEFAULT_TARGET_YEAR)
      const estimate = estimateYield(
        crop.id,
        bed.id,
        laubCurve(crop.laubGroup, crop.laubGroupNote),
        gate.light.cumulativeRsr,
        crowdingYieldPenalty(space.crowdingIndex),
        year.site.waterLimitation.limited,
        [],
      )
      const band = estimate.relativeYield
      const drawn = drawInBand(band, unit(seed, season, codeOf(planting.id as string)))

      // the companions this crop actually grew beside, at every grade, through the one question the
      // recommendation pipeline already asks: does this rule concern these two plants, here, at
      // this scale
      const applied = [...rules.scoreable, ...rules.experimental, ...rules.folklore].filter(
        (rule) => ruleAppliesInContext(rule, context),
      )
      let companionYield = 1
      let suppression = 1
      const companions: RuleId[] = []
      const triedHere: RuleId[] = []
      for (const rule of applied) {
        for (const task of rule.scope.requiresManagement) managementTasks.add(task)
        if (measured(rule)) {
          companions.push(rule.id)
          if (measuresYield(rule)) {
            // as measured, MINUS what the companion costs the bed: an intercrop that is pure
            // upside is the one thing a land equivalent ratio is not
            companionYield *= Math.max(0, unsafeBandMidpoint(rule.effect) - rule.competitionPenalty)
          }
          suppression *= pestSuppression(rule, rules.scoreable, seed)
          continue
        }
        // a mechanism with no measured effect, or a claim nobody has tested: a trial either way
        triedHere.push(rule.id)
        if (!untested(rule)) continue
        if (PEST_KINDS.has(rule.kind)) {
          suppression *= pestSuppression(rule, rules.scoreable, seed)
        } else if (hiddenTruth(rule, seed)) {
          const like = measuredEffectLike(rule, rules.scoreable)
          if (like !== null) companionYield *= Math.max(0, unsafeBandMidpoint(like))
        }
      }

      const crowding = crowdingOf(plot, crop.taxonomy.family, familyOf)
      const untreated = untreatedPressure(crowding.crowding, ratio)
      const pressure = Math.max(0, Math.min(1, untreated * suppression)) as Fraction
      const droughtPenalty = soil.droughtPenalty
      const realised = (drawn *
        (1 - droughtPenalty) *
        (1 - pestYieldLoss(pressure)) *
        companionYield) as Fraction

      const parts = [
        `${approxPercent(realised)} of full yield: a random draw within the published range for ${percent(gate.light.cumulativeRsr)} shade`,
        frostCutDay === undefined
          ? null
          : `The harvest runs to day ${String(planting.harvestEndDay)} and the first fall frost came on day ${String(frostCutDay)}, which cut it short. The yield drawn covers the whole harvest window`,
        pressure > 0.05 ? `Pests took ${percent(pestYieldLoss(pressure))}` : null,
        droughtPenalty > 0.02 ? `Water shortage took ${percent(droughtPenalty)}` : null,
        companionYield !== 1
          ? `The companion rules that applied multiplied the yield by ${companionYield.toFixed(2)}`
          : null,
        suppression < 1
          ? `A companion planting cut pest pressure to ${percent(suppression)} of the untreated level`
          : null,
        standing
          ? "This perennial stood in the bed from last season, so the rotation rule doesn't apply to it"
          : null,
      ].filter((part): part is string => part !== null)

      outcomes.push(
        outcomeOf(bed, planting, 'harvested', parts.join('. '), {
          band,
          realised,
          pestPressure: pressure,
          droughtPenalty,
          companions,
          tried: triedHere,
          ...(frostCutDay === undefined ? {} : { frostCutDay }),
        }),
      )
      for (const ruleId of triedHere) tried.push({ ruleId, bedId: bed.id, realised })
    }
  }

  /*
    Over EVERY planting planned, and not only the ones that reached the ground: a bed the ground,
    the climate or the soil refused counts as zero, the same as one the frost took. The standing
    this feeds is a land equivalent ratio, which is per bed of ground rather than per successful
    sowing, and leaving the refusals out of it made ignoring a rotation warning free and a frost
    expensive (`the convergence document` 7.1, item 8)
  */
  const harvestIndex =
    outcomes.length === 0
      ? null
      : ((outcomes.reduce((total, outcome) => total + outcome.realised, 0) /
          outcomes.length) as Fraction)
  const energy =
    plot.arrays.length === 0
      ? null
      : pvEnergyReport(
          year.site,
          plot.arrays,
          year.weather,
          chainOptionsFor(year.site, year.weather, plot.groundCover),
        )
  const energyKwh = energy === null ? null : energy.annualAcKwh
  const energyShare =
    energy === null || energy.reference.annualAcKwhPerM2Land <= 0
      ? null
      : ((energy.annualAcKwhPerM2Land / energy.reference.annualAcKwhPerM2Land) as Fraction)

  /*
    What it cost and what a year of it was worth, from `data/economy.ts` and nothing else. The
    cost needs an array and the value needs both an array and a price, so each is null on its own
    terms: a garden outside the United States has a build cost and no value unless a tariff was
    typed, and one with no panels has neither. The jobs are there either way, because a rule that
    asks for weekly work asks for it whether or not there is a panel on the plot
  */
  const price = priceInUse(input.economyInputs, input.retailPrice)
  const buildCostUsd = energy === null ? null : buildCostUsdBand(energy.nameplateDcKw)
  const installedCost = energy === null ? null : typedCostOf(input.economyInputs)
  const value =
    energy === null || price === null ? null : electricityValue(energy.annualAcKwh, price)
  const economy: SeasonEconomy = {
    buildCostUsd,
    installedCost,
    electricityValue: value,
    price,
    paybackYears: paybackOf(buildCostUsd, installedCost, value, price),
    managementTasks: [...managementTasks],
  }

  const records: SeasonRecord[] = outcomes
    .filter((outcome) => REMEMBERED.has(outcome.kind))
    .map((outcome) => ({
      season,
      year: year.summary.year,
      bedId: outcome.bedId,
      cropId: outcome.cropId,
      harvested: outcome.kind === 'harvested',
    }))

  return {
    report: {
      season,
      year: year.summary,
      outcomes,
      harvestIndex,
      energyKwh,
      energyShare,
      advice: advise(outcomes, year.summary, plot, harvestIndex, energyKwh),
      economy,
    },
    records,
    tried,
  }
}
