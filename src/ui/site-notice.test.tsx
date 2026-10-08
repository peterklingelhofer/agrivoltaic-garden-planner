/// <reference types="node" />
import { readFileSync } from 'node:fs'
import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { vi } from '../../test/vi'
import type { SitePart } from '../data/site'
import { siteFixture } from '../recommend/testkit'
import { failed, idle, loading, ready } from '../state/slices'
import { exampleDesignPath, exampleRasterPath } from '../state/example'
import { getAppState, resetAppStore, useAppStore } from '../state/store'
import { SiteNotice } from './SiteNotice'
import { SitePanel } from './SitePanel'
import { mount } from './testkit'
import { capitalizeSentence, siteNoticeText, soilSampledNote, waitLabel } from './site-notice'

/**
 * The failure path had no door.
 *
 * A rate limit can strand a visit behind it entirely. The store schedules its own retry and keeps
 * the clock time, so what is held here is that the message is stated once, that the wait is counted
 * down where it can be watched, and that a reader who won't wait has a press
 */

const UPSTREAM = 'the weather service is busy and is asking for a pause'

const resolveSite = vi.fn(async () => undefined)
let originalResolve: typeof resolveSite

beforeEach(() => {
  resetAppStore()
  vi.useFakeTimers()
  resolveSite.mockClear()
  originalResolve = useAppStore.getState().resolveSite as typeof resolveSite
  useAppStore.setState({ resolveSite })
})

afterEach(() => {
  useAppStore.setState({ resolveSite: originalResolve })
  vi.useRealTimers()
})

const notice = <SiteNotice state={failed(UPSTREAM)} testId="status-site" idleLabel="nothing yet" />

describe('a failed lookup', () => {
  it('prints the upstream sentence once, capitalized for the head of the paragraph', async () => {
    useAppStore.setState({ siteRetryAt: Date.now() + 60_000 })
    const harness = await mount(notice)
    const said = capitalizeSentence(UPSTREAM)
    const text = harness.get('status-site').textContent ?? ''
    expect(text).toContain(said)
    expect(text.indexOf(said)).toBe(text.lastIndexOf(said))
    expect(harness.get('status-site').getAttribute('data-state')).toBe('error')
    // a lookup the visitor asked for keeps the red box
    expect(harness.get('status-site').className).toContain('notice-error')
    await harness.unmount()
  })

  it('counts the wait down off the retry the store scheduled', async () => {
    useAppStore.setState({ siteRetryAt: Date.now() + 30_000 })
    const harness = await mount(notice)
    expect(harness.get('status-site-retry-when').textContent).toBe('Trying again in 30 s')
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000)
    })
    expect(harness.get('status-site-retry-when').textContent).toBe('Trying again in 27 s')
    await harness.unmount()
  })

  it('says so when nothing more is scheduled, rather than counting down to nothing', async () => {
    useAppStore.setState({ siteRetryAt: null })
    const harness = await mount(notice)
    expect(harness.get('status-site-retry-when').textContent).toBe("It won't try again by itself")
    await harness.unmount()
  })

  it("looks the place up again on the press, for a reader who won't wait", async () => {
    useAppStore.setState({ siteRetryAt: Date.now() + 60_000 })
    const harness = await mount(notice)
    await harness.click('status-site-retry')
    expect(resolveSite).toHaveBeenCalledTimes(1)
    const call = resolveSite.mock.calls[0] as unknown as readonly [unknown, string]
    expect(call[0]).toEqual(useAppStore.getState().location)
    expect(call[1]).toBe(useAppStore.getState().locationLabel)
    await harness.unmount()
  })
})

describe('the other states', () => {
  it("says what it's waiting on without naming the place, and offers no retry for a lookup in flight", async () => {
    const harness = await mount(
      <SiteNotice state={loading()} testId="status-site" idleLabel="nothing yet" />,
    )
    const text = harness.get('status-site').textContent ?? ''
    expect(text).toContain('Looking up the weather, soil and frost dates for this place')
    expect(text).not.toContain(useAppStore.getState().locationLabel)
    expect(harness.find('status-site-retry')).toBeNull()
    await harness.unmount()
  })
})

/**
 * The requests run side by side and the slowest sets the pace. A reader who sees the weather arrive
 * and then waits on the soil can tell which one is late, so the sentence says what has landed and
 * what is still out
 */
