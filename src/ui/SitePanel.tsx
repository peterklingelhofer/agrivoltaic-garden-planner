import { useCallback, useEffect, useRef, useState, type ReactElement } from 'react'
import { type GeocodeHit, reverseGeocode } from '../data/geocode'
import { NRCAN_SCHEME_NOTE } from '../data/static-layers'
import { describeWaterLimitation } from '../data/water'
import { showingExample, useAppStore } from '../state/store'
import { degreesLatitude, degreesLongitude } from '../types/units'
import { isTemperatureHardiness } from '../types/site'
import type { ExceedancePercentile, TemperatureHardinessRating } from '../types/site'
import { PERCENTILE_HELP, PERCENTILE_OPTIONS } from './calendar'
import { Action, NumberField, SelectField, TextField } from './controls'
import { bandBasisLabel, formatMeters } from './format'
import { Panel, Readout } from './Panel'
import { Picker, type PickerHandle } from './Picker'
import { SeasonSummary } from './SeasonSummary'
import { SiteNotice } from './SiteNotice'
import { SiteVerdict } from './SiteVerdict'
import { elevationUnknownWords, siteNoticeText, soilSampledNote } from './site-notice'
import { timezoneWords } from './timezone-words'
import { useAddressSearch } from './useAddressSearch'

export const OSM_ATTRIBUTION = '© OpenStreetMap contributors'
const RESULTS_ID = 'site-search-results'
const SITE_IDLE = 'No place looked up yet. Search an address above'
const WEATHER_IDLE = 'No weather yet. Looking up the place loads it'
/** Firefox on a phone can wait on a satellite fix past any patience, a network fix comes in seconds */
const GEOLOCATION_TIMEOUT_MS = 15_000
const GEOLOCATION_MAX_AGE_MS = 600_000

/**
 * "usda-2023 6a" is a dataset id; a gardener reads "zone 6a (USDA)". Outside the map's grid the
 * zone is computed here from thirty years of daily minima, and the label says so and makes no claim
 * to the map
 */
const zoneWords = (rating: TemperatureHardinessRating): string =>
  rating.scheme.startsWith('usda')
    ? rating.basis === 'weather-record'
      ? `zone ${rating.zoneLabel}, USDA-style, computed from the weather record`
      : `zone ${rating.zoneLabel} (USDA)`
    : `${rating.scheme} ${rating.zoneLabel}`

/**
 * What the example is, said where the visitor would otherwise search for a place that is already on
 * screen: a step that opens on Amherst has to say whose garden that is
 */
const EXAMPLE_SUBTITLE =
  'This is an example garden for Amherst. Search for your own place to start yours.'

/**
 * A geocoder label as a name and the region under it: "Springfield, Illinois" is the town in
 * bold and the state in small type, and the coordinates are not printed at all. Two Springfields
 * are told apart by their region, which is how a person tells them apart
 */
const splitLabel = (label: string): readonly [string, string | undefined] => {
  const comma = label.indexOf(',')
  return comma === -1
    ? [label, undefined]
    : [label.slice(0, comma).trim(), label.slice(comma + 1).trim() || undefined]
}

