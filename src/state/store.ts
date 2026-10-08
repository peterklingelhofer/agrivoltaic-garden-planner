import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'
import {
  loadCompanionRules,
  loadRotationConstraints,
  partitionCompanionRules,
} from '../data/companions'
import { loadCropCatalog } from '../data/crops'
import { utcOffsetHoursFor } from '../data/geocode'
import { fetchRetailPrice, usStateOf } from '../data/retail-price'
import { resolveSite, SITE_PARTS } from '../data/site'
import { UpstreamError } from '../data/http'
import { loadTekRules } from '../data/tek'
import { DEFAULT_COMPATIBILITY_WEIGHTS } from '../recommend/compatibility'
import { zoneReason } from '../recommend/layout'
import {
  calendarFor,
  calendarSowDay,
  derivePlanting,
  plantingIdFor,
  type PlanRefusal,
} from '../recommend/planting'
import { DEFAULT_WEIGHTS } from '../recommend/stages/rank'
import {
  DEFAULT_MAX_SUGGESTIONS,
  emptyPreferences,
  preferredCropIdsOf,
  suggestPolycultures,
  withAmbition,
} from '../recommend/suggest'
import { exposureInForce, shadedBySurroundings } from '../recommend/surroundings'
import { bedLight as bedLightOf } from '../sim/aggregate'
import { checkAllRegimes } from '../sim/compliance'
import { equatorFacingAzimuth } from '../sim/geometry'
import { FINAL_OPTIONS, runSimulation, type SimulationOptions } from '../sim/pipeline'
import { chainOptionsFor } from '../sim/pv/chain'
import { NO_ARRAY_ENERGY_RATIO } from '../sim/pv/ler'
import { pvEnergyReport } from '../sim/pv/report'
import { clearnessIndex, cloudCover } from '../sim/clearness'
import { groundSnowCover } from '../sim/snow'
import { extraterrestrialNormal, observerFor, spaPosition } from '../sim/solar'
import { utcOffsetMinutesAt } from '../sim/timezone'
import { createSimClient, type SimClient } from '../sim/worker/client'
import type { CompanionRule, PartitionedCompanionRules } from '../types/companion'
import type { Bed, GardenPlot } from '../types/garden'
import { albedoUnderSnow, DEFAULT_GROUND_COVER, groundAlbedoOf } from '../types/ground'
import type { ArrayId, BedId, CropId, ObstructionId, PlantingId } from '../types/ids'
import type { Banded } from '../types/band'
import type { BedLight, DliRaster } from '../types/light'
import type {
  BedLightSummary,
  CandidateArchetype,
  DesignScenario,
  LightZoneKind,
} from '../types/onboarding'
import type { CropPreference, PolycultureSuggestion } from '../types/polyculture'
import type { PvArray } from '../types/pv'
import type { RecommendationSet } from '../types/recommend'
import { epochMillis, type DayOfYear, type EpochMillis, type Fraction } from '../types/units'

import { atCalendarYear, dayOfYearUtc } from './sun'
import { bedLightSummary } from './bed-light'
import { historyBeforeSeason, seasonYearOf, withoutPanels } from './counterfactual'
import {
  defaultSimulation,
  facesStartingDirection,
  makeBed,
  makeHouse,
  makeTree,
  nextBedIndex,
  soilForSite,
} from './defaults'
import { growingWindowOf } from './growing-window'
import { resetHistory, trackHistory } from './history'
import { codeOf, unit } from '../simulation/evidence'
import { simulateSeason } from '../simulation/season'
import { chooseYear, measuredSeasonYear, type SeasonYear, typicalYear } from '../simulation/year'
import { seasonBlocker, withSeason } from './simulation'
import { runDesignSuggestions } from './design-bridge'
import { loadExampleGarden } from './example'
import { withDerived } from './derive'
import { movedCorner, polygonAreaM2, polygonOf, untangledRing } from './geom'
import { lightGeometryKey, lightIsMissing, lightIsStale } from './light-freshness'
import {
  answersOf,
  cropsPerBedFor,
  plotForScenario,
  SEARCH_ANSWER_FIELDS,
  staleSearchAfter,
} from './onboarding'
import {
  debounce,
  defaultDesign,
  detectStorage,
  loadDesign,
  removeDesign,
  sameDesign,
  snapshotDesign,
  writeDesign,
  WRITE_DELAY_MS,
  type PersistedDesign,
} from './persist'
import { CALENDAR_UNAVAILABLE, runRecommendations } from './recommend-bridge'
import { attempt, attemptAsync, messageOf, unavailableMessage } from './safe'
import {
  failed,
  idle,
  loading,
  ready,
  type AppState,
  type AsyncState,
  type GardenGeneration,
  type GeneratedBed,
  type GeneratedBedSuggestions,
  type HoverTarget,
  type OverlayPlayback,
  type OverlaySlice,
} from './slices'
import type { LatLon } from '../types/geo'

/**
 * The day the scene opens on: July 23, 2024, day 205, at local noon.
 *
 * Fixed, so the scene is identical on every machine and every day, which
 * the visual baselines depend on. Day 205 is chosen over the June solstice: the solstice is
 * the right answer to a question nobody opening this app is asking: it's the longest day, but it's
 * also early enough in the season that half the beds are still bare earth. Late July is when a
 * planted garden looks like one, after the summer crops have filled in and before the harvests
 * start emptying the beds again, so the first thing a new user sees is the thing the app is for
 */
export const DEFAULT_TIME = epochMillis(Date.UTC(2024, 6, 23, 16, 0, 0))

/**
 * The real day, read by the surfaces that answer "what do I do now".
 *
 * `timeUtcMillis` is a viewing control, a slider for dragging the sun around the sky, and it starts
 * life at a fixed day in 2024 so the scene is identical on every machine and every day, which the
 * visual baselines depend on. An agenda dated from it would open "What to do next" on the same date
 * in July no matter what the actual date was.
 *
 * So the clock splits in two. The scene keeps its fixed day and stays reproducible, while the
 * calendar reads the day it actually is. Kept in the store, so a test can hold the day still,
 * which is the same reason every other clock read in this file goes through a value and none of
 * them calls `Date.now` directly
 */
export const todayMillis = (): EpochMillis => epochMillis(Date.now())

const DEFAULT_SIM_OPTIONS: SimulationOptions = { ...FINAL_OPTIONS, backend: 'webgl2-shadowmap' }

export const ENERGY_NEEDS_SITE =
  'No site or weather yet. Look up the place first: the electricity is computed against a typical weather year for it'

export const ENERGY_NEEDS_ARRAY = 'No array yet. Add one first'

export const SUGGESTION_NEEDS_RANKING =
  'No ranking for this bed yet, and suggestions are built from one. Look up the place, draw a bed, compute the light, then rank the crops'

export const SUGGESTION_NEEDS_LIGHT =
  'No light computed for this bed yet. Compute the light first: the shade is what tells two crops apart'

export const SUGGESTION_NEEDS_ENERGY =
  'A polyculture is scored on the land equivalent ratio, which counts the electricity from the panels. Compute the annual energy first'

let client: SimClient | null = null
let clientFailure: string | null = null
let search: SimClient | null = null
let searchFailure: string | null = null
/** The last design the writer has seen, so only an authored edit schedules a write */
let lastSeen: PersistedDesign | null = null
let runToken = 0
let recommendToken = 0
let designToken = 0
let noPanelsToken = 0
/** The place a retail price was asked for, so a slow answer never lands on the place after it */
let priceToken = 0
/** The lookup in flight. An earlier one that lands after a later one is dropped */
let siteToken = 0

const simClient = (): SimClient | null => {
  if (client || clientFailure) return client
  const created = attempt(createSimClient)
  if (created.ok) client = created.value
  else clientFailure = created.message
  return client
}

/**
 * A second client, for the guided search only, and the reason is `run`'s first act: it calls
 * `cancelAll`, because one client is single-flight by construction. Share it with the editor and a
 * grower who runs the light check while the layouts are being computed kills their own search with
 * "simulation superseded", which names nothing they did. Two clients is two workers and one more
 * memo, which is the cheaper of the two prices
 */
const designClient = (): SimClient | null => {
  if (search || searchFailure) return search
  const created = attempt(createSimClient)
  if (created.ok) search = created.value
  else searchFailure = created.message
  return search
}

let noPanelsWorker: SimClient | null = null
let noPanelsWorkerFailure: string | null = null

/**
 * A third client, for "Compare with no panels" alone, and for the same reason `designClient` has
 * its own: `SimClient.run` cancels whatever else is pending on the client it is called on, so a
 * comparison bake sharing the editor's client could cancel a grower's own light run out from under
 * them, wiping the REAL raster and bed light with a "simulation superseded" error that names
 * nothing they did. A third worker and a third memo is the same cheap price `designClient` pays for
 * an identical reason
 */
const noPanelsClient = (): SimClient | null => {
  if (noPanelsWorker || noPanelsWorkerFailure) return noPanelsWorker
  const created = attempt(createSimClient)
  if (created.ok) noPanelsWorker = created.value
  else noPanelsWorkerFailure = created.message
  return noPanelsWorker
}

type DataOnly<T> = {
  [K in keyof T as T[K] extends (...args: never[]) => unknown ? never : K]: T[K]
}

const storage = detectStorage()
const restored = loadDesign(storage)

const initialData = (): DataOnly<AppState> => ({
  ...defaultDesign(),
  // not carried in the saved design, unlike the bed and array selection beside it: see
  // PERSISTED_KEYS in persist.ts
  selectedObstructionId: null as ObstructionId | null,
  site: idle(),
  weather: idle(),
  years: [],
  seasonYears: null,
  siteRetryAt: null,
  sitePending: [],
  retailPrice: null,
  simulationNotice: null,
  sweeping: false,
  overlayOnSeasons: false,
  widePlan: false,
  noPanels: idle(),
  options: DEFAULT_SIM_OPTIONS,
  progress: null,
  raster: idle(),
  bedLight: [],
  bedLightSubdivision: null,
  lightGeometry: null,
  compliance: [],
  energy: idle(),
  catalog: idle(),
  sets: idle(),
  calendars: idle(),
  planRefusals: [],
  companionRules: idle(),
  folklore: [],
  rotationConstraints: [],
  tekRules: idle(),
  autoRun: true,
  autoRunQueued: false,
  ranking: false,
  showAllCrops: false,
  suggestions: idle(),
  mode: 'select' as const,
  // the questions, on a first visit with nothing saved: the column is what makes a garden, and
  // on a phone the garden it would show is the example. A returning grower opens on their own
  surface: restored.design === null ? ('edit' as const) : ('garden' as const),
  draft: [],
  timeUtcMillis: DEFAULT_TIME,
  todayUtcMillis: todayMillis(),
  dragging: false,
  carrying: null,
  dropped: null,
  storage: restored.status,
  example: 'absent' as const,
  previewPlot: null as GardenPlot | null,
  overlayPlayback: null as OverlayPlayback | null,
  hovered: null as HoverTarget | null,
  previewArchetype: null as CandidateArchetype | null,
  exampleProvenance: null,
  exampleNoticeDismissed: false,
  onboarding: {
    step: 'location' as const,
    designs: idle(),
    progress: null,
    appliedArchetype: null,
  },
  generated: null,
  generationUndo: null,
  planting: false,
})

// immer's Draft<T> rewrites every readonly array in the frozen contract types, so recipes see a
// shallow-mutable view instead: the contract shapes stay intact and immer still shares structure
type MutableState = { -readonly [K in keyof AppState]: AppState[K] }
type ImmerSet = (recipe: (state: never) => void) => void
type Setter = (recipe: (state: MutableState) => void) => void

const asSetter =
  (set: ImmerSet): Setter =>
  (recipe) =>
    set(recipe as (state: never) => void)

const patchPlot = (s: MutableState, patch: (plot: GardenPlot) => GardenPlot): void => {
  if (s.plot) s.plot = patch(s.plot)
}

/**
 * Each bed's light read off the raster on screen again, dimmed by the surroundings answer as it
 * now stands. Only for the arrangement that raster was baked over: a bed moved since then is
 * the next bake's to read, and that bake applies the same answer when it lands
 */
const rederiveBedLight = (s: MutableState): void => {
  if (s.raster.status !== 'ready' || s.plot === null) return
  if (s.lightGeometry !== lightGeometryKey(s.plot)) return
  const raster = s.raster.value
  const exposure = exposureInForce(s.plot.obstructions, s.answers.exposure)
  s.bedLight = s.plot.beds.map((bed) =>
    shadedBySurroundings(bedLightOf(raster, bed.id, bed.footprint), exposure),
  )
  s.bedLightSubdivision = raster.quality.subdivision
}

/**
 * A boundary edit, which is a plot size edit: the search laid its candidates out in the old
 * extent, so a finished search is dropped, exactly as `answerOnboarding` drops
 * one when an answer the search reads moves
 */
const patchBoundary = (s: MutableState, patch: (plot: GardenPlot) => GardenPlot): void => {
  patchPlot(s, patch)
  if (s.onboarding.designs.status === 'ready') s.onboarding = { ...s.onboarding, designs: idle() }
}

