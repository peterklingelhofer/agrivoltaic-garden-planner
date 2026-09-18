import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { beforeEach, describe, expect, it, mock } from 'bun:test'
import { vi } from '../../test/vi'
import { siteFixture, tmyFixture } from '../recommend/testkit'
import { citedVerbatim } from '../types/cited'
import type { LatLon } from '../types/geo'
import type { SoilProfile } from '../types/site'
import { degreesLatitude, degreesLongitude } from '../types/units'

const resolveSite = vi.fn()
const fetchRetailPrice = vi.fn()

/* captured before the mock is installed, so the spread carries the real module */
const actualSite = await import('../data/site')
mock.module('../data/site', () => ({ ...actualSite, resolveSite }))

/** `usStateOf` stays real: which places have a price is the half of this worth testing */
const actualRetailPrice = await import('../data/retail-price')
mock.module('../data/retail-price', () => ({ ...actualRetailPrice, fetchRetailPrice }))

/**
 * The layout search itself isn't the subject here, only that the site is settled before it. Left
 * real it runs five annual bakes to prove a retry, which is slow enough alone and behaves
 * differently under the whole suite's parallelism
 */
const actualDesignBridge = await import('./design-bridge')
mock.module('./design-bridge', () => ({
  ...actualDesignBridge,
  runDesignSuggestions: vi.fn(() => Promise.resolve({ ok: false, message: 'not the subject' })),
}))

const { resetAppStore, showingExample, useAppStore } = await import('./store')
const { DEFAULT_LOCATION, DEFAULT_LOCATION_LABEL } = await import('./defaults')
const { lightGeometryKey } = await import('./light-freshness')
const { ACID_SOIL } = await import('./testkit')
const { STORAGE_KEY, WRITE_DELAY_MS } = await import('./persist')

const state = (): ReturnType<typeof useAppStore.getState> => useAppStore.getState()

beforeEach(() => {
  localStorage.clear()
  resetAppStore()
  resolveSite.mockReset()
  resolveSite.mockResolvedValue({ site: siteFixture(), weather: tmyFixture(), years: [] })
  fetchRetailPrice.mockReset()
  fetchRetailPrice.mockResolvedValue(null)
})

/** MAS is the TDWG region for Massachusetts, which is the state EIA prices as MA */
const resolvesInMassachusetts = (): void => {
  resolveSite.mockResolvedValue({
    site: siteFixture({ botanicalArea: 'MAS' }),
    weather: tmyFixture(),
    years: [],
  })
}

const MA_PRICE = {
  usdPerKwh: citedVerbatim(0.3048, 'B', ['eia-electric-power-monthly-5-6-a'], null),
  stateCode: 'MA',
  year: 2025,
  sourceLabel: 'test',
}

/**
 * With no unusual action at all, a design restored without its site can show its town in the
 * toolbar, a fully baked garden in the scene and ready in the header, while the sidebar has no site
 * and seven panels refuse to work.
 *
 * `PersistedDesign` carries `location` without `site`, so every route that restores a design
 * without going through the questions restores everything DERIVED from a site while leaving the
 * site itself unresolved: the example, "Skip to the full editor", and any reload of a saved
 * garden. What follows is the promise that fixes it: the app looks up the place it has been
 * naming on screen since the first frame
 */
