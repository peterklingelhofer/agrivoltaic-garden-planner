export const at = (values: ArrayLike<number>, index: number): number => values[index] ?? 0

export const MIN_COVERAGE = 0.8

/**
 * A response whose values are absent must be refused, never read as a real 0. The
 * refusal names the upstream and the shortfall so it can be shown to the user as it is
 */
export const requireCoverage = (report: {
  readonly upstream: string
  readonly cadence: string
  readonly subject: string
  readonly present: number
  readonly expected: number
}): void => {
  if (report.expected > 0 && report.present >= report.expected * MIN_COVERAGE) return
  throw new Error(
    `${report.upstream} returned ${String(report.present)} of ${String(report.expected)} expected ${report.cadence} values for this location; ${report.subject} at least ${String(Math.round(MIN_COVERAGE * 100))}% coverage`,
  )
}

export const clamp = (value: number, low: number, high: number): number =>
  value < low ? low : value > high ? high : value

export const sum = (values: readonly number[]): number => values.reduce((a, b) => a + b, 0)

export const mean = (values: readonly number[]): number =>
  values.length === 0 ? 0 : sum(values) / values.length

export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t

export const HOURS_PER_DAY = 24
export const DAYS_PER_YEAR = 365

export const dayOfHour = (hour: number): number => Math.floor(hour / HOURS_PER_DAY)

export const monthOfDay = (day: number): number => {
  const cumulative = MONTH_START_DAY
  for (let month = 12; month >= 1; month -= 1) {
    if (day >= at(cumulative, month - 1)) return month
  }
  return 1
}

export const MONTH_START_DAY: readonly number[] = [
  0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334,
]

export const MONTH_LENGTH_DAYS: readonly number[] = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]

export const MONTH_NAMES: readonly string[] = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
]

export const monthsInWindow = (startMonth: number, endMonth: number): readonly number[] => {
  const months: number[] = []
  let month = startMonth
  for (let step = 0; step < 12; step += 1) {
    months.push(month)
    if (month === endMonth) break
    month = month === 12 ? 1 : month + 1
  }
  return months
}

export const wrapDay = (day: number): number => ((day - 1) % DAYS_PER_YEAR) + 1

const MULTIPLIER = 6364136223846793005n
const INCREMENT = 1442695040888963407n
const MASK = (1n << 64n) - 1n

export type Rng = () => number

export const createRng = (seed: number): Rng => {
  let state = BigInt(Math.trunc(seed)) & MASK
  return () => {
    state = (state * MULTIPLIER + INCREMENT) & MASK
    return Number(state >> 11n) / Number(1n << 53n)
  }
}
