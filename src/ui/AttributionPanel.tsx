import type { ReactElement } from 'react'
import {
  staticLayerLicences,
  WCVP_ATTRIBUTION,
  WCVP_SCOPE_NOTE,
  WGSRPD_ATTRIBUTION,
} from '../data/static-layers'
import { IMAGERY_ATTRIBUTION } from '../state/imagery'
import { useAppStore } from '../state/store'
import { Panel } from './Panel'

interface Credit {
  readonly id: string
  readonly source: string
  readonly text: string
}

const CREDITS: readonly Credit[] = [
  {
    id: 'osm',
    source: 'OpenStreetMap',
    text: '© OpenStreetMap contributors (Nominatim, Overpass)',
  },
  {
    id: 'copernicus',
    source: 'Copernicus',
    text: 'Copernicus DEM and Sentinel-2 products, © European Union, Copernicus Programme',
  },
  {
    id: 'open-meteo',
    source: 'Open-Meteo',
    text: 'Weather and solar radiation from Open-Meteo, CC BY 4.0',
  },
  {
    id: 'nasa-power',
    source: 'NASA POWER',
    text: 'NASA Prediction of Worldwide Energy Resources, public domain',
  },
  /*
   * Read from `data/static-layers.ts` rather than written out again here. Both lines are
   * obligations rather than courtesies: WCVP is CC BY 4.0, which is a licence that is met by
   * attributing it and breached by shipping the data without, and the scheme is the standard
   * the checklist indexes its ranges by, so citing one without the other names no regions
   */
  {
    id: 'wcvp',
    source: 'Kew WCVP',
    text: `${WCVP_ATTRIBUTION}. ${WCVP_SCOPE_NOTE}`,
  },
  {
    id: 'wgsrpd',
    source: 'TDWG WGSRPD',
    text: WGSRPD_ATTRIBUTION,
  },
]

export const AttributionPanel = (): ReactElement => {
  const imageryEnabled = useAppStore((s) => s.imageryEnabled)
  const weather = useAppStore((s) => s.weather)
  return (
    <Panel id="attribution" title="Attribution and licensing">
      <ul className="list" data-testid="list-attribution">
        {/* rendered from the data layer, not restated here: the 2023 PRISM terms allow
            redistributing altered data only with a prominently displayed disclaimer, so a
            hardcoded copy that drifts from the source is a licence breach, not a typo */}
        {staticLayerLicences().map((licence) => (
          <li key={licence.sourceId} data-testid={`item-attribution-${licence.sourceId}`}>
            <strong>{licence.sourceId}</strong>: {licence.attribution} ({licence.licence})
          </li>
        ))}
        {CREDITS.map((credit) => (
          <li key={credit.id} data-testid={`item-attribution-${credit.id}`}>
            <strong>{credit.source}</strong>: {credit.text}
          </li>
        ))}
        {imageryEnabled ? (
          <li data-testid="item-attribution-imagery">
            <strong>Satellite imagery</strong>: {IMAGERY_ATTRIBUTION}
          </li>
        ) : null}
        {weather.status === 'ready' ? (
          <li data-testid="item-attribution-weather">
            <strong>{weather.value.provenance.datasetLabel}</strong>:{' '}
            {weather.value.provenance.attribution} ({weather.value.provenance.licence})
          </li>
        ) : null}
      </ul>
    </Panel>
  )
}
