import { CROWN_TRANSMITTANCE_IN_LEAF, CROWN_TRANSMITTANCE_LEAFLESS } from '../data/canopy'
import type { Bed, GardenPlot, Obstruction } from '../types/garden'
import type { LatLon, Polygon2D } from '../types/geo'
import { DEFAULT_GROUND_COVER } from '../types/ground'
import type { GrowingWindow } from '../types/light'
import { arrayId, bedId, obstructionId, plotId, siteId } from '../types/ids'
import type { ModuleSpec, PvArray, RowGeometry, TrackerConfig } from '../types/pv'
import type { SimulationState } from '../types/simulation'
import type { SoilProfile } from '../types/site'
import {
  degrees,
  degreesLatitude,
  degreesLongitude,
  fraction,
  meters,
  millimetersPerYear,
  wattsPeak,
} from '../types/units'
import { withDerived } from './derive'
import { extentOf, polygonAreaM2, polygonOf, rectangleRing, vec2 } from './geom'
import type { EffectSettings, OverlaySettings, WildlifeChoices } from './slices'

export const DEFAULT_LOCATION: LatLon = {
  latitudeDeg: degreesLatitude(42.3736),
  longitudeDeg: degreesLongitude(-72.5199),
}

export const DEFAULT_LOCATION_LABEL = 'Amherst, Massachusetts'

/** The months every compliance regime and every seasonal aggregate in this app is read over */
export const SIM_GROWING_WINDOW: GrowingWindow = { startMonth: 4, endMonth: 9 }

export const DEFAULT_OVERLAY: OverlaySettings = {
  visible: true,
  slice: 'annual',
  channel: 'dli',
  opacity: 0.75,
}

/**
 * On by default because the occlusion is a correction, not a garnish: without it the renderer
 * lights shaded ground off the whole hemisphere and reads it 1.33x too bright. A grower whose
 * machine cannot afford it can switch it off and see the same scene, brighter under the panels
 */
export const DEFAULT_EFFECTS: EffectSettings = {
  ambientOcclusion: true,
}

/**
 * Off, both of them, for the reason on the value below. Neither is a filter: both nudge the order
 * crops come back in and take nothing off the list, and the guided path asks about each in its own
 * step, so a grower who wants either is two presses from switching it on
 */
export const DEFAULT_WILDLIFE: WildlifeChoices = {
  // off, both of them: on by default, a request for "Tomatoes, peppers and berries"
  // came back as hops, sorrel and tomatillo, from two questions that explain themselves poorly
  favourNative: false,
  favourPollinators: false,
}

export const DEFAULT_MODULE: ModuleSpec = {
  widthM: meters(1.134),
  heightM: meters(1.762),
  nameplateWp: wattsPeak(430),
  bifacialityFactor: fraction(0.7),
  transmittanceFraction: fraction(0),
  rearReflectance: fraction(0.05),
  backsheet: 'glass-glass',
}

export const DEFAULT_ROW_GEOMETRY: RowGeometry = {
  collectorWidthM: meters(3.524),
  pitchM: meters(9),
  rowLengthM: meters(13.6),
  rowCount: 3,
  modulesPerRow: 12,
  clearanceHeightM: meters(2.5),
  rowAzimuthDeg: degrees(90),
  originM: vec2(0, 0),
}

export const DEFAULT_TRACKER: TrackerConfig = {
  mode: 'fixed',
  tiltDeg: degrees(25),
  surfaceAzimuthDeg: degrees(180),
}

/**
 * True for an array still facing one of the two starting directions, whichever hemisphere. The
 * starting array faces south, which is away from the sun south of the equator, so a place that
 * resolves there turns such an array to face the equator (`resolveSite` in the store) and never
 * one somebody has pointed by hand
 */
export const facesStartingDirection = (array: PvArray): boolean =>
  array.tracker.mode === 'fixed' &&
  (array.tracker.surfaceAzimuthDeg === 0 || array.tracker.surfaceAzimuthDeg === 180)

export const DEFAULT_SOIL: SoilProfile = {
  phUnits: 6.5,
  textureClass: 'loam',
  drainage: 'well',
  effectiveDepthM: meters(0.6),
  organicMatterFraction: fraction(0.04),
  sourceId: 'default',
}

export const makeArray = (index: number, patch: Partial<PvArray> = {}): PvArray =>
  withDerived({
    id: arrayId(`array-${index}`),
    label: `Array ${index}`,
    geometry: DEFAULT_ROW_GEOMETRY,
    tracker: DEFAULT_TRACKER,
    module: DEFAULT_MODULE,
    derived: {
      groundCoverRatio: fraction(0),
      projectedGroundCoverRatio: fraction(0),
      maxHeightM: meters(0),
      nameplateDcKw: 0 as PvArray['derived']['nameplateDcKw'],
      nameplateAcKw: 0 as PvArray['derived']['nameplateAcKw'],
    },
    ...patch,
  })

/**
 * The number for the next bed: the lowest one nothing has already taken.
 *
 * `beds.length + 1` collides the moment a bed in the middle is removed. Three beds less Bed 2 is a
 * list of length two, so the next bed would be "Bed 3" again, and the two callers would fail
 * differently on it. `commitDraft` appends, so a drawn bed would leave the plot holding two beds
 * with the same id. `upsertBed` matches on id, so the agent's `add-bed` would REPLACE the existing
 * Bed 3, plantings and all, and say it had added one.
 *
 * The lowest free number wins over highest plus one, so deleting a bed and drawing another gives back the
 * name that was just freed, without climbing forever
 */
