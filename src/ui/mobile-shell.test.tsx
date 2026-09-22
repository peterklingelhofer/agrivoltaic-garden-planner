import { beforeEach, describe, expect, it } from 'bun:test'
import { getAppState, resetAppStore } from '../state/store'
import App from '../App'
import { MobileTabs } from './MobileTabs'
import { mount } from './testkit'

/**
 * Below 760px the garden and the plan stop sharing the screen and take turns on it.
 *
 * What the CSS does with `data-surface` cannot be checked here: jsdom has no layout engine and no
 * media queries, so a test asserting the sidebar is hidden would assert nothing. What IS worth
 * holding is the wiring underneath: that the root says which surface is up, and that a tab press
 * writes the surface it names
 */

beforeEach(() => {
  localStorage.clear()
  resetAppStore()
})

describe('the tab bar', () => {
  /**
   * A first visit with no saved design opens on the plan, step one: the column is what makes a
   * garden, and the garden it would show instead is the example
   */
  it('offers the garden and the plan, and marks the one showing', async () => {
    const harness = await mount(<MobileTabs />)
    expect(harness.get('action-tab-edit').dataset.current).toBe('true')
    expect(harness.get('action-tab-edit').textContent).toBe('Plan')
    expect(harness.get('action-tab-garden').dataset.current).toBeUndefined()
    expect(harness.find('action-tab-guided')).toBeNull()
  })

  it('opens a first visit on the plan, at the first step', () => {
    expect(getAppState().surface).toBe('edit')
    expect(getAppState().sidebarStep).toBe('place')
  })

  it('switches to the garden and back, keeping the answers', async () => {
    const harness = await mount(<MobileTabs />)
    getAppState().answerOnboarding({ ambition: 'fruiting-and-berries' })
    await harness.click('action-tab-garden')
    expect(getAppState().surface).toBe('garden')
    expect(harness.get('action-tab-garden').dataset.current).toBe('true')
    expect(harness.get('action-tab-edit').dataset.current).toBeUndefined()
    await harness.click('action-tab-edit')
    expect(getAppState().surface).toBe('edit')
    expect(getAppState().answers.ambition).toBe('fruiting-and-berries')
  })

  it('comes back to the step it left rather than to the first one', async () => {
    const harness = await mount(<MobileTabs />)
    getAppState().setSidebarStep('wants')
    await harness.click('action-tab-garden')
    await harness.click('action-tab-edit')
    expect(getAppState().sidebarStep).toBe('wants')
  })
})

describe('the root element the stylesheet reads', () => {
  it('names the surface showing, so one attribute decides the whole layout', async () => {
    const harness = await mount(<App />)
    const root = harness.get('app-root')
    // a first visit with nothing saved opens on the plan
    expect(root.dataset.surface).toBe('edit')
    await harness.click('action-tab-garden')
    expect(harness.get('app-root').dataset.surface).toBe('garden')
    await harness.click('action-tab-edit')
    expect(harness.get('app-root').dataset.surface).toBe('edit')
  })

  /** The bake's state, for whatever waits on a light run from a step that is not the light step */
  it('carries the state of the light run, now that the toolbar pill is gone', async () => {
    const harness = await mount(<App />)
    expect(harness.get('app-root').dataset.simState).toBe('idle')
    expect(harness.find('status-toolbar-simulation')).toBeNull()
  })
})

/**
 * The strip across the top of the garden: the one fixed thing on that surface, naming the step
 * the plan is open on and going back to it. A contextual press ("See it in the garden", "Draw
 * bed") is what brings a visitor to the garden, and the tab bar alone did not say that the plan
 * was where they were, leaving no way back but the tab
 */
describe('the way back from the garden', () => {
  it('names the open step and returns to the plan', async () => {
    const harness = await mount(<App />)
    getAppState().setSidebarStep('panels')
    await harness.click('action-tab-garden')
    const strip = harness.get('action-garden-plan')
    expect(strip.textContent).toBe('Back to the plan · Step 4, Where should the panels go?')
    // inside the garden surface's box, so the stylesheet can keep it off the plan
    expect(strip.closest('[data-testid="canvas-root"]')).not.toBeNull()
    await harness.click('action-garden-plan')
    expect(getAppState().surface).toBe('edit')
    expect(getAppState().sidebarStep).toBe('panels')
  })
})

/**
 * A toolbar with a title and four buttons wraps to three lines at 360px and four at 320px, spending
 * a fifth to a quarter of a phone screen. The drawing tools sit on the canvas they draw on, and
 * there is no simulation pill: the step that is waiting says so in its own status row
 */
describe('the compacted toolbar', () => {
  it('carries the title and the place, and no guided setup toggle', async () => {
    const harness = await mount(<App />)
    expect(harness.find('readout-toolbar-site')).not.toBeNull()
    expect(harness.find('action-toolbar-onboarding')).toBeNull()
    expect(harness.find('panel-onboarding')).toBeNull()
  })
})
