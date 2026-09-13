import { buildAgenda } from '../recommend/agenda'
import { seasonAnchors } from '../recommend/calendar'
import { calendarFor } from '../recommend/planting'
import { standingOf } from '../simulation/score'
import { extentOf, polygonAreaM2 } from '../state/geom'
import type { BedCalendar } from '../types/calendar'
import type { Crop } from '../types/crop'
import type { Bed, GardenPlot } from '../types/garden'
import type { IrrigationMethod } from '../types/garden'
import type { PvArray } from '../types/pv'
import type { SeasonReport } from '../types/simulation'
import type { ExceedancePercentile, Site } from '../types/site'
import { actionLabel, groupLabel, recurrenceLabel } from './agenda'
import { dayLabel, methodLabel, noFrostSentence } from './calendar'
import { approxPlural, bedName, cropName, plural, SOURCE_NAME } from './format'

/**
 * The design as one sheet of paper.
 *
 * "I would want export to PDF, and it'll be like the full guide: what seeds to buy, when to
 * sow, when to harvest, what to watch out for, the dimensions of every bed and the panel angle.
 * It should all be a design spec PDF export." (the author, 2026-09-11). The browser's own print
 * dialog saves a PDF on every platform, so what this builds is the sheet it prints: every line
 * is read off the same store the panels read, in the words the panels use, so the paper and
 * the screen can never disagree. Pure, and tested as text
 */

export interface PrintBedPlanting {
  readonly crop: string
  readonly line: string
}

export interface PrintBed {
  readonly label: string
  readonly size: string
  readonly plantings: readonly PrintBedPlanting[]
}

export interface PrintJobs {
  readonly heading: string
  readonly lines: readonly string[]
}

export interface PrintSheet {
  readonly title: string
  readonly season: string | null
  readonly plot: string
  readonly panels: readonly string[]
  readonly beds: readonly PrintBed[]
  readonly jobs: readonly PrintJobs[]
  readonly standing: string | null
}

export interface PrintInputs {
  readonly locationLabel: string
  readonly site: Site | null
  readonly frostPercentile: ExceedancePercentile
  readonly plot: GardenPlot | null
  readonly catalog: readonly Crop[]
  readonly calendars: readonly BedCalendar[]
  readonly reports: readonly SeasonReport[]
  readonly today: number
}

const IRRIGATION_WORDS: Readonly<Record<IrrigationMethod, string>> = {
  none: 'no watering laid on',
  hand: 'watered by hand',
  sprinkler: 'sprinkler',
  drip: 'drip irrigation',
  'subsurface-drip': 'subsurface drip',
  flood: 'flood irrigation',
}

/** Eight points of the compass, the way a gardener says which way a panel faces */
export const compassLabel = (azimuthDeg: number): string => {
  const points = [
    'north',
    'north-east',
    'east',
    'south-east',
    'south',
    'south-west',
    'west',
    'north-west',
  ]
  const index = Math.round((((azimuthDeg % 360) + 360) % 360) / 45) % 8
  return points[index] ?? 'south'
}

const rowsRun = (rowAzimuthDeg: number): string =>
  Math.abs(Math.sin((rowAzimuthDeg * Math.PI) / 180)) >
  Math.abs(Math.cos((rowAzimuthDeg * Math.PI) / 180))
    ? 'east to west'
    : 'north to south'

export const panelLine = (array: PvArray): string => {
  const { geometry, tracker } = array
  const mounting =
    tracker.mode === 'fixed'
      ? `fixed at ${String(Math.round(tracker.tiltDeg))} degrees facing ${compassLabel(tracker.surfaceAzimuthDeg)}`
      : 'on a tracker that follows the sun'
  return `${plural(geometry.rowCount, 'row', 'rows')} of ${plural(geometry.modulesPerRow, 'panel', 'panels')} running ${rowsRun(geometry.rowAzimuthDeg)}, ${geometry.pitchM.toFixed(1)} m apart, ${geometry.clearanceHeightM.toFixed(1)} m of headroom, ${mounting}`
}

