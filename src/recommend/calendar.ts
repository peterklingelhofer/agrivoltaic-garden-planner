import { growingWindowFor } from '../data/crops'
import {
  at,
  DAYS_PER_YEAR,
  lerp,
  mean,
  MONTH_LENGTH_DAYS,
  MONTH_NAMES,
  MONTH_START_DAY,
  monthOfDay,
  monthsInWindow,
  sum,
} from '../data/util'
import type {
  BedCalendar,
  CalendarBasis,
  CalendarFeasibility,
  CropCalendar,
  HarvestWindow,
  PlantingMethod,
  PlantingWindow,
} from '../types/calendar'
import type { CitationId } from '../types/citation-ids.generated'
import type { Crop, DliClass, ThermalRequirement } from '../types/crop'
import type { BedLight } from '../types/light'
import type { ExceedancePercentile, Site } from '../types/site'
import type { DayOfYear, Days } from '../types/units'
import { seasonGddAvailable } from './stages/climate-gate'

/**
 * Every date is a day of year on a 365 day circle, and
 * every comparison is a forward distance from the season origin. A southern
 * hemisphere season runs from roughly day 270 to day 110 and would invert every
 * `<` written on raw day numbers
 */
export const wrapDayOfYear = (day: number): DayOfYear =>
  (((((Math.round(day) - 1) % DAYS_PER_YEAR) + DAYS_PER_YEAR) % DAYS_PER_YEAR) + 1) as DayOfYear

export const forwardDays = (from: number, to: number): number =>
  (((to - from) % DAYS_PER_YEAR) + DAYS_PER_YEAR) % DAYS_PER_YEAR

export const signedDays = (from: number, to: number): number => {
  const forward = forwardDays(from, to)
  return forward > DAYS_PER_YEAR / 2 ? forward - DAYS_PER_YEAR : forward
}

/** Month midpoints, so monthly normals can be read as a curve rather than as twelve steps */
const MONTH_MID_DAY: readonly number[] = MONTH_START_DAY.map(
  (start, index) => start + at(MONTH_LENGTH_DAYS, index) / 2,
)

/**
 * The point on the year circle every season comparison is measured forward from. Everything here
 * is a forward distance from it, so it has to fall OUTSIDE the span of season events: an origin
 * that lands between two of them cuts the season in half and the later event reads as the
 * earlier one.
 *
 * A fixed lead before the last spring freeze doesn't do that, and at a hot site it fails hard.
 * Phoenix's last spring freeze is day 35, so a 120 day lead would wrap the origin back to day 280,
 * seven weeks INTO the season it is meant to precede. A cucumber sown day 285 to beat a day 340
 * freeze would then sit 5 days after the origin and its day 121 floor 206 days after it, so a 164
 * day planting window would come out negative and the crop would be refused `season-too-short` by
 * 201 days at a site with a 305 day frost-free season. The same wrap would start the
 * soil-temperature search in October and have it answer with the first day it looked at.
 *
 * The midpoint of the FROST gap isn't the fix either, and here's why, so nobody
 * tries it again: at Phoenix's 50th percentile the freeze pair is day 353 to day 9, a gap of 21
 * days, and every crop with a frost offset of -14 or -28 days starts before its midpoint.
 *
 * The coldest point of the year is outside both. It's where a garden's year actually turns
 * over, it comes from the site's own monthly normals rather than from a constant, it doesn't
 * move with the risk percentile, and it's defined in the southern hemisphere and the tropics
 * for the same reason it is defined anywhere: some month is the coldest one
 */
export const seasonOrigin = (monthlyMeanTempC: readonly number[]): DayOfYear =>
  wrapDayOfYear(at(MONTH_MID_DAY, coldestMonth(monthlyMeanTempC)))

/** Zero-based, the first of the coldest months where two tie */
const coldestMonth = (monthlyMeanTempC: readonly number[]): number => {
  let coldest = 0
  for (let month = 1; month < MONTH_MID_DAY.length; month += 1) {
    if (at(monthlyMeanTempC, month) < at(monthlyMeanTempC, coldest)) coldest = month
  }
  return coldest
}

/** Below this the site supplies no usable heat. The floor only keeps the arithmetic finite */
export const MIN_SEASON_GDD_PER_DAY = 0.5

export interface SeasonAnchors {
  readonly lastSpringFreeze: DayOfYear
  readonly firstFallFreeze: DayOfYear
  readonly frostFreeDays: number
  /**
   * No frost in the record at this percentile. The pair is then the origin, the span the whole
   * year, and no sentence prints either day as a frost
   */
  readonly frostFree: boolean
  /** Years of the record with a frost, which is what a place-step sentence turns on */
  readonly frostYears: number
  readonly thresholdC: number
  readonly origin: DayOfYear
}

