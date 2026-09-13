import { describe, expect, it } from 'bun:test'
import type { Crop } from '../types/crop'
import type { Planting } from '../types/garden'
import { bedId, cropId, plantingId } from '../types/ids'
import { DORMANT_SCALE, outOfSeason, SEEDLING_SCALE, seasonalScale } from './season'

const planting = (patch: Partial<Planting> = {}): Planting => ({
  id: plantingId('planting-1'),
  bedId: bedId('bed-1'),
  cropId: cropId('lettuce'),
  cultivarId: null,
  role: 'target-crop',
  tier: 'herb-ground',
  sowDay: 100 as Planting['sowDay'],
  harvestStartDay: 160 as Planting['harvestStartDay'],
  harvestEndDay: 200 as Planting['harvestEndDay'],
  plantCount: 10,
  ...patch,
})

const withLifeCycle = (lifeCycle: Crop['lifeCycle']): Crop => ({ lifeCycle }) as Crop

describe('growth across the season', () => {
  it('is not there before it is sown, and gone once the harvest window closes', () => {
    expect(seasonalScale(planting(), undefined, 99)).toBe(0)
    expect(seasonalScale(planting(), undefined, 201)).toBe(0)
  })

  it('starts at a transplant rather than at nothing, and reaches full size at first harvest', () => {
    expect(seasonalScale(planting(), undefined, 100)).toBeCloseTo(SEEDLING_SCALE, 10)
    expect(seasonalScale(planting(), undefined, 160)).toBeCloseTo(1, 10)
    expect(seasonalScale(planting(), undefined, 200)).toBeCloseTo(1, 10)
  })

  it('grows monotonically, on a curve rather than a ramp', () => {
    let previous = 0
    for (let day = 100; day <= 160; day += 1) {
      const value = seasonalScale(planting(), undefined, day)
      expect(value).toBeGreaterThanOrEqual(previous)
      previous = value
    }
    // a straight ramp would put the midpoint halfway; a smoothstep puts it above
    const mid = seasonalScale(planting(), undefined, 115)
    expect(mid).toBeLessThan(SEEDLING_SCALE + (1 - SEEDLING_SCALE) * 0.25)
  })

  it('carries a winter-spanning window across the turn of the year', () => {
    const overwintered = planting({
      sowDay: 300 as Planting['sowDay'],
      harvestStartDay: 120 as Planting['harvestStartDay'],
      harvestEndDay: 150 as Planting['harvestEndDay'],
    })
    expect(seasonalScale(overwintered, undefined, 299)).toBe(0)
    expect(seasonalScale(overwintered, undefined, 10)).toBeGreaterThan(0)
    expect(seasonalScale(overwintered, undefined, 130)).toBeCloseTo(1, 10)
    expect(seasonalScale(overwintered, undefined, 200)).toBe(0)
  })

  it('leaves a perennial standing out of season, because its crown is still there', () => {
    for (const lifeCycle of ['perennial', 'woody-perennial'] as const) {
      expect(seasonalScale(planting(), withLifeCycle(lifeCycle), 20)).toBe(DORMANT_SCALE)
      expect(seasonalScale(planting(), withLifeCycle(lifeCycle), 100)).toBe(DORMANT_SCALE)
      expect(seasonalScale(planting(), withLifeCycle(lifeCycle), 160)).toBeCloseTo(1, 10)
    }
    expect(seasonalScale(planting(), withLifeCycle('annual'), 20)).toBe(0)
  })

  it('survives a degenerate window without dividing by zero', () => {
    const same = planting({
      harvestStartDay: 100 as Planting['harvestStartDay'],
      harvestEndDay: 100 as Planting['harvestEndDay'],
    })
    expect(Number.isFinite(seasonalScale(same, undefined, 100))).toBe(true)
  })
})

describe('what today draws nothing for', () => {
  const early = planting()
  const late = planting({
    id: plantingId('planting-2'),
    sowDay: 220 as Planting['sowDay'],
    harvestStartDay: 260 as Planting['harvestStartDay'],
    harvestEndDay: 300 as Planting['harvestEndDay'],
  })
  const none = (): undefined => undefined

  it('names the plantings the day is outside, and only those', () => {
    expect(outOfSeason([early, late], none, 150)).toEqual([late])
    expect(outOfSeason([early, late], none, 250)).toEqual([early])
    expect(outOfSeason([early, late], none, 20)).toEqual([early, late])
  })

  it('is empty for an empty bed, so nothing-planted stays a different state from bare', () => {
    expect(outOfSeason([], none, 20)).toEqual([])
  })

  it('never reports a perennial, which is standing whatever the day is', () => {
    expect(outOfSeason([early], () => withLifeCycle('woody-perennial'), 20)).toEqual([])
  })
})
