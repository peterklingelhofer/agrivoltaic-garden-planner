import { describe, expect, it } from 'bun:test'
import { makeArray, makeBed } from '../state/defaults'
import { polygonOf, rectangleRing, vec2 } from '../state/geom'
import type { Crop } from '../types/crop'
import type { Planting } from '../types/garden'
import { bedId, cropId, plantingId } from '../types/ids'
import type { BedId, CropId, PlantingId } from '../types/ids'
import type { OutcomeKind, PlantingOutcome } from '../types/simulation'
import { dayOfYear, type Fraction } from '../types/units'
import {
  applyLook,
  bedThirst,
  gardenAge,
  layoutPlanting,
  outcomeLook,
  PANEL_HEADROOM_M,
  type PlantItem,
  rainDrops,
  UNTOUCHED_LOOK,
} from './sceneMath'

const outcome = (kind: OutcomeKind, pestPressure = 0): PlantingOutcome => ({
  bedId: 'a' as BedId,
  plantingId: 'p' as PlantingId,
  cropId: 'tomato' as CropId,
  kind,
  band: null,
  realised: 0 as Fraction,
  pestPressure: pestPressure as Fraction,
  droughtPenalty: 0 as Fraction,
  companions: [],
  tried: [],
  explanation: '',
})

const item: PlantItem = { x: 0, z: 0, widthM: 0.5, heightM: 0.8, colour: 0x4a7a2a }

describe('how old the garden is drawn', () => {
  it('is the slider or the seasons run, whichever is more, and never above the ceiling', () => {
    expect(gardenAge(3, 0, 12)).toBe(3)
    expect(gardenAge(3, 1, 12)).toBe(3)
    expect(gardenAge(1, 5, 12)).toBe(5)
    expect(gardenAge(1, 40, 12)).toBe(12)
  })
})

describe('what a season does to the look of a planting', () => {
  it('leaves a planting with no outcome exactly as the catalogue draws it', () => {
    expect(outcomeLook(undefined)).toBe(UNTOUCHED_LOOK)
    expect(applyLook(item, UNTOUCHED_LOOK)).toBe(item)
  })

  it('lays a frosted planting flat and bleaches it, and stunts a starved one', () => {
    const frosted = applyLook(item, outcomeLook(outcome('frosted')))
    expect(frosted.heightM).toBeLessThan(item.heightM * 0.25)
    // flat, not small: the width stays most of what it was
    expect(frosted.widthM).toBeGreaterThan(item.widthM * 0.7)
    expect(frosted.colour).not.toBe(item.colour)
    const dark = applyLook(item, outcomeLook(outcome('too-dark')))
    expect(dark.heightM).toBeLessThan(item.heightM)
    expect(dark.heightM).toBeGreaterThan(frosted.heightM)
  })

  it('reads the worst thirst in a bed off the report, and none off no report', () => {
    const thirsty = { ...outcome('harvested'), droughtPenalty: 0.3 as Fraction }
    const dry = { ...outcome('harvested'), droughtPenalty: 0.1 as Fraction, bedId: 'b' as BedId }
    expect(bedThirst({ outcomes: [thirsty, dry] }, 'a')).toBeCloseTo(0.3, 6)
    expect(bedThirst({ outcomes: [thirsty, dry] }, 'b')).toBeCloseTo(0.1, 6)
    expect(bedThirst({ outcomes: [thirsty, dry] }, 'c')).toBe(0)
    expect(bedThirst(undefined, 'a')).toBe(0)
  })

  it('leans an eaten bed toward sallow by its pest pressure, and never the whole way', () => {
    const clean = applyLook(item, outcomeLook(outcome('harvested', 0)))
    const eaten = applyLook(item, outcomeLook(outcome('harvested', 1)))
    expect(clean.colour).toBe(item.colour)
    expect(clean.heightM).toBe(item.heightM)
    expect(eaten.colour).not.toBe(item.colour)
    expect(outcomeLook(outcome('harvested', 1)).tintStrength).toBeLessThan(0.6)
  })

  it('draws what never went in the ground as nothing at all', () => {
    for (const kind of ['refused', 'climate', 'soil'] as const) {
      const bare = applyLook(item, outcomeLook(outcome(kind)))
      expect(bare.heightM).toBe(0)
      expect(bare.widthM).toBe(0)
    }
    expect(outcomeLook(outcome('unlit'))).toBe(UNTOUCHED_LOOK)
  })

  it('keeps every tint a reflectance', () => {
    for (const kind of ['harvested', 'frosted', 'unripe', 'too-dark', 'refused'] as const) {
      const look = outcomeLook(outcome(kind, 1))
      if (look.tint !== null) {
        expect(look.tint).toBeGreaterThanOrEqual(0)
        expect(look.tint).toBeLessThanOrEqual(0xffffff)
      }
      expect(look.tintStrength).toBeLessThanOrEqual(1)
    }
  })
})

