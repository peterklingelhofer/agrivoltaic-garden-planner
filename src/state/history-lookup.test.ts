import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test'
import { vi } from '../../test/vi'
import type { ResolvedSite } from '../data/site'
import { siteFixture, tmyFixture } from '../recommend/testkit'
import type { LatLon } from '../types/geo'
import { degreesLatitude, degreesLongitude } from '../types/units'

/**
 * The writers that put a design into the store without the grower, and the place a lookup
 * commits. A lookup is held by hand
 * here: the test says when it lands, so what the store does with it can be read before and after
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

/** `usStateOf` stays real, so only the moment a price lands is held here */
const fetchRetailPrice = vi.fn()
const actualRetailPrice = await import('../data/retail-price')
mock.module('../data/retail-price', () => ({ ...actualRetailPrice, fetchRetailPrice }))

const { resetAppStore, showingExample, useAppStore } = await import('./store')
const { canUndo, redo, undo, useHistory } = await import('./history')
const { DEFAULT_LOCATION, DEFAULT_LOCATION_LABEL, DEFAULT_SOIL, makeBed } = await import(
  './defaults'
)
const { WRITE_DELAY_MS } = await import('./persist')

const state = (): ReturnType<typeof useAppStore.getState> => useAppStore.getState()

const BOSTON: LatLon = {
  latitudeDeg: degreesLatitude(42.36),
  longitudeDeg: degreesLongitude(-71.06),
}

/** A soil the map read, which the lookup copies onto every bed nobody typed over */
const MAPPED_SOIL = { ...DEFAULT_SOIL, phUnits: 7.2, sourceId: 'soilgrids' } as const

/** Starts a lookup that lands only when the test says so */
const holdLookup = (
  location: LatLon = DEFAULT_LOCATION,
  label: string = DEFAULT_LOCATION_LABEL,
): { readonly land: () => void; readonly done: Promise<void> } => {
  let land: () => void = () => undefined
  resolveSite.mockImplementationOnce(
    () =>
      new Promise<ResolvedSite>((resolve) => {
        land = () => {
          resolve({ site: siteFixture({ soil: MAPPED_SOIL }), weather: tmyFixture(), years: [] })
        }
      }),
  )
  const done = state().resolveSite(location, label)
  return { land: () => land(), done }
}

const settle = (): void => {
  vi.advanceTimersByTime(WRITE_DELAY_MS)
}

const bedSources = (): readonly string[] => state().plot?.beds.map((bed) => bed.soil.sourceId) ?? []

beforeEach(() => {
  localStorage.clear()
  resetAppStore()
  // a lookup no test drove would reach the real services, so it fails where it can be seen
  resolveSite.mockReset()
  resolveSite.mockImplementation(() => Promise.reject(new Error('a lookup no test drove')))
  fetchRetailPrice.mockReset()
  fetchRetailPrice.mockResolvedValue(null)
  // a failed lookup schedules its own retry, which has no business running inside another test
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
  resolveSite.mockReset()
  resolveSite.mockImplementation(realResolveSite)
})

describe('a place lookup landing is not an edit of the grower', () => {
  it('copies the soil reading onto the beds and leaves nothing to undo', async () => {
    const lookup = holdLookup()
    lookup.land()
    await lookup.done
    expect(state().site.status).toBe('ready')
    // the copy-in happened: the beds read the map now
    expect(bedSources()).toEqual(['soilgrids', 'soilgrids', 'soilgrids'])
    settle()
    expect(canUndo(useHistory.getState())).toBe(false)
  })

  it('still records an edit made before it landed, and undoes only that edit', async () => {
    const lookup = holdLookup()
    state().setMaxCropsPerBed(9)
    lookup.land()
    await lookup.done
    settle()
    expect(useHistory.getState().past.length).toBe(1)
    undo()
    expect(state().maxCropsPerBed).not.toBe(9)
    expect(canUndo(useHistory.getState())).toBe(false)
  })
})

describe('a lookup commits a place, and a new town ends the history', () => {
  it('ends it when the lookup starts for another town, before anything lands', async () => {
    state().setMaxCropsPerBed(9)
    settle()
    expect(canUndo(useHistory.getState())).toBe(true)
    const lookup = holdLookup(BOSTON, 'Boston')
    expect(canUndo(useHistory.getState())).toBe(false)
    lookup.land()
    await lookup.done
    settle()
    expect(canUndo(useHistory.getState())).toBe(false)
    expect(state().maxCropsPerBed).toBe(9)
  })

  it('keeps it through a lookup of the place already on screen', async () => {
    state().setMaxCropsPerBed(9)
    settle()
    const lookup = holdLookup()
    lookup.land()
    await lookup.done
    settle()
    expect(canUndo(useHistory.getState())).toBe(true)
    undo()
    expect(state().maxCropsPerBed).not.toBe(9)
  })

  it('starts recording again from the new town', async () => {
    const lookup = holdLookup(BOSTON, 'Boston')
    lookup.land()
    await lookup.done
    state().setMaxCropsPerBed(9)
    settle()
    expect(useHistory.getState().past.length).toBe(1)
  })
})

describe('the example garden is not an edit of the grower either', () => {
  /** The shipped assets are the real ones on disk, served by a fetch that stays on the machine */
  const withShippedExample = async (run: () => Promise<void>): Promise<void> => {
    const realFetch = globalThis.fetch
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      const name = url.slice(url.lastIndexOf('/') + 1)
      return new Response(readFileSync(join(process.cwd(), 'public', 'data', name)), {
        status: 200,
      })
    }) as never
    try {
      await run()
    } finally {
      globalThis.fetch = realFetch
    }
  }

  it('arrives with nothing to undo', async () => {
    await withShippedExample(async () => {
      const started = state().plot
      await state().loadExample()
      expect(state().example).toBe('showing')
      expect(state().plot).not.toBe(started)
      settle()
      expect(canUndo(useHistory.getState())).toBe(false)
    })
  })

  it('is cleared with nothing to undo', async () => {
    await withShippedExample(async () => {
      await state().loadExample()
      state().clearExample()
      settle()
      expect(canUndo(useHistory.getState())).toBe(false)
    })
  })

  it('comes back, banner and all, when an edit made over it is undone', async () => {
    await withShippedExample(async () => {
      await state().loadExample()
      const shipped = state().plot
      expect(showingExample(state())).toBe(true)
      state().upsertBed(makeBed(9))
      expect(showingExample(state())).toBe(false)
      undo()
      expect(state().plot).toBe(shipped)
      expect(showingExample(state())).toBe(true)
      redo()
      expect(showingExample(state())).toBe(false)
    })
  })
})
