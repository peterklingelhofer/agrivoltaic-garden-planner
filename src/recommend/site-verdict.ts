import type { Crop } from '../types/crop'
import type { ExceedancePercentile, Site } from '../types/site'
import { climateGate } from './stages/climate-gate'

/**
 * How a place grows, before any bed exists: every crop in the catalogue put through the climate
 * gate alone, and the water balance the site already carries.
 *
 * The app knows both from the moment a place resolves. The place step shows frost dates, and the
 * climate arrives crop by crop six steps later as a verdict badge beside each row, so this is the
 * sentence that says whether the place as a whole is one most of the catalogue could live in. It
 * comes from the same gate the ranking runs and nothing softer, so what it counts is exactly what
 * the plants step will refuse for the climate. Light is not in it: light is a fact about a bed, and
 * there is no bed yet
 */
export type ClimateRefusal = 'hardiness' | 'chill' | 'cold-winter' | 'season-gdd' | 'fao-ecocrop'

export interface SiteVerdict {
  readonly total: number
  readonly fits: number
  readonly refused: Readonly<Record<ClimateRefusal, number>>
}

const REFUSALS: readonly ClimateRefusal[] = [
  'hardiness',
  'chill',
  'cold-winter',
  'season-gdd',
  'fao-ecocrop',
]

const isRefusal = (kind: string): kind is ClimateRefusal =>
  (REFUSALS as readonly string[]).includes(kind)

export const siteVerdict = (
  site: Site,
  catalog: readonly Crop[],
  percentile: ExceedancePercentile,
): SiteVerdict => {
  const refused: Record<ClimateRefusal, number> = {
    hardiness: 0,
    chill: 0,
    'cold-winter': 0,
    'season-gdd': 0,
    'fao-ecocrop': 0,
  }
  let fits = 0
  for (const crop of catalog) {
    const outcome = climateGate(crop, site, percentile)
    if (outcome.passed) {
      fits += 1
      continue
    }
    const kind = outcome.limiting?.cause.kind
    if (kind !== undefined && isRefusal(kind)) refused[kind] += 1
  }
  return { total: catalog.length, fits, refused }
}

/** What the refused crops would need, in the words a gardener reads the gate's reasons in */
const NEED: Readonly<Record<ClimateRefusal, string>> = {
  hardiness: 'milder winters',
  chill: 'colder winters',
  'cold-winter': 'colder winters',
  'season-gdd': 'a longer season',
  'fao-ecocrop': 'a different temperature or rainfall',
}

const joinWords = (words: readonly string[]): string =>
  words.length <= 1
    ? (words[0] ?? '')
    : `${words.slice(0, -1).join(', ')} and ${words[words.length - 1] ?? ''}`

/**
 * The share of the catalogue that passes, graded in three literal words, then the count and
 * what the rest would need. The grades are this app's own bands: most above seven in ten, about
 * half between four and seven, few below four
 */
export const climateSentence = (verdict: SiteVerdict): string => {
  const share = verdict.total === 0 ? 0 : verdict.fits / verdict.total
  const lead =
    share >= 0.7
      ? 'Most of the catalogue grows in this climate'
      : share >= 0.4
        ? 'About half of the catalogue grows in this climate'
        : "Few of the catalogue's crops grow in this climate"
  const counts = new Map<string, number>()
  for (const kind of REFUSALS) {
    const count = verdict.refused[kind]
    if (count > 0) counts.set(NEED[kind], (counts.get(NEED[kind]) ?? 0) + count)
  }
  const needs = [...counts.entries()]
    .sort((left, right) => right[1] - left[1])
    .slice(0, 3)
    .map(([need, count]) => `${need} (${String(count)})`)
  const rest = needs.length === 0 ? '' : ` The rest need ${joinWords(needs)}.`
  return `${lead}: ${String(verdict.fits)} of ${String(verdict.total)} crops pass the climate check.${rest}`
}

/**
 * Rain against use, from the FAO-56 balance the site already ran. Reference evapotranspiration
 * is said as what a garden would use, which is what the figure is
 */
export const waterSentence = (site: Site): string => {
  const { rainfallMm, referenceEtMm, limited } = site.waterLimitation
  const rain = rainfallMm.toFixed(0)
  const use = referenceEtMm.toFixed(0)
  const share = Math.round((rainfallMm / Math.max(referenceEtMm, 1)) * 100)
  if (!limited) {
    return `Rain here covers what a garden would use over a year: ${rain} mm falls against ${use} mm of use, so watering is a backup.`
  }
  if (share >= 100) {
    return `Rain here matches what a garden would use over a year, ${rain} mm against ${use} mm of use, but it falls in a few months, so plan to water in the dry ones.`
  }
  return `Rain here is about ${String(share)}% of what a garden would use over a year: ${rain} mm falls against ${use} mm of use, so plan to water.`
}
