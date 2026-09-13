import { describe, expect, it } from 'bun:test'
import { loadCompanionRules, partitionCompanionRules } from '../data/companions'
import { siteFixture, tmyFixture } from '../recommend/testkit'
import { unsafeBandMidpoint } from '../types/band'
import type { FolkloreCompanionRule } from '../types/companion'
import type { BedId, CropId, PlantingId, RuleId } from '../types/ids'
import type { OutcomeKind, PlantingOutcome, SeasonReport } from '../types/simulation'
import type { Fraction } from '../types/units'
import {
  codeOf,
  hiddenTruth,
  measuredEffectLike,
  trialComparison,
  TRIALS_TO_REVEAL,
  unit,
} from './evidence'
import { typicalYear } from './year'

const rules = partitionCompanionRules(await loadCompanionRules())

const folklore = (id: string): FolkloreCompanionRule => {
  const rule = rules.folklore.find((entry) => entry.id === id)
  if (rule === undefined) throw new Error(`no folklore rule ${id}`)
  return rule
}

describe('a claim the evidence cannot settle', () => {
  it('draws in [0, 1) and replays exactly', () => {
    for (let index = 0; index < 500; index += 1) {
      const value = unit(index, 3, 7)
      expect(value).toBeGreaterThanOrEqual(0)
      expect(value).toBeLessThan(1)
      expect(unit(index, 3, 7)).toBe(value)
    }
    expect(codeOf('marigold-interplanted-nematode')).toBe(codeOf('marigold-interplanted-nematode'))
    expect(codeOf('a')).not.toBe(codeOf('b'))
  })

  it('is true in some gardens and false in others, and never changes its mind in one', () => {
    const untested = folklore('carrots-love-tomatoes')
    const answers = new Set(Array.from({ length: 200 }, (_, seed) => hiddenTruth(untested, seed)))
    expect(answers.size).toBe(2)
    const answer = hiddenTruth(untested, 77)
    for (let index = 0; index < 20; index += 1) expect(hiddenTruth(untested, 77)).toBe(answer)
  })

  it('is false in every garden once a paper says so', () => {
    const contradicted = folklore('aromatic-herbs-repel-pests')
    expect(contradicted.contradictedBy.length).toBeGreaterThan(0)
    for (let seed = 0; seed < 200; seed += 1) expect(hiddenTruth(contradicted, seed)).toBe(false)
  })

  it('borrows a measured effect of its own kind where one exists, and none where none does', () => {
    const nematode = folklore('marigold-interplanted-nematode')
    const like = measuredEffectLike(nematode, rules.scoreable)
    const peers = rules.scoreable.filter((rule) => rule.kind === nematode.kind)
    if (peers.length === 0) {
      expect(like).toBeNull()
    } else {
      expect(like).not.toBeNull()
      const midpoints = peers.map((rule) => unsafeBandMidpoint(rule.effect)).sort((a, b) => a - b)
      expect(unsafeBandMidpoint(like as NonNullable<typeof like>)).toBe(
        midpoints[Math.floor((midpoints.length - 1) / 2)],
      )
    }
    const orphan = { ...nematode, kind: 'phenological-complementarity' as const }
    expect(measuredEffectLike(orphan, rules.scoreable)).toBeNull()
  })

  it('asks for whole seasons before it hands over the literature', () => {
    expect(Number.isInteger(TRIALS_TO_REVEAL)).toBe(true)
    expect(TRIALS_TO_REVEAL).toBeGreaterThan(1)
  })
})

const outcome = (
  name: string,
  kind: OutcomeKind,
  realised: number,
  tried: readonly string[],
): PlantingOutcome => ({
  bedId: name as BedId,
  plantingId: name as PlantingId,
  cropId: 'carrot' as CropId,
  kind,
  band: null,
  realised: realised as Fraction,
  pestPressure: 0 as Fraction,
  droughtPenalty: 0 as Fraction,
  companions: [],
  tried: tried as readonly RuleId[],
  explanation: '',
})

const year = typicalYear(siteFixture(), tmyFixture()).summary

const report = (season: number, outcomes: readonly PlantingOutcome[]): SeasonReport => ({
  season,
  year,
  outcomes,
  harvestIndex: null,
  energyKwh: null,
  energyShare: null,
  advice: { id: 'status', text: '', bedId: null },
})

const RULE = 'carrots-love-tomatoes' as RuleId

describe('what a trial has to compare itself against', () => {
  it('reads the beds that did not run the rule off the same seasons, and leaves the dead out', () => {
    const comparison = trialComparison(
      [
        report(1, [
          outcome('a', 'harvested', 0.8, [RULE]),
          outcome('b', 'harvested', 0.6, [RULE]),
          outcome('c', 'harvested', 0.4, []),
          // a frosted bed never tried anything, and counting its zero against the claim would
          // be answering a different question
          outcome('d', 'frosted', 0, []),
          outcome('e', 'refused', 0, []),
        ]),
        // a season nobody ran it in is a different year's weather, so it is not the comparison
        report(2, [outcome('f', 'harvested', 0.1, [])]),
      ],
      RULE,
    )
    expect(comparison).toEqual({
      triedMean: 0.7,
      triedPlantings: 2,
      withoutMean: 0.4,
      withoutPlantings: 1,
    })
  })

  it('says a garden left no bed out rather than pretending it has a comparison', () => {
    const comparison = trialComparison(
      [report(1, [outcome('a', 'harvested', 0.5, [RULE]), outcome('b', 'harvested', 0.7, [RULE])])],
      RULE,
    )
    expect(comparison).toMatchObject({ triedPlantings: 2, withoutPlantings: 0 })
    expect(comparison?.triedMean).toBeCloseTo(0.6, 10)
  })

  it('has nothing to say where no season on record ran the rule', () => {
    expect(trialComparison([], RULE)).toBeNull()
    expect(trialComparison([report(1, [outcome('a', 'harvested', 0.5, [])])], RULE)).toBeNull()
    // tried is only ever set on a harvested outcome, and a stored one that says otherwise is
    // not a season anybody ran it in
    expect(trialComparison([report(1, [outcome('a', 'frosted', 0, [RULE])])], RULE)).toBeNull()
  })
})
