import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test'
import { vi } from '../../test/vi'
import {
  loadCompanionRules,
  loadRotationConstraints,
  partitionCompanionRules,
} from '../data/companions'
import { loadCropCatalog } from '../data/crops'
import { RETAIL_PRICE_CAVEAT } from '../data/retail-price'
import {
  bedFixture,
  bedLightFixture,
  plotFixture,
  siteFixture,
  tmyFixture,
} from '../recommend/testkit'
import { measuredYearFixture } from '../data/testkit'
import { TRIALS_TO_REVEAL } from '../simulation/evidence'
import { lerWords, SEASONS_TO_STAND, standingOf } from '../simulation/score'
import { measuredSeasonYear, typicalYear } from '../simulation/year'
import { makeArray } from '../state/defaults'
import { lightGeometryKey } from '../state/light-freshness'
import { SEASON_NEEDS_SITE } from '../state/simulation'
import { ready } from '../state/slices'
import { resetAppStore, useAppStore } from '../state/store'
import type { Banded } from '../types/band'
import { citedVerbatim } from '../types/cited'
import type { RetailPrice } from '../types/economy'
import type { Bed, Planting } from '../types/garden'
import type { BedId, CropId, PlantingId, RuleId } from '../types/ids'
import type { PvArray } from '../types/pv'
import type { DayOfYear, Fraction } from '../types/units'
import { SimulationPanel } from './SimulationPanel'
import { mount } from './testkit'

