export const MINUTES_PER_DAY = 1440

export const minutesOfDayUtc = (millis: number): number => {
  const date = new Date(millis)
  return date.getUTCHours() * 60 + date.getUTCMinutes()
}

/** Minutes past midnight on the wall clock where the garden is, from an instant kept in UTC */
export const localMinutesOfDay = (millis: number, offsetHours: number): number =>
  (((minutesOfDayUtc(millis) + offsetHours * 60) % MINUTES_PER_DAY) + MINUTES_PER_DAY) %
  MINUTES_PER_DAY

/**
 * The clock on the wall where the garden is.
 *
 * The store keeps every instant in UTC and the sun is computed from that, which is right for
 * the physics and wrong on the screen: "Sunrise 09:54 UTC" reads as a foreign time and would make
 * a reader stop trusting everything else on it. The offset is the site's timezone's at that
 * instant once the place is resolved, and before that the fixed one from its longitude
 * (`utcOffsetHoursFor`) with no daylight saving; `zoneLabel` says which, so a reader can see why
 * the sun sits where it does
 */
export const localClock = (millis: number, offsetHours: number): string => {
  const minutes = localMinutesOfDay(millis, offsetHours)
  const hh = String(Math.floor(minutes / 60)).padStart(2, '0')
  const mm = String(minutes % 60).padStart(2, '0')
  return `${hh}:${mm}`
}

export const zoneLabel = (offsetHours: number, zone: string | null = null): string => {
  const utc = `UTC${offsetHours >= 0 ? '+' : '-'}${String(Math.abs(offsetHours))}`
  return zone === null ? `local time, ${utc}, no daylight saving` : `local time in ${zone}, ${utc}`
}

/** The calendar date on that same wall clock */
export const localDateLabel = (millis: number, offsetHours: number): string =>
  new Date(millis + offsetHours * 3_600_000).toISOString().slice(0, 10)
