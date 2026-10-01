import { act } from 'react'
import { beforeEach, describe, expect, it } from 'bun:test'
import { calendarFor } from '../recommend/planting'
import { getAppState, resetAppStore } from '../state/store'
import { seedRankedStore } from '../state/testkit'
import type { BedCalendar } from '../types/calendar'
import type { Crop } from '../types/crop'
import type { BedId, CropId } from '../types/ids'
import type { CropRecommendation } from '../types/recommend'
import { methodLabel } from './calendar'
import { PICKER_LIMIT } from './BedPanel'
import { cropName } from './format'
import { PlantsPanel } from './PlantsPanel'
import { mount, type Harness } from './testkit'

/**
 * The picker as a beginner meets it: a ranking of 209 crops, a box that says how many of them to
 * show, and a search for the name of the plant you came for, since scrolling past hops, tomatillo,
 * purslane and phacelia looking for a tomato ends on field pea.
 *
 * Mounted through the plants step, where it lives inside the "Pick plants one at a time" fold.
 * A closed `<details>` keeps its content in the DOM, so nothing here opens it
 */

const catalog = (): readonly Crop[] => {
  const catalog = getAppState().catalog
  if (catalog.status !== 'ready') throw new Error("the catalog didn't load")
  return catalog.value
}

const rankedForBed = (): readonly CropRecommendation[] => {
  const sets = getAppState().sets
  if (sets.status !== 'ready') throw new Error('nothing was ranked')
  const set = sets.value[0]
  if (set === undefined) throw new Error('no bed was ranked')
  return set.ranked
}

/**
 * The crops the picker is actually offering, in the order it offers them. By role. Not
 * `data-crop`: the picture inside every option carries the crop it draws, so a plain attribute
 * query counts each row twice
 */
const offered = (harness: Harness): readonly CropId[] =>
  [...harness.get('list-bed-crops').querySelectorAll<HTMLElement>('[role="option"]')].map(
    (option) => option.dataset.crop as CropId,
  )

const choose = async (harness: Harness, testId: string, value: string): Promise<void> => {
  const target = harness.get(testId) as HTMLSelectElement
  const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set
  setter?.call(target, value)
  await act(async () => {
    target.dispatchEvent(new Event('change', { bubbles: true }))
  })
}

const plantings = (): readonly { readonly id: string; readonly cropId: CropId }[] =>
  getAppState().plot?.beds[0]?.plantings ?? []

const calendars = (): readonly BedCalendar[] => {
  const state = getAppState().calendars
  if (state.status !== 'ready') throw new Error('no calendars were built')
  return state.value
}

/**
 * Stages the first crop in the picker head the bed can actually take, and answers with which one
 * it was. Which crop that is depends on the calendar the seeded light field produces, so it's
 * found by asking the panel, without pinning it to a name that could stop deriving
 */
const stage = async (harness: Harness, except: readonly CropId[] = []): Promise<CropId> => {
  for (const item of rankedForBed().slice(0, PICKER_LIMIT)) {
    if (item.outcome.verdict === 'excluded' || except.includes(item.cropId)) continue
    await harness.click(`item-bed-crop-${item.cropId}`)
    if (!(harness.get('action-bed-add-planting') as HTMLButtonElement).disabled) return item.cropId
  }
  throw new Error('nothing in the picker head could be planted in the seeded bed')
}

beforeEach(async () => {
  localStorage.clear()
  resetAppStore()
  await seedRankedStore()
})

describe('finding a plant by name', () => {
  it('searches the whole ranking, past the head the box would otherwise hold it to', async () => {
    const harness = await mount(<PlantsPanel />)
    const ranked = rankedForBed()
    const deep = ranked[ranked.length - 1]
    if (deep === undefined) throw new Error('the seeded bed ranked nothing')
    const name = cropName(catalog(), deep.cropId)
    expect(offered(harness)).not.toContain(deep.cropId)

    await harness.type('control-bed-crop-search', name)

    // the show-all box is still untouched: a name typed in is its own answer to how much to show
    expect((harness.get('control-bed-crop-all') as HTMLInputElement).checked).toBe(false)
    expect(getAppState().showAllCrops).toBe(false)
    const shown = offered(harness)
    expect(shown).toContain(deep.cropId)
    for (const cropId of shown) {
      expect(cropName(catalog(), cropId).toLowerCase()).toContain(name.toLowerCase())
    }
    await harness.unmount()
  })

  it('matches part of a name whatever case it is typed in', async () => {
    const harness = await mount(<PlantsPanel />)
    const ranked = rankedForBed()
    const deep = ranked[ranked.length - 1]
    if (deep === undefined) throw new Error('the seeded bed ranked nothing')
    const name = cropName(catalog(), deep.cropId)
    await harness.type('control-bed-crop-search', name.slice(0, 4).toUpperCase())
    expect(offered(harness)).toContain(deep.cropId)
    await harness.unmount()
  })

  it("says the name isn't in this ranking rather than showing an empty box", async () => {
    const harness = await mount(<PlantsPanel />)
    await harness.type('control-bed-crop-search', 'moon tree')
    expect(offered(harness)).toHaveLength(0)
    expect(harness.get('status-bed-crop-search').textContent).toContain('moon tree')
    await harness.unmount()
  })

  it('goes back to the ranked head when the box is emptied', async () => {
    const harness = await mount(<PlantsPanel />)
    await harness.type('control-bed-crop-search', 'moon tree')
    await harness.type('control-bed-crop-search', '')
    expect(harness.find('status-bed-crop-search')).toBeNull()
    expect(offered(harness)).toHaveLength(PICKER_LIMIT)
    await harness.unmount()
  })
})

