import type { Extent2D, Polygon2D, Ring2D, Vec2M } from '../types/geo'
import { meters, squareMeters, type Meters, type SquareMeters } from '../types/units'

export const vec2 = (x: number, y: number): Vec2M => ({ xM: meters(x), yM: meters(y) })

export const polygonOf = (points: readonly Vec2M[]): Polygon2D => ({
  exterior: points,
  holes: [],
})

const shoelace = (ring: Ring2D): number => {
  let sum = 0
  for (let i = 0; i < ring.length; i += 1) {
    const a = ring[i]
    const b = ring[(i + 1) % ring.length]
    if (!a || !b) continue
    sum += a.xM * b.yM - b.xM * a.yM
  }
  return sum / 2
}

export const ringAreaM2 = (ring: Ring2D): number => Math.abs(shoelace(ring))

export const polygonAreaM2 = (polygon: Polygon2D): SquareMeters =>
  squareMeters(
    polygon.holes.reduce((area, hole) => area - ringAreaM2(hole), ringAreaM2(polygon.exterior)),
  )

export const centroidOf = (ring: Ring2D): Vec2M => {
  if (ring.length === 0) return vec2(0, 0)
  const sum = ring.reduce((acc, p) => ({ x: acc.x + p.xM, y: acc.y + p.yM }), { x: 0, y: 0 })
  return vec2(sum.x / ring.length, sum.y / ring.length)
}

export const extentOf = (rings: readonly Ring2D[], marginM = 0): Extent2D => {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const ring of rings) {
    for (const p of ring) {
      minX = Math.min(minX, p.xM)
      minY = Math.min(minY, p.yM)
      maxX = Math.max(maxX, p.xM)
      maxY = Math.max(maxY, p.yM)
    }
  }
  if (!Number.isFinite(minX))
    return { minXM: meters(0), minYM: meters(0), maxXM: meters(1), maxYM: meters(1) }
  return {
    minXM: meters(minX - marginM),
    minYM: meters(minY - marginM),
    maxXM: meters(maxX + marginM),
    maxYM: meters(maxY + marginM),
  }
}

export const pointInRing = (ring: Ring2D, x: number, y: number): boolean => {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const a = ring[i]
    const b = ring[j]
    if (!a || !b) continue
    const straddles = a.yM > y !== b.yM > y
    if (straddles && x < ((b.xM - a.xM) * (y - a.yM)) / (b.yM - a.yM) + a.xM) inside = !inside
  }
  return inside
}

export const pointInPolygon = (polygon: Polygon2D, x: number, y: number): boolean =>
  pointInRing(polygon.exterior, x, y) && !polygon.holes.some((hole) => pointInRing(hole, x, y))

export const rectangleRing = (
  centre: Vec2M,
  widthM: number,
  depthM: number,
  rotationDeg = 0,
): Ring2D => {
  const r = (rotationDeg * Math.PI) / 180
  const cos = Math.cos(r)
  const sin = Math.sin(r)
  const hw = widthM / 2
  const hd = depthM / 2
  return (
    [
      [-hw, -hd],
      [hw, -hd],
      [hw, hd],
      [-hw, hd],
    ] as const
  ).map(([x, y]) => vec2(centre.xM + x * cos - y * sin, centre.yM + x * sin + y * cos))
}

/** The two numbers a grower measures a rectangle with, and the ground it sits over */
export interface RectangleSize {
  readonly centre: Vec2M
  readonly widthM: number
  readonly depthM: number
}

// a garden is measured in metres, so a square millimetre of slack is far below anything a
// boundary could mean and far above the floating point error in a shoelace sum
const RECTANGLE_TOLERANCE_M2 = 1e-6

/**
 * The rectangle a ring IS, or null for every other shape, which is the question anyone
 * resizing a boundary by a width and a depth has to ask first.
 *
 * Only a four-corner axis-aligned ring comes back, which is exactly what `rectangleRing` writes
 * at rotation zero. A rotated one is refused along with a hand-drawn one, deliberately: two
 * numbers cannot say where its corners were, so a caller that rebuilt it from them would be
 * quietly throwing away a shape nobody asked it to touch
 */
