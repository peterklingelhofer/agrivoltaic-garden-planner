import {
  buildCacheKey,
  buildQueryCacheKey,
  type CachedUpstream,
  TTL_GEOCODE_SECONDS,
  TTL_RETAIL_PRICE_SECONDS,
  TTL_TMY_SECONDS,
  withCache,
} from './cache'
import type { ExecutionContextLike, ProxyEnv } from './env'

export interface RouteContext {
  readonly request: Request
  readonly env: ProxyEnv
  readonly ctx: ExecutionContextLike
}

export interface Route {
  readonly upstream: CachedUpstream
  /** upstream path, forwarded verbatim, so client and edge cannot drift apart */
  readonly path: string
  readonly dataset: string
  readonly host: (env: ProxyEnv) => string
  readonly apiKey?: (env: ProxyEnv) => string | undefined
  /**
   * An address the upstream wants on every request, attached the way the key is. Only NSRDB
   * asks for one, and the client never sends it, so a route without this could not answer at all
   */
  readonly email?: (env: ProxyEnv) => string | undefined
  /**
   * What tells two answers from this route's dataset apart, when the path alone cannot.
   *
   * Only open-meteo needs it: the climate normals and the hourly typical year are the same path
   * and differ by query. Everything else keeps the year-range default, which is what its own
   * answers vary by
   */
  readonly variant?: (params: URLSearchParams) => string
  /**
   * How long an answer from this route stays good for: a year where the weather windows asked
   * about are closed and in the past, a week for a geocode, a month for a price that moves once
   * a year. `cache.ts` says why for each
   */
  readonly ttlSeconds?: number
  /**
   * What the answer is ABOUT, and so what its cache key is built from. Most of these answer
   * about a point on the ground. A geocode search answers about the words somebody typed: it has
   * no coordinates at all, being the question that produces them. The electricity price answers
   * about a state and a sector, which are neither a point nor a phrase, so `params` keys on the
   * whole query the way the geocoders key on the phrase
   */
  readonly subject?: 'location' | 'query' | 'params'
  /**
   * Headers this route must send upstream.
   *
   * The reason the geocoders are proxied at all. The OSM Nominatim usage policy asks for a
   * User-Agent identifying the application, and a browser is forbidden from setting one, so a
   * request sent straight from the browser arrives anonymous. A function of the environment, so the
   * contact URL always matches wherever this is actually deployed: a hardcoded string would rot the
   * first time that changes
   */
  readonly headers?: (env: ProxyEnv) => Record<string, string>
}

/**
 * Who is asking, in the form the OSM policy asks for: a name and a way to reach whoever runs it.
 *
 * Built from `ALLOWED_ORIGINS` because that is already the list of places this proxy serves, so
 * the contact URL cannot drift from the deployment the way a hardcoded one would. The name is
 * duplicated from `USER_AGENT` in `src/data/http.ts` for the same reason `CACHE_SCHEMA_VERSION`
 * is: the worker and the client are compiled separately and share no module
 */
export const identifyingUserAgent = (env: ProxyEnv): string => {
  const first = env.ALLOWED_ORIGINS.split(',')
    .map((entry) => entry.trim())
    .find((entry) => entry.length > 0)
  return first === undefined
    ? 'agrivoltaic-garden-designer'
    : `agrivoltaic-garden-designer (+${first})`
}

/**
 * A cap, because a query-keyed route takes whatever is typed.
 *
 * The allowlist pins the host and the path, so this can never be a general relay, but it can be
 * asked anything a geocoder can be asked. A place name is a few words; a kilobyte of query is
 * somebody using this proxy as their own geocoder, and the risk that carries is our origin being
 * the one the upstream blocks
 */
export const QUERY_LIMIT = 200

/**
 * Every query parameter except the location, in a stable order.
 *
 * The location is deliberately excluded because it is already in the key, quantised: folding the
 * raw coordinates back in here would undo that and give every visitor their own cache entry,
 * which is the entire thing this is for. Sorted because `URLSearchParams` preserves insertion
 * order and two callers writing the same request in a different order must not miss each other
 */
const LOCATION_PARAMS: readonly string[] = [
  'latitude',
  'longitude',
  'lat',
  'lon',
  'locations',
  'wkt',
]

