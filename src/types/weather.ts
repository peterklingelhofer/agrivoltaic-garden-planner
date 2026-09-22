import type {
  Celsius,
  Degrees,
  EpochMillis,
  HourOfYear,
  MetersPerSecond,
  Millibars,
  Millimeters,
  WattsPerM2,
} from './units'

export const HOURS_PER_TMY = 8760

export type WeatherSourceId =
  | 'open-meteo'
  | 'pvgis-sarah3'
  | 'nsrdb-psm3'
  | 'nasa-power'
  | 'user-upload'

export type DecompositionModel = 'passthrough' | 'dirint' | 'engerer2' | 'erbs'

export interface TmyHour {
  readonly hourOfYear: HourOfYear
  readonly utcMillis: EpochMillis
  readonly ghiWM2: WattsPerM2
  readonly dniWM2: WattsPerM2
  readonly dhiWM2: WattsPerM2
  readonly dryBulbC: Celsius
  readonly dewPointC: Celsius
  readonly windSpeedMS: MetersPerSecond
  readonly pressureMb: Millibars
}

export interface TmySeries {
  readonly source: WeatherSourceId
  readonly decomposition: DecompositionModel
  readonly utcOffsetHours: number
  /**
   * The IANA zone the site keeps its clock in, stamped by the site lookup. Absent on a series
   * that knows only its fixed offset, which then stands for every hour of the year
   */
  readonly timezone?: string
  readonly startUtcMillis: EpochMillis
  readonly utcMillis: Float64Array
  readonly ghiWM2: Float32Array
  readonly dniWM2: Float32Array
  readonly dhiWM2: Float32Array
  readonly dryBulbC: Float32Array
  readonly dewPointC: Float32Array
  readonly windSpeedMS: Float32Array
  readonly pressureMb: Float32Array
  /**
   * Rain in each hour, in millimetres, where the source carries it. Open-Meteo and NASA POWER
   * do; the PVGIS and NSRDB typical years do not. Absent means unknown, never dry: a balance
   * that finds no series falls back to the thirty-year normals
   */
  readonly precipMm?: Float32Array
  /**
   * The direction the wind blows from in each hour, degrees clockwise from north, where the
   * source carries it. All four do; a series read before the column was asked for has none, and
   * absent means unknown, never calm
   */
  readonly windDirectionDeg?: Float32Array
  readonly provenance: WeatherProvenance
}

/**
 * One calendar year as the site actually had it, kept beside the typical year assembled from
 * the same ten. The typical year is the designer's input by Decision Record 4; a measured year
 * is what a season simulation runs on, and it says which year it is (Decision Record 14)
 */
export interface MeasuredYear {
  readonly year: number
  readonly weather: TmySeries
}

export interface WeatherRecord {
  readonly typical: TmySeries
  /** Empty where the source ships a typical year and nothing else */
  readonly years: readonly MeasuredYear[]
  /**
   * The site's height above sea level in metres, as the weather body gave it, and null where it
   * gave none. Every source here answers with the elevation of the cell its year was read from,
   * so the one fetch carries both and a site lookup asks no separate elevation service
   */
  readonly elevationM: number | null
}

export interface WeatherProvenance {
  readonly datasetLabel: string
  readonly yearsCovered: readonly number[]
  readonly licence: string
  readonly attribution: string
  readonly retrievedUtcMillis: EpochMillis
  readonly isTypicalMeteorologicalYear: boolean
}

export interface SolarPositionSample {
  readonly geometricElevationDeg: Degrees
  readonly apparentElevationDeg: Degrees
  readonly zenithDeg: Degrees
  readonly azimuthDeg: Degrees
  readonly declinationDeg: Degrees
  readonly hourAngleDeg: Degrees
  readonly earthRadiusVectorAu: number
  readonly relativeAirMass: number
  readonly absoluteAirMass: number
}

export interface SolarPositionSeries {
  readonly count: number
  readonly geometricElevationDeg: Float32Array
  readonly apparentElevationDeg: Float32Array
  readonly azimuthDeg: Float32Array
  readonly absoluteAirMass: Float32Array
  readonly extraterrestrialNormalWM2: Float32Array
}

export interface SunDirectionBin {
  readonly x: number
  readonly y: number
  readonly z: number
  readonly beamWeightWhPerM2: number
}

export interface SkyPatch {
  readonly index: number
  readonly altitudeDeg: Degrees
  readonly azimuthDeg: Degrees
  readonly solidAngleSr: number
  readonly cumulativeRadianceWhPerM2: number
}

export type SkySubdivision = 'tregenza-mf1' | 'reinhart-mf2'

export interface CumulativeSky {
  readonly subdivision: SkySubdivision
  readonly patches: readonly SkyPatch[]
  readonly sunDirections: readonly SunDirectionBin[]
  readonly substepsPerHour: number
  readonly binningDeg: Degrees
}

export interface ClimateNormals {
  readonly monthlyMeanTempC: readonly Celsius[]
  readonly monthlyMinTempC: readonly Celsius[]
  readonly monthlyMaxTempC: readonly Celsius[]
  readonly monthlyPrecipMm: readonly Millimeters[]
  readonly monthlyMeanDliMolM2Day: readonly number[]
  readonly heatDaysAbove30C: number
  readonly normalsPeriod: string
  /** The upstream whose daily record these were aggregated from */
  readonly source: WeatherSourceId
}
