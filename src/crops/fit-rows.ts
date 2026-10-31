import { type CropLightRow, type CropMaturity, maturityText } from '../data/crop-light-table'
import { cropLabel } from '../data/crops'
import { dayLabel } from '../data/util'
import type { CropPlan } from '../recommend/auto'
import { feasibilityWords } from '../recommend/planting'
import { VERDICT_ORDER } from '../recommend/stages/rank'
import type { SiteFit } from '../state/site-fit'
import type { Crop } from '../types/crop'
import type { RecommendationVerdict } from '../types/recommend'
import { agendaFeasibility } from '../ui/agenda'
import { type FeasibilitySummary, methodLabel } from '../ui/calendar'
import { explainLimitingFactor, verdictLabel } from '../ui/format'
import { capitalizeSentence } from '../ui/site-notice'

export type Verdict = RecommendationVerdict['verdict']
export type VerdictFilter = 'all' | Verdict

/**
 * The planner's word for a verdict, so both pages call a crop the same thing. The label reads
 * only the verdict, and a full outcome isn't to hand where a word is wanted
 */
const verdictWord = (verdict: Verdict): string => verdictLabel({ verdict } as RecommendationVerdict)

const VERDICTS: readonly Verdict[] = ['recommended', 'marginal', 'excluded']

/** The verdicts as the count line names them, which is also what the "Show" select offers */
export const VERDICT_FILTER_OPTIONS: readonly (readonly [VerdictFilter, string])[] = [
  ['all', 'All crops'],
  ...VERDICTS.map((verdict): readonly [VerdictFilter, string] => [verdict, verdictWord(verdict)]),
]

/**
 * The verdict a row shows. The ranking judges the light, the climate and the soil, and the
 * calendar judges the season on its own, so a crop the ranking recommends can still be one that
 * can't finish here. That crop is limited whatever the ranking says, and its Why names the season
 */
const displayVerdict = (plan: CropPlan): Verdict => {
  const { kind } = plan.calendar.feasibility
  return plan.recommendation.outcome.verdict === 'recommended' &&
    (kind === 'season-too-short' || kind === 'light-limited')
    ? 'marginal'
    : plan.recommendation.outcome.verdict
}

/** A perennial has no days to maturity, so the calendar's "no thermal data" is the wrong badge for it */
const seasonOf = (crop: Crop, plan: CropPlan): FeasibilitySummary => {
  const summary = agendaFeasibility(plan.calendar.feasibility)
  return (crop.lifeCycle === 'perennial' || crop.lifeCycle === 'woody-perennial') &&
    summary.kind === 'no-thermal-data'
    ? {
        ...summary,
        badge: 'Perennial',
        detail:
          "A perennial has no season to finish. It's judged on its winters, its chill and its hottest month",
      }
    : summary
}

export type SortKey = 'crop' | 'verdict' | 'light' | 'shade' | 'maturity'

export interface Sort {
  readonly key: SortKey
  readonly direction: 'ascending' | 'descending'
}

/** One crop's line in the table, worded once, with the figures its sorts compare */
export interface FitRow {
  readonly cropId: string
  /** Where the plan put it, which is the default order and settles every tie */
  readonly rank: number
  readonly name: string
  readonly botanicalName: string
  /** The common names, the botanical name and the family, lowercased, for the name filter */
  readonly searchText: string
  readonly verdict: Verdict
  readonly verdictText: string
  readonly why: string
  readonly lightMean: number
  readonly lightText: string
  readonly ceiling: number
  readonly shadeText: string
  readonly seasonText: string
  readonly seasonDetail: string
  readonly plantText: string
  /** Days for an annual, a perennial's years in days, and a perennial with no years last */
  readonly maturityDays: number
  readonly maturityText: string
}

const percent = (share: number): string => `${String(Math.round(share * 100))}%`

/** A no-break space, so a narrow column breaks a figure between its parts and never inside one */
const NB = ' '

/** A daily light figure, whole above 10 and to a tenth below, where a rounded unit is a big share */
const dli = (value: number): string => (value < 9.95 ? value.toFixed(1) : String(Math.round(value)))

/**
 * What holds the crop back, in the planner's words. The ranking and the calendar read the season
 * separately, so a crop the ranking holds nothing against can still have a calendar that can't
 * finish here. That row says why, where "Fits" would contradict its own Season column
 */
const whyOf = (plan: CropPlan, catalog: readonly Crop[]): string => {
  if (plan.limiting !== null) {
    return capitalizeSentence(explainLimitingFactor(plan.limiting, 'novice', catalog))
  }
  const feasibility = plan.calendar.feasibility
  return feasibility.kind === 'season-too-short' || feasibility.kind === 'light-limited'
    ? capitalizeSentence(feasibilityWords(feasibility))
    : 'Fits'
}

