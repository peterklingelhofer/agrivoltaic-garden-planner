import { beforeAll, describe, expect, it } from 'bun:test'
import { cropById, loadCropCatalog } from '../data/crops'
import type { BedCalendar } from '../types/calendar'
import type { Crop } from '../types/crop'
import type { Bed } from '../types/garden'
import type { BedId, CropId, PlantingId } from '../types/ids'
import type { Celsius, DayOfYear, SquareMeters } from '../types/units'
import { bedCalendar, cropCalendar, forwardDays, INDOOR_RAISING_DAYS } from './calendar'
import {
  areaPerPlantM2,
  bedOccupancy,
  calendarFor,
  calendarSowDay,
  derivePlanting,
  feasibilityWords,
  plantingDensity,
  plantingIdFor,
} from './planting'
import { assignCanopyTier } from './stages/space'
import {
  bedFixture,
  bedLightFixture,
  FROST_EVERY_YEAR,
  frostFreeSiteFixture,
  siteFixture,
} from './testkit'

let catalog: readonly Crop[] = []
const cropOf = (id: string): Crop => {
  const crop = cropById(catalog, id as CropId)
  expect(crop, `${id} is missing from the catalogue`).toBeDefined()
  return crop as Crop
}

const site = siteFixture()
const beds = [bedFixture('bed-a'), bedFixture('bed-b')]
const lights = [bedLightFixture('bed-a', 0.2), bedLightFixture('bed-b', 0.35)]

const calendarsFor = (): readonly BedCalendar[] =>
  lights.map((light) => bedCalendar(site, light, catalog, 20))

beforeAll(async () => {
  catalog = await loadCropCatalog()
})

describe('planting density', () => {
  it('divides the bed by the equidistant spacing cell', () => {
    const crop = {
      ...cropOf('lettuce-leaf'),
      spacing: { inRowCm: 25, betweenRowsCm: 40, equidistantCm: 30 },
    }
    const density = plantingDensity(crop, 12)
    expect(density.ok).toBe(true)
    if (!density.ok) return
    expect(density.value.basis).toBe('equidistant')
    // 0.30 m grid is 0.09 m2 per plant, so a 12 m2 bed holds floor(12 / 0.09) = 133
    expect(density.value.areaPerPlantM2).toBeCloseTo(0.09, 6)
    expect(density.value.plantsPerM2).toBeCloseTo(11.111, 3)
    expect(density.value.plantCount).toBe(133)
  })

  it('falls back to in-row by between-rows when the catalogue carries no equidistant spacing', () => {
    const crop = {
      ...cropOf('lettuce-leaf'),
      spacing: { inRowCm: 25, betweenRowsCm: 75, equidistantCm: 0 },
    }
    const density = plantingDensity(crop, 12)
    expect(density.ok).toBe(true)
    if (!density.ok) return
    expect(density.value.basis).toBe('row')
    expect(density.value.areaPerPlantM2).toBeCloseTo(0.1875, 6)
    expect(density.value.plantCount).toBe(64)
  })

  it('is the same helper the bed area is read through, so the count scales with the bed', () => {
    const crop = cropOf('lettuce-leaf')
    const small = plantingDensity(crop, 6)
    const large = plantingDensity(crop, 24)
    expect(small.ok && large.ok).toBe(true)
    if (!small.ok || !large.ok) return
    expect(large.value.plantCount / small.value.plantCount).toBeCloseTo(4, 1)
    expect(large.value.plantsPerM2).toBeCloseTo(small.value.plantsPerM2, 12)
  })

  it('refuses rather than inventing a count when the catalogue spacing is unusable', () => {
    const crop = {
      ...cropOf('lettuce-leaf'),
      spacing: { inRowCm: 0, betweenRowsCm: 0, equidistantCm: 0 },
    }
    const density = plantingDensity(crop, 12)
    expect(density.ok).toBe(false)
    if (density.ok) return
    expect(density.reason).toContain('no usable spacing')
  })

  it('refuses a bed that cannot hold one plant at catalogue spacing', () => {
    const crop = {
      ...cropOf('lettuce-leaf'),
      spacing: { inRowCm: 500, betweenRowsCm: 500, equidistantCm: 500 },
    }
    const density = plantingDensity(crop, 12)
    expect(density.ok).toBe(false)
    if (density.ok) return
    expect(density.reason).toContain('25.00 m²')
    expect(density.reason).toContain('12.00 m²')
  })

  it('reads no area per plant at all from an empty spacing record', () => {
    expect(areaPerPlantM2({ inRowCm: 0, betweenRowsCm: 30, equidistantCm: 0 })).toBeNull()
  })
})

