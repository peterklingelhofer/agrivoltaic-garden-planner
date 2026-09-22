import { describe, expect, it } from 'bun:test'
import type { Extent2D } from '../types/geo'
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
import {
  backtrackRotationDeg,
  gridForExtent,
  groundCoverRatio,
  minimumPitchM,
  panelSnapshot,
  projectedGroundCoverRatio,
  sceneExtent,
} from './geometry'

const DEG_TO_RAD = Math.PI / 180

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

describe('groundCoverRatio / projectedGroundCoverRatio', () => {
  it('is W/P, unaffected by tilt', () => {
    expect(groundCoverRatio(4 as Meters, 8 as Meters)).toBeCloseTo(0.5, 12)
  })

  it('projected GCR shrinks with tilt and matches GCR at tilt 0', () => {
    expect(projectedGroundCoverRatio(4 as Meters, 8 as Meters, 0 as Degrees)).toBeCloseTo(0.5, 12)
    expect(projectedGroundCoverRatio(4 as Meters, 8 as Meters, 60 as Degrees)).toBeCloseTo(0.25, 6)
  })
})

describe('backtrackRotationDeg', () => {
  it('reduces |rotation| when rows would self-shade', () => {
    const psi = (30 * DEG_TO_RAD) as Radians
    const rotation = backtrackRotationDeg(45 as Degrees, 3 as Meters, 2 as Meters, psi)
    expect(Math.abs(rotation)).toBeLessThan(45)
  })

  it('leaves rotation untouched when the pitch already prevents self-shading', () => {
    const psi = (30 * DEG_TO_RAD) as Radians
    const rotation = backtrackRotationDeg(45 as Degrees, 10 as Meters, 2 as Meters, psi)
    expect(rotation).toBeCloseTo(45, 12)
  })
})

describe('minimumPitchM', () => {
  it('reproduces the worked case P = W(cos b + sin b / tan psi_min)', () => {
    const tiltDeg = 30
    const minPsiRad = 20 * DEG_TO_RAD
    const expected =
      2 * (Math.cos(tiltDeg * DEG_TO_RAD) + Math.sin(tiltDeg * DEG_TO_RAD) / Math.tan(minPsiRad))
    expect(minimumPitchM(2 as Meters, tiltDeg as Degrees, minPsiRad as Radians)).toBeCloseTo(
      expected,
      9,
    )
  })
})

describe('panelSnapshot', () => {
  const fixed = makeArray(
    {},
    { mode: 'fixed', tiltDeg: 0 as Degrees, surfaceAzimuthDeg: 180 as Degrees },
  )

  it('produces rowCount x modulesPerRow panels, each with 4 corners', () => {
    const snapshot = panelSnapshot([fixed], 0 as EpochMillis, 45 as Degrees, 180 as Degrees)
    expect(snapshot.panels).toHaveLength(3 * 2)
    for (const panel of snapshot.panels) expect(panel.corners.vertices).toHaveLength(4)
  })

  it('points normals straight up at tilt 0', () => {
    const snapshot = panelSnapshot([fixed], 0 as EpochMillis, 45 as Degrees, 180 as Degrees)
    for (const panel of snapshot.panels) {
      expect(panel.normal.x).toBeCloseTo(0, 9)
      expect(panel.normal.y).toBeCloseTo(0, 9)
      expect(panel.normal.z).toBeCloseTo(1, 9)
    }
  })

  it('places the lower edge of every panel exactly at clearanceHeightM', () => {
    const snapshot = panelSnapshot([fixed], 0 as EpochMillis, 45 as Degrees, 180 as Degrees)
    for (const panel of snapshot.panels) {
      const [lowerA, lowerB] = panel.corners.vertices
      expect(lowerA?.zM).toBeCloseTo(3, 12)
      expect(lowerB?.zM).toBeCloseTo(3, 12)
    }
  })

  /**
   * The shape of the array, at a tilt where the two horizontal axes can be told apart.
   *
   * Everything above this runs at tilt 0, where the facing direction is multiplied by `cos(0) = 1`
   * into a zero-length span and drops out of the arithmetic entirely. That's exactly the pose in
   * which the bug these tests pin can't appear: `panelSnapshot` with the along-row and across-row
   * axes exchanged. The closed forms are tested against published values without ever being
   * rasterized, and the Rust parity sweep holds two implementations to each other, so neither
   * catches a swap that both implementations share.
   *
   * The array below is deliberately anisotropic: pitch 5, module length 5, collector width 2.
   * Confusing the axes moves every number in it
   */
  describe('the two horizontal axes, at a tilt that can tell them apart', () => {
    const tilted = makeArray(
      { rowAzimuthDeg: 90 as Degrees },
      { mode: 'fixed', tiltDeg: 30 as Degrees, surfaceAzimuthDeg: 180 as Degrees },
    )
    const panels = panelSnapshot([tilted], 0 as EpochMillis, 45 as Degrees, 180 as Degrees).panels
    const spread = (values: readonly number[]): number => Math.max(...values) - Math.min(...values)
    const xs = (index: number) => panels[index]?.corners.vertices.map((v) => v.xM) ?? []
    const ys = (index: number) => panels[index]?.corners.vertices.map((v) => v.yM) ?? []

    it('steps the rows across them, along the direction the modules face', () => {
      // rows run east-west, so they step north-south, one pitch at a time
      const rowOf = (row: number) =>
        panels.find((p) => p.rowIndex === row && p.columnIndex === 0)?.corners.vertices[0]
      const first = rowOf(0)
      const second = rowOf(1)
      expect(first).toBeDefined()
      expect(second).toBeDefined()
      expect((second?.xM ?? 0) - (first?.xM ?? 0)).toBeCloseTo(0, 12)
      expect(Math.abs((second?.yM ?? 0) - (first?.yM ?? 0))).toBeCloseTo(5, 12)
    })

    it('gives a tilted panel its whole collector width across the rows', () => {
      // 2 m of collector at 30 degrees covers 2 cos 30 = 1.732 m of ground across the pitch,
      // and that span is the only thing standing between one row and the next
      for (let i = 0; i < panels.length; i += 1) {
        expect(
          spread(ys(i)),
          'a panel with no width across its own pitch shades nothing',
        ).toBeCloseTo(2 * Math.cos((30 * Math.PI) / 180), 12)
      }
    })

    it('lays the modules of a row end to end rather than on top of one another', () => {
      // 10 m of row over 2 modules is 5 m each, so a module spans 5 m along the row and
      // consecutive ones sit 5 m apart: touching end to end
      for (let i = 0; i < panels.length; i += 1) expect(spread(xs(i))).toBeCloseTo(5, 12)
      const a = panels.find((p) => p.rowIndex === 0 && p.columnIndex === 0)
      const b = panels.find((p) => p.rowIndex === 0 && p.columnIndex === 1)
      const center = (p: typeof a) =>
        (p?.corners.vertices.reduce((sum, v) => sum + v.xM, 0) ?? 0) /
        (p?.corners.vertices.length ?? 1)
      expect(Math.abs(center(b) - center(a))).toBeCloseTo(5, 12)
    })
  })
})

