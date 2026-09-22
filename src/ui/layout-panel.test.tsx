import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { vi } from '../../test/vi'
import { ready } from '../state/slices'
import { getAppState, resetAppStore, useAppStore } from '../state/store'
import { scenarioSetFixture } from '../state/testkit'
import { LayoutPanel } from './LayoutPanel'
import { mount, type Harness } from './testkit'

/**
 * The panels step: the search first, then the layouts it landed as a tab row and one card, with the
 * scene showing whichever tab is open, on the step where the answer belongs
 */

beforeEach(() => {
  localStorage.clear()
  resetAppStore()
})

// a reset puts the data back and leaves the actions as they are, so the one test below that
// stands a stub in for the search has to put the real action back itself, or every store test
// that runs after it in the same process searches with the stub
const { suggestDesigns } = getAppState()
afterEach(() => {
  useAppStore.setState({ suggestDesigns })
})

const showResults = async (set = scenarioSetFixture()): Promise<Harness> => {
  await act(async () => {
    useAppStore.setState({
      onboarding: { ...getAppState().onboarding, designs: ready(set) },
    })
  })
  return mount(<LayoutPanel />)
}

/** The layouts, read off the row of tabs that names every one of them */
const tabbed = (harness: Harness): readonly string[] =>
  [
    ...harness.container.querySelectorAll<HTMLElement>('[data-testid^="action-onboarding-show-"]'),
  ].map((tab) => tab.dataset.archetype ?? '')

const shown = (harness: Harness): string | null =>
  harness.container
    .querySelector<HTMLElement>('[data-testid^="item-onboarding-scenario-"]')
    ?.getAttribute('data-archetype') ?? null

describe('the search', () => {
  it('runs from the one press at the top of the step and leaves the garden alone', async () => {
    const suggestDesigns = vi.fn(async () => {})
    useAppStore.setState((s) => ({ ...s, suggestDesigns }))
    const before = getAppState().plot
    const harness = await mount(<LayoutPanel />)
    expect(harness.get('action-layouts-search').textContent).toBe('Show me some layouts')
    expect(harness.find('list-onboarding-scenarios')).toBeNull()
    await harness.click('action-layouts-search')
    expect(suggestDesigns).toHaveBeenCalledTimes(1)
    expect(getAppState().plot).toEqual(before)
    // the array editor carries no second search press
    expect(harness.find('action-array-suggest')).toBeNull()
    await harness.unmount()
  })

  it('says so on the press while it works, and can be stopped', async () => {
    await act(async () => {
      useAppStore.setState({
        onboarding: { ...getAppState().onboarding, designs: { status: 'loading' } },
      })
    })
    const harness = await mount(<LayoutPanel />)
    const press = harness.get('action-layouts-search') as HTMLButtonElement
    expect(press.disabled).toBe(true)
    expect(press.textContent).toBe('Computing layouts...')
    // waiting is never a trap: it can be left, and the answers survive it
    await harness.click('action-onboarding-cancel')
    expect(getAppState().onboarding.designs.status).toBe('idle')
    expect((harness.get('action-layouts-search') as HTMLButtonElement).disabled).toBe(false)
    await harness.unmount()
  })
})

