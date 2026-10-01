import { describe, expect, it } from 'bun:test'
import { loadCompanionRules, loadRotationConstraints } from '../data/companions'
import { cropById, loadCropCatalog } from '../data/crops'
import type { CropCalendar } from '../types/calendar'
import type { Crop } from '../types/crop'
import type { CropId } from '../types/ids'
import type { ExceedancePercentile } from '../types/site'
import type {
  Celsius,
  DayOfYear,
  Days,
  DegreeDaysC,
  DegreesLatitude,
  Millimeters,
  MolPerM2Day,
} from '../types/units'
import { autoRecommend, calendarConfidence } from './auto'
import { frostExceedanceCurve } from '../data/agronomy'
import {
  adequateLightWindow,
  CALENDAR_PROVENANCE_NOTE,
  cropCalendar,
  forwardDays,
  FROST_FREE_NOTE,
  INDOOR_RAISING_DAYS,
  seasonAnchors,
  seasonOrigin,
  siteMaturityDays,
  successionDays,
  wetSeasonNote,
} from './calendar'
import {
  bedFixture,
  bedLightFixture,
  dailyMinimaFixture,
  FROST_EVERY_YEAR,
  frostFreeSiteFixture,
  monthly,
  plotFixture,
  siteFixture,
} from './testkit'

const catalogPromise = loadCropCatalog()

const need = (catalog: readonly Crop[], id: string): Crop => {
  const crop = cropById(catalog, id as CropId)
  if (crop === undefined) throw new Error(`missing fixture crop ${id}`)
  return crop
}

const withThermal = (crop: Crop, overrides: Partial<NonNullable<Crop['thermal']>>): Crop => {
  if (crop.thermal === null) throw new Error('crop has no thermal requirement')
  return { ...crop, thermal: { ...crop.thermal, ...overrides } }
}

const calendarFor = (
  crop: Crop,
  percentile: ExceedancePercentile = 20,
  rsr = 0,
  site = siteFixture(),
): CropCalendar => cropCalendar({ crop, site, light: bedLightFixture('bed-a', rsr), percentile })

const sowDay = (calendar: CropCalendar): number => {
  const window = calendar.plantings.find((planting) => planting.method !== 'start-indoors')
  if (window === undefined) throw new Error('no sowing window')
  return window.recommended
}

/** Days from the first thing the gardener does to the first thing they pick */
const seedToHarvestDays = (calendar: CropCalendar): number =>
  forwardDays(calendar.plantings[0]?.recommended ?? 0, calendar.harvest.start)

describe('frost-anchored dates', () => {
  it('moves every date with the risk percentile and never hardcodes one', async () => {
    const crop = need(await catalogPromise, 'lettuce-leaf')
    const days = ([10, 20, 30, 40, 50] as const).map((percentile) =>
      sowDay(calendarFor(crop, percentile)),
    )
    // the fixture curve moves the last spring freeze 130 -> 110 as risk rises
    expect(days).toEqual([...days].sort((a, b) => b - a))
    expect(days[0]).toBeGreaterThan(days[4] ?? 0)
    for (const percentile of [10, 20, 30, 40, 50] as const) {
      expect(calendarFor(crop, percentile).frostRiskPercentile).toBe(percentile)
    }
  })

  it('offsets a hardy crop before the last frost and a tender crop after it', async () => {
    const catalog = await catalogPromise
    const anchors = seasonAnchors(siteFixture(), 20)
    expect(anchors.lastSpringFreeze).toBe(125)
    expect(anchors.frostFreeDays).toBe(155)

    const pea = need(catalog, 'pea-garden')
    expect(pea.frostOffsetDays).toBeLessThan(0)
    const basis = calendarFor(pea).plantings[0]?.basis
    expect(basis?.kind).toBe('frost-offset')
    expect(basis?.kind === 'frost-offset' ? basis.percentile : null).toBe(20)
    expect(sowDay(calendarFor(pea))).toBe(anchors.lastSpringFreeze + pea.frostOffsetDays)

    const tomato = need(catalog, 'tomato')
    expect(tomato.frostOffsetDays).toBeGreaterThan(0)
    expect(sowDay(calendarFor(tomato))).toBe(anchors.lastSpringFreeze + tomato.frostOffsetDays)
  })

  it('reads a southern-hemisphere season that wraps the year boundary', () => {
    const southern = siteFixture({
      location: { latitudeDeg: -33.9 as DegreesLatitude, longitudeDeg: 151 as never },
      frost: [
        {
          ...FROST_EVERY_YEAR,
          thresholdC: 0 as Celsius,
          lastSpringFreeze: { 10: 288, 20: 283, 30: 278, 40: 273, 50: 268 } as never,
          firstFallFreeze: { 10: 100, 20: 105, 30: 110, 40: 115, 50: 120 } as never,
          frostFreeDays: { 10: 177, 20: 187, 30: 197, 40: 207, 50: 217 } as never,
        },
      ],
      normals: {
        ...siteFixture().normals,
        monthlyMeanTempC: [24, 23, 19, 12, 6, 0, -2, 0, 5, 11, 17, 22].map((v) => v as Celsius),
      },
    })
    const anchors = seasonAnchors(southern, 20)
    expect(anchors.frostFreeDays).toBe(187)
    expect(forwardDays(anchors.lastSpringFreeze, anchors.firstFallFreeze)).toBe(187)
  })
})

/**
 * Every date here is a forward distance from the season origin, so an origin that lands inside the
 * season it is meant to precede reverses the pair it separates. A fixed lead before the last spring
 * freeze does exactly that at a hot site: Phoenix freezes on day 35, so a 120 day lead would wrap
 * back to day 280 and a cucumber with a 164 day planting window would be refused `season-too-short`
 * by 201 days at a site with a 305 day frost-free season
 */
