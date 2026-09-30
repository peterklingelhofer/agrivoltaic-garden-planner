import { act } from 'react'
import { beforeEach, describe, expect, it } from 'bun:test'
import { isNativeIn } from '../data/catalog/native-ranges'
import { cropById, loadCropCatalog } from '../data/crops'
import { siteFixture } from '../recommend/testkit'
import { ready } from '../state/slices'
import { getAppState, resetAppStore, useAppStore } from '../state/store'
import { ACID_SOIL, seedRankedStore } from '../state/testkit'
import type { Crop } from '../types/crop'
import type { CropId } from '../types/ids'
import { dependenceNote, forageNote, nativeNote } from './format'
import { PlantsPanel } from './PlantsPanel'
import { RANKED_LIMIT } from './RecommendationPanel'
import { mount } from './testkit'

/**
 * "Every crop ranked, and why", the fold at the foot of the plants step, mounted through the
 * step because the two switches that change what the rows say sit beside the chips above it
 */

const TOMATO = 'tomato' as CropId
// every shipped crop now matches an entry in native-ranges.generated.ts, so the checklist-miss
// case needs a crop invented for it: a clone of a real one with an id NATIVE_RANGES has never
// heard of, so isNativeIn returns null however the region comes out. The third state this file
// exists to pin
const UNMATCHED = 'unmatched-crop' as CropId

/** A clone of the tomato fixture under an id no NATIVE_RANGES entry answers for */
const unmatchedCropFixture = async (): Promise<Crop> => {
  const tomato = cropById(await loadCropCatalog(), TOMATO)
  if (tomato === undefined) throw new Error('tomato is not in the catalogue')
  return { ...tomato, id: UNMATCHED }
}

/**
 * Moves the seeded site to a botanical region without rebuilding anything else `seedRankedStore`
 * set up. Wrapped in `act` because a mounted panel is subscribed to this and re-renders on it
 */
const setBotanicalArea = async (area: string | null): Promise<void> => {
  await act(async () => {
    useAppStore.setState({ site: ready(siteFixture({ soil: ACID_SOIL, botanicalArea: area })) })
  })
}

const rankedSet = () => {
  const ranked = getAppState().sets
  if (ranked.status !== 'ready') throw new Error('nothing was ranked')
  const [set] = ranked.value
  if (set === undefined) throw new Error('no bed was ranked')
  return set
}

beforeEach(() => {
  resetAppStore()
})

describe('how much of the ranking a bed shows', () => {
  /**
   * The cap is the whole point, so this asserts the count. Not merely the presence of a switch: a
   * regression that rendered the switch and went on rendering every row would leave the switch
   * passing and the sidebar back at tens of thousands of pixels
   */
  it('shows the leading twelve and says how many it is holding back', async () => {
    await seedRankedStore()
    const harness = await mount(<PlantsPanel />)
    const set = rankedSet()
    expect(set.ranked.length).toBeGreaterThan(RANKED_LIMIT)
    expect(
      harness.get(`item-recommendation-set-${set.bedId}`).querySelectorAll('.rec-row'),
    ).toHaveLength(RANKED_LIMIT)
    expect(harness.get(`readout-recommendation-hidden-${set.bedId}`).dataset.hidden).toBe(
      String(set.ranked.length - RANKED_LIMIT),
    )
    await harness.unmount()
  })

  it('shows every row once asked, and then has nothing left to hold back', async () => {
    await seedRankedStore()
    const harness = await mount(<PlantsPanel />)
    await harness.click('control-recommendation-all')
    const set = rankedSet()
    expect(
      harness.get(`item-recommendation-set-${set.bedId}`).querySelectorAll('.rec-row'),
    ).toHaveLength(set.ranked.length)
    expect(harness.find(`readout-recommendation-hidden-${set.bedId}`)).toBeNull()
    await harness.unmount()
  })

  /**
   * One sentence above the list speaks for the whole tied head, because "Nothing rules it out.
   * Weakest part of the match: ..." on each of twenty equal rows reads as one sentence twenty times
   * and says nothing. A row keeps its own sentence only when something holds it back
   */
  it('says once above the tied head what holds none of them back, and not on each row', async () => {
    await seedRankedStore()
    // the acid bed ranks a clear leader, so the second recommended crop is lifted level with the
    // first: a tie of two, which is the smallest head the sentence is written for
    const seeded = rankedSet()
    const leaders = seeded.ranked.filter((entry) => entry.outcome.verdict === 'recommended')
    const [first, second] = leaders
    if (first?.outcome.verdict !== 'recommended' || second?.outcome.verdict !== 'recommended') {
      throw new Error('the seeded bed recommends fewer than two crops')
    }
    const level = {
      ...second,
      outcome: {
        ...second.outcome,
        score: { ...second.outcome.score, total: first.outcome.score.total },
      },
    }
    useAppStore.setState({
      sets: ready([
        {
          ...seeded,
          ranked: seeded.ranked.map((entry) => (entry.cropId === second.cropId ? level : entry)),
        },
      ]),
    })
    const harness = await mount(<PlantsPanel />)
    const set = rankedSet()
    expect(harness.get(`readout-recommendation-tied-${set.bedId}`).dataset.tied).toBe('2')
    expect(harness.get(`readout-recommendation-head-${set.bedId}`).textContent).toMatch(
      /^Nothing rules the top 2 out\. Weakest part of the match: /,
    )
    for (const item of set.ranked.slice(0, RANKED_LIMIT)) {
      const why = harness.find(`readout-limiting-${item.cropId}`)
      expect(why === null, item.cropId as string).toBe(item.outcome.verdict === 'recommended')
    }
    await harness.unmount()
  })
})

