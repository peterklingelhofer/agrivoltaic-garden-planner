import { DEFAULT_FROST_PERCENTILE, siteForYear } from '../data/site'
import { seasonAnchors } from '../recommend/calendar'
import type { YearChoice, YearSummary } from '../types/simulation'
import type { Site } from '../types/site'
import type { MeasuredYear, TmySeries } from '../types/weather'

/**
 * A year a season can be run on: the site as it was that year, the weather that made it so,
 * and the summary a panel shows. The typical year is one of these too, so a season never has to
 * know which kind it was handed
 */
export interface SeasonYear {
  readonly site: Site
  readonly weather: TmySeries
  readonly summary: YearSummary
}

export const YEAR_CHOICES: readonly YearChoice[] = [
  'typical',
  'driest',
  'wettest',
  'hottest',
  'coolest',
  'random',
]

const summarise = (
  site: Site,
  weather: TmySeries,
  year: number | null,
  label: string,
): YearSummary => {
  const anchors = seasonAnchors(site, DEFAULT_FROST_PERCENTILE)
  return {
    year,
    label,
    rainfallMm: site.waterLimitation.rainfallMm,
    rainMeasured: weather.precipMm !== undefined,
    referenceEtMm: site.waterLimitation.referenceEtMm,
    waterIndex: site.waterLimitation.index,
    waterLimited: site.waterLimitation.limited,
    gddBase10C: site.seasonGdd.base10C,
    frostFreeDays: anchors.frostFreeDays,
    lastSpringFreeze: anchors.lastSpringFreeze,
    firstFallFreeze: anchors.firstFallFreeze,
    heatDaysAbove30C: site.heatDaysAbove30C,
  }
}

export const typicalYear = (site: Site, weather: TmySeries): SeasonYear => ({
  site,
  weather,
  summary: summarise(site, weather, null, 'a typical year'),
})

/** The site as it was that year, which is `siteForYear`'s whole job */
export const measuredSeasonYear = (site: Site, measured: MeasuredYear): SeasonYear => {
  const yearSite = siteForYear(site, measured)
  return {
    site: yearSite,
    weather: measured.weather,
    summary: summarise(yearSite, measured.weather, measured.year, String(measured.year)),
  }
}

const extreme = (
  years: readonly SeasonYear[],
  key: (summary: YearSummary) => number,
  highest: boolean,
): SeasonYear | undefined =>
  years.reduce<SeasonYear | undefined>((best, entry) => {
    if (best === undefined) return entry
    const better = highest
      ? key(entry.summary) > key(best.summary)
      : key(entry.summary) < key(best.summary)
    return better ? entry : best
  }, undefined)

/**
 * Which year a choice names. The extremes are read off the summaries, so "driest" is the year
 * the beds were thirstiest by the site's own water index rather than the year with the least
 * rain, which is the same year at most sites and the more honest one at all of them. `draw` is
 * a seeded number in [0, 1) so a random year replays
 */
export const chooseYear = (
  choice: YearChoice,
  typical: SeasonYear,
  years: readonly SeasonYear[],
  draw: number,
): SeasonYear => {
  if (choice === 'typical' || years.length === 0) return typical
  switch (choice) {
    case 'driest':
      return extreme(years, (summary) => summary.waterIndex, true) ?? typical
    case 'wettest':
      return extreme(years, (summary) => summary.waterIndex, false) ?? typical
    case 'hottest':
      return extreme(years, (summary) => summary.gddBase10C, true) ?? typical
    case 'coolest':
      return extreme(years, (summary) => summary.gddBase10C, false) ?? typical
    default:
      return years[Math.min(years.length - 1, Math.floor(draw * years.length))] ?? typical
  }
}

export const YEAR_CHOICE_LABEL: Readonly<Record<YearChoice, string>> = {
  typical: 'Typical year',
  driest: 'Driest year for the plants',
  wettest: 'Wettest year for the plants',
  hottest: 'Hottest year on record',
  coolest: 'Coolest year on record',
  random: 'Random year from the record',
}
