import type { ByMonth, Degrees, Fraction, MolPerM2Day, Radians } from '../types/units'
import { clamp, DEG_TO_RAD, RAD_TO_DEG } from './math'

export const PAR_FRACTION_DEFAULT = 0.45
export const PHOTON_CONVERSION_UMOL_PER_J = 4.57
export const BROADBAND_UMOL_PER_J = 2.06
export const SOLAR_CONSTANT_W_M2 = 1361.1

export const SECONDS_PER_HOUR = 3600

export const toRadians = (value: Degrees): Radians => (value * DEG_TO_RAD) as Radians

export const toDegrees = (value: Radians): Degrees => (value * RAD_TO_DEG) as Degrees

// canonical definition of RSR, the same quantity as "shade fraction" (ARCHITECTURE.md section 2)
export const relativeShadeRatio = (underArray: MolPerM2Day, openSky: MolPerM2Day): Fraction =>
  (openSky <= 0 ? 0 : clamp(1 - underArray / openSky, 0, 1)) as Fraction

// ByMonth is a 12-tuple, so a literal index sidesteps noUncheckedIndexedAccess
export const monthValue = <T>(values: ByMonth<T>, month: number): T =>
  values[clamp(Math.trunc(month), 0, 11) as 0]

export const byMonth = <T>(build: (month: number) => T): ByMonth<T> =>
  Array.from({ length: 12 }, (_unused, month) => build(month)) as unknown as ByMonth<T>

export const molPerM2FromWhPerM2 = (whPerM2: number, parFraction: number): number =>
  (whPerM2 * SECONDS_PER_HOUR * parFraction * PHOTON_CONVERSION_UMOL_PER_J) / 1e6
