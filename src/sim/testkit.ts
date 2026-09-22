/**
 * The second light model, and the year both models are measured on. A unit-test oracle only.
 *
 * Nothing in the application imports this file. It exists so `gap.test.ts` can hold the shipped
 * raster bake against a completely different arithmetic for the same physics, the way
 * `shading.test.ts` holds it against pvlib's closed forms, and both halves have to live beside the
 * bake, sharing its test config: a throwaway of their own would run under nobody's notice.
 *
 * Two halves, kept in one module because a divergence between them would be mistaken for a
 * physics finding when it is really a fixture bug:
 *
 * - **The coarse driver**, which answers "how much light reaches a tile under an array of THIS
 *   configuration" from the infinite-row closed forms in `shading.ts` and `viewfactor.ts`, at
 *   about 2.5 us a cached tile against the bake's hundreds of raster passes. Section 2.1 of
 *   `docs/00-DECISIONS.md` is the reason it can never be more than an oracle: on the GROUND light
 *   map, which is what this computes, the 2-D infinite-row form is a unit-test oracle only and may
 *   not reach a user path, because at garden scale edge rows dominate and a finite array needs the
 *   explicit polygon projection the bake does.
 * - **The fixture**, a synthetic year and one array in the two shapes the two sides want it: a
 *   `TileArray` for the driver and a `PvArray` for the bake.
 */
import { arrayId } from '../types/ids'
import type { PvArray } from '../types/pv'
import type {
  Celsius,
  Degrees,
  DegreesLatitude,
  DegreesLongitude,
  EpochMillis,
  Fraction,
  Meters,
  Radians,
  WattsPeak,
} from '../types/units'
import type { SolarPositionSeries, TmySeries } from '../types/weather'
import { derivedArrayMetrics } from './geometry'
import { at, cosDeg, degreesToRadians, sinDeg } from './math'
import { shadedGroundFractionInfiniteRows } from './shading'
import { pressureFromElevation, profileAngle, type SpaObserver } from './solar'
import { PAR_FRACTION_DEFAULT, PHOTON_CONVERSION_UMOL_PER_J } from './units'
import { vfGroundSky2dOracle } from './viewfactor'

/** Everything about a tile that changes its light. Two tiles agreeing on this share an answer */
export interface TileArray {
  readonly collectorWidthM: number
  readonly pitchM: number
  readonly tiltDeg: number
  readonly clearanceHeightM: number
  /** The direction the rows RUN. Read by the plot geometry, not by the shading below */
  readonly rowAzimuthDeg: number
  /**
   * The direction the modules FACE, which for a fixed array is ninety degrees off the row.
   *
   * Passing the row azimuth here, ninety degrees away, makes a driver that thinks the array blocks
   * 43% of the annual light where the real bake says 16%. `src/sim/pv/chain.ts` passes
   * `orientation.surfaceAzimuthDeg` here and it is right to: the profile angle that decides
   * row-to-row shading is measured in the plane perpendicular to the rows, which is the plane the
   * modules face along.
   */
  readonly surfaceAzimuthDeg: number
  readonly transmittance: number
}

export interface TileLight {
  /** Mean daily light integral over the year, under the array */
  readonly annualDliMolM2Day: number
  /** The same tile with nothing above it */
  readonly openSkyDliMolM2Day: number
  /**
   * The two halves of `annualDliMolM2Day`, kept apart because they are approximated in different
   * ways and only fail together by coincidence: the beam is reduced by a shaded GROUND FRACTION
   * and the diffuse by a SKY VIEW FACTOR. `gap.test.ts` compares each against the bake's own
   * separate beam and diffuse accumulators, which is the only way to tell which one is wrong
   */
  readonly beamDliMolM2Day: number
  readonly diffuseDliMolM2Day: number
  /** The mean sky view factor this tile was given, which is the whole of the diffuse model */
  readonly skyViewFactor: number
  /** 1 - under/open, the quantity the application calls relative shade ratio */
  readonly shadeFraction: number
  /** Per calendar month, because a crop cares when the light arrives and not only how much */
  readonly monthlyDliMolM2Day: readonly number[]
}

