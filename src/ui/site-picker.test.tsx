/// <reference types="node" />
import { readFileSync } from 'node:fs'
import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test'
import { vi } from '../../test/vi'
import type { GeocodeHit } from '../data/geocode'
import { NRCAN_SCHEME_NOTE } from '../data/static-layers'
import { siteFixture } from '../recommend/testkit'
import { exampleDesignPath, exampleRasterPath } from '../state/example'
import { ready } from '../state/slices'
import { getAppState, resetAppStore, useAppStore } from '../state/store'
import type { Celsius, DegreesLatitude, DegreesLongitude } from '../types/units'
import { SitePanel } from './SitePanel'
import { mount, type Harness } from './testkit'

const hit = (label: string, lat: number, lon: number): GeocodeHit => ({
  label,
  location: { latitudeDeg: lat as DegreesLatitude, longitudeDeg: lon as DegreesLongitude },
  countryCode: 'US',
  attribution: 'Data (c) OpenStreetMap contributors, ODbL 1.0',
})

const HITS: readonly GeocodeHit[] = [
  hit('Springfield, Massachusetts', 42.1015, -72.5898),
  hit('Springfield, Illinois', 39.7817, -89.6501),
]

const geocode = vi.hoisted(() => vi.fn())
const reverseGeocode = vi.hoisted(() => vi.fn())

/* captured before the mock is installed, so the spread carries the real module */
const actualGeocode = await import('../data/geocode')
mock.module('../data/geocode', () => ({ ...actualGeocode, geocode, reverseGeocode }))

const resolveSite = vi.fn(async () => undefined)
let originalResolve: typeof resolveSite

const search = async (harness: Harness): Promise<void> => {
  await harness.type('control-site-search', 'Springfield')
  await harness.click('action-site-search')
  await act(async () => {
    await vi.advanceTimersByTimeAsync(2000)
  })
  expect(geocode).toHaveBeenCalled()
}

beforeEach(() => {
  resetAppStore()
  vi.useFakeTimers()
  geocode.mockReset()
  geocode.mockResolvedValue(HITS)
  reverseGeocode.mockReset()
  reverseGeocode.mockResolvedValue(hit('Glassboro, New Jersey', 39.7029, -75.1118))
  resolveSite.mockClear()
  originalResolve = useAppStore.getState().resolveSite as typeof resolveSite
  useAppStore.setState({ resolveSite })
})

afterEach(() => {
  useAppStore.setState({ resolveSite: originalResolve })
  vi.useRealTimers()
})

describe('address search results are a picker, not a list of links', () => {
  it('carries listbox semantics, the region under the name and a roving tabindex', async () => {
    const harness = await mount(<SitePanel />)
    await search(harness)

    const list = harness.get('list-site-results')
    expect(list.getAttribute('role')).toBe('listbox')
    const options = harness.all('item-site-result-Springfield, Massachusetts')
    expect(options.length).toBe(1)
    const first = options[0] as HTMLElement
    const second = harness.get('item-site-result-Springfield, Illinois')
    expect(first.getAttribute('role')).toBe('option')
    expect(first.getAttribute('aria-selected')).toBe('true')
    expect(second.getAttribute('aria-selected')).toBe('false')
    expect([first.tabIndex, second.tabIndex]).toEqual([0, -1])
    // two same-named places are told apart by their region, the way a person tells them apart,
    // and the coordinates aren't printed at all
    expect(first.querySelector('.picker-label')?.textContent).toBe('Springfield')
    expect(first.querySelector('.picker-note')?.textContent).toBe('Massachusetts')
    expect(second.querySelector('.picker-note')?.textContent).toBe('Illinois')
    expect(first.textContent).not.toContain('42.1015')
    expect(harness.find('readout-site-result-help')).toBeNull()
    await harness.unmount()
  })

  it('moves the selection with the arrow keys and wraps', async () => {
    const harness = await mount(<SitePanel />)
    await search(harness)

    await harness.press('item-site-result-Springfield, Massachusetts', 'ArrowDown')
    expect(
      harness.get('item-site-result-Springfield, Illinois').getAttribute('aria-selected'),
    ).toBe('true')
    await harness.press('item-site-result-Springfield, Illinois', 'ArrowDown')
    expect(
      harness.get('item-site-result-Springfield, Massachusetts').getAttribute('aria-selected'),
    ).toBe('true')
    await harness.press('item-site-result-Springfield, Massachusetts', 'End')
    expect(
      harness.get('item-site-result-Springfield, Illinois').getAttribute('aria-selected'),
    ).toBe('true')
    await harness.unmount()
  })

  it('dismisses on Escape and returns focus to the search field', async () => {
    const harness = await mount(<SitePanel />)
    await search(harness)
    await harness.press('item-site-result-Springfield, Massachusetts', 'Escape')
    expect(harness.find('list-site-results')).toBeNull()
    expect(document.activeElement).toBe(harness.get('control-site-search'))
    expect(resolveSite).not.toHaveBeenCalled()
    await harness.unmount()
  })
})

