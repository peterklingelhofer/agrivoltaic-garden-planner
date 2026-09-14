import { describe, expect, it } from 'bun:test'
import type { GridSpec, Vec2M } from '../types/geo'
import type { Obstruction, Tree } from '../types/garden'
import { obstructionId } from '../types/ids'
import type { Occluder } from '../types/pv'
import type { Degrees, Fraction, Meters } from '../types/units'
import type { CumulativeSky } from '../types/weather'
import type { AccumulationRequest } from './backend'
import { createCpuReferenceBackend } from './cpu'
import { at } from './math'
import { houseQuads, treeQuads } from './obstruction'
import { beamVisibilityRaster } from './shading'
import { sunUnitVector } from './solar'

const cellAt = (grid: GridSpec, xM: number, yM: number): number => {
  const col = Math.floor((xM - grid.extent.minXM) / grid.cellSizeM)
  const row = Math.floor((yM - grid.extent.minYM) / grid.cellSizeM)
  return row * grid.cols + col
}

describe('houseQuads', () => {
  const house: Obstruction = {
    id: obstructionId('house-1'),
    kind: 'house',
    label: 'Test house',
    footprint: {
      exterior: [
        { xM: 0 as Meters, yM: 0 as Meters },
        { xM: 10 as Meters, yM: 0 as Meters },
        { xM: 10 as Meters, yM: 8 as Meters },
        { xM: 0 as Meters, yM: 8 as Meters },
      ],
      holes: [],
    },
    heightM: 6 as Meters,
  }
  const ring = house.footprint.exterior
  const quads = houseQuads(house)

  it('is five quads: the top and four walls', () => {
    expect(quads).toHaveLength(5)
  })

  it("sits the top's four corners at heightM", () => {
    const top = quads[0]
    expect(top?.corners.vertices).toHaveLength(4)
    for (const v of top?.corners.vertices ?? []) expect(v.zM).toBe(6)
  })

  it('gives each wall two ground corners and two eave corners, the ground pair consecutive ring points in order', () => {
    const walls = quads.slice(1)
    expect(walls).toHaveLength(4)
    walls.forEach((wall, i) => {
      const [a, b, c, d] = wall.corners.vertices
      const p0 = ring[i] as Vec2M
      const p1 = ring[(i + 1) % ring.length] as Vec2M
      expect(a?.zM).toBe(0)
      expect(b?.zM).toBe(0)
      expect(c?.zM).toBe(6)
      expect(d?.zM).toBe(6)
      // p_i then p_{i+1} at ground, p_{i+1} then p_i again at the eave: a cyclic walk
      // around the wall's rectangle, never a bow-tie
      expect([a?.xM, a?.yM]).toEqual([p0.xM, p0.yM])
      expect([b?.xM, b?.yM]).toEqual([p1.xM, p1.yM])
      expect([c?.xM, c?.yM]).toEqual([p1.xM, p1.yM])
      expect([d?.xM, d?.yM]).toEqual([p0.xM, p0.yM])
    })
  })
})

