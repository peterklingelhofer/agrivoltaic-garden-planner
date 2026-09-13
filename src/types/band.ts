import type { Brand, Sealed } from './brand'
import type { Fraction, Ratio } from './units'

export type ConfidenceLevel = 0.5 | 0.68 | 0.8 | 0.9 | 0.95

/**
 * `mount-structure` and `crowding` are the members here that aren't about light, weather or
 * ground.
 *
 * A build cost spans NREL's three crop-mount structures, and which of the three a garden array
 * is, is the whole width of that band. None of the five physical sources describes it, and
 * borrowing one would have labeled a dollar figure as dominated by soil water.
 *
 * `crowding` is this app's own spacing penalty on a yield band, named so the share it takes is
 * never read as part of the published crop response it is applied to
 */
export type UncertaintySource =
  | 'crop-response'
  | 'seasonal-par'
  | 'optical-geometry'
  | 'weather-tmy'
  | 'soil-water'
  | 'mount-structure'
  | 'crowding'

export interface UncertaintyContribution {
  readonly source: UncertaintySource
  readonly halfWidthFraction: Fraction
  readonly note: string
}

export interface Interval<T extends number> extends Sealed<'Interval'> {
  readonly lower: T
  readonly upper: T
}

/**
 * What the endpoints mean. Carried as data so no renderer ever has to name the interval type in a
 * hardcoded string, which is how a confidence interval gets mislabeled as a prediction interval
 */
export type IntervalKind = 'confidence' | 'prediction' | 'tolerance' | 'range'

export interface Banded<T extends number> extends Sealed<'Banded'> {
  readonly interval: Interval<T>
  readonly confidence: ConfidenceLevel
  readonly intervalKind: IntervalKind
  readonly dominantSource: UncertaintySource
  readonly contributions: readonly UncertaintyContribution[]
}

export type PointEstimate<T extends number> = Brand<T, 'PointEstimate'>

export const interval = <T extends number>(a: T, b: T): Interval<T> =>
  ({ lower: Math.min(a, b) as T, upper: Math.max(a, b) as T }) as unknown as Interval<T>

export const banded = <T extends number>(
  bounds: Interval<T>,
  confidence: ConfidenceLevel,
  intervalKind: IntervalKind,
  dominantSource: UncertaintySource,
  contributions: readonly UncertaintyContribution[],
): Banded<T> =>
  ({
    interval: bounds,
    confidence,
    intervalKind,
    dominantSource,
    contributions,
  }) as unknown as Banded<T>

export const bandHalfWidth = <T extends number>(value: Banded<T>): number =>
  (value.interval.upper - value.interval.lower) / 2

export const unsafeBandMidpoint = <T extends number>(value: Banded<T>): PointEstimate<T> =>
  (((value.interval.lower as number) + (value.interval.upper as number)) / 2) as PointEstimate<T>

export const widenBand = <T extends number>(
  value: Banded<T>,
  extra: UncertaintyContribution,
): Banded<T> =>
  banded(
    interval(
      ((value.interval.lower as number) * (1 - extra.halfWidthFraction)) as T,
      ((value.interval.upper as number) * (1 + extra.halfWidthFraction)) as T,
    ),
    value.confidence,
    value.intervalKind,
    value.dominantSource,
    [...value.contributions, extra],
  )

export interface LandEquivalentRatio {
  readonly totalLer: Banded<Ratio>
  readonly partialLerByCropId: ReadonlyMap<string, Banded<Ratio>>
  /** The electricity partial, kept separate so the total can be read as crops plus power */
  readonly electricity: Banded<Ratio>
}
