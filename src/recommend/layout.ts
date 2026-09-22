import { clamp } from '../data/util'
import {
  bedLight as bedLightOf,
  cellIndicesInPolygon,
  DAYS_PER_MONTH,
  monthsInWindow,
} from '../sim/aggregate'
import { cosDeg, sinDeg } from '../sim/math'
import { monthValue, relativeShadeRatio } from '../sim/units'
import { polygonOf, rectangleRing, vec2 } from '../state/geom'
import type { House } from '../types/garden'
import type { Polygon2D } from '../types/geo'
import { bedId as asBedId } from '../types/ids'
import type { DliRaster, GrowingWindow } from '../types/light'
import type { BedLayout, BedPlacement, LightZoneKind, SiteExposure } from '../types/onboarding'
import type { PvArray } from '../types/pv'
import type { Fraction, MolPerM2Day } from '../types/units'
import { overlapsAHouse } from './overlap'
import type { Derivation } from './planting'
import { shadedBySurroundings } from './surroundings'

/**
 * Where the beds go.
 *
 * Laying evenly spaced rectangles down the middle of a plot is pure geometry, and under a
 * row array it is wrong: the ground light is banded, a deep-shade strip under each row and a
 * bright strip between them. A bed that straddles that boundary has no single daily light
 * integral, so every crop decision taken on it is taken against a number that is true of no
 * part of it. This module reads the baked raster and puts each bed inside one band
 */

/** Reachable from a path without standing on the soil */
export const BED_DEPTH_M = 1.2
/** A wheelbarrow and a kneeling adult; also the access every bed is guaranteed */
export const BED_GAP_M = 0.8
export const PLOT_MARGIN_M = 0.5
/** The fewest a plot is ever cut into, however small it is, so a back garden is cut into four */
export const MAX_BEDS = 4
/**
 * The most, however big it is. Every bed is ranked against the whole catalogue, simulated each
 * season and drawn in the scene, so this is a working ceiling, set by what a person can read: a
 * 60 by 40 m field has room for nineteen strips and nobody reads nineteen rankings
 */
export const BED_CEILING = 12
/**
 * How much plot one bed is worth. A 12 by 8 m garden keeps its four beds and a 60 by 40 m field
 * gets the ceiling: four beds of 1.2 m would cover only a twelfth of 0.6 acres, far too thin a plan
 * for that much ground
 */
export const SQUARE_METRES_PER_BED = 60

/**
 * How many beds a plot of this size is cut into, before the light says where they can go.
 *
 * Area drives the count, because
 * a plot's beds are a share of the whole ground: a long thin
 * plot and a square one of the same area are the same amount of gardening
 */
export const bedCountFor = (plotWidthM: number, plotDepthM: number): number => {
  const areaM2 = Math.max(0, plotWidthM) * Math.max(0, plotDepthM)
  return Math.min(BED_CEILING, Math.max(MAX_BEDS, Math.floor(areaM2 / SQUARE_METRES_PER_BED)))
}
/** Narrower than this is a verge, not a bed */
export const MIN_BED_DEPTH_M = 0.6
export const MIN_BED_LENGTH_M = 0.6
/** Nothing is dug within this of a row centreline, which is where the foundations stand */
export const POST_KEEP_CLEAR_M = 0.25
/**
 * Below this the two clusters are one population: the light is even, there is nothing to
 * place against, and an even layout is the honest answer here
 */
export const BAND_SEPARATION_MIN = 0.12
/**
 * How far a bed tries at each step off centre when a judge is sliding it onto the rain the rows
 * shed. A drip strip is 0.2 m wide in still air (`STILL_AIR_STRIP_M`) and wider under wind, so a
 * step of half that can't pass over one
 */
export const SLIDE_STEP_M = 0.1
/**
 * How much a bed's own shortfall has to fall before a move is worth taking. Below a tenth the
 * balance's own inputs, monthly rain normals spread over days and a soil's available water read
 * at the middle of its range, cannot tell two positions apart, and a bed left where the light
 * put it is easier to explain
 */
export const SLIDE_WORTH_FRACTION = 0.1