export const seasonAnchors = (site: Site, percentile: ExceedancePercentile): SeasonAnchors => {
  const curve = site.frost[0]
  const origin = seasonOrigin(site.normals.monthlyMeanTempC)
  const frostFree = curve?.frostFree[percentile] ?? false
  // with no frost the year turns over at its coldest point and both anchors sit there, so
  // nothing measured forward from one reaches a frost that never comes
  const lastSpringFreeze = frostFree
    ? origin
    : (curve?.lastSpringFreeze[percentile] ?? (1 as DayOfYear))
  const firstFallFreeze = frostFree
    ? origin
    : (curve?.firstFallFreeze[percentile] ?? (DAYS_PER_YEAR as DayOfYear))
  const span = forwardDays(lastSpringFreeze, firstFallFreeze)
  return {
    lastSpringFreeze,
    firstFallFreeze,
    // derived from the pair rather than read off frostFreeDays so a wrapped season is right
    frostFreeDays: span === 0 ? DAYS_PER_YEAR : span,
    frostFree,
    frostYears: curve?.frostYears ?? 0,
    thresholdC: curve?.thresholdC ?? 0,
    origin,
  }
}

/**
 * Days a transplant spends under cover before it goes out, by DLI class. Zero marks a crop that is
 * direct sown only, which is the same statement as "not transplantable", so the two never disagree.
 * A class-level inference from Extension transplant guidance, with no work in the verified corpus
 */
export const INDOOR_RAISING_DAYS: Readonly<Record<DliClass, number>> = {
  'understory-herbs': 42,
  'leafy-greens': 28,
  'forages-c3-pasture': 0,
  'cane-bush-berries': 0,
  strawberry: 0,
  brassicas: 35,
  'root-tuber': 0,
  solanaceae: 42,
  cucurbits: 21,
  alliums: 56,
  'grain-legumes': 0,
  'c3-cereals': 0,
  'corn-c4': 0,
}

export const CALENDAR_PROVENANCE_NOTE =
  "Frost dates are computed from the daily climate normals for this place (Open-Meteo, or NASA POWER when Open-Meteo has no answer) at the chosen frost exceedance percentile, the share of years a frost falls outside the dates. The frost offset, the minimum soil temperature and the days-to-maturity figure are curated from land-grant Extension guidance. That guidance isn't in the Sources list, so those three have no citation of their own"

export const FROST_FREE_NOTE =
  "The record has no frost at this risk setting, so every date is a soil-temperature date. The monthly mean air temperature for this place (Open-Meteo, or NASA POWER when Open-Meteo has no answer) stands in for soil temperature at seeding depth. The minimum soil temperature and the days-to-maturity figure are curated from land-grant Extension guidance. That guidance isn't in the Sources list, so they have no citation of their own"

export const SOIL_PROXY_NOTE =
  'The soil-temperature date uses the monthly mean air temperature as a proxy for soil temperature at seeding depth, so the date can come too early in a cold, wet spring'

/** The share of the year's rain the months above the mean must hold to be named as the wet season */
const WET_SEASON_SHARE = 0.7

interface MonthRun {
  readonly start: number
  readonly length: number
}

/** Runs of consecutive entries in `months` (each a 0-based month index), wrapping past December */
const monthRuns = (months: readonly number[]): readonly MonthRun[] => {
  const wet = new Set(months)
  let first = 0
  while (wet.has(first)) first += 1
  const runs: MonthRun[] = []
  let start: number | null = null
  for (let step = 1; step <= 12; step += 1) {
    const month = (first + step) % 12
    if (wet.has(month)) {
      start ??= month
    } else if (start !== null) {
      runs.push({ start, length: (month - start + 12) % 12 || 12 })
      start = null
    }
  }
  return runs.sort((a, b) => a.start - b.start)
}

const runLabel = (run: MonthRun): string => {
  const first = MONTH_NAMES[run.start] ?? ''
  if (run.length === 1) return first
  const last = MONTH_NAMES[(run.start + run.length - 1) % 12] ?? ''
  return `${first} to ${last}`
}

/**
 * One sentence naming the wet season, where the calendar has no sowing model for it: a wet
 * month is one whose rain is above the year's monthly mean. Every run of consecutive wet
 * months is named, wrapping past December, where those months together hold at least
 * WET_SEASON_SHARE of the year's rain and number six or fewer; a place with two rainy seasons,
 * such as Nairobi's long and short rains, gets both named rather than only the wetter one
 */