const key = (array: TileArray | null, run: RunPosition | null): string =>
  array === null
    ? 'open'
    : [
        array.collectorWidthM,
        array.pitchM,
        array.tiltDeg,
        array.clearanceHeightM,
        array.surfaceAzimuthDeg,
        array.transmittance,
        // the run is part of the configuration now: two tiles under identical panels get
        // different light if one is at the end of a row of them and the other is in the middle
        run === INFINITE ? 'inf' : run.length,
        run === INFINITE ? 0 : run.index,
      ].join(':')

/**
 * Where a tile sits in a RUN of arrays, which lets one tile's panels shade its neighbours' ground.
 *
 * A run is the stretch of adjacent tiles carrying the same array, measured along the PITCH
 * direction, which is the direction perpendicular to the way the rows go. That is the only
 * direction in which one tile's panels shade another's ground: neighbours along the rows are in
 * line with them and block nothing extra.
 */
export interface RunPosition {
  /** How many tiles the run is, counting this one. 1 means a lone array with open ground both sides */
  readonly length: number
  /** Which tile of the run this is, from 0 to length-1 */
  readonly index: number
}

/**
 * No run given means rows running forever in both directions.
 *
 * That default is load-bearing. `gap.test.ts` validates this driver against the full raster bake
 * and its whole framing is "one tile, infinite rows in both directions", so a finite default would
 * silently change what that test compares. The infinite model is the validated one, so it stays the
 * default and a finite run is something a caller asks for
 */
const INFINITE = null

/**
 * How much of the sky a ground point can see with only the rows that actually EXIST above it.
 *
 * The whole reason position matters. `vfGroundSky2dOracle` in `viewfactor.ts` answers the same
 * question for an array that runs forever in both directions, by summing over a fixed
 * `VF_GROUND_SKY_2D_MAX_ROWS = 10` either side. This is that calculation with the row count and
 * the tile's place in it made real, so the end of a run sees the open sky the interior does not.
 *
 * Same geometry and same integral: each row blocks an angular band in the cross-row plane, and
 * the sky view factor of a horizontal surface is the crossed-strings integral over what is left,
 * `(cos a - cos b) / 2` summed over the unblocked wedges. With nothing overhead that is
 * `(cos 0 - cos pi) / 2 = 1`, which is the check the test uses as its floor.
 *
 * Bands are UNIONED. They are never assumed disjoint. At a shallow tilt two rows can occlude the same
 * wedge, and summing their gaps without merging would count sky that is blocked twice as visible
 */
export const skyViewFactorForRun = (
  array: TileArray,
  run: RunPosition,
  samples: number,
): number => {
  const height = array.clearanceHeightM + 0.5 * array.collectorWidthM * sinDeg(array.tiltDeg)
  const halfWidth = array.collectorWidthM / 2
  const dy = halfWidth * sinDeg(array.tiltDeg)
  const dx = halfWidth * cosDeg(array.tiltDeg)

  let total = 0
  for (let sample = 0; sample < samples; sample += 1) {
    // where the ground point sits across its own tile, and so where it sits in the whole run
    const here = run.index + (sample + 0.5) / samples
    const blocked: { lo: number; hi: number }[] = []
    for (let row = 0; row < run.length; row += 1) {
      const distance = (row - here) * array.pitchM
      const phiA = Math.atan2(height + dy, distance + dx)
      const phiB = Math.atan2(height - dy, distance - dx)
      blocked.push({ lo: Math.min(phiA, phiB), hi: Math.max(phiA, phiB) })
    }
    blocked.sort((a, b) => a.lo - b.lo)

    // union, then integrate the complement over (0, pi)
    let visible = 0
    let cursor = 0
    for (const band of blocked) {
      if (band.lo > cursor) visible += Math.cos(cursor) - Math.cos(band.lo)
      cursor = Math.max(cursor, band.hi)
    }
    if (cursor < Math.PI) visible += Math.cos(cursor) - Math.cos(Math.PI)
    total += visible / 2
  }
  return samples === 0 ? 1 : total / samples
}

