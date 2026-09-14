import { DEFAULT_ECONOMY_INPUTS, isCurrencyCode } from '../data/economy'
import { DEFAULT_FROST_PERCENTILE } from '../data/site'
import { DEFAULT_COMPATIBILITY_WEIGHTS } from '../recommend/compatibility'
import { DEFAULT_MAX_CROPS_PER_BED, emptyPreferences } from '../recommend/suggest'
import type { Bed, GardenPlot } from '../types/garden'
import { isGroundCover, nearestGroundCover } from '../types/ground'
import {
  SCHEMA_VERSION,
  type PersistEnvelope,
  type StorageOutcome,
  type StorageStatus,
} from '../types/persist'
import type { PvArray } from '../types/pv'
import type { SeasonEconomy, SimulationState } from '../types/simulation'
import { epochMillis, type EpochMillis } from '../types/units'
import {
  DEFAULT_EFFECTS,
  DEFAULT_LOCATION,
  DEFAULT_LOCATION_LABEL,
  DEFAULT_OVERLAY,
  DEFAULT_WILDLIFE,
  defaultSimulation,
  makePlot,
} from './defaults'
import { YEAR_CHOICES } from '../simulation/year'
import { withDerived } from './derive'
import { polygonAreaM2 } from './geom'
import { DEFAULT_WIZARD_ANSWERS } from './onboarding'
import { attempt, attemptOr, messageOf } from './safe'
import { SIDEBAR_STEPS, type AppState } from './slices'

export const STORAGE_KEY = 'agrivoltaic-garden-designer/design'

/**
 * The agent's transcript, which is NOT part of the design and IS forgotten with it.
 *
 * A transcript is worthless without the design it describes, and leaving one behind means
 * somebody who cleared their garden comes back to a conversation about a plot that no longer
 * exists. So it lives outside the envelope, for the size and schema reasons that keep a growing
 * list of sentences out of a versioned payload, and `removeDesign` takes it too
 */
export const TRANSCRIPT_KEY = 'agrivoltaic-garden-designer/agent-transcript'

/**
 * That somebody agreed to spend 45 MB on the better router, which is a fact about their
 * connection.
 *
 * So `removeDesign` does NOT take it: forgetting a plot isn't a reason to ask again for a
 * download that has already happened and is already in the browser's cache. Only "yes" is ever
 * written. Silence means the offer is still standing, which is what an unanswered offer is
 */
export const MODEL_CHOICE_KEY = 'agrivoltaic-garden-designer/agent-model'

/**
 * The design, and nothing derived from it.
 *
 * Deliberately absent: `raster`, whose twenty-seven Float32Arrays over ~85,000 cells
 * serialize to about 40 MB against a ~5 MB synchronous origin quota (both numbers are
 * measured in persist.test.ts, against 5.6 kB for the design itself). `weather` is absent
 * too: it's eight typed arrays over 8,760 hours and doesn't survive JSON at all. So is `site`,
 * which is only meaningful paired with that weather and carries a `Banded<Fraction>` besides.
 * So are `energy`, `sets`, `calendars`, `plan` and `suggestions`, every one of which is derived
 * and cheap to recompute. A stale number presented as current is worse than no number,
 * so all of them come back idle and the grower re-runs them.
 *
 * `sidebarStep` is here again, since 2026-09-10, after being taken out once. It went because a
 * remembered step could be locked on return, every derived slice coming back idle, and because a
 * persisted field is a field whose change schedules a write, so looking around the sidebar after
 * "forget this design" wrote the default design back. Both still hold. What changed is that the
 * questions became sidebar steps: a reload that remembered the plot and forgot that its grower
 * had said "mostly food" and was reading the plants step read as the app forgetting, which is
 * worse than either. A locked step says what it's waiting on and offers the press; the write
 * after a reset costs one status line
 */
