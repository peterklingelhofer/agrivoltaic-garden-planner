import { describe, expect, it } from 'bun:test'
import { cropById, loadCropCatalog } from '../../data/crops'
import type { Crop, PhotoperiodTrigger } from '../../types/crop'
import type { CropId } from '../../types/ids'
import type { FrostExceedanceCurve } from '../../types/site'
import type { DegreesLatitude, DegreesLongitude } from '../../types/units'
import { ecocropMembership } from '../membership'
import { CHILL_CEILING_C } from '../../data/agronomy'
import { frostFreeSiteFixture, hotDesertSiteFixture, siteFixture } from '../testkit'
import {
  chillGate,
  climateFit,
  climateGate,
  coldWinterGate,
  ecocropGate,
  growingSeasonMeanTempC,
  hardinessGate,
  isPerennial,
  photoperiodGate,
  seasonGddGate,
  seasonLengthDays,
  shortDaysFrom,
} from './climate-gate'

const catalogPromise = loadCropCatalog()

const need = (catalog: readonly Crop[], id: string): Crop => {
  const crop = cropById(catalog, id as CropId)
  if (crop === undefined) throw new Error(`missing fixture crop ${id}`)
  return crop
}

describe('the temperatures a crop actually stands in', () => {
  it("rules a cool-season perennial out of a desert bed on the summer it can't leave", async () => {
    const catalog = await catalogPromise
    const phoenix = hotDesertSiteFixture()
    const ramps = need(catalog, 'ramps')
    // the diagnosis: ramps' window is months 3 to 5, which at Phoenix averages a benign 23 C,
    // while the 36 C July it sits through as a dormant bulb is the month that decides the matter
    expect(growingSeasonMeanTempC(ramps, phoenix)).toBeCloseTo(23, 0)
    expect(ramps.envelope.temperatureC.absoluteMax).toBeLessThan(
      Math.max(...phoenix.normals.monthlyMeanTempC),
    )

    const outcome = climateGate(ramps, phoenix, 20)
    expect(outcome.passed).toBe(false)
    expect(outcome.limiting?.cause).toEqual({ kind: 'fao-ecocrop', parameter: 'temperature' })
    expect(climateFit(ramps, phoenix, 20, true)).toBe(0)
  })

  it('still admits the crops a desert bed genuinely suits', async () => {
    const catalog = await catalogPromise
    const phoenix = hotDesertSiteFixture()
    // the last two are perennials, and they're the point: a desert bed keeps the perennials whose
    // own envelope reaches a desert July, so this is a hot limb
    for (const id of ['okra', 'cowpea', 'sorghum-sudangrass', 'rosemary', 'fig'])
      expect(climateGate(need(catalog, id), phoenix, 20).passed).toBe(true)
  })

  /**
   * Thyme, oregano, sage, winter savory and hyssop are Mediterranean-basin sub-shrubs, the same
   * family as rosemary and from the same region. They borrow the subtropical hot limb in `rows.ts`
   * and nothing else, and this pins both ends of that: the herbs are admitted at Phoenix, the
   * temperate perennials the hot limb exists to catch are still refused there on the same July, and
   * the herbs keep the temperate cold end, so a cold garden reads them as it reads tarragon
   */
  it('admits the Mediterranean herbs at Phoenix without letting the woodland perennials back in', async () => {
    const catalog = await catalogPromise
    const phoenix = hotDesertSiteFixture()
    const home = siteFixture()
    const temperateFloor = need(catalog, 'tarragon').envelope.temperatureC.absoluteMin
    const subtropicalCeiling = need(catalog, 'rosemary').envelope.temperatureC.absoluteMax
    for (const id of ['thyme', 'oregano', 'sage', 'winter-savory', 'hyssop']) {
      const herb = need(catalog, id)
      expect(isPerennial(herb)).toBe(true)
      expect(herb.envelope.temperatureC.absoluteMax).toBe(subtropicalCeiling)
      expect(herb.envelope.temperatureC.absoluteMin).toBe(temperateFloor)
      expect(climateGate(herb, phoenix, 20).passed).toBe(true)
      expect(climateFit(herb, phoenix, 20, true)).toBeGreaterThan(0)
      expect(climateGate(herb, home, 20).passed).toBe(true)
      expect(climateFit(herb, home, 20, true)).toBe(
        climateFit(need(catalog, 'tarragon'), home, 20, true),
      )
    }
    // the first three are woodland and heath perennials, the last three are the temperate crops
    // deliberately left on `hardy-perennial`: being ruled out of a Phoenix summer is the right
    // answer for a hop bine and a horseradish root
    for (const id of [
      'ramps',
      'wild-ginger',
      'teaberry',
      'hops',
      'horseradish',
      'jerusalem-artichoke',
    ]) {
      const outcome = climateGate(need(catalog, id), phoenix, 20)
      expect(outcome.passed).toBe(false)
      expect(outcome.limiting?.cause).toEqual({ kind: 'fao-ecocrop', parameter: 'temperature' })
      expect(climateFit(need(catalog, id), phoenix, 20, true)).toBe(0)
    }
  })

  /**
   * The limb deliberately NOT added. A dormant apple survives a month whose mean sits below its
   * ECOCROP floor, which is why winter is hardiness' job. Reading the coldest
   * month here as well would refuse every temperate perennial its own home
   */
  it('never judges a perennial on the winter it sleeps through', async () => {
    const catalog = await catalogPromise
    const home = siteFixture()
    const apple = need(catalog, 'apple')
    expect(Math.min(...home.normals.monthlyMeanTempC)).toBeLessThan(
      apple.envelope.temperatureC.absoluteMin,
    )
    expect(climateGate(apple, home, 20).passed).toBe(true)
    expect(climateFit(apple, home, 20, true)).toBeGreaterThan(0)
  })

  it('leaves a temperate perennial alone where its summer is inside the envelope', async () => {
    const catalog = await catalogPromise
    const home = siteFixture()
    for (const crop of catalog.filter(isPerennial))
      if (crop.envelope.temperatureC.absoluteMax > Math.max(...home.normals.monthlyMeanTempC))
        expect(climateGate(crop, home, 20).limiting?.cause).not.toEqual({
          kind: 'fao-ecocrop',
          parameter: 'temperature',
        })
  })

  it('judges every annual on its growing window alone, exactly as before', async () => {
    const catalog = await catalogPromise
    for (const site of [siteFixture(), hotDesertSiteFixture()])
      for (const crop of catalog.filter((candidate) => !isPerennial(candidate))) {
        const windowOnly = ecocropMembership(
          crop.envelope,
          {
            meanTempC: growingSeasonMeanTempC(crop, site),
            annualRainfallMm: site.normals.monthlyPrecipMm.reduce<number>((a, b) => a + b, 0),
            seasonLengthDays: seasonLengthDays(site, 20),
            koppenCode: site.koppenCode,
          },
          true,
        )
        expect(climateFit(crop, site, 20, true)).toBe(windowOnly.overall)
      }
  })
})

