import { beforeEach, describe, expect, it } from 'bun:test'
import { siteFixture } from '../recommend/testkit'
import type { Celsius, Millimeters } from '../types/units'
import { epochMillis } from '../types/units'
import { ready } from './slices'
import { snowCoverSeries } from '../sim/snow'
import {
  albedoUnderSnow,
  GROUND_COVERS,
  groundAlbedoOf,
  SNOW_ALBEDO,
  type GroundCover,
} from '../types/ground'
import { measuredYearFixture } from '../data/testkit'
import { measuredSeasonYear } from '../simulation/year'
import type { SeasonReport } from '../types/simulation'
import type { DayOfYear, Fraction } from '../types/units'
import {
  resetAppStore,
  sceneCloud,
  sceneGroundAlbedo,
  scenePrecipKind,
  sceneRainMmPerHour,
  sceneSnowCover,
  useAppStore,
} from './store'

/**
 * `groundSnowCover` was well tested as a function and nothing tested that its answer reaches the
 * ground the camera sees. These are that wiring, from a resolved site to the two numbers `Ground`
 * and `SkyLight` actually read.
 *
 * A browser comparison of the January ground with the same ground in June can't test snow. Two
 * dates differ in SUN ELEVATION far more than in albedo, so that comparison reads irradiance and
 * can't say whether snow was applied. Compare at a fixed day with and without the normals, which
 * is what these do
 */

/** Amherst's real 1991-2020 normals, as `resolveSite` returns them */
const AMHERST_TEMP_C = [-3.9, -2.8, 1.5, 8, 14.2, 19.4, 22.5, 21.5, 17.5, 10.9, 4.9, -0.5]
const AMHERST_PRECIP_MM = [86.3, 76.5, 100, 94.5, 81.7, 90.3, 82.1, 88.3, 98.5, 110.9, 83.7, 105.5]

const JANUARY = epochMillis(Date.UTC(2024, 0, 15, 16, 0, 0))
const JUNE = epochMillis(Date.UTC(2024, 5, 21, 16, 0, 0))

const amherst = () =>
  siteFixture({
    normals: {
      ...siteFixture().normals,
      monthlyMeanTempC: AMHERST_TEMP_C.map((value) => value as Celsius),
      monthlyPrecipMm: AMHERST_PRECIP_MM.map((value) => value as Millimeters),
    },
  })

beforeEach(() => {
  localStorage.clear()
  resetAppStore()
})

describe('snow reaching the ground the camera sees', () => {
  it('is nothing at all until a site is resolved, rather than a guess', () => {
    useAppStore.getState().setTime(JANUARY)
    expect(sceneSnowCover(useAppStore.getState())).toBe(0)
  })

  it('lies in January at a cold wet site, from that site own normals', () => {
    useAppStore.setState({ site: ready(amherst()) })
    useAppStore.getState().setTime(JANUARY)
    expect(sceneSnowCover(useAppStore.getState())).toBeGreaterThan(0.9)
  })

  it('is gone in June at the same site, so it follows the year and not the site', () => {
    useAppStore.setState({ site: ready(amherst()) })
    useAppStore.getState().setTime(JUNE)
    expect(sceneSnowCover(useAppStore.getState())).toBe(0)
  })

  it('carries the cover into the albedo both the ground and the sky bounce read', () => {
    useAppStore.setState({ site: ready(amherst()) })
    useAppStore.getState().setTime(JUNE)
    const bare = sceneGroundAlbedo(useAppStore.getState())
    useAppStore.getState().setTime(JANUARY)
    const covered = sceneGroundAlbedo(useAppStore.getState())
    expect(covered).toBeGreaterThan(bare)
    expect(covered).toBeCloseTo(SNOW_ALBEDO, 2)
  })
})

/**
 * The picture and the number, checked against each other directly.
 *
 * Both the renderer and the PV chain read `groundSnowCover` and both blend with `albedoUnderSnow`,
 * so the scene never draws a white January while the year's generation is computed off summer
 * grass. This is what says they still do
 */
describe('the ground the camera sees and the ground the chain reads', () => {
  const JANUARY_MILLIS = Date.UTC(2024, 0, 15, 16, 0, 0)

  const chainAlbedoOn = (millis: number, cover: GroundCover): number => {
    const series = snowCoverSeries(amherst().normals, Float64Array.of(millis))
    return albedoUnderSnow(groundAlbedoOf(cover), series[0] as number)
  }

  it('are the same number on the same day, whichever cover is chosen', () => {
    for (const cover of GROUND_COVERS) {
      useAppStore.setState({ site: ready(amherst()) })
      useAppStore.getState().setGroundCover(cover)
      useAppStore.getState().setTime(epochMillis(JANUARY_MILLIS))
      expect(sceneGroundAlbedo(useAppStore.getState()), cover).toBeCloseTo(
        chainAlbedoOn(JANUARY_MILLIS, cover),
        10,
      )
    }
  })

  it('are the same number in June too, where the answer is the bare cover', () => {
    useAppStore.setState({ site: ready(amherst()) })
    useAppStore.getState().setGroundCover('straw-mulch')
    useAppStore.getState().setTime(JUNE)
    expect(sceneGroundAlbedo(useAppStore.getState())).toBeCloseTo(groundAlbedoOf('straw-mulch'), 10)
    expect(chainAlbedoOn(JUNE, 'straw-mulch')).toBeCloseTo(groundAlbedoOf('straw-mulch'), 10)
  })
})

