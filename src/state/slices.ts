import type { SitePart } from '../data/site'
import type { AccumulationProgress } from '../sim/backend'
import type { SimulationOptions } from '../sim/pipeline'
import type { BedCalendar } from '../types/calendar'
import type {
  FolkloreCompanionRule,
  PartitionedCompanionRules,
  RotationConstraint,
} from '../types/companion'
import type { ComplianceCheck } from '../types/compliance'
import type { Crop } from '../types/crop'
import type { EconomyInputs, RetailPrice } from '../types/economy'
import type { PvEnergyReport } from '../types/energy'
import type { DesignProgress } from '../recommend/design'
import type { Derivation, PlanRefusal } from '../recommend/planting'
import type { GroundCover } from '../types/ground'
import type { Bed, GardenPlot, Obstruction, Planting } from '../types/garden'
import type { LatLon, Polygon2D, Vec2M } from '../types/geo'
import type { ArrayId, BedId, CropId, ObstructionId, PlantingId, RuleId } from '../types/ids'
import type {
  BedLightSummary,
  CandidateArchetype,
  DesignScenario,
  LightZoneKind,
  ScenarioSet,
} from '../types/onboarding'
import type { NoPanelsComparison } from './counterfactual'
import type { ExampleProvenance } from './example'
import type { HistorySnapshot } from './history'
import type { WizardAnswers } from './onboarding'
import type { BedLight, DliRaster } from '../types/light'
import type {
  CompatibilityTermKind,
  CompatibilityWeights,
  PolycultureSuggestion,
  PreferenceKind,
  PreferenceSet,
  SuggestionSet,
} from '../types/polyculture'
import type { StorageStatus } from '../types/persist'
import type { PvArray } from '../types/pv'
import type { RecommendationSet } from '../types/recommend'
import type { SkySubdivision } from '../types/weather'
import type { LightingQuality } from '../types/render'
import type { ExceedancePercentile, Site } from '../types/site'
import type { TekDesignRule } from '../types/tek'
import type { EpochMillis, Fraction, MonthIndex } from '../types/units'
import type { MeasuredYear, TmySeries } from '../types/weather'
import type { SeasonYear } from '../simulation/year'
import type { SimulationState, YearChoice } from '../types/simulation'

export type AsyncState<T> =
  | { readonly status: 'idle' }
  | { readonly status: 'loading' }
  | { readonly status: 'ready'; readonly value: T }
  | { readonly status: 'error'; readonly message: string }

export const EMPTY_LIST: readonly never[] = []

/**
 * The oldest a garden is drawn at. Beyond this every perennial in the catalog is at full size,
 * so the slider and the seasons both stop counting at the same number
 */
export const MAX_PLANT_YEAR = 12

export const idle = <T>(): AsyncState<T> => ({ status: 'idle' })
export const loading = <T>(): AsyncState<T> => ({ status: 'loading' })
export const ready = <T>(value: T): AsyncState<T> => ({ status: 'ready', value })
export const failed = <T>(message: string): AsyncState<T> => ({ status: 'error', message })

export interface SiteSlice {
  readonly site: AsyncState<Site>
  readonly weather: AsyncState<TmySeries>
  /**
   * The measured years the typical one was assembled from. Empty until resolved, or where the
   * source has none
   */
  readonly years: readonly MeasuredYear[]
  readonly location: LatLon
  readonly locationLabel: string
  readonly frostPercentile: ExceedancePercentile
  /**
   * When the app will try the lookup again by itself, as a clock time, or null when it won't.
   *
   * The store keeps the promise a failed lookup's sentence makes by trying again by itself, and
   * this is what lets a panel print the countdown
   */
  readonly siteRetryAt: number | null
  /**
   * The parts of the lookup in flight that haven't landed yet, so the notice can name what's slow.
   * All of them when a lookup starts, fewer as each lands, and empty once it settles or when none
   * has run. Never saved with the design, since it describes a request that dies with the page
   */
  readonly sitePending: readonly SitePart[]
  /**
   * The country, when a geocoder named one, narrows the fallback clock to that country's zones:
   * tzdb records one point for all of India, so the nearest point to Mumbai is Karachi's
   */
  resolveSite(location: LatLon, label: string, countryCode?: string | null): Promise<void>
  /** Resolves `location` if nothing has yet, so no surface is blocked on a place already on screen */
  ensureSite(): Promise<void>
  setLocation(location: LatLon, label: string): void
  setFrostPercentile(percentile: ExceedancePercentile): void
}