export const PERSISTED_KEYS = [
  'location',
  'locationLabel',
  'frostPercentile',
  'plot',
  'selectedBedId',
  'selectedArrayId',
  'preferences',
  'compatibilityWeights',
  'maxCropsPerBed',
  // the grower's own answer about what the garden is for beyond eating it, so it's theirs to
  // keep. The region it is judged against isn't persisted with it: that is sampled from the
  // resolved site, and a stored one would outlive the place it was sampled at
  'wildlife',
  'overlay',
  'imageryEnabled',
  'lighting',
  'effects',
  'plantYear',
  // the seasons the grower has run: the ground's memory, the trials in progress and the seed
  // the hidden truths came from are theirs, and a reload that forgot them would re-roll a garden
  'simulation',
  // what they said they want from the space and how the panels may sit: preferences only, since the
  // plot size is read off the boundary
  'answers',
  'sidebarStep',
  // what they typed about money: a tariff the app has no source for outside the United States,
  // its currency, and what the panels cost. Theirs to keep, like a typed soil pH
  'economyInputs',
] as const satisfies readonly (keyof AppState)[]

export type PersistedKey = (typeof PERSISTED_KEYS)[number]

export type PersistedDesign = { readonly [K in PersistedKey]: AppState[K] }

export const defaultDesign = (): PersistedDesign => ({
  location: DEFAULT_LOCATION,
  locationLabel: DEFAULT_LOCATION_LABEL,
  /**
   * The risk a beginner is opted into before they know the dial exists.
   *
   * Every sowing date the calendar and the agenda print is derived from it. At 50, which
   * `ui/calendar.ts` offers as "Take a chance: 1 spring in 2", the default would quietly tell a
   * first-time grower to plant on a date that loses the planting half the time. It's
   * `DEFAULT_FROST_PERCENTILE`, 20, the figure `data/site.ts` uses for the same decision
   */
  frostPercentile: DEFAULT_FROST_PERCENTILE,
  plot: makePlot(),
  selectedBedId: null,
  selectedArrayId: null,
  preferences: emptyPreferences(),
  compatibilityWeights: DEFAULT_COMPATIBILITY_WEIGHTS,
  maxCropsPerBed: DEFAULT_MAX_CROPS_PER_BED,
  wildlife: DEFAULT_WILDLIFE,
  overlay: DEFAULT_OVERLAY,
  imageryEnabled: false,
  lighting: 'auto',
  effects: DEFAULT_EFFECTS,
  plantYear: 1,
  simulation: defaultSimulation(),
  answers: DEFAULT_WIZARD_ANSWERS,
  sidebarStep: 'place',
  economyInputs: DEFAULT_ECONOMY_INPUTS,
})

export const snapshotDesign = (state: PersistedDesign): PersistedDesign =>
  Object.fromEntries(PERSISTED_KEYS.map((key) => [key, state[key]])) as unknown as PersistedDesign

/** Immer keeps untouched slices referentially stable, so identity per key is the test */
export const sameDesign = (a: PersistedDesign, b: PersistedDesign): boolean =>
  PERSISTED_KEYS.every((key) => a[key] === b[key])

/* -------------------------------- what it says --------------------------------- */

export const STORAGE_UNAVAILABLE =
  "This browser won't let the page store anything locally (private browsing modes do this), so the design can't be kept between visits"

export const STORAGE_IDLE =
  'Kept in this browser only, and never uploaded. Edits save automatically a moment after you stop'

export const STORAGE_RESTORED =
  'Restored the design saved in this browser. The light and energy runs start from idle; no result was stored with it'

export const STORAGE_SAVED = 'Saved in this browser. Nothing left the browser'

export const STORAGE_CLEARED =
  'Removed the saved design from this browser and started again from the default design'

export const STORAGE_QUOTA =
  'This browser has no room left for the design, so nothing was saved. Free some space for this site, or remove beds or arrays you no longer need'

export const repairedMessage = (dropped: readonly PersistedKey[]): string =>
  `Restored the design saved in this browser, but ${String(dropped.length)} stored field(s) couldn't be read and were reset to their defaults: ${dropped.join(', ')}`

export const discardedMessage = (reason: string): string =>
  `The design saved in this browser couldn't be loaded: ${reason}. This is the default design, and saving replaces the unreadable copy`

export const failedMessage = (reason: string): string =>
  `The design couldn't be saved in this browser: ${reason}`

const status = (
  outcome: StorageOutcome,
  message: string,
  bytes = 0,
  savedAtUtcMillis: EpochMillis | null = null,
): StorageStatus => ({ outcome, message, bytes, savedAtUtcMillis })

