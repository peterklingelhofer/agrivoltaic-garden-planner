import { describe, expect, it } from 'bun:test'
import { siteFixture } from '../recommend/testkit'
import { failed, idle, loading, ready } from '../state/slices'
import type { Crop } from '../types/crop'
import { cropId } from '../types/ids'
import { NATIVE_REGION_UNKNOWN } from './format'
import { regionNote } from './region'

const NO_CROPS: readonly Crop[] = []

// chives is native to MAS in the checklist data, so a catalogue holding it gives the
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

describe('why favouring natives would do nothing', () => {
  it('says nothing once the place has a region with something native in it', () => {
    expect(
      regionNote(ready({ ...siteFixture(), botanicalArea: 'MAS' }), 'Amherst', ONE_MAS_NATIVE),
    ).toBeNull()
  })

  it('names the place as outside the map when it resolved without one', () => {
    const site = { ...siteFixture(), botanicalArea: null }
    expect(regionNote(ready(site), 'Trenton, New Jersey', NO_CROPS)).toMatch(
      /Trenton, New Jersey is outside the region map/,
    )
  })

  it('says the lookup failed when it did, and where to retry it', () => {
    expect(regionNote(failed('the weather service refused'), 'Trenton', NO_CROPS)).toMatch(
      /lookup failed/,
    )
    expect(regionNote(failed('x'), 'Trenton', NO_CROPS)).toMatch(/first question or the site panel/)
  })

  it('falls back to the general sentence before any lookup', () => {
    expect(regionNote(idle(), 'Trenton', NO_CROPS)).toBe(NATIVE_REGION_UNKNOWN)
    expect(regionNote(loading(), 'Trenton', NO_CROPS)).toBe(NATIVE_REGION_UNKNOWN)
  })

  it('says the catalogue has nothing native here, when the area has none', () => {
    const site = { ...siteFixture(), botanicalArea: 'MAS' }
    expect(regionNote(ready(site), 'Amherst', NO_MATCHES)).toBe(
      'None of the 3 plants in the catalogue grow wild around here. Favouring natives changes nothing in the order below',
    )
    // a catalogue still loading has nothing to count yet
    expect(regionNote(ready(site), 'Amherst', NO_CROPS)).toBeNull()
  })
})
