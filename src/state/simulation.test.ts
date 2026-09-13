import { beforeEach, describe, expect, it } from 'bun:test'
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
import type { Planting } from '../types/garden'
import type { BedId, CropId, PlantingId, RuleId } from '../types/ids'
import type { SeasonReport, SimulationState } from '../types/simulation'
import type { DayOfYear, Fraction } from '../types/units'
import { lightGeometryKey } from './light-freshness'
import {
  mergeTrials,
  SEASON_LIGHT_STALE,
  SEASON_NEEDS_BEDS,
  SEASON_NEEDS_LIGHT,
  SEASON_NEEDS_SITE,
  SEASON_REPORTS_KEPT,
  seasonBlocker,
  withSeason,
} from './simulation'
import { idle, ready } from './slices'
import { resetAppStore, useAppStore } from './store'

const catalog = await loadCropCatalog()
const rules = partitionCompanionRules(await loadCompanionRules())
const rotation = await loadRotationConstraints()

const planting = (bedId: string, cropId: string, sowDay = 140): Planting => ({
  id: `${bedId}-${cropId}` as PlantingId,
  bedId: bedId as BedId,
  cropId: cropId as CropId,
  cultivarId: null,
  role: 'target-crop',
  tier: 'herb-ground',
  sowDay: sowDay as DayOfYear,
  harvestStartDay: 220 as DayOfYear,
  harvestEndDay: 260 as DayOfYear,
  plantCount: 6,
})

const seedGarden = (): void => {
  const plot = plotFixture([
    bedFixture('bed-a', { plantings: [planting('bed-a', 'tomato')] }),
    bedFixture('bed-b', { plantings: [planting('bed-b', 'carrot')] }),
  ])
  useAppStore.setState({
    site: ready(siteFixture()),
    weather: ready(tmyFixture()),
    years: [measuredYearFixture({ year: 2018, meanC: 12, rainMmPerHour: 0 })],
    plot,
    bedLight: [bedLightFixture('bed-a', 0.1), bedLightFixture('bed-b', 0.1)],
    lightGeometry: lightGeometryKey(plot),
    catalog: ready(catalog),
    companionRules: ready(rules),
    folklore: rules.folklore,
    rotationConstraints: rotation,
    simulation: { ...useAppStore.getState().simulation, seed: 4 },
  })
}

beforeEach(() => {
  resetAppStore()
})

describe('what a season is waiting on', () => {
  it('names the first missing thing, in order', () => {
    const fresh = useAppStore.getState()
    expect(seasonBlocker(fresh)).toBe(SEASON_NEEDS_SITE)
    seedGarden()
    expect(seasonBlocker(useAppStore.getState())).toBeNull()
    useAppStore.setState({ bedLight: [] })
    expect(seasonBlocker(useAppStore.getState())).toBe(SEASON_NEEDS_LIGHT)
    useAppStore.setState({ plot: plotFixture([]) })
    expect(seasonBlocker(useAppStore.getState())).toBe(SEASON_NEEDS_BEDS)
  })

  it('refuses to run on light that belongs to a layout no longer on screen', () => {
    seedGarden()
    // a field exists, as `lightIsStale` requires, and the plot has moved out from under it
    useAppStore.setState({ raster: ready({} as never), lightGeometry: 'some-other-layout' })
    expect(seasonBlocker(useAppStore.getState())).toBe(SEASON_LIGHT_STALE)
  })
})

describe('trials and reports as the store keeps them', () => {
  const rule = 'carrots-love-tomatoes' as RuleId

  it('counts a season once however many beds ran the rule, and every bed-season', () => {
    const merged = mergeTrials(
      [],
      [
        { ruleId: rule, bedId: 'a' as BedId, realised: 0.8 as Fraction },
        { ruleId: rule, bedId: 'b' as BedId, realised: 0.6 as Fraction },
      ],
    )
    expect(merged).toEqual([{ ruleId: rule, seasons: 1, bedSeasons: 2, totalRealised: 1.4 }])
    const again = mergeTrials(merged, [
      { ruleId: rule, bedId: 'a' as BedId, realised: 1 as Fraction },
    ])
    expect(again[0]).toMatchObject({ seasons: 2, bedSeasons: 3, totalRealised: 2.4 })
  })

  it('keeps the reports bounded and the history whole', () => {
    const report = (season: number): SeasonReport => ({
      season,
      year: {
        year: null,
        label: 'a typical year',
        rainfallMm: 900,
        rainMeasured: false,
        referenceEtMm: 700,
        waterIndex: 0.2 as Fraction,
        waterLimited: false,
        gddBase10C: 1600,
        frostFreeDays: 155,
        lastSpringFreeze: 125 as DayOfYear,
        firstFallFreeze: 280 as DayOfYear,
        heatDaysAbove30C: 12,
      },
      outcomes: [],
      harvestIndex: null,
      energyKwh: null,
      energyShare: null,
      advice: { id: 'plant', text: 'plant', bedId: null },
    })
    let state: SimulationState = {
      seed: 1,
      season: 0,
      yearChoice: 'typical',
      history: [],
      reports: [],
      trials: [],
      revealed: [],
    }
    for (let season = 1; season <= SEASON_REPORTS_KEPT + 3; season += 1) {
      state = withSeason(
        state,
        season,
        report(season),
        [{ season, year: null, bedId: 'a' as BedId, cropId: 'carrot' as CropId, harvested: true }],
        [],
      )
    }
    expect(state.season).toBe(SEASON_REPORTS_KEPT + 3)
    expect(state.reports).toHaveLength(SEASON_REPORTS_KEPT)
    expect(state.reports[0]?.season).toBe(4)
    expect(state.history).toHaveLength(SEASON_REPORTS_KEPT + 3)
  })
})

