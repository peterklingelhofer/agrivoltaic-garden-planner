import type { AsyncState } from '../state/slices'
import type { Site } from '../types/site'
import { NATIVE_REGION_UNKNOWN } from './format'

/**
 * Why there is no region to favour natives in, said for the case that actually applies.
 *
 * One sentence covered three states and was wrong in two of them. A place looked
 * up on the first question used to read, eight questions later, as a region unknown
 * "because the place hasn't been looked up or its coordinates fall outside the region map"; the
 * lookup had failed on a flaky upstream and nothing on that question said so. A place that has
 * resolved with no region is a place outside the map the app carries, which is a different fact
 * again, and the map covers the whole world at the level of states and provinces, so it is rare
 */
export const regionNote = (site: AsyncState<Site>, locationLabel: string): string | null => {
  if (site.status === 'ready') {
    return site.value.botanicalArea === null
      ? `${locationLabel} is outside the region map this app carries, so it can't tell which plants grow wild there. Until it can, favouring natives changes nothing in the order below`
      : null
  }
  if (site.status === 'error') {
    return `The place lookup failed, so the region isn't known yet. Try the lookup again on the first question or the site panel; until it works, favouring natives changes nothing in the order below`
  }
  return NATIVE_REGION_UNKNOWN
}