export const layoutNeedsRoom = (widthM: number, depthM: number): string =>
  `A bed has to be at least ${MIN_BED_DEPTH_M.toFixed(1)} m across and ${MIN_BED_LENGTH_M.toFixed(1)} m long, with a ${PLOT_MARGIN_M.toFixed(1)} m working margin around the plot, and ${widthM.toFixed(1)} by ${depthM.toFixed(1)} m leaves no room for one. Nothing was placed, because a bed you can't reach into is unusable`

export interface LayoutRequest {
  readonly plotWidthM: number
  readonly plotDepthM: number
  readonly arrays: readonly PvArray[]
  readonly raster: DliRaster
  readonly window: GrowingWindow
  readonly maxBeds?: number
  /** What already shades the space; each placed bed's light carries its share (`surroundings.ts`) */
  readonly exposure?: SiteExposure
  /** Drawn houses a bed may never be placed inside; a tree is never policed (Decision Record 26) */
  readonly houses?: readonly House[]
  /**
   * How much water the beds standing on these footprints would go short of over a year, in
   * millimetres per square metre averaged over them, from the water balance on the rain the rows
   * shed onto them and keep off them. With it, each bed slides within the room it has to where
   * its own plants would go short the least (see `slideBeds`). Without it, every bed sits
   * centred in its strip
   */
  readonly shortfallMm?: (footprints: readonly Polygon2D[]) => number
}

/* ------------------------------- the cross-row axis ------------------------------ */

interface Axis {
  /** True when rows are offset along x, so the bands run north-south and the beds run with them */
  readonly crossIsX: boolean
  readonly crossSpanM: number
  readonly alongSpanM: number
}

const axisFor = (request: LayoutRequest): Axis => {
  const geometry = request.arrays[0]?.geometry
  /*
    `rowAzimuthDeg` is the direction the rows RUN (`sim/geometry.ts`, `arrayLayout`), so the rows
    are offset across it, along (cos, -sin): rows running east to west (90) are spaced north to
    south, and the beds run east to west with them. Reading the row direction as the offset would
    only pass while the search's candidates also carried the surface azimuth in this field, two
    matching mistakes cancelling each other out
  */
  const crossIsX =
    geometry !== undefined &&
    Math.abs(cosDeg(geometry.rowAzimuthDeg)) > Math.abs(sinDeg(geometry.rowAzimuthDeg))
  return {
    crossIsX,
    crossSpanM: crossIsX ? request.plotWidthM : request.plotDepthM,
    alongSpanM: crossIsX ? request.plotDepthM : request.plotWidthM,
  }
}

const footprintAt = (axis: Axis, crossM: number, depthM: number, lengthM: number): Polygon2D =>
  polygonOf(
    axis.crossIsX
      ? rectangleRing(vec2(crossM, 0), depthM, lengthM)
      : rectangleRing(vec2(0, crossM), lengthM, depthM),
  )

/* --------------------------------- the light field ------------------------------- */

interface SeasonField {
  readonly under: Float32Array
  readonly open: Float32Array
}

/**
 * Growing-season daily light integral per ground cell, day-weighted across the months in the
 * window exactly as `seasonLight` weights them, so the profile below and the per-bed figure
 * reported to the recommender are the same quantity read at two scales
 */
const seasonField = (raster: DliRaster, window: GrowingWindow): SeasonField => {
  const cells = raster.grid.cols * raster.grid.rows
  const under = new Float32Array(cells)
  const open = new Float32Array(cells)
  let days = 0
  for (const month of monthsInWindow(window)) {
    const monthDays = DAYS_PER_MONTH[month] ?? 30
    const monthUnder = monthValue(raster.monthlyUnderArrayMolM2Day, month)
    const monthOpen = monthValue(raster.monthlyOpenSkyMolM2Day, month)
    for (let index = 0; index < cells; index += 1) {
      under[index] = (under[index] ?? 0) + (monthUnder[index] ?? 0) * monthDays
      open[index] = (open[index] ?? 0) + (monthOpen[index] ?? 0) * monthDays
    }
    days += monthDays
  }
  if (days <= 0) return { under, open }
  for (let index = 0; index < cells; index += 1) {
    under[index] = (under[index] ?? 0) / days
    open[index] = (open[index] ?? 0) / days
  }
  return { under, open }
}

