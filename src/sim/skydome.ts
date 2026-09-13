import type {
  CumulativeSky,
  SkyPatch,
  SkySubdivision,
  SolarPositionSeries,
  SunDirectionBin,
  TmySeries,
} from '../types/weather'
import type { TimeBasis, TimeWindowSampling, TimeWindowSpec } from '../types/light'
import type { Degrees, EpochMillis, Fraction } from '../types/units'
import { at, clamp, cosDeg, DEG_TO_RAD, normaliseDegrees, sinDeg } from './math'
import { PEREZ_1993_LUMINANCE, perezClearnessBin, PEREZ_KAPPA_RADIANS } from './perez-tables'
import { sunUnitVector } from './solar'
import { equationOfTime, fractionalYearAngle } from './time'
import { seriesOffsetMinutesAt } from './timezone'

export const TREGENZA_PATCH_COUNT = 145
export const REINHART_MF2_PATCH_COUNT = 577
export const DEFAULT_SUBSTEPS_PER_HOUR = 4
export const DEFAULT_SUN_BINNING_DEG = 2

// Reinhart subdivision: 7*MF altitude bands plus a zenith cap, band height 90/(7*MF + 0.5)
const REINHART_ROW_PATCHES: Readonly<Record<SkySubdivision, readonly number[]>> = {
  'tregenza-mf1': [30, 30, 24, 24, 18, 12, 6],
  'reinhart-mf2': [60, 60, 60, 60, 48, 48, 48, 48, 36, 36, 24, 24, 12, 12],
}

// representative altitude with sin(alt) = (sin a1 + sin a2)/2, so both the solid angle and
// the cosine-projected area of a band are exact and an unobstructed hemisphere gives SVF = 1
const bandAltitudeDeg = (lowerDeg: number, upperDeg: number): number =>
  (Math.asin((sinDeg(lowerDeg) + sinDeg(upperDeg)) / 2) * 180) / Math.PI

export const skyPatchGrid = (subdivision: SkySubdivision): readonly SkyPatch[] => {
  const rows = REINHART_ROW_PATCHES[subdivision]
  const bandHeightDeg = 90 / (rows.length + 0.5)
  const patches: SkyPatch[] = []
  for (let band = 0; band < rows.length; band += 1) {
    const count = rows[band] ?? 0
    const lower = band * bandHeightDeg
    const upper = lower + bandHeightDeg
    const solidAngleSr = ((2 * Math.PI) / count) * (sinDeg(upper) - sinDeg(lower))
    for (let j = 0; j < count; j += 1) {
      patches.push({
        index: patches.length,
        altitudeDeg: bandAltitudeDeg(lower, upper) as Degrees,
        azimuthDeg: (((j + 0.5) * 360) / count) as Degrees,
        solidAngleSr,
        cumulativeRadianceWhPerM2: 0,
      })
    }
  }
  const capLower = rows.length * bandHeightDeg
  patches.push({
    index: patches.length,
    altitudeDeg: bandAltitudeDeg(capLower, 90) as Degrees,
    azimuthDeg: 0 as Degrees,
    solidAngleSr: 2 * Math.PI * (1 - sinDeg(capLower)),
    cumulativeRadianceWhPerM2: 0,
  })
  return patches
}

const angleBetweenDeg = (
  altitudeA: number,
  azimuthA: number,
  altitudeB: number,
  azimuthB: number,
): number =>
  Math.acos(
    clamp(
      sinDeg(altitudeA) * sinDeg(altitudeB) +
        cosDeg(altitudeA) * cosDeg(altitudeB) * cosDeg(azimuthA - azimuthB),
      -1,
      1,
    ),
  )

interface PerezSkyParams {
  a: number
  b: number
  c: number
  d: number
  e: number
}

