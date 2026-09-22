import { act } from 'react'
import { beforeEach, describe, expect, it } from 'bun:test'
import { cropById } from '../data/crops'
import { siteFixture } from '../recommend/testkit'
import { ready } from '../state/slices'
import type { CropId } from '../types/ids'
import { getAppState, resetAppStore, useAppStore } from '../state/store'
import { designScenarioFixture } from '../state/testkit'
import { GardenPlanPanel } from './GardenPlanPanel'
import { mount } from './testkit'

/**
 * A garden the product wrote by itself has to be readable, or the grower is being asked to trust
 * it blind. This is the fold on the plants step that makes it readable. The press that puts the
 * plot back sits above the fold, beside the bed cards, and `plants-panel.test.tsx` presses it
 */

beforeEach(() => {
  localStorage.clear()
  resetAppStore()
  useAppStore.setState({ site: ready(siteFixture()), autoRun: false })
})

const generate = async (): Promise<void> => {
  await getAppState().applyDesign(designScenarioFixture('balanced'))
}

describe('what the guided setup planted', () => {
  it('shows nothing at all until something has been generated', async () => {
    const harness = await mount(<GardenPlanPanel />)
    expect(harness.find('details-plants-plan')).toBeNull()
    await harness.unmount()
  })

  /**
   * Each bed says what it got and what standing there cost it. The comparison is the brightest bed
   * of the same plot, which is the one a grower can actually walk over and look at
   */
  it('tells each bed what standing there cost it against the brightest one', async () => {
    await generate()
    const harness = await mount(<GardenPlanPanel />)
    const beds = getAppState().generated?.beds ?? []
    const bright = beds.find((bed) => bed.zone === 'bright-gap')
    const shaded = beds.find((bed) => bed.zone === 'shaded-band')

    const brightNote = harness.get(`readout-plan-shade-cost-${bright?.bedId as string}`)
    expect(brightNote.dataset.lost).toBe('0')
    expect(brightNote.textContent).toMatch(/brightest bed here/i)

    const shadedNote = harness.get(`readout-plan-shade-cost-${shaded?.bedId as string}`)
    expect(Number(shadedNote.dataset.lost)).toBeGreaterThan(0)
    expect(shadedNote.textContent).toMatch(/costs \d+ plants?/i)
    // named in the words a grower reads
    const catalog = getAppState().catalog
    if (catalog.status !== 'ready') throw new Error('no catalog')
    const first = (shaded?.lostToShade ?? [])[0]
    const commonName = cropById(catalog.value, first as CropId)?.taxonomy.commonNames[0]
    expect(commonName).toBeDefined()
    expect(shadedNote.textContent).toContain(commonName as string)
    await harness.unmount()
  })

  /**
   * The other half of the same question, and a different comparison on purpose: a bed measures
   * itself against the brightest bed it can see, and this measures the whole plot against the
   * open sky it would have had with nothing built on it, which no bed can see from where it sits
   */
  it('says what carrying panels at all costs the whole plot', async () => {
    await generate()
    const harness = await mount(<GardenPlanPanel />)
    const note = harness.get('readout-plan-plot-cost')
    expect(note.dataset.lost).toBe('2')
    expect(note.textContent).toMatch(/open sky/i)
    const catalog = getAppState().catalog
    if (catalog.status !== 'ready') throw new Error('no catalog')
    for (const id of ['watermelon', 'sweet-potato'] as const) {
      const name = cropById(catalog.value, id as CropId)?.taxonomy.commonNames[0]
      expect(name, `${id} isn't in the catalog`).toBeDefined()
      expect(note.textContent).toContain(name as string)
    }
    await harness.unmount()
  })

  it('says nothing about a plot cost when the design carries no panels', async () => {
    await getAppState().applyDesign(designScenarioFixture('no-array-control'))
    const harness = await mount(<GardenPlanPanel />)
    expect(getAppState().generated?.plotLostToShade).toEqual([])
    expect(harness.find('readout-plan-plot-cost')).toBeNull()
    await harness.unmount()
  })

  it('names every bed, the light it was put in and what went into it', async () => {
    await generate()
    const harness = await mount(<GardenPlanPanel />)
    const beds = harness.all('item-plan-bed-bed-1')
    expect(beds.length).toBe(1)
    const zones = getAppState().generated?.beds.map((bed) => bed.zone) ?? []
    expect(new Set(zones).size).toBeGreaterThan(1)
    for (const bed of getAppState().generated?.beds ?? []) {
      expect(harness.get(`item-plan-bed-${bed.bedId}`).dataset.zone).toBe(bed.zone)
      expect(harness.get(`badge-plan-zone-${bed.bedId}`).textContent).not.toBe('')
    }
    expect(Number(harness.get('readout-plan-plantings').textContent)).toBeGreaterThan(0)
    expect(harness.get('readout-plan-explanation').textContent).not.toBe('')
    await harness.unmount()
  })

  /**
   * The three answers the design search was run with have no editable home on this card, and that
   * is the decision. Not an omission: a second copy of them would be a second source of truth for
   * one idea. What is owed is naming them and offering the way back to the one place that does
   * change them, with everything already typed still in it
   */
  it('names what the layout was optimized for and reopens the question that set it', async () => {
    getAppState().answerOnboarding({
      ambition: 'fruiting-and-berries',
      exposure: 'partly-sheltered',
    })
    await generate()
    const harness = await mount(<GardenPlanPanel />)
    expect(harness.get('readout-plan-objective').textContent).toBe('A bit of both')
    expect(harness.get('readout-plan-ambition').textContent).toMatch(/tomatoes/i)
    expect(harness.get('readout-plan-exposure').textContent).toMatch(/part of the day/i)
    // and no editable copy of any of them: there's exactly one place these answers live
    for (const id of ['objective', 'ambition', 'exposure']) {
      expect(harness.find(`control-plan-${id}`), id).toBeNull()
    }

    await harness.click('action-plan-revisit')
    expect(getAppState().sidebarStep).toBe('wants')
    expect(getAppState().answers.ambition).toBe('fruiting-and-berries')
    expect(getAppState().answers.exposure).toBe('partly-sheltered')
    await harness.unmount()
  })

  it('spells out a mix of your own, which no name would say anything about', async () => {
    getAppState().answerOnboarding({
      objective: { food: 0.7, energy: 0.1, water: 0.1, simplicity: 0.1 },
    })
    await generate()
    const harness = await mount(<GardenPlanPanel />)
    expect(harness.get('readout-plan-objective').textContent).toMatch(/mix you set yourself/i)
    expect(harness.get('readout-plan-objective-mix').textContent).toContain('70%')
    await harness.unmount()
  })

  it('keeps the light figures for the reader who asked for figures, and not otherwise', async () => {
    await generate()
    const bed = getAppState().generated?.beds[0]
    expect(bed).toBeDefined()
    const novice = await mount(<GardenPlanPanel />)
    expect(novice.find(`readout-plan-dli-${String(bed?.bedId)}`)).toBeNull()
    await novice.unmount()

    getAppState().answerOnboarding({ experience: 'experienced' })
    const expert = await mount(<GardenPlanPanel />)
    expect(expert.get(`readout-plan-dli-${String(bed?.bedId)}`).textContent).not.toBe('')
    expect(expert.get(`readout-plan-worst-${String(bed?.bedId)}`).textContent).not.toBe('')
    await expert.unmount()
  })
})

