import type { ThreeEvent } from '@react-three/fiber'
import { Color, Quaternion, Shape, Vector3, type Ray } from 'three'
import { pointInPolygon, polygonOf, rectangleRing } from '../state/geom'
import { seasonalScale } from '../state/season'
import type { Cutter } from './csg'
import type { Crop } from '../types/crop'
import type { Bed, GardenPlot, Planting } from '../types/garden'
import type { Polygon2D, Ring2D } from '../types/geo'
import type { PvArray } from '../types/pv'
import type { PlantingOutcome } from '../types/simulation'

export const GROUND_SIZE_M = 240

/** No array yet means no tall occluder yet; a garden structure is about this high */
export const DEFAULT_OCCLUDER_HEIGHT_M = 2.5

/**
 * The top of the tallest thing standing between the ground and the sky. It sets the penumbra
 * the sun can cast and the distance the occlusion integral has to reach, which are the same
 * geometry read twice
 */
export const occluderHeightM = (plot: GardenPlot | null): number =>
  Math.max(
    DEFAULT_OCCLUDER_HEIGHT_M,
    ...(plot?.arrays.map((array) => array.derived.maxHeightM) ?? []),
    ...(plot?.obstructions.map((obstruction) => obstruction.heightM) ?? []),
  )

export const groundPoint = (event: ThreeEvent<PointerEvent>): readonly [number, number] => [
  event.point.x,
  event.point.z,
]

export const rayGroundHit = (ray: Ray): readonly [number, number] | null => {
  if (Math.abs(ray.direction.y) < 1e-6) return null
  const t = -ray.origin.y / ray.direction.y
  if (t < 0) return null
  return [ray.origin.x + ray.direction.x * t, ray.origin.z + ray.direction.z * t]
}

const AXIS_Y = new Vector3(0, 1, 0)
const AXIS_X = new Vector3(1, 0, 0)

export const moduleQuaternion = (
  tiltDeg: number,
  surfaceAzimuthDeg: number,
): readonly [number, number, number, number] => {
  const yaw = new Quaternion().setFromAxisAngle(
    AXIS_Y,
    Math.PI - (surfaceAzimuthDeg * Math.PI) / 180,
  )
  const pitch = new Quaternion().setFromAxisAngle(AXIS_X, (tiltDeg * Math.PI) / 180 - Math.PI / 2)
  const q = yaw.multiply(pitch)
  return [q.x, q.y, q.z, q.w]
}

const traceRing = (path: Shape, ring: Ring2D): Shape => {
  for (const [index, point] of ring.entries()) {
    if (index === 0) path.moveTo(point.xM, point.yM)
    else path.lineTo(point.xM, point.yM)
  }
  path.closePath()
  return path
}

/**
 * A bed's outline as an extrudable shape, one definition for every surface that draws a bed
 */
export const bedShape = (footprint: Polygon2D): Shape => {
  const shape = traceRing(new Shape(), footprint.exterior)
  for (const hole of footprint.holes) shape.holes.push(traceRing(new Shape(), hole))
  return shape
}

export const bedCutters = (
  bed: Bed,
  posts: readonly (readonly [number, number, number])[],
): readonly Cutter[] =>
  posts
    .filter(([x, , z]) => pointInPolygon(bed.footprint, x, -z))
    .map<Cutter>(([x, , z]) => ({
      x,
      y: -z,
      z: bed.raisedHeightM / 2,
      radiusM: 0.09,
      heightM: bed.raisedHeightM * 4,
    }))

export interface PlantItem {
  readonly x: number
  readonly z: number
  readonly widthM: number
  readonly heightM: number
  readonly colour: number
}

const hash = (value: string): number => {
  let h = 2166136261
  for (let i = 0; i < value.length; i += 1) h = Math.imul(h ^ value.charCodeAt(i), 16777619)
  return h >>> 0
}

