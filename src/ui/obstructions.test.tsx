import { act, StrictMode, type ReactElement } from 'react'
import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { vi } from '../../test/vi'
import { loadCitations } from '../data/citations'
import { requestCardScroll, takeCardScroll } from '../state/card-scroll'
import { makePlot } from '../state/defaults'
import type { SidebarStep } from '../state/slices'
import { getAppState, resetAppStore, useAppStore } from '../state/store'
import { obstructionId } from '../types/ids'
import { SurroundingsStep } from './AnswerPanels'
import { ObstructionsSection } from './ObstructionsSection'
import { Stepper, type StepDefinition } from './Stepper'
import { mount } from './testkit'

beforeEach(async () => {
  resetAppStore()
  getAppState().setPlot(makePlot())
  // loaded before the mount below so the tree card's SourceLink already has the citation
  // registry on its first render, without falling back to the citekey while loading
  await loadCitations()
})

/**
 * A house or a tree is drawn, sized, placed and turned from the sidebar as well as from
 * the scene, and it stands in for the surroundings answer the moment either exists (Decision
 * Record 26)
 */
describe('a house drawn on the ground', () => {
  it('adds, sizes, places, turns and removes a house, and takes over the exposure answer', async () => {
    const harness = await mount(
      <>
        <SurroundingsStep />
        <ObstructionsSection />
      </>,
    )
    expect(harness.get('control-onboarding-exposure').hasAttribute('disabled')).toBe(false)
    expect(harness.find('readout-onboarding-exposure-house')).toBeNull()

    await harness.click('action-house-add')
    expect(harness.get('item-house-house-1').textContent).toContain('House 1')
    expect(harness.get('control-onboarding-exposure').hasAttribute('disabled')).toBe(true)
    expect(harness.find('readout-onboarding-exposure-help')).toBeNull()
    expect(harness.get('readout-onboarding-exposure-house').textContent).toBe(
      "These answers aren't used while a house or a tree is drawn. The light check shades with what you drew.",
    )

    await harness.type('control-house-width-house-1', '12')
    const widened = getAppState().plot?.obstructions[0]?.footprint.exterior
    const wa = widened?.[0]
    const wb = widened?.[1]
    if (wa === undefined || wb === undefined) throw new Error('no ring')
    expect(Math.hypot(wb.xM - wa.xM, wb.yM - wa.yM)).toBeCloseTo(12, 6)

    await harness.type('control-house-north-house-1', '9')
    const moved = getAppState().plot?.obstructions[0]?.footprint.exterior ?? []
    const centerY = moved.reduce((sum, point) => sum + point.yM, 0) / Math.max(1, moved.length)
    expect(centerY).toBeCloseTo(9, 6)

    await harness.type('control-house-turn-house-1', '90')
    const turned = getAppState().plot?.obstructions[0]?.footprint.exterior
    const ta = turned?.[0]
    const tb = turned?.[1]
    if (ta === undefined || tb === undefined) throw new Error('no ring')
    expect(Math.atan2(tb.yM - ta.yM, tb.xM - ta.xM) * (180 / Math.PI)).toBeCloseTo(90, 3)

    await harness.click('action-house-remove-house-1')
    expect(getAppState().plot?.obstructions.length ?? 0).toBe(0)
    expect(harness.get('list-houses').children.length).toBe(0)
    expect(harness.get('control-onboarding-exposure').hasAttribute('disabled')).toBe(false)
    expect(harness.find('readout-onboarding-exposure-house')).toBeNull()
    await harness.unmount()
  })
})