export const IDLE_STATUS = status('idle', STORAGE_IDLE)

/* --------------------------------- migration ----------------------------------- */

type Migration = (design: unknown) => unknown

/**
 * One entry per version step: `MIGRATIONS[n]` carries a schema `n` payload to `n + 1`. A
 * persist.test.ts test walks every version below SCHEMA_VERSION and fails the moment one of
 * them has no entry here, so bumping SCHEMA_VERSION without adding the matching step can't
 * pass silently and wipe every saved garden the way an unchecked bump would
 */
export const MIGRATIONS: Readonly<Record<number, Migration>> = {
  /**
   * 1 to 2: the wildlife answers arrived, and a design saved before them has no such key.
   *
   * Without this step the decoder meets `undefined`, rejects it like any malformed value, and every
   * returning visitor is told "1 stored field(s) couldn't be read and were reset to their
   * defaults: wildlife" on their first load after the deploy. Nothing is unreadable. A field that
   * didn't exist when the design was written is exactly what this machinery is for
   */
  1: (design) =>
    isRecord(design) && design.wildlife === undefined
      ? { ...design, wildlife: DEFAULT_WILDLIFE }
      : design,
  /**
   * 2 to 3: the season simulation arrived, and a design saved before it has run no seasons.
   * Same shape as the step above: absent means earlier
   */
  2: (design) =>
    isRecord(design) && design.simulation === undefined
      ? { ...design, simulation: defaultSimulation() }
      : design,
  /**
   * 3 to 4: the answers and the open step joined the design when the questions became sidebar
   * steps. A design saved before that answered nothing and opens on the first step, which is
   * where it would have opened anyway
   */
  3: (design) =>
    isRecord(design)
      ? {
          ...design,
          answers: design.answers === undefined ? DEFAULT_WIZARD_ANSWERS : design.answers,
          sidebarStep: design.sidebarStep === undefined ? 'place' : design.sidebarStep,
        }
      : design,
  /**
   * 4 to 5: a house could now be drawn on the ground, and a design saved before that has
   * nothing drawn. A payload with no plot at all is left alone: there's nothing to draw a
   * house on
   */
  4: (design) =>
    isRecord(design) && isRecord(design.plot) && design.plot.obstructions === undefined
      ? { ...design, plot: { ...design.plot, obstructions: [] } }
      : design,
}

export type Migrated =
  | { readonly ok: true; readonly design: unknown }
  | { readonly ok: false; readonly reason: string }

export const migrateDesign = (version: unknown, design: unknown): Migrated => {
  if (typeof version !== 'number' || !Number.isInteger(version)) {
    return { ok: false, reason: 'it carries no schema version' }
  }
  if (version > SCHEMA_VERSION) {
    return {
      ok: false,
      reason: `it was written by a newer version of this app (schema ${String(version)}, this build reads ${String(SCHEMA_VERSION)})`,
    }
  }
  let current = version
  let carried = design
  while (current < SCHEMA_VERSION) {
    const step = MIGRATIONS[current]
    if (step === undefined) {
      return {
        ok: false,
        reason: `this build has no migration from schema ${String(current)} to ${String(current + 1)}`,
      }
    }
    carried = step(carried)
    current += 1
  }
  return { ok: true, design: carried }
}

/* --------------------------------- decoding ------------------------------------ */

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const num = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value)
const str = (value: unknown): value is string => typeof value === 'string'
const bool = (value: unknown): value is boolean => typeof value === 'boolean'
const list = (value: unknown): value is readonly unknown[] => Array.isArray(value)
const oneOf = <T extends string | number>(allowed: readonly T[], value: unknown): value is T =>
  allowed.includes(value as T)

const isVec = (value: unknown): boolean => isRecord(value) && num(value.xM) && num(value.yM)
const isRing = (value: unknown): boolean =>
  list(value) && value.length >= 3 && value.every((point) => isVec(point))
const isPolygon = (value: unknown): boolean =>
  isRecord(value) && isRing(value.exterior) && list(value.holes) && value.holes.every(isRing)