/**
 * Nothing grows through a module. The default array stands 2.5 m clear over a footprint centred
 * on the origin, so a shrub that would be drawn 3 m tall is a shrub whose top is inside the
 * laminate, and this is the picture agreeing with `assignCanopyTier`, which has already called
 * anything that tall overstory
 */
describe('a plant standing under an array', () => {
  /** Three metres of shrub: taller than the clearance and never held back by its own maturity */
  const SHRUB = {
    lifeCycle: 'annual',
    footprint: {
      widthM: { typicalM: 0.6 },
      heightM: { typicalM: 3 },
      yearsToMature: null,
    },
  } as Crop

  /** Day 160 sits at the harvest start, where `seasonalScale` has the planting fully grown */
  const IN_SEASON_DAY = 160

  const planting = (bed: string): Planting => ({
    id: plantingId('planting-1'),
    bedId: bedId(bed),
    cropId: cropId('a-shrub'),
    cultivarId: null,
    role: 'target-crop',
    tier: 'shrub',
    sowDay: dayOfYear(100),
    harvestStartDay: dayOfYear(150),
    harvestEndDay: dayOfYear(180),
    plantCount: 12,
  })

  const bedAt = (xM: number, yM: number) =>
    makeBed(1, { footprint: polygonOf(rectangleRing(vec2(xM, yM), 4, 2)) })

  const drawn = (bed: ReturnType<typeof bedAt>, arrays: readonly ReturnType<typeof makeArray>[]) =>
    layoutPlanting(bed, planting(bed.id), SHRUB, 1, IN_SEASON_DAY, arrays)

  it('is pruned to the clearance, and stands its full height outside the array', () => {
    const array = makeArray(1)
    const under = bedAt(0, 0)
    const beyond = bedAt(20, 0)
    expect(array.geometry.clearanceHeightM).toBe(2.5)

    const capped = drawn(under, [array])
    expect(capped.length).toBeGreaterThan(0)
    for (const item of capped) {
      expect(item.heightM).toBeLessThanOrEqual(2.5 - PANEL_HEADROOM_M)
      // and exactly the headroom under the modules: a raised bed spends the clearance first
      expect(item.heightM).toBeCloseTo(2.5 - PANEL_HEADROOM_M - under.raisedHeightM, 10)
      // pruned, not shrunk: only the height gives way
      expect(item.widthM).toBeCloseTo(0.6, 10)
    }

    const free = drawn(beyond, [array])
    expect(free.length).toBeGreaterThan(0)
    for (const item of free) expect(item.heightM).toBeCloseTo(3, 10)

    // and with nothing standing over it, the bed under the array is free too
    for (const item of drawn(under, [])) expect(item.heightM).toBeCloseTo(3, 10)
  })

  /**
   * The axis, pinned. `rowAzimuthDeg` is the direction the rows RUN: the default array is three
   * 13.6 m rows nine metres apart, so it reaches 6.8 m along the rows and 10.8 m across them, and a
   * footprint built the other way round would swap exactly these two beds
   */
  it('reaches further across the rows than along them', () => {
    const array = makeArray(1)
    const across = drawn(bedAt(0, 9), [array])
    const along = drawn(bedAt(9, 0), [array])
    for (const item of across) expect(item.heightM).toBeLessThan(3)
    for (const item of along) expect(item.heightM).toBeCloseTo(3, 10)
  })
})

describe('where the rain starts', () => {
  it('scatters every drop over the plot and under the ceiling, the same way every time', () => {
    const extent = { minXM: -4, minYM: 2, maxXM: 6, maxYM: 12 }
    const drops = rainDrops(200, extent, 10)
    expect(drops).toHaveLength(600)
    for (let index = 0; index < drops.length; index += 3) {
      expect(drops[index]).toBeGreaterThanOrEqual(-4)
      expect(drops[index]).toBeLessThanOrEqual(6)
      expect(drops[index + 1]).toBeGreaterThanOrEqual(0)
      expect(drops[index + 1]).toBeLessThanOrEqual(10)
      // the plot's north is the scene's negative z, as it is for the plants
      expect(drops[index + 2]).toBeLessThanOrEqual(-2)
      expect(drops[index + 2]).toBeGreaterThanOrEqual(-12)
    }
    expect(rainDrops(200, extent, 10)).toEqual(drops)
    expect(rainDrops(0, extent, 10)).toHaveLength(0)
  })
})
