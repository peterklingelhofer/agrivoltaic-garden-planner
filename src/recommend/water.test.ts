import { describe, expect, it } from 'bun:test'
import { cropById, loadCropCatalog } from '../data/crops'
import { shadeBenefitScale, shadeBenefitStatusOf, WATER_LIMITED_INDEX } from '../data/water'
import type { Crop } from '../types/crop'
import type { Planting } from '../types/garden'
import type { BedId, CropId, PlantingId } from '../types/ids'
import type { Site } from '../types/site'
import type { DayOfYear, Fraction } from '../types/units'
import { drynessOf, droughtPenaltyFor } from './stages/soil-water'
import type { SeasonLight } from '../types/light'
import { shadeBenefitBonus } from './stages/light-gate'
import { bedFixture, bedLightFixture, plotFixture, siteFixture, tmyFixture } from './testkit'
import { waterBalances } from './water'

const catalogPromise = loadCropCatalog()

const need = (catalog: readonly Crop[], id: string): Crop => {
  const crop = cropById(catalog, id as CropId)
  if (crop === undefined) throw new Error(`missing fixture crop ${id}`)
  return crop
}

const at = (index: number, overrides: Partial<Site> = {}): Site =>
  siteFixture({
    ...overrides,
    waterLimitation: {
      ...siteFixture().waterLimitation,
      index: index as Fraction,
      limited: index >= WATER_LIMITED_INDEX,
    },
  })

const TEMPERATE = 0.2
const SEMI_ARID = 0.5
const ARID = 0.8

const planting = (cropId: string): Planting => ({
  id: 'planting-1' as PlantingId,
  bedId: 'bed-a' as BedId,
  cropId: cropId as CropId,
  cultivarId: null,
  role: 'target-crop',
  tier: 'herb-ground',
  sowDay: 120 as DayOfYear,
  harvestStartDay: 200 as DayOfYear,
  harvestEndDay: 240 as DayOfYear,
  plantCount: 12,
})

describe('graded shade-benefit scale', () => {
  it('keeps the old boolean threshold as the foot of a continuous ramp', () => {
    expect(shadeBenefitScale(at(TEMPERATE).waterLimitation)).toBe(0)
    expect(shadeBenefitScale(at(WATER_LIMITED_INDEX).waterLimitation)).toBe(0)
    expect(shadeBenefitScale(at(SEMI_ARID).waterLimitation)).toBeGreaterThan(0)
    expect(shadeBenefitScale(at(ARID).waterLimitation)).toBeGreaterThan(
      shadeBenefitScale(at(SEMI_ARID).waterLimitation),
    )
    expect(shadeBenefitScale(at(1).waterLimitation)).toBe(1)
  })

  it('says why a well-watered garden earns nothing', () => {
    const temperate = shadeBenefitStatusOf(at(TEMPERATE).waterLimitation)
    expect(temperate.active).toBe(false)
    expect(temperate.scale).toBe(0)
    expect(temperate.reason).toMatch(/Barron-Gafford/)
    expect(shadeBenefitStatusOf(at(ARID).waterLimitation).active).toBe(true)
  })
})

/** Only `cumulativeRsr` is read, so these carry the shade and nothing else that matters here */
const seasonLightWithRsr = (cumulativeRsr: number): SeasonLight =>
  ({ cumulativeRsr }) as unknown as SeasonLight

const OPEN_SUN = seasonLightWithRsr(0.02)
const LIGHT_SHADE = seasonLightWithRsr(0.15)
const SHADED = seasonLightWithRsr(0.4)

