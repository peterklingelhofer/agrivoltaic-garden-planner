import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { vi } from '../../test/vi'
import { lightGeometryKey } from '../state/light-freshness'
import { resetAppStore, useAppStore } from '../state/store'
import type { BedLight, DliRaster } from '../types/light'
import type { Site } from '../types/site'
import { ready } from '../state/slices'
import { bedId, siteId } from '../types/ids'
import { meters } from '../types/units'
import { Sidebar } from './Sidebar'
import { mount, type Harness } from './testkit'
import { AUTO_RUN_DELAY_MS, autoRunKey, autoRunReady, useAutoRecommend } from './useAutoRecommend'

const STEPS = [
  'place',
  'ground',
  'wants',
  'panels',
  'light',
  'plants',
  'calendar',
  'seasons',
  'check',
  'sources',
] as const

const opened = (harness: Harness): readonly string[] =>
  STEPS.filter(
    (step) => harness.get(`action-step-${step}`).getAttribute('aria-expanded') === 'true',
  )

beforeEach(() => {
  resetAppStore()
  // panels on the sources step fetch on mount. A pending promise keeps them in their loading state
  vi.stubGlobal('fetch', () => new Promise(() => undefined))
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('the sidebar stepper', () => {
  it('opens on the first step and wires each header to the region it discloses', async () => {
    const harness = await mount(<Sidebar />)
    expect(opened(harness)).toEqual(['place'])
    expect(harness.get('action-step-place').getAttribute('aria-controls')).toBe('steppanel-place')
    expect(harness.get('panel-step-place').getAttribute('aria-labelledby')).toBe('step-place')
    // a real `section` with an accessible name, which is what makes it a region, when a
    // div wearing the role wouldn't be
    expect(harness.get('panel-step-place').tagName).toBe('SECTION')
    await harness.unmount()
  })

  it('keeps a closed step out of the document entirely, not merely hidden', async () => {
    const harness = await mount(<Sidebar />)
    expect(harness.find('panel-site')).not.toBeNull()
    expect(harness.find('panel-sources')).toBeNull()
    expect(harness.find('list-sources')).toBeNull()
    expect(harness.get('panel-step-sources').hasAttribute('hidden')).toBe(true)
    expect(harness.get('panel-step-sources').childElementCount).toBe(0)

    await harness.click('action-step-sources')
    expect(harness.find('panel-sources')).not.toBeNull()
    expect(harness.find('panel-site')).toBeNull()
    expect(harness.get('panel-step-sources').hasAttribute('hidden')).toBe(false)
    await harness.unmount()
  })

  /**
   * The whole point of the steps: opening the one about the ground must not bring the one about the
   * panels with it
   */
  it('shows the panels of one step and none of its neighbors', async () => {
    const harness = await mount(<Sidebar />)
    await harness.click('action-step-ground')
    expect(opened(harness)).toEqual(['ground'])
    expect(harness.find('panel-ground')).not.toBeNull()
    expect(harness.find('panel-array')).toBeNull()
    expect(harness.find('panel-site')).toBeNull()
    expect(harness.find('panel-overlay')).toBeNull()
    await harness.unmount()
  })

  /**
   * The press lands on what it opened, which is a phone problem measured on a phone.
   *
   * At 375x667, a press that leaves the column where it was can put the panel just asked for 420px
   * down a 570px window, under the closed headers of the steps before it, and from mid-panel it can
   * land inside a sow-day dropdown with nothing on screen naming the step it belongs to.
   *
   * Asserted on the header the scroll was asked of. No offset is asserted, because jsdom has
   * no layout: what this holds is that the right element is asked, once, per press. That the
   * element is the header is the part worth pinning, since the header is the only thing on
   * screen that says which step this is
   */
  it('brings the step it opened to the top of the column', async () => {
    const scrolled: string[] = []
    // jsdom implements no scrolling at all, so the method the component guards for is defined
    // here to record who it was called on. Every other test in this file runs without it, which
    // is what covers the guard itself
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
      configurable: true,
      writable: true,
      value: function (this: HTMLElement) {
        scrolled.push(this.getAttribute('data-testid') ?? 'unnamed')
      },
    })
    /*
      The scroll is asked for in a frame callback, because opening a step closes the one before it
      and the header isn't where the press found it until React has committed. The callback then
      schedules itself, to hold the header there while a step's late content arrives: only the
      outermost frame is run here, so one press records one call, without a second's worth of them
    */
    let inFrame = false
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      if (inFrame) return 0
      inFrame = true
      try {
        callback(0)
      } finally {
        inFrame = false
      }
      return 0
    })
    try {
      const harness = await mount(<Sidebar />)
      await harness.click('action-step-ground')
      expect(scrolled).toEqual(['action-step-ground'])
      // and the keyboard path is the same path: Arrow keys move the open step, so they move the
      // column with it, without leaving the focus ring somewhere off screen
      await harness.press('action-step-ground', 'ArrowDown')
      expect(scrolled).toEqual(['action-step-ground', 'action-step-wants'])
      await harness.unmount()
    } finally {
      Reflect.deleteProperty(HTMLElement.prototype, 'scrollIntoView')
    }
  })

  /**
   * A step whose prerequisite is missing names the ONE thing it is waiting on and offers the
   * press that settles it, without rendering panels that would read as broken. It still
   * opens: refusing the click would hide the sentence explaining the refusal
   */
  it('locks a step on the first unmet prerequisite and says which one', async () => {
    const harness = await mount(<Sidebar />)
    await harness.click('action-step-plants')
    expect(opened(harness)).toEqual(['plants'])
    const blocked = harness.get('status-step-blocked-plants')
    expect(blocked.textContent).toContain('looked up')
    expect(harness.find('status-step-blocked-plants-run')).not.toBeNull()
    // the panels behind the lock aren't in the document at all
    expect(harness.find('panel-recommendation')).toBeNull()
    expect(harness.find('panel-planting')).toBeNull()
    await harness.unmount()
  })

  /**
   * What the lock says to somebody who can't see it, and what it doesn't take away.
   *
   * A bare padlock where the step number goes, with no title and no accessible name, would tell a
   * screen reader there is a padlock without saying what would open it, and would make the
   * sidebar's own count read 1, 2, 3, lock, lock, lock, lock, 8, 9 to everybody else. The reason is
   * on the requirement, and the locked step's button is described by it before the step is opened
   */
  it("keeps a locked step numbered and says out loud what it's waiting for", async () => {
    const harness = await mount(<Sidebar />)
    const button = harness.get('action-step-plants')
    // the number is still there, in its place in the order
    const number = button.querySelector('.step-number')
    expect(number?.textContent).toBe('6')
    expect(number?.getAttribute('data-locked')).toBe('true')
    expect(harness.find('badge-step-locked-plants')).not.toBeNull()

    // and the reason travels with the label. It's never left waiting inside the step
    const describedBy = button.getAttribute('aria-describedby')
    expect(describedBy).toBe('step-locked-plants')
    const said = harness.container.querySelector(`#${String(describedBy)}`)?.textContent ?? ''
    expect(said).toContain('Locked')
    expect(said).toContain('looked up')
    await harness.unmount()
  })

  it("doesn't describe a step that is not locked", async () => {
    const harness = await mount(<Sidebar />)
    expect(harness.get('action-step-place').getAttribute('aria-describedby')).toBeNull()
    expect(harness.find('badge-step-locked-place')).toBeNull()
    expect(harness.get('action-step-place').querySelector('.step-number')?.textContent).toBe('1')
    await harness.unmount()
  })

  it('navigates with arrow, Home and End keys', async () => {
    const harness = await mount(<Sidebar />)
    await harness.press('action-step-place', 'ArrowDown')
    expect(opened(harness)).toEqual(['ground'])
    expect(document.activeElement).toBe(harness.get('action-step-ground'))

    await harness.press('action-step-ground', 'ArrowUp')
    expect(opened(harness)).toEqual(['place'])
    await harness.press('action-step-place', 'ArrowUp')
    expect(opened(harness)).toEqual(['sources'])
    await harness.press('action-step-sources', 'Home')
    expect(opened(harness)).toEqual(['place'])
    await harness.press('action-step-place', 'End')
    expect(opened(harness)).toEqual(['sources'])
    await harness.unmount()
  })

  /**
   * What the grower wants from the space is asked between the ground and the panels, because the
   * layout search reads it, and it never locks: an answer needs nothing computed first. The
   * combinations live on the plants step, so there's no pairs step
   */
  it('asks what is wanted between the ground and the panels, unlocked, with no pairs step', async () => {
    const harness = await mount(<Sidebar />)
    expect(STEPS.indexOf('wants')).toBe(STEPS.indexOf('ground') + 1)
    expect(STEPS.indexOf('panels')).toBe(STEPS.indexOf('wants') + 1)
    expect(harness.find('action-step-pairs')).toBeNull()
    expect(harness.find('badge-step-locked-wants')).toBeNull()
    await harness.click('action-step-wants')
    expect(opened(harness)).toEqual(['wants'])
    expect(harness.find('panel-wants')).not.toBeNull()
    expect(harness.find('control-onboarding-ambition')).not.toBeNull()
    expect(harness.find('control-onboarding-objective')).not.toBeNull()
    await harness.unmount()
  })

  /**
   * Next at the foot of the open step, under its answers, labeled with the question it opens. It's
   * the last child of the step, so on a phone the thumb never travels up past the field it has
   * just filled. It names the next question whether or not it is locked (a locked one opens on what
   * it's waiting for), and the last step has none
   */
  it('opens the next step from the foot, locked or not, and offers none on the last step', async () => {
    const harness = await mount(<Sidebar />)
    const foot = harness.get('action-step-next')
    expect(foot.textContent).toBe('Next: How big is the space, and what shades it?')
    // the last child of the open step's section, after everything the step asks
    expect(harness.get('panel-step-place').lastElementChild?.contains(foot)).toBe(true)
    await harness.click('action-step-next')
    expect(opened(harness)).toEqual(['ground'])
    expect(useAppStore.getState().sidebarStep).toBe('ground')

    // from the panels step the light is locked (no place yet), and the foot still names it:
    // pressing lands on the sentence that says what it's waiting for
    await harness.click('action-step-panels')
    expect(harness.get('action-step-next').textContent).toBe('Next: How much sun reaches the beds?')
    await harness.click('action-step-next')
    expect(opened(harness)).toEqual(['light'])
    expect(harness.find('status-step-blocked-light')).not.toBeNull()

    await harness.click('action-step-sources')
    expect(harness.find('action-step-next')).toBeNull()
    await harness.unmount()
  })

  it('persists the open step in the store across a remount', async () => {
    const first = await mount(<Sidebar />)
    await first.click('action-step-calendar')
    expect(useAppStore.getState().sidebarStep).toBe('calendar')
    await first.unmount()

    const second = await mount(<Sidebar />)
    expect(opened(second)).toEqual(['calendar'])
    await second.unmount()
  })
})

