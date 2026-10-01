import { describe, expect, it } from 'bun:test'
import { siteFixture } from '../recommend/testkit'
import { failed, idle, loading, ready } from '../state/slices'
import type { Crop } from '../types/crop'
import { cropId } from '../types/ids'
import { NATIVE_REGION_UNKNOWN } from './format'
import { regionNote } from './region'

const NO_CROPS: readonly Crop[] = []

// chives is native to MAS in the checklist data, so a catalog holding it gives the
// "has a region" case something to find there
const ONE_MAS_NATIVE = [
  { id: cropId('chives'), taxonomy: { commonNames: ['chives'] } },
] as unknown as readonly Crop[]

// ids no NATIVE_RANGES entry answers for, so the checklist finds nothing native in any area,
// whatever area it's asked about
const NO_MATCHES = ['fixture-a', 'fixture-b', 'fixture-c'].map((id) => ({
  id: cropId(id),
  taxonomy: { commonNames: [id] },
})) as unknown as readonly Crop[]

describe('why favoring natives would do nothing', () => {
  it('says nothing once the place has a region with something native in it', () => {
    expect(regionNote(ready({ ...siteFixture(), botanicalArea: 'MAS' }), ONE_MAS_NATIVE)).toBeNull()
  })

  it('says the garden is outside the map when the place resolved without a region', () => {
    const site = { ...siteFixture(), botanicalArea: null }
    expect(regionNote(ready(site), NO_CROPS)).toMatch(/^This garden is outside the region map/)
  })

  it('says the lookup failed when it did, and where to retry it', () => {
    expect(regionNote(failed('the weather service refused'), NO_CROPS)).toMatch(/lookup failed/)
    expect(regionNote(failed('x'), NO_CROPS)).toMatch(/first question or the site panel/)
  })

  it('falls back to the general sentence before any lookup', () => {
    expect(regionNote(idle(), NO_CROPS)).toBe(NATIVE_REGION_UNKNOWN)
    expect(regionNote(loading(), NO_CROPS)).toBe(NATIVE_REGION_UNKNOWN)
  })

  it('says the catalog has nothing native here, when the area has none', () => {
    const site = { ...siteFixture(), botanicalArea: 'MAS' }
    expect(regionNote(ready(site), NO_MATCHES)).toBe(
      'None of the 3 plants in the catalog grow wild around here. Favoring natives changes nothing in the order below',
    )
    // a catalog still loading has nothing to count yet
    expect(regionNote(ready(site), NO_CROPS)).toBeNull()
  })
})
