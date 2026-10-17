import { beforeAll, describe, expect, it } from 'bun:test'
import type { ArrayAssumptions, BedLightVerdict, NamedBalance, Utterance } from '../agent/reply'
import { loadCropCatalog } from '../data/crops'
import {
  bedFixture,
  bedLightFixture,
  plotFixture,
  siteFixture,
  tmyFixture,
} from '../recommend/testkit'
import { ready } from '../state/slices'
import { energyReportFixture } from '../state/testkit'
import { waterBalanceView } from '../state/water'
import type { ComplianceCheck } from '../types/compliance'
import type { Crop } from '../types/crop'
import type { CropId } from '../types/ids'
import { fraction } from '../types/units'
import { wordsFor } from './agent-words'
import { formatLength } from './format'
import { NOT_A_DETERMINATION } from './onboarding'

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

  it('says one line for every bed when the verdict is the same in each', () => {
    const limiting = {
      stage: 'soil-water',
      cause: { kind: 'soil-ph' },
      membership: 0,
      explanation: 'pH 4.8 is below the 5.5 tomato tolerates',
    } as unknown as NonNullable<BedLightVerdict['limiting']>
    const lines = wordsFor(
      {
        kind: 'crop-light',
        cropId: 'tomato' as CropId,
        beds: [
          { label: 'Bed 1', dliMolM2Day: 30.7, limiting },
          { label: 'Bed 2', dliMolM2Day: 30.7, limiting },
          { label: 'Bed 3', dliMolM2Day: 30.7, limiting },
        ],
      },
      catalog,
    )
    expect(lines).toHaveLength(1)
    expect(lines[0]?.text).toMatch(/^In every bed the light is not what limits tomato: /)
  })

  it('says the shade ceiling once, with no second verdict after it', () => {
    const lines = wordsFor(
      {
        kind: 'crop-light',
        cropId: 'tomato' as CropId,
        beds: [
          {
            label: 'Bed 1',
            dliMolM2Day: 30.7,
            limiting: {
              stage: 'light-gate',
              cause: { kind: 'max-design-rsr' },
              membership: fraction(0.1),
              explanation: '',
            },
          },
        ],
      },
      catalog,
    )
    expect(lines[0]?.text).toBe(
      'In Bed 1 the shade is more than tomato takes, with 30.7 mol/m²/d over its season.',
    )
    expect(lines[0]?.text).not.toContain('more shade here than it can take')
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
        rowCount: 3,
        unit: 'm',
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

/**
 * The same clause in three answers: where the panels were moved, and under both electricity
 * figures. A design kept in feet is told in feet, and one row has no spacing to be told
 */
describe('the words for the array a figure assumes', () => {
  const array: ArrayAssumptions = {
    clearanceM: 2.6,
    pitchM: 9,
    rowCount: 3,
    unit: 'm',
    tiltDeg: 25,
  }

  const answers = (given: ArrayAssumptions): readonly (readonly [string, Utterance])[] => [
    ['panels-adjusted', { kind: 'panels-adjusted', change: 'taller', recomputing: true, ...given }],
    ['energy', { kind: 'energy', report: energyReportFixture(), assumptions: given }],
    [
      'season-energy',
      { kind: 'season-energy', energyKwh: 4200, yearLabel: '2024', assumptions: given },
    ],
  ]

  const headroom = (utterance: Utterance): string =>
    wordsFor(utterance, catalog).find((line) => line.text.includes('of headroom'))?.text ?? ''

  it.each(answers(array))('%s prints meters in a design kept in meters', (_kind, utterance) => {
    expect(headroom(utterance)).toContain(
      `${formatLength(2.6, 'm')} of headroom, rows ${formatLength(9, 'm')} apart, tilted 25 degrees`,
    )
  })

  it.each(answers({ ...array, unit: 'ft' }))(
    '%s prints feet in a design kept in feet',
    (_kind, utterance) => {
      const text = headroom(utterance)
      expect(text).toContain(
        `${formatLength(2.6, 'ft')} of headroom, rows ${formatLength(9, 'ft')} apart, tilted 25 degrees`,
      )
      expect(text).not.toMatch(/\d m\b/)
    },
  )

  it.each(answers({ ...array, rowCount: 1 }))(
    '%s names no row spacing for a one-row array',
    (_kind, utterance) => {
      const text = headroom(utterance)
      expect(text).toContain(`${formatLength(2.6, 'm')} of headroom, tilted 25 degrees`)
      expect(text).not.toContain('apart')
    },
  )
})

describe('the words for a question with no garden in it', () => {
  it('says it has nothing on that, and adds no caveat about cost and permission', () => {
    const lines = wordsFor({ kind: 'out-of-scope', topic: 'other' }, [])
    expect(lines).toEqual([
      {
        text: "I have nothing on that. This computes the light, the crops and the electricity for a garden plan, and that's all it knows.",
        tone: 'say',
      },
    ])
  })

  it('keeps that caveat on the topics it is about', () => {
    const lines = wordsFor({ kind: 'out-of-scope', topic: 'cost' }, [])
    expect(lines[1]?.tone).toBe('caveat')
    expect(lines[1]?.text).toBe(
      "Cost, planning permission, grid connection and mounting structure weren't considered at all.",
    )
  })
})

/**
 * Real balances off the water engine, because one is far too large a type to build by hand. The
 * beds are named apart from their ids, so a line that printed an id would show
 */
const balancesOf = (
  beds: readonly (readonly [label: string, rsr: number])[],
): readonly NamedBalance[] => {
  const view = waterBalanceView({
    site: ready(siteFixture()),
    weather: ready(tmyFixture()),
    plot: plotFixture(beds.map(([label], at) => bedFixture(`bed-${String(at)}`, { label }))),
    bedLight: beds.map(([, rsr], at) => bedLightFixture(`bed-${String(at)}`, rsr)),
    catalog: ready([]),
  })
  return view.balances.map((balance, at) => ({ label: beds[at]?.[0] ?? '', balance }))
}

describe('the words for the water the beds need', () => {
  const apart = balancesOf([
    ['Herb bed', 0.3],
    ['Kale bed', 0.1],
  ])
  const alike = balancesOf([
    ['Herb bed', 0.2],
    ['Kale bed', 0.2],
  ])

  it('names each bed, and says the shade is under the panels where there are panels', () => {
    const lines = wordsFor({ kind: 'water', balances: apart, hasPanels: true }, [])
    expect(lines[1]?.text).toMatch(
      /^Herb bed: in the open [\d.]+-[\d.]+ mm, under the panels [\d.]+-[\d.]+ mm\.$/,
    )
    expect(lines[2]?.text).toMatch(
      /^Kale bed: in the open [\d.]+-[\d.]+ mm, under the panels [\d.]+-[\d.]+ mm\.$/,
    )
  })

  it('does not say "under the panels" on a plot that has none', () => {
    const lines = wordsFor({ kind: 'water', balances: apart, hasPanels: false }, [])
    expect(lines[1]?.text).toMatch(
      /^Herb bed: in the open [\d.]+-[\d.]+ mm, with the shade it has [\d.]+-[\d.]+ mm\.$/,
    )
    expect(lines.map((line) => line.text).join(' ')).not.toContain('under the panels')
  })

  it('still folds beds that read alike into one line, whatever they are called', () => {
    for (const hasPanels of [true, false]) {
      const lines = wordsFor({ kind: 'water', balances: alike, hasPanels }, [])
      const shaded = hasPanels ? 'under the panels' : 'with the shade it has'
      expect(lines[1]?.text).toMatch(
        new RegExp(
          `^All 2 beds alike\\. In the open [\\d.]+-[\\d.]+ mm, ${shaded} [\\d.]+-[\\d.]+ mm\\.$`,
        ),
      )
      expect(lines[1]?.text).not.toContain('Herb bed')
    }
  })
})

/**
 * The compliance answer outside Massachusetts. The one rule the app can check is another state's
 * there, and the verdict on it reads as the grower's own unless the next line says otherwise
 */
describe('the words for the rules checked in another state', () => {
  const check = (id: ComplianceCheck['regime']['id']): ComplianceCheck => ({
    regime: {
      id,
      label: `rule ${id}`,
      verifiability: 'estimate-only',
      determinationBarrier: 'the program decides',
      citations: [] as unknown as ComplianceCheck['regime']['citations'],
    },
    results: [],
    overall: 'meets-expedited-parameters',
    isDetermination: false,
  })
  const NOT_HERE =
    "This garden isn't in Massachusetts, so this rule doesn't apply here. It's shown because it's the only dual-use rule the app can check a layout against."

  it('says so right under the Massachusetts rule in New Jersey, and still ends on the estimate', () => {
    const lines = wordsFor(
      { kind: 'compliance', checks: [check('us-ma-smart')], usState: 'NJ' },
      [],
    )
    const smart = lines.findIndex((line) => line.text.startsWith('rule us-ma-smart:'))
    expect(smart).toBeGreaterThan(0)
    expect(lines[smart + 1]).toEqual({ text: NOT_HERE, tone: 'caveat' })
    expect(lines[lines.length - 1]?.text).toBe(NOT_A_DETERMINATION)
  })

  it('says nothing of the kind in Massachusetts', () => {
    const lines = wordsFor(
      { kind: 'compliance', checks: [check('us-ma-smart')], usState: 'MA' },
      [],
    )
    expect(lines.map((line) => line.text)).not.toContain(NOT_HERE)
  })

  it('says nothing where the state is not known, which is outside the US or before the lookup', () => {
    const lines = wordsFor(
      { kind: 'compliance', checks: [check('us-ma-smart')], usState: null },
      [],
    )
    expect(lines.map((line) => line.text)).not.toContain(NOT_HERE)
  })

  it('leaves it off a rule that is not the Massachusetts one', () => {
    const lines = wordsFor(
      { kind: 'compliance', checks: [check('de-din-spec-91434')], usState: 'NJ' },
      [],
    )
    expect(lines.map((line) => line.text)).not.toContain(NOT_HERE)
  })
})
