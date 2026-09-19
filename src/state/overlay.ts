import { MONTH_LENGTH_DAYS, monthsInWindow } from '../data/util'
import { MONTH_LABELS } from '../ui/format'
import type { GridSpec } from '../types/geo'
import type { DliRaster } from '../types/light'
import type { MonthIndex } from '../types/units'
import type { RainField } from '../types/water'
import type { OverlayChannel, OverlayPlayback, OverlaySlice, SidebarStep } from './slices'

/**
 * Whether the ground is left uncolored, which the scene and the color key have to agree on.
 *
 * The seasons step stops drawing the overlay so the plants the season is about are visible. The key
 * over the canvas is a separate component in a separate file, and left to itself it would go on
 * showing the daily light integral scale over flat green ground. One predicate, read by both, is
 * what stops them drifting apart.
 *
 * Overridden by the grower's own choice: `overlayOnSeasons` is the seasons step's own toggle for
 * bringing the colors back over the plants they were hidden for
 */
export const overlayOffOnSeasons = (state: {
  readonly sidebarStep: SidebarStep
  readonly overlayOnSeasons?: boolean
}): boolean => state.sidebarStep === 'seasons' && !state.overlayOnSeasons

export interface OverlayField {
  readonly values: Float32Array | null
  /** The grid `values` is laid out over: the raster's for every channel but `rain`, which bakes none */
  readonly grid: GridSpec | null
  readonly min: number
  readonly max: number
  readonly unit: string
  readonly label: string
  readonly note: string | null
  /** "March to July" while accumulating, null otherwise. The one place that span is worded */
  readonly span: string | null
}

const monthly = (series: readonly Float32Array[], slice: OverlaySlice): Float32Array | null =>
  slice === 'annual' ? null : (series[slice - 1] ?? null)

const rsrOf = (under: Float32Array, open: Float32Array): Float32Array => {
  const out = new Float32Array(under.length)
  for (let i = 0; i < under.length; i += 1) {
    const openValue = open[i] ?? 0
    const underValue = under[i] ?? 0
    out[i] = openValue > 0 ? Math.max(0, Math.min(1, 1 - underValue / openValue)) : 0
  }
  return out
}

const maxOf = (values: Float32Array): number => {
  let max = 0
  for (let i = 0; i < values.length; i += 1) max = Math.max(max, values[i] ?? 0)
  return max
}

const maxOverMonths = (series: readonly Float32Array[]): number => {
  let max = 0
  for (const values of series) max = Math.max(max, maxOf(values))
  return max
}

/**
 * The mean of a monthly series over the given months, weighted by each month's length in days.
 * DLI is a daily RATE, so a plain mean of the elapsed slices would silently
 * over-weight February against July. Weighting by days is what makes the last frame of a full
 * year, all twelve months from January, equal the raster's own independently-computed annual mean
 */
const weightedMeanMonthly = (
  series: readonly Float32Array[],
  months: readonly MonthIndex[],
): Float32Array | null => {
  const weighted: { readonly values: Float32Array; readonly days: number }[] = []
  let totalDays = 0
  for (const month of months) {
    const values = series[month - 1]
    if (!values) return null
    const days = MONTH_LENGTH_DAYS[month - 1] ?? 30
    totalDays += days
    weighted.push({ values, days })
  }
  const first = weighted[0]
  if (!first || totalDays === 0) return null
  const out = new Float32Array(first.values.length)
  // the running sum is a plain number rather than a slot in `out`, so twelve months accumulate in
  // double precision and only the finished mean is rounded to float32. Summing into the
  // Float32Array instead rounds twelve times, and it's the difference between agreeing with the
  // raster's own annual field bit for bit and agreeing with it to about a part in a million
  for (let i = 0; i < out.length; i += 1) {
    let total = 0
    for (const { values, days } of weighted) total += days * (values[i] ?? 0)
    out[i] = total / totalDays
  }
  return out
}

/** "March" for one month, "March to July" for a span. The wrap already lives in monthsInWindow */
const spanLabel = (months: readonly MonthIndex[]): string => {
  const start = MONTH_LABELS[(months[0] ?? 1) - 1] ?? ''
  const last = months[months.length - 1] ?? months[0] ?? 1
  return months.length <= 1 ? start : `${start} to ${MONTH_LABELS[last - 1] ?? ''}`
}