interface Profile {
  /** Cross-axis coordinate of each sampled slice centre, ascending */
  readonly centresM: readonly number[]
  readonly valuesMolM2Day: readonly number[]
  readonly cellSizeM: number
}

/** The two-dimensional field collapsed onto the one axis the banding actually varies along */
const profileOf = (
  raster: DliRaster,
  field: SeasonField,
  axis: Axis,
  halfAlongM: number,
): Profile => {
  const { extent, cellSizeM, cols, rows } = raster.grid
  const crossCount = axis.crossIsX ? cols : rows
  const alongCount = axis.crossIsX ? rows : cols
  const crossMinM = axis.crossIsX ? extent.minXM : extent.minYM
  const alongMinM = axis.crossIsX ? extent.minYM : extent.minXM
  const halfCrossM = axis.crossSpanM / 2
  const centresM: number[] = []
  const valuesMolM2Day: number[] = []
  for (let cross = 0; cross < crossCount; cross += 1) {
    const centreM = crossMinM + (cross + 0.5) * cellSizeM
    if (Math.abs(centreM) > halfCrossM) continue
    let total = 0
    let count = 0
    for (let along = 0; along < alongCount; along += 1) {
      if (Math.abs(alongMinM + (along + 0.5) * cellSizeM) > halfAlongM) continue
      total += field.under[axis.crossIsX ? along * cols + cross : cross * cols + along] ?? 0
      count += 1
    }
    if (count === 0) continue
    centresM.push(centreM)
    valuesMolM2Day.push(total / count)
  }
  return { centresM, valuesMolM2Day, cellSizeM }
}

/* ---------------------------------- the clustering -------------------------------- */

export interface LightClusters {
  readonly thresholdMolM2Day: number
  readonly darkMeanMolM2Day: number
  readonly brightMeanMolM2Day: number
  /** How far apart the two populations are, as a fraction of the brighter one */
  readonly separation: number
}

/**
 * Exactly two clusters, found exactly.
 *
 * In one dimension the optimal k-means partition is contiguous in sorted order, so scanning
 * every split point and keeping the least within-cluster sum of squares is the global
 * optimum. That is why there is no seed here and no
 * iteration count: the answer is a function of the profile alone, so it cannot move between
 * runs. k is 2 because the structure being recovered is a row array, which casts exactly two
 * kinds of ground, under a row and between rows
 */
export const twoLightClusters = (values: readonly number[]): LightClusters | null => {
  if (values.length < 2) return null
  const sorted = [...values].sort((a, b) => a - b)
  const prefix = [0]
  const squares = [0]
  for (const [index, value] of sorted.entries()) {
    prefix.push((prefix[index] ?? 0) + value)
    squares.push((squares[index] ?? 0) + value * value)
  }
  const sse = (from: number, to: number): number => {
    const count = to - from
    if (count <= 0) return 0
    const total = (prefix[to] ?? 0) - (prefix[from] ?? 0)
    return (squares[to] ?? 0) - (squares[from] ?? 0) - (total * total) / count
  }
  let bestSplit = 1
  let best = Infinity
  for (let split = 1; split < sorted.length; split += 1) {
    const cost = sse(0, split) + sse(split, sorted.length)
    if (cost < best - 1e-12) {
      best = cost
      bestSplit = split
    }
  }
  const darkMean = (prefix[bestSplit] ?? 0) / bestSplit
  const brightMean =
    ((prefix[sorted.length] ?? 0) - (prefix[bestSplit] ?? 0)) / (sorted.length - bestSplit)
  return {
    thresholdMolM2Day: ((sorted[bestSplit - 1] ?? 0) + (sorted[bestSplit] ?? 0)) / 2,
    darkMeanMolM2Day: darkMean,
    brightMeanMolM2Day: brightMean,
    separation: brightMean > 0 ? (brightMean - darkMean) / brightMean : 0,
  }
}

/* ----------------------------------- the intervals -------------------------------- */

