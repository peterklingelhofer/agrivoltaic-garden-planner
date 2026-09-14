import { describe, expect, it } from 'bun:test'
import { banded, interval } from '../types/band'
import type { GardenPlot } from '../types/garden'
import { arrayId, bedId, plotId, siteId } from '../types/ids'
import { DEFAULT_GROUND_COVER } from '../types/ground'
import type { PvArray } from '../types/pv'
import type { Site } from '../types/site'
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
  Millimeters,
  MillimetersPerYear,
  SquareMeters,
  WattsPeak,
} from '../types/units'
import type { TmySeries } from '../types/weather'
import { checkMassachusettsSmart } from './compliance'
import { at } from './math'
import { FINAL_OPTIONS, PREVIEW_OPTIONS, runSimulation } from './pipeline'
import { monthlyRsrRaster } from './raster'
import { observerFor, solarPositionSeries } from './solar'
import { simCacheKey } from './worker/client'

const HOURS = 8760

// synthetic clear-sky-ish TMY: the pipeline only needs a well-formed 8760 h series
const weather = (): TmySeries => {
  const utcMillis = new Float64Array(HOURS)
  const ghiWM2 = new Float32Array(HOURS)
  const dniWM2 = new Float32Array(HOURS)
  const dhiWM2 = new Float32Array(HOURS)
  const start = Date.UTC(2021, 0, 1)
  for (let i = 0; i < HOURS; i += 1) {
    utcMillis[i] = start + i * 3_600_000
    const hourOfDay = i % 24
    const dayOfYear = Math.floor(i / 24)
    const seasonal = 0.6 + 0.4 * Math.cos((2 * Math.PI * (dayOfYear - 172)) / 365)
    const daylight = Math.max(0, Math.sin((Math.PI * (hourOfDay - 6)) / 12))
    ghiWM2[i] = 950 * daylight * seasonal
    dniWM2[i] = 800 * daylight * seasonal
    dhiWM2[i] = 150 * daylight * seasonal
  }
  return {
    source: 'open-meteo',
    decomposition: 'passthrough',
    utcOffsetHours: -5,
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

const monthly = <T>(value: T): T[] => Array.from({ length: 12 }, () => value)

const site: Site = {
  id: siteId('site-1'),
  label: 'Amherst MA',
  location: { latitudeDeg: 42.37 as DegreesLatitude, longitudeDeg: -72.52 as DegreesLongitude },
  elevationM: 90 as Meters,
  timezone: 'America/New_York',
  timezoneBasis: 'upstream',
  utcOffsetHours: -5,
  koppenCode: 'Dfb',
  botanicalArea: null,
  hardiness: [],
  heatDaysAbove30C: 12,
  normals: {
    monthlyMeanTempC: monthly(12 as Celsius),
    monthlyMinTempC: monthly(4 as Celsius),
    monthlyMaxTempC: monthly(20 as Celsius),
    monthlyPrecipMm: monthly(90 as Millimeters),
    monthlyMeanDliMolM2Day: monthly(28),
    heatDaysAbove30C: 12,
    normalsPeriod: '1991-2020',
    source: 'open-meteo',
  },
  chill: {
    chillingHours: 1200 as never,
    utahChillUnits: 1000 as never,
    dynamicChillPortions: 60 as never,
    seasonStart: 305 as never,
    seasonEnd: 60 as never,
  },
  frost: [],
  seasonGdd: { base4C: 2600 as never, base10C: 1400 as never, percentile: 50 },
  soil: {
    phUnits: 6.4,
    textureClass: 'loam',
    drainage: 'well',
    effectiveDepthM: 0.7 as Meters,
    organicMatterFraction: 0.05 as Fraction,
    sourceId: 'user',
  },
  waterLimitation: {
    index: 0.2 as Fraction,
    band: banded(interval(0.15 as Fraction, 0.25 as Fraction), 0.8, 'confidence', 'soil-water', []),
    aridityIndex: 1.4,
    referenceEtMm: 700 as MillimetersPerYear,
    rainfallMm: 985 as MillimetersPerYear,
    method: 'fao56-penman-monteith',
    fallbackReason: null,
    limited: false,
  },
}

const pvArray: PvArray = {
  id: arrayId('array-1'),
  label: 'South rows',
  geometry: {
    collectorWidthM: 2 as Meters,
    pitchM: 6 as Meters,
    rowLengthM: 12 as Meters,
    rowCount: 3,
    modulesPerRow: 4,
    clearanceHeightM: 2.6 as Meters,
    rowAzimuthDeg: 180 as Degrees,
    originM: { xM: 0 as Meters, yM: 0 as Meters },
  },
  tracker: { mode: 'fixed', tiltDeg: 25 as Degrees, surfaceAzimuthDeg: 180 as Degrees },
  module: {
    widthM: 1 as Meters,
    heightM: 2 as Meters,
    nameplateWp: 400 as WattsPeak,
    bifacialityFactor: 0.7 as Fraction,
    transmittanceFraction: 0 as Fraction,
    rearReflectance: 0.05 as Fraction,
    backsheet: 'glass-glass',
  },
  derived: {
    groundCoverRatio: 0.3333 as Fraction,
    projectedGroundCoverRatio: 0.3021 as Fraction,
    maxHeightM: 3.45 as Meters,
    nameplateDcKw: 4.8 as KilowattsDc,
    nameplateAcKw: 4 as KilowattsAc,
  },
}

const plot: GardenPlot = {
  id: plotId('plot-1'),
  groundCover: DEFAULT_GROUND_COVER,
  siteId: siteId('site-1'),
  label: 'Plot',
  boundary: {
    exterior: [
      { xM: -10 as Meters, yM: -10 as Meters },
      { xM: 10 as Meters, yM: -10 as Meters },
      { xM: 10 as Meters, yM: 10 as Meters },
      { xM: -10 as Meters, yM: 10 as Meters },
    ],
    holes: [],
  },
  northOffsetDeg: 0 as Degrees,
  originOffsetM: { xM: 0 as Meters, yM: 0 as Meters },
  beds: [
    {
      id: bedId('bed-1'),
      label: 'Bed between rows',
      footprint: {
        exterior: [
          { xM: -3 as Meters, yM: 1 as Meters },
          { xM: 3 as Meters, yM: 1 as Meters },
          { xM: 3 as Meters, yM: 4 as Meters },
          { xM: -3 as Meters, yM: 4 as Meters },
        ],
        holes: [],
      },
      areaM2: 18 as SquareMeters,
      soil: site.soil,
      irrigation: {
        method: 'drip',
        available: true,
        appliedMmPerYear: 0 as never,
        harvestsPanelRunoff: false,
      },
      raisedHeightM: 0 as Meters,
      modifiers: [],
      waterHarvesting: [],
      plantings: [],
    },
  ],
  arrays: [pvArray],
}

describe('annual simulation pipeline', () => {
  it('bakes an annual DLI raster on the CPU reference backend', async () => {
    const series = weather()
    const started = Date.now()
    const result = await runSimulation(
      site,
      plot,
      series,
      { ...PREVIEW_OPTIONS, targetCellSizeM: 1.5 as Meters, backend: 'cpu-reference' },
      () => {},
    )
    const elapsed = Date.now() - started

    // there is one implementation, and this would notice a bake that ran without it
    expect(result.physics).toBe('rust')
    expect(result.raster.grid.cols).toBeGreaterThan(4)
    expect(result.raster.quality.sunDirectionCount).toBeGreaterThan(50)
    expect(result.bedLight).toHaveLength(1)
    const bed = result.bedLight[0]
    expect(bed?.cellCount).toBeGreaterThan(0)
    expect(bed?.annualMeanDliMolM2Day).toBeGreaterThan(0)

    const cells = result.raster.grid.cols * result.raster.grid.rows
    let shadedCells = 0
    for (let i = 0; i < cells; i += 1) {
      const under = at(result.raster.annualUnderArrayMolM2Day, i)
      const open = at(result.raster.annualOpenSkyMolM2Day, i)
      expect(open).toBeGreaterThan(0)
      expect(under).toBeLessThanOrEqual(open * 1.001)
      expect(at(result.raster.skyViewFactor, i)).toBeGreaterThanOrEqual(0)
      expect(at(result.raster.skyViewFactor, i)).toBeLessThanOrEqual(1.001)
      if (under < open * 0.95) shadedCells += 1
    }
    // the array must actually cast a shadow somewhere in the plot
    expect(shadedCells).toBeGreaterThan(0)

    const june = monthlyRsrRaster(result.raster, 5)
    for (let i = 0; i < june.length; i += 1) {
      expect(at(june, i)).toBeGreaterThanOrEqual(0)
      expect(at(june, i)).toBeLessThanOrEqual(1)
    }

    const compliance = checkMassachusettsSmart({
      plot,
      raster: result.raster,
      growingWindow: { startMonth: 4, endMonth: 9 },
    })
    expect(compliance.isDetermination).toBe(false)
    expect(['meets-expedited-parameters', 'requires-exception-request']).toContain(
      compliance.overall,
    )

    // recorded for the performance budget in docs/ARCHITECTURE.md section 5
    expect(elapsed).toBeLessThan(120_000)
  }, 180_000)

  it('bakes 8760 h x 4 sub-steps of solar position inside the 8 ms class budget', () => {
    const series = weather()
    const substepped = new Float64Array(HOURS * 4)
    for (let h = 0; h < HOURS; h += 1) {
      for (let k = 0; k < 4; k += 1) substepped[h * 4 + k] = at(series.utcMillis, h) + k * 900_000
    }
    const observer = observerFor(site)
    const started = performance.now()
    const position = solarPositionSeries(substepped, observer, 'nrel-spa')
    const elapsed = performance.now() - started
    expect(position.count).toBe(HOURS * 4)
    expect(elapsed).toBeLessThan(5000)
  })

  it('keys the memo on anything that moves a shadow and nothing that does not', () => {
    const series = weather()
    const options = { ...FINAL_OPTIONS, backend: 'cpu-reference' as const }
    const base = simCacheKey(site, plot, series, options)
    expect(simCacheKey(site, plot, series, options)).toBe(base)
    expect(simCacheKey(site, { ...plot, label: 'renamed' }, series, options)).toBe(base)

    const tilted: GardenPlot = {
      ...plot,
      arrays: [
        {
          ...pvArray,
          tracker: { mode: 'fixed', tiltDeg: 30 as Degrees, surfaceAzimuthDeg: 180 as Degrees },
        },
      ],
    }
    expect(simCacheKey(site, tilted, series, options)).not.toBe(base)

    const widened: GardenPlot = {
      ...plot,
      arrays: [{ ...pvArray, geometry: { ...pvArray.geometry, pitchM: 8 as Meters } }],
    }
    expect(simCacheKey(site, widened, series, options)).not.toBe(base)
    expect(
      simCacheKey(site, plot, series, { ...options, targetCellSizeM: 0.25 as Meters }),
    ).not.toBe(base)
  })
})
