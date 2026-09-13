import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { prefersReducedMotion } from '../state/motion'
import { EMPTY_LIST } from '../state/slices'
import { useAppStore } from '../state/store'
import { atDayOfYear, dayOfYearUtc } from '../state/sun'
import type { YearSummary } from '../types/simulation'
import { cropName } from './format'

/** Long enough to watch a bed fill, short enough that five seasons is not a wait */
export const SWEEP_MS = 3500
/** A step every 40 ms is 25 frames a second of calendar, which reads as a year passing */
export const SWEEP_STEP_MS = 40

const DAYS_PER_YEAR = 365
const wrapDay = (day: number): number =>
  ((Math.round(day) - 1 + DAYS_PER_YEAR * 4) % DAYS_PER_YEAR) + 1

/**
 * The day the sweep ends on: the day the grower was already looking at, if the season was
 * growing then, otherwise the middle of the frost-free window. Never the first fall frost, where
 * every annual is past its harvest and the garden the outcome lands on is bare
 */
export const sweepEndDay = (year: YearSummary, today: number): number => {
  const span = year.frostFreeDays
  const sinceStart = (today - year.lastSpringFreeze + DAYS_PER_YEAR) % DAYS_PER_YEAR
  return sinceStart > 0 && sinceStart < span ? today : wrapDay(year.lastSpringFreeze + span / 2)
}

/**
 * Pressing Run plays the season before it reports it.
 *
 * The clock sweeps from the year's last spring frost to the day the grower had, over a few
 * seconds; the plants grow as it goes, because they already grow with the day of the year, and
 * the sun and the shadows follow, because they already follow the clock. Then the outcome lands
 * on the plants. Nothing is computed here that was not computed by the press: the report exists
 * the moment `runSeason` returns and the scene simply waits to draw it (`sweeping`). A calendar
 * move and not a bake, which is Decision Record 14.5's line, and the same shape as the overlay
 * playback next door: a timer in a hook, a transient field in the store, and the grower's own
 * setting untouched underneath.
 *
 * Reduced motion skips the sweep and lands the outcome at once, as the overlay playback and the
 * guided tour already do. A second press while one is playing cancels it and plays the next
 */
export const useSeasonSweep = (): { readonly run: () => void; readonly playing: boolean } => {
  const runSeason = useAppStore((s) => s.runSeason)
  const setSweeping = useAppStore((s) => s.setSweeping)
  const setTime = useAppStore((s) => s.setTime)
  const playing = useAppStore((s) => s.sweeping)
  const timer = useRef<ReturnType<typeof setInterval> | null>(null)

  const stop = useCallback(() => {
    if (timer.current !== null) clearInterval(timer.current)
    timer.current = null
    setSweeping(false)
  }, [setSweeping])

  // a panel unmounted mid-sweep leaves the scene showing the outcome, not waiting forever
  useEffect(() => stop, [stop])

  const run = useCallback(() => {
    stop()
    const before = useAppStore.getState().simulation.season
    runSeason()
    const state = useAppStore.getState()
    const report = state.simulation.reports[state.simulation.reports.length - 1]
    if (state.simulation.season === before || report === undefined || prefersReducedMotion()) return
    const from = report.year.lastSpringFreeze
    const to = sweepEndDay(report.year, dayOfYearUtc(state.timeUtcMillis))
    const span = (to - from + DAYS_PER_YEAR) % DAYS_PER_YEAR
    const steps = Math.max(1, Math.round(SWEEP_MS / SWEEP_STEP_MS))
    let step = 0
    setSweeping(true)
    setTime(atDayOfYear(state.timeUtcMillis, from))
    timer.current = setInterval(() => {
      step += 1
      const day = wrapDay(from + span * Math.min(1, step / steps))
      setTime(atDayOfYear(useAppStore.getState().timeUtcMillis, day))
      if (step >= steps) stop()
    }, SWEEP_STEP_MS)
  }, [runSeason, setSweeping, setTime, stop])

  return { run, playing }
}

/** One planting's own bed and crop names, and the day its harvest window ends */
export interface HarvestWatch {
  readonly bedLabel: string
  readonly cropLabel: string
  readonly harvestEndDay: number
}

/**
 * The line to show when the clock just passed a planting's last harvest day, or null.
 *
 * Only a forward step counts, `previousDay < harvestEndDay <= day`: the sweep's clock always
 * advances, and a day landing behind it is not a harvest still ahead or one already named on an
 * earlier step. Where two windows end on the same step the first entry in the list is the one
 * named, which is the bed order the plot already keeps
 */
export const harvestEventLine = (
  day: number,
  previousDay: number,
  watch: readonly HarvestWatch[],
): string | null => {
  if (day <= previousDay) return null
  const crossed = watch.find(
    (entry) => entry.harvestEndDay > previousDay && entry.harvestEndDay <= day,
  )
  return crossed === undefined ? null : `${crossed.bedLabel}: ${crossed.cropLabel} harvested`
}

/** About how long the cue names a harvest before it clears, in playback time */
const HARVEST_EVENT_MS = 2000

/**
 * "Bed 3: cucumber harvested", for about two seconds, the moment the sweep's clock passes a
 * planting's last harvest day.
 *
 * A crop vanishing from a bed mid-playback read as it having died rather than come in: the plant
 * meshes for a day past their window simply stop being drawn, and nothing else on screen says a
 * harvest happened. One string in local state, derived from the day that just changed rather than
 * written every frame, so playing a season costs no extra store writes
 */
export const useSeasonEvent = (): string | null => {
  const sweeping = useAppStore((s) => s.sweeping)
  const day = useAppStore((s) => dayOfYearUtc(s.timeUtcMillis))
  const plot = useAppStore((s) => s.plot)
  const catalog = useAppStore((s) => (s.catalog.status === 'ready' ? s.catalog.value : EMPTY_LIST))
  const previousDay = useRef(day)
  const clearTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [event, setEvent] = useState<string | null>(null)

  const watch = useMemo<readonly HarvestWatch[]>(
    () =>
      plot === null
        ? EMPTY_LIST
        : plot.beds.flatMap((bed) =>
            bed.plantings.map((planting) => ({
              bedLabel: bed.label,
              cropLabel: cropName(catalog, planting.cropId),
              harvestEndDay: planting.harvestEndDay,
            })),
          ),
    [plot, catalog],
  )

  useEffect(() => {
    const line = sweeping ? harvestEventLine(day, previousDay.current, watch) : null
    previousDay.current = day
    if (clearTimer.current !== null) {
      clearTimeout(clearTimer.current)
      clearTimer.current = null
    }
    setEvent(line)
    if (line !== null) clearTimer.current = setTimeout(() => setEvent(null), HARVEST_EVENT_MS)
  }, [sweeping, day, watch])

  useEffect(
    () => () => {
      if (clearTimer.current !== null) clearTimeout(clearTimer.current)
    },
    [],
  )

  return event
}
