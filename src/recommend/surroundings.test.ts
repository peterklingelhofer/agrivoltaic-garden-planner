import { describe, expect, it } from 'bun:test'
import type { Obstruction } from '../types/garden'
import type { Fraction, Meters } from '../types/units'
import {
  drawnPhrase,
  exposureInForce,
  shadedBySurroundings,
  SURROUNDINGS_CLAIM,
  SURROUNDINGS_SHADE,
  surroundingsNote,
} from './surroundings'
import { bedLightFixture } from './testkit'

const house = (id: string): Obstruction => ({
  id: id as Obstruction['id'],
  kind: 'house',
  label: 'House 1',
  footprint: { exterior: [], holes: [] },
  heightM: 6 as Obstruction['heightM'],
})

const tree = (id: string): Obstruction => ({
  id: id as Obstruction['id'],
  kind: 'tree',
  label: 'Tree 1',
  footprint: { exterior: [], holes: [] },
  crownBaseM: 2 as Meters,
  heightM: 7 as Meters,
  evergreen: false,
  transmittance: 0.033 as Fraction,
  leaflessTransmittance: 0.46 as Fraction,
})

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
    expect(surroundingsNote('open', [])).toBeNull()
    expect(surroundingsNote('partly-sheltered', [])).toContain('30%')
    expect(surroundingsNote('overshadowed', [])).toContain('60%')
    expect(SURROUNDINGS_CLAIM.provenance).toBe('unsourced')
  })

  it('says what was drawn took the place of the answer, whatever the answer was', () => {
    expect(surroundingsNote('open', [house('house-1')])).toBe(
      "A house you drew shades every figure here and the map on the ground. Your answer to what is around the space isn't applied while a house or a tree is drawn.",
    )
    expect(surroundingsNote('overshadowed', [house('house-1')])).toBe(
      surroundingsNote('open', [house('house-1')]),
    )
  })

  it('names houses in the plural once more than one is drawn', () => {
    expect(surroundingsNote('open', [house('house-1'), house('house-2')])).toBe(
      "2 houses you drew shade every figure here and the map on the ground. Your answer to what is around the space isn't applied while a house or a tree is drawn.",
    )
  })

  it('names a tree the same way, and a house and a tree together', () => {
    expect(surroundingsNote('open', [tree('tree-1')])).toBe(
      "A tree you drew shades every figure here and the map on the ground. Your answer to what is around the space isn't applied while a house or a tree is drawn.",
    )
    expect(surroundingsNote('open', [house('house-1'), tree('tree-1')])).toBe(
      "A house and a tree you drew shade every figure here and the map on the ground. Your answer to what is around the space isn't applied while a house or a tree is drawn.",
    )
  })
})

describe('drawnPhrase', () => {
  it('counts each kind, and joins two kinds with "and"', () => {
    expect(drawnPhrase([house('house-1')])).toBe('a house')
    expect(drawnPhrase([tree('tree-1')])).toBe('a tree')
    expect(drawnPhrase([house('house-1'), tree('tree-1')])).toBe('a house and a tree')
    expect(drawnPhrase([house('house-1'), house('house-2')])).toBe('2 houses')
    expect(drawnPhrase([house('house-1'), house('house-2'), tree('tree-1')])).toBe(
      '2 houses and a tree',
    )
  })

  it('is empty with nothing drawn', () => {
    expect(drawnPhrase([])).toBe('')
  })
})

describe('which answer the surroundings share reads', () => {
  it('is the answer given with nothing drawn', () => {
    expect(exposureInForce([], 'overshadowed')).toBe('overshadowed')
    expect(exposureInForce([], 'open')).toBe('open')
  })

  it('is open the moment a house stands, whatever was answered', () => {
    expect(exposureInForce([house('house-1')], 'overshadowed')).toBe('open')
    expect(exposureInForce([house('house-1'), house('house-2')], 'partly-sheltered')).toBe('open')
  })

  it('is open the moment a tree stands too', () => {
    expect(exposureInForce([tree('tree-1')], 'overshadowed')).toBe('open')
  })
})
