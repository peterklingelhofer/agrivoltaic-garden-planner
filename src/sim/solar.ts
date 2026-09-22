import type { LatLon } from '../types/geo'
import type { Site } from '../types/site'
import type { SolarPositionSample, SolarPositionSeries } from '../types/weather'
import type { Celsius, Degrees, EpochMillis, Meters, Millibars, Radians } from '../types/units'
import { physicsCore, requirePhysicsCore } from './core'
import { clamp, cosDeg, normalizeDegrees, RAD_TO_DEG, sinDeg, tanDeg } from './math'
import { FIELDS_PER_SAMPLE as RUST_FIELDS_PER_SAMPLE } from './rust-core'
import { SOLAR_CONSTANT_W_M2 } from './units'

export interface SpaObserver {
  readonly location: LatLon
  readonly elevationM: Meters
  readonly pressureMb: Millibars
  readonly temperatureC: Celsius
}

export type SolarPositionAlgorithm = 'nrel-spa' | 'psa' | 'grena3' | 'michalsky'

const SUN_DISC_HALF_WIDTH_DEG = 0.26667
const ATMOSPHERIC_REFRACTION_DEG = 0.5667
export const refractionCorrectionDeg = (
  geometricElevationDeg: Degrees,
  pressureMb: Millibars,
  temperatureC: Celsius,
): Degrees => {
  if (geometricElevationDeg < -(SUN_DISC_HALF_WIDTH_DEG + ATMOSPHERIC_REFRACTION_DEG)) {
    return 0 as Degrees
  }
  // SPA / Bennett 1982
  return (((pressureMb / 1010) * (283 / (273 + temperatureC)) * 1.02) /
    (60 * tanDeg(geometricElevationDeg + 10.3 / (geometricElevationDeg + 5.11)))) as Degrees
}

// Kasten & Young 1989
export const kastenYoungAirMass = (
  zenithDeg: Degrees,
  pressureMb: Millibars,
): { readonly relative: number; readonly absolute: number } => {
  if (zenithDeg >= 90) return { relative: 0, absolute: 0 }
  const relative = 1 / (cosDeg(zenithDeg) + 0.50572 * (96.07995 - zenithDeg) ** -1.6364)
  return { relative, absolute: relative * (pressureMb / 1013.25) }
}

export const pressureFromElevation = (elevationM: Meters): Millibars =>
  (1013.25 * Math.exp(-elevationM / 8434.5)) as Millibars

export const SEA_LEVEL_M = 0 as Meters

/**
 * The single place a site's elevation enters the solar chain. Where the lookup returned
 * nothing the observer sits at the sea-level reference. The site readout calls the elevation
 * unknown, keeping the assumed 0 m internal to the physics
 */
export const observerFor = (site: Site): SpaObserver => {
  const elevationM = site.elevationM ?? SEA_LEVEL_M
  return {
    location: site.location,
    elevationM,
    pressureMb: pressureFromElevation(elevationM),
    temperatureC: (site.normals.monthlyMeanTempC[6] ?? 12) as Celsius,
  }
}

export const extraterrestrialNormal = (earthRadiusVectorAu: number): number =>
  earthRadiusVectorAu > 0 ? SOLAR_CONSTANT_W_M2 / earthRadiusVectorAu ** 2 : 0

export const angleOfIncidenceCos = (
  zenithRad: Radians,
  solarAzimuthRad: Radians,
  surfaceTiltRad: Radians,
  surfaceAzimuthRad: Radians,
): number =>
  Math.cos(zenithRad) * Math.cos(surfaceTiltRad) +
  Math.sin(zenithRad) * Math.sin(surfaceTiltRad) * Math.cos(solarAzimuthRad - surfaceAzimuthRad)

