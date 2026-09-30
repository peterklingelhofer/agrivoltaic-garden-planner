import { act } from 'react'
import { beforeEach, describe, expect, it } from 'bun:test'
import {
  loadCompanionRules,
  loadRotationConstraints,
  partitionCompanionRules,
} from '../data/companions'
import { loadCropCatalog } from '../data/crops'
import { loadTekRules } from '../data/tek'
import { bedCalendar } from '../recommend/calendar'
import { runRecommendationPipeline } from '../recommend/pipeline'
import { DEFAULT_WEIGHTS } from '../recommend/stages/rank'
import { soilWaterStage } from '../recommend/stages/soil-water'
import { AMBITION_CLASSES } from '../recommend/suggest'
import { bedFixture, bedLightFixture, plotFixture, siteFixture } from '../recommend/testkit'
import { FINAL_OPTIONS } from '../sim/pipeline'
import { makeArray } from '../state/defaults'
import { ready } from '../state/slices'
import { getAppState, resetAppStore, useAppStore } from '../state/store'
import { energyReportFixture } from '../state/testkit'
import type { BedId, CropId } from '../types/ids'
import type { SoilProfile } from '../types/site'
import { cropName } from './format'
import { PlantsPanel } from './PlantsPanel'
import { mount, type Harness } from './testkit'

/**
 * The plants step as most visitors reach it: every bed planted by the run before, the cards
 * saying what each holds, and every change made under the press that made it
 */

const BED_1 = 'bed-1' as BedId
const BED_2 = 'bed-2' as BedId

/**
 * Two beds under one row of panels that read different light, ranked and dated, with automatic
 * ranking off so a test drives every action itself, without racing a debounce. The same shape
 * `seedRankedStore` builds for one bed, over two.
 *
 * `soil` stamps the one reading on both beds, the way a site resolves it onto every bed that
 * hasn't been typed over. `rsr` overrides the two beds' shade ratios where a test needs a
 * particular split of light
 */
const seedTwoBeds = async (
  overrides: { readonly soil?: SoilProfile; readonly rsr?: readonly [number, number] } = {},
): Promise<void> => {
  const [catalog, companionRules, rotationConstraints, tekRules] = await Promise.all([
    loadCropCatalog(),
    loadCompanionRules(),
    loadRotationConstraints(),
    loadTekRules(),
  ])
  const bedPatch = overrides.soil === undefined ? {} : { soil: overrides.soil }
  const beds = [bedFixture(BED_1, bedPatch), bedFixture(BED_2, bedPatch)]
  const plot = { ...plotFixture(beds), arrays: [makeArray(1)] }
  const [rsr1, rsr2] = overrides.rsr ?? [0.08, 0.42]
  const bedLight = [bedLightFixture(BED_1, rsr1), bedLightFixture(BED_2, rsr2)]
  const site = siteFixture()
  useAppStore.setState({
    autoRun: false,
    site: ready(site),
    plot,
    selectedBedId: BED_1,
    bedLight,
    catalog: ready(catalog),
    sets: ready(
      runRecommendationPipeline({
        site,
        plot,
        bedLight,
        catalog,
        companionRules,
        rotationConstraints,
        frostPercentile: 20,
        weights: DEFAULT_WEIGHTS,
        preferredCropIds: [],
      }),
    ),
    calendars: ready(bedLight.map((light) => bedCalendar(site, light, catalog, 20))),
    companionRules: ready(partitionCompanionRules(companionRules)),
    rotationConstraints,
    tekRules: ready(tekRules),
    energy: ready(energyReportFixture()),
  })
}

/**
 * The engine's own count for a bed: of the crops the climate allows there, how many
 * `soilWaterStage` itself refuses on pH. Called directly, the way the component counts, so a
 * test pins the rule the component follows
 */