/** A planting never changes the bed it belongs to or the identity it was added under */
export type PlantingPatch = Partial<Omit<Planting, 'id' | 'bedId'>>

export interface DesignSlice {
  readonly plot: GardenPlot | null
  readonly selectedBedId: BedId | null
  readonly selectedArrayId: ArrayId | null
  readonly selectedObstructionId: ObstructionId | null
  setPlot(plot: GardenPlot): void
  setBoundary(boundary: Polygon2D): void
  /**
   * What is lying on the ground. It changes the picture, the light on the beds and the energy
   * figures all three, which is why it's one field on the plot
   */
  setGroundCover(cover: GroundCover): void
  moveBoundaryVertex(index: number, position: Vec2M): void
  upsertBed(bed: Bed): void
  removeBed(id: BedId): void
  /**
   * Adds to any planting already carrying the same id, so a repeated add is more plants of it
   */
  addPlanting(planting: Planting): void
  removePlanting(bedId: BedId, plantingId: PlantingId): void
  updatePlanting(bedId: BedId, plantingId: PlantingId, patch: PlantingPatch): void
  /**
   * Re-derives a planting in another bed, or refuses with the reason. Returns the outcome,
   * without writing it to state: a refusal belongs to the gesture that caused it
   */
  movePlanting(plantingId: PlantingId, fromBedId: BedId, toBedId: BedId): Derivation<Planting>
  upsertArray(array: PvArray): void
  removeArray(id: ArrayId): void
  selectBed(id: BedId | null): void
  selectArray(id: ArrayId | null): void
  /** Replaces any obstruction already carrying the same id, or appends it (Decision Record 26) */
  upsertObstruction(house: Obstruction): void
  removeObstruction(id: ObstructionId): void
  selectObstruction(id: ObstructionId | null): void
  /**
   * Draws the default house outside the boundary and selects it. Null with no plot to draw one on
   */
  addHouse(): ObstructionId | null
  /**
   * Draws the default tree outside the boundary and selects it. Null with no plot to draw one on
   */
  addTree(): ObstructionId | null
  /**
   * Puts the design back to a snapshot kept by `state/history.ts`, and resets or keeps each slice
   * derived from it by the rules an edit of that field follows. Only the history calls it: a call
   * from anywhere else would be an edit like any other
   */
  restoreDesign(snapshot: HistorySnapshot): void
}

export interface LightSlice {
  readonly options: SimulationOptions
  readonly progress: AccumulationProgress | null
  readonly raster: AsyncState<DliRaster>
  readonly bedLight: readonly BedLight[]
  /**
   * The sky subdivision `bedLight` was read off, or null with no light at all.
   *
   * Kept separate from `raster`: a guided apply carries the search's own per-bed light across
   * before any raster in the editor has caught up with it, and a raster that goes idle after a
   * canceled re-bake leaves an editor reading in place with no `ready` raster left to read a
   * subdivision off. Set alongside `bedLight` at every one of its call sites
   */
  readonly bedLightSubdivision: SkySubdivision | null
  readonly compliance: readonly ComplianceCheck[]
  /**
   * The arrangement of panels and beds that `raster`, `bedLight` and `compliance` were
   * computed for, or null when nothing has been computed. Compared against the plot as it stands
   * by `lightIsStale`. See `state/light-freshness.ts` for why this is a key
   */
  readonly lightGeometry: string | null
  /** Annual PV energy for the plot as designed. Idle until run: there's no default figure */
  readonly energy: AsyncState<PvEnergyReport>
  setOptions(options: Partial<SimulationOptions>): void
  runFinal(): Promise<void>
  runEnergy(): void
  cancel(): void
}

