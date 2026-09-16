import type { GardenPlot } from '../types/garden'
import { groundAlbedoOf } from '../types/ground'
import type { BedLight, DliRaster, RasterQuality, TimeWindowSpec } from '../types/light'
import type { Occluder } from '../types/pv'
import type { Site } from '../types/site'
import type { Degrees, EpochMillis, Fraction, Meters } from '../types/units'
import type { SkySubdivision, TmySeries } from '../types/weather'
import { bedLight } from './aggregate'
import type { AccumulationProgress, BackendKind } from './backend'
import { createBackendAsync, openSkyAccumulation } from './backend'
import { MA_GROWING_SEASON_HOURS } from './compliance'
import type { PhysicsImplementation } from './core'
import { physicsImplementation } from './core'
import { decompose, selectDecompositionModel } from './decomposition'
import { ensurePhysicsCore } from './rust-core-load'
import { gridForExtent, panelSnapshot, sceneExtent } from './geometry'
import { at, RAD_TO_DEG } from './math'
import { leafOnMonthsFor, obstructionQuads } from './obstruction'
import { applyInterreflection, dliRasterFromAccumulation } from './raster'
import {
  annualFromMonthly,
  cumulativeSkySet,
  DEFAULT_SUN_BINNING_DEG,
  sampleTimeWindows,
} from './skydome'
import { observerFor, solarPositionSeries } from './solar'
import { PHOTON_CONVERSION_UMOL_PER_J } from './units'

export interface SimulationOptions {
  readonly subdivision: SkySubdivision
  readonly substepsPerHour: number
  readonly targetCellSizeM: Meters
  readonly parFraction: Fraction
  readonly backend: BackendKind
  readonly frameBudgetMs: number
  readonly passesPerFrame: number
  // extra accumulation targets on the shared direction set; each one costs accumulator writes
  // and zero extra visibility passes, but it is still opt-in so the preview pays nothing
  readonly windows: readonly TimeWindowSpec[]
}

export const PREVIEW_OPTIONS: Omit<SimulationOptions, 'backend'> = {
  subdivision: 'tregenza-mf1',
  substepsPerHour: 1,
  targetCellSizeM: 0.25 as Meters,
  parFraction: 0.45 as Fraction,
  frameBudgetMs: 8,
  passesPerFrame: 40,
  windows: [],
}

export const FINAL_OPTIONS: Omit<SimulationOptions, 'backend'> = {
  subdivision: 'reinhart-mf2',
  substepsPerHour: 4,
  targetCellSizeM: 0.12 as Meters,
  parFraction: 0.45 as Fraction,
  frameBudgetMs: 8,
  passesPerFrame: 40,
  windows: [MA_GROWING_SEASON_HOURS],
}

export interface SimulationResult {
  readonly raster: DliRaster
  readonly bedLight: readonly BedLight[]
  readonly elapsedMs: number
  /**
   * Which implementation of the solar geometry and the decomposition produced this.
   *
   * Recorded rather than assumed, because a build can ship with the compiled core and still not
   * use it: the wasm may be missing from the host, or fail to instantiate, and both of those
   * resolve quietly to the TypeScript by design. Somewhere in this codebase every number is
   * expected to be able to say where it came from, and after this change that provenance has a
   * second axis nobody had to think about before.
   */
  readonly physics: PhysicsImplementation
}

export const SEASONAL_PAR_HALF_WIDTH = 0.1

const SCENE_MARGIN_M = 5 as Meters
const MS_PER_HOUR = 3_600_000

// sub-step the sun geometry inside each hour while holding the hour's irradiance constant
// (the solar geometry document section 4.3); this removes the pitch-scale banding that hourly sampling produces
const substeppedTimestamps = (utcMillis: Float64Array, substeps: number): Float64Array => {
  const steps = Math.max(1, Math.trunc(substeps))
  if (steps === 1) return utcMillis
  const out = new Float64Array(utcMillis.length * steps)
  for (let hour = 0; hour < utcMillis.length; hour += 1) {
    for (let k = 0; k < steps; k += 1) {
      out[hour * steps + k] = at(utcMillis, hour) + (k * MS_PER_HOUR) / steps
    }
  }
  return out
}

