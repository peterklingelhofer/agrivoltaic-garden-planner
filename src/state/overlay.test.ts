import { describe, expect, it } from 'bun:test'
import type { AccumulationResult } from '../sim/backend'
import { dliRasterFromAccumulation } from '../sim/raster'
import type { GridSpec } from '../types/geo'
import type { DliRaster, RasterQuality } from '../types/light'
import type { Fraction, Meters, MonthIndex } from '../types/units'
import { overlayField, overlayOffOnSeasons } from './overlay'

describe('whether the seasons step leaves the ground uncoloured', () => {
  it('is off on every other step, whatever the grower chose', () => {
    expect(overlayOffOnSeasons({ sidebarStep: 'light' })).toBe(false)
    expect(overlayOffOnSeasons({ sidebarStep: 'light', overlayOnSeasons: true })).toBe(false)
  })

  it('hides the colours on the seasons step by default', () => {
    expect(overlayOffOnSeasons({ sidebarStep: 'seasons' })).toBe(true)
    expect(overlayOffOnSeasons({ sidebarStep: 'seasons', overlayOnSeasons: false })).toBe(true)
  })

  it('brings the colours back once the grower turns the seasons-step toggle on', () => {
    expect(overlayOffOnSeasons({ sidebarStep: 'seasons', overlayOnSeasons: true })).toBe(false)
  })
})

const COLS = 2
const ROWS = 2
const CELLS = COLS * ROWS

const grid: GridSpec = {
  extent: { minXM: 0 as Meters, minYM: 0 as Meters, maxXM: 2 as Meters, maxYM: 2 as Meters },
  cellSizeM: 1 as Meters,
  cols: COLS,
  rows: ROWS,
}

const quality: RasterQuality = {
  subdivision: 'reinhart-mf2',
  sunDirectionCount: 700,
  substepsPerHour: 4,
  parFraction: 0.45 as Fraction,
  photonConversionUmolPerJ: 4.57,
  interreflectionApplied: false,
  seasonalParHalfWidthFraction: 0.1 as Fraction,
}

// Every month and every cell gets a different value on purpose: a fixture where every month is the
// same would let a bug that ignores month length (a plain 12-way mean) pass by accident.
// `beamOf`/`diffuseOf` are the ONLY place these numbers are defined; the annual total below is
// their sum, not a separately chosen figure, so the accumulation invariant this file exists to
// check is not tautological. The magnitudes are chosen to land in the same tens-of-mol/m2/day range
// as a real temperate site (see `raster.test.ts`'s 1,000,000 Wh/m2/yr fixture), because a fixture
// an order of magnitude too small would float every DLI value under the ramp's `Math.max(1, ...)`
// floor and hide a real mismatch there
const beamOf = (month: number, cell: number): number => 60_000 + month * 1_500 + cell * 400
const diffuseOf = (month: number, cell: number): number => 25_000 + month * 700 + cell * 150

const monthlySeries = (perCell: (month: number, cell: number) => number): Float32Array[] =>
  Array.from({ length: 12 }, (_unused, month) =>
    Float32Array.from({ length: CELLS }, (_c, cell) => perCell(month, cell)),
  )

const annualSeries = (perCell: (month: number, cell: number) => number): Float32Array => {
  const out = new Float32Array(CELLS)
  for (let month = 0; month < 12; month += 1) {
    for (let cell = 0; cell < CELLS; cell += 1) out[cell] = (out[cell] ?? 0) + perCell(month, cell)
  }
  return out
}

// The under-array series is scaled down from the open-sky one so shading is a real,
// month-varying fraction rather than a constant, which is what a shade band sweeping through the
// year would actually look like
const accumulationOf = (scale: number, svf: number): AccumulationResult => ({
  beamWhPerM2: annualSeries((month, cell) => scale * beamOf(month, cell)),
  diffuseWhPerM2: annualSeries((month, cell) => scale * diffuseOf(month, cell)),
  windowWhPerM2: [],
  monthlyBeamWhPerM2: monthlySeries((month, cell) => scale * beamOf(month, cell)),
  monthlyDiffuseWhPerM2: monthlySeries((month, cell) => scale * diffuseOf(month, cell)),
  skyViewFactor: new Float32Array(CELLS).fill(svf),
  backend: 'cpu-reference',
  elapsedMs: 1,
})

const openSky = accumulationOf(1, 1)
const underArray = accumulationOf(0.6, 0.55)

const raster = (): DliRaster => dliRasterFromAccumulation(grid, underArray, openSky, quality)

