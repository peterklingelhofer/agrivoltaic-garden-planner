import type { Bed, GardenPlot } from '../types/garden'
import type { LatLon } from '../types/geo'
import { DEFAULT_GROUND_COVER } from '../types/ground'
import type { GrowingWindow } from '../types/light'
import { arrayId, bedId, plotId, siteId } from '../types/ids'
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
import { polygonAreaM2, polygonOf, rectangleRing, vec2 } from './geom'
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
 * On, both of them, and the argument that had them off is worth stating because it was a good one.
 *
 * It ran: a preference nobody expressed is not a preference, and asking for natives with no answer
 * behind it would reorder a beginner's whole list towards plants the checklist happens to hold an
 * entry for, with no way for them to know why. What that misses is what these two actually do.
 * Neither is a filter. Both nudge the order crops come back in and take nothing off the list, and
 * the guided path asks about each of them in its own step, so a grower who wants neither is two
 * presses from saying so and can see the switch that did it.
 *
 * What is left is which way round to start, and the honest answer is that this application is for
 * growing food under panels alongside the things that live there. Starting with the local plants
 * and the insects that grew up beside them is this tool's own position, stated rather than
 * withheld, and a beginner who never touches either switch gets the garden it would argue for
 */
export const DEFAULT_WILDLIFE: WildlifeChoices = {
  // off, both of them. On by default they turn a request for "Tomatoes,
  // peppers and berries" into hops, sorrel and tomatillo, from two questions that go unread
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
 * Lowest free rather than highest plus one, so deleting a bed and drawing another gives back the
 * name that was just freed instead of climbing forever
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
      harvestsPanelRunoff: false,
    },
    raisedHeightM: meters(0.35),
    modifiers: [],
    waterHarvesting: [],
    plantings: [],
    ...patch,
    ...(patch.footprint ? { areaM2: polygonAreaM2(patch.footprint) } : {}),
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
