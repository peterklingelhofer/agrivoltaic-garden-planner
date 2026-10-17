import { describe, expect, it } from 'bun:test'
import { cropById, loadCropCatalog } from '../../data/crops'
import type { Crop } from '../../types/crop'
import type { CropId } from '../../types/ids'
import type { ExceedancePercentile, FrostExceedanceCurve, Site } from '../../types/site'
import { molPerM2Day } from '../../types/units'
import type { Celsius, Days, DayOfYear } from '../../types/units'
import { shadedBySurroundings } from '../surroundings'
import { bedLightFixture, FROST_EVERY_YEAR, frostFreeSiteFixture, siteFixture } from '../testkit'
import { lightGate } from './light-gate'

const catalogPromise = loadCropCatalog()

const need = (catalog: readonly Crop[], id: string): Crop => {
  const crop = cropById(catalog, id as CropId)
  if (crop === undefined) throw new Error(`missing fixture crop ${id}`)
  return crop
}

const PERCENTILE: ExceedancePercentile = 20

const everyPercentile = <T>(value: T): Readonly<Record<ExceedancePercentile, T>> => ({
  10: value,
  20: value,
  30: value,
  40: value,
  50: value,
})

/**
 * A frost curve that reads the same at every percentile a fixture asks for, so a test can hold the
 * shape of the season fixed while it varies frostOffsetDays or the percentile alone
 */
const frostCurve = (lastSpringFreeze: number, firstFallFreeze: number): FrostExceedanceCurve => ({
  ...FROST_EVERY_YEAR,
  thresholdC: 0 as Celsius,
  lastSpringFreeze: everyPercentile(lastSpringFreeze as DayOfYear),
  firstFallFreeze: everyPercentile(firstFallFreeze as DayOfYear),
  frostFreeDays: everyPercentile((firstFallFreeze - lastSpringFreeze) as Days),
})

/** Tromso's own frost-free season: May 29 (day 149) to September 27 (day 270) */
const tromso = (): Site => siteFixture({ frost: [frostCurve(149, 270)] })

/** A last spring freeze falling inside April, so April is partly in season here and nowhere near it at Tromso */
const earlySpringSite = (): Site => siteFixture({ frost: [frostCurve(100, 270)] })

// April through October: dark at both ends, bright May to September. Tromso's own season keeps
// only the bright months, so a crop with this window and this bed passes there and nowhere the
// dark ends are in season
const APRIL_TO_OCTOBER_DLI = [10, 10, 10, 10, 30, 30, 30, 30, 30, 10, 10, 10]

const seasonalCrop = (base: Crop, frostOffsetDays = 0): Crop => ({
  ...base,
  window: { startMonth: 4, endMonth: 10 },
  frostOffsetDays: frostOffsetDays as Days,
  light: {
    ...base.light,
    dliMinMolM2Day: { ...base.light.dliMinMolM2Day, value: molPerM2Day(20) },
    dliMaxBeforeDisorderMolM2Day: null,
  },
})

describe('lightGate reads only the months a crop could be in the ground at this site', () => {
  it('skips a catalog month wholly outside the site season and passes on what is left', async () => {
    const catalog = await catalogPromise
    const crop = seasonalCrop(need(catalog, 'lettuce-leaf'))
    const bed = bedLightFixture('bed-a', 0, 36, APRIL_TO_OCTOBER_DLI)
    const outcome = lightGate(crop, bed, tromso(), PERCENTILE)
    expect(outcome.passed).toBe(true)
    // the catalog window is untouched even though April and October dropped out of the check
    expect(outcome.light.window).toEqual({ startMonth: 4, endMonth: 10 })
    // May to September are all the same 30: any other mean would mean April or October leaked in
    expect(outcome.light.meanDliMolM2Day).toBeCloseTo(30, 5)
  })

  it('still refuses the same crop where the dark month falls inside the season', async () => {
    const catalog = await catalogPromise
    const crop = seasonalCrop(need(catalog, 'lettuce-leaf'))
    const bed = bedLightFixture('bed-a', 0, 36, APRIL_TO_OCTOBER_DLI)
    const outcome = lightGate(crop, bed, earlySpringSite(), PERCENTILE)
    expect(outcome.passed).toBe(false)
    expect(outcome.limiting?.cause).toEqual({ kind: 'dli-minimum', month: 4 })
  })

  it('skips nothing at a frost-free site', async () => {
    const catalog = await catalogPromise
    const crop = seasonalCrop(need(catalog, 'lettuce-leaf'))
    const bed = bedLightFixture('bed-a', 0, 36, APRIL_TO_OCTOBER_DLI)
    const outcome = lightGate(crop, bed, frostFreeSiteFixture(), PERCENTILE)
    expect(outcome.passed).toBe(false)
    expect(outcome.limiting?.cause).toEqual({ kind: 'dli-minimum', month: 4 })
  })

  it('keeps the month a hardy crop is sown into early, ahead of the last frost', async () => {
    const catalog = await catalogPromise
    // -30: sown a month before the last spring freeze, which at Tromso pulls the season's own
    // start back from day 149 (in May) to day 119 (in April)
    const crop = seasonalCrop(need(catalog, 'lettuce-leaf'), -30)
    const bed = bedLightFixture('bed-a', 0, 36, APRIL_TO_OCTOBER_DLI)
    const outcome = lightGate(crop, bed, tromso(), PERCENTILE)
    expect(outcome.passed).toBe(false)
    expect(outcome.limiting?.cause).toEqual({ kind: 'dli-minimum', month: 4 })
  })
})