// Perez, Seals & Michalsky 1993, Eqns 6-8, as implemented in Radiance gendaymtx
const perezSkyParams = (bin: number, zenithRad: number, delta: number): PerezSkyParams => {
  const row = PEREZ_1993_LUMINANCE[bin] ?? []
  const x = (i: number, j: number): number => at(row, 4 * i + j)
  const sz = zenithRad
  const brightness = bin > 0 && bin < 5 ? Math.max(delta, 0.2) : delta
  const linear = (i: number): number =>
    x(i, 0) + x(i, 1) * sz + brightness * (x(i, 2) + x(i, 3) * sz)
  if (bin !== 0) {
    return { a: linear(0), b: linear(1), c: linear(2), d: linear(3), e: linear(4) }
  }
  return {
    a: linear(0),
    b: linear(1),
    c: Math.exp((brightness * (x(2, 0) + x(2, 1) * sz)) ** x(2, 2)) - x(2, 3),
    d: -Math.exp(brightness * (x(3, 0) + x(3, 1) * sz)) + x(3, 2) + brightness * x(3, 3),
    e: linear(4),
  }
}

// Perez 1993 Eqn 1: relative luminance of a sky element at zenith angle zeta, sun angle gamma
const relativeLuminance = (params: PerezSkyParams, gammaRad: number, zetaRad: number): number =>
  (1 + params.a * Math.exp(params.b / Math.max(Math.cos(zetaRad), 0.01))) *
  (1 + params.c * Math.exp(params.d * gammaRad) + params.e * Math.cos(gammaRad) ** 2)

export const perezSkyRadianceDistribution1993 = (
  patches: readonly SkyPatch[],
  dhiWM2: number,
  dniWM2: number,
  solarZenithDeg: Degrees,
  solarAzimuthDeg: Degrees,
): Float32Array => {
  const radiance = new Float32Array(patches.length)
  if (dhiWM2 <= 0) return radiance
  const zenithRad = clamp(solarZenithDeg, 0, 90) * DEG_TO_RAD
  const epsilon = clamp(
    ((dhiWM2 + dniWM2) / dhiWM2 + PEREZ_KAPPA_RADIANS * zenithRad ** 3) /
      (1 + PEREZ_KAPPA_RADIANS * zenithRad ** 3),
    1,
    12,
  )
  // sky brightness uses the extraterrestrial normal; gendaymtx clamps it to [0.01, 0.6]
  const delta = clamp((dhiWM2 * Math.max(1 / Math.cos(zenithRad), 1)) / 1361.1, 0.01, 0.6)
  const params = perezSkyParams(perezClearnessBin(epsilon), zenithRad, delta)
  const solarAltitudeDeg = 90 - solarZenithDeg

  // integrate the relative distribution over the dome, then scale so it reproduces DHI exactly
  let horizontalSum = 0
  const relative = new Float32Array(patches.length)
  for (let i = 0; i < patches.length; i += 1) {
    const patch = patches[i]
    if (patch === undefined) continue
    const gamma = angleBetweenDeg(
      patch.altitudeDeg,
      patch.azimuthDeg,
      solarAltitudeDeg,
      solarAzimuthDeg,
    )
    const zeta = (90 - patch.altitudeDeg) * DEG_TO_RAD
    const value = Math.max(0, relativeLuminance(params, gamma, zeta))
    relative[i] = value
    horizontalSum += value * Math.cos(zeta) * patch.solidAngleSr
  }
  if (horizontalSum <= 0) return radiance
  const scale = dhiWM2 / horizontalSum
  for (let i = 0; i < patches.length; i += 1) radiance[i] = at(relative, i) * scale
  return radiance
}

export interface SunBinningOptions {
  readonly substepsPerHour: number
  readonly binningDeg: Degrees
}

interface SunBinAccumulator {
  x: number
  y: number
  z: number
  weight: number
  monthly: Float64Array
  windows: Float64Array
}

const monthIndexOf = (utcMillis: number): number => new Date(utcMillis).getUTCMonth()

// the sun position series may be sub-stepped: index i maps to weather hour floor(i / substeps)
const substepsOf = (weather: TmySeries, position: SolarPositionSeries): number => {
  const hours = weather.utcMillis.length
  if (hours === 0) return 1
  const ratio = Math.round(position.count / hours)
  return Math.max(1, ratio)
}

const MS_PER_HOUR = 3_600_000
const MS_PER_MINUTE = 60_000
const MS_PER_DAY = 86_400_000