/** What every panel means by "this bed": the selection, falling back to the only one there is */
export const selectedBedOf = (state: AppState): Bed | null =>
  state.plot?.beds.find((bed) => bed.id === state.selectedBedId) ?? state.plot?.beds[0] ?? null

/** The pair evaluator re-partitions, so it's handed the flat list the loader produced */
const flatRules = (rules: PartitionedCompanionRules): readonly CompanionRule[] => [
  ...rules.scorable,
  ...rules.experimental,
  ...rules.folklore,
]

const patchBed = (s: MutableState, id: BedId, patch: (bed: Bed) => Bed): void => {
  patchPlot(s, (plot) => ({
    ...plot,
    beds: plot.beds.map((bed) => (bed.id === id ? patch(bed) : bed)),
  }))
}

/**
 * The regime checks over the window the state gives, and none when a check throws. One place
 * computes them. The window is read inside the attempt too, so a site with no frost curve
 * leaves the checks empty, without throwing out of a store action
 */
const complianceOf = (
  plot: GardenPlot,
  raster: DliRaster,
  state: AppState,
): ReturnType<typeof checkAllRegimes> => {
  const checks = attempt(() =>
    checkAllRegimes({ plot, raster, growingWindow: growingWindowOf(state) }),
  )
  return checks.ok ? checks.value : []
}

/**
 * The checks again over the window the site gives now, for a raster already in hand: the
 * example's raster is on screen before its town resolves, and the risk percentile moves the
 * window without a bake
 */
const recheckCompliance = (set: Setter, get: () => AppState): void => {
  const state = get()
  if (state.raster.status !== 'ready' || state.plot === null) return
  const compliance = complianceOf(state.plot, state.raster.value, state)
  set((s) => {
    s.compliance = compliance
  })
}

const runBake = async (
  options: SimulationOptions,
  set: Setter,
  get: () => AppState,
): Promise<void> => {
  const state = get()
  const plot = state.plot
  if (!plot || state.site.status !== 'ready' || state.weather.status !== 'ready') {
    set((s) => {
      s.raster = failed('No site or weather yet. Look up the place before computing the light')
    })
    return
  }
  const active = simClient()
  if (!active) {
    set((s) => {
      s.raster = failed(unavailableMessage('simulation', clientFailure ?? 'no worker'))
    })
    return
  }
  runToken += 1
  const token = runToken
  const site = state.site.value
  const weather = state.weather.value
  set((s) => {
    s.options = options
    s.raster = loading()
    s.progress = null
  })
  const result = await attemptAsync(() =>
    active.run(site, plot, weather, options, (progress) => {
      if (token !== runToken) return
      set((s) => {
        s.progress = progress
      })
    }),
  )
  if (token !== runToken) return
  if (!result.ok) {
    const message = unavailableMessage('simulation', result.message)
    set((s) => {
      s.progress = null
      s.raster = failed(message)
      s.bedLight = []
      s.bedLightSubdivision = null
      s.compliance = []
      s.lightGeometry = null
    })
    return
  }
  const raster = result.value.raster
  const bedLight = result.value.bedLight
  const compliance = complianceOf(plot, raster, get())
  set((s) => {
    s.progress = null
    s.raster = ready(raster)
    // the surroundings answer as it stands when the bake lands, after any change made mid-bake:
    // the raster is the panels' shade alone, and every bed figure carries the answer on top,
    // unless the plot this run was handed already carries a house, which answers it instead
    const exposure = exposureInForce(plot.obstructions, s.answers.exposure)
    s.bedLight = bedLight.map((light) => shadedBySurroundings(light, exposure))
    s.bedLightSubdivision = raster.quality.subdivision
    s.compliance = compliance
    // stamped from the plot this run was handed, since an edit made while the bake was in flight
    // would already have moved `s.plot` on: the answer belongs to the geometry it was computed
    // over, and saying otherwise would mark a stale field fresh
    s.lightGeometry = lightGeometryKey(plot)
  })
}

/**
 * The pauses between automatic retries of a failed lookup, and how many there are.
 *
 * A minute first, then twice as long twice, then nothing: a service that is down for seven
 * minutes is down, and a page that keeps asking is the load it is asking to be spared. When the
 * upstream said when it will answer again, that is the pause instead: Open-Meteo refusing for
 * the hour clears its counter in the first minute after the hour, and three retries inside the
 * hour were three more requests against a full counter, each one restarting the sentence that
 * told the reader to wait a minute. A manual press at any point is a fresh lookup and cancels
 * whatever was scheduled, through `siteRetryAt`
 */
const SITE_RETRY_MS: readonly number[] = [60_000, 120_000, 240_000]

/** A search asked for while no lookup has run or landed. The site step says what stopped it */
const SITE_UNRESOLVED = 'The place has to be looked up before the layouts can be compared'
let siteRetries = 0

const scheduleSiteRetry = (
  location: LatLon,
  label: string,
  countryCode: string | null,
  set: Setter,
  get: () => AppState,
  afterMs: number | null,
): void => {
  const delay = afterMs ?? SITE_RETRY_MS[siteRetries]
  if (delay === undefined) return
  siteRetries += 1
  const at = Date.now() + delay
  set((s) => {
    s.siteRetryAt = at
  })
  setTimeout(() => {
    const state = get()
    // a later lookup, manual or scheduled, took over, or the place resolved another way
    if (state.siteRetryAt !== at || state.site.status !== 'error') return
    void state.resolveSite(location, label, countryCode)
  }, delay)
}

/** One bed to plant, with the light it stands in: a placement the search made, or a bed as it is */
interface BedToPlant {
  readonly bedId: BedId
  readonly label: string
  readonly zone: LightZoneKind
  readonly summary: BedLightSummary
  readonly reason: string
  readonly light: BedLight
}

interface PlantingRun {
  readonly beds: readonly BedToPlant[]
  /** The per-bed ranking the crops are picked out of, from the `recommend` this run awaited */
  readonly sets: readonly RecommendationSet[]
  /**
   * The electricity partial the combinations are scored on: a zero band with no panels, and null
   * where there are panels and no energy figure yet, which leaves every bed empty with the reason
   */
  readonly energyRatio: Banded<Fraction> | null
  readonly archetype: CandidateArchetype | null
  readonly explanation: string
  /** What carrying panels cost the plot against the open sky, where a search measured it */
  readonly plotLostToShade: readonly CropId[]
  readonly layoutRefusals: readonly string[]
}

export const GENERATION_NEEDS_SITE =
  "The beds were placed and nothing was planted in them. Crops are ranked against a place, and this one hasn't been looked up yet"

export const PLANTED_AS_IT_STANDS = 'Planted from the light as it stands, bed by bed'

const NOTHING_FITS = (label: string): string =>
  `Nothing in the catalog suits ${label} at the light and soil it has, so it was left empty`

/**
 * A planting waits for the bake wherever the light is missing or stale, so it never rests on a
 * raster the garden has since outgrown. `runFinal` memoizes on the plot, so a bake already
 * landed for this arrangement costs nothing to ask for again
 */
const settleLight = async (get: () => AppState): Promise<void> => {
  const state = get()
  if (lightIsMissing(state) || lightIsStale(state)) await state.runFinal()
}

/**
 * The electricity term the combinations are scored on. With no panels there is no electricity
 * and the term is a zero band, which is what the search's own no-array control scores on: a
 * garden with no panels is still a garden, and a press that refused to plant one was silent on
 * the one plot the "No panels at all" card produces
 */
const energyRatioFor = (get: () => AppState): Banded<Fraction> | null => {
  const state = get()
  if (state.plot === null || state.plot.arrays.length === 0) return NO_ARRAY_ENERGY_RATIO
  if (state.energy.status !== 'ready') state.runEnergy()
  const energy = get().energy
  return energy.status === 'ready' ? energy.value.energyRatio : null
}

/**
 * The whole garden, in one step and through the actions the editor already has.
 *
 * Beds come with the light they stand in, the ranking comes from the pipeline the crop step
 * uses, and every planting is written by `applySuggestion`, which derives through
 * `derivePlanting` and refuses anything it can't derive. No second write path exists
 * here, and nothing is quietly dropped: a bed that gets nothing says why.
 *
 * Shared by a guided apply and by "Plant every bed": one code path, so the two can't plant
 * differently
 */
const plantBeds = (run: PlantingRun, set: Setter, get: () => AppState): void => {
  const finish = (
    beds: readonly GeneratedBed[],
    plantRefusals: readonly PlanRefusal[],
    notes: readonly string[],
    suggestions: readonly GeneratedBedSuggestions[] = [],
  ): void => {
    set((s) => {
      s.planRefusals = plantRefusals
      const generated: GardenGeneration = {
        archetype: run.archetype,
        explanation: run.explanation,
        beds,
        plantingCount: beds.reduce((total, bed) => total + bed.cropIds.length, 0),
        plotLostToShade: run.plotLostToShade,
        layoutRefusals: [...run.layoutRefusals, ...notes],
        plantRefusals,
        suggestions,
      }
      s.generated = generated
    })
  }
  const emptyBed = (placement: BedToPlant, lostToShade: readonly CropId[] = []): GeneratedBed => ({
    bedId: placement.bedId,
    label: placement.label,
    zone: placement.zone,
    summary: placement.summary,
    reason: placement.reason,
    cropIds: [],
    lostToShade,
  })

  const state = get()
  const plot = state.plot
  if (plot === null || state.site.status !== 'ready') {
    finish(
      run.beds.map((placement) => emptyBed(placement)),
      [],
      [GENERATION_NEEDS_SITE],
    )
    return
  }
  const energyRatio = run.energyRatio
  if (energyRatio === null) {
    finish(
      run.beds.map((placement) => emptyBed(placement)),
      [],
      [`${SUGGESTION_NEEDS_ENERGY}. ${asyncMessage(state.energy) ?? ''}`.trim()],
    )
    return
  }
  const site = state.site.value
  const catalog = state.catalog.status === 'ready' ? state.catalog.value : []
  const sets = run.sets
  const maxCropsPerBed = cropsPerBedFor(state.answers.objective)
  // the growing answer leans the combinations toward what was asked for, under the grower's
  // own explicit entries: see `withAmbition`
  const preferences = withAmbition(state.preferences, state.answers.ambition, catalog)

  /**
   * What each bed gave up by standing where it does. The comparison is the brightest bed of this
   * same plot: it needs no second bake, it works the
   * same on a garden drawn by hand, and it's the question a grower asks looking at two beds two
   * meters apart. A crop the site refuses outright is refused in the bright bed too, so
   * subtracting that bed's own light-gate list leaves only what the shade cost
   */
  const lightGateRefused = (bedId: BedId): ReadonlySet<string> =>
    new Set(
      (sets.find((entry) => entry.bedId === bedId)?.ranked ?? [])
        .filter(
          (entry) =>
            entry.outcome.verdict === 'excluded' && entry.outcome.limiting.stage === 'light-gate',
        )
        .map((entry) => entry.cropId as string),
    )
  const brightest = [...run.beds].sort(
    (a, b) => b.summary.meanGrowingSeasonDli - a.summary.meanGrowingSeasonDli,
  )[0]
  const brightestRefused =
    brightest === undefined ? new Set<string>() : lightGateRefused(brightest.bedId)
  const lostToShadeIn = (placement: BedToPlant): readonly CropId[] =>
    placement.bedId === brightest?.bedId
      ? []
      : [...lightGateRefused(placement.bedId)]
          .filter((id) => !brightestRefused.has(id))
          .sort((a, b) => a.localeCompare(b))
          .map((id) => id as CropId)

  const beds: GeneratedBed[] = []
  const refusals: PlanRefusal[] = []
  const notes: string[] = []
  const carried: GeneratedBedSuggestions[] = []
  /*
    The combinations already planted, so no bed repeats another's when it has a different one that
    fits. Beds that read the same light have the same list, so if every bed took the first card of
    its own list, a four-bed plot would come back as the same three crops four times over: a garden
    of one dish. The second card is a near tie (the tie notes on every list say so), and a bed that
    grows something the next one doesn't is what a grower means by a garden
  */
  const planted = new Set<string>()
  const comboKey = (suggestion: { readonly cropIds: readonly CropId[] }): string =>
    [...suggestion.cropIds].sort((a, b) => a.localeCompare(b)).join('+')
  /*
    And the crops the grower said they like, placed somewhere. A preference is a weight in the
    combination score, small beside the agronomy on purpose, so pressing "sweet pepper" and then
    "basil" can make the pepper vanish from every bed: the top card in each bed no longer holds it.
    So each bed takes the best fitting combination that covers the most liked crops nobody has a bed
    for yet, which is the greedy reading of "I like these"
  */
  const liked = new Set<string>(
    get()
      .preferences.entries.filter((entry) => entry.kind === 'prefer' || entry.kind === 'require')
      .map((entry) => entry.cropId as string),
  )
  const unplacedLikes = (suggestion: { readonly cropIds: readonly CropId[] }): number =>
    suggestion.cropIds.filter((id) => liked.has(id as string)).length
  // and, between combinations that place the same number of liked crops, the one that repeats the
  // fewest crops already growing in another bed
  const used = new Set<string>()
  const repeats = (suggestion: { readonly cropIds: readonly CropId[] }): number =>
    suggestion.cropIds.filter((id) => used.has(id as string)).length
  const better = (suggestion: PolycultureSuggestion, chosen: PolycultureSuggestion): boolean =>
    unplacedLikes(suggestion) > unplacedLikes(chosen) ||
    (unplacedLikes(suggestion) === unplacedLikes(chosen) && repeats(suggestion) < repeats(chosen))
  for (const placement of run.beds) {
    const bed = plot.beds.find((entry) => entry.id === placement.bedId)
    const recommendations = sets.find((entry) => entry.bedId === placement.bedId)
    if (bed === undefined || recommendations === undefined) {
      notes.push(`${placement.label} was placed, but nothing was ranked for it, so it's empty`)
      beds.push(emptyBed(placement, lostToShadeIn(placement)))
      continue
    }
    const suggested = attempt(() =>
      suggestPolycultures({
        bed,
        arrays: plot.arrays,
        // the bed's own light, which is the whole reason it is where it is
        light: placement.light,
        site,
        catalog,
        frostPercentile: state.frostPercentile,
        recommendations,
        preferences,
        companionRules:
          state.companionRules.status === 'ready' ? flatRules(state.companionRules.value) : [],
        rotationConstraints: state.rotationConstraints,
        tekRules: state.tekRules.status === 'ready' ? state.tekRules.value : [],
        energyRatio,
        weights: state.compatibilityWeights,
        maxCropsPerBed,
        // enough cards for every bed to take a different one, with slack for the cards that
        // grow into the same combination: eleven beds reading the same light were handed five
        // combinations, and six of them planted the first over again (measured at 11 beds:
        // 5 cards 324 ms and 6 repeats, 14 cards 750 ms and none)
        maxSuggestions: Math.max(DEFAULT_MAX_SUGGESTIONS, run.beds.length + 3),
        wildlife: { ...state.wildlife, botanicalArea: site.botanicalArea },
      }),
    )
    if (!suggested.ok) {
      notes.push(`${placement.label}: ${suggested.message}`)
      beds.push(emptyBed(placement, lostToShadeIn(placement)))
      continue
    }
    carried.push({ bedId: placement.bedId, label: placement.label, set: suggested.value })
    for (const refusal of suggested.value.refused) {
      refusals.push({ bedId: placement.bedId, cropId: refusal.cropId, reason: refusal.reason })
    }
    const fitting = suggested.value.suggestions.filter(
      (suggestion) => suggestion.fits && !planted.has(comboKey(suggestion)),
    )
    const best =
      fitting.reduce<PolycultureSuggestion | undefined>(
        (chosen, suggestion) =>
          chosen === undefined || better(suggestion, chosen) ? suggestion : chosen,
        undefined,
      ) ?? suggested.value.suggestions[0]
    if (best === undefined) {
      notes.push(NOTHING_FITS(placement.label))
      beds.push(emptyBed(placement, lostToShadeIn(placement)))
      continue
    }
    planted.add(comboKey(best))
    for (const id of best.cropIds) {
      liked.delete(id as string)
      used.add(id as string)
    }
    get().applySuggestion(best)
    refusals.push(...get().planRefusals)
    beds.push({
      ...emptyBed(placement, lostToShadeIn(placement)),
      cropIds:
        get()
          .plot?.beds.find((entry) => entry.id === placement.bedId)
          ?.plantings.map((planting) => planting.cropId) ?? [],
    })
  }
  finish(beds, refusals, notes, carried)
}