describe('lightGate refuses wild ginger past its own survival ceiling', () => {
  it('refuses a bed whose season mean is at or above 36.4 mol/m²/d and admits one in light shade below it', async () => {
    const catalog = await catalogPromise
    const crop = need(catalog, 'wild-ginger')

    // 40 clears the 36.4 figure comfortably: a season mean built from a weighted average of
    // several months lands a hair off an exact float literal, so the fixture sits well clear of
    // the boundary
    const bright = bedLightFixture('bed-bright', 0, 36, Array(12).fill(40))
    const refused = lightGate(crop, bright, siteFixture(), PERCENTILE)
    expect(refused.passed).toBe(false)
    expect(refused.limiting?.cause).toEqual({ kind: 'dli-survival-ceiling' })

    const dim = bedLightFixture('bed-dim', 0.3, 36, Array(12).fill(30))
    const admitted = lightGate(crop, dim, siteFixture(), PERCENTILE)
    expect(admitted.passed).toBe(true)
  })
})

describe('lightGate holds the design ceiling to the bake alone', () => {
  // light well above every minimum in every month, so the shade ceiling is the only question
  const BRIGHT = Array(12).fill(40)

  it('admits a bed the bake leaves unshaded where the surroundings take three tenths of the light', async () => {
    const catalog = await catalogPromise
    const tomato = need(catalog, 'tomato')
    expect(tomato.light.maxDesignRsr.value).toBe(0.2)

    const open = bedLightFixture('bed-open', 0, 36, BRIGHT)
    const outcome = lightGate(
      tomato,
      shadedBySurroundings(open, 'partly-sheltered'),
      siteFixture(),
      PERCENTILE,
    )
    expect(outcome.passed).toBe(true)
    // the total still carries the surroundings, which is what the yield curve is read on
    expect(outcome.light.cumulativeRsr).toBeCloseTo(0.3, 6)
    expect(outcome.light.bakedRsr).toBeCloseTo(0, 9)
  })

  it('refuses a bed the bake shades past the ceiling under every answer to what surrounds it', async () => {
    const catalog = await catalogPromise
    const tomato = need(catalog, 'tomato')
    const panelShaded = bedLightFixture('bed-panels', 0.25, 36, BRIGHT)
    for (const exposure of ['open', 'partly-sheltered'] as const) {
      const outcome = lightGate(
        tomato,
        shadedBySurroundings(panelShaded, exposure),
        siteFixture(),
        PERCENTILE,
      )
      expect(outcome.passed, exposure).toBe(false)
      expect(outcome.limiting?.cause, exposure).toEqual({ kind: 'max-design-rsr' })
      expect(outcome.light.bakedRsr, exposure).toBeCloseTo(0.25, 6)
    }
  })

  it('names the percentage the bake takes, with the surroundings left out of it', async () => {
    const catalog = await catalogPromise
    const tomato = need(catalog, 'tomato')
    const panelShaded = bedLightFixture('bed-panels', 0.25, 36, BRIGHT)
    const outcome = lightGate(
      tomato,
      shadedBySurroundings(panelShaded, 'partly-sheltered'),
      siteFixture(),
      PERCENTILE,
    )
    // the total is 1 - 0.75 x 0.7, about 48 percent, and the sentence says 25
    expect(outcome.light.cumulativeRsr).toBeCloseTo(0.475, 6)
    expect(outcome.limiting?.explanation).toBe(
      "Panels and anything drawn take 25 percent of this bed's light over the season, above the 20 percent limit set for this kind of crop",
    )
    expect(outcome.limiting?.membership).toBeCloseTo(0.8, 6)
  })
})
