import type { LengthUnit } from '../state/slices'
import { useAppStore } from '../state/store'
import { feetToMeters, metersToFeet, roundTenth } from './onboarding'

/**
 * The unit every length field reads and writes in, saved with the design. One selector, so a
 * field that needs it doesn't have to remember the key it lives under
 */
export const useLengthUnit = (): LengthUnit => useAppStore((s) => s.lengthUnit)

/**
 * This field's own metric step, unchanged, or half a foot: PlotSizeSection's own foot step, which
 * a switch to feet asks for every field here, since none of them converts to a foot size fine
 * enough for half a foot to block reaching it. `metricStep` is required and never defaulted, so a
 * field keeps exactly the step it had before this switch existed
 */
export const lengthStep = (unit: LengthUnit, metricStep: number): number =>
  unit === 'm' ? metricStep : 0.5

/**
 * A meters value, shown the way this field always showed one in meters, or converted and rounded
 * to a tenth of a foot. `metricRound` is the field's own existing rounding function, taken as a
 * parameter and never assumed, so a switch to feet and back never coarsens what meters already
 * showed
 */
export const showLength = (
  valueM: number,
  unit: LengthUnit,
  metricRound: (value: number) => number,
): number => (unit === 'm' ? metricRound(valueM) : roundTenth(metersToFeet(valueM)))

/** What was typed, read back into meters */
export const toMeters = (value: number, unit: LengthUnit): number =>
  unit === 'm' ? value : feetToMeters(value)

/** A meters floor or ceiling, converted so a field's `min` or `max` reads true in both units */
export const showLimit = (limitM: number, unit: LengthUnit): number =>
  unit === 'm' ? limitM : roundTenth(metersToFeet(limitM))
