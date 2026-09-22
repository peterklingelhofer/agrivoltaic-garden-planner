import { describe, expect, it } from 'bun:test'
import type { GridSpec, Polygon2D } from '../types/geo'
import type { GardenPlot } from '../types/garden'
import { arrayId, bedId, plotId, siteId } from '../types/ids'
import { DEFAULT_GROUND_COVER } from '../types/ground'
import type { DliRaster, RasterQuality } from '../types/light'
import type { PvArray } from '../types/pv'
import type {
  Degrees,
  Fraction,
  Meters,
  MolPerM2Day,
  SquareMeters,
  WattsPeak,
} from '../types/units'
import type { KilowattsAc, KilowattsDc } from '../types/units'
import { bedLight, cellIndicesInPolygon, homogeneity, seasonLight } from './aggregate'
import { checkAllRegimes, checkMassachusettsSmart } from './compliance'
import { at } from './math'
import {
  applyInterreflection,
  dliRasterFromAccumulation,
  monthlyRsrRaster,
  rasterTransferables,
} from './raster'
import { pointInPolygon } from './shading'
import { byMonth, molPerM2FromWhPerM2 } from './units'
import type { AccumulationResult } from './backend'

const COLS = 8
const ROWS = 8
const CELLS = COLS * ROWS

const grid: GridSpec = {
  extent: { minXM: 0 as Meters, minYM: 0 as Meters, maxXM: 8 as Meters, maxYM: 8 as Meters },
  cellSizeM: 1 as Meters,
  cols: COLS,
  rows: ROWS,
}

const quality: RasterQuality = {
  subdivision: 'reinhart-mf2',
  sunDirectionCount: 700,
  substepsPerHour: 4,
  parFraction: 0.45 as Fraction,
  photonConversionUmolPerJ: 4.57,
  interreflectionApplied: false,
  seasonalParHalfWidthFraction: 0.1 as Fraction,
}

const accumulation = (beam: number, diffuse: number, svf: number): AccumulationResult => ({
  beamWhPerM2: new Float32Array(CELLS).fill(beam),
  diffuseWhPerM2: new Float32Array(CELLS).fill(diffuse),
  windowWhPerM2: [],
  monthlyBeamWhPerM2: Array.from({ length: 12 }, () => new Float32Array(CELLS).fill(beam / 12)),
  monthlyDiffuseWhPerM2: Array.from({ length: 12 }, () =>
    new Float32Array(CELLS).fill(diffuse / 12),
  ),
  skyViewFactor: new Float32Array(CELLS).fill(svf),
  backend: 'cpu-reference',
  elapsedMs: 1,
})

// 1000 kWh/m2/yr of beam plus 400 of diffuse is a plausible temperate open-sky total
const openSky = accumulation(1_000_000, 400_000, 1)
const underArray = accumulation(400_000, 260_000, 0.6)

const raster = (): DliRaster => dliRasterFromAccumulation(grid, underArray, openSky, quality)

// 66% transmission everywhere clears the MA SMART per-point 50% floor
const compliantRaster = (): DliRaster =>
  dliRasterFromAccumulation(grid, accumulation(600_000, 320_000, 0.75), openSky, quality)

const square = (minX: number, minY: number, size: number): Polygon2D => ({
  exterior: [
    { xM: minX as Meters, yM: minY as Meters },
    { xM: (minX + size) as Meters, yM: minY as Meters },
    { xM: (minX + size) as Meters, yM: (minY + size) as Meters },
    { xM: minX as Meters, yM: (minY + size) as Meters },
  ],
  holes: [],
})

describe('DLI raster assembly', () => {
  it('converts accumulated Wh/m2 into a daily light integral', () => {
    const built = raster()
    const expected = molPerM2FromWhPerM2(1_000_000 + 400_000, 0.45) / 365
    expect(at(built.annualOpenSkyMolM2Day, 0)).toBeCloseTo(expected, 4)
    // a mid-latitude open-sky annual mean DLI lands in the high twenties
    expect(at(built.annualOpenSkyMolM2Day, 0)).toBeGreaterThan(20)
    expect(at(built.annualOpenSkyMolM2Day, 0)).toBeLessThan(40)
  })

  it('never lets an under-array cell exceed the open sky', () => {
    const built = raster()
    for (let i = 0; i < CELLS; i += 1) {
      expect(at(built.annualUnderArrayMolM2Day, i)).toBeLessThanOrEqual(
        at(built.annualOpenSkyMolM2Day, i) + 1e-6,
      )
    }
  })

  it('derives a monthly RSR raster inside [0,1]', () => {
    const rsr = monthlyRsrRaster(raster(), 5)
    for (let i = 0; i < rsr.length; i += 1) {
      expect(at(rsr, i)).toBeGreaterThanOrEqual(0)
      expect(at(rsr, i)).toBeLessThanOrEqual(1)
    }
    expect(at(rsr, 0)).toBeCloseTo(1 - 660_000 / 1_400_000, 5)
  })

  it('applies the inter-reflection term E / (1 - rho_g (1 - SVF) rho_m) once only', () => {
    const base = raster()
    const white = applyInterreflection(base, 0.25 as Fraction, 0.7 as Fraction)
    const gain = 1 / (1 - 0.25 * (1 - 0.6) * 0.7)
    expect(
      at(white.annualUnderArrayMolM2Day, 0) / at(base.annualUnderArrayMolM2Day, 0),
    ).toBeCloseTo(gain, 6)
    // 3-8% for a white backsheet over grass
    expect(gain).toBeGreaterThan(1.03)
    expect(gain).toBeLessThan(1.08)
    expect(white.quality.interreflectionApplied).toBe(true)
    expect(applyInterreflection(white, 0.25 as Fraction, 0.7 as Fraction)).toBe(white)
    // glass-glass rear over grass is under 1% and safely ignorable
    const glass = applyInterreflection(base, 0.2 as Fraction, 0.05 as Fraction)
    expect(
      at(glass.annualUnderArrayMolM2Day, 0) / at(base.annualUnderArrayMolM2Day, 0),
    ).toBeLessThan(1.01)
  })

  it('lists every Float32Array buffer as a transferable', () => {
    const buffers = rasterTransferables(raster())
    expect(buffers).toHaveLength(3 + 24)
    expect(new Set(buffers).size).toBe(buffers.length)
  })
})