/**
 * The list reads the plot, so once the planting question replaces the crops the generation planted,
 * no stale name is left to read as a choice that failed
 */
describe('the plan card follows the beds', () => {
  it('lists what is in each bed now, and counts it, off the plot rather than the snapshot', async () => {
    await generate()
    const harness = await mount(<GardenPlanPanel />)
    const generated = getAppState().generated
    const planted = generated?.beds.find((bed) => bed.cropIds.length > 0)
    if (planted === undefined) throw new Error('nothing was planted in the fixture')
    const before = harness.container.querySelectorAll(
      `[data-testid^="item-plan-crop-${planted.bedId}-"]`,
    ).length
    expect(before).toBe(planted.cropIds.length)
    const bed = getAppState().plot?.beds.find((entry) => entry.id === planted.bedId)
    const first = bed?.plantings[0]
    if (bed === undefined || first === undefined) throw new Error('the bed carries no planting')
    await act(async () => {
      getAppState().removePlanting(bed.id, first.id)
    })
    const after = harness.container.querySelectorAll(
      `[data-testid^="item-plan-crop-${planted.bedId}-"]`,
    ).length
    expect(after).toBe(before - 1)
    // the snapshot itself is untouched: it's the record of what the run did
    expect(
      getAppState().generated?.beds.find((entry) => entry.bedId === planted.bedId)?.cropIds,
    ).toEqual(planted.cropIds)
    await harness.unmount()
  })

  /**
   * One fold at the foot of the plants step, closed. The bed cards on the step's face say what is
   * planted, and this fold is the record of why
   */
  it('is one closed fold holding the whole record', async () => {
    await generate()
    const harness = await mount(<GardenPlanPanel />)
    const fold = harness.get('details-plants-plan')
    expect(fold.tagName).toBe('DETAILS')
    expect(fold.hasAttribute('open')).toBe(false)
    for (const id of [
      'badge-plan-archetype',
      'readout-plan-plantings',
      'readout-plan-explanation',
      'list-plan-beds',
      'action-plan-revisit',
    ]) {
      expect(fold.contains(harness.get(id)), id).toBe(true)
    }
    expect(harness.find('action-plan-undo')).toBeNull()
    await harness.unmount()
  })
})