export interface RecommendationSlice {
  readonly catalog: AsyncState<readonly Crop[]>
  readonly sets: AsyncState<readonly RecommendationSet[]>
  readonly calendars: AsyncState<readonly BedCalendar[]>
  /** Crops the last `applySuggestion` wouldn't turn into a planting, each with the reason */
  readonly planRefusals: readonly PlanRefusal[]
  readonly companionRules: AsyncState<PartitionedCompanionRules>
  readonly folklore: readonly FolkloreCompanionRule[]
  /** Loaded with the companion rules: the pair evaluator reads them for hard family conflicts */
  readonly rotationConstraints: readonly RotationConstraint[]
  readonly tekRules: AsyncState<readonly TekDesignRule[]>
  /** Recommendations follow edits on their own. The annual bake never does */
  readonly autoRun: boolean
  readonly autoRunQueued: boolean
  /**
   * A ranking run is in flight. `sets` keeps the LAST ranking while it runs, so the lists built on
   * it stay on screen: pressing Prefer on a crop blanks no list and leaves the column where it was.
   * `sets` is `loading` only while there's no ranking at all
   */
  readonly ranking: boolean
  /**
   * Whether the ranked lists show every crop or the top few. One flag for both lists that offer
   * the choice, because checking it on the planting panel, leaving the step, and returning for a
   * strawberry could find six herbs and an unchecked box, and because the second box further down
   * the same step could sit unchecked while the first stayed checked, which read as two lists
   */
  readonly showAllCrops: boolean
  loadCatalog(): Promise<void>
  loadEvidence(): Promise<void>
  /**
   * Ranks every bed and returns the sets it computed, or null when the run failed or couldn't
   * start. Returned as well as written because a caller that awaits a ranking and then
   * reads `sets` can read a ranking made for a different plot: `useAutoRecommend` starts runs
   * of its own, a later run wins the token, and this run then writes nothing to the store. What
   * it hands back is still the ranking for the plot it was asked about, and `generateGarden`
   * plants from that and from nothing else
   */
  recommend(): Promise<readonly RecommendationSet[] | null>
  cancelRecommend(): void
  setAutoRun(enabled: boolean): void
  setAutoRunQueued(queued: boolean): void
  setShowAllCrops(show: boolean): void
}

/**
 * The grower's own half of the recommender. `preferences` is the easy surface: four kinds
 * a novice can reason about. `influence` and `compatibilityWeights` are the deep one, and
 * neither carries a hardcoded blend anywhere else, so what the panel shows is what scores
 */
export interface PolycultureSlice {
  readonly preferences: PreferenceSet
  readonly compatibilityWeights: CompatibilityWeights
  readonly maxCropsPerBed: number
  readonly suggestions: AsyncState<SuggestionSet>
  /** A null kind clears the crop, so the picker never has to carry a fifth "none" kind */
  setPreference(cropId: CropId, kind: PreferenceKind | null): void
  setPreferenceWeight(cropId: CropId, weight: Fraction): void
  setPreferenceInfluence(influence: Fraction): void
  setCompatibilityWeight(kind: CompatibilityTermKind, weight: number): void
  resetCompatibilityWeights(): void
  setMaxCropsPerBed(count: number): void
  clearPreferences(): void
  suggest(): void
  /** Writes a suggestion's crops into its bed only through `addPlanting` */
  applySuggestion(suggestion: PolycultureSuggestion): void
}

/**
 * The two wildlife questions, as the grower answered them. Neither is a filter: they lean on the
 * ranking's own preference term and remove nothing, which is what lets a garden asked for natives
 * still be a garden of things anyone can eat.
 *
 * Deliberately NOT part of `WizardAnswers`. Those answers describe the array geometry the design
 * search bakes and compares, so changing one has to invalidate a completed search. These change
 * only the order crops come back in, and folding them in would throw away five bakes of real work
 * because somebody checked a box about bees
 */
export interface WildlifeChoices {
  readonly favorNative: boolean
  readonly favorPollinators: boolean
}