type Span = readonly [number, number]

const runsOf = (
  profile: Profile,
  thresholdMolM2Day: number,
): readonly (readonly [LightZoneKind, Span])[] => {
  const runs: (readonly [LightZoneKind, Span])[] = []
  const halfM = profile.cellSizeM / 2
  const kindAt = (index: number): LightZoneKind =>
    (profile.valuesMolM2Day[index] ?? 0) <= thresholdMolM2Day ? 'shaded-band' : 'bright-gap'
  let start = 0
  for (let index = 1; index <= profile.centresM.length; index += 1) {
    if (index < profile.centresM.length && kindAt(index) === kindAt(start)) continue
    runs.push([
      kindAt(start),
      [(profile.centresM[start] ?? 0) - halfM, (profile.centresM[index - 1] ?? 0) + halfM],
    ])
    start = index
  }
  return runs
}

/**
 * The cross-axis intervals a bed may not sit on, because the array's feet are in them. The
 * strip is widened to half a working gap where the foundation is narrower than that, so the
 * ground a post stands in is the path between the two beds either side of it
 */
const postSpans = (arrays: readonly PvArray[], axis: Axis): readonly Span[] => {
  const halfM = Math.max(POST_KEEP_CLEAR_M, BED_GAP_M / 2)
  return arrays.flatMap(({ geometry }) => {
    const originM = axis.crossIsX ? geometry.originM.xM : geometry.originM.yM
    return Array.from({ length: geometry.rowCount }, (_, row): Span => {
      const centreM = originM + (row - (geometry.rowCount - 1) / 2) * geometry.pitchM
      return [centreM - halfM, centreM + halfM]
    })
  })
}

const subtract = (span: Span, cuts: readonly Span[]): readonly Span[] =>
  cuts.reduce<readonly Span[]>(
    (pieces, [cutLo, cutHi]) =>
      pieces.flatMap(([lo, hi]) =>
        cutHi <= lo || cutLo >= hi
          ? [[lo, hi] as Span]
          : [
              ...(cutLo > lo ? [[lo, cutLo] as Span] : []),
              ...(cutHi < hi ? [[cutHi, hi] as Span] : []),
            ],
      ),
    [span],
  )

interface Slot {
  readonly kind: LightZoneKind
  readonly centreM: number
  readonly depthM: number
  /** Which call to `slotsIn` cut this slot, so a bed that slides finds the room its own span leaves it */
  readonly run: number
}

/** Beds fill a strip from the middle out, each with a working gap to the next */
const slotsIn = (kind: LightZoneKind, [loM, hiM]: Span, run: number): readonly Slot[] => {
  const lengthM = hiM - loM
  if (lengthM < MIN_BED_DEPTH_M) return []
  const depthM = Math.min(BED_DEPTH_M, lengthM)
  const count = Math.max(1, Math.floor((lengthM + BED_GAP_M) / (depthM + BED_GAP_M)))
  const spanM = count * depthM + (count - 1) * BED_GAP_M
  const firstM = loM + (lengthM - spanM) / 2 + depthM / 2
  return Array.from({ length: count }, (_, index) => ({
    kind,
    centreM: firstM + index * (depthM + BED_GAP_M),
    depthM,
    run,
  }))
}

/**
 * The mix, made deliberately. Slots are taken one zone kind at a time starting with the
 * bright ones, so a plot with room for two beds carries one of each
 */
const interleave = (slots: readonly Slot[], limit: number): readonly Slot[] => {
  const kinds: readonly LightZoneKind[] = ['bright-gap', 'shaded-band', 'even-light']
  const queues = kinds.map((kind) =>
    slots.filter((slot) => slot.kind === kind).sort((a, b) => a.centreM - b.centreM),
  )
  const taken: Slot[] = []
  for (let round = 0; taken.length < limit; round += 1) {
    const before = taken.length
    for (const queue of queues) {
      const slot = queue[round]
      if (taken.length < limit && slot !== undefined) taken.push(slot)
    }
    if (taken.length === before) break
  }
  return [...taken].sort((a, b) => a.centreM - b.centreM)
}