describe('sceneExtent', () => {
  const fixed = makeArray(
    {},
    { mode: 'fixed', tiltDeg: 0 as Degrees, surfaceAzimuthDeg: 180 as Degrees },
  )
  const m = (value: number): Meters => value as Meters
  const ring = (minX: number, minY: number, maxX: number, maxY: number) => [
    { xM: m(minX), yM: m(minY) },
    { xM: m(maxX), yM: m(minY) },
    { xM: m(maxX), yM: m(maxY) },
    { xM: m(minX), yM: m(maxY) },
  ]

  it('is the panels and beds plus the margin when no plot ring is given', () => {
    const bed = { exterior: ring(20, -1, 24, 1), holes: [] }
    const extent = sceneExtent([fixed], [bed], m(5))
    expect(extent.maxXM).toBeCloseTo(29, 9)
    expect(extent.minYM).toBeCloseTo(-11, 9)
  })

  it("reaches every edge of the plot the panels and beds don't, with no margin on it", () => {
    const bed = { exterior: ring(20, -1, 24, 1), holes: [] }
    const plot = ring(-40, -3, 22, 30)
    const extent = sceneExtent([fixed], [bed], m(5), plot)
    // the plot's own west edge and north edge, exactly
    expect(extent.minXM).toBeCloseTo(-40, 9)
    expect(extent.maxYM).toBeCloseTo(30, 9)
    // the bed plus the margin still wins east, and the panels plus the margin south
    expect(extent.maxXM).toBeCloseTo(29, 9)
    expect(extent.minYM).toBeCloseTo(-11, 9)
  })

  it('is the plot alone, with nothing built on it yet', () => {
    const extent = sceneExtent([], [], m(5), ring(-16, -12, 16, 12))
    expect(extent.minXM).toBeCloseTo(-16, 9)
    expect(extent.maxXM).toBeCloseTo(16, 9)
    expect(extent.minYM).toBeCloseTo(-12, 9)
    expect(extent.maxYM).toBeCloseTo(12, 9)
  })
})

describe('gridForExtent', () => {
  it('covers the extent exactly at the requested cell size', () => {
    const extent: Extent2D = {
      minXM: 0 as Meters,
      minYM: 0 as Meters,
      maxXM: 100 as Meters,
      maxYM: 50 as Meters,
    }
    const grid = gridForExtent(extent, 1 as Meters)
    expect(grid.cellSizeM).toBeCloseTo(1, 12)
    expect(grid.cols).toBe(100)
    expect(grid.rows).toBe(50)
    expect(grid.extent.maxXM).toBeCloseTo(100, 9)
    expect(grid.extent.maxYM).toBeCloseTo(50, 9)
  })

  it('honors the 1024 cell cap by growing the cell size', () => {
    const extent: Extent2D = {
      minXM: 0 as Meters,
      minYM: 0 as Meters,
      maxXM: 5000 as Meters,
      maxYM: 5000 as Meters,
    }
    const grid = gridForExtent(extent, 1 as Meters)
    expect(grid.cols).toBeLessThanOrEqual(1024)
    expect(grid.rows).toBeLessThanOrEqual(1024)
    expect(grid.cellSizeM).toBeGreaterThan(1)
    expect(grid.extent.maxXM).toBeGreaterThanOrEqual(5000)
    expect(grid.extent.maxYM).toBeGreaterThanOrEqual(5000)
  })
})