describe('the loading sentence', () => {
  const EVERYTHING = 'Looking up the weather, soil and frost dates for this place…'
  const say = (pending: readonly SitePart[]): string | null =>
    siteNoticeText(loading(), 'nothing yet', pending)

  /** What is still out, and the sentence that names it */
  const PARTIAL: readonly (readonly [readonly SitePart[], string])[] = [
    [['soil', 'frost'], 'The weather is ready. Still looking up the soil and frost dates…'],
    [['weather', 'frost'], 'The soil is ready. Still looking up the weather and frost dates…'],
    [['weather', 'soil'], 'The frost dates are ready. Still looking up the weather and soil…'],
    [['frost'], 'The weather and soil are ready. Still looking up the frost dates…'],
    [['soil'], 'The weather and frost dates are ready. Still looking up the soil…'],
    [['weather'], 'The soil and frost dates are ready. Still looking up the weather…'],
  ]

  it('names all three while nothing has landed, and when there is no list to read', () => {
    expect(say(['weather', 'soil', 'frost'])).toBe(EVERYTHING)
    expect(say([])).toBe(EVERYTHING)
  })

  for (const [pending, sentence] of PARTIAL) {
    it(`with ${pending.join(' and ')} still out, says what has landed`, () => {
      expect(say(pending)).toBe(sentence)
      // the order the list arrives in changes nothing
      expect(say([...pending].reverse())).toBe(sentence)
    })
  }

  it('leaves every other state to say what it said before', () => {
    expect(siteNoticeText(ready(siteFixture()), 'nothing yet', ['soil'])).toBeNull()
    expect(siteNoticeText(failed(UPSTREAM), 'nothing yet', ['soil'])).toBe(UPSTREAM)
    expect(siteNoticeText(idle(), 'nothing yet', ['soil'])).toBe('nothing yet')
  })

  it('reads the store list and rewrites the same paragraph as each part lands', async () => {
    useAppStore.setState({ sitePending: ['weather', 'soil', 'frost'] })
    const harness = await mount(
      <SiteNotice state={loading()} testId="status-site" idleLabel="nothing yet" />,
    )
    const sentence = harness.get('status-site').querySelector('[role="status"]')
    expect(sentence?.textContent).toBe(EVERYTHING)
    await act(async () => {
      useAppStore.setState({ sitePending: ['soil', 'frost'] })
    })
    // one element throughout, so a screen reader hears a change in a region it already holds
    expect(harness.get('status-site').querySelector('[role="status"]')).toBe(sentence)
    expect(sentence?.textContent).toBe(
      'The weather is ready. Still looking up the soil and frost dates…',
    )
    await harness.unmount()
  })

  it("touches nothing when the list changes but the sentence doesn't", async () => {
    useAppStore.setState({ sitePending: ['soil', 'frost'] })
    const harness = await mount(
      <SiteNotice state={loading()} testId="status-site" idleLabel="nothing yet" />,
    )
    const sentence = harness.get('status-site').querySelector('[role="status"]')
    if (sentence === null) throw new Error('no status region')
    // the callback gathers what it's handed, since the awaits below let it run before any
    // `takeRecords` call could see a mutation
    const seen: MutationRecord[] = []
    const observer = new MutationObserver((batch) => {
      seen.push(...batch)
    })
    observer.observe(sentence, {
      attributes: true,
      characterData: true,
      childList: true,
      subtree: true,
    })
    // a new array holding the same parts, which is what a repeated report can look like
    await act(async () => {
      useAppStore.setState({ sitePending: ['soil', 'frost'] })
    })
    seen.push(...observer.takeRecords())
    expect(seen).toHaveLength(0)
    // and the observer does see a real change, so the silence above means something
    await act(async () => {
      useAppStore.setState({ sitePending: ['frost'] })
    })
    seen.push(...observer.takeRecords())
    expect(seen.length).toBeGreaterThan(0)
    observer.disconnect()
    await harness.unmount()
  })

  it('keeps the countdown and the press outside the region that is read out', async () => {
    useAppStore.setState({ siteRetryAt: Date.now() + 60_000 })
    const harness = await mount(notice)
    const region = harness.get('status-site').querySelector('[role="status"]')
    expect(region?.textContent).toBe(capitalizeSentence(UPSTREAM))
    expect(region?.contains(harness.get('status-site-retry-when'))).toBe(false)
    expect(region?.contains(harness.get('status-site-retry'))).toBe(false)
    await harness.unmount()
  })

  /** One lookup writes the place and the weather, so both notices build the sentence from one list */
  it('prints once on the site panel while the place and the weather load together', async () => {
    useAppStore.setState({ site: loading(), weather: loading(), sitePending: ['soil'] })
    const harness = await mount(<SitePanel />)
    const said = 'The weather and frost dates are ready. Still looking up the soil…'
    const text = harness.get('panel-site').textContent ?? ''
    expect(text).toContain(said)
    expect(text.indexOf(said)).toBe(text.lastIndexOf(said))
    expect(harness.find('status-weather')).toBeNull()
    await harness.unmount()
  })
})

