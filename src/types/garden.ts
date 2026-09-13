import type { Polygon2D, Vec2M } from './geo'
import type { BedId, CropId, CultivarId, PlantingId, PlotId, SiteId } from './ids'
import type { GroundCover } from './ground'
import type { PvArray } from './pv'
import type { SoilProfile } from './site'
import type { DayOfYear, Degrees, Meters, MillimetersPerYear, SquareMeters } from './units'

export type IrrigationMethod = 'none' | 'hand' | 'sprinkler' | 'drip' | 'subsurface-drip' | 'flood'

export interface Irrigation {
  readonly method: IrrigationMethod
  readonly available: boolean
  readonly appliedMmPerYear: MillimetersPerYear
  readonly harvestsPanelRunoff: boolean
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
  readonly tiedToArrayDripLine: boolean
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

export interface GardenPlot {
  readonly id: PlotId
  readonly siteId: SiteId
  readonly label: string
  readonly boundary: Polygon2D
  readonly northOffsetDeg: Degrees
  readonly originOffsetM: Vec2M
  readonly beds: readonly Bed[]
  readonly arrays: readonly PvArray[]
  /** What is lying on the ground, which sets its albedo. See `src/types/ground.ts` */
  readonly groundCover: GroundCover
}
