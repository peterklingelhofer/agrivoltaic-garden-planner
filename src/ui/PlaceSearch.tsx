import { useCallback, useEffect, useRef, useState, type ReactElement } from 'react'
import { type GeocodeHit, reverseGeocode } from '../data/geocode'
import type { LatLon } from '../types/geo'
import { degreesLatitude, degreesLongitude } from '../types/units'
import { Action, TextField } from './controls'
import { Picker, type PickerHandle } from './Picker'
import { splitLabel } from './place-label'
import { useAddressSearch } from './useAddressSearch'

const RESULTS_ID = 'site-search-results'
/** Firefox on a phone can wait on a satellite fix past any patience, a network fix comes in seconds */
const GEOLOCATION_TIMEOUT_MS = 15_000
const GEOLOCATION_MAX_AGE_MS = 600_000

export interface PlaceSearchProps {
  /** The place results are listed nearest to first, when one is known */
  readonly near: LatLon | null
  /** The place already resolved, named on the line under the field when nothing was chosen this visit */
  readonly resolvedLabel: string | null
  /** Choosing a result, or the device's position, IS looking the place up: the caller resolves it */
  onPick(hit: GeocodeHit): void
}

/**
 * The search for a place: the field, the press that runs it, the device's own position, the
 * results and the line that names the place. It reads no store, so a page without one can mount
 * it, and the caller decides what a pick does
 */
export const PlaceSearch = ({ near, resolvedLabel, onPick }: PlaceSearchProps): ReactElement => {
  const [chosen, setChosen] = useState<GeocodeHit | null>(null)
  const searchInput = useRef<HTMLInputElement | null>(null)
  const picker = useRef<PickerHandle | null>(null)
  const {
    query,
    hits,
    error: searchError,
    searching,
    activeIndex,
    setQuery,
    setActiveIndex,
    search,
    dismiss,
    clear,
  } = useAddressSearch(searchInput, near)
  // whether the browser refused a location, its own notice and never the search's
  const [geoBlocked, setGeoBlocked] = useState(false)
  // hidden, since a permission already denied isn't worth a press
  const [geoOffered, setGeoOffered] = useState(true)
  // the press is answered while the browser looks: a phone can take seconds to find itself
  const [locating, setLocating] = useState(false)

  useEffect(() => {
    if (typeof navigator === 'undefined' || !navigator.permissions?.query) return
    navigator.permissions
      .query({ name: 'geolocation' })
      .then((status) => {
        if (status.state === 'denied') setGeoOffered(false)
      })
      .catch(() => undefined)
  }, [])

  /**
   * Selecting a result IS resolving the site: writing the coordinates and waiting for a second
   * button would make a click read as doing nothing
   */
  const choose = useCallback(
    (hit: GeocodeHit): void => {
      setChosen(hit)
      clear()
      onPick(hit)
    },
    [clear, onPick],
  )

  /**
   * A position IS resolving the site, the way choosing a result is: writing the coordinates and
   * waiting for a second press would make the press read as doing nothing on a phone. The place's
   * name comes from the reverse lookup and the coordinates stay the device's, and without a name
   * the site still resolves as "Current location"
   */
  const useBrowserLocation = useCallback(() => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setGeoBlocked(true)
      return
    }
    setGeoBlocked(false)
    setLocating(true)
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocating(false)
        const location = {
          latitudeDeg: degreesLatitude(position.coords.latitude),
          longitudeDeg: degreesLongitude(position.coords.longitude),
        }
        void reverseGeocode(location, null)
          .then(
            (hit): GeocodeHit => ({ ...hit, location }),
            (): GeocodeHit => ({
              label: 'Current location',
              location,
              countryCode: '',
              attribution: '',
            }),
          )
          .then(choose)
      },
      () => {
        setLocating(false)
        setGeoBlocked(true)
      },
      // a fix the phone found in the last few minutes places this garden as well as a fresh
      // one, and past the timeout the browser has said no in its own way
      { maximumAge: GEOLOCATION_MAX_AGE_MS, timeout: GEOLOCATION_TIMEOUT_MS },
    )
  }, [choose])

  /**
   * The place the step is working from: what was just chosen, or on a return to a saved garden,
   * where no result was ever chosen, the place the lookup resolved. One row either way, and the
   * chosen one keeps its own id because the e2e suite asserts that nothing is "selected" until
   * a result has been pressed
   */
  const place = chosen?.label ?? resolvedLabel

  return (
    <>
      <TextField
        testId="control-site-search"
        label="Town, address or ZIP code"
        value={query}
        placeholder="Amherst, Massachusetts"
        inputRef={searchInput}
        controls={hits.length > 0 ? RESULTS_ID : undefined}
        onChange={setQuery}
        onSubmit={search}
        onOpenList={() => (hits.length > 0 ? picker.current?.focus() : search())}
      />
      <div className="row">
        <Action testId="action-site-search" tone="primary" onClick={search}>
          {searching ? 'Searching...' : 'Find this place'}
        </Action>
        {geoOffered ? (
          <Action testId="action-site-geolocate" disabled={locating} onClick={useBrowserLocation}>
            {locating ? 'Finding your location...' : 'Use my location'}
          </Action>
        ) : null}
      </div>
      {searchError ? (
        <p className="notice notice-error" data-testid="status-site-search">
          Address search unavailable: {searchError}
        </p>
      ) : null}
      {geoBlocked ? (
        <p className="notice notice-idle" data-testid="status-site-geolocate">
          Your browser didn't share your location. Type the town or ZIP code instead.
        </p>
      ) : null}
      {hits.length > 0 ? (
        <>
          <Picker
            id={RESULTS_ID}
            testId="list-site-results"
            label="Address search results"
            options={hits.map((hit) => {
              const [name, region] = splitLabel(hit.label)
              return {
                key: `${hit.label}-${hit.location.latitudeDeg}-${hit.location.longitudeDeg}`,
                testId: `item-site-result-${hit.label}`,
                label: name,
                note: region,
              }
            })}
            activeIndex={activeIndex}
            handleRef={picker}
            onActivate={setActiveIndex}
            onChoose={(index) => {
              const hit = hits[index]
              if (hit) choose(hit)
            }}
            onDismiss={dismiss}
          />
          <Action testId="action-site-results-dismiss" onClick={dismiss}>
            Close results
          </Action>
        </>
      ) : null}
      {place === null ? null : (
        <p
          className="notice notice-ready site-place"
          data-testid={chosen ? 'readout-site-selection' : 'readout-site-place'}
        >
          <strong data-testid="readout-site-label">{place}</strong>
          {' · '}
          <button
            type="button"
            className="link"
            data-testid="action-site-change"
            onClick={() => searchInput.current?.focus()}
          >
            Change
          </button>
        </p>
      )}
    </>
  )
}
