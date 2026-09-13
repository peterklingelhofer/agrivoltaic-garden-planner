import { describe, expect, it } from 'bun:test'
import { makeArray, makeBed, makePlot } from '../state/defaults'
import { withDerived } from '../state/derive'
import { polygonOf, rectangleRing, vec2 } from '../state/geom'
import type { GardenPlot } from '../types/garden'
import { degrees, meters } from '../types/units'
import { DEFAULT_VIEW, type Framing, framingFor, framingForSubject, type View } from './framing'

const plotFacing = (rowAzimuthDeg: number): GardenPlot => ({
  ...makePlot(),
  arrays: [
    withDerived({
      ...makeArray(1),
      geometry: {
        ...makeArray(1).geometry,
        rowAzimuthDeg: degrees(rowAzimuthDeg),
        rowCount: 3,
        pitchM: meters(9),
        rowLengthM: meters(16),
      },
    }),
  ],
})

describe('the example framing', () => {
  it('has nothing to frame without an array', () => {
    expect(framingFor(null)).toBeNull()
    expect(framingFor({ ...makePlot(), arrays: [] })).toBeNull()
  })

  /**
   * The whole point of the framing: the field varies across the pitch and nowhere else, so
   * standing on the equator-facing side is what puts the shade bands in front of the camera
   */
  it('stands on the side the panels face', () => {
    // rows RUNNING east-west are spaced north-south, and face south: the camera belongs south of
    // the array, which is +z in scene coordinates. `plotFacing` takes the direction the rows run,
    // so it is 90 here and 270 for the mirror; it was 180 and 0 until 2026-09-01, when
    // `standingDirection` read that field as the across-row axis rather than the along-row one
    const north = framingFor(plotFacing(90))
    expect(north?.position[2]).toBeGreaterThan(0)
    // and mirrored for an array whose rows are spaced north
    const south = framingFor(plotFacing(270))
    expect(south?.position[2]).toBeLessThan(0)
  })

  it('stands off the pitch axis, so the rows recede rather than stack', () => {
    const framing = framingFor(plotFacing(90))
    expect(Math.abs(framing?.position[0] ?? 0)).toBeGreaterThan(5)
  })

  it('backs off far enough to hold the whole array, and looks at ground level', () => {
    const framing = framingFor(plotFacing(90))
    const [x, y, z] = framing?.position ?? [0, 0, 0]
    // three rows at 9 m pitch is 27 m across, and the camera has to see all of it
    expect(Math.hypot(x, y, z)).toBeGreaterThan(27)
    expect(y).toBeGreaterThan(5)
    expect(framing?.target).toEqual([0, 1.5, -0])
  })
})

/** How far the camera stands from what it is looking at, which is what "tighter" means below */
const radiusOf = (framing: Framing | null): number => {
  const [px, py, pz] = framing?.position ?? [0, 0, 0]
  const [tx, ty, tz] = framing?.target ?? [0, 0, 0]
  return Math.hypot(px - tx, py - ty, pz - tz)
}