export const wetSeasonNote = (monthlyPrecipMm: readonly number[]): string | null => {
  const total = sum(monthlyPrecipMm)
  const threshold = mean(monthlyPrecipMm)
  const wetMonths = monthlyPrecipMm.flatMap((value, month) => (value > threshold ? [month] : []))
  if (total <= 0 || wetMonths.length === 0 || wetMonths.length > 6) return null
  const wetTotal = sum(wetMonths.map((month) => at(monthlyPrecipMm, month)))
  if (wetTotal < WET_SEASON_SHARE * total) return null
  const rains = monthRuns(wetMonths).map(runLabel).join(' and ')
  return `The rains here fall mostly in ${rains}. This calendar doesn't model them, so sow with the rains as local practice says`
}

const withWetSeason = (site: Site, first: string): string[] => {
  const wet = wetSeasonNote(site.normals.monthlyPrecipMm)
  return wet === null ? [first] : [first, wet]
}

export const FALL_HARVEST_NO_ROOM_NOTE =
  'This crop is usually sown late to mature into autumn, but the season here has no room for a late sowing, so the spring dates stand'

const FROST_CITATIONS: readonly CitationId[] = ['open-meteo']

export const citationsFor = (basis: CalendarBasis, crop: Crop): readonly CitationId[] => {
  switch (basis.kind) {
    case 'frost-offset':
    case 'soil-temperature':
    case 'days-to-maturity':
      return FROST_CITATIONS
    case 'light-window':
      return crop.light.dliMinMolM2Day.citations
    case 'catalog-window':
      return []
  }
}

const firstDayOfMonth = (month: number): DayOfYear =>
  (at(MONTH_START_DAY, month - 1) + 1) as DayOfYear

const lastDayOfMonth = (month: number): DayOfYear =>
  (at(MONTH_START_DAY, month - 1) + at(MONTH_LENGTH_DAYS, month - 1)) as DayOfYear

/** Monthly normals read as a continuous curve through the month midpoints */
export const monthlyValueOnDay = (values: readonly number[], day: number): number => {
  for (let index = 0; index < 12; index += 1) {
    const next = (index + 1) % 12
    const span = forwardDays(at(MONTH_MID_DAY, index), at(MONTH_MID_DAY, next))
    const offset = forwardDays(at(MONTH_MID_DAY, index), day)
    if (offset < span)
      return lerp(at(values, index), at(values, next), span === 0 ? 0 : offset / span)
  }
  return at(values, 0)
}

export const firstDayAtOrAbove = (
  values: readonly number[],
  thresholdC: number,
  fromDay: DayOfYear,
): DayOfYear | null => {
  for (let step = 0; step < DAYS_PER_YEAR; step += 1) {
    const day = wrapDayOfYear(fromDay + step)
    if (monthlyValueOnDay(values, day) >= thresholdC) return day
  }
  return null
}

export const cropMonths = (crop: Crop, site: Site): readonly number[] => {
  const window = growingWindowFor(crop, site.location.latitudeDeg)
  return monthsInWindow(window.startMonth, window.endMonth)
}

export interface LightWindow {
  readonly firstMonth: number
  readonly lastMonth: number
}

/**
 * The agrivoltaic narrowing: the first unbroken run of months inside the crop's
 * own growing window where this bed's simulated DLI clears the crop minimum.
 * A bed under panels opens later in spring and closes earlier in autumn
 */
export const adequateLightWindow = (
  crop: Crop,
  site: Site,
  light: BedLight,
): LightWindow | null => {
  const minimum = crop.light.dliMinMolM2Day.value
  let firstMonth: number | null = null
  let lastMonth = 0
  for (const month of cropMonths(crop, site)) {
    if (at(light.monthlyMeanDliMolM2Day, month - 1) >= minimum) {
      firstMonth ??= month
      lastMonth = month
    } else if (firstMonth !== null) break
  }
  return firstMonth === null ? null : { firstMonth, lastMonth }
}

export const brightestMonth = (crop: Crop, site: Site, light: BedLight): number => {
  const months = cropMonths(crop, site)
  let best = months[0] ?? 1
  let brightest = Number.NEGATIVE_INFINITY
  for (const month of months) {
    const dli = at(light.monthlyMeanDliMolM2Day, month - 1)
    if (dli > brightest) {
      brightest = dli
      best = month
    }
  }
  return best
}

/**
 * Days from the crop's own days-to-maturity reference point to maturity at this
 * site. GDD transfers across latitudes and DTM doesn't, so the slower of the
 * two is taken: a catalog figure measured in a warmer trial region must not
 * promise a harvest the local heat supply can't deliver
 */
export const siteMaturityDays = (crop: Crop, site: Site, frostFreeDays: number): number => {
  const thermal = crop.thermal
  if (thermal === null) return 0
  const gddPerDay = Math.max(
    seasonGddAvailable(crop, site) / Math.max(frostFreeDays, 1),
    MIN_SEASON_GDD_PER_DAY,
  )
  return Math.max(thermal.daysToMaturity, Math.ceil(thermal.gddToMaturity / gddPerDay))
}

