import { useCallback, useEffect, useMemo, useState, type ReactElement } from 'react'
import { type CropLightRow, cropLightTable } from '../data/crop-light-table'
import { loadCropCatalog } from '../data/crops'
import type { GeocodeHit } from '../data/geocode'
import { growingWindowFor } from '../data/growing-window'
import { SITE_PARTS } from '../data/site'
import { clamp, dayLabel } from '../data/util'
import { seasonAnchors } from '../recommend/calendar'
import { seasonLight } from '../sim/aggregate'
import { attempt, messageOf } from '../state/safe'
import { cropsForConditions, openFieldBedLight } from '../state/site-fit'
import type { AsyncState } from '../state/slices'
import type { Crop } from '../types/crop'
import { type ExceedancePercentile, isTemperatureHardiness, type Site } from '../types/site'
import { fraction } from '../types/units'
import { PERCENTILE_HELP, PERCENTILE_OPTIONS } from '../ui/calendar'
import { Action, NumberField, SelectField, TextField, Toggle } from '../ui/controls'
import { formatCelsius, formatDli, formatRainMm } from '../ui/format'
import { InfoTip } from '../ui/InfoTip'
import { IRRIGATION_OPTIONS } from '../ui/irrigation-options'
import { SHADE_PERCENT_HELP } from '../ui/onboarding'
import { Panel, Readout } from '../ui/Panel'
import { PlaceSearch } from '../ui/PlaceSearch'
import {
  capitalizeSentence,
  OSM_ATTRIBUTION,
  SITE_IDLE,
  siteNoticeText,
  zoneWords,
} from '../ui/site-notice'
import { CropFitTable } from './CropFitTable'
import { countLine, fitRows, VERDICT_FILTER_OPTIONS, type VerdictFilter } from './fit-rows'
import {
  type FinderPlace,
  PH_MAX,
  PH_MIN,
  readFinderState,
  SHADE_MAX_PERCENT,
  SHADE_MIN_PERCENT,
  writeFinderState,
} from './url'
import { useSiteLookup } from './useSiteLookup'

interface Catalog {
  readonly crops: readonly Crop[]
  /** The docs table's row for each crop, by id, for the floor, the band and the maturity */
  readonly lightRows: ReadonlyMap<string, CropLightRow>
}

/** The season at the chosen risk, or the whole year where the record holds no frost at it */
const seasonWords = (site: Site, percentile: ExceedancePercentile): string => {
  // with no frost curve the anchors fall back to day 1 and day 365, a season nobody measured
  if (site.frost.length === 0) return 'not known here'
  const anchors = seasonAnchors(site, percentile)
  return anchors.frostFree
    ? 'No frost at this risk, so the season runs the whole year'
    : `${String(anchors.frostFreeDays)} frost-free days, ${dayLabel(anchors.lastSpringFreeze)} to ${dayLabel(anchors.firstFallFreeze)}`
}

/** The soil map's reading for the place, and where it came from */
const soilWords = (site: Site): string => {
  const { soil } = site
  const reading = `pH ${soil.phUnits.toFixed(1)}, ${soil.textureClass.replaceAll('-', ' ')}`
  if (soil.sourceId === 'default') {
    return `${reading}, assumed: ${soil.unreachable ? "the soil map couldn't be reached" : 'the soil map has no reading here'}`
  }
  const source = soil.sourceId === 'ssurgo' ? 'SSURGO' : 'SoilGrids'
  return soil.sampledKm === undefined
    ? `${reading}, from ${source}`
    : `${reading}, from ${source} about ${String(soil.sampledKm)} km away`
}