export interface WildlifeSlice {
  readonly wildlife: WildlifeChoices
  setWildlife(patch: Partial<WildlifeChoices>): void
}

export type EditorMode = 'select' | 'move' | 'draw-plot' | 'draw-bed'

/**
 * One section of the sidebar, in the order the garden itself depends on them.
 *
 * The order here is the physical one, and it's the only order in which the questions can be
 * answered: a place has weather, weather and geometry make a light field, and only a light field
 * can say which crops suit a bed.
 *
 * `sources` is deliberately last and deliberately not a step. Nothing downstream reads it and
 * nothing about the garden waits on it: it's the reference shelf, reachable at any time
 */
export type SidebarStep =
  | 'place'
  | 'ground'
  // what the grower wants from the space, asked before the panels because the layout search
  // reads it and after the ground because there's nothing to want from a space with no size
  | 'wants'
  | 'panels'
  | 'light'
  | 'plants'
  | 'calendar'
  | 'seasons'
  | 'check'
  | 'sources'

/** The steps in their one order, for the persisted step's decoder and for the Next control */
export const SIDEBAR_STEPS: readonly SidebarStep[] = [
  'place',
  'ground',
  'wants',
  'panels',
  'light',
  'plants',
  'calendar',
  'seasons',
  'check',
  'sources',
]
export type OverlayChannel = 'dli' | 'rsr' | 'sky-view-factor' | 'rain'
export type OverlaySlice = MonthIndex | 'annual'

/**
 * The overlay playback's whole state in one field: the month currently drawn, and whether the
 * months elapsed are being accumulated or shown one at a time. `from` is the month the
 * run started on, when every month since is to be included. It's null when each frame stands on
 * its own, which is the original one-month-at-a-time playback
 */
export interface OverlayPlayback {
  readonly month: MonthIndex
  readonly from: MonthIndex | null
}

export interface OverlaySettings {
  readonly visible: boolean
  readonly slice: OverlaySlice
  readonly channel: OverlayChannel
  readonly opacity: number
}

/**
 * The renderer's optional effects, each switchable on its own. They cost frame time and they
 * change what the picture says, so neither the tier nor this file gets to decide for the grower
 */
export interface EffectSettings {
  readonly ambientOcclusion: boolean
}

/**
 * What the pointer is over in the 3D, named once here so no reader has to guess it from a raycast
 * of their own. It's UI state: hovering names a thing without changing it, and nothing here is
 * persisted or undoable
 */
export type HoverTarget =
  | { readonly kind: 'bed'; readonly bedId: BedId }
  | { readonly kind: 'planting'; readonly bedId: BedId; readonly plantingId: PlantingId }
  | { readonly kind: 'array'; readonly arrayId: ArrayId }

/**
 * The one thing a phone-sized screen is showing.
 *
 * `chat` exists only in a build made with `VITE_AGENT=on`. See `src/agent/flag.ts` for why the
 * default is off. It's a plain value here, because a persisted surface has
 * to be a nameable one either way: a design saved from a build that had the agent and restored
 * into one that doesn't must still describe what it was showing, and `src/state` isn't the
 * layer that should know which features a build carries
 */
export type Surface = 'garden' | 'edit' | 'chat'

/**
 * The unit every length field and summary in the sidebar is shown in. Saved with the design, the
 * way `sidebarStep` is: a plot sized in feet should read its feet back on the next visit
 */
export type LengthUnit = 'm' | 'ft'