/**
 * Hardiness decides whether a harvest may run past the first autumn freeze.
 * Where the catalog carries no cold limit the sign of the frost offset says
 * the same thing: a crop planted before the last frost tolerates one
 */
export const frostHardy = (crop: Crop, thresholdC: number): boolean =>
  crop.coldHardinessMinC === null
    ? crop.frostOffsetDays <= 0
    : crop.coldHardinessMinC.value <= thresholdC

export const successionDays = (
  crop: Crop,
  from: DayOfYear,
  to: DayOfYear,
): readonly DayOfYear[] => {
  const interval = crop.successionIntervalDays
  if (interval === null || interval <= 0) return []
  const span = forwardDays(from, to)
  const days: DayOfYear[] = []
  for (let offset = 0; offset <= span; offset += interval) days.push(wrapDayOfYear(from + offset))
  return days
}

interface DatedBasis {
  readonly day: DayOfYear
  readonly basis: CalendarBasis
}

const extreme = (
  origin: DayOfYear,
  first: DatedBasis,
  rest: readonly DatedBasis[],
  later: boolean,
): DatedBasis => {
  let best = first
  for (const item of rest) {
    const delta = forwardDays(origin, item.day) - forwardDays(origin, best.day)
    if (later ? delta > 0 : delta < 0) best = item
  }
  return best
}

export interface CalendarInput {
  readonly crop: Crop
  readonly site: Site
  readonly light: BedLight
  readonly percentile: ExceedancePercentile
}

const frostBasis = (
  anchor: 'last-spring-freeze' | 'first-fall-freeze',
  offsetDays: number,
  percentile: ExceedancePercentile,
): CalendarBasis => ({
  kind: 'frost-offset',
  anchor,
  offsetDays: offsetDays as Days,
  percentile,
})

const plantingWindow = (
  crop: Crop,
  method: PlantingMethod,
  floor: DatedBasis,
  latest: DayOfYear,
): PlantingWindow => ({
  method,
  earliest: floor.day,
  // with the risk dial already set by the percentile there is no reason to wait
  recommended: floor.day,
  latest,
  basis: floor.basis,
  citations: citationsFor(floor.basis, crop),
})

const barren = (
  crop: Crop,
  anchors: SeasonAnchors,
  percentile: ExceedancePercentile,
  feasibility: CalendarFeasibility,
  notes: readonly string[],
): CropCalendar => ({
  cropId: crop.id,
  plantings: [],
  successions: [],
  harvest: {
    start: anchors.firstFallFreeze,
    end: anchors.firstFallFreeze,
    basis: { kind: 'days-to-maturity', backedOffDays: 0 as Days },
  },
  feasibility,
  frostRiskPercentile: percentile,
  notes,
})

/**
 * One crop in one bed. Rules, in order: a crop that can't finish never gets a
 * date, a bed that never lights the crop never gets a date, and everything else
 * is anchored to the frost pair at the user's own risk percentile
 */
