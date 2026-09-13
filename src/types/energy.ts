import type { Banded } from './band'
import type { Cited } from './cited'
import type { ArrayId } from './ids'
import type {
  Degrees,
  Fraction,
  KilowattHours,
  KilowattsAc,
  KilowattsDc,
  KwhPerKwp,
  Ratio,
  SquareMeters,
} from './units'

/**
 * Faiman is the default; the Sandia/King form stays available. Neither primary
 * reference is in the citation corpus yet, so both carry their provenance as
 * data rather than as a bare comment
 */
export type CellTemperatureModel = 'faiman' | 'sapm'

export interface FaimanCoefficients {
  readonly u0: number
  readonly u1: number
}

export interface SapmThermalCoefficients {
  readonly a: number
  readonly b: number
  readonly deltaTC: number
}

export type LossComponent =
  | 'soiling'
  | 'shading'
  | 'snow'
  | 'mismatch'
  | 'wiring'
  | 'connections'
  | 'light-induced-degradation'
  | 'nameplate'
  | 'age'
  | 'availability'

export interface SystemLoss {
  readonly component: LossComponent
  readonly fraction: Fraction
  readonly label: string
}

export interface InverterModel {
  readonly nominalEfficiency: Fraction
  readonly referenceEfficiency: Fraction
}

export interface PvChainOptions {
  readonly cellTemperatureModel: CellTemperatureModel
  readonly faiman: FaimanCoefficients
  readonly sapm: SapmThermalCoefficients
  /** PVWatts v5 temperature coefficient of power, per degree C */
  readonly gammaPdcPerC: number
  readonly losses: readonly SystemLoss[]
  readonly dcAcRatio: Ratio
  readonly inverter: InverterModel
  readonly bifacial: boolean
  readonly rowShading: boolean
  /** Shortwave reflectance of the ground the rows stand on, from the plot's ground cover */
  readonly groundAlbedo: Fraction
  /**
   * How much of the ground is under snow, hour by hour, or null where nothing is known about the
   * site's winters. Null is the honest default and reads as bare ground all year: the alternative
   * would be inventing a snowfield for a garden whose location has not been resolved
   */
  readonly snowCover: Float32Array | null
}

export interface ArrayEnergy {
  readonly arrayId: ArrayId
  readonly moduleCount: number
  readonly apertureAreaM2: SquareMeters
  readonly landAreaM2: SquareMeters
  readonly groundCoverRatio: Fraction
  readonly nameplateDcKw: KilowattsDc
  readonly nameplateAcKw: KilowattsAc
  readonly dcAcRatio: Ratio
  readonly annualPoaKwhPerM2: number
  readonly bifacialGainFraction: Fraction
  readonly rowShadingLossFraction: Fraction
  readonly systemLossFraction: Fraction
  readonly annualDcKwh: KilowattHours
  readonly annualAcKwh: KilowattHours
  readonly clippingLossKwh: KilowattHours
  readonly clippingLossFraction: Fraction
  readonly specificYieldKwhPerKwp: KwhPerKwp
  readonly performanceRatio: Fraction
}

/**
 * The denominator of the LER electricity term. LER is meaningless without it,
 * so it travels with every report rather than living in a comment
 */
export interface ReferenceSystem {
  readonly groundCoverRatio: Fraction
  readonly tiltDeg: Degrees
  readonly surfaceAzimuthDeg: Degrees
  readonly dcAcRatio: Ratio
  readonly definition: string
  readonly annualAcKwhPerM2Land: number
}

export interface PvEnergyReport {
  readonly arrays: readonly ArrayEnergy[]
  readonly nameplateDcKw: KilowattsDc
  readonly nameplateAcKw: KilowattsAc
  readonly dcAcRatio: Ratio
  readonly annualAcKwh: KilowattHours
  readonly clippingLossKwh: KilowattHours
  readonly clippingLossFraction: Fraction
  /** The stack that actually ran, so the readout can never drift from the model */
  readonly losses: readonly SystemLoss[]
  readonly systemLossFraction: Fraction
  readonly rowShadingLossFraction: Fraction
  readonly bifacialGainFraction: Fraction
  readonly specificYieldKwhPerKwp: KwhPerKwp
  readonly annualAcKwhPerM2Land: number
  readonly landAreaM2: SquareMeters
  readonly reference: ReferenceSystem
  readonly energyRatio: Banded<Fraction>
  readonly provenance: readonly Cited<string>[]
}
