import { describe, expect, it } from 'bun:test'
import { siteFixture } from '../recommend/testkit'
import { failed, idle, loading, ready } from '../state/slices'
import { NATIVE_REGION_UNKNOWN } from './format'
import { regionNote } from './region'

describe('why there is no region to favour natives in', () => {
  it('says nothing once the place has a region', () => {
    expect(regionNote(ready({ ...siteFixture(), botanicalArea: 'MAS' }), 'Amherst')).toBeNull()
  })

  it('names the place as outside the map when it resolved without one', () => {
    const site = { ...siteFixture(), botanicalArea: null }
    expect(regionNote(ready(site), 'Trenton, New Jersey')).toMatch(
      /Trenton, New Jersey is outside the region map/,
    )
  })

  it('says the lookup failed when it did, and where to retry it', () => {
    expect(regionNote(failed('the weather service refused'), 'Trenton')).toMatch(/lookup failed/)
    expect(regionNote(failed('x'), 'Trenton')).toMatch(/first question or the site panel/)
  })

  it('falls back to the general sentence before any lookup', () => {
    expect(regionNote(idle(), 'Trenton')).toBe(NATIVE_REGION_UNKNOWN)
    expect(regionNote(loading(), 'Trenton')).toBe(NATIVE_REGION_UNKNOWN)
  })
})