describe('choosing a result resolves the site', () => {
  it('resolves on click, closes the list and confirms the choice', async () => {
    const harness = await mount(<SitePanel />)
    await search(harness)
    await harness.click('item-site-result-Springfield, Illinois')

    expect(resolveSite).toHaveBeenCalledTimes(1)
    const call = resolveSite.mock.calls[0] as unknown as readonly [
      { latitudeDeg: number; longitudeDeg: number },
      string,
    ]
    expect(call[0].latitudeDeg).toBe(39.7817)
    expect(call[0].longitudeDeg).toBe(-89.6501)
    expect(call[1]).toBe('Springfield, Illinois')

    expect(harness.find('list-site-results')).toBeNull()
    // one row: the place, and the way to change it, which puts the cursor back in the field
    expect(harness.get('readout-site-selection').textContent).toBe('Springfield, Illinois · Change')
    expect(harness.get('readout-site-label').textContent).toBe('Springfield, Illinois')
    await harness.click('action-site-change')
    expect(document.activeElement).toBe(harness.get('control-site-search'))
    await harness.unmount()
  })

  it('resolves the result the keyboard moved to, not the first one', async () => {
    const harness = await mount(<SitePanel />)
    await search(harness)
    await harness.press('item-site-result-Springfield, Massachusetts', 'ArrowDown')
    // each option is a real button, so the browser turns Enter and Space into this click
    await harness.click('item-site-result-Springfield, Illinois')
    expect(resolveSite).toHaveBeenCalledTimes(1)
    expect((resolveSite.mock.calls[0] as unknown as readonly [unknown, string])[1]).toBe(
      'Springfield, Illinois',
    )
    await harness.unmount()
  })

  it('keeps the manual coordinate path inside the fold, and its OSM attribution', async () => {
    const harness = await mount(<SitePanel />)
    const fold = harness.get('details-site-more')
    expect(harness.get('action-site-resolve').closest('details')).toBe(fold)
    expect(harness.get('control-site-latitude').closest('details')).toBe(fold)
    expect(harness.get('readout-site-resolve-help').textContent).toContain('by hand')
    expect(harness.get('readout-site-attribution').textContent).toContain('OpenStreetMap')
    await harness.click('action-site-resolve')
    expect(resolveSite).toHaveBeenCalledTimes(1)
    await harness.unmount()
  })
})

/**
 * The face of the step is the field, the press, the place and the frost sentence. The example
 * garden says whose garden it is where the visitor would otherwise search for a place that is
 * already on screen. A visitor's own garden gets no subtitle at all. The example is the shipped
 * one, off disk, because `showingExample` is a claim about the plot on screen
 */