export const queryVariant = (params: URLSearchParams): string =>
  [...params.entries()]
    .filter(([name]) => !LOCATION_PARAMS.includes(name))
    .map(([name, value]) => `${name}=${value}`)
    .sort()
    .join('&')

/** must stay in step with `WORKER_PROXY_BASE` in `src/data/http.ts` */
export const PROXY_PREFIX = '/api/proxy'

export const UPSTREAM_TIMEOUT_MS = 15_000
export const CACHE_SCHEMA_VERSION = 1

/**
 * An allowlist, not a passthrough. Only these exact upstream paths are reachable, so the
 * proxy can never be turned into an open relay for the two hosts it holds credentials or
 * policy exemptions for
 */
export const ROUTES: readonly Route[] = [
  {
    upstream: 'pvgis',
    path: '/api/v5_3/tmy',
    dataset: 'tmy',
    host: (env) => env.PVGIS_HOST,
  },
  /**
   * NSRDB moved three ways at once and only the first was anticipated here.
   *
   * NREL became the National Laboratory of the Rockies, `developer.nrel.gov` was **retired on 29
   * May 2026**, and PSM v3.2.2 was replaced by GOES v4.0.0. The host is an env binding (Decision
   * Record 9), and the paths and the dataset below are the GOES v4 ones. Both paths below were
   * checked against the live API: the v4 TMY endpoint validates `wkt`, `names`, `interval` and
   * `attributes` and answers with a structured 400 naming the one parameter it wants.
   *
   * `names` accepts `tmy` and the per-year `tmy-2022` through `tmy-2024`, plus the `tdy-`/`tgy-`
   * variants; `email` is required by the upstream and must be a real address, so it is a secret
   * binding of its own (`NSRDB_EMAIL`), attached here beside the key, and the route answers 503
   * without it
   */
  {
    upstream: 'nsrdb',
    path: '/api/nsrdb/v2/solar/nsrdb-GOES-tmy-v4-0-0-download.csv',
    dataset: 'goes-tmy-v4',
    host: (env) => env.NSRDB_HOST,
    apiKey: (env) => env.NSRDB_API_KEY,
    email: (env) => env.NSRDB_EMAIL,
  },
  {
    upstream: 'nsrdb',
    path: '/api/nsrdb/v2/solar/nsrdb-GOES-aggregated-v4-0-0-download.csv',
    dataset: 'goes-aggregated-v4',
    host: (env) => env.NSRDB_HOST,
    apiKey: (env) => env.NSRDB_API_KEY,
    email: (env) => env.NSRDB_EMAIL,
  },
  /**
   * The weather, which is the one upstream nothing in this app can do without.
   *
   * Two datasets on one path: `daily=` is the 1991-2020 climate normals and `hourly=` is the
   * 2015-2024 record the typical year is built from. Both windows are closed and in the past, so
   * an answer is good for as long as the cache will hold it. No credential, and no host binding:
   * unlike NSRDB this one has not moved, and a var that nothing can be checked against is a var
   * that goes stale silently
   */
  {
    upstream: 'open-meteo',
    path: '/v1/archive',
    dataset: 'era5-archive',
    host: () => 'archive-api.open-meteo.com',
    variant: queryVariant,
  },
  /**
   * The place-name lookup.
   *
   * Three things it could not do from a browser and can do here. It could not identify itself:
   * the OSM policy asks for a User-Agent naming the application, and a browser may not set one,
   * so every search arrived anonymous. It could not share an answer: thirty people in a room
   * looking up the same town were thirty requests, where here they are one. And its own throttle
   * was per tab, which is not what a rate limit means.
   *
   * Keyed on the query, because a search has no location. The reverse
   * lookup below is the same upstream on the other side of that line: it is given a point and
   * asked what is there, so it keys like everything else in this file
   */
  {
    upstream: 'nominatim',
    path: '/search',
    dataset: 'search',
    host: () => 'nominatim.openstreetmap.org',
    subject: 'query',
    ttlSeconds: TTL_GEOCODE_SECONDS,
    headers: (env) => ({ 'User-Agent': identifyingUserAgent(env), 'Accept-Language': 'en' }),
  },
  {
    upstream: 'nominatim',
    path: '/reverse',
    dataset: 'reverse',
    host: () => 'nominatim.openstreetmap.org',
    ttlSeconds: TTL_GEOCODE_SECONDS,
    headers: (env) => ({ 'User-Agent': identifyingUserAgent(env), 'Accept-Language': 'en' }),
  },
  /**
   * The fallback geocoder, proxied for the same reasons and one more: a fallback that still went
   * out from the browser would mean the leg that runs precisely when Nominatim is refusing us is
   * the leg with none of the manners that stop it refusing us
   */
  {
    upstream: 'photon',
    path: '/api',
    dataset: 'search',
    host: () => 'photon.komoot.io',
    subject: 'query',
    ttlSeconds: TTL_GEOCODE_SECONDS,
    headers: (env) => ({ 'User-Agent': identifyingUserAgent(env) }),
  },
  /**
   * The retail price of electricity, which the economy block needs and a browser must not hold
   * the key for.
   *
   * One path, and deliberately only one. `api.eia.gov/v2` is a general query API over every
   * series EIA publishes, so an allowlist entry per dataset is what stops a free key of ours
   * becoming somebody else's data pipeline; the annual residential price is the one series this
   * app asks for. Keyed on the query, because a state code is not a point
   * this proxy could quantise
   */
  {
    upstream: 'eia',
    path: '/v2/electricity/retail-sales/data/',
    dataset: 'retail-sales',
    host: () => 'api.eia.gov',
    apiKey: (env) => env.EIA_API_KEY,
    subject: 'params',
    ttlSeconds: TTL_RETAIL_PRICE_SECONDS,
  },
]