export const cropCalendar = (input: CalendarInput): CropCalendar => {
  const { crop, site, light, percentile } = input
  const anchors = seasonAnchors(site, percentile)
  if (anchors.frostFree) return frostFreeCalendar(input, anchors)
  const notes: string[] = withWetSeason(site, CALENDAR_PROVENANCE_NOTE)
  const thermal = crop.thermal
  const raisingDays = INDOOR_RAISING_DAYS[crop.dliClass]
  const reference = siteMaturityDays(crop, site, anchors.frostFreeDays)
  const unlit = (): CropCalendar =>
    barren(
      crop,
      anchors,
      percentile,
      { kind: 'light-limited', month: brightestMonth(crop, site, light) },
      notes,
    )

  if (thermal !== null) {
    if (reference > thermal.daysToMaturity) {
      notes.push(
        `The heat supply here stretches maturity from the catalog's ${String(thermal.daysToMaturity)} days to about ${String(reference)}`,
      )
    }
    // a transplant-referenced DTM excludes the raising period, a sow-referenced one includes it
    const fromSow = reference + (thermal.dtmReference === 'transplant' ? raisingDays : 0)
    const fromTransplant =
      thermal.dtmReference === 'transplant' ? reference : Math.max(reference - raisingDays, 1)
    const transplantable = raisingDays > 0
    const bestCase = transplantable ? Math.min(fromSow, fromTransplant) : fromSow
    const shortfall = Math.ceil(bestCase - anchors.frostFreeDays)
    // this shortfall is measured against the frost-free season alone, which is the right season
    // for a crop the calendar dates automatically and the wrong one for a crop sown, by its own
    // catalog window, to spend the frozen months in the ground on purpose: see the garlic row
    if (shortfall > 0 && crop.sowWindow === null) {
      const gddSupply = seasonGddAvailable(crop, site)
      if (gddSupply < thermal.gddToMaturity) {
        notes.push(
          `The season supplies about ${String(Math.round(gddSupply))} degree-days (each day's warmth above a base temperature, added up) and this crop needs ${String(thermal.gddToMaturity)}`,
        )
      }
      return barren(
        crop,
        anchors,
        percentile,
        { kind: 'season-too-short', shortfallDays: shortfall as Days },
        notes,
      )
    }

    const lit = adequateLightWindow(crop, site, light)
    if (lit === null) return unlit()

    // a crop with its own catalog sow window has already told the calendar when it goes in the
    // ground, so running longer than the frost-free season must not read as "raise it indoors
    // instead": that inference is for a crop whose dates are otherwise computed automatically.
    // Garlic is 240-plus days sow to harvest because most of them are spent dormant over winter,
    // and that's no sign it needs raising under cover
    const usesTransplant =
      transplantable &&
      (thermal.dtmReference === 'transplant' ||
        (crop.sowWindow === null && fromSow > anchors.frostFreeDays))
    const fieldDays = usesTransplant ? fromTransplant : fromSow
    return annualCalendar({
      crop,
      site,
      percentile,
      anchors,
      lit,
      notes,
      fieldDays,
      raisingDays: usesTransplant ? raisingDays : 0,
      forced: usesTransplant && fromSow > anchors.frostFreeDays,
    })
  }

  const lit = adequateLightWindow(crop, site, light)
  return lit === null ? unlit() : perennialCalendar({ crop, site, percentile, anchors, lit, notes })
}

interface DatedInput {
  readonly crop: Crop
  readonly site: Site
  readonly percentile: ExceedancePercentile
  readonly anchors: SeasonAnchors
  readonly lit: LightWindow
  readonly notes: string[]
}

/**
 * A month bound is only a light bound where shade actually moved it. Where the
 * lit run still spans the whole catalog window the constraint is the
 * catalog, and saying otherwise would credit the panels with someone else's
 * decision
 */
const monthBasis = (lit: LightWindow, narrowed: boolean): CalendarBasis =>
  narrowed
    ? { kind: 'light-window', firstAdequateMonth: lit.firstMonth }
    : { kind: 'catalog-window' }

const plantingFloor = (input: DatedInput): DatedBasis => {
  const { crop, site, anchors, lit, notes } = input
  /*
    A catalog sow window is the curator's own answer, which no heuristic can
    outvote. Every other candidate below is measured forward from `anchors.lastSpringFreeze`,
    which is the right anchor for a crop sown in spring and wrong for one sown in autumn: garlic
    goes in the ground in October, and a floor measured from the SPRING freeze would either land
    the sowing in the wrong season or, once the season is long enough to matter, read as an
    impossible window and refuse the crop outright. See the garlic row in `data/catalog/rows.ts`
  */
  if (crop.sowWindow !== null) {
    return { day: crop.sowWindow.earliest, basis: { kind: 'catalog-window' } }
  }
  const window = growingWindowFor(crop, site.location.latitudeDeg)
  const candidates: DatedBasis[] = [
    {
      day: firstDayOfMonth(lit.firstMonth),
      basis: monthBasis(lit, lit.firstMonth !== window.startMonth),
    },
  ]
  const soilDay = firstDayAtOrAbove(
    site.normals.monthlyMeanTempC,
    crop.minSoilTempC,
    anchors.origin,
  )
  if (soilDay !== null) {
    candidates.push({
      day: soilDay,
      basis: { kind: 'soil-temperature', minSoilTempC: crop.minSoilTempC },
    })
  }
  const floor = extreme(
    anchors.origin,
    {
      day: wrapDayOfYear(anchors.lastSpringFreeze + crop.frostOffsetDays),
      basis: frostBasis('last-spring-freeze', crop.frostOffsetDays, input.percentile),
    },
    candidates,
    true,
  )
  if (floor.basis.kind === 'soil-temperature') notes.push(SOIL_PROXY_NOTE)
  return floor
}