/* ------------------------------------ the slide ------------------------------------ */

/** One bed's move, kept alongside the slid slots so the explanation can name it afterwards */
interface BedMove {
  readonly bedNumber: number
  readonly deltaM: number
  readonly reducedMm: number
}

interface Slid {
  readonly slots: readonly Slot[]
  readonly moves: readonly BedMove[]
}

/**
 * Slides each bed on its own, one at a time in ascending order along the axis, to wherever the
 * judge reports the least shortfall for that bed alone. A bed judged as one piece with its
 * whole strip leaves gains on the table: the bed nearest a row's low edge is the one with
 * something to gain, and it gains alone, so it moves alone.
 *
 * A bed's room is bounded by its own span's ends (the working margin, the half-gap off a
 * neighbouring band and the post keep-clear cuts already carried by that span) and by its
 * neighbours: the bed before it at the position that bed already settled on, plus the working
 * gap, and the bed after it at its still-centred position, minus the working gap. Ascending
 * order means a later bed can use room an earlier one vacated, and never the other way round.
 * Two beds cut from the same span start with no room against each other at all, exactly the
 * gap `slotsIn` packed them at, until the earlier one moves and opens some.
 *
 * A bed with less than a step of room on both sides together is left where it was, and so is a
 * bed whose best offset does not beat staying centred by at least `SLIDE_WORTH_FRACTION`
 */
const slideBeds = (
  slots: readonly Slot[],
  spans: readonly Span[],
  axis: Axis,
  lengthM: number,
  shortfallMm: (footprints: readonly Polygon2D[]) => number,
): Slid => {
  const ordered = [...slots].sort((a, b) => a.centreM - b.centreM)
  // the position each bed has settled on so far: its own centre until this pass moves it
  const settledM = ordered.map((slot) => slot.centreM)
  const moves: BedMove[] = []

  for (const [index, slot] of ordered.entries()) {
    const span = spans[slot.run]
    if (span === undefined) continue
    const previous = index > 0 ? ordered[index - 1] : undefined
    const next = index < ordered.length - 1 ? ordered[index + 1] : undefined
    const loEdgeBoundM =
      previous === undefined
        ? span[0]
        : Math.max(span[0], (settledM[index - 1] ?? 0) + previous.depthM / 2 + BED_GAP_M)
    const hiEdgeBoundM =
      next === undefined ? span[1] : Math.min(span[1], next.centreM - next.depthM / 2 - BED_GAP_M)

    const roomLoM = slot.centreM - slot.depthM / 2 - loEdgeBoundM
    const roomHiM = hiEdgeBoundM - (slot.centreM + slot.depthM / 2)
    // the same float slack as the step count below, so a room the arithmetic meant to land
    // exactly on a step is never skipped by a rounding error in its last digit
    if (roomLoM + roomHiM < SLIDE_STEP_M - 1e-9) continue

    // a tiny slack against float rounding in the span's own arithmetic, never a whole step
    const stepsHi = Math.floor(roomHiM / SLIDE_STEP_M + 1e-9)
    const stepsLo = Math.floor(roomLoM / SLIDE_STEP_M + 1e-9)
    const deltasM = [0]
    for (let step = 1; step <= Math.max(stepsHi, stepsLo); step += 1) {
      if (step <= stepsHi) deltasM.push(step * SLIDE_STEP_M)
      if (step <= stepsLo) deltasM.push(-step * SLIDE_STEP_M)
    }

    const shortfallAt = (deltaM: number): number =>
      shortfallMm([footprintAt(axis, slot.centreM + deltaM, slot.depthM, lengthM)])

    let centredMm = 0
    let bestDeltaM = 0
    let bestMm = Infinity
    for (const [order, deltaM] of deltasM.entries()) {
      const mm = shortfallAt(deltaM)
      if (order === 0) centredMm = mm
      const better =
        mm < bestMm ||
        (mm === bestMm &&
          (Math.abs(deltaM) < Math.abs(bestDeltaM) ||
            (Math.abs(deltaM) === Math.abs(bestDeltaM) && deltaM < bestDeltaM)))
      if (better) {
        bestMm = mm
        bestDeltaM = deltaM
      }
    }

    if (bestDeltaM !== 0 && bestMm <= (1 - SLIDE_WORTH_FRACTION) * centredMm) {
      settledM[index] = slot.centreM + bestDeltaM
      moves.push({ bedNumber: index + 1, deltaM: bestDeltaM, reducedMm: centredMm - bestMm })
    }
  }

  return {
    slots: ordered.map((slot, index) =>
      settledM[index] === slot.centreM
        ? slot
        : { ...slot, centreM: settledM[index] ?? slot.centreM },
    ),
    moves,
  }
}