describe('running a season from the store', () => {
  it('does nothing but say why on a store with no place', () => {
    useAppStore.getState().runSeason()
    const state = useAppStore.getState()
    expect(state.simulation.season).toBe(0)
    expect(state.simulationNotice).toBe(SEASON_NEEDS_SITE)
  })

  it('runs a season, remembers the ground, and refuses the family the next year', () => {
    seedGarden()
    useAppStore.getState().runSeason()
    let state = useAppStore.getState()
    expect(state.simulationNotice).toBeNull()
    expect(state.simulation.season).toBe(1)
    expect(state.simulation.reports).toHaveLength(1)
    expect(state.simulation.history.map((record) => record.cropId)).toEqual(['tomato', 'carrot'])
    // the measured years were turned into sites once and kept
    expect(state.seasonYears).toHaveLength(1)

    useAppStore.getState().runSeason()
    state = useAppStore.getState()
    expect(state.simulation.season).toBe(2)
    const latest = state.simulation.reports[1]
    const tomato = latest?.outcomes.find((outcome) => outcome.cropId === ('tomato' as CropId))
    expect(tomato?.kind).toBe('refused')
    expect(latest?.advice.id).toBe('refused')
  })

  it('runs the chosen year, and replays the same garden from the same seed', () => {
    seedGarden()
    useAppStore.getState().setYearChoice('driest')
    useAppStore.getState().runSeason()
    const first = useAppStore.getState().simulation.reports[0]
    expect(first?.year.year).toBe(2018)
    expect(first?.year.waterLimited).toBe(true)
    const seed = useAppStore.getState().simulation.seed
    useAppStore.getState().resetSimulation()
    expect(useAppStore.getState().simulation.season).toBe(0)
    expect(useAppStore.getState().simulation.seed).toBe(seed)
    expect(useAppStore.getState().simulation.yearChoice).toBe('driest')
    useAppStore.getState().runSeason()
    expect(useAppStore.getState().simulation.reports[0]?.harvestIndex).toBe(first?.harvestIndex)
  })

  it('forgets the worked-out years when the place changes', () => {
    seedGarden()
    useAppStore.getState().runSeason()
    expect(useAppStore.getState().seasonYears).not.toBeNull()
    useAppStore.setState({ site: idle(), weather: idle(), years: [], seasonYears: null })
    useAppStore.getState().runSeason()
    expect(useAppStore.getState().simulationNotice).toBe(SEASON_NEEDS_SITE)
  })

  it('moves the clock to the year that was run, and leaves the age slider alone', () => {
    seedGarden()
    useAppStore.setState({ plantYear: 3 })
    const before = useAppStore.getState().timeUtcMillis
    const dayBefore = new Date(before).getUTCDate()
    useAppStore.getState().setYearChoice('driest')
    useAppStore.getState().runSeason()
    let state = useAppStore.getState()
    expect(new Date(state.timeUtcMillis).getUTCFullYear()).toBe(2018)
    // the day and the hour are the grower's, and only the year moved
    expect(new Date(state.timeUtcMillis).getUTCDate()).toBe(dayBefore)
    // the shipped example is drawn at year 3, and a season must never make it younger: the
    // scene derives the drawn age from this and the season count (`gardenAge`), so it stays
    expect(state.plantYear).toBe(3)

    useAppStore.getState().resetSimulation()
    state = useAppStore.getState()
    expect(state.plantYear).toBe(3)
    expect(new Date(state.timeUtcMillis).getUTCFullYear()).toBe(
      new Date(state.todayUtcMillis).getUTCFullYear(),
    )
  })

  it('leaves the clock where it is for a year that is no year', () => {
    seedGarden()
    const before = useAppStore.getState().timeUtcMillis
    useAppStore.getState().runSeason()
    expect(useAppStore.getState().simulation.reports[0]?.year.year).toBeNull()
    expect(useAppStore.getState().timeUtcMillis).toBe(before)
  })

  it('reveals a rule once and never twice', () => {
    const rule = 'carrots-love-tomatoes' as RuleId
    useAppStore.getState().revealRule(rule)
    useAppStore.getState().revealRule(rule)
    expect(useAppStore.getState().simulation.revealed).toEqual([rule])
  })
})