const plantingCeiling = (input: DatedInput, fieldDays: number): DatedBasis => {
  const { crop, site, anchors, lit } = input
  // the mirror of the floor above: an explicit sow window is authoritative here too. Left to the
  // usual candidates, the "days to maturity before the first fall freeze" term below assumes the
  // whole cycle fits before THIS cycle's own fall freeze, which is never true of a crop sown in
  // autumn to be harvested the following summer, and it would win the comparison anyway, being
  // the smallest forward distance from a winter origin
  if (crop.sowWindow !== null) {
    return { day: crop.sowWindow.latest, basis: { kind: 'catalog-window' } }
  }
  const window = growingWindowFor(crop, site.location.latitudeDeg)
  const candidates: DatedBasis[] = [
    {
      day: lastDayOfMonth(lit.lastMonth),
      basis: monthBasis(lit, lit.lastMonth !== window.endMonth),
    },
  ]
  return extreme(
    anchors.origin,
    {
      // a fall sowing is the first autumn freeze counted back by the days to maturity
      day: wrapDayOfYear(anchors.firstFallFreeze - fieldDays),
      basis: { kind: 'days-to-maturity', backedOffDays: fieldDays as Days },
    },
    candidates,
    false,
  )
}

const harvestWindow = (
  crop: Crop,
  anchors: SeasonAnchors,
  sowDay: DayOfYear,
  fieldDays: number,
): HarvestWindow => {
  const start = wrapDayOfYear(sowDay + fieldDays)
  const end = wrapDayOfYear(start + crop.harvestDurationDays)
  const cut =
    !anchors.frostFree &&
    !frostHardy(crop, anchors.thresholdC) &&
    forwardDays(start, end) > forwardDays(start, anchors.firstFallFreeze)
  return {
    start,
    end: cut ? anchors.firstFallFreeze : end,
    basis: { kind: 'days-to-maturity', backedOffDays: fieldDays as Days },
  }
}

interface AnnualInput extends DatedInput {
  readonly fieldDays: number
  readonly raisingDays: number
  readonly forced: boolean
}

const annualCalendar = (input: AnnualInput): CropCalendar => {
  const { crop, anchors, lit, notes, fieldDays, raisingDays, forced, percentile } = input
  const spring = plantingFloor(input)
  const ceiling = plantingCeiling(input, fieldDays)
  /*
    A crop grown to mature into autumn is dated from the autumn end: the latest sowing that still
    finishes its harvest by the first fall freeze, which is the second sowing below for any
    frost-hardy crop and the only one here. Dated from the spring floor, Brussels sprouts would be
    transplanted on April 3 and harvested in the July heat, where every Extension sheet for the
    northeast sows them in late May for October. The spring floor stays where the season is too
    short for a full first cycle before that sowing, with a note
  */
  const fallSow = wrapDayOfYear(ceiling.day - crop.harvestDurationDays)
  const afterSpring = forwardDays(anchors.origin, fallSow) - forwardDays(anchors.origin, spring.day)
  // one cycle has to fit between the spring floor and the autumn end. A second sowing needs a
  // whole first cycle in front of it as well
  const roomForFall = afterSpring >= fieldDays
  const fallFirst = crop.fallHarvest && frostHardy(crop, anchors.thresholdC) && afterSpring >= 0
  const floor: DatedBasis = fallFirst
    ? {
        day: fallSow,
        basis: {
          kind: 'days-to-maturity',
          backedOffDays: (fieldDays + crop.harvestDurationDays) as Days,
        },
      }
    : spring
  if (crop.fallHarvest && !fallFirst) notes.push(FALL_HARVEST_NO_ROOM_NOTE)
  const openDays = forwardDays(anchors.origin, ceiling.day) - forwardDays(anchors.origin, floor.day)

  if (openDays < 0) {
    const lightClosed = floor.basis.kind === 'light-window' || ceiling.basis.kind === 'light-window'
    return barren(
      crop,
      anchors,
      percentile,
      lightClosed
        ? {
            kind: 'light-limited',
            month: ceiling.basis.kind === 'light-window' ? lit.lastMonth : lit.firstMonth,
          }
        : { kind: 'season-too-short', shortfallDays: -openDays as Days },
      notes,
    )
  }

  const plantings: PlantingWindow[] = []
  const indoorStart = wrapDayOfYear(floor.day - raisingDays)
  if (raisingDays > 0) {
    plantings.push({
      method: 'start-indoors',
      earliest: indoorStart,
      recommended: indoorStart,
      latest: wrapDayOfYear(ceiling.day - raisingDays),
      // the indoor start is the transplant floor counted back by the raising period, so it inherits
      // whatever constraint set that floor. Hardcoding a frost basis here would claim frost
      // provenance for dates the frost anchor never determined
      basis: floor.basis,
      citations: citationsFor(floor.basis, crop),
    })
  }
  const method: PlantingMethod = raisingDays > 0 ? 'transplant-out' : 'direct-sow'
  plantings.push(plantingWindow(crop, method, floor, ceiling.day))

  // a second, autumn-maturing sowing, late enough that a full first cycle has finished. For a
  // fall crop it is the first and only one
  if (!fallFirst && frostHardy(crop, anchors.thresholdC) && roomForFall) {
    plantings.push({
      method,
      earliest: fallSow,
      recommended: fallSow,
      latest: ceiling.day,
      basis: {
        kind: 'days-to-maturity',
        backedOffDays: (fieldDays + crop.harvestDurationDays) as Days,
      },
      citations: FROST_CITATIONS,
    })
  }

  return {
    cropId: crop.id,
    plantings,
    successions: successionDays(crop, floor.day, ceiling.day),
    harvest: harvestWindow(crop, anchors, floor.day, fieldDays),
    feasibility: forced
      ? {
          kind: 'needs-indoor-start',
          weeksBefore: Math.round(-signedDays(anchors.lastSpringFreeze, indoorStart) / 7),
        }
      : { kind: 'fits', slackDays: openDays as Days },
    frostRiskPercentile: percentile,
    notes,
  }
}

