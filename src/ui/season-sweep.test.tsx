import { act, type ReactElement } from 'react'
import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
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
import { lightGeometryKey } from '../state/light-freshness'
import { ready } from '../state/slices'
import { resetAppStore, useAppStore } from '../state/store'
import { dayOfYearUtc } from '../state/sun'
import type { Planting } from '../types/garden'
import type { BedId, CropId, PlantingId } from '../types/ids'
import type { YearSummary } from '../types/simulation'
import type { DayOfYear, EpochMillis, Fraction } from '../types/units'
import { mount } from './testkit'
import {
  harvestEventLine,
  SWEEP_MS,
  SWEEP_STEP_MS,
  sweepEndDay,
  useSeasonSweep,
} from './useSeasonSweep'

const catalog = await loadCropCatalog()
const rules = partitionCompanionRules(await loadCompanionRules())
const rotation = await loadRotationConstraints()

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

const seedGarden = (): void => {
  const plot = plotFixture([bedFixture('bed-a', { plantings: [planting('bed-a', 'tomato')] })])
  useAppStore.setState({
    site: ready(siteFixture()),
    weather: ready(tmyFixture()),
    years: [measuredYearFixture({ year: 2018, meanC: 12, rainMmPerHour: 0 })],
    plot,
    bedLight: [bedLightFixture('bed-a', 0.1)],
    lightGeometry: lightGeometryKey(plot),
    catalog: ready(catalog),
    companionRules: ready(rules),
    folklore: rules.folklore,
    rotationConstraints: rotation,
    simulation: { ...useAppStore.getState().simulation, seed: 4 },
    // 23 July, the day the app opens on
    timeUtcMillis: Date.UTC(2026, 6, 23, 15) as EpochMillis,
  })
}

const summary = (last: number, first: number): YearSummary => ({
  year: 2018,
  label: '2018',
  rainfallMm: 800,
  rainMeasured: true,
  referenceEtMm: 700,
  waterIndex: 0.2 as Fraction,
  waterLimited: false,
  gddBase10C: 1600,
  frostFreeDays: first - last,
  lastSpringFreeze: last as DayOfYear,
  firstFallFreeze: first as DayOfYear,
  heatDaysAbove30C: 12,
})

/** The hook on a button, because the project's harness mounts components and nothing else */
const Host = (): ReactElement => {
  const { run, playing } = useSeasonSweep()
  return (
    <button type="button" data-testid="go" onClick={run}>
      {playing ? 'playing' : 'idle'}
    </button>
  )
}

const tick = (ms: number): void => {
  act(() => {
    vi.advanceTimersByTime(ms)
  })
}

beforeEach(() => {
  resetAppStore()
  /*
    Vitest needed `toFake: ['setInterval', 'clearInterval']` here, because faking React's own
    scheduling as well stalled `act`. Bun fakes every timer and `act` still flushes, so the
    narrowing is gone rather than translated
  */
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('where a season sweep ends', () => {
  it('ends on the day the grower had when the season was growing then', () => {
    expect(sweepEndDay(summary(120, 290), 205)).toBe(205)
  })

  it('ends mid-window when the grower was looking at winter', () => {
    expect(sweepEndDay(summary(120, 290), 20)).toBe(205)
  })
})

describe('the line to show when a crop is harvested mid-playback', () => {
  const watch = [
    { bedLabel: 'Bed 3', cropLabel: 'cucumber', harvestEndDay: 260 },
    { bedLabel: 'Bed 1', cropLabel: 'basil', harvestEndDay: 200 },
  ]

  it('names the bed and the crop the step the day reaches its last harvest day', () => {
    expect(harvestEventLine(260, 259, watch)).toBe('Bed 3: cucumber harvested')
  })

  it('says nothing short of that day, or once the day is already past it', () => {
    expect(harvestEventLine(259, 258, watch)).toBeNull()
    expect(harvestEventLine(261, 260, watch)).toBeNull()
  })

  it('says nothing when the clock did not move forward', () => {
    expect(harvestEventLine(260, 260, watch)).toBeNull()
    expect(harvestEventLine(200, 260, watch)).toBeNull()
  })

  it('names whichever watched planting is first in the list, where two windows end on the same step', () => {
    expect(harvestEventLine(260, 195, watch)).toBe('Bed 3: cucumber harvested')
  })

  it('says nothing when nothing is being watched', () => {
    expect(harvestEventLine(260, 259, [])).toBeNull()
  })
})

describe('pressing Run plays the season', () => {
  it('sweeps the clock from the last spring frost to the day the grower had, then lands', async () => {
    seedGarden()
    const today = dayOfYearUtc(useAppStore.getState().timeUtcMillis)
    const harness = await mount(<Host />)
    await harness.click('go')
    const state = useAppStore.getState()
    expect(state.simulation.season).toBe(1)
    expect(state.sweeping).toBe(true)
    expect(harness.get('go').textContent).toBe('playing')
    const report = state.simulation.reports[0]
    expect(dayOfYearUtc(state.timeUtcMillis)).toBe(report?.year.lastSpringFreeze)
    // and the grower's own hour is kept while the day moves
    expect(new Date(state.timeUtcMillis).getUTCHours()).toBe(15)

    tick(SWEEP_MS / 2)
    const midway = dayOfYearUtc(useAppStore.getState().timeUtcMillis)
    expect(midway).toBeGreaterThan(report?.year.lastSpringFreeze ?? 0)
    expect(midway).toBeLessThan(today)

    tick(SWEEP_MS + SWEEP_STEP_MS)
    expect(useAppStore.getState().sweeping).toBe(false)
    // back on the day the grower had, with the outcome now allowed to land
    expect(dayOfYearUtc(useAppStore.getState().timeUtcMillis)).toBe(today)
    expect(harness.get('go').textContent).toBe('idle')
    await harness.unmount()
  })

  it('does not sweep when nothing ran, or when the visitor asked for less motion', async () => {
    const harness = await mount(<Host />)
    await harness.click('go')
    expect(useAppStore.getState().simulation.season).toBe(0)
    expect(useAppStore.getState().sweeping).toBe(false)

    seedGarden()
    const before = useAppStore.getState().timeUtcMillis
    vi.stubGlobal('matchMedia', () => ({ matches: true }))
    await harness.click('go')
    expect(useAppStore.getState().simulation.season).toBe(1)
    expect(useAppStore.getState().sweeping).toBe(false)
    // the year moved with the season, and nothing else did
    expect(dayOfYearUtc(useAppStore.getState().timeUtcMillis)).toBe(dayOfYearUtc(before))
    await harness.unmount()
  })

  it('stops playing when the panel goes away', async () => {
    seedGarden()
    const harness = await mount(<Host />)
    await harness.click('go')
    expect(useAppStore.getState().sweeping).toBe(true)
    await harness.unmount()
    expect(useAppStore.getState().sweeping).toBe(false)
  })
})