export interface UiSlice {
  /**
   * What the pointer is over, or null. Selection is a click and stays until the next click.
   * This is the lighter statement, and the two are kept apart so that moving the mouse across a
   * garden can never rewrite which bed the sidebar is editing
   */
  readonly hovered: HoverTarget | null
  /**
   * The month the overlay is playing, or null when it's not playing.
   *
   * Transient on purpose. `overlay.slice` is part of the persisted design, so stepping it twelve
   * times a run would rewrite storage on a timer and hand the grower back a month they never
   * chose. This overrides what is DRAWN and leaves what they picked alone, the same way
   * `previewPlot` overrides the plot without committing it
   */
  readonly overlayPlayback: OverlayPlayback | null
  readonly mode: EditorMode
  /**
   * Which single surface a narrow screen is showing.
   *
   * Above the breakpoint it is read by nothing: there's room for the garden and the editor at
   * once and they both stay up. Below it there is not, and the measurements that decided this
   * are worth keeping. On a 360x640 phone the toolbar took 124px, the example banner and the
   * legend covered 88% of the canvas between them, and the sidebar was left 119px to show 1,300px
   * of editor. The garden itself got 47px, seven percent of the screen, which isn't a small
   * version of the desktop layout but a different and much worse product.
   *
   * Not persisted: a first visit with no saved design opens on the editor, step one, and a
   * returning one on the garden it saved
   */
  readonly surface: Surface
  /** Persisted with the design, so a reload lands on the step the grower was reading */
  readonly sidebarStep: SidebarStep
  /**
   * Persisted with the design, like `sidebarStep`. The switch lives on the plot's own size
   * question and every other length field and summary in the sidebar reads and writes through it
   */
  readonly lengthUnit: LengthUnit
  readonly draft: readonly Vec2M[]
  readonly overlay: OverlaySettings
  /** The grower's own override of `overlayOffOnSeasons`. Not persisted, and on by default */
  readonly overlayOnSeasons: boolean
  /**
   * The plan column across the whole window, with the garden put away until asked for. Eleven beds'
   * worth of calendar in a 380px column holds a reader's eyes on one side of the screen for too
   * long. Not persisted, and never on a phone, where the tabs already take turns
   */
  readonly widePlan: boolean
  readonly timeUtcMillis: EpochMillis
  /**
   * The real day, read once at startup. Never written by the sun slider, and never persisted:
   * a "today" restored from a design saved last autumn would be a lie the moment it loaded
   */
  readonly todayUtcMillis: EpochMillis
  readonly imageryEnabled: boolean
  /** Render cost ceiling for the sky IBL and the cascades. It decides nothing about the design */
  readonly lighting: LightingQuality
  readonly effects: EffectSettings
  /**
   * How old the garden is drawn as: the year a perennial has reached, which is what decides how
   * near its mature size it is laid out at.
   *
   * A slider on the bed panel, and whatever the seasons have counted to. Running a season IS a year
   * passing, so the two are one number and the season is the one that writes it. The slider stays
   * because previewing year 8 without running eight seasons is a designer's question
   */
  readonly plantYear: number
  /**
   * True while something in the 3D owns the pointer: a plot or draft vertex being dragged, or
   * a bed or an array being moved in Move mode.
   *
   * The vertex spheres draw themselves outside r3f, so a press on one also reaches `Ground`'s
   * `onPointerDown` and would clear the selection from under the drag. This is what the
   * selection handlers ask before treating a press as a click
   */
  readonly dragging: boolean
  /**
   * The crop currently being carried from the ranked picker toward a bed, or null.
   *
   * A crop: what is dragged is "I would like some of this", and what a bed
   * can actually take is derived once it lands, by the same code the Add planting button uses
   */
  readonly carrying: CropId | null
  /**
   * A crop dropped on a bed, waiting for the bed panel to compute what that would mean.
   *
   * Deliberately NOT a planting. A drop can't be allowed to plant something silently, because
   * the honest answer is often a refusal with a reason: a bed with 0.11 m² free can't take a
   * squash, and saying so is the product working. So a drop stages the choice against the bed it
   * landed on, and the existing Add planting press, with the sow date and the refusal in view,
   * remains the thing that writes it
   */
  readonly dropped: { readonly bedId: BedId; readonly cropId: CropId } | null
  carry(cropId: CropId | null): void
  dropOnBed(bedId: BedId): void
  clearDropped(): void
  setMode(mode: EditorMode): void
  setSurface(surface: Surface): void
  setSidebarStep(step: SidebarStep): void
  setLengthUnit(unit: LengthUnit): void
  pushDraftVertex(point: Vec2M): void
  moveDraftVertex(index: number, point: Vec2M): void
  undoDraftVertex(): void
  commitDraft(): void
  cancelDraft(): void
  setOverlay(settings: Partial<OverlaySettings>): void
  setOverlayOnSeasons(value: boolean): void
  setWidePlan(wide: boolean): void
  setOverlayPlayback(playback: OverlayPlayback | null): void
  setHovered(target: HoverTarget | null): void
  setTime(utcMillis: EpochMillis): void
  setImagery(enabled: boolean): void
  setLighting(quality: LightingQuality): void
  setEffects(effects: Partial<EffectSettings>): void
  setPlantYear(year: number): void
  setDragging(dragging: boolean): void
}

