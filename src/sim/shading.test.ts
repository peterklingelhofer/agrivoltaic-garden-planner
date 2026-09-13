import { describe, expect, it } from 'bun:test'
import type { GridSpec, Polygon2D } from '../types/geo'
import { arrayId } from '../types/ids'
import type {
  DerivedArrayMetrics,
  ModuleSpec,
  PvArray,
  RowGeometry,
  TrackerConfig,
} from '../types/pv'
import type {
  Degrees,
  EpochMillis,
  Fraction,
  KilowattsAc,
  KilowattsDc,
  Meters,
  Radians,
  WattsPeak,
} from '../types/units'
import type { SkyPatch } from '../types/weather'
import { panelSnapshot } from './geometry'
import { degreesToRadians } from './math'
import {
  beamVisibilityRaster,
  penumbraWidthM,
  pointInPolygon,
  projectPanelToGround,
  shadedGroundFractionInfiniteRows,
} from './shading'
import { profileAngle, sunUnitVector } from './solar'
import { skyViewFactorRaster, vfGroundSky2dOracle } from './viewfactor'

const defaultModule: ModuleSpec = {
  widthM: 1 as Meters,
  heightM: 2 as Meters,
  nameplateWp: 400 as WattsPeak,
  bifacialityFactor: 0.7 as Fraction,
  transmittanceFraction: 0 as Fraction,
  rearReflectance: 0.05 as Fraction,
  backsheet: 'glass-glass',
}

const defaultDerived: DerivedArrayMetrics = {
  groundCoverRatio: 0 as Fraction,
  projectedGroundCoverRatio: 0 as Fraction,
  maxHeightM: 0 as Meters,
  nameplateDcKw: 0 as KilowattsDc,
  nameplateAcKw: 0 as KilowattsAc,
}

const makeArray = (geometry: Partial<RowGeometry>, tracker: TrackerConfig): PvArray => ({
  id: arrayId('test-array'),
  label: 'test',
  geometry: {
    collectorWidthM: 2 as Meters,
    pitchM: 5 as Meters,
    rowLengthM: 10 as Meters,
    rowCount: 3,
    modulesPerRow: 2,
    clearanceHeightM: 3 as Meters,
    rowAzimuthDeg: 180 as Degrees,
    originM: { xM: 0 as Meters, yM: 0 as Meters },
    ...geometry,
  },
  tracker,
  module: defaultModule,
  derived: defaultDerived,
})

describe('pointInPolygon', () => {
  const square: Polygon2D = {
    exterior: [
      { xM: 0 as Meters, yM: 0 as Meters },
      { xM: 10 as Meters, yM: 0 as Meters },
      { xM: 10 as Meters, yM: 10 as Meters },
      { xM: 0 as Meters, yM: 10 as Meters },
    ],
    holes: [
      [
        { xM: 4 as Meters, yM: 4 as Meters },
        { xM: 6 as Meters, yM: 4 as Meters },
        { xM: 6 as Meters, yM: 6 as Meters },
        { xM: 4 as Meters, yM: 6 as Meters },
      ],
    ],
  }

  it('is true inside the exterior and outside every hole', () => {
    expect(pointInPolygon({ xM: 1 as Meters, yM: 1 as Meters }, square)).toBe(true)
  })

  it('is false inside a hole', () => {
    expect(pointInPolygon({ xM: 5 as Meters, yM: 5 as Meters }, square)).toBe(false)
  })

  it('is false outside the exterior', () => {
    expect(pointInPolygon({ xM: 20 as Meters, yM: 20 as Meters }, square)).toBe(false)
  })
})

describe('projectPanelToGround', () => {
  const array = makeArray(
    {},
    { mode: 'fixed', tiltDeg: 20 as Degrees, surfaceAzimuthDeg: 180 as Degrees },
  )
  const panel = panelSnapshot([array], 0 as EpochMillis, 45 as Degrees, 180 as Degrees).panels[0]

  it('returns an empty exterior when the sun is at or below the horizon', () => {
    if (!panel) throw new Error('fixture panel missing')
    const sun = sunUnitVector(-5 as Degrees, 180 as Degrees)
    expect(projectPanelToGround(panel, sun).exterior).toHaveLength(0)
  })
})

describe('penumbraWidthM', () => {
  it('is 0.0093 rad times slant distance', () => {
    expect(penumbraWidthM(8 as Meters)).toBeCloseTo(0.0744, 10)
  })
})