const isPlanting = (value: unknown): boolean =>
  isRecord(value) &&
  str(value.id) &&
  str(value.bedId) &&
  str(value.cropId) &&
  str(value.role) &&
  str(value.tier) &&
  num(value.sowDay) &&
  num(value.harvestStartDay) &&
  num(value.harvestEndDay) &&
  num(value.plantCount)

const isBed = (value: unknown): boolean =>
  isRecord(value) &&
  str(value.id) &&
  str(value.label) &&
  isPolygon(value.footprint) &&
  isRecord(value.soil) &&
  num(value.soil.phUnits) &&
  isRecord(value.irrigation) &&
  num(value.raisedHeightM) &&
  list(value.modifiers) &&
  list(value.waterHarvesting) &&
  list(value.plantings) &&
  value.plantings.every(isPlanting)

const TRACKING_MODES = [
  'fixed',
  'single-axis-horizontal-ns',
  'single-axis-tilted',
  'dual-axis',
  'agro-optimized',
] as const

const isTracker = (value: unknown): boolean => {
  if (!isRecord(value) || !oneOf(TRACKING_MODES, value.mode)) return false
  if (value.mode === 'fixed') return num(value.tiltDeg) && num(value.surfaceAzimuthDeg)
  return num(value.maxRotationDeg)
}

// pitch and module size divide in the layout and the ground cover ratio, so a stored zero
// is a division by zero in the scene rather than a merely odd design
const isGeometry = (value: unknown): boolean =>
  isRecord(value) &&
  num(value.collectorWidthM) &&
  num(value.pitchM) &&
  value.pitchM > 0 &&
  num(value.rowLengthM) &&
  num(value.rowCount) &&
  num(value.modulesPerRow) &&
  num(value.clearanceHeightM) &&
  num(value.rowAzimuthDeg) &&
  isVec(value.originM)

const isModule = (value: unknown): boolean =>
  isRecord(value) &&
  num(value.widthM) &&
  value.widthM > 0 &&
  num(value.heightM) &&
  value.heightM > 0 &&
  num(value.nameplateWp) &&
  num(value.bifacialityFactor) &&
  num(value.transmittanceFraction) &&
  num(value.rearReflectance) &&
  str(value.backsheet)

const isArray = (value: unknown): boolean =>
  isRecord(value) &&
  str(value.id) &&
  str(value.label) &&
  isGeometry(value.geometry) &&
  isTracker(value.tracker) &&
  isModule(value.module)

/**
 * A tree's crown: a base at or above the ground, a top above that, in leaf and bare both
 * fractions of light (Decision Record 26)
 */
const isTree = (value: Record<string, unknown>): boolean =>
  num(value.crownBaseM) &&
  value.crownBaseM >= 0 &&
  num(value.heightM) &&
  value.heightM > value.crownBaseM &&
  bool(value.evergreen) &&
  num(value.transmittance) &&
  value.transmittance >= 0 &&
  value.transmittance <= 1 &&
  num(value.leaflessTransmittance) &&
  value.leaflessTransmittance >= 0 &&
  value.leaflessTransmittance <= 1

/**
 * A house or a tree: a box the bake shades with, four corners or it is not the box the bake would
 * shade with. A house needs only a height greater than zero, and anything else must be a tree with
 * a sound crown, or the whole obstruction is dropped like a malformed bed (Decision Record 26)
 */
const isObstruction = (value: unknown): boolean =>
  isRecord(value) &&
  str(value.id) &&
  str(value.label) &&
  isPolygon(value.footprint) &&
  isRecord(value.footprint) &&
  list(value.footprint.exterior) &&
  value.footprint.exterior.length === 4 &&
  (value.kind === 'house'
    ? num(value.heightM) && value.heightM > 0
    : value.kind === 'tree' && isTree(value))

const isPlot = (value: unknown): boolean =>
  isRecord(value) &&
  str(value.id) &&
  str(value.siteId) &&
  str(value.label) &&
  isPolygon(value.boundary) &&
  num(value.northOffsetDeg) &&
  isVec(value.originOffsetM) &&
  list(value.beds) &&
  value.beds.every(isBed) &&
  list(value.arrays) &&
  value.arrays.every(isArray) &&
  list(value.obstructions) &&
  value.obstructions.every(isObstruction) &&
  // either spelling: a design saved before ground cover existed carries the albedo instead
  (isGroundCover(value.groundCover) || num(value.groundAlbedo))