/** How much of the sky a tile can see under rows that never end, averaged across one pitch */
const meanSkyViewFactor = (array: TileArray): number => {
  const samples = vfGroundSky2dOracle(
    array.collectorWidthM as Meters,
    array.pitchM as Meters,
    array.tiltDeg as Degrees,
    array.clearanceHeightM as Meters,
    24,
  )
  let total = 0
  for (let i = 0; i < samples.length; i += 1) total += at(samples, i)
  return samples.length === 0 ? 1 : total / samples.length
}

const MILLIS_PER_DAY = 86_400_000

export const createCoarseLight = (weather: TmySeries, position: SolarPositionSeries) => {
  const cache = new Map<string, TileLight>()
  const hours = Math.min(weather.ghiWM2.length, position.count)
  const days = Math.max(1, hours / 24)

  const compute = (array: TileArray | null, run: RunPosition | null): TileLight => {
    const skyViewFactor =
      array === null
        ? 1
        : run === INFINITE
          ? meanSkyViewFactor(array)
          : skyViewFactorForRun(array, run, 24)
    const monthlyUnder = new Array<number>(12).fill(0)
    const monthlyDays = new Array<number>(12).fill(0)
    let underWh = 0
    let openWh = 0
    let beamWh = 0
    let diffuseWh = 0
    let lastDay = -1

    for (let i = 0; i < hours; i += 1) {
      const ghi = at(weather.ghiWM2, i)
      const dhi = at(weather.dhiWM2, i)
      const elevationDeg = at(position.apparentElevationDeg, i)
      const month = new Date(at(weather.utcMillis, i)).getUTCMonth()
      const day = Math.floor(at(weather.utcMillis, i) / MILLIS_PER_DAY)
      if (day !== lastDay) {
        lastDay = day
        monthlyDays[month] = (monthlyDays[month] ?? 0) + 1
      }
      openWh += ghi
      if (ghi <= 0 || elevationDeg <= 0) continue

      const beam = Math.max(0, ghi - dhi)
      let under: number
      if (array === null) {
        under = ghi
        beamWh += beam
        diffuseWh += dhi
      } else {
        // the beam is blocked by the fraction of ground the rows shade at this profile angle;
        // the diffuse is reduced by how much sky the tile can see. Two separate terms, because
        // an array that blocks half the beam does not block half the sky
        const { psiRad, side } = profileAngle(
          degreesToRadians(elevationDeg) as Radians,
          degreesToRadians(at(position.azimuthDeg, i)) as Radians,
          degreesToRadians(array.surfaceAzimuthDeg) as Radians,
        )
        /*
          The beam a tile loses is the shadow of the row UPSUN of it, and a finite run does not
          always have one.

          In the infinite-row model each strip of ground between two rows is shaded by exactly one
          row, the one the sun is behind. That is what `shadedGroundFractionInfiniteRows` returns.
          A run of arrays on a board is not infinite, so a tile at the upsun end of its run has no
          row casting onto it and keeps its beam.

          `side` records which side of the rows the sun is on, so `index - side` is the row that
          would cast; outside the run there is no such row. Which end that makes bright depends on
          a sign convention, and it flips through the day as the sun crosses the row line, so over
          a season both ends of a run gain. The physical claim being made is the one the test
          pins: the ENDS of a run are brighter than its middle, and a lone array is brightest
        */
        const caster = run === INFINITE ? 0 : run.index - side
        const shadedByRow = run === INFINITE || (caster >= 0 && caster < run.length)
        const shaded = shadedByRow
          ? shadedGroundFractionInfiniteRows(
              array.collectorWidthM as Meters,
              array.pitchM as Meters,
              array.tiltDeg as Degrees,
              psiRad,
              side,
            )
          : (0 as Fraction)
        const litBeam = beam * (1 - shaded * (1 - array.transmittance))
        under = litBeam + dhi * skyViewFactor
        beamWh += litBeam
        diffuseWh += dhi * skyViewFactor
      }
      underWh += under
      monthlyUnder[month] = (monthlyUnder[month] ?? 0) + under
    }

    // Wh/m2 to mol/m2, then to a daily mean. The same conversion `units.ts` uses
    const toDli = (wh: number, overDays: number): number =>
      overDays <= 0
        ? 0
        : (wh * 3600 * PAR_FRACTION_DEFAULT * PHOTON_CONVERSION_UMOL_PER_J) / 1e6 / overDays

    const openSkyDliMolM2Day = toDli(openWh, days)
    const annualDliMolM2Day = toDli(underWh, days)
    return {
      annualDliMolM2Day,
      openSkyDliMolM2Day,
      beamDliMolM2Day: toDli(beamWh, days),
      diffuseDliMolM2Day: toDli(diffuseWh, days),
      skyViewFactor,
      shadeFraction:
        openSkyDliMolM2Day <= 0 ? 0 : Math.max(0, 1 - annualDliMolM2Day / openSkyDliMolM2Day),
      monthlyDliMolM2Day: monthlyUnder.map((wh, month) => toDli(wh, monthlyDays[month] ?? 0)),
    }
  }

  return {
    /** Memoised by configuration, which is the whole reason this is affordable at town scale */
    forTile: (array: TileArray | null, run: RunPosition | null = INFINITE): TileLight => {
      const cacheKey = key(array, run)
      const hit = cache.get(cacheKey)
      if (hit !== undefined) return hit
      const computed = compute(array, run)
      cache.set(cacheKey, computed)
      return computed
    },
    distinctConfigurations: (): number => cache.size,
  }
}

