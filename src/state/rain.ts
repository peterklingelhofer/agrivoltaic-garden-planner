import { rainField, rainHourWindMS } from '../recommend/rain'
import type { GardenPlot } from '../types/garden'
import type { RainField } from '../types/water'
import type { TmySeries } from '../types/weather'

let lastPlot: GardenPlot | null = null
let lastWeather: TmySeries | null = null
let lastField: RainField | null = null

/**
 * The plot's rain field, cached on the identity of the last (plot, weather) pair so the ground
 * overlay, its legend, the water balance and the bed panel share one computation instead of
 * walking the same panel geometry four times over in a single render
 */
export const rainFieldOf = (
  plot: GardenPlot | null,
  weather: TmySeries | null,
): RainField | null => {
  if (plot === null) return null
  if (plot === lastPlot && weather === lastWeather) return lastField
  const field = rainField(plot, weather === null ? 0 : rainHourWindMS(weather))
  lastPlot = plot
  lastWeather = weather
  lastField = field
  return field
}