describe('deriving a planting', () => {
  it('takes the tier from the array clearance, the role from the catalogue and the harvest from the calendar', () => {
    const crop = cropOf('lettuce-leaf')
    const bed = beds[0] as Bed
    const calendars = calendarsFor()
    const calendar = calendarFor(calendars, bed.id, crop.id)
    expect(calendar).toBeDefined()
    const derived = derivePlanting({
      id: plantingIdFor(bed.id, crop.id, 100 as DayOfYear),
      bed,
      crop,
      arrays: [],
      calendar,
    })
    expect(derived.ok).toBe(true)
    if (!derived.ok) return
    expect(derived.value.tier).toBe(assignCanopyTier(crop, []))
    expect(derived.value.role).toBe('target-crop')
    // sown on the calendar's own day, the harvest window is the calendar's, unshifted
    expect(derived.value.sowDay).toBe(calendar?.plantings[0]?.recommended)
    expect(derived.value.harvestStartDay).toBe(calendar?.harvest.start)
    expect(derived.value.harvestEndDay).toBe(calendar?.harvest.end)
    expect(derived.value.plantCount).toBe(
      plantingDensity(crop, bed.areaM2).ok
        ? (plantingDensity(crop, bed.areaM2) as { value: { plantCount: number } }).value.plantCount
        : -1,
    )
  })

  it('carries the calendar lag to a sow day the user moved', () => {
    const crop = cropOf('lettuce-leaf')
    const bed = beds[0] as Bed
    const calendar = calendarFor(calendarsFor(), bed.id, crop.id)
    const sowDay = ((calendar?.plantings[0]?.recommended ?? 1) + 10) as DayOfYear
    const derived = derivePlanting({
      id: plantingIdFor(bed.id, crop.id, sowDay),
      bed,
      crop,
      arrays: [],
      calendar,
      sowDay,
    })
    expect(derived.ok).toBe(true)
    if (!derived.ok) return
    expect(derived.value.sowDay).toBe(sowDay)
    expect(derived.value.harvestStartDay).toBe((calendar?.harvest.start ?? 0) + 10)
  })

  it('reads a companion species role out of the catalogue rather than defaulting it', () => {
    expect(cropOf('marigold-french').role).toBe('insectary')
    expect(cropOf('clover-crimson').role).toBe('cover')
    expect(cropOf('nasturtium').role).toBe('trap')
    expect(cropOf('tomato').role).toBeNull()
    const crop = cropOf('marigold-french')
    const bed = beds[0] as Bed
    const derived = derivePlanting({
      id: plantingIdFor(bed.id, crop.id, 120 as DayOfYear),
      bed,
      crop,
      arrays: [],
      calendar: calendarFor(calendarsFor(), bed.id, crop.id),
    })
    expect(derived.ok).toBe(true)
    if (!derived.ok) return
    expect(derived.value.role).toBe('insectary')
  })

  it('refuses a crop with no calendar for that bed', () => {
    const crop = cropOf('lettuce-leaf')
    const derived = derivePlanting({
      id: 'x' as PlantingId,
      bed: beds[0] as Bed,
      crop,
      arrays: [],
      calendar: undefined,
    })
    expect(derived.ok).toBe(false)
    if (derived.ok) return
    expect(derived.reason).toContain('no planting calendar')
  })

  it('refuses a crop the calendar gives no planting window, naming the feasibility', () => {
    const calendars = calendarsFor()
    const bed = beds[0] as Bed
    const barren = calendars
      .find((entry) => entry.bedId === bed.id)
      ?.entries.find((entry) => entry.plantings.length === 0)
    expect(barren, 'no infeasible crop in the fixture to refuse').toBeDefined()
    if (barren === undefined) return
    const derived = derivePlanting({
      id: 'x' as PlantingId,
      bed,
      crop: cropOf(barren.cropId as string),
      arrays: [],
      calendar: barren,
    })
    expect(derived.ok).toBe(false)
    if (derived.ok) return
    expect(derived.reason).toContain(feasibilityWords(barren.feasibility.kind))
  })

  it('refuses a plan slot whose harvest ends before the calendar says the crop is ready', () => {
    const crop = cropOf('lettuce-leaf')
    const bed = beds[0] as Bed
    const calendar = calendarFor(calendarsFor(), bed.id, crop.id)
    const sowDay = (calendar?.plantings[0]?.recommended ?? 1) as DayOfYear
    const derived = derivePlanting({
      id: 'x' as PlantingId,
      bed,
      crop,
      arrays: [],
      calendar,
      sowDay,
      harvestEndDay: (sowDay + 1) as DayOfYear,
    })
    expect(derived.ok).toBe(false)
    if (derived.ok) return
    expect(derived.reason).toContain('not ready to pick')
  })

  it('refuses a bed too small for one plant instead of rounding up to one', () => {
    const crop = cropOf('lettuce-leaf')
    const bed = { ...(beds[0] as Bed), areaM2: 0.001 as SquareMeters }
    const derived = derivePlanting({
      id: 'x' as PlantingId,
      bed,
      crop,
      arrays: [],
      calendar: calendarFor(calendarsFor(), (beds[0] as Bed).id, crop.id),
    })
    expect(derived.ok).toBe(false)
    if (derived.ok) return
    expect(derived.reason).toContain('offers 0.00 m²')
  })
})

