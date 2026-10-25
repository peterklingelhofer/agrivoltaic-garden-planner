import { describe, expect, it } from 'bun:test'
import { cropById, loadCropCatalog } from '../../data/crops'
import type { Crop } from '../../types/crop'
import type { Bed } from '../../types/garden'
import type { CropId } from '../../types/ids'
import type { SoilProfile } from '../../types/site'
import { bedFixture, siteFixture } from '../testkit'
import { hardPhEnvelope, soilWaterStage } from './soil-water'

const catalogPromise = loadCropCatalog()

const need = (catalog: readonly Crop[], id: string): Crop => {
  const crop = cropById(catalog, id as CropId)
  if (crop === undefined) throw new Error(`missing fixture crop ${id}`)
  return crop
}

/** The fixture bed with its soil read at one pH from one source */
const bedAt = (phUnits: number, sourceId: SoilProfile['sourceId']): Bed => {
  const bed = bedFixture('bed-a')
  return { ...bed, soil: { ...bed.soil, phUnits, sourceId } }
}

/**
 * A pH off the soil map is the native soil's estimate on a 250 m pixel, and a vegetable bed is
 * usually limed. The map lowers a crop's standing and a typed pH alone can rule it out
 */
describe('a map pH lowers a crop and a typed pH refuses it', () => {
  it('passes a crop the map pH sits outside of, with the soil term at zero and the reason', async () => {
    const tomato = need(await catalogPromise, 'tomato')
    const outcome = soilWaterStage(tomato, bedAt(4.8, 'soilgrids'), siteFixture())
    expect(outcome.passed).toBe(true)
    expect(outcome.fit).toBe(0)
    expect(outcome.limiting?.cause.kind).toBe('soil-ph')
    expect(outcome.limiting?.explanation).toContain('soil map')
    expect(outcome.limiting?.explanation).toContain('4.8')
  })

  it('refuses the same crop at the same pH once the visitor has typed it', async () => {
    const tomato = need(await catalogPromise, 'tomato')
    const outcome = soilWaterStage(tomato, bedAt(4.8, 'user'), siteFixture())
    expect(outcome.passed).toBe(false)
    expect(outcome.limiting?.cause.kind).toBe('soil-ph')
  })

  it('treats a hard envelope the same way: lowered on a map pH, refused on a typed one', async () => {
    const blueberry = need(await catalogPromise, 'blueberry')
    expect(hardPhEnvelope(blueberry)).toBe(true)
    const mapped = soilWaterStage(blueberry, bedAt(7.5, 'soilgrids'), siteFixture())
    expect(mapped.passed).toBe(true)
    expect(mapped.limiting?.cause.kind).toBe('soil-ph')
    expect(soilWaterStage(blueberry, bedAt(7.5, 'user'), siteFixture()).passed).toBe(false)
  })

  it('says nothing about a map pH inside the crop range', async () => {
    const tomato = need(await catalogPromise, 'tomato')
    const outcome = soilWaterStage(tomato, bedAt(6.5, 'soilgrids'), siteFixture())
    expect(outcome.passed).toBe(true)
    expect(outcome.fit).toBe(1)
    expect(outcome.limiting).toBeNull()
  })
})