// 'local-clock' is the site's own clock at that instant, daylight saving included where the
// series names its zone, its fixed offset where it does not: a clock hour in a regulation is a
// legal wall-clock hour. 'solar' is apparent solar time, 4 min per degree of longitude plus the
// equation of time
const shiftedMillis = (
  utcMillis: number,
  basis: TimeBasis,
  weather: TmySeries,
  longitudeDeg: number,
): number =>
  basis === 'solar'
    ? utcMillis +
      (4 * longitudeDeg + equationOfTime(fractionalYearAngle(utcMillis as EpochMillis))) * 60_000
    : utcMillis + seriesOffsetMinutesAt(weather, utcMillis) * MS_PER_MINUTE

const inWindow = (spec: TimeWindowSpec, month: number, hourOfDay: number): boolean =>
  spec.clauses.some(
    (clause) =>
      hourOfDay >= clause.startHour && hourOfDay < clause.endHour && clause.months.includes(month),
  )

// per-window membership resolved at the sub-step timestep, so a 15-min sub-step is the window
// edge resolution; the hourly diffuse loop reads the fraction of an hour's sub-steps inside.
// Both grids are flat, window-major, so the accumulators index them without a nested lookup
export interface WindowSampling {
  readonly sampling: readonly TimeWindowSampling[]
  readonly substepMember: Uint8Array
  readonly substepCount: number
  readonly hourCoverage: Float32Array
  readonly hourCount: number
}

export const EMPTY_WINDOW_SAMPLING: WindowSampling = {
  sampling: [],
  substepMember: new Uint8Array(0),
  substepCount: 0,
  hourCoverage: new Float32Array(0),
  hourCount: 0,
}

export const sampleTimeWindows = (
  weather: TmySeries,
  position: SolarPositionSeries,
  specs: readonly TimeWindowSpec[],
  longitudeDeg: Degrees,
): WindowSampling => {
  if (specs.length === 0) return EMPTY_WINDOW_SAMPLING
  const substeps = substepsOf(weather, position)
  const hourCount = weather.utcMillis.length
  const substepCount = position.count
  const substepMember = new Uint8Array(specs.length * substepCount)
  const hourCoverage = new Float32Array(specs.length * hourCount)
  const sampling = specs.map((spec, w) => {
    const days = new Set<number>()
    for (let i = 0; i < substepCount; i += 1) {
      const hour = Math.min(Math.floor(i / substeps), hourCount - 1)
      const utc = at(weather.utcMillis, hour) + ((i % substeps) * MS_PER_HOUR) / substeps
      const local = shiftedMillis(utc, spec.basis, weather, longitudeDeg)
      const dayIndex = Math.floor(local / MS_PER_DAY)
      const hourOfDay = (local - dayIndex * MS_PER_DAY) / MS_PER_HOUR
      if (!inWindow(spec, new Date(local).getUTCMonth(), hourOfDay)) continue
      substepMember[w * substepCount + i] = 1
      const slot = w * hourCount + hour
      hourCoverage[slot] = at(hourCoverage, slot) + 1 / substeps
      days.add(dayIndex)
    }
    return { spec, dayCount: days.size }
  })
  return { sampling, substepMember, substepCount, hourCoverage, hourCount }
}