describe('the example garden', () => {
  const shipped = (path: string): Buffer => readFileSync(`public${path}`)

  it("is named as an example, and a garden of the visitor own isn't", async () => {
    vi.useRealTimers()
    vi.stubGlobal('fetch', (input: string) => {
      if (input === exampleDesignPath('temperate')) {
        return Promise.resolve(new Response(shipped(input).toString('utf8')))
      }
      if (input === exampleRasterPath('temperate')) {
        const bytes = shipped(input)
        const copy = new ArrayBuffer(bytes.byteLength)
        new Uint8Array(copy).set(bytes)
        return Promise.resolve(new Response(copy))
      }
      return Promise.resolve(new Response('', { status: 404 }))
    })
    try {
      await getAppState().loadExample()
      const example = await mount(<SitePanel />)
      expect(example.get('panel-site').textContent).toContain(
        'This is an example garden for Amherst',
      )
      expect(example.get('control-site-search').getAttribute('placeholder')).toBe(
        'Amherst, Massachusetts',
      )
      expect(example.get('action-site-search').textContent).toBe('Find this place')
      await example.unmount()

      await act(async () => {
        getAppState().clearExample()
      })
      const own = await mount(<SitePanel />)
      expect(own.get('panel-site').textContent).not.toContain('example garden')
      await own.unmount()
    } finally {
      vi.unstubAllGlobals()
    }
  })
})

/**
 * "Use my location" gets its own notice when it fails. Sent to the address search's error, a
 * blocked prompt would print "Address search unavailable: User denied geolocation prompt" over a
 * search box that still works fine. A permission already refused isn't worth offering the press
 * for at all
 */
describe('using the browser location', () => {
  afterEach(() => {
    Reflect.deleteProperty(navigator, 'geolocation')
    Reflect.deleteProperty(navigator, 'permissions')
  })

  it("gets its own notice when the browser won't share it, and leaves the search alone", async () => {
    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: { getCurrentPosition: (_ok: unknown, fail: () => void) => fail() },
    })
    const harness = await mount(<SitePanel />)
    await harness.click('action-site-geolocate')
    const notice = harness.get('status-site-geolocate')
    expect(notice.textContent).toBe(
      "Your browser didn't share your location. Type the town or ZIP code instead.",
    )
    expect(notice.className).toContain('notice-idle')
    expect(harness.find('status-site-search')).toBeNull()
    await harness.unmount()
  })

  /**
   * A position IS resolving the site, the way choosing a result is, so a phone that shares its
   * location needs no second press. The device's own coordinates are the site. The reverse lookup
   * only names it
   */
  it('resolves the site at the position the browser shared, named by the reverse lookup', async () => {
    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: {
        getCurrentPosition: (ok: (position: unknown) => void) =>
          ok({ coords: { latitude: 39.7302, longitude: -75.1385 } }),
      },
    })
    const harness = await mount(<SitePanel />)
    await harness.click('action-site-geolocate')
    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(reverseGeocode).toHaveBeenCalledTimes(1)
    expect(resolveSite).toHaveBeenCalledTimes(1)
    const [location, label, countryCode] = resolveSite.mock.calls[0] as unknown as [
      { latitudeDeg: number; longitudeDeg: number },
      string,
      string | null,
    ]
    expect(location).toEqual({ latitudeDeg: 39.7302, longitudeDeg: -75.1385 })
    expect(label).toBe('Glassboro, New Jersey')
    expect(countryCode).toBe('US')
    expect(harness.get('readout-site-label').textContent).toBe('Glassboro, New Jersey')
    expect(harness.find('status-site-geolocate')).toBeNull()
    await harness.unmount()
  })

  it('still resolves the site, as "Current location", when the reverse lookup fails', async () => {
    reverseGeocode.mockRejectedValue(new Error('nominatim is down'))
    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: {
        getCurrentPosition: (ok: (position: unknown) => void) =>
          ok({ coords: { latitude: 39.7302, longitude: -75.1385 } }),
      },
    })
    const harness = await mount(<SitePanel />)
    await harness.click('action-site-geolocate')
    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(resolveSite).toHaveBeenCalledTimes(1)
    const [location, label, countryCode] = resolveSite.mock.calls[0] as unknown as [
      { latitudeDeg: number; longitudeDeg: number },
      string,
      string | null,
    ]
    expect(location).toEqual({ latitudeDeg: 39.7302, longitudeDeg: -75.1385 })
    expect(label).toBe('Current location')
    expect(countryCode).toBeNull()
    await harness.unmount()
  })

  /** A phone can take seconds to find itself, and the press says so and gives the browser a deadline */
  it('reads as looking while the browser is, and hands the browser a timeout', async () => {
    let options: { timeout?: number; maximumAge?: number } | undefined
    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: {
        getCurrentPosition: (
          _ok: unknown,
          _fail: unknown,
          given: { timeout?: number; maximumAge?: number },
        ) => {
          options = given
        },
      },
    })
    const harness = await mount(<SitePanel />)
    await harness.click('action-site-geolocate')
    const button = harness.get('action-site-geolocate') as HTMLButtonElement
    expect(button.textContent).toBe('Finding your location...')
    expect(button.disabled).toBe(true)
    expect(options?.timeout).toBeGreaterThan(0)
    expect(options?.maximumAge).toBeGreaterThan(0)
    await harness.unmount()
  })

  it('drops the button once the browser has already refused the permission', async () => {
    Object.defineProperty(navigator, 'permissions', {
      configurable: true,
      value: { query: () => Promise.resolve({ state: 'denied' }) },
    })
    const harness = await mount(<SitePanel />)
    await act(async () => {
      await Promise.resolve()
    })
    expect(harness.find('action-site-geolocate')).toBeNull()
    await harness.unmount()
  })

  it('keeps the button while nothing has refused it', async () => {
    Object.defineProperty(navigator, 'permissions', {
      configurable: true,
      value: { query: () => Promise.resolve({ state: 'prompt' }) },
    })
    const harness = await mount(<SitePanel />)
    await act(async () => {
      await Promise.resolve()
    })
    expect(harness.find('action-site-geolocate')).not.toBeNull()
    await harness.unmount()
  })

  it('keeps the button when the permissions API itself is missing, as jsdom has none', async () => {
    const harness = await mount(<SitePanel />)
    expect(harness.find('action-site-geolocate')).not.toBeNull()
    await harness.unmount()
  })
})