export const rectangleOf = (ring: Ring2D): RectangleSize | null => {
  if (ring.length !== 4) return null
  const { minXM, minYM, maxXM, maxYM } = extentOf([ring])
  const widthM = maxXM - minXM
  const depthM = maxYM - minYM
  if (widthM <= 0 || depthM <= 0) return null
  // a quadrilateral can never be larger than the box around it, and it fills that box only when
  // it is the box, so this one comparison also refuses rotated, self-crossing and collapsed rings
  if (Math.abs(ringAreaM2(ring) - widthM * depthM) > RECTANGLE_TOLERANCE_M2) return null
  return { centre: vec2((minXM + maxXM) / 2, (minYM + maxYM) / 2), widthM, depthM }
}

/** Four corners with a right angle at each of them: an axis-aligned or a turned rectangle */
export const isRectangle = (ring: Ring2D): boolean => {
  if (ring.length !== 4) return false
  return ring.every((corner, index) => {
    const before = ring[(index + 3) % 4]
    const after = ring[(index + 1) % 4]
    if (before === undefined || after === undefined) return false
    const ax = before.xM - corner.xM
    const ay = before.yM - corner.yM
    const bx = after.xM - corner.xM
    const by = after.yM - corner.yM
    const lengths = Math.hypot(ax, ay) * Math.hypot(bx, by)
    return lengths > 1e-9 && Math.abs(ax * bx + ay * by) < 1e-6 * lengths
  })
}

/**
 * The ring with one vertex moved to `to`.
 *
 * A rectangle stays a rectangle: the corner opposite the one being dragged holds still and the two
 * beside it slide along their own edges, so a corner drag resizes the plot the way a window is
 * resized by its corner. Moving the one corner alone would turn a plot into a kite the moment
 * anybody touched a handle and put "This boundary is not a plain rectangle" on screen for a shape
 * nobody meant to draw. Any other ring, which is one drawn by hand, moves the one vertex and
 * nothing else
 */
export const movedCorner = (ring: Ring2D, index: number, to: Vec2M): Ring2D => {
  const moved = ring.map((point, i) => (i === index ? to : point))
  if (!isRectangle(ring)) return moved
  const from = ring[index]
  const next = ring[(index + 1) % 4]
  const previous = ring[(index + 3) % 4]
  const opposite = ring[(index + 2) % 4]
  if (from === undefined || next === undefined || previous === undefined || opposite === undefined)
    return moved
  // the two edge directions that meet at the dragged corner, and the diagonal it now spans
  const along = (px: number, py: number): readonly [number, number] => {
    const length = Math.hypot(px, py)
    return [px / length, py / length]
  }
  const u = along(next.xM - from.xM, next.yM - from.yM)
  const v = along(previous.xM - from.xM, previous.yM - from.yM)
  const dx = to.xM - opposite.xM
  const dy = to.yM - opposite.yM
  const onV = dx * v[0] + dy * v[1]
  const onU = dx * u[0] + dy * u[1]
  return moved.map((point, i) =>
    i === (index + 1) % 4
      ? vec2(opposite.xM + v[0] * onV, opposite.yM + v[1] * onV)
      : i === (index + 3) % 4
        ? vec2(opposite.xM + u[0] * onU, opposite.yM + u[1] * onU)
        : point,
  )
}

/**
 * A rectangle given a new width and length about its own centre.
 *
 * The width is the first edge and the length the second, measured along the ring's own edge
 * directions, so a turned rectangle keeps its turn and its corner order. Any other ring comes
 * back untouched: two numbers cannot say where a hand-drawn shape's corners were
 */
export const resizedRectangle = (ring: Ring2D, widthM: number, lengthM: number): Ring2D => {
  const [a, b, c] = ring
  if (!isRectangle(ring) || a === undefined || b === undefined || c === undefined) return ring
  const centre = centroidOf(ring)
  const unit = (from: Vec2M, to: Vec2M): readonly [number, number] => {
    const length = Math.hypot(to.xM - from.xM, to.yM - from.yM)
    return [(to.xM - from.xM) / length, (to.yM - from.yM) / length]
  }
  const u = unit(a, b)
  const v = unit(b, c)
  const hw = widthM / 2
  const hl = lengthM / 2
  return (
    [
      [-hw, -hl],
      [hw, -hl],
      [hw, hl],
      [-hw, hl],
    ] as const
  ).map(([w, l]) => vec2(centre.xM + u[0] * w + v[0] * l, centre.yM + u[1] * w + v[1] * l))
}