/**
 * Nairobi, as the site model reads it: Cfb, no frost, every month between 15 and 20 C. Inside the
 * cool-perennial envelope in every month, so on temperature alone ramps, western wild ginger and
 * eastern teaberry would head a shaded bed there
 */
const highlandTropics = (): ReturnType<typeof siteFixture> =>
  siteFixture({
    koppenCode: 'Cfb',
    hardiness: [{ scheme: 'usda-2023', extremeMinTempC: 5 as never, zoneLabel: '11b' }],
    normals: {
      ...siteFixture().normals,
      monthlyMeanTempC: [19, 20, 20, 19, 18, 16, 15, 15, 17, 18, 18, 18].map((v) => v as never),
    },
  })

describe('a plant recorded wild only where winters are cold', () => {
  it('is refused a winter that never reaches the chilling band, and told why', async () => {
    const catalog = await catalogPromise
    for (const site of [highlandTropics(), frostFreeSiteFixture()])
      for (const id of ['ramps', 'wild-ginger', 'teaberry']) {
        const crop = need(catalog, id)
        expect(crop.coldWinterOnly).toBe(true)
        const outcome = coldWinterGate(crop, site)
        expect(outcome.passed).toBe(false)
        expect(outcome.limiting?.cause).toEqual({ kind: 'cold-winter' })
        expect(outcome.limiting?.explanation).toContain(`${String(CHILL_CEILING_C)} C`)
      }
    // the highland is inside the envelope in every month, so the winter is the reason given. At
    // Pune the envelope refuses the 30 C summer first, and that is the reason a gardener reads
    // there
    for (const id of ['ramps', 'wild-ginger', 'teaberry'])
      expect(climateGate(need(catalog, id), highlandTropics(), 20).limiting?.cause).toEqual({
        kind: 'cold-winter',
      })
  })

  it('keeps its own home, where the coldest month sits under the band', async () => {
    const catalog = await catalogPromise
    const home = siteFixture()
    expect(Math.min(...home.normals.monthlyMeanTempC)).toBeLessThanOrEqual(CHILL_CEILING_C)
    for (const id of ['ramps', 'wild-ginger', 'teaberry'])
      expect(coldWinterGate(need(catalog, id), home).passed).toBe(true)
  })

  it("asks nothing of a crop that doesn't carry the flag, whatever the winter", async () => {
    const catalog = await catalogPromise
    const flagged = catalog.filter((crop) => crop.coldWinterOnly).map((crop) => crop.id)
    expect(flagged.sort()).toEqual(['ramps', 'teaberry', 'wild-ginger'])
    for (const crop of catalog)
      if (!crop.coldWinterOnly) expect(coldWinterGate(crop, highlandTropics()).passed).toBe(true)
  })
})

