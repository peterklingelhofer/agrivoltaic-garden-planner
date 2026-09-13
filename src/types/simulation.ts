import type { Banded } from './band'
import type { DerivedCited } from './cited'
import type { PriceInUse, TypedCost, TypedPayback } from './economy'
import type { BedId, CropId, PlantingId, RuleId } from './ids'
import type { DayOfYear, Fraction } from './units'

/**
 * The garden run forward one season at a time (Decision Record 14).
 *
 * Everything here is plain data: it is what the season simulation returns, what the store keeps
 * and what the browser persists, so nothing in it is a typed array, a function or a class
 */

/** Which year a season is run on. Every choice but the first names a measured year */
export type YearChoice = 'typical' | 'driest' | 'wettest' | 'hottest' | 'coolest' | 'random'

export interface YearSummary {
  /** null for the typical year, which is no single year */
  readonly year: number | null
  readonly label: string
  readonly rainfallMm: number
  /** Whether the rain is the year's own or the thirty-year normal standing in for it */
  readonly rainMeasured: boolean
  readonly referenceEtMm: number
  readonly waterIndex: Fraction
  readonly waterLimited: boolean
  readonly gddBase10C: number
  readonly frostFreeDays: number
  readonly lastSpringFreeze: DayOfYear
  readonly firstFallFreeze: DayOfYear
  readonly heatDaysAbove30C: number
}

/** What grew in a bed in a season, which is what the rotation rule reads back */
export interface SeasonRecord {
  readonly season: number
  readonly year: number | null
  readonly bedId: BedId
  readonly cropId: CropId
  readonly harvested: boolean
}

export type OutcomeKind =
  /** the ground refused it: a rotation rule, named */
  | 'refused'
  /** the climate gate the designer runs refused it: hardiness, chill or heat units */
  | 'climate'
  /** the bed's pH is outside what the crop tolerates */
  | 'soil'
  /** killed by a frost of this year, at sowing or before the harvest */
  | 'frosted'
  /** the season this year was too short to mature it */
  | 'unripe'
  /** under the panels, below the crop's own light minimum in some month it grows */
  | 'too-dark'
  /** no light has been computed for this bed yet */
  | 'unlit'
  | 'harvested'

export interface PlantingOutcome {
  readonly bedId: BedId
  readonly plantingId: PlantingId
  readonly cropId: CropId
  readonly kind: OutcomeKind
  /** The literature's band for this bed and shade, or null where nothing could grow */
  readonly band: Banded<Fraction> | null
  /** What this season actually brought in, as a share of a full crop */
  readonly realised: Fraction
  readonly pestPressure: Fraction
  readonly droughtPenalty: Fraction
  /** Measured rules that applied, so the panel can name what helped and what competed */
  readonly companions: readonly RuleId[]
  /** Unmeasured rules that applied, which is a trial of them */
  readonly tried: readonly RuleId[]
  readonly explanation: string
  /**
   * The first fall frost of the year, on a harvested planting whose harvest window ran past it:
   * the frost cut the picking short rather than taking the crop. Absent on every other outcome
   * and on reports saved before the field existed
   */
  readonly frostCutDay?: DayOfYear
}

export interface Advice {
  readonly id: string
  readonly text: string
  readonly bedId: BedId | null
}

/**
 * What the panels cost, what a year of them was worth, and what the planting asks of you.
 *
 * Bounded on purpose (Decision Record 14): it sits below the standing, it is never in the verdict
 * and never in a score, because a garden that is worth building is not the same question as a
 * garden that pays back. Every field is null where the thing it needs is missing rather than
 * carrying a zero, since "no array" and "an array worth nothing" are different answers.
 *
 * Labour is a count of jobs and never a wage: nothing in this corpus prices an hour of a
 * gardener's time, so the rules' own `requiresManagement` sentences are listed and left unpriced
 */
export interface SeasonEconomy {
  /** Building an array like this one, as a range across the three crop-mount structures; null with no arrays */
  readonly buildCostUsd: DerivedCited<Banded<number>> | null
  /** What the grower typed the panels cost, which stands in for the benchmark; null when nothing was typed */
  readonly installedCost: TypedCost | null
  /** This year's generation at `price`, in that price's currency; null with no arrays and null with no price */
  readonly electricityValue: number | null
  /** The price that value was computed at: the EIA state average, the grower's tariff, or null with neither */
  readonly price: PriceInUse | null
  /**
   * The cost over one year of electricity, simple and undiscounted: the benchmark's band, or the
   * typed cost's point. Null where either side is missing, and null where the two are in different
   * currencies, since the benchmark is in US dollars and a tariff need not be
   */
  readonly paybackYears: DerivedCited<Banded<number>> | TypedPayback | null
  /** Distinct `requiresManagement` sentences of the rules that applied, in the rules' own words */
  readonly managementTasks: readonly string[]
}

export interface SeasonReport {
  readonly season: number
  readonly year: YearSummary
  readonly outcomes: readonly PlantingOutcome[]
  /**
   * Mean realised share across EVERY planting planned, null where nothing was planned.
   *
   * A bed the ground, the climate or the soil refused counts as zero, the same as one the frost
   * took, because the standing this feeds is a land equivalent ratio: per bed of ground, not per
   * successful sowing
   */
  readonly harvestIndex: Fraction | null
  /** Annual AC from the arrays on this year's weather, null with no arrays */
  readonly energyKwh: number | null
  /**
   * The electricity term of the land equivalent ratio: this garden's AC per square metre of land
   * over the sole-use reference plant's, both from the shipped chain on this year's weather. Null
   * with no arrays, and a midpoint rather than the band, because a standing is read across seasons
   */
  readonly energyShare: Fraction | null
  readonly advice: Advice
  /**
   * What it cost, what it earned and what it asks of you.
   *
   * Optional because a garden saved before this existed has none, and `state/persist.ts` checks a
   * report's spine rather than every field: an older report reads back and simply shows no
   * economy block, which is the same thing the panel does for a garden with no arrays
   */
  readonly economy?: SeasonEconomy
}

/** A folklore or experimental rule the garden has been running, season by season */
export interface Trial {
  readonly ruleId: RuleId
  /** Seasons in which at least one bed ran it: replication across beds is not more seasons */
  readonly seasons: number
  readonly bedSeasons: number
  readonly totalRealised: number
}

export interface SimulationState {
  readonly seed: number
  /** Seasons run so far; the next season to run is this plus one */
  readonly season: number
  readonly yearChoice: YearChoice
  readonly history: readonly SeasonRecord[]
  /** The most recent reports, newest last */
  readonly reports: readonly SeasonReport[]
  readonly trials: readonly Trial[]
  readonly revealed: readonly RuleId[]
}