/**
 * The worker client is stubbed for "Compare with no panels" alone: what belongs to this file is
 * whether the press appears, runs and reports, not the bake itself, which belongs to whoever
 * owns `src/sim`. The same stub `onboarding.test.ts` uses for the same reason
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

const defaultBeds = (): readonly Bed[] => [
  bedFixture('bed-a', { plantings: [planting('bed-a', 'tomato'), planting('bed-a', 'carrot')] }),
  bedFixture('bed-b', { plantings: [planting('bed-b', 'basil')] }),
]

const seedGarden = (
  beds: readonly Bed[] = defaultBeds(),
  arrays: readonly PvArray[] = [],
): void => {
  const plot = { ...plotFixture([...beds]), arrays }
  useAppStore.setState({
    site: ready(siteFixture()),
    weather: ready(tmyFixture()),
    years: [],
    plot,
    bedLight: plot.beds.map((bed) => bedLightFixture(bed.id as string, 0.1)),
    lightGeometry: lightGeometryKey(plot),
    catalog: ready(catalog),
    companionRules: ready(rules),
    folklore: rules.folklore,
    rotationConstraints: rotation,
    simulation: { ...useAppStore.getState().simulation, seed: 4 },
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
  // the season plays through on a timer after a press; that has its own test, and these read the
  // report the press produced, which lands at once under reduced motion
  vi.stubGlobal('matchMedia', () => ({ matches: true }))
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('simulation panel', () => {
  it('waits for a place, says so, and offers the press that settles it', async () => {
    const harness = await mount(<SimulationPanel />)
    expect(harness.find('panel-seasons')).not.toBeNull()
    expect(harness.get('status-seasons').textContent).toContain(SEASON_NEEDS_SITE)
    // the remedy is the site step's own, not a second button with a second label
    expect(harness.get('status-seasons-run').textContent).toBe('Look up this place')
    expect((harness.get('control-seasons-run') as HTMLButtonElement).disabled).toBe(true)
    expect(harness.find('readout-seasons-advice')).toBeNull()
    await harness.unmount()
  })

  it('says what the mode is for until a season has been run, and what years there are', async () => {
    seedGarden()
    useAppStore.setState({
      years: [2019, 2020, 2021].map((year) => ({ year, weather: tmyFixture() })),
    })
    const harness = await mount(<SimulationPanel />)
    expect(harness.get('readout-seasons-how').textContent).toMatch(/press Run/)
    expect(harness.get('status-seasons-record').textContent).toMatch(/3 measured years/)
    expect(harness.get('status-seasons-record').textContent).toMatch(/2019 to 2021/)
    await harness.click('control-seasons-run')
    expect(harness.find('readout-seasons-how')).toBeNull()
    await harness.unmount()
  })

  it('names the year each card would run, and says when two cards are the same year', async () => {
    seedGarden()
    const site = siteFixture()
    const measured = [
      measuredYearFixture({ year: 2018, meanC: 12, rainMmPerHour: 0 }),
      measuredYearFixture({ year: 2019, meanC: 9, rainMmPerHour: 0.2 }),
    ]
    useAppStore.setState({
      years: measured,
      seasonYears: measured.map((year) => measuredSeasonYear(site, year)),
    })
    const harness = await mount(<SimulationPanel />)
    const cards = harness.get('control-seasons-year').textContent ?? ''
    // both units, the way every size in this app prints metres and feet
    expect(cards).toMatch(/2018: \d+ days above 30 °C \(86 °F\), \d+ mm \([\d.]+ in\) of rain/)
    expect(cards).toMatch(/A composite of every year on record/)
    // the driest of two years with no rain in one of them is also the hottest of them here
    expect(cards).toMatch(/Also /)
    await harness.unmount()
  })

  it('says when even the thirstiest year is not dry enough for shade to help, and when it is', async () => {
    seedGarden()
    const site = siteFixture()
    // a wet record: the fixture site's own water index is a fifth, well under the foot of the
    // shade-benefit ramp, so the card must not promise a thirst that never arrives
    const wet = [measuredYearFixture({ year: 2019, meanC: 9, rainMmPerHour: 0.2 })]
    useAppStore.setState({
      years: wet,
      seasonYears: wet.map((year) => measuredSeasonYear(site, year)),
    })
    const soaked = await mount(<SimulationPanel />)
    expect(soaked.get('control-seasons-year').textContent).toMatch(
      /Even this year wasn't dry enough for shade to raise yield\. Rain left about \d+% of the season's evaporative demand unmet; shade raises yield only past 35%/,
    )
    await soaked.click('control-seasons-run')
    expect(soaked.get('readout-seasons-year').textContent).toMatch(
      /This year wasn't dry enough for shade to raise yield/,
    )
    await soaked.unmount()

    resetAppStore()
    seedGarden()
    const dry = [measuredYearFixture({ year: 2018, meanC: 12, rainMmPerHour: 0 })]
    useAppStore.setState({
      years: dry,
      seasonYears: dry.map((year) => measuredSeasonYear(site, year)),
    })
    const thirsty = await mount(<SimulationPanel />)
    expect(thirsty.get('control-seasons-year').textContent).toMatch(
      /Dry enough here for panel shade to raise yield/,
    )
    await thirsty.click('control-seasons-year-driest')
    await thirsty.click('control-seasons-run')
    expect(thirsty.get('readout-seasons-year').textContent).toMatch(
      /Dry enough here for panel shade to raise yield/,
    )
    await thirsty.unmount()
  })

  it('counts the harvest over every planting planned, and says so behind the Why?', async () => {
    seedGarden()
    const harness = await mount(<SimulationPanel />)
    await harness.click('control-seasons-run')
    expect(harness.get('readout-seasons-harvest').textContent).toMatch(
      /^about \d+% across the 3 plantings you planned/,
    )
    // the mean of the draws is said to the nearest five, and the exact figure rides on the readout
    expect(
      harness.get('readout-seasons-harvest').querySelector<HTMLElement>('[data-harvest-index]')
        ?.dataset.harvestIndex,
    ).toMatch(/^0\.\d+$/)
    expect(harness.get('readout-seasons-why-harvest').textContent).toMatch(
      /A planting that grew nothing counts as zero/,
    )
    await harness.unmount()
  })

  it('counts what came in, what died and what the ground refused, and keeps the science behind Why?', async () => {
    seedGarden()
    const harness = await mount(<SimulationPanel />)
    await harness.click('control-seasons-run')
    expect(harness.get('readout-seasons-harvested').textContent).toMatch(/^\d+$/)
    expect(harness.get('readout-seasons-lost').textContent).toMatch(/^\d+$/)
    expect(harness.get('readout-seasons-refused').textContent).toMatch(/^\d+$/)
    expect(harness.get('readout-seasons-slots').textContent).toBe('● ○ ○ ○ ○')
    const why = [...harness.get('list-seasons-outcomes').querySelectorAll('details')]
    expect(why.length).toBe(3)
    // the harvest is said to the nearest five with its published range beside it, on the row
    // itself; the interval kind and its source stay behind the Why?
    const rows = harness.all('item-seasons-outcome-harvested')
    // the range is said to be before pests, because the draw is cut by them afterwards and a
    // harvest can sit below the range it is read beside
    expect(
      rows.some((row) =>
        /harvested, about \d+% of full yield\. The published range at this shade, before pests, is \d+-\d+%\./.test(
          row.textContent ?? '',
        ),
      ),
    ).toBe(true)
    expect(rows.some((row) => /harvested, \d+% of full yield/.test(row.textContent ?? ''))).toBe(
      false,
    )
    // the attribution follows the band's own terms rather than a fixed name
    expect(
      why.some((node) =>
        /That range is a 95% confidence interval dominated by (crop response \(Laub et al\. 2022\)|seasonal cumulative PAR \(\+\/-10%\)|crowding at this spacing: this app's own figure)\./.test(
          node.textContent ?? '',
        ),
      ),
    ).toBe(true)
    await harness.click('control-seasons-run')
    expect(harness.get('readout-seasons-harvest').textContent).toMatch(
      /\((up|down) from about \d+%\)|about the same as last season/,
    )
    await harness.unmount()
  })

  it('keeps every season on screen once there is more than one to compare', async () => {
    seedGarden()
    const harness = await mount(<SimulationPanel />)
    await harness.click('control-seasons-run')
    expect(harness.find('list-seasons-record')).toBeNull()
    await harness.click('control-seasons-run')
    expect(harness.get('list-seasons-record').childElementCount).toBe(2)
    expect(harness.get('item-seasons-record-1').textContent).toMatch(/Season 1/)
    expect(harness.get('item-seasons-record-2').textContent).toMatch(/of full yield|nothing in/)
    await harness.unmount()
  })

  it('puts the bed the advice names under the editor, and offers nothing when it names none', async () => {
    seedGarden()
    // a season that goes well ends on a status line, which is about the garden and not a bed
    const clear = await mount(<SimulationPanel />)
    await clear.click('control-seasons-run')
    expect(useAppStore.getState().simulation.reports[0]?.advice.bedId).toBeNull()
    expect(clear.find('control-seasons-show-bed')).toBeNull()
    await clear.unmount()

    // under deep shade it names the bed that went dark, and that bed is one press away
    resetAppStore()
    seedGarden()
    useAppStore.setState({
      bedLight: [bedLightFixture('bed-a', 0.95), bedLightFixture('bed-b', 0.95)],
    })
    const harness = await mount(<SimulationPanel />)
    await harness.click('control-seasons-run')
    const named = useAppStore.getState().simulation.reports[0]?.advice.bedId ?? null
    expect(named).not.toBeNull()
    await harness.click('control-seasons-show-bed')
    expect(useAppStore.getState().selectedBedId).toBe(named)
    // and lands on the step that owns the fix: shade is the panels' to open
    expect(useAppStore.getState().sidebarStep).toBe('panels')
    await harness.unmount()
  })

  it('runs a season and reports every planting, the year, and what to do next', async () => {
    seedGarden()
    const harness = await mount(<SimulationPanel />)
    expect(harness.find('status-seasons')).toBeNull()
    expect(harness.get('status-seasons-record').textContent).toMatch(/no measured years/)
    await harness.click('control-seasons-run')
    expect(harness.get('readout-seasons-advice').textContent?.length ?? 0).toBeGreaterThan(10)
    expect(harness.get('readout-seasons-year').textContent).toMatch(/Frost-free from/)
    expect(harness.get('readout-seasons-harvest').textContent).toMatch(/%/)
    expect(harness.get('readout-seasons-energy').textContent).toBe('no panels')
    expect(harness.get('list-seasons-outcomes').childElementCount).toBe(3)
    expect(harness.all('item-seasons-outcome-harvested').length).toBeGreaterThan(0)
    expect(harness.get('control-seasons-run').textContent).toBe('Run season 2')
    expect(harness.get('readout-seasons-standing').textContent).toMatch(/1 of 5 seasons/)
    expect(harness.get('readout-seasons-standing').textContent).toMatch(
      /After 5 the app says whether beds and panels together beat either one alone/,
    )
    expect(harness.get('readout-seasons-progress').textContent).toBe('Season 1 of 5')
    expect(harness.find('readout-seasons-ler')).toBeNull()
    await harness.unmount()
  })

  it('adds up the land equivalent ratio once five seasons have run, and glosses it in the real figure', async () => {
    seedGarden(defaultBeds(), [makeArray(1)])
    const harness = await mount(<SimulationPanel />)
    for (let season = 0; season < SEASONS_TO_STAND; season += 1) {
      await harness.click('control-seasons-run')
    }
    expect(harness.get('readout-seasons-progress').textContent).toBe('Season 5 of 5')
    const standing = standingOf(useAppStore.getState().simulation.reports)
    expect(standing.ler).not.toBeNull()
    // a range to one decimal
    const figure = lerWords(standing.ler as Banded<number>)
    expect(figure).toMatch(/^\d+\.\d to \d+\.\d$/)
    expect(harness.get('readout-seasons-ler').textContent).toBe(figure)
    const note = harness.get('readout-seasons-ler').parentElement?.parentElement?.nextElementSibling
    expect(note?.textContent).toBe(
      `The beds and panels together give what ${figure} times this land would give as a separate farm beside a separate garden; above 1 they share the ground well (Dupraz et al. 2011). The range is a 95% confidence interval dominated by crop response (Laub et al. 2022).`,
    )
    expect(harness.get('panel-seasons').textContent).not.toMatch(/ratio \d\.\d\d/)
    await harness.unmount()
  })

  it('keeps the light colours off the seasons step until the grower asks for them', async () => {
    seedGarden()
    const harness = await mount(<SimulationPanel />)
    expect((harness.get('control-seasons-show-light') as HTMLInputElement).checked).toBe(false)
    expect(useAppStore.getState().overlayOnSeasons).toBe(false)
    await harness.click('control-seasons-show-light')
    expect(useAppStore.getState().overlayOnSeasons).toBe(true)
    await harness.unmount()
  })

  it('lists the untested claim the bed is trying, and holds the literature back until it is time', async () => {
    seedGarden()
    const harness = await mount(<SimulationPanel />)
    await harness.click('control-seasons-run')
    const trial = harness.get('item-seasons-trial-carrots-love-tomatoes')
    expect(trial.textContent).toMatch(/draws the outcome from its own rules/)
    expect(harness.find('control-seasons-reveal-carrots-love-tomatoes')).toBeNull()
    expect(harness.find('readout-seasons-trial-wait-carrots-love-tomatoes')).not.toBeNull()
    await harness.unmount()
  })

  it('sets a trial beside the beds that did not run it, and says when none were left out', async () => {
    // one bed of tomato and carrot: the tomato runs "carrots love tomatoes" and the carrot does
    // not, so that trial has a comparison; both of them run the moon rule, so that one has none
    seedGarden([
      bedFixture('bed-a', {
        plantings: [planting('bed-a', 'tomato'), planting('bed-a', 'carrot')],
      }),
    ])
    const harness = await mount(<SimulationPanel />)
    await harness.click('control-seasons-run')
    expect(harness.get('readout-seasons-control-carrots-love-tomatoes').textContent).toMatch(
      /^Beds without it averaged about \d+% of full yield\.$/,
    )
    expect(harness.get('readout-seasons-control-moon-phase-planting').textContent).toBe(
      'Every bed ran it, so there is nothing to compare it with. A trial needs beds without it.',
    )
    // the fairness of comparing inside one garden, and its limit, stays behind the Why?
    expect(harness.get('readout-seasons-why-control-moon-phase-planting').textContent).toMatch(
      /same weather.*lead to check/s,
    )
    await harness.unmount()
  })

  it('offers the literature after enough seasons, and shows it once asked', async () => {
    seedGarden()
    const rule = 'carrots-love-tomatoes' as RuleId
    useAppStore.setState({
      simulation: {
        ...useAppStore.getState().simulation,
        trials: [{ ruleId: rule, seasons: TRIALS_TO_REVEAL, bedSeasons: 4, totalRealised: 3.1 }],
      },
    })
    const harness = await mount(<SimulationPanel />)
    expect(harness.find('readout-seasons-revealed-carrots-love-tomatoes')).toBeNull()
    await harness.click('control-seasons-reveal-carrots-love-tomatoes')
    expect(harness.get('readout-seasons-revealed-carrots-love-tomatoes').textContent).toMatch(
      /Published evidence/,
    )
    expect(useAppStore.getState().simulation.revealed).toEqual([rule])
    await harness.unmount()
  })

  it('lets the year be chosen and the seasons be started over', async () => {
    seedGarden()
    const harness = await mount(<SimulationPanel />)
    await harness.click('control-seasons-year-hottest')
    expect(useAppStore.getState().simulation.yearChoice).toBe('hottest')
    await harness.click('control-seasons-run')
    expect(useAppStore.getState().simulation.season).toBe(1)
    await harness.click('control-seasons-reset')
    expect(useAppStore.getState().simulation.season).toBe(0)
    expect(harness.find('readout-seasons-advice')).toBeNull()
    await harness.unmount()
  })
})

describe('comparing the same year with no panels', () => {
  it('offers no press for a garden with no panels', async () => {
    seedGarden()
    const harness = await mount(<SimulationPanel />)
    await harness.click('control-seasons-run')
    expect(harness.find('action-seasons-no-panels')).toBeNull()
    expect(harness.find('readout-seasons-no-panels')).toBeNull()
    await harness.unmount()
  })

  it('bakes the same year with no panels and reports the difference in plain words', async () => {
    seedGarden(defaultBeds(), [makeArray(1)])
    worker.run.mockResolvedValue({
      raster: {} as never,
      bedLight: [bedLightFixture('bed-a', 0), bedLightFixture('bed-b', 0)],
      elapsedMs: 1,
      physics: 'reference-ts' as never,
    })
    const harness = await mount(<SimulationPanel />)
    await harness.click('control-seasons-run')
    expect(harness.get('action-seasons-no-panels').textContent).toBe('Compare with no panels')

    await harness.click('action-seasons-no-panels')
    expect(harness.get('readout-seasons-no-panels').textContent).toMatch(
      /^The same year with no panels: about \d+% of full yield across the same plantings\.$/,
    )
    expect(worker.run).toHaveBeenCalledTimes(1)
    const bakedPlot = worker.run.mock.calls[0]?.[1] as { arrays: readonly unknown[] }
    expect(bakedPlot.arrays).toEqual([])
    await harness.unmount()
  })

  it('says what it assumed, under the figure', async () => {
    seedGarden(defaultBeds(), [makeArray(1)])
    worker.run.mockResolvedValue({
      raster: {} as never,
      bedLight: [bedLightFixture('bed-a', 0), bedLightFixture('bed-b', 0)],
      elapsedMs: 1,
      physics: 'reference-ts' as never,
    })
    const harness = await mount(<SimulationPanel />)
    await harness.click('control-seasons-run')
    await harness.click('action-seasons-no-panels')
    const note = harness.get('readout-seasons-no-panels').nextElementSibling
    expect(note?.textContent).toMatch(/every panel row removed/)
    expect(note?.textContent).toMatch(/the only thing that changed is the shade/i)
    await harness.unmount()
  })

  /**
   * The whole-garden figure answers a grower; a researcher's question is per crop, because the
   * panels help some crops and cost others and one average hides which
   */
  it('puts each planting beside the same planting with no panels', async () => {
    seedGarden(defaultBeds(), [makeArray(1)])
    worker.run.mockResolvedValue({
      raster: {} as never,
      bedLight: [bedLightFixture('bed-a', 0), bedLightFixture('bed-b', 0)],
      elapsedMs: 1,
      physics: 'reference-ts' as never,
    })
    const harness = await mount(<SimulationPanel />)
    await harness.click('control-seasons-run')
    // nothing per crop before the comparison has run
    const outcomes = [...harness.get('list-seasons-outcomes').querySelectorAll('li')]
    expect(outcomes.length).toBeGreaterThan(0)
    expect(
      outcomes.some((row) => (row.textContent ?? '').includes('Without panels this year')),
    ).toBe(false)

    await harness.click('action-seasons-no-panels')
    const compared = [...harness.get('list-seasons-outcomes').querySelectorAll('li')].filter(
      (row) => (row.textContent ?? '').includes('Without panels this year'),
    )
    expect(compared.length).toBeGreaterThan(0)
    const said = compared[0]?.textContent ?? ''
    expect(said).toMatch(/Without panels this year: /)
    // one point is "1 point": a line reading "1 points more" would be the first thing a reader sees
    expect(said).not.toMatch(/\b1 points\b/)
    await harness.unmount()
  })

  it('shows a working state while the bake runs', async () => {
    seedGarden(defaultBeds(), [makeArray(1)])
    // never resolves: this test reads only the state while the bake is in flight, and an
    // unsettled promise schedules no continuation for the harness to race against on unmount
    worker.run.mockImplementation(() => new Promise(() => {}))
    const harness = await mount(<SimulationPanel />)
    await harness.click('control-seasons-run')
    await harness.click('action-seasons-no-panels')
    expect((harness.get('action-seasons-no-panels') as HTMLButtonElement).disabled).toBe(true)
    expect(harness.get('action-seasons-no-panels').textContent).not.toBe('Compare with no panels')
    expect(harness.find('readout-seasons-no-panels')).toBeNull()
    await harness.unmount()
  })
})