/**
 * Perennials carry no thermal requirement, so no maturity date can be computed
 * and none is invented. The window is the frost-anchored planting season and
 * the harvest is the catalog growing window
 */
const perennialCalendar = (input: DatedInput): CropCalendar => {
  const { crop, site, anchors, notes, percentile } = input
  const floor = plantingFloor(input)
  const window = growingWindowFor(crop, site.location.latitudeDeg)
  const harvestStart = firstDayOfMonth(window.endMonth)
  return {
    cropId: crop.id,
    plantings: [plantingWindow(crop, 'transplant-out', floor, anchors.firstFallFreeze)],
    successions: [],
    harvest: {
      start: harvestStart,
      end: wrapDayOfYear(harvestStart + crop.harvestDurationDays),
      basis: { kind: 'catalog-window' },
    },
    feasibility: { kind: 'no-thermal-data' },
    frostRiskPercentile: percentile,
    notes,
  }
}

export interface DayRun {
  readonly start: DayOfYear
  readonly end: DayOfYear
  readonly days: number
}

/**
 * The runs of days, wrapping past December 31, on which `fits` holds, longest first. When every day
 * fits, the result is one run of the whole year from the first day of the coldest month: a sowing
 * at the coolest safe time gives the longest run before the heat
 */
export const dayRuns = (
  fits: (day: DayOfYear) => boolean,
  monthlyMeanTempC: readonly number[],
): readonly DayRun[] => {
  let first = 1
  while (first <= DAYS_PER_YEAR && fits(first as DayOfYear)) first += 1
  if (first > DAYS_PER_YEAR) {
    const start = firstDayOfMonth(coldestMonth(monthlyMeanTempC) + 1)
    return [{ start, end: wrapDayOfYear(start - 1), days: DAYS_PER_YEAR }]
  }
  const runs: DayRun[] = []
  let start: DayOfYear | null = null
  // the walk starts on a day that fails and ends on it again, so a run across new year is read
  // whole and the last run is closed
  for (let step = 1; step <= DAYS_PER_YEAR; step += 1) {
    const day = wrapDayOfYear(first + step)
    if (fits(day)) {
      start ??= day
    } else if (start !== null) {
      runs.push({ start, end: wrapDayOfYear(day - 1), days: forwardDays(start, day) })
      start = null
    }
  }
  return runs.sort((a, b) => b.days - a.days)
}

/**
 * Days from a sowing until the monthly mean proxy, capped at the crop's cutoff, has supplied
 * its degree-days, with the catalog figure as the floor. Null when a whole year isn't enough
 */
export const maturityDaysFrom = (
  thermal: ThermalRequirement,
  monthlyMeanTempC: readonly number[],
  sowDay: DayOfYear,
): number | null => {
  let total = 0
  for (let step = 0; step < DAYS_PER_YEAR; step += 1) {
    const value = monthlyValueOnDay(monthlyMeanTempC, wrapDayOfYear(sowDay + step))
    const capped =
      thermal.gddUpperCutoffC === null ? value : Math.min(value, thermal.gddUpperCutoffC)
    total += Math.max(capped - thermal.gddBaseC, 0)
    if (total >= thermal.gddToMaturity) return Math.max(thermal.daysToMaturity, step + 1)
  }
  return null
}

/**
 * One crop in one bed where the record holds no frost at this percentile. No date is measured from
 * a frost: a sowing goes in on any run of days whose soil proxy meets the crop's minimum and, where
 * the archetype carries a heat cutoff, stays below it. The bed's own light can still close a month.
 * The marker is the start of the longest run
 */