const bedSize = (bed: Bed): string => {
  const extent = extentOf([bed.footprint.exterior])
  const widthM = extent.maxXM - extent.minXM
  const depthM = extent.maxYM - extent.minYM
  return `${widthM.toFixed(1)} x ${depthM.toFixed(1)} m (${bed.areaM2.toFixed(1)} m²), ${(bed.raisedHeightM * 100).toFixed(0)} cm high, pH ${bed.soil.phUnits.toFixed(1)}, ${IRRIGATION_WORDS[bed.irrigation.method]}`
}

const plantingLine = (
  bed: Bed,
  planting: Bed['plantings'][number],
  catalog: readonly Crop[],
  calendars: readonly BedCalendar[],
): PrintBedPlanting => {
  const calendar = calendarFor(calendars, bed.id, planting.cropId)
  const method = calendar?.plantings[0]?.method
  const verb = method === undefined ? 'Sow' : methodLabel(method)
  return {
    crop: cropName(catalog, planting.cropId),
    line: `${verb} ${dayLabel(planting.sowDay)}, harvest ${dayLabel(planting.harvestStartDay)} to ${dayLabel(planting.harvestEndDay)}, ${approxPlural(planting.plantCount, 'plant', 'plants')}`,
  }
}

const seasonLine = (site: Site | null, percentile: ExceedancePercentile): string | null => {
  if (site === null || (site.frost?.length ?? 0) === 0) return null
  const anchors = seasonAnchors(site, percentile)
  if (anchors.frostFree) {
    return `${noFrostSentence(anchors.frostYears, percentile)}. The records come from ${SOURCE_NAME[site.normals.source]}`
  }
  return `Frost usually ends around ${dayLabel(anchors.lastSpringFreeze)} and returns around ${dayLabel(anchors.firstFallFreeze)}: about ${String(anchors.frostFreeDays)} growing days, with one year in ${String(Math.max(2, Math.round(100 / percentile)))} seeing frost outside those dates`
}

export const buildPrintSheet = (input: PrintInputs): PrintSheet => {
  const plot = input.plot
  const beds = plot?.beds ?? []
  const extent = plot === null ? null : extentOf([plot.boundary.exterior])
  const plotLine =
    plot === null || extent === null
      ? 'No plot drawn yet'
      : `${(extent.maxXM - extent.minXM).toFixed(1)} x ${(extent.maxYM - extent.minYM).toFixed(1)} m (${polygonAreaM2(plot.boundary).toFixed(0)} m²), ${plural(beds.length, 'bed', 'beds')}`
  const agenda = buildAgenda({
    beds,
    calendars: input.calendars,
    catalog: input.catalog,
    frostRiskPercentile: input.frostPercentile,
    today: input.today as never,
  })
  const jobs = agenda.groups.map((group) => ({
    heading: groupLabel(group),
    lines: group.items.map((item) => {
      const through = item.through === null ? '' : ` (through ${dayLabel(item.through)})`
      const repeats = recurrenceLabel(item)
      return `${dayLabel(item.day)}: ${actionLabel(item.action)} ${cropName(input.catalog, item.cropId)} in ${bedName(beds, item.bedId)}${through}, ${approxPlural(item.plantCount, 'plant', 'plants')}${repeats === null ? '' : `. ${repeats}`}`
    }),
  }))
  return {
    title: `Garden plan for ${input.locationLabel}`,
    season: seasonLine(input.site, input.frostPercentile),
    plot: plotLine,
    panels: (plot?.arrays ?? []).map(panelLine),
    beds: beds.map((bed) => ({
      label: bed.label,
      size: bedSize(bed),
      plantings: bed.plantings.map((planting) =>
        plantingLine(bed, planting, input.catalog, input.calendars),
      ),
    })),
    jobs,
    standing: input.reports.length === 0 ? null : standingOf(input.reports).verdict,
  }
}
