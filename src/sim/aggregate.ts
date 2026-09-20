import type { Polygon2D, Vec2M } from '../types/geo'
import type { BedId } from '../types/ids'
import type {
  BedLight,
  DliRaster,
  GrowingWindow,
  LightHomogeneity,
  SeasonLight,
} from '../types/light'
import type { Fraction, Meters, MolPerM2Day } from '../types/units'
import { at, clamp } from './math'
import { pointInPolygon } from './shading'
import { byMonth, monthValue, relativeShadeRatio } from './units'

/**
 * The layout search's slide (`slideBeds` in `src/recommend/layout.ts`) reads a bed's light at every
 * step across the room it has, and a full scan of a 30 by 20 m plot at 0.12 m is forty thousand
 * tests per read. A cell whose center falls outside the footprint's own bounding box can't be
 * inside the footprint, so only the rows and columns whose cell centers can reach that box are ever
 * tested, clamped to the grid for a footprint that hangs off its edge or stands wholly outside it
 */
export const cellIndicesInPolygon = (raster: DliRaster, footprint: Polygon2D): Uint32Array => {
  const { extent, cellSizeM, cols, rows } = raster.grid
  let minX = Infinity
  let maxX = -Infinity
  let minY = Infinity
  let maxY = -Infinity
  for (const point of footprint.exterior) {
    minX = Math.min(minX, point.xM)
    maxX = Math.max(maxX, point.xM)
    minY = Math.min(minY, point.yM)
    maxY = Math.max(maxY, point.yM)
  }
  const colStart = clamp(Math.floor((minX - extent.minXM) / cellSizeM - 0.5), 0, cols - 1)
  const colEnd = clamp(Math.ceil((maxX - extent.minXM) / cellSizeM - 0.5), 0, cols - 1)
  const rowStart = clamp(Math.floor((minY - extent.minYM) / cellSizeM - 0.5), 0, rows - 1)
  const rowEnd = clamp(Math.ceil((maxY - extent.minYM) / cellSizeM - 0.5), 0, rows - 1)
  const indices: number[] = []
  for (let row = rowStart; row <= rowEnd; row += 1) {
    const yM = (extent.minYM + (row + 0.5) * cellSizeM) as Meters
    for (let col = colStart; col <= colEnd; col += 1) {
      const point: Vec2M = { xM: (extent.minXM + (col + 0.5) * cellSizeM) as Meters, yM }
      if (pointInPolygon(point, footprint)) indices.push(row * cols + col)
    }
  }
  return Uint32Array.from(indices)
}

const gather = (values: Float32Array, indices: Uint32Array): Float32Array => {
  const out = new Float32Array(indices.length)
  for (let i = 0; i < indices.length; i += 1) out[i] = at(values, at(indices, i))
  return out
}

const meanOf = (values: Float32Array): number => {
  if (values.length === 0) return 0
  let total = 0
  for (let i = 0; i < values.length; i += 1) total += at(values, i)
  return total / values.length
}

const minOf = (values: Float32Array): number => {
  if (values.length === 0) return 0
  let smallest = Infinity
  for (let i = 0; i < values.length; i += 1) smallest = Math.min(smallest, at(values, i))
  return smallest
}

export const homogeneity = (values: Float32Array): LightHomogeneity => {
  const average = meanOf(values)
  if (values.length === 0 || average <= 0) {
    return { coefficientOfVariation: 0 as Fraction, minOverMean: 0 as Fraction }
  }
  let variance = 0
  for (let i = 0; i < values.length; i += 1) variance += (at(values, i) - average) ** 2
  return {
    coefficientOfVariation: (Math.sqrt(variance / values.length) / average) as Fraction,
    minOverMean: clamp(minOf(values) / average, 0, 1) as Fraction,
  }
}

export const bedLight = (raster: DliRaster, bedId: BedId, footprint: Polygon2D): BedLight => {
  const indices = cellIndicesInPolygon(raster, footprint)
  const monthlyUnder = byMonth((month) =>
    gather(monthValue(raster.monthlyUnderArrayMolM2Day, month), indices),
  )
  const monthlyOpen = byMonth((month) =>
    gather(monthValue(raster.monthlyOpenSkyMolM2Day, month), indices),
  )
  const annualUnder = gather(raster.annualUnderArrayMolM2Day, indices)
  return {
    bedId,
    cellCount: indices.length,
    monthlyMeanDliMolM2Day: byMonth(
      (month) => meanOf(monthValue(monthlyUnder, month)) as MolPerM2Day,
    ),
    monthlyMinDliMolM2Day: byMonth(
      (month) => minOf(monthValue(monthlyUnder, month)) as MolPerM2Day,
    ),
    monthlyOpenSkyDliMolM2Day: byMonth(
      (month) => meanOf(monthValue(monthlyOpen, month)) as MolPerM2Day,
    ),
    monthlyRsr: byMonth((month) =>
      relativeShadeRatio(
        meanOf(monthValue(monthlyUnder, month)) as MolPerM2Day,
        meanOf(monthValue(monthlyOpen, month)) as MolPerM2Day,
      ),
    ),
    annualMeanDliMolM2Day: meanOf(annualUnder) as MolPerM2Day,
    skyViewFactor: clamp(meanOf(gather(raster.skyViewFactor, indices)), 0, 1) as Fraction,
    homogeneity: homogeneity(annualUnder),
    quality: raster.quality,
  }
}

// inclusive month span. A window that wraps the new year (start > end) runs through December
export const monthsInWindow = (window: GrowingWindow): number[] => {
  const start = clamp(Math.trunc(window.startMonth), 1, 12)
  const end = clamp(Math.trunc(window.endMonth), 1, 12)
  const months: number[] = []
  for (let month = start; ; month = (month % 12) + 1) {
    months.push(month - 1)
    if (month === end) break
  }
  return months
}

export const DAYS_PER_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31] as const

export const seasonLight = (
  light: BedLight,
  window: GrowingWindow,
  disorderCeiling: MolPerM2Day | null,
): SeasonLight => {
  const months = monthsInWindow(window)
  let weightedUnder = 0
  let weightedOpen = 0
  let days = 0
  let daysAboveDisorderCeiling = 0
  let smallest = Infinity
  let largest = -Infinity
  for (const month of months) {
    const monthDays = DAYS_PER_MONTH[month] ?? 30
    const under = monthValue(light.monthlyMeanDliMolM2Day, month) as number
    weightedUnder += under * monthDays
    weightedOpen += (monthValue(light.monthlyOpenSkyDliMolM2Day, month) as number) * monthDays
    days += monthDays
    smallest = Math.min(smallest, under)
    largest = Math.max(largest, under)
    if (disorderCeiling !== null && under > disorderCeiling) daysAboveDisorderCeiling += monthDays
  }
  const meanUnder = days > 0 ? weightedUnder / days : 0
  const meanOpen = days > 0 ? weightedOpen / days : 0
  return {
    bedId: light.bedId,
    window,
    meanDliMolM2Day: meanUnder as MolPerM2Day,
    minMonthlyDliMolM2Day: (smallest === Infinity ? 0 : smallest) as MolPerM2Day,
    maxMonthlyDliMolM2Day: (largest === -Infinity ? 0 : largest) as MolPerM2Day,
    // RSR is season-cumulative, one ratio for the whole season (Decision Record section 6)
    cumulativeRsr: relativeShadeRatio(meanUnder as MolPerM2Day, meanOpen as MolPerM2Day),
    daysAboveDisorderCeiling,
  }
}
