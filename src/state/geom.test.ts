import { describe, expect, it } from 'bun:test'
import {
  centroidOf,
  isRectangle,
  metresBetween,
  movedCorner,
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