describe('the season origin', () => {
  const PHOENIX_MEAN_TEMP_C = [11.7, 13.7, 17.7, 22.3, 27.6, 33, 35, 34.2, 30.9, 24.2, 16.9, 11.3]

  const phoenix = (): ReturnType<typeof siteFixture> =>
    siteFixture({
      location: { latitudeDeg: 33.45 as DegreesLatitude, longitudeDeg: -112.07 as never },
      koppenCode: 'BWh',
      heatDaysAbove30C: 198,
      hardiness: [{ scheme: 'usda-2023', extremeMinTempC: -3 as Celsius, zoneLabel: '9b' }],
      normals: {
        ...siteFixture().normals,
        monthlyMeanTempC: PHOENIX_MEAN_TEMP_C.map((v) => v as Celsius),
        monthlyMeanDliMolM2Day: [
          25.4, 32.3, 43.6, 54.4, 60.2, 62.5, 55.6, 50.5, 44.9, 37.1, 28, 22.9,
        ],
      },
      frost: [
        {
          ...FROST_EVERY_YEAR,
          thresholdC: 0 as Celsius,
          lastSpringFreeze: { 10: 40, 20: 35, 30: 23, 40: 17, 50: 9 } as never,
          firstFallFreeze: { 10: 334, 20: 340, 30: 347, 40: 351, 50: 353 } as never,
          frostFreeDays: { 10: 294, 20: 305, 30: 324, 40: 334, 50: 344 } as never,
        },
      ],
      seasonGdd: { base4C: 6609 as never, base10C: 4170 as never, percentile: 20 },
    })

  it('sits at the coldest point of the year rather than a fixed lead into it', () => {
    // December is Phoenix's coldest month, and its midpoint is day 350
    expect(seasonOrigin(PHOENIX_MEAN_TEMP_C)).toBe(350)
    expect(seasonAnchors(phoenix(), 20).origin).toBe(350)
  })

  it('does not move with the risk percentile, unlike everything else on the anchors', () => {
    const site = phoenix()
    const origins = ([10, 20, 30, 40, 50] as const).map((p) => seasonAnchors(site, p).origin)
    expect(new Set(origins).size).toBe(1)
  })

  it('leaves a long hot season open instead of reading it back to front', async () => {
    const site = phoenix()
    const light = bedLightFixture('bed-a', 0, 60)
    for (const id of ['cucumber', 'bean-runner', 'eggplant']) {
      const crop = need(await catalogPromise, id)
      for (const percentile of [20, 50] as const) {
        const calendar = cropCalendar({ crop, site, light, percentile })
        expect(calendar.feasibility.kind, `${id} at p${String(percentile)}`).not.toBe(
          'season-too-short',
        )
        expect(calendar.plantings.length, `${id} at p${String(percentile)}`).toBeGreaterThan(0)
      }
    }
  })

  it('is defined wherever a coldest month is, including a flat tropical year', () => {
    expect(seasonOrigin([26, 26, 26, 26, 26, 26, 26, 26, 26, 26, 26, 26])).toBe(16)
    // southern hemisphere: the year turns over in July, not January
    expect(seasonOrigin([24, 23, 19, 12, 6, 0, -2, 0, 5, 11, 17, 22])).toBe(197)
  })
})

/**
 * Seville: a winter mild enough that the last spring freeze, day 17, falls a day after the day 16
 * origin. A cool-season crop's negative frost offset then reaches back past the origin: unclamped,
 * pea's -14 days lands on day 3, which reads as 352 days forward from the origin and leaves the
 * planting window negative
 */
describe('a mild-winter site where the frost offset reaches past the origin', () => {
  const seville = (): ReturnType<typeof siteFixture> =>
    siteFixture({
      location: { latitudeDeg: 37.39 as DegreesLatitude, longitudeDeg: -5.99 as never },
      normals: {
        ...siteFixture().normals,
        monthlyMeanTempC: [11, 12.6, 15.4, 17.3, 21, 25.2, 28.2, 28, 25, 20.4, 15.1, 12.2].map(
          (v) => v as Celsius,
        ),
        monthlyMinTempC: [5.7, 6.9, 9.3, 11, 14.3, 18, 20.3, 20.4, 18.5, 14.8, 10, 7.2].map(
          (v) => v as Celsius,
        ),
        monthlyMaxTempC: [16.3, 18.3, 21.8, 23.6, 27.6, 32.5, 36, 35.6, 31.6, 26, 20.2, 17.1].map(
          (v) => v as Celsius,
        ),
      },
      frost: [
        {
          ...siteFixture().frost[0]!,
          lastSpringFreeze: { 10: 17, 20: 17, 30: 17, 40: 17, 50: 17 } as never,
          firstFallFreeze: { 10: 365, 20: 365, 30: 365, 40: 365, 50: 365 } as never,
          frostFreeDays: { 10: 348, 20: 348, 30: 348, 40: 348, 50: 348 } as never,
        },
      ],
      seasonGdd: { base4C: 5500 as DegreeDaysC, base10C: 3400 as DegreeDaysC, percentile: 20 },
    })
  const light = bedLightFixture('bed-1', 0, 40, [18, 24, 32, 40, 46, 50, 50, 45, 37, 27, 20, 16])

  it('fits a cool-season crop and plants a hardy perennial in its own spring window', async () => {
    const catalog = await catalogPromise
    const site = seville()

    const pea = cropCalendar({ crop: need(catalog, 'pea-garden'), site, light, percentile: 20 })
    expect(pea.feasibility.kind).toBe('fits')
    expect(pea.plantings.length).toBeGreaterThan(0)

    const anchors = seasonAnchors(site, 20)
    const thyme = cropCalendar({ crop: need(catalog, 'thyme'), site, light, percentile: 20 })
    const transplant = thyme.plantings.find((planting) => planting.method === 'transplant-out')
    if (transplant === undefined) throw new Error('no transplant window')
    // thyme's own catalogue window opens in April (day 91, 75 days forward of the origin) once the
    // clamp stops the frost candidate from outrunning it. Unclamped this lands on day 361
    expect(forwardDays(anchors.origin, transplant.recommended)).toBeLessThanOrEqual(100)
  })
})

