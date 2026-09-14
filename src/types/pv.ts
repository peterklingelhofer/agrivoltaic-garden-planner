import type { Polygon3D, UnitVec3, Vec2M } from './geo'
import type { ArrayId, PanelId } from './ids'
import type {
  Degrees,
  EpochMillis,
  Fraction,
  KilowattsAc,
  KilowattsDc,
  Meters,
  WattsPeak,
} from './units'

export type TrackingMode =
  | 'fixed'
  | 'single-axis-horizontal-ns'
  | 'single-axis-tilted'
  | 'dual-axis'
  | 'agro-optimised'

export interface ModuleSpec {
  readonly widthM: Meters
  readonly heightM: Meters
  readonly nameplateWp: WattsPeak
  readonly bifacialityFactor: Fraction
  readonly transmittanceFraction: Fraction
  readonly rearReflectance: Fraction
  readonly backsheet: 'glass-glass' | 'white' | 'black'
}

export interface RowGeometry {
  readonly collectorWidthM: Meters
  readonly pitchM: Meters
  readonly rowLengthM: Meters
  readonly rowCount: number
  readonly modulesPerRow: number
  readonly clearanceHeightM: Meters
  readonly rowAzimuthDeg: Degrees
  readonly originM: Vec2M
}

export interface FixedTilt {
  readonly mode: 'fixed'
  readonly tiltDeg: Degrees
  readonly surfaceAzimuthDeg: Degrees
}

export interface SingleAxisTracking {
  readonly mode: 'single-axis-horizontal-ns' | 'single-axis-tilted'
  readonly axisTiltDeg: Degrees
  readonly axisAzimuthDeg: Degrees
  readonly maxRotationDeg: Degrees
  readonly backtracking: boolean
}

export interface DualAxisTracking {
  readonly mode: 'dual-axis'
  readonly maxRotationDeg: Degrees
  readonly minElevationDeg: Degrees
}

export interface AgroOptimisedTracking {
  readonly mode: 'agro-optimised'
  readonly maxRotationDeg: Degrees
  readonly targetGroundDliMolM2Day: number
}

export type TrackerConfig =
  | FixedTilt
  | SingleAxisTracking
  | DualAxisTracking
  | AgroOptimisedTracking

export interface DerivedArrayMetrics {
  readonly groundCoverRatio: Fraction
  readonly projectedGroundCoverRatio: Fraction
  readonly maxHeightM: Meters
  readonly nameplateDcKw: KilowattsDc
  /** Inverter AC rating at the default DC:AC ratio, the figure an AC cap is measured against */
  readonly nameplateAcKw: KilowattsAc
}

export interface PvArray {
  readonly id: ArrayId
  readonly label: string
  readonly geometry: RowGeometry
  readonly tracker: TrackerConfig
  readonly module: ModuleSpec
  readonly derived: DerivedArrayMetrics
}

/** A quad the light bake ray-tests: a panel, or a face of a drawn house or tree */
export interface Occluder {
  readonly corners: Polygon3D
  /** The share of light that passes this quad; absent means the kernel's own scalar */
  readonly transmittance?: Fraction
  /** The share that passes leafless; absent means the same as `transmittance` */
  readonly leaflessTransmittance?: Fraction
}

export interface PanelPolygon extends Occluder {
  readonly id: PanelId
  readonly arrayId: ArrayId
  readonly rowIndex: number
  readonly columnIndex: number
  readonly normal: UnitVec3
  readonly tiltDeg: Degrees
  readonly surfaceAzimuthDeg: Degrees
  readonly atUtcMillis: EpochMillis
}

export interface PanelSnapshot {
  readonly atUtcMillis: EpochMillis
  readonly panels: readonly PanelPolygon[]
}
