import { describe, expect, it } from 'bun:test'
import { cropById, loadCropCatalog } from '../../data/crops'
import type { Crop } from '../../types/crop'
import type { CropId } from '../../types/ids'
import { ecocropMembership } from '../membership'
import { CHILL_CEILING_C } from '../../data/agronomy'
import { frostFreeSiteFixture, hotDesertSiteFixture, siteFixture } from '../testkit'
import {
  chillGate,
  climateFit,
  climateGate,
  coldWinterGate,
  growingSeasonMeanTempC,
  isPerennial,
  seasonLengthDays,
} from './climate-gate'

const catalogPromise = loadCropCatalog()

const need = (catalog: readonly Crop[], id: string): Crop => {
  const crop = cropById(catalog, id as CropId)
  if (crop === undefined) throw new Error(`missing fixture crop ${id}`)
  return crop
}

describe('the temperatures a crop actually stands in', () => {
  it('rules a cool-season perennial out of a desert bed on the summer it cannot leave', async () => {
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
    // the last two are perennials, and they are the point: a desert bed keeps the perennials whose
    // own envelope reaches a desert July, so this is a hot limb and not a ban on standing crops
    for (const id of ['okra', 'cowpea', 'sorghum-sudangrass', 'rosemary', 'fig'])
      expect(climateGate(need(catalog, id), phoenix, 20).passed).toBe(true)
  })

  /**
   * The misclassification the hot limb exposed rather than caused. Thyme, oregano, sage, winter
   * savory and hyssop are Mediterranean-basin sub-shrubs that sat on the temperate
   * `hardy-perennial` envelope and its 34 C ceiling, while rosemary, the same family from the same
   * region, sat on the subtropical one, so only which archetype an author happened to pick decided
   * whether a desert gardener was offered thyme. Those five now borrow the subtropical hot limb in
   * `rows.ts` and nothing else, and this pins both ends of that: the herbs are admitted at Phoenix,
   * the genuinely temperate perennials the hot limb exists to catch are still refused there on the
   * same July, and the herbs' cold end is untouched so a cold garden still reads them as it did
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
    // answer for a hop bine and a horseradish root, not collateral damage
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
   * ECOCROP floor, which is why winter is hardiness' job and not this one; reading the coldest
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
            soilPh: site.soil.phUnits,
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

  it('asks nothing of a crop that does not carry the flag, whatever the winter', async () => {
    const catalog = await catalogPromise
    const flagged = catalog.filter((crop) => crop.coldWinterOnly).map((crop) => crop.id)
    expect(flagged.sort()).toEqual(['ramps', 'teaberry', 'wild-ginger'])
    for (const crop of catalog)
      if (!crop.coldWinterOnly) expect(coldWinterGate(crop, highlandTropics()).passed).toBe(true)
  })
})

// olive carries the catalogue's 150-hour chill figure (De Melo-Abreu et al. 2004, Sahli et al.
// 2012); Pune never reaches it and Phoenix's 180 clears it
describe('olive is gated on its catalogue chill figure', () => {
  it('is refused where the site accumulates no chill and passes where it clears 150 hours', async () => {
    const catalog = await catalogPromise
    const olive = need(catalog, 'olive')
    expect(chillGate(olive, frostFreeSiteFixture()).passed).toBe(false)
    expect(chillGate(olive, hotDesertSiteFixture()).passed).toBe(true)
  })
})
