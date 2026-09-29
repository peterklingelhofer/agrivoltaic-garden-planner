import { describe, expect, it, mock } from 'bun:test'
import { vi } from '../../test/vi'
import { standardOffsetHours } from '../sim/timezone'
import type { LatLon } from '../types/geo'

const fetchJson = vi.fn()

/* captured before the mock is installed, so the spread carries the real module */
const actualHttp = await import('./http')
mock.module('./http', () => ({ ...actualHttp, fetchJson }))

const { geocode, timezoneFor } = await import('./geocode')

const at = (latitudeDeg: number, longitudeDeg: number): LatLon =>
  ({ latitudeDeg, longitudeDeg }) as LatLon

describe('timezoneFor reads the nearest zone.tab city rather than rounding the longitude', () => {
  it('finds Nairobi, which longitude/15 used to round to UTC+2 (Nairobi is UTC+3)', () => {
    expect(timezoneFor(at(-1.29, 36.82))).toBe('Africa/Nairobi')
  })

  it('finds Sydney', () => {
    expect(timezoneFor(at(-33.87, 151.21))).toBe('Australia/Sydney')
  })

  it('finds Amherst MA', () => {
    expect(timezoneFor(at(42.37, -72.52))).toBe('America/New_York')
  })

  /*
   * zone.tab carries one point for the whole of India, Kolkata, in the country's far east.
   * Pakistan's one point (Karachi) sits 881 km from Mumbai while Kolkata sits 1660 km away, so by
   * distance alone Mumbai reads into Pakistan's zone, and Delhi into Nepal's. A geocoder names
   * the country, and within it the answer is the country's own zone
   */
  it("narrows to the country the geocoder named, which is what puts Mumbai in Kolkata's zone", () => {
    expect(timezoneFor(at(19.08, 72.88), 'IN')).toBe('Asia/Kolkata')
    expect(timezoneFor(at(19.08, 72.88), 'in')).toBe('Asia/Kolkata')
    expect(timezoneFor(at(28.61, 77.21), 'IN')).toBe('Asia/Kolkata')
    expect(timezoneFor(at(-31.95, 115.86), 'AU')).toBe('Australia/Perth')
    // a code zone.tab doesn't list falls back to every zone
    expect(timezoneFor(at(-1.29, 36.82), 'ZZ')).toBe('Africa/Nairobi')
  })

  it('reads the nearest zone of any country where none was named, and says so in the doc', () => {
    expect(timezoneFor(at(19.08, 72.88))).toBe('Asia/Karachi')
    expect(timezoneFor(at(22.57, 88.36))).toBe('Asia/Kolkata')
  })

  it('reads a standard offset through Intl, half-hour zones included', () => {
    expect(standardOffsetHours('Africa/Nairobi', 0)).toBe(3)
    expect(standardOffsetHours('Asia/Kolkata', 0)).toBe(5.5)
  })
})

const place = (displayName: string, lat: string, lon: string): unknown => ({
  display_name: displayName,
  lat,
  lon,
  address: { country_code: 'ke' },
})

/**
 * Nominatim answers a town's point and its boundary under the same display_name, with different
 * coordinates, so the second row reads as a place a visitor can't tell apart from the first
 */
describe('a search that answers the same place twice', () => {
  it('keeps only the first hit of a repeated label', async () => {
    fetchJson.mockResolvedValue([
      place('Nairobi, Nairobi County, Kenya', '-1.2833', '36.8167'),
      place('Nairobi, Nairobi County, Kenya', '-1.3', '36.75'),
    ])
    const hits = await geocode('Nairobi, Kenya', null)
    expect(hits).toHaveLength(1)
    expect(hits[0]?.location.latitudeDeg).toBe(-1.2833)
  })
})
