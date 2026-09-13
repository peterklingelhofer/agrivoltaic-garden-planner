import { growingWindowFor } from '../data/growing-window'
import type { GrowingWindow } from '../types/light'
import type { Site } from '../types/site'
import { SIM_GROWING_WINDOW } from './defaults'
import type { AppState } from './slices'

let last: {
  readonly site: Site
  readonly percentile: number
  readonly window: GrowingWindow
} | null = null

/**
 * The months every seasonal aggregate is read over: the site's own frost window once the place
 * is resolved, the fixed April to September before that. Memoised on the site and the risk
 * percentile so a store selector hands back the same object until one of them changes
 */
export const growingWindowOf = (state: AppState): GrowingWindow => {
  if (state.site.status !== 'ready') return SIM_GROWING_WINDOW
  const site = state.site.value
  const percentile = state.frostPercentile
  if (last === null || last.site !== site || last.percentile !== percentile) {
    last = { site, percentile, window: growingWindowFor(site, percentile) }
  }
  return last.window
}
