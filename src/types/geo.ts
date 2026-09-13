import type { Degrees, DegreesLatitude, DegreesLongitude, Meters, SquareMeters } from './units'

export interface LatLon {
  readonly latitudeDeg: DegreesLatitude
  readonly longitudeDeg: DegreesLongitude
}

export interface Vec2M {
  readonly xM: Meters
  readonly yM: Meters
}

export interface Vec3M {
  readonly xM: Meters
  readonly yM: Meters
  readonly zM: Meters
}

export interface UnitVec3 {
  readonly x: number
  readonly y: number
  readonly z: number
}

export type Ring2D = readonly Vec2M[]

export interface Polygon2D {
  readonly exterior: Ring2D
  readonly holes: readonly Ring2D[]
}

export interface Polygon3D {
  readonly vertices: readonly Vec3M[]
}

export interface Extent2D {
  readonly minXM: Meters
  readonly minYM: Meters
  readonly maxXM: Meters
  readonly maxYM: Meters
}

export interface GridSpec {
  readonly extent: Extent2D
  readonly cellSizeM: Meters
  readonly cols: number
  readonly rows: number
}

export interface AreaSummary {
  readonly areaM2: SquareMeters
  readonly perimeterM: Meters
}

export interface SiteOrigin extends LatLon {
  readonly northOffsetDeg: Degrees
}