describe('the place the app is already showing gets looked up', () => {
  it('resolves the location nobody has resolved yet', async () => {
    expect(state().site.status).toBe('idle')
    await state().ensureSite()
    expect(resolveSite).toHaveBeenCalledTimes(1)
    // no signal, and no country: the boot lookup has no geocoder answer to take one from
    expect(resolveSite).toHaveBeenCalledWith(DEFAULT_LOCATION, DEFAULT_LOCATION_LABEL, null, null)
    expect(state().site.status).toBe('ready')
    expect(state().weather.status).toBe('ready')
  })

  /** Safe to call from anywhere is the whole point, so calling it twice must cost one lookup */
  it("doesn't look the same place up twice", async () => {
    await state().ensureSite()
    await state().ensureSite()
    await state().ensureSite()
    expect(resolveSite).toHaveBeenCalledTimes(1)
  })

  /**
   * A failure stays failed. Retrying on every render would put a site lookup on a timer against
   * an upstream that has already said no, and the visitor's own remedy is the Resolve control
   */
  it('leaves a failed lookup alone rather than retrying it', async () => {
    resolveSite.mockRejectedValueOnce(new Error('upstream said no'))
    await state().ensureSite()
    expect(state().site.status).toBe('error')
    await state().ensureSite()
    expect(resolveSite).toHaveBeenCalledTimes(1)
  })

  /**
   * The layout search settles the editor's site before it runs, so the two can never disagree about
   * the place the answers named. Left alone the engine resolves a site of its own and never hands
   * it back, and the visitor would reach a results step quoting real kWh and DLI for their town
   * while the sidebar one click away still said nothing had been looked up
   */
  it('settles the site before the layout search, including after a failed lookup', async () => {
    resolveSite.mockRejectedValueOnce(new Error('upstream said no'))
    await state().ensureSite()
    expect(state().site.status).toBe('error')

    // a press is the visitor asking, which is the retry `ensureSite` deliberately won't do
    await state().suggestDesigns()
    expect(resolveSite).toHaveBeenCalledTimes(2)
    expect(state().site.status).toBe('ready')
  })

  /**
   * The press is answered before the lookup it has to run first lands. That lookup is seconds on a
   * phone, and a button that shows nothing for that long reads as broken
   */
  it('shows the search as running while the lookup it needs first is still out', async () => {
    resolveSite.mockRejectedValueOnce(new Error('upstream said no'))
    await state().ensureSite()
    let land: (value: unknown) => void = () => undefined
    resolveSite.mockReturnValueOnce(
      new Promise((resolve) => {
        land = resolve
      }),
    )
    const press = state().suggestDesigns()
    await Promise.resolve()
    expect(state().onboarding.designs.status).toBe('loading')
    expect(state().sidebarStep).toBe('panels')
    land({ site: siteFixture(), weather: tmyFixture(), years: [] })
    await press
    expect(state().site.status).toBe('ready')
  })

  /** A lookup that fails again ends the search with its own sentence, rather than running twice */
  it("fails the search with the lookup's sentence when the place can't be looked up", async () => {
    resolveSite.mockRejectedValue(new Error('upstream said no'))
    await state().ensureSite()
    await state().suggestDesigns()
    expect(resolveSite).toHaveBeenCalledTimes(2)
    const designs = state().onboarding.designs
    const site = state().site
    expect(designs.status).toBe('error')
    expect(site.status).toBe('error')
    if (designs.status === 'error' && site.status === 'error') {
      expect(designs.message).toBe(site.message)
    }
  })

  /** And it never overrides a place the visitor actually chose */
  it('leaves a resolved site alone', async () => {
    await state().resolveSite(
      { latitudeDeg: degreesLatitude(1.35), longitudeDeg: degreesLongitude(103.8) },
      'Singapore',
    )
    expect(resolveSite).toHaveBeenCalledTimes(1)
    await state().ensureSite()
    expect(resolveSite).toHaveBeenCalledTimes(1)
    expect(state().locationLabel).toBe('Singapore')
  })
})

/**
 * What a kilowatt-hour costs where the garden is, which the seasons step values a year of panels
 * at. It's looked up beside the site and never in front of it: the place resolving unblocks
 * every panel in the sidebar, and a state price is worth one readout at the bottom of one of them
 */