/**
 * The standing data every planting reads, fetched here, then the ranking.
 *
 * The wizard can reach a scenario without the editor ever resolving the site, because the
 * design engine resolves one of its own. The ranking needs the editor's, on the location the
 * answers named, so it's fetched here, where a missing site can't fail silently. The ranking goes
 * through the editor's own `recommend`, which is what carries the wildlife answers and the
 * region they are judged against, and what comes back is what is planted from: `sets` on the
 * store can already belong to a later run by the time this reads it
 */
const rankForPlanting = async (
  get: () => AppState,
): Promise<{
  readonly sets: readonly RecommendationSet[]
}> => {
  await get().ensureSite()
  if (get().catalog.status !== 'ready') await get().loadCatalog()
  if (get().companionRules.status !== 'ready') await get().loadEvidence()
  await settleLight(get)
  const sets = await get().recommend()
  return { sets: sets ?? [] }
}

const generateGarden = async (
  scenario: DesignScenario,
  set: Setter,
  get: () => AppState,
): Promise<void> => {
  const layout = scenario.layout
  const ranked = await rankForPlanting(get)
  plantBeds(
    {
      beds: layout.beds,
      sets: ranked.sets,
      // the same electricity partial this scenario was scored on
      energyRatio: scenario.energyRatio,
      archetype: scenario.candidate.archetype,
      explanation: layout.explanation,
      // measured by the search against its own open-sky control, carried as is
      plotLostToShade: scenario.production.cropsLostToShade,
      layoutRefusals: layout.refusals,
    },
    set,
    get,
  )
}

/**
 * The zone a bed as it stands falls in, by the same shade reading the plants step prints: no
 * panels is even light everywhere, and under them a bed keeping most of its daylight is a gap
 */
const zoneOf = (summary: BedLightSummary, arrays: number): LightZoneKind =>
  arrays === 0 ? 'even-light' : summary.shadeRatio < 0.15 ? 'bright-gap' : 'shaded-band'

/** North by the same sign `growingWindowFor` in `data/crops.ts` mirrors a crop's own window on */
const isNorth = (latitudeDeg: number): boolean => latitudeDeg >= 0

/**
 * Six calendar months from this instant, read as a wall clock and moved whole months so the day
 * of the month survives it: July to December go back six months and January to June go forward
 * six, so the year this is ever asked to move within never changes. Where the target month is too
 * short for the day this started on, the day clamps to the target month's own last day: August 31
 * moves to February 29 in a leap year, the last day `Date.UTC` would otherwise roll past
 */
const sixMonthsOn = (millis: number): number => {
  const date = new Date(millis)
  const year = date.getUTCFullYear()
  const month = date.getUTCMonth()
  const targetMonth = month >= 6 ? month - 6 : month + 6
  const lastDayOfTargetMonth = new Date(Date.UTC(year, targetMonth + 1, 0)).getUTCDate()
  return Date.UTC(
    year,
    targetMonth,
    Math.min(date.getUTCDate(), lastDayOfTargetMonth),
    date.getUTCHours(),
    date.getUTCMinutes(),
    date.getUTCSeconds(),
    date.getUTCMilliseconds(),
  )
}