/* ------------------------------------ the words ----------------------------------- */

const percent = (value: number): string => `${String(Math.round(value * 100))}%`

/** Why a bed in this zone suits what it suits; the store reuses it for a bed planted as it stands */
export const zoneReason = (kind: LightZoneKind, shadeRatio: number): string =>
  kind === 'even-light'
    ? 'Nothing stands over this bed, so it gets whatever the open sky gives the whole plot. Anything the climate allows can go in it'
    : kind === 'shaded-band'
      ? `This bed sits under a panel row, which takes about ${percent(shadeRatio)} of its daylight right through the growing season. It suits the leaves, roots and herbs that do well out of full sun`
      : `This bed sits in the gap between two panel rows and keeps about ${percent(1 - shadeRatio)} of the daylight the open sky gives this plot. It's the place for anything that has to set fruit`

const evenExplanation = (reason: string): string =>
  `The ground light over this plot is one even field (${reason}), so there is no band to place beds against. The beds are spread across it with a working path between each, and every one can be planted much the same way`

const bandedExplanation = (beds: readonly BedPlacement[]): string => {
  const bright = beds.filter((bed) => bed.zone === 'bright-gap').length
  const shaded = beds.filter((bed) => bed.zone === 'shaded-band').length
  const shades = beds.map((bed) => bed.summary.shadeRatio as number)
  const spread = Math.max(...shades) - Math.min(...shades)
  return `The light under these panels comes at two levels. The bright strips between the rows hold ${String(bright)} bed${bright === 1 ? '' : 's'}, and the ground under the rows holds ${String(shaded)}. The shadiest bed gives up about ${percent(spread)} more of its daylight than the brightest one. The shaded beds carry the leaves and roots that do well out of full sun, and the bright beds carry the crops that have to set fruit. No bed straddles the edge between the two, because such a bed would have no single light level to choose crops against`
}

/** The plot frame is +x east, +y north, so which way a positive offset reads depends on the axis */
const directionWord = (axis: Axis, deltaM: number): string =>
  axis.crossIsX ? (deltaM > 0 ? 'east' : 'west') : deltaM > 0 ? 'north' : 'south'

const moveSentence = (axis: Axis, move: BedMove): string =>
  `Bed ${String(move.bedNumber)} moved ${Math.abs(move.deltaM).toFixed(1)} m ${directionWord(axis, move.deltaM)} within its strip, onto the rain the rows shed, and its water shortfall there drops by ${String(Math.round(move.reducedMm))} mm over a year`

/** Nothing to add when no bed moved, so a request with no judge gets no move sentences */
const moveSentences = (axis: Axis, moves: readonly BedMove[]): string =>
  moves.map((move) => `. ${moveSentence(axis, move)}`).join('')

/* ---------------------------------- the placement ---------------------------------- */

interface Measured {
  readonly meanMolM2Day: number
  readonly worstMolM2Day: number
  readonly shadeRatio: number
}

const measure = (field: SeasonField, raster: DliRaster, footprint: Polygon2D): Measured => {
  const indices = cellIndicesInPolygon(raster, footprint)
  if (indices.length === 0) return { meanMolM2Day: 0, worstMolM2Day: 0, shadeRatio: 0 }
  let under = 0
  let open = 0
  let worst = Infinity
  for (const index of indices) {
    const value = field.under[index] ?? 0
    under += value
    open += field.open[index] ?? 0
    worst = Math.min(worst, value)
  }
  const meanUnder = under / indices.length
  return {
    meanMolM2Day: meanUnder,
    worstMolM2Day: worst === Infinity ? 0 : worst,
    shadeRatio: relativeShadeRatio(
      meanUnder as MolPerM2Day,
      (open / indices.length) as MolPerM2Day,
    ),
  }
}

