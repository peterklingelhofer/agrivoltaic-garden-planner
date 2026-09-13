import type {
  ByMonth,
  Degrees,
  Fraction,
  KwhPerM2Day,
  MegajoulesPerM2Day,
  MicromolPerM2Sec,
  MolPerM2Day,
  Radians,
  Seconds,
  WattsPerM2,
} from '../types/units'
import { clamp, DEG_TO_RAD, RAD_TO_DEG, sum } from './math'

export const PAR_FRACTION_DEFAULT = 0.45
export const PAR_FRACTION_RANGE: readonly [number, number] = [0.42, 0.5]
export const PHOTON_CONVERSION_UMOL_PER_J = 4.57
export const BROADBAND_UMOL_PER_J = 2.06
export const SOLAR_CONSTANT_W_M2 = 1361.1

// diffuse skylight is blue-shifted so it carries more photons per joule (the solar geometry document section 2.6)
export const BEAM_UMOL_PER_J = 2.0
export const DIFFUSE_UMOL_PER_J = 2.15
export const KWH_TO_MJ = 3.6
export const SECONDS_PER_HOUR = 3600

export const toRadians = (value: Degrees): Radians => (value * DEG_TO_RAD) as Radians

export const toDegrees = (value: Radians): Degrees => (value * RAD_TO_DEG) as Degrees

export const ppfdFromShortwave = (
  irradiance: WattsPerM2,
  parFraction: Fraction,
): MicromolPerM2Sec => (irradiance * parFraction * PHOTON_CONVERSION_UMOL_PER_J) as MicromolPerM2Sec

export const ppfdTwoBand = (
  beamHorizontal: WattsPerM2,
  diffuseHorizontal: WattsPerM2,
): MicromolPerM2Sec =>
  (beamHorizontal * BEAM_UMOL_PER_J + diffuseHorizontal * DIFFUSE_UMOL_PER_J) as MicromolPerM2Sec

export const dliFromPpfdSum = (samples: Float32Array, stepSeconds: Seconds): MolPerM2Day =>
  ((sum(samples) * stepSeconds) / 1e6) as MolPerM2Day

// DLI = GHI(MJ) x 1e6 J/MJ x f_PAR x 4.57 umol/J / 1e6 umol/mol (the agrivoltaics document section 1.3)
export const dliFromDailyGhiMj = (ghi: MegajoulesPerM2Day, parFraction: Fraction): MolPerM2Day =>
  (ghi * parFraction * PHOTON_CONVERSION_UMOL_PER_J) as MolPerM2Day

export const dliFromDailyGhiKwh = (ghi: KwhPerM2Day, parFraction: Fraction): MolPerM2Day =>
  dliFromDailyGhiMj((ghi * KWH_TO_MJ) as MegajoulesPerM2Day, parFraction)

// canonical definition of RSR; "shade fraction" is the same quantity (ARCHITECTURE.md section 2)
export const relativeShadeRatio = (underArray: MolPerM2Day, openSky: MolPerM2Day): Fraction =>
  (openSky <= 0 ? 0 : clamp(1 - underArray / openSky, 0, 1)) as Fraction

// ByMonth is a 12-tuple, so a literal index sidesteps noUncheckedIndexedAccess
export const monthValue = <T>(values: ByMonth<T>, month: number): T =>
  values[clamp(Math.trunc(month), 0, 11) as 0]

export const byMonth = <T>(build: (month: number) => T): ByMonth<T> =>
  Array.from({ length: 12 }, (_unused, month) => build(month)) as unknown as ByMonth<T>

export const molPerM2FromWhPerM2 = (whPerM2: number, parFraction: number): number =>
  (whPerM2 * SECONDS_PER_HOUR * parFraction * PHOTON_CONVERSION_UMOL_PER_J) / 1e6
