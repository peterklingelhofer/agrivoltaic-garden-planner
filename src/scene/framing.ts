import type { GardenPlot } from '../types/garden'
import type { Ring2D } from '../types/geo'
import { extentOf } from '../state/geom'
import { cosDeg, sinDeg } from '../sim/math'

export type Triple = readonly [number, number, number]

export interface Framing {
  readonly position: Triple
  readonly target: Triple
}

/** The shape of the picture the camera is drawing into, which decides how far back "whole" is */
export interface View {
  readonly aspect: number
  readonly fovDeg: number
}

/** A laptop canvas beside the sidebar, and the fov `SceneCanvas` declares */
export const DEFAULT_VIEW: View = { aspect: 1060 / 856, fovDeg: 45 }

/**
 * Room around the subject, as a share of the frame: without it the near edge sits on the bottom
 * line
 */
const FIT_MARGIN = 1.06

/**
 * Where to stand to see what the overlay has to say.
 *
 * At the default camera the DLI surface is nearly uniform, because most of the ground in view is
 * open sky and the contours have nothing to draw. The field only varies across the pitch: one
 * band of shade per row, brightest a little south of the next row up. So the shot is framed
 * across the rows rather than along them, from the side the panels face, low enough that the
 * bands read as bands rather than as a plan view
 */
const ELEVATION_DEG = 27
/** Off the pitch axis, so the rows recede instead of stacking into one line */
const BEARING_OFFSET_DEG = 38
const DISTANCE_FACTOR = 1.12
const TARGET_HEIGHT_M = 1.5

export const DEFAULT_TARGET: Triple = [0, 1, 0]

/**
 * Scene coordinates from plot coordinates: the ground plane is x/z and northing is -z, which is
 * the mapping `sceneMath` reads back out of a pointer hit
 */
const toScene = (xM: number, yM: number, heightM: number): Triple => [xM, heightM, -yM]

/**
 * Which way to stand, in plot coordinates: the row-offset direction, which is the axis the field
 * varies along, turned off itself by the bearing offset. Every subject below is framed from this
 * same bearing, so moving between them swings along one side of the garden rather than crossing it
 *
 * `rowAzimuthDeg` is the direction the rows RUN, so the axis the field varies along is the one
 * across them, `(cos, -sin)` rather than `(sin, cos)`. It read the along-row direction until
 * 2026-09-01, which stood the camera off the END of the rows and looked down the gaps instead of
 * across the shade bands
 */
const standingDirection = (rowAzimuthDeg: number): readonly [number, number] => {
  const ux = cosDeg(rowAzimuthDeg)
  const uy = -sinDeg(rowAzimuthDeg)
  const turn = BEARING_OFFSET_DEG
  return [ux * cosDeg(turn) - uy * sinDeg(turn), ux * sinDeg(turn) + uy * cosDeg(turn)]
}

const poseAround = (
  centreXM: number,
  centreYM: number,
  radiusM: number,
  elevationDeg: number,
  direction: readonly [number, number],
): Framing => {
  const groundM = radiusM * cosDeg(elevationDeg)
  return {
    position: toScene(
      centreXM + direction[0] * groundM,
      centreYM + direction[1] * groundM,
      radiusM * sinDeg(elevationDeg),
    ),
    target: toScene(centreXM, centreYM, TARGET_HEIGHT_M),
  }
}

export const framingFor = (plot: GardenPlot | null): Framing | null => {
  const array = plot?.arrays[0]
  if (array === undefined) return null
  const { geometry } = array
  const acrossM = geometry.rowCount * geometry.pitchM
  const radiusM = DISTANCE_FACTOR * Math.max(acrossM, geometry.rowLengthM)
  return poseAround(
    geometry.originM.xM,
    geometry.originM.yM,
    radiusM,
    ELEVATION_DEG,
    standingDirection(geometry.rowAzimuthDeg),
  )
}

/** What a step of the guided panel is talking about, which is what the camera should be showing */
export type FramingSubject = 'plot' | 'panels' | 'beds'

/**
 * The boundary is a wider, flatter thing than one array, so it is framed from higher up: at the
 * array's own elevation the far edge sits on the horizon and the plot reads as a strip
 */
const PLOT_ELEVATION_DEG = 42
const PLOT_MIN_RADIUS_M = 14

/**
 * What the growing step is asking about is what goes IN a bed, so the shot is close and only as
 * high as it takes to see over the near edge. The floor on the radius is what stops a single small
 * bed from putting the camera inside the soil
 */
