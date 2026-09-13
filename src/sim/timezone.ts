import type { TmySeries } from '../types/weather'

const MS_PER_DAY = 86_400_000
const MS_PER_MINUTE = 60_000
const MINUTES_PER_HOUR = 60

/** The calendar year the standard offset is read in; the TMY is laid on the same year */
const REFERENCE_YEAR = 2024

const formatters = new Map<string, Intl.DateTimeFormat | null>()

/** null for a zone name this runtime does not know, which is what an invalid one is */
const formatterFor = (zone: string): Intl.DateTimeFormat | null => {
  const known = formatters.get(zone)
  if (known !== undefined) return known
  let made: Intl.DateTimeFormat | null = null
  try {
    made = new Intl.DateTimeFormat('en-US', {
      timeZone: zone,
      hourCycle: 'h23',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
    })
  } catch {
    made = null
  }
  formatters.set(zone, made)
  return made
}

/** The zone's wall clock at the instant, read back as if it were UTC, minus the instant */
const offsetOf = (formatter: Intl.DateTimeFormat, epochMs: number): number => {
  const field: Record<string, number> = {}
  for (const part of formatter.formatToParts(epochMs)) {
    if (part.type !== 'literal') field[part.type] = Number(part.value)
  }
  const wall = Date.UTC(
    field.year ?? 1970,
    (field.month ?? 1) - 1,
    field.day ?? 1,
    field.hour ?? 0,
    field.minute ?? 0,
    field.second ?? 0,
  )
  return Math.round((wall - epochMs) / MS_PER_MINUTE)
}

const days = new Map<string, readonly [number, number]>()

/**
 * Minutes east of UTC on the zone's clock at that instant, daylight saving included.
 *
 * Cached by zone and UTC day, because a bake asks 8,760 times and a day has one answer except
 * on the two days a year the clocks change, which are read per instant. An unknown zone name
 * answers with the fallback, which callers hand in from the fixed longitude offset
 */
export const utcOffsetMinutesAt = (zone: string, epochMs: number, fallbackMinutes = 0): number => {
  const formatter = formatterFor(zone)
  if (formatter === null) return fallbackMinutes
  const day = Math.floor(epochMs / MS_PER_DAY)
  const key = `${zone}|${String(day)}`
  let edges = days.get(key)
  if (edges === undefined) {
    const start = day * MS_PER_DAY
    edges = [offsetOf(formatter, start), offsetOf(formatter, start + MS_PER_DAY - MS_PER_MINUTE)]
    days.set(key, edges)
  }
  return edges[0] === edges[1] ? edges[0] : offsetOf(formatter, epochMs)
}

/**
 * The zone's standard-time offset in hours: the smaller of its January and July offsets, since
 * daylight saving only ever adds. The one fixed offset a series still carries, for the readers
 * that take a single number
 */
export const standardOffsetHours = (zone: string, fallbackHours: number): number => {
  if (formatterFor(zone) === null) return fallbackHours
  const january = utcOffsetMinutesAt(zone, Date.UTC(REFERENCE_YEAR, 0, 1))
  const july = utcOffsetMinutesAt(zone, Date.UTC(REFERENCE_YEAR, 6, 1))
  return Math.min(january, july) / MINUTES_PER_HOUR
}

/** The series' clock at that instant: its zone's offset where it names one, its fixed offset otherwise */
export const seriesOffsetMinutesAt = (weather: TmySeries, utcMillis: number): number => {
  const fixed = weather.utcOffsetHours * MINUTES_PER_HOUR
  return weather.timezone === undefined
    ? fixed
    : utcOffsetMinutesAt(weather.timezone, utcMillis, fixed)
}