// tan psi = tan(elevation) / |cos(gamma_s - gamma_c)|, and sigma records which side of the row
// the sun is on
export const profileAngle = (
  solarElevationRad: Radians,
  solarAzimuthRad: Radians,
  rowAzimuthRad: Radians,
): { readonly psiRad: Radians; readonly side: -1 | 0 | 1 } => {
  const cosDelta = Math.cos(solarAzimuthRad - rowAzimuthRad)
  if (Math.abs(cosDelta) < 1e-12) return { psiRad: (Math.PI / 2) as Radians, side: 0 }
  const side: -1 | 1 = cosDelta > 0 ? 1 : -1
  return {
    psiRad: Math.atan2(Math.tan(solarElevationRad), Math.abs(cosDelta)) as Radians,
    side,
  }
}

// ENU frame: +x East, +y North, +z Up
export const sunUnitVector = (
  elevationDeg: Degrees,
  azimuthDeg: Degrees,
): { readonly x: number; readonly y: number; readonly z: number } => {
  const cosEl = cosDeg(elevationDeg)
  return { x: cosEl * sinDeg(azimuthDeg), y: cosEl * cosDeg(azimuthDeg), z: sinDeg(elevationDeg) }
}

/**
 * NREL's Solar Position Algorithm, computed by `crates/agv-sim`.
 *
 * `crates/agv-sim/src/solar.rs` is the implementation, and `crates/agv-sim/tests/nrel_spa.rs` holds
 * it to NREL/TP-560-34302 Appendix A.5. This is a single-sample call over the batched ABI, which is
 * the shape `state/sun.ts` wants for one instant and the reason the batched entry point is also
 * exported.
 *
 * It refuses when the core is missing. There's no second implementation to fall back to, and one
 * that produced plausible numbers from a different algorithm would be worse than none
 */
export const spaPosition = (utcMillis: EpochMillis, observer: SpaObserver): SolarPositionSample => {
  const flat = requirePhysicsCore().spaSeriesFlat([utcMillis], {
    latitudeDeg: observer.location.latitudeDeg,
    longitudeDeg: observer.location.longitudeDeg,
    elevationM: observer.elevationM,
    pressureMb: observer.pressureMb,
    temperatureC: observer.temperatureC,
  })
  const read = (index: number): number => flat[index] ?? Number.NaN
  return {
    geometricElevationDeg: read(0) as Degrees,
    apparentElevationDeg: read(1) as Degrees,
    zenithDeg: read(2) as Degrees,
    azimuthDeg: read(3) as Degrees,
    declinationDeg: read(4) as Degrees,
    hourAngleDeg: read(5) as Degrees,
    earthRadiusVectorAu: read(6),
    relativeAirMass: read(7),
    absoluteAirMass: read(8),
  }
}

const michalskyPosition = (utcMillis: EpochMillis, observer: SpaObserver): SolarPositionSample => {
  const jd = utcMillis / 86_400_000 + 2_440_587.5
  const n = jd - 2451545
  const meanLongitude = normalizeDegrees(280.46 + 0.9856474 * n)
  const meanAnomaly = normalizeDegrees(357.528 + 0.9856003 * n)
  const lambda = meanLongitude + 1.915 * sinDeg(meanAnomaly) + 0.02 * sinDeg(2 * meanAnomaly)
  const epsilon = 23.439 - 0.0000004 * n
  const alpha = normalizeDegrees(
    RAD_TO_DEG * Math.atan2(cosDeg(epsilon) * sinDeg(lambda), cosDeg(lambda)),
  )
  const declination = RAD_TO_DEG * Math.asin(clamp(sinDeg(epsilon) * sinDeg(lambda), -1, 1))
  const gmstHours = (18.697374558 + 24.06570982441908 * n) % 24
  const hourAngleDeg = normalizeDegrees(gmstHours * 15 + observer.location.longitudeDeg - alpha)
  const latitude = observer.location.latitudeDeg
  const geometricElevationDeg =
    RAD_TO_DEG *
    Math.asin(
      clamp(
        sinDeg(latitude) * sinDeg(declination) +
          cosDeg(latitude) * cosDeg(declination) * cosDeg(hourAngleDeg),
        -1,
        1,
      ),
    )
  const apparentElevationDeg =
    geometricElevationDeg +
    refractionCorrectionDeg(
      geometricElevationDeg as Degrees,
      observer.pressureMb,
      observer.temperatureC,
    )
  const azimuthDeg = normalizeDegrees(
    180 +
      RAD_TO_DEG *
        Math.atan2(
          sinDeg(hourAngleDeg),
          cosDeg(hourAngleDeg) * sinDeg(latitude) - tanDeg(declination) * cosDeg(latitude),
        ),
  )
  const zenithDeg = 90 - apparentElevationDeg
  const radiusAu = 1.00014 - 0.01671 * cosDeg(meanAnomaly) - 0.00014 * cosDeg(2 * meanAnomaly)
  const airMass = kastenYoungAirMass(zenithDeg as Degrees, observer.pressureMb)
  return {
    geometricElevationDeg: geometricElevationDeg as Degrees,
    apparentElevationDeg: apparentElevationDeg as Degrees,
    zenithDeg: zenithDeg as Degrees,
    azimuthDeg: azimuthDeg as Degrees,
    declinationDeg: declination as Degrees,
    hourAngleDeg: hourAngleDeg as Degrees,
    earthRadiusVectorAu: radiusAu,
    relativeAirMass: airMass.relative,
    absoluteAirMass: airMass.absolute,
  }
}