describe('the guided framing', () => {
  // rows running east-west, as everywhere else in this file; these assertions are about
  // distances rather than bearings, but a second convention in one file is a trap
  const plot = plotFacing(90)

  it('has nothing to frame before the geometry the subject names exists', () => {
    expect(framingForSubject(null, 'plot')).toBeNull()
    expect(framingForSubject({ ...plot, beds: [] }, 'beds')).toBeNull()
    expect(framingForSubject({ ...plot, arrays: [] }, 'panels')).toBeNull()
    expect(framingForSubject({ ...plot, boundary: polygonOf([]) }, 'plot')).toBeNull()
  })

  it('reuses the shade-band shot for the panels rather than inventing a second one', () => {
    expect(framingForSubject(plot, 'panels')).toEqual(framingFor(plot))
  })

  it('backs off far enough to hold the whole boundary', () => {
    // the default boundary is 32 m by 24 m about the origin
    const framing = framingForSubject(plot, 'plot')
    expect(framing?.target).toEqual([0, 1.5, -0])
    expect(radiusOf(framing)).toBeGreaterThan(16)
  })

  it('comes in close on the beds, and centres on them rather than on the plot', () => {
    // three 8 m by 1.4 m beds, spaced north from y = -3 to y = 3
    const beds = framingForSubject(plot, 'beds')
    expect(radiusOf(beds)).toBeLessThan(radiusOf(framingForSubject(plot, 'plot')))
    expect(radiusOf(beds)).toBeLessThan(radiusOf(framingForSubject(plot, 'panels')))

    const offset = {
      ...plot,
      beds: [makeBed(1, { footprint: polygonOf(rectangleRing(vec2(10, 4), 4, 2)) })],
    }
    expect(framingForSubject(offset, 'beds')?.target).toEqual([10, 1.5, -4])
  })

  it('stands on the same side for every subject, so moving between them is a short flight', () => {
    const bearings = (['plot', 'panels', 'beds'] as const).map((subject) => {
      const framing = framingForSubject(plot, subject)
      const [px, , pz] = framing?.position ?? [0, 0, 0]
      const [tx, , tz] = framing?.target ?? [0, 0, 0]
      return Math.atan2(px - tx, pz - tz)
    })
    for (const bearing of bearings) expect(bearing).toBeCloseTo(bearings[0] ?? 0, 6)
  })
})

describe('the whole plot fits the picture', () => {
  const plot = plotFacing(90)
  const unit = (v: readonly [number, number, number]): [number, number, number] => {
    const length = Math.hypot(...v)
    return [v[0] / length, v[1] / length, v[2] / length]
  }
  const dot = (a: readonly number[], b: readonly number[]): number =>
    a.reduce((sum, value, index) => sum + value * (b[index] ?? 0), 0)
  const cross = (a: readonly number[], b: readonly number[]): [number, number, number] => [
    (a[1] ?? 0) * (b[2] ?? 0) - (a[2] ?? 0) * (b[1] ?? 0),
    (a[2] ?? 0) * (b[0] ?? 0) - (a[0] ?? 0) * (b[2] ?? 0),
    (a[0] ?? 0) * (b[1] ?? 0) - (a[1] ?? 0) * (b[0] ?? 0),
  ]
  /** Every corner of the boundary, as a share of the half-frame it lands at: under 1 is inside */
  const cornerShares = (widthM: number, depthM: number, view: View): number[] => {
    const shaped = {
      ...plot,
      boundary: polygonOf(rectangleRing(vec2(0, 0), widthM, depthM)),
    }
    const framing = framingForSubject(shaped, 'plot', view)
    if (framing === null) throw new Error('framed')
    const look = unit([
      framing.target[0] - framing.position[0],
      framing.target[1] - framing.position[1],
      framing.target[2] - framing.position[2],
    ])
    const right = unit(cross(look, [0, 1, 0]))
    const up = cross(right, look)
    const halfV = Math.tan((view.fovDeg * Math.PI) / 360)
    return shaped.boundary.exterior.flatMap((point) => {
      const p = [
        point.xM - framing.position[0],
        0 - framing.position[1],
        -point.yM - framing.position[2],
      ]
      const depth = dot(p, look)
      return [
        Math.abs(dot(p, right)) / (depth * halfV * view.aspect),
        Math.abs(dot(p, up)) / (depth * halfV),
      ]
    })
  }

  it('keeps every corner inside the frame, near edge included, on a laptop and on a phone', () => {
    for (const [widthM, depthM] of [
      [32, 24],
      [38.4, 22.9],
      [12, 40],
    ] as const) {
      for (const view of [DEFAULT_VIEW, { aspect: 375 / 450, fovDeg: 45 }]) {
        for (const share of cornerShares(widthM, depthM, view)) {
          expect(
            share,
            `${String(widthM)}x${String(depthM)} at ${view.aspect.toFixed(2)}`,
          ).toBeLessThan(1)
        }
      }
    }
  })

  it('backs off further for a narrow picture than a wide one', () => {
    const wide = framingForSubject(plot, 'plot', DEFAULT_VIEW)
    const narrow = framingForSubject(plot, 'plot', { aspect: 375 / 450, fovDeg: 45 })
    expect(radiusOf(narrow)).toBeGreaterThan(radiusOf(wide))
  })
})