describe('the price of electricity where the garden is', () => {
  it('looks the state price up once the place is known, without holding the place up', async () => {
    resolvesInMassachusetts()
    let settle: (price: unknown) => void = () => undefined
    fetchRetailPrice.mockReturnValue(
      new Promise((resolve) => {
        settle = resolve
      }),
    )

    await state().resolveSite(DEFAULT_LOCATION, DEFAULT_LOCATION_LABEL)
    // the site is ready with the price still in flight, which is the whole point of not awaiting it
    expect(state().site.status).toBe('ready')
    expect(state().retailPrice).toBeNull()
    expect(fetchRetailPrice).toHaveBeenCalledWith('MA', { signal: null })

    settle(MA_PRICE)
    await vi.waitFor(() => {
      expect(state().retailPrice).toEqual(MA_PRICE)
    })
  })

  it('asks nobody for a price outside the states EIA publishes', async () => {
    // the fixture carries no botanical region at all, which is every garden off the region grid
    await state().resolveSite(DEFAULT_LOCATION, DEFAULT_LOCATION_LABEL)
    expect(state().site.status).toBe('ready')
    expect(state().retailPrice).toBeNull()
    expect(fetchRetailPrice).not.toHaveBeenCalled()
  })

  /**
   * A garden with no price is supported everywhere, so a refusing upstream reads as one
   */
  it('leaves the price null when the lookup fails, and the site alone', async () => {
    resolvesInMassachusetts()
    fetchRetailPrice.mockRejectedValue(
      new Error("eia isn't configured: EIA_API_KEY secret is unset"),
    )
    await state().resolveSite(DEFAULT_LOCATION, DEFAULT_LOCATION_LABEL)
    await vi.waitFor(() => {
      expect(fetchRetailPrice).toHaveBeenCalled()
    })
    expect(state().retailPrice).toBeNull()
    expect(state().site.status).toBe('ready')
  })

  /** A price for the place before last isn't a price for this one */
  it('forgets the price the moment another place is asked for', async () => {
    resolvesInMassachusetts()
    fetchRetailPrice.mockResolvedValue(MA_PRICE)
    await state().resolveSite(DEFAULT_LOCATION, DEFAULT_LOCATION_LABEL)
    await vi.waitFor(() => {
      expect(state().retailPrice).not.toBeNull()
    })

    resolveSite.mockResolvedValue({ site: siteFixture(), weather: tmyFixture(), years: [] })
    await state().resolveSite(
      { latitudeDeg: degreesLatitude(1.35), longitudeDeg: degreesLongitude(103.8) },
      'Singapore',
    )
    expect(state().retailPrice).toBeNull()
  })
})

describe('a new place is a new sky', () => {
  // the resolver answers for the place it was asked about, as the real one does
  beforeEach(() => {
    resolveSite.mockImplementation((location: LatLon) =>
      Promise.resolve({ site: siteFixture({ location }), weather: tmyFixture(), years: [] }),
    )
  })
  const baked = (): void => {
    const plot = state().plot
    useAppStore.setState((s) => ({
      ...s,
      raster: { status: 'ready', value: {} as never },
      bedLight: [{ bedId: 'bed-1' } as never],
      lightGeometry: plot === null ? null : lightGeometryKey(plot),
    }))
  }

  /**
   * `lightGeometryKey` reads the plot alone, so on the key alone a raster baked for one town would
   * stay "ready", with its ranking, after another was typed over it. The lookup of a different
   * place idles the light, and the automatic run works the new sky out once the lookup lands
   */
  it('idles the light when the place the site was resolved for changes', async () => {
    await state().resolveSite(DEFAULT_LOCATION, DEFAULT_LOCATION_LABEL)
    baked()
    await state().resolveSite(
      { latitudeDeg: degreesLatitude(42.32), longitudeDeg: degreesLongitude(-72.63) },
      'Northampton',
    )
    expect(state().raster.status).toBe('idle')
    expect(state().bedLight).toEqual([])
    expect(state().lightGeometry).toBeNull()
  })

  /** The example's own town at startup, or coordinates looked up twice: nothing to throw away */
  it('keeps the light when the same place is looked up again', async () => {
    await state().resolveSite(DEFAULT_LOCATION, DEFAULT_LOCATION_LABEL)
    baked()
    await state().resolveSite(DEFAULT_LOCATION, DEFAULT_LOCATION_LABEL)
    expect(state().raster.status).toBe('ready')
    expect(state().bedLight.length).toBe(1)
  })
})

/**
 * The area's own pH is the default a new bed gets. Every new bed starts at
 * `DEFAULT_SOIL`, which nobody chose, so a site resolving is this app finally having an answer
 * of its own. A pH the visitor set, by typing or through an earlier lookup, is a different story
 */