const HOURS = 8760
const FIXTURE_ELEVATION_M = 90 as Meters

/**
 * A clear-sky year modulated by a deterministic cloud field.
 *
 * Synthetic, so the comparison needs no network and gives the same numbers on
 * every machine. The point of it is the driver against the bake on the SAME weather, so whether
 * the weather is real does not enter into it.
 *
 * The year is the right SHAPE and the wrong SIZE: there is no diurnal term and no dew point, so
 * nothing about temperature, evapotranspiration or frost may be read out of it. Light is all it
 * is for
 */
export const buildYear = (): TmySeries => {
  const utcMillis = new Float64Array(HOURS)
  const ghiWM2 = new Float32Array(HOURS)
  const dryBulbC = new Float32Array(HOURS)
  const windSpeedMS = new Float32Array(HOURS)

  let seed = 20_260_903
  const next = () => {
    seed = (seed * 1_664_525 + 1_013_904_223) % 4_294_967_296
    return seed / 4_294_967_296
  }

  for (let i = 0; i < HOURS; i += 1) {
    const millis = Date.UTC(2024, 0, 1) + i * 3_600_000
    utcMillis[i] = millis
    const hourOfDay = i % 24
    const dayOfYear = Math.floor(i / 24)
    const declination = 23.44 * Math.sin((2 * Math.PI * (dayOfYear - 80)) / 365)
    const latitude = (42.37 * Math.PI) / 180
    const sinEl =
      Math.sin(latitude) * Math.sin((declination * Math.PI) / 180) +
      Math.cos(latitude) *
        Math.cos((declination * Math.PI) / 180) *
        Math.cos(((hourOfDay - 12) * 15 * Math.PI) / 180)
    const cosz = Math.max(0, sinEl)
    ghiWM2[i] = cosz > 0 ? 1098 * cosz * Math.exp(-0.059 / cosz) * (0.35 + 0.65 * next()) : 0
    dryBulbC[i] = 12 - 14 * Math.cos((2 * Math.PI * dayOfYear) / 365)
    windSpeedMS[i] = 2
  }

  return {
    source: 'user-upload',
    decomposition: 'passthrough',
    utcOffsetHours: -5,
    startUtcMillis: 0 as EpochMillis,
    utcMillis,
    ghiWM2,
    dniWM2: new Float32Array(HOURS),
    dhiWM2: new Float32Array(HOURS),
    dryBulbC,
    dewPointC: new Float32Array(HOURS),
    windSpeedMS,
    pressureMb: new Float32Array(HOURS).fill(1013),
    provenance: {
      datasetLabel: 'coarse-light oracle fixture',
      yearsCovered: [2024],
      licence: 'CC0',
      attribution: 'synthetic',
      retrievedUtcMillis: 0 as EpochMillis,
      isTypicalMeteorologicalYear: false,
    },
  }
}