/**
 * One lookup writes the place and the weather, so a site panel that printed a notice for each would
 * print the same paragraph twice, and a repeat reads as the screen glitching
 */
describe('the site panel states a failure once', () => {
  it('prints one sentence when the place and the weather fail together', async () => {
    useAppStore.setState({
      site: failed(UPSTREAM),
      weather: failed(UPSTREAM),
      siteRetryAt: Date.now() + 60_000,
    })
    const harness = await mount(<SitePanel />)
    const said = capitalizeSentence(UPSTREAM)
    const text = harness.get('panel-site').textContent ?? ''
    expect(text).toContain(said)
    expect(text.indexOf(said)).toBe(text.lastIndexOf(said))
    expect(harness.find('status-weather')).toBeNull()
    await harness.unmount()
  })

  it("keeps the weather notice when it says something the place notice doesn't", async () => {
    useAppStore.setState({
      site: ready(siteFixture()),
      weather: failed('the weather service sent nothing for this place'),
    })
    const harness = await mount(<SitePanel />)
    expect(harness.find('status-site')).toBeNull()
    expect(harness.get('status-weather').textContent).toContain('sent nothing for this place')
    await harness.unmount()
  })
})

describe('the wait, in a unit a reader can use', () => {
  it('counts seconds while a minute is in sight, then minutes, then hours', () => {
    expect(waitLabel(30)).toBe('30 s')
    expect(waitLabel(89)).toBe('89 s')
    expect(waitLabel(90)).toBe('2 min')
    expect(waitLabel(41 * 60)).toBe('41 min')
    // the day's allowance comes back after midnight UTC, which can be most of a day away
    expect(waitLabel(5400)).toBe('1 h 30 min')
    expect(waitLabel(13 * 3600 + 41 * 60)).toBe('13 h 41 min')
    expect(waitLabel(2 * 3600)).toBe('2 h')
  })
})

describe('the upstream sentence, capitalized only at the head of a paragraph', () => {
  it('capitalizes the first letter and leaves the rest alone', () => {
    expect(capitalizeSentence('the weather service is busy')).toBe('The weather service is busy')
    expect(capitalizeSentence('Already capitalized')).toBe('Already capitalized')
    expect(capitalizeSentence('')).toBe('')
  })
})

/**
 * The shipped example already has its light computed, so a 429 on the background lookup it
 * runs for itself isn't a search the visitor asked for and reads wrong as the same red box:
 * it can show up on the very first screen, before anything is pressed
 */
describe('the same failure on the shipped example', () => {
  const shipped = (path: string): Buffer => readFileSync(`public${path}`)

  it('reads as a quiet note, not a red box, and keeps the retry', async () => {
    vi.useRealTimers()
    vi.stubGlobal('fetch', (input: string) => {
      if (input === exampleDesignPath('temperate')) {
        return Promise.resolve(new Response(shipped(input).toString('utf8')))
      }
      if (input === exampleRasterPath('temperate')) {
        // a fresh ArrayBuffer. Never a view onto Node's pooled one: `Buffer` may sit on a
        // SharedArrayBuffer, which `Response` doesn't accept
        const bytes = shipped(input)
        const copy = new ArrayBuffer(bytes.byteLength)
        new Uint8Array(copy).set(bytes)
        return Promise.resolve(new Response(copy))
      }
      return Promise.resolve(new Response('', { status: 404 }))
    })
    try {
      await getAppState().loadExample()
      useAppStore.setState({ siteRetryAt: Date.now() + 40_000 })
      const harness = await mount(notice)
      const el = harness.get('status-site')
      expect(el.className).toContain('notice-idle')
      expect(el.className).not.toContain('notice-error')
      // the underlying state is still an error. Only how it reads changed
      expect(el.getAttribute('data-state')).toBe('error')
      expect(el.textContent ?? '').toContain(
        `The weather for this place hasn't loaded yet: ${UPSTREAM}`,
      )
      expect(harness.get('status-site-retry-when').textContent).toBe('Trying again in 40 s')
      expect(harness.find('status-site-retry')).not.toBeNull()
      await harness.unmount()
    } finally {
      vi.unstubAllGlobals()
    }
  })
})

describe('the soil map sentence', () => {
  it('says how far away the nearest reading was taken, and nothing for the point itself', () => {
    expect(soilSampledNote({ sampledKm: 3 })).toContain('about 3 km away')
    expect(soilSampledNote({})).toBeNull()
  })
})