describe('dtmReference', () => {
  it('adds the raising period to a direct sow only when the DTM starts at transplant', async () => {
    const catalog = await catalogPromise
    const base = need(catalog, 'tomato')
    const raising = INDOOR_RAISING_DAYS[base.dliClass]
    expect(raising).toBeGreaterThan(0)

    const fromTransplant = calendarFor(withThermal(base, { dtmReference: 'transplant' }))
    const fromSow = calendarFor(withThermal(base, { dtmReference: 'sow' }))

    // same crop, same site: the reference point alone moves seed to harvest by the raising period
    expect(seedToHarvestDays(fromTransplant) - seedToHarvestDays(fromSow)).toBe(raising)
    expect(seedToHarvestDays(fromSow)).toBe(siteMaturityDays(base, siteFixture(), 155))
  })

  it('starts a transplant-referenced crop indoors ahead of the transplant date', async () => {
    const crop = need(await catalogPromise, 'tomato')
    const calendar = calendarFor(crop)
    const indoors = calendar.plantings.find((planting) => planting.method === 'start-indoors')
    const out = calendar.plantings.find((planting) => planting.method === 'transplant-out')
    expect(indoors).toBeDefined()
    expect(out).toBeDefined()
    expect(forwardDays(indoors?.recommended ?? 0, out?.recommended ?? 0)).toBe(
      INDOOR_RAISING_DAYS[crop.dliClass],
    )
  })

  it('never double counts the raising period on a sow-referenced crop', async () => {
    const crop = need(await catalogPromise, 'bean-bush')
    const calendar = calendarFor(crop)
    expect(crop.thermal?.dtmReference).toBe('sow')
    expect(calendar.plantings.some((planting) => planting.method === 'start-indoors')).toBe(false)
    expect(
      calendar.harvest.basis.kind === 'days-to-maturity' ? calendar.harvest.basis.backedOffDays : 0,
    ).toBe(siteMaturityDays(crop, siteFixture(), 155))
  })
})