describe('the comparison', () => {
  it('names every layout in one row, the pick first and the open sky last', async () => {
    const harness = await showResults(scenarioSetFixture('balanced'))
    const names = tabbed(harness)
    expect(names[0]).toBe('balanced')
    expect(names[names.length - 1]).toBe('no-array-control')
    expect(new Set(names).size).toBe(names.length)
    expect(names).toHaveLength(4)
    await harness.unmount()
  })

  it('keeps every layout a tab', async () => {
    const harness = await showResults(scenarioSetFixture('balanced'))
    expect(tabbed(harness)).toContain('food-first')
    expect(tabbed(harness)).toContain('energy-first')
    await harness.unmount()
  })

  /**
   * One card at a time, chosen by its tab, and the scene shows that one: the preview follows the
   * tab. It never waits for a press of its own, which on a phone changed nothing that could
   * be seen. Leaving the step takes the preview with it
   */
  it('opens on the pick, previews the tab that is pressed, and clears the preview on unmount', async () => {
    const harness = await showResults(scenarioSetFixture('balanced'))
    expect(shown(harness)).toBe('balanced')
    expect(getAppState().previewArchetype).toBe('balanced')
    expect(harness.get('action-onboarding-show-balanced').getAttribute('aria-selected')).toBe(
      'true',
    )
    expect(harness.get('action-onboarding-show-balanced').dataset.recommended).toBe('true')
    expect(harness.get('action-onboarding-show-no-array-control').dataset.baseline).toBe('true')

    await harness.click('action-onboarding-show-no-array-control')
    expect(shown(harness)).toBe('no-array-control')
    expect(getAppState().previewArchetype).toBe('no-array-control')
    expect(harness.get('badge-onboarding-baseline').textContent).toMatch(/comparison/i)
    // no separate preview press: the tab is the preview
    expect(harness.find('action-onboarding-preview-no-array-control')).toBeNull()

    await harness.press('action-onboarding-show-no-array-control', 'Home')
    expect(shown(harness)).toBe('balanced')
    expect(getAppState().previewArchetype).toBe('balanced')

    await harness.unmount()
    expect(getAppState().previewArchetype).toBeNull()
    expect(getAppState().previewPlot).toBeNull()
  })

  it('opens on the best layout with panels when the pick is the open sky', async () => {
    const harness = await showResults(scenarioSetFixture('no-array-control'))
    expect(shown(harness)).not.toBe('no-array-control')
    expect(harness.get('action-onboarding-show-no-array-control').dataset.recommended).toBe('true')
    expect(harness.get('readout-onboarding-why').textContent).toMatch(/one press away/)
    await harness.unmount()
  })

  /**
   * The confidence line under the tabs, one sentence, with the full explanation one press away
   * in the reading fold
   */
  it('says in one line that confidence is capped', async () => {
    const harness = await showResults()
    const line = harness.get('status-onboarding-quality')
    expect(line.textContent).toBe('Confidence no higher than moderate')
    expect(harness.get('readout-onboarding-confidence-ceiling').closest('details')).not.toBeNull()
    await harness.unmount()
  })

  /**
   * The card's face: a plain first line, three figures, what it costs, what still grows, and
   * the two presses in its own foot. The detail figures are behind the fold and only for whoever
   * asked for them; the pills are plain words
   */
  it('leads with three figures and keeps the detail behind the fold', async () => {
    const harness = await showResults()
    const card = harness.get('item-onboarding-scenario-balanced')
    expect(card.querySelector('.scenario-title')?.textContent).toBe(
      'A layout: balanced · suggested for you · moderate confidence',
    )
    expect(card.querySelector('.badge')).toBeNull()
    const figures = harness.get('readout-onboarding-key-figures-balanced')
    expect(figures.closest('details')).toBeNull()
    expect(harness.get('readout-onboarding-daylight-balanced').textContent).toMatch(/^\d+%$/)
    expect(harness.get('readout-onboarding-energy-balanced').textContent).toMatch(/^about /)
    expect(harness.get('readout-onboarding-beds-balanced').textContent).toMatch(/^\d+$/)
    expect(harness.get('readout-onboarding-tradeoff-balanced').closest('details')).toBeNull()
    expect(harness.get('readout-onboarding-crops-balanced').closest('details')).toBeNull()

    expect(getAppState().answers.experience).toBe('novice')
    expect(harness.find('readout-onboarding-figures-balanced')).toBeNull()
    const disclosure = harness.get('details-onboarding-flags-balanced')
    expect(card.querySelectorAll('details').length).toBe(1)
    for (const testId of [
      'readout-onboarding-summary-balanced',
      'readout-onboarding-light-balanced',
      'readout-onboarding-layout-balanced',
      'list-onboarding-beds-balanced',
      'list-onboarding-flags-balanced',
    ]) {
      expect(harness.get(testId).closest('details'), testId).toBe(disclosure)
    }
    expect(harness.get('list-onboarding-flags-balanced').textContent).toMatch(
      /an estimate from the shapes and the sun alone/i,
    )

    // the foot is a direct child of the card, after the fold, and holds both presses
    const actions = card.querySelector('.scenario-actions')
    expect(actions?.parentElement).toBe(card)
    expect(actions?.closest('details')).toBeNull()
    expect(actions?.contains(harness.get('action-onboarding-apply-balanced'))).toBe(true)
    expect(actions?.contains(harness.get('action-layouts-see-balanced'))).toBe(true)
    await harness.unmount()

    await act(async () => {
      getAppState().answerOnboarding({ experience: 'experienced' })
    })
    const expert = await showResults()
    expect(expert.get('readout-onboarding-figures-balanced').textContent).toContain('mol/m²/d')
    // a land equivalent ratio is a band, and stays one on the page
    expect(expert.get('readout-onboarding-ler-balanced').textContent).toBe('0.9 to 1.3')
    await expert.unmount()
  })

  it('shows the garden from the card, on the surface the garden lives on', async () => {
    const harness = await showResults()
    await act(async () => {
      getAppState().setSurface('edit')
    })
    await harness.click('action-layouts-see-balanced')
    expect(getAppState().surface).toBe('garden')
    await harness.unmount()
  })

  it('applies a layout through the store and lands on the plants step', async () => {
    const harness = await showResults()
    await harness.click('action-onboarding-apply-balanced')
    const state = getAppState()
    expect(state.sidebarStep).toBe('plants')
    expect(state.onboarding.appliedArchetype).toBe('balanced')
    expect(state.previewArchetype).toBeNull()
    expect(state.plot?.arrays.length).toBe(1)
    expect(state.plot?.arrays[0]?.geometry.pitchM).toBe(9)
    await harness.unmount()
  })
})

describe('the two dials on the face of the step', () => {
  /**
   * The lesson in two dials: a class that turns the headroom or the row spacing and watches the
   * light change. Both write the plot's own array through the same action the by-hand fold uses, so
   * the light re-runs by itself and the per-bed figures follow
   */
  it("move the plot's panels through the store", async () => {
    const harness = await mount(<LayoutPanel />)
    const before = getAppState().plot?.arrays[0]?.geometry
    expect(before).toBeDefined()
    await harness.type('control-panels-headroom', '1.2')
    expect(getAppState().plot?.arrays[0]?.geometry.clearanceHeightM).toBeCloseTo(1.2)
    await harness.type('control-panels-spacing', '6.5')
    expect(getAppState().plot?.arrays[0]?.geometry.pitchM).toBeCloseTo(6.5)
    // everything else about the array is left as it was
    expect(getAppState().plot?.arrays[0]?.geometry.rowCount).toBe(before?.rowCount)
    await harness.unmount()
  })
})