const placementsFor = (
  slots: readonly Slot[],
  axis: Axis,
  lengthM: number,
  raster: DliRaster,
  field: SeasonField,
  exposure: SiteExposure,
): readonly BedPlacement[] =>
  slots.map((slot, index) => {
    const bedId = asBedId(`bed-${String(index + 1)}`)
    const footprint = footprintAt(axis, slot.centreM, slot.depthM, lengthM)
    const measured = measure(field, raster, footprint)
    return {
      bedId,
      label: `Bed ${String(index + 1)}`,
      footprint,
      zone: slot.kind,
      summary: {
        meanGrowingSeasonDli: measured.meanMolM2Day as MolPerM2Day,
        worstCellGrowingSeasonDli: measured.worstMolM2Day as MolPerM2Day,
        shadeRatio: measured.shadeRatio as Fraction,
      },
      // the panels' shade places the bed and names its zone; the crops it is then ranked for
      // are judged on that light with the surroundings' share taken off as well
      light: shadedBySurroundings(bedLightOf(raster, bedId, footprint), exposure),
      reason: zoneReason(slot.kind, measured.shadeRatio),
    }
  })

/**
 * A placement whose footprint stands inside a drawn house is dropped the way one with no room
 * is: never invented, never placed. Each one dropped names the house it would have stood in
 */
const clearOfHouses = (
  beds: readonly BedPlacement[],
  houses: readonly House[],
  refusals: string[],
): readonly BedPlacement[] => {
  if (houses.length === 0) return beds
  return beds.filter((bed) => {
    const house = overlapsAHouse(bed.footprint, houses)
    if (house === null) return true
    refusals.push(`${bed.label} would stand inside ${house.label}, so it wasn't placed`)
    return false
  })
}

/**
 * Deterministic and bounded: one pass over the grid to build the seasonal field, one pass
 * along the cross-row axis to profile it, one exact two-cluster split, then at most
 * `MAX_BEDS` polygon rasterisations. With a judge, each bed is also tried at every
 * `SLIDE_STEP_M` across the room its span and its neighbours leave it, a few dozen balances
 * per bed at most. Still no search, no seed, no iteration limit
 */