describe('how much of the ranking is on screen', () => {
  /**
   * The box is one flag in the store, shared by every list, so the answer outlives a closed step:
   * checking the box, leaving the step and coming back for a strawberry seen before still finds it
   */
  it('writes the store and reads it back, so the answer outlives this panel', async () => {
    const harness = await mount(<PlantsPanel />)
    expect(offered(harness)).toHaveLength(PICKER_LIMIT)
    await harness.click('control-bed-crop-all')
    expect(getAppState().showAllCrops).toBe(true)
    expect(offered(harness)).toHaveLength(rankedForBed().length)

    // the other direction: the ranking panel's own box writes the same flag, and this one follows
    await act(async () => {
      getAppState().setShowAllCrops(false)
    })
    expect((harness.get('control-bed-crop-all') as HTMLInputElement).checked).toBe(false)
    expect(offered(harness)).toHaveLength(PICKER_LIMIT)
    await harness.unmount()
  })
})

describe('putting one plant in place of another', () => {
  /**
   * A swap is one press, because as separate moves it often can't be made in the only order
   * offered: a full bed refuses the new planting for want of the room the old one is holding
   */
  it('takes the old planting out and puts the new one in on one press', async () => {
    const harness = await mount(<PlantsPanel />)
    const firstCrop = await stage(harness)
    await harness.click('action-bed-add-planting')
    const [old] = plantings()
    if (old === undefined) throw new Error("the first crop wasn't planted")

    // the second crop, staged against the planting it would take the place of
    let secondCrop: CropId | null = null
    for (const item of rankedForBed().slice(0, PICKER_LIMIT)) {
      if (item.outcome.verdict === 'excluded' || item.cropId === firstCrop) continue
      await harness.click(`item-bed-crop-${item.cropId}`)
      await choose(harness, 'control-bed-planting-replace', old.id)
      if (!(harness.get('action-bed-add-planting') as HTMLButtonElement).disabled) {
        secondCrop = item.cropId
        break
      }
    }
    if (secondCrop === null) throw new Error('no second crop could be swapped in')

    const oldName = cropName(catalog(), old.cropId)
    const newName = cropName(catalog(), secondCrop)
    expect(harness.get('status-bed-planting').textContent).toContain(`Replaces ${oldName}`)
    expect(harness.get('action-bed-add-planting').textContent).toBe(
      `Replace ${oldName} with ${newName}`,
    )

    await harness.click('action-bed-add-planting')
    expect(plantings().map((planting) => planting.cropId)).toEqual([secondCrop])
    // the draft is spent, so nothing is left staged against a planting that has gone
    expect(harness.find('control-bed-planting-replace')).toBeNull()
    expect(harness.get('status-bed-planting').textContent).toContain('Choose a crop below')
    await harness.unmount()
  })

  it('adds alongside when nothing is chosen to replace', async () => {
    const harness = await mount(<PlantsPanel />)
    const firstCrop = await stage(harness)
    await harness.click('action-bed-add-planting')
    const secondCrop = await stage(harness, [firstCrop])
    expect(harness.get('action-bed-add-planting').textContent).toBe('Add planting')
    await harness.click('action-bed-add-planting')
    expect(plantings().map((planting) => planting.cropId)).toEqual([firstCrop, secondCrop])
    await harness.unmount()
  })

  it('offers nothing to replace while the bed is empty', async () => {
    const harness = await mount(<PlantsPanel />)
    await stage(harness)
    expect(harness.find('control-bed-planting-replace')).toBeNull()
    await harness.unmount()
  })

  /**
   * A refusal that only names the select ("Use 'Put it in place of' below") sends a reader hunting
   * for it. A full bed offers the swap its own ranking would make first, so the status line and the
   * press already read the ordinary sentence for a full bed without anyone touching the select
   * themselves
   */
  it('pre-selects a replacement for a full bed, and the press reads the swap', async () => {
    const harness = await mount(<PlantsPanel />)
    const firstCrop = await stage(harness)
    await harness.click('action-bed-add-planting')
    const old = getAppState().plot?.beds[0]?.plantings[0]
    if (old === undefined) throw new Error("the first crop wasn't planted")

    // filled to the last plant, so any second crop is refused for room, whichever one it is
    await act(async () => {
      getAppState().updatePlanting('bed-a' as BedId, old.id, { plantCount: 100000 })
    })

    let secondCrop: CropId | null = null
    for (const item of rankedForBed().slice(0, PICKER_LIMIT)) {
      if (item.cropId === firstCrop) continue
      await harness.click(`item-bed-crop-${item.cropId}`)
      if ((harness.get('status-bed-planting').textContent ?? '').includes('Replaces')) {
        secondCrop = item.cropId
        break
      }
    }
    if (secondCrop === null) throw new Error('no second crop staged a swap against the full bed')

    const oldName = cropName(catalog(), old.cropId)
    const newName = cropName(catalog(), secondCrop)
    expect((harness.get('control-bed-planting-replace') as HTMLSelectElement).value).toBe(old.id)
    expect(harness.get('status-bed-planting').textContent).toContain(`Replaces ${oldName}`)
    expect(harness.get('action-bed-add-planting').textContent).toBe(
      `Replace ${oldName} with ${newName}`,
    )

    await harness.click('action-bed-add-planting')
    expect(plantings().map((planting) => planting.cropId)).toEqual([secondCrop])
    await harness.unmount()
  })
})