export const useAppStore = create<AppState>()(
  immer((rawSet, get) => {
    const set = asSetter(rawSet as ImmerSet)
    return {
      ...initialData(),
      ...(restored.design ?? {}),

      saveDesign: () => {
        scheduleWrite.cancel()
        const written = writeDesign(storage, snapshotDesign(get()), epochMillis(Date.now()))
        lastSeen = snapshotDesign(get())
        set((s) => {
          s.storage = written
        })
      },

      clearDesign: () => {
        scheduleWrite.cancel()
        const cleared = removeDesign(storage)
        const fresh = initialData()
        // the subscriber runs inside `set`, so the writer is told what is coming first:
        // forgetting the design must not write the default one straight back out
        lastSeen = snapshotDesign(fresh)
        // and the history forgets it too, told the same way. `FORGET_COST` promises that nothing
        // brings the design back, and an Undo that did would break the promise
        resetHistory(fresh)
        // a lookup still out would land on the fresh design and mark the place that was forgotten
        // ready over it, so it's superseded here, the way a later lookup supersedes an earlier one.
        // The price that lookup went on to ask for is dropped the same way
        siteToken += 1
        priceToken += 1
        set((s) => {
          Object.assign(s, fresh)
          s.storage = cleared
        })
      },

      /**
       * Puts the shipped example on screen, once, and only into a browser that holds no design
       * of its own. Nothing here is written to storage: `lastSeen` is told what is coming before
       * the state moves, so the writer sees the example arrive and stays quiet. The first edit
       * the visitor authors moves the design off the example and is saved exactly as any other
       */
      loadExample: async () => {
        // Deliberately NOT gated on the guided path being closed, though the two do open together
        // on a first load. The questions sit in the sidebar, so the example stays in view on the
        // scene and is the thing the first questions are asked over: an empty grid is the one state
        // a beginner can't read. It gives way on its own as soon as anything on screen is the
        // visitor's, which `showingExample` reads from the design itself
        if (restored.design !== null || get().example !== 'absent') return
        set((s) => {
          s.example = 'loading'
        })
        const loaded = await attemptAsync(loadExampleGarden)
        const example = loaded.ok ? loaded.value : null
        if (example === null) {
          set((s) => {
            s.example = 'absent'
          })
          return
        }
        // an edit made while the asset was in flight is the visitor's, and outranks the example
        if (!sameDesign(snapshotDesign(get()), startingDesign)) {
          set((s) => {
            s.example = 'absent'
          })
          return
        }
        lastSeen = example.design
        examplePlot = example.design.plot
        // over the fixed window until the example's own town resolves, which rechecks it
        const compliance =
          example.design.plot === null
            ? []
            : complianceOf(example.design.plot, example.raster, get())
        set((s) => {
          Object.assign(s, example.design)
          s.raster = ready(example.raster)
          s.bedLight = example.bedLight
          s.bedLightSubdivision = example.raster.quality.subdivision
          s.compliance = compliance
          // the arrangement the shipped raster was baked over, so an edit to the example reads as
          // stale and is computed again. Left null, the example's light would outlive every change
          // made on top of it, a whole applied layout included
          s.lightGeometry =
            example.design.plot === null ? null : lightGeometryKey(example.design.plot)
          s.timeUtcMillis = example.sceneTimeUtcMillis
          s.example = 'showing'
          s.exampleProvenance = example.provenance
        })
      },

      /**
       * Puts the notice away. The garden it described is untouched, which is the whole point of
       * this existing separately from `clearExample`
       */
      dismissExampleNotice: () =>
        set((s) => {
          s.exampleNoticeDismissed = true
        }),

      clearExample: () => {
        scheduleWrite.cancel()
        const fresh = defaultDesign()
        lastSeen = fresh
        examplePlot = null
        set((s) => {
          Object.assign(s, fresh)
          s.raster = idle()
          s.bedLight = []
          s.bedLightSubdivision = null
          s.lightGeometry = null
          s.compliance = []
          s.energy = idle()
          s.sets = idle()
          s.calendars = idle()
          s.planRefusals = []
          s.suggestions = idle()
          s.timeUtcMillis = DEFAULT_TIME
          s.example = 'cleared'
          s.exampleProvenance = null
          // a comparison names a season that no longer exists once `simulation` resets above
          s.noPanels = idle()
        })
      },

      resolveSite: async (location, label, countryCode = null) => {
        priceToken += 1
        const token = priceToken
        siteToken += 1
        const lookup = siteToken
        /*
          A new town typed over the shipped example is a grower starting their own garden, which is
          what the banner's own press does. Left showing, the example's beds, plantings and "This is
          an example garden for Amherst" would stay on screen under a heading that named
          Northampton, and the writer would go on treating the design as not the visitor's
        */
        const current = get()
        const samePlace =
          current.location.latitudeDeg === location.latitudeDeg &&
          current.location.longitudeDeg === location.longitudeDeg
        if (showingExample(current) && !samePlace) current.clearExample()
        set((s) => {
          /*
            A light field is a fact about one sky. `lightGeometryKey` reads the plot and nothing
            else, so a grower who typed a new town over a baked garden would keep the old town's
            light, ranking and all, with nothing saying so. The field goes back to idle when the
            place the site was resolved for changes, and `useAutoLight` works the new one out once
            the lookup lands. A lookup of the place already resolved (the example's own town at
            startup, "Look up these coordinates" over the same point) keeps what it has
          */
          const resolvedFor = s.site.status === 'ready' ? s.site.value.location : null
          if (
            resolvedFor !== null &&
            (resolvedFor.latitudeDeg !== location.latitudeDeg ||
              resolvedFor.longitudeDeg !== location.longitudeDeg)
          ) {
            s.raster = idle()
            s.progress = null
            s.bedLight = []
            s.bedLightSubdivision = null
            s.compliance = []
            s.lightGeometry = null
          }
          s.location = location
          s.locationLabel = label
          s.site = loading()
          s.weather = loading()
          // every part is out until it reports in
          s.sitePending = [...SITE_PARTS]
          s.years = []
          s.seasonYears = null
          // whichever retry was pending is superseded by this lookup
          s.siteRetryAt = null
          s.retailPrice = null
          s.energy = idle()
        })
        // the error itself and not only its sentence, because an upstream that refused for the
        // hour says so on the error and the retry below is scheduled off that
        const result = await resolveSite(location, label, null, countryCode, (part) => {
          // a part from an earlier lookup would shrink the list of the one on screen
          if (lookup !== siteToken) return
          set((s) => {
            // and one that lands after its own lookup failed finds the list already empty
            if (s.sitePending.includes(part)) {
              s.sitePending = s.sitePending.filter((pending) => pending !== part)
            }
          })
        }).then(
          (value) => ({ ok: true as const, value }),
          (error: unknown) => ({ ok: false as const, error }),
        )
        /*
          A later lookup took over while this one was in flight, so its answer is the place on
          screen and this one is simply dropped, without overwriting it. The boot lookup of the
          example's town and a search typed within seconds of opening can overlap this way, and if
          whichever finished last won, a visitor who typed Mumbai quickly would get Amherst's ground
          under Mumbai's weather, with a clock and a hardiness zone from the wrong hemisphere
        */
        if (lookup !== siteToken) return
        /*
          The pH copied onto untouched beds below is the store's own edit, and the writer can't
          tell it from the visitor's: left alone it would save the design 600 ms after the lookup
          landed, over a garden nobody had touched, and a notice that the browser's old design couldn't
          be read would become "Saved" before the visitor did anything. So the write the copy-in
          schedules is dropped unless an edit was already due, and the next real edit carries the pH
          out with it. `lastSeen` has moved on either way, so nothing is written twice
        */
        const due = scheduleWrite.pending()
        const before = snapshotDesign(get())
        set((s) => {
          // landed or failed, nothing is out any more
          s.sitePending = []
          if (result.ok) {
            s.site = ready(result.value.site)
            s.weather = ready(result.value.weather)
            s.years = result.value.years
            // and the years become sites as soon as they resolve: the seasons step
            // names each choice's year on its card, which it can't do from raw weather
            s.seasonYears = result.value.years.map((measured) =>
              measuredSeasonYear(result.value.site, measured),
            )
            /*
              A garden's wall clock holds its reading across a move: noon at the last place stays
              noon at this one. Before any place has resolved the clock reads the longitude's own
              hours, as the time panel prints it, and a lookup of the place already on screen
              moves nothing, so the example's baked scene time stays where it was baked
            */
            const priorLocation =
              current.site.status === 'ready'
                ? current.site.value.location
                : samePlace
                  ? null
                  : current.location
            const priorOffsetMinutes =
              current.site.status === 'ready'
                ? utcOffsetMinutesAt(
                    current.site.value.timezone,
                    s.timeUtcMillis,
                    current.site.value.utcOffsetHours * 60,
                  )
                : samePlace
                  ? null
                  : utcOffsetHoursFor(current.location) * 60
            if (priorLocation !== null && priorOffsetMinutes !== null) {
              /*
                A place across the equator from the last one opens the scene in its own summer.
                DEFAULT_TIME is July 23, midwinter south of the equator, and the scene draws every
                planting at its growth stage for the date, so a garden resolving there would
                otherwise open bare
              */
              const crossedEquator =
                isNorth(priorLocation.latitudeDeg) !==
                isNorth(result.value.site.location.latitudeDeg)
              // the wall clock reading right now, before the date moves: what the prior zone's
              // clock said at this instant, which the date move must still read afterward
              const priorLocalMillis = s.timeUtcMillis + priorOffsetMinutes * 60_000
              const movedLocalMillis = crossedEquator
                ? sixMonthsOn(priorLocalMillis)
                : priorLocalMillis
              const newOffsetMinutes = utcOffsetMinutesAt(
                result.value.site.timezone,
                // the moved date's own offset: a zone's daylight saving differs between July and
                // January, and reading the offset for the date this move started from would land
                // the clock an hour off exactly when the seasons actually differ
                crossedEquator ? movedLocalMillis : s.timeUtcMillis,
                result.value.site.utcOffsetHours * 60,
              )
              s.timeUtcMillis = epochMillis(movedLocalMillis - newOffsetMinutes * 60_000)
            }
            /*
              A typed pH is the grower's: the pH field's own `onChange` stamps 'user' the moment a
              visitor types a value, and that is the only mark this reads as told. Everything else
              follows the place, an untouched default and an earlier place's own reading alike, so
              searching a new town doesn't leave a bed showing the town before it
            */
            const soil = soilForSite(result.value.site)
            const stale = (bed: Bed): boolean =>
              bed.soil.sourceId !== 'user' &&
              (bed.soil.phUnits !== soil.phUnits || bed.soil.sourceId !== soil.sourceId)
            /*
              Never the example's beds: they're a baked design and stay exactly as shipped, and
              `showingExample` knows the example by the plot object's identity, so a plot rebuilt
              here would take the banner off the screen. Asked fresh at this moment, because at
              startup the lookup is under way before the example has
              finished loading. And only when a bed actually changes, for the same reason
            */
            if (!showingExample(get()) && (s.plot?.beds.some(stale) ?? false)) {
              patchPlot(s, (plot) => ({
                ...plot,
                beds: plot.beds.map((bed) =>
                  stale(bed)
                    ? {
                        ...bed,
                        soil: { ...bed.soil, phUnits: soil.phUnits, sourceId: soil.sourceId },
                      }
                    : bed,
                ),
              }))
            }
            /*
              The starting array faces south, which is away from the sun south of the equator, and
              a place that resolves there turns it to face the equator. Only an array still on
              one of the two starting directions is turned, so a direction somebody set by hand
              is never overwritten. The example's baked plot is left alone, for the reason given
              above. An array turns only when a direction actually changes, so a northern site
              rebuilds nothing
            */
            const facing = equatorFacingAzimuth(result.value.site.location.latitudeDeg)
            const turns = (array: PvArray): boolean =>
              array.tracker.mode === 'fixed' &&
              facesStartingDirection(array) &&
              array.tracker.surfaceAzimuthDeg !== facing
            if (!showingExample(get()) && (s.plot?.arrays.some(turns) ?? false)) {
              patchPlot(s, (plot) => ({
                ...plot,
                arrays: plot.arrays.map((array) =>
                  turns(array)
                    ? { ...array, tracker: { ...array.tracker, surfaceAzimuthDeg: facing } }
                    : array,
                ),
              }))
            }
          } else {
            /*
             * The upstream's own sentence, with no subsystem name added. `UpstreamError` carries
             * the plain sentence as its message, and this hands it straight through, so
             * `siteRequirement`'s own prefix is the only wording in front of it
             */
            s.site = failed(messageOf(result.error))
            s.weather = failed(messageOf(result.error))
          }
        })
        if (!due) scheduleWrite.cancel()
        // `loadExample` reads a moved design as the visitor's too, so a lookup that lands before
        // the example asset and rebuilds the plot would make the example bail as edited. The
        // starting design follows the lookup only when nothing else moved, so a real edit still
        // outranks the example
        if (sameDesign(before, startingDesign)) startingDesign = snapshotDesign(get())
        if (!result.ok) {
          scheduleSiteRetry(
            location,
            label,
            countryCode,
            set,
            get,
            result.error instanceof UpstreamError ? result.error.retryAfterMs : null,
          )
          return
        }
        recheckCompliance(set, get)
        siteRetries = 0
        /*
          And what electricity costs here, which is deliberately NOT waited on.

          The place resolving is what unblocks every panel in the sidebar, and the price is worth
          one readout at the bottom of the seasons step. Awaiting a third upstream here would let
          a slow or unconfigured EIA hold the whole app behind a dollar figure. So it lands late
          or never: `fetchRetailPrice` answers null for every failure of its own, and `attemptAsync`
          catches anything it didn't think of, because a promise nobody awaits that rejects takes
          the page with it. Off the US grid there is no series to ask for and nothing is sent
        */
        const stateCode = usStateOf(result.value.site.botanicalArea)
        if (stateCode === null) return
        void attemptAsync(() => fetchRetailPrice(stateCode, { signal: null })).then((priced) => {
          // a price for the place before last isn't a price for this one
          if (token !== priceToken) return
          set((s) => {
            s.retailPrice = priced.ok ? priced.value : null
          })
        })
      },

      /**
       * Looks up the place the app is ALREADY showing, once, if nothing has looked it up yet.
       *
       * Every surface that ranks crops, dates a sowing, balances water or counts kilowatt-hours
       * needs a resolved site, and a first paint can reach them without one. The shipped example
       * restores a baked garden but carries no site, since `PersistedDesign` holds a `location` but
       * no `site`, and a reload restores the plot and drops every derived slice. Left alone, the
       * toolbar would name a town and the scene would show a finished garden while the sidebar said
       * "No site resolved yet" over seven panels that refused to work.
       *
       * A location is never absent, so this never has to guess: `DEFAULT_LOCATION` seeds it and
       * the toolbar has been asserting it on screen the whole time. Looking it up is the app
       * agreeing with what it already says. No decision is made on the visitor's behalf, and
       * answering the location question replaces it the moment they do say.
       *
       * Only from `idle`, which is what makes it safe to call from anywhere: a failure stays
       * failed and is never retried on every render, and a resolved site is never re-fetched
       */
      ensureSite: async () => {
        if (get().site.status !== 'idle') return
        await get().resolveSite(get().location, get().locationLabel)
      },

      setLocation: (location, label) =>
        set((s) => {
          s.location = location
          s.locationLabel = label
        }),

      setFrostPercentile: (percentile) => {
        set((s) => {
          s.frostPercentile = percentile
        })
        recheckCompliance(set, get)
      },

      setPlot: (plot) =>
        set((s) => {
          s.plot = plot
          s.energy = idle()
        }),

      setBoundary: (boundary) =>
        set((s) => {
          patchBoundary(s, (plot) => ({ ...plot, boundary }))
        }),

      /**
       * The albedo is a term in the ground light as well as in the energy, so the light field
       * standing on screen was computed for a different ground once this changes.
       * `lightGeometryKey` already carries the cover, so the staleness notice raises itself. The
       * energy report has no such key and is dropped here, exactly as `setPlot` drops it
       */
      setGroundCover: (cover) =>
        set((s) => {
          patchPlot(s, (plot) => ({ ...plot, groundCover: cover }))
          s.energy = idle()
        }),

      moveBoundaryVertex: (index, position) =>
        set((s) => {
          patchBoundary(s, (plot) => ({
            ...plot,
            boundary: {
              ...plot.boundary,
              exterior: movedCorner(plot.boundary.exterior, index, position),
            },
          }))
        }),

      upsertBed: (bed) =>
        set((s) => {
          const next = { ...bed, areaM2: polygonAreaM2(bed.footprint) }
          patchPlot(s, (plot) => ({
            ...plot,
            beds: plot.beds.some((b) => b.id === bed.id)
              ? plot.beds.map((b) => (b.id === bed.id ? next : b))
              : [...plot.beds, next],
          }))
        }),

      removeBed: (id) =>
        set((s) => {
          patchPlot(s, (plot) => ({ ...plot, beds: plot.beds.filter((b) => b.id !== id) }))
          if (s.selectedBedId === id) s.selectedBedId = null
        }),

      /*
       * A planting moves what the ranking reads, exactly as a soil or geometry edit does, and
       * `autoRunKey` picks that up. It moves neither the light field nor the electricity term,
       * so the annual bake and the PV energy chain are both left standing.
       *
       * A planting's id is its bed, its crop and its sow day, so the same crop sown the same day
       * is the same planting and adding it again is more plants of it, kept in its place in the
       * list. Replacing it outright instead would let adding one cucumber to a bed already
       * carrying seventeen sown that day wipe out sixteen of them
       */
      addPlanting: (planting) =>
        set((s) => {
          patchBed(s, planting.bedId, (bed) => {
            const held = bed.plantings.find((p) => p.id === planting.id)
            if (held === undefined) return { ...bed, plantings: [...bed.plantings, planting] }
            const more = { ...planting, plantCount: held.plantCount + planting.plantCount }
            return {
              ...bed,
              plantings: bed.plantings.map((p) => (p.id === planting.id ? more : p)),
            }
          })
        }),

      removePlanting: (bedId, plantingId) =>
        set((s) => {
          patchBed(s, bedId, (bed) => ({
            ...bed,
            plantings: bed.plantings.filter((p) => p.id !== plantingId),
          }))
        }),

      /**
       * Moves a planting to another bed by DERIVING it there.
       *
       * The destination bed has its own light field and therefore its own calendar, so the sow
       * day, the harvest window and the plant count are all recomputed from it through the same
       * `derivePlanting` every other placement goes through. A crop the destination can't
       * support comes back refused with the reason and nothing moves: the tool doesn't accept
       * an answer it would have refused if the grower had asked for it directly
       */
      movePlanting: (plantingId, fromBedId, toBedId) => {
        const state = get()
        if (fromBedId === toBedId) return { ok: false, reason: "That's the bed it's already in" }
        const from = state.plot?.beds.find((bed) => bed.id === fromBedId)
        const to = state.plot?.beds.find((bed) => bed.id === toBedId)
        const planting = from?.plantings.find((entry) => entry.id === plantingId)
        if (from === undefined || to === undefined || planting === undefined) {
          return { ok: false, reason: 'That planting or that bed is no longer in the plot' }
        }
        const crop =
          state.catalog.status === 'ready'
            ? state.catalog.value.find((entry) => entry.id === planting.cropId)
            : undefined
        if (crop === undefined) {
          return {
            ok: false,
            reason: "The crop catalog isn't loaded, so nothing can be derived",
          }
        }
        const calendars = state.calendars.status === 'ready' ? state.calendars.value : []
        const calendar = calendarFor(calendars, to.id, crop.id)
        const sowDay = (calendar === undefined ? null : calendarSowDay(calendar)) ?? planting.sowDay
        const derived = derivePlanting({
          id: plantingIdFor(to.id, crop.id, sowDay),
          bed: to,
          crop,
          arrays: state.plot?.arrays ?? [],
          calendar,
          sowDay,
          plantCount: planting.plantCount,
          // the destination's remaining room, so a move can't overfill a bed a manual add couldn't
          catalog: state.catalog.status === 'ready' ? state.catalog.value : [],
        })
        if (!derived.ok) return derived
        set((s) => {
          patchBed(s, fromBedId, (bed) => ({
            ...bed,
            plantings: bed.plantings.filter((entry) => entry.id !== plantingId),
          }))
          patchBed(s, toBedId, (bed) => ({
            ...bed,
            plantings: [
              ...bed.plantings.filter((entry) => entry.id !== derived.value.id),
              derived.value,
            ],
          }))
          s.selectedBedId = toBedId
        })
        return derived
      },

      updatePlanting: (bedId, plantingId, patch) =>
        set((s) => {
          patchBed(s, bedId, (bed) => ({
            ...bed,
            plantings: bed.plantings.map((p) =>
              p.id === plantingId ? { ...p, ...patch, id: p.id, bedId: p.bedId } : p,
            ),
          }))
        }),

      upsertArray: (array) =>
        set((s) => {
          const next = withDerived(array)
          patchPlot(s, (plot) => ({
            ...plot,
            arrays: plot.arrays.some((a) => a.id === array.id)
              ? plot.arrays.map((a) => (a.id === array.id ? next : a))
              : [...plot.arrays, next],
          }))
          // tilt, pitch, tracking and module all move the electricity term, so it's never kept
          s.energy = idle()
        }),

      removeArray: (id) =>
        set((s) => {
          patchPlot(s, (plot) => ({ ...plot, arrays: plot.arrays.filter((a) => a.id !== id) }))
          if (s.selectedArrayId === id) s.selectedArrayId = null
          s.energy = idle()
        }),

      selectBed: (id) =>
        set((s) => {
          s.selectedBedId = id
          if (id) {
            s.selectedArrayId = null
            s.selectedObstructionId = null
          }
        }),

      selectArray: (id) =>
        set((s) => {
          s.selectedArrayId = id
          if (id) {
            s.selectedBedId = null
            s.selectedObstructionId = null
          }
        }),

      upsertObstruction: (house) =>
        set((s) => {
          patchPlot(s, (plot) => ({
            ...plot,
            obstructions: plot.obstructions.some((o) => o.id === house.id)
              ? plot.obstructions.map((o) => (o.id === house.id ? house : o))
              : [...plot.obstructions, house],
          }))
        }),

      removeObstruction: (id) =>
        set((s) => {
          patchPlot(s, (plot) => ({
            ...plot,
            obstructions: plot.obstructions.filter((o) => o.id !== id),
          }))
          if (s.selectedObstructionId === id) s.selectedObstructionId = null
        }),

      selectObstruction: (id) =>
        set((s) => {
          s.selectedObstructionId = id
          if (id) {
            s.selectedBedId = null
            s.selectedArrayId = null
          }
        }),

      /**
       * The default house, outside the boundary on the side that faces the equator so its
       * shadow reaches the plot when the sun is low (Decision Record 26). Null with no plot to
       * draw one on
       */
      addHouse: () => {
        const plot = get().plot
        if (plot === null) return null
        const side = get().location.latitudeDeg >= 0 ? 'south' : 'north'
        const house = makeHouse(plot.obstructions.length + 1, plot.boundary, side)
        set((s) => {
          patchPlot(s, (p) => ({ ...p, obstructions: [...p.obstructions, house] }))
          s.selectedObstructionId = house.id
          s.selectedBedId = null
          s.selectedArrayId = null
        })
        return house.id
      },

      /**
       * The default tree, outside the boundary on the equator side like the default house, 8 m
       * further east so the two don't share ground (Decision Record 26). Null with no plot to
       * draw one on
       */
      addTree: () => {
        const plot = get().plot
        if (plot === null) return null
        const side = get().location.latitudeDeg >= 0 ? 'south' : 'north'
        const tree = makeTree(plot.obstructions.length + 1, plot.boundary, side)
        set((s) => {
          patchPlot(s, (p) => ({ ...p, obstructions: [...p.obstructions, tree] }))
          s.selectedObstructionId = tree.id
          s.selectedBedId = null
          s.selectedArrayId = null
        })
        return tree.id
      },

      setOptions: (options) =>
        set((s) => {
          s.options = { ...s.options, ...options }
        }),

      runFinal: () => runBake({ ...FINAL_OPTIONS, backend: get().options.backend }, set, get),

      runEnergy: () => {
        const state = get()
        const plot = state.plot
        if (!plot || state.site.status !== 'ready' || state.weather.status !== 'ready') {
          set((s) => {
            s.energy = failed(ENERGY_NEEDS_SITE)
          })
          return
        }
        if (plot.arrays.length === 0) {
          set((s) => {
            s.energy = failed(ENERGY_NEEDS_ARRAY)
          })
          return
        }
        const site = state.site.value
        const weather = state.weather.value
        // the ground the rows stand on is a term in the front-side transposition AND in the
        // rear-side gain, so the plot's own cover is passed explicitly
        const result = attempt(() =>
          pvEnergyReport(
            site,
            plot.arrays,
            weather,
            chainOptionsFor(site, weather, plot.groundCover),
          ),
        )
        set((s) => {
          s.energy = result.ok
            ? ready(result.value)
            : failed(unavailableMessage('PV energy chain', result.message))
        })
      },

      /**
       * One season of the garden on the year chosen, as `src/simulation/season.ts` computes it.
       *
       * Synchronous on purpose: the science it runs is the recommendation's own and already
       * loaded, and the one costly part, the PV chain over 8,760 hours, is tens of milliseconds.
       * The measured years are turned into sites once per resolved site and kept on the store,
       * because ten water balances are the slow part and the place doesn't change between presses
       */
      runSeason: () => {
        const state = get()
        const blocker = seasonBlocker(state)
        if (blocker !== null) {
          set((s) => {
            s.simulationNotice = blocker
          })
          return
        }
        if (
          state.site.status !== 'ready' ||
          state.weather.status !== 'ready' ||
          state.catalog.status !== 'ready' ||
          state.companionRules.status !== 'ready' ||
          state.plot === null
        ) {
          return
        }
        // a comparison bake for an earlier season must not land after this season commits
        noPanelsToken += 1
        const site = state.site.value
        const plot = state.plot
        // read outside the closure below: narrowing doesn't survive into one
        const catalog = state.catalog.value
        const companionRules = state.companionRules.value
        const years =
          state.seasonYears ?? state.years.map((measured) => measuredSeasonYear(site, measured))
        const season = state.simulation.season + 1
        // the hidden truths are this place's, drawn once when the first season runs: a garden that
        // has run seasons keeps the seed it ran them on, wherever it is moved to afterward. Drawn
        // at this point, because the seed is a persisted field and stamping it at resolve would
        // write a design nobody had edited, straight after a forget
        const seed =
          state.simulation.season === 0 ? codeOf(site.id as string) >>> 0 : state.simulation.seed
        const chosen = chooseYear(
          state.simulation.yearChoice,
          typicalYear(site, state.weather.value),
          years,
          unit(seed, season, 11),
        )
        const result = attempt(() =>
          simulateSeason({
            site,
            year: chosen,
            plot,
            bedLight: state.bedLight,
            catalog,
            rules: companionRules,
            rotation: state.rotationConstraints,
            history: state.simulation.history,
            season,
            seed,
            frostPercentile: state.frostPercentile,
            retailPrice: state.retailPrice,
            economyInputs: state.economyInputs,
          }),
        )
        set((s) => {
          s.seasonYears = years
          if (!result.ok) {
            s.simulationNotice = unavailableMessage('season simulation', result.message)
            return
          }
          s.simulationNotice = null
          s.simulation = withSeason(
            { ...s.simulation, seed },
            season,
            result.value.report,
            result.value.records,
            result.value.tried,
          )
          // it named THIS season's harvest. A new one just ran, so it's simply out of date,
          // and the grower presses "Compare with no panels" again for this one
          s.noPanels = idle()
          /*
            The picture agrees with the season. Two things were
            saying "which year" and neither was the simulation: the scrubber's clock drew a
            drought of 2018 under this year's date, and a slider called "show the garden at year
            N" decided how mature the perennials were drawn while the seasons ran past it.

            So the season drives both. The clock keeps its day and hour and moves to the year that
            was run, which is a calendar move with no re-bake: Decision Record 14.1 holds that a
            season's shade ratio is geometry off the typical year, and the sun over a given day
            barely moves between years in any case. The scene derives the plants' age from the
            slider and the seasons run (`gardenAge`), because writing it here would make the
            shipped example, drawn at year 3, a year old on its first press
          */
          const ran = result.value.report.year.year
          if (ran !== null) s.timeUtcMillis = atCalendarYear(s.timeUtcMillis, ran)
        })
      },

      /**
       * The harvest the LAST season would have made with every panel removed: the plot with
       * `arrays: []`, baked through its own client (never the editor's or the
       * design search's, so this can never cancel either of theirs), and that same season's own
       * science run again against the counterfactual light. Nothing here reaches `s.plot`,
       * `s.bedLight`, `s.simulation` or `s.simulationNotice`: the real season stands exactly as
       * it was, and only `s.noPanels` moves
       */
      compareWithoutPanels: async () => {
        const state = get()
        const plot = state.plot
        const latest = state.simulation.reports[state.simulation.reports.length - 1]
        // the press this answers is absent without both, so there's nothing to run
        if (plot === null || plot.arrays.length === 0 || latest === undefined) return
        if (
          state.site.status !== 'ready' ||
          state.weather.status !== 'ready' ||
          state.catalog.status !== 'ready' ||
          state.companionRules.status !== 'ready'
        ) {
          set((s) => {
            s.noPanels = failed(
              'No site, weather, crop catalog or companion rules to run this against',
            )
          })
          return
        }
        const site = state.site.value
        const weather = state.weather.value
        const seasonYears =
          state.seasonYears ?? state.years.map((measured) => measuredSeasonYear(site, measured))
        const year = seasonYearOf(latest.year, seasonYears, typicalYear(site, weather))
        if (year === null) {
          set((s) => {
            s.noPanels = failed("The year this season ran on is no longer in this site's record")
          })
          return
        }
        // read outside the closure below: narrowing doesn't survive into one, and none of this
        // is the real plot's own bedLight, the real report or the real history
        const catalog = state.catalog.value
        const companionRules = state.companionRules.value
        const rotation = state.rotationConstraints
        const frostPercentile = state.frostPercentile
        const retailPrice = state.retailPrice
        const economyInputs = state.economyInputs
        const seed = state.simulation.seed
        const season = latest.season
        const history = historyBeforeSeason(state.simulation.history, season)
        const noPanelPlot = withoutPanels(plot)
        const options: SimulationOptions = { ...FINAL_OPTIONS, backend: state.options.backend }

        noPanelsToken += 1
        const token = noPanelsToken
        set((s) => {
          s.noPanels = loading()
        })
        const active = noPanelsClient()
        const bake = active === null ? runSimulation : active.run.bind(active)
        const baked = await attemptAsync(() => bake(site, noPanelPlot, weather, options, () => {}))
        if (token !== noPanelsToken) return
        if (!baked.ok) {
          set((s) => {
            s.noPanels = failed(unavailableMessage('no-panels comparison', baked.message))
          })
          return
        }
        const result = attempt(() =>
          simulateSeason({
            site,
            year,
            plot: noPanelPlot,
            bedLight: baked.value.bedLight,
            catalog,
            rules: companionRules,
            rotation,
            history,
            season,
            seed,
            frostPercentile,
            retailPrice,
            economyInputs,
          }),
        )
        if (token !== noPanelsToken) return
        set((s) => {
          s.noPanels = result.ok
            ? ready({
                season,
                harvestIndex: result.value.report.harvestIndex,
                // per planting as well as per garden: the panels help some crops and cost
                // others, and the garden's average hides which
                outcomes: result.value.report.outcomes.map((outcome) => ({
                  plantingId: outcome.plantingId,
                  cropId: outcome.cropId,
                  kind: outcome.kind,
                  realized: outcome.realized,
                })),
              })
            : failed(unavailableMessage('no-panels comparison', result.message))
        })
      },

      setSweeping: (sweeping) =>
        set((s) => {
          s.sweeping = sweeping
        }),

      setYearChoice: (choice) =>
        set((s) => {
          s.simulation = { ...s.simulation, yearChoice: choice }
        }),

      resetSimulation: () =>
        set((s) => {
          s.simulation = {
            ...defaultSimulation(),
            seed: s.simulation.seed,
            yearChoice: s.simulation.yearChoice,
          }
          s.simulationNotice = null
          // and the clock with it, back in the year the machine says it is. The plants' age
          // follows the season count on its own
          s.timeUtcMillis = atCalendarYear(
            s.timeUtcMillis,
            new Date(s.todayUtcMillis).getUTCFullYear(),
          )
        }),

      revealRule: (id) =>
        set((s) => {
          if (s.simulation.revealed.includes(id)) return
          s.simulation = { ...s.simulation, revealed: [...s.simulation.revealed, id] }
        }),

      cancel: () => {
        runToken += 1
        attempt(() => client?.cancelAll())
        set((s) => {
          s.progress = null
          if (s.raster.status === 'loading') s.raster = idle()
          // stamped with the garden the canceled run was over, so `useAutoLight` reads the
          // cancel as an answer for this arrangement and doesn't start the run again until
          // something moves. A cancel that restarted itself a second later would be no cancel
          if (s.plot !== null) s.lightGeometry = lightGeometryKey(s.plot)
        })
      },

      loadCatalog: async () => {
        set((s) => {
          s.catalog = loading()
        })
        const result = await attemptAsync(loadCropCatalog)
        set((s) => {
          s.catalog = result.ok
            ? ready(result.value)
            : failed(unavailableMessage('crop catalog', result.message))
        })
      },

      loadEvidence: async () => {
        set((s) => {
          s.companionRules = loading()
          s.tekRules = loading()
        })
        const rules = await attemptAsync(async () =>
          partitionCompanionRules(await loadCompanionRules()),
        )
        const rotation = await attemptAsync(loadRotationConstraints)
        const tek = await attemptAsync(loadTekRules)
        set((s) => {
          s.companionRules = rules.ok
            ? ready(rules.value)
            : failed(unavailableMessage('companion rules', rules.message))
          s.folklore = rules.ok ? rules.value.folklore : []
          s.rotationConstraints = rotation.ok ? rotation.value : []
          s.tekRules = tek.ok
            ? ready(tek.value)
            : failed(unavailableMessage('TEK rules', tek.message))
        })
      },

      recommend: async () => {
        const state = get()
        const plot = state.plot
        const site = state.site
        if (!plot || site.status !== 'ready') {
          set((s) => {
            s.sets = failed('No site yet. Look up the place before ranking crops')
            s.calendars = failed(
              'No site yet. Look up the place before building a planting calendar',
            )
          })
          return null
        }
        recommendToken += 1
        const token = recommendToken
        set((s) => {
          s.ranking = true
          // the last ranking stays up while the next one runs. See `ranking` on the slice
          if (s.sets.status !== 'ready') s.sets = loading()
          if (s.calendars.status !== 'ready') s.calendars = loading()
        })
        const catalog = state.catalog.status === 'ready' ? state.catalog.value : []
        const rules = await attemptAsync(loadCompanionRules)
        const result = await runRecommendations({
          site: site.value,
          plot,
          bedLight: state.bedLight,
          catalog,
          companionRules: rules.ok ? rules.value : [],
          rotationConstraints: state.rotationConstraints,
          frostPercentile: state.frostPercentile,
          weights: DEFAULT_WEIGHTS,
          // the growing answer leans the ranking the same way it leans the combinations
          preferredCropIds: preferredCropIdsOf(
            withAmbition(state.preferences, state.answers.ambition, catalog),
          ),
          /**
           * The region comes off the site that was just resolved: a botanical area is a fact
           * about where the garden is, and carrying yesterday's
           * one into today's location would rank a Massachusetts garden against Peru
           */
          wildlife: { ...state.wildlife, botanicalArea: site.value.botanicalArea },
        })
        // superseded: the store keeps the later run's answer, and this run's goes only to
        // whoever awaited it, which is the ranking made for the plot they asked about
        if (token !== recommendToken) return result.ok ? result.value.sets : null
        set((s) => {
          s.ranking = false
          if (!result.ok) {
            const message = unavailableMessage('recommendation pipeline', result.message)
            s.sets = failed(message)
            s.calendars = failed(message)
            return
          }
          s.sets = ready(result.value.sets)
          s.calendars =
            result.value.calendars === null
              ? failed(CALENDAR_UNAVAILABLE)
              : ready(result.value.calendars)
        })
        return result.ok ? result.value.sets : null
      },

      cancelRecommend: () => {
        recommendToken += 1
        set((s) => {
          s.autoRunQueued = false
          s.ranking = false
          if (s.sets.status === 'loading') s.sets = idle()
          if (s.calendars.status === 'loading') s.calendars = idle()
        })
      },

      setAutoRun: (enabled) =>
        set((s) => {
          s.autoRun = enabled
          if (!enabled) s.autoRunQueued = false
        }),

      setAutoRunQueued: (queued) =>
        set((s) => {
          s.autoRunQueued = queued
        }),

      setShowAllCrops: (show) =>
        set((s) => {
          s.showAllCrops = show
        }),

      setPreference: (cropId, kind) =>
        set((s) => {
          const kept = s.preferences.entries.filter((entry) => entry.cropId !== cropId)
          const previous = s.preferences.entries.find((entry) => entry.cropId === cropId)
          const next: CropPreference[] =
            kind === null
              ? kept
              : [...kept, { cropId, kind, weight: previous?.weight ?? (1 as Fraction) }]
          s.preferences = { ...s.preferences, entries: next }
        }),

      setPreferenceWeight: (cropId, weight) =>
        set((s) => {
          s.preferences = {
            ...s.preferences,
            entries: s.preferences.entries.map((entry) =>
              entry.cropId === cropId ? { ...entry, weight } : entry,
            ),
          }
        }),

      setPreferenceInfluence: (influence) =>
        set((s) => {
          s.preferences = { ...s.preferences, influence }
        }),

      setCompatibilityWeight: (kind, weight) =>
        set((s) => {
          s.compatibilityWeights = { ...s.compatibilityWeights, [kind]: weight }
        }),

      resetCompatibilityWeights: () =>
        set((s) => {
          s.compatibilityWeights = DEFAULT_COMPATIBILITY_WEIGHTS
        }),

      setMaxCropsPerBed: (count) =>
        set((s) => {
          s.maxCropsPerBed = Math.max(1, Math.round(count))
        }),

      clearPreferences: () =>
        set((s) => {
          s.preferences = emptyPreferences()
          s.suggestions = idle()
        }),

      suggest: () => {
        const state = get()
        const plot = state.plot
        const bed = selectedBedOf(state)
        const site = state.site
        const sets = state.sets
        const catalog = state.catalog
        if (
          !plot ||
          bed === null ||
          site.status !== 'ready' ||
          sets.status !== 'ready' ||
          catalog.status !== 'ready'
        ) {
          set((s) => {
            s.suggestions = failed(SUGGESTION_NEEDS_RANKING)
          })
          return
        }
        const light = state.bedLight.find((entry) => entry.bedId === bed.id)
        const recommendations = sets.value.find((entry) => entry.bedId === bed.id)
        if (light === undefined || recommendations === undefined) {
          set((s) => {
            s.suggestions = failed(
              light === undefined ? SUGGESTION_NEEDS_LIGHT : SUGGESTION_NEEDS_RANKING,
            )
          })
          return
        }
        const energyRatio = energyRatioFor(get)
        if (energyRatio === null) {
          set((s) => {
            s.suggestions = failed(
              `${SUGGESTION_NEEDS_ENERGY}. ${asyncMessage(get().energy) ?? ''}`.trim(),
            )
          })
          return
        }
        const result = attempt(() =>
          suggestPolycultures({
            bed,
            arrays: plot.arrays,
            light,
            site: site.value,
            catalog: catalog.value,
            frostPercentile: state.frostPercentile,
            recommendations,
            preferences: withAmbition(state.preferences, state.answers.ambition, catalog.value),
            companionRules:
              state.companionRules.status === 'ready' ? flatRules(state.companionRules.value) : [],
            rotationConstraints: state.rotationConstraints,
            tekRules: state.tekRules.status === 'ready' ? state.tekRules.value : [],
            energyRatio,
            weights: state.compatibilityWeights,
            maxCropsPerBed: state.maxCropsPerBed,
            wildlife: { ...state.wildlife, botanicalArea: site.value.botanicalArea },
          }),
        )
        set((s) => {
          s.suggestions = result.ok
            ? ready(result.value)
            : failed(unavailableMessage('polyculture suggestions', result.message))
        })
      },

      applySuggestion: (suggestion) => {
        const state = get()
        const plot = state.plot
        const held = plot?.beds.find((entry) => entry.id === suggestion.bedId)
        if (!plot || held === undefined) return
        /*
          A combination is a plan for the WHOLE bed, so what the bed holds goes first. If the
          combination were added on top, a bed the guided run had already planted would refuse every
          crop of the second combination for want of the room the first one was holding, the
          refusals would land on a list another panel prints, and "Plant this combination" would do
          nothing anyone could see. The space accounting behind every card is done for the empty
          bed, and this is what makes the card's counts the counts that get planted
        */
        for (const planting of held.plantings) get().removePlanting(held.id, planting.id)
        const bed: Bed = { ...held, plantings: [] }
        const catalog = state.catalog.status === 'ready' ? state.catalog.value : []
        const calendars = state.calendars.status === 'ready' ? state.calendars.value : []
        const refusals: PlanRefusal[] = []
        // the plant counts are the ones the space accounting derived, so what is placed is
        // exactly what the suggestion said would fit
        for (const allocation of suggestion.space.allocations) {
          const crop = catalog.find((entry) => entry.id === allocation.cropId)
          if (crop === undefined) {
            refusals.push({
              bedId: bed.id,
              cropId: allocation.cropId,
              reason: 'the crop catalog no longer holds this crop, so nothing can be derived',
            })
            continue
          }
          const calendar = calendarFor(calendars, bed.id, crop.id)
          const sowDay =
            (calendar === undefined ? null : calendarSowDay(calendar)) ?? (1 as DayOfYear)
          const derived = derivePlanting({
            id: plantingIdFor(bed.id, crop.id, sowDay),
            bed,
            crop,
            arrays: plot.arrays,
            calendar,
            sowDay,
            plantCount: allocation.plantCount,
          })
          if (!derived.ok) {
            refusals.push({ bedId: bed.id, cropId: crop.id, reason: derived.reason })
            continue
          }
          get().addPlanting(derived.value)
        }
        set((s) => {
          s.planRefusals = refusals
        })
      },

      /**
       * Put a scenario in the scene without committing it. Nothing here touches `plot`, so
       * nothing is written to storage, nothing is undoable and the ranking never sees it: the
       * preview is a second plot the scene is told to draw instead, and dropping it is one null
       */
      previewScenario: (archetype) =>
        set((s) => {
          const designs = s.onboarding.designs
          if (archetype === null || designs.status !== 'ready') {
            s.previewPlot = null
            s.previewArchetype = null
            return
          }
          const scenario = designs.value.scenarios.find(
            (entry) => entry.candidate.archetype === archetype,
          )
          s.previewPlot =
            scenario === undefined
              ? null
              : plotForScenario(
                  s.answers,
                  s.plot,
                  scenario,
                  soilForSite(s.site.status === 'ready' ? s.site.value : null),
                )
          s.previewArchetype = scenario === undefined ? null : archetype
        }),

      setOverlayPlayback: (playback) =>
        set((s) => {
          s.overlayPlayback = playback
        }),

      /**
       * Pointer moves are frequent, so an unchanged target is dropped before it reaches immer:
       * writing an equal value would still hand every subscriber a new state object
       */
      setHovered: (target) =>
        set((s) => {
          if (sameHover(s.hovered, target)) return
          s.hovered = target
        }),

      setOnboardingStep: (step) =>
        set((s) => {
          s.onboarding = { ...s.onboarding, step }
        }),

      answerOnboarding: (patch) =>
        set((s) => {
          // an answer the SEARCH reads makes a finished run stale, so it's dropped.
          // One the search never reads doesn't: see `SEARCH_ANSWER_FIELDS`
          const stale = staleSearchAfter(patch)
          const exposureMoved =
            patch.exposure !== undefined && patch.exposure !== s.answers.exposure
          s.answers = { ...s.answers, ...patch }
          // the surroundings dim every bed's light before the ranking reads it, so a new answer
          // re-reads the beds off the raster already baked
          if (exposureMoved) rederiveBedLight(s)
          if (stale && s.onboarding.designs.status === 'ready') {
            s.onboarding = { ...s.onboarding, designs: idle() }
          }
          if (!stale) return
          // the preview plot is built from the answers a scenario was raised against, so it goes
          // stale the moment such an answer moves, same as the ready `designs` result above
          s.previewPlot = null
          s.previewArchetype = null
        }),

      suggestDesigns: async () => {
        designToken += 1
        const token = designToken
        set((s) => {
          // the agent's cursor moves to the layouts, which is what lets it read "use that one".
          // Written before the site below is settled: a lookup that has to run first is seconds
          // of waiting, and a press that showed nothing for them read as broken on a phone
          s.onboarding = { ...s.onboarding, step: 'results', designs: loading(), progress: null }
          // the comparison lands on the panels step, whichever step asked for the search
          s.sidebarStep = 'panels'
        })
        /**
         * The editor's own site is settled BEFORE the search, so the two can't disagree about
         * the place the answers named.
         *
         * Left alone, the engine resolves a site of its own whenever this store has none and
         * never hands it back, and the visitor ends up on a results step showing real kWh and
         * DLI figures for their town while the sidebar one click away still says nothing has
         * been looked up. `ensureSite` closes that on the ordinary path by running at mount.
         * What is left is the lookup that FAILED, and `ensureSite` deliberately doesn't retry
         * one of those, because it's called from a render effect and a failed upstream would
         * become a request on a timer. This is a press, so a retry is the visitor asking for it,
         * and this calls `resolveSite` directly, skipping `ensureSite`
         */
        if (get().site.status !== 'ready') {
          await get().resolveSite(get().location, get().locationLabel)
          if (token !== designToken) return
          const site = get().site
          if (site.status !== 'ready') {
            // the lookup's own sentence: a search never re-runs the lookup itself
            set((s) => {
              s.onboarding = {
                ...s.onboarding,
                designs: failed(site.status === 'error' ? site.message : SITE_UNRESOLVED),
              }
            })
            return
          }
        }
        const state = get()
        // the search's own client, so the candidate bakes leave the thread the wizard has to
        // animate on without the editor being able to cancel them out from under it. Where
        // `createSimClient` already failed there is nothing to pass and the engine falls back
        // to its own direct import, keeping failure handling in one place
        const active = designClient()
        const result = await runDesignSuggestions(
          answersOf(state.answers, state.location, state.locationLabel, state.plot),
          {
            site: state.site.status === 'ready' ? state.site.value : undefined,
            weather: state.weather.status === 'ready' ? state.weather.value : undefined,
            catalog: state.catalog.status === 'ready' ? state.catalog.value : undefined,
            // the cover the grower already chose, so a suggested layout's kWh and the editor's
            // kWh for the same layout are computed against the same ground
            groundCover: state.plot?.groundCover,
            // a house the grower drew shades the search's own candidate bakes too
            obstructions: state.plot?.obstructions,
            run: active === null ? undefined : active.run.bind(active),
            onProgress: (progress) => {
              if (token !== designToken) return
              set((s) => {
                s.onboarding = { ...s.onboarding, progress }
              })
            },
          },
        )
        if (token !== designToken) return
        set((s) => {
          s.onboarding = {
            ...s.onboarding,
            progress: null,
            designs: result.ok ? ready(result.value) : failed(result.message),
          }
        })
      },

      cancelDesignSuggestions: () => {
        designToken += 1
        // the search runs in the worker, so abandoning it has to reach the worker as well: a run
        // nobody will read is still a core burned on the way to a discarded answer. The search's own
        // client, and the editor's is left alone: canceling the questions must not throw away a
        // bake the grower started from the sidebar
        attempt(() => search?.cancelAll())
        set((s) => {
          s.onboarding = {
            ...s.onboarding,
            // the last question before the search, which is where the agent's cursor was
            step: 'pollinators',
            progress: null,
            designs: s.onboarding.designs.status === 'loading' ? idle() : s.onboarding.designs,
          }
        })
      },

      applyDesign: async (scenario) => {
        const state = get()
        const candidate = scenario.candidate
        const layout = scenario.layout
        const before = state.plot
        // the same builder the scene's preview draws from, so the button can't write a garden
        // other than the one the grower was just looking at
        const plot = plotForScenario(
          state.answers,
          state.plot,
          scenario,
          soilForSite(state.site.status === 'ready' ? state.site.value : null),
        )
        state.setPlot(plot)
        set((s) => {
          // the layout is settled, so the agent's cursor moves on to what goes in the beds
          s.onboarding = {
            ...s.onboarding,
            step: 'planting',
            appliedArchetype: candidate.archetype,
          }
          s.previewPlot = null
          s.previewArchetype = null
          // the plants are what a guided layout is for, so that is where it hands over. The
          // steps behind it are all settled by definition: the search that produced this
          // layout couldn't have run without them
          s.sidebarStep = 'plants'
          s.mode = 'select'
          s.draft = []
          s.selectedBedId = null
          // the light each bed was placed in, carried across as is. It's the
          // search's own bake of this layout, always run at FINAL_OPTIONS in production, which is
          // what lets the plants step call this full quality before any raster in the editor
          // catches up with it
          s.bedLight = layout.beds.map((bed) => bed.light)
          s.bedLightSubdivision = FINAL_OPTIONS.subdivision
          s.compliance = []
          // captured only when the slot is empty: a second apply before an undo must still
          // restore the grower's own garden. A naive overwrite would strand the first generated
          // layout as the undo target. Only `undoGeneration` empties the slot,
          // so this holds even when the generation that followed an earlier apply never finished
          if (s.generationUndo === null) s.generationUndo = before
          s.generated = null
          s.planRefusals = []
          s.planting = true
        })
        try {
          await generateGarden(scenario, set, get)
        } finally {
          set((s) => {
            s.planting = false
          })
        }
      },

      plantEveryBed: async () => {
        const before = get().plot
        if (before === null || before.beds.length === 0) return
        set((s) => {
          // the same undo rule as `applyDesign`: the slot is filled once and only an undo empties it
          if (s.generationUndo === null) s.generationUndo = before
          s.generated = null
          s.planRefusals = []
          s.planting = true
          // bare beds, as a guided apply plants: the ranking reads what a bed already holds, so
          // ranking over the last planting would let a second press plant a different garden
          patchPlot(s, (plot) => ({
            ...plot,
            beds: plot.beds.map((bed) => ({ ...bed, plantings: [] })),
          }))
        })
        try {
          const ranked = await rankForPlanting(get)
          const state = get()
          const plot = state.plot
          if (plot === null) return
          const window = growingWindowOf(state)
          const beds = plot.beds.flatMap((bed): readonly BedToPlant[] => {
            const light = state.bedLight.find((entry) => entry.bedId === bed.id)
            if (light === undefined) return []
            const summary = bedLightSummary(light, window)
            const zone = zoneOf(summary, plot.arrays.length)
            return [
              {
                bedId: bed.id,
                label: bed.label,
                zone,
                summary,
                reason: zoneReason(zone, summary.shadeRatio),
                light,
              },
            ]
          })
          plantBeds(
            {
              beds,
              sets: ranked.sets,
              energyRatio: energyRatioFor(get),
              archetype: null,
              explanation: PLANTED_AS_IT_STANDS,
              // no search measured this plot against the open sky, so there's nothing to claim
              plotLostToShade: [],
              layoutRefusals: [],
            },
            set,
            get,
          )
        } finally {
          set((s) => {
            s.planting = false
          })
        }
      },

      undoGeneration: () =>
        set((s) => {
          if (s.generationUndo === null) return
          s.plot = s.generationUndo
          s.generationUndo = null
          s.generated = null
          s.planRefusals = []
          s.bedLight = []
          s.bedLightSubdivision = null
          s.lightGeometry = null
          // the light on screen was computed over the layout just undone. Back to idle, which
          // is what has `useAutoLight` compute it again over the garden as restored
          s.raster = idle()
          s.compliance = []
          s.selectedBedId = null
          s.energy = idle()
          s.sets = idle()
          s.calendars = idle()
          s.suggestions = idle()
          // the layout it named is gone from the plot, so the app must stop claiming it is applied
          s.onboarding = { ...s.onboarding, appliedArchetype: null }
        }),

      /**
       * Puts the design back to a moment `history.ts` kept, and settles the slices derived from it.
       *
       * Modeled on `undoGeneration`. To the history a guided layout is a plot like any other, so
       * the slot that action restores from is emptied whenever the plot moves: it names the plot
       * from before a generation, which the history has stepped past.
       *
       * Each derived slice does what an edit of the same field does to it, and that is not always
       * a reset:
       *
       * - The plot moved: the record of the last generation, the refusals its plantings produced
       *   and the claim of an applied layout describe a plot that is gone, so they go. The energy
       *   figure goes idle when the arrays or the ground cover moved, as `upsertArray`,
       *   `removeArray` and `setGroundCover` leave it. A selection of a bed, a row of panels or an
       *   obstruction the plot no longer holds is cleared
       * - The light: the raster stays, and each bed's reading is taken off it again, when it was
       *   baked over exactly the geometry coming back (its stamp equals the plot's key). The
       *   surroundings answer may have moved with the plot, and the reading carries it. Otherwise
       *   the raster, the bed readings, their sky subdivision, the stamp and the compliance checks
       *   go back to idle and `useAutoLight` computes the light again, as it does after
       *   `undoGeneration`. The comparison is between the stamp and the key of the plot coming
       *   back, because a raster that was already stale against the plot on screen can be fresh
       *   against the one returning
       * - A boundary or an answer the layout search reads moved: a finished search is dropped, as
       *   `patchBoundary` and `answerOnboarding` drop it. A previewed scenario goes too when an
       *   answer moved, since the preview is built from the answers
       * - The frost percentile moved: the compliance checks are read again over the new window, as
       *   `setFrostPercentile` does
       * - Kept as they are: the ranking, the calendars and the polyculture suggestions, which an
       *   edit of the plot leaves alone because `useAutoRecommend` and the combinations panel run
       *   again off the keys this moves. Also the place and its weather, the seasons that were run
       *   and the no-panels comparison that names one
       */
      restoreDesign: (snapshot) => {
        const before = get()
        const plot = snapshot.plot
        const plotMoved = before.plot !== plot
        const boundaryMoved = plotMoved && before.plot?.boundary !== plot?.boundary
        const energyMoved =
          plotMoved &&
          (before.plot?.arrays !== plot?.arrays || before.plot?.groundCover !== plot?.groundCover)
        const searchAnswersMoved = SEARCH_ANSWER_FIELDS.some(
          (field) => before.answers[field] !== snapshot.answers[field],
        )
        const exposureMoved = before.answers.exposure !== snapshot.answers.exposure
        // the raster's stamp is read against the plot coming back, since a raster that is stale for
        // the plot on screen can be fresh for that one. The light bullet above says more
        const lightFits =
          plot !== null &&
          before.raster.status === 'ready' &&
          before.lightGeometry === lightGeometryKey(plot)
        set((s) => {
          Object.assign(s, snapshot)
          if (plotMoved) {
            s.generated = null
            s.generationUndo = null
            s.planRefusals = []
            s.onboarding = { ...s.onboarding, appliedArchetype: null }
            if (energyMoved) s.energy = idle()
            if (!(plot?.beds ?? []).some((bed) => bed.id === s.selectedBedId)) {
              s.selectedBedId = null
            }
            if (!(plot?.arrays ?? []).some((array) => array.id === s.selectedArrayId)) {
              s.selectedArrayId = null
            }
            if (!(plot?.obstructions ?? []).some((o) => o.id === s.selectedObstructionId)) {
              s.selectedObstructionId = null
            }
          }
          if (plotMoved && !lightFits) {
            s.raster = idle()
            s.progress = null
            s.bedLight = []
            s.bedLightSubdivision = null
            s.lightGeometry = null
            s.compliance = []
          } else if (plotMoved || exposureMoved) {
            rederiveBedLight(s)
          }
          if ((boundaryMoved || searchAnswersMoved) && s.onboarding.designs.status === 'ready') {
            s.onboarding = { ...s.onboarding, designs: idle() }
          }
          if (searchAnswersMoved) {
            s.previewPlot = null
            s.previewArchetype = null
          }
        })
        if (before.frostPercentile !== snapshot.frostPercentile) recheckCompliance(set, get)
      },

      setMode: (mode) =>
        set((s) => {
          s.mode = mode
          s.draft = []
        }),

      setSurface: (surface) =>
        set((s) => {
          s.surface = surface
        }),

      setSidebarStep: (step) =>
        set((s) => {
          s.sidebarStep = step
        }),

      setLengthUnit: (unit) =>
        set((s) => {
          s.lengthUnit = unit
        }),

      pushDraftVertex: (point) =>
        set((s) => {
          s.draft = [...s.draft, point]
        }),

      moveDraftVertex: (index, point) =>
        set((s) => {
          s.draft = s.draft.map((p, i) => (i === index ? point : p))
        }),

      undoDraftVertex: () =>
        set((s) => {
          s.draft = s.draft.slice(0, -1)
        }),

      commitDraft: () =>
        set((s) => {
          if (s.draft.length < 3 || !s.plot) return
          const footprint = polygonOf(untangledRing([...s.draft]))
          if (s.mode === 'draw-plot') {
            patchBoundary(s, (plot) => ({ ...plot, boundary: footprint }))
          } else {
            const bed = makeBed(nextBedIndex(s.plot.beds), {
              footprint,
              soil: soilForSite(s.site.status === 'ready' ? s.site.value : null),
            })
            patchPlot(s, (plot) => ({ ...plot, beds: [...plot.beds, bed] }))
            s.selectedBedId = bed.id
          }
          s.draft = []
          s.mode = 'select'
        }),

      cancelDraft: () =>
        set((s) => {
          s.draft = []
          s.mode = 'select'
        }),

      setOverlay: (settings) =>
        set((s) => {
          s.overlay = { ...s.overlay, ...settings }
        }),

      setOverlayOnSeasons: (value) =>
        set((s) => {
          s.overlayOnSeasons = value
        }),

      setWidePlan: (wide) =>
        set((s) => {
          s.widePlan = wide
        }),

      setTime: (utcMillis) =>
        set((s) => {
          s.timeUtcMillis = utcMillis
        }),

      setImagery: (enabled) =>
        set((s) => {
          s.imageryEnabled = enabled
        }),

      setLighting: (quality) =>
        set((s) => {
          s.lighting = quality
        }),

      setEffects: (effects) =>
        set((s) => {
          s.effects = { ...s.effects, ...effects }
        }),

      setWildlife: (patch) =>
        set((s) => {
          s.wildlife = { ...s.wildlife, ...patch }
        }),

      setPlantYear: (year) =>
        set((s) => {
          s.plantYear = year
        }),

      setEconomyInputs: (patch) =>
        set((s) => {
          s.economyInputs = { ...s.economyInputs, ...patch }
        }),

      setDragging: (dragging) =>
        set((s) => {
          s.dragging = dragging
        }),

      carry: (cropId) =>
        set((s) => {
          s.carrying = cropId
        }),

      /**
       * A crop let go over a bed. Selects that bed, because every panel means "this bed" by the
       * selection and the drop has just named one, and moves to the step where the choice it
       * staged is visible: dropping something and being shown nothing would read as a drop that
       * failed
       */
      dropOnBed: (bedId) =>
        set((s) => {
          if (s.carrying === null) return
          s.dropped = { bedId, cropId: s.carrying }
          s.carrying = null
          s.selectedBedId = bedId
          s.sidebarStep = 'plants'
        }),

      clearDropped: () =>
        set((s) => {
          s.dropped = null
        }),
    }
  }),
)