/**
 * The design is kept in this browser and nowhere else. Only what the grower authored is
 * written: `src/state/persist.ts#PERSISTED_KEYS` is the list, and everything derived is
 * left to be recomputed fresh
 */
export interface StorageSlice {
  readonly storage: StorageStatus
  saveDesign(): void
  /** Forgets the stored design and returns the app to its starting state */
  clearDesign(): void
}

/**
 * The questions, for someone who has never heard of a ground cover ratio. Every one asks
 * something answerable without knowing any of this, and the mapping onto geometry is the
 * design engine's job.
 *
 * These are the AGENT's cursor and nothing else: which question it is waiting on an answer to,
 * advanced through `setOnboardingStep` as answers land. The sidebar asks the same questions on its
 * own steps (`SidebarStep`) and never reads this.
 *
 * `results` and `planting` stay on the list although neither is a question, because the
 * agent's router leans on them: standing on `results`, "go" and "yeah go for it" mean the
 * layouts on the table, and without that lean the embedding router read a bare "go" as an undo.
 * The store moves the cursor there when the search runs and when a layout is applied
 */
export type OnboardingStep =
  | 'location'
  | 'space'
  // what is ALREADY standing around the space, which is a fact about the site, and is
  // therefore asked with the other facts about it
  | 'surroundings'
  | 'growing'
  // after `growing`, deliberately. This asks how the light should split between the panels and
  // the plants, and nobody can weigh that before they have said what they want to eat
  | 'objective'
  | 'mounting'
  | 'height'
  | 'water'
  // the two wildlife questions, at the end of the run. Neither reaches the design search, so the
  // layouts are computed from everything above and these two are still answered before any crop is
  // picked, which is the only thing they change
  | 'natives'
  | 'pollinators'
  | 'results'
  | 'planting'

/**
 * One question per step, and that is the rule.
 *
 * Four unrelated decisions on one screen, such as what stands around the space, how the panels
 * should sit, whether there's a height limit and whether it can be watered, is the load spike, and
 * splitting them costs four entries in a table and no logic at all
 */
export const ONBOARDING_STEPS: readonly OnboardingStep[] = [
  'location',
  'space',
  'surroundings',
  'growing',
  'objective',
  'mounting',
  'height',
  'water',
  'natives',
  'pollinators',
  'results',
  'planting',
]

export interface OnboardingState {
  readonly step: OnboardingStep
  readonly designs: AsyncState<ScenarioSet>
  /**
   * Where the design search has got to while `designs` is loading, and null at every other
   * moment. It's kept apart from `LightSlice.progress` because it counts a run of five
   * bakes, while the editor's is a single one, and both can be on screen at once
   */
  readonly progress: DesignProgress | null
  readonly appliedArchetype: CandidateArchetype | null
}

/** One bed as it was generated: where it sits in the light, why, and what went into it */
export interface GeneratedBed {
  readonly bedId: BedId
  readonly label: string
  readonly zone: LightZoneKind
  readonly summary: BedLightSummary
  readonly reason: string
  readonly cropIds: readonly CropId[]
  /**
   * What standing here costs, measured against the brightest bed of the same plot: the crops the
   * light gate refuses here and admits there. Empty for the brightest bed itself, and for a plot
   * with nothing over it, where every bed reads the same sky.
   *
   * The comparison is deliberately WITHIN the plot. The open-sky control the wizard bakes plays
   * no part in it. It's the question a grower actually asks standing in front of two beds two
   * meters apart, it needs no second bake, and it's the same answer on a garden drawn by hand
   * as on one the wizard placed
   */
  readonly lostToShade: readonly CropId[]
}

