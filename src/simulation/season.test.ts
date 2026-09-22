import { describe, expect, it } from 'bun:test'
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
import { derivedArrayMetrics } from '../sim/geometry'
import type { GardenPlot, Planting } from '../types/garden'
import { arrayId, type BedId, type CropId, type PlantingId, type RuleId } from '../types/ids'
import { DEFAULT_ECONOMY_INPUTS } from '../data/economy'
import { citedVerbatim } from '../types/cited'
import type { RetailPrice } from '../types/economy'
import type { PvArray } from '../types/pv'
import type { SeasonRecord } from '../types/simulation'
import type { Degrees, Fraction, Meters, WattsPeak } from '../types/units'
import { type SeasonInput, simulateSeason } from './season'
import { measuredSeasonYear, typicalYear } from './year'

const catalog = await loadCropCatalog()
const rules = partitionCompanionRules(await loadCompanionRules())
const rotation = await loadRotationConstraints()
const site = siteFixture()
const typical = typicalYear(site, tmyFixture())

const planting = (
  bedId: string,
  cropId: string,
  sowDay = 140,
  harvestStartDay = 220,
  harvestEndDay = 260,
): Planting => ({
  id: `${bedId}-${cropId}-${String(sowDay)}` as PlantingId,
  bedId: bedId as BedId,
  cropId: cropId as CropId,
  cultivarId: null,
  role: 'target-crop',
  tier: 'herb-ground',
  sowDay: sowDay as never,
  harvestStartDay: harvestStartDay as never,
  harvestEndDay: harvestEndDay as never,
  plantCount: 6,
})

const run = (plot: GardenPlot, overrides: Partial<SeasonInput> = {}) =>
  simulateSeason({
    site,
    year: typical,
    plot,
    bedLight: plot.beds.map((bed) => bedLightFixture(bed.id as string, 0.1)),
    catalog,
    rules,
    rotation,
    history: [],
    season: 1,
    seed: 4,
    frostPercentile: 20,
    retailPrice: null,
    economyInputs: DEFAULT_ECONOMY_INPUTS,
    ...overrides,
  })

const only = (plot: GardenPlot, overrides: Partial<SeasonInput> = {}) => {
  const result = run(plot, overrides)
  const outcome = result.report.outcomes[0]
  if (outcome === undefined) throw new Error('no outcome')
  return { result, outcome }
}

const arrayFixture = (): PvArray => {
  const shape = {
    id: arrayId('test-array'),
    label: 'one row',
    geometry: {
      collectorWidthM: 2.4 as Meters,
      pitchM: 6.5 as Meters,
      rowLengthM: 6 as Meters,
      rowCount: 1,
      modulesPerRow: 3,
      clearanceHeightM: 2.8 as Meters,
      rowAzimuthDeg: 90 as Degrees,
      originM: { xM: 0 as Meters, yM: 0 as Meters },
    },
    tracker: { mode: 'fixed' as const, tiltDeg: 30 as Degrees, surfaceAzimuthDeg: 180 as Degrees },
    module: {
      widthM: 1.13 as Meters,
      heightM: 1.72 as Meters,
      nameplateWp: 430 as WattsPeak,
      bifacialityFactor: 0.7 as Fraction,
      transmittanceFraction: 0 as Fraction,
      rearReflectance: 0.05 as Fraction,
      backsheet: 'glass-glass' as const,
    },
  }
  return { ...shape, derived: derivedArrayMetrics(shape as PvArray) } as PvArray
}

