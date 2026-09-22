import { describe, expect, it } from 'bun:test'
import { loadCropCatalog } from '../data/crops'
import type { Crop } from '../types/crop'
import type { CropId } from '../types/ids'
import { asksAnything, NO_WILDLIFE_PREFERENCE, wildlifeMatch } from './wildlife'

/**
 * Driven off the shipped catalogue and the shipped native ranges, because
 * the thing worth protecting is the answer a grower gets, not the arithmetic. Phacelia is
 * recorded native to California and the tomato is recorded native to Peru and nowhere else, so
 * with a Californian garden the pair are a real native and a real introduction
 */
const CALIFORNIA = 'CAL'

const cropBy = async (id: string): Promise<Crop> => {
  const catalog = await loadCropCatalog()
  const crop = catalog.find((entry) => (entry.id as string) === id)
  expect(crop, `${id} is not in the catalogue`).toBeDefined()
  return crop as Crop
}

describe('what the wildlife answers do to a crop', () => {
  it('says nothing at all when neither question was answered yes', async () => {
    const borage = await cropBy('borage')
    expect(wildlifeMatch(borage, NO_WILDLIFE_PREFERENCE)).toBeNull()
    expect(asksAnything(NO_WILDLIFE_PREFERENCE)).toBe(false)
  })

  it('separates a native from an introduction in the same garden', async () => {
    const preference = {
      favourNative: true,
      favourPollinators: false,
      botanicalArea: CALIFORNIA,
    }
    expect(wildlifeMatch(await cropBy('phacelia'), preference)).toBe(1)
    expect(wildlifeMatch(await cropBy('tomato'), preference)).toBe(0)
  })

  /**
   * The rule the whole honesty of the native answer rests on. `isNativeIn` returns null for a
   * crop the checklist has no accepted name for and for a garden off the region grid, and a null
   * term is DROPPED from the mean. Scoring it zero would sink a plant
   * nobody has checked below one that was checked and found introduced, which is the ranking
   * quietly making a claim Kew has not made
   */
  it('drops an unanswerable native term instead of scoring it against the crop', async () => {
    const unknown = await cropBy('nz-spinach')
    const offGrid = { favourNative: true, favourPollinators: false, botanicalArea: null }
    // no region, so there is no native term at all and nothing else was asked
    expect(wildlifeMatch(unknown, offGrid)).toBeNull()
    // and a crop the checklist cannot name is dropped even where the region IS known
    expect(
      wildlifeMatch(unknown, {
        favourNative: true,
        favourPollinators: false,
        botanicalArea: CALIFORNIA,
      }),
    ).toBeNull()
  })

  it('scores an unnameable crop on the pollinator half alone rather than halving it', async () => {
    const unknown = await cropBy('nz-spinach')
    const both = { favourNative: true, favourPollinators: true, botanicalArea: CALIFORNIA }
    // the native term is dropped, so this is the forage score on its own and not an average
    // with a zero standing in for "not checked"
    const forageOnly = wildlifeMatch(unknown, {
      favourNative: false,
      favourPollinators: true,
      botanicalArea: CALIFORNIA,
    })
    expect(wildlifeMatch(unknown, both)).toBe(forageOnly)
  })

  it('ranks what feeds pollinators above what is picked before it flowers', async () => {
    const preference = { favourNative: false, favourPollinators: true, botanicalArea: null }
    const borage = wildlifeMatch(await cropBy('borage'), preference) ?? 0
    const apple = wildlifeMatch(await cropBy('apple'), preference) ?? 0
    const lettuce = wildlifeMatch(await cropBy('lettuce-leaf'), preference) ?? 0
    expect(borage).toBeGreaterThan(apple)
    expect(apple).toBeGreaterThan(lettuce)
    expect(lettuce).toBe(0)
  })

  it('averages the two questions when both were asked', async () => {
    const preference = { favourNative: true, favourPollinators: true, botanicalArea: CALIFORNIA }
    // native in California and a top forage plant, so both terms are 1
    expect(wildlifeMatch(await cropBy('phacelia'), preference)).toBe(1)
    // introduced there, and picked before it flowers, so both terms are 0
    expect(wildlifeMatch(await cropBy('lettuce-leaf'), preference)).toBe(0)
  })
})

describe('the shipped native ranges', () => {
  it('records a range for all but one of the catalogue, and never an empty one', async () => {
    const catalog = await loadCropCatalog()
    const unknown = catalog.filter(
      (crop) =>
        wildlifeMatch(crop, {
          favourNative: true,
          favourPollinators: false,
          botanicalArea: CALIFORNIA,
        }) === null,
    )
    // one binomial matched nothing in the checklist, and it is named here so a second one
    // appearing is a change somebody has to argue for
    expect(unknown.map((crop) => crop.id as CropId)).toEqual(['nz-spinach'])
  })
})