/**
 * Pune: this derivation refuses a crop with no window, so if every annual's calendar were barren,
 * "Plant every bed" would plant nothing. The calendar is pinned in `calendar.test.ts`; this is the
 * same crop reaching the derivation the fill actually calls
 */
describe('a site with no frost in the record', () => {
  it('derives a planting from the soil-temperature calendar', () => {
    const pune = frostFreeSiteFixture()
    const tomato = cropOf('tomato')
    const bed = beds[0] as Bed
    const calendar = cropCalendar({
      crop: tomato,
      site: pune,
      light: bedLightFixture(bed.id as string, 0, 36, pune.normals.monthlyMeanDliMolM2Day),
      percentile: 20,
    })
    const sowDay = calendarSowDay(calendar)
    expect(sowDay).not.toBeNull()
    if (sowDay === null) return
    const derived = derivePlanting({
      id: plantingIdFor(bed.id, tomato.id, sowDay),
      bed,
      crop: tomato,
      arrays: [],
      calendar,
      catalog,
    })
    expect(derived.ok).toBe(true)
    if (!derived.ok) return
    expect(derived.value.plantCount).toBeGreaterThan(0)
    expect(forwardDays(derived.value.sowDay, derived.value.harvestStartDay)).toBeGreaterThan(
      INDOOR_RAISING_DAYS[tomato.dliClass],
    )
  })
})

describe('planting identity', () => {
  it('keys a planting by bed, crop and sow day so the same sowing is never added twice', () => {
    const id = plantingIdFor('bed-a' as BedId, 'lettuce' as CropId, 100 as DayOfYear)
    expect(id).toBe(plantingIdFor('bed-a' as BedId, 'lettuce' as CropId, 100 as DayOfYear))
    expect(id).not.toBe(plantingIdFor('bed-a' as BedId, 'lettuce' as CropId, 101 as DayOfYear))
    expect(id).not.toBe(plantingIdFor('bed-b' as BedId, 'lettuce' as CropId, 100 as DayOfYear))
  })
})

/**
 * A bed has a size and the plants in it have a spacing, so a bed can be full. `derivePlanting`
 * measures the space already planted, so the same bed can't be filled to capacity twice and a typed
 * count can't exceed what fits. These pin the one space model
 */