/**
 * The design as the app started, captured once. `sameDesign` compares by identity because immer
 * keeps untouched slices stable, so a second `defaultDesign()` would compare unequal to the
 * first: this is the only honest way to ask whether anything has been edited yet
 */
let startingDesign = snapshotDesign(useAppStore.getState())

/**
 * The plot the SCENE draws: a previewed scenario while one is open in the layout comparison, the
 * committed plot otherwise. One definition, because a scene that reads `plot` in one place and the
 * preview in another would draw half of each
 */
export const scenePlot = (state: AppState): GardenPlot | null => state.previewPlot ?? state.plot

/**
 * The measured year the scene is showing, or null: on the seasons step, once a season has run
 * on a year that happened, the picture is that year's (Decision Record 14.5). The typical year
 * and every other step answer null, and the scene reads the site as resolved
 */
const seasonYearShown = (state: AppState): SeasonYear | null => {
  if (state.sidebarStep !== 'seasons') return null
  const latest = state.simulation.reports[state.simulation.reports.length - 1]
  const year = latest?.year.year ?? null
  if (year === null) return null
  return state.seasonYears?.find((entry) => entry.summary.year === year) ?? null
}

/**
 * The hour of weather under the clock, and the sun it had, on the seasons step only.
 *
 * The weather is the year the season ran on where that was a measured year, and the typical
 * year otherwise, so a season played on 2016 is drawn under 2016's own hours: its cloud, read as
 * the measured sun against a clear one (`src/sim/clearness.ts`), and its rain. Off the seasons
 * step both are zero, because the planner's picture makes no claim about any hour's weather
 * and its baselines are held to that. Null where there's no site, no weather, or no sun
 */
