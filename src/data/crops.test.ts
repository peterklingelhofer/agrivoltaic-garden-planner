import { describe, expect, it } from 'bun:test'
import laubTable from '../../docs/laub-2022-table-s2.json'
import type { LaubCropGroup } from '../types/crop'
import { dliClassLimits, laubCurve, loadCropCatalog, mirrorGrowingWindow } from './crops'
import { LAUB_GROUPS, LAUB_PROVENANCE, LAUB_RSR_LEVELS_PERCENT } from './catalog/laub.generated'

const JSON_KEY: Readonly<Record<LaubCropGroup, string>> = {
  berries: 'berries',
  fruits: 'fruits',
  'fruity-vegetables': 'fruityVegetables',
  forages: 'forages',
  'leafy-vegetables': 'leafyVegetables',
  'c3-cereals': 'c3Cereals',
  'tubers-root-crops': 'tubersRootCrops',
  'grain-legumes': 'grainLegumes',
  'maize-c4': 'maize',
}

interface TableGroup {
  readonly studies: number
  readonly predicted: readonly number[]
  readonly ciLow: readonly number[]
  readonly ciHigh: readonly number[]
  readonly class: readonly string[]
}

const table = laubTable as unknown as {
  readonly rsrLevels: readonly number[]
  readonly groups: Readonly<Record<string, TableGroup>>
}

describe('crop catalogue', () => {
  it('ships a curated catalogue of the target size', async () => {
    const catalog = await loadCropCatalog()
    expect(catalog.length).toBeGreaterThanOrEqual(120)
    expect(catalog.length).toBeLessThanOrEqual(200)
  })

  it('gives every crop a DLI value with an honest evidence tier, and a citation only where one prints it', async () => {
    const catalog = await loadCropCatalog()
    for (const crop of catalog) {
      expect(['A', 'B', 'C']).toContain(crop.light.dliMinMolM2Day.tier)
      expect(crop.light.dliMinMolM2Day.value).toBeGreaterThan(0)
      expect(crop.light.dliTargetMolM2Day.value).toBeGreaterThanOrEqual(
        crop.light.dliMinMolM2Day.value,
      )
      // a row above tier C has to name the work it read the number off. A tier C row may name
      // nothing, which is the ordinary case: the two extension documents print a band for five rows
      // and this catalogue holds 182
      if (crop.light.dliMinMolM2Day.tier !== 'C') {
        expect(crop.light.dliMinMolM2Day.citations.length, String(crop.id)).toBeGreaterThan(0)
      }
    }
  })

  it('cites nothing for most light figures, and says so on every row that cites nothing', async () => {
    const catalog = await loadCropCatalog()
    const uncited = catalog.filter((crop) => crop.light.dliMinMolM2Day.citations.length === 0)
    expect(uncited.length).toBeGreaterThan(catalog.length / 2)
    for (const crop of uncited) {
      const record = crop.light.dliMinMolM2Day
      expect(record.provenance, String(crop.id)).toBe('inferred')
      if (record.provenance === 'inferred') {
        expect(record.basis, String(crop.id)).toContain('No cited work measured it for this crop')
      }
    }
  })

  it('is honest that most DLI values are Tier C inferences', async () => {
    const catalog = await loadCropCatalog()
    const tierC = catalog.filter((crop) => crop.light.dliMinMolM2Day.tier === 'C')
    expect(tierC.length / catalog.length).toBeGreaterThan(0.5)
  })

  it('carries no viral CC BY-SA provenance', async () => {
    const catalog = await loadCropCatalog()
    for (const crop of catalog) {
      expect(crop.provenance.viralLicence).toBe(false)
      expect(crop.provenance.licence.toLowerCase()).not.toContain('share-alike')
      expect(crop.provenance.licence.toLowerCase()).not.toContain('by-sa')
    }
  })

  it('uses unique crop ids', async () => {
    const catalog = await loadCropCatalog()
    expect(new Set(catalog.map((crop) => crop.id)).size).toBe(catalog.length)
  })

  it('keeps every ECOCROP trapezoid ordered', async () => {
    const catalog = await loadCropCatalog()
    for (const crop of catalog) {
      for (const shape of [
        crop.envelope.temperatureC,
        crop.envelope.annualRainfallMm,
        crop.envelope.soilPh,
      ]) {
        expect(shape.absoluteMin).toBeLessThanOrEqual(shape.optimumMin)
        expect(shape.optimumMin).toBeLessThanOrEqual(shape.optimumMax)
        expect(shape.optimumMax).toBeLessThanOrEqual(shape.absoluteMax)
      }
    }
  })

  it('gives perennials a cold-hardiness limit and annuals a thermal requirement', async () => {
    const catalog = await loadCropCatalog()
    for (const crop of catalog) {
      const perennial = crop.lifeCycle === 'perennial' || crop.lifeCycle === 'woody-perennial'
      if (perennial) expect(crop.thermal).toBeNull()
      else expect(crop.thermal).not.toBeNull()
    }
  })

  it('mirrors growing windows for the southern hemisphere', () => {
    expect(mirrorGrowingWindow({ startMonth: 3, endMonth: 6 })).toEqual({
      startMonth: 9,
      endMonth: 12,
    })
    expect(mirrorGrowingWindow({ startMonth: 10, endMonth: 11 })).toEqual({
      startMonth: 4,
      endMonth: 5,
    })
  })
})

