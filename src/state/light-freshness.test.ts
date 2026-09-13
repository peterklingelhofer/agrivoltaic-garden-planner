import { beforeEach, describe, expect, it } from 'bun:test'
import type { Bed, Planting } from '../types/garden'
import { makeArray, makeBed } from './defaults'
import { lightGeometryKey, lightIsStale } from './light-freshness'
import { ready } from './slices'
import { resetAppStore, useAppStore } from './store'

/**
 * What these hold the line on: a garden rearranged under a light field computed for the old
 * arrangement, with every surface presenting that field as current. The panel would move in the 3D
 * while the colours on the ground and the crop ranking stayed put, and the editor would say
 * `Simulation: ready` throughout
 */

beforeEach(() => resetAppStore())

const state = (): ReturnType<typeof useAppStore.getState> => useAppStore.getState()

/**
 * A planting, built as a literal because the real one comes out of `derivePlanting`, which needs a
 * catalogue and a light field: all that matters here is that a bed HAS one more than it did, which
 * is what the key must ignore
 */
const aPlanting = (bedId: Bed['id']): Planting =>
  ({
    id: 'planting-test' as Planting['id'],
    bedId,
    cropId: 'tomato' as Planting['cropId'],
    cultivarId: null,
    role: 'target-crop',
    tier: 'mid-canopy',
    sowDay: 100 as Planting['sowDay'],
    harvestStartDay: 200 as Planting['harvestStartDay'],
    harvestEndDay: 240 as Planting['harvestEndDay'],
    plantCount: 4,
  }) satisfies Planting

/** Pretends a bake finished over whatever the plot currently is */
const bakeHappened = (): void => {
  const plot = state().plot
  expect(plot).not.toBeNull()
  useAppStore.setState((s) => ({
    ...s,
    raster: ready({ ...(s.raster.status === 'ready' ? s.raster.value : {}) } as never),
    lightGeometry: lightGeometryKey(plot!),
  }))
}

describe('the light geometry key', () => {
  it('moves when an array moves', () => {
    const plot = state().plot!
    const moved = {
      ...plot,
      arrays: [makeArray(1, { label: 'shifted' })],
    }
    expect(lightGeometryKey(moved)).not.toBe(lightGeometryKey(plot))
  })

  /**
   * Plantings are the one exclusion, and it is deliberate: light falls on a bed, and what is
   * growing in it is downstream of that answer rather than an input to it. Planting a bed must
   * not send a grower back to the simulation
   */
  it('does not move when a bed gains a planting', () => {
    const plot = state().plot!
    const bed = plot.beds[0]!
    const planted = {
      ...plot,
      beds: [{ ...bed, plantings: [...bed.plantings, aPlanting(bed.id)] }, ...plot.beds.slice(1)],
    }
    expect(planted.beds[0]!.plantings.length).toBe(bed.plantings.length + 1)
    expect(lightGeometryKey(planted)).toBe(lightGeometryKey(plot))
  })

  /**
   * The ground's albedo is a term in the light that reaches the beds, not only in the generation:
   * `applyInterreflection` scales every cell by what the ground throws back at the module
   * underside and back down. A cover changed under a finished bake leaves a reading about a
   * garden that is no longer on screen, and it has to say so
   */
  it('moves when the ground cover changes, because the ground is part of the light', () => {
    const plot = state().plot!
    expect(plot.groundCover).not.toBe('straw-mulch')
    const mulched = { ...plot, groundCover: 'straw-mulch' as const }
    expect(lightGeometryKey(mulched)).not.toBe(lightGeometryKey(plot))
  })
})

describe('whether the light on screen is about the garden on screen', () => {
  it('is not stale before anything has been computed', () => {
    expect(lightIsStale(state())).toBe(false)
  })

  it('is not stale straight after a bake', () => {
    bakeHappened()
    expect(lightIsStale(state())).toBe(false)
  })

  it('goes stale when an array is moved', () => {
    bakeHappened()
    const array = state().plot!.arrays[0]
    expect(array).toBeDefined()
    state().upsertArray({
      ...array!,
      geometry: {
        ...array!.geometry,
        rowAzimuthDeg: (array!.geometry.rowAzimuthDeg + 20) as never,
      },
    })
    expect(lightIsStale(state())).toBe(true)
  })

  it('goes stale when a bed is moved', () => {
    bakeHappened()
    state().upsertBed(makeBed(1, { label: 'dragged somewhere else' }))
    expect(lightIsStale(state())).toBe(true)
  })

  /** The whole point of excluding plantings from the key, asserted through the real action */
  it('stays fresh when a bed is planted', () => {
    bakeHappened()
    const bed = state().plot!.beds[0]!
    state().upsertBed({ ...bed, plantings: [...bed.plantings, aPlanting(bed.id)] })
    expect(state().plot!.beds[0]!.plantings.length).toBe(bed.plantings.length + 1)
    expect(lightIsStale(state())).toBe(false)
  })
})
