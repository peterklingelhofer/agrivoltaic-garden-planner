import type {
  BedCalendar,
  CalendarBasis,
  CalendarFeasibility,
  PlantingMethod,
} from '../types/calendar'
import type { Bed } from '../types/garden'
import type { RecommendationSet } from '../types/recommend'
import type { ExceedancePercentile } from '../types/site'
import type { MonthIndex } from '../types/units'
import { formatCelsius, monthLabel } from './format'

export const DAYS_IN_YEAR = 365
const MIN_BAR_PERCENT = 0.8

export interface TimelineSegment {
  readonly leftPercent: number
  readonly widthPercent: number
}

export const clampDay = (day: number): number =>
  Math.min(DAYS_IN_YEAR, Math.max(1, Math.round(day) || 1))

const asMonth = (month: number): MonthIndex =>
  Math.min(12, Math.max(1, Math.round(month) || 1)) as MonthIndex

export const dayPercent = (day: number): number => ((clampDay(day) - 1) / DAYS_IN_YEAR) * 100

export const wrapsYear = (start: number, end: number): boolean => clampDay(end) < clampDay(start)

const segment = (from: number, to: number): TimelineSegment => ({
  leftPercent: from,
  widthPercent: Math.max(MIN_BAR_PERCENT, to - from),
})

/** A southern-hemisphere window crosses December 31, so it draws as two segments */
export const timelineSegments = (start: number, end: number): readonly TimelineSegment[] =>
  wrapsYear(start, end)
    ? [segment(dayPercent(start), 100), segment(0, dayPercent(end))]
    : [segment(dayPercent(start), dayPercent(end))]

export const calendarDate = (
  day: number,
): { readonly month: MonthIndex; readonly date: number } => {
  const at = new Date(Date.UTC(2001, 0, clampDay(day)))
  return { month: (at.getUTCMonth() + 1) as MonthIndex, date: at.getUTCDate() }
}

/**
 * The inverse of `calendarDate`: a month and a date back to the day of the year.
 *
 * 2001 is the same non-leap reference year `calendarDate` uses, and it has to be: a planting
 * carries a day of the year and no year at all, so February 29 isn't a date this can be asked
 * for and a leap year would shift every day after it by one.
 *
 * The date is clamped into the month rather than allowed to roll over, which is what
 * `Date.UTC(2001, 1, 31)` would otherwise do: picking 31 and then picking February should leave a
 * gardener on February 28. Rolling over would silently put them on March 3
 */
export const dayOfYearFrom = (month: number, date: number): number => {
  const safeMonth = asMonth(month)
  const lastOfMonth = new Date(Date.UTC(2001, safeMonth, 0)).getUTCDate()
  const safeDate = Math.min(lastOfMonth, Math.max(1, Math.round(date) || 1))
  const at = Date.UTC(2001, safeMonth - 1, safeDate)
  return clampDay(Math.round((at - Date.UTC(2001, 0, 1)) / 86_400_000) + 1)
}

/** How many days the reference year gives a month, so a day picker can't offer September 31 */
export const daysInMonth = (month: number): number =>
  new Date(Date.UTC(2001, asMonth(month), 0)).getUTCDate()

export const dayLabel = (day: number): string => {
  const { month, date } = calendarDate(day)
  return `${monthLabel(month)} ${date}`
}

export const methodLabel = (method: PlantingMethod): string =>
  method === 'start-indoors'
    ? 'Start indoors'
    : method === 'direct-sow'
      ? 'Direct sow'
      : 'Transplant out'

export const basisKindLabel = (basis: CalendarBasis): string =>
  basis.kind === 'frost-offset'
    ? 'frost offset'
    : basis.kind === 'soil-temperature'
      ? 'soil temperature'
      : basis.kind === 'catalog-window'
        ? 'catalog window'
        : basis.kind === 'light-window'
          ? 'light window'
          : 'days to maturity'

/** Decision Record 7: no date is shown without the rule that produced it */
export const basisLabel = (basis: CalendarBasis): string => {
  if (basis.kind === 'frost-offset') {
    const anchor =
      basis.anchor === 'last-spring-freeze' ? 'the last spring freeze' : 'the first fall freeze'
    const side = basis.offsetDays < 0 ? 'before' : 'after'
    return `${Math.abs(basis.offsetDays)} days ${side} ${anchor}, ${basis.percentile}% frost risk`
  }
  if (basis.kind === 'soil-temperature')
    return `${basis.frostFree === true ? 'no frost here: dated by soil temperature only, ' : ''}soil at or above ${formatCelsius(basis.minSoilTempC)}`
  if (basis.kind === 'catalog-window') return 'the planting window in the crop catalog'
  if (basis.kind === 'light-window')
    return `first month with adequate light, ${monthLabel(asMonth(basis.firstAdequateMonth))}`
  return `${basis.backedOffDays} days, counted from the crop's days to maturity`
}

