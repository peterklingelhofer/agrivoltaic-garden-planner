import { growingWindowFor } from '../../data/crops'
import { monthsInWindow } from '../../data/util'
import type { Crop } from '../../types/crop'
import type { LimitingFactor } from '../../types/recommend'
import { isTemperatureHardiness } from '../../types/site'
import type { ChillMetric, ExceedancePercentile, Site } from '../../types/site'
import type { Fraction } from '../../types/units'
import type { MembershipScore } from '../membership'
import { ecocropMembership } from '../membership'

/**
 * Every gate below reads the SITE, and reads it identically for a bed under a panel and a bed in
 * the open. Only the light gate is per-bed. That asymmetry is deliberate and Decision Record 2.7
 * is why: the primary literature's under-panel air-temperature effects contradict each other
 * between climates, so there's no defensible per-bed adjustment to make here. `frost.ts` reports
 * the geometry that WOULD drive one, in words, and derives nothing from it.
 *
 * If a measured figure ever arrives, note that two of these move in opposite directions: milder
 * nights under an array would lengthen the frost-free window and SHORTEN the chill accumulation
 * `chillGate` reads, and shade would cut the degree-days `seasonGddGate` reads at the same time
 */
export interface GateOutcome {
  readonly passed: boolean
  readonly limiting: LimitingFactor | null
}

export const PASSED: GateOutcome = { passed: true, limiting: null }

const fail = (limiting: LimitingFactor): GateOutcome => ({ passed: false, limiting })

export const isPerennial = (crop: Crop): boolean =>
  crop.lifeCycle === 'perennial' || crop.lifeCycle === 'woody-perennial'

/**
 * Only the temperature schemes gate. An NRCan zone is an index score and the union gives it
 * no temperature to read, so a Canadian site gates on its ERA5-derived rating and its
 * published zone informs the user without touching the filter
 */
export const siteExtremeMinC = (site: Site): number => {
  let coldest = Number.POSITIVE_INFINITY
  for (const rating of site.hardiness)
    if (isTemperatureHardiness(rating)) coldest = Math.min(coldest, rating.extremeMinTempC)
  return Number.isFinite(coldest) ? coldest : 0
}

/**
 * Hardiness gates perennials only. Filtering an annual vegetable by hardiness
 * zone is a category error (Decision Record 2.6)
 */
export const hardinessGate = (crop: Crop, site: Site): GateOutcome => {
  if (!isPerennial(crop)) return PASSED
  const limit = crop.coldHardinessMinC
  if (limit === null) return PASSED
  const extreme = siteExtremeMinC(site)
  if (extreme >= limit.value) return PASSED
  return fail({
    stage: 'climate-gate',
    cause: { kind: 'hardiness' },
    membership: 0 as Fraction,
    explanation: `The year's lowest temperature here averages ${extreme.toFixed(1)} C, below this crop's ${limit.value.toFixed(1)} C cold limit`,
  })
}

const siteChill = (site: Site, metric: ChillMetric): number => {
  switch (metric) {
    case 'chilling-hours':
      return site.chill.chillingHours
    case 'utah-chill-units':
      return site.chill.utahChillUnits
    case 'dynamic-chill-portions':
      return site.chill.dynamicChillPortions
  }
}

export const CHILL_METRIC_LABEL: Readonly<Record<ChillMetric, string>> = {
  'chilling-hours': 'chilling hours',
  'utah-chill-units': 'Utah chill units',
  'dynamic-chill-portions': 'chill portions',
}

/**
 * Compared like with like and never converted. Luedeling and Brown measured a
 * CH to CP ratio spanning 0 to 34 across global sites, so the three metrics aren't
 * interconvertible (Decision Record 10)
 */
export const chillGate = (crop: Crop, site: Site): GateOutcome => {
  const requirement = crop.chill
  if (requirement === null) return PASSED
  const available = siteChill(site, requirement.metric)
  if (available >= requirement.amount) return PASSED
  return fail({
    stage: 'climate-gate',
    cause: { kind: 'chill' },
    membership: Math.max(available / Math.max(requirement.amount, 1), 0) as Fraction,
    explanation: `This site accumulates about ${Math.round(available).toString()} ${CHILL_METRIC_LABEL[requirement.metric]}, fewer than the ${String(requirement.amount)} this crop needs to break dormancy cleanly`,
  })
}

export const seasonGddAvailable = (crop: Crop, site: Site): number => {
  const base = crop.thermal?.gddBaseC ?? 10
  return Math.abs(base - 10) <= Math.abs(base - 4.4)
    ? site.seasonGdd.base10C
    : site.seasonGdd.base4C
}

/**
 * The filter that actually decides whether an annual can finish, and the one
 * most garden apps omit
 */