describe('per-bed aggregation', () => {
  it('selects the cells whose centres fall inside the footprint', () => {
    const indices = cellIndicesInPolygon(raster(), square(2, 2, 3))
    expect(indices).toHaveLength(9)
  })

  /**
   * `cellIndicesInPolygon` narrows its scan to the rows and columns the footprint's own bounding
   * box can reach before it tests a single cell, and this checks that narrowing never drops a
   * cell a full scan would have kept: a brute-force pass over every cell in the grid, against the
   * same `pointInPolygon` predicate, has to agree on the indices and their order for a shape
   * square in the grid, one with a diagonal edge, one that hangs off the grid's own edge and one
   * that stands nowhere near it
   */
  it('agrees with a brute-force scan of every cell, on the grid, off its edge and clear of it', () => {
    const built = raster()
    const bruteForce = (footprint: Polygon2D): number[] => {
      const { extent, cellSizeM, cols, rows } = built.grid
      const indices: number[] = []
      for (let row = 0; row < rows; row += 1) {
        const yM = (extent.minYM + (row + 0.5) * cellSizeM) as Meters
        for (let col = 0; col < cols; col += 1) {
          const xM = (extent.minXM + (col + 0.5) * cellSizeM) as Meters
          if (pointInPolygon({ xM, yM }, footprint)) indices.push(row * cols + col)
        }
      }
      return indices
    }
    const triangle: Polygon2D = {
      exterior: [
        { xM: 1 as Meters, yM: 1 as Meters },
        { xM: 6 as Meters, yM: 1 as Meters },
        { xM: 1 as Meters, yM: 6 as Meters },
      ],
      holes: [],
    }
    const hangingOffTheEdge = square(6, 6, 4)
    const whollyOffTheGrid = square(20, 20, 3)
    for (const [label, footprint] of [
      ['a square inside the grid', square(2, 2, 3)],
      ['a triangle inside the grid', triangle],
      ['a footprint hanging off the grid', hangingOffTheEdge],
      ['a footprint wholly off the grid', whollyOffTheGrid],
    ] as const) {
      expect(Array.from(cellIndicesInPolygon(built, footprint)), label).toEqual(
        bruteForce(footprint),
      )
    }
    expect(cellIndicesInPolygon(built, whollyOffTheGrid)).toHaveLength(0)
  })

  it('summarises a bed and its season', () => {
    const built = raster()
    const light = bedLight(built, bedId('bed-1'), square(1, 1, 4))
    expect(light.cellCount).toBe(16)
    expect(light.annualMeanDliMolM2Day).toBeGreaterThan(0)
    expect(light.homogeneity.minOverMean).toBeCloseTo(1, 6)
    expect(light.monthlyRsr[5]).toBeCloseTo(1 - 660_000 / 1_400_000, 5)

    const season = seasonLight(light, { startMonth: 4, endMonth: 9 }, 17 as MolPerM2Day)
    expect(season.cumulativeRsr).toBeCloseTo(light.monthlyRsr[5], 5)
    expect(season.meanDliMolM2Day).toBeGreaterThan(0)
    expect(season.minMonthlyDliMolM2Day).toBeLessThanOrEqual(season.maxMonthlyDliMolM2Day)
  })

  /**
   * The sky view factor is computed per cell, and a bed has to carry it, or no crop, no readout and
   * no sentence can reach it. It is the geometry that decides how much a bed loses to the sky at
   * night as well as how much diffuse light it gets by day
   */
  it('carries the sky view factor the bed cells already had onto the bed', () => {
    const built = dliRasterFromAccumulation(
      grid,
      accumulation(600_000, 320_000, 0.62),
      openSky,
      quality,
    )
    expect(bedLight(built, bedId('bed-1'), square(1, 1, 4)).skyViewFactor).toBeCloseTo(0.62, 6)
  })

  it('reports homogeneity from the spread of cell values', () => {
    expect(homogeneity(Float32Array.from([10, 10, 10])).coefficientOfVariation).toBeCloseTo(0, 9)
    const mixed = homogeneity(Float32Array.from([5, 10, 15]))
    expect(mixed.minOverMean).toBeCloseTo(0.5, 6)
    expect(mixed.coefficientOfVariation).toBeGreaterThan(0.3)
  })
})

