import { describe, expect, it } from 'bun:test'
import { arrayId } from '../../types/ids'
import {
  DEFAULT_GROUND_COVER,
  GROUND_COVER_ALBEDO,
  GROUND_COVERS,
  groundAlbedoOf,
} from '../../types/ground'
import type { PvArray } from '../../types/pv'
import type {
  Celsius,
  Degrees,
  DegreesLatitude,
  DegreesLongitude,
  EpochMillis,
  Fraction,
  KilowattsAc,
  KilowattsDc,
  Meters,
  WattsPeak,
} from '../../types/units'
import type { ClimateNormals, TmySeries } from '../../types/weather'
import { snowCoverSeries } from '../snow'
import { observerFor, solarPositionSeries } from '../solar'
import { DEFAULT_PV_CHAIN_OPTIONS, runAnnualChain } from './chain'

/**
 * The ground's albedo is a term in the ground-reflected component of the plane-of-array irradiance
 * and it is the WHOLE of the rear-side irradiance of a bifacial module, so holding it fixed, at 0.2
 * for every garden, would tell a grower who mulched with straw and a grower who left bare soil the
 * same number.
 *
 * These measure the size of what was being hidden, without asserting a chosen answer: the
 * relationship each one checks follows from the physics in the core's `transposition.rs` and `pv/bifacial.rs`,
 * and what makes them worth having is that they fail loudly if the cover ever stops reaching the
 * chain again, which is the defect that was actually there
 */

const HOURS = 8760
const UTC_OFFSET_HOURS = -5

const weather = (): TmySeries => {
  const utcMillis = new Float64Array(HOURS)
  const ghiWM2 = new Float32Array(HOURS)
  const dniWM2 = new Float32Array(HOURS)
  const dhiWM2 = new Float32Array(HOURS)
  const start = Date.UTC(2021, 0, 1)
  for (let i = 0; i < HOURS; i += 1) {
    const dayOfYear = Math.floor(i / 24)
    utcMillis[i] = start + i * 3_600_000
    const seasonal = 0.6 + 0.4 * Math.cos((2 * Math.PI * (dayOfYear - 172)) / 365)
    const localHour = ((i % 24) + UTC_OFFSET_HOURS + 24) % 24
    const daylight = Math.max(0, Math.sin((Math.PI * (localHour - 6)) / 12))
    ghiWM2[i] = 950 * daylight * seasonal
    dniWM2[i] = 800 * daylight * seasonal
    dhiWM2[i] = 150 * daylight * seasonal
  }
  return {
    source: 'open-meteo',
    decomposition: 'passthrough',
    utcOffsetHours: UTC_OFFSET_HOURS,
    startUtcMillis: start as EpochMillis,
    utcMillis,
    ghiWM2,
    dniWM2,
    dhiWM2,
    dryBulbC: new Float32Array(HOURS).fill(12),
    dewPointC: new Float32Array(HOURS).fill(6),
    windSpeedMS: new Float32Array(HOURS).fill(2),
    pressureMb: new Float32Array(HOURS).fill(1013.25),
    provenance: {
      datasetLabel: 'synthetic-tmy',
      yearsCovered: [2021],
      licence: 'CC0',
      attribution: 'test',
      retrievedUtcMillis: start as EpochMillis,
      isTypicalMeteorologicalYear: true,
    },
  }
}

/** The shipped default array: 3 rows of 12 modules, 3.524 m collector on a 9 m pitch */
const array: PvArray = {
  id: arrayId('array-1'),
  label: 'Array 1',
  geometry: {
    collectorWidthM: 3.524 as Meters,
    pitchM: 9 as Meters,
    rowLengthM: 13.6 as Meters,
    rowCount: 3,
    modulesPerRow: 12,
    clearanceHeightM: 2.5 as Meters,
    rowAzimuthDeg: 90 as Degrees,
    originM: { xM: 0 as Meters, yM: 0 as Meters },
  },
  tracker: { mode: 'fixed', tiltDeg: 25 as Degrees, surfaceAzimuthDeg: 180 as Degrees },
  module: {
    widthM: 1.134 as Meters,
    heightM: 1.762 as Meters,
    nameplateWp: 430 as WattsPeak,
    bifacialityFactor: 0.7 as Fraction,
    transmittanceFraction: 0 as Fraction,
    rearReflectance: 0.05 as Fraction,
    backsheet: 'glass-glass',
  },
  derived: {
    groundCoverRatio: 0.3916 as Fraction,
    projectedGroundCoverRatio: 0.3549 as Fraction,
    maxHeightM: 3.99 as Meters,
    nameplateDcKw: 30.96 as KilowattsDc,
    nameplateAcKw: 25.8 as KilowattsAc,
  },
}

/** Amherst's real 1991-2020 normals, which is a site with a winter that lies */
const AMHERST_TEMP_C = [-3.9, -2.8, 1.5, 8, 14.2, 19.4, 22.5, 21.5, 17.5, 10.9, 4.9, -0.5]
const AMHERST_PRECIP_MM = [86.3, 76.5, 100, 94.5, 81.7, 90.3, 82.1, 88.3, 98.5, 110.9, 83.7, 105.5]

const site = {
  location: { latitudeDeg: 42.37 as DegreesLatitude, longitudeDeg: -72.52 as DegreesLongitude },
  elevationM: 90 as Meters,
  normals: {
    monthlyMeanTempC: AMHERST_TEMP_C.map((value) => value as Celsius),
    monthlyPrecipMm: AMHERST_PRECIP_MM,
  },
} as never

