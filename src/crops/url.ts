import { DEFAULT_FROST_PERCENTILE } from '../data/site'
import { DEFAULT_SOIL } from '../data/static-layers'
import { clamp } from '../data/util'
import type { IrrigationMethod } from '../types/garden'
import type { LatLon } from '../types/geo'
import type { ExceedancePercentile } from '../types/site'
import { degreesLatitude, degreesLongitude } from '../types/units'
import { PERCENTILE_OPTIONS } from '../ui/calendar'
import { IRRIGATION_OPTIONS } from '../ui/irrigation-options'

/** The ranges the page's fields offer, which are also the only values a link may carry */
export const SHADE_MIN_PERCENT = 0
export const SHADE_MAX_PERCENT = 100
export const PH_MIN = 3
export const PH_MAX = 10

export interface FinderPlace {
  readonly location: LatLon
  readonly label: string
}

/** Everything the finder's answer depends on, which is everything a link to it has to carry */
export interface FinderState {
  readonly place: FinderPlace | null
  /** The share of full sun the ground loses to shade over the season, in percent */
  readonly shadePercent: number
  readonly phUnits: number
  /** Off, the soil map's reading for the place stands in for the typed pH */
  readonly ownPh: boolean
  readonly irrigation: IrrigationMethod
  readonly frostPercentile: ExceedancePercentile
}

export const FINDER_DEFAULTS: FinderState = {
  place: null,
  shadePercent: 0,
  phUnits: DEFAULT_SOIL.phUnits,
  ownPh: true,
  irrigation: 'drip',
  frostPercentile: DEFAULT_FROST_PERCENTILE,
}

const METHODS: readonly string[] = IRRIGATION_OPTIONS.map(([method]) => method)
const PERCENTILES: readonly number[] = PERCENTILE_OPTIONS.map(([key]) => Number(key))

/** A number inside the range, or null for anything else: missing, blank, text or out of range */
const numberIn = (raw: string | null, min: number, max: number): number | null => {
  if (raw === null || raw.trim() === '') return null
  const value = Number(raw)
  return Number.isFinite(value) && value >= min && value <= max ? value : null
}

/** What a place typed in as coordinates is called, the way the planner names one */
const coordinateLabel = (latitude: number, longitude: number): string =>
  `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`

/**
 * The finder's state from a query string. Every field is optional and a value that can't be read
 * is ignored, so a hand-edited or truncated link still opens, on the defaults for whatever it lost
 */
export const readFinderState = (search: string): FinderState => {
  const params = new URLSearchParams(search)
  const latitude = numberIn(params.get('lat'), -90, 90)
  const longitude = numberIn(params.get('lon'), -180, 180)
  const label = params.get('label')?.trim() ?? ''
  const shade = numberIn(params.get('shade'), SHADE_MIN_PERCENT, SHADE_MAX_PERCENT)
  const ph = numberIn(params.get('ph'), PH_MIN, PH_MAX)
  const own = params.get('own')
  const water = params.get('water')
  const frost = Number(params.get('frost'))
  return {
    place:
      latitude === null || longitude === null
        ? null
        : {
            location: {
              latitudeDeg: degreesLatitude(latitude),
              longitudeDeg: degreesLongitude(longitude),
            },
            label: label === '' ? coordinateLabel(latitude, longitude) : label,
          },
    shadePercent: shade ?? FINDER_DEFAULTS.shadePercent,
    phUnits: ph ?? FINDER_DEFAULTS.phUnits,
    ownPh: own === '1' ? true : own === '0' ? false : FINDER_DEFAULTS.ownPh,
    irrigation:
      water !== null && METHODS.includes(water)
        ? (water as IrrigationMethod)
        : FINDER_DEFAULTS.irrigation,
    frostPercentile: PERCENTILES.includes(frost)
      ? (frost as ExceedancePercentile)
      : FINDER_DEFAULTS.frostPercentile,
  }
}

/**
 * The query string for a state, with the leading "?", or empty when nothing differs from the
 * defaults. A field at its default is left out, so a fresh visit keeps a bare address. The shade
 * and pH are held to the fields' ranges, the same values the ranking is run on
 */
export const writeFinderState = (state: FinderState): string => {
  const params = new URLSearchParams()
  if (state.place !== null) {
    params.set('lat', state.place.location.latitudeDeg.toFixed(4))
    params.set('lon', state.place.location.longitudeDeg.toFixed(4))
    params.set('label', state.place.label)
  }
  const shade = clamp(state.shadePercent, SHADE_MIN_PERCENT, SHADE_MAX_PERCENT)
  if (shade !== FINDER_DEFAULTS.shadePercent) params.set('shade', String(shade))
  const ph = clamp(state.phUnits, PH_MIN, PH_MAX)
  if (ph !== FINDER_DEFAULTS.phUnits) params.set('ph', String(ph))
  if (state.ownPh !== FINDER_DEFAULTS.ownPh) params.set('own', state.ownPh ? '1' : '0')
  if (state.irrigation !== FINDER_DEFAULTS.irrigation) params.set('water', state.irrigation)
  if (state.frostPercentile !== FINDER_DEFAULTS.frostPercentile) {
    params.set('frost', String(state.frostPercentile))
  }
  const query = params.toString()
  return query === '' ? '' : `?${query}`
}
