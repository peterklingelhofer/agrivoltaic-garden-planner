import { runRecommendationPipeline, type PipelineInput } from '../recommend/pipeline'
import type { BedCalendar } from '../types/calendar'
import type { BedId } from '../types/ids'
import type { CropRecommendation, RecommendationSet } from '../types/recommend'
import { attempt, attemptAsync, type Attempt } from './safe'

/** The single entry point `src/recommend` exposes for a whole-garden plan */
export const ENTRY_POINT = 'autoRecommend'

export const CALENDAR_UNAVAILABLE = 'Planting calendar unavailable: only the ranking ran'

export interface RecommendationRun {
  readonly sets: readonly RecommendationSet[]
  /** null means only that the entry point is missing or returned no calendar */
  readonly calendars: readonly BedCalendar[] | null
}

type Entry = (input: PipelineInput) => unknown
type Record_ = Record<string, unknown>

const asArray = <T>(value: unknown): readonly T[] | null =>
  Array.isArray(value) ? (value as readonly T[]) : null

const asRecord = (value: unknown): Record_ | null =>
  typeof value === 'object' && value !== null ? (value as Record_) : null

const entryPoint = async (): Promise<Entry | null> => {
  const loaded = await attemptAsync(
    async () => (await import('../recommend')) as unknown as Record_,
  )
  if (!loaded.ok) return null
  const candidate = loaded.value[ENTRY_POINT]
  return typeof candidate === 'function' ? (candidate as Entry) : null
}

const setOf = (bed: Record_): RecommendationSet | null => {
  const ranked = asArray<Record_>(bed.ranked)
  if (ranked === null || typeof bed.bedId !== 'string') return null
  return {
    bedId: bed.bedId as BedId,
    ranked: ranked.map((plan) => plan.recommendation as CropRecommendation),
    generatedAtStage: 'rank',
  }
}

const calendarOf = (bed: Record_): BedCalendar | null => {
  const calendar = asRecord(bed.calendar)
  return calendar !== null && Array.isArray(calendar.entries)
    ? (calendar as unknown as BedCalendar)
    : null
}

/** Projects a GardenPlan onto the two async slices the panels read */
export const normalizeRun = (value: unknown): RecommendationRun | null => {
  const plan = asRecord(value)
  const beds = plan === null ? null : asArray<Record_>(plan.beds)
  if (beds === null) return null
  const sets = beds.map(setOf).filter((set): set is RecommendationSet => set !== null)
  const calendars = beds.map(calendarOf).filter((cal): cal is BedCalendar => cal !== null)
  return { sets, calendars: calendars.length === beds.length ? calendars : null }
}

/**
 * Degrades to the ranking pipeline plus a notice when the calendar entry point is missing, so a
 * missing or throwing export never takes the panel down
 */
export const runRecommendations = async (
  input: PipelineInput,
): Promise<Attempt<RecommendationRun>> => {
  const entry = await entryPoint()
  if (entry === null)
    return attempt(() => ({ sets: runRecommendationPipeline(input), calendars: null }))
  const result = await attemptAsync(async () => entry(input))
  if (!result.ok) return result
  const run = normalizeRun(result.value)
  return run === null
    ? { ok: false, message: `${ENTRY_POINT}() returned an unexpected shape` }
    : { ok: true, value: run }
}