describe('feasibility', () => {
  it('reports season-too-short with a shortfall rather than an optimistic date', async () => {
    const crop = need(await catalogPromise, 'watermelon')
    const short = siteFixture({
      frost: [
        {
          ...FROST_EVERY_YEAR,
          thresholdC: 0 as Celsius,
          lastSpringFreeze: { 10: 150, 20: 148, 30: 146, 40: 144, 50: 142 } as never,
          firstFallFreeze: { 10: 220, 20: 222, 30: 224, 40: 226, 50: 228 } as never,
          frostFreeDays: { 10: 70, 20: 74, 30: 78, 40: 82, 50: 86 } as never,
        },
      ],
      seasonGdd: { base4C: 900 as DegreeDaysC, base10C: 600 as DegreeDaysC, percentile: 20 },
    })
    const calendar = cropCalendar({
      crop,
      site: short,
      light: bedLightFixture('bed-a', 0),
      percentile: 20,
    })
    expect(calendar.feasibility.kind).toBe('season-too-short')
    if (calendar.feasibility.kind === 'season-too-short') {
      expect(calendar.feasibility.shortfallDays).toBeGreaterThan(0)
    }
    expect(calendar.plantings).toEqual([])
    expect(calendar.successions).toEqual([])
  })

  it('asks for an indoor start when only a transplant fits the season', async () => {
    const crop = withThermal(need(await catalogPromise, 'pepper-sweet'), { dtmReference: 'sow' })
    const site = siteFixture({
      frost: [
        {
          ...FROST_EVERY_YEAR,
          thresholdC: 0 as Celsius,
          lastSpringFreeze: { 10: 152, 20: 150, 30: 148, 40: 146, 50: 144 } as never,
          firstFallFreeze: { 10: 208, 20: 210, 30: 212, 40: 214, 50: 216 } as never,
          frostFreeDays: { 10: 56, 20: 60, 30: 64, 40: 68, 50: 72 } as never,
        },
      ],
    })
    const calendar = cropCalendar({
      crop,
      site,
      light: bedLightFixture('bed-a', 0),
      percentile: 20,
    })
    expect(calendar.feasibility.kind).toBe('needs-indoor-start')
    if (calendar.feasibility.kind === 'needs-indoor-start') {
      expect(calendar.feasibility.weeksBefore).toBeGreaterThan(0)
    }
    expect(calendar.plantings[0]?.method).toBe('start-indoors')
    // the DTM already runs from sowing, so raising indoors must not extend it
    expect(seedToHarvestDays(calendar)).toBe(siteMaturityDays(crop, site, 60))
  })

  it('closes the window under a bed that never reaches the crop minimum', async () => {
    const crop = need(await catalogPromise, 'tomato')
    const open = calendarFor(crop, 20, 0)
    const shaded = calendarFor(crop, 20, 0.85)
    expect(open.feasibility.kind).not.toBe('light-limited')
    expect(shaded.feasibility.kind).toBe('light-limited')
    if (shaded.feasibility.kind === 'light-limited') {
      expect(shaded.feasibility.month).toBeGreaterThanOrEqual(1)
      expect(shaded.feasibility.month).toBeLessThanOrEqual(12)
    }
    expect(shaded.plantings).toEqual([])
  })

  it('narrows a partly shaded bed to the months that clear the minimum', async () => {
    const base = need(await catalogPromise, 'lettuce-leaf')
    const crop = { ...base, window: { startMonth: 3, endMonth: 10 } }
    const site = siteFixture()
    const light = {
      ...bedLightFixture('bed-a', 0),
      // only June to August clear the 6 mol/m2/d leafy-green minimum in this bed
      monthlyMeanDliMolM2Day: monthly(
        [1, 1, 2, 3, 4, 14, 16, 15, 4, 2, 1, 1].map((value) => value as MolPerM2Day),
      ),
    }
    const window = adequateLightWindow(crop, site, light)
    expect(window).toEqual({ firstMonth: 6, lastMonth: 8 })
    const calendar = cropCalendar({ crop, site, light, percentile: 20 })
    const basis = calendar.plantings[0]?.basis
    expect(basis?.kind).toBe('light-window')
    expect(basis?.kind === 'light-window' ? basis.firstAdequateMonth : 0).toBe(6)
    expect(sowDay(calendar)).toBe(152)
  })

  /**
   * Apple now carries an extension harvest calendar (`perennialHarvest`), so its own harvest is
   * no longer the catalogue window: see the `perennial harvest dating` tests below for the dates
   * a crop with and without that figure get
   */
  it('gives a perennial a planting window and no invented maturity date', async () => {
    const crop = need(await catalogPromise, 'apple')
    const calendar = calendarFor(crop)
    expect(crop.thermal).toBeNull()
    expect(calendar.feasibility.kind).toBe('no-thermal-data')
    expect(calendar.plantings[0]?.method).toBe('transplant-out')
    expect(calendar.harvest.basis.kind).toBe('harvest-calendar')
  })

  /**
   * Dated from the spring floor, Brussels sprouts would be transplanted on 3 April and harvested in
   * the July heat, where every Extension sheet for the northeast sows them in late May for October.
   * A `fallHarvest` crop is dated from the autumn end: the one sowing is the latest that finishes
   * by the first fall freeze, and the harvest runs up to it
   */
  it('dates a fall-harvest crop from the first fall freeze, and offers no spring sowing', async () => {
    const sprouts = need(await catalogPromise, 'brussels-sprouts')
    expect(sprouts.fallHarvest).toBe(true)
    const calendar = calendarFor(sprouts)
    const anchors = seasonAnchors(siteFixture(), 20)
    expect(calendar.feasibility.kind).toBe('fits')
    const transplant = calendar.plantings.find((planting) => planting.method === 'transplant-out')
    if (transplant === undefined) throw new Error('no transplant window')
    // one sowing, not a spring one and an autumn one
    expect(
      calendar.plantings.filter((planting) => planting.method !== 'start-indoors'),
    ).toHaveLength(1)
    // late spring at the earliest, and the harvest closes at the frost
    expect(forwardDays(anchors.lastSpringFreeze, transplant.recommended)).toBeGreaterThan(30)
    expect(calendar.harvest.end).toBe(anchors.firstFallFreeze)
    expect(transplant.basis.kind).toBe('days-to-maturity')
    // the crop that is not a fall crop keeps its spring floor
    const spring = calendarFor({ ...sprouts, fallHarvest: false })
    expect(sowDay(spring) - anchors.lastSpringFreeze).toBeLessThan(30)
  })

  it('sows garlic in October for a site whose first fall freeze falls in late October', async () => {
    const garlic = need(await catalogPromise, 'garlic')
    const lateOctoberFrost = siteFixture({
      frost: [
        {
          ...FROST_EVERY_YEAR,
          thresholdC: 0 as Celsius,
          lastSpringFreeze: { 10: 130, 20: 125, 30: 120, 40: 115, 50: 110 } as never,
          firstFallFreeze: { 10: 295, 20: 301, 30: 305, 40: 309, 50: 313 } as never,
          frostFreeDays: { 10: 165, 20: 176, 30: 185, 40: 194, 50: 203 } as never,
        },
      ],
    })
    const calendar = calendarFor(garlic, 20, 0, lateOctoberFrost)
    expect(calendar.feasibility.kind).toBe('fits')
    expect(calendar.plantings.some((planting) => planting.method === 'start-indoors')).toBe(false)
    const day = sowDay(calendar)
    // October: day 274 is the 1st, day 304 the 31st
    expect(day).toBeGreaterThanOrEqual(274)
    expect(day).toBeLessThanOrEqual(304)
    // a clove sown in autumn is lifted the following summer, not the same one it went in
    expect(forwardDays(day, calendar.harvest.start)).toBeGreaterThan(200)
  })
})

/**
 * 64 perennials carry a figure from an extension harvest calendar, each read against the source
 * region's own median last spring freeze and median frost-free season, so the harvest sits on the
 * site's median season whatever frost risk the grower sets. The rest keep the catalogue growing
 * window
 */
