import type { GridSpec } from '../types/geo'
import type { DliRaster, RasterQuality, TimeWindowSampling } from '../types/light'
import type { Fraction, MolPerM2Day } from '../types/units'
import type { AccumulationResult } from './backend'
import { at } from './math'
import { interreflectionGain } from './viewfactor'
import { byMonth, molPerM2FromWhPerM2, monthValue, relativeShadeRatio } from './units'

const DAYS_PER_YEAR = 365
const DAYS_PER_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31] as const

const dailyDli = (
  beam: Float32Array,
  diffuse: Float32Array,
  parFraction: number,
  days: number,
): Float32Array => {
  const out = new Float32Array(beam.length)
  for (let i = 0; i < out.length; i += 1) {
    out[i] = molPerM2FromWhPerM2(at(beam, i) + at(diffuse, i), parFraction) / days
  }
  return out
}

// a window already carries its own day count, so the same Wh -> mol/m2/day conversion applies
// with the window's days in place of the calendar's
const windowedDli = (
  underArray: AccumulationResult,
  openSky: AccumulationResult,
  quality: RasterQuality,
  sampling: readonly TimeWindowSampling[],
  cells: number,
): DliRaster['windows'] =>
  sampling.map((window, w) => {
    const empty = new Float32Array(cells)
    const days = Math.max(1, window.dayCount)
    return {
      ...window,
      underArrayMolM2Day: dailyDli(
        underArray.windowWhPerM2[w] ?? empty,
        empty,
        quality.parFraction,
        days,
      ),
      openSkyMolM2Day: dailyDli(
        openSky.windowWhPerM2[w] ?? empty,
        empty,
        quality.parFraction,
        days,
      ),
    }
  })

export const dliRasterFromAccumulation = (
  grid: GridSpec,
  underArray: AccumulationResult,
  openSky: AccumulationResult,
  quality: RasterQuality,
  windows: readonly TimeWindowSampling[] = [],
): DliRaster => ({
  grid,
  skyViewFactor: underArray.skyViewFactor,
  annualUnderArrayMolM2Day: dailyDli(
    underArray.beamWhPerM2,
    underArray.diffuseWhPerM2,
    quality.parFraction,
    DAYS_PER_YEAR,
  ),
  annualOpenSkyMolM2Day: dailyDli(
    openSky.beamWhPerM2,
    openSky.diffuseWhPerM2,
    quality.parFraction,
    DAYS_PER_YEAR,
  ),
  monthlyUnderArrayMolM2Day: byMonth((month) =>
    dailyDli(
      underArray.monthlyBeamWhPerM2[month] ?? new Float32Array(grid.cols * grid.rows),
      underArray.monthlyDiffuseWhPerM2[month] ?? new Float32Array(grid.cols * grid.rows),
      quality.parFraction,
      DAYS_PER_MONTH[month] ?? 30,
    ),
  ),
  monthlyOpenSkyMolM2Day: byMonth((month) =>
    dailyDli(
      openSky.monthlyBeamWhPerM2[month] ?? new Float32Array(grid.cols * grid.rows),
      openSky.monthlyDiffuseWhPerM2[month] ?? new Float32Array(grid.cols * grid.rows),
      quality.parFraction,
      DAYS_PER_MONTH[month] ?? 30,
    ),
  ),
  windows: windowedDli(underArray, openSky, quality, windows, grid.cols * grid.rows),
  quality,
})

export const monthlyRsrRaster = (raster: DliRaster, monthIndex: number): Float32Array => {
  const under = monthValue(raster.monthlyUnderArrayMolM2Day, monthIndex)
  const open = monthValue(raster.monthlyOpenSkyMolM2Day, monthIndex)
  const out = new Float32Array(under.length)
  for (let i = 0; i < out.length; i += 1) {
    out[i] = relativeShadeRatio(at(under, i) as MolPerM2Day, at(open, i) as MolPerM2Day)
  }
  return out
}

const scaledByGain = (
  values: Float32Array,
  svf: Float32Array,
  groundAlbedo: Fraction,
  moduleReflectance: Fraction,
): Float32Array => {
  const out = new Float32Array(values.length)
  for (let i = 0; i < out.length; i += 1) {
    out[i] =
      at(values, i) * interreflectionGain(at(svf, i) as Fraction, groundAlbedo, moduleReflectance)
  }
  return out
}

export const applyInterreflection = (
  raster: DliRaster,
  groundAlbedo: Fraction,
  moduleUndersideReflectance: Fraction,
): DliRaster => {
  if (raster.quality.interreflectionApplied) return raster
  const apply = (values: Float32Array): Float32Array =>
    scaledByGain(values, raster.skyViewFactor, groundAlbedo, moduleUndersideReflectance)
  return {
    ...raster,
    annualUnderArrayMolM2Day: apply(raster.annualUnderArrayMolM2Day),
    monthlyUnderArrayMolM2Day: byMonth((month) =>
      apply(monthValue(raster.monthlyUnderArrayMolM2Day, month)),
    ),
    windows: raster.windows.map((window) => ({
      ...window,
      underArrayMolM2Day: apply(window.underArrayMolM2Day),
    })),
    quality: { ...raster.quality, interreflectionApplied: true },
  }
}

export const rasterTransferables = (raster: DliRaster): readonly ArrayBufferLike[] => [
  raster.skyViewFactor.buffer,
  raster.annualUnderArrayMolM2Day.buffer,
  raster.annualOpenSkyMolM2Day.buffer,
  ...raster.monthlyUnderArrayMolM2Day.map((values) => values.buffer),
  ...raster.monthlyOpenSkyMolM2Day.map((values) => values.buffer),
  ...raster.windows.flatMap((window) => [
    window.underArrayMolM2Day.buffer,
    window.openSkyMolM2Day.buffer,
  ]),
]