describe('houseQuads beam shadow', () => {
  it('shadows the ground on the side away from the sun, out to the height/tan(elevation) throw', () => {
    const house: Obstruction = {
      id: obstructionId('house-2'),
      kind: 'house',
      label: 'Shadow house',
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
    const grid: GridSpec = {
      extent: {
        minXM: -12 as Meters,
        minYM: -12 as Meters,
        maxXM: 12 as Meters,
        maxYM: 12 as Meters,
      },
      cellSizeM: 0.5 as Meters,
      cols: 48,
      rows: 48,
    }
    const sun = sunUnitVector(45 as Degrees, 180 as Degrees)
    // due south by this codebase's convention: the vector toward the sun points south
    // (negative y, +y being north) and up, rather than assuming which sign means which
    expect(sun.y).toBeLessThan(0)

    const visibility = beamVisibilityRaster(grid, houseQuads(house), sun, 0 as Fraction, 1)

    // under the footprint: walled in on every side but the ground, so no ray up escapes it
    expect(at(visibility, cellAt(grid, 0, -4))).toBe(0)
    // beyond the near wall, inside the 6 m throw (height/tan 45) and |x| < 5
    expect(at(visibility, cellAt(grid, 0, 3))).toBe(0)
    expect(at(visibility, cellAt(grid, 4, 5))).toBe(0)
    // beyond the throw, the shadow has ended
    expect(at(visibility, cellAt(grid, 0, 7))).toBe(1)
    // south of the house, the side the sun is on
    expect(at(visibility, cellAt(grid, 0, -10))).toBe(1)
  })
})

describe('houseQuads sky view factor', () => {
  it('reads lower one metre from a wall than clear of the house, and clear of the house matches having none', async () => {
    const house: Obstruction = {
      id: obstructionId('house-3'),
      kind: 'house',
      label: 'SVF house',
      footprint: {
        exterior: [
          { xM: -3 as Meters, yM: -3 as Meters },
          { xM: 3 as Meters, yM: -3 as Meters },
          { xM: 3 as Meters, yM: 3 as Meters },
          { xM: -3 as Meters, yM: 3 as Meters },
        ],
        holes: [],
      },
      heightM: 4 as Meters,
    }
    const grid: GridSpec = {
      extent: {
        minXM: -15 as Meters,
        minYM: -15 as Meters,
        maxXM: 15 as Meters,
        maxYM: 15 as Meters,
      },
      cellSizeM: 1 as Meters,
      cols: 30,
      rows: 30,
    }
    // several patches at different altitudes and azimuths plus one sun direction, the shape
    // src/sim/gpu/webgl2.test.ts fabricates for the same kind of closure test; altitudes stay
    // at 25 degrees or above so a 4 m wall cannot throw a shadow as far as the "far" cell below
    const sky = {
      subdivision: 'tregenza-mf1' as const,
      patches: (
        [
          [25, 0],
          [45, 90],
          [65, 180],
          [85, 270],
        ] as const
      ).map(([altitude, azimuth], index) => ({
        index,
        altitudeDeg: altitude as Degrees,
        azimuthDeg: azimuth as Degrees,
        solidAngleSr: 0.4,
        cumulativeRadianceWhPerM2: 50,
      })),
      sunDirections: [{ ...sunUnitVector(50 as Degrees, 180 as Degrees), beamWeightWhPerM2: 500 }],
      substepsPerHour: 1,
      binningDeg: 2 as Degrees,
    }

    const requestFor = (panels: AccumulationRequest['panels']): AccumulationRequest => ({
      grid,
      panels,
      sky,
      monthlySkies: [],
      windowSkies: [],
      leafOnMonths: null,
      beamPanels: null,
      passesPerFrame: 999,
      frameBudgetMs: 8,
    })

    const withHouse = await createCpuReferenceBackend().accumulate(
      requestFor(houseQuads(house)),
      () => {},
    )
    const withoutHouse = await createCpuReferenceBackend().accumulate(requestFor([]), () => {})

    // one metre north of the house's north wall, at y = 3
    const nearWall = cellAt(grid, 0, 4)
    // the far corner: well outside the reach of a 4 m wall against altitude-25-or-steeper patches
    const farFromHouse = cellAt(grid, 14, 14)

    expect(at(withHouse.skyViewFactor, nearWall)).toBeLessThan(
      at(withHouse.skyViewFactor, farFromHouse),
    )
    expect(at(withHouse.skyViewFactor, farFromHouse)).toBeCloseTo(
      at(withoutHouse.skyViewFactor, farFromHouse),
      6,
    )
  })
})

describe('treeQuads', () => {
  const tree: Tree = {
    id: obstructionId('tree-1'),
    kind: 'tree',
    label: 'Test tree',
    footprint: {
      exterior: [
        { xM: 0 as Meters, yM: 0 as Meters },
        { xM: 4 as Meters, yM: 0 as Meters },
        { xM: 4 as Meters, yM: 4 as Meters },
        { xM: 0 as Meters, yM: 4 as Meters },
      ],
      holes: [],
    },
    crownBaseM: 2 as Meters,
    heightM: 5 as Meters,
    evergreen: false,
    transmittance: 0.3 as Fraction,
    leaflessTransmittance: 0.7 as Fraction,
  }
  const quads = treeQuads(tree)

  it('is six faces between crownBaseM and heightM, with the pair on every face', () => {
    expect(quads).toHaveLength(6)
    for (const quad of quads) {
      expect(quad.transmittance).toBe(0.3)
      expect(quad.leaflessTransmittance).toBe(0.7)
      for (const v of quad.corners.vertices) expect(v.zM === 2 || v.zM === 5).toBe(true)
    }
  })

  it('gives an evergreen tree the same figure leafless as in leaf', () => {
    const evergreen: Tree = { ...tree, evergreen: true }
    for (const quad of treeQuads(evergreen)) expect(quad.leaflessTransmittance).toBe(0.3)
  })
})

describe('treeQuads shadow, min rule', () => {
  it('reads 0 beneath both a crown and a panel, and the crown figure where only the crown shades', () => {
    const panel: Occluder = {
      corners: {
        vertices: [
          { xM: 0 as Meters, yM: 0 as Meters, zM: 0.1 as Meters },
          { xM: 2 as Meters, yM: 0 as Meters, zM: 0.1 as Meters },
          { xM: 2 as Meters, yM: 2 as Meters, zM: 0.1 as Meters },
          { xM: 0 as Meters, yM: 2 as Meters, zM: 0.1 as Meters },
        ],
      },
    }
    const tree: Tree = {
      id: obstructionId('tree-2'),
      kind: 'tree',
      label: 'Overhead crown',
      footprint: {
        exterior: [
          { xM: -2 as Meters, yM: -2 as Meters },
          { xM: 4 as Meters, yM: -2 as Meters },
          { xM: 4 as Meters, yM: 4 as Meters },
          { xM: -2 as Meters, yM: 4 as Meters },
        ],
        holes: [],
      },
      crownBaseM: 3 as Meters,
      heightM: 5 as Meters,
      evergreen: true,
      transmittance: 0.3 as Fraction,
      leaflessTransmittance: 0.3 as Fraction,
    }
    const grid: GridSpec = {
      extent: { minXM: -3 as Meters, minYM: -3 as Meters, maxXM: 5 as Meters, maxYM: 5 as Meters },
      cellSizeM: 0.5 as Meters,
      cols: 16,
      rows: 16,
    }
    // straight overhead, so each face's shadow lands on its own footprint and "beneath" needs no
    // slant arithmetic to reason about
    const sun = sunUnitVector(90 as Degrees, 0 as Degrees)
    const visibility = beamVisibilityRaster(
      grid,
      [panel, ...treeQuads(tree)],
      sun,
      0 as Fraction,
      1,
    )

    // beneath both: the panel's opacity wins the min against the crown's 0.3
    expect(at(visibility, cellAt(grid, 1, 1))).toBe(0)
    // beneath the crown alone, clear of the panel's [0,2]x[0,2] footprint
    expect(at(visibility, cellAt(grid, 3, 3))).toBeCloseTo(0.3, 5)
  })

  it('counts a ray through two faces of one crown once, not twice', () => {
    const tree: Tree = {
      id: obstructionId('tree-3'),
      kind: 'tree',
      label: 'Overlap crown',
      footprint: {
        exterior: [
          { xM: -2 as Meters, yM: -2 as Meters },
          { xM: 2 as Meters, yM: -2 as Meters },
          { xM: 2 as Meters, yM: 2 as Meters },
          { xM: -2 as Meters, yM: 2 as Meters },
        ],
        holes: [],
      },
      crownBaseM: 2 as Meters,
      heightM: 6 as Meters,
      evergreen: true,
      transmittance: 0.3 as Fraction,
      leaflessTransmittance: 0.3 as Fraction,
    }
    const grid: GridSpec = {
      extent: { minXM: -6 as Meters, minYM: -6 as Meters, maxXM: 6 as Meters, maxYM: 6 as Meters },
      cellSizeM: 0.5 as Meters,
      cols: 24,
      rows: 24,
    }
    // at 45 degrees due south the bottom face's shadow and the south wall's shadow coincide
    // exactly (each face's shift equals its own height), so (0, 2) sits under both at once
    const sun = sunUnitVector(45 as Degrees, 180 as Degrees)
    const visibility = beamVisibilityRaster(grid, treeQuads(tree), sun, 0 as Fraction, 1)
    expect(at(visibility, cellAt(grid, 0, 2))).toBeCloseTo(0.3, 5)
  })
})

describe('treeQuads, seasonal accumulation', () => {
  it('reads a leaf-on month at the in-leaf figure and a leafless month at the leafless one, and sums both into the annual beam', async () => {
    const tree: Tree = {
      id: obstructionId('tree-4'),
      kind: 'tree',
      label: 'Seasonal crown',
      footprint: {
        exterior: [
          { xM: -3 as Meters, yM: -3 as Meters },
          { xM: 3 as Meters, yM: -3 as Meters },
          { xM: 3 as Meters, yM: 3 as Meters },
          { xM: -3 as Meters, yM: 3 as Meters },
        ],
        holes: [],
      },
      crownBaseM: 1 as Meters,
      heightM: 4 as Meters,
      evergreen: false,
      transmittance: 0.25 as Fraction,
      leaflessTransmittance: 0.75 as Fraction,
    }
    const grid: GridSpec = {
      extent: { minXM: -2 as Meters, minYM: -2 as Meters, maxXM: 2 as Meters, maxYM: 2 as Meters },
      cellSizeM: 1 as Meters,
      cols: 4,
      rows: 4,
    }
    // nearly straight overhead, so the whole grid (inside the crown's larger footprint) is
    // blocked in this one direction
    const sun = sunUnitVector(89 as Degrees, 0 as Degrees)
    // isolates one direction: only July (index 6) and January (index 0) carry weight, the rest
    // of the year contributes nothing, in the style of webgl2.test.ts's buildSky
    const skyFor = (weight: number): CumulativeSky => ({
      subdivision: 'tregenza-mf1',
      patches: [],
      sunDirections: [{ x: sun.x, y: sun.y, z: sun.z, beamWeightWhPerM2: weight }],
      substepsPerHour: 1,
      binningDeg: 2 as Degrees,
    })
    const monthlySkies = Array.from({ length: 12 }, (_unused, month) =>
      skyFor(month === 6 || month === 0 ? 100 : 0),
    )
    const leafOnMonths = Array.from({ length: 12 }, (_unused, month) => month === 6)

    const request: AccumulationRequest = {
      grid,
      panels: treeQuads(tree),
      sky: skyFor(200),
      monthlySkies,
      windowSkies: [],
      leafOnMonths,
      beamPanels: null,
      passesPerFrame: 999,
      frameBudgetMs: 8,
    }
    const result = await createCpuReferenceBackend().accumulate(request, () => {})
    const cell = cellAt(grid, 0, 0)

    // the bin weight is scaled by dir.z the way every beam pass is (cpu.ts), so the open figure
    // this direction actually delivers is 100 * sun.z, not the bare weight of 100
    const openFigure = 100 * sun.z
    const july = result.monthlyBeamWhPerM2[6] ?? new Float32Array()
    const january = result.monthlyBeamWhPerM2[0] ?? new Float32Array()
    expect(at(july, cell)).toBeCloseTo(0.25 * openFigure, 5)
    expect(at(january, cell)).toBeCloseTo(0.75 * openFigure, 5)

    let summedMonths = 0
    for (const month of result.monthlyBeamWhPerM2) summedMonths += at(month, cell)
    expect(at(result.beamWhPerM2, cell)).toBeCloseTo(summedMonths, 5)
  })
})
