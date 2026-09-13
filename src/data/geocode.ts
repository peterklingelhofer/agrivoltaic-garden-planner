import type { LatLon } from '../types/geo'
import type { DegreesLatitude, DegreesLongitude, Meters } from '../types/units'
import { DEFAULT_FETCH_OPTIONS, fetchJson } from './http'

export interface GeocodeHit {
  readonly label: string
  readonly location: LatLon
  readonly countryCode: string
  readonly attribution: string
}

export const NOMINATIM_ATTRIBUTION = 'Data (c) OpenStreetMap contributors, ODbL 1.0'
export const PHOTON_ATTRIBUTION = 'Photon by Komoot, data (c) OpenStreetMap contributors, ODbL 1.0'
export const OPEN_ELEVATION_ATTRIBUTION = 'Open-Elevation, SRTM/ASTER derived'

const latLon = (latitude: number, longitude: number): LatLon => ({
  latitudeDeg: latitude as DegreesLatitude,
  longitudeDeg: longitude as DegreesLongitude,
})

interface NominatimPlace {
  readonly display_name?: string
  readonly lat?: string
  readonly lon?: string
  readonly address?: { readonly country_code?: string }
}

interface PhotonFeature {
  readonly geometry?: { readonly coordinates?: readonly number[] }
  readonly properties?: {
    readonly name?: string
    readonly city?: string
    readonly state?: string
    readonly country?: string
    readonly countrycode?: string
  }
}

const finite = (raw: unknown, limitDeg: number): number | null => {
  if (typeof raw !== 'number' && (typeof raw !== 'string' || raw.trim().length === 0)) return null
  const value = Number(raw)
  return Number.isFinite(value) && Math.abs(value) <= limitDeg ? value : null
}

/** A result with no usable coordinates is dropped, never placed at 0, 0 in the Gulf of Guinea */
const locationOf = (latitude: unknown, longitude: unknown): LatLon | null => {
  const lat = finite(latitude, 90)
  const lon = finite(longitude, 180)
  return lat === null || lon === null ? null : latLon(lat, lon)
}

export const unusableGeocode = (upstream: string, count: number): Error =>
  new Error(
    `${upstream} returned ${String(count)} result${count === 1 ? '' : 's'} with no usable coordinates; a geocode result needs a numeric latitude and longitude, and is never placed at 0, 0`,
  )

const fromNominatim = (place: NominatimPlace): GeocodeHit | null => {
  const location = locationOf(place.lat, place.lon)
  if (location === null) return null
  return {
    label: place.display_name ?? 'unknown',
    location,
    countryCode: (place.address?.country_code ?? '').toUpperCase(),
    attribution: NOMINATIM_ATTRIBUTION,
  }
}

const fromPhoton = (feature: PhotonFeature): GeocodeHit | null => {
  const coordinates = feature.geometry?.coordinates ?? []
  const location = locationOf(coordinates[1], coordinates[0])
  if (location === null) return null
  const properties = feature.properties ?? {}
  const parts = [properties.name, properties.city, properties.state, properties.country].filter(
    (part): part is string => typeof part === 'string' && part.length > 0,
  )
  return {
    label: parts.join(', '),
    location,
    countryCode: (properties.countrycode ?? '').toUpperCase(),
    attribution: PHOTON_ATTRIBUTION,
  }
}

const usable = (hits: readonly (GeocodeHit | null)[]): readonly GeocodeHit[] =>
  hits.filter((hit): hit is GeocodeHit => hit !== null)

/**
 * How far around the current place a search leans, in degrees: about the size of New England,
 * so "Amherst" typed in Massachusetts lists the one in Massachusetts first and the six others
 * after it, and a place typed from the other coast still comes up
 */
const BIAS_HALF_WIDTH_DEG = 3

/** A tenth of a degree, so a town's visitors share one cached answer (the proxy keys on this) */
const coarse = (value: number): string => value.toFixed(1)

