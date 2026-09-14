import { describe, expect, it } from 'bun:test'
import { polygonOf, rectangleRing, vec2 } from '../state/geom'
import { makeArray, makePlot } from '../state/defaults'
import type { House, Obstruction } from '../types/garden'
import { obstructionId } from '../types/ids'
import { degrees, fraction, meters } from '../types/units'
import { houseFootprints, housesOf, overlapNotices, overlapsAHouse, rowsFootprint } from './overlap'

const houseAt = (index: number, xM: number, yM: number, widthM: number, depthM: number): House => ({
  id: obstructionId(`house-${index}`),
  kind: 'house',
  label: `House ${index}`,
  footprint: polygonOf(rectangleRing(vec2(xM, yM), widthM, depthM)),
  heightM: meters(6),
})

const treeAt = (
  index: number,
  xM: number,
  yM: number,
  widthM: number,
  depthM: number,
): Obstruction => ({
  id: obstructionId(`tree-${index}`),
  kind: 'tree',
  label: `Tree ${index}`,
  footprint: polygonOf(rectangleRing(vec2(xM, yM), widthM, depthM)),
  crownBaseM: meters(2),
  heightM: meters(6),
  evergreen: false,
  transmittance: fraction(0.5),
  leaflessTransmittance: fraction(0.9),
})

describe('housesOf / houseFootprints', () => {
  it('keeps only the houses among a set of obstructions, trees included but never policed', () => {
    const house = houseAt(1, 0, 0, 4, 4)
    const tree = treeAt(1, 20, 20, 3, 3)
    expect(housesOf([house, tree])).toEqual([house])
    const plot = { ...makePlot(), obstructions: [tree, house] }
    expect(houseFootprints(plot)).toEqual([house])
  })
})

describe('overlapsAHouse', () => {
  it('names the house a footprint overlaps, and is clear of one it does not reach', () => {
    const near = houseAt(1, 0, 0, 4, 4)
    const far = houseAt(2, 50, 50, 4, 4)
    const footprint = polygonOf(rectangleRing(vec2(0, 0), 2, 2))
    expect(overlapsAHouse(footprint, [far])).toBeNull()
    expect(overlapsAHouse(footprint, [far, near])).toEqual(near)
  })
})

describe('rowsFootprint', () => {
  it('spans across the rows by the pitch and collector width, and along them by the row length', () => {
    const footprint = rowsFootprint({
      collectorWidthM: meters(2),
      pitchM: meters(4),
      rowLengthM: meters(6),
      rowCount: 3,
      modulesPerRow: 4,
      clearanceHeightM: meters(2),
      rowAzimuthDeg: degrees(90),
      originM: vec2(0, 0),
    })
    const xs = footprint.exterior.map((p) => p.xM as number)
    const ys = footprint.exterior.map((p) => p.yM as number)
    // rows running east-west (90 deg) step north-south: the along-row length (6) lands on x,
    // the across-row span ((3-1)*4 + 2 = 10) lands on y
    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(6, 6)
    expect(Math.max(...ys) - Math.min(...ys)).toBeCloseTo(10, 6)
  })
})

describe('overlapNotices', () => {
  it('reads one sentence for a bed inside a house and one for an array whose rows run through it', () => {
    const plot = makePlot()
    const bed = plot.beds[1]
    if (bed === undefined) throw new Error('the fixture plot carries no second bed')
    // House 1 contains Bed 2 outright and crosses Array 1's row rectangle like a plus sign
    const house = houseAt(1, 0, 0, 10, 3)
    const array = makeArray(1, {
      geometry: {
        collectorWidthM: meters(2),
        pitchM: meters(4),
        rowLengthM: meters(6),
        rowCount: 3,
        modulesPerRow: 4,
        clearanceHeightM: meters(2),
        rowAzimuthDeg: degrees(90),
        originM: vec2(0, 0),
      },
    })
    const withHouse = { ...plot, arrays: [array], obstructions: [house] }
    expect(overlapNotices(withHouse)).toEqual([
      'Bed 2 stands inside House 1. The light check reads no light under its roof.',
      "Array 1's rows run through House 1. The panels are drawn through its walls, and the light check includes the house's shade.",
    ])
  })

  it('says nothing when there is no house, or when nothing on the plot reaches one', () => {
    const plot = makePlot()
    expect(overlapNotices(plot)).toEqual([])
    const clearHouse = houseAt(1, 100, 100, 4, 4)
    expect(overlapNotices({ ...plot, obstructions: [clearHouse] })).toEqual([])
  })

  it('never flags a bed standing under a tree: a tree is not policed', () => {
    const plot = makePlot()
    const bed = plot.beds[0]
    if (bed === undefined) throw new Error('the fixture plot carries no bed')
    const tree = treeAt(
      1,
      bed.footprint.exterior[0]?.xM ?? 0,
      bed.footprint.exterior[0]?.yM ?? 0,
      20,
      20,
    )
    expect(overlapNotices({ ...plot, obstructions: [tree] })).toEqual([])
  })
})
