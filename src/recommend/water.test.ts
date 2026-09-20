import { describe, expect, it } from 'bun:test'
import { cropById, loadCropCatalog } from '../data/crops'
import { shadeBenefitScale, shadeBenefitStatusOf, WATER_LIMITED_INDEX } from '../data/water'
import { cosDeg } from '../sim/math'
import { DEFAULT_ROW_GEOMETRY, makeArray } from '../state/defaults'
import { polygonOf, rectangleRing, vec2 } from '../state/geom'
import type { Crop } from '../types/crop'
import type { Planting } from '../types/garden'
import type { BedId, CropId, PlantingId } from '../types/ids'
import type { Site } from '../types/site'
import type { DayOfYear, Fraction } from '../types/units'
import type { BedRain } from '../types/water'
import { drynessOf, droughtPenaltyFor } from './stages/soil-water'
import type { SeasonLight } from '../types/light'
import { shadeBenefitBonus } from './stages/light-gate'
import { bedFixture, bedLightFixture, plotFixture, siteFixture, tmyFixture } from './testkit'
import {
  bedShortfallMm,
  bedWaterBalance,
  waterBalanceShared,
  waterBalances,
  type WaterBalanceShared,
} from './water'

// A south-facing fixed row, one row deep, at the tracker's default 25 degree tilt: the low edge
// (the drip line) sits this far south of the row's own centreline
const ROW_HALF_SPAN_M = (DEFAULT_ROW_GEOMETRY.collectorWidthM * cosDeg(25)) / 2

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
    expect(balance.notes.some((note) => note.includes('reference grass'))).toBe(true)
  })

  it('reads a high sheltered fraction for a bed a row stands over', () => {
    const centre = vec2(2, 2)
    const bed = bedFixture('bed-a', { footprint: polygonOf(rectangleRing(centre, 2, 1)) })
    const array = makeArray(1, {
      geometry: { ...DEFAULT_ROW_GEOMETRY, rowCount: 1, originM: centre },
    })
    const balances = waterBalances({
      site: siteFixture(),
      weather: tmyFixture(),
      plot: { ...plotFixture([bed]), arrays: [array] },
      bedLight: [bedLightFixture('bed-a', 0.3)],
      catalog: [],
    })
    const balance = balances[0]
    if (balance === undefined) throw new Error('no balance')
    expect(balance.rain.interceptedFraction).toBeGreaterThan(0.9)
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

  it('irrigates least with a basin on the drip strip, less again without one, most with no strip at all', () => {
    const array = makeArray(1, {
      geometry: { ...DEFAULT_ROW_GEOMETRY, rowCount: 1, originM: vec2(10, 10) },
    })
    const lowEdgeY = 10 - ROW_HALF_SPAN_M
    // north edge half a metre past the low edge, comfortably past the strip's wind-widened width
    const stripFootprint = polygonOf(rectangleRing(vec2(5, lowEdgeY - 1), 3, 3))
    const basinBed = bedFixture('strip-basin', {
      footprint: stripFootprint,
      waterHarvesting: [{ scale: 'micro-basin', footprint: stripFootprint }],
    })
    const plainStripBed = bedFixture('strip-no-basin', {
      footprint: polygonOf(rectangleRing(vec2(10, lowEdgeY - 1), 3, 3)),
    })
    const noStripBed = bedFixture('no-strip', {
      footprint: polygonOf(rectangleRing(vec2(10, 18), 3, 2)),
    })
    const balances = waterBalances({
      site: siteFixture(),
      weather: tmyFixture(),
      plot: { ...plotFixture([basinBed, plainStripBed, noStripBed]), arrays: [array] },
      bedLight: [
        bedLightFixture('strip-basin', 0),
        bedLightFixture('strip-no-basin', 0),
        bedLightFixture('no-strip', 0),
      ],
      catalog: [],
    })
    const basin = balances.find((balance) => (balance.bedId as string) === 'strip-basin')
    const plain = balances.find((balance) => (balance.bedId as string) === 'strip-no-basin')
    const none = balances.find((balance) => (balance.bedId as string) === 'no-strip')
    if (basin === undefined || plain === undefined || none === undefined) {
      throw new Error('no balance')
    }
    expect(basin.rain.crossings.length).toBeGreaterThan(0)
    expect(plain.rain.crossings.length).toBeGreaterThan(0)
    expect(none.rain.crossings.length).toBe(0)
    expect(basin.irrigationUnderPanelsMm.interval.lower).toBeLessThan(
      plain.irrigationUnderPanelsMm.interval.lower,
    )
    expect(plain.irrigationUnderPanelsMm.interval.lower).toBeLessThan(
      none.irrigationUnderPanelsMm.interval.lower,
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

describe('bedShortfallMm: the deficit alone, for the search to slide beds against', () => {
  it('matches bedWaterBalance under panels, whether the rain is passed or looked up', () => {
    const bed = bedFixture('bed-a')
    const light = bedLightFixture('bed-a', 0.3)
    const base = waterBalanceShared({
      site: siteFixture(),
      weather: tmyFixture(),
      plot: plotFixture([bed]),
      bedLight: [light],
      catalog: [],
    })
    // a nonzero shelter and a nonzero drip multiple, so the shortfall exercises panelRainSplit's
    // whole shading and drip path
    const rain: BedRain = {
      bedId: bed.id,
      shelteredFraction: 0.4 as Fraction,
      dripMultiple: 1.5,
      crossings: [],
    }
    const shared: WaterBalanceShared = { ...base, rain: { ...base.rain, beds: [rain] } }

    const looked = bedWaterBalance(shared, bed, light)
    const passed = bedWaterBalance(shared, bed, light, rain)
    expect(passed).toEqual(looked)

    const shortfall = bedShortfallMm(shared, bed, light, rain)
    expect(shortfall).toBeCloseTo(passed.underPanels.deficitMm, 9)
  })
})
