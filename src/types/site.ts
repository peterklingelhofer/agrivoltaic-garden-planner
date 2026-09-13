import type { LatLon } from './geo'
import type { SiteId } from './ids'
import type { WaterLimitation } from './water'
import type { ClimateNormals } from './weather'
import type {
  Celsius,
  ChillHours,
  ChillPortions,
  DayOfYear,
  DegreeDaysC,
  Days,
  Fraction,
  Meters,
  UtahChillUnits,
} from './units'

export type ChillMetric = 'chilling-hours' | 'utah-chill-units' | 'dynamic-chill-portions'

export interface ChillAccumulation {
  readonly chillingHours: ChillHours
  readonly utahChillUnits: UtahChillUnits
  readonly dynamicChillPortions: ChillPortions
  readonly seasonStart: DayOfYear
  readonly seasonEnd: DayOfYear
}

export type ExceedancePercentile = 10 | 20 | 30 | 40 | 50

export interface FrostExceedanceCurve {
  readonly thresholdC: Celsius
  readonly lastSpringFreeze: Readonly<Record<ExceedancePercentile, DayOfYear>>
  readonly firstFallFreeze: Readonly<Record<ExceedancePercentile, DayOfYear>>
  readonly frostFreeDays: Readonly<Record<ExceedancePercentile, Days>>
  /**
   * True where too few years crossed the threshold for the percentile to name a frost: the pair
   * above is then the record's two sentinel days rather than dates, `frostFreeDays` is the whole
   * year, and nothing downstream may print the pair
   */
  readonly frostFree: Readonly<Record<ExceedancePercentile, boolean>>
  /** Years of the record with a day at or below the threshold */
  readonly frostYears: number
}

export interface SeasonGdd {
  readonly base4C: DegreeDaysC
  readonly base10C: DegreeDaysC
  readonly percentile: ExceedancePercentile
}

/**
 * A scheme whose zone label IS a band of mean annual extreme minimum temperature, so the
 * label and the temperature are two spellings of one measurement
 */
export interface TemperatureHardinessRating {
  readonly scheme: 'usda-2023' | 'rhs'
  /** the lower edge of the band, which is the only temperature a label defines */
  readonly extremeMinTempC: Celsius
  readonly zoneLabel: string
  /**
   * Where the extreme minimum came from: the bundled PRISM grid, or thirty years of daily
   * minima computed here where the grid has no coverage. Same statistic, different
   * provenance, and the label on screen says which
   */
  readonly basis?: 'grid' | 'weather-record'
}

/**
 * The seven climate variables the Canadian index combines (Ouellet and Sherk 1967,
 * reinterpolated by McKenney et al.). Not one of them is the USDA statistic
 */
export type HardinessIndexVariable =
  | 'coldest-month-mean-daily-min-temp'
  | 'frost-free-days-above-0c'
  | 'june-to-november-rainfall'
  | 'warmest-month-mean-daily-max-temp'
  | 'january-rainfall-winter-harshness'
  | 'max-snow-depth'
  | 'max-wind-gust'

export interface HardinessIndexTerm {
  readonly variable: HardinessIndexVariable
  readonly value: number
}

/**
 * NRCan, whose zone is a score on a composite index rather than a temperature. The optional
 * `never` is the point of the union: no temperature is recoverable from such a zone, so the
 * field cannot be filled at all and the USDA crosswalk is unrepresentable rather than merely
 * discouraged (Decision Record 9)
 */
export interface CompositeHardinessRating {
  readonly scheme: 'nrcan'
  readonly extremeMinTempC?: never
  readonly zoneLabel: string
  /** empty where the published layer carries the zone label alone, which is what NRCan ships */
  readonly indexTerms: readonly HardinessIndexTerm[]
}

export type HardinessRating = TemperatureHardinessRating | CompositeHardinessRating

export type HardinessScheme = HardinessRating['scheme']

export const isTemperatureHardiness = (
  rating: HardinessRating,
): rating is TemperatureHardinessRating => rating.scheme !== 'nrcan'

export interface SoilProfile {
  readonly phUnits: number
  readonly textureClass: SoilTexture
  readonly drainage: SoilDrainage
  readonly effectiveDepthM: Meters
  readonly organicMatterFraction: Fraction
  /** 'default' is the loam this app assumes where no map answered and nobody typed a value */
  readonly sourceId: 'soilgrids' | 'ssurgo' | 'user' | 'default'
}

export type SoilTexture =
  | 'sand'
  | 'loamy-sand'
  | 'sandy-loam'
  | 'loam'
  | 'silt-loam'
  | 'silt'
  | 'clay-loam'
  | 'silty-clay-loam'
  | 'sandy-clay'
  | 'silty-clay'
  | 'clay'

export type SoilDrainage = 'very-poor' | 'poor' | 'moderate' | 'well' | 'excessive'

export interface Site {
  readonly id: SiteId
  readonly label: string
  readonly location: LatLon
  /** null when the elevation lookup returned nothing: 0 m is a measurement, not an absence */
  readonly elevationM: Meters | null
  readonly timezone: string
  readonly utcOffsetHours: number
  readonly koppenCode: string
  /**
   * The TDWG level 3 botanical country this site stands in, or null off the region grid.
   *
   * Only a plant checklist is indexed by these, so this exists for exactly one question: is a
   * given species native HERE. Null is a real answer and is never read as "nothing is native"
   */
  readonly botanicalArea: string | null
  readonly hardiness: readonly HardinessRating[]
  readonly heatDaysAbove30C: number
  readonly normals: ClimateNormals
  readonly chill: ChillAccumulation
  readonly frost: readonly FrostExceedanceCurve[]
  readonly seasonGdd: SeasonGdd
  readonly soil: SoilProfile
  /** Graded, from a FAO-56 soil-water balance. `waterLimitation.limited` is the boolean accessor */
  readonly waterLimitation: WaterLimitation
}