describe('perennial harvest dating', () => {
  it("starts an after-last-freeze crop's harvest at the same share of the median season the source holds of its own", async () => {
    const strawberry = need(await catalogPromise, 'strawberry')
    if (strawberry.perennialHarvest?.kind !== 'after-last-freeze') {
      throw new Error('fixture crop lost its after-last-freeze harvest override')
    }
    const { afterFreezeDays, sourceSeasonDays } = strawberry.perennialHarvest
    const median = seasonAnchors(siteFixture(), 50)
    const calendar = calendarFor(strawberry)
    const expectedOffset = Math.round((afterFreezeDays * median.frostFreeDays) / sourceSeasonDays)
    expect(forwardDays(median.lastSpringFreeze, calendar.harvest.start)).toBe(expectedOffset)
    expect(forwardDays(calendar.harvest.start, calendar.harvest.end)).toBe(
      strawberry.harvestDurationDays,
    )
    expect(calendar.harvest.basis).toEqual({
      kind: 'harvest-calendar',
      afterFreezeDays,
      sourceSeasonDays,
      percentile: 50,
    })
    // the frost-risk setting moves planting and leaves the ripening alone
    expect(calendarFor(strawberry, 10).harvest).toEqual(calendar.harvest)
  })

  /**
   * Apple's source picks 89 of its own 212 day season off the freeze, a 42% share. A garden
   * season a world away from Oregon's should still start the picking at that same share of its
   * own season, whether that season runs short or long, so this checks the same crop at two sites
   * whose median seasons differ by nearly twice
   */
  it('places the harvest start at the same share of the season at two sites whose season lengths differ', async () => {
    const apple = need(await catalogPromise, 'apple')
    if (apple.perennialHarvest?.kind !== 'after-last-freeze') {
      throw new Error('fixture crop lost its after-last-freeze harvest override')
    }
    const { afterFreezeDays, sourceSeasonDays } = apple.perennialHarvest

    const shortSeasonSite = siteFixture()
    const longSeasonSite = siteFixture({
      frost: [
        {
          ...FROST_EVERY_YEAR,
          thresholdC: 0 as Celsius,
          lastSpringFreeze: { 10: 30, 20: 25, 30: 20, 40: 18, 50: 15 } as never,
          firstFallFreeze: { 10: 325, 20: 330, 30: 335, 40: 340, 50: 345 } as never,
          frostFreeDays: { 10: 295, 20: 305, 30: 315, 40: 322, 50: 330 } as never,
        },
      ],
    })

    const shortMedian = seasonAnchors(shortSeasonSite, 50)
    const longMedian = seasonAnchors(longSeasonSite, 50)
    expect(longMedian.frostFreeDays).toBeGreaterThan(shortMedian.frostFreeDays * 1.5)

    const shortCalendar = calendarFor(apple, 20, 0, shortSeasonSite)
    const longCalendar = calendarFor(apple, 20, 0, longSeasonSite)
    const shortOffset = forwardDays(shortMedian.lastSpringFreeze, shortCalendar.harvest.start)
    const longOffset = forwardDays(longMedian.lastSpringFreeze, longCalendar.harvest.start)

    expect(shortOffset).toBe(
      Math.round((afterFreezeDays * shortMedian.frostFreeDays) / sourceSeasonDays),
    )
    expect(longOffset).toBe(
      Math.round((afterFreezeDays * longMedian.frostFreeDays) / sourceSeasonDays),
    )
    // the same share of each season, within the rounding a whole day introduces
    expect(
      Math.abs(shortOffset / shortMedian.frostFreeDays - longOffset / longMedian.frostFreeDays),
    ).toBeLessThan(0.01)
  })

  /**
   * Horseradish is dug 185 days off the freeze against a source season of 178, 7 days past the
   * source's own fall freeze: the ground there has started freezing by the time it's dug, so that
   * excess counts on from the site's own fall freeze unscaled, the same 7 days wherever it's grown
   */
  it('places horseradish, whose source count runs past its own season, that many days after the median first fall freeze', async () => {
    const horseradish = need(await catalogPromise, 'horseradish')
    if (horseradish.perennialHarvest?.kind !== 'after-last-freeze') {
      throw new Error('fixture crop lost its after-last-freeze harvest override')
    }
    const { afterFreezeDays, sourceSeasonDays } = horseradish.perennialHarvest
    expect(afterFreezeDays).toBeGreaterThan(sourceSeasonDays)
    const median = seasonAnchors(siteFixture(), 50)
    const calendar = calendarFor(horseradish)
    expect(forwardDays(median.firstFallFreeze, calendar.harvest.start)).toBe(
      afterFreezeDays - sourceSeasonDays,
    )
    expect(forwardDays(calendar.harvest.start, calendar.harvest.end)).toBe(
      horseradish.harvestDurationDays,
    )
  })

  it('runs a whole-season crop from the median last spring freeze to the median first fall freeze', async () => {
    const thyme = need(await catalogPromise, 'thyme')
    expect(thyme.perennialHarvest?.kind).toBe('whole-season')
    const median = seasonAnchors(siteFixture(), 50)
    const calendar = calendarFor(thyme)
    expect(calendar.harvest.start).toBe(median.lastSpringFreeze)
    expect(calendar.harvest.end).toBe(median.firstFallFreeze)
    expect(calendar.harvest.basis).toEqual({
      kind: 'harvest-calendar',
      afterFreezeDays: null,
      sourceSeasonDays: null,
      percentile: 50,
    })
  })

  it('keeps the catalogue window for a perennial with no extension harvest calendar', async () => {
    const oregano = need(await catalogPromise, 'oregano')
    expect(oregano.perennialHarvest).toBeNull()
    const calendar = calendarFor(oregano)
    expect(calendar.harvest.basis.kind).toBe('catalog-window')
  })
})

/**
 * Pune: no frost in the thirty-year record. Read as a frost on 1 January and another on 31
 * December, the sentinel pair the curve answers with would make every annual measured from it
 * `season-too-short`, and "Plant every bed" would plant nothing. With no frost there is nothing to
 * offset from: every date is a soil-temperature date
 */