const array = (clearanceM: number, nameplateKw: number): PvArray => ({
  id: arrayId('array-1'),
  label: 'Row array',
  geometry: {
    collectorWidthM: 2 as Meters,
    pitchM: 6 as Meters,
    rowLengthM: 20 as Meters,
    rowCount: 3,
    modulesPerRow: 10,
    clearanceHeightM: clearanceM as Meters,
    rowAzimuthDeg: 180 as Degrees,
    originM: { xM: 4 as Meters, yM: 4 as Meters },
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
    groundCoverRatio: 0.333 as Fraction,
    projectedGroundCoverRatio: 0.302 as Fraction,
    maxHeightM: 3 as Meters,
    nameplateDcKw: nameplateKw as KilowattsDc,
    nameplateAcKw: (nameplateKw / 1.2) as KilowattsAc,
  },
})

const plot = (clearanceM: number, nameplateKw: number): GardenPlot => ({
  id: plotId('plot-1'),
  groundCover: DEFAULT_GROUND_COVER,
  siteId: siteId('site-1'),
  label: 'Test plot',
  boundary: square(0, 0, 8),
  northOffsetDeg: 0 as Degrees,
  originOffsetM: { xM: 0 as Meters, yM: 0 as Meters },
  obstructions: [],
  beds: [
    {
      id: bedId('bed-1'),
      label: 'Bed 1',
      footprint: square(1, 1, 4),
      areaM2: 16 as SquareMeters,
      soil: {
        phUnits: 6.5,
        textureClass: 'loam',
        drainage: 'well',
        effectiveDepthM: 0.6 as Meters,
        organicMatterFraction: 0.04 as Fraction,
        sourceId: 'user',
      },
      irrigation: {
        method: 'drip',
        available: true,
        appliedMmPerYear: 0 as never,
      },
      raisedHeightM: 0 as Meters,
      modifiers: [],
      waterHarvesting: [],
      plantings: [],
    },
  ],
  arrays: [array(clearanceM, nameplateKw)],
})

describe('MA SMART compliance', () => {
  const window = { startMonth: 4, endMonth: 9 }

  it('passes a compliant design and reports it as not a determination', () => {
    const check = checkMassachusettsSmart({
      plot: plot(2.5, 12),
      raster: compliantRaster(),
      growingWindow: window,
    })
    expect(check.overall).toBe('meets-expedited-parameters')
    expect(check.isDetermination).toBe(false)
    expect(check.regime.verifiability).toBe('estimate-only')
  })

  it('fails when any square foot drops below 50% of open-sky light', () => {
    const dark = dliRasterFromAccumulation(
      grid,
      accumulation(200_000, 150_000, 0.4),
      openSky,
      quality,
    )
    const check = checkMassachusettsSmart({
      plot: plot(2.5, 12),
      raster: dark,
      growingWindow: window,
    })
    const sunlight = check.results.find((result) => result.criterion.key === 'sunlight-everywhere')
    expect(sunlight?.outcome).toBe('approximate')
    expect(check.overall).toBe('requires-exception-request')
  })

  it('enforces the 8 ft fixed clearance and the DC nameplate ceiling', () => {
    const low = checkMassachusettsSmart({
      plot: plot(2.0, 12),
      raster: compliantRaster(),
      growingWindow: window,
    })
    expect(
      low.results.some((r) => r.criterion.key.startsWith('clearance:') && r.outcome === 'misses'),
    ).toBe(true)
    const big = checkMassachusettsSmart({
      plot: plot(2.5, 9000),
      raster: compliantRaster(),
      growingWindow: window,
    })
    expect(
      big.results.some((r) => r.criterion.key === 'nameplate-dc' && r.outcome === 'misses'),
    ).toBe(true)
  })

  it('reports every other regime as an estimate that needs field agronomy', () => {
    const checks = checkAllRegimes({ plot: plot(2.5, 12), raster: raster(), growingWindow: window })
    expect(checks).toHaveLength(5)
    for (const check of checks.filter((c) => c.regime.id !== 'us-ma-smart')) {
      expect(check.regime.verifiability).toBe('estimate-only')
      expect(check.overall).toBe('indeterminate')
      expect(check.isDetermination).toBe(false)
      const result = check.results[0]
      expect(result?.outcome).toBe('estimate')
      if (result?.outcome === 'estimate') {
        expect(result.requiresFieldAgronomy).toBe(true)
        expect(result.estimated.dominantSource).toBe('crop-response')
        expect(result.estimated.interval.lower).toBeLessThanOrEqual(result.estimated.interval.upper)
      }
    }
  })
})

describe('month helpers', () => {
  it('builds a twelve-element tuple', () => {
    expect(byMonth((month) => month)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11])
  })
})