describe('overlay accumulation', () => {
  it('accumulating all twelve months from January equals the raster annual mean, cell for cell', () => {
    const built = raster()
    const playback = { month: 12 as MonthIndex, from: 1 as MonthIndex }
    const field = overlayField(built, 'dli', 12, playback)
    expect(field.values).not.toBeNull()

    let maxAbsDiff = 0
    let maxRelDiff = 0
    for (let i = 0; i < CELLS; i += 1) {
      const got = field.values?.[i] ?? NaN
      const want = built.annualUnderArrayMolM2Day[i] ?? NaN
      const absDiff = Math.abs(got - want)
      maxAbsDiff = Math.max(maxAbsDiff, absDiff)
      maxRelDiff = Math.max(maxRelDiff, absDiff / want)
    }
    /*
     * Measured on this fixture: max absolute difference 0, max relative difference 0, every cell
     * bit for bit. Both paths run the same linear Wh -> mol/m2/d conversion, one dividing by 365
     * once and the other dividing by each month's own day count and then re-weighting by those
     * same day counts, so the only disagreement available to them is rounding. Exactness is not
     * asserted, because the two paths round in a different order and a fixture with less
     * convenient magnitudes would land a few ulps apart; the bound is float32 epsilon with
     * headroom, and it is the message below that carries the real number if it ever moves
     */
    expect(
      maxRelDiff,
      `accumulated year vs annual field: max abs diff ${maxAbsDiff.toExponential(3)} mol/m2/d`,
    ).toBeLessThan(1e-5)
  })

  it('weights by each month’s length in days, not a plain twelve-way mean', () => {
    const built = raster()
    // February alone against a January+February accumulation: if the accumulation were a plain
    // mean of the two slices it would land exactly halfway, which is NOT the weighted answer
    // because January has three more days than February
    const febOnly = overlayField(built, 'dli', 2, null).values ?? new Float32Array(CELLS)
    const janFeb =
      overlayField(built, 'dli', 2, { month: 2, from: 1 }).values ?? new Float32Array(CELLS)
    const janOnly = overlayField(built, 'dli', 1, null).values ?? new Float32Array(CELLS)
    for (let i = 0; i < CELLS; i += 1) {
      const plainMean = ((janOnly[i] ?? 0) + (febOnly[i] ?? 0)) / 2
      const got = janFeb[i] ?? 0
      // a fixed decimal tolerance would be meaningless against magnitudes this test does not
      // control, so the "clearly not a plain mean" check is relative
      expect(Math.abs(got - plainMean) / got).toBeGreaterThan(1e-3)
      const expected = (31 * (janOnly[i] ?? 0) + 28 * (febOnly[i] ?? 0)) / 59
      expect(Math.abs(got - expected) / expected).toBeLessThan(1e-5)
    }
  })

  it('wraps a span from November through February, four months', () => {
    const built = raster()
    const field = overlayField(built, 'dli', 2, { month: 2, from: 11 })
    expect(field.span).toBe('Nov to Feb')
    expect(field.label).toBe('Mean daily light integral, Nov to Feb')
    expect(field.note).toBe(
      'Each month elapsed is weighted by its own length in days before being averaged into this figure',
    )
  })

  it('names a single-month span without "to" when the run has only just started', () => {
    const built = raster()
    const field = overlayField(built, 'dli', 6, { month: 6, from: 6 })
    expect(field.span).toBe('Jun')
    expect(field.label).toBe('Mean daily light integral, Jun')
  })

  it('produces the season-cumulative shade fraction for rsr, weighted the same way', () => {
    const built = raster()
    const field = overlayField(built, 'rsr', 3, { month: 3, from: 1 })
    expect(field.values).not.toBeNull()
    for (let i = 0; i < CELLS; i += 1) {
      const value = field.values?.[i] ?? NaN
      expect(value).toBeGreaterThanOrEqual(0)
      expect(value).toBeLessThanOrEqual(1)
    }
    expect(field.label).toBe('Relative shade ratio, Jan to Mar')
  })

  it('leaves sky view factor alone: accumulation has no monthly dimension to accumulate', () => {
    const built = raster()
    const playing = overlayField(built, 'sky-view-factor', 6, { month: 6, from: 1 })
    const still = overlayField(built, 'sky-view-factor', 6, null)
    expect(playing.values).toBe(still.values)
    expect(playing.span).toBeNull()
    expect(playing.label).toBe('Sky view factor')
  })

  it('holds the dli colour domain fixed across every frame once playback has started', () => {
    const built = raster()
    let maxAnnualMonth = 0
    for (const month of built.monthlyUnderArrayMolM2Day) {
      for (let i = 0; i < month.length; i += 1)
        maxAnnualMonth = Math.max(maxAnnualMonth, month[i] ?? 0)
    }
    // one-month-at-a-time playback: `max` must be the fixed twelve-month ceiling in every frame
    const janFrame = overlayField(built, 'dli', 1, { month: 1, from: null })
    const julyFrame = overlayField(built, 'dli', 7, { month: 7, from: null })
    expect(janFrame.max).toBeCloseTo(maxAnnualMonth, 4)
    expect(julyFrame.max).toBeCloseTo(maxAnnualMonth, 4)
    expect(janFrame.max).toBeCloseTo(julyFrame.max, 6)

    // static (not playing) behaviour is untouched: max still comes from the slice on screen
    const staticJan = overlayField(built, 'dli', 1, null)
    expect(staticJan.max).not.toBeCloseTo(maxAnnualMonth, 4)
  })

  it('does not accumulate a single non-accumulating playback frame, matching today’s behaviour', () => {
    const built = raster()
    const played = overlayField(built, 'dli', 5, { month: 5, from: null })
    const staticFrame = overlayField(built, 'dli', 5, null)
    expect(played.values).toEqual(built.monthlyUnderArrayMolM2Day[4])
    expect(played.values).toEqual(staticFrame.values)
    expect(played.label).toBe('Daily light integral')
    expect(played.span).toBeNull()
    expect(played.note).toBeNull()
  })
})
