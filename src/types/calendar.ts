import type { CitationId } from './citation-ids.generated'
import type { BedId, CropId } from './ids'
import type { ExceedancePercentile } from './site'
import type { DayOfYear, Days } from './units'

export type PlantingMethod = 'start-indoors' | 'direct-sow' | 'transplant-out'

// every date must say what produced it, so the UI can show why and cite it
export type CalendarBasis =
  | {
      readonly kind: 'frost-offset'
      readonly anchor: 'last-spring-freeze' | 'first-fall-freeze'
      readonly offsetDays: Days
      readonly percentile: ExceedancePercentile
    }
  | {
      readonly kind: 'soil-temperature'
      readonly minSoilTempC: number
      /** Set where the record holds no frost at this percentile, so soil temperature is the only anchor */
      readonly frostFree?: true
    }
  | { readonly kind: 'catalog-window' }
  | { readonly kind: 'light-window'; readonly firstAdequateMonth: number }
  | { readonly kind: 'days-to-maturity'; readonly backedOffDays: Days }

export interface PlantingWindow {
  readonly method: PlantingMethod
  readonly earliest: DayOfYear
  readonly recommended: DayOfYear
  readonly latest: DayOfYear
  readonly basis: CalendarBasis
  readonly citations: readonly CitationId[]
}

export interface HarvestWindow {
  readonly start: DayOfYear
  readonly end: DayOfYear
  readonly basis: CalendarBasis
}

// a calendar that does not fit must say so rather than emitting optimistic dates
export type CalendarFeasibility =
  | { readonly kind: 'fits'; readonly slackDays: Days }
  | { readonly kind: 'needs-indoor-start'; readonly weeksBefore: number }
  | { readonly kind: 'season-too-short'; readonly shortfallDays: Days }
  | { readonly kind: 'light-limited'; readonly month: number }
  | { readonly kind: 'no-thermal-data' }

export interface CropCalendar {
  readonly cropId: CropId
  readonly plantings: readonly PlantingWindow[]
  readonly harvest: HarvestWindow
  readonly successions: readonly DayOfYear[]
  readonly feasibility: CalendarFeasibility
  readonly frostRiskPercentile: ExceedancePercentile
  readonly notes: readonly string[]
}

export interface BedCalendar {
  readonly bedId: BedId
  readonly entries: readonly CropCalendar[]
}