const accumulateSunBins = (
  weather: TmySeries,
  position: SolarPositionSeries,
  options: SunBinningOptions,
  windows: WindowSampling,
): SunBinAccumulator[] => {
  const substeps = substepsOf(weather, position)
  const windowCount = windows.sampling.length
  const binning = options.binningDeg > 0 ? options.binningDeg : DEFAULT_SUN_BINNING_DEG
  const bins = new Map<number, SunBinAccumulator>()
  const hourFraction = 1 / substeps
  for (let i = 0; i < position.count; i += 1) {
    const elevation = at(position.geometricElevationDeg, i)
    if (elevation <= 0) continue
    const hour = Math.min(Math.floor(i / substeps), weather.utcMillis.length - 1)
    const dni = at(weather.dniWM2, hour)
    if (dni <= 0) continue
    const azimuth = normaliseDegrees(at(position.azimuthDeg, i))
    const key = Math.round(elevation / binning) * 100000 + Math.round(azimuth / binning)
    const direction = sunUnitVector(elevation as Degrees, azimuth as Degrees)
    // beam weight is DNI x dt; the beam is never binned into a sky patch (Decision Record 5)
    const weight = dni * hourFraction
    const month = monthIndexOf(at(weather.utcMillis, hour))
    let bin = bins.get(key)
    if (bin === undefined) {
      bin = {
        x: 0,
        y: 0,
        z: 0,
        weight: 0,
        monthly: new Float64Array(12),
        windows: new Float64Array(windowCount),
      }
      bins.set(key, bin)
    }
    bin.x += direction.x * weight
    bin.y += direction.y * weight
    bin.z += direction.z * weight
    bin.weight += weight
    bin.monthly[month] = at(bin.monthly, month) + weight
    for (let w = 0; w < windowCount; w += 1) {
      if (at(windows.substepMember, w * windows.substepCount + i) === 1) {
        bin.windows[w] = at(bin.windows, w) + weight
      }
    }
  }
  return [...bins.values()]
}

const normaliseBin = (bin: SunBinAccumulator, weight: number): SunDirectionBin => {
  const length = Math.hypot(bin.x, bin.y, bin.z) || 1
  return {
    x: bin.x / length,
    y: bin.y / length,
    z: bin.z / length,
    beamWeightWhPerM2: weight,
  }
}

export const binSunDirections = (
  weather: TmySeries,
  position: SolarPositionSeries,
  options: SunBinningOptions,
): readonly SunDirectionBin[] =>
  accumulateSunBins(weather, position, options, EMPTY_WINDOW_SAMPLING).map((bin) =>
    normaliseBin(bin, bin.weight),
  )

interface PatchAccumulation {
  readonly patches: readonly SkyPatch[]
  readonly annual: Float64Array
  readonly monthly: readonly Float64Array[]
  readonly windows: readonly Float64Array[]
}

const accumulatePatches = (
  weather: TmySeries,
  position: SolarPositionSeries,
  subdivision: SkySubdivision,
  windowSampling: WindowSampling,
): PatchAccumulation => {
  const patches = skyPatchGrid(subdivision)
  const annual = new Float64Array(patches.length)
  const monthly = Array.from({ length: 12 }, () => new Float64Array(patches.length))
  const windows = windowSampling.sampling.map(() => new Float64Array(patches.length))
  const substeps = substepsOf(weather, position)
  for (let hour = 0; hour < weather.utcMillis.length; hour += 1) {
    const dhi = at(weather.dhiWM2, hour)
    if (dhi <= 0) continue
    const sampleIndex = Math.min(hour * substeps, Math.max(0, position.count - 1))
    const elevation = at(position.apparentElevationDeg, sampleIndex)
    if (elevation <= 0) continue
    const radiance = perezSkyRadianceDistribution1993(
      patches,
      dhi,
      at(weather.dniWM2, hour),
      (90 - elevation) as Degrees,
      at(position.azimuthDeg, sampleIndex) as Degrees,
    )
    const month = monthIndexOf(at(weather.utcMillis, hour))
    const monthTarget = monthly[month] ?? annual
    for (let i = 0; i < patches.length; i += 1) {
      const patch = patches[i]
      if (patch === undefined) continue
      // S_i = sum_h L_i cos(zenith_i) omega_i dt, dt = 1 h so the unit is Wh/m2 per unit visibility
      const contribution = at(radiance, i) * sinDeg(patch.altitudeDeg) * patch.solidAngleSr
      annual[i] = at(annual, i) + contribution
      monthTarget[i] = at(monthTarget, i) + contribution
      for (let w = 0; w < windows.length; w += 1) {
        // an hour is clipped by the fraction of its sub-steps inside the window
        const coverage = at(windowSampling.hourCoverage, w * windowSampling.hourCount + hour)
        const target = windows[w]
        if (coverage > 0 && target !== undefined)
          target[i] = at(target, i) + contribution * coverage
      }
    }
  }
  return { patches, annual, monthly, windows }
}

const withWeights = (patches: readonly SkyPatch[], weights: Float64Array): readonly SkyPatch[] =>
  patches.map((patch, i) => ({ ...patch, cumulativeRadianceWhPerM2: at(weights, i) }))

