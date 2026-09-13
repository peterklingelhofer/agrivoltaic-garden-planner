import type { CalendarBasis, CalendarFeasibility, PlantingMethod } from './calendar'
import type { CitationId } from './citation-ids.generated'
import type { LifeCycle, SpacingBasis } from './crop'
import type { BedId, CropId } from './ids'
import type { ExceedancePercentile } from './site'
import type { DayOfYear, Days, MonthIndex } from './units'

/**
 * The calendar answers "when is the window for this crop". A gardener asks "what do I do
 * next", which is the same data read down the year instead of across one crop, so every
 * action here is a `PlantingWindow`, a succession schedule or a `HarvestWindow` the
 * calendar already computed, carrying the basis and citations it computed them with
 */
export type AgendaAction = PlantingMethod | 'succession-sow' | 'first-harvest' | 'harvest-ends'

export interface AgendaItem {
  /** bed, crop, action and the window index, so two sowings of one crop stay distinct */
  readonly id: string
  readonly bedId: BedId
  readonly cropId: CropId
  readonly action: AgendaAction
  readonly day: DayOfYear
  /** The last day the action still works, null where the action is a single date */
  readonly through: DayOfYear | null
  /** Every date of a recurring sowing, the first of which is `day`; empty for a one-off */
  readonly repeats: readonly DayOfYear[]
  readonly intervalDays: Days | null
  readonly basis: CalendarBasis
  readonly citations: readonly CitationId[]
  /** Carried so an action can say the crop only finishes under cover, and never dropped */
  readonly feasibility: CalendarFeasibility
  /** Caveats this crop's calendar carries that the others do not */
  readonly notes: readonly string[]
  readonly plantCount: number
}

export type AgendaBucket = 'this-week' | 'this-month' | 'month'

export interface AgendaGroup {
  readonly key: string
  readonly bucket: AgendaBucket
  readonly month: MonthIndex | null
  readonly items: readonly AgendaItem[]
}

/**
 * A crop planted in a bed the calendar refuses to date. It produces no action, which is
 * the point: the reason is shown instead of a cheerful sow date the site cannot deliver
 */
export interface AgendaBlock {
  readonly bedId: BedId
  readonly cropId: CropId
  readonly feasibility: CalendarFeasibility
  readonly notes: readonly string[]
}

/**
 * What a supplier sells it as. A blueberry is a shrub bought once, a tomato is a plant
 * raised under cover from a packet, a carrot is the packet: life cycle decides the first
 * and the planting method the calendar chose decides the other two
 */
export type SupplyKind = 'seed' | 'transplant' | 'perennial-stock'

export interface SupplySpacing {
  readonly basis: SpacingBasis
  readonly areaPerPlantM2: number
}

export interface SupplyLine {
  readonly cropId: CropId
  readonly kind: SupplyKind
  readonly lifeCycle: LifeCycle
  readonly method: PlantingMethod
  readonly beds: readonly BedId[]
  /** Plants in the ground at once, summed over the beds carrying this crop */
  readonly plantsPerSowing: number
  /** Sowings the succession schedule asks for, the most any one bed needs */
  readonly sowings: number
  /** Summed per bed, so two beds on different succession schedules both count */
  readonly quantity: number
  readonly spacing: SupplySpacing | null
}

export interface SupplyGroup {
  readonly kind: SupplyKind
  readonly lines: readonly SupplyLine[]
}

export interface SupplyRefusal {
  readonly bedId: BedId
  readonly cropId: CropId
  readonly reason: string
}

export interface ShoppingList {
  readonly groups: readonly SupplyGroup[]
  readonly refusals: readonly SupplyRefusal[]
}

export interface Agenda {
  /** The day everything is ordered from, and the day the year of actions runs forward from */
  readonly referenceDay: DayOfYear
  readonly frostRiskPercentile: ExceedancePercentile
  readonly groups: readonly AgendaGroup[]
  readonly blocked: readonly AgendaBlock[]
  /** Caveats every dated crop carries, so the panel states them once rather than per row */
  readonly notes: readonly string[]
  readonly shopping: ShoppingList
}
