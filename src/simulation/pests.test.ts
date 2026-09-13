import { describe, expect, it } from 'bun:test'
import { loadCompanionRules, partitionCompanionRules } from '../data/companions'
import { bedFixture, plotFixture, siteFixture } from '../recommend/testkit'
import { unsafeBandMidpoint } from '../types/band'
import type { CompanionRule } from '../types/companion'
import type { Planting } from '../types/garden'
import type { BedId, CropId, PlantingId } from '../types/ids'
import type { DayOfYear, DegreeDaysC } from '../types/units'
import {
  crowdingOf,
  heatRatio,
  PEST_KINDS,
  PEST_YIELD_LOSS_AT_FULL_PRESSURE,
  pestSuppression,
  pestYieldLoss,
  untreatedPressure,
} from './pests'

const rules = partitionCompanionRules(await loadCompanionRules())

const rule = (id: string): CompanionRule => {
  const found = [...rules.scoreable, ...rules.experimental, ...rules.folklore].find(
    (entry) => entry.id === id,
  )
  if (found === undefined) throw new Error(`no companion rule ${id}`)
  return found
}

const FAMILY: Readonly<Record<string, string>> = {
  tomato: 'Solanaceae',
  carrot: 'Apiaceae',
  bean: 'Fabaceae',
}
const familyOf = (id: CropId): string | null => FAMILY[id as string] ?? null

const planting = (bedId: string, cropId: string): Planting => ({
  id: `${bedId}-${cropId}` as PlantingId,
  bedId: bedId as BedId,
  cropId: cropId as CropId,
  cultivarId: null,
  role: 'target-crop',
  tier: 'herb-ground',
  sowDay: 140 as DayOfYear,
  harvestStartDay: 220 as DayOfYear,
  harvestEndDay: 260 as DayOfYear,
  plantCount: 6,
})

describe('pests press on what is planted around a bed', () => {
  it('leaves a lone bed on bare ground fully exposed, because bare ground is not green', () => {
    const plot = plotFixture([bedFixture('a', { plantings: [planting('a', 'tomato')] })])
    expect(crowdingOf(plot, 'Solanaceae', familyOf).crowding).toBe(1)
  })

  it('eases as the green area around it stops being its own family', () => {
    const plot = plotFixture([
      bedFixture('a', { plantings: [planting('a', 'tomato')] }),
      bedFixture('b', { plantings: [planting('b', 'carrot')] }),
      bedFixture('c', { plantings: [planting('c', 'bean')] }),
      bedFixture('d', { plantings: [] }),
    ])
    const reading = crowdingOf(plot, 'Solanaceae', familyOf)
    expect(reading.crowding).toBeCloseTo(1 / 3, 5)
    // the empty bed is bare, and bare dilutes nothing
    expect(reading.greenAreaM2).toBeCloseTo(36, 5)
  })

  it('does not count a neighbour of the same family as dilution', () => {
    const plot = plotFixture([
      bedFixture('a', { plantings: [planting('a', 'tomato')] }),
      bedFixture('b', { plantings: [planting('b', 'tomato')] }),
    ])
    expect(crowdingOf(plot, 'Solanaceae', familyOf).crowding).toBe(1)
  })

  it('weights a mixed bed by the share of its plantings that are the host', () => {
    const plot = plotFixture([
      bedFixture('a', { plantings: [planting('a', 'tomato'), planting('a', 'carrot')] }),
    ])
    expect(crowdingOf(plot, 'Solanaceae', familyOf).crowding).toBeCloseTo(0.5, 5)
  })

  it('scales with the heat the year gives the pests against the site typical year', () => {
    const typical = siteFixture()
    const hot = siteFixture({
      seasonGdd: {
        ...typical.seasonGdd,
        base10C: (typical.seasonGdd.base10C * 1.5) as DegreeDaysC,
      },
    })
    expect(heatRatio(hot, typical)).toBeCloseTo(1.5, 5)
    expect(heatRatio(typical, typical)).toBeCloseTo(1, 5)
    expect(untreatedPressure(0.5 as never, 1.5)).toBeCloseTo(0.75, 5)
    expect(untreatedPressure(0.9 as never, 1.5)).toBe(1)
  })

  it('takes a declared, unsourced share of the harvest at full pressure', () => {
    expect(PEST_YIELD_LOSS_AT_FULL_PRESSURE.provenance).toBe('unsourced')
    expect(pestYieldLoss(1 as never)).toBeCloseTo(PEST_YIELD_LOSS_AT_FULL_PRESSURE.value, 5)
    expect(pestYieldLoss(0 as never)).toBe(0)
  })
})

describe('a rule about pests is applied to pests, by what its evidence is', () => {
  it('applies a measured pest-density band as measured, and only for a pest kind', () => {
    const undersown = rule('undersown-cover-host-finding')
    if (undersown.grade !== 'A') throw new Error('undersown-cover-host-finding is grade A')
    expect(PEST_KINDS.has(undersown.kind)).toBe(true)
    expect(pestSuppression(undersown, rules.scoreable, 1)).toBeCloseTo(
      unsafeBandMidpoint(undersown.effect),
      5,
    )
    const ler = rule('ler-cereal-legume')
    expect(PEST_KINDS.has(ler.kind)).toBe(false)
    expect(pestSuppression(ler, rules.scoreable, 1)).toBe(1)
  })

  it('refuses the enemy-abundance figure, which points the wrong way', () => {
    const enemies = rule('insectary-strip-enemy-abundance')
    expect(enemies.grade).toBe('A')
    expect(pestSuppression(enemies, rules.scoreable, 1)).toBe(1)
    const suppression = rule('insectary-pest-suppression')
    expect(suppression.grade).toBe('B')
    expect(pestSuppression(suppression, rules.scoreable, 1)).toBeLessThan(1)
  })

  it('lets a mechanism with no measured effect do nothing the numbers can see', () => {
    const marigold = rule('marigold-cover-nematode')
    expect(marigold.grade).toBe('C')
    for (let seed = 0; seed < 10; seed += 1) {
      expect(pestSuppression(marigold, rules.scoreable, seed)).toBe(1)
    }
  })

  it('lets an untested claim work in the gardens where it is true, at a measured size', () => {
    const folklore = rule('marigold-interplanted-nematode')
    expect(folklore.grade).toBe('E')
    const outcomes = new Set(
      Array.from({ length: 60 }, (_, seed) => pestSuppression(folklore, rules.scoreable, seed)),
    )
    // one for the gardens where it is false, and one measured multiplier where it is true; or
    // one alone where the corpus holds no measured rule of its kind to borrow from
    expect(outcomes.size).toBeLessThanOrEqual(2)
    for (const value of outcomes) {
      expect(value).toBeGreaterThan(0)
      expect(value).toBeLessThanOrEqual(1)
    }
  })

  it('never lets a contradicted claim work', () => {
    const contradicted = rule('aromatic-herbs-repel-pests')
    for (let seed = 0; seed < 40; seed += 1) {
      expect(pestSuppression(contradicted, rules.scoreable, seed)).toBe(1)
    }
  })
})