/**
 * The record of one guided generation, kept so the grower can read what was done and undo
 * it. Refusals are first class here for the same reason they are in the polyculture panel:
 * a crop that was dropped is more useful to know about than the one that replaced it
 */
export interface GardenGeneration {
  /** The layout the search applied, or null when the plot was planted as it stood */
  readonly archetype: CandidateArchetype | null
  readonly explanation: string
  readonly beds: readonly GeneratedBed[]
  readonly plantingCount: number
  /**
   * What carrying panels at all costs this plot: the crops the open-sky control admits and this
   * design's shade refuses, straight off the scenario that was applied.
   *
   * This is the OTHER half of `GeneratedBed.lostToShade`, and the two answer different questions
   * on purpose. A bed's figure compares it with the brightest bed of the same plot, which is the
   * one a grower can walk over and look at. This one compares the whole plot with the open sky
   * it would have had with nothing built on it, which no bed can see from where it stands and
   * only the wizard's control bake knows. It's empty for a hand-drawn garden and for the
   * no-array control, where there's nothing to have given up
   */
  readonly plotLostToShade: readonly CropId[]
  /** Anything the placement wouldn't do, in words */
  readonly layoutRefusals: readonly string[]
  readonly plantRefusals: readonly PlanRefusal[]
  /**
   * The combinations each bed was offered by the run that planted it, first of each applied.
   *
   * Carried as is, so what the question shows is what the run chose from. Cards rebuilt from the
   * live state would drift once the ranking re-ran on the applied plot, and the beds could hold a
   * crop no card named
   */
  readonly suggestions: readonly GeneratedBedSuggestions[]
}

/** One bed's suggestion set from the guided run, with the label the cards print */
export interface GeneratedBedSuggestions {
  readonly bedId: BedId
  readonly label: string
  readonly set: SuggestionSet
}

export interface OnboardingSlice {
  readonly onboarding: OnboardingState
  /**
   * What the grower said they want, and how the panels may sit. A slice of its own beside
   * `wildlife`, outside `onboarding`: it's theirs and is persisted with
   * the design, where the search's state around it is derived and never written
   */
  readonly answers: WizardAnswers
  /**
   * A scenario drawn in the scene without being committed. Deliberately NOT part of the
   * persisted design: previewing writes nothing, undoes nothing and is never ranked, so
   * hovering five cards leaves no trace once the cursor moves off
   */
  readonly previewPlot: GardenPlot | null
  /** Which scenario the preview is showing, so the card that asked for it can say so */
  readonly previewArchetype: CandidateArchetype | null
  /** What the last guided generation did, or null when nothing has been generated */
  readonly generated: GardenGeneration | null
  /** The plot as it stood before that generation, which is what undoing restores */
  readonly generationUndo: GardenPlot | null
  /**
   * A generation is in flight: the beds are bare, the light and the ranking are being settled, and
   * the plantings are about to land. Without this flag the plants step would read the bare beds as
   * "Nothing planted yet" for the second that takes, right after the press that planted them
   */
  readonly planting: boolean
  previewScenario(archetype: CandidateArchetype | null): void
  setOnboardingStep(step: OnboardingStep): void
  answerOnboarding(patch: Partial<WizardAnswers>): void
  /** Runs the design search against the answers as they stand, and opens the panels step on it */
  suggestDesigns(): Promise<void>
  /** Abandons the wait and the result that would land from it, keeping every answer */
  cancelDesignSuggestions(): void
  /**
   * Writes the plot, the beds this scenario's own light placed, the array and a planting in
   * every bed, through the editor's own actions and nothing else
   */
  applyDesign(scenario: DesignScenario): Promise<void>
  /**
   * Plants the plot as it stands, bed by bed, the way a guided apply does: the full light check
   * first when the light is missing or stale, then the ranking, then the best combination each
   * bed's light admits, no bed repeating another's when a different one fits. Records what it
   * did on `generated` with no archetype, and the plot before it on `generationUndo`
   */
  plantEveryBed(): Promise<void>
  /** Puts the plot back exactly as it was before the generation */
  undoGeneration(): void
}