describe('a site with no frost in the record', () => {
  const pune = frostFreeSiteFixture()
  const ownLight = (rsr = 0): ReturnType<typeof bedLightFixture> =>
    bedLightFixture('bed-a', rsr, 36, pune.normals.monthlyMeanDliMolM2Day)
  const at = (crop: Crop, rsr = 0): CropCalendar =>
    cropCalendar({ crop, site: pune, light: ownLight(rsr), percentile: 20 })

  it('anchors the season on the coldest point of the year and spans the whole of it', () => {
    const anchors = seasonAnchors(pune, 20)
    expect(anchors.frostFree).toBe(true)
    expect(anchors.frostYears).toBe(0)
    expect(anchors.frostFreeDays).toBe(365)
    expect(anchors.lastSpringFreeze).toBe(anchors.origin)
    expect(anchors.firstFallFreeze).toBe(anchors.origin)
  })

  it('dates a tender crop by soil temperature alone, on the run below its heat cutoff', async () => {
    const tomato = need(await catalogPromise, 'tomato')
    const calendar = at(tomato)
    expect(calendar.feasibility.kind).toBe('fits')
    expect(calendar.plantings.every((planting) => planting.basis.kind !== 'frost-offset')).toBe(
      true,
    )
    const out = calendar.plantings.find((planting) => planting.method === 'transplant-out')
    if (out === undefined) throw new Error('no transplant window')
    expect(out.basis).toEqual({ kind: 'soil-temperature', minSoilTempC: 13, frostFree: true })
    // the warm archetype's 30 C cutoff rules out mid April to mid May, so the run opens in May
    expect(out.recommended).toBe(136)
    expect(forwardDays(out.earliest, out.latest)).toBeGreaterThan(200)
    // the raising period ahead of it, on the same basis
    expect(calendar.plantings[0]?.method).toBe('start-indoors')
    expect(forwardDays(calendar.plantings[0]?.recommended ?? 0, out.recommended)).toBe(
      INDOOR_RAISING_DAYS[tomato.dliClass],
    )
    // no frost cuts the harvest short
    expect(forwardDays(calendar.harvest.start, calendar.harvest.end)).toBe(
      tomato.harvestDurationDays,
    )
    expect(forwardDays(out.recommended, calendar.harvest.start)).toBeGreaterThanOrEqual(
      tomato.thermal?.daysToMaturity ?? 0,
    )
  })

  it('sows a crop the whole year suits at the start of the wet season Pune names', async () => {
    const lettuce = need(await catalogPromise, 'lettuce-leaf')
    const calendar = at(lettuce)
    const window = calendar.plantings[0]
    if (window === undefined) throw new Error('no sowing window')
    // Pune names a wet season, June to October, so the year-round window starts there, on 1
    // June, day 152. Without it the start would be the coldest month, 1 December, day 335
    expect(window.recommended).toBe(152)
    expect(window.earliest).toBe(152)
    expect(window.latest).toBe(151)
    expect(calendar.feasibility).toEqual({ kind: 'fits', slackDays: 364 })
    expect(calendar.successions.length).toBeGreaterThan(20)
    expect(calendar.notes).toContain(
      'The rains here fall mostly in June to October, and the sowing dates start with them',
    )
    expect(window.basis).toEqual({
      kind: 'soil-temperature',
      minSoilTempC: 5,
      frostFree: true,
      rains: true,
    })
  })

  it('gives a perennial a dated window rather than "no thermal data"', async () => {
    const moringa = need(await catalogPromise, 'moringa')
    const calendar = at(moringa)
    expect(calendar.feasibility.kind).toBe('fits')
    expect(calendar.plantings[0]?.method).toBe('transplant-out')
    expect(calendar.plantings[0]?.basis.kind).toBe('soil-temperature')
    expect(calendar.harvest.basis.kind).toBe('catalog-window')
  })

  it('closes the window on a bed too dark for the crop, as a light limit', async () => {
    const tomato = need(await catalogPromise, 'tomato')
    expect(at(tomato, 0.6).feasibility.kind).toBe('light-limited')
  })

  it('says how the dates were made and that the rains are not modelled', async () => {
    const calendar = at(need(await catalogPromise, 'tomato'))
    expect(calendar.notes).toContain(FROST_FREE_NOTE)
    expect(calendar.notes).not.toContain(CALENDAR_PROVENANCE_NOTE)
    // Pune's October also sits above its monthly mean, so the named run runs through it
    expect(calendar.notes).toContain(
      "The rains here fall mostly in June to October. This calendar doesn't model them, so sow with the rains as local practice says",
    )
    // Amherst's rain is even through the year, so it gets no such sentence
    expect(wetSeasonNote(siteFixture().normals.monthlyPrecipMm)).toBeNull()
  })

  it('gives every crop in the catalogue a window in a bright bed', async () => {
    const barren = (await catalogPromise).filter((crop) => at(crop).plantings.length === 0)
    expect(barren.map((crop) => crop.id)).toEqual([])
  })
})

/**
 * Nairobi has two rainy seasons, long rains March to May and short rains October/November to
 * December, and a rule keyed to the single wettest run of months would never name the second one
 */
describe('wetSeasonNote', () => {
  it("names both of a bimodal climate's rainy seasons, in calendar order", () => {
    expect(wetSeasonNote([50, 40, 90, 200, 150, 30, 15, 20, 25, 50, 150, 90])).toBe(
      "The rains here fall mostly in March to May and November to December. This calendar doesn't model them, so sow with the rains as local practice says",
    )
  })

  it('names no season where the months above the mean hold under 70% of the rain', () => {
    // seven months above the mean, holding 68% of the year's rain: too diffuse to call a season
    expect(wetSeasonNote([90, 90, 90, 90, 90, 90, 90, 60, 60, 60, 60, 60])).toBeNull()
  })
})

