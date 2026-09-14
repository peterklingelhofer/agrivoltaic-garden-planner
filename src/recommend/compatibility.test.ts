import { beforeAll, describe, expect, it } from 'bun:test'
import {
  loadCompanionRules,
  loadRotationConstraints,
  partitionCompanionRules,
} from '../data/companions'
import { loadCropCatalog } from '../data/crops'
import { loadTekRules } from '../data/tek'
import type { RotationConstraint } from '../types/companion'
import type { Crop } from '../types/crop'
import type { PartitionedCompanionRules } from '../types/companion'
import type { CropId } from '../types/ids'
import type { TekDesignRule } from '../types/tek'
import type { Fraction } from '../types/units'
import {
  DEFAULT_COMPATIBILITY_WEIGHTS,
  evaluatePair,
  phOverlap,
  phTerm,
  rootStratificationTerm,
} from './compatibility'
import type { PairContext } from './compatibility'
import { bedFixture, bedLightFixture, siteFixture } from './testkit'

let catalog: readonly Crop[]
let rules: PartitionedCompanionRules
let rotation: readonly RotationConstraint[]
let tekRules: readonly TekDesignRule[]

const crop = (id: string): Crop => {
  const found = catalog.find((entry) => entry.id === (id as CropId))
  if (found === undefined) throw new Error(`no crop ${id}`)
  return found
}

const contextWith = (shares: readonly (readonly [string, number])[] = []): PairContext => ({
  bed: bedFixture('bed-a'),
  site: siteFixture(),
  light: bedLightFixture('bed-a', 0.25),
  arrays: [],
  rules,
  rotation,
  tekRules,
  weights: DEFAULT_COMPATIBILITY_WEIGHTS,
  canopyShareByCropId: new Map(shares.map(([id, share]) => [id as CropId, share as Fraction])),
})

const termOf = (pair: ReturnType<typeof evaluatePair>, kind: string) => {
  const found = pair.terms.find((entry) => entry.kind === kind)
  if (found === undefined) throw new Error(`no ${kind} term`)
  return found
}

beforeAll(async () => {
  const [loaded, companion, rotationConstraints, tek] = await Promise.all([
    loadCropCatalog(),
    loadCompanionRules(),
    loadRotationConstraints(),
    loadTekRules(),
  ])
  catalog = loaded
  rules = partitionCompanionRules(companion)
  rotation = rotationConstraints
  tekRules = tek
})

describe('soil pH intersection', () => {
  it('refuses blueberry with a brassica because blueberry cannot be moved off its band', () => {
    const overlap = phOverlap(crop('blueberry'), crop('kale'))
    expect(overlap.optimum).toBeNull()
    expect(overlap.hardEnvelopeCropIds).toContain('blueberry' as CropId)
    const term = phTerm(crop('blueberry'), crop('kale'), DEFAULT_COMPATIBILITY_WEIGHTS)
    expect(term.verdict).toBe('conflict')
    expect(term.explanation).toMatch(/for physiological reasons/)
    expect(evaluatePair(crop('blueberry'), crop('kale'), contextWith()).compatible).toBe(false)
  })

  it('passes blueberry with lingonberry, which shares its optimum band', () => {
    const overlap = phOverlap(crop('blueberry'), crop('lingonberry'))
    expect(overlap.optimum?.lowPh).toBeCloseTo(4.5)
    expect(overlap.optimum?.highPh).toBeCloseTo(4.9)
    expect(overlap.compromisePh).toBeNull()
    const term = phTerm(crop('blueberry'), crop('lingonberry'), DEFAULT_COMPATIBILITY_WEIGHTS)
    expect(term.verdict).toBe('benefit')
    expect(term.contribution).toBeGreaterThan(0)
    expect(term.citations).toContain('tirmenstein1991-lingonberry-feis')
  })

  it('warns and names the compromise pH where both envelopes are preferences', () => {
    const term = phTerm(crop('lingonberry'), crop('tomato'), DEFAULT_COMPATIBILITY_WEIGHTS)
    const overlap = phOverlap(crop('lingonberry'), crop('tomato'))
    expect(overlap.optimum).toBeNull()
    expect(overlap.hardEnvelopeCropIds).toEqual([])
    expect(term.verdict).toBe('caution')
    expect(overlap.compromisePh).not.toBeNull()
    expect(term.explanation).toContain((overlap.compromisePh ?? 0).toFixed(1))
    expect(overlap.jointMembership).toBeGreaterThan(0)
  })

  it('clears exactly the acid guild to share a bed with blueberry and nothing else', () => {
    const compatible = catalog
      .filter(
        (candidate) =>
          candidate.id !== ('blueberry' as CropId) &&
          phTerm(crop('blueberry'), candidate, DEFAULT_COMPATIBILITY_WEIGHTS).verdict !==
            'conflict',
      )
      .map((candidate) => candidate.id as string)
      .sort()
    // the acid guild, plus the tropical staples whose ECOCROP envelopes reach pH 4 to 4.5
    // (cassava 4 to 9, taro 4.3 to 8.2, banana 4 to 8.4, coffee 4.3 to 8.4, and so on), which is
    // a fact about those crops and the reason a blueberry bed is not the dead end for them that
    // it is for a tomato. Olive's floor is 5.3, so it stays out
    expect(compatible).toEqual([
      'avocado',
      'banana',
      'cassava',
      'coffee',
      'cranberry',
      'lingonberry',
      'lowbush-blueberry',
      'mango',
      'moringa',
      'mung-bean',
      'papaya',
      'pearl-millet',
      'pigeon-pea',
      'plantain',
      'rice-upland',
      'sesame',
      'sorghum-grain',
      'sweetfern',
      'taro',
      'teaberry',
      'teff',
      'yam-greater',
    ])
  })
})

