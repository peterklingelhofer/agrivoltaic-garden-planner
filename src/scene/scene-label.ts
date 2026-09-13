import { extentOf, extentSize } from '../state/geom'
import type { GardenPlot } from '../types/garden'

const count = (n: number, one: string, many: string): string =>
  `${String(n)} ${n === 1 ? one : many}`

const tenth = (value: number): string => String(Math.round(value * 10) / 10)

/** What the canvas draws, in plain words, for whoever cannot see it: `CanvasLabel` writes it */
export const sceneLabel = (plot: GardenPlot | null): string => {
  if (plot === null) return '3D view of the garden: no plot drawn yet'
  const [widthM, depthM] = extentSize(extentOf([plot.boundary.exterior]))
  const rows = plot.arrays.reduce((sum, array) => sum + array.geometry.rowCount, 0)
  const size = `${tenth(widthM)} by ${tenth(depthM)} m plot`
  const beds = count(plot.beds.length, 'bed', 'beds')
  return `3D view of the garden: ${size}, ${beds}, ${count(rows, 'row of panels', 'rows of panels')}`
}