describe('one season of the garden, as a value', () => {
  it('harvests a tomato in a typical year, inside the literature band, and says why', () => {
    const { result, outcome } = only(
      plotFixture([bedFixture('a', { plantings: [planting('a', 'tomato')] })]),
    )
    expect(outcome.kind).toBe('harvested')
    expect(outcome.band).not.toBeNull()
    const band = outcome.band as NonNullable<typeof outcome.band>
    // a lone bed on bare ground is fully exposed, so the pests take their declared share
    expect(outcome.pestPressure).toBe(1)
    expect(outcome.realized).toBeLessThanOrEqual(band.interval.upper)
    expect(outcome.realized).toBeGreaterThan(band.interval.lower * 0.5)
    expect(outcome.explanation).toMatch(/% of full yield/)
    expect(outcome.explanation).toMatch(/Pests took/)
    expect(result.report.harvestIndex).toBeCloseTo(outcome.realized, 6)
    expect(result.report.energyKwh).toBeNull()
    expect(result.report.advice.id).toBe('pests')
    expect(result.report.advice.bedId).toBe('a')
  })

  it('replays exactly for one seed and differs for another', () => {
    const plot = plotFixture([bedFixture('a', { plantings: [planting('a', 'tomato')] })])
    const first = only(plot).outcome.realized
    expect(only(plot).outcome.realized).toBe(first)
    expect(only(plot, { seed: 5 }).outcome.realized).not.toBe(first)
  })

  it('kills a tender crop set out before this year last spring frost', () => {
    // solanaceae are raised under cover for 42 days, so a day 60 sowing goes out on day 102,
    // before the fixture's day 125 last frost at the 20th percentile
    const { result, outcome } = only(
      plotFixture([bedFixture('a', { plantings: [planting('a', 'tomato', 60)] })]),
    )
    expect(outcome.kind).toBe('frosted')
    expect(outcome.realized).toBe(0)
    expect(outcome.explanation).toMatch(/Sown under cover on day 60 and set out on day 102/)
    expect(outcome.explanation).toMatch(/frost-free window/)
    expect(result.report.advice.id).toBe('frosted')
  })

  /**
   * The example garden's tomato is sown on day 88 for a day 130 setting out and picked from
   * September, and a frost check at sowing would read it as a seedling in frozen ground every
   * season. A class the calendar raises under cover meets the frost on the day it goes out
   */
  it('reads an indoor start as set out after the raising period rather than lost at sowing', () => {
    const { outcome } = only(
      plotFixture([bedFixture('a', { plantings: [planting('a', 'tomato', 100)] })]),
    )
    expect(outcome.kind).toBe('harvested')
    expect(outcome.frostCutDay).toBeUndefined()
  })

  it('says a harvest window that runs past the first fall frost was cut short, with the day', () => {
    const { outcome } = only(
      plotFixture([bedFixture('a', { plantings: [planting('a', 'tomato', 140, 220, 300)] })]),
    )
    expect(outcome.kind).toBe('harvested')
    // the fixture's first fall frost at the 20th percentile
    expect(outcome.frostCutDay).toBe(280)
    expect(outcome.explanation).toMatch(
      /The harvest runs to day 300 and the first fall frost came on day 280, which cut it short/,
    )
  })

  it('leaves a late sowing unripe when the season this year is too short for it', () => {
    const { outcome } = only(
      plotFixture([bedFixture('a', { plantings: [planting('a', 'tomato', 240, 275, 279)] })]),
    )
    expect(outcome.kind).toBe('unripe')
    expect(outcome.explanation).toMatch(/days to mature/)
  })

  it('starves a bed the panels have taken below the crop own minimum', () => {
    const plot = plotFixture([bedFixture('a', { plantings: [planting('a', 'tomato')] })])
    const { outcome } = only(plot, { bedLight: [bedLightFixture('a', 0.8)] })
    expect(outcome.kind).toBe('too-dark')
    expect(outcome.explanation).toMatch(/mol\/m²\/d/)
  })

  it("can't say anything about a bed whose light hasn't been computed", () => {
    const { outcome } = only(
      plotFixture([bedFixture('a', { plantings: [planting('a', 'tomato')] })]),
      {
        bedLight: [],
      },
    )
    expect(outcome.kind).toBe('unlit')
  })

  it('refuses the family the ground remembers, in years, and by family rather than by name', () => {
    const constraint = rotation.find((entry) => entry.groupRef === 'Solanaceae')
    const interval = constraint?.minIntervalYears ?? 0
    expect(interval).toBeGreaterThan(1)
    const first = run(plotFixture([bedFixture('a', { plantings: [planting('a', 'tomato')] })]))
    expect(first.records).toEqual([
      { season: 1, year: null, bedId: 'a', cropId: 'tomato', harvested: true },
    ])
    const pepper = plotFixture([bedFixture('a', { plantings: [planting('a', 'pepper-sweet')] })])
    const tooSoon = only(pepper, { history: first.records, season: 2 })
    expect(tooSoon.outcome.kind).toBe('refused')
    expect(tooSoon.outcome.explanation).toContain(constraint?.pathogen ?? 'pathogen')
    expect(tooSoon.result.records).toHaveLength(0)
    expect(tooSoon.result.report.advice.id).toBe('refused')
    const stillTooSoon = only(pepper, { history: first.records, season: interval })
    expect(stillTooSoon.outcome.kind).toBe('refused')
    const rested = only(pepper, { history: first.records, season: interval + 1 })
    expect(rested.outcome.kind).not.toBe('refused')
  })

  it('lets shade pay for itself in a year that is water-limited and not in one that is not', () => {
    // a fruiting vegetable at a fifth of shade: Laub's band for the group reaches above a full
    // crop there, and whether the season is allowed to say so is exactly the water flag
    const plot = plotFixture([bedFixture('a', { plantings: [planting('a', 'tomato')] })])
    const light = [bedLightFixture('a', 0.2)]
    const dry = measuredSeasonYear(
      site,
      measuredYearFixture({ year: 2018, meanC: 12, rainMmPerHour: 0 }),
    )
    const wet = measuredSeasonYear(
      site,
      measuredYearFixture({ year: 2019, meanC: 10, rainMmPerHour: 0.15 }),
    )
    expect(dry.summary.waterLimited).toBe(true)
    expect(wet.summary.waterLimited).toBe(false)
    const thirsty = only(plot, { year: dry, bedLight: light }).outcome
    const soaked = only(plot, { year: wet, bedLight: light }).outcome
    expect(thirsty.kind).toBe('harvested')
    expect(soaked.kind).toBe('harvested')
    // the wet year's band is capped at a full crop before the seasonal PAR term widens it, so
    // the honest comparison holds the two bands against each other
    expect(thirsty.band?.interval.upper ?? 0).toBeGreaterThan(soaked.band?.interval.upper ?? 2)
    expect(thirsty.band?.interval.upper ?? 0).toBeGreaterThan(1)
  })

  it('presses less on a bed whose neighbors are unrelated, and says so', () => {
    const alone = plotFixture([bedFixture('a', { plantings: [planting('a', 'tomato')] })])
    const mixed = plotFixture([
      bedFixture('a', { plantings: [planting('a', 'tomato')] }),
      bedFixture('b', { plantings: [planting('b', 'carrot')] }),
      bedFixture('c', { plantings: [planting('c', 'bean-pole')] }),
    ])
    const hemmed = only(alone).outcome
    const eased = only(mixed).outcome
    expect(eased.pestPressure).toBeLessThan(hemmed.pestPressure)
    // same seed, same planting, same shade: the only difference is what grows around it
    expect(eased.realized).toBeGreaterThan(hemmed.realized)
  })

  it('records a trial of an untested rule the bed actually ran, and pays it at most once', () => {
    const plot = plotFixture([
      bedFixture('a', { plantings: [planting('a', 'tomato'), planting('a', 'carrot')] }),
    ])
    const result = run(plot)
    const tried = new Set(result.tried.map((entry) => entry.ruleId as string))
    expect(tried.has('carrots-love-tomatoes')).toBe(true)
    for (const outcome of result.report.outcomes) {
      for (const ruleId of outcome.tried) {
        expect(outcome.companions).not.toContain(ruleId)
      }
    }
  })

  it('remembers what stood in the ground and not what the ground refused', () => {
    // a pole bean is tender, so sowing it on day 100 loses it to the spring frost. A carrot would
    // have shrugged the same frost off, which is `frostHardy` doing its job
    const plot = plotFixture([
      bedFixture('a', { plantings: [planting('a', 'tomato'), planting('a', 'bean-pole', 100)] }),
    ])
    const history: SeasonRecord[] = [
      {
        season: 1,
        year: null,
        bedId: 'a' as BedId,
        cropId: 'pepper-hot' as CropId,
        harvested: true,
      },
    ]
    const result = run(plot, { history, season: 2 })
    const kinds = new Map(
      result.report.outcomes.map((outcome) => [outcome.cropId as string, outcome.kind]),
    )
    expect(kinds.get('tomato')).toBe('refused')
    expect(kinds.get('bean-pole')).toBe('frosted')
    expect(result.records.map((record) => record.cropId)).toEqual(['bean-pole'])
    expect(result.records[0]?.harvested).toBe(false)
  })

  it('counts a planting the ground refused as a zero in the harvest share', () => {
    // the standing this feeds is a land equivalent ratio, counted per bed of ground, so a bed
    // that grew nothing counts as a zero in the mean, and ignoring a rotation warning stops
    // being free
    const plot = plotFixture([
      bedFixture('a', { plantings: [planting('a', 'tomato'), planting('a', 'carrot')] }),
    ])
    const history: SeasonRecord[] = [
      {
        season: 1,
        year: null,
        bedId: 'a' as BedId,
        cropId: 'pepper-hot' as CropId,
        harvested: true,
      },
    ]
    const result = run(plot, { history, season: 2 })
    const byCrop = new Map(
      result.report.outcomes.map((outcome) => [outcome.cropId as string, outcome]),
    )
    expect(byCrop.get('tomato')?.kind).toBe('refused')
    const carrot = byCrop.get('carrot')
    expect(carrot?.kind).toBe('harvested')
    expect(carrot?.realized ?? 0).toBeGreaterThan(0)
    expect(result.report.harvestIndex).toBeCloseTo((carrot?.realized ?? 0) / 2, 6)
    // and the ground still remembers only what went into it
    expect(result.records.map((record) => record.cropId)).toEqual(['carrot'])
  })

  it('leaves a standing perennial in its bed, and asks the rotation of one that is newly planted', () => {
    // white rot never leaves an allium bed, so ramps re-sown every season would be refused their
    // own ground for forty years. Rotation is what FOLLOWS a crop, and a perennial follows itself
    const plot = plotFixture([bedFixture('a', { plantings: [planting('a', 'ramps')] })])
    const record = (cropId: string): SeasonRecord => ({
      season: 1,
      year: null,
      bedId: 'a' as BedId,
      cropId: cropId as CropId,
      harvested: true,
    })
    const stood = only(plot, { history: [record('ramps')], season: 2 })
    expect(stood.outcome.kind).not.toBe('refused')
    // the ground remembers it every season it stands
    expect(stood.result.records.map((entry) => entry.cropId)).toEqual(['ramps'])
    // an allium that is not this one, last season, is a rotation question and is asked
    const planted = only(plot, { history: [record('garlic')], season: 2 })
    expect(planted.outcome.kind).toBe('refused')
    expect(planted.outcome.explanation).toMatch(/white rot/)
  })

  it('counts the electricity from the arrays on the year weather, and reports a plain season', () => {
    // three families that all clear their light minimum under a tenth of shade on this fixture,
    // so nothing but the panels and the pests is in the way of a plain season
    const plot: GardenPlot = {
      ...plotFixture([
        bedFixture('a', { plantings: [planting('a', 'tomato')] }),
        bedFixture('b', { plantings: [planting('b', 'carrot')] }),
        bedFixture('c', { plantings: [planting('c', 'basil')] }),
      ]),
      arrays: [arrayFixture()],
    }
    const result = run(plot)
    expect(result.report.energyKwh ?? 0).toBeGreaterThan(0)
    expect(result.report.advice.id).toBe('status')
    expect(result.report.advice.text).toMatch(/kWh/)
    expect(result.report.outcomes.every((outcome) => outcome.kind === 'harvested')).toBe(true)
  })

  it('has nothing to say about an empty garden but where to start', () => {
    const result = run(plotFixture([bedFixture('a')]))
    expect(result.report.outcomes).toHaveLength(0)
    expect(result.report.harvestIndex).toBeNull()
    expect(result.report.advice.id).toBe('plant')
    expect((result.tried as readonly { ruleId: RuleId }[]).length).toBe(0)
  })
})