export const SitePanel = (): ReactElement => {
  const site = useAppStore((s) => s.site)
  const weather = useAppStore((s) => s.weather)
  const location = useAppStore((s) => s.location)
  const locationLabel = useAppStore((s) => s.locationLabel)
  const frostPercentile = useAppStore((s) => s.frostPercentile)
  const setLocation = useAppStore((s) => s.setLocation)
  const setFrostPercentile = useAppStore((s) => s.setFrostPercentile)
  const resolveSite = useAppStore((s) => s.resolveSite)

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
  } = useAddressSearch(searchInput)
  // whether the browser refused a location, its own notice and never the search's
  const [geoBlocked, setGeoBlocked] = useState(false)
  // hidden, since a permission already denied is not worth a press
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
      void resolveSite(hit.location, hit.label, hit.countryCode || null)
    },
    [clear, resolveSite],
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

  const resolved = site.status === 'ready' ? site.value : null
  const example = useAppStore(showingExample)
  const siteText = siteNoticeText(site, SITE_IDLE, locationLabel)
  const weatherText = siteNoticeText(weather, WEATHER_IDLE, locationLabel)
  // the weather record the elevation came with, named in the readout when it carried none
  const weatherRecord = weather.status === 'ready' ? weather.value.provenance.datasetLabel : null
  const nrcanZone =
    resolved?.hardiness.find((rating) => rating.scheme === 'nrcan')?.zoneLabel ?? null
  /**
   * The place the step is working from: what was just chosen, or on a return to a saved garden,
   * where no result was ever chosen, the place the lookup resolved. One row either way, and the
   * chosen one keeps its own id because the e2e suite asserts that nothing is "selected" until
   * a result has been pressed
   */
  const place = chosen?.label ?? resolved?.label ?? null

  return (
    <Panel
      id="site"
      title="Where is the garden?"
      titleVisible={false}
      subtitle={example ? EXAMPLE_SUBTITLE : undefined}
    >
      <TextField
        testId="control-site-search"
        label="Town, address or postcode"
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
          Your browser didn't share your location. Type the town or postcode instead.
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
      <SiteNotice state={site} testId="status-site" idleLabel={SITE_IDLE} />
      {/* the same lookup writes both, so a failure would otherwise print one sentence twice */}
      {weatherText !== siteText ? (
        <SiteNotice state={weather} testId="status-weather" idleLabel={WEATHER_IDLE} />
      ) : null}
      <SeasonSummary />
      <SiteVerdict />
      {/* said here, where the lookup happened, and again on each bed: an assumed pH surfaced
          only inside a bed would leave the place step saying nothing about it */}
      {resolved?.soil.sourceId === 'default' ? (
        <p className="notice notice-idle" data-testid="status-site-soil">
          The soil map has no reading for this spot or within 6 km of it. The map leaves out
          built-up ground and water. Every bed assumes pH 6.5 loam until you type your own soil.
        </p>
      ) : null}
      {/* a reading from a few kilometres out is the area's soil: said, with the distance */}
      {resolved === null || soilSampledNote(resolved.soil) === null ? null : (
        <p className="notice notice-idle" data-testid="status-site-soil-sampled">
          {soilSampledNote(resolved.soil)}
        </p>
      )}
      {/*
        Everything a grower reads once and a specialist reads often, behind one press. On the face,
        two coordinate fields, an exceedance percentile, a Köppen code, a hardiness zone and a
        water-limitation band would put the first panel a beginner meets at reading grade 20, the
        highest in the app, and none of them answer the question the step is asking. The search, the
        place it found and the frost sentence stay on the face, and the press that looks up typed
        coordinates is in here beside the fields it reads
      */}
      <details className="wizard-advanced" data-testid="details-site-more">
        <summary data-testid="action-site-more">More about this place</summary>
        <div className="row">
          <NumberField
            testId="control-site-latitude"
            label="Latitude"
            unit="deg"
            step={0.0001}
            value={location.latitudeDeg}
            onChange={(value) =>
              setLocation(
                { latitudeDeg: degreesLatitude(value), longitudeDeg: location.longitudeDeg },
                locationLabel,
              )
            }
          />
          <NumberField
            testId="control-site-longitude"
            label="Longitude"
            unit="deg"
            step={0.0001}
            value={location.longitudeDeg}
            onChange={(value) =>
              setLocation(
                { latitudeDeg: location.latitudeDeg, longitudeDeg: degreesLongitude(value) },
                locationLabel,
              )
            }
          />
        </div>
        <Action
          testId="action-site-resolve"
          tone="primary"
          onClick={() => void resolveSite(location, locationLabel)}
        >
          Look up these coordinates
        </Action>
        <p className="panel-sub" data-testid="readout-site-resolve-help">
          Only needed for coordinates typed in by hand, choosing a search result looks the place up
          on its own.
        </p>
        <SelectField
          testId="control-site-frost-percentile"
          label="How much frost risk to take"
          value={String(frostPercentile)}
          options={PERCENTILE_OPTIONS}
          onChange={(value) => setFrostPercentile(Number(value) as ExceedancePercentile)}
        />
        <p className="panel-sub" data-testid="readout-site-percentile-help">
          {PERCENTILE_HELP}
        </p>
        {resolved ? (
          <div className="readouts">
            <Readout
              id="site-elevation"
              label="Elevation"
              value={
                resolved.elevationM === null
                  ? elevationUnknownWords(weatherRecord)
                  : formatMeters(resolved.elevationM)
              }
            />
            <Readout
              id="site-timezone"
              label="Timezone"
              value={timezoneWords(resolved.timezone, resolved.timezoneBasis)}
            />
            <Readout id="site-koppen" label="Climate type (Köppen)" value={resolved.koppenCode} />
            {/* in plain words: "usda-2023 6a" reads as a dataset id, which it is */}
            <Readout
              id="site-hardiness"
              label="Winter hardiness zone"
              value={
                resolved.hardiness.filter(isTemperatureHardiness).map(zoneWords).join(', ') ||
                'not known here'
              }
            />
            {nrcanZone === null ? null : (
              <Readout id="site-nrcan-zone" label="Canadian hardiness zone" value={nrcanZone} />
            )}
            <Readout
              id="site-water-limited"
              label="Water limitation"
              value={`${describeWaterLimitation(resolved.waterLimitation)}, ${bandBasisLabel(
                resolved.waterLimitation.band,
              )}`}
            />
          </div>
        ) : null}
        {nrcanZone === null ? null : (
          <p className="panel-sub" data-testid="readout-site-nrcan-note">
            {NRCAN_SCHEME_NOTE}
          </p>
        )}
      </details>
      <p className="attribution" data-testid="readout-site-attribution">
        {OSM_ATTRIBUTION}
      </p>
    </Panel>
  )
}
