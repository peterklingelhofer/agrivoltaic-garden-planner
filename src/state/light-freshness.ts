import type { GardenPlot } from '../types/garden'
import type { AppState } from './slices'

/**
 * Whether the light on screen was computed for the garden that is on screen.
 *
 * The daily light integral painted on the ground, the per-bed light the crop ranking reads and the
 * compliance checks are all outputs of a bake over one particular arrangement of panels and beds.
 * Nothing about them updates when that arrangement changes: dragging a panel two metres left moves
 * the panel and leaves every one of those figures describing where it used to be. Without this, the
 * editor would say `Simulation: ready` throughout, which is the one thing a tool built on "every
 * figure traces to something" must not do.
 *
 * DERIVED, not announced. The obvious alternative is a `lightStale` flag set by each action that
 * edits geometry, and this project has now been bitten twice by exactly that shape: a one-shot
 * flag that whoever adds the next edit path forgets to set, failing silently and looking like
 * something else entirely. A key computed from the plot cannot be forgotten, because a new field
 * on an array or a bed joins it without anybody remembering to do anything
 */

/**
 * What the bake reads out of the plot, as one comparable string.
 *
 * Plantings are excluded deliberately and they are the only exclusion: light falls on a bed, and
 * what is growing in that bed is downstream of the answer. Everything
 * else about an array or a bed is included by spreading the object, with no field named individually,
 * so a geometry field added later is covered without a second edit here.
 *
 * Key order decides the string, so an object rebuilt in a different order reads as a change that
 * did not happen. That is the safe direction to be wrong in: it costs a re-bake nobody needed,
 * where the other direction costs a grower a figure that is quietly about a different garden
 */
export const lightGeometryKey = (plot: GardenPlot): string =>
  JSON.stringify({
    boundary: plot.boundary,
    northOffsetDeg: plot.northOffsetDeg,
    originOffsetM: plot.originOffsetM,
    groundCover: plot.groundCover,
    arrays: plot.arrays,
    obstructions: plot.obstructions,
    beds: plot.beds.map(({ plantings: _plantings, ...rest }) => rest),
  })

/**
 * True when there is a light field to show AND the garden has moved out from under it.
 *
 * False while there is no field at all: that is "not computed yet", which the steps already
 * say for themselves and which is a different sentence from "computed, for something else"
 */
export const lightIsStale = (state: AppState): boolean => {
  if (state.raster.status !== 'ready' || state.plot === null) return false
  if (state.lightGeometry === null) return false
  return lightGeometryKey(state.plot) !== state.lightGeometry
}

/**
 * Whether the garden is waiting for its first light: a place looked up, a bed to read the light
 * in, and no run yet. `error` is deliberately not `idle`, so a failed run is not retried on a
 * timer; and a guided apply, which carries the search's own per-bed light across without a
 * raster, counts as waiting, so the ranking it lands on is soon read off the full check.
 *
 * A cancelled run stamps `lightGeometry` with the garden it was over (see `cancel`), and that
 * arrangement is then left alone until it changes: a cancel is an answer, not a pause.
 *
 * Beside `lightIsStale`, separate from `useAutoLight`, because the store asks the same question
 * before it plants: a guided planting waits for the full check when either of these is true
 */
export const lightIsMissing = (s: AppState): boolean =>
  s.raster.status === 'idle' &&
  s.site.status === 'ready' &&
  s.weather.status === 'ready' &&
  s.plot !== null &&
  s.plot.beds.length > 0 &&
  (s.lightGeometry === null || s.lightGeometry !== lightGeometryKey(s.plot))