/**
 * Area and the derived array metrics are recomputed from the geometry rather than trusted:
 * a build that changes how either is derived must not read back yesterday's number
 */
const normalizePlot = (plot: GardenPlot): GardenPlot => ({
  ...plot,
  // a design saved before ground cover existed carries `groundAlbedo` and no cover. Discarding
  // the whole design over one field that has a defensible answer would be the worse trade
  groundCover: isGroundCover(plot.groundCover)
    ? plot.groundCover
    : nearestGroundCover((plot as unknown as { readonly groundAlbedo?: number }).groundAlbedo ?? 0),
  beds: plot.beds.map((bed: Bed) => ({ ...bed, areaM2: polygonAreaM2(bed.footprint) })),
  arrays: plot.arrays.map((array: PvArray) => withDerived(array)),
})

const isSeasonRecord = (value: unknown): boolean =>
  isRecord(value) &&
  num(value.season) &&
  (value.year === null || num(value.year)) &&
  str(value.bedId) &&
  str(value.cropId) &&
  bool(value.harvested)

const isTrial = (value: unknown): boolean =>
  isRecord(value) &&
  str(value.ruleId) &&
  num(value.seasons) &&
  num(value.bedSeasons) &&
  num(value.totalRealized)

/**
 * A report is checked only for its spine: a report is what a season
 * said, and a stored one is re-read rather than recomputed, so a field this build no longer knows
 * isn't a reason to drop the grower's whole run
 */
const isSeasonReport = (value: unknown): boolean =>
  isRecord(value) &&
  num(value.season) &&
  isRecord(value.year) &&
  list(value.outcomes) &&
  isRecord(value.advice) &&
  str(value.advice.text)

/**
 * A report saved before a tariff could be typed valued its year in US dollars under the field
 * `electricityValueUsd` and could carry no typed cost. Both are read into the shape a season
 * writes today, so the economy block on an older report reads the same as on a new one
 */
type StoredEconomy = Omit<SeasonEconomy, 'installedCost' | 'electricityValue'> &
  Partial<Pick<SeasonEconomy, 'installedCost' | 'electricityValue'>> & {
    readonly electricityValueUsd?: unknown
  }

const normalizeEconomy = (economy: SeasonEconomy): SeasonEconomy => {
  const { electricityValueUsd, ...rest } = economy as StoredEconomy
  return {
    installedCost: null,
    electricityValue: num(electricityValueUsd) ? electricityValueUsd : null,
    ...rest,
  }
}

const normalizeSimulation = (simulation: SimulationState): SimulationState => ({
  ...simulation,
  reports: simulation.reports.map((report) =>
    report.economy === undefined
      ? report
      : { ...report, economy: normalizeEconomy(report.economy) },
  ),
})

const isSimulation = (value: unknown): boolean =>
  isRecord(value) &&
  num(value.seed) &&
  num(value.season) &&
  value.season >= 0 &&
  oneOf(YEAR_CHOICES, value.yearChoice) &&
  list(value.history) &&
  value.history.every(isSeasonRecord) &&
  list(value.reports) &&
  value.reports.every(isSeasonReport) &&
  list(value.trials) &&
  value.trials.every(isTrial) &&
  list(value.revealed) &&
  value.revealed.every(str)

type Decoded<T> = { readonly ok: true; readonly value: T } | { readonly ok: false }

const kept = <T>(value: T): Decoded<T> => ({ ok: true, value })
const NOT_KEPT: Decoded<never> = { ok: false }
const when = <T>(condition: boolean, value: () => T): Decoded<T> =>
  condition ? kept(value()) : NOT_KEPT