describe('a bed that is already planted', () => {
  const fill = (bed: Bed, crop: Crop, count: number): Bed => {
    const derived = derivePlanting({
      id: plantingIdFor(bed.id, crop.id, 100 as DayOfYear),
      bed,
      crop,
      arrays: [],
      calendar: calendarFor(calendarsFor(), bed.id, crop.id),
      plantCount: count,
      catalog,
    })
    if (!derived.ok) throw new Error(`fixture could not be planted: ${derived.reason}`)
    return { ...bed, plantings: [derived.value] }
  }

  it('counts the area its plantings already take', () => {
    const crop = cropOf('lettuce-leaf')
    const bed = beds[0] as Bed
    const empty = bedOccupancy(bed, catalog)
    expect(empty.plantedM2).toBe(0)
    expect(empty.freeM2).toBeCloseTo(bed.areaM2, 6)

    const spacing = areaPerPlantM2(crop.spacing)
    const planted = bedOccupancy(fill(bed, crop, 10), catalog)
    expect(planted.plantedM2).toBeCloseTo((spacing?.areaM2 ?? 0) * 10, 6)
    expect(planted.freeM2).toBeCloseTo(bed.areaM2 - planted.plantedM2, 6)
  })

  it('sizes the next planting against what is left, not against the whole bed', () => {
    const crop = cropOf('lettuce-leaf')
    const bed = beds[0] as Bed
    const whole = plantingDensity(crop, bed.areaM2)
    expect(whole.ok).toBe(true)
    if (!whole.ok) return

    const half = Math.floor(whole.value.plantCount / 2)
    const next = derivePlanting({
      id: plantingIdFor(bed.id, cropOf('spinach').id, 100 as DayOfYear),
      bed: fill(bed, crop, half),
      crop: cropOf('spinach'),
      arrays: [],
      calendar: calendarFor(calendarsFor(), bed.id, cropOf('spinach').id),
      catalog,
    })
    expect(next.ok).toBe(true)
    if (!next.ok) return
    const alone = plantingDensity(cropOf('spinach'), bed.areaM2)
    expect(alone.ok).toBe(true)
    if (!alone.ok) return
    expect(next.value.plantCount).toBeLessThan(alone.value.plantCount)
  })

  it('refuses a count the remaining room cannot hold, and says what would fit', () => {
    const crop = cropOf('lettuce-leaf')
    const bed = beds[0] as Bed
    const whole = plantingDensity(crop, bed.areaM2)
    if (!whole.ok) return
    const refused = derivePlanting({
      id: plantingIdFor(bed.id, crop.id, 101 as DayOfYear),
      bed,
      crop,
      arrays: [],
      calendar: calendarFor(calendarsFor(), bed.id, crop.id),
      plantCount: whole.value.plantCount * 10,
      catalog,
    })
    expect(refused.ok).toBe(false)
    expect(refused.ok ? '' : refused.reason).toContain('room for')
  })

  /**
   * A bed packed with one crop is not necessarily full: `plantCount` floors, so the remainder is
   * smaller than one more of THAT crop and can still hold a smaller one. 299 lettuce at 0.04 m2
   * leave 0.04 m2 of a 12 m2 bed, which is exactly one spinach at 0.0225. The property worth
   * asserting is that the remainder is what the second crop gets, not the whole bed
   */
  it('gives a second crop only the remainder, not the bed over again', () => {
    const crop = cropOf('lettuce-leaf')
    const spinach = cropOf('spinach')
    const bed = beds[0] as Bed
    const whole = plantingDensity(crop, bed.areaM2)
    const spinachAlone = plantingDensity(spinach, bed.areaM2)
    if (!whole.ok || !spinachAlone.ok) return

    const full = fill(bed, crop, whole.value.plantCount)
    const second = derivePlanting({
      id: plantingIdFor(bed.id, spinach.id, 100 as DayOfYear),
      bed: full,
      crop: spinach,
      arrays: [],
      calendar: calendarFor(calendarsFor(), bed.id, spinach.id),
      catalog,
    })
    expect(second.ok).toBe(true)
    if (!second.ok) return
    const remainder = bedOccupancy(full, catalog).freeM2
    expect(second.value.plantCount).toBe(Math.floor(remainder / 0.0225))
    // and that is a tiny fraction of what an empty bed would have offered it
    expect(second.value.plantCount).toBeLessThan(spinachAlone.value.plantCount / 100)
  })

  /**
   * There is nearly always a smaller crop that fits the leftover: lettuce 0.04, spinach 0.0225,
   * arugula 0.0144. The unambiguous "this bed is full" is the SAME crop again, which would
   * otherwise hand the grower a bed planted twice over
   */
  it('refuses a second helping of the crop that already fills it', () => {
    const crop = cropOf('lettuce-leaf')
    const bed = beds[0] as Bed
    const whole = plantingDensity(crop, bed.areaM2)
    if (!whole.ok) return
    const full = fill(bed, crop, whole.value.plantCount)
    const again = derivePlanting({
      id: plantingIdFor(bed.id, crop.id, 200 as DayOfYear),
      bed: full,
      crop,
      arrays: [],
      calendar: calendarFor(calendarsFor(), bed.id, crop.id),
      catalog,
    })
    expect(again.ok).toBe(false)
    expect(again.ok ? '' : again.reason).toContain('is full')
    // 'room' is how the panel knows to bring its replace select up where a reader can reach it,
    // matched as a value a switch statement compares directly
    expect(again.ok ? undefined : again.cause).toBe('room')
  })

  it('lets a planting be edited without its own area counting against it', () => {
    const crop = cropOf('lettuce-leaf')
    const bed = beds[0] as Bed
    const whole = plantingDensity(crop, bed.areaM2)
    if (!whole.ok) return
    const full = fill(bed, crop, whole.value.plantCount)
    const sameAgain = derivePlanting({
      id: full.plantings[0]?.id as PlantingId,
      bed: full,
      crop,
      arrays: [],
      calendar: calendarFor(calendarsFor(), bed.id, crop.id),
      plantCount: whole.value.plantCount,
      catalog,
    })
    expect(sameAgain.ok).toBe(true)
  })
})