export const geocode = async (
  query: string,
  signal: AbortSignal | null,
  near: LatLon | null = null,
): Promise<readonly GeocodeHit[]> => {
  const options = { ...DEFAULT_FETCH_OPTIONS, signal }
  const params = new URLSearchParams({
    q: query,
    format: 'jsonv2',
    limit: '8',
    addressdetails: '1',
  })
  // a preference and never a fence: Nominatim's `viewbox` without `bounded` ranks what is
  // inside it first, and Photon's `lat`/`lon` do the same by distance
  if (near !== null) {
    const lat = Number(coarse(near.latitudeDeg))
    const lon = Number(coarse(near.longitudeDeg))
    params.set(
      'viewbox',
      [
        lon - BIAS_HALF_WIDTH_DEG,
        lat - BIAS_HALF_WIDTH_DEG,
        lon + BIAS_HALF_WIDTH_DEG,
        lat + BIAS_HALF_WIDTH_DEG,
      ]
        .map(coarse)
        .join(','),
    )
  }
  let rejected: readonly [string, number] | null = null
  try {
    const places = await fetchJson<readonly NominatimPlace[]>(
      'nominatim',
      '/search',
      params,
      options,
    )
    const hits = usable(places.map(fromNominatim))
    if (hits.length > 0) return hits
    if (places.length > 0) rejected = ['Nominatim', places.length]
  } catch {
    // fall through to Photon
  }
  const photonParams = new URLSearchParams({ q: query, limit: '8' })
  if (near !== null) {
    photonParams.set('lat', coarse(near.latitudeDeg))
    photonParams.set('lon', coarse(near.longitudeDeg))
  }
  const body = await fetchJson<{ readonly features?: readonly PhotonFeature[] }>(
    'photon',
    '/api',
    photonParams,
    options,
  )
  const features = body.features ?? []
  const hits = usable(features.map(fromPhoton))
  if (hits.length > 0) return hits
  if (features.length > 0) rejected = ['Photon', features.length]
  // an empty search is a real answer; results that named no place are not
  if (rejected !== null) throw unusableGeocode(rejected[0], rejected[1])
  return hits
}

export const reverseGeocode = async (
  location: LatLon,
  signal: AbortSignal | null,
): Promise<GeocodeHit> => {
  const place = await fetchJson<NominatimPlace>(
    'nominatim',
    '/reverse',
    new URLSearchParams({
      lat: String(location.latitudeDeg),
      lon: String(location.longitudeDeg),
      format: 'jsonv2',
      addressdetails: '1',
    }),
    { ...DEFAULT_FETCH_OPTIONS, signal },
  )
  const hit = fromNominatim(place)
  if (hit === null) throw unusableGeocode('Nominatim', 1)
  return hit
}

export const ELEVATION_UNKNOWN =
  'Open-Elevation returned no elevation for this location. The elevation is unknown, and the solar position falls back to the sea-level reference'

/** null, not 0: 0 m is a real elevation, and sea level is not what an empty lookup means */
export const elevation = async (
  location: LatLon,
  signal: AbortSignal | null,
): Promise<Meters | null> => {
  const body = await fetchJson<{ readonly results?: readonly { readonly elevation?: number }[] }>(
    'open-elevation',
    '/api/v1/lookup',
    new URLSearchParams({
      locations: `${String(location.latitudeDeg)},${String(location.longitudeDeg)}`,
    }),
    { ...DEFAULT_FETCH_OPTIONS, signal },
  )
  const value = (body.results ?? [])[0]?.elevation
  return typeof value === 'number' && Number.isFinite(value) ? (value as Meters) : null
}

/**
 * The fallback clock, whole hours from the longitude: wrong by half an hour in India, by a zone
 * across Spain, France and western China, and blind to daylight saving. `resolveSite` replaces
 * both with the IANA zone the daily normals name; these stand only where no zone is known
 */
export const utcOffsetHoursFor = (location: LatLon): number =>
  Math.round(location.longitudeDeg / 15)

export const timezoneFor = (location: LatLon): string => {
  const offset = utcOffsetHoursFor(location)
  if (offset === 0) return 'Etc/GMT'
  return `Etc/GMT${offset > 0 ? '-' : '+'}${String(Math.abs(offset))}`
}
