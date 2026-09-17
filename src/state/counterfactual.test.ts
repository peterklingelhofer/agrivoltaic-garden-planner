import { beforeEach, describe, expect, it, mock } from 'bun:test'
import { vi } from '../../test/vi'
import {
  loadCompanionRules,
  loadRotationConstraints,
  partitionCompanionRules,
} from '../data/companions'
import { loadCropCatalog } from '../data/crops'
import { measuredYearFixture } from '../data/testkit'
import {
  bedFixture,
  bedLightFixture,
  plotFixture,
  siteFixture,
  tmyFixture,
} from '../recommend/testkit'
import { measuredSeasonYear, typicalYear } from '../simulation/year'
import type { GardenPlot, Planting } from '../types/garden'
import type { BedId, CropId, PlantingId } from '../types/ids'
import type { SeasonRecord, YearSummary } from '../types/simulation'
import type { DayOfYear } from '../types/units'
import { historyBeforeSeason, seasonYearOf, withoutPanels } from './counterfactual'
import { makeArray } from './defaults'
import { lightGeometryKey } from './light-freshness'
import { ready } from './slices'
import { resetAppStore, useAppStore } from './store'

const catalog = await loadCropCatalog()
const rules = partitionCompanionRules(await loadCompanionRules())
const rotation = await loadRotationConstraints()

describe('withoutPanels', () => {
  it('strips every array and leaves the rest of the plot alone', () => {
    const plot = { ...plotFixture([bedFixture('bed-a')]), arrays: [makeArray(1)] }
    const stripped = withoutPanels(plot)
    expect(stripped.arrays).toEqual([])
    expect(stripped.beds).toBe(plot.beds)
    expect(stripped).not.toBe(plot)
  })
})

describe('historyBeforeSeason', () => {
  const record = (season: number, bedId: string): SeasonRecord => ({
    season,
    year: 2018,
    bedId: bedId as BedId,
    cropId: 'tomato' as CropId,
    harvested: true,
  })

  it('drops only the named season, keeping every other one whole', () => {
    const history = [record(1, 'bed-a'), record(2, 'bed-a'), record(2, 'bed-b')]
    expect(historyBeforeSeason(history, 2)).toEqual([history[0]])
    expect(historyBeforeSeason(history, 1)).toEqual([history[1], history[2]])
  })

  it('is the whole history where the named season never ran', () => {
    const history = [record(1, 'bed-a')]
    expect(historyBeforeSeason(history, 5)).toEqual(history)
  })
})

describe('seasonYearOf', () => {
  const site = siteFixture()
  const weather = tmyFixture()
  const typical = typicalYear(site, weather)
  const measured = measuredSeasonYear(site, measuredYearFixture({ year: 2018 }))
  const typicalSummary: YearSummary = typical.summary
  const measuredSummary: YearSummary = measured.summary

  it('is the typical year for a report that ran on no single year', () => {
    expect(seasonYearOf(typicalSummary, [measured], typical)).toBe(typical)
  })

  it('finds the measured year a report names', () => {
    expect(seasonYearOf(measuredSummary, [measured], typical)).toBe(measured)
  })

  it('is null once the named year has left the record', () => {
    expect(seasonYearOf(measuredSummary, [], typical)).toBeNull()
  })
})

/*
  The store side: `compareWithoutPanels` end to end, against a faked sim client the way
  `onboarding.test.ts` fakes it. The engine that bakes a light field is tested elsewhere, and what
  belongs to this feature is whether it is called with the arrays stripped, and whether everything
  real is left standing once it returns
*/
const worker = vi.hoisted(() => ({
  run: vi.fn(),
  cancelAll: vi.fn(),
  terminate: vi.fn(),
  create: vi.fn(),
}))

/* captured before the mock is installed, so the spread carries the real module */
const actualWorkerClient = await import('../sim/worker/client')
mock.module('../sim/worker/client', () => ({
  ...actualWorkerClient,
  createSimClient: worker.create,
}))

const planting = (bedId: string, cropId: string): Planting => ({
  id: `${bedId}-${cropId}` as PlantingId,
  bedId: bedId as BedId,
  cropId: cropId as CropId,
  cultivarId: null,
  role: 'target-crop',
  tier: 'herb-ground',
  sowDay: 140 as DayOfYear,
  harvestStartDay: 220 as DayOfYear,
  harvestEndDay: 260 as DayOfYear,
  plantCount: 6,
})

/** A garden with one bed under one array, so there is both a season to run and a panel to drop */
const seedGarden = (): GardenPlot => {
  const plot = {
    ...plotFixture([bedFixture('bed-a', { plantings: [planting('bed-a', 'tomato')] })]),
    arrays: [makeArray(1)],
  }
  useAppStore.setState({
    site: ready(siteFixture()),
    weather: ready(tmyFixture()),
    plot,
    // real shade, so a bake reporting none back is a visibly different answer
    bedLight: [bedLightFixture('bed-a', 0.4)],
    lightGeometry: lightGeometryKey(plot),
    catalog: ready(catalog),
    companionRules: ready(rules),
    folklore: rules.folklore,
    rotationConstraints: rotation,
    simulation: { ...useAppStore.getState().simulation, seed: 4 },
  })
  return plot
}