describe('a tree drawn on the ground', () => {
  it('adds a tree with the cited defaults shown, and takes over the exposure answer', async () => {
    const harness = await mount(
      <>
        <SurroundingsStep />
        <ObstructionsSection />
      </>,
    )
    expect(harness.get('control-onboarding-exposure').hasAttribute('disabled')).toBe(false)

    await harness.click('action-tree-add')
    expect(harness.get('item-tree-tree-1').textContent).toContain('Tree 1')
    expect(harness.get('control-onboarding-exposure').hasAttribute('disabled')).toBe(true)
    expect(harness.get('readout-onboarding-exposure-house').textContent).toBe(
      "These answers aren't used while a house or a tree is drawn. The light check shades with what you drew.",
    )

    expect((harness.get('control-tree-leaf-tree-1') as HTMLInputElement).value).toBe('3')
    expect((harness.get('control-tree-bare-tree-1') as HTMLInputElement).value).toBe('46')
    expect((harness.get('control-tree-evergreen-tree-1') as HTMLInputElement).checked).toBe(false)
    expect(harness.get('readout-tree-source-tree-1').textContent).toContain('Konarska et al. 2014')
    expect(harness.get('readout-tree-source-tree-1').textContent).toContain(
      'Jolly, William M. et al. 2005',
    )

    await harness.click('action-tree-remove-tree-1')
    expect(getAppState().plot?.obstructions.length ?? 0).toBe(0)
    expect(harness.get('list-trees').children.length).toBe(0)
    expect(harness.get('control-onboarding-exposure').hasAttribute('disabled')).toBe(false)
    await harness.unmount()
  })

  it('hides the bare-crown field once evergreen is switched on', async () => {
    const harness = await mount(<ObstructionsSection />)
    await harness.click('action-tree-add')
    expect(harness.find('control-tree-bare-tree-1')).not.toBeNull()

    await harness.click('control-tree-evergreen-tree-1')
    const tree = getAppState().plot?.obstructions[0]
    expect(tree?.kind === 'tree' && tree.evergreen).toBe(true)
    expect(harness.find('control-tree-bare-tree-1')).toBeNull()
    await harness.unmount()
  })

  it('refuses a top below the crown base, clamped to half a meter above it', async () => {
    const harness = await mount(<ObstructionsSection />)
    await harness.click('action-tree-add')

    await harness.type('control-tree-top-tree-1', '1')
    const tree = getAppState().plot?.obstructions[0]
    if (tree === undefined || tree.kind !== 'tree') throw new Error('no tree drawn')
    expect(tree.heightM).toBeCloseTo(tree.crownBaseM + 0.5, 6)
    await harness.unmount()
  })
})

const STEPS: readonly StepDefinition<SidebarStep>[] = [
  { id: 'plants', label: 'Plants', summary: null, requirement: null },
  { id: 'ground', label: 'Ground', summary: null, requirement: null },
]

/** The sidebar's own stepper, over the store's open step, with this section as the ground panel */
const StepperHost = (): ReactElement => {
  const step = useAppStore((s) => s.sidebarStep)
  return (
    <Stepper
      label="Steps"
      steps={STEPS}
      selected={step}
      landOn="none"
      onSelect={(id) => getAppState().setSidebarStep(id)}
      renderPanel={(id) => (id === 'ground' ? <ObstructionsSection /> : null)}
    />
  )
}

/**
 * A click on a house or a tree in the scene, or the press that adds one, asks for its card to
 * scroll into view, so its fields and its Remove press are in sight. Being the selection asks for
 * nothing: pressing the step's header with a card still selected leaves the column at the top of
 * the step
 */