/**
 * The economy, which sits below the standing and inside no score (Decision Record 14).
 *
 * Every figure here belongs to `data/economy.ts`. What is tested is which of them a season is
 * entitled to. A garden outside the United States has a build cost and no price, one with no
 * panels has neither, and the jobs the rules ask for are there in all three cases
 */
const MA_PRICE: RetailPrice = {
  usdPerKwh: citedVerbatim(0.3048, 'B', ['eia-electric-power-monthly-5-6-a'], null),
  stateCode: 'MA',
  year: 2025,
  sourceLabel: 'test',
}

/** Nasturtium beside a cabbage fires the trap-crop rules, which are the ones that ask for work */
const managedPlot = (): GardenPlot =>
  plotFixture([
    bedFixture('a', {
      plantings: [planting('a', 'cabbage'), planting('a', 'nasturtium')],
    }),
  ])

describe('what a season costs', () => {
  it('costs the array, values the year at the state price, and pays it back', () => {
    const result = run({ ...managedPlot(), arrays: [arrayFixture()] }, { retailPrice: MA_PRICE })
    const economy = result.report.economy
    if (economy === undefined) throw new Error('no economy')
    const cost = economy.buildCostUsd
    if (cost === null) throw new Error('no build cost')
    expect(cost.value.interval.lower).toBeGreaterThan(0)
    expect(cost.value.interval.upper).toBeGreaterThan(cost.value.interval.lower)
    expect(cost.value.dominantSource).toBe('mount-structure')
    // the value is the year's own kilowatt-hours at the price that was passed in, and nothing else
    expect(economy.electricityValue).toBeCloseTo(
      (result.report.energyKwh ?? 0) * MA_PRICE.usdPerKwh.value,
      6,
    )
    expect(economy.price).toBe(MA_PRICE)
    expect(economy.installedCost).toBeNull()
    const payback = economy.paybackYears
    if (payback === null || 'sourceId' in payback) throw new Error('no benchmark payback')
    expect(payback.value.interval.lower).toBeCloseTo(
      cost.value.interval.lower / (economy.electricityValue ?? 1),
      6,
    )
    expect(economy.managementTasks.length).toBeGreaterThan(0)
  })

  /** A typed tariff is the grower's own figure and outranks the state average, whatever the currency */
  it('values the year at a typed tariff over the state price, stamped as the grower’s own', () => {
    const result = run(
      { ...managedPlot(), arrays: [arrayFixture()] },
      {
        retailPrice: MA_PRICE,
        economyInputs: { perKwh: 0.4, currency: 'EUR', installedCost: null },
      },
    )
    const economy = result.report.economy
    if (economy === undefined) throw new Error('no economy')
    expect(economy.price).toEqual({ sourceId: 'user', perKwh: 0.4, currency: 'EUR' })
    expect(economy.electricityValue).toBeCloseTo((result.report.energyKwh ?? 0) * 0.4, 6)
    // the benchmark cost is in US dollars, so a tariff in euros has nothing to pay back against
    expect(economy.paybackYears).toBeNull()
  })

  it('pays a typed cost back at a typed tariff in the same currency, as a point', () => {
    const result = run(
      { ...managedPlot(), arrays: [arrayFixture()] },
      {
        retailPrice: null,
        economyInputs: { perKwh: 0.4, currency: 'EUR', installedCost: 8000 },
      },
    )
    const economy = result.report.economy
    if (economy === undefined) throw new Error('no economy')
    expect(economy.installedCost).toEqual({ sourceId: 'user', amount: 8000, currency: 'EUR' })
    // the benchmark band is still computed and kept beside the typed figure
    expect(economy.buildCostUsd).not.toBeNull()
    const payback = economy.paybackYears
    if (payback === null || !('sourceId' in payback)) throw new Error('no typed payback')
    expect(payback.years).toBeCloseTo(8000 / (economy.electricityValue ?? 1), 6)
  })

  it('reads a cleared or zero field as nothing typed', () => {
    const economy = run(
      { ...managedPlot(), arrays: [arrayFixture()] },
      { retailPrice: MA_PRICE, economyInputs: { perKwh: 0, currency: 'USD', installedCost: 0 } },
    ).report.economy
    expect(economy?.price).toBe(MA_PRICE)
    expect(economy?.installedCost).toBeNull()
  })

  it('costs the array and values nothing where no price reaches the site', () => {
    const result = run({ ...managedPlot(), arrays: [arrayFixture()] })
    const economy = result.report.economy
    expect(economy?.buildCostUsd).not.toBeNull()
    expect(economy?.electricityValue).toBeNull()
    expect(economy?.price).toBeNull()
    // no electricity value means no payback figure
    expect(economy?.paybackYears).toBeNull()
    expect(economy?.managementTasks.length ?? 0).toBeGreaterThan(0)
  })

  it('has jobs and no money at all for a garden with no panels', () => {
    const economy = run(managedPlot(), { retailPrice: MA_PRICE }).report.economy
    expect(economy?.buildCostUsd).toBeNull()
    expect(economy?.electricityValue).toBeNull()
    expect(economy?.paybackYears).toBeNull()
    expect(economy?.managementTasks.length ?? 0).toBeGreaterThan(0)
  })

  /** A report is written to storage and read back, so every figure in it has to be plain JSON */
  it('survives being written to storage and read back', () => {
    const economy = run({ ...managedPlot(), arrays: [arrayFixture()] }, { retailPrice: MA_PRICE })
      .report.economy
    expect(JSON.parse(JSON.stringify(economy)) as unknown).toEqual(economy)
  })

  it('lists each job once, in the words of the rules that actually applied', () => {
    // the same pairing in two beds is still one job to learn
    const two = plotFixture([
      bedFixture('a', { plantings: [planting('a', 'cabbage'), planting('a', 'nasturtium')] }),
      bedFixture('b', { plantings: [planting('b', 'cabbage'), planting('b', 'nasturtium')] }),
    ])
    const tasks = run(two).report.economy?.managementTasks ?? []
    expect(new Set(tasks).size).toBe(tasks.length)
    const fromRules = new Set(
      [...rules.scorable, ...rules.experimental, ...rules.folklore].flatMap(
        (rule) => rule.scope.requiresManagement,
      ),
    )
    for (const task of tasks) expect(fromRules.has(task)).toBe(true)
    expect(tasks).toContain('Destroy or treat infested nasturtium before aphids disperse')
    // and a garden nothing asks anything of says so with an empty list
    expect(
      run(plotFixture([bedFixture('a', { plantings: [planting('a', 'tomato')] })])).report.economy
        ?.managementTasks,
    ).toEqual([])
  })
})
