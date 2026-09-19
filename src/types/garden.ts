import type { Polygon2D, Vec2M } from './geo'
import type { BedId, CropId, CultivarId, ObstructionId, PlantingId, PlotId, SiteId } from './ids'
import type { GroundCover } from './ground'
import type { PvArray } from './pv'
import type { SoilProfile } from './site'
import type {
  DayOfYear,
  Degrees,
  Fraction,
  Meters,
  MillimetersPerYear,
  SquareMeters,
} from './units'

export type IrrigationMethod = 'none' | 'hand' | 'sprinkler' | 'drip' | 'subsurface-drip' | 'flood'

export interface Irrigation {
  readonly method: IrrigationMethod
  readonly available: boolean
  readonly appliedMmPerYear: MillimetersPerYear
}

export type CanopyTier = 'overstory' | 'mid-canopy' | 'shrub' | 'herb-ground'

export type MicroclimateModifierKind =
  | 'thermal-mass'
  | 'windbreak'
  | 'water-body'
  | 'stone-wall'
  | 'hedge'

export interface MicroclimateModifier {
  readonly kind: MicroclimateModifierKind
  readonly footprint: Polygon2D
  readonly heightM: Meters
}

export type WaterHarvestingScale = 'micro-basin' | 'macro-catchment'

export interface WaterHarvestingElement {
  readonly scale: WaterHarvestingScale
  readonly footprint: Polygon2D
}

export type PlantingRole = 'target-crop' | 'nurse' | 'insectary' | 'cover' | 'trap'

export interface Planting {
  readonly id: PlantingId
  readonly bedId: BedId
  readonly cropId: CropId
  readonly cultivarId: CultivarId | null
  readonly role: PlantingRole
  readonly tier: CanopyTier
  readonly sowDay: DayOfYear
  readonly harvestStartDay: DayOfYear
  readonly harvestEndDay: DayOfYear
  readonly plantCount: number
}

export interface Bed {
  readonly id: BedId
  readonly label: string
  readonly footprint: Polygon2D
  readonly areaM2: SquareMeters
  readonly soil: SoilProfile
  readonly irrigation: Irrigation
  readonly raisedHeightM: Meters
  readonly modifiers: readonly MicroclimateModifier[]
  readonly waterHarvesting: readonly WaterHarvestingElement[]
  readonly plantings: readonly Planting[]
}

/**
 * A house, drawn as a box opaque from the ground to its eaves. The light bake shades with its
 * five faces the way it shades with a panel (Decision Record 26)
 */
export interface House {
  readonly id: ObstructionId
  readonly kind: 'house'
  readonly label: string
  /** Four corners in plot metres; the walls stand on its edges and the top lies at `heightM` */
  readonly footprint: Polygon2D
  /** Ground to eaves */
  readonly heightM: Meters
}

/**
 * A tree, as the box its crown fills: the footprint is the crown seen from above, the crown runs
 * from `crownBaseM` up to `heightM` on a trunk the bake ignores, and light through the crown is
 * scaled by one transmittance in leaf and another leafless (Decision Record 26). The leafless
 * months are the ones outside the site's growing window; an evergreen keeps the in-leaf figure
 * all year
 */
export interface Tree {
  readonly id: ObstructionId
  readonly kind: 'tree'
  readonly label: string
  /** Four corners in plot metres, the crown seen from above */
  readonly footprint: Polygon2D
  /** Ground to the underside of the crown */
  readonly crownBaseM: Meters
  /** Ground to the top of the crown */
  readonly heightM: Meters
  readonly evergreen: boolean
  /** The share of light that passes the crown in leaf */
  readonly transmittance: Fraction
  /** The share that passes the bare crown; unused while `evergreen` */
  readonly leaflessTransmittance: Fraction
}

/** Something standing near the space that shades it, inside the boundary or outside it */
export type Obstruction = House | Tree

export type ObstructionKind = Obstruction['kind']

export interface GardenPlot {
  readonly id: PlotId
  readonly siteId: SiteId
  readonly label: string
  readonly boundary: Polygon2D
  readonly northOffsetDeg: Degrees
  readonly originOffsetM: Vec2M
  readonly beds: readonly Bed[]
  readonly arrays: readonly PvArray[]
  /** What stands near the space and shades it; inside the boundary or outside it */
  readonly obstructions: readonly Obstruction[]
  /** What is lying on the ground, which sets its albedo. See `src/types/ground.ts` */
  readonly groundCover: GroundCover
}