const Probe = (): null => {
  useAutoRecommend()
  return null
}

const someLight = (): readonly BedLight[] => [{ bedId: bedId('bed-1') } as unknown as BedLight]

const makeEligible = (): void => {
  useAppStore.setState({
    site: ready({ id: siteId('site-1'), label: 'Test' } as unknown as Site),
    raster: ready({} as unknown as DliRaster),
    bedLight: someLight(),
  })
}

describe('auto-run', () => {
  it('reports its prerequisites as primitives', () => {
    expect(autoRunReady(useAppStore.getState())).toBe(false)
    makeEligible()
    expect(autoRunReady(useAppStore.getState())).toBe(true)
    const before = autoRunKey(useAppStore.getState())
    useAppStore.getState().setFrostPercentile(10)
    expect(autoRunKey(useAppStore.getState())).not.toBe(before)
  })

  /**
   * And the rooting depth, which is what the plants step's "Raise this bed" press changes. Leave
   * it out of the key and the press writes the store, the ranking never re-runs, and the crop the
   * raise was meant to admit keeps its EXCLUDED badge while the remedy under it offers a raise of
   * minus ten centimeters
   */
  it('re-ranks when a bed is raised, because that is what admits a deep-rooted crop', () => {
    const bed = useAppStore.getState().plot?.beds[0]
    expect(bed).toBeDefined()
    if (bed === undefined) return
    const before = autoRunKey(useAppStore.getState())
    useAppStore.getState().upsertBed({ ...bed, raisedHeightM: meters(bed.raisedHeightM + 0.3) })
    expect(autoRunKey(useAppStore.getState())).not.toBe(before)
  })

  /**
   * A guided apply carries the search's own per-bed light into `bedLight` without baking the
   * editor's raster, so a raster test would call a fully planted garden blocked
   */
  it('counts the light field a guided apply carried across, with no raster of its own', () => {
    useAppStore.setState({
      site: ready({ id: siteId('site-1'), label: 'Test' } as unknown as Site),
      bedLight: someLight(),
    })
    expect(useAppStore.getState().raster.status).not.toBe('ready')
    expect(autoRunReady(useAppStore.getState())).toBe(true)
  })

  it("doesn't call a bake with no light for any bed ready to rank", () => {
    useAppStore.setState({
      site: ready({ id: siteId('site-1'), label: 'Test' } as unknown as Site),
      raster: ready({} as unknown as DliRaster),
      bedLight: [],
    })
    expect(autoRunReady(useAppStore.getState())).toBe(false)
  })

  it('debounces the run, and a teardown drops a run not yet started', async () => {
    vi.useFakeTimers()
    makeEligible()
    const harness = await mount(<Probe />)
    expect(useAppStore.getState().autoRunQueued).toBe(true)
    expect(useAppStore.getState().sets.status).toBe('idle')

    await vi.advanceTimersByTimeAsync(AUTO_RUN_DELAY_MS - 100)
    expect(useAppStore.getState().sets.status).toBe('idle')
    expect(useAppStore.getState().autoRunQueued).toBe(true)

    // torn down before the timer fires: nothing runs, and nothing is canceled that a
    // generation might have been awaiting (see the cleanup in `useAutoRecommend`)
    await harness.unmount()
    await vi.advanceTimersByTimeAsync(AUTO_RUN_DELAY_MS)
    expect(useAppStore.getState().sets.status).toBe('idle')
  })

  it('runs once the debounce has passed', async () => {
    vi.useFakeTimers()
    makeEligible()
    const harness = await mount(<Probe />)
    await vi.advanceTimersByTimeAsync(AUTO_RUN_DELAY_MS + 100)
    expect(useAppStore.getState().autoRunQueued).toBe(false)
    expect(useAppStore.getState().sets.status).not.toBe('idle')
    await harness.unmount()
  })

  /**
   * The ranking holds while the light is being computed and while the light on screen is for a
   * different garden, and runs once the bake lands, so the list doesn't reorder under the reader on
   * the plants step
   */
  it('holds while the light is loading or stale, and runs when the bake lands', async () => {
    vi.useFakeTimers()
    makeEligible()
    useAppStore.setState({ raster: { status: 'loading' } })
    expect(autoRunReady(useAppStore.getState())).toBe(false)
    const harness = await mount(<Probe />)
    await vi.advanceTimersByTimeAsync(AUTO_RUN_DELAY_MS * 2)
    expect(useAppStore.getState().autoRunQueued).toBe(false)
    expect(useAppStore.getState().sets.status).toBe('idle')

    // a field computed for another arrangement of the same plot is stale, and holds too
    await act(async () => {
      useAppStore.setState({
        raster: ready({} as unknown as DliRaster),
        lightGeometry: 'elsewhere',
      })
    })
    expect(autoRunReady(useAppStore.getState())).toBe(false)
    await vi.advanceTimersByTimeAsync(AUTO_RUN_DELAY_MS * 2)
    expect(useAppStore.getState().sets.status).toBe('idle')

    // the bake lands for this plot: one ranking
    const plot = useAppStore.getState().plot
    if (plot === null) throw new Error('no plot')
    await act(async () => {
      useAppStore.setState({ lightGeometry: lightGeometryKey(plot) })
    })
    expect(autoRunReady(useAppStore.getState())).toBe(true)
    await vi.advanceTimersByTimeAsync(AUTO_RUN_DELAY_MS + 100)
    expect(useAppStore.getState().sets.status).not.toBe('idle')
    await harness.unmount()
  })

  it('stays idle while the prerequisites are unmet', async () => {
    vi.useFakeTimers()
    const harness = await mount(<Probe />)
    await vi.advanceTimersByTimeAsync(AUTO_RUN_DELAY_MS * 2)
    expect(useAppStore.getState().autoRunQueued).toBe(false)
    expect(useAppStore.getState().sets.status).toBe('idle')
    await harness.unmount()
  })
})