describe('a crop the ranking excluded', () => {
  /**
   * A green "Add planting" under a red EXCLUDED badge would make the badge read as a label: the
   * store would take the crop, the season would kill it and the rotation rule would refuse it the
   * year after
   */
  it('says what adding it will do, and asks for it in as many words', async () => {
    const harness = await mount(<PlantsPanel />)
    await harness.click('control-bed-crop-all')
    for (const item of rankedForBed()) {
      if (item.outcome.verdict !== 'excluded') continue
      await harness.click(`item-bed-crop-${item.cropId}`)
      const status = harness.get('status-bed-planting').textContent ?? ''
      if (!status.startsWith('Not suited:')) continue
      expect(status).toContain('It can still go in')
      const button = harness.get('action-bed-add-planting')
      expect(button.textContent).toBe('Add it anyway')
      expect(button.className).not.toContain('action-primary')
      await harness.unmount()
      return
    }
    throw new Error('nothing the ranking excluded could be derived in the seeded bed')
  })
})

describe('the sow day', () => {
  /**
   * A bare day of the year, as in "Sow day for hot pepper 88", gives no way to tell what 88 is. The
   * draft asks for a month and a day the way the rows above it do, and the day of the year the
   * derivation keys on is read out underneath and never typed into
   */
  it('is chosen as a date, with the day of the year read out under it', async () => {
    const harness = await mount(<PlantsPanel />)
    await stage(harness)
    expect(harness.find('control-bed-planting-sow')).toBeNull()
    expect(harness.find('control-bed-planting-sow-month')).not.toBeNull()
    expect(harness.find('control-bed-planting-sow-day')).not.toBeNull()
    expect(harness.get('readout-bed-draft-sow-date').textContent).toMatch(
      /^[A-Z][a-z]{2} \d{1,2} is day \d{1,3} of the year$/,
    )
    await harness.unmount()
  })

  /**
   * "Sow" on the plants step and "Start indoors" on the calendar step for the same crop read as
   * the two steps disagreeing. The row and the draft say what the calendar says
   */
  it('says what the calendar says the day is for, on the row and in the draft', async () => {
    const harness = await mount(<PlantsPanel />)
    const crop = await stage(harness)
    const method = calendarFor(calendars(), 'bed-a' as BedId, crop)?.plantings[0]?.method
    if (method === undefined) throw new Error('the staged crop has no calendar window')
    const verb = methodLabel(method)
    expect(harness.get('status-bed-planting').textContent).toContain(
      `${cropName(catalog(), crop)}: ${verb.toLowerCase()} `,
    )
    await harness.click('action-bed-add-planting')
    const [added] = plantings()
    if (added === undefined) throw new Error("the crop wasn't planted")
    expect(harness.get(`readout-bed-planting-${added.id}`).textContent).toMatch(
      new RegExp(`^${verb} [A-Z][a-z]{2} \\d{1,2} \\(day \\d{1,3}\\), harvest`),
    )
    await harness.unmount()
  })
})

describe('the same sowing chosen again', () => {
  /**
   * The same crop sown the same day is the planting already in the bed, and the store adds to it
   * without replacing it. The sentence says so before the press, because a reader who adds
   * one and reads eighteen on the row has to be told where the eighteen came from
   */
  it('says it adds to the planting already there, and does', async () => {
    const harness = await mount(<PlantsPanel />)
    const crop = await stage(harness)
    await harness.click('action-bed-add-planting')
    const before = getAppState().plot?.beds[0]?.plantings[0]?.plantCount ?? 0
    expect(before).toBeGreaterThan(0)

    await harness.click(`item-bed-crop-${crop}`)
    // one more of it, which is what a full bed still has room for
    await harness.type('control-bed-planting-count', '1')
    expect(harness.get('status-bed-planting').textContent).toContain(
      `Adds to the ${String(before)} already sown that day`,
    )
    expect(harness.get('action-bed-add-planting').textContent).toBe('Add planting')

    await harness.click('action-bed-add-planting')
    expect(plantings().map((planting) => planting.cropId)).toEqual([crop])
    expect(getAppState().plot?.beds[0]?.plantings[0]?.plantCount).toBe(before + 1)
    await harness.unmount()
  })
})