export const cumulativeSky = (
  weather: TmySeries,
  position: SolarPositionSeries,
  subdivision: SkySubdivision,
  options: SunBinningOptions,
): CumulativeSky => {
  const { patches, annual } = accumulatePatches(
    weather,
    position,
    subdivision,
    EMPTY_WINDOW_SAMPLING,
  )
  return {
    subdivision,
    patches: withWeights(patches, annual),
    sunDirections: binSunDirections(weather, position, options),
    substepsPerHour: options.substepsPerHour,
    binningDeg: options.binningDeg,
  }
}

// every sky in a set is index-aligned with every other: same patch order, same sun-direction
// bins, only the weights differ. Months partition the year; windows overlay it, so a window
// costs one extra weight vector per direction and no extra visibility pass
export interface CumulativeSkySet {
  readonly monthly: readonly CumulativeSky[]
  readonly windows: readonly CumulativeSky[]
  readonly sampling: readonly TimeWindowSampling[]
}

export const cumulativeSkySet = (
  weather: TmySeries,
  position: SolarPositionSeries,
  subdivision: SkySubdivision,
  options: SunBinningOptions,
  windowSampling: WindowSampling = EMPTY_WINDOW_SAMPLING,
): CumulativeSkySet => {
  const { patches, monthly, windows } = accumulatePatches(
    weather,
    position,
    subdivision,
    windowSampling,
  )
  const bins = accumulateSunBins(weather, position, options, windowSampling)
  const build = (
    weights: Float64Array,
    beamWeight: (bin: SunBinAccumulator) => number,
  ): CumulativeSky => ({
    subdivision,
    patches: withWeights(patches, weights),
    sunDirections: bins.map((bin) => normaliseBin(bin, beamWeight(bin))),
    substepsPerHour: options.substepsPerHour,
    binningDeg: options.binningDeg,
  })
  return {
    monthly: monthly.map((weights, month) => build(weights, (bin) => at(bin.monthly, month))),
    windows: windows.map((weights, w) => build(weights, (bin) => at(bin.windows, w))),
    sampling: windowSampling.sampling,
  }
}

export const monthlyCumulativeSky = (
  weather: TmySeries,
  position: SolarPositionSeries,
  subdivision: SkySubdivision,
  options: SunBinningOptions,
): readonly CumulativeSky[] => cumulativeSkySet(weather, position, subdivision, options).monthly

// the monthly skies partition the year, so the annual sky is their elementwise sum;
// building it this way halves the Perez evaluation cost of a bake
export const annualFromMonthly = (monthly: readonly CumulativeSky[]): CumulativeSky => {
  const first = monthly[0]
  if (first === undefined) throw new Error('annualFromMonthly needs at least one monthly sky')
  const total = <T>(items: readonly (readonly T[])[], index: number, value: (item: T) => number) =>
    items.reduce((sum, list) => sum + (list[index] === undefined ? 0 : value(list[index])), 0)
  return {
    ...first,
    patches: first.patches.map((patch, i) => ({
      ...patch,
      cumulativeRadianceWhPerM2: total(
        monthly.map((month) => month.patches),
        i,
        (item) => item.cumulativeRadianceWhPerM2,
      ),
    })),
    sunDirections: first.sunDirections.map((bin, j) => ({
      ...bin,
      beamWeightWhPerM2: total(
        monthly.map((month) => month.sunDirections),
        j,
        (item) => item.beamWeightWhPerM2,
      ),
    })),
  }
}

// scales the sky to the PAR energy band; the photon conversion is applied in raster.ts
export const parWeightedSky = (sky: CumulativeSky, parFraction: Fraction): CumulativeSky => ({
  ...sky,
  patches: sky.patches.map((patch) => ({
    ...patch,
    cumulativeRadianceWhPerM2: patch.cumulativeRadianceWhPerM2 * parFraction,
  })),
  sunDirections: sky.sunDirections.map((bin) => ({
    ...bin,
    beamWeightWhPerM2: bin.beamWeightWhPerM2 * parFraction,
  })),
})
