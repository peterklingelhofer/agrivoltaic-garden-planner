import { describe, expect, it } from 'bun:test'
import { loadCropCatalog } from '../data/crops'
import type { Crop } from '../types/crop'
import type { CropId } from '../types/ids'
import type { Celsius, DegreesLatitude, DegreesLongitude, MillimetersPerYear } from '../types/units'
import { climateRest, climateSentence, siteVerdict, waterSentence } from './site-verdict'
import { frostFreeSiteFixture, hotDesertSiteFixture, siteFixture } from './testkit'

const catalogPromise = loadCropCatalog()

/** Nairobi as the site model reads it: Cfb, no frost, every month between 15 and 20 C */
const nairobi = () =>
  siteFixture({
    koppenCode: 'Cfb',
    hardiness: [{ scheme: 'usda-2023', extremeMinTempC: 5 as Celsius, zoneLabel: '11b' }],
    normals: {
      ...siteFixture().normals,
      monthlyMeanTempC: [19, 20, 20, 19, 18, 16, 15, 15, 17, 18, 18, 18].map((v) => v as Celsius),
    },
  })

describe('how a place grows, before any bed exists', () => {
  it('counts what the climate gate admits and why it refuses the rest', async () => {
    const catalog = await catalogPromise
    const home = siteVerdict(siteFixture(), catalog, 20)
    expect(home.total).toBe(catalog.length)
    expect(home.fits).toBeGreaterThan(catalog.length / 2)
    const total = home.fits + Object.values(home.refused).reduce((a, b) => a + b, 0)
    expect(total).toBe(catalog.length)
  })

  it('counts a crop the latitude refuses apart from one the frost refuses', async () => {
    const catalog = await catalogPromise
    const bean = catalog.find((crop) => crop.id === ('winged-bean' as CropId)) as Crop
    const trigger = bean.photoperiod
    if (trigger === null) throw new Error('winged bean carries no day-length trigger')
    // at 5 N every day is shorter than 12.75 hours and none is shorter than 10: a crop that
    // needs 10 is refused for the latitude, at a site with no frost to blame
    const tropics = frostFreeSiteFixture({
      location: { latitudeDeg: 5 as DegreesLatitude, longitudeDeg: -75 as DegreesLongitude },
    })
    const needsTen: Crop = { ...bean, photoperiod: { ...trigger, criticalHours: 10 } }
    const verdict = siteVerdict(tropics, [needsTen], 50)
    expect(verdict.refused['photoperiod-latitude']).toBe(1)
    expect(verdict.refused.photoperiod).toBe(0)
    expect(climateRest(verdict)).toBe('The rest need shorter days (1).')
    // and at the fixture site the bean itself is refused for the frost, as before
    const home = siteVerdict(siteFixture(), [bean], 50)
    expect(home.refused.photoperiod).toBe(1)
    expect(climateRest(home)).toBe('The rest need a later first frost (1).')
  })

  it('reads the same whatever the site pH is, since soil is scored at the bed', async () => {
    const catalog = await catalogPromise
    const home = siteFixture()
    const acidic = siteFixture({ soil: { ...home.soil, phUnits: 4.9 } })
    expect(siteVerdict(acidic, catalog, 20)).toEqual(siteVerdict(home, catalog, 20))
  })

  it('refuses the woodland perennials a tropical highland on their winter, and says so', async () => {
    const catalog = await catalogPromise
    const verdict = siteVerdict(nairobi(), catalog, 20)
    expect(verdict.refused['cold-winter']).toBeGreaterThanOrEqual(3)
    expect(climateSentence(verdict)).toContain('of the catalog')
    expect(climateRest(verdict)).toContain('colder winters')
  })

  it('grades the share in three plain words', () => {
    const refused = {
      hardiness: 0,
      chill: 0,
      photoperiod: 0,
      'photoperiod-latitude': 0,
      'cold-winter': 0,
      'season-gdd': 0,
      'fao-ecocrop': 0,
    }
    expect(climateSentence({ total: 100, fits: 80, refused })).toContain('Most of the catalog')
    expect(climateSentence({ total: 100, fits: 50, refused })).toContain('About half')
    expect(climateSentence({ total: 100, fits: 20, refused })).toContain('Few of the')
    expect(climateRest({ total: 100, fits: 100, refused })).toBeNull()
  })

  it('names what the refused crops would need, most common first, three at most', () => {
    const verdict = {
      total: 10,
      fits: 2,
      refused: {
        hardiness: 1,
        chill: 2,
        photoperiod: 0,
        'photoperiod-latitude': 0,
        'cold-winter': 1,
        'season-gdd': 4,
        'fao-ecocrop': 0,
      },
    }
    expect(climateSentence(verdict)).toBe(
      "Few of the catalog's crops grow in this climate: 2 of 10 crops.",
    )
    expect(climateRest(verdict)).toBe(
      'The rest need a longer season (4), colder winters (3) and milder winters (1).',
    )
  })

  it('reads rain against use off the balance the site already ran', () => {
    expect(waterSentence(siteFixture())).toContain('watering is a backup')
    expect(waterSentence(hotDesertSiteFixture())).toContain('about 9%')
    expect(waterSentence(frostFreeSiteFixture())).toContain('plan to water')
  })

  it("never says rain covers use when it falls short, even where the site isn't officially limited", () => {
    const site = siteFixture({
      waterLimitation: {
        ...siteFixture().waterLimitation,
        rainfallMm: 624 as MillimetersPerYear,
        referenceEtMm: 902 as MillimetersPerYear,
        limited: false,
      },
    })
    const sentence = waterSentence(site)
    expect(sentence).toContain('about 69%')
    expect(sentence).toContain('watering is a backup')
    expect(sentence).not.toContain('covers')
  })
})
