import type { EpochMillis, Minutes, Radians } from '../types/units'

const MS_PER_DAY = 86_400_000

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

// Spencer 1971, max error about 0.03 deg. SPA supersedes it on the physics path
export const spencerDeclination = (yearAngle: Radians): Radians =>
  (0.006918 -
    0.399912 * Math.cos(yearAngle) +
    0.070257 * Math.sin(yearAngle) -
    0.006758 * Math.cos(2 * yearAngle) +
    0.000907 * Math.sin(2 * yearAngle) -
    0.002697 * Math.cos(3 * yearAngle) +
    0.00148 * Math.sin(3 * yearAngle)) as Radians
