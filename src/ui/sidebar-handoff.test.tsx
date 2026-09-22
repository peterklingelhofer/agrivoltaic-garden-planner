import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { vi } from '../../test/vi'
import { siteFixture } from '../recommend/testkit'
import { ready } from '../state/slices'
import { getAppState, resetAppStore, useAppStore } from '../state/store'
import { designScenarioFixture } from '../state/testkit'
import { Sidebar } from './Sidebar'
import { mount } from './testkit'

/**
 * jsdom implements no scrolling, so the method the stepper guards for is defined here to record
 * which header it was asked of. Only the outermost frame callback runs, so one landing records
 * one call, without a second's worth of them: see the same rig in `stepper.test.tsx`
 */
const scrolled: string[] = []

beforeEach(() => {
  resetAppStore()
  useAppStore.setState({ site: ready(siteFixture()), autoRun: false })
  // the Sources tab fetches on mount; a pending promise parks those panels in their loading state
  vi.stubGlobal('fetch', () => new Promise(() => undefined))
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

/**
 * Applying a layout lands on the open step's header, the way a press on it would, so the reader
 * starts at the step they came for
 */
describe('the sidebar lands on the plants step when a layout is applied', () => {
  it('scrolls the plants header into view when a layout is applied', async () => {
    const harness = await mount(<Sidebar />)
    await act(async () => {
      await getAppState().applyDesign(designScenarioFixture('balanced'))
    })
    expect(getAppState().sidebarStep).toBe('plants')
    expect(scrolled[0]).toBe('action-step-plants')
    await harness.unmount()
  })

  /**
   * And NOT again when the generation behind it finishes. A second landing would throw the column
   * to the top under a reader who had pressed "Plant every bed again" halfway down it
   */
  it('stays put when the generation arrives after the apply', async () => {
    const harness = await mount(<Sidebar />)
    await act(async () => {
      await getAppState().applyDesign(designScenarioFixture('balanced'))
    })
    const finished = getAppState().generated
    await act(async () => {
      useAppStore.setState({ generated: null })
    })
    const before = scrolled.length
    await act(async () => {
      useAppStore.setState({ generated: finished })
    })
    expect(scrolled.slice(before)).toEqual([])
    await harness.unmount()
  })

  /**
   * Only at the apply. Landing on every store change would take the editor away from the
   * reader mid-edit, which is the opposite complaint
   */
  it('leaves the column alone for an edit made after the layout landed', async () => {
    await getAppState().applyDesign(designScenarioFixture('balanced'))
    const harness = await mount(<Sidebar />)
    scrolled.length = 0
    await act(async () => {
      useAppStore.getState().setSidebarStep('plants')
      useAppStore.getState().setAutoRun(true)
    })
    // only step headers count: a panel scrolling its own list into view is its own business
    expect(scrolled.filter((id) => id.startsWith('action-step-'))).toEqual([])
    await harness.unmount()
  })
})

describe('the step to look at next', () => {
  it('marks the step after the open one, and only that one', async () => {
    const harness = await mount(<Sidebar />)
    // step one is open and the place is resolved, so the ground is next
    expect(harness.find('badge-step-next-ground')).not.toBeNull()
    expect(harness.container.querySelectorAll('[data-next="true"]')).toHaveLength(1)
    await harness.click('action-step-ground')
    expect(harness.find('badge-step-next-ground')).toBeNull()
    // and after the ground comes what is wanted from it, before the panels
    expect(harness.find('badge-step-next-wants')).not.toBeNull()
    await harness.click('action-step-wants')
    expect(harness.find('badge-step-next-panels')).not.toBeNull()
    await harness.unmount()
  })

  /**
   * The foot names the next question even while it is locked, and a press lands on the sentence
   * that says what it is waiting for. Naming the first UNLOCKED step would read "Next: Checks and
   * saving" on the panels step during the weather lookup, skipping four questions. The mark on a
   * closed header still never sits on a padlock
   */
  it('names a locked successor at the foot, and never marks its header', async () => {
    const harness = await mount(<Sidebar />)
    await harness.click('action-step-light')
    // the plants step waits on light in the beds, which this store has none of
    expect(harness.get('action-step-plants').closest('.step')?.getAttribute('data-locked')).toBe(
      'true',
    )
    expect(harness.get('action-step-next').textContent).toContain('What goes in each bed?')
    expect(harness.find('badge-step-next-plants')).toBeNull()
    expect(harness.container.querySelectorAll('[data-next="true"]')).toHaveLength(0)
    await harness.click('action-step-next')
    expect(getAppState().sidebarStep).toBe('plants')
    expect(harness.find('status-step-blocked-plants')).not.toBeNull()
    await harness.unmount()
  })

  it('never offers a pairs step: the combinations live on the plants step', async () => {
    const harness = await mount(<Sidebar />)
    expect(harness.find('action-step-pairs')).toBeNull()
    expect(harness.find('action-step-wants')).not.toBeNull()
    await harness.unmount()
  })

  it('prints what a locked step is waiting for under its title', async () => {
    useAppStore.setState({ site: { status: 'idle' }, bedLight: [] })
    const harness = await mount(<Sidebar />)
    const waiting = harness.get('readout-step-waiting-plants')
    expect(waiting.textContent).toContain('looked up')
    // and never on a step that is open for business
    expect(harness.find('readout-step-waiting-place')).toBeNull()
    await harness.unmount()
  })
})