const frostFreeCalendar = (input: CalendarInput, anchors: SeasonAnchors): CropCalendar => {
  const { crop, site, light, percentile } = input
  const means = site.normals.monthlyMeanTempC
  const notes = withWetSeason(site, FROST_FREE_NOTE)
  const thermal = crop.thermal
  const short = (shortfallDays: number): CropCalendar =>
    barren(
      crop,
      anchors,
      percentile,
      { kind: 'season-too-short', shortfallDays: Math.max(shortfallDays, 1) as Days },
      notes,
    )
  const unlit = (): CropCalendar =>
    barren(
      crop,
      anchors,
      percentile,
      { kind: 'light-limited', month: brightestMonth(crop, site, light) },
      notes,
    )
  if (adequateLightWindow(crop, site, light) === null) return unlit()

  const cutoff = thermal?.gddUpperCutoffC ?? null
  const warm = (day: DayOfYear): boolean => {
    const value = monthlyValueOnDay(means, day)
    return value >= crop.minSoilTempC && (cutoff === null || value < cutoff)
  }
  const bright = (day: DayOfYear): boolean =>
    at(light.monthlyMeanDliMolM2Day, monthOfDay(day - 1) - 1) >= crop.light.dliMinMolM2Day.value
  const soil = dayRuns(warm, means)
  const runs = dayRuns((day) => warm(day) && bright(day), means)
  const longest = runs[0]
  if (longest === undefined)
    return soil.length === 0 ? short(thermal?.daysToMaturity ?? 1) : unlit()
  // a bound is the bed's light only where shade moved it off the start of its soil run
  const basisOf = (run: DayRun): CalendarBasis =>
    soil.some((candidate) => candidate.start === run.start)
      ? { kind: 'soil-temperature', minSoilTempC: crop.minSoilTempC, frostFree: true }
      : { kind: 'light-window', firstAdequateMonth: monthOfDay(run.start - 1) }

  if (thermal === null) {
    // a perennial: no maturity date can be computed and none is invented, as on a frosted site
    const window = growingWindowFor(crop, site.location.latitudeDeg)
    const harvestStart = firstDayOfMonth(window.endMonth)
    return {
      cropId: crop.id,
      plantings: runs.map((run) =>
        plantingWindow(crop, 'transplant-out', { day: run.start, basis: basisOf(run) }, run.end),
      ),
      successions: [],
      harvest: {
        start: harvestStart,
        end: wrapDayOfYear(harvestStart + crop.harvestDurationDays),
        basis: { kind: 'catalog-window' },
      },
      feasibility: { kind: 'fits', slackDays: (longest.days - 1) as Days },
      frostRiskPercentile: percentile,
      notes,
    }
  }

  const fieldDays = maturityDaysFrom(thermal, means, longest.start)
  if (fieldDays === null) return short(thermal.daysToMaturity)
  if (fieldDays > thermal.daysToMaturity) {
    notes.push(
      `The heat supply here stretches maturity from the catalog's ${String(thermal.daysToMaturity)} days to about ${String(fieldDays)}`,
    )
  }
  // an annual finishes inside its run. The whole year is a run nothing outgrows
  const fits = (run: DayRun): boolean => run.days >= DAYS_PER_YEAR || run.days > fieldDays
  const usable = runs.filter(fits)
  const first = usable[0]
  // the soil alone would have given a long enough run: the bed's light is what closed it
  if (first === undefined) return soil.some(fits) ? unlit() : short(fieldDays - longest.days)
  const latestIn = (run: DayRun): DayOfYear =>
    run.days >= DAYS_PER_YEAR ? run.end : wrapDayOfYear(run.end - fieldDays)
  const raisingDays = thermal.dtmReference === 'transplant' ? INDOOR_RAISING_DAYS[crop.dliClass] : 0
  const method: PlantingMethod = raisingDays > 0 ? 'transplant-out' : 'direct-sow'
  const plantings = usable.flatMap((run): PlantingWindow[] => {
    const floor: DatedBasis = { day: run.start, basis: basisOf(run) }
    const out = plantingWindow(crop, method, floor, latestIn(run))
    if (raisingDays === 0) return [out]
    const indoors = wrapDayOfYear(run.start - raisingDays)
    return [
      {
        method: 'start-indoors',
        earliest: indoors,
        recommended: indoors,
        latest: wrapDayOfYear(latestIn(run) - raisingDays),
        basis: floor.basis,
        citations: citationsFor(floor.basis, crop),
      },
      out,
    ]
  })
  return {
    cropId: crop.id,
    plantings,
    successions: successionDays(crop, first.start, latestIn(first)),
    harvest: harvestWindow(crop, anchors, first.start, fieldDays),
    feasibility: { kind: 'fits', slackDays: forwardDays(first.start, latestIn(first)) as Days },
    frostRiskPercentile: percentile,
    notes,
  }
}

export const bedCalendar = (
  site: Site,
  light: BedLight,
  catalog: readonly Crop[],
  percentile: ExceedancePercentile,
): BedCalendar => ({
  bedId: light.bedId,
  entries: catalog.map((crop) => cropCalendar({ crop, site, light, percentile })),
})