/** What stands in for a typed pH while the box is unchecked */
const phSourceWords = (site: Site | null): string => {
  if (site === null)
    return "The soil map's reading for the place will stand in once one is looked up"
  const { soil } = site
  if (soil.sourceId === 'default') {
    const assumed = `pH ${soil.phUnits.toFixed(1)} ${soil.textureClass.replaceAll('-', ' ')}`
    return soil.unreachable
      ? `The soil map couldn't be reached, so ${assumed} stands in`
      : `The soil map has no reading here, so ${assumed} stands in`
  }
  return `From the soil map for this place: pH ${soil.phUnits.toFixed(1)}`
}

/**
 * The crop finder: a place, what its ground is like, and every crop in the catalog ranked for it.
 * The planner's search, fields, lookup and crop rules, with no panels, scene or store behind them.
 * Everything it shows is in its address, so a copied link opens on the same answer
 */
export const CropFinder = (): ReactElement => {
  const [initial] = useState(() => readFinderState(window.location.search))
  const [place, setPlace] = useState<FinderPlace | null>(initial.place)
  const [shadePercent, setShadePercent] = useState(initial.shadePercent)
  const [ownPh, setOwnPh] = useState(initial.ownPh)
  const [phUnits, setPhUnits] = useState(initial.phUnits)
  const [irrigation, setIrrigation] = useState(initial.irrigation)
  const [frostPercentile, setFrostPercentile] = useState(initial.frostPercentile)
  const [query, setQuery] = useState('')
  const [verdict, setVerdict] = useState<VerdictFilter>('all')
  const [catalog, setCatalog] = useState<AsyncState<Catalog>>({ status: 'loading' })
  const {
    state: siteState,
    parts,
    lookup,
    retry,
  } = useSiteLookup(
    initial.place === null
      ? null
      : { location: initial.place.location, label: initial.place.label, countryCode: null },
  )

  // the catalog once, and the docs table's rows from the same chunk the catalog loads from
  useEffect(() => {
    let live = true
    void Promise.all([loadCropCatalog(), import('../data/catalog/rows')])
      .then(
        ([crops, { CROP_ROWS }]): Catalog => ({
          crops,
          lightRows: new Map(cropLightTable(CROP_ROWS).rows.map((row) => [row.id, row])),
        }),
      )
      .then(
        (value) => {
          if (live) setCatalog({ status: 'ready', value })
        },
        (cause: unknown) => {
          if (live) setCatalog({ status: 'error', message: messageOf(cause) })
        },
      )
    return () => {
      live = false
    }
  }, [])

  // the address follows the fields, so the address bar always holds a link to this answer
  useEffect(() => {
    const search = writeFinderState({
      place,
      shadePercent,
      phUnits,
      ownPh,
      irrigation,
      frostPercentile,
    })
    window.history.replaceState(
      window.history.state,
      '',
      `${window.location.pathname}${search}${window.location.hash}`,
    )
  }, [place, shadePercent, phUnits, ownPh, irrigation, frostPercentile])

  const pick = useCallback(
    (hit: GeocodeHit): void => {
      setPlace({ location: hit.location, label: hit.label })
      lookup(hit.location, hit.label, hit.countryCode || null)
    },
    [lookup],
  )

  const site = siteState.status === 'ready' ? siteState.value : null
  const loaded = catalog.status === 'ready' ? catalog.value : null
  // a field holds whatever is typed, and the ranking reads it held to the field's range
  const shade = clamp(shadePercent, SHADE_MIN_PERCENT, SHADE_MAX_PERCENT) / 100
  const ph = clamp(phUnits, PH_MIN, PH_MAX)

  const ranking = useMemo(
    () =>
      site === null || loaded === null
        ? null
        : attempt(() =>
            cropsForConditions({
              site,
              catalog: loaded.crops,
              shade: fraction(shade),
              soil: ownPh ? { kind: 'own', phUnits: ph } : { kind: 'map' },
              irrigation,
              frostPercentile,
            }),
          ),
    [site, loaded, shade, ownPh, ph, irrigation, frostPercentile],
  )

  // the rows once, for the count line and the table both
  const rows = useMemo(
    () =>
      ranking?.ok && loaded !== null
        ? fitRows(ranking.value, loaded.crops, loaded.lightRows)
        : null,
    [ranking, loaded],
  )

  // the open field's months and the season's mean under the shade, which needs no catalog
  const seasonMean = useMemo(
    () =>
      site === null
        ? null
        : attempt(
            () =>
              seasonLight(
                openFieldBedLight(site, fraction(shade)),
                growingWindowFor(site, frostPercentile),
                null,
              ).meanDliMolM2Day,
          ),
    [site, shade, frostPercentile],
  )

  const pending = SITE_PARTS.filter((part) => !parts.includes(part))
  const notice = siteNoticeText(siteState, SITE_IDLE, pending)
  const said = notice === null ? '' : capitalizeSentence(notice)

  return (
    <>
      <header className="crops-bar">
        <a href="/">Agrivoltaic garden planner</a>
        <a href="/docs/crops.html">Crop light figures</a>
      </header>
      <main className="crops-main" data-testid="crops-root">
        <h1>Crop finder</h1>
        <p className="crops-lede">
          Type a place, say what its ground is like, and see which crops in the catalog suit it.
        </p>
        <div className="crops-layout">
          <div className="crops-column">
            <Panel id="crops-place" title="Where is the ground?">
              <PlaceSearch
                near={site?.location ?? null}
                resolvedLabel={site?.label ?? null}
                onPick={pick}
              />
              {/* mounted in every state, so the first sentence of a lookup is a change inside a
                  live region the screen reader already holds. The box below is for the eye */}
              <p className="visually-hidden" role="status" data-testid="status-crops-site-live">
                {said}
              </p>
              {notice === null ? null : (
                <div
                  className={`notice notice-${siteState.status} site-notice`}
                  data-testid="status-crops-site"
                  data-state={siteState.status}
                >
                  <p aria-hidden="true">{said}</p>
                  {siteState.status === 'error' ? (
                    <Action testId="action-crops-retry" tone="primary" onClick={retry}>
                      Try again
                    </Action>
                  ) : null}
                </div>
              )}
              <p className="attribution" data-testid="readout-crops-attribution">
                {OSM_ATTRIBUTION}
              </p>
            </Panel>
            <Panel id="crops-ground" title="What the ground is like">
              <div className="crops-tipped">
                <NumberField
                  testId="control-crops-shade"
                  label="Shade over the season"
                  unit="%"
                  min={SHADE_MIN_PERCENT}
                  max={SHADE_MAX_PERCENT}
                  step={5}
                  value={shadePercent}
                  onChange={setShadePercent}
                />
                <InfoTip label="shade over the season" testId="info-crops-shade">
                  {SHADE_PERCENT_HELP} 0 is open ground. Each crop has the most shade it can take,
                  and a crop whose limit is below your figure is marked not suited.
                </InfoTip>
              </div>
              <Toggle
                testId="control-crops-own-ph"
                label="I know my soil's pH"
                checked={ownPh}
                onChange={setOwnPh}
              />
              <div className="crops-tipped">
                {ownPh ? (
                  <NumberField
                    testId="control-crops-ph"
                    label="Soil pH"
                    min={PH_MIN}
                    max={PH_MAX}
                    step={0.1}
                    value={phUnits}
                    onChange={setPhUnits}
                  />
                ) : (
                  <p className="readout-note" data-testid="readout-crops-ph-source">
                    {phSourceWords(site)}
                  </p>
                )}
                <InfoTip label="soil pH" testId="info-crops-ph">
                  A pH you type can rule a crop out. The map's reading only lowers a crop's
                  standing, since a map pixel is the native ground and a bed is usually limed.
                </InfoTip>
              </div>
              <SelectField
                testId="control-crops-irrigation"
                label="Watering"
                value={irrigation}
                options={IRRIGATION_OPTIONS}
                onChange={(method) => setIrrigation(method)}
              />
              <div className="crops-tipped">
                <SelectField
                  testId="control-crops-frost-percentile"
                  label="How much frost risk to take"
                  value={String(frostPercentile)}
                  options={PERCENTILE_OPTIONS}
                  onChange={(value) => setFrostPercentile(Number(value) as ExceedancePercentile)}
                />
                <InfoTip label="frost risk" testId="info-crops-frost-percentile">
                  {PERCENTILE_HELP}
                </InfoTip>
              </div>
            </Panel>
          </div>
          <div className="crops-column">
            {site === null ? null : (
              <Panel id="crops-read" title="What was read for this place" className="crops-read">
                <div className="readouts">
                  <Readout
                    id="crops-season"
                    label="Growing season"
                    value={seasonWords(site, frostPercentile)}
                  />
                  <Readout
                    id="crops-hardiness"
                    label="Winter hardiness zone"
                    value={
                      site.hardiness.filter(isTemperatureHardiness).map(zoneWords).join(', ') ||
                      'not known here'
                    }
                  />
                  <Readout
                    id="crops-koppen"
                    label="Climate type (Köppen)"
                    value={site.koppenCode}
                  />
                  <Readout
                    id="crops-light"
                    label="Daily light in the open, January to December (mol/m²/d)"
                    value={
                      <>
                        <span className="crops-line">
                          {site.normals.monthlyMeanDliMolM2Day
                            .map((value) => String(Math.round(value)))
                            .join(' ')}
                        </span>
                        {seasonMean?.ok === true ? (
                          <span className="crops-line">
                            {`${shade === 0 ? 'Season mean' : `Season mean under ${String(Math.round(shade * 100))}% shade`}: ${formatDli(seasonMean.value)}`}
                          </span>
                        ) : null}
                      </>
                    }
                  />
                  <Readout id="crops-soil" label="Soil on the map" value={soilWords(site)} />
                  <Readout
                    id="crops-rain"
                    label="Rain in a year"
                    value={formatRainMm(
                      site.normals.monthlyPrecipMm.reduce<number>((sum, mm) => sum + mm, 0),
                    )}
                  />
                  <Readout
                    id="crops-heat"
                    label={`Days a year above ${formatCelsius(30)}`}
                    value={String(Math.round(site.heatDaysAbove30C))}
                  />
                </div>
              </Panel>
            )}
            <Panel id="crops-results" title="Crops for this place">
              {site === null ? (
                <p className="notice notice-idle" data-testid="status-crops-results">
                  Look up a place to see the crops ranked for it
                </p>
              ) : loaded === null ? (
                <p
                  className={`notice notice-${catalog.status === 'error' ? 'error' : 'loading'}`}
                  data-testid="status-crops-catalog"
                >
                  {catalog.status === 'error'
                    ? `The crop catalog didn't load: ${catalog.message}`
                    : 'Loading the crop catalog'}
                </p>
              ) : ranking === null || !ranking.ok || rows === null ? (
                <p className="notice notice-error" data-testid="status-crops-ranking">
                  The crops couldn't be ranked for this place
                  {ranking === null || ranking.ok ? '' : `: ${ranking.message}`}
                </p>
              ) : (
                <>
                  <p className="readout-line" data-testid="readout-crops-count">
                    {countLine(rows)}
                  </p>
                  <div className="row">
                    <TextField
                      testId="control-crops-filter"
                      label="Filter by name"
                      value={query}
                      onChange={setQuery}
                    />
                    <SelectField
                      testId="control-crops-verdict"
                      label="Show"
                      value={verdict}
                      options={VERDICT_FILTER_OPTIONS}
                      onChange={(shown) => setVerdict(shown)}
                    />
                  </div>
                  <CropFitTable
                    rows={rows}
                    placeLabel={site.label}
                    query={query}
                    verdict={verdict}
                  />
                </>
              )}
            </Panel>
          </div>
        </div>
      </main>
    </>
  )
}