/**
 * The weather the scene shows is the record's, on the seasons step, and nothing anywhere else.
 * A season run on a measured year hands the scene that year's own hours: the rain that fell in
 * the hour the clock is on, and the cloud read as the measured sun against a clear one
 */
describe('weather reaching the scene, from the year the season ran on', () => {
  const report = (year: number | null): SeasonReport => ({
    season: 1,
    year: {
      year,
      label: year === null ? 'a typical year' : String(year),
      rainfallMm: 900,
      rainMeasured: true,
      referenceEtMm: 700,
      waterIndex: 0.2 as Fraction,
      waterLimited: false,
      gddBase10C: 1600,
      frostFreeDays: 155,
      lastSpringFreeze: 125 as DayOfYear,
      firstFallFreeze: 280 as DayOfYear,
      heatDaysAbove30C: 12,
    },
    outcomes: [],
    harvestIndex: null,
    energyKwh: null,
    energyShare: null,
    advice: { id: 'status', text: '', bedId: null },
  })

  /** A wet, dim 2018 beside a dry, clear 2019, as sites, the way the store keeps them */
  const seed = (): void => {
    const site = amherst()
    const wet = measuredYearFixture({ year: 2018, meanC: 12, rainMmPerHour: 0.3 })
    // the same year with the sun cut to a third of clear: overcast by the clearness index
    const dim = {
      ...wet,
      weather: { ...wet.weather, ghiWM2: wet.weather.ghiWM2.map((value) => value / 3) },
    }
    const dry = measuredYearFixture({ year: 2019, meanC: 12, rainMmPerHour: 0 })
    useAppStore.setState({
      site: ready(site),
      weather: ready(dry.weather),
      years: [dim, dry],
      seasonYears: [dim, dry].map((year) => measuredSeasonYear(site, year)),
      sidebarStep: 'seasons',
    })
    useAppStore.getState().setTime(JUNE)
  }

  it('is nothing at all off the seasons step, whatever the record says', () => {
    seed()
    useAppStore.setState({
      sidebarStep: 'light',
      sweeping: true,
      simulation: { ...useAppStore.getState().simulation, reports: [report(2018)] },
    })
    expect(sceneRainMmPerHour(useAppStore.getState())).toBe(0)
    expect(sceneCloud(useAppStore.getState())).toBe(0)
  })

  it('is the hour of the year the season ran on: its rain and its cloud, while it plays', () => {
    seed()
    useAppStore.setState({
      sweeping: true,
      simulation: { ...useAppStore.getState().simulation, reports: [report(2018)] },
    })
    expect(sceneRainMmPerHour(useAppStore.getState())).toBeCloseTo(0.3, 6)
    const cloud = sceneCloud(useAppStore.getState())
    expect(cloud).toBeGreaterThan(0.4)
    expect(cloud).toBeLessThanOrEqual(1)
  })

  it('is nothing once the season has stopped playing, even on a wet hour of a run season', () => {
    seed()
    useAppStore.setState({
      sweeping: false,
      simulation: { ...useAppStore.getState().simulation, reports: [report(2018)] },
    })
    expect(sceneRainMmPerHour(useAppStore.getState())).toBe(0)
  })

  it('is the typical year until a measured one has been run, and clearer when the sun was', () => {
    seed()
    useAppStore.setState({
      simulation: { ...useAppStore.getState().simulation, reports: [report(2018)] },
    })
    const dim = sceneCloud(useAppStore.getState())
    useAppStore.setState({
      simulation: { ...useAppStore.getState().simulation, reports: [report(null)] },
    })
    expect(sceneRainMmPerHour(useAppStore.getState())).toBe(0)
    // the fixture year builds its sun in solar time and the scene reads the hour through NREL
    // SPA in UTC, so even its clear sky isn't read as fully clear. What holds is the order
    const clear = sceneCloud(useAppStore.getState())
    expect(clear).toBeLessThan(dim)
    expect(clear).toBeLessThan(0.6)
  })

  it('is snow at or below freezing, and rain above it, from the hour’s own air temperature', () => {
    const site = amherst()
    const freezing = measuredYearFixture({ year: 2020, meanC: -30, rainMmPerHour: 0.3 })
    const mild = measuredYearFixture({ year: 2021, meanC: 12, rainMmPerHour: 0.3 })
    useAppStore.setState({
      site: ready(site),
      weather: ready(mild.weather),
      years: [freezing, mild],
      seasonYears: [freezing, mild].map((year) => measuredSeasonYear(site, year)),
      sidebarStep: 'seasons',
    })
    useAppStore.getState().setTime(JUNE)
    useAppStore.setState({
      simulation: { ...useAppStore.getState().simulation, reports: [report(2020)] },
    })
    expect(scenePrecipKind(useAppStore.getState())).toBe('snow')
    useAppStore.setState({
      simulation: { ...useAppStore.getState().simulation, reports: [report(2021)] },
    })
    expect(scenePrecipKind(useAppStore.getState())).toBe('rain')
  })
})