/**
 * Garlic is planted as cloves the autumn before it is harvested. `calendar.test.ts` pins the date
 * the calendar itself produces. This is the same crop reaching the derivation a gardener's press
 * actually calls, so a calendar that merely LOOKS right cannot pass here while still refusing the
 * planting underneath it
 */
describe('garlic, sown the autumn before it is harvested', () => {
  const lateOctoberFrost = siteFixture({
    frost: [
      {
        ...FROST_EVERY_YEAR,
        thresholdC: 0 as Celsius,
        lastSpringFreeze: { 10: 130, 20: 125, 30: 120, 40: 115, 50: 110 } as never,
        firstFallFreeze: { 10: 295, 20: 301, 30: 305, 40: 309, 50: 313 } as never,
        frostFreeDays: { 10: 165, 20: 176, 30: 185, 40: 194, 50: 203 } as never,
      },
    ],
  })

  it('derives a planting a gardener can actually press, not just a barren calendar entry', () => {
    const garlic = cropOf('garlic')
    const bed = beds[0] as Bed
    const calendar = cropCalendar({
      crop: garlic,
      site: lateOctoberFrost,
      light: bedLightFixture('bed-a', 0),
      percentile: 20,
    })
    expect(calendar.feasibility.kind).toBe('fits')
    expect(calendar.plantings.some((planting) => planting.method === 'start-indoors')).toBe(false)
    const sowDay = calendarSowDay(calendar)
    expect(sowDay).not.toBeNull()
    if (sowDay === null) return
    // October: day 274 is the 1st, day 304 the 31st
    expect(sowDay).toBeGreaterThanOrEqual(274)
    expect(sowDay).toBeLessThanOrEqual(304)

    const derived = derivePlanting({
      id: plantingIdFor(bed.id, garlic.id, sowDay),
      bed,
      crop: garlic,
      arrays: [],
      calendar,
      catalog,
    })
    expect(derived.ok).toBe(true)
    if (!derived.ok) return
    // a clove sown in autumn is lifted the following summer, not the same one it went in
    expect(forwardDays(sowDay, derived.value.harvestStartDay)).toBeGreaterThan(200)
  })
})
