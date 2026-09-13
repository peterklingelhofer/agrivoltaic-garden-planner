import type { ReactElement } from 'react'
import { seasonAnchors } from '../recommend/calendar'
import { useAppStore } from '../state/store'
import { dayLabel, noFrostSentence } from './calendar'
import { SOURCE_NAME } from './format'

/**
 * What the place the visitor chose is actually like to garden in.
 *
 * The app has always known this and has never said it. `seasonAnchors` reads the frost curve the
 * site lookup already fetched, and every sowing date in the product is derived from it, but a
 * grower met those dates only crop by crop, as a "basis" line under a row, and met the frost
 * risk itself only as a percentage dropdown three steps into the editor. A gardener's second
 * question about a place, after where it is, is how long they get to grow in it. So it is
 * answered on the step that chose the place, and again on the site panel, where a Master
 * Gardener went looking for plain frost dates and found a percentile.
 *
 * Read through `seasonAnchors` rather than off `site.frost` directly, because that function
 * already knows the two things this must not get wrong: which curve to take, and that a season
 * can wrap past new year in the southern hemisphere. The last sentence names the source at the
 * point of use, which a researcher asked for: the dates come from thirty years of daily records,
 * and it names which service supplied them, since either of two may
 */
export const SeasonSummary = (): ReactElement | null => {
  const site = useAppStore((s) => (s.site.status === 'ready' ? s.site.value : null))
  const percentile = useAppStore((s) => s.frostPercentile)
  /**
   * Nothing at all when the lookup came back with no frost curve, which is a state the weather
   * fallback chain really reaches. `seasonAnchors` answers that case with day 1 to day 365,
   * which is the right defensive answer for an engine deriving offsets and a plain falsehood to
   * print at somebody: it would read "frost ends around 1 Jan and returns around 31 Dec, about
   * 365 growing days" over a town that simply has no normals on record
   */
  if (site === null || (site.frost?.length ?? 0) === 0) return null
  const anchors = seasonAnchors(site, percentile)
  if (anchors.frostFree) {
    return (
      <p className="notice notice-ready" data-testid="readout-onboarding-season">
        {noFrostSentence(anchors.frostYears, percentile)}. The records come from{' '}
        {SOURCE_NAME[site.normals.source]}.
      </p>
    )
  }
  return (
    <p className="notice notice-ready" data-testid="readout-onboarding-season">
      Frost here usually ends around {dayLabel(anchors.lastSpringFreeze)} and returns around{' '}
      {dayLabel(anchors.firstFallFreeze)}, which is about {anchors.frostFreeDays} growing days.
      About one year in {Math.max(2, Math.round(100 / percentile))} sees frost outside those dates.
      You can change how cautious the dates are in the planting calendar. The dates come from thirty
      years of daily temperature records for this place, 1991 to 2020, from{' '}
      {SOURCE_NAME[site.normals.source]}.
    </p>
  )
}
