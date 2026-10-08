import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test'
import { vi } from '../../test/vi'
import type { ResolvedSite, SitePart } from '../data/site'
import { siteFixture, tmyFixture } from '../recommend/testkit'
import type { LatLon } from '../types/geo'
import { degreesLatitude, degreesLongitude } from '../types/units'

/**
 * The place lookup reports each part as it lands, and the store keeps the parts still out so the
 * notice can name the slow one. A lookup is driven by hand here: the test says when a part lands
 * and when the whole settles, so the list can be read in between
 */

/* captured before the mock is installed, so the spread and the stand-in carry the real module */
const actualSite = await import('../data/site')
const realResolveSite = actualSite.resolveSite

/**
 * The stand-in calls the real lookup except while a test of this file is running. A module mock
 * outlives its file when several share a process, and a later file that expects the real lookup
 * would otherwise be handed one that answers nothing
 */
const resolveSite = vi.fn(realResolveSite)
mock.module('../data/site', () => ({ ...actualSite, resolveSite }))

const { resetAppStore, useAppStore } = await import('./store')
const { DEFAULT_LOCATION, DEFAULT_LOCATION_LABEL } = await import('./defaults')
const { PERSISTED_KEYS, snapshotDesign, STORAGE_KEY, WRITE_DELAY_MS } = await import('./persist')

const state = (): ReturnType<typeof useAppStore.getState> => useAppStore.getState()

const BOSTON: LatLon = {
  latitudeDeg: degreesLatitude(42.36),
  longitudeDeg: degreesLongitude(-71.06),
}
const SYDNEY: LatLon = {
  latitudeDeg: degreesLatitude(-33.87),
  longitudeDeg: degreesLongitude(151.21),
}

const ALL_THREE: readonly SitePart[] = ['weather', 'soil', 'frost']

interface Driven {
  /** The data layer saying that every request of one group has landed */
  readonly report: (part: SitePart) => void
  /** The whole lookup answering */
  readonly land: () => void
  readonly fail: (message: string) => void
  /** The store's action, to await once the lookup has settled */
  readonly done: Promise<void>
}

/** Starts a lookup that settles only when the test says so */
const startLookup = (
  location: LatLon = DEFAULT_LOCATION,
  label = DEFAULT_LOCATION_LABEL,
): Driven => {
  let report: (part: SitePart) => void = () => undefined
  let land: () => void = () => undefined
  let fail: (message: string) => void = () => undefined
  resolveSite.mockImplementationOnce(
    (
      _location: LatLon,
      _label: string,
      _signal: AbortSignal | null,
      _countryCode?: string | null,
      onPart?: (part: SitePart) => void,
    ) =>
      new Promise<ResolvedSite>((resolve, reject) => {
        report = (part) => {
          onPart?.(part)
        }
        land = () => {
          resolve({ site: siteFixture(), weather: tmyFixture(), years: [] })
        }
        fail = (message) => {
          reject(new Error(message))
        }
      }),
  )
  const done = state().resolveSite(location, label)
  return {
    report: (part) => {
      report(part)
    },
    land: () => {
      land()
    },
    fail: (message) => {
      fail(message)
    },
    done,
  }
}

beforeEach(() => {
  localStorage.clear()
  resetAppStore()
  // a lookup no test drove would reach the real services, so it fails where it can be seen
  resolveSite.mockReset()
  resolveSite.mockImplementation(() => Promise.reject(new Error('a lookup no test drove')))
  // a failed lookup schedules its own retry, which has no business running inside another test
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
  resolveSite.mockReset()
  resolveSite.mockImplementation(realResolveSite)
})

describe('the parts of the place lookup that are still out', () => {
  it('is empty until a lookup starts', () => {
    expect(state().sitePending).toEqual([])
  })

  it('lists all three when a lookup starts and drops each part as it lands', async () => {
    const lookup = startLookup()
    expect(state().site.status).toBe('loading')
    expect(state().sitePending).toEqual(ALL_THREE)
    lookup.report('weather')
    expect(state().sitePending).toEqual(['soil', 'frost'])
    lookup.report('frost')
    expect(state().sitePending).toEqual(['soil'])
    // with two parts in the lookup is still out, and the notice still has the soil to name
    expect(state().site.status).toBe('loading')
    expect(state().weather.status).toBe('loading')
    lookup.report('soil')
    lookup.land()
    await lookup.done
  })

  it('is empty once the lookup lands', async () => {
    const lookup = startLookup()
    lookup.report('weather')
    lookup.land()
    await lookup.done
    expect(state().site.status).toBe('ready')
    expect(state().sitePending).toEqual([])
  })

  it('is empty once the lookup fails', async () => {
    const lookup = startLookup()
    lookup.report('soil')
    lookup.fail('the weather service is busy')
    await lookup.done
    expect(state().site.status).toBe('error')
    expect(state().weather.status).toBe('error')
    expect(state().sitePending).toEqual([])
  })

  it('hears nothing from a request that lands after its lookup failed', async () => {
    const lookup = startLookup()
    lookup.fail('the weather service is busy')
    await lookup.done
    // the other requests of a failed lookup carry on, and the soil can still come in
    const settled = state().sitePending
    lookup.report('soil')
    expect(state().sitePending).toBe(settled)
  })

  it('ignores the parts of a lookup that a later one superseded', async () => {
    const first = startLookup(BOSTON, 'Boston')
    const second = startLookup(SYDNEY, 'Sydney')
    expect(state().sitePending).toEqual(ALL_THREE)

    first.report('weather')
    first.report('soil')
    expect(state().sitePending).toEqual(ALL_THREE)

    second.report('frost')
    expect(state().sitePending).toEqual(['weather', 'soil'])

    // the earlier lookup landing is dropped, and leaves alone the list the later one is showing
    first.land()
    await first.done
    expect(state().site.status).toBe('loading')
    expect(state().sitePending).toEqual(['weather', 'soil'])

    second.land()
    await second.done
    expect(state().site.status).toBe('ready')
    expect(state().sitePending).toEqual([])

    // and a part the earlier one reports now finds nothing to change
    const settled = state().sitePending
    first.report('weather')
    expect(state().sitePending).toBe(settled)
  })

  it('lists all three again when the place is looked up again after a failure', async () => {
    const failing = startLookup()
    failing.report('weather')
    failing.fail('the weather service is busy')
    await failing.done
    expect(state().sitePending).toEqual([])

    const retry = startLookup()
    expect(state().sitePending).toEqual(ALL_THREE)
    retry.land()
    await retry.done
    expect(state().sitePending).toEqual([])
  })

  it('goes with the rest when the design is forgotten', async () => {
    const lookup = startLookup()
    lookup.report('weather')
    state().clearDesign()
    expect(state().site.status).toBe('idle')
    expect(state().sitePending).toEqual([])
    // the lookup was already out, and what it reports now changes nothing
    lookup.report('soil')
    expect(state().sitePending).toEqual([])
    lookup.land()
    await lookup.done
  })

  it('is never saved with the design', async () => {
    const lookup = startLookup()
    lookup.report('weather')
    expect(state().sitePending).toEqual(['soil', 'frost'])
    expect(PERSISTED_KEYS).not.toContain('sitePending')
    expect(Object.keys(snapshotDesign(state()))).not.toContain('sitePending')
    // and a part landing doesn't schedule a write of the design either
    vi.advanceTimersByTime(WRITE_DELAY_MS * 2)
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull()
    lookup.land()
    await lookup.done
  })
})
