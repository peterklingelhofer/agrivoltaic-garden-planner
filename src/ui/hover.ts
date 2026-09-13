import { approxPercent, OUTCOME_LABEL } from '../simulation/coach'
import type { HoverTarget } from '../state/slices'
import type { Crop } from '../types/crop'
import type { Bed, GardenPlot } from '../types/garden'
import type { SeasonReport } from '../types/simulation'
import { approxPlural, cropName, formatMeters, plural } from './format'

export interface HoverLabel {
  readonly title: string
  readonly detail: string
}

const bedOf = (plot: GardenPlot | null, target: HoverTarget): Bed | undefined =>
  target.kind === 'array' ? undefined : plot?.beds.find((bed) => bed.id === target.bedId)

/**
 * What the pointer is over, in the words the sidebar already uses for it.
 *
 * Every figure here is read off the design or the catalog, because a
 * tooltip that derived its own numbers would be a second place for them to disagree with the
 * panel beside it. It returns null for a target that is no longer in the plot rather than
 * naming something that has been removed
 */
export const describeHover = (
  plot: GardenPlot | null,
  catalog: readonly Crop[],
  target: HoverTarget,
  /** The last season run, so a plant can say what happened to it. The report is only read */
  lastReport: SeasonReport | null = null,
): HoverLabel | null => {
  if (target.kind === 'array') {
    const array = plot?.arrays.find((entry) => entry.id === target.arrayId)
    if (array === undefined) return null
    const { rowCount, modulesPerRow, pitchM } = array.geometry
    return {
      title: array.label,
      /*
       * Counted, and in the same word the panels are called everywhere else. "1 rows of 6 modules"
       * on the shipped example would be the first thing anybody hovering the scene sees, and
       * "module" is the trade word for a panel, which no label in the PV panel uses. The tooltip is
       * the one surface a beginner meets without having opened a panel at all, so it's the last
       * place to keep either
       */
      detail: `${plural(rowCount, 'row', 'rows')} of ${plural(modulesPerRow, 'panel', 'panels')}, ${formatMeters(pitchM)} apart`,
    }
  }
  const bed = bedOf(plot, target)
  if (bed === undefined) return null
  if (target.kind === 'bed') {
    // named rather than counted: a hover flashed "3 plantings" and a walk-through never learned
    // one of their names. Four is a tooltip's worth: past that the rest are counted, not listed
    const names = bed.plantings.map((planting) => cropName(catalog, planting.cropId))
    const shown = names.slice(0, 4).join(', ')
    return {
      title: bed.label,
      detail:
        names.length === 0
          ? `${bed.areaM2.toFixed(1)} m², nothing planted yet`
          : `${bed.areaM2.toFixed(1)} m²: ${shown}${names.length > 4 ? ` and ${String(names.length - 4)} more` : ''}`,
    }
  }
  const planting = bed.plantings.find((entry) => entry.id === target.plantingId)
  if (planting === undefined) return null
  const outcome = lastReport?.outcomes.find((entry) => entry.plantingId === planting.id)
  const season =
    outcome === undefined || lastReport === null
      ? ''
      : `. Season ${String(lastReport.season)}: ${OUTCOME_LABEL[outcome.kind]}${
          outcome.kind === 'harvested' ? ` at ${approxPercent(outcome.realized)} of full yield` : ''
        }`
  return {
    title: cropName(catalog, planting.cropId),
    detail: `${approxPlural(planting.plantCount, 'plant', 'plants')} in ${bed.label}${season}`,
  }
}