const sceneHour = (
  state: AppState,
): {
  readonly ghiWM2: number
  readonly rainMm: number
  readonly airTempC: number
  readonly zenithDeg: number
  readonly i0: number
} | null => {
  if (state.sidebarStep !== 'seasons') return null
  if (state.site.status !== 'ready' || state.weather.status !== 'ready') return null
  const weather = seasonYearShown(state)?.weather ?? state.weather.value
  // read outside the closure below: narrowing doesn't survive into one
  const site = state.site.value
  const date = new Date(state.timeUtcMillis)
  const index = Math.min(
    weather.ghiWM2.length - 1,
    (dayOfYearUtc(state.timeUtcMillis) - 1) * 24 + date.getUTCHours(),
  )
  const position = attempt(() => spaPosition(state.timeUtcMillis, observerFor(site)))
  if (!position.ok) return null
  return {
    ghiWM2: weather.ghiWM2[index] ?? 0,
    rainMm: weather.precipMm?.[index] ?? 0,
    airTempC: weather.dryBulbC[index] ?? 0,
    zenithDeg: position.value.zenithDeg,
    i0: extraterrestrialNormal(position.value.earthRadiusVectorAu),
  }
}

/** 0 clear to 1 overcast for the hour the scene is on. A number, so it can be subscribed to */
export const sceneCloud = (state: AppState): number => {
  const hour = sceneHour(state)
  return hour === null ? 0 : cloudCover(clearnessIndex(hour.ghiWM2, hour.zenithDeg, hour.i0))
}