const BED_ELEVATION_DEG = 30
const BED_MIN_RADIUS_M = 8

const unit = (x: number, y: number, z: number): Triple => {
  const length = Math.hypot(x, y, z) || 1
  return [x / length, y / length, z / length]
}
const dot = (a: Triple, b: Triple): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const cross = (a: Triple, b: Triple): Triple => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
]

/**
 * How far back the camera has to stand, along the line it will look down, for every corner to
 * land inside the frame with room to spare.
 *
 * A fixed multiple of the plot's longest side used to do this, and on 2026-09-11 a gardener
 * resized the plot and watched the near edge leave the bottom of the picture: a 42 degree look
 * down at a 35 by 25 m rectangle puts the near corners much lower in the frame than the far
 * ones, and the multiple had been tuned on a squarer plot. So the corners are projected instead.
 * With the camera `d` metres from the target along the unit line `look`, a corner at `p` from
 * the target sits `p . look + d` deep and `p . right`, `p . up` across, and it fits when each
 * of those is inside the frustum's half-angle at that depth; solving for `d` per corner and
 * taking the largest is exact, and nothing about it depends on the plot being a rectangle
 */
const standOffM = (
  corners: readonly Triple[],
  target: Triple,
  look: Triple,
  view: View,
): number => {
  const right = unit(...cross(look, [0, 1, 0]))
  const up = cross(right, look)
  const halfV = Math.tan((view.fovDeg * Math.PI) / 360)
  const halfH = halfV * view.aspect
  let needed = 0
  for (const corner of corners) {
    const p: Triple = [corner[0] - target[0], corner[1] - target[1], corner[2] - target[2]]
    const depth = dot(p, look)
    needed = Math.max(
      needed,
      (Math.abs(dot(p, right)) * FIT_MARGIN) / halfH - depth,
      (Math.abs(dot(p, up)) * FIT_MARGIN) / halfV - depth,
    )
  }
  return needed
}

/**
 * The bearing to fall back on before there is an array to take one from: rows running north to
 * south, so the camera looks east across them
 */
const DEFAULT_ROW_AZIMUTH_DEG = 180

/**
 * Frames whatever the given rings span. The extent centre rather than a centroid of the rings,
 * because what wants to be in the middle of the frame is the middle of what is on screen, which a
 * centroid pulls away from as soon as the beds are unevenly sized
 */
const framingForRings = (
  plot: GardenPlot,
  rings: readonly Ring2D[],
  elevationDeg: number,
  minRadiusM: number,
  view: View,
): Framing | null => {
  if (rings.every((ring) => ring.length === 0)) return null
  const extent = extentOf(rings)
  const centreX = (extent.minXM + extent.maxXM) / 2
  const centreY = (extent.minYM + extent.maxYM) / 2
  const direction = standingDirection(
    plot.arrays[0]?.geometry.rowAzimuthDeg ?? DEFAULT_ROW_AZIMUTH_DEG,
  )
  // the line the camera looks down, from where it will stand towards the target
  const look = unit(
    -direction[0] * cosDeg(elevationDeg),
    -sinDeg(elevationDeg),
    direction[1] * cosDeg(elevationDeg),
  )
  const target = toScene(centreX, centreY, TARGET_HEIGHT_M)
  const corners = rings.flatMap((ring) => ring.map((point) => toScene(point.xM, point.yM, 0)))
  return poseAround(
    centreX,
    centreY,
    Math.max(minRadiusM, standOffM(corners, target, look, view)),
    elevationDeg,
    direction,
  )
}

/**
 * Where to stand to see the one thing the guided panel is currently asking about. Derived from
 * the geometry every time and stored nowhere, so a step that is answered while the design changes
 * under it reframes rather than flying to where the garden used to be. Null wherever the geometry
 * the subject names does not exist yet, which is the caller's cue to leave the camera alone
 */
export const framingForSubject = (
  plot: GardenPlot | null,
  subject: FramingSubject,
  view: View = DEFAULT_VIEW,
): Framing | null => {
  if (plot === null) return null
  if (subject === 'panels') return framingFor(plot)
  if (subject === 'beds')
    return framingForRings(
      plot,
      plot.beds.map((bed) => bed.footprint.exterior),
      BED_ELEVATION_DEG,
      BED_MIN_RADIUS_M,
      view,
    )
  return framingForRings(
    plot,
    [plot.boundary.exterior],
    PLOT_ELEVATION_DEG,
    PLOT_MIN_RADIUS_M,
    view,
  )
}