/**
 * Amherst, Massachusetts, which is the latitude `buildYear` lays its sun path on.
 *
 * The same four numbers `observerFor(site)` would derive from a full `Site`, written out
 * directly here, refraction temperature included: `src/sim` may not import `src/data`, and
 * assembling a whole `Site` only to read four fields off it would drag the agronomy layer
 * into a light test. `observerFor` reads the July normal for that figure, and the fixture's
 * normals put it at 21 C
 */
export const OBSERVER: SpaObserver = {
  location: {
    latitudeDeg: 42.37 as DegreesLatitude,
    longitudeDeg: -72.52 as DegreesLongitude,
  },
  elevationM: FIXTURE_ELEVATION_M,
  pressureMb: pressureFromElevation(FIXTURE_ELEVATION_M),
  temperatureC: 21 as Celsius,
}

/**
 * The one array both sides of the comparison use, in the two shapes they want it: a `TileArray`
 * for the coarse driver and a `PvArray` for the real bake.
 *
 * Here, shared by both sides, because every comparison must agree on it exactly. A
 * divergence between them would look like a physics finding
 */
export const ARRAY: TileArray = {
  collectorWidthM: 2.4,
  pitchM: 6.5,
  tiltDeg: 30,
  clearanceHeightM: 2.8,
  rowAzimuthDeg: 90,
  surfaceAzimuthDeg: 180,
  transmittance: 0,
}

export const MODULE = {
  widthM: 1.13 as Meters,
  heightM: 1.72 as Meters,
  nameplateWp: 430 as WattsPeak,
  bifacialityFactor: 0.7 as Fraction,
  transmittanceFraction: 0 as Fraction,
  rearReflectance: 0.05 as Fraction,
  backsheet: 'glass-glass' as const,
}

export const buildArray = (
  rowCount: number,
  modulesPerRow: number,
  rowAzimuthDeg: number = ARRAY.rowAzimuthDeg,
): PvArray => {
  const shape = {
    id: arrayId('oracle'),
    label: 'oracle',
    geometry: {
      collectorWidthM: ARRAY.collectorWidthM as Meters,
      pitchM: ARRAY.pitchM as Meters,
      rowLengthM: (modulesPerRow * 2) as Meters,
      rowCount,
      modulesPerRow,
      clearanceHeightM: ARRAY.clearanceHeightM as Meters,
      rowAzimuthDeg: rowAzimuthDeg as Degrees,
      originM: { xM: 0 as Meters, yM: 0 as Meters },
    },
    tracker: {
      mode: 'fixed' as const,
      tiltDeg: ARRAY.tiltDeg as Degrees,
      surfaceAzimuthDeg: ARRAY.surfaceAzimuthDeg as Degrees,
    },
    module: MODULE,
  }
  return { ...shape, derived: derivedArrayMetrics(shape as PvArray) } as PvArray
}
