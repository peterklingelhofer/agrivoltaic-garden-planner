import { beforeEach, describe, expect, it } from 'bun:test'
import { normaliseObjective, objectiveTotal, presetMatching } from '../state/onboarding'
import { getAppState, resetAppStore } from '../state/store'
import { mount } from './testkit'
import { WantsPanel } from './WantsPanel'

/**
 * The third step: what to grow, and whether the sunlight goes mostly to the plants or mostly to
 * the panels. Two questions, each written to the answers the layout search reads, and the four
 * shares of the split together behind one fold rather than two on the face and two behind it
 */

beforeEach(() => {
  localStorage.clear()
  resetAppStore()
})

describe('what is wanted from the space', () => {
  it('writes the growing ambition', async () => {
    const harness = await mount(<WantsPanel />)
    expect(getAppState().answers.ambition).toBe('mixed-vegetables')
    await harness.click('control-onboarding-ambition-fruiting-and-berries')
    expect(getAppState().answers.ambition).toBe('fruiting-and-berries')
    await harness.unmount()
  })

  it('sets four weights that already sum to 1 from one plain choice', async () => {
    const harness = await mount(<WantsPanel />)
    await harness.click('control-onboarding-objective-mostly-food')
    const objective = getAppState().answers.objective
    expect(presetMatching(objective)).toBe('mostly-food')
    expect(objective.food).toBeGreaterThan(objective.energy)
    expect(objectiveTotal(objective)).toBeCloseTo(1, 6)
    await harness.unmount()
  })

  it('says in one line what the choice does, and keeps the split behind the fold', async () => {
    const harness = await mount(<WantsPanel />)
    expect(harness.get('readout-onboarding-objective-help').textContent).toMatch(
      /mostly food gives the plants more/i,
    )
    const fold = harness.get('panel-onboarding-weights')
    expect(fold.tagName).toBe('DETAILS')
    // all four readouts and all four sliders, together, inside the fold and nowhere else
    expect(harness.get('readout-onboarding-objective').closest('details')).toBe(fold)
    for (const key of ['food', 'energy', 'water', 'simplicity']) {
      expect(harness.get(`control-onboarding-weight-${key}`).closest('details'), key).toBe(fold)
      expect(harness.get(`readout-onboarding-weight-${key}`).closest('details'), key).toBe(fold)
    }
    // nothing about the wildlife here: those switches sit on the plants step
    expect(harness.find('control-onboarding-natives')).toBeNull()
    expect(harness.find('control-onboarding-pollinators')).toBeNull()
    await harness.unmount()
  })

  it('keeps the raw sliders for whoever wants them, each on its own', async () => {
    const harness = await mount(<WantsPanel />)
    const before = getAppState().answers.objective
    await harness.type('control-onboarding-weight-energy', '0.8')
    const objective = getAppState().answers.objective
    expect(objective.energy).toBeCloseTo(0.8, 6)
    // the other three dials stay where they were; the shares the search reads still sum to 1
    expect(objective.water).toBe(before.water)
    expect(objectiveTotal(normaliseObjective(objective))).toBeCloseTo(1, 6)
    // no preset matches a hand-set mix, and the face says so
    expect(presetMatching(objective)).toBeNull()
    expect(harness.get('readout-onboarding-objective-custom').textContent).toMatch(/your own/i)
    await harness.unmount()
  })
})