/**
 * `absent` is both "not looked for yet" and "not there": a deploy without the asset, a 404, an
 * envelope this build can't decode. `showing` means the design on screen is the shipped example,
 * which is the only state the banner appears in
 */
export type ExampleStatus = 'absent' | 'loading' | 'showing' | 'cleared'

/**
 * The worked example the app opens on when this browser holds no design of its own. It's a real
 * `PersistedDesign` read through the same decoders as a restored one, with a raster this
 * simulation baked, and it exists so the first thing a visitor sees is the finished product.
 * It's never written to storage: only an edit the visitor authors is
 */
export interface ExampleSlice {
  readonly example: ExampleStatus
  /** What the shipped asset says about how its light field was produced, or null when absent */
  readonly exampleProvenance: ExampleProvenance | null
  /**
   * Whether the notice over the scene has been closed. Not persisted, and NOT the same thing as
   * clearing the example.
   *
   * Keeping them apart lets a visitor who simply wants to stop reading a 226px card close it
   * without deleting the garden it describes. On a 360px phone that card and the legend covered 88%
   * of the canvas between them
   */
  readonly exampleNoticeDismissed: boolean
  loadExample(): Promise<void>
  /** Puts the notice away and leaves the garden exactly where it is */
  dismissExampleNotice(): void
  /** Takes the example off the screen and leaves the starting plot */
  clearExample(): void
}

/**
 * The garden run forward, a season at a time, by `src/simulation/` (Decision Record 14).
 *
 * `simulation` is the grower's own and is persisted with the design: the ground's memory, the
 * trials in progress and the seed the hidden truths were drawn from. `seasonYears` is derived,
 * once per resolved site, and `simulationNotice` is why the last press did nothing
 */
export interface SimulationSlice {
  readonly simulation: SimulationState
  readonly seasonYears: readonly SeasonYear[] | null
  /**
   * What a kilowatt-hour costs to buy at the resolved site, or null.
   *
   * Transient and never persisted, like `seasonYears`: it's looked up once per place and a
   * saved garden must not carry last year's price to a machine that would show it as this
   * year's. Null off the US grid, until the lookup lands, and whenever it fails, which the
   * season and the panel both treat as the same supported answer
   */
  readonly retailPrice: RetailPrice | null
  /**
   * What the grower typed about money, persisted with the design: their tariff and its currency,
   * which stand in for `retailPrice` wherever typed, and what the panels cost, which stands in
   * for the US-dollar benchmark. Each figure is null until typed
   */
  readonly economyInputs: EconomyInputs
  readonly simulationNotice: string | null
  /**
   * True while the season just run is being played through on the scene's clock, so the plants
   * grow before the outcome lands on them. Transient, like `overlayPlayback`. `ui/useSeasonSweep`
   * drives it and the scene reads it
   */
  readonly sweeping: boolean
  /**
   * The same year with no panels, for the LAST season that ran: the plot with every array
   * pulled, baked again and run through that season's own science. Never
   * persisted and never written into `simulation`: it carries its own season number, and a
   * later season run clears it, without leaving it to describe a season that has moved on
   */
  readonly noPanels: AsyncState<NoPanelsComparison>
  runSeason(): void
  /** Bakes and re-runs the last season with the arrays stripped, keeping only the harvest */
  compareWithoutPanels(): Promise<void>
  setSweeping(sweeping: boolean): void
  setEconomyInputs(patch: Partial<EconomyInputs>): void
  setYearChoice(choice: YearChoice): void
  /** Forgets every season run and keeps the seed, so the hidden truths aren't re-rolled */
  resetSimulation(): void
  revealRule(id: RuleId): void
}

export type AppState = SiteSlice &
  DesignSlice &
  LightSlice &
  SimulationSlice &
  RecommendationSlice &
  PolycultureSlice &
  WildlifeSlice &
  UiSlice &
  StorageSlice &
  ExampleSlice &
  OnboardingSlice
