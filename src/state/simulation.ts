import type { TriedRule } from '../simulation/season'
import type { RuleId } from '../types/ids'
import type { SimulationState, Trial } from '../types/simulation'
import { lightIsStale } from './light-freshness'
import type { AppState } from './slices'

/** How many season reports the design keeps. The history behind them is kept whole */
export const SEASON_REPORTS_KEPT = 12

export const SEASON_NEEDS_SITE = 'No site yet. A season runs on its weather, so look up the place'
export const SEASON_NEEDS_BEDS = 'No bed yet. A season runs on what is planted, so draw a bed'
export const SEASON_NEEDS_LIGHT =
  'No light computed yet. A season runs on the light reaching each bed, so compute it'
export const SEASON_LIGHT_STALE =
  'The light is out of date for this layout. Compute it again before running a season'
export const SEASON_NEEDS_CATALOG = "The crop catalog hasn't loaded yet"
export const SEASON_NEEDS_RULES = "The companion rules haven't loaded yet"

/**
 * Which of the app's own requirements settles a blocker, or `wait` where nothing can: the catalog
 * and the rules are already on their way and a button would only ask twice.
 *
 * Keyed by the sentence itself, so a blocker added above without a fix
 * beside it here is one line away from the one it belongs to. `ui/requirement.ts` turns the tag
 * into the press, off the SAME builders the site and light steps use, which is what stops the
 * season's button and the light step's button from being two different buttons
 */
export type SeasonFix = 'place' | 'beds' | 'light' | 'wait'

export const SEASON_FIX: Readonly<Record<string, SeasonFix>> = {
  [SEASON_NEEDS_SITE]: 'place',
  [SEASON_NEEDS_BEDS]: 'beds',
  [SEASON_NEEDS_LIGHT]: 'light',
  [SEASON_LIGHT_STALE]: 'light',
  [SEASON_NEEDS_CATALOG]: 'wait',
  [SEASON_NEEDS_RULES]: 'wait',
}

/**
 * Why a season can't run right now, in the words of what is missing, or null when it can.
 *
 * A string over a `Requirement`, because the store consults this before every run and a
 * fresh object is unusable as a selector. `SEASON_FIX` above carries the other half. Stale
 * light is a blocker: a season on a bake of a layout that no longer exists
 * would be describing a garden that is not on screen
 */
export const seasonBlocker = (state: AppState): string | null => {
  if (state.site.status !== 'ready' || state.weather.status !== 'ready') return SEASON_NEEDS_SITE
  if (state.plot === null || state.plot.beds.length === 0) return SEASON_NEEDS_BEDS
  if (state.bedLight.length === 0) return SEASON_NEEDS_LIGHT
  if (lightIsStale(state)) return SEASON_LIGHT_STALE
  if (state.catalog.status !== 'ready') return SEASON_NEEDS_CATALOG
  if (state.companionRules.status !== 'ready') return SEASON_NEEDS_RULES
  return null
}

/**
 * A season of evidence counts once per rule however many beds ran it: replication across beds
 * within one season is a better mean of the same season, and the reveal gates on seasons
 */
export const mergeTrials = (
  trials: readonly Trial[],
  tried: readonly TriedRule[],
): readonly Trial[] => {
  const merged = new Map<RuleId, Trial>(trials.map((trial) => [trial.ruleId, trial]))
  const seasonCounted = new Set<RuleId>()
  for (const entry of tried) {
    const previous = merged.get(entry.ruleId) ?? {
      ruleId: entry.ruleId,
      seasons: 0,
      bedSeasons: 0,
      totalRealized: 0,
    }
    const firstThisSeason = !seasonCounted.has(entry.ruleId)
    seasonCounted.add(entry.ruleId)
    merged.set(entry.ruleId, {
      ruleId: entry.ruleId,
      seasons: previous.seasons + (firstThisSeason ? 1 : 0),
      bedSeasons: previous.bedSeasons + 1,
      totalRealized: previous.totalRealized + entry.realized,
    })
  }
  return [...merged.values()]
}

/** The state after one more season, with the reports bounded and the history kept whole */
export const withSeason = (
  simulation: SimulationState,
  season: number,
  report: SimulationState['reports'][number],
  records: SimulationState['history'],
  tried: readonly TriedRule[],
): SimulationState => ({
  ...simulation,
  season,
  history: [...simulation.history, ...records],
  reports: [...simulation.reports.slice(-(SEASON_REPORTS_KEPT - 1)), report],
  trials: mergeTrials(simulation.trials, tried),
})
