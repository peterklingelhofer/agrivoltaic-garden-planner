/// <reference types="node" />
import { readFileSync } from 'node:fs'
import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { vi } from '../../test/vi'
import { siteFixture } from '../recommend/testkit'
import { failed, loading, ready } from '../state/slices'
import { exampleDesignPath, exampleRasterPath } from '../state/example'
import { getAppState, resetAppStore, useAppStore } from '../state/store'
import { SiteNotice } from './SiteNotice'
import { SitePanel } from './SitePanel'
import { mount } from './testkit'
import { capitalizeSentence, waitLabel } from './site-notice'

/**
 * The failure path had no door.
 *
 * Three of the six audit personas spent their whole visit behind one rate limit. What they saw
 * was a red box with no button in it, the same paragraph printed twice, and a "Try again" that
 * gave no sign of trying: no spinner, no changed sentence, the same box after three presses over
 * three minutes. The store schedules its own retry and keeps the clock time, so what is held here
 * is that the message is stated once, that the wait is counted down where it can be watched, and
 * that a reader who will not wait has a press
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
  it('prints the upstream sentence once, capitalised for the head of the paragraph', async () => {
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

  it('looks the place up again on the press, for a reader who will not wait', async () => {
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
  it('names the place it is waiting on, and offers no retry for a lookup in flight', async () => {
    const harness = await mount(
      <SiteNotice state={loading()} testId="status-site" idleLabel="nothing yet" />,
    )
    const text = harness.get('status-site').textContent ?? ''
    expect(text).toContain('Looking up the weather, soil and frost dates for')
    expect(text).toContain(useAppStore.getState().locationLabel)
    expect(harness.find('status-site-retry')).toBeNull()
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

  it('keeps the weather notice when it says something the place notice does not', async () => {
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

describe('the upstream sentence, capitalised only at the head of a paragraph', () => {
  it('capitalises the first letter and leaves the rest alone', () => {
    expect(capitalizeSentence('the weather service is busy')).toBe('The weather service is busy')
    expect(capitalizeSentence('Already capitalised')).toBe('Already capitalised')
    expect(capitalizeSentence('')).toBe('')
  })
})

/**
 * The shipped example already has its light computed, so a 429 on the background lookup it
 * runs for itself is not a search the visitor asked for and reads wrong as the same red box:
 * three of the six audit personas met it on the very first screen, before pressing anything
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
        // a fresh ArrayBuffer rather than a view onto Node's pooled one: `Buffer` may sit on a
        // SharedArrayBuffer, which `Response` does not accept
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
      // the underlying state is still an error; only how it reads changed
      expect(el.getAttribute('data-state')).toBe('error')
      expect(el.textContent ?? '').toContain(
        `Weather for ${getAppState().locationLabel} hasn't loaded yet: ${UPSTREAM}`,
      )
      expect(harness.get('status-site-retry-when').textContent).toBe('Trying again in 40 s')
      expect(harness.find('status-site-retry')).not.toBeNull()
      await harness.unmount()
    } finally {
      vi.unstubAllGlobals()
    }
  })
})
