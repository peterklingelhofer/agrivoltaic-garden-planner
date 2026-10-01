import { isNativeIn } from '../data/catalog/native-ranges'
import type { AsyncState } from '../state/slices'
import type { Crop } from '../types/crop'
import type { Site } from '../types/site'
import { NATIVE_REGION_UNKNOWN } from './format'
import { nativeCountSentence } from './plants-effect'

/**
 * Why favouring natives would do nothing, said for the case that actually applies.
 *
 * Four states need four sentences: a place not looked up yet, a lookup that failed on a flaky
 * upstream, a place that has resolved with no region, and a place with a region where none of the
 * catalogue's plants grow wild. The third is a place outside the map the app carries, and the map
 * covers the whole world at the level of states and provinces, so it's rare. The fourth isn't:
 * 57 of the map's 369 areas have no catalogue native at all. A catalogue still loading has
 * nothing to count, so it says nothing yet
 */
export const regionNote = (
  site: AsyncState<Site>,
  locationLabel: string,
  catalog: readonly Crop[],
): string | null => {
  if (site.status === 'ready') {
    const area = site.value.botanicalArea
    if (area === null) {
      return `${locationLabel} is outside the region map this app carries, so it can't tell which plants grow wild there. Until it can, favouring natives changes nothing in the order below`
    }
    const nativeCropIds = catalog
      .filter((crop) => isNativeIn(crop.id, area) === true)
      .map((crop) => crop.id)
    return nativeCropIds.length === 0 && catalog.length > 0
      ? `${nativeCountSentence(nativeCropIds, catalog)} Favouring natives changes nothing in the order below`
      : null
  }
  if (site.status === 'error') {
    return `The place lookup failed, so the region isn't known yet. Try the lookup again on the first question or the site panel. Until it works, favouring natives changes nothing in the order below`
  }
  return NATIVE_REGION_UNKNOWN
}