const expectedSoilPhCount = (
  bedId: BedId,
): { readonly allowed: number; readonly excluded: number } => {
  const state = getAppState()
  const ranked =
    state.sets.status === 'ready'
      ? (state.sets.value.find((set) => set.bedId === bedId)?.ranked ?? [])
      : []
  const allowed = ranked.filter(
    (item) =>
      !(item.outcome.verdict === 'excluded' && item.outcome.limiting.stage === 'climate-gate'),
  )
  const catalog = state.catalog.status === 'ready' ? state.catalog.value : []
  const site = state.site.status === 'ready' ? state.site.value : null
  const bed = state.plot?.beds.find((entry) => entry.id === bedId)
  const excluded =
    site === null || bed === undefined
      ? 0
      : allowed.filter((item) => {
          const crop = catalog.find((entry) => entry.id === item.cropId)
          if (crop === undefined) return false
          const outcome = soilWaterStage(crop, bed, site)
          return !outcome.passed && outcome.limiting?.cause.kind === 'soil-ph'
        }).length
  return { allowed: allowed.length, excluded }
}

const catalogue = () => {
  const catalog = getAppState().catalog
  if (catalog.status !== 'ready') throw new Error('the catalogue did not load')
  return catalog.value
}

const cropsIn = (bedId: BedId): readonly CropId[] =>
  (getAppState().plot?.beds.find((bed) => bed.id === bedId)?.plantings ?? []).map(
    (planting) => planting.cropId,
  )

const sorted = (ids: readonly CropId[]): string => [...ids].sort().join('+')

/** Waits, inside `act`, for a store action a press started to finish */
const settle = async (until: () => boolean): Promise<void> => {
  for (let round = 0; round < 400 && !until(); round += 1) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 5))
    })
  }
  if (!until()) throw new Error('the store never settled')
}

/** Which bed the combinations on the store are for, or null while there are none */
const suggestedFor = (): BedId | null => {
  const suggestions = getAppState().suggestions
  return suggestions.status === 'ready' ? suggestions.value.bedId : null
}

const planted = (): boolean =>
  getAppState().generated !== null && cropsIn(BED_1).length > 0 && cropsIn(BED_2).length > 0

/** The step as a visitor arrives at it: planted by the run, and mounted afterwards */
const arrive = async (): Promise<Harness> => {
  await seedTwoBeds()
  await act(async () => {
    await getAppState().plantEveryBed()
  })
  if (!planted()) throw new Error('the seeded plot could not be planted')
  return mount(<PlantsPanel />)
}

beforeEach(() => {
  localStorage.clear()
  resetAppStore()
})

