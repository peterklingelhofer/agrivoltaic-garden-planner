import type { BedCalendar, CropCalendar } from '../types/calendar'
import type { Crop, Spacing, SpacingBasis } from '../types/crop'
import type { Bed, Planting } from '../types/garden'
import type { BedId, CropId, CultivarId, PlantingId } from '../types/ids'
import type { PvArray } from '../types/pv'
import type { DayOfYear } from '../types/units'
import { forwardDays, wrapDayOfYear } from './calendar'
import { assignCanopyTier } from './stages/space'

/**
 * Turning a chosen crop into a Planting.
 *
 * A `PlanSlot` and a picked crop both carry less than a `Planting` needs, and the missing
 * fields are derived from the catalogue, the array geometry and the planting calendar:
 * never guessed. A field that cannot be derived refuses the whole planting and says which
 * input was missing, because a fabricated tier, harvest date or plant count is worse than
 * no planting at all
 */
export type Derivation<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly reason: string; readonly cause?: 'room' }

const refuse = <T>(reason: string, cause?: 'room'): Derivation<T> => ({ ok: false, reason, cause })

export type { SpacingBasis }

export interface PlantingDensity {
  readonly basis: SpacingBasis
  readonly areaPerPlantM2: number
  readonly plantsPerM2: number
  readonly plantCount: number
}

const usable = (value: number): boolean => Number.isFinite(value) && value > 0

/**
 * Area one plant occupies at catalogue spacing. A bed is planted on an equidistant grid,
 * so `equidistantCm` squared is the basis; a crop that carries only a row spacing falls
 * back to in-row by between-rows, which is the same rectangle a field would use
 */
export const areaPerPlantM2 = (
  spacing: Spacing,
): { readonly basis: SpacingBasis; readonly areaM2: number } | null => {
  if (usable(spacing.equidistantCm)) {
    return { basis: 'equidistant', areaM2: (spacing.equidistantCm / 100) ** 2 }
  }
  if (usable(spacing.inRowCm) && usable(spacing.betweenRowsCm)) {
    return { basis: 'row', areaM2: (spacing.inRowCm / 100) * (spacing.betweenRowsCm / 100) }
  }
  return null
}

export interface BedOccupancy {
  readonly areaM2: number
  readonly plantedM2: number
  readonly freeM2: number
  /** Plantings whose crop is missing from the catalogue, so their area could not be counted */
  readonly uncounted: readonly PlantingId[]
}

/**
 * How much of a bed its existing plantings already take, at the same catalogue spacing every
 * other placement is measured with.
 *
 * Nothing computed this before, and its absence was a real hole rather than an omission: a bed
 * could be planted to capacity, then planted to capacity again, because `derivePlanting` sized
 * every new planting against the WHOLE bed and only ever checked that the count was at least
 * one. The polyculture path had it right all along in `allocateSpace`; this is the same
 * arithmetic, made available to the one-crop-at-a-time path so there is a single space model.
 *
 * `exceptPlantingId` is how an EDIT differs from an ADD: re-deriving a planting must not count
 * that planting's own area against itself
 */
export const bedOccupancy = (
  bed: Bed,
  catalog: readonly Crop[],
  exceptPlantingId?: PlantingId,
): BedOccupancy => {
  const uncounted: PlantingId[] = []
  let plantedM2 = 0
  for (const planting of bed.plantings) {
    if (planting.id === exceptPlantingId) continue
    const crop = catalog.find((entry) => entry.id === planting.cropId)
    const spacing = crop === undefined ? null : areaPerPlantM2(crop.spacing)
    if (spacing === null) {
      uncounted.push(planting.id)
      continue
    }
    plantedM2 += spacing.areaM2 * planting.plantCount
  }
  return {
    areaM2: bed.areaM2,
    plantedM2,
    freeM2: Math.max(bed.areaM2 - plantedM2, 0),
    uncounted,
  }
}

/** The one density model in the product: the UI defaults and `allocateSpace` both use it */
export const plantingDensity = (crop: Crop, areaM2: number): Derivation<PlantingDensity> => {
  const spacing = areaPerPlantM2(crop.spacing)
  if (spacing === null) {
    return refuse(
      `${crop.id as string} carries no usable spacing in the catalogue, so a plant count cannot be derived from the bed area`,
    )
  }
  if (!usable(areaM2)) return refuse('this bed has no area to divide by the catalogue spacing')
  const plantCount = Math.floor(areaM2 / spacing.areaM2)
  if (plantCount < 1) {
    return refuse(
      `one ${crop.id as string} needs ${spacing.areaM2.toFixed(2)} m² at ${spacing.basis} spacing and this bed offers ${areaM2.toFixed(2)} m²`,
    )
  }
  return {
    ok: true,
    value: {
      basis: spacing.basis,
      areaPerPlantM2: spacing.areaM2,
      plantsPerM2: 1 / spacing.areaM2,
      plantCount,
    },
  }
}