export const seasonGddGate = (
  crop: Crop,
  site: Site,
  frostPercentile: ExceedancePercentile,
): GateOutcome => {
  const thermal = crop.thermal
  if (thermal === null) return PASSED
  const available = seasonGddAvailable(crop, site)
  if (available >= thermal.gddToMaturity) return PASSED
  return fail({
    stage: 'climate-gate',
    cause: { kind: 'season-gdd' },
    membership: Math.max(available / Math.max(thermal.gddToMaturity, 1), 0) as Fraction,
    explanation: `The frost-free season at the ${String(frostPercentile)} percent risk level supplies about ${Math.round(available).toString()} degree-days (each day's warmth above a base temperature, added up), fewer than the ${String(thermal.gddToMaturity)} this crop needs to reach maturity`,
  })
}

export const seasonLengthDays = (site: Site, frostPercentile: ExceedancePercentile): number => {
  const curve = site.frost[0]
  return curve === undefined ? 365 : curve.frostFreeDays[frostPercentile]
}

export const growingSeasonMeanTempC = (crop: Crop, site: Site): number => {
  const window = growingWindowFor(crop, site.location.latitudeDeg)
  const months = monthsInWindow(window.startMonth, window.endMonth)
  let total = 0
  for (const month of months) total += site.normals.monthlyMeanTempC[month - 1] ?? 0
  return months.length === 0 ? 0 : total / months.length
}

/**
 * ECOCROP's temperature range describes a crop's growing cycle, so an annual is rightly judged on
 * the mean of its own window: it's only in the ground then. A perennial stands in the same bed
 * every month of the year, so the hottest month is a temperature it has to survive, and
 * scoring it on its window alone is the mirror image of the category error Decision Record 2.6
 * names: it would let a spring woodland ephemeral read as a fine Phoenix crop on a 23 C
 * March-to-May mean while the 35 C July it can't walk away from goes unchecked. Liebig's law of
 * the minimum again, one level up: the crop is held to the worse of the two, so the limiting
 * parameter reported is the one that actually bites
 *
 * Only the hot limb is added, and only for perennials. Winter already has a gate that judges it
 * on the right metric, the mean annual extreme minimum against the crop's own cold hardiness.
 * Reading the coldest month against the ECOCROP floor as well would double-count winter and rule
 * out every dormant temperate perennial, an apple in Minnesota included. A whole-year mean would
 * be worse than either limb: averaging a lethal July with a mild January hides both
 */
const ecocropScore = (
  crop: Crop,
  site: Site,
  frostPercentile: ExceedancePercentile,
  irrigationAvailable: boolean,
): MembershipScore => {
  const scoreAt = (meanTempC: number): MembershipScore =>
    ecocropMembership(
      crop.envelope,
      {
        meanTempC,
        annualRainfallMm: site.normals.monthlyPrecipMm.reduce<number>((a, b) => a + b, 0),
        soilPh: site.soil.phUnits,
        seasonLengthDays: seasonLengthDays(site, frostPercentile),
        koppenCode: site.koppenCode,
      },
      irrigationAvailable,
    )
  const inSeason = scoreAt(growingSeasonMeanTempC(crop, site))
  if (!isPerennial(crop)) return inSeason
  const hottestMonth = scoreAt(Math.max(...site.normals.monthlyMeanTempC))
  return hottestMonth.overall < inSeason.overall ? hottestMonth : inSeason
}

export const ecocropGate = (
  crop: Crop,
  site: Site,
  frostPercentile: ExceedancePercentile,
  irrigationAvailable: boolean,
): GateOutcome => {
  const score = ecocropScore(crop, site, frostPercentile, irrigationAvailable)
  if (score.overall > 0) return PASSED
  return fail({
    stage: 'climate-gate',
    cause: { kind: 'fao-ecocrop', parameter: score.limitingParameter },
    membership: score.overall,
    explanation: `This site is outside the ${score.limitingParameter} range ECOCROP gives for this crop (FAO's database of the conditions crops tolerate)`,
  })
}

export const climateGate = (
  crop: Crop,
  site: Site,
  frostPercentile: ExceedancePercentile,
): GateOutcome => {
  for (const outcome of [
    hardinessGate(crop, site),
    chillGate(crop, site),
    seasonGddGate(crop, site, frostPercentile),
    ecocropGate(crop, site, frostPercentile, true),
  ]) {
    if (!outcome.passed) return outcome
  }
  return PASSED
}

export const climateFit = (
  crop: Crop,
  site: Site,
  frostPercentile: ExceedancePercentile,
  irrigationAvailable: boolean,
): Fraction => ecocropScore(crop, site, frostPercentile, irrigationAvailable).overall