const tmy = weather()
const position = solarPositionSeries(tmy.utcMillis, observerFor(site), 'nrel-spa')

const yearAt = (albedo: number) =>
  runAnnualChain(array, tmy, position, {
    ...DEFAULT_PV_CHAIN_OPTIONS,
    groundAlbedo: albedo as Fraction,
  })

describe('the ground cover reaching the chain', () => {
  it('moves the year by about a tenth between the darkest and the brightest cover', () => {
    const darkest = yearAt(GROUND_COVER_ALBEDO['bare-soil']).annualAcKwh
    const brightest = yearAt(GROUND_COVER_ALBEDO['light-gravel']).annualAcKwh
    expect(brightest / darkest - 1).toBeGreaterThan(0.1)
  })

  it('raises the year monotonically with the albedo, at every cover offered', () => {
    const ordered = GROUND_COVERS.map(groundAlbedoOf).sort((a, b) => a - b)
    const years = ordered.map((albedo) => yearAt(albedo).annualAcKwh)
    for (let i = 1; i < years.length; i += 1) {
      expect(years[i], `${String(ordered[i])} over ${String(ordered[i - 1])}`).toBeGreaterThan(
        years[i - 1] as number,
      )
    }
  })

  /**
   * Nearly all of the movement is rear-side, which is why this is worth separating: the front
   * face only sees the ground through the (1 - cos tilt) / 2 term of the transposition, and at
   * 25 degrees that is under 5% of the hemisphere
   */
  it('lands almost entirely on the backs of the panels rather than the fronts', () => {
    const dark = yearAt(GROUND_COVER_ALBEDO['bare-soil'])
    const bright = yearAt(GROUND_COVER_ALBEDO['light-gravel'])
    expect(bright.bifacialGainFraction - dark.bifacialGainFraction).toBeGreaterThan(0.15)
  })

  it('changes nothing at all when the modules have no rear cells to catch it', () => {
    const mono = { ...array, module: { ...array.module, bifacialityFactor: 0 as Fraction } }
    const at = (albedo: number) =>
      runAnnualChain(mono, tmy, position, {
        ...DEFAULT_PV_CHAIN_OPTIONS,
        groundAlbedo: albedo as Fraction,
      }).bifacialGainFraction
    expect(at(GROUND_COVER_ALBEDO['light-gravel'])).toBe(0)
    expect(at(GROUND_COVER_ALBEDO['bare-soil'])).toBe(0)
  })
})

describe('the default cover', () => {
  /**
   * The default ground cover is 0.20, the value PVWatts v5 assumes when the ground is unknown, and
   * so is the chain's own default albedo. This is the assertion that holds the two together
   */
  it('carries exactly the 0.20 the whole app assumed before it was a choice', () => {
    expect(groundAlbedoOf(DEFAULT_GROUND_COVER)).toBe(0.2)
    expect(DEFAULT_PV_CHAIN_OPTIONS.groundAlbedo).toBe(0.2)
  })
})

/**
 * One albedo for all 8,760 hours is most wrong about the winter hours: snow is the brightest
 * surface a garden ever has, and the rear side of a bifacial module sees the ground and almost
 * nothing else. The chain reads the same snow model the renderer draws from, so the picture and the
 * number agree about the same ground
 */
describe('the winter the chain reads', () => {
  const snow = snowCoverSeries(
    (site as unknown as { readonly normals: ClimateNormals }).normals,
    tmy.utcMillis,
  )
  const withWinter = (albedo: number) =>
    runAnnualChain(array, tmy, position, {
      ...DEFAULT_PV_CHAIN_OPTIONS,
      groundAlbedo: albedo as Fraction,
      snowCover: snow,
    })

  it('raises the year at a site whose winters lie, over the same ground held bare', () => {
    const bare = yearAt(groundAlbedoOf('grass')).annualAcKwh
    const wintered = withWinter(groundAlbedoOf('grass')).annualAcKwh
    expect(wintered).toBeGreaterThan(bare)
    expect(wintered / bare - 1).toBeGreaterThan(0.01)
  })

  it('changes nothing where nothing is known about the winter, rather than inventing one', () => {
    expect(DEFAULT_PV_CHAIN_OPTIONS.snowCover).toBeNull()
    const asked = runAnnualChain(array, tmy, position, {
      ...DEFAULT_PV_CHAIN_OPTIONS,
      groundAlbedo: groundAlbedoOf('grass'),
      snowCover: null,
    }).annualAcKwh
    expect(asked).toBe(yearAt(groundAlbedoOf('grass')).annualAcKwh)
  })

  /**
   * Snow whitens a dark cover further than a bright one, because it is replacing more. So the
   * spread between the covers NARROWS over a winter, and a grower at a snowy site gets less out
   * of a bright mulch than the annual figures alone would suggest
   */
  it('narrows the gap between the darkest and the brightest cover', () => {
    const bareSpread =
      yearAt(groundAlbedoOf('light-gravel')).annualAcKwh /
      yearAt(groundAlbedoOf('bare-soil')).annualAcKwh
    const winterSpread =
      withWinter(groundAlbedoOf('light-gravel')).annualAcKwh /
      withWinter(groundAlbedoOf('bare-soil')).annualAcKwh
    expect(winterSpread).toBeLessThan(bareSpread)
  })
})