describe('beamVisibilityRaster', () => {
  it('stays within [transmittance, 1]', () => {
    const array = makeArray(
      {},
      { mode: 'fixed', tiltDeg: 20 as Degrees, surfaceAzimuthDeg: 180 as Degrees },
    )
    const { panels } = panelSnapshot([array], 0 as EpochMillis, 45 as Degrees, 180 as Degrees)
    const grid: GridSpec = {
      extent: { minXM: -5 as Meters, minYM: -5 as Meters, maxXM: 5 as Meters, maxYM: 5 as Meters },
      cellSizeM: 0.5 as Meters,
      cols: 20,
      rows: 20,
    }
    const sun = sunUnitVector(30 as Degrees, 180 as Degrees)
    const transmittance = 0.3 as Fraction
    const visibility = beamVisibilityRaster(grid, panels, sun, transmittance, 2)
    for (let i = 0; i < visibility.length; i += 1) {
      const v = visibility[i] ?? -1
      expect(v).toBeGreaterThanOrEqual(transmittance)
      expect(v).toBeLessThanOrEqual(1)
    }
  })
})

// pvlib.bifacial.utils.vf_ground_sky_2d golden values (the solar geometry document section 8 tolerance: 0.002 absolute)
describe('vfGroundSky2dOracle', () => {
  it('matches pvlib for a tilted, high-clearance row', () => {
    const clearanceHeightM = 2.5 - Math.sin((20 * Math.PI) / 180)
    const result = vfGroundSky2dOracle(
      2 as Meters,
      5 as Meters,
      20 as Degrees,
      clearanceHeightM as Meters,
      10,
    )
    const expected = [
      0.5418857521, 0.551067175, 0.5822070508, 0.6221428751, 0.6569602773, 0.67581099, 0.6722999572,
      0.6441667026, 0.600728007, 0.5607097421,
    ]
    for (const [i, e] of expected.entries())
      expect(Math.abs((result[i] ?? 0) - e)).toBeLessThan(0.002)
  })

  it('matches pvlib for a flat, low-clearance row', () => {
    const result = vfGroundSky2dOracle(2 as Meters, 4 as Meters, 0 as Degrees, 2 as Meters, 10)
    const expected = [
      0.4316186572, 0.4444828928, 0.4783614283, 0.5203908174, 0.5542686073, 0.5671313501,
      0.5542648717, 0.5203833387, 0.4783501916, 0.4444678757,
    ]
    for (const [i, e] of expected.entries())
      expect(Math.abs((result[i] ?? 0) - e)).toBeLessThan(0.002)
  })
})

// Shared many-row, long-row fixture: interior cells here approach the infinite-row limit
// that the analytic oracle assumes, so its own edges and array ends must stay far away
const MANY_ROWS = {
  collectorWidthM: 2 as Meters,
  pitchM: 5 as Meters,
  tiltDeg: 20 as Degrees,
  clearanceHeightM: (2.5 - Math.sin((20 * Math.PI) / 180)) as Meters,
  rowLengthM: 500 as Meters,
  rowCount: 25,
}

const manyRowArray = makeArray(
  {
    collectorWidthM: MANY_ROWS.collectorWidthM,
    pitchM: MANY_ROWS.pitchM,
    clearanceHeightM: MANY_ROWS.clearanceHeightM,
    rowLengthM: MANY_ROWS.rowLengthM,
    rowCount: MANY_ROWS.rowCount,
    modulesPerRow: 1,
    // rows running east-west, facing south: `rowAzimuthDeg` is the direction the rows RUN, so
    // it has to be perpendicular to the way the modules face. It read 180 here until
    // 2026-09-01, matching the surface azimuth rather than crossing it, and that made a
    // coherent array only because `panelSnapshot` had its two horizontal axes exchanged. The
    // comparisons below are the ones that should have caught that; they couldn't, because
    // this fixture was the one array shape the old code got right
    rowAzimuthDeg: 90 as Degrees,
    originM: { xM: 0 as Meters, yM: 0 as Meters },
  },
  { mode: 'fixed', tiltDeg: MANY_ROWS.tiltDeg, surfaceAzimuthDeg: 180 as Degrees },
)

const manyRowPanels = panelSnapshot(
  [manyRowArray],
  0 as EpochMillis,
  45 as Degrees,
  180 as Degrees,
).panels

// A locally-built dense Reinhart-class hemisphere, built here without importing src/sim/skydome.ts.
// solidAngle = (sin a2 - sin a1) * dAzimuthRad
const buildHemispherePatches = (altBands: number, azBins: number): SkyPatch[] => {
  const patches: SkyPatch[] = []
  const dAzRad = (2 * Math.PI) / azBins
  for (let i = 0; i < altBands; i += 1) {
    const alt1 = (i * 90) / altBands
    const alt2 = ((i + 1) * 90) / altBands
    const solidAngleSr =
      (Math.sin(degreesToRadians(alt2)) - Math.sin(degreesToRadians(alt1))) * dAzRad
    for (let j = 0; j < azBins; j += 1) {
      patches.push({
        index: i * azBins + j,
        altitudeDeg: ((alt1 + alt2) / 2) as Degrees,
        azimuthDeg: (((j + 0.5) * 360) / azBins) as Degrees,
        solidAngleSr,
        cumulativeRadianceWhPerM2: 0,
      })
    }
  }
  return patches
}

