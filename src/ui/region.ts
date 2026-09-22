import type { AsyncState } from '../state/slices'
import type { Site } from '../types/site'
import { NATIVE_REGION_UNKNOWN } from './format'

/**
 * Why there is no region to favour natives in, said for the case that actually applies.
 *
 * Three states need three sentences: a place not looked up yet, a lookup that failed on a flaky
 * upstream, and a place that has resolved with no region. The last is a place outside the map the
 * app carries, and the map covers the whole world at the level of states and provinces, so it is
 * rare
 */
export const regionNote = (site: AsyncState<Site>, locationLabel: string): string | null => {
  if (site.status === 'ready') {
    return site.value.botanicalArea === null
      ? `${locationLabel} is outside the region map this app carries, so it can't tell which plants grow wild there. Until it can, favouring natives changes nothing in the order below`
      : null
  }
  if (site.status === 'error') {
    return `The place lookup failed, so the region isn't known yet. Try the lookup again on the first question or the site panel. Until it works, favouring natives changes nothing in the order below`
  }
  return NATIVE_REGION_UNKNOWN
}