// olive carries the catalog's 150-hour chill figure (De Melo-Abreu et al. 2004, Sahli et al.
// 2012). Pune never reaches it and Phoenix's 180 clears it
describe('olive is gated on its catalog chill figure', () => {
  it('is refused where the site accumulates no chill and passes where it clears 150 hours', async () => {
    const catalog = await catalogPromise
    const olive = need(catalog, 'olive')
    expect(chillGate(olive, frostFreeSiteFixture()).passed).toBe(false)
    expect(chillGate(olive, hotDesertSiteFixture()).passed).toBe(true)
  })
})

const withTrigger = (crop: Crop, change: Partial<PhotoperiodTrigger>): Crop => {
  if (crop.photoperiod === null) throw new Error(`${crop.id} carries no day-length figures`)
  return { ...crop, photoperiod: { ...crop.photoperiod, ...change } }
}

/**
 * The fixture's frost dates moved half a year on, for a site in the southern hemisphere: the last
 * spring freeze falls near day 300 and the first fall freeze near day 110. The frost-free days
 * stay the northern curve's own, since moving every date together leaves each span as it was
 */
const southernFrost = (): FrostExceedanceCurve => {
  const [north] = siteFixture().frost
  if (north === undefined) throw new Error('the fixture site has no frost curve')
  type Dates = FrostExceedanceCurve['firstFallFreeze']
  return {
    ...north,
    lastSpringFreeze: { 10: 312, 20: 307, 30: 302, 40: 297, 50: 292 } as Dates,
    firstFallFreeze: { 10: 92, 20: 97, 30: 102, 40: 107, 50: 112 } as Dates,
  }
}