describe('skyViewFactorRaster vs vfGroundSky2dOracle (polygon-projection closure)', () => {
  it('agrees with the infinite-row oracle across a cross-row strip through the array center', () => {
    const samples = 24
    const cellSizeM = MANY_ROWS.pitchM / samples
    const periods = 3
    const halfRows = (periods * samples) / 2
    const grid: GridSpec = {
      extent: {
        minXM: (-cellSizeM / 2) as Meters,
        maxXM: (cellSizeM / 2) as Meters,
        minYM: (-(halfRows + 0.5) * cellSizeM) as Meters,
        maxYM: ((periods * samples - halfRows + 0.5) * cellSizeM) as Meters,
      },
      cellSizeM: cellSizeM as Meters,
      cols: 1,
      rows: periods * samples,
    }
    const patches = buildHemispherePatches(60, 90)
    const measured = skyViewFactorRaster(grid, manyRowPanels, patches)
    const oracle = vfGroundSky2dOracle(
      MANY_ROWS.collectorWidthM,
      MANY_ROWS.pitchM,
      MANY_ROWS.tiltDeg,
      MANY_ROWS.clearanceHeightM,
      samples,
    )

    // grid cell centers sit at exact multiples of cellSizeM, so only an integer index shift
    // and a possible mirror remain unknown between the raster's y axis and the oracle's u axis
    let worstCase = Infinity
    for (const dir of [1, -1]) {
      for (let shift = 0; shift < samples; shift += 1) {
        let maxErr = 0
        for (let r = 0; r < grid.rows; r += 1) {
          const idx = (((dir * (r - halfRows) + shift) % samples) + samples) % samples
          const err = Math.abs((measured[r] ?? 0) - (oracle[idx] ?? 0))
          if (err > maxErr) maxErr = err
        }
        if (maxErr < worstCase) worstCase = maxErr
      }
    }
    // measured worst-case absolute agreement with a locally-built 60x90-patch hemisphere: 0.0043
    expect(worstCase).toBeLessThan(0.01)
  }, 30_000)
})

describe('pitch-averaged shaded ground fraction vs shadedGroundFractionInfiniteRows', () => {
  // the SURFACE azimuth, which is what decides a profile angle and what `pv/chain.ts` passes.
  // It's the row azimuth turned ninety degrees, and the two are easy to swap by accident
  const surfaceAzimuthRad = degreesToRadians(180) as Radians

  it.each([
    { elevationDeg: 40, azimuthDeg: 180 },
    { elevationDeg: 25, azimuthDeg: 150 },
  ])('matches at elevation $elevationDeg, azimuth $azimuthDeg', ({ elevationDeg, azimuthDeg }) => {
    const sun = sunUnitVector(elevationDeg as Degrees, azimuthDeg as Degrees)
    const { psiRad, side } = profileAngle(
      degreesToRadians(elevationDeg) as Radians,
      degreesToRadians(azimuthDeg) as Radians,
      surfaceAzimuthRad,
    )
    const expected = shadedGroundFractionInfiniteRows(
      MANY_ROWS.collectorWidthM,
      MANY_ROWS.pitchM,
      MANY_ROWS.tiltDeg,
      psiRad,
      side,
    )

    const samples = 40
    const cellSizeM = MANY_ROWS.pitchM / samples
    const halfSpanM = (samples / 2) * cellSizeM
    const grid: GridSpec = {
      extent: {
        minXM: (-cellSizeM / 2) as Meters,
        maxXM: (cellSizeM / 2) as Meters,
        minYM: -halfSpanM as Meters,
        maxYM: halfSpanM as Meters,
      },
      cellSizeM: cellSizeM as Meters,
      cols: 1,
      rows: samples,
    }
    const visibility = beamVisibilityRaster(grid, manyRowPanels, sun, 0 as Fraction, 4)
    let sum = 0
    for (let i = 0; i < visibility.length; i += 1) sum += 1 - (visibility[i] ?? 0)
    const measured = sum / visibility.length

    // measured absolute error: 0.0014 at elevation 40 deg, 0.0013 at elevation 25 deg
    expect(Math.abs(measured - expected)).toBeLessThan(0.005)
  })
})