export const solarPositionSeries = (
  utcMillis: Float64Array,
  observer: SpaObserver,
  algorithm: SolarPositionAlgorithm,
): SolarPositionSeries => {
  if (algorithm === 'psa' || algorithm === 'grena3') {
    throw new Error(`solar position algorithm '${algorithm}' isn't implemented: use 'nrel-spa'`)
  }
  const count = utcMillis.length
  const geometricElevationDeg = new Float32Array(count)
  const apparentElevationDeg = new Float32Array(count)
  const azimuthDeg = new Float32Array(count)
  const absoluteAirMass = new Float32Array(count)
  const extraterrestrialNormalWM2 = new Float32Array(count)

  /*
    The Rust core answers for the SPA only. Michalsky is a different algorithm, deliberately kept
    in TypeScript as a cheap cross-check on the SPA, so asking for it here has to
    keep running the TypeScript whatever is installed. Getting that wrong would mean the check and
    the thing it checks were the same code
  */
  const core = algorithm === 'michalsky' ? null : physicsCore()
  if (core !== null) {
    const flat = core.spaSeriesFlat(utcMillis, {
      latitudeDeg: observer.location.latitudeDeg,
      longitudeDeg: observer.location.longitudeDeg,
      elevationM: observer.elevationM,
      pressureMb: observer.pressureMb,
      temperatureC: observer.temperatureC,
    })
    for (let i = 0; i < count; i += 1) {
      const at = i * RUST_FIELDS_PER_SAMPLE
      geometricElevationDeg[i] = flat[at] ?? Number.NaN
      apparentElevationDeg[i] = flat[at + 1] ?? Number.NaN
      azimuthDeg[i] = flat[at + 3] ?? Number.NaN
      absoluteAirMass[i] = flat[at + 8] ?? Number.NaN
      extraterrestrialNormalWM2[i] = extraterrestrialNormal(flat[at + 6] ?? 0)
    }
  } else {
    const evaluate = algorithm === 'michalsky' ? michalskyPosition : spaPosition
    for (let i = 0; i < count; i += 1) {
      const sample = evaluate((utcMillis[i] ?? 0) as EpochMillis, observer)
      geometricElevationDeg[i] = sample.geometricElevationDeg
      apparentElevationDeg[i] = sample.apparentElevationDeg
      azimuthDeg[i] = sample.azimuthDeg
      absoluteAirMass[i] = sample.absoluteAirMass
      extraterrestrialNormalWM2[i] = extraterrestrialNormal(sample.earthRadiusVectorAu)
    }
  }
  return {
    count,
    geometricElevationDeg,
    apparentElevationDeg,
    azimuthDeg,
    absoluteAirMass,
    extraterrestrialNormalWM2,
  }
}