describe('before the crops are ranked', () => {
  it('says the one thing it is waiting on, with the press that settles it, and nothing below', async () => {
    const harness = await mount(<PlantsPanel />)
    expect(harness.get('readout-plants-status').textContent).toContain('Nothing planted yet')
    expect(harness.get('status-plants-blocked').textContent).toMatch(/haven't been looked up/)
    expect(harness.get('status-plants-blocked-run').textContent).toBe('Look up this place')
    expect(harness.find('list-plants-beds')).toBeNull()
    expect(harness.find('list-plants-likes')).toBeNull()
    expect(harness.find('details-plants-ranking')).toBeNull()
    await harness.unmount()
  })
})

describe('the bed cards', () => {
  it('name what each bed holds, why, and where it stands in the light', async () => {
    const harness = await arrive()
    expect(harness.get('readout-plants-status').textContent).toContain('Planted bed by bed')
    expect(harness.get('readout-plants-status').textContent).toContain('Light: rough estimate')
    for (const bedId of [BED_1, BED_2]) {
      const mix = harness.get(`readout-plants-mix-${bedId}`).textContent ?? ''
      for (const cropId of cropsIn(bedId)) expect(mix).toContain(cropName(catalogue(), cropId))
      // the run planted one of its own combinations, so the card carries its confidence and
      // does not call it hand-picked; the counts read beside the crop they count. Only the
      // selected bed carries the detail: the rest are one row each
      await harness.click(`action-plants-select-${bedId}`)
      expect(harness.find(`readout-plants-why-${bedId}`)).toBeNull()
      expect(harness.find(`badge-plants-confidence-${bedId}`)).not.toBeNull()
      expect(harness.get(`readout-plants-counts-${bedId}`).textContent).toMatch(/\d+ \w/)
    }
    // the shade word off each bed's own light, the same word the light step prints for it
    expect(harness.get(`action-plants-select-${BED_1}`).textContent).toContain('sunny')
    expect(harness.get(`action-plants-select-${BED_2}`).textContent).toMatch(/part shade|shady/)
    await harness.unmount()
  })

  it('selects a bed from its card', async () => {
    const harness = await arrive()
    expect(harness.get(`item-plants-bed-${BED_1}`).dataset.selected).toBe('true')
    await harness.click(`action-plants-select-${BED_2}`)
    expect(getAppState().selectedBedId).toBe(BED_2)
    expect(harness.get(`item-plants-bed-${BED_2}`).dataset.selected).toBe('true')
    await harness.unmount()
  })

  it('steps to the next mix on one press, and prints which one it is', async () => {
    const harness = await arrive()
    const before = sorted(cropsIn(BED_1))
    await harness.click(`action-plants-next-mix-${BED_1}`)
    expect(sorted(cropsIn(BED_1))).not.toBe(before)
    const line = harness.get(`status-plants-mix-${BED_1}`).textContent ?? ''
    expect(line).toMatch(/^Mix \d+ of \d+: /)
    for (const cropId of cropsIn(BED_1)) expect(line).toContain(cropName(catalogue(), cropId))
    await harness.unmount()
  })

  it('opens the one-at-a-time fold for the bed on "Change a plant"', async () => {
    const harness = await arrive()
    const fold = harness.get('details-plants-by-hand') as HTMLDetailsElement
    expect(fold.open).toBe(false)
    // the presses live on the selected bed's card; a press on the row selects it
    await harness.click(`action-plants-select-${BED_2}`)
    await harness.click(`action-plants-edit-${BED_2}`)
    expect(getAppState().selectedBedId).toBe(BED_2)
    expect(fold.open).toBe(true)
    await harness.unmount()
  })

  it('puts the plot back the way it was', async () => {
    await seedTwoBeds()
    const before = getAppState().plot
    await act(async () => {
      await getAppState().plantEveryBed()
    })
    const harness = await mount(<PlantsPanel />)
    await harness.click('action-plants-undo')
    expect(getAppState().plot).toBe(before)
    expect(getAppState().generated).toBeNull()
    expect(harness.find('action-plants-undo')).toBeNull()
    await harness.unmount()
  })
})

describe('the light readout after a guided apply', () => {
  it('is not called rough, even before a raster in the editor has caught up with it', async () => {
    await seedTwoBeds()
    // what a guided apply itself leaves behind: bedLight set straight from the search's own
    // bake, with the raster untouched and still idle
    useAppStore.setState({ bedLightSubdivision: FINAL_OPTIONS.subdivision })
    await act(async () => {
      await getAppState().plantEveryBed()
    })
    const harness = await mount(<PlantsPanel />)
    expect(getAppState().raster.status).toBe('idle')
    expect(harness.get('readout-plants-status').textContent).toContain('Light: full check done')
    await harness.unmount()
  })
})

describe('planting every bed', () => {
  /**
   * The press is the primary thing on an unplanted step and an ordinary one afterwards. The
   * "Planting..." it shows in between is not asserted: with no worker the ranking settles inside
   * the press's own `act`, so the label has already gone back by the time it can be read
   */
  it('plants both beds from the one press', async () => {
    await seedTwoBeds()
    const harness = await mount(<PlantsPanel />)
    const fill = harness.get('action-plants-fill') as HTMLButtonElement
    expect(fill.textContent).toBe('Plant every bed')
    expect(fill.className).toContain('action-primary')
    expect(harness.find('action-plants-undo')).toBeNull()
    // no run has placed these beds, so the word is read off each bed's own shade
    expect(harness.get(`action-plants-select-${BED_1}`).textContent).toContain('sunny')
    expect(harness.get(`action-plants-select-${BED_2}`).textContent).toContain('shady')

    await harness.click('action-plants-fill')
    await settle(
      () => planted() && !(harness.get('action-plants-fill') as HTMLButtonElement).disabled,
    )
    expect(harness.get('action-plants-fill').textContent).toBe('Plant every bed again')
    expect(harness.get('action-plants-fill').className).not.toContain('action-primary')
    expect(harness.find('action-plants-undo')).not.toBeNull()
    expect(harness.get('readout-plants-status').textContent).toContain('Planted bed by bed')
    await harness.unmount()
  })
})

describe('the soil pH notice', () => {
  it('shows one notice for beds that share a map pH, with the same figure whatever their light', async () => {
    const soil: SoilProfile = { ...bedFixture(BED_1).soil, phUnits: 5.0, sourceId: 'soilgrids' }
    await seedTwoBeds({ soil, rsr: [0.2, 0.6] })
    const harness = await mount(<PlantsPanel />)
    const sunny = expectedSoilPhCount(BED_1)
    const shady = expectedSoilPhCount(BED_2)
    // soilWaterStage reads only the crop and the bed's own pH, so the shadier bed refuses no fewer
    expect(shady).toEqual(sunny)
    // the fixture pH is chosen to clear the notice's own quarter share by a wide margin
    expect(sunny.excluded / sunny.allowed).toBeGreaterThanOrEqual(0.25)
    expect(harness.all('status-plants-soil-ph').length).toBe(1)
    const notice = harness.get('status-plants-soil-ph').textContent ?? ''
    expect(notice).toContain('pH 5.0')
    expect(notice).toContain(
      `rules out ${String(sunny.excluded)} of the ${String(sunny.allowed)} plants`,
    )
    expect(notice).toContain('Change the beds')
    await harness.unmount()
  })

  it('says nothing for a typed pH, even one that would otherwise qualify', async () => {
    const soil: SoilProfile = { ...bedFixture(BED_1).soil, phUnits: 5.0, sourceId: 'user' }
    await seedTwoBeds({ soil })
    const harness = await mount(<PlantsPanel />)
    expect(harness.find('status-plants-soil-ph')).toBeNull()
    await harness.unmount()
  })

  it('says nothing when a map pH rules out only a few', async () => {
    const soil: SoilProfile = { ...bedFixture(BED_1).soil, sourceId: 'soilgrids' }
    await seedTwoBeds({ soil })
    const harness = await mount(<PlantsPanel />)
    const counts = expectedSoilPhCount(BED_1)
    expect(counts.excluded / counts.allowed).toBeLessThan(0.25)
    expect(harness.find('status-plants-soil-ph')).toBeNull()
    await harness.unmount()
  })
})

describe('saying what you like to eat', () => {
  const firstChip = (harness: Harness): HTMLElement => {
    const chip = harness
      .get('list-plants-likes')
      .querySelector<HTMLElement>('[data-testid^="control-plants-like-"]')
    if (chip === null) throw new Error('no chip was offered')
    return chip
  }

  /**
   * The ranking breaks its ties alphabetically, so the head of it runs arugula to celeriac: a
   * grower who has just asked for tomatoes and berries would meet twelve chips and none of them
   */
  it('leads with the group the growing answer asked for', async () => {
    await seedTwoBeds()
    useAppStore.setState((s) => ({
      ...s,
      answers: { ...s.answers, ambition: 'leafy-and-herbs' },
    }))
    const harness = await mount(<PlantsPanel />)
    const cropId = (firstChip(harness).dataset.testid ?? '').replace(
      'control-plants-like-',
      '',
    ) as CropId
    const dliClass = catalogue().find((crop) => crop.id === cropId)?.dliClass
    expect(AMBITION_CLASSES['leafy-and-herbs']).toContain(dliClass)
    const groups = [...harness.get('list-plants-likes').querySelectorAll('.like-group')]
    expect(groups[0]?.getAttribute('data-testid')).toBe('list-plants-likes-leaves')
  })

  it('offers food crops only, and cycles a chip through prefer, avoid and back', async () => {
    await seedTwoBeds()
    const harness = await mount(<PlantsPanel />)
    const chips = harness
      .get('list-plants-likes')
      .querySelectorAll<HTMLElement>('[data-testid^="control-plants-like-"]')
    expect(chips.length).toBeGreaterThan(0)
    // every food crop the bed can take, in named groups, with no "show all" box for a chip such as
    // tomato to hide behind
    expect(harness.find('list-plants-likes-fruiting')).not.toBeNull()
    expect(harness.find('control-plants-likes-all')).toBeNull()
    for (const chip of chips) {
      const cropId = chip.dataset.testid?.replace('control-plants-like-', '') as CropId
      expect(catalogue().find((crop) => crop.id === cropId)?.role, cropId as string).toBeNull()
    }

    const chip = firstChip(harness)
    const cropId = (chip.dataset.testid ?? '').replace('control-plants-like-', '') as CropId
    const name = cropName(catalogue(), cropId)
    const id = `control-plants-like-${cropId}`
    expect(chip.dataset.kind).toBe('none')
    expect(chip.getAttribute('aria-pressed')).toBe('false')

    await harness.click(id)
    expect(getAppState().preferences.entries).toEqual([{ cropId, kind: 'prefer', weight: 1 }])
    expect(harness.get(id).dataset.kind).toBe('prefer')
    expect(harness.get(id).getAttribute('aria-pressed')).toBe('true')
    expect(harness.get(id).getAttribute('aria-label')).toBe(`Prefer ${name}`)

    await harness.click(id)
    expect(getAppState().preferences.entries[0]?.kind).toBe('avoid')
    expect(harness.get(id).getAttribute('aria-label')).toBe(`Avoid ${name}`)

    await harness.click(id)
    expect(getAppState().preferences.entries).toEqual([])
    expect(harness.get(id).dataset.kind).toBe('none')
    await harness.unmount()
  })

  it('keeps must-have and never in the fold, with the influence and the weights', async () => {
    await seedTwoBeds()
    const harness = await mount(<PlantsPanel />)
    const fold = harness.get('details-plants-more') as HTMLDetailsElement
    expect(fold.open).toBe(false)
    const cropId = (firstChip(harness).dataset.testid ?? '').replace('control-plants-like-', '')
    expect(fold.contains(harness.get(`control-polyculture-kind-${cropId}-require`))).toBe(true)
    expect(fold.contains(harness.get(`control-polyculture-kind-${cropId}-exclude`))).toBe(true)
    expect(harness.find(`control-polyculture-kind-${cropId}-prefer`)).toBeNull()
    expect(fold.contains(harness.get('control-polyculture-influence'))).toBe(true)
    expect(fold.contains(harness.get('control-polyculture-weight-soil-ph'))).toBe(true)
    await harness.unmount()
  })

  it('writes the two wildlife switches', async () => {
    await seedTwoBeds()
    const harness = await mount(<PlantsPanel />)
    await harness.click('control-plants-pollinators')
    await harness.click('control-plants-natives')
    expect(getAppState().wildlife).toEqual({ favourNative: true, favourPollinators: true })
    await harness.unmount()
  })

  /**
   * The readout says what ticking "Flowers for bees" or "Wild plants from around here" changed.
   * `autoRun` is off in this fixture, so the ranking never actually re-runs behind the switch, and
   * the readout says so, without guessing at a move that has not happened
   */
  it('says what a wildlife switch changed on the selected bed, and offers to replant with it', async () => {
    await seedTwoBeds()
    const harness = await mount(<PlantsPanel />)
    await harness.click('control-plants-pollinators')
    expect(harness.get('readout-plants-choices-effect').textContent).toBe(
      `Flowers for bees on: the top 8 for ${BED_1} are unchanged`,
    )

    await harness.click('action-plants-replant')
    await settle(() => planted())
    expect(planted()).toBe(true)
    await harness.unmount()
  })

  it('says what a like, must-have or never pick changed too', async () => {
    await seedTwoBeds()
    const harness = await mount(<PlantsPanel />)
    const chip = firstChip(harness)
    const name = cropName(
      catalogue(),
      (chip.dataset.testid ?? '').replace('control-plants-like-', '') as CropId,
    )
    await harness.click(chip.dataset.testid ?? '')
    expect(harness.get('readout-plants-choices-effect').textContent).toContain(`Prefer ${name}:`)
    await harness.unmount()
  })

  /**
   * The beds follow the chips while they still hold what the run planted, so a grower who says
   * "prefer cucumber" sees the garden move with the cards
   */
  it('replants every bed after a chip when the beds still hold what the run planted', async () => {
    const harness = await arrive()
    const before = getAppState().plot
    await harness.click(firstChip(harness).dataset.testid ?? '')
    await settle(() => harness.get('status-plants-replanted').dataset.state === 'changed')
    // replanted, through the same path as the press: the plot is a new one
    expect(getAppState().plot).not.toBe(before)
    expect(harness.get('status-plants-replanted').dataset.state).toBe('changed')
    expect(harness.get('status-plants-replanted').textContent).toMatch(/bed(s)? changed/)
    expect(planted()).toBe(true)
    await harness.unmount()
  })

  it('leaves a bed changed by hand alone, and offers the fill press instead', async () => {
    const harness = await arrive()
    const bed = getAppState().plot?.beds.find((entry) => entry.id === BED_1)
    const first = bed?.plantings[0]
    if (bed === undefined || first === undefined) throw new Error('the bed carries no planting')
    await act(async () => {
      getAppState().removePlanting(bed.id, first.id)
    })
    const kept = sorted(cropsIn(BED_1))
    await harness.click(firstChip(harness).dataset.testid ?? '')
    expect(harness.get('status-plants-replanted').dataset.state).toBe('by-hand')
    expect(sorted(cropsIn(BED_1))).toBe(kept)
    expect(harness.get('action-plants-fill').textContent).toBe(
      'Plant every bed again for what you like',
    )
    await harness.unmount()
  })
})

describe('the combinations for the selected bed', () => {
  it('are asked for without a press, and follow the selected bed', async () => {
    const harness = await arrive()
    expect(harness.find('action-polyculture-suggest')).toBeNull()
    expect(harness.get('list-plants-combinations').children.length).toBeGreaterThan(0)
    expect(suggestedFor()).toBe(BED_1)
    await harness.click(`action-plants-select-${BED_2}`)
    expect(suggestedFor()).toBe(BED_2)
    await harness.unmount()
  })

  it('prints what "Plant this combination" did under the press', async () => {
    const harness = await arrive()
    await harness.click('action-polyculture-apply-0')
    const outcome = harness.get('status-polyculture-applied-0')
    expect(outcome.textContent).toContain('Planted in bed-1')
    expect(Number(outcome.dataset.planted)).toBeGreaterThan(0)
    const card = harness.get('item-polyculture-suggestion-0')
    expect(sorted(cropsIn(BED_1))).toBe(sorted((card.dataset.crops ?? '').split('+') as CropId[]))
    await harness.unmount()
  })

  it('folds the case for a combination behind the card, and the refusals behind the list', async () => {
    const harness = await arrive()
    const fold = harness.get('panel-polyculture-breakdown-0') as HTMLDetailsElement
    expect(fold.open).toBe(false)
    expect(fold.contains(harness.get('readout-polyculture-ler-0'))).toBe(true)
    expect(fold.contains(harness.get('action-polyculture-apply-0'))).toBe(false)
    const suggestions = getAppState().suggestions
    const refused = suggestions.status === 'ready' ? suggestions.value.refused.length : 0
    const refusals = harness.find('details-plants-refusals') as HTMLDetailsElement | null
    expect(refusals === null).toBe(refused === 0)
    expect(refusals?.open ?? false).toBe(false)
    await harness.unmount()
  })
})

describe('what the last run decided', () => {
  it('is folded under the step, and gone once the plot is put back', async () => {
    const harness = await arrive()
    const fold = harness.get('details-plants-plan') as HTMLDetailsElement
    expect(fold.open).toBe(false)
    expect(fold.contains(harness.get('list-plan-beds'))).toBe(true)
    await harness.click('action-plants-undo')
    expect(harness.find('details-plants-plan')).toBeNull()
    await harness.unmount()
  })
})
