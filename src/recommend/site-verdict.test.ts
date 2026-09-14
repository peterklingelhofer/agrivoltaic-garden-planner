import { describe, expect, it } from 'bun:test'
import { loadCropCatalog } from '../data/crops'
import type { Celsius } from '../types/units'
import { climateSentence, siteVerdict, waterSentence } from './site-verdict'
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

  it('refuses the woodland perennials a tropical highland on their winter, and says so', async () => {
    const catalog = await catalogPromise
    const verdict = siteVerdict(nairobi(), catalog, 20)
    expect(verdict.refused['cold-winter']).toBeGreaterThanOrEqual(3)
    expect(climateSentence(verdict)).toContain('pass the climate check')
    expect(climateSentence(verdict)).toContain('colder winters')
  })

  it('grades the share in three plain words', () => {
    const refused = { hardiness: 0, chill: 0, 'cold-winter': 0, 'season-gdd': 0, 'fao-ecocrop': 0 }
    expect(climateSentence({ total: 100, fits: 80, refused })).toContain('Most of the catalogue')
    expect(climateSentence({ total: 100, fits: 50, refused })).toContain('About half')
    expect(climateSentence({ total: 100, fits: 20, refused })).toContain('Few of the')
    expect(climateSentence({ total: 100, fits: 100, refused })).not.toContain('The rest')
  })

  it('names what the refused crops would need, most common first, three at most', () => {
    const sentence = climateSentence({
      total: 10,
      fits: 2,
      refused: { hardiness: 1, chill: 2, 'cold-winter': 1, 'season-gdd': 4, 'fao-ecocrop': 0 },
    })
    expect(sentence).toBe(
      "Few of the catalogue's crops grow in this climate: 2 of 10 crops pass the climate check. The rest need a longer season (4), colder winters (3) and milder winters (1).",
    )
  })

  it('reads rain against use off the balance the site already ran', () => {
    expect(waterSentence(siteFixture())).toContain('watering is a backup')
    expect(waterSentence(hotDesertSiteFixture())).toContain('about 9%')
    expect(waterSentence(frostFreeSiteFixture())).toContain('plan to water')
  })
})
