import type { Degrees, EpochMillis, Minutes, Radians, Seconds } from '../types/units'

export interface JulianTime {
  readonly julianDay: number
  readonly julianCentury: number
  readonly julianEphemerisDay: number
  readonly julianEphemerisCentury: number
  readonly julianEphemerisMillennium: number
}

const MS_PER_DAY = 86_400_000
const UNIX_EPOCH_JD = 2_440_587.5
const J2000 = 2_451_545

// the polynomial depends only on (year, month), so memoising on that pair is exact
const deltaTCache = new Map<number, Seconds>()

export const deltaTSeconds = (utcMillis: EpochMillis): Seconds => {
  const date = new Date(utcMillis)
  const key = date.getUTCFullYear() * 12 + date.getUTCMonth()
  const cached = deltaTCache.get(key)
  if (cached !== undefined) return cached
  const value = deltaTPolynomial(date.getUTCFullYear(), date.getUTCMonth())
  deltaTCache.set(key, value)
  return value
}

// Espenak & Meeus polynomial expressions, as ported by pvlib.spa.calculate_deltat
const deltaTPolynomial = (year: number, month: number): Seconds => {
  const y = year + (month + 0.5) / 12
  const p = (base: number, coefficients: readonly number[]): number => {
    const t = y - base
    let total = 0
    for (let i = coefficients.length - 1; i >= 0; i -= 1) total = total * t + (coefficients[i] ?? 0)
    return total
  }
  const secular = -20 + 32 * ((y - 1820) / 100) ** 2
  if (year < -500) return secular as Seconds
  if (year < 500)
    return (10583.6 -
      1014.41 * (y / 100) +
      33.78311 * (y / 100) ** 2 -
      5.952053 * (y / 100) ** 3 -
      0.1798452 * (y / 100) ** 4 +
      0.022174192 * (y / 100) ** 5 +
      0.0090316521 * (y / 100) ** 6) as Seconds
  if (year < 1600)
    return (1574.2 -
      556.01 * ((y - 1000) / 100) +
      71.23472 * ((y - 1000) / 100) ** 2 +
      0.319781 * ((y - 1000) / 100) ** 3 -
      0.8503463 * ((y - 1000) / 100) ** 4 -
      0.005050998 * ((y - 1000) / 100) ** 5 +
      0.0083572073 * ((y - 1000) / 100) ** 6) as Seconds
  if (year < 1700)
    return (120 -
      0.9808 * (y - 1600) -
      0.01532 * (y - 1600) ** 2 +
      (y - 1600) ** 3 / 7129) as Seconds
  if (year < 1800)
    return (8.83 +
      0.1603 * (y - 1700) -
      0.0059285 * (y - 1700) ** 2 +
      0.00013336 * (y - 1700) ** 3 -
      (y - 1700) ** 4 / 1174000) as Seconds
  if (year < 1860)
    return p(
      1800,
      [
        13.72, -0.332447, 0.0068612, 0.0041116, -0.00037436, 0.0000121272, -0.0000001699,
        0.000000000875,
      ],
    ) as Seconds
  if (year < 1900)
    return (7.62 +
      0.5737 * (y - 1860) -
      0.251754 * (y - 1860) ** 2 +
      0.01680668 * (y - 1860) ** 3 -
      0.0004473624 * (y - 1860) ** 4 +
      (y - 1860) ** 5 / 233174) as Seconds
  if (year < 1920) return p(1900, [-2.79, 1.494119, -0.0598939, 0.0061966, -0.000197]) as Seconds
  if (year < 1941) return p(1920, [21.2, 0.84493, -0.0761, 0.0020936]) as Seconds
  if (year < 1961)
    return (29.07 + 0.407 * (y - 1950) - (y - 1950) ** 2 / 233 + (y - 1950) ** 3 / 2547) as Seconds
  if (year < 1986)
    return (45.45 + 1.067 * (y - 1975) - (y - 1975) ** 2 / 260 - (y - 1975) ** 3 / 718) as Seconds
  if (year < 2005)
    return p(2000, [63.86, 0.3345, -0.060374, 0.0017275, 0.000651814, 0.00002373599]) as Seconds
  if (year < 2050) return p(2000, [62.92, 0.32217, 0.005589]) as Seconds
  if (year < 2150) return (secular - 0.5628 * (2150 - y)) as Seconds
  return secular as Seconds
}

export const julianTime = (utcMillis: EpochMillis, deltaT: Seconds): JulianTime => {
  const julianDay = utcMillis / MS_PER_DAY + UNIX_EPOCH_JD
  const julianEphemerisDay = julianDay + deltaT / 86400
  const julianEphemerisCentury = (julianEphemerisDay - J2000) / 36525
  return {
    julianDay,
    julianCentury: (julianDay - J2000) / 36525,
    julianEphemerisDay,
    julianEphemerisCentury,
    julianEphemerisMillennium: julianEphemerisCentury / 10,
  }
}

export const fractionalYearAngle = (utcMillis: EpochMillis): Radians => {
  const date = new Date(utcMillis)
  const startOfYear = Date.UTC(date.getUTCFullYear(), 0, 1)
  const dayOfYear = Math.floor((utcMillis - startOfYear) / MS_PER_DAY) + 1
  const hourUtc = date.getUTCHours() + date.getUTCMinutes() / 60 + date.getUTCSeconds() / 3600
  return ((2 * Math.PI * (dayOfYear - 1 + (hourUtc - 12) / 24)) / 365) as Radians
}

// Spencer 1971 / NOAA form, minutes
export const equationOfTime = (yearAngle: Radians): Minutes =>
  (229.18 *
    (0.000075 +
      0.001868 * Math.cos(yearAngle) -
      0.032077 * Math.sin(yearAngle) -
      0.014615 * Math.cos(2 * yearAngle) -
      0.040849 * Math.sin(2 * yearAngle))) as Minutes

export const hourAngle = (
  localClockMinutes: Minutes,
  longitudeDeg: Degrees,
  utcOffsetHours: number,
  eot: Minutes,
): Radians => {
  const trueSolarMinutes = localClockMinutes + eot + 4 * longitudeDeg - 60 * utcOffsetHours
  return (Math.PI * (trueSolarMinutes / 720 - 1)) as Radians
}

// Spencer 1971, max error about 0.03 deg; SPA supersedes it on the physics path
export const spencerDeclination = (yearAngle: Radians): Radians =>
  (0.006918 -
    0.399912 * Math.cos(yearAngle) +
    0.070257 * Math.sin(yearAngle) -
    0.006758 * Math.cos(2 * yearAngle) +
    0.000907 * Math.sin(2 * yearAngle) -
    0.002697 * Math.cos(3 * yearAngle) +
    0.00148 * Math.sin(3 * yearAngle)) as Radians