describe('acting on a recommendation without going to look for it again', () => {
  /**
   * Each crop the site and the light allow carries a press here, so a grower who reads the
   * reasoning and decides doesn't have to find the same crop again in the picker above. The press
   * goes through `carry` and `dropOnBed`, the same pair the drag from that picker uses, so both
   * arrive as one staged draft added by one button
   */
  it('stages the crop against the bed it was ranked for, and goes to where that shows', async () => {
    await seedRankedStore()
    const harness = await mount(<PlantsPanel />)
    const set = rankedSet()
    const first = set.ranked.find((entry) => entry.outcome.verdict !== 'excluded')
    if (first === undefined) throw new Error('no placeable crop was ranked')

    await harness.click(`action-recommendation-place-${first.cropId}`)
    const after = getAppState()
    expect(after.dropped).toEqual({ bedId: set.bedId, cropId: first.cropId })
    // the bed the ranking was for, and the step where the staged choice is visible: a press that
    // showed nothing would read as a press that failed
    expect(after.selectedBedId).toBe(set.bedId)
    expect(after.sidebarStep).toBe('plants')
    // nothing is planted by this: it stages a draft, and Add planting is still the one commit
    expect(after.carrying).toBeNull()
    await harness.unmount()
  })

  it('names the bed on the press, so a plot of four beds says which one', async () => {
    await seedRankedStore()
    const harness = await mount(<PlantsPanel />)
    const set = rankedSet()
    const first = set.ranked.find((entry) => entry.outcome.verdict !== 'excluded')
    if (first === undefined) throw new Error('no placeable crop was ranked')
    const label = getAppState().plot?.beds.find((bed) => bed.id === set.bedId)?.label ?? ''
    expect(label).not.toBe('')
    expect(harness.get(`action-recommendation-place-${first.cropId}`).textContent).toContain(label)
    await harness.unmount()
  })

  /** a row that has just said what rules the crop out must not then offer to plant it */
  it('offers no press on a crop the site or the light excludes', async () => {
    await seedRankedStore()
    const harness = await mount(<PlantsPanel />)
    await harness.click('control-recommendation-all')
    const excluded = rankedSet().ranked.find((entry) => entry.outcome.verdict === 'excluded')
    if (excluded === undefined) throw new Error('nothing was excluded in this fixture')
    expect(harness.find(`item-recommendation-${excluded.cropId}`)).not.toBeNull()
    expect(harness.find(`action-recommendation-place-${excluded.cropId}`)).toBeNull()
    await harness.unmount()
  })
})