/**
 * Cost, payback and work, below the standing and inside no score. A nasturtium beside a cabbage
 * is the cheapest garden that makes the rules ask for work, which is the labour half of the block
 */
const managedBeds = (): readonly Bed[] => [
  bedFixture('bed-a', {
    plantings: [planting('bed-a', 'cabbage'), planting('bed-a', 'nasturtium')],
  }),
]

const MA_PRICE: RetailPrice = {
  usdPerKwh: citedVerbatim(0.3048, 'B', ['eia-electric-power-monthly-5-6-a'], RETAIL_PRICE_CAVEAT),
  stateCode: 'MA',
  year: 2025,
  sourceLabel: 'test',
}

describe('what the season costs', () => {
  it('costs the panels, values the year, pays them back and lists the tasks', async () => {
    seedGarden(managedBeds(), [makeArray(1)])
    useAppStore.setState({ retailPrice: MA_PRICE })
    const harness = await mount(<SimulationPanel />)
    await harness.click('control-seasons-run')

    expect(harness.get('readout-seasons-cost').textContent).toMatch(/^about \$[\d,]+ to \$[\d,]+$/)
    expect(harness.get('readout-seasons-electricity-value').textContent).toMatch(
      /^about \$[\d,]+ at the EIA state average for MA$/,
    )
    expect(
      harness.get('readout-seasons-electricity-value').querySelector<HTMLElement>('[data-source]')
        ?.dataset.source,
    ).toBe('eia')
    expect(harness.get('readout-seasons-payback').textContent).toMatch(/^about \d+ to \d+ years$/)
    expect(harness.find('status-seasons-payback')).toBeNull()
    // the fields for a tariff and a cost sit beside the readouts, with their help sentence
    expect(harness.get('readout-economy-help').textContent).toMatch(
      /type what your utility charges/,
    )
    expect(harness.find('control-economy-price')).not.toBeNull()
    expect(harness.find('control-economy-currency')).not.toBeNull()
    expect(harness.find('control-economy-cost')).not.toBeNull()
    expect(harness.get('readout-seasons-tasks').textContent).toMatch(
      /^Management tasks the plantings you chose require:\w/,
    )
    // the estimate is labelled an estimate on the face of the panel, not only behind the Why?
    expect(harness.get('readout-seasons-cost-note').textContent).toMatch(
      /An estimate from NREL's 2020 benchmark/,
    )
    expect(harness.get('readout-seasons-cost-note').textContent).not.toMatch(
      /No electricity price is known/,
    )
    // and the two sources, their caveats and the unpriced labour are behind it
    const why = harness.get('readout-seasons-why-cost').textContent ?? ''
    expect(why).toMatch(/Horowitz et al. 2020/)
    expect(why).toMatch(/2020 US dollars/)
    expect(why).toMatch(/500 kW/)
    expect(why).toMatch(/size curve/)
    expect(why).toMatch(/Energy Information Administration/)
    expect(why).toMatch(/An exported kilowatt-hour earns less/)
    expect(why).toMatch(/no discount rate/)
    expect(why).toMatch(/listed without a price/)
    await harness.unmount()
  })

  /** A typed tariff outranks the state average and names the grower as its source */
  it('values the year at a typed tariff, and says payback needs a cost in that currency', async () => {
    seedGarden(managedBeds(), [makeArray(1)])
    useAppStore.setState({
      retailPrice: MA_PRICE,
      economyInputs: { perKwh: 0.4, currency: 'EUR', installedCost: null },
    })
    const harness = await mount(<SimulationPanel />)
    await harness.click('control-seasons-run')

    // beside a tariff in another currency the benchmark says which dollar it is in
    expect(harness.get('readout-seasons-cost').textContent).toMatch(
      /^about US\$[\d,]+ to US\$[\d,]+$/,
    )
    expect(harness.get('readout-seasons-electricity-value').textContent).toMatch(
      /^about €[\d,]+ at your tariff$/,
    )
    expect(
      harness.get('readout-seasons-electricity-value').querySelector<HTMLElement>('[data-source]')
        ?.dataset.source,
    ).toBe('user')
    expect(harness.find('readout-seasons-payback')).toBeNull()
    expect(harness.get('status-seasons-payback').textContent).toBe(
      " Payback needs the panels' cost typed in EUR, since the benchmark on file is in US dollars.",
    )
    expect(harness.get('readout-seasons-why-cost').textContent).toMatch(
      /Electricity price: your tariff, 0\.4 EUR per kWh as typed/,
    )
    await harness.unmount()
  })

  it('pays a typed cost back at a typed tariff, as a point, and drops the benchmark sentence', async () => {
    seedGarden(managedBeds(), [makeArray(1)])
    useAppStore.setState({
      economyInputs: { perKwh: 0.4, currency: 'EUR', installedCost: 8000 },
    })
    const harness = await mount(<SimulationPanel />)
    await harness.click('control-seasons-run')

    expect(harness.get('readout-seasons-cost').textContent).toBe('€8,000, the cost you typed')
    expect(harness.get('readout-seasons-payback').textContent).toMatch(
      /^about \d+ years? at the cost you typed$/,
    )
    expect(harness.find('status-seasons-payback')).toBeNull()
    expect(harness.get('readout-seasons-cost-note').textContent).toMatch(
      /^The build cost is the figure you typed\./,
    )
    expect(harness.get('readout-seasons-cost-note').textContent).not.toMatch(/NREL/)
    expect(harness.get('readout-seasons-why-cost').textContent).toMatch(
      /Build cost: the figure you typed, €8,000/,
    )
    await harness.unmount()
  })

  /** A rounding that would have said "about 0 years" says under a year */
  it('says a payback that rounds below one year is under a year', async () => {
    seedGarden(managedBeds(), [makeArray(1)])
    useAppStore.setState({
      economyInputs: { perKwh: 400, currency: 'AUD', installedCost: 100 },
    })
    const harness = await mount(<SimulationPanel />)
    await harness.click('control-seasons-run')

    expect(harness.get('readout-seasons-payback').textContent).toBe(
      'under a year at the cost you typed',
    )
    await harness.unmount()
  })

  /** A harvest window that ran past the first fall frost says so on the row, with the date */
  it('says a harvest the fall frost cut short was cut short, with the date', async () => {
    seedGarden()
    const state = useAppStore.getState()
    const report = {
      season: 1,
      year: typicalYear(siteFixture(), tmyFixture()).summary,
      outcomes: [
        {
          bedId: 'bed-a' as BedId,
          plantingId: 'bed-a-tomato' as PlantingId,
          cropId: 'tomato' as CropId,
          kind: 'harvested' as const,
          band: null,
          realised: 0.62 as Fraction,
          pestPressure: 0 as Fraction,
          droughtPenalty: 0 as Fraction,
          companions: [],
          tried: [],
          explanation: 'a harvest',
          frostCutDay: 297 as DayOfYear,
        },
      ],
      harvestIndex: 0.62 as Fraction,
      energyKwh: null,
      energyShare: null,
      advice: { id: 'status', text: '', bedId: null },
    }
    useAppStore.setState({ simulation: { ...state.simulation, season: 1, reports: [report] } })
    const harness = await mount(<SimulationPanel />)
    expect(harness.get('item-seasons-outcome-harvested').textContent).toMatch(
      /harvested, about 60% of full yield, cut short by frost on 24 Oct\./,
    )
    await harness.unmount()
  })

  it('costs the panels and says why it cannot say what they earned, with no price', async () => {
    seedGarden(managedBeds(), [makeArray(1)])
    const harness = await mount(<SimulationPanel />)
    await harness.click('control-seasons-run')

    expect(harness.get('readout-seasons-cost').textContent).toMatch(/^about \$/)
    expect(harness.get('readout-seasons-tasks').textContent).toMatch(/Management tasks/)
    expect(harness.find('readout-seasons-electricity-value')).toBeNull()
    expect(harness.find('readout-seasons-payback')).toBeNull()
    expect(harness.get('readout-seasons-cost-note').textContent).toMatch(
      /No electricity price is known for this location/,
    )
    await harness.unmount()
  })

  it('has tasks and no money at all for a garden with no panels', async () => {
    seedGarden(managedBeds())
    useAppStore.setState({ retailPrice: MA_PRICE })
    const harness = await mount(<SimulationPanel />)
    await harness.click('control-seasons-run')

    expect(harness.get('readout-seasons-tasks').textContent).toMatch(/Management tasks/)
    expect(harness.find('readout-seasons-cost')).toBeNull()
    expect(harness.find('readout-seasons-electricity-value')).toBeNull()
    expect(harness.find('readout-seasons-payback')).toBeNull()
    await harness.unmount()
  })

  /** Nothing to cost and nothing to do is no block, rather than a heading over a disclaimer */
  it('says nothing at all about money for a garden with no panels and no tasks', async () => {
    seedGarden()
    const harness = await mount(<SimulationPanel />)
    await harness.click('control-seasons-run')
    expect(harness.find('readout-seasons-tasks')).toBeNull()
    expect(harness.find('readout-seasons-cost-note')).toBeNull()
    await harness.unmount()
  })
})