const maturityDaysOf = (maturity: CropMaturity | undefined): number =>
  maturity === undefined || maturity.kind === 'perennial'
    ? Number.POSITIVE_INFINITY
    : maturity.kind === 'days'
      ? maturity.days
      : maturity.years * 365

/** Every ranked crop as a table row, in the plan's order */
export const fitRows = (
  fit: SiteFit,
  catalog: readonly Crop[],
  lightRows: ReadonlyMap<string, CropLightRow>,
): readonly FitRow[] => {
  const crops = new Map(catalog.map((crop) => [crop.id as string, crop]))
  const rows: FitRow[] = []
  for (const [rank, plan] of fit.ranked.entries()) {
    const { recommendation, calendar } = plan
    const cropId = recommendation.cropId as string
    const crop = crops.get(cropId)
    if (crop === undefined) continue
    const lightRow = lightRows.get(cropId)
    const mean = recommendation.light.meanDliMolM2Day
    const ceiling = crop.light.maxDesignRsr.value
    const feasibility = seasonOf(crop, plan)
    const verdict = displayVerdict(plan)
    const planting = calendar.plantings[0]
    rows.push({
      cropId,
      rank,
      name: cropLabel(crop),
      botanicalName: crop.taxonomy.acceptedName,
      searchText: [...crop.taxonomy.commonNames, crop.taxonomy.acceptedName, crop.taxonomy.family]
        .join('\n')
        .toLowerCase(),
      verdict,
      verdictText: verdictWord(verdict),
      why: whyOf(plan, catalog),
      lightMean: mean,
      lightText:
        lightRow === undefined
          ? dli(mean)
          : `${dli(mean)} · floor${NB}${String(lightRow.floor)} · band${NB}${String(lightRow.targetLow)}${NB}to${NB}${String(lightRow.targetHigh)}`,
      ceiling,
      shadeText: `${percent(recommendation.light.bakedRsr)}${NB}of ${percent(ceiling)}${NB}allowed`,
      seasonText: feasibility.badge,
      seasonDetail: feasibility.detail,
      plantText:
        planting === undefined
          ? 'No window'
          : `${methodLabel(planting.method)}, ${dayLabel(planting.earliest)} to ${dayLabel(planting.latest)}`,
      maturityDays: maturityDaysOf(lightRow?.maturity),
      maturityText: lightRow === undefined ? '' : maturityText(lightRow.maturity),
    })
  }
  return rows
}

/** The rows a name and a verdict leave showing. The name matches anywhere, in any case */
export const shownRows = (
  rows: readonly FitRow[],
  query: string,
  verdict: VerdictFilter,
): readonly FitRow[] => {
  const needle = query.trim().toLowerCase()
  return rows.filter(
    (row) =>
      (verdict === 'all' || row.verdict === verdict) &&
      (needle === '' || row.searchText.includes(needle)),
  )
}

const byNumber = (a: number, b: number): number => (a < b ? -1 : a > b ? 1 : 0)

const COMPARE: Readonly<Record<SortKey, (a: FitRow, b: FitRow) => number>> = {
  crop: (a, b) => a.name.localeCompare(b.name, 'en'),
  verdict: (a, b) => VERDICT_ORDER[a.verdict] - VERDICT_ORDER[b.verdict],
  light: (a, b) => byNumber(a.lightMean, b.lightMean),
  // the shade typed is the same on every row, so the room under each crop's ceiling is its ceiling
  shade: (a, b) => byNumber(a.ceiling, b.ceiling),
  maturity: (a, b) => byNumber(a.maturityDays, b.maturityDays),
}

/** The rows in a column's order, or the plan's with no column chosen. Ties keep the plan's order */
export const sortedRows = (rows: readonly FitRow[], sort: Sort | null): readonly FitRow[] => {
  if (sort === null) return rows
  const sign = sort.direction === 'ascending' ? 1 : -1
  const compare = COMPARE[sort.key]
  return [...rows].sort((a, b) => sign * compare(a, b) || a.rank - b.rank)
}

/** The count line: "132 recommended, 40 limited, 92 not suited", counted on the verdicts the rows show */
export const countLine = (rows: readonly FitRow[]): string => {
  const counts: Record<Verdict, number> = { recommended: 0, marginal: 0, excluded: 0 }
  for (const row of rows) counts[row.verdict] += 1
  return VERDICTS.map(
    (verdict) => `${String(counts[verdict])} ${verdictWord(verdict).toLowerCase()}`,
  ).join(', ')
}
