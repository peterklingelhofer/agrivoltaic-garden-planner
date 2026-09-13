import { describe, expect, it } from 'bun:test'
import { loadCompanionRules, loadRotationConstraints } from '../../data/companions'
import { cropById, loadCropCatalog } from '../../data/crops'
import type { Crop } from '../../types/crop'
import type { Bed } from '../../types/garden'
import type { CropId } from '../../types/ids'
import { meters } from '../../types/units'
import { runRecommendationPipeline } from '../pipeline'
import { DEFAULT_WEIGHTS } from './rank'
import { bedFixture, bedLightFixture, plotFixture, siteFixture } from '../testkit'
import { ROOT_DEPTH_FLOOR_M, spaceStage } from './space'

const catalogPromise = loadCropCatalog()

const need = (catalog: readonly Crop[], id: string): Crop => {
  const crop = cropById(catalog, id as CropId)
  if (crop === undefined) throw new Error(`missing fixture crop ${id}`)
  return crop
}

const bedOfDepth = (effectiveDepthM: number): Bed => {
  const bed = bedFixture('bed-a')
  return {
    ...bed,
    raisedHeightM: meters(0),
    soil: { ...bed.soil, effectiveDepthM: meters(effectiveDepthM) },
  }
}

/**
 * FAO-56 Table 22's Zr is the effective rooting depth for water-balance work, and its own note
 * says the smaller values apply in restricted soils: it is not a minimum soil depth, and tomatoes
 * grow in 30 cm of soil. A shallow bed limits a crop and says what it costs; only a bed under
 * the floor refuses it (Decision Record 16)
 */
describe('root depth limits rather than excludes', () => {
  it('passes a crop whose roots would go deeper than the bed, with the reason and the cost', async () => {
    const tomato = need(await catalogPromise, 'tomato')
    expect(tomato.roots.maxEffectiveDepthM).toBeGreaterThan(0.3)
    const outcome = spaceStage(tomato, bedOfDepth(0.3), [], 5)
    expect(outcome.passed).toBe(true)
    expect(outcome.limiting?.cause).toEqual({ kind: 'root-depth' })
    expect(outcome.limiting?.membership).toBeCloseTo(0.3 / tomato.roots.maxEffectiveDepthM, 6)
    expect(outcome.limiting?.explanation).toBe(
      `Roots would reach ${tomato.roots.maxEffectiveDepthM.toFixed(2)} m in deep soil and this bed offers 0.30 m, so it will need watering more often`,
    )
  })

  it('still excludes below the floor, which is a tray and not a bed', async () => {
    const tomato = need(await catalogPromise, 'tomato')
    const outcome = spaceStage(tomato, bedOfDepth(ROOT_DEPTH_FLOOR_M - 0.05), [], 5)
    expect(outcome.passed).toBe(false)
    expect(outcome.limiting?.cause).toEqual({ kind: 'root-depth' })
    expect(outcome.limiting?.explanation).toContain('under the 0.20 m floor')
  })

  it('says nothing about roots in a bed that holds them', async () => {
    const tomato = need(await catalogPromise, 'tomato')
    const outcome = spaceStage(tomato, bedOfDepth(tomato.roots.maxEffectiveDepthM + 0.1), [], 5)
    expect(outcome.passed).toBe(true)
    expect(outcome.limiting).toBeNull()
  })

  it('reaches the ranking as a marginal verdict carrying the root-depth factor', async () => {
    const [catalog, companionRules, rotationConstraints] = await Promise.all([
      catalogPromise,
      loadCompanionRules(),
      loadRotationConstraints(),
    ])
    const bed = bedOfDepth(0.3)
    const [set] = runRecommendationPipeline({
      site: siteFixture(),
      plot: plotFixture([bed]),
      bedLight: [bedLightFixture('bed-a', 0.1)],
      catalog,
      companionRules,
      rotationConstraints,
      frostPercentile: 20,
      weights: DEFAULT_WEIGHTS,
      preferredCropIds: [],
    })
    const tomato = set?.ranked.find((entry) => (entry.cropId as string) === 'tomato')
    expect(tomato?.outcome.verdict).toBe('marginal')
    if (tomato?.outcome.verdict !== 'marginal') return
    expect(tomato.outcome.limiting.cause).toEqual({ kind: 'root-depth' })
  })
})