export const jsonError = (status: number, message: string): Response =>
  new Response(JSON.stringify({ error: message }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })

export const matchRoute = (pathname: string): Route | null => {
  if (!pathname.startsWith(`${PROXY_PREFIX}/`)) return null
  const rest = pathname.slice(PROXY_PREFIX.length + 1)
  const boundary = rest.indexOf('/')
  if (boundary < 0) return null
  const upstream = rest.slice(0, boundary)
  const path = rest.slice(boundary)
  return ROUTES.find((route) => route.upstream === upstream && route.path === path) ?? null
}

export interface Coordinates {
  readonly latitudeDeg: number
  readonly longitudeDeg: number
}

const WKT_POINT = /^\s*POINT\s*\(\s*(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s*\)\s*$/i

const inRange = (latitudeDeg: number, longitudeDeg: number): Coordinates | null =>
  Number.isFinite(latitudeDeg) &&
  Number.isFinite(longitudeDeg) &&
  Math.abs(latitudeDeg) <= 90 &&
  Math.abs(longitudeDeg) <= 180
    ? { latitudeDeg, longitudeDeg }
    : null

/**
 * Three upstreams, three ways of writing down one point, one cache key.
 *
 * PVGIS takes `lat`/`lon`, NSRDB takes `wkt=POINT(lon lat)`, and open-meteo spells them out as
 * `latitude`/`longitude`. None of that is a difference the cache is entitled to see
 */
export const coordinatesOf = (params: URLSearchParams): Coordinates | null => {
  const wkt = params.get('wkt')
  if (wkt !== null) {
    const match = WKT_POINT.exec(wkt)
    return match === null ? null : inRange(Number(match[2]), Number(match[1]))
  }
  // a `locations=lat,lon` parameter spells one point out in one value, and a batch of them
  // spells out several: a key built from the first of a batch would claim to answer for all of them
  const locations = params.get('locations')?.trim()
  if (locations !== undefined && locations !== '') {
    if (locations.includes('|')) return null
    const [lat, lon] = locations.split(',').map((entry) => entry.trim())
    return lat === undefined || lat === '' || lon === undefined || lon === ''
      ? null
      : inRange(Number(lat), Number(lon))
  }
  // `Number('')` is 0, so an empty parameter would otherwise resolve to Null Island
  const lat = (params.get('lat') ?? params.get('latitude'))?.trim()
  const lon = (params.get('lon') ?? params.get('longitude'))?.trim()
  return lat === undefined || lat === '' || lon === undefined || lon === ''
    ? null
    : inRange(Number(lat), Number(lon))
}

/**
 * The key must never ride back out on an error body. api.data.gov echoes the request query
 * into its validation errors, and while it strips `api_key` itself today, that is its choice
 * and not a guarantee this proxy is entitled to rely on
 */
export const redactKey = (text: string, key: string | undefined): string =>
  (key === undefined || key === '' ? text : text.split(key).join('[redacted]')).replace(
    /((?:api[-_]?key)=)[^&\s"']+/gi,
    '$1[redacted]',
  )

/** Long enough to name a cause, short enough that an upstream HTML error page is not relayed */
const REASON_LIMIT = 300

const reasonOf = async (response: Response, key: string | undefined): Promise<string> => {
  const body = await response.text().catch(() => '')
  const flattened = redactKey(body, key).replace(/\s+/g, ' ').trim()
  return flattened === '' ? response.statusText : flattened.slice(0, REASON_LIMIT)
}

/**
 * An upstream failure keeps its own status and its own words.
 *
 * Collapsing every non-ok response into `502 upstream request failed` would make a bad parameter, a
 * rejected key and a genuine outage indistinguishable from outside.
 *
 * A 4xx is the caller's to act on and is forwarded as it stands. A 5xx stays a 502, because a
 * caller must not be told that THIS service failed when its dependency did
 */
const fetchUpstream = async (
  url: string,
  key?: string,
  headers?: Record<string, string>,
): Promise<Response> => {
  try {
    const response = await fetch(url, {
      headers,
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    })
    if (response.ok) return response
    const status = response.status >= 400 && response.status < 500 ? response.status : 502
    return jsonError(
      status,
      `upstream responded ${String(response.status)}: ${await reasonOf(response, key)}`,
    )
  } catch (error) {
    const isTimeout = error instanceof Error && error.name === 'TimeoutError'
    return jsonError(
      isTimeout ? 504 : 502,
      isTimeout ? 'upstream request timed out' : 'upstream request failed',
    )
  }
}

const upstreamUrl = (
  route: Route,
  params: URLSearchParams,
  env: ProxyEnv,
  key?: string,
  email?: string,
): string => {
  const url = new URL(`https://${route.host(env)}${route.path}`)
  url.search = params.toString()
  // the key only ever exists on the edge: strip any client-supplied variant first
  for (const name of ['api_key', 'api-key', 'apikey']) url.searchParams.delete(name)
  if (key !== undefined) url.searchParams.set('api_key', key)
  // the same for the address: `set` replaces every value a caller sent under that name
  if (email !== undefined) url.searchParams.set('email', email)
  return url.toString()
}

/**
 * What this request is about, as a cache key, or the refusal that says why it is not about
 * anything. Two shapes because there are two kinds of question: where is this point, and where
 * is this place called
 */
/**
 * The words, and where they were asked from. A search sent with a bias (Nominatim's `viewbox`,
 * Photon's `lat` and `lon`: the app sends the current place, coarsened to a tenth of a degree, so
 * "Amherst" typed in Massachusetts lists the one in Massachusetts first) is a different question
 * from the same words asked with none, and a key on the words alone would hand the first asker's
 * list to everyone for a week
 */
export const searchKeyQuery = (query: string, params: URLSearchParams): string => {
  const bias = ['viewbox', 'lat', 'lon']
    .map((name) => [name, params.get(name)?.trim() ?? ''] as const)
    .filter(([, value]) => value !== '')
    .map(([name, value]) => `${name}=${value}`)
    .join('&')
  return bias === '' ? query : `${query} |${bias}`
}

const subjectKeyFor = (route: Route, params: URLSearchParams): string | Response => {
  if (route.subject === 'params') {
    const variant = queryVariant(params)
    // a bare path here would ask the upstream for every series it has, capped only by its own
    // row limit, and cache the answer for a month. The same cap as a geocode query applies for
    // the same reason: this proxy holds the key, so what can be asked with it is our problem
    if (variant === '') return jsonError(400, 'a query is required: this route has no default')
    if (variant.length > QUERY_LIMIT) {
      return jsonError(400, `a query may be at most ${String(QUERY_LIMIT)} characters`)
    }
    return buildQueryCacheKey({
      upstream: route.upstream,
      query: variant,
      dataset: route.dataset,
      schemaVersion: CACHE_SCHEMA_VERSION,
    })
  }
  if (route.subject === 'query') {
    const query = params.get('q')?.trim() ?? ''
    if (query === '') return jsonError(400, 'a query is required: q=<place name or address>')
    if (query.length > QUERY_LIMIT) {
      return jsonError(400, `a query may be at most ${String(QUERY_LIMIT)} characters`)
    }
    return buildQueryCacheKey({
      upstream: route.upstream,
      query: searchKeyQuery(query, params),
      dataset: route.dataset,
      schemaVersion: CACHE_SCHEMA_VERSION,
    })
  }
  const coordinates = coordinatesOf(params)
  if (coordinates === null) {
    return jsonError(
      400,
      'a location is required: lat and lon within [-90,90] / [-180,180], or wkt=POINT(lon lat)',
    )
  }
  return buildCacheKey({
    upstream: route.upstream,
    latitudeDeg: coordinates.latitudeDeg,
    longitudeDeg: coordinates.longitudeDeg,
    dataset: route.dataset,
    variant: route.variant?.(params) ?? params.get('startyear') ?? params.get('names') ?? 'default',
    schemaVersion: CACHE_SCHEMA_VERSION,
  })
}

const unconfigured = (route: Route, binding: 'API_KEY' | 'EMAIL'): Response =>
  jsonError(
    503,
    `${route.upstream} is not configured: ${route.upstream.toUpperCase()}_${binding} secret is unset`,
  )

/**
 * The per-caller limit, keyed on the connecting address the way the helper's is.
 *
 * The allowlist pins what can be asked, and nothing stopped one script asking it all day with
 * the NSRDB and EIA keys. `withCache` asks this after both cache tiers have missed and before the
 * upstream is called, so a hit costs nobody anything and what is metered is exactly what spends
 * a quota: 120 a minute is a site resolve every half second, which is a script and not a person.
 * The refusal is cached nowhere. No binding, as under local dev, means no limit, which is right
 */
const admitCaller = async (context: RouteContext): Promise<Response | null> => {
  if (context.env.PROXY_LIMIT === undefined) return null
  const key = context.request.headers.get('CF-Connecting-IP') ?? 'unknown'
  const { success } = await context.env.PROXY_LIMIT.limit({ key })
  if (success) return null
  const refusal = jsonError(429, 'too many requests from this address: try again in a minute')
  // the window in wrangler.jsonc, as seconds
  refusal.headers.set('Retry-After', '60')
  return refusal
}

export const handleRoute = async (route: Route, context: RouteContext): Promise<Response> => {
  const { searchParams } = new URL(context.request.url)
  const cacheKey = subjectKeyFor(route, searchParams)
  if (typeof cacheKey !== 'string') return cacheKey

  // a config fault, not an upstream fault, so it is never cached and never reported as a 502.
  // The secret is named after the upstream it belongs to, so the cause names itself: there is no
  // second literal that could drift from the binding it is describing
  const key = route.apiKey?.(context.env)
  if (route.apiKey !== undefined && (key === undefined || key === '')) {
    return unconfigured(route, 'API_KEY')
  }
  const email = route.email?.(context.env)
  if (route.email !== undefined && (email === undefined || email === '')) {
    return unconfigured(route, 'EMAIL')
  }

  return withCache(
    cacheKey,
    route.ttlSeconds ?? TTL_TMY_SECONDS,
    context.ctx,
    () =>
      fetchUpstream(
        upstreamUrl(route, searchParams, context.env, key, email),
        key,
        route.headers?.(context.env),
      ),
    { store: context.env.WEATHER_CACHE, admit: () => admitCaller(context) },
  )
}

/**
 * No `*` branch by design: the deployed frontend is same-origin with the proxy and so sends
 * no Origin header at all, which leaves a wildcard with no legitimate use and every
 * illegitimate one
 */
export const corsHeaders: (env: ProxyEnv, origin: string | null) => Headers = (env, origin) => {
  const headers = new Headers()
  const allowed = env.ALLOWED_ORIGINS.split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0)
  if (origin !== null && allowed.includes(origin)) {
    headers.set('Access-Control-Allow-Origin', origin)
  }
  headers.set('Access-Control-Allow-Methods', 'GET, OPTIONS')
  headers.set('Access-Control-Allow-Headers', 'Content-Type')
  headers.set('Vary', 'Origin')
  return headers
}