describe('soil pH from the place', () => {
  const soilAt = (phUnits: number, sourceId: SoilProfile['sourceId']): SoilProfile => ({
    ...ACID_SOIL,
    phUnits,
    sourceId,
  })

  it('gives every default bed the site pH once the place resolves', async () => {
    resolveSite.mockResolvedValue({
      site: siteFixture({ soil: soilAt(7.23, 'soilgrids') }),
      weather: tmyFixture(),
      years: [],
    })
    await state().resolveSite(DEFAULT_LOCATION, DEFAULT_LOCATION_LABEL)
    const beds = state().plot?.beds ?? []
    expect(beds.length).toBeGreaterThan(0)
    // rounded to 0.1, and the site's own source rather than a bare 'user' left over
    expect(beds.every((bed) => bed.soil.phUnits === 7.2 && bed.soil.sourceId === 'soilgrids')).toBe(
      true,
    )
  })

  /** A copied default is still a default, and the bed panel reads the source to say so */
  it('stamps a copied default as the default it is', async () => {
    resolveSite.mockResolvedValue({
      site: siteFixture({ soil: soilAt(6.5, 'default') }),
      weather: tmyFixture(),
      years: [],
    })
    await state().resolveSite(DEFAULT_LOCATION, DEFAULT_LOCATION_LABEL)
    const beds = state().plot?.beds ?? []
    expect(beds.length).toBeGreaterThan(0)
    expect(beds.every((bed) => bed.soil.sourceId === 'default' && bed.soil.phUnits === 6.5)).toBe(
      true,
    )
  })

  it('leaves a pH the visitor typed alone', async () => {
    const bed = state().plot?.beds[0]
    if (bed === undefined) throw new Error('no bed to test against')
    state().upsertBed({ ...bed, soil: { ...bed.soil, phUnits: 5.8, sourceId: 'user' } })

    resolveSite.mockResolvedValue({
      site: siteFixture({ soil: soilAt(7.2, 'soilgrids') }),
      weather: tmyFixture(),
      years: [],
    })
    await state().resolveSite(DEFAULT_LOCATION, DEFAULT_LOCATION_LABEL)

    const after = state().plot?.beds.find((entry) => entry.id === bed.id)
    expect(after?.soil.phUnits).toBe(5.8)
    expect(after?.soil.sourceId).toBe('user')
  })

  /**
   * The copy-in is the store's own edit. Counted as the visitor's, it would save the design 600 ms
   * after the lookup landed over a garden nobody had touched, and a notice that the browser's old
   * design couldn't be read would turn into "Saved" before they did anything
   */
  it('copies the pH without saving anything, and the next real edit carries it out', async () => {
    vi.useFakeTimers()
    try {
      resolveSite.mockResolvedValue({
        site: siteFixture({ soil: soilAt(7.2, 'soilgrids') }),
        weather: tmyFixture(),
        years: [],
      })
      await state().resolveSite(DEFAULT_LOCATION, DEFAULT_LOCATION_LABEL)
      expect(state().plot?.beds.every((bed) => bed.soil.sourceId === 'soilgrids')).toBe(true)
      vi.advanceTimersByTime(WRITE_DELAY_MS * 2)
      expect(localStorage.getItem(STORAGE_KEY)).toBeNull()
      expect(state().storage.outcome).toBe('idle')

      state().setOverlay({ opacity: 0.5 })
      vi.advanceTimersByTime(WRITE_DELAY_MS)
      const written = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as {
        design?: { plot?: { beds?: readonly { soil: SoilProfile }[] } }
      }
      const beds = written.design?.plot?.beds ?? []
      expect(beds.length).toBeGreaterThan(0)
      expect(beds.every((bed) => bed.soil.sourceId === 'soilgrids')).toBe(true)
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('the shipped example through its own lookup', () => {
  /**
   * At startup the lookup is under way before the asset has arrived. If it lands first and the pH
   * copy-in rebuilds the default plot, the loader reads that as an edit of the visitor's and bails,
   * and a slow connection never sees the example at all
   */
  it('still shows the example when the lookup lands before the asset does', async () => {
    const realFetch = globalThis.fetch
    let release: () => void = () => {}
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      await gate
      const url = String(input)
      const name = url.slice(url.lastIndexOf('/') + 1)
      return new Response(readFileSync(join(process.cwd(), 'public', 'data', name)), {
        status: 200,
      })
    }) as never
    try {
      const pending = state().loadExample()
      resolveSite.mockResolvedValue({
        site: siteFixture({ soil: { ...ACID_SOIL, phUnits: 7.2, sourceId: 'soilgrids' } }),
        weather: tmyFixture(),
        years: [],
      })
      await state().resolveSite(DEFAULT_LOCATION, DEFAULT_LOCATION_LABEL)
      expect(state().plot?.beds.every((bed) => bed.soil.sourceId === 'soilgrids')).toBe(true)
      release()
      await pending
      expect(state().example).toBe('showing')
      expect(showingExample(state())).toBe(true)
    } finally {
      globalThis.fetch = realFetch
    }
  })

  /**
   * The example looks its own place up at startup, and `showingExample` knows the example by
   * the plot object's identity: a pH default that rebuilt the plot took the banner off the
   * screen and failed thirty e2e tests on 2026-09-11. The assets are the real ones on disk
   */
  it('keeps the plot exactly as shipped, pH included', async () => {
    const realFetch = globalThis.fetch
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      const name = url.slice(url.lastIndexOf('/') + 1)
      return new Response(readFileSync(join(process.cwd(), 'public', 'data', name)), {
        status: 200,
      })
    }) as never
    try {
      await state().loadExample()
      expect(showingExample(state())).toBe(true)
      const before = state().plot
      resolveSite.mockResolvedValue({
        site: siteFixture({ soil: { ...ACID_SOIL, phUnits: 7.2, sourceId: 'soilgrids' } }),
        weather: tmyFixture(),
        years: [],
      })
      await state().resolveSite(state().location, state().locationLabel)
      expect(state().site.status).toBe('ready')
      expect(state().plot).toBe(before)
      expect(showingExample(state())).toBe(true)
      // the checks are the store's, run over the shipped raster and rerun once the town resolves
      expect(state().compliance.length).toBeGreaterThan(0)
    } finally {
      globalThis.fetch = realFetch
    }
  })
})

/**
 * The starting array faces south, which is away from the sun south of the equator. A place that
 * resolves south of the equator turns an array still on a starting direction, and nothing somebody
 * pointed by hand. Without that turn, Melbourne on the coordinates path would bake the example's
 * south-facing rows and read a bed as sunny
 */
describe('which way the starting array faces', () => {
  const sydney = {
    latitudeDeg: degreesLatitude(-33.87),
    longitudeDeg: degreesLongitude(151.21),
  }
  const resolvesAt = (location: LatLon): void => {
    resolveSite.mockResolvedValue({
      site: siteFixture({ location }),
      weather: tmyFixture(),
      years: [],
    })
  }
  /** Which way the first array faces, or null where it's not a fixed array */
  const facing = (): number | null => {
    const tracker = state().plot?.arrays[0]?.tracker
    return tracker !== undefined && tracker.mode === 'fixed' ? tracker.surfaceAzimuthDeg : null
  }

  it('turns the starting array to face the equator south of it', async () => {
    resolvesAt(sydney)
    expect(facing()).toBe(180)
    await state().resolveSite(sydney, 'Sydney')
    expect(facing()).toBe(0)
  })

  it('leaves an array somebody pointed by hand alone', async () => {
    const plot = state().plot
    if (plot === null) throw new Error('no plot')
    useAppStore.setState({
      plot: {
        ...plot,
        arrays: plot.arrays.map((array) => ({
          ...array,
          tracker: { ...array.tracker, surfaceAzimuthDeg: 135 as never },
        })),
      },
    })
    resolvesAt(sydney)
    await state().resolveSite(sydney, 'Sydney')
    expect(facing()).toBe(135)
  })

  it('changes nothing north of the equator', async () => {
    const before = state().plot
    await state().resolveSite(DEFAULT_LOCATION, DEFAULT_LOCATION_LABEL)
    expect(facing()).toBe(180)
    expect(state().plot?.arrays).toBe(before?.arrays)
  })
})

/**
 * Two lookups in flight at once: the boot lookup of the example's town and a search typed within
 * seconds of opening. If whichever finished last won, a quick visitor could get the example town's
 * ground under their own town's weather. The later lookup is the place on screen
 */
describe('a lookup that lands after a later one', () => {
  it('is dropped rather than written over the later one', async () => {
    const sydney = {
      latitudeDeg: degreesLatitude(-33.87),
      longitudeDeg: degreesLongitude(151.21),
    }
    let finishFirst: (value: unknown) => void = () => undefined
    const first = new Promise((resolve) => {
      finishFirst = resolve
    })
    resolveSite.mockImplementationOnce(() => first)
    resolveSite.mockResolvedValueOnce({
      site: siteFixture({ location: sydney, label: 'Sydney' }),
      weather: tmyFixture(),
      years: [],
    })
    const slow = state().resolveSite(DEFAULT_LOCATION, DEFAULT_LOCATION_LABEL)
    await state().resolveSite(sydney, 'Sydney')
    const labelOf = (): string | null => {
      const site = state().site
      return site.status === 'ready' ? site.value.label : null
    }
    expect(labelOf()).toBe('Sydney')
    finishFirst({ site: siteFixture({ label: 'Amherst' }), weather: tmyFixture(), years: [] })
    await slow
    expect(labelOf()).toBe('Sydney')
    expect(state().location).toEqual(sydney)
  })
})
