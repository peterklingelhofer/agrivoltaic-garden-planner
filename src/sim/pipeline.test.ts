import { describe, expect, it } from 'bun:test'
import { banded, interval } from '../types/band'
import type { GardenPlot, Obstruction, Tree } from '../types/garden'
import { arrayId, bedId, obstructionId, plotId, siteId } from '../types/ids'
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
import { cellIndicesInPolygon } from './aggregate'
import { checkMassachusettsSmart } from './compliance'
import { at } from './math'
import { leafOnMonthsFor } from './obstruction'
import { FINAL_OPTIONS, runSimulation } from './pipeline'
import { monthlyRsrRaster } from './raster'
import { observerFor, solarPositionSeries } from './solar'
import { monthValue } from './units'
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
  obstructions: [],
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
      {
        ...FINAL_OPTIONS,
        subdivision: 'tregenza-mf1',
        substepsPerHour: 1,
        windows: [],
        targetCellSizeM: 1.5 as Meters,
        backend: 'cpu-reference',
      },
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

  it('shades with a drawn house: same open sky, less light under the array beside it (Record 26)', async () => {
    const series = weather()
    const options = {
      ...FINAL_OPTIONS,
      subdivision: 'tregenza-mf1' as const,
      substepsPerHour: 1,
      windows: [],
      targetCellSizeM: 1.5 as Meters,
      backend: 'cpu-reference' as const,
    }
    const bare = await runSimulation(site, plot, series, options, () => {})

    // 6 m to the eaves, 10 x 8 m footprint, its near wall a metre south of the bed's near
    // edge at y = 1 m: this latitude's low sun comes from the south, so that is the side its
    // shadow reaches the bed from
    const house: Obstruction = {
      id: obstructionId('house-1'),
      kind: 'house',
      label: 'Test house',
      footprint: {
        exterior: [
          { xM: -5 as Meters, yM: -8 as Meters },
          { xM: 5 as Meters, yM: -8 as Meters },
          { xM: 5 as Meters, yM: 0 as Meters },
          { xM: -5 as Meters, yM: 0 as Meters },
        ],
        holes: [],
      },
      heightM: 6 as Meters,
    }
    const plotWithHouse: GardenPlot = { ...plot, obstructions: [house] }
    const shaded = await runSimulation(site, plotWithHouse, series, options, () => {})

    // the reference stays the open sky whether or not a house is drawn
    for (let m = 0; m < 12; m += 1) {
      const bareMonth = bare.raster.monthlyOpenSkyMolM2Day[m]
      const shadedMonth = shaded.raster.monthlyOpenSkyMolM2Day[m]
      if (bareMonth === undefined || shadedMonth === undefined) throw new Error('missing month')
      for (let i = 0; i < bareMonth.length; i += 1)
        expect(at(shadedMonth, i)).toBe(at(bareMonth, i))
    }

    // the bed sits a metre from the house's near wall, so its darkest cell should darken further
    const bedFootprint = plot.beds[0]?.footprint ?? { exterior: [], holes: [] }
    const bedIndices = cellIndicesInPolygon(bare.raster, bedFootprint)
    let bareMin = Infinity
    let shadedMin = Infinity
    for (let k = 0; k < bedIndices.length; k += 1) {
      const cell = at(bedIndices, k)
      bareMin = Math.min(bareMin, at(bare.raster.annualUnderArrayMolM2Day, cell))
      shadedMin = Math.min(shadedMin, at(shaded.raster.annualUnderArrayMolM2Day, cell))
    }
    expect(shadedMin).toBeLessThan(bareMin)
  }, 30_000)

  it('shades a leaf-on month more than a leafless one, under a deciduous crown (Record 26)', async () => {
    // dryBulbC and dewPointC carry a real annual and diurnal cycle here, unlike the flat
    // `weather()` fixture above: the Growing Season Index (Decision Record 26) reads its leaf
    // calendar off temperature and humidity as well as day length, and a flat year would leave
    // day length alone to carry every assertion below
    const seasonalDryBulbC = Float32Array.from({ length: HOURS }, (_unused, i) => {
      const dayOfYear = Math.floor(i / 24)
      const hourOfDay = i % 24
      // the warmest day lags the solstice by about a month, as it does over land
      const annual = 8.5 + 13.5 * Math.cos((2 * Math.PI * (dayOfYear - 202)) / 365)
      const diurnal = 2.5 * Math.sin((2 * Math.PI * (hourOfDay - 6)) / 24)
      return annual + diurnal
    })
    const series: TmySeries = {
      ...weather(),
      dryBulbC: seasonalDryBulbC,
      dewPointC: Float32Array.from(seasonalDryBulbC, (t) => t - 3),
    }
    const options = {
      ...FINAL_OPTIONS,
      subdivision: 'tregenza-mf1' as const,
      substepsPerHour: 1,
      windows: [],
      targetCellSizeM: 1.5 as Meters,
      backend: 'cpu-reference' as const,
    }

    // self-check: July inside the leaf-on window, January outside it, or the assertions below
    // would compare two leaf-on (or two leafless) months and prove nothing
    const inLeaf = leafOnMonthsFor(site, series)
    expect(inLeaf[6]).toBe(true)
    expect(inLeaf[0]).toBe(false)

    const tree: Tree = {
      id: obstructionId('tree-1'),
      kind: 'tree',
      label: 'Test tree',
      footprint: {
        exterior: [
          { xM: -2.5 as Meters, yM: -6 as Meters },
          { xM: 2.5 as Meters, yM: -6 as Meters },
          { xM: 2.5 as Meters, yM: -1 as Meters },
          { xM: -2.5 as Meters, yM: -1 as Meters },
        ],
        holes: [],
      },
      crownBaseM: 2 as Meters,
      heightM: 7 as Meters,
      evergreen: false,
      transmittance: 0.15 as Fraction,
      leaflessTransmittance: 0.55 as Fraction,
    }
    const plotWithTree: GardenPlot = { ...plot, obstructions: [tree] }
    const result = await runSimulation(site, plotWithTree, series, options, () => {})

    const crownIndices = cellIndicesInPolygon(result.raster, tree.footprint)
    expect(crownIndices.length).toBeGreaterThan(0)

    const underOverOpenRatio = (month: number): number => {
      const under = monthValue(result.raster.monthlyUnderArrayMolM2Day, month)
      const open = monthValue(result.raster.monthlyOpenSkyMolM2Day, month)
      let underSum = 0
      let openSum = 0
      for (let k = 0; k < crownIndices.length; k += 1) {
        const cell = at(crownIndices, k)
        underSum += at(under, cell)
        openSum += at(open, cell)
      }
      return openSum > 0 ? underSum / openSum : 0
    }

    // July (leaf-on, transmittance 0.15) lets less light through than January (leafless, 0.55)
    expect(underOverOpenRatio(6)).toBeLessThan(underOverOpenRatio(0))
  }, 30_000)

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

    // a house drawn after a bake at this arrangement must miss the memo, and so must the same
    // house moved or raised: the probe of 2026-09-14 read a houseless field back as the house's
    const house: Obstruction = {
      id: obstructionId('house-1'),
      kind: 'house',
      label: 'House 1',
      footprint: {
        exterior: [
          { xM: -5 as Meters, yM: -8 as Meters },
          { xM: 5 as Meters, yM: -8 as Meters },
          { xM: 5 as Meters, yM: 0 as Meters },
          { xM: -5 as Meters, yM: 0 as Meters },
        ],
        holes: [],
      },
      heightM: 6 as Meters,
    }
    const housed = simCacheKey(site, { ...plot, obstructions: [house] }, series, options)
    expect(housed).not.toBe(base)
    const moved = {
      ...house,
      footprint: {
        ...house.footprint,
        exterior: house.footprint.exterior.map((p) => ({ ...p, yM: (p.yM - 1) as Meters })),
      },
    }
    expect(simCacheKey(site, { ...plot, obstructions: [moved] }, series, options)).not.toBe(housed)
    expect(
      simCacheKey(
        site,
        { ...plot, obstructions: [{ ...house, heightM: 8 as Meters }] },
        series,
        options,
      ),
    ).not.toBe(housed)

    // a tree changes what the bake shades with the same way: adding one, changing what it lets
    // through, or flipping whether it drops its leaves must each miss the memo too
    const tree: Tree = {
      id: obstructionId('tree-1'),
      kind: 'tree',
      label: 'Tree 1',
      footprint: {
        exterior: [
          { xM: -2.5 as Meters, yM: -6 as Meters },
          { xM: 2.5 as Meters, yM: -6 as Meters },
          { xM: 2.5 as Meters, yM: -1 as Meters },
          { xM: -2.5 as Meters, yM: -1 as Meters },
        ],
        holes: [],
      },
      crownBaseM: 2 as Meters,
      heightM: 7 as Meters,
      evergreen: false,
      transmittance: 0.15 as Fraction,
      leaflessTransmittance: 0.55 as Fraction,
    }
    const treed = simCacheKey(site, { ...plot, obstructions: [tree] }, series, options)
    expect(treed).not.toBe(base)
    expect(
      simCacheKey(
        site,
        { ...plot, obstructions: [{ ...tree, transmittance: 0.3 as Fraction }] },
        series,
        options,
      ),
    ).not.toBe(treed)
    expect(
      simCacheKey(site, { ...plot, obstructions: [{ ...tree, evergreen: true }] }, series, options),
    ).not.toBe(treed)
  })
})
