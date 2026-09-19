import type { Banded, Interval } from './band'
import type { GridSpec } from './geo'
import type { ArrayId, BedId } from './ids'
import type { SoilTexture } from './site'
import type {
  ByMonth,
  DayOfYear,
  Days,
  Fraction,
  Meters,
  Millimeters,
  MillimetersPerYear,
} from './units'

/**
 * Penman-Monteith is the FAO-56 primary method and needs humidity and wind.
 * Hargreaves-Samani is the documented fallback for a weather source that ships
 * neither, and is temperature and extraterrestrial radiation only
 */
export type Et0Method = 'fao56-penman-monteith' | 'hargreaves-samani'

export interface DailyWeather {
  readonly dayIndex: number
  readonly tMaxC: number
  readonly tMinC: number
  readonly tMeanC: number
  /** null where the source ships no humidity, which forces the fallback method */
  readonly actualVapourPressureKpa: number | null
  readonly windSpeed2mMS: number | null
  readonly solarRadiationMjM2Day: number
  readonly extraterrestrialMjM2Day: number
  readonly clearSkyRadiationMjM2Day: number
  readonly pressureKpa: number
}

export interface ReferenceEt {
  readonly method: Et0Method
  readonly fallbackReason: string | null
  readonly dailyMm: readonly number[]
  readonly monthlyMeanMmPerDay: ByMonth<number>
  readonly annualMm: MillimetersPerYear
}

export type GrowthStage = 'fallow' | 'initial' | 'development' | 'mid-season' | 'late-season'

/** FAO-56 four-stage growth curve, anchored on the planting calendar */
export interface StageCalendar {
  readonly plantingDay: DayOfYear
  readonly initialDays: Days
  readonly developmentDays: Days
  readonly midSeasonDays: Days
  readonly lateSeasonDays: Days
}

export interface DualKc {
  readonly stage: GrowthStage
  readonly basal: number
  readonly canopyCoverFraction: Fraction
}

export interface SoilWaterCapacity {
  readonly texture: SoilTexture
  readonly rootDepthM: Meters
  readonly totalAvailableWaterMm: Interval<Millimeters>
  readonly readilyEvaporableMm: Millimeters
  readonly totalEvaporableMm: Millimeters
}

export interface DripCrossing {
  readonly arrayId: ArrayId
  readonly rowIndex: number
  readonly rowCount: number
  /** The side of the bed the strip runs along, in the plot frame */
  readonly side: 'north' | 'south' | 'east' | 'west'
  readonly stripWidthM: Meters
}

export interface BedRain {
  readonly bedId: BedId
  /** Share of the bed in the panels' rain shadow, averaged over the wind's directions */
  readonly shelteredFraction: Fraction
  /** Panel water landing on the bed as a multiple of the bed's own open-ground rain, before any loss */
  readonly dripMultiple: number
  readonly crossings: readonly DripCrossing[]
}

export interface RainField {
  readonly grid: GridSpec
  /** Rain reaching each cell as a multiple of open ground: 0 in shadow, 1 open, a strip several */
  readonly values: Float32Array
  readonly beds: readonly BedRain[]
}

/**
 * Panels shelter most of a plot from rain and concentrate it into drip lines
 * (Elamri et al. 2018). Both halves are modelled, and both are thin evidence
 */
export interface PanelRainSplit {
  readonly interceptedFraction: Fraction
  readonly reachingBedFraction: Fraction
  /** The bed's own `BedRain.dripMultiple`, after whatever share the bed's own capture keeps */
  readonly dripMultiple: number
  readonly crossings: readonly DripCrossing[]
}

export interface WaterBalanceRun {
  readonly cropEtMm: Millimeters
  readonly actualEtMm: Millimeters
  readonly deficitMm: Millimeters
  readonly deficitFraction: Fraction
  readonly rainfallMm: Millimeters
  readonly irrigationMm: Millimeters
  readonly stressDays: number
}

/**
 * Replaces the boolean gate of Decision Record 6. The index is a graded season
 * deficit fraction, zero on a site whose rainfall covers reference demand and
 * one where none of it is covered
 */
export interface WaterLimitation {
  readonly index: Fraction
  readonly band: Banded<Fraction>
  readonly aridityIndex: number
  readonly referenceEtMm: MillimetersPerYear
  readonly rainfallMm: MillimetersPerYear
  readonly method: Et0Method
  readonly fallbackReason: string | null
  readonly limited: boolean
}

export interface ShadeBenefitStatus {
  readonly active: boolean
  readonly scale: Fraction
  readonly reason: string
}

export interface BedWaterBalance {
  readonly bedId: BedId
  readonly capacity: SoilWaterCapacity
  readonly rain: PanelRainSplit
  readonly openSky: WaterBalanceRun
  readonly underPanels: WaterBalanceRun
  readonly openSkyEt0Mm: MillimetersPerYear
  readonly underPanelsEt0Mm: MillimetersPerYear
  readonly irrigationOpenSkyMm: Banded<Millimeters>
  readonly irrigationUnderPanelsMm: Banded<Millimeters>
  readonly evapotranspirationSaving: Banded<Fraction>
  readonly shadeBenefit: ShadeBenefitStatus
  readonly method: Et0Method
  readonly notes: readonly string[]
}