describe('DLI class limits', () => {
  it('applies the Decision Record maximum design RSR per class', () => {
    expect(dliClassLimits('maize-c4').maxDesignRsr).toBeCloseTo(0.1)
    expect(dliClassLimits('leafy-greens').maxDesignRsr).toBeCloseTo(0.4)
    // Widmer's own range is 10 to 30 percent, collapsed to its conservative end
    expect(dliClassLimits('strawberry').maxDesignRsr).toBeCloseTo(0.1)
    expect(dliClassLimits('strawberry').minMolM2Day).toBe(25)
  })

  it('reports null where no threshold is established rather than inventing one', () => {
    expect(dliClassLimits('root-tuber').minMolM2Day).toBeNull()
    expect(dliClassLimits('alliums').minMolM2Day).toBeNull()
  })
})

describe('Laub curves', () => {
  it('matches the authoritative Table S2 JSON exactly', () => {
    for (const [group, key] of Object.entries(JSON_KEY) as [LaubCropGroup, string][]) {
      const published = table.groups[key]
      expect(published).toBeDefined()
      if (published === undefined) continue
      const curve = laubCurve(group)
      expect(curve.studyCount).toBe(published.studies)
      expect(curve.anchors.value.length).toBe(table.rsrLevels.length)
      curve.anchors.value.forEach((anchor, index) => {
        expect(anchor.rsr * 100).toBeCloseTo(table.rsrLevels[index] ?? 0, 6)
        expect(anchor.relativeYield * 100).toBeCloseTo(published.predicted[index] ?? 0, 6)
        expect(anchor.ciLow * 100).toBeCloseTo(published.ciLow[index] ?? 0, 6)
        expect(anchor.ciHigh * 100).toBeCloseTo(published.ciHigh[index] ?? 0, 6)
      })
    }
  })

  it('reproduces the Decision Record anchors at 40 percent RSR', () => {
    const index = LAUB_RSR_LEVELS_PERCENT.indexOf(40)
    expect(index).toBeGreaterThanOrEqual(0)
    const at40 = (group: LaubCropGroup): number => LAUB_GROUPS[group].predicted[index] ?? 0
    expect(at40('berries')).toBeCloseTo(114, 0)
    expect(at40('fruits')).toBeCloseTo(113, 0)
    // Table S2 publishes 102.5, so this one is checked to a decimal
    expect(at40('fruity-vegetables')).toBeCloseTo(102.5, 1)
    expect(at40('forages')).toBeCloseTo(93, 0)
    expect(at40('leafy-vegetables')).toBeCloseTo(86, 0)
    expect(at40('grain-legumes')).toBeCloseTo(50, 0)
    expect(at40('maize-c4')).toBeCloseTo(45, 0)
    // the Decision Record's anchors for tubers and C3 cereals, checked to a decimal
    expect(at40('tubers-root-crops')).toBeCloseTo(60.8, 1)
    expect(at40('c3-cereals')).toBeCloseTo(61.9, 1)
  })

  it('records that the coefficients are derived and the intervals are confidence intervals', () => {
    expect(LAUB_PROVENANCE.predictions).toBe('verbatim')
    expect(LAUB_PROVENANCE.coefficients).toMatch(/DERIVED/)
    expect(LAUB_PROVENANCE.confidenceIntervals).toMatch(/CONFIDENCE/)
  })

  it('preserves the published non-monotonic response classes', () => {
    // C3 cereals return to T after an S run, and tubers do the same
    expect(LAUB_GROUPS['c3-cereals'].responseClass).toContain('S')
    expect(LAUB_GROUPS['c3-cereals'].responseClass[17]).toBe('T')
    expect(LAUB_GROUPS['tubers-root-crops'].responseClass[17]).toBe('T')
  })

  it('marks the benefiting groups with a peak RSR and the rest with none', () => {
    expect(laubCurve('berries').peakRsr).toBeCloseTo(0.3)
    expect(laubCurve('maize-c4').peakRsr).toBeNull()
    expect(laubCurve('grain-legumes').peakRsr).toBeNull()
  })
})
