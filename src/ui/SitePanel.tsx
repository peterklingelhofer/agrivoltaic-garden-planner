import type { ReactElement } from 'react'
import { NRCAN_SCHEME_NOTE } from '../data/static-layers'
import { showingExample, useAppStore } from '../state/store'
import type { LatLon } from '../types/geo'
import { degreesLatitude, degreesLongitude } from '../types/units'
import { isTemperatureHardiness } from '../types/site'
import type { ExceedancePercentile } from '../types/site'
import { PERCENTILE_HELP, PERCENTILE_OPTIONS } from './calendar'
import { Action, NumberField, SelectField } from './controls'
import { formatMeters } from './format'
import { InfoTip } from './InfoTip'
import { Panel, Readout } from './Panel'
import { PlaceSearch } from './PlaceSearch'
import { splitLabel } from './place-label'
import { SeasonSummary } from './SeasonSummary'
import { SiteNotice } from './SiteNotice'
import { SiteVerdict } from './SiteVerdict'
import {
  elevationUnknownWords,
  OSM_ATTRIBUTION,
  SITE_IDLE,
  siteNoticeText,
  soilPhNote,
  soilSampledNote,
  zoneWords,
} from './site-notice'
import { timezoneWords } from './timezone-words'

const WEATHER_IDLE = 'No weather yet. Looking up the place loads it'

/**
 * What the example is, said where the visitor would otherwise search for a place that is already on
 * screen: a step that opens on the example has to say whose garden that is. The town is the one the
 * loaded example was made for, which the browser's time zone picks from three
 */
const exampleSubtitle = (siteLabel: string): string =>
  `This is an example garden for ${splitLabel(siteLabel)[0]}. Search for your own place to start yours.`

/**
 * What a place typed in as coordinates is called. The label moves with the location it names, so
 * the top bar and the place step name the place whose climate they show
 */
const coordinateLabel = (location: LatLon): string =>
  `${location.latitudeDeg.toFixed(4)}, ${location.longitudeDeg.toFixed(4)}`

export const SitePanel = (): ReactElement => {
  const site = useAppStore((s) => s.site)
  const weather = useAppStore((s) => s.weather)
  const pending = useAppStore((s) => s.sitePending)
  const location = useAppStore((s) => s.location)
  const locationLabel = useAppStore((s) => s.locationLabel)
  const frostPercentile = useAppStore((s) => s.frostPercentile)
  const setLocation = useAppStore((s) => s.setLocation)
  const setFrostPercentile = useAppStore((s) => s.setFrostPercentile)
  const resolveSite = useAppStore((s) => s.resolveSite)

  const resolved = site.status === 'ready' ? site.value : null
  const example = useAppStore(showingExample)
  // the place the loaded example was made for. `showingExample` already holds that there is one
  const exampleSite = useAppStore((s) => s.exampleProvenance?.siteLabel ?? null)
  const siteText = siteNoticeText(site, SITE_IDLE, pending)
  const weatherText = siteNoticeText(weather, WEATHER_IDLE, pending)
  // the weather record the elevation came with, named in the readout when it carried none
  const weatherRecord = weather.status === 'ready' ? weather.value.provenance.datasetLabel : null
  const nrcanZone =
    resolved?.hardiness.find((rating) => rating.scheme === 'nrcan')?.zoneLabel ?? null

  return (
    <Panel
      id="site"
      title="Where is the garden?"
      titleVisible={false}
      subtitle={example && exampleSite !== null ? exampleSubtitle(exampleSite) : undefined}
    >
      <PlaceSearch
        near={resolved?.location ?? null}
        resolvedLabel={resolved?.label ?? null}
        onPick={(hit) => void resolveSite(hit.location, hit.label, hit.countryCode || null)}
      />
      <SiteNotice state={site} testId="status-site" idleLabel={SITE_IDLE} />
      {/* the same lookup writes both, so a failure would otherwise print one sentence twice */}
      {weatherText !== siteText ? (
        <SiteNotice state={weather} testId="status-weather" idleLabel={WEATHER_IDLE} />
      ) : null}
      <SeasonSummary />
      <SiteVerdict />
      {/* said here, where the lookup happened, and again on each bed: an assumed pH surfaced
          only inside a bed would leave the place step saying nothing about it */}
      {resolved !== null && resolved.soil.sourceId === 'default' ? (
        <p className="notice notice-idle" data-testid="status-site-soil">
          {resolved.soil.unreachable
            ? "The soil map couldn't be reached. Beds assume pH 6.5 loam until you type your own."
            : 'The soil map has no reading here or 3 km around it, as it leaves out built-up ground and water. Beds assume pH 6.5 loam until you type your own.'}
        </p>
      ) : null}
      {/* a reading from a few kilometers out is the area's soil: said, with the distance */}
      {resolved === null || soilSampledNote(resolved.soil) === null ? null : (
        <p className="notice notice-idle" data-testid="status-site-soil-sampled">
          {soilSampledNote(resolved.soil)}
        </p>
      )}
      {/* the ranking's treatment of a map pH is said where the lookup happened */}
      {resolved === null || soilPhNote(resolved.soil) === null ? null : (
        <p className="notice notice-idle" data-testid="status-site-soil-ph">
          {soilPhNote(resolved.soil)}
        </p>
      )}
      {/*
        Everything a grower reads once and a specialist reads often, behind one press. On the face,
        two coordinate fields, an exceedance percentile, a Köppen code and a hardiness zone would
        put the first panel a beginner meets at reading grade 20, the highest in the app, and none
        of them answer the question the step is asking. The search, the place it found and the
        frost sentence stay on the face, and the press that looks up typed coordinates is in here
        beside the fields it reads. The water balance isn't here at all: the face says whether rain
        covers a garden, and the check step's water pane has the figures
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
            onChange={(value) => {
              const next = {
                latitudeDeg: degreesLatitude(value),
                longitudeDeg: location.longitudeDeg,
              }
              setLocation(next, coordinateLabel(next))
            }}
          />
          <NumberField
            testId="control-site-longitude"
            label="Longitude"
            unit="deg"
            step={0.0001}
            value={location.longitudeDeg}
            onChange={(value) => {
              const next = {
                latitudeDeg: location.latitudeDeg,
                longitudeDeg: degreesLongitude(value),
              }
              setLocation(next, coordinateLabel(next))
            }}
          />
        </div>
        <Action
          testId="action-site-resolve"
          tone="primary"
          onClick={() => void resolveSite(location, locationLabel)}
        >
          Look up these coordinates
        </Action>
        <SelectField
          testId="control-site-frost-percentile"
          label="How much frost risk to take"
          value={String(frostPercentile)}
          options={PERCENTILE_OPTIONS}
          onChange={(value) => setFrostPercentile(Number(value) as ExceedancePercentile)}
        />
        {/* the same i the calendar step puts beside this control */}
        <InfoTip label="frost exceedance" testId="info-site-percentile">
          {PERCENTILE_HELP}
        </InfoTip>
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
          </div>
        ) : null}
        {/* two of the readouts are terms a gardener meets on plant labels and maps: defined
            once, behind the i */}
        {resolved ? (
          <InfoTip label="the climate type and the hardiness zone" testId="info-site-climate-words">
            A Köppen type sorts a climate by its temperature and rain through the year: Dfb, for
            example, is humid with warm summers and cold winters. A hardiness zone is the coldest
            winter temperature a place usually sees, in 10 °F bands, and it's what plant labels
            quote.
          </InfoTip>
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