/**
 * The app opens a step by some route other than its header and the column follows.
 *
 * "Fix Bed 1" on the seasons step, a plant clicked in the scene and a crop dropped on a bed all
 * open the plants step with that bed selected, and the column follows each of them to the step's
 * header. Nothing lands at the mount, because a reload's column is where it was
 */
describe('a step the app opens', () => {
  const scrolled: string[] = []

  beforeEach(() => {
    scrolled.length = 0
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
      configurable: true,
      writable: true,
      value: function (this: HTMLElement) {
        scrolled.push(this.getAttribute('data-testid') ?? 'unnamed')
      },
    })
    let inFrame = false
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      if (inFrame) return 0
      inFrame = true
      try {
        callback(0)
      } finally {
        inFrame = false
      }
      return 0
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    Reflect.deleteProperty(HTMLElement.prototype, 'scrollIntoView')
  })

  it('lands on its header, once, and not at the mount', async () => {
    const harness = await mount(<Sidebar />)
    expect(scrolled).toEqual([])
    await act(async () => {
      useAppStore.getState().setSidebarStep('plants')
    })
    expect(scrolled).toEqual(['action-step-plants'])
    // the same step again is nothing to land on
    await act(async () => {
      useAppStore.getState().setSidebarStep('plants')
    })
    expect(scrolled).toEqual(['action-step-plants'])
    // and a press still lands exactly once
    await harness.click('action-step-ground')
    expect(scrolled).toEqual(['action-step-plants', 'action-step-ground'])
    await harness.unmount()
  })
})