describe('a card asked to scroll', () => {
  /** The test ids `scrollIntoView` was asked of, in order */
  const scrolled: string[] = []
  const frames = new Map<number, FrameRequestCallback>()
  let issued = 0

  /** Runs the frames asked for so far, in order, skipping any that an earlier one canceled */
  const runFrames = (): void => {
    for (const [id, callback] of [...frames]) {
      if (frames.delete(id)) callback(0)
    }
  }

  beforeEach(() => {
    scrolled.length = 0
    frames.clear()
    // an ask an earlier test left parked is replaced by one that is then taken, leaving none
    const none = obstructionId('none')
    requestCardScroll(none)
    takeCardScroll(none)
    // jsdom has no scrolling, so the method is defined here to record which node it was asked of
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
      configurable: true,
      writable: true,
      value: function (this: HTMLElement) {
        scrolled.push(this.getAttribute('data-testid') ?? 'unnamed')
      },
    })
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback): number => {
      issued += 1
      frames.set(issued, callback)
      return issued
    })
    vi.stubGlobal('cancelAnimationFrame', (id: number): void => {
      frames.delete(id)
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    Reflect.deleteProperty(HTMLElement.prototype, 'scrollIntoView')
  })

  it('scrolls the card a scene click names, again on a second click, and no other', async () => {
    const harness = await mount(<ObstructionsSection />)
    await act(async () => {
      getAppState().addHouse()
      getAppState().addTree()
    })
    runFrames()
    // drawn through the store, so nothing asked, though the tree took the selection
    expect(scrolled).toEqual([])
    const [house, tree] = getAppState().plot?.obstructions ?? []
    if (house === undefined || tree === undefined) throw new Error('no house and tree drawn')

    // what a click on the house does in the scene: select it and ask
    await act(async () => {
      getAppState().selectObstruction(house.id)
      requestCardScroll(house.id)
    })
    runFrames()
    expect(scrolled).toEqual([`item-house-${house.id}`])

    // and again with the card already selected and the column scrolled away from it
    await act(async () => {
      requestCardScroll(house.id)
    })
    runFrames()
    expect(scrolled).toEqual([`item-house-${house.id}`, `item-house-${house.id}`])

    // editing the card, or clearing the selection, asks for nothing
    await harness.type(`control-house-width-${house.id}`, '12')
    await act(async () => {
      getAppState().selectObstruction(null)
    })
    runFrames()
    expect(scrolled).toHaveLength(2)
  })

  it('scrolls the card an Add press drew, and not the one before it', async () => {
    const harness = await mount(<ObstructionsSection />)
    await harness.click('action-house-add')
    runFrames()
    const house = getAppState().plot?.obstructions[0]
    if (house === undefined) throw new Error('no house drawn')
    expect(scrolled).toEqual([`item-house-${house.id}`])

    await harness.click('action-tree-add')
    runFrames()
    const tree = getAppState().plot?.obstructions[1]
    if (tree === undefined) throw new Error('no tree drawn')
    expect(scrolled).toEqual([`item-house-${house.id}`, `item-tree-${tree.id}`])
  })

  it('leaves a card selected before the step opened where it is', async () => {
    getAppState().addHouse()
    getAppState().addTree()
    await mount(<ObstructionsSection />)
    runFrames()
    expect(scrolled).toEqual([])
  })

  /** Used once, so closing the step and opening it again doesn't replay a scroll already served */
  it('is used once', async () => {
    const tree = getAppState().addTree()
    if (tree === null) throw new Error('no tree drawn')
    requestCardScroll(tree)
    const first = await mount(<ObstructionsSection />)
    runFrames()
    expect(scrolled).toEqual([`item-tree-${tree}`])
    expect(takeCardScroll(tree)).toBe(false)

    await first.unmount()
    await mount(<ObstructionsSection />)
    runFrames()
    expect(scrolled).toHaveLength(1)
  })

  /** StrictMode runs an effect, undoes it and runs it again, and the second run needs the ask */
  it('survives StrictMode running its effect twice', async () => {
    const house = getAppState().addHouse()
    if (house === null) throw new Error('no house drawn')
    requestCardScroll(house)
    await mount(
      <StrictMode>
        <ObstructionsSection />
      </StrictMode>,
    )
    runFrames()
    expect(scrolled).toEqual([`item-house-${house}`])
  })

  /**
   * A click in the scene opens the ground step and selects the card in one commit. The stepper
   * then holds the step's header at the top of the column for a frame, and a card scrolled
   * inside that hold is dragged back to the header (`landing.ts`)
   */
  it('ends the column on the card when the click also opens the step', async () => {
    const tree = getAppState().addTree()
    if (tree === null) throw new Error('no tree drawn')
    getAppState().selectObstruction(null)
    getAppState().setSidebarStep('plants')
    const harness = await mount(<StepperHost />)
    expect(harness.find(`item-tree-${tree}`)).toBeNull()

    await act(async () => {
      getAppState().selectObstruction(tree)
      getAppState().setSidebarStep('ground')
      requestCardScroll(tree)
    })
    runFrames()
    expect(scrolled).toEqual([`item-tree-${tree}`])
  })

  /** The same step opened by its header, over a selection left from before, lands on the header */
  it('leaves the header press with an old selection on the top of the step', async () => {
    getAppState().addTree()
    getAppState().setSidebarStep('plants')
    const harness = await mount(<StepperHost />)
    await harness.click('action-step-ground')
    runFrames()
    expect(scrolled).toEqual(['action-step-ground'])
  })
})
