import { beforeEach, describe, expect, it } from 'bun:test'
import { loadCitations } from '../data/citations'
import { makePlot } from '../state/defaults'
import { getAppState, resetAppStore } from '../state/store'
import { SurroundingsStep } from './AnswerPanels'
import { ObstructionsSection } from './ObstructionsSection'
import { mount } from './testkit'

beforeEach(async () => {
  resetAppStore()
  getAppState().setPlot(makePlot())
  // loaded before the mount below so the tree card's SourceLink already has the citation
  // registry on its first render, rather than the citekey it falls back to while loading
  await loadCitations()
})

/**
 * A house or a tree is drawn, sized, placed and turned from the sidebar rather than only from
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
      'Not applied while a house or a tree is drawn. The light check shades with what you drew.',
    )

    await harness.type('control-house-width-house-1', '12')
    const widened = getAppState().plot?.obstructions[0]?.footprint.exterior
    const wa = widened?.[0]
    const wb = widened?.[1]
    if (wa === undefined || wb === undefined) throw new Error('no ring')
    expect(Math.hypot(wb.xM - wa.xM, wb.yM - wa.yM)).toBeCloseTo(12, 6)

    await harness.type('control-house-north-house-1', '9')
    const moved = getAppState().plot?.obstructions[0]?.footprint.exterior ?? []
    const centreY = moved.reduce((sum, point) => sum + point.yM, 0) / Math.max(1, moved.length)
    expect(centreY).toBeCloseTo(9, 6)

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
      'Not applied while a house or a tree is drawn. The light check shades with what you drew.',
    )

    expect((harness.get('control-tree-leaf-tree-1') as HTMLInputElement).value).toBe('3')
    expect((harness.get('control-tree-bare-tree-1') as HTMLInputElement).value).toBe('46')
    expect((harness.get('control-tree-evergreen-tree-1') as HTMLInputElement).checked).toBe(false)
    expect(harness.get('readout-tree-source-tree-1').textContent).toContain('Konarska et al. 2014')

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

  it('refuses a top below the crown base, clamped to half a metre above it', async () => {
    const harness = await mount(<ObstructionsSection />)
    await harness.click('action-tree-add')

    await harness.type('control-tree-top-tree-1', '1')
    const tree = getAppState().plot?.obstructions[0]
    if (tree === undefined || tree.kind !== 'tree') throw new Error('no tree drawn')
    expect(tree.heightM).toBeCloseTo(tree.crownBaseM + 0.5, 6)
    await harness.unmount()
  })
})
