import { describe, expect, it } from 'bun:test'
import type { Obstruction } from '../types/garden'
import type { SiteExposure } from '../types/onboarding'
import type { Fraction, Meters } from '../types/units'
import {
  answersInForce,
  drawnPhrase,
  shadedBySurroundings,
  SURROUNDINGS_CLAIM,
  SURROUNDINGS_SHADE,
  surroundingsInForce,
  surroundingsNote,
  surroundingsShare,
} from './surroundings'
import { bedLightFixture } from './testkit'

/** One of the three cards, with no figure typed */
const card = (exposure: SiteExposure) => ({ exposure, surroundingsShadePercent: null })

/** A figure typed over a card, which it stands in for */
const typed = (percent: number, exposure: SiteExposure = 'open') => ({
  exposure,
  surroundingsShadePercent: percent,
})

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
    expect(shadedBySurroundings(light, SURROUNDINGS_SHADE.open)).toBe(light)
  })

  it('dims the under-array light and leaves the open-sky reference alone, so the shade compounds', () => {
    const light = bedLightFixture('bed-1', 0.2)
    const shaded = shadedBySurroundings(light, SURROUNDINGS_SHADE['partly-sheltered'])
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

  it('scales the mean by 0.7 for a space shaded part of the day and leaves the baked mean as the bake read it', () => {
    const light = bedLightFixture('bed-1', 0.2)
    const shaded = shadedBySurroundings(light, SURROUNDINGS_SHADE['partly-sheltered'])
    for (let month = 0; month < 12; month += 1) {
      expect(shaded.monthlyMeanDliMolM2Day[month]).toBeCloseTo(
        (light.monthlyMeanDliMolM2Day[month] ?? 0) * 0.7,
        6,
      )
    }
    expect(shaded.monthlyBakedMeanDliMolM2Day).toEqual(light.monthlyMeanDliMolM2Day)
  })

  it('takes more off a space in shade most of the day than one shaded part of it', () => {
    const light = bedLightFixture('bed-1', 0)
    const part = shadedBySurroundings(light, SURROUNDINGS_SHADE['partly-sheltered'])
    const most = shadedBySurroundings(light, SURROUNDINGS_SHADE.overshadowed)
    expect(most.annualMeanDliMolM2Day).toBeLessThan(part.annualMeanDliMolM2Day)
    expect(SURROUNDINGS_SHADE.overshadowed).toBeGreaterThan(SURROUNDINGS_SHADE['partly-sheltered'])
  })

  it('says what it did on the light step, and nothing for open sky', () => {
    expect(surroundingsNote(card('open'), [])).toBeNull()
    expect(surroundingsNote(card('partly-sheltered'), [])).toContain('30%')
    expect(surroundingsNote(card('overshadowed'), [])).toContain('60%')
    expect(SURROUNDINGS_CLAIM.provenance).toBe('unsourced')
  })

  it('says what a typed figure took off, in the percent as typed, and nothing for a figure of 0', () => {
    expect(surroundingsNote(typed(45, 'overshadowed'), [])).toBe(
      "Your figure of 45% shade takes 45% off every figure here before the panels do. The map on the ground shows the panels' shade alone.",
    )
    expect(surroundingsNote(typed(42.6), [])).toContain('Your figure of 43% shade takes 43% off')
    expect(surroundingsNote(typed(0, 'overshadowed'), [])).toBeNull()
  })

  it('says what was drawn took the place of the answer, whatever the answer was', () => {
    expect(surroundingsNote(card('open'), [house('house-1')])).toBe(
      "A house you drew shades every figure here and the map on the ground. Your answer to what is around the space isn't applied while a house or a tree is drawn.",
    )
    expect(surroundingsNote(card('overshadowed'), [house('house-1')])).toBe(
      surroundingsNote(card('open'), [house('house-1')]),
    )
    expect(surroundingsNote(typed(45), [house('house-1')])).toBe(
      surroundingsNote(card('open'), [house('house-1')]),
    )
  })

  it('names houses in the plural once more than one is drawn', () => {
    expect(surroundingsNote(card('open'), [house('house-1'), house('house-2')])).toBe(
      "2 houses you drew shade every figure here and the map on the ground. Your answer to what is around the space isn't applied while a house or a tree is drawn.",
    )
  })

  it('names a tree the same way, and a house and a tree together', () => {
    expect(surroundingsNote(card('open'), [tree('tree-1')])).toBe(
      "A tree you drew shades every figure here and the map on the ground. Your answer to what is around the space isn't applied while a house or a tree is drawn.",
    )
    expect(surroundingsNote(card('open'), [house('house-1'), tree('tree-1')])).toBe(
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

describe('the share the surroundings answer takes', () => {
  it("is the card's share while no figure is typed", () => {
    expect(surroundingsShare(card('open'))).toBe(SURROUNDINGS_SHADE.open)
    expect(surroundingsShare(card('partly-sheltered'))).toBe(SURROUNDINGS_SHADE['partly-sheltered'])
    expect(surroundingsShare(card('overshadowed'))).toBe(SURROUNDINGS_SHADE.overshadowed)
  })

  it('is the typed figure over 100 once one is typed, whatever the card says', () => {
    expect(surroundingsShare(typed(45, 'overshadowed'))).toBeCloseTo(0.45, 12)
    expect(surroundingsShare(typed(0, 'overshadowed'))).toBe(0)
    expect(surroundingsShare(typed(100))).toBe(1)
  })

  it('holds a figure outside 0 to 100 to the range', () => {
    expect(surroundingsShare(typed(150))).toBe(1)
    expect(surroundingsShare(typed(-5, 'overshadowed'))).toBe(0)
  })
})

describe('which answer the surroundings share reads', () => {
  it('is the answer given with nothing drawn, card or figure', () => {
    expect(surroundingsInForce([], card('overshadowed'))).toBe(SURROUNDINGS_SHADE.overshadowed)
    expect(surroundingsInForce([], card('open'))).toBe(0)
    expect(surroundingsInForce([], typed(45, 'partly-sheltered'))).toBeCloseTo(0.45, 12)
  })

  it('is nothing the moment a house stands, whatever was answered or typed', () => {
    expect(surroundingsInForce([house('house-1')], card('overshadowed'))).toBe(0)
    expect(surroundingsInForce([house('house-1'), house('house-2')], typed(45))).toBe(0)
  })

  it('is nothing the moment a tree stands too', () => {
    expect(surroundingsInForce([tree('tree-1')], card('overshadowed'))).toBe(0)
    expect(surroundingsInForce([tree('tree-1')], typed(80, 'partly-sheltered'))).toBe(0)
  })

  /** The layout search is handed these answers, so they have to say what the share above says */
  it('gives the search open sky and no figure while anything is drawn, and the answers otherwise', () => {
    const given = { ...typed(45, 'overshadowed'), ambition: 'leafy-and-herbs' as const }
    expect(answersInForce([], given)).toBe(given)
    expect(answersInForce([house('house-1')], given)).toEqual({
      exposure: 'open',
      surroundingsShadePercent: null,
      ambition: 'leafy-and-herbs',
    })
    expect(answersInForce([tree('tree-1')], card('partly-sheltered'))).toEqual(card('open'))
  })
})