describe('root and canopy complementarity', () => {
  it('rewards different strata and penalises two shallow rooters', () => {
    const complementary = rootStratificationTerm(
      crop('lettuce-leaf'),
      crop('tomato'),
      DEFAULT_COMPATIBILITY_WEIGHTS,
    )
    expect(complementary.verdict).toBe('benefit')
    expect(complementary.contribution).toBeGreaterThan(0)

    const competing = rootStratificationTerm(
      crop('lettuce-leaf'),
      crop('arugula'),
      DEFAULT_COMPATIBILITY_WEIGHTS,
    )
    expect(competing.verdict).toBe('caution')
    expect(competing.contribution).toBeLessThan(0)
  })

  it('reads the canopy tier from the optimiser own assignment and attributes the design rule', () => {
    const stacked = termOf(
      evaluatePair(crop('blueberry'), crop('teaberry'), contextWith()),
      'canopy-tier',
    )
    expect(stacked.verdict).toBe('benefit')
    expect(stacked.tekRuleKey).toBe('vertical-stratification')
    expect(stacked.explanation).toMatch(/Chagga/)

    const flat = termOf(
      evaluatePair(crop('lettuce-leaf'), crop('arugula'), contextWith()),
      'canopy-tier',
    )
    expect(flat.verdict).toBe('caution')
  })
})

describe('light overtopping under the array', () => {
  it('refuses a pairing that pushes the shorter crop below its own DLI minimum', () => {
    const pair = evaluatePair(
      crop('strawberry'),
      crop('sweet-corn'),
      contextWith([['sweet-corn', 0.6]]),
    )
    const term = termOf(pair, 'light-overtopping')
    expect(term.verdict).toBe('conflict')
    expect(term.explanation).toMatch(/mol\/m²\/d/)
    expect(pair.compatible).toBe(false)
  })

  it('leaves a pairing alone when neither crop overtops the other', () => {
    const term = termOf(
      evaluatePair(crop('lettuce-leaf'), crop('arugula'), contextWith()),
      'light-overtopping',
    )
    expect(term.verdict).toBe('neutral')
    expect(term.signal).toBe(0)
  })
})

describe('shared pests and rotation', () => {
  it('refuses two crops of a family carrying a hard rotation constraint', () => {
    const pair = evaluatePair(crop('tomato'), crop('potato'), contextWith())
    const term = termOf(pair, 'shared-pest-or-pathogen')
    expect(term.verdict).toBe('conflict')
    expect(term.citations.length).toBeGreaterThan(0)
    expect(pair.compatible).toBe(false)
  })

  it('warns without scoring where a shared family has no constraint in the corpus', () => {
    const term = termOf(
      evaluatePair(crop('blueberry'), crop('lingonberry'), contextWith()),
      'shared-pest-or-pathogen',
    )
    expect(term.verdict).toBe('caution')
    expect(term.scores).toBe(false)
    expect(term.contribution).toBe(0)
  })
})

describe('evidence grading is enforced by the engine, not by convention', () => {
  it('never lets a grade C, D or E term contribute to a score', () => {
    const pairs = [
      evaluatePair(crop('blueberry'), crop('sweetfern'), contextWith()),
      evaluatePair(crop('garlic'), crop('bean-bush'), contextWith()),
      evaluatePair(crop('fennel-bulb'), crop('tomato'), contextWith()),
      evaluatePair(crop('basil'), crop('tomato'), contextWith()),
    ]
    const graded = pairs.flatMap((pair) => pair.terms).filter((term) => term.grade !== null)
    expect(graded.length).toBeGreaterThan(0)
    for (const term of graded) {
      if (term.grade === 'C' || term.grade === 'D' || term.grade === 'E') {
        expect(term.scores).toBe(false)
        expect(term.contribution).toBe(0)
      }
    }
  })

  it('renders recorded allelopathy as a caution that never scores', () => {
    const pair = evaluatePair(crop('fennel-bulb'), crop('tomato'), contextWith())
    const term = pair.terms.find((entry) => entry.kind === 'allelopathy')
    expect(term).toBeDefined()
    expect(term?.verdict).toBe('caution')
    expect(term?.scores).toBe(false)
    expect(term?.contribution).toBe(0)
    expect(term?.grade).toBe('C')
  })

  it('keeps the untested blueberry pairings in the folklore panel', () => {
    const pair = evaluatePair(crop('blueberry'), crop('sweetfern'), contextWith())
    expect(pair.folklore.map((rule) => rule.id as string)).toContain(
      'sweetfern-nitrogen-to-blueberry',
    )
    expect(pair.applied).toEqual([])
    expect(pair.terms.every((term) => term.grade !== 'D' || !term.scores)).toBe(true)
  })
})

describe('determinism', () => {
  it('gives the same verdict whichever way round the pair is passed', () => {
    const forward = evaluatePair(crop('blueberry'), crop('lingonberry'), contextWith())
    const backward = evaluatePair(crop('lingonberry'), crop('blueberry'), contextWith())
    expect(backward.cropIds).toEqual(forward.cropIds)
    expect(backward.score).toBeCloseTo(forward.score, 12)
    expect(backward.terms.map((term) => term.explanation)).toEqual(
      forward.terms.map((term) => term.explanation),
    )
  })
})
