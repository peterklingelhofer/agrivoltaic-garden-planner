import type { GardenPlot } from '../types/garden'
import type { CropId, PlantingId } from '../types/ids'
import type { OutcomeKind, SeasonRecord, YearSummary } from '../types/simulation'
import type { Fraction } from '../types/units'
import type { SeasonYear } from '../simulation/year'

/**
 * One planting's outcome in the year with no panels, beside the real one.
 *
 * The whole-garden figure answers a grower's question; a researcher's is per crop, because the
 * panels help some crops and cost others and a garden average hides which. `plantingId` is what
 * the two runs share, since the plantings themselves are the same objects on both plots
 */
export interface NoPanelsOutcome {
  readonly plantingId: PlantingId
  readonly cropId: CropId
  readonly kind: OutcomeKind
  readonly realised: Fraction
}

/**
 * "Compare with no panels": the last season that ran, baked and run again with every array
 * pulled off the plot. Kept beside `simulation`, because it is never
 * persisted, it never touches the real report, and it carries its own season number so a later
 * season leaves it provably out of date
 */
export interface NoPanelsComparison {
  readonly season: number
  readonly harvestIndex: Fraction | null
  readonly outcomes: readonly NoPanelsOutcome[]
}

/** The plot as it would stand with every panel row pulled: same beds, same plantings, no arrays */
export const withoutPanels = (plot: GardenPlot): GardenPlot => ({ ...plot, arrays: [] })

/**
 * The ground's memory as it stood BEFORE the given season, which is what that season was itself
 * run against: a season's own harvests join history only after it finishes, through `withSeason`
 */
export const historyBeforeSeason = (
  history: readonly SeasonRecord[],
  season: number,
): readonly SeasonRecord[] => history.filter((record) => record.season !== season)

/**
 * The exact year a report ran on, so the comparison bakes against the same weather the report
 * itself used and never drifts with the year picker. Null only when the report names a measured year that
 * is no longer in the record it is checked against, which a site re-resolved since would cause
 */
export const seasonYearOf = (
  summary: YearSummary,
  seasonYears: readonly SeasonYear[],
  typical: SeasonYear,
): SeasonYear | null =>
  summary.year === null
    ? typical
    : (seasonYears.find((entry) => entry.summary.year === summary.year) ?? null)
