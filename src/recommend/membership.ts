import type { EcocropEnvelope, EcocropParameter, Trapezoid } from '../types/crop'
import type { Fraction } from '../types/units'

export interface MembershipScore {
  readonly overall: Fraction
  readonly byParameter: Readonly<Record<EcocropParameter, Fraction>>
  readonly limitingParameter: EcocropParameter
}

export const ECOCROP_PARAMETERS: readonly EcocropParameter[] = [
  'temperature',
  'rainfall',
  'soil-ph',
  'cycle-length',
  'koppen',
]

/**
 * Classic ECOCROP piecewise-linear trapezoid: 0 outside the absolute bounds,
 * ramping to 1 across the optimum plateau
 */
export const trapezoidMembership = <T extends number>(value: T, shape: Trapezoid<T>): Fraction => {
  const { absoluteMin, optimumMin, optimumMax, absoluteMax } = shape
  if (value <= absoluteMin || value >= absoluteMax) return 0 as Fraction
  if (value >= optimumMin && value <= optimumMax) return 1 as Fraction
  if (value < optimumMin) {
    const span = optimumMin - absoluteMin
    return (span <= 0 ? 1 : (value - absoluteMin) / span) as Fraction
  }
  const span = absoluteMax - optimumMax
  return (span <= 0 ? 1 : (absoluteMax - value) / span) as Fraction
}

/**
 * A season longer than GMAX is never a problem for a garden crop, so the cycle
 * parameter rises as a ramp, with no falling side a symmetric trapezoid would add. Clearing GMIN
 * is feasibility; comfortably exceeding GMAX is a good fit
 */
export const CYCLE_MEMBERSHIP_AT_GMIN = 0.8

export const cycleLengthMembership = (
  seasonLengthDays: number,
  minDays: number,
  maxDays: number,
): Fraction => {
  if (seasonLengthDays >= maxDays) return 1 as Fraction
  if (seasonLengthDays >= minDays) {
    const span = maxDays - minDays
    const above = span <= 0 ? 1 : (seasonLengthDays - minDays) / span
    return (CYCLE_MEMBERSHIP_AT_GMIN + above * (1 - CYCLE_MEMBERSHIP_AT_GMIN)) as Fraction
  }
  const floor = minDays * 0.7
  if (seasonLengthDays <= floor) return 0 as Fraction
  return (((seasonLengthDays - floor) / (minDays - floor)) * CYCLE_MEMBERSHIP_AT_GMIN) as Fraction
}

/**
 * Koppen is a coarse plausibility check, so a mismatch degrades the score
 * and never zeroes it. An empty code list means the crop is unrestricted
 */
export const koppenMembership = (observed: string, allowed: readonly string[]): Fraction => {
  if (allowed.length === 0) return 1 as Fraction
  if (allowed.includes(observed)) return 1 as Fraction
  const mainClass = observed.slice(0, 1)
  return (allowed.some((code) => code.startsWith(mainClass)) ? 0.85 : 0.7) as Fraction
}

export interface EcocropObservation {
  readonly meanTempC: number
  readonly annualRainfallMm: number
  readonly soilPh: number
  readonly seasonLengthDays: number
  readonly koppenCode: string
}

/**
 * Liebig's law of the minimum across parameters, which hands back the limiting
 * factor for free. Rainfall is disabled when the bed is irrigated: ECOCROP's
 * RMIN and RMAX are calibrated for rain-fed field agriculture
 */
export const ecocropMembership = (
  envelope: EcocropEnvelope,
  observed: EcocropObservation,
  irrigationAvailable: boolean,
): MembershipScore => {
  const byParameter: Record<EcocropParameter, Fraction> = {
    temperature: trapezoidMembership(observed.meanTempC, envelope.temperatureC),
    rainfall: irrigationAvailable
      ? (1 as Fraction)
      : trapezoidMembership(observed.annualRainfallMm, envelope.annualRainfallMm),
    'soil-ph': trapezoidMembership(observed.soilPh, envelope.soilPh),
    'cycle-length': cycleLengthMembership(
      observed.seasonLengthDays,
      envelope.cycleLengthDays.min,
      envelope.cycleLengthDays.max,
    ),
    koppen: koppenMembership(observed.koppenCode, envelope.koppenCodes),
  }

  let limitingParameter: EcocropParameter = 'temperature'
  let overall = Number.POSITIVE_INFINITY
  for (const parameter of ECOCROP_PARAMETERS) {
    const value = byParameter[parameter]
    if (value < overall) {
      overall = value
      limitingParameter = parameter
    }
  }
  return { overall: overall as Fraction, byParameter, limitingParameter }
}