/**
 * A frost-free site's year-round window starts on the coldest month by default, which for
 * Nairobi is July, deep in its cool dry season, while its rains fall mostly March to May and
 * November to December. Where a wet season is named, the window starts there instead, at the
 * wetter of the two, watered or not: the coolest safe day the soil offers is worth less than the
 * day the rains actually start
 */
describe('a frost-free site whose year-round window follows the rains', () => {
  const nairobiLike = (): ReturnType<typeof frostFreeSiteFixture> =>
    frostFreeSiteFixture({
      normals: {
        ...frostFreeSiteFixture().normals,
        monthlyPrecipMm: [20, 20, 120, 200, 150, 20, 10, 10, 15, 20, 90, 65].map(
          (v) => v as Millimeters,
        ),
      },
    })

  it('starts the field window on 1 March, the wetter of two named rainy seasons, and still spans the year', async () => {
    const site = nairobiLike()
    expect(wetSeasonNote(site.normals.monthlyPrecipMm)).toBe(
      "The rains here fall mostly in March to May and November to December. This calendar doesn't model them, so sow with the rains as local practice says",
    )
    const lettuce = need(await catalogPromise, 'lettuce-leaf')
    const light = bedLightFixture('bed-a', 0, 36, site.normals.monthlyMeanDliMolM2Day)
    const calendar = cropCalendar({ crop: lettuce, site, light, percentile: 20 })
    const window = calendar.plantings[0]
    if (window === undefined) throw new Error('no sowing window')
    // 1 March is day 60
    expect(window.recommended).toBe(60)
    expect(window.earliest).toBe(60)
    expect(window.latest).toBe(59)
    expect(calendar.feasibility).toEqual({ kind: 'fits', slackDays: 364 })
    expect(calendar.notes).toContain(
      'The rains here fall mostly in March to May and November to December, and the sowing dates start with the March to May rains, the wettest of them',
    )
    expect(window.basis).toEqual({
      kind: 'soil-temperature',
      minSoilTempC: 5,
      frostFree: true,
      rains: true,
    })
  })

  it('keeps the coldest-month start where a frost-free site names no wet season', async () => {
    const site = frostFreeSiteFixture({
      normals: {
        ...frostFreeSiteFixture().normals,
        monthlyPrecipMm: new Array(12).fill(60).map((v) => v as Millimeters),
      },
    })
    expect(wetSeasonNote(site.normals.monthlyPrecipMm)).toBeNull()
    const lettuce = need(await catalogPromise, 'lettuce-leaf')
    const light = bedLightFixture('bed-a', 0, 36, site.normals.monthlyMeanDliMolM2Day)
    const calendar = cropCalendar({ crop: lettuce, site, light, percentile: 20 })
    const window = calendar.plantings[0]
    if (window === undefined) throw new Error('no sowing window')
    // December is the coldest month at Pune, and 1 December is day 335
    expect(window.recommended).toBe(335)
    expect(calendar.notes.some((note) => note.includes('sowing dates start with'))).toBe(false)
    expect(window.basis).toEqual({ kind: 'soil-temperature', minSoilTempC: 5, frostFree: true })
  })
})

/**
 * Melbourne: light frosts in six years of thirty, so the safest setting names a real pair that
 * wraps the year end and the usual setting names none. Read as a 1 July frost, the sentinel pair
 * would refuse tomato `season-too-short` there, since a maturity stretched over the whole-year heat
 * supply could never beat it
 */
describe('a southern site with frost in some years', () => {
  const MEANS = [20, 20, 18, 15, 12, 10, 9, 10, 12, 14, 17, 19]
  const OPEN_SKY = [40, 36, 28, 20, 14, 11, 12, 16, 22, 30, 36, 40]
  const melbourne = siteFixture({
    location: { latitudeDeg: -37.8 as DegreesLatitude, longitudeDeg: 145 as never },
    frost: [frostExceedanceCurve(dailyMinimaFixture(12, 8, true, 6, 5), 0 as Celsius, true)],
    normals: {
      ...siteFixture().normals,
      monthlyMeanTempC: MEANS.map((v) => v as Celsius),
      monthlyMeanDliMolM2Day: OPEN_SKY,
    },
    seasonGdd: { base4C: 3400 as DegreeDaysC, base10C: 1700 as DegreeDaysC, percentile: 20 },
  })
  const light = bedLightFixture('bed-a', 0, 36, OPEN_SKY)

  it('measures a real wrapped pair forward across the year end', async () => {
    const anchors = seasonAnchors(melbourne, 10)
    expect(anchors.frostFree).toBe(false)
    expect(anchors.lastSpringFreeze).toBeGreaterThan(anchors.firstFallFreeze)
    expect(anchors.frostFreeDays).toBe(
      forwardDays(anchors.lastSpringFreeze, anchors.firstFallFreeze),
    )
    expect(anchors.frostFreeDays).toBeGreaterThan(300)
    const calendar = cropCalendar({
      crop: need(await catalogPromise, 'tomato'),
      site: melbourne,
      light,
      percentile: 10,
    })
    expect(calendar.feasibility.kind).toBe('fits')
    const out = calendar.plantings.find((planting) => planting.method === 'transplant-out')
    // spring, south of the equator: 1 September is day 244 and 30 November day 334
    expect(out?.recommended).toBeGreaterThanOrEqual(244)
    expect(out?.recommended).toBeLessThanOrEqual(334)
  })

  it('gives tomato a spring soil-temperature window at the setting that names no frost', async () => {
    const anchors = seasonAnchors(melbourne, 20)
    expect(anchors.frostFree).toBe(true)
    expect(anchors.frostYears).toBe(6)
    const calendar = cropCalendar({
      crop: need(await catalogPromise, 'tomato'),
      site: melbourne,
      light,
      percentile: 20,
    })
    expect(calendar.feasibility.kind).toBe('fits')
    const out = calendar.plantings.find((planting) => planting.method === 'transplant-out')
    if (out === undefined) throw new Error('no transplant window')
    expect(out.basis.kind).toBe('soil-temperature')
    expect(out.recommended).toBeGreaterThanOrEqual(244)
    expect(out.recommended).toBeLessThanOrEqual(334)
    expect(forwardDays(out.recommended, calendar.harvest.start)).toBeLessThan(150)
  })
})

