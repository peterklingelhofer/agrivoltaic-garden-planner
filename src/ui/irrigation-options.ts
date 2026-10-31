import type { IrrigationMethod } from '../types/garden'

/** The watering methods a select offers, in the words the bed panel has always used */
export const IRRIGATION_OPTIONS: readonly (readonly [IrrigationMethod, string])[] = [
  ['none', 'None'],
  ['hand', 'Hand'],
  ['sprinkler', 'Sprinkler'],
  ['drip', 'Drip'],
  ['subsurface-drip', 'Subsurface drip'],
  ['flood', 'Flood'],
]
