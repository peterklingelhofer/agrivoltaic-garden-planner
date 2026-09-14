import { polygonOf, polygonsOverlap, rectangleRing } from '../state/geom'
import type { Bed, GardenPlot, House, Obstruction } from '../types/garden'
import type { Polygon2D } from '../types/geo'
import type { PvArray, RowGeometry } from '../types/pv'

/**
 * The houses among a set of obstructions. A tree is a second obstruction kind (Decision Record
 * 26) and this rule never polices it: a bed under a crown is a normal garden
 */
export const housesOf = (obstructions: readonly Obstruction[]): readonly House[] =>
  obstructions.filter((entry): entry is House => entry.kind === 'house')

/** The houses standing on a plot */
export const houseFootprints = (plot: GardenPlot): readonly House[] => housesOf(plot.obstructions)

/** The house `footprint` overlaps, or null when it stands clear of every one of them */
export const overlapsAHouse = (footprint: Polygon2D, houses: readonly House[]): House | null =>
  houses.find((house) => polygonsOverlap(footprint, house.footprint)) ?? null

/**
 * The ground rectangle an array's rows stand on: across from the center of the first row to the
 * last with the collector's own width added either side, and the row's own length along it. The
 * same shape `panelCeilings` builds for what a plant may stand under (`scene/sceneMath.ts`)
 */
export const rowsFootprint = (geometry: RowGeometry): Polygon2D =>
  polygonOf(
    rectangleRing(
      geometry.originM,
      (geometry.rowCount - 1) * geometry.pitchM + geometry.collectorWidthM,
      geometry.rowLengthM,
      -geometry.rowAzimuthDeg,
    ),
  )

const bedNotice = (bed: Bed, house: House): string =>
  `${bed.label} stands inside ${house.label}. The light check reads no light under its roof.`

const arrayNotice = (array: PvArray, house: House): string =>
  `${array.label}'s rows run through ${house.label}. The panels are drawn through its walls, and the light check includes the house's shade.`

/**
 * One sentence per bed or array a grower has drawn through a house. A drag is never blocked for
 * this, so the plot can carry the overlap. The check step only says it is there
 */
export const overlapNotices = (plot: GardenPlot): readonly string[] => {
  const houses = houseFootprints(plot)
  if (houses.length === 0) return []
  const bedHits = plot.beds.flatMap((bed) => {
    const house = overlapsAHouse(bed.footprint, houses)
    return house === null ? [] : [bedNotice(bed, house)]
  })
  const arrayHits = plot.arrays
    .filter((array) => array.geometry.rowCount > 0)
    .flatMap((array) => {
      const house = overlapsAHouse(rowsFootprint(array.geometry), houses)
      return house === null ? [] : [arrayNotice(array, house)]
    })
  return [...bedHits, ...arrayHits]
}