const prng = (seed: number): (() => number) => {
  let state = seed || 1
  return () => {
    state = (state + 0x6d2b79f5) | 0
    let t = Math.imul(state ^ (state >>> 15), 1 | state)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const maturity = (crop: Crop | undefined, atYear: number): number => {
  const years = crop?.footprint.yearsToMature ?? null
  if (!years || years <= 0) return 1
  return Math.max(0.25, Math.min(1, atYear / years))
}

/**
 * A hue hashed from the crop id, so two crops sharing a bed are told apart without the catalogue
 * carrying an appearance field. This is the app's rule for what a crop looks like: anything else
 * drawing this catalogue's plants should call it
 */
export const foliageColour = (cropId: string): number =>
  new Color().setHSL(0.18 + ((hash(cropId) % 90) / 360) * 1, 0.55, 0.44).getHex()

/**
 * How far one plant's leaves may sit either side of its crop's own green.
 *
 * A planting is one colour on every plant of it, which at fifty chickpeas in a bed renders as one
 * flat slab of green. Real foliage varies plant to plant, and a little of that is the difference
 * between a bed reading as vegetation and reading as a painted rectangle
 */
export const FOLIAGE_JITTER = 0.05

/** One plant's own green, drawn from the crop's colour by its own place in the bed */
export const jitteredFoliage = (colour: number, unit: number): number => {
  const hsl = { h: 0, s: 0, l: 0 }
  new Color(colour).getHSL(hsl)
  const spread = (unit * 2 - 1) * FOLIAGE_JITTER
  return new Color()
    .setHSL(hsl.h + spread * 0.4, hsl.s, Math.min(0.62, Math.max(0.24, hsl.l + spread)))
    .getHex()
}

/**
 * Headroom under the laminate. A rendering choice in size and a fact in direction, the same split
 * `driedBy` and `outcomeLook` are written on: nothing grows THROUGH a module, so a plant standing
 * under an array is pruned or simply stops at the underside, and how much clear air is left
 * between the top leaf and the glass is ours to pick
 */
export const PANEL_HEADROOM_M = 0.15

interface PanelCeiling {
  readonly footprint: Polygon2D
  /** The tallest a plant standing on this bed's soil may be drawn under this array */
  readonly heightM: number
}

/**
 * The ground each array stands over, and how much room is under it.
 *
 * The ceiling is `clearanceHeightM`, the module's underside at its LOW edge. `assignCanopyTier`
 * draws its overstory line at `clearanceHeightM` too, so a plant it has already refused as
 * overstory is a plant the picture draws stopped. A tilted row does hold more room than this
 * uphill, and claiming it would need the tracker's live pose, which would make a plant's drawn
 * height a function of the time of day.
 *
 * The footprint is taken at the widest a row can ever be in plan, `collectorWidthM` flat rather
 * than projected by the tilt, for that same reason. Along the row it is the span `arrayLayout`
 * lays its modules over, so this covers what is actually drawn. A raised bed spends the clearance
 * before the plant does, which is why the bed's own height comes off here
 */
const panelCeilings = (arrays: readonly PvArray[], bedHeightM: number): readonly PanelCeiling[] =>
  arrays.map((array) => {
    const g = array.geometry
    return {
      footprint: polygonOf(
        rectangleRing(
          g.originM,
          (g.rowCount - 1) * g.pitchM + g.collectorWidthM,
          Math.min(g.rowLengthM, g.modulesPerRow * array.module.widthM),
          // `rectangleRing` turns its local x onto (cos, sin) and the across-row direction is
          // (cos, -sin) of the row azimuth, which is the same turn taken the other way
          -g.rowAzimuthDeg,
        ),
      ),
      heightM: Math.max(0, g.clearanceHeightM - PANEL_HEADROOM_M - bedHeightM),
    }
  })

/** What is left of a plant's height wherever an array stands over it */
const cappedM = (
  heightM: number,
  ceilings: readonly PanelCeiling[],
  x: number,
  y: number,
): number =>
  ceilings.reduce(
    (capped, ceiling) =>
      pointInPolygon(ceiling.footprint, x, y) ? Math.min(capped, ceiling.heightM) : capped,
    heightM,
  )

export const layoutPlanting = (
  bed: Bed,
  planting: Planting,
  crop: Crop | undefined,
  atYear: number,
  dayOfYear: number,
  arrays: readonly PvArray[],
): readonly PlantItem[] => {
  const ring = bed.footprint.exterior
  if (ring.length < 3) return []
  const season = seasonalScale(planting, crop, dayOfYear)
  if (season <= 0) return []
  const xs = ring.map((p) => p.xM)
  const ys = ring.map((p) => p.yM)
  const minX = Math.min(...xs)
  const maxX = Math.max(...xs)
  const minY = Math.min(...ys)
  const maxY = Math.max(...ys)
  const random = prng(hash(planting.id))
  const grow = maturity(crop, atYear) * season
  const widthM = (crop?.footprint.widthM.typicalM ?? 0.35) * grow
  const heightM = (crop?.footprint.heightM.typicalM ?? 0.4) * grow
  const colour = foliageColour(planting.cropId)
  const ceilings = panelCeilings(arrays, bed.raisedHeightM)
  const items: PlantItem[] = []
  const wanted = Math.max(1, Math.min(planting.plantCount, 4000))
  for (let tries = 0; tries < wanted * 12 && items.length < wanted; tries += 1) {
    const x = minX + random() * (maxX - minX)
    const y = minY + random() * (maxY - minY)
    if (!pointInPolygon(bed.footprint, x, y)) continue
    items.push({
      x,
      z: -y,
      widthM,
      heightM: cappedM(heightM, ceilings, x, y),
      // this plant's own green, from the same stream that placed it, so a bed of one crop is
      // fifty plants, each with its own colour, and the scatter is still deterministic
      colour: jitteredFoliage(colour, random()),
    })
  }
  return items
}

/** How a season's outcome shows on a planting: how big it stands, and the cast of its leaves */
export interface OutcomeLook {
  readonly scale: number
  /** Height on its own, where a look flattens without shrinking; the width keeps `scale` */
  readonly heightScale: number
  /** A reflectance to lean the foliage toward, or null to leave the crop's own colour alone */
  readonly tint: number | null
  readonly tintStrength: number
}

/** What a bed under heavy pest pressure goes: sallow */
const EATEN = 0xa8a04e
/** What a bed that got no light to speak of goes */
const STARVED = 0x8f9463
/** Frost-killed foliage: bleached, and lying down */
const FROSTED = 0xd9dce0

export const UNTOUCHED_LOOK: OutcomeLook = { scale: 1, heightScale: 1, tint: null, tintStrength: 0 }

export interface RainExtent {
  readonly minXM: number
  readonly minYM: number
  readonly maxXM: number
  readonly maxYM: number
}

/**
 * Where the drops start: scattered over the plot's extent and up to the ceiling, as one flat
 * xyz array for a point cloud. Seeded from the count, so the same rain is the same rain. The
 * plot's y runs north and the scene's z runs south, the same flip `layoutPlanting` makes
 */
export const rainDrops = (count: number, extent: RainExtent, ceilingM: number): Float32Array => {
  const random = prng(count + 7)
  const out = new Float32Array(count * 3)
  for (let index = 0; index < count; index += 1) {
    out[index * 3] = extent.minXM + random() * (extent.maxXM - extent.minXM)
    out[index * 3 + 1] = random() * ceilingM
    out[index * 3 + 2] = -(extent.minYM + random() * (extent.maxYM - extent.minYM))
  }
  return out
}

/** Nothing is drawn: bare soil, which is what a bed the ground refused looks like */
const BARE_LOOK: OutcomeLook = { scale: 0, heightScale: 0, tint: null, tintStrength: 0 }

/**
 * The worst thirst any planting in a bed suffered in the last season, for the soil to show. Zero
 * with no report, or a bed that was not in it
 */
export const bedThirst = (
  report: { readonly outcomes: readonly PlantingOutcome[] } | undefined,
  bedId: string,
): number =>
  report === undefined
    ? 0
    : report.outcomes
        .filter((outcome) => (outcome.bedId as string) === bedId)
        .reduce((worst, outcome) => Math.max(worst, outcome.droughtPenalty), 0)

/**
 * How old the garden is drawn: the bed panel's "show the garden at year N" or the seasons the
 * simulation has run, whichever is greater, never above the ceiling the slider has.
 *
 * Derived here, because a season that WROTE `plantYear` made
 * the shipped example younger on its first press: the example is drawn at year 3, the first
 * season wrote 1, and the biggest shrub in the garden vanished as if the season had killed it.
 * The greater of the two is the honest age, and a reset needs no second write to undo it
 */
export const gardenAge = (plantYear: number, seasonsRun: number, ceiling: number): number =>
  Math.min(ceiling, Math.max(plantYear, seasonsRun))

/**
 * The season's outcome, drawn.
 *
 * Reflectances, all of them, so they multiply into the leaf texture and stay inside the exposure
 * the rest of the scene is graded at; nothing here is emissive and nothing is an annotation. The
 * pest tint is capped well short of the whole way, because at full pressure a bed should read as
 * unwell and a garden of them should not read as a renderer that has lost its greens
 */
export const outcomeLook = (outcome: PlantingOutcome | undefined): OutcomeLook => {
  if (outcome === undefined) return UNTOUCHED_LOOK
  switch (outcome.kind) {
    case 'harvested':
      return {
        scale: 1,
        heightScale: 1,
        tint: EATEN,
        tintStrength: Math.min(0.55, outcome.pestPressure),
      }
    case 'frosted':
      // wide and flat: what a frosted bed looks like the morning after, not a smaller plant
      return { scale: 0.8, heightScale: 0.18, tint: FROSTED, tintStrength: 0.9 }
    case 'unripe':
      return { scale: 0.6, heightScale: 0.6, tint: EATEN, tintStrength: 0.3 }
    case 'too-dark':
      return { scale: 0.5, heightScale: 0.5, tint: STARVED, tintStrength: 0.85 }
    case 'refused':
    case 'climate':
    case 'soil':
      // it never went in the ground, so the ground is what there is to see. A plant drawn at a
      // third of its size in a dead brown still reads as a plant from the default camera
      return BARE_LOOK
    default:
      return UNTOUCHED_LOOK
  }
}

/** A plant item under a look: smaller where the season stunted it, tinted where it suffered */
export const applyLook = (item: PlantItem, look: OutcomeLook): PlantItem =>
  look === UNTOUCHED_LOOK
    ? item
    : {
        ...item,
        widthM: item.widthM * look.scale,
        heightM: item.heightM * look.heightScale,
        colour:
          look.tint === null
            ? item.colour
            : new Color(item.colour).lerp(new Color(look.tint), look.tintStrength).getHex(),
      }