export const calendarFor = (
  calendars: readonly BedCalendar[],
  bedId: BedId,
  cropId: CropId,
): CropCalendar | undefined =>
  calendars.find((entry) => entry.bedId === bedId)?.entries.find((crop) => crop.cropId === cropId)

/** The first window is when the grower starts, indoors or in place */
export const calendarSowDay = (calendar: CropCalendar): DayOfYear | null =>
  calendar.plantings[0]?.recommended ?? null

export const plantingIdFor = (bedId: BedId, cropId: CropId, sowDay: DayOfYear): PlantingId =>
  `${bedId as string}:${cropId as string}:${String(sowDay)}` as PlantingId

export interface PlantingDraft {
  readonly id: PlantingId
  readonly bed: Bed
  readonly crop: Crop
  readonly arrays: readonly PvArray[]
  readonly calendar: CropCalendar | undefined
  /** Defaults to the calendar's own recommended day */
  readonly sowDay?: DayOfYear
  /** A plan slot's harvest end, checked against the derived start rather than trusted */
  readonly harvestEndDay?: DayOfYear
  readonly plantCount?: number
  readonly cultivarId?: CultivarId | null
  /**
   * The bed's own catalogue, so the space already planted can be measured. Omitting it sizes the
   * planting against the empty bed, so a bed can be filled twice over. Pass it
   */
  readonly catalog?: readonly Crop[]
}

export const derivePlanting = (draft: PlantingDraft): Derivation<Planting> => {
  const { bed, crop, calendar } = draft
  const cropId = crop.id as string
  if (calendar === undefined) {
    return refuse(
      `no planting calendar for ${cropId} in ${bed.id as string}, so its harvest window would have to be invented`,
    )
  }
  const calendarSow = calendarSowDay(calendar)
  if (calendarSow === null) {
    return refuse(
      `the calendar gives ${cropId} no planting window in ${bed.id as string} (${calendar.feasibility.kind})`,
    )
  }
  // an edit re-derives a planting that is already in the bed, so its own area is not an obstacle
  const occupancy = draft.catalog === undefined ? null : bedOccupancy(bed, draft.catalog, draft.id)
  const availableM2 = occupancy?.freeM2 ?? bed.areaM2
  const density = plantingDensity(crop, availableM2)
  if (!density.ok) {
    // the plain fact first: this is not a shortfall to negotiate with a smaller count, it is
    // every square metre already spoken for. `cause: 'room'` is how the panel knows to put its
    // "Put it in place of" select where a reader can reach it without hunting for it
    return occupancy === null || occupancy.plantedM2 === 0
      ? density
      : refuse(
          `${bed.label} is full: what's already planted takes up all ${occupancy.areaM2.toFixed(1)} m². Take a planting out, or put ${crop.taxonomy.commonNames[0] ?? cropId} in place of one`,
          'room',
        )
  }

  const sowDay = draft.sowDay ?? calendarSow
  // the calendar's own sow-to-harvest lag, carried to whatever day this planting is sown
  const harvestStartDay = wrapDayOfYear(sowDay + forwardDays(calendarSow, calendar.harvest.start))
  const harvestEndDay =
    draft.harvestEndDay ?? wrapDayOfYear(sowDay + forwardDays(calendarSow, calendar.harvest.end))
  if (forwardDays(sowDay, harvestStartDay) > forwardDays(sowDay, harvestEndDay)) {
    return refuse(
      `sown on day ${String(sowDay)}, ${cropId} is not ready to pick until day ${String(harvestStartDay)}, after day ${String(harvestEndDay)}, when the plan ends its harvest`,
    )
  }
  const plantCount = Math.round(draft.plantCount ?? density.value.plantCount)
  if (plantCount < 1) return refuse(`a planting of ${cropId} needs at least one plant`)
  // refused rather than trimmed to what fits: the grower asked for a number and is owed the
  // reason it cannot be had, the same way `allocateSpace` reports a shortfall instead of a guess
  if (plantCount > density.value.plantCount) {
    return refuse(
      `${bed.label} has room for ${String(density.value.plantCount)} ${cropId} at ${density.value.areaPerPlantM2.toFixed(2)} m² each, and ${String(plantCount)} was asked for`,
    )
  }

  return {
    ok: true,
    value: {
      id: draft.id,
      bedId: bed.id,
      cropId: crop.id,
      cultivarId: draft.cultivarId ?? null,
      role: crop.role ?? 'target-crop',
      tier: assignCanopyTier(crop, draft.arrays),
      sowDay,
      harvestStartDay,
      harvestEndDay,
      plantCount,
    },
  }
}

export interface PlanRefusal {
  readonly bedId: BedId
  readonly cropId: CropId
  readonly reason: string
}