describe('successions and harvest', () => {
  it('spaces sowings at the catalogue interval while the last still beats the frost', async () => {
    const crop = need(await catalogPromise, 'lettuce-leaf')
    const calendar = calendarFor(crop)
    const interval = crop.successionIntervalDays ?? 0
    expect(interval).toBeGreaterThan(0)
    expect(calendar.successions.length).toBeGreaterThan(1)
    for (let index = 1; index < calendar.successions.length; index += 1) {
      expect(
        forwardDays(calendar.successions[index - 1] ?? 0, calendar.successions[index] ?? 0),
      ).toBe(interval)
    }
    const anchors = seasonAnchors(siteFixture(), 20)
    const last = calendar.successions[calendar.successions.length - 1] ?? (0 as DayOfYear)
    const fieldDays =
      calendar.harvest.basis.kind === 'days-to-maturity' ? calendar.harvest.basis.backedOffDays : 0
    expect(forwardDays(last, anchors.firstFallFreeze)).toBeGreaterThanOrEqual(fieldDays)
  })

  it('returns no succession schedule for a crop that has no interval', async () => {
    const crop = need(await catalogPromise, 'tomato')
    expect(crop.successionIntervalDays).toBeNull()
    expect(successionDays(crop, 100 as DayOfYear, 200 as DayOfYear)).toEqual([])
  })

  it('cuts a tender harvest at the first autumn freeze', async () => {
    const crop = need(await catalogPromise, 'tomato')
    const calendar = calendarFor(crop)
    const anchors = seasonAnchors(siteFixture(), 20)
    expect(forwardDays(calendar.harvest.start, calendar.harvest.end)).toBeLessThanOrEqual(
      forwardDays(calendar.harvest.start, anchors.firstFallFreeze),
    )
  })
})

describe('citations', () => {
  it('never attaches a citation the basis does not support', async () => {
    for (const crop of await catalogPromise) {
      const calendar = calendarFor(crop)
      for (const planting of calendar.plantings) {
        if (planting.basis.kind === 'light-window') {
          expect(planting.citations).toEqual(crop.light.dliMinMolM2Day.citations)
        } else if (planting.basis.kind === 'catalog-window') {
          expect(planting.citations).toEqual([])
        } else {
          expect(planting.citations).toEqual(['open-meteo'])
        }
      }
    }
  })
})

describe('determinism', () => {
  it('produces byte-identical calendars across runs', async () => {
    const crop = need(await catalogPromise, 'lettuce-leaf')
    expect(JSON.stringify(calendarFor(crop))).toBe(JSON.stringify(calendarFor(crop)))
  })

  it('produces an identical plan across runs and ranks the shade-tolerant crop first', async () => {
    const [catalog, companionRules, rotationConstraints] = await Promise.all([
      catalogPromise,
      loadCompanionRules(),
      loadRotationConstraints(),
    ])
    const bed = bedFixture('bed-a')
    const input = {
      site: siteFixture(),
      plot: plotFixture([bed]),
      bedLight: [bedLightFixture('bed-a', 0.3)],
      catalog,
      companionRules,
      rotationConstraints,
    }
    const first = autoRecommend(input)
    const second = autoRecommend(input)
    expect(JSON.stringify(first)).toBe(JSON.stringify(second))

    const plans = first.beds[0]?.ranked ?? []
    expect(plans.length).toBe(catalog.length)
    expect(first.beds[0]?.calendar.entries.length).toBe(catalog.length)
    const recommended = plans.filter(
      (plan) => plan.recommendation.outcome.verdict === 'recommended',
    )
    expect(recommended.length).toBeGreaterThan(0)
    // a recommendation the calendar cannot deliver never outranks one it can
    expect(recommended.map((plan) => plan.score)).toEqual(
      [...recommended.map((plan) => plan.score)].sort((a, b) => b - a),
    )
    for (const plan of recommended) expect(plan.calendar.feasibility.kind).not.toBe('light-limited')
    for (const plan of plans) {
      if (plan.recommendation.outcome.verdict !== 'recommended')
        expect(plan.limiting).not.toBeNull()
    }
  })

  it('discards the pipeline score of a crop whose calendar cannot deliver', () => {
    expect(calendarConfidence({ kind: 'season-too-short', shortfallDays: 10 as Days })).toBe(0)
    expect(calendarConfidence({ kind: 'light-limited', month: 5 })).toBe(0)
    expect(calendarConfidence({ kind: 'fits', slackDays: 60 as Days })).toBe(1)
    expect(calendarConfidence({ kind: 'fits', slackDays: 0 as Days })).toBeLessThan(1)
  })
})
