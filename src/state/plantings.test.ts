import { beforeEach, describe, expect, it } from 'bun:test'
import { loadCropCatalog } from '../data/crops'
import { bedCalendar, forwardDays } from '../recommend/calendar'
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
   * Replacing it would let adding one cucumber to a bed already carrying seventeen sown the same
   * day wipe out sixteen of them, which reads as the app taking the plants
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

  /**
   * A sowing moved in the bed takes its harvest with it, by the rule that dated the planting when
   * it went in. Lettuce is an annual with no day-length trigger, so its lag from sowing to harvest
   * is the calendar's own, and the window moves by the days the sowing moved
   */
  it('re-dates the harvest from a moved sowing, by the lag the calendar gave it', () => {
    const bed = firstBed()
    const planting = seed(catalog, bed)
    useAppStore.setState({ catalog: ready(catalog), calendars: ready(calendarsFor(catalog)) })
    useAppStore.getState().addPlanting(planting)
    useAppStore.getState().updatePlanting(bed.id, planting.id, { sowDay: 99 as DayOfYear })
    const stored = plantingsOf(bed)[0] as Planting
    expect(stored.harvestStartDay).not.toBe(planting.harvestStartDay)
    expect(forwardDays(99 as DayOfYear, stored.harvestStartDay)).toBe(
      forwardDays(planting.sowDay, planting.harvestStartDay),
    )
    expect(forwardDays(99 as DayOfYear, stored.harvestEndDay)).toBe(
      forwardDays(planting.sowDay, planting.harvestEndDay),
    )
  })

  it('keeps a harvest the patch brings, and the stored one where no calendar can date the sowing', () => {
    const bed = firstBed()
    const planting = seed(catalog, bed)
    useAppStore.getState().addPlanting(planting)
    // no calendars in the store: a harvest date the calendar can't give would be invented
    useAppStore.getState().updatePlanting(bed.id, planting.id, { sowDay: 99 as DayOfYear })
    expect(plantingsOf(bed)[0]?.sowDay).toBe(99)
    expect(plantingsOf(bed)[0]?.harvestStartDay).toBe(planting.harvestStartDay)
    useAppStore.setState({ catalog: ready(catalog), calendars: ready(calendarsFor(catalog)) })
    useAppStore.getState().updatePlanting(bed.id, planting.id, {
      sowDay: 130 as DayOfYear,
      harvestStartDay: 200 as DayOfYear,
      harvestEndDay: 230 as DayOfYear,
    })
    expect(plantingsOf(bed)[0]?.harvestStartDay).toBe(200)
    expect(plantingsOf(bed)[0]?.harvestEndDay).toBe(230)
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
