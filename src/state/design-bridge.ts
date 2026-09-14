import type { DesignProgress, SimulationRunner } from '../recommend/design'
import type { Crop } from '../types/crop'
import type { Obstruction } from '../types/garden'
import type { GroundCover } from '../types/ground'
import type { OnboardingAnswers, ScenarioSet } from '../types/onboarding'
import type { Site } from '../types/site'
import type { TmySeries } from '../types/weather'
import { attemptAsync, type Attempt } from './safe'

/** The single entry point `src/recommend` exposes for a whole-design suggestion */
export const DESIGN_ENTRY_POINT = 'suggestDesigns'

/**
 * A message about a missing export would send the reader looking for one that is right there. Say
 * what is actually known: the module didn't load, and the commonest cause by far is a stale build
 */
export const DESIGN_UNAVAILABLE = `guided setup unavailable: the design engine didn't load in this build, so nothing can compute a layout for these answers. If you're running a preview server it may be serving an old bundle, so rebuild and reload. Everything you have answered is kept, and the full editor is still there`

/**
 * What the store already holds and the engine would otherwise fetch again. Passing the
 * resolved site and its weather keeps one location resolution behind the whole app rather
 * than a second one behind the wizard
 */
export interface DesignInputs {
  readonly site?: Site
  readonly weather?: TmySeries
  readonly catalog?: readonly Crop[]
  /** The plot's ground cover, so the search's energy figures are about the grower's ground */
  readonly groundCover?: GroundCover
  /** What already stands near the space, so a house the grower drew shades the search's own bakes too (Decision Record 26) */
  readonly obstructions?: readonly Obstruction[]
  /**
   * The runner the search bakes each candidate with. One annual bake per candidate is measured
   * at about 4.5 s for the five, which is far too long to hold the thread at the one moment the
   * visitor is watching hardest. Passing the worker client's `run` moves it off that thread and
   * through the client's memo. Leaving it out falls back to the engine's own direct import,
   * which is what still works where no worker could be created
   */
  readonly run?: SimulationRunner
  readonly onProgress?: (progress: DesignProgress) => void
}

type Entry = (answers: OnboardingAnswers, inputs: DesignInputs) => unknown
type Record_ = Record<string, unknown>

const asRecord = (value: unknown): Record_ | null =>
  typeof value === 'object' && value !== null ? (value as Record_) : null

const entryPoint = async (): Promise<Entry | null> => {
  const loaded = await attemptAsync(
    async () => (await import('../recommend')) as unknown as Record_,
  )
  if (!loaded.ok) return null
  const candidate = loaded.value[DESIGN_ENTRY_POINT]
  return typeof candidate === 'function' ? (candidate as Entry) : null
}

const isPlacement = (value: unknown): boolean => {
  const bed = asRecord(value)
  return (
    bed !== null &&
    typeof bed.bedId === 'string' &&
    typeof bed.label === 'string' &&
    typeof bed.reason === 'string' &&
    typeof bed.zone === 'string' &&
    asRecord(bed.footprint) !== null &&
    asRecord(bed.summary) !== null &&
    asRecord(bed.light) !== null
  )
}

/** A layout the editor can't write beds from is refused with the rest of the scenario */
const isLayout = (value: unknown): boolean => {
  const layout = asRecord(value)
  return (
    layout !== null &&
    Array.isArray(layout.beds) &&
    Array.isArray(layout.refusals) &&
    typeof layout.banded === 'boolean' &&
    typeof layout.explanation === 'string' &&
    (layout.beds as readonly unknown[]).every(isPlacement)
  )
}

const isScenario = (value: unknown): boolean => {
  const scenario = asRecord(value)
  const candidate = asRecord(scenario?.candidate)
  return (
    candidate !== null &&
    typeof candidate.archetype === 'string' &&
    typeof candidate.label === 'string' &&
    asRecord(candidate.geometry) !== null &&
    asRecord(candidate.tracker) !== null &&
    typeof scenario?.plainSummary === 'string' &&
    typeof scenario.tradeoff === 'string' &&
    asRecord(scenario.light) !== null &&
    asRecord(scenario.production) !== null &&
    asRecord(scenario.flags) !== null &&
    asRecord(scenario.energyRatio) !== null &&
    isLayout(scenario.layout)
  )
}

/** Refuses a shape the results view can't render rather than rendering half a scenario */
export const normalizeSet = (value: unknown): ScenarioSet | null => {
  const set = asRecord(value)
  if (set === null || !Array.isArray(set.scenarios) || set.scenarios.length === 0) return null
  if (typeof set.recommendedArchetype !== 'string') return null
  if (set.evaluatedAt !== 'preview' && set.evaluatedAt !== 'final') return null
  if (!Array.isArray(set.notConsidered) || typeof set.plotAreaM2 !== 'number') return null
  return (set.scenarios as readonly unknown[]).every(isScenario)
    ? (set as unknown as ScenarioSet)
    : null
}

/**
 * Degrades to a visible notice if the entry point is missing or throws, so the guided path
 * never takes the app down and never shows a layout nothing evaluated
 */
export const runDesignSuggestions = async (
  answers: OnboardingAnswers,
  inputs: DesignInputs = {},
): Promise<Attempt<ScenarioSet>> => {
  const entry = await entryPoint()
  if (entry === null) return { ok: false, message: DESIGN_UNAVAILABLE }
  const result = await attemptAsync(async () => entry(answers, inputs))
  if (!result.ok) return result
  const set = normalizeSet(result.value)
  return set === null
    ? { ok: false, message: `${DESIGN_ENTRY_POINT}() returned an unexpected shape` }
    : { ok: true, value: set }
}
