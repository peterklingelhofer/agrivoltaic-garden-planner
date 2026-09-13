import { describe, expect, it } from 'bun:test'
import { banded, bandHalfWidth, interval } from './band'
import type { Banded } from './band'
import type {
  CompanionRule,
  ExperimentalCompanionRule,
  FolkloreCompanionRule,
  ScoreableCompanionRule,
} from './companion'
import type { YieldEstimate } from './recommend'
import { isTemperatureHardiness } from './site'
import type { HardinessRating, TemperatureHardinessRating } from './site'
import type { Celsius, Fraction } from './units'

const scoringPath = (rules: readonly ScoreableCompanionRule[]): number => rules.length
const gatePath = (rating: TemperatureHardinessRating): number => rating.extremeMinTempC

declare const mixedRules: readonly CompanionRule[]
declare const experimental: readonly ExperimentalCompanionRule[]
declare const folklore: readonly FolkloreCompanionRule[]
declare const scoreable: readonly ScoreableCompanionRule[]
declare const estimate: YieldEstimate
declare const anyRating: HardinessRating
declare const temperatureRating: TemperatureHardinessRating

const compileTimeInvariants = (): void => {
  // @ts-expect-error a bare number is not a band: single-point yields are unrepresentable
  const bare: Banded<Fraction> = 0.86
  void bare

  // @ts-expect-error a hand-rolled object cannot forge the sealed band brand
  const forged: Banded<Fraction> = { interval: { lower: 0.6, upper: 1.2 } }
  void forged

  // @ts-expect-error YieldEstimate exposes no scalar relative yield
  const scalar: number = estimate.relativeYield
  void scalar

  // @ts-expect-error grade C is experimental and never reaches the scoring path
  scoringPath(experimental)

  // @ts-expect-error grades D and E are folklore and never reach the scoring path
  scoringPath(folklore)

  // @ts-expect-error an unpartitioned rule list is not assignable to the scoring path
  scoringPath(mixedRules)

  scoringPath(scoreable)

  // @ts-expect-error NRCan scores a composite index: it has no winter minimum to carry
  const crosswalked: HardinessRating = {
    scheme: 'nrcan',
    zoneLabel: '7a',
    indexTerms: [],
    extremeMinTempC: -20 as Celsius,
  }
  void crosswalked

  // @ts-expect-error a temperature scheme cannot drop the temperature its zone label names
  const temperatureless: HardinessRating = { scheme: 'usda-2023', zoneLabel: '6a' }
  void temperatureless

  // @ts-expect-error the gate reads a temperature only after the scheme is partitioned
  gatePath(anyRating)

  gatePath(temperatureRating)
}

describe('band construction', () => {
  // never called: the value exists so tsc keeps the @ts-expect-error assertions above live
  it('holds the compile-time band and grading invariants', () => {
    expect(compileTimeInvariants).toBeInstanceOf(Function)
  })

  it('partitions hardiness schemes so only a temperature scheme carries a temperature', () => {
    const nrcan: HardinessRating = { scheme: 'nrcan', zoneLabel: '7a', indexTerms: [] }
    const usda: HardinessRating = {
      scheme: 'usda-2023',
      zoneLabel: '6a',
      extremeMinTempC: -23.3 as Celsius,
    }
    expect(isTemperatureHardiness(nrcan)).toBe(false)
    expect(isTemperatureHardiness(usda)).toBe(true)
    expect(nrcan.extremeMinTempC).toBeUndefined()
  })

  it('orders endpoints regardless of argument order', () => {
    const band = banded(
      interval(1.2 as Fraction, 0.6 as Fraction),
      0.95,
      'confidence',
      'crop-response',
      [],
    )
    expect(band.interval.lower).toBeCloseTo(0.6)
    expect(band.interval.upper).toBeCloseTo(1.2)
    expect(bandHalfWidth(band)).toBeCloseTo(0.3)
  })
})
