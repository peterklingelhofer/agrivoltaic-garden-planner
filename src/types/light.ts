import type { GridSpec } from './geo'
import type { BedId } from './ids'
import type { ByMonth, Fraction, MolPerM2Day } from './units'
import type { SkySubdivision } from './weather'

export interface RasterQuality {
  readonly subdivision: SkySubdivision
  readonly sunDirectionCount: number
  readonly substepsPerHour: number
  readonly parFraction: Fraction
  readonly photonConversionUmolPerJ: number
  readonly interreflectionApplied: boolean
  readonly seasonalParHalfWidthFraction: Fraction
}

// 'local-clock' reads a wall-clock hour on the site's timezone, daylight saving included, or off
// its fixed UTC offset where the series names no zone. 'solar' reads apparent solar time
// (longitude plus the equation of time)
export type TimeBasis = 'local-clock' | 'solar'

// one month-set crossed with one hour range, half-open [startHour, endHour). A window is the
// union of its clauses, which is what a rule like Growing Season Hours actually specifies
export interface TimeWindowClause {
  readonly months: readonly number[]
  readonly startHour: number
  readonly endHour: number
}

export interface TimeWindowSpec {
  readonly key: string
  readonly label: string
  readonly basis: TimeBasis
  readonly clauses: readonly TimeWindowClause[]
}

export interface TimeWindowSampling {
  readonly spec: TimeWindowSpec
  readonly dayCount: number
}

export interface WindowedDli extends TimeWindowSampling {
  readonly underArrayMolM2Day: Float32Array
  readonly openSkyMolM2Day: Float32Array
}

export interface DliRaster {
  readonly grid: GridSpec
  readonly skyViewFactor: Float32Array
  readonly annualUnderArrayMolM2Day: Float32Array
  readonly annualOpenSkyMolM2Day: Float32Array
  readonly monthlyUnderArrayMolM2Day: ByMonth<Float32Array>
  readonly monthlyOpenSkyMolM2Day: ByMonth<Float32Array>
  readonly windows: readonly WindowedDli[]
  readonly quality: RasterQuality
}

export interface LightHomogeneity {
  readonly coefficientOfVariation: Fraction
  readonly minOverMean: Fraction
}

export interface BedLight {
  readonly bedId: BedId
  readonly cellCount: number
  readonly monthlyMeanDliMolM2Day: ByMonth<MolPerM2Day>
  readonly monthlyMinDliMolM2Day: ByMonth<MolPerM2Day>
  readonly monthlyOpenSkyDliMolM2Day: ByMonth<MolPerM2Day>
  readonly monthlyRsr: ByMonth<Fraction>
  readonly annualMeanDliMolM2Day: MolPerM2Day
  /**
   * How much of the sky this bed can see, averaged over its own cells: 1 is open ground, 0 is
   * roofed over.
   *
   * The raster carries this per cell, for the diffuse light and for the ground-to-module
   * inter-reflection. It's aggregated onto a bed because it answers a second question the diffuse
   * light doesn't: the same geometry that lets a bed see less sky by day lets it lose less heat to
   * the sky at night, which is the mechanism behind every claim that panels hold frost off. See
   * `src/recommend/frost.ts`
   */
  readonly skyViewFactor: Fraction
  readonly homogeneity: LightHomogeneity
  readonly quality: RasterQuality
}

export interface GrowingWindow {
  readonly startMonth: number
  readonly endMonth: number
}

export interface SeasonLight {
  readonly bedId: BedId
  readonly window: GrowingWindow
  readonly meanDliMolM2Day: MolPerM2Day
  readonly minMonthlyDliMolM2Day: MolPerM2Day
  readonly maxMonthlyDliMolM2Day: MolPerM2Day
  readonly cumulativeRsr: Fraction
  readonly daysAboveDisorderCeiling: number
}