// by `dayLengthHours`, days at 42.37 N first run shorter than 12.75 hours on day 251 (Sep 8), and
// at 42.37 S on day 65 (Mar 6). The fixture site's first fall freeze at the 50 percent level is
// day 295 (Oct 22), 123 days after June 21 and 44 after the days shorten, against the 70.5 days
// winged bean needs from there to a first pod
describe('a short-day crop needs its days to a harvest before the first fall freeze', () => {
  it('refuses winged bean at the fixture site, where the days shorten too late', async () => {
    const catalog = await catalogPromise
    const outcome = photoperiodGate(need(catalog, 'winged-bean'), siteFixture(), 50)
    expect(outcome.passed).toBe(false)
    expect(outcome.limiting?.stage).toBe('climate-gate')
    expect(outcome.limiting?.cause).toEqual({ kind: 'photoperiod' })
    expect(outcome.limiting?.explanation).toContain('Sep 8')
    expect(outcome.limiting?.membership).toBeCloseTo(44 / 70.5, 6)
  })

  it('keeps winged bean at a frost-free site in South Florida', async () => {
    const catalog = await catalogPromise
    const bean = need(catalog, 'winged-bean')
    const location = {
      latitudeDeg: 25.76 as DegreesLatitude,
      longitudeDeg: -80.19 as DegreesLongitude,
    }
    expect(photoperiodGate(bean, frostFreeSiteFixture({ location }), 50).passed).toBe(true)
    // under the fixture's frost dates the same days are refused, so it's the frost-free record
    // that keeps the crop
    expect(photoperiodGate(bean, siteFixture({ location }), 50).passed).toBe(false)
  })

  it('counts from December 21 at a southern site, where the days shorten on Mar 6', async () => {
    const catalog = await catalogPromise
    const site = siteFixture({
      location: {
        latitudeDeg: -42.37 as DegreesLatitude,
        longitudeDeg: -71.11 as DegreesLongitude,
      },
      frost: [southernFrost()],
    })
    const outcome = photoperiodGate(need(catalog, 'winged-bean'), site, 50)
    expect(outcome.passed).toBe(false)
    expect(outcome.limiting?.cause).toEqual({ kind: 'photoperiod' })
    expect(outcome.limiting?.explanation).toContain('Mar 6')
  })

  it('passes a harvest that lands on the freeze day and refuses one a day later', async () => {
    const catalog = await catalogPromise
    const bean = need(catalog, 'winged-bean')
    const home = siteFixture()
    const harvestIn = (toHarvestDays: number): boolean =>
      photoperiodGate(withTrigger(bean, { toHarvestDays }), home, 50).passed
    expect(harvestIn(44)).toBe(true)
    expect(harvestIn(45)).toBe(false)
  })

  it('asks nothing of a crop with no day-length figures, and only winged bean has them', async () => {
    const catalog = await catalogPromise
    const tomato = need(catalog, 'tomato')
    expect(tomato.photoperiod).toBeNull()
    expect(photoperiodGate(tomato, siteFixture(), 50).passed).toBe(true)
    expect(catalog.filter((crop) => crop.photoperiod !== null).map((crop) => crop.id)).toEqual([
      'winged-bean',
    ])
  })

  it('refuses a critical length the year never reaches, and says what the days are for', async () => {
    const catalog = await catalogPromise
    const bean = need(catalog, 'winged-bean')
    // days at 5 N run between about 11.7 and 12.3 hours, so none is shorter than 10
    const tropics = siteFixture({
      location: { latitudeDeg: 5 as DegreesLatitude, longitudeDeg: -75 as DegreesLongitude },
    })
    const flowers = photoperiodGate(withTrigger(bean, { criticalHours: 10 }), tropics, 50)
    expect(flowers.limiting?.explanation).toBe(
      'Days here never get shorter than 10 hours, which this crop needs to flower',
    )
    const roots = photoperiodGate(
      withTrigger(bean, { criticalHours: 10, triggers: 'storage-organ' }),
      tropics,
      50,
    )
    expect(roots.limiting?.explanation).toBe(
      "Days here never get shorter than 10 hours, which this crop needs to form the roots or tubers it's grown for",
    )
  })

  it('finds the first day that starts a run of short days long enough for a harvest', async () => {
    const trigger = need(await catalogPromise, 'winged-bean').photoperiod
    if (trigger === null) throw new Error('winged bean carries no day-length figures')
    expect(shortDaysFrom(trigger, 42.37, 172)).toBe(251)
    expect(shortDaysFrom(trigger, -42.37, 355)).toBe(65)
    // days at 25.76 N are shorter than 12.75 hours from day 236 (Aug 24) to day 110 (Apr 20),
    // across the new year: 240 days in one run
    expect(shortDaysFrom(trigger, 25.76, 172)).toBe(236)
    // a start inside the run counts from itself while the run still has 71 days left, the 70.5
    // days to a harvest rounded up: day 40 has 71, day 41 has 70 and waits for August
    expect(shortDaysFrom(trigger, 25.76, 300)).toBe(300)
    expect(shortDaysFrom(trigger, 25.76, 40)).toBe(40)
    expect(shortDaysFrom(trigger, 25.76, 41)).toBe(236)
    // days at 5 N stay under 12.75 hours all year, which is one run that has started
    expect(shortDaysFrom(trigger, 5, 172)).toBe(172)
  })

  it('finds no run where the short days are fewer than the days to a harvest', async () => {
    const trigger = need(await catalogPromise, 'winged-bean').photoperiod
    if (trigger === null) throw new Error('winged bean carries no day-length figures')
    expect(shortDaysFrom({ ...trigger, toHarvestDays: 240 }, 25.76, 172)).toBe(236)
    expect(shortDaysFrom({ ...trigger, toHarvestDays: 241 }, 25.76, 172)).toBeNull()
    expect(shortDaysFrom({ ...trigger, criticalHours: 10 }, 5, 172)).toBeNull()
  })

  it('refuses a site whose days never stay short long enough, frost or not', async () => {
    const catalog = await catalogPromise
    const bean = need(catalog, 'winged-bean')
    const location = {
      latitudeDeg: 25.76 as DegreesLatitude,
      longitudeDeg: -80.19 as DegreesLongitude,
    }
    const frostFree = frostFreeSiteFixture({ location })
    // the one run of short days at 25.76 N is 240 days, and this crop needs 300 to a harvest
    for (const site of [frostFree, siteFixture({ location })]) {
      const outcome = photoperiodGate(withTrigger(bean, { toHarvestDays: 300 }), site, 50)
      expect(outcome.passed).toBe(false)
      expect(outcome.limiting?.cause).toEqual({ kind: 'photoperiod' })
      expect(outcome.limiting?.membership).toBe(0)
      expect(outcome.limiting?.explanation).toBe(
        'Days here never stay shorter than 12.75 hours long enough for this crop to flower',
      )
    }
    // a harvest the run holds is no reason to refuse a frost-free site, as before
    expect(photoperiodGate(withTrigger(bean, { toHarvestDays: 240 }), frostFree, 50).passed).toBe(
      true,
    )
    // and days that never get shorter at all are refused at a frost-free site too
    const tropics = frostFreeSiteFixture({
      location: { latitudeDeg: 5 as DegreesLatitude, longitudeDeg: -75 as DegreesLongitude },
    })
    const outcome = photoperiodGate(withTrigger(bean, { criticalHours: 10 }), tropics, 50)
    expect(outcome.limiting?.explanation).toBe(
      'Days here never get shorter than 10 hours, which this crop needs to flower',
    )
  })

  it('is the reason the whole climate gate gives at the fixture site, where nothing else refuses', async () => {
    const catalog = await catalogPromise
    const bean = need(catalog, 'winged-bean')
    const home = siteFixture()
    for (const outcome of [
      hardinessGate(bean, home),
      chillGate(bean, home),
      seasonGddGate(bean, home, 50),
      ecocropGate(bean, home, 50, true),
      coldWinterGate(bean, home),
    ])
      expect(outcome.passed).toBe(true)
    expect(climateGate(bean, home, 50).limiting?.cause).toEqual({ kind: 'photoperiod' })
  })

  it('leaves a site whose season is too short to the season gate, which comes first', async () => {
    const catalog = await catalogPromise
    const short = siteFixture({
      seasonGdd: { base4C: 300 as never, base10C: 300 as never, percentile: 20 },
    })
    expect(climateGate(need(catalog, 'winged-bean'), short, 50).limiting?.cause).toEqual({
      kind: 'season-gdd',
    })
  })
})