export type FeasibilityTone = 'ok' | 'warn' | 'error' | 'unknown'

export interface FeasibilitySummary {
  readonly kind: CalendarFeasibility['kind']
  readonly tone: FeasibilityTone
  readonly badge: string
  readonly detail: string
  /** False whenever the crop can't finish or no dates could be derived */
  readonly plantable: boolean
}

export const feasibilitySummary = (feasibility: CalendarFeasibility): FeasibilitySummary => {
  if (feasibility.kind === 'fits')
    return {
      kind: 'fits',
      tone: 'ok',
      badge: 'Fits the season',
      detail: `Finishes with ${feasibility.slackDays} days of slack`,
      plantable: true,
    }
  if (feasibility.kind === 'needs-indoor-start')
    return {
      kind: 'needs-indoor-start',
      tone: 'warn',
      badge: 'Indoor start required',
      detail: `Only finishes if sown under cover ${feasibility.weeksBefore} weeks before the outdoor date`,
      plantable: true,
    }
  if (feasibility.kind === 'season-too-short')
    return {
      kind: 'season-too-short',
      tone: 'error',
      badge: "Can't finish here",
      detail: `The season is ${feasibility.shortfallDays} days too short for this crop, so it can't be planted at this site`,
      plantable: false,
    }
  if (feasibility.kind === 'light-limited')
    return {
      kind: 'light-limited',
      tone: 'warn',
      badge: 'Light limited',
      detail: `Light falls below what the crop needs in ${monthLabel(asMonth(feasibility.month))}, so the dates are optimistic`,
      plantable: true,
    }
  return {
    kind: 'no-thermal-data',
    tone: 'unknown',
    badge: 'No thermal data',
    detail:
      'No average frost dates or soil temperatures on record for this site, so no date can be derived',
    plantable: false,
  }
}

export const NOTICE_CLASS: Readonly<Record<FeasibilityTone, string>> = {
  ok: 'notice notice-ready',
  warn: 'notice notice-warn',
  error: 'notice notice-error',
  unknown: 'notice notice-idle',
}

/**
 * What is in the bed first, then the ranking. The calendar dates every ranked crop, and a
 * plot with peppers and basil just planted used to open it to a first job about a tomato
 * in a bed nobody planted: the crops a grower actually put in are the ones whose dates they
 * came for, and the rest of the ranking follows them
 */
export const orderCalendars = (
  calendars: readonly BedCalendar[],
  sets: readonly RecommendationSet[],
  beds: readonly Bed[] = [],
): readonly BedCalendar[] =>
  calendars.map((bed) => {
    const set = sets.find((candidate) => candidate.bedId === bed.bedId)
    const planted = new Set(
      beds
        .find((entry) => entry.id === bed.bedId)
        ?.plantings.map((planting) => String(planting.cropId)) ?? [],
    )
    const order = new Map((set?.ranked ?? []).map((item, index) => [String(item.cropId), index]))
    // two tiers, planted and not, each in ranking order with the unranked at the tier's end
    const rankOf = (cropId: string): number =>
      (planted.has(cropId) ? 0 : 1e9) + (order.get(cropId) ?? 1e8)
    return {
      ...bed,
      entries: [...bed.entries].sort((a, b) => rankOf(String(a.cropId)) - rankOf(String(b.cropId))),
    }
  })

export const PERCENTILE_OPTIONS: readonly (readonly [string, string])[] = [
  ['10', 'Play it safe: 1 spring in 10 has frost after the date'],
  ['20', 'Usual: 1 spring in 5 has frost after the date'],
  ['30', '1 spring in 3'],
  ['40', '2 springs in 5'],
  ['50', 'Take a chance: 1 spring in 2'],
]

export const PERCENTILE_HELP =
  'The planting dates come from thirty years of records. Playing it safe waits longer in spring and stops earlier in autumn, so the season is shorter but a late freeze rarely catches the beds; taking a chance stretches the season and loses a crop to frost more often. Where the record holds no frost at a setting, the dates come from soil temperature instead.'

/**
 * The place-step sentence where the record holds no frost at this percentile, shared with the
 * print sheet so the two say the same thing. "One year in N" is the percentile's own odds
 */
export const noFrostSentence = (frostYears: number, percentile: ExceedancePercentile): string =>
  frostYears === 0
    ? 'No frost in the thirty-year record for this place, 1991 to 2020, so the growing season is the whole year'
    : `Frost here falls in fewer than one year in ${String(Math.max(2, Math.round(100 / percentile)))}, so at this setting the growing season is the whole year. Play it safe in the planting calendar to see the dates for the years with frost`