describe('a ranked row and the wildlife question', () => {
  it('grows no wildlife list at all when neither switch has been asked', async () => {
    await seedRankedStore()
    const harness = await mount(<PlantsPanel />)
    expect(harness.find(`list-wildlife-${TOMATO}`)).toBeNull()
    await harness.unmount()
  })

  /**
   * Both directions, on one crop whose range is a single area. Asserting only that the row says
   * what `nativeNote(isNativeIn(...))` says would pass with the region wired to the wrong place
   * or not wired at all, because both sides would move together; what pins the wiring is that
   * the same crop reads differently in the two regions
   */
  it('reads the native answer the checklist actually gives for this crop and region', async () => {
    await seedRankedStore()
    await setBotanicalArea('PER')
    const harness = await mount(<PlantsPanel />)
    // the fold shows the leading twelve; these tests assert on a crop by name, so they ask for
    // the whole ranking, without depending on where the run happened to place it
    await harness.click('control-recommendation-all')
    // both wildlife answers start off, so the switch is pressed here: what this reads is the
    // state a grower who asked for natives is in
    await harness.click('control-plants-natives')
    // Kew records the tomato growing wild in Peru and in no other botanical country
    expect(isNativeIn(TOMATO, 'PER')).toBe(true)
    expect(harness.get(`readout-native-${TOMATO}`).textContent).toBe(nativeNote(true))
    await setBotanicalArea('MAS')
    expect(harness.get(`readout-native-${TOMATO}`).textContent).toBe(nativeNote(false))
    await harness.unmount()
  })

  /**
   * `isNativeIn` answers null for a crop no accepted name matched, and a two-branch reading of
   * that would print "not native" over a plant Kew has never made a claim about. This crop has a
   * resolved region, so a regression that collapsed the third state would show up here and not
   * be mistaken for the region-unknown case below
   */
  it('never reads a crop with no checklist match as "not native"', async () => {
    await seedRankedStore([await unmatchedCropFixture()])
    await setBotanicalArea('PER')
    const harness = await mount(<PlantsPanel />)
    await harness.click('control-recommendation-all')
    await harness.click('control-plants-natives')
    const said = harness.get(`readout-native-${UNMATCHED}`).textContent ?? ''
    expect(said).toBe(nativeNote(null))
    expect(said).not.toMatch(/not native/i)
    await harness.unmount()
  })

  // seedRankedStore's own site fixture resolves with no botanical region, so this is what the step
  // says for a place the region map does not cover: the place is named, so the sentence doesn't
  // read as if the lookup itself never ran. Said whichever way the switch is set, since it is as
  // true before the press as after
  it('says the place is outside the map rather than letting the switch read as if it had worked', async () => {
    await seedRankedStore()
    const harness = await mount(<PlantsPanel />)
    const said = harness.get('status-plants-natives-region').textContent ?? ''
    expect(said).toMatch(/is outside the region map/)
    expect(said).toContain(getAppState().locationLabel)
    await harness.unmount()
  })

  it('renders forage and dependence as two separate lines, never folded into one sentence', async () => {
    await seedRankedStore()
    const harness = await mount(<PlantsPanel />)
    await harness.click('control-recommendation-all')
    // off by default, so the switch is pressed to see what it says
    await harness.click('control-plants-pollinators')
    const catalog = getAppState().catalog
    if (catalog.status !== 'ready') throw new Error('catalogue did not load')
    const crop = cropById(catalog.value, TOMATO)
    if (crop === undefined) throw new Error('tomato is not in the catalogue')
    expect(harness.get(`readout-forage-${TOMATO}`).textContent).toBe(
      forageNote(crop.wildlife.forage.value),
    )
    expect(harness.get(`readout-dependence-${TOMATO}`).textContent).toBe(
      dependenceNote(crop.wildlife.dependence.value),
    )
    await harness.unmount()
  })
})

describe('the switches write into the store', () => {
  it('flips favourNative and favourPollinators through setWildlife', async () => {
    await seedRankedStore()
    const harness = await mount(<PlantsPanel />)
    // both start off, so the press under test is the one that turns a switch ON, and it is
    // pressed back afterwards: a setter that only worked in one direction would pass either half
    expect(useAppStore.getState().wildlife).toEqual({
      favourNative: false,
      favourPollinators: false,
    })
    await harness.click('control-plants-natives')
    await harness.click('control-plants-pollinators')
    expect(useAppStore.getState().wildlife).toEqual({
      favourNative: true,
      favourPollinators: true,
    })
    await harness.click('control-plants-natives')
    await harness.click('control-plants-pollinators')
    expect(useAppStore.getState().wildlife).toEqual({
      favourNative: false,
      favourPollinators: false,
    })
    await harness.unmount()
  })
})

describe('what the fold no longer carries', () => {
  /**
   * The loads happen by themselves and the wildlife switches sit beside the chips, so the fold
   * is the ranking and the presses that run it again, and nothing that belongs to another step
   */
  it('has no load presses, no primary run press and no switches of its own', async () => {
    await seedRankedStore()
    const harness = await mount(<PlantsPanel />)
    const fold = harness.get('details-plants-ranking')
    for (const id of [
      'action-recommendation-load',
      'action-recommendation-evidence',
      'action-recommendation-run',
      'control-recommendation-native',
      'control-recommendation-pollinators',
      'status-ranking-blocked',
    ]) {
      expect(harness.find(id), id).toBeNull()
    }
    expect(fold.contains(harness.get('action-recommendation-rerun'))).toBe(true)
    expect(fold.contains(harness.get('status-autorun'))).toBe(true)
    expect(fold.contains(harness.get('control-plants-natives'))).toBe(false)
    await harness.unmount()
  })
})