/**
 * The rain that fell in the hour the scene is on, in millimeters. Zero off the seasons step and
 * zero once the season has finished playing, so the clock left standing on the last hour of a wet
 * season doesn't leave the drops falling for good
 */
export const sceneRainMmPerHour = (state: AppState): number =>
  state.sweeping ? (sceneHour(state)?.rainMm ?? 0) : 0

/** Snow at or below freezing, in the hour the scene is on, and rain above it */
export const scenePrecipKind = (state: AppState): 'rain' | 'snow' =>
  (sceneHour(state)?.airTempC ?? 1) <= 0 ? 'snow' : 'rain'

/**
 * How covered the ground is drawn on the day the scrubber is on, and the albedo that goes with
 * it. Both come from here, because the ground's color and the
 * sky's bounce off it are two readings of one surface: whitening the picture without whitening
 * the bounce would light the scene off a ground that is not the ground being drawn.
 *
 * The cover is a seasonal weighting off the site's monthly normals, and the PV chain reads the
 * same `groundSnowCover` per hour, through `chainOptionsFor`, so the scene and the chain share one
 * function in `src/sim/snow.ts`. `albedoUnderSnow` below is the other half of the same rule: the
 * scene calls it, and the chain calls its Rust copy, `albedo_under_snow`, with the same two
 * arguments
 */