describe('graded pathways through the recommender', () => {
  it('gives an arid site a strictly larger shade-benefit bonus than a temperate one', async () => {
    const lettuce = need(await catalogPromise, 'lettuce-leaf')
    const hot = { heatDaysAbove30C: 80 }
    const temperate = shadeBenefitBonus(lettuce, at(TEMPERATE, hot), SHADED)
    const semiArid = shadeBenefitBonus(lettuce, at(SEMI_ARID, hot), SHADED)
    const arid = shadeBenefitBonus(lettuce, at(ARID, hot), SHADED)
    expect(temperate).toBe(0)
    expect(semiArid).toBeGreaterThan(temperate)
    expect(arid).toBeGreaterThan(semiArid)
  })

  /**
   * The bonus is a claim that SHADE helps this crop here, so a bed with none of it earns none of
   * the bonus. Without this the full bonus would go to every shade-tolerant crop standing in open
   * sun, and put ramps above okra in Phoenix
   */
  it('pays nothing for shade a bed does not have, however hot and dry the site', async () => {
    const lettuce = need(await catalogPromise, 'lettuce-leaf')
    const arid = at(ARID, { heatDaysAbove30C: 195 })
    expect(shadeBenefitBonus(lettuce, arid, OPEN_SUN)).toBeLessThan(0.005)
    expect(shadeBenefitBonus(lettuce, arid, SHADED)).toBeGreaterThan(
      shadeBenefitBonus(lettuce, arid, OPEN_SUN),
    )
    // and it grows with the shade, because that is the axis the yield response is defined on
    expect(shadeBenefitBonus(lettuce, arid, SHADED)).toBeGreaterThan(
      shadeBenefitBonus(lettuce, arid, LIGHT_SHADE),
    )
  })

  /**
   * The ordering a bonus with no shade factor inverts. Measured at Phoenix on a bed reading 42
   * mol/m2/d: okra beat ramps on climate fit 0.840 to 0.700 and lost the total 0.710 to 0.715
   * anyway, because ramps collected a 0.114 shade bonus for shade that bed does not have
   */
  it('does not let a shade bonus outrank a better climate fit in open sun', async () => {
    const catalog = await catalogPromise
    const shadeLover = need(catalog, 'ramps')
    const heatLover = need(catalog, 'okra')
    const desert = at(ARID, { heatDaysAbove30C: 195 })
    expect(shadeLover.light.shadeBenefitingWhenWaterLimited).toBe(true)

    const inSun = shadeBenefitBonus(shadeLover, desert, OPEN_SUN)
    // the gap an in-sun bonus would close: climate fit differs by 0.14, weighted at 0.25, so 0.035
    expect(inSun).toBeLessThan(0.035 * 0.25)
    // and under a real canopy the bonus is still there, because the mechanism is real
    expect(shadeBenefitBonus(shadeLover, desert, SHADED)).toBeGreaterThan(inSun * 10)
    // a crop that does not benefit from shade never collects it, shaded or not
    expect(shadeBenefitBonus(heatLover, desert, SHADED)).toBe(0)
  })

  it('grades the drought penalty instead of switching it', async () => {
    const rainfed = bedFixture('bed-a', {
      irrigation: {
        method: 'none',
        available: false,
        appliedMmPerYear: 0 as never,
        harvestsPanelRunoff: false,
      },
    })
    const lettuce = need(await catalogPromise, 'lettuce-leaf')
    expect(drynessOf(at(0))).toBeCloseTo(0.4, 6)
    expect(drynessOf(at(1))).toBeCloseTo(1, 6)
    const temperate = droughtPenaltyFor(lettuce, rainfed, at(TEMPERATE))
    const arid = droughtPenaltyFor(lettuce, rainfed, at(ARID))
    expect(temperate).toBeGreaterThan(0)
    expect(arid).toBeGreaterThan(temperate)
  })
})

describe('per-bed water balance', () => {
  const run = (bed = bedFixture('bed-a'), catalog: readonly Crop[] = [], humid = true) =>
    waterBalances({
      site: siteFixture(),
      weather: tmyFixture(humid),
      plot: plotFixture([bed]),
      bedLight: [bedLightFixture('bed-a', 0.3)],
      catalog,
    })

  it('runs one balance per bed and shades reference ET', () => {
    const balances = run()
    expect(balances.length).toBe(1)
    const balance = balances[0]
    if (balance === undefined) throw new Error('no balance')
    expect(balance.bedId as string).toBe('bed-a')
    expect(balance.method).toBe('fao56-penman-monteith')
    expect(balance.openSkyEt0Mm).toBeGreaterThan(0)
    expect(balance.underPanelsEt0Mm).toBeLessThan(balance.openSkyEt0Mm)
    expect(balance.rain.interceptedFraction).toBeCloseTo(0.3, 6)
    expect(balance.notes.some((note) => note.includes('reference grass'))).toBe(true)
  })

  it('reports the saving as a band whose width is the measured spread, not a point', () => {
    const balance = run()[0]
    if (balance === undefined) throw new Error('no balance')
    const saving = balance.evapotranspirationSaving
    expect(saving.interval.lower).toBeGreaterThan(0)
    expect(saving.interval.upper).toBeGreaterThan(saving.interval.lower)
    expect(saving.contributions.length).toBeGreaterThan(0)
    expect(balance.irrigationOpenSkyMm.interval.upper).toBeGreaterThanOrEqual(
      balance.irrigationOpenSkyMm.interval.lower,
    )
  })

  it('cuts the irrigation requirement when the bed harvests panel runoff', () => {
    const dry = run()[0]
    const harvesting = run(
      bedFixture('bed-a', {
        irrigation: {
          method: 'drip',
          available: true,
          appliedMmPerYear: 0 as never,
          harvestsPanelRunoff: true,
        },
      }),
    )[0]
    if (dry === undefined || harvesting === undefined) throw new Error('no balance')
    expect(harvesting.rain.harvestedFraction).toBeGreaterThan(0)
    expect(harvesting.irrigationUnderPanelsMm.interval.lower).toBeLessThan(
      dry.irrigationUnderPanelsMm.interval.lower,
    )
  })

  it('falls back to Hargreaves-Samani when the source ships no humidity or wind', () => {
    const balance = run(bedFixture('bed-a'), [], false)[0]
    if (balance === undefined) throw new Error('no balance')
    expect(balance.method).toBe('hargreaves-samani')
  })

  it('drives crop coefficients from the planting when the catalogue is loaded', async () => {
    const catalog = await catalogPromise
    const bed = bedFixture('bed-a', { plantings: [planting('lettuce-leaf')] })
    const balance = run(bed, catalog)[0]
    if (balance === undefined) throw new Error('no balance')
    expect(balance.notes.some((note) => note.includes('first planting'))).toBe(true)
    expect(balance.openSky.cropEtMm).toBeGreaterThan(0)
    expect(balance.openSky.cropEtMm).toBeLessThan(balance.openSkyEt0Mm * 2)
  })
})
