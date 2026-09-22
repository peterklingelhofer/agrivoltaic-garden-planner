import { describe, expect, it } from 'bun:test'
import {
  centroidOf,
  distanceToPolygonM,
  isRectangle,
  metresBetween,
  movedCorner,
  pointInPolygon,
  polygonOf,
  polygonsOverlap,
  rectangleRing,
  resizedRectangle,
  ringAreaM2,
  untangledRing,
  vec2,
} from './geom'

describe('a rectangle resized by one corner', () => {
  it('stays a rectangle, with the opposite corner held still', () => {
    const ring = rectangleRing(vec2(0, 0), 10, 6)
    const moved = movedCorner(ring, 0, vec2(-7, -5))
    expect(isRectangle(moved)).toBe(true)
    expect(moved[0]).toEqual(vec2(-7, -5))
    expect(moved[2]).toEqual(ring[2])
    expect(ringAreaM2(moved)).toBeCloseTo(12 * 8, 9)
  })

  it('holds a turned rectangle too', () => {
    const ring = rectangleRing(vec2(3, 2), 10, 6, 30)
    const corner = ring[1]
    if (corner === undefined) throw new Error('four corners')
    const moved = movedCorner(ring, 1, vec2(corner.xM + 2, corner.yM + 1))
    expect(isRectangle(moved)).toBe(true)
    expect(moved[3]).toEqual(ring[3])
  })

  it('moves one vertex alone on a shape drawn by hand', () => {
    const drawn = [vec2(0, 0), vec2(8, 0), vec2(9, 5), vec2(2, 6), vec2(-1, 3)]
    const moved = movedCorner(drawn, 2, vec2(10, 6))
    expect(moved[2]).toEqual(vec2(10, 6))
    expect(moved.filter((_, i) => i !== 2)).toEqual(drawn.filter((_, i) => i !== 2))
    expect(isRectangle(drawn)).toBe(false)
  })
})

describe('a rectangle resized by its width and length', () => {
  it('keeps its centre and its corner order', () => {
    const ring = rectangleRing(vec2(4, -2), 8, 1.4)
    const resized = resizedRectangle(ring, 3, 2)
    expect(isRectangle(resized)).toBe(true)
    expect(centroidOf(resized)).toEqual(vec2(4, -2))
    expect(metresBetween(resized[0] ?? vec2(0, 0), resized[1] ?? vec2(0, 0))).toBeCloseTo(3, 9)
    expect(metresBetween(resized[1] ?? vec2(0, 0), resized[2] ?? vec2(0, 0))).toBeCloseTo(2, 9)
    expect(resized[0]).toEqual(vec2(2.5, -3))
  })

  it('keeps a turned rectangle turned', () => {
    const ring = rectangleRing(vec2(0, 0), 8, 2, 30)
    const resized = resizedRectangle(ring, 4, 1)
    expect(isRectangle(resized)).toBe(true)
    const [a, b] = [resized[0], resized[1]]
    if (a === undefined || b === undefined) throw new Error('four corners')
    expect(Math.atan2(b.yM - a.yM, b.xM - a.xM)).toBeCloseTo(Math.PI / 6, 9)
    expect(metresBetween(a, b)).toBeCloseTo(4, 9)
  })

  it('leaves a shape drawn by hand alone', () => {
    const drawn = [vec2(0, 0), vec2(8, 0), vec2(9, 5), vec2(2, 6), vec2(-1, 3)]
    expect(resizedRectangle(drawn, 3, 3)).toBe(drawn)
  })
})