const PERCENTILES = [10, 20, 30, 40, 50] as const
const AMBITIONS = ['leafy-and-herbs', 'mixed-vegetables', 'fruiting-and-berries'] as const
const EXPOSURES = ['open', 'partly-sheltered', 'overshadowed'] as const
const MOUNTINGS = ['overhead-canopy', 'ground-rows', 'vertical-bifacial', 'any'] as const
const EXPERIENCES = ['novice', 'some', 'experienced'] as const
const OBJECTIVE_KEYS = ['food', 'energy', 'water', 'simplicity'] as const
const LIGHTING = ['auto', 'low', 'high'] as const
const CHANNELS = ['dli', 'rsr', 'sky-view-factor'] as const
const MONTHS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] as const
const PREFERENCE_KINDS = ['require', 'prefer', 'avoid', 'exclude'] as const

const asDesign = <K extends PersistedKey>(value: unknown): PersistedDesign[K] =>
  value as PersistedDesign[K]

type Decoders = { readonly [K in PersistedKey]: (value: unknown) => Decoded<PersistedDesign[K]> }

const DECODERS: Decoders = {
  location: (value) =>
    when(isRecord(value) && num(value.latitudeDeg) && num(value.longitudeDeg), () =>
      asDesign<'location'>(value),
    ),
  locationLabel: (value) => when(str(value) && value.length > 0, () => value as string),
  frostPercentile: (value) =>
    when(oneOf(PERCENTILES, value), () => asDesign<'frostPercentile'>(value)),
  plot: (value) =>
    value === null
      ? kept(null)
      : when(isPlot(value), () => normalizePlot(asDesign<'plot'>(value) as GardenPlot)),
  selectedBedId: (value) =>
    when(value === null || str(value), () => asDesign<'selectedBedId'>(value)),
  selectedArrayId: (value) =>
    when(value === null || str(value), () => asDesign<'selectedArrayId'>(value)),
  preferences: (value) =>
    when(
      isRecord(value) &&
        num(value.influence) &&
        list(value.entries) &&
        value.entries.every(
          (entry) =>
            isRecord(entry) &&
            str(entry.cropId) &&
            oneOf(PREFERENCE_KINDS, entry.kind) &&
            num(entry.weight),
        ),
      () => asDesign<'preferences'>(value),
    ),
  compatibilityWeights: (value) =>
    when(
      isRecord(value) && Object.keys(DEFAULT_COMPATIBILITY_WEIGHTS).every((key) => num(value[key])),
      () => asDesign<'compatibilityWeights'>(value),
    ),
  maxCropsPerBed: (value) => when(num(value) && value >= 1, () => Math.round(value as number)),
  // both switches or neither: a half-read pair would silently answer one wildlife question for
  // somebody, and the ranking can't tell an answer of "no" from an answer that failed to load
  wildlife: (value) =>
    when(isRecord(value) && bool(value.favorNative) && bool(value.favorPollinators), () =>
      asDesign<'wildlife'>(value),
    ),
  overlay: (value) =>
    when(
      isRecord(value) &&
        bool(value.visible) &&
        oneOf(CHANNELS, value.channel) &&
        (value.slice === 'annual' || oneOf(MONTHS, value.slice)) &&
        num(value.opacity) &&
        value.opacity >= 0 &&
        value.opacity <= 1,
      () => asDesign<'overlay'>(value),
    ),
  imageryEnabled: (value) => when(bool(value), () => value as boolean),
  lighting: (value) => when(oneOf(LIGHTING, value), () => asDesign<'lighting'>(value)),
  // absent isn't a refusal here: a design written before an effect existed simply predates it,
  // and a render preference has a default that means something. A malformed one is still dropped
  effects: (value) =>
    value === undefined
      ? kept(DEFAULT_EFFECTS)
      : when(isRecord(value) && bool(value.ambientOcclusion), () => asDesign<'effects'>(value)),
  plantYear: (value) => when(num(value) && value >= 1, () => Math.round(value as number)),
  simulation: (value) =>
    when(isSimulation(value), () => normalizeSimulation(asDesign<'simulation'>(value))),
  // every answer or none, as with `wildlife`: a half-read set would answer a question nobody
  // answered, and the search can't tell a default from an answer that failed to load
  answers: (value) =>
    when(
      isRecord(value) &&
        isRecord(value.objective) &&
        OBJECTIVE_KEYS.every((key) => num((value.objective as Record<string, unknown>)[key])) &&
        oneOf(AMBITIONS, value.ambition) &&
        oneOf(EXPOSURES, value.exposure) &&
        oneOf(MOUNTINGS, value.mounting) &&
        (value.maxHeightM === null || (num(value.maxHeightM) && value.maxHeightM > 0)) &&
        bool(value.irrigationAvailable) &&
        oneOf(EXPERIENCES, value.experience) &&
        (value.maxBeds === undefined ||
          value.maxBeds === null ||
          (num(value.maxBeds) && value.maxBeds >= 1)),
      // a design saved before the bed cap existed asked for as many as fit, which is null
      () => {
        const answers = value as Record<string, unknown>
        return asDesign<'answers'>({ ...answers, maxBeds: answers.maxBeds ?? null })
      },
    ),
  sidebarStep: (value) => when(oneOf(SIDEBAR_STEPS, value), () => asDesign<'sidebarStep'>(value)),
  // absent is earlier, as with `effects`: a design saved before money could be typed has nothing
  // typed. A figure is null or a finite number, and the currency is three capital letters or the
  // record is dropped whole, since a price in an unreadable currency isn't a price
  economyInputs: (value) =>
    value === undefined
      ? kept(DEFAULT_ECONOMY_INPUTS)
      : when(
          isRecord(value) &&
            (value.perKwh === null || num(value.perKwh)) &&
            (value.installedCost === null || num(value.installedCost)) &&
            str(value.currency) &&
            isCurrencyCode(value.currency),
          () => asDesign<'economyInputs'>(value),
        ),
}