const sceneGround = (state: AppState): { readonly snowCover: number; readonly albedo: number } => {
  const albedo = groundAlbedoOf(scenePlot(state)?.groundCover ?? DEFAULT_GROUND_COVER)
  // the year's own normals where the scene is showing a measured year, so the snow on the
  // ground in a season played on 2016 is 2016's, through the one snow model
  const normals =
    seasonYearShown(state)?.site.normals ??
    (state.site.status === 'ready' ? state.site.value.normals : null)
  const snowCover =
    normals === null
      ? 0
      : groundSnowCover(
          normals.monthlyMeanTempC,
          normals.monthlyPrecipMm,
          dayOfYearUtc(state.timeUtcMillis),
        )
  return { snowCover, albedo: albedoUnderSnow(albedo, snowCover) }
}

/**
 * The month the overlay DRAWS: the playback month while it's running, the grower's own choice
 * otherwise. One definition, so the legend, the scene and the readout can't disagree about
 * which month is on screen
 */
export const overlaySlice = (state: AppState): OverlaySlice =>
  state.overlayPlayback?.month ?? state.overlay.slice

/**
 * `sceneSnowCover` and `sceneGroundAlbedo` below are selected as two separate numbers, because
 * zustand compares what a selector returns by reference: a selector that builds an object returns a
 * new one every read, every read looks like a change, and the component re-renders until React
 * gives up. `scene.test.tsx` catches exactly this
 */
export const sceneSnowCover = (state: AppState): number => sceneGround(state).snowCover
export const sceneGroundAlbedo = (state: AppState): number => sceneGround(state).albedo

/** Compared by value, because two pointer moves over one bed are the same hover */
export const sameHover = (a: HoverTarget | null, b: HoverTarget | null): boolean => {
  if (a === null || b === null) return a === b
  if (a.kind !== b.kind) return false
  switch (a.kind) {
    case 'bed':
      return a.bedId === (b as { bedId: BedId }).bedId
    case 'planting':
      return a.plantingId === (b as { plantingId: PlantingId }).plantingId
    case 'array':
      return a.arrayId === (b as { arrayId: ArrayId }).arrayId
  }
}

/** The example's own plot, captured when it loads, for the selector below */
let examplePlot: GardenPlot | null = null

/**
 * Whether the example garden is still the garden on screen.
 *
 * Derived from the plot itself, because a mode is only ever as good as the list of actions that
 * remember to clear it. If only the Clear button cleared it, applying a guided layout, which
 * replaces the plot, the array and every planting, would leave the banner up, and the app would
 * tell a grower "nothing here is yours yet" over their own garden, which reads as the guided setup
 * having done nothing at all. Drawing a bed by hand would do the same.
 *
 * It's the PLOT alone. The whole `PersistedDesign` was the first attempt and was wrong in the
 * other direction: that record also carries the sidebar step, the overlay settings and the
 * resolved site, so opening the questions and letting them resolve a location took the label off
 * a scene that was still entirely the shipped example. "Nothing here is yours yet" is a claim
 * about the garden, whichever tab is open and wherever the visitor said they live. Comparing
 * by identity is what immer makes correct: an untouched plot keeps its reference
 */
export const showingExample = (state: AppState): boolean =>
  state.example === 'showing' &&
  state.exampleProvenance !== null &&
  examplePlot !== null &&
  state.plot === examplePlot

const flushWrite = (): void => {
  const state = useAppStore.getState()
  const design = snapshotDesign(state)
  const written = writeDesign(storage, design, epochMillis(Date.now()))
  lastSeen = design
  // a design the boot couldn't read stays announced as discarded until the visitor has a
  // garden of their own on record: the write still lands (it carries the step they are on),
  // but a navigation over the shipped example is nothing of theirs, and the notice that their
  // old garden was dropped would otherwise vanish 600 ms after the first press on a step
  const keepDiscarded =
    state.storage.outcome === 'discarded' && written.outcome === 'saved' && showingExample(state)
  useAppStore.setState({ storage: keepDiscarded ? state.storage : written } as Partial<AppState>)
}

const scheduleWrite = debounce(flushWrite, WRITE_DELAY_MS)

if (storage !== null) {
  lastSeen = snapshotDesign(useAppStore.getState())
  useAppStore.subscribe((state) => {
    const next = snapshotDesign(state)
    // the derived slices move constantly during a bake and none of them is written, so the
    // comparison is what keeps a simulation from touching the store at all
    if (lastSeen !== null && sameDesign(next, lastSeen)) return
    lastSeen = next
    scheduleWrite()
  })
  // a reload during the debounce window would otherwise drop the last edit
  globalThis.addEventListener?.('pagehide', () => scheduleWrite.flush())
}

// outside the storage check above: undo works in a browser that keeps nothing between visits
trackHistory(useAppStore)

export const getAppState = (): AppState => useAppStore.getState()

export const resetAppStore = (): void => {
  runToken += 1
  recommendToken += 1
  // a price in flight across a reset would land on the store that replaced the one that asked
  priceToken += 1
  // a search in flight across a reset would otherwise land on the store that replaced the one
  // that asked for it, and its worker would outlive every reset in the suite
  designToken += 1
  // and the same for a comparison bake in flight, whose own worker would otherwise outlive
  // every reset in the suite exactly as the other two would without the lines below
  noPanelsToken += 1
  // and a place lookup in flight, which would mark its site ready over the store that replaced it
  siteToken += 1
  scheduleWrite.cancel()
  attempt(() => client?.terminate())
  client = null
  clientFailure = null
  attempt(() => search?.terminate())
  search = null
  searchFailure = null
  attempt(() => noPanelsWorker?.terminate())
  noPanelsWorker = null
  noPanelsWorkerFailure = null
  const fresh = initialData()
  lastSeen = snapshotDesign(fresh)
  startingDesign = lastSeen
  // the steps of the store that was replaced aren't steps of this one
  resetHistory(fresh)
  examplePlot = null
  useAppStore.setState(fresh as Partial<AppState>)
}

export const asyncMessage = <T>(state: AsyncState<T>): string | null =>
  state.status === 'error' ? state.message : null
