import { describe, expect, it } from 'bun:test'
import { loadCropCatalog } from '../crops'
import { pollinatorDependenceOf, pollinatorForageOf } from './wildlife'

/**
 * The two questions must not collapse into each other. A crop that needs bees isn't the same as
 * a plant that feeds them, and the cases below are chosen to be the ones where they disagree:
 * squash needs them badly and feeds them well, an apple needs them badly and feeds them for two
 * weeks, oregano needs nothing and feeds everything, and a carrot does neither because it's
 * pulled before it flowers
 */
describe('what a crop asks of pollinators', () => {
  it('puts the cucurbits at the top, where the literature puts them', () => {
    expect(pollinatorDependenceOf('Cucurbitaceae', 'fruity-vegetables')).toBe('essential')
  })

  it('separates the orchard and the berries from the self-fertile nightshades', () => {
    expect(pollinatorDependenceOf('Rosaceae', 'fruits')).toBe('great')
    expect(pollinatorDependenceOf('Ericaceae', 'berries')).toBe('great')
    // a tomato sets fruit on its own, and gains from a visit
    expect(pollinatorDependenceOf('Solanaceae', 'fruity-vegetables')).toBe('little')
  })

  it('asks nothing at all where the harvest happens before the flower', () => {
    for (const group of ['leafy-vegetables', 'tubers-root-crops'] as const)
      expect(pollinatorDependenceOf('Asteraceae', group), group).toBe('none')
  })

  it('asks nothing of the wind-pollinated, and judges that on the family', () => {
    expect(pollinatorDependenceOf('Poaceae', 'c3-cereals')).toBe('none')
    expect(pollinatorDependenceOf('Poaceae', 'corn-c4')).toBe('none')
    /**
     * The sunflower is the case this test is for. Laub's shade-response grouping files it under
     * `c3-cereals` because its yield behaves like a cereal's in shade, and reading pollination off
     * that group would call it wind-pollinated, with Klein et al. cited beside the claim
     * contradicting it
     */
    expect(pollinatorDependenceOf('Asteraceae', 'c3-cereals')).toBe('modest')
  })
})

describe('what a plant offers pollinators', () => {
  it('reads the insectary role as a plant grown for its flowers', () => {
    expect(pollinatorForageOf('Boraginaceae', 'leafy-vegetables', 'insectary')).toBe('high')
  })

  it('feeds them from the mints and the umbels, and not from a lettuce', () => {
    expect(pollinatorForageOf('Lamiaceae', 'leafy-vegetables', null)).toBe('high')
    expect(pollinatorForageOf('Apiaceae', 'leafy-vegetables', null)).toBe('high')
    // the same family, pulled as a root long before it could flower
    expect(pollinatorForageOf('Apiaceae', 'tubers-root-crops', null)).toBe('none')
    // Asteraceae is in this catalog as lettuce and chicory, where flowering is a failure
    expect(pollinatorForageOf('Asteraceae', 'leafy-vegetables', null)).toBe('none')
  })

  it('counts orchard blossom, which is forage even though nobody grows it for that', () => {
    expect(pollinatorForageOf('Rosaceae', 'fruits', null)).toBe('some')
    // and wind-pollinated grain offers nothing to an insect
    expect(pollinatorForageOf('Poaceae', 'c3-cereals', null)).toBe('none')
  })
})

describe('over the shipped catalog', () => {
  it('gives every crop both answers, and never claims a grass feeds anything', async () => {
    const catalog = await loadCropCatalog()
    expect(catalog.length).toBeGreaterThan(100)
    for (const crop of catalog) {
      expect(crop.wildlife.dependence.provenance, crop.id as string).toBe('inferred')
      expect(crop.wildlife.forage.citations.length, crop.id as string).toBeGreaterThan(0)
      /**
       * Keyed on the FAMILY. The crop groups `c3-cereals` and `corn-c4` are Laub's shade-response
       * grouping and hold the sunflower, so an assertion on them would pass while the code under it
       * called a sunflower useless to bees. Grasses are wind-pollinated, and sunflowers aren't
       */
      if (crop.taxonomy.family === 'Poaceae') {
        expect(crop.wildlife.forage.value, crop.id as string).toBe('none')
        expect(crop.wildlife.dependence.value, crop.id as string).toBe('none')
      }
    }
  })

  it("finds the plants a grower would plant for bees, and they're the flowering ones", async () => {
    const catalog = await loadCropCatalog()
    const feeders = catalog.filter((crop) => crop.wildlife.forage.value === 'high')
    const names = feeders.map((crop) => crop.id as string)
    expect(names).toContain('borage')
    expect(names).toContain('phacelia')
    expect(names).toContain('oregano')
    // the four the shade-response grouping would hide, every one a known nectar source
    expect(names).toContain('sunflower')
    expect(names).toContain('buckwheat')
    expect(names).toContain('clover-white')
    expect(names).toContain('fava-bean')
    expect(names).not.toContain('lettuce-leaf')
    expect(names).not.toContain('carrot')
    // and the grasses, which really are wind-pollinated
    expect(names).not.toContain('corn-sweet')
  })
})