/**
 * The rain channel's color domain, fixed at twice open ground. Scaled to the data, the ramp would
 * run to the drip strips' peak, nine times open ground on the starting plot in a 3 m/s wind and
 * seventeen in still air, and sheltered ground and open ground would be two neighboring shades of
 * purple: the distinction the channel exists to draw. At two, sheltered is dark, open is the middle
 * of the ramp and every strip saturates to yellow, and the note says the strips run past
 */
const RAIN_OVERLAY_MAX = 2

// One definition of the raster channel so the ground overlay and the legend can't disagree
export const overlayField = (
  raster: DliRaster | null,
  channel: OverlayChannel,
  slice: OverlaySlice,
  playback: OverlayPlayback | null = null,
  rain: RainField | null = null,
): OverlayField => {
  const empty = { values: null, min: 0, max: 1, note: null, span: null, grid: raster?.grid ?? null }
  if (channel === 'rain') {
    return {
      ...empty,
      values: rain?.values ?? null,
      grid: rain?.grid ?? null,
      unit: '',
      label: 'Rain reaching the ground, as a multiple of open ground',
      note:
        rain?.wind.directed === true
          ? "The strips are where rain running off the panels lands, moved hour by hour by this site's wind when it rains"
          : "The strips are where rain running off the panels lands. They're widened by this site's mean wind in rain hours, since the record carries no wind direction",
      max: RAIN_OVERLAY_MAX,
    }
  }
  if (channel === 'sky-view-factor') {
    return {
      ...empty,
      values: raster?.skyViewFactor ?? null,
      unit: '',
      label: 'Sky view factor',
      note: null,
    }
  }

  // Accumulation needs a single drawn month to count forward from: the annual mean already IS
  // the whole year, so `from` has nothing to add to it
  const months =
    playback?.from != null && typeof slice === 'number'
      ? (monthsInWindow(playback.from, slice) as readonly MonthIndex[])
      : null
  const span = months ? spanLabel(months) : null

  if (channel === 'rsr') {
    const under = months
      ? raster && weightedMeanMonthly(raster.monthlyUnderArrayMolM2Day, months)
      : (monthly(raster?.monthlyUnderArrayMolM2Day ?? [], slice) ??
        raster?.annualUnderArrayMolM2Day ??
        null)
    const open = months
      ? raster && weightedMeanMonthly(raster.monthlyOpenSkyMolM2Day, months)
      : (monthly(raster?.monthlyOpenSkyMolM2Day ?? [], slice) ??
        raster?.annualOpenSkyMolM2Day ??
        null)
    return {
      ...empty,
      values: under && open ? rsrOf(under, open) : null,
      unit: '',
      label: span ? `Relative shade ratio, ${span}` : 'Relative shade ratio',
      note: 'RSR is the share of full-sun light the panels block. The yield estimates use it over the whole season',
      span,
    }
  }

  const values = months
    ? raster && weightedMeanMonthly(raster.monthlyUnderArrayMolM2Day, months)
    : (monthly(raster?.monthlyUnderArrayMolM2Day ?? [], slice) ??
      raster?.annualUnderArrayMolM2Day ??
      null)

  // Playing or not, `max` must come from the same twelve months every frame once playback has
  // started: reading it off whichever slice is drawn would rescale the ramp on every tick, and a
  // rescaling ramp reads as "nothing happened" while a fixed one reads as the ground dimming
  const max = playback
    ? Math.max(1, raster ? maxOverMonths(raster.monthlyUnderArrayMolM2Day) : 0)
    : Math.max(1, values ? maxOf(values) : 0)

  return {
    values,
    grid: raster?.grid ?? null,
    min: 0,
    max,
    unit: 'mol/m²/d',
    // the period in the label, because the bed table on the light step reads April to September and
    // without the period a bed can seem to get more than the map's top number
    label: span
      ? `Mean daily light integral, ${span}`
      : slice === 'annual'
        ? 'Daily light integral, whole-year average'
        : 'Daily light integral',
    note: span
      ? 'Each month elapsed is weighted by its own length in days before being averaged into this figure'
      : null,
    span,
  }
}
