import type { Crop, DliClass } from '../types/crop'
import type { GardenPlot } from '../types/garden'
import type { BedId } from '../types/ids'
import type { BedLight } from '../types/light'
import { formatDli } from './format'

/**
 * Crop TYPES: each label names a whole class, and no cultivar or single crop stands in for it.
 *
 * `src/ui/dli.ts` is the project's position on this and it's what makes the sentence below
 * sayable at all: the ORDERING of crops by light demand comes from one consistent class table
 * and is the output worth trusting, while the mol/m²/d number attached to any one crop is mostly
 * a Tier C class-level inference. So the narration is allowed to say that one of these groups
 * wants more light than another, and isn't allowed to promise that either will do well in a
 * particular bed. Naming the group rather than the crop is the same honesty in the words: the
 * class is where the evidence actually lives
 */
export const DLI_CLASS_LABEL: Readonly<Record<DliClass, string>> = {
  'understory-herbs': 'shade-tolerant herbs',
  'leafy-greens': 'salad leaves',
  'forages-c3-pasture': 'grasses and clovers',
  'cane-bush-berries': 'bush and cane berries',
  strawberry: 'strawberries',
  brassicas: 'cabbages and their kin',
  'root-tuber': 'roots and tubers',
  solanaceae: 'tomatoes and peppers',
  cucurbits: 'squashes and cucumbers',
  alliums: 'onions and leeks',
  'grain-legumes': 'beans and peas',
  'c3-cereals': 'grains',
  'corn-c4': 'sweet corn',
}

export interface ColdOpenBed {
  readonly bedId: BedId
  readonly label: string
  /** Already formatted, in the units the legend prints, because it's quoted straight into prose */
  readonly dli: string
  readonly molM2Day: number
}

export interface ColdOpenReading {
  readonly dim: ColdOpenBed
  readonly bright: ColdOpenBed
  readonly title: string
  readonly body: string
}

/**
 * The one claim in this narration that is not a measurement, and the only shape it is allowed
 * to take. It compares two crop TYPES by light demand, which is ordinal, and it says nothing
 * about what either would yield
 */
const demandSentence = (lower: string, higher: string): string =>
  `${higher.charAt(0).toUpperCase()}${higher.slice(1)} want more light than ${lower} do.`

/**
 * Said when the catalog can't separate the two beds' plantings by light demand: the ordering
 * is still the thing worth saying, so it's said without naming groups rather than dropped
 */
const GENERIC_DEMAND =
  'Crops differ in how much light they want, and this design placed them accordingly.'

/** The lowest and highest light demand standing in a bed, read off the crops actually in it */
const demandRange = (
  crops: ReadonlyMap<string, Crop>,
  plot: GardenPlot,
  bedId: BedId,
): { readonly low: Crop; readonly high: Crop } | null => {
  const planted = (plot.beds.find((bed) => bed.id === bedId)?.plantings ?? [])
    .map((planting) => crops.get(String(planting.cropId)))
    .filter((crop): crop is Crop => crop !== undefined)
  const [first] = planted
  if (first === undefined) return null
  const target = (crop: Crop): number => crop.light.dliTargetMolM2Day.value
  return planted.reduce(
    (range, crop) => ({
      low: target(crop) < target(range.low) ? crop : range.low,
      high: target(crop) > target(range.high) ? crop : range.high,
    }),
    { low: first, high: first },
  )
}

/**
 * The ordinal clause, or null.
 *
 * Null wherever the comparison wouldn't hold: an empty bed, two groups that are the same group,
 * or a dim bed whose crops actually want MORE light than the bright bed's. That last case isn't
 * hypothetical anywhere the beds are close together, and a sentence asserting the opposite of its
 * own numbers is worse than no sentence
 */
export const lightDemandClause = (
  catalog: readonly Crop[],
  plot: GardenPlot,
  dimBedId: BedId,
  brightBedId: BedId,
): string | null => {
  const crops = new Map(catalog.map((crop) => [String(crop.id), crop]))
  const dim = demandRange(crops, plot, dimBedId)
  const bright = demandRange(crops, plot, brightBedId)
  if (dim === null || bright === null) return null
  const lower = DLI_CLASS_LABEL[dim.low.dliClass]
  const higher = DLI_CLASS_LABEL[bright.high.dliClass]
  if (lower === higher) return null
  return bright.high.light.dliTargetMolM2Day.value > dim.low.light.dliTargetMolM2Day.value
    ? demandSentence(lower, higher)
    : null
}

const bedReading = (plot: GardenPlot, light: BedLight): ColdOpenBed | null => {
  const bed = plot.beds.find((entry) => entry.id === light.bedId)
  return bed === undefined
    ? null
    : {
        bedId: bed.id,
        label: bed.label,
        dli: formatDli(light.annualMeanDliMolM2Day),
        molM2Day: light.annualMeanDliMolM2Day,
      }
}

export const COLD_OPEN_TITLE = 'Where a bed is placed in this range impacts what will grow'

/**
 * What the example garden is showing, in three sentences, or null.
 *
 * Null is the whole error surface: no light field yet, fewer than two beds with light in them,
 * or a brightest and a dimmest bed that print the same figure. Nothing here is ever a placeholder
 * or a rounded-up guess, because the surface exists to argue that this app measures shade rather
 * than assuming it, and a made-up number on it would refute that argument by itself.
 *
 * "The darkest ground" rather than a named color: `state/colormap.ts` says viridis is used
 * because its lightness ramp is monotonic, so the dimmest cells are the darkest ones whatever
 * the range the legend is scaled to, and that stays true if the ramp's hues are ever changed
 */
export const coldOpenReading = (
  plot: GardenPlot | null,
  bedLight: readonly BedLight[],
  catalog: readonly Crop[],
): ColdOpenReading | null => {
  if (plot === null || bedLight.length < 2) return null
  const readings = bedLight
    .map((light) => bedReading(plot, light))
    .filter((reading): reading is ColdOpenBed => reading !== null)
  const [first] = readings
  if (first === undefined) return null
  const { dim, bright } = readings.reduce(
    (ends, reading) => ({
      dim: reading.molM2Day < ends.dim.molM2Day ? reading : ends.dim,
      bright: reading.molM2Day > ends.bright.molM2Day ? reading : ends.bright,
    }),
    { dim: first, bright: first },
  )
  // two beds that print the same figure make the comparison a sentence about nothing, and a
  // difference too small to print is a difference this app has no business drawing attention to
  if (dim.dli === bright.dli) return null
  const clause = lightDemandClause(catalog, plot, dim.bedId, bright.bedId) ?? GENERIC_DEMAND
  return {
    dim,
    bright,
    title: COLD_OPEN_TITLE,
    // Short on purpose: it sits over the foot of the scene it describes, and every clause in it is
    // load-bearing
    body: `${dim.label}, on the darkest ground here, averages ${dim.dli} over the year. ${bright.label}, out in the open, averages ${bright.dli}. Both figures come out of the light simulation. ${clause}`,
  }
}