export interface DecodedDesign {
  readonly design: PersistedDesign
  /** Fields that failed their shape check and fell back to the default */
  readonly dropped: readonly PersistedKey[]
}

export const decodeDesign = (raw: unknown): DecodedDesign => {
  const fallback = defaultDesign()
  if (!isRecord(raw)) return { design: fallback, dropped: [...PERSISTED_KEYS] }
  const dropped: PersistedKey[] = []
  const design = { ...fallback } as Record<string, unknown>
  for (const key of PERSISTED_KEYS) {
    const decoded = DECODERS[key](raw[key])
    if (decoded.ok) design[key] = decoded.value
    else dropped.push(key)
  }
  return { design: design as unknown as PersistedDesign, dropped }
}

/* ---------------------------------- storage ------------------------------------ */

export interface StorageLike {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

const PROBE_KEY = `${STORAGE_KEY}/probe`

/**
 * Feature detection by use: Safari's private mode exposes the whole
 * `localStorage` API and throws on the first write, and a server render has no global
 */
export const detectStorage = (): StorageLike | null =>
  attemptOr<StorageLike | null>(
    () => {
      const store = globalThis.localStorage
      store.setItem(PROBE_KEY, '1')
      store.removeItem(PROBE_KEY)
      return store
    },
    () => null,
  )

export const isQuotaError = (error: unknown): boolean => {
  if (typeof DOMException !== 'undefined' && error instanceof DOMException) {
    return (
      error.name === 'QuotaExceededError' ||
      error.name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
      error.code === 22
    )
  }
  return error instanceof Error && /quota|exceeded/i.test(`${error.name} ${error.message}`)
}

export const encodeDesign = (design: PersistedDesign, savedAtUtcMillis: EpochMillis): string =>
  JSON.stringify({
    version: SCHEMA_VERSION,
    savedAtUtcMillis,
    design,
  } satisfies PersistEnvelope<PersistedDesign>)

export const designBytes = (payload: string): number => new TextEncoder().encode(payload).length

export type DecodedEnvelope =
  | {
      readonly ok: true
      readonly decoded: DecodedDesign
      readonly savedAtUtcMillis: EpochMillis | null
      /** The whole parsed payload, so a caller carrying more than a design reads one parse */
      readonly envelope: Record<string, unknown>
    }
  | { readonly ok: false; readonly reason: string }

/**
 * One versioned payload to a design: parse, migrate, decode. The example garden is read through
 * this and nothing else, so an asset that has drifted from the schema is refused exactly as a
 * stale saved design would be rather than reaching the store half-understood
 */
export const decodeEnvelope = (payload: string): DecodedEnvelope => {
  const parsed = attempt<unknown>(() => JSON.parse(payload))
  if (!parsed.ok) return { ok: false, reason: `it isn't readable data (${parsed.message})` }
  if (!isRecord(parsed.value)) return { ok: false, reason: "it isn't a saved design" }

  const migrated = migrateDesign(parsed.value.version, parsed.value.design)
  if (!migrated.ok) return { ok: false, reason: migrated.reason }
  if (!isRecord(migrated.design)) return { ok: false, reason: 'it holds no design' }

  const decoded = attempt(() => decodeDesign(migrated.design))
  if (!decoded.ok) return { ok: false, reason: `it couldn't be read (${decoded.message})` }
  return {
    ok: true,
    decoded: decoded.value,
    savedAtUtcMillis: num(parsed.value.savedAtUtcMillis)
      ? epochMillis(parsed.value.savedAtUtcMillis)
      : null,
    envelope: parsed.value,
  }
}

export interface LoadResult {
  /** null when there's nothing to restore, including every refusal to restore */
  readonly design: PersistedDesign | null
  readonly status: StorageStatus
}

export const loadDesign = (storage: StorageLike | null): LoadResult => {
  if (storage === null) return { design: null, status: status('unavailable', STORAGE_UNAVAILABLE) }
  const raw = attempt(() => storage.getItem(STORAGE_KEY))
  if (!raw.ok) return { design: null, status: status('failed', failedMessage(raw.message)) }
  if (raw.value === null || raw.value.length === 0) return { design: null, status: IDLE_STATUS }

  const bytes = designBytes(raw.value)
  const envelope = decodeEnvelope(raw.value)
  if (!envelope.ok) {
    return { design: null, status: status('discarded', discardedMessage(envelope.reason), bytes) }
  }
  const { decoded, savedAtUtcMillis } = envelope
  return {
    design: decoded.design,
    status:
      decoded.dropped.length === 0
        ? status('restored', STORAGE_RESTORED, bytes, savedAtUtcMillis)
        : status('repaired', repairedMessage(decoded.dropped), bytes, savedAtUtcMillis),
  }
}

export const writeDesign = (
  storage: StorageLike | null,
  design: PersistedDesign,
  savedAtUtcMillis: EpochMillis,
): StorageStatus => {
  if (storage === null) return status('unavailable', STORAGE_UNAVAILABLE)
  const payload = encodeDesign(design, savedAtUtcMillis)
  try {
    storage.setItem(STORAGE_KEY, payload)
  } catch (error) {
    return isQuotaError(error)
      ? status('quota-exceeded', STORAGE_QUOTA, designBytes(payload))
      : status('failed', failedMessage(messageOf(error)))
  }
  return status('saved', STORAGE_SAVED, designBytes(payload), savedAtUtcMillis)
}

export const removeDesign = (storage: StorageLike | null): StorageStatus => {
  if (storage === null) return status('unavailable', STORAGE_UNAVAILABLE)
  const done = attempt(() => {
    storage.removeItem(STORAGE_KEY)
    // forgetting the garden forgets the conversation about it. See `TRANSCRIPT_KEY`
    storage.removeItem(TRANSCRIPT_KEY)
  })
  return done.ok
    ? status('cleared', STORAGE_CLEARED)
    : status('failed', failedMessage(done.message))
}

/* --------------------------------- debouncing ----------------------------------- */

export const WRITE_DELAY_MS = 600

export interface Debounced {
  (): void
  cancel(): void
  flush(): void
  /** Whether a write is due: an edit landed inside the window and hasn't been written */
  pending(): boolean
}

/** One write after the edits stop, so a slider drag is one payload rather than forty */
export const debounce = (run: () => void, delayMs: number): Debounced => {
  let timer: ReturnType<typeof setTimeout> | null = null
  const cancel = (): void => {
    if (timer !== null) clearTimeout(timer)
    timer = null
  }
  const debounced = (): void => {
    cancel()
    timer = setTimeout(() => {
      timer = null
      run()
    }, delayMs)
  }
  debounced.cancel = cancel
  debounced.pending = (): boolean => timer !== null
  debounced.flush = (): void => {
    if (timer === null) return
    cancel()
    run()
  }
  return debounced
}