export const runSimulation = async (
  site: Site,
  plot: GardenPlot,
  weather: TmySeries,
  options: SimulationOptions,
  onProgress: (progress: AccumulationProgress) => void,
): Promise<SimulationResult> => {
  const started = Date.now()
  /*
    Installed here and not only at the page's entry point because the bake runs in a Worker, which
    has its own copy of every module and so its own empty `core.ts`. Awaited rather than fired off
    because until a core is installed there is no implementation of the physics at all, and
    `requirePhysicsCore` would refuse the solar geometry below
  */
  await ensurePhysicsCore(import.meta.env)
  const observer = observerFor(site)

  const hourlyPosition = solarPositionSeries(weather.utcMillis, observer, 'nrel-spa')
  const hasComponents = weather.decomposition !== 'passthrough' || weather.dniWM2.some((v) => v > 0)
  const resolved = decompose(weather, hourlyPosition, selectDecompositionModel(hasComponents, 60))

  const geometryPosition = solarPositionSeries(
    substeppedTimestamps(weather.utcMillis, options.substepsPerHour),
    observer,
    'nrel-spa',
  )
  const binning = {
    substepsPerHour: options.substepsPerHour,
    binningDeg: DEFAULT_SUN_BINNING_DEG as Degrees,
  }
  const windowSampling = sampleTimeWindows(
    resolved,
    geometryPosition,
    options.windows,
    site.location.longitudeDeg as unknown as Degrees,
  )
  const skies = cumulativeSkySet(
    resolved,
    geometryPosition,
    options.subdivision,
    binning,
    windowSampling,
  )
  const monthlySkies = skies.monthly
  const sky = annualFromMonthly(monthlySkies)

  const extent = sceneExtent(
    plot.arrays,
    plot.beds.map((bed) => bed.footprint),
    SCENE_MARGIN_M,
    plot.boundary.exterior,
  )
  const grid = gridForExtent(extent, options.targetCellSizeM)
  // the diffuse half of the daylight-coefficient factorisation needs time-invariant geometry,
  // so a tracking array's sky-patch visibility is baked at its peak-elevation pose
  let peak = 0
  for (let i = 1; i < hourlyPosition.count; i += 1) {
    if (
      at(hourlyPosition.geometricElevationDeg, i) > at(hourlyPosition.geometricElevationDeg, peak)
    ) {
      peak = i
    }
  }
  const peakMillis = (at(weather.utcMillis, peak) || Date.now()) as EpochMillis
  const snapshot = panelSnapshot(
    plot.arrays,
    peakMillis,
    at(hourlyPosition.geometricElevationDeg, peak) as Degrees,
    at(hourlyPosition.azimuthDeg, peak) as Degrees,
  )
  // a drawn house or tree does not move with the sun, so its quads join every pose the panels take
  const drawn = plot.obstructions.flatMap(obstructionQuads)
  // null unless a deciduous tree is drawn, so a plot with none bakes with no leaf-season variant at
  // all; computed here, off the site, so the memo (worker/client.ts) stays keyed on it
  const hasDeciduousTree = plot.obstructions.some((o) => o.kind === 'tree' && !o.evergreen)
  const leafOnMonths = hasDeciduousTree ? leafOnMonthsFor(site, weather) : null

  // the beam half does not: a sun-direction bin fixes the sun position, hence the tracker
  // rotation, so each beam pass can be posed for its own bin at no extra pass cost
  const tracking = plot.arrays.some((array) => array.tracker.mode !== 'fixed')
  const posed = new Map<number, readonly Occluder[]>()
  const beamPanels = tracking
    ? (index: number): readonly Occluder[] => {
        const cached = posed.get(index)
        if (cached !== undefined) return cached
        const bin = sky.sunDirections[index]
        if (bin === undefined) return [...snapshot.panels, ...drawn]
        const panels = panelSnapshot(
          plot.arrays,
          peakMillis,
          (Math.asin(Math.max(-1, Math.min(1, bin.z))) * RAD_TO_DEG) as Degrees,
          (Math.atan2(bin.x, bin.y) * RAD_TO_DEG) as Degrees,
        ).panels
        const withDrawn = [...panels, ...drawn]
        posed.set(index, withDrawn)
        return withDrawn
      }
    : null

  const backend = await createBackendAsync(options.backend)
  const request = {
    grid,
    sky,
    monthlySkies,
    windowSkies: skies.windows,
    leafOnMonths,
    passesPerFrame: options.passesPerFrame,
    frameBudgetMs: options.frameBudgetMs,
  }
  // the reference stays the open sky (openSkyAccumulation below), so a house or tree's shade
  // compounds with the panels' in the shade ratio the same way the surroundings' share does in
  // `shadedBySurroundings` (Record 26)
  const underArray = await backend.accumulate(
    { ...request, panels: [...snapshot.panels, ...drawn], beamPanels },
    onProgress,
  )
  backend.dispose()
  const openSky = openSkyAccumulation(grid, sky, monthlySkies, skies.windows)

  const quality: RasterQuality = {
    subdivision: options.subdivision,
    sunDirectionCount: sky.sunDirections.length,
    substepsPerHour: options.substepsPerHour,
    parFraction: options.parFraction,
    photonConversionUmolPerJ: PHOTON_CONVERSION_UMOL_PER_J,
    interreflectionApplied: false,
    seasonalParHalfWidthFraction: SEASONAL_PAR_HALF_WIDTH as Fraction,
  }
  const moduleReflectance = plot.arrays[0]?.module.rearReflectance ?? (0.05 as Fraction)
  const raster = applyInterreflection(
    dliRasterFromAccumulation(grid, underArray, openSky, quality, skies.sampling),
    groundAlbedoOf(plot.groundCover),
    moduleReflectance,
  )

  return {
    raster,
    bedLight: plot.beds.map((bed) => bedLight(raster, bed.id, bed.footprint)),
    elapsedMs: Date.now() - started,
    physics: physicsImplementation(),
  }
}