export const placeBeds = (request: LayoutRequest): Derivation<BedLayout> => {
  const axis = axisFor(request)
  const usableCrossM = axis.crossSpanM - 2 * PLOT_MARGIN_M
  const lengthM = axis.alongSpanM - 2 * PLOT_MARGIN_M
  if (usableCrossM < MIN_BED_DEPTH_M || lengthM < MIN_BED_LENGTH_M) {
    return { ok: false, reason: layoutNeedsRoom(request.plotWidthM, request.plotDepthM) }
  }
  const limit = Math.max(
    1,
    Math.trunc(request.maxBeds ?? bedCountFor(request.plotWidthM, request.plotDepthM)),
  )
  const halfM = usableCrossM / 2
  const field = seasonField(request.raster, request.window)
  const refusals: string[] = []

  // every call tags its slots with the span it cut them from (`Slot.run`), so a bed that
  // slides later finds the room its own span leaves it
  const spans: Span[] = []
  const cutSlots = (kind: LightZoneKind, span: Span): readonly Slot[] => {
    spans.push(span)
    return slotsIn(kind, span, spans.length - 1)
  }

  // a judge slides each bed onto the rain the rows shed, when the plot carries an array to shed it.
  // A request missing either keeps every bed exactly where it was centred
  const settle = (slots: readonly Slot[]): Slid =>
    request.shortfallMm !== undefined && request.arrays.length > 0
      ? slideBeds(slots, spans, axis, lengthM, request.shortfallMm)
      : { slots, moves: [] }

  const even = (reason: string): Derivation<BedLayout> => {
    const slid = settle(interleave(cutSlots('even-light', [-halfM, halfM]), limit))
    const beds = clearOfHouses(
      placementsFor(slid.slots, axis, lengthM, request.raster, field, request.exposure ?? 'open'),
      request.houses ?? [],
      refusals,
    )
    return {
      ok: true,
      value: {
        beds,
        banded: false,
        explanation: evenExplanation(reason) + moveSentences(axis, slid.moves),
        refusals,
      },
    }
  }

  if (request.arrays.length === 0) return even('there are no panels over it')

  const profile = profileOf(request.raster, field, axis, lengthM / 2)
  const clusters = twoLightClusters(profile.valuesMolM2Day)
  if (clusters === null || clusters.separation < BAND_SEPARATION_MIN) {
    return even(
      `the brightest and darkest strips differ by only ${percent(clusters?.separation ?? 0)} of the daylight, too little to plant them differently`,
    )
  }

  const cuts = postSpans(request.arrays, axis)
  const slots = runsOf(profile, clusters.thresholdMolM2Day).flatMap(([kind, [loM, hiM]]) => {
    // half a working gap off each edge the next zone is on, so beds in adjacent bands still
    // have a path between them and neither one sits on the transition cells. The plot edge
    // already carries the full margin, so nothing is taken off there twice
    const lo = Math.max(loM, -halfM) + (loM < -halfM ? 0 : BED_GAP_M / 2)
    const hi = Math.min(hiM, halfM) - (hiM > halfM ? 0 : BED_GAP_M / 2)
    return hi - lo < MIN_BED_DEPTH_M
      ? []
      : subtract([lo, hi], cuts).flatMap((span) => cutSlots(kind, span))
  })
  if (slots.length === 0) {
    refusals.push(
      'The light here is banded, but no strip is wide enough to hold a bed clear of the working margin and the ground the array stands on. The beds fall back to an even spread, and none is placed against the bands',
    )
    return even('no strip was wide enough to hold a bed clear of the array feet')
  }

  // a band whose every bed overlaps a house still reports each drop by name; the mix sentence
  // below is not guarded for a band that empties out entirely, which no plot has shown yet
  const slid = settle(interleave(slots, limit))
  const beds = clearOfHouses(
    placementsFor(slid.slots, axis, lengthM, request.raster, field, request.exposure ?? 'open'),
    request.houses ?? [],
    refusals,
  )
  const kinds = new Set(beds.map((bed) => bed.zone))
  if (kinds.size < 2) {
    refusals.push(
      `Only the ${kinds.has('shaded-band') ? 'shaded strips under the rows' : 'bright strips between the rows'} were wide enough to hold a bed, so this plot doesn't get the shade-tolerant and sun-demanding mix the design would otherwise give it`,
    )
  }
  return {
    ok: true,
    value: {
      beds,
      banded: true,
      explanation: bandedExplanation(beds) + moveSentences(axis, slid.moves),
      refusals,
    },
  }
}

/** The geometry-only layout, which is all there is to say before anything has been baked */
export const evenFootprints = (
  widthM: number,
  depthM: number,
  maxBeds?: number,
): readonly Polygon2D[] => {
  const usableDepthM = Math.max(MIN_BED_DEPTH_M, depthM - 2 * PLOT_MARGIN_M)
  const bedLengthM = Math.max(MIN_BED_LENGTH_M, widthM - 2 * PLOT_MARGIN_M)
  const bedDepthM = Math.min(BED_DEPTH_M, usableDepthM)
  const count = clamp(
    Math.floor((usableDepthM + BED_GAP_M) / (bedDepthM + BED_GAP_M)),
    1,
    // the same count the baked layout would place, so the geometry-only preview a visitor sees
    // before anything is baked is not a different garden from the one they get
    Math.min(bedCountFor(widthM, depthM), Math.max(1, Math.trunc(maxBeds ?? Infinity))),
  )
  const spanM = count * bedDepthM + (count - 1) * BED_GAP_M
  const firstM = -spanM / 2 + bedDepthM / 2
  return Array.from({ length: count }, (_, index) =>
    polygonOf(
      rectangleRing(vec2(0, firstM + index * (bedDepthM + BED_GAP_M)), bedLengthM, bedDepthM),
    ),
  )
}