const noPanelBake = (): void => {
  worker.run.mockResolvedValue({
    raster: {} as never,
    bedLight: [bedLightFixture('bed-a', 0)],
    elapsedMs: 1,
    physics: 'reference-ts' as never,
  })
}

beforeEach(() => {
  worker.run.mockReset()
  worker.cancelAll.mockReset()
  worker.terminate.mockReset()
  worker.create.mockReset()
  worker.create.mockReturnValue({
    run: worker.run,
    cancelAll: worker.cancelAll,
    terminate: worker.terminate,
  })
  resetAppStore()
})

describe('compareWithoutPanels', () => {
  it('bakes the plot with the arrays stripped and leaves the real season standing', async () => {
    seedGarden()
    useAppStore.getState().runSeason()
    const before = useAppStore.getState()
    expect(before.simulation.season).toBe(1)
    const realReport = before.simulation.reports[0]
    const realHistory = before.simulation.history
    const realPlot = before.plot
    const realBedLight = before.bedLight
    noPanelBake()

    const pending = useAppStore.getState().compareWithoutPanels()
    // set synchronously, before the bake's own promise has settled
    expect(useAppStore.getState().noPanels.status).toBe('loading')
    await pending

    const after = useAppStore.getState()
    expect(after.noPanels.status).toBe('ready')
    const comparison = after.noPanels.status === 'ready' ? after.noPanels.value : null
    expect(typeof comparison?.harvestIndex).toBe('number')
    expect(comparison?.season).toBe(1)

    // the real report, history, plot and bed light are exactly what they were
    expect(after.simulation.reports[0]).toBe(realReport)
    expect(after.simulation.history).toBe(realHistory)
    expect(after.plot).toBe(realPlot)
    expect(after.bedLight).toBe(realBedLight)

    // and the bake it asked for was the plot with the arrays gone, never the real one
    expect(worker.run).toHaveBeenCalledTimes(1)
    const bakedPlot = worker.run.mock.calls[0]?.[1] as GardenPlot
    expect(bakedPlot.arrays).toEqual([])
    expect(bakedPlot.beds).toEqual(realPlot?.beds)
  })

  it('marks the comparison stale once a new season runs', async () => {
    seedGarden()
    useAppStore.getState().runSeason()
    noPanelBake()
    await useAppStore.getState().compareWithoutPanels()
    expect(useAppStore.getState().noPanels.status).toBe('ready')

    useAppStore.getState().runSeason()
    expect(useAppStore.getState().simulation.season).toBe(2)
    expect(useAppStore.getState().noPanels.status).toBe('idle')
  })

  it('does nothing for a plot with no arrays', async () => {
    seedGarden()
    const plot = useAppStore.getState().plot
    if (plot === null) throw new Error('expected a plot')
    useAppStore.setState({ plot: { ...plot, arrays: [] } })
    useAppStore.getState().runSeason()
    noPanelBake()

    await useAppStore.getState().compareWithoutPanels()
    expect(useAppStore.getState().noPanels.status).toBe('idle')
    expect(worker.run).not.toHaveBeenCalled()
  })

  it('does nothing before any season has run', async () => {
    seedGarden()
    noPanelBake()
    await useAppStore.getState().compareWithoutPanels()
    expect(useAppStore.getState().noPanels.status).toBe('idle')
    expect(worker.run).not.toHaveBeenCalled()
  })

  it('keeps a second press from being overwritten by a first bake landing late', async () => {
    seedGarden()
    useAppStore.getState().runSeason()

    let resolveFirst: ((result: unknown) => void) | undefined
    let resolveSecond: ((result: unknown) => void) | undefined
    worker.run
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveFirst = resolve
          }),
      )
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveSecond = resolve
          }),
      )

    const first = useAppStore.getState().compareWithoutPanels()
    const second = useAppStore.getState().compareWithoutPanels()

    // the second press's own bake lands...
    resolveSecond?.({
      raster: {} as never,
      bedLight: [bedLightFixture('bed-a', 0)],
      elapsedMs: 1,
      physics: 'reference-ts' as never,
    })
    await second
    expect(useAppStore.getState().noPanels.status).toBe('ready')
    const afterSecond = useAppStore.getState().noPanels

    // ...and the first press's bake, landing after it, must not overwrite it
    resolveFirst?.({
      raster: {} as never,
      bedLight: [bedLightFixture('bed-a', 0.9)],
      elapsedMs: 1,
      physics: 'reference-ts' as never,
    })
    await first
    expect(useAppStore.getState().noPanels).toEqual(afterSecond)
  })
})
