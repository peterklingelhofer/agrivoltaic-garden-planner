import { describe, expect, it } from 'bun:test'
import {
  loadCompanionRules,
  loadRotationConstraints,
  partitionCompanionRules,
  rulesTouching,
} from './companions'
import { dehesaGradient, loadTekRules, transmissionAtDistance } from './tek'
import type { CropId } from '../types/ids'
import type { Meters } from '../types/units'

describe('companion rules', () => {
  it('partitions strictly by grade', async () => {
    const rules = await loadCompanionRules()
    const { scoreable, experimental, folklore } = partitionCompanionRules(rules)
    expect(scoreable.every((rule) => rule.grade === 'A' || rule.grade === 'B')).toBe(true)
    expect(experimental.every((rule) => rule.grade === 'C')).toBe(true)
    expect(folklore.every((rule) => rule.grade === 'D' || rule.grade === 'E')).toBe(true)
    expect(scoreable.length + experimental.length + folklore.length).toBe(rules.length)
  })

  it('requires a mechanism for every scoreable rule', async () => {
    const { scoreable } = partitionCompanionRules(await loadCompanionRules())
    for (const rule of scoreable) {
      expect(rule.mechanism.length).toBeGreaterThan(20)
      expect(rule.citations.length).toBeGreaterThan(0)
      expect(rule.effect.interval.lower).toBeLessThanOrEqual(rule.effect.interval.upper)
    }
  })

  // The full-season cover form is a grade A claim in the Decision Record, but no work backing
  // it survives in the verified corpus, so the citation requirement demotes it out of scoring
  it('demotes the marigold cover crop to experimental while it cannot cite a verified work', async () => {
    const rules = await loadCompanionRules()
    const cover = rules.find((rule) => rule.id === ('marigold-cover-nematode' as never))
    const interplanted = rules.find(
      (rule) => rule.id === ('marigold-interplanted-nematode' as never),
    )
    expect(cover?.grade).toBe('C')
    expect(cover?.citations).toEqual([])
    expect(interplanted?.grade).toBe('E')
    expect(cover?.scope.minDurationDays).toBeGreaterThanOrEqual(60)
    expect(cover?.scope.requiresManagement.length).toBeGreaterThan(0)
  })

  it('grades "aromatic herbs repel pests" E and cites the contradiction', async () => {
    const { folklore } = partitionCompanionRules(await loadCompanionRules())
    const rule = folklore.find((entry) => entry.id === ('aromatic-herbs-repel-pests' as never))
    expect(rule?.grade).toBe('E')
    expect(rule?.contradictedBy.length).toBeGreaterThan(0)
    expect(rule?.contradictedBy).toContain('finch-collier2003')
  })

  it('gives every rule that needs management the steps to render inline', async () => {
    const rules = await loadCompanionRules()
    for (const id of ['trap-crop-managed', 'biofumigation-macerated', 'marigold-cover-nematode']) {
      const rule = rules.find((entry) => (entry.id as string) === id)
      expect(rule?.scope.requiresManagement.length).toBeGreaterThan(0)
    }
  })

  it('lets no rule reach the scoring path without a citation', async () => {
    const { scoreable } = partitionCompanionRules(await loadCompanionRules())
    expect(scoreable.length).toBeGreaterThan(0)
    for (const rule of scoreable) expect(rule.citations.length).toBeGreaterThan(0)
  })

  it('finds rules by taxon, family and functional group', async () => {
    const rules = await loadCompanionRules()
    const touching = rulesTouching(rules, 'kale' as CropId, 'Brassicaceae')
    expect(touching.some((rule) => rule.id === ('undersown-cover-host-finding' as never))).toBe(
      true,
    )
  })
})

describe('rotation constraints', () => {
  it('encodes clubroot, Solanaceae wilt and allium white rot', async () => {
    const rotation = await loadRotationConstraints()
    expect(rotation.map((entry) => entry.groupRef).sort()).toEqual([
      'Amaryllidaceae',
      'Brassicaceae',
      'Solanaceae',
    ])
  })

  it('gives a minimum interval only where rotation actually works', async () => {
    const rotation = await loadRotationConstraints()
    for (const constraint of rotation) {
      if (constraint.rotationEffective) expect(constraint.minIntervalYears).toBeGreaterThan(0)
      else {
        expect(constraint.minIntervalYears).toBeNull()
        expect(constraint.alternativeControl).not.toBeNull()
      }
    }
  })
})

describe('TEK design rules', () => {
  it('ships exactly the seven cross-cutting rules, each individually attributed', async () => {
    const rules = await loadTekRules()
    expect(rules).toHaveLength(7)
    expect(new Set(rules.map((rule) => rule.key)).size).toBe(7)
    for (const rule of rules) {
      expect(rule.attribution.peoples.length).toBeGreaterThan(0)
      expect(rule.attribution.citations.length).toBeGreaterThan(0)
      expect(rule.attribution.communityEndorsementSought).toBe(false)
      expect(rule.attribution.sourceType).toBe('published-literature')
    }
  })

  it('never attributes to a generic "indigenous" collective', async () => {
    const rules = await loadTekRules()
    for (const rule of rules) {
      for (const people of rule.attribution.peoples) {
        expect(people.toLowerCase()).not.toMatch(
          /^indigenous|^traditional cultures|^native peoples/,
        )
      }
    }
  })

  it('keeps named innovators separate from communities', async () => {
    const rules = await loadTekRules()
    const succession = rules.find((rule) => rule.key === 'temporal-succession')
    expect(succession?.attribution.individualInnovators).toContain(
      'Akira Nagashima, named inventor of solar sharing, which is a modern invention',
    )
    expect(succession?.attribution.peoples.join(' ')).not.toContain('Nagashima')
  })
})

describe('dehesa distance gradient', () => {
  it('rises monotonically in transmission with distance from the canopy', () => {
    const template = dehesaGradient()
    for (let index = 1; index < template.samples.value.length; index += 1) {
      const previous = template.samples.value[index - 1]
      const current = template.samples.value[index]
      if (previous === undefined || current === undefined) continue
      expect(current.transmittedRadiationFraction).toBeGreaterThanOrEqual(
        previous.transmittedRadiationFraction,
      )
      expect(current.relativeSoilMoisture).toBeLessThanOrEqual(previous.relativeSoilMoisture)
    }
  })

  it('clamps outside its valid range instead of extrapolating', () => {
    const template = dehesaGradient()
    expect(transmissionAtDistance(template, 0 as Meters)).toBeCloseTo(
      template.samples.value[0]?.transmittedRadiationFraction ?? 0,
    )
    expect(transmissionAtDistance(template, 500 as Meters)).toBeCloseTo(1)
  })
})
