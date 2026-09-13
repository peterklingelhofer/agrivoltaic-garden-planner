import { describe, expect, it } from 'bun:test'
import { CITATION_IDS } from '../types/citation-ids.generated'
import { bedLightFixture } from './testkit'
import { frostReading, OPEN_SKY_ABOVE, SHELTERED_BELOW, shelterOf } from './frost'

/**
 * The app computed a sky view factor per ground cell from the first bake and spent it on a debug
 * overlay and a sub-one-percent optical term. It is the same geometry that decides how much heat
 * a bed loses to the sky at night, and the agrivoltaics document section 3.6 had already computed both that this
 * follows and what may honestly be said about it.
 *
 * So these test restraint as much as they test wiring. The dangerous failure here is not silence,
 * it is a number: a degree of frost margin, a shifted planting date, a longer season. None of
 * those is supported by anything, and the assertions below are what stops one appearing later
 */

const bedAt = (skyViewFactor: number) => ({
  ...bedLightFixture('bed-1', 1 - skyViewFactor),
  skyViewFactor: skyViewFactor as never,
})

describe('what a bed sees of the sky', () => {
  it('reads as open ground where almost all of the sky is visible', () => {
    expect(shelterOf(1)).toBe('open')
    expect(shelterOf(OPEN_SKY_ABOVE)).toBe('open')
  })

  it('reads as sheltered only once a real share of the sky is gone', () => {
    expect(shelterOf(SHELTERED_BELOW - 0.01)).toBe('sheltered')
    expect(shelterOf(SHELTERED_BELOW)).toBe('partial')
    expect(shelterOf(0.75)).toBe('partial')
  })
})

describe('the sentence a sheltered bed gets', () => {
  const reading = frostReading(bedAt(0.5))

  it('states the geometry it was derived from, as a percentage', () => {
    expect(reading.claim.value).toContain('50%')
    expect(reading.skyViewFactor).toBe(0.5)
  })

  it('names the kind of frost it helps with and the kind it does not', () => {
    expect(reading.claim.value).toMatch(/radiative frost/i)
    expect(reading.claim.value).toMatch(/cold air mass/i)
  })

  it('says in as many words that no temperature is being claimed', () => {
    expect(reading.claim.value).toMatch(/no temperature is claimed/i)
  })

  /**
   * The failure this guards against is the one a reader is most likely to invent for themselves:
   * fewer frosts must mean a longer, warmer season, so the heat-loving crop that never ripens
   * here would ripen under a panel. Shade cuts daytime warming too, and the agrivoltaics document section 3.2 finds
   * soil cooling under panels to be the consistent temperature result
   */
  it('promises no degrees, no dates and no extra season anywhere in it', () => {
    const text = `${reading.claim.value} ${reading.claim.caveat ?? ''}`
    expect(text).not.toMatch(/\d+\s*(°|deg|degrees?\b|C\b)/)
    expect(text).not.toMatch(/longer season|warmer season|extra weeks|ripen/i)
  })

  it('says the site frost dates and the chill figure are untouched by it', () => {
    expect(reading.claim.caveat).toMatch(/frost curve|frost date/i)
    expect(reading.claim.caveat).toMatch(/chill/i)
  })

  /**
   * Milder nights mean LESS chill accumulation, not more, and this app gates perennials on chill.
   * A caveat that got the direction wrong would be worse than no caveat
   */
  it('has the chill direction the right way round', () => {
    expect(reading.claim.caveat).toMatch(/reduce chill|fewer chill|reduce chill accumulation/i)
  })

  it('carries its sources, and they are real ones', () => {
    expect(reading.claim.provenance).toBe('inferred')
    expect(reading.claim.tier).toBe('C')
    for (const id of reading.claim.citations) {
      expect(CITATION_IDS as readonly string[]).toContain(id)
    }
  })
})

describe('the sentence an unshaded bed gets', () => {
  const reading = frostReading(bedAt(1))

  it('claims nothing, because there is nothing overhead to claim it for', () => {
    expect(reading.shelter).toBe('open')
    expect(reading.claim.value).toMatch(/open ground/i)
    expect(reading.claim.value).not.toMatch(/frost cloth/i)
  })
})
