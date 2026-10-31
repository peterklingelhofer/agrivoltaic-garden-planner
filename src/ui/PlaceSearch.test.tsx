import { act } from 'react'
import { afterEach, beforeEach, expect, it, mock } from 'bun:test'
import { vi } from '../../test/vi'
import type { GeocodeHit } from '../data/geocode'
import type { LatLon } from '../types/geo'
import { degreesLatitude, degreesLongitude } from '../types/units'
import { PlaceSearch } from './PlaceSearch'
import { mount } from './testkit'

const place = (latitude: number, longitude: number): LatLon => ({
  latitudeDeg: degreesLatitude(latitude),
  longitudeDeg: degreesLongitude(longitude),
})

const hit = (label: string, location: LatLon): GeocodeHit => ({
  label,
  location,
  countryCode: 'US',
  attribution: 'Data (c) OpenStreetMap contributors, ODbL 1.0',
})

const AMHERST = place(42.3732, -72.5199)
const FIRST = hit('Springfield, Massachusetts', place(42.1015, -72.5898))
const HITS: readonly GeocodeHit[] = [FIRST, hit('Springfield, Illinois', place(39.7817, -89.6501))]

const geocode = vi.fn()

/* captured before the mock is installed, so the spread carries the real module */
const actualGeocode = await import('../data/geocode')
mock.module('../data/geocode', () => ({ ...actualGeocode, geocode }))

beforeEach(() => {
  vi.useFakeTimers()
  geocode.mockReset()
  geocode.mockResolvedValue(HITS)
})

afterEach(() => {
  vi.useRealTimers()
})

/**
 * The component reads no store, so everything it needs comes in as a prop and everything it
 * decides goes out through `onPick`: the place to search near reaches the geocoder, the pick
 * reaches the caller untouched, and the line under the field names a pick only after one is made
 */
it("searches near the place it's given, hands the picked result to its caller and names it", async () => {
  const onPick = vi.fn()
  const harness = await mount(
    <PlaceSearch near={AMHERST} resolvedLabel="Amherst, Massachusetts" onPick={onPick} />,
  )
  // the place the caller already resolved is named, and nothing counts as selected yet
  expect(harness.get('readout-site-place').textContent).toBe('Amherst, Massachusetts · Change')
  expect(harness.find('readout-site-selection')).toBeNull()

  await harness.type('control-site-search', 'Springfield')
  await harness.click('action-site-search')
  await act(async () => {
    await vi.advanceTimersByTimeAsync(2000)
  })
  expect(geocode).toHaveBeenCalledWith('Springfield', null, AMHERST)

  await harness.click(`item-site-result-${FIRST.label}`)
  expect(onPick).toHaveBeenCalledTimes(1)
  expect(onPick).toHaveBeenCalledWith(FIRST)
  expect(harness.find('list-site-results')).toBeNull()
  expect(harness.get('readout-site-selection').textContent).toBe(
    'Springfield, Massachusetts · Change',
  )
  expect(harness.get('readout-site-label').textContent).toBe(FIRST.label)
  expect(harness.find('readout-site-place')).toBeNull()
  await harness.unmount()
})