export const nextBedIndex = (beds: readonly Bed[]): number => {
  const taken = new Set<string>(beds.map((bed) => bed.id))
  let index = 1
  while (taken.has(`bed-${String(index)}`)) index += 1
  return index
}

export const makeBed = (index: number, patch: Partial<Bed> = {}): Bed => {
  const footprint = patch.footprint ?? polygonOf(rectangleRing(vec2(0, -6 + index * 3), 8, 1.4))
  return {
    id: bedId(`bed-${index}`),
    label: `Bed ${index}`,
    footprint,
    areaM2: polygonAreaM2(footprint),
    soil: DEFAULT_SOIL,
    irrigation: {
      method: 'drip',
      available: true,
      appliedMmPerYear: millimetersPerYear(180),
    },
    raisedHeightM: meters(0.35),
    modifiers: [],
    waterHarvesting: [],
    plantings: [],
    ...patch,
    ...(patch.footprint ? { areaM2: polygonAreaM2(patch.footprint) } : {}),
  }
}

/** Ground to eaves, and the two sides in plot metres, for the house `addHouse` draws */
const HOUSE_WIDTH_M = 10
const HOUSE_DEPTH_M = 8
const HOUSE_HEIGHT_M = 6
/** Clear of the boundary, so the house's own shadow reaches the plot when the sun is low */
const HOUSE_SETBACK_M = 2

/**
 * The house `addHouse` draws: 10 by 8 m, 6 m to the eaves, centred on the boundary's east-west
 * centre and standing just outside it on the side the sun crosses at midday, so its shadow falls
 * across the plot (Decision Record 26)
 */
export const makeHouse = (
  index: number,
  boundary: Polygon2D,
  side: 'south' | 'north',
): Obstruction => {
  const extent = extentOf([boundary.exterior])
  const centreXM = (extent.minXM + extent.maxXM) / 2
  const setbackM = HOUSE_SETBACK_M + HOUSE_DEPTH_M / 2
  const centreYM = side === 'south' ? extent.minYM - setbackM : extent.maxYM + setbackM
  return {
    id: obstructionId(`house-${index}`),
    kind: 'house',
    label: `House ${index}`,
    footprint: polygonOf(rectangleRing(vec2(centreXM, centreYM), HOUSE_WIDTH_M, HOUSE_DEPTH_M)),
    heightM: meters(HOUSE_HEIGHT_M),
  }
}

/** A crown 5 by 5 m, 2 m up to 7 m, for the tree `addTree` draws */
const TREE_WIDTH_M = 5
const TREE_DEPTH_M = 5
const TREE_CROWN_BASE_M = 2
const TREE_HEIGHT_M = 7
/** Clear of the boundary on the equator side, the same setback the default house stands at */
const TREE_SETBACK_M = 2
/** East of the boundary's centre, so a house and a tree added together do not share ground */
const TREE_EAST_OFFSET_M = 8

/**
 * The tree `addTree` draws: a 5 by 5 m crown from 2 up to 7 m, deciduous, its transmittance the
 * two cited Konarska et al. 2014 figures, standing 8 m east of the boundary's centre and just
 * outside it on the equator side like the default house, so the two do not share ground
 * (Decision Record 26)
 */
export const makeTree = (
  index: number,
  boundary: Polygon2D,
  side: 'south' | 'north',
): Obstruction => {
  const extent = extentOf([boundary.exterior])
  const centreXM = (extent.minXM + extent.maxXM) / 2 + TREE_EAST_OFFSET_M
  const setbackM = TREE_SETBACK_M + TREE_DEPTH_M / 2
  const centreYM = side === 'south' ? extent.minYM - setbackM : extent.maxYM + setbackM
  return {
    id: obstructionId(`tree-${index}`),
    kind: 'tree',
    label: `Tree ${index}`,
    footprint: polygonOf(rectangleRing(vec2(centreXM, centreYM), TREE_WIDTH_M, TREE_DEPTH_M)),
    crownBaseM: meters(TREE_CROWN_BASE_M),
    heightM: meters(TREE_HEIGHT_M),
    evergreen: false,
    transmittance: CROWN_TRANSMITTANCE_IN_LEAF.value,
    leaflessTransmittance: CROWN_TRANSMITTANCE_LEAFLESS.value,
  }
}

export const makePlot = (): GardenPlot => ({
  id: plotId('plot-1'),
  siteId: siteId('site-1'),
  label: 'Untitled plot',
  boundary: polygonOf(rectangleRing(vec2(0, 0), 32, 24)),
  northOffsetDeg: degrees(0),
  originOffsetM: vec2(0, 0),
  beds: [makeBed(1), makeBed(2), makeBed(3)],
  arrays: [makeArray(1)],
  obstructions: [],
  groundCover: DEFAULT_GROUND_COVER,
})

/**
 * No seasons run, and the seed every garden starts with.
 *
 * The seed is what a folklore claim's hidden truth is drawn from (Decision Record 14.3). It is
 * fixed here so a default design is the same design twice, and it is replaced by a seed taken
 * from the place the first time a site resolves with no seasons run, so two gardens in two towns
 * disagree about whether carrots love tomatoes the way two growers would, and one garden never
 * changes its mind. It is persisted with the design and survives a reset of the seasons
 */
export const DEFAULT_SIMULATION_SEED = 1

export const defaultSimulation = (): SimulationState => ({
  seed: DEFAULT_SIMULATION_SEED,
  season: 0,
  yearChoice: 'typical',
  history: [],
  reports: [],
  trials: [],
  revealed: [],
})