export const translateRing = (ring: Ring2D, dx: number, dy: number): Ring2D =>
  ring.map((p) => vec2(p.xM + dx, p.yM + dy))

export const rotateRingAbout = (ring: Ring2D, pivot: Vec2M, deltaDeg: number): Ring2D => {
  const r = (deltaDeg * Math.PI) / 180
  const cos = Math.cos(r)
  const sin = Math.sin(r)
  return ring.map((p) => {
    const x = p.xM - pivot.xM
    const y = p.yM - pivot.yM
    return vec2(pivot.xM + x * cos - y * sin, pivot.yM + x * sin + y * cos)
  })
}

// Site plane is x east / y north; the scene is y up, x east, z south
export const toSceneXZ = (p: Vec2M): readonly [number, number] => [p.xM, -p.yM]

export const fromSceneXZ = (x: number, z: number): Vec2M => vec2(x, -z)

export const extentSize = (extent: Extent2D): readonly [number, number] => [
  extent.maxXM - extent.minXM,
  extent.maxYM - extent.minYM,
]

export const metresBetween = (a: Vec2M, b: Vec2M): Meters =>
  meters(Math.hypot(b.xM - a.xM, b.yM - a.yM))

/**
 * A ring reordered into the shape its corners actually enclose, but only when the order they
 * were clicked in made two of its edges cross.
 *
 * A hand-drawn ring is kept exactly as drawn otherwise, because an L-shaped bed drawn corner by
 * corner means that order: sorting every ring by angle would turn a deliberate concave shape into
 * its convex hull. Only a ring that crosses itself gets reordered, by angle around its own centre.
 * A rectangle traced top-left, top-right, bottom-left, bottom-right comes out as a bow-tie, and the
 * reordering turns it into the rectangle its drawer meant
 */
export const untangledRing = (ring: Ring2D): Ring2D => {
  const first = ring[0]
  if (ring.length < 4 || first === undefined) return ring

  // two segments properly cross when each one's endpoints land on opposite sides of the other;
  // a collinear or endpoint-touching case zeroes one of the two products, which reads as no
  // crossing rather than a false positive
  const orient = (a: Vec2M, b: Vec2M, c: Vec2M): number =>
    (b.xM - a.xM) * (c.yM - a.yM) - (b.yM - a.yM) * (c.xM - a.xM)
  const properlyCross = (a1: Vec2M, a2: Vec2M, b1: Vec2M, b2: Vec2M): boolean =>
    orient(a1, a2, b1) * orient(a1, a2, b2) < 0 && orient(b1, b2, a1) * orient(b1, b2, a2) < 0

  let crosses = false
  for (let i = 0; i < ring.length && !crosses; i += 1) {
    const a1 = ring[i]
    const a2 = ring[(i + 1) % ring.length]
    if (!a1 || !a2) continue
    for (let j = i + 1; j < ring.length; j += 1) {
      // edges that share a vertex always touch there, including the closing edge beside the
      // first one, so only a non-adjacent pair can be the kind of crossing a bow-tie makes
      if (j === i + 1 || (i === 0 && j === ring.length - 1)) continue
      const b1 = ring[j]
      const b2 = ring[(j + 1) % ring.length]
      if (b1 && b2 && properlyCross(a1, a2, b1, b2)) crosses = true
    }
  }
  if (!crosses) return ring

  const centre = centroidOf(ring)
  const sorted = [...ring].sort((p, q) => {
    const angleP = Math.atan2(p.yM - centre.yM, p.xM - centre.xM)
    const angleQ = Math.atan2(q.yM - centre.yM, q.xM - centre.xM)
    return angleP !== angleQ ? angleP - angleQ : metresBetween(centre, p) - metresBetween(centre, q)
  })
  const start = sorted.indexOf(first)
  return [...sorted.slice(start), ...sorted.slice(0, start)]
}
