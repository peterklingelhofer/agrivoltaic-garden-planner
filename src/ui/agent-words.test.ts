import { beforeAll, describe, expect, it } from 'bun:test'
import { loadCropCatalog } from '../data/crops'
import type { Crop } from '../types/crop'
import type { CropId } from '../types/ids'
import { fraction } from '../types/units'
import { wordsFor } from './agent-words'
import { formatLength } from './format'

let catalog: readonly Crop[] = []
beforeAll(async () => {
  catalog = await loadCropCatalog()
})

/**
 * A resize is said in the unit the design is kept in, and the light's state is said as it is:
 * `useAutoLight` computes it again by itself unless auto-run is off
 */
describe('the words for a resized plot', () => {
  it('prints the sides in feet when the design is in feet, rounded', () => {
    const lines = wordsFor(
      {
        kind: 'resized',
        widthM: 12.192,
        depthM: 12.192,
        fromAreaM2: null,
        unit: 'ft',
        recomputing: true,
      },
      [],
    )
    expect(lines[0]?.text).toMatch(/^The plot is 40(\.0)? ft by 40(\.0)? ft now\.$/)
    expect(lines[1]?.text).toBe('The light is being computed again for the new shape.')
  })

  it('names the area a square came from, and calls the light stale only when auto-run is off', () => {
    const lines = wordsFor(
      {
        kind: 'resized',
        widthM: 4.31,
        depthM: 4.31,
        fromAreaM2: 18.58,
        unit: 'ft',
        recomputing: false,
      },
      [],
    )
    expect(lines[0]?.text).toMatch(/^200 sq ft is about 14(\.1)? ft by 14(\.1)? ft, a square/)
    expect(lines[1]?.tone).toBe('caveat')
  })

  it('keeps meters when the design is in meters', () => {
    const lines = wordsFor(
      { kind: 'resized', widthM: 6, depthM: 4, fromAreaM2: null, unit: 'm', recomputing: true },
      [],
    )
    // the app's own meter formatter, two decimals under ten, so one rule prints every length
    expect(lines[0]?.text).toBe(
      `The plot is ${formatLength(6, 'm')} by ${formatLength(4, 'm')} now.`,
    )
  })
})

describe('the words for what the planner left out unasked', () => {
  it('counts them and names a few, with the reasons left to the plants step', () => {
    const lines = wordsFor(
      { kind: 'left-out', count: 20, sample: ['apple', 'apricot'] as CropId[] },
      catalog,
    )
    expect(lines[0]?.text).toBe(
      'It also left out 20 others, such as apple and apricot. The plants step lists each one with its reason.',
    )
    expect(lines[0]?.tone).toBe('note')
  })
})

describe('the words for a crop and its light', () => {
  it('say in each bed whether the light is what limits the crop', () => {
    const lines = wordsFor(
      {
        kind: 'crop-light',
        cropId: 'tomato' as CropId,
        beds: [
          { label: 'Bed 1', dliMolM2Day: 18.2, limiting: null },
          {
            label: 'Bed 2',
            dliMolM2Day: 9.1,
            limiting: {
              stage: 'light-gate',
              cause: { kind: 'dli-minimum', month: 5 },
              membership: fraction(0.2),
              explanation: '',
            },
          },
          {
            label: 'Bed 3',
            dliMolM2Day: 17,
            limiting: {
              stage: 'soil-water',
              cause: { kind: 'root-depth' },
              membership: fraction(0.3),
              explanation: '',
            },
          },
        ],
      },
      catalog,
    )
    expect(lines[0]?.text).toMatch(/^In Bed 1 tomato has the light it needs: 18\.2 mol/)
    expect(lines[1]?.text).toMatch(
      /^In Bed 2 the light falls short for tomato: not enough light in May/,
    )
    expect(lines[2]?.text).toMatch(/^In Bed 3 the light is not what limits tomato: /)
  })
})

describe('the words for a garden', () => {
  it('name the plantings and print the area in the design unit', () => {
    const lines = wordsFor(
      {
        kind: 'garden',
        summary: {
          locationLabel: 'Pitman',
          bedCount: 2,
          arrayCount: 1,
          plantingCount: 2,
          plantedCropIds: ['tomato', 'lettuce-leaf'] as CropId[],
          plotAreaM2: 111.5,
          unit: 'ft',
        },
      },
      catalog,
    )
    expect(lines[0]?.text).toMatch(/over about 1,?200 sq ft\.$/)
    expect(lines[1]?.text).toBe('2 plantings in the beds: tomato and leaf lettuce.')
  })
})

describe('the words for the layouts offered', () => {
  it('give each layout its own electricity and bed count', () => {
    const lines = wordsFor(
      {
        kind: 'designs',
        archetypes: ['food-first', 'no-array-control'],
        recommended: 'food-first',
        notConsidered: [],
        figures: [
          { archetype: 'food-first', annualAcKwh: 4200, bedsWithLight: 3, bedCount: 4 },
          { archetype: 'no-array-control', annualAcKwh: 0, bedsWithLight: 4, bedCount: 4 },
        ],
      },
      catalog,
    )
    expect(lines[1]?.text).toMatch(/^Food first, my pick: about 4,?200 kWh a year, 3 of 4 beds/)
    expect(lines[2]?.text).toMatch(/^No panels at all: no electricity, 4 of 4 beds/)
  })
})

describe('the words for moved panels and for a crop that is not planted', () => {
  it('say the light follows a move while auto-run is on', () => {
    const lines = wordsFor(
      {
        kind: 'panels-adjusted',
        change: 'taller',
        clearanceM: 2.6,
        pitchM: 9,
        tiltDeg: 25,
        recomputing: true,
      },
      catalog,
    )
    expect(lines[1]?.text).toBe('The light is being computed again for where they are now.')
    expect(lines[1]?.tone).toBe('say')
  })

  it('agree the verb with two crops', () => {
    const lines = wordsFor(
      { kind: 'not-planted', cropIds: ['lettuce-leaf', 'lettuce-head'] as CropId[] },
      catalog,
    )
    expect(lines[0]?.text).toBe("leaf lettuce and head lettuce aren't in any of your beds.")
  })
})