describe('a zone computed from the weather record says so', () => {
  it('labels a derived rating apart from one read off the USDA grid', async () => {
    useAppStore.setState({
      site: ready(
        siteFixture({
          hardiness: [
            {
              scheme: 'usda-2023',
              basis: 'weather-record',
              extremeMinTempC: -18 as Celsius,
              zoneLabel: '7a',
            },
          ],
        }),
      ),
    })
    const harness = await mount(<SitePanel />)
    expect(harness.get('readout-site-hardiness').textContent).toBe(
      'zone 7a, USDA-style, computed from the weather record',
    )
    await harness.unmount()
  })
})

describe('a Canadian site sees both systems, kept apart', () => {
  const canadian = siteFixture({
    hardiness: [
      { scheme: 'usda-2023', extremeMinTempC: -24 as Celsius, zoneLabel: '5b' },
      { scheme: 'nrcan', zoneLabel: '7a', indexTerms: [] },
    ],
  })

  it("never blends the two into one zone and says why they can't be compared", async () => {
    useAppStore.setState({ site: ready(canadian) })
    const harness = await mount(<SitePanel />)
    expect(harness.get('readout-site-hardiness').textContent).toBe('zone 5b (USDA)')
    expect(harness.get('readout-site-nrcan-zone').textContent).toBe('7a')
    expect(harness.get('readout-site-nrcan-note').textContent).toBe(NRCAN_SCHEME_NOTE)
    await harness.unmount()
  })

  it('shows no Canadian surface at all for a site with no NRCan rating', async () => {
    useAppStore.setState({ site: ready(siteFixture()) })
    const harness = await mount(<SitePanel />)
    expect(harness.get('readout-site-hardiness').textContent).toBe('zone 7a (USDA)')
    expect(harness.find('readout-site-nrcan-zone')).toBeNull()
    expect(harness.find('readout-site-nrcan-note')).toBeNull()
    await harness.unmount()
  })
})
