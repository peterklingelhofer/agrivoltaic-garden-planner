import { beforeEach, describe, expect, it } from 'bun:test'
import { loadCropCatalog } from '../data/crops'
import { bedCalendar } from '../recommend/calendar'
import { calendarFor, derivePlanting, plantingIdFor } from '../recommend/planting'
import { bedLightFixture, siteFixture } from '../recommend/testkit'
import type { Crop } from '../types/crop'
import type { Bed, Planting } from '../types/garden'
import type { CropId } from '../types/ids'
import type { DayOfYear } from '../types/units'
import { ready } from './slices'
import { resetAppStore, useAppStore } from './store'

const CROP = 'lettuce-leaf' as CropId

const firstBed = (): Bed => {
  const bed = useAppStore.getState().plot?.beds[0]
  expect(bed).toBeDefined()
  return bed as Bed
}

const plantingsOf = (bed: Bed): readonly Planting[] =>
  useAppStore.getState().plot?.beds.find((b) => b.id === bed.id)?.plantings ?? []

const calendarsFor = (catalog: readonly Crop[]): ReturnType<typeof bedCalendar>[] =>
  (useAppStore.getState().plot?.beds ?? []).map((bed) =>
    bedCalendar(siteFixture(), bedLightFixture(bed.id as string, 0.2), catalog, 50),
  )

const seed = (catalog: readonly Crop[], bed: Bed, cropId = CROP): Planting => {
  const crop = catalog.find((entry) => entry.id === cropId) as Crop
  const derived = derivePlanting({
    id: plantingIdFor(bed.id, crop.id, 120 as DayOfYear),
    bed,
    crop,
    arrays: useAppStore.getState().plot?.arrays ?? [],
    calendar: calendarFor(calendarsFor(catalog), bed.id, crop.id),
    sowDay: 120 as DayOfYear,
  })
  expect(derived.ok).toBe(true)
  if (!derived.ok) throw new Error(derived.reason)
  return derived.value
}

let catalog: readonly Crop[] = []

beforeEach(async () => {
  resetAppStore()
  catalog = await loadCropCatalog()
})

describe('planting actions', () => {
  it('adds a planting to the bed it names and leaves the other beds alone', () => {
    const bed = firstBed()
    const other = useAppStore.getState().plot?.beds[1] as Bed
    useAppStore.getState().addPlanting(seed(catalog, bed))
    expect(plantingsOf(bed)).toHaveLength(1)
    expect(plantingsOf(other)).toHaveLength(0)
    expect(plantingsOf(bed)[0]?.bedId).toBe(bed.id)
  })

  it('leaves the annual bake and the electricity term standing: a planting moves neither', () => {
    const bed = firstBed()
    useAppStore.setState({ energy: ready({ annualAcKwh: 1 } as never) })
    useAppStore.getState().addPlanting(seed(catalog, bed))
    expect(useAppStore.getState().energy.status).toBe('ready')
    expect(useAppStore.getState().raster.status).toBe('idle')
  })

  /**
   * The same crop sown the same day is the same planting, so adding it again is more of it.
   *
   * It used to replace: a second press added one cucumber to the
   * example's Bed 1, which already carried seventeen sown on the same day, and sixteen of them
   * left the picture. That reads as the app taking plants away
   */
  it('adds to the planting already there when the same sowing is added twice', () => {
    const bed = firstBed()
    const planting = seed(catalog, bed)
    useAppStore.getState().addPlanting(planting)
    useAppStore.getState().addPlanting({ ...planting, plantCount: 7 })
    expect(plantingsOf(bed)).toHaveLength(1)
    expect(plantingsOf(bed)[0]?.plantCount).toBe(planting.plantCount + 7)
  })

  it('updates the count and the sow day without moving the planting to another bed', () => {
    const bed = firstBed()
    const planting = seed(catalog, bed)
    useAppStore.getState().addPlanting(planting)
    useAppStore
      .getState()
      .updatePlanting(bed.id, planting.id, { plantCount: 42, sowDay: 99 as DayOfYear })
    const stored = plantingsOf(bed)[0]
    expect(stored?.plantCount).toBe(42)
    expect(stored?.sowDay).toBe(99)
    expect(stored?.id).toBe(planting.id)
    expect(stored?.bedId).toBe(bed.id)
    expect(stored?.cropId).toBe(planting.cropId)
  })

  it('removes exactly the planting it is given', () => {
    const bed = firstBed()
    const one = seed(catalog, bed)
    const two = { ...one, id: `${one.id as string}-b` as typeof one.id, plantCount: 3 }
    useAppStore.getState().addPlanting(one)
    useAppStore.getState().addPlanting(two)
    expect(plantingsOf(bed)).toHaveLength(2)
    useAppStore.getState().removePlanting(bed.id, one.id)
    expect(plantingsOf(bed).map((p) => p.id)).toEqual([two.id])
  })

  it('ignores an update aimed at a planting that is not there', () => {
    const bed = firstBed()
    useAppStore.getState().addPlanting(seed(catalog, bed))
    useAppStore.getState().updatePlanting(bed.id, 'nothing' as never, { plantCount: 9 })
    expect(plantingsOf(bed)[0]?.plantCount).not.toBe(9)
  })
})