describe('polygonsOverlap', () => {
  it('is false for two rectangles that share no ground', () => {
    const a = polygonOf(rectangleRing(vec2(0, 0), 4, 4))
    const b = polygonOf(rectangleRing(vec2(10, 10), 4, 4))
    expect(polygonsOverlap(a, b)).toBe(false)
    expect(polygonsOverlap(b, a)).toBe(false)
  })

  it('is true when one rectangle stands wholly inside the other', () => {
    const outer = polygonOf(rectangleRing(vec2(0, 0), 10, 6))
    const inner = polygonOf(rectangleRing(vec2(0, 0), 2, 2))
    expect(polygonsOverlap(outer, inner)).toBe(true)
    expect(polygonsOverlap(inner, outer)).toBe(true)
  })

  it('is true for a plus sign of two thin rectangles, with neither vertex inside the other', () => {
    const horizontal = polygonOf(rectangleRing(vec2(0, 0), 10, 2))
    const vertical = polygonOf(rectangleRing(vec2(0, 0), 2, 10))
    for (const point of horizontal.exterior) {
      expect(pointInPolygon(vertical, point.xM, point.yM)).toBe(false)
    }
    for (const point of vertical.exterior) {
      expect(pointInPolygon(horizontal, point.xM, point.yM)).toBe(false)
    }
    expect(polygonsOverlap(horizontal, vertical)).toBe(true)
  })

  /**
   * Two rectangles flush against each other share a whole edge and no ground: pinned false,
   * because neither ring's vertex sits strictly inside the other and the shared edge is
   * collinear. Not a transversal crossing. That is the rule: touching alone, at a
   * corner or along a whole edge, is never overlap on its own
   */
  it('is false for two rectangles that only touch along a shared edge', () => {
    const left = polygonOf(rectangleRing(vec2(-2, 0), 4, 4))
    const right = polygonOf(rectangleRing(vec2(2, 0), 4, 4))
    expect(polygonsOverlap(left, right)).toBe(false)
    expect(polygonsOverlap(right, left)).toBe(false)
  })
})

describe('distanceToPolygonM', () => {
  const square = polygonOf(rectangleRing(vec2(0, 0), 4, 4))

  it('is zero for a point inside the polygon', () => {
    expect(distanceToPolygonM(square, 0, 0)).toBe(0)
  })

  it('is the distance to the nearest edge for a point just outside it', () => {
    expect(distanceToPolygonM(square, 2.5, 0)).toBeCloseTo(0.5, 9)
  })

  it('is the diagonal distance for a point off a corner', () => {
    expect(distanceToPolygonM(square, 3, 3)).toBeCloseTo(Math.hypot(1, 1), 9)
  })

  it('is the distance to a hole edge for a point sitting inside the hole', () => {
    const withHole = { ...square, holes: [rectangleRing(vec2(0, 0), 2, 2)] }
    expect(distanceToPolygonM(withHole, 0, 0)).toBeCloseTo(1, 9)
  })
})

describe('untangledRing', () => {
  it('untangles a rectangle clicked top-left, top-right, bottom-left, bottom-right', () => {
    const tl = vec2(0, 4)
    const bowTie = [tl, vec2(6, 4), vec2(0, 0), vec2(6, 0)]
    const untangled = untangledRing(bowTie)
    expect(untangled[0]).toEqual(tl)
    expect(untangled.length).toBe(4)
    for (const corner of bowTie) expect(untangled).toContainEqual(corner)
    expect(ringAreaM2(untangled)).toBeCloseTo(24, 9)
  })

  it('untangles the same rectangle clicked top-left, bottom-left, top-right, bottom-right', () => {
    const bowTie = [vec2(0, 4), vec2(0, 0), vec2(6, 4), vec2(6, 0)]
    const untangled = untangledRing(bowTie)
    expect(ringAreaM2(untangled)).toBeCloseTo(24, 9)
  })

  it('leaves an L-shaped ring drawn in order alone', () => {
    const drawn = [vec2(0, 0), vec2(4, 0), vec2(4, 2), vec2(2, 2), vec2(2, 4), vec2(0, 4)]
    expect(untangledRing(drawn)).toBe(drawn)
  })

  it('leaves a triangle alone', () => {
    const triangle = [vec2(0, 0), vec2(4, 0), vec2(2, 3)]
    expect(untangledRing(triangle)).toBe(triangle)
  })

  it('leaves a ring already in rectangle order alone', () => {
    const ring = rectangleRing(vec2(0, 0), 6, 4)
    expect(untangledRing(ring)).toBe(ring)
  })
})
