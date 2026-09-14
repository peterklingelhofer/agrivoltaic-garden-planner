import { describe, expect, it } from 'bun:test'
import {
  shadedBySurroundings,
  SURROUNDINGS_CLAIM,
  SURROUNDINGS_SHADE,
  surroundingsNote,
} from './surroundings'
import { bedLightFixture } from './testkit'

describe('what already surrounds a space', () => {
  it('leaves an open-sky bed exactly as the bake read it', () => {
    const light = bedLightFixture('bed-1', 0.2)
    expect(shadedBySurroundings(light, 'open')).toBe(light)
  })

  it('dims the under-array light and leaves the open-sky reference alone, so the shade compounds', () => {
    const light = bedLightFixture('bed-1', 0.2)
    const shaded = shadedBySurroundings(light, 'partly-sheltered')
    const keep = 1 - SURROUNDINGS_SHADE['partly-sheltered']
    for (let month = 0; month < 12; month += 1) {
      expect(shaded.monthlyMeanDliMolM2Day[month]).toBeCloseTo(
        (light.monthlyMeanDliMolM2Day[month] ?? 0) * keep,
        6,
      )
      expect(shaded.monthlyMinDliMolM2Day[month]).toBeCloseTo(
        (light.monthlyMinDliMolM2Day[month] ?? 0) * keep,
        6,
      )
      expect(shaded.monthlyOpenSkyDliMolM2Day[month]).toBe(light.monthlyOpenSkyDliMolM2Day[month])
      // a fifth taken by the panels and three tenths by the surroundings is 1 - 0.8 x 0.7
      expect(shaded.monthlyRsr[month]).toBeCloseTo(
        1 - (1 - (light.monthlyRsr[month] ?? 0)) * keep,
        6,
      )
    }
    expect(shaded.annualMeanDliMolM2Day).toBeCloseTo(light.annualMeanDliMolM2Day * keep, 6)
    expect(shaded.skyViewFactor).toBe(light.skyViewFactor)
  })

  it('takes more off a space in shade most of the day than one shaded part of it', () => {
    const light = bedLightFixture('bed-1', 0)
    const part = shadedBySurroundings(light, 'partly-sheltered')
    const most = shadedBySurroundings(light, 'overshadowed')
    expect(most.annualMeanDliMolM2Day).toBeLessThan(part.annualMeanDliMolM2Day)
    expect(SURROUNDINGS_SHADE.overshadowed).toBeGreaterThan(SURROUNDINGS_SHADE['partly-sheltered'])
  })

  it('says what it did on the light step, and nothing for open sky', () => {
    expect(surroundingsNote('open')).toBeNull()
    expect(surroundingsNote('partly-sheltered')).toContain('30%')
    expect(surroundingsNote('overshadowed')).toContain('60%')
    expect(SURROUNDINGS_CLAIM.provenance).toBe('unsourced')
  })
})
