import { afterEach, describe, expect, it } from 'bun:test'
import { vi } from '../../test/vi'
import type { ExecutionContextLike, ProxyEnv } from './env'
import {
  coordinatesOf,
  corsHeaders,
  handleRoute,
  matchRoute,
  PROXY_PREFIX,
  identifyingUserAgent,
  QUERY_LIMIT,
  queryVariant,
  ROUTES,
  searchKeyQuery,
  UPSTREAM_TIMEOUT_MS,
} from './routes'
import {
  buildCacheKey,
  buildQueryCacheKey,
  normaliseQuery,
  TTL_GEOCODE_SECONDS,
  TTL_RETAIL_PRICE_SECONDS,
  TTL_TMY_SECONDS,
} from './cache'

const ENV: ProxyEnv = {
  NSRDB_API_KEY: 'secret-key',
  NSRDB_EMAIL: 'grower@example.org',
  EIA_API_KEY: 'eia-secret-key',
  NSRDB_HOST: 'developer.nlr.gov',
  PVGIS_HOST: 're.jrc.ec.europa.eu',
  ALLOWED_ORIGINS: 'https://garden.example.org,http://localhost:5173',
}

const ctx: ExecutionContextLike = { waitUntil: () => undefined }

const passthroughCaches = (): void => {
  const cache = { match: () => Promise.resolve(undefined), put: () => Promise.resolve() }
  vi.stubGlobal('caches', { default: cache, open: () => Promise.resolve(cache) })
}

const captureFetch = (response = new Response('upstream body')): { url: () => string } => {
  let requested = ''
  vi.stubGlobal('fetch', (url: string) => {
    requested = url
    return Promise.resolve(response)
  })
  return { url: () => requested }
}

const call = (path: string, env: ProxyEnv = ENV): Promise<Response> => {
  const route = matchRoute(new URL(`https://host${path}`).pathname)
  if (route === null) throw new Error(`no route for ${path}`)
  return handleRoute(route, { request: new Request(`https://host${path}`), env, ctx })
}

afterEach(() => {
  vi.unstubAllGlobals()
})

const PVGIS_PATH = `${PROXY_PREFIX}/pvgis/api/v5_3/tmy`
const NSRDB_PATH = `${PROXY_PREFIX}/nsrdb/api/nsrdb/v2/solar/nsrdb-GOES-tmy-v4-0-0-download.csv`
const METEO_PATH = `${PROXY_PREFIX}/open-meteo/v1/archive`
const SEARCH_PATH = `${PROXY_PREFIX}/nominatim/search`
const REVERSE_PATH = `${PROXY_PREFIX}/nominatim/reverse`
const PHOTON_PATH = `${PROXY_PREFIX}/photon/api`
const EIA_PATH = `${PROXY_PREFIX}/eia/v2/electricity/retail-sales/data/`

/** the annual residential query `src/data/retail-price.ts` actually builds, in its own words */
const EIA_QUERY =
  'frequency=annual&data%5B0%5D=price&facets%5Bstateid%5D%5B%5D=MA&facets%5Bsectorid%5D%5B%5D=RES&sort%5B0%5D%5Bcolumn%5D=period&sort%5B0%5D%5Bdirection%5D=desc&length=1'

/** the two open-meteo requests `src/data` actually builds, in their own words */
const NORMALS_QUERY =
  'latitude=42.3736&longitude=-72.5199&start_date=1991-01-01&end_date=2020-12-31&daily=temperature_2m_min&timezone=UTC'
const HOURLY_QUERY =
  'latitude=42.3736&longitude=-72.5199&start_date=2015-01-01&end_date=2024-12-31&hourly=shortwave_radiation&timezone=UTC'

describe('matchRoute', () => {
  it('resolves the two paths src/data/http.ts actually builds', () => {
    expect(matchRoute(PVGIS_PATH)?.upstream).toBe('pvgis')
    expect(matchRoute(NSRDB_PATH)?.upstream).toBe('nsrdb')
  })

  it('gives every route a distinct cache dataset', () => {
    expect(new Set(ROUTES.map((route) => `${route.upstream}/${route.dataset}`)).size).toBe(
      ROUTES.length,
    )
  })

  it('is an allowlist, not an open relay for the upstream hosts', () => {
    expect(matchRoute(`${PROXY_PREFIX}/pvgis/api/v5_3/seriescalc`)).toBeNull()
    expect(matchRoute(`${PROXY_PREFIX}/pvgis/api/v5_3/tmy/../../admin`)).toBeNull()
    expect(
      matchRoute(`${PROXY_PREFIX}/nsrdb/api/nsrdb/v2/solar/nsrdb-GOES-tmy-v4-0-0-download.csv/x`),
    ).toBeNull()
  })

  it('rejects unknown upstreams and anything outside the proxy prefix', () => {
    expect(matchRoute(`${PROXY_PREFIX}/overpass/api/interpreter`)).toBeNull()
    expect(matchRoute('/api/v5_3/tmy')).toBeNull()
    expect(matchRoute('/api/proxyish/pvgis/api/v5_3/tmy')).toBeNull()
    expect(matchRoute(PROXY_PREFIX)).toBeNull()
    expect(matchRoute(`${PROXY_PREFIX}/pvgis`)).toBeNull()
  })
})

describe('coordinatesOf', () => {
  it('reads pvgis lat/lon and nsrdb wkt to the same point', () => {
    const fromParams = coordinatesOf(new URLSearchParams({ lat: '42.37', lon: '-71.06' }))
    const fromWkt = coordinatesOf(new URLSearchParams({ wkt: 'POINT(-71.06 42.37)' }))
    expect(fromParams).toEqual({ latitudeDeg: 42.37, longitudeDeg: -71.06 })
    expect(fromWkt).toEqual(fromParams)
  })

  it('rejects out-of-range, absent, malformed and non-numeric locations', () => {
    expect(coordinatesOf(new URLSearchParams({ lat: '91', lon: '0' }))).toBeNull()
    expect(coordinatesOf(new URLSearchParams({ lat: '0', lon: '181' }))).toBeNull()
    expect(coordinatesOf(new URLSearchParams({ lat: '42.37' }))).toBeNull()
    expect(coordinatesOf(new URLSearchParams())).toBeNull()
    expect(coordinatesOf(new URLSearchParams({ lat: 'NaN', lon: '0' }))).toBeNull()
    expect(coordinatesOf(new URLSearchParams({ wkt: 'POLYGON((0 0))' }))).toBeNull()
    expect(coordinatesOf(new URLSearchParams({ wkt: 'POINT(-71.06)' }))).toBeNull()
  })

  it('does not silently read a missing coordinate as zero', () => {
    expect(coordinatesOf(new URLSearchParams({ lat: '', lon: '' }))).toBeNull()
  })
})

/**
 * The upstream that sits behind this proxy for load and holds no credential.
 *
 * It is free, unauthenticated and rate limited per IP, and it is called on every site resolve. A
 * measured session earned a 429 from open-meteo after a handful of reloads by one person; a
 * lecture hall opening this at once is the case that matters
 */
describe('the weather, cached at the edge', () => {
  it('routes the path src/data actually builds', () => {
    expect(matchRoute(METEO_PATH)?.upstream).toBe('open-meteo')
  })

  it('forwards the weather query verbatim to open-meteo', async () => {
    passthroughCaches()
    const fetched = captureFetch()
    await call(`${METEO_PATH}?${HOURLY_QUERY}`)
    const url = new URL(fetched.url())
    expect(url.host).toBe('archive-api.open-meteo.com')
    expect(url.pathname).toBe('/v1/archive')
    expect(url.searchParams.get('hourly')).toBe('shortwave_radiation')
    expect(url.searchParams.get('latitude')).toBe('42.3736')
  })

  it('reads a location however the upstream spells it', () => {
    const point = { latitudeDeg: 42.37, longitudeDeg: -71.06 }
    expect(coordinatesOf(new URLSearchParams('latitude=42.37&longitude=-71.06'))).toEqual(point)
    expect(coordinatesOf(new URLSearchParams('locations=42.37,-71.06'))).toEqual(point)
    // a batch of points would give one key that claimed to answer for all of them
    expect(coordinatesOf(new URLSearchParams('locations=42.37,-71.06|10,10'))).toBeNull()
    expect(coordinatesOf(new URLSearchParams('locations='))).toBeNull()
    expect(coordinatesOf(new URLSearchParams('latitude=42.37'))).toBeNull()
    expect(coordinatesOf(new URLSearchParams('locations=42.37,notanumber'))).toBeNull()
  })

  /**
   * The failure this variant exists to prevent. Both open-meteo datasets are `/v1/archive` for
   * one point, so a key built from path and location alone would hand thirty years of daily
   * means to a caller that asked for 8,760 hourly records, out of a cache that believed it was
   * right
   */
  it('never lets the climate normals and the hourly record share a cache key', () => {
    const normals = new URLSearchParams(NORMALS_QUERY)
    const hourly = new URLSearchParams(HOURLY_QUERY)
    expect(queryVariant(normals)).not.toBe(queryVariant(hourly))
    const keyFor = (params: URLSearchParams): string =>
      buildCacheKey({
        upstream: 'open-meteo',
        latitudeDeg: 42.3736,
        longitudeDeg: -72.5199,
        dataset: 'era5-archive',
        variant: queryVariant(params),
        schemaVersion: 1,
      })
    expect(keyFor(normals)).not.toBe(keyFor(hourly))
  })

  /**
   * The whole point: two visitors in the same town are one upstream request. The location is
   * quantised in the key already, so folding the raw coordinates into the variant as well would
   * give every visitor an entry of their own and cache nothing
   */
  it('leaves the location out of the variant, and does not mind the order of the rest', () => {
    expect(queryVariant(new URLSearchParams(HOURLY_QUERY))).not.toContain('42.3736')
    expect(
      queryVariant(new URLSearchParams('latitude=1&longitude=2&locations=3,4&lat=5&lon=6&wkt=x')),
    ).toBe('')
    expect(queryVariant(new URLSearchParams('b=2&a=1'))).toBe(
      queryVariant(new URLSearchParams('a=1&b=2')),
    )
  })

  /**
   * A rate limit is forwarded rather than swallowed, and `withCache` holds it for
   * `TTL_ERROR_SECONDS`, which turns a stampede into one upstream request a minute
   */
  it('forwards a rate limit as a rate limit', async () => {
    passthroughCaches()
    captureFetch(new Response('slow down', { status: 429 }))
    const response = await call(`${METEO_PATH}?${HOURLY_QUERY}`)
    expect(response.status).toBe(429)
  })
})

describe('handleRoute upstream construction', () => {
  it('forwards the pvgis query verbatim to the configured host', async () => {
    passthroughCaches()
    const fetched = captureFetch()
    await call(`${PVGIS_PATH}?lat=42.37&lon=-71.06&outputformat=json`)
    expect(fetched.url()).toBe(
      'https://re.jrc.ec.europa.eu/api/v5_3/tmy?lat=42.37&lon=-71.06&outputformat=json',
    )
  })

  it('injects the nsrdb key server-side and never trusts a client-supplied one', async () => {
    passthroughCaches()
    const fetched = captureFetch()
    await call(`${NSRDB_PATH}?wkt=POINT(-71.06+42.37)&names=tmy&api_key=attacker&apikey=attacker`)
    const url = new URL(fetched.url())
    expect(url.host).toBe('developer.nlr.gov')
    expect(url.searchParams.getAll('api_key')).toEqual(['secret-key'])
    expect(url.searchParams.has('apikey')).toBe(false)
  })

  /**
   * The upstream wants a real address on every request and the client never sends one, so
   * without this the NSRDB leg answered 400 to every caller. Attached the way the key is, and a
   * caller's own `email` is replaced rather than joined
   */
  it('injects the nsrdb email server-side and never trusts a client-supplied one', async () => {
    passthroughCaches()
    const fetched = captureFetch()
    await call(`${NSRDB_PATH}?wkt=POINT(-71.06+42.37)&names=tmy&email=attacker%40evil.example`)
    expect(new URL(fetched.url()).searchParams.getAll('email')).toEqual(['grower@example.org'])
  })

  it('applies a bounded upstream timeout', () => {
    expect(UPSTREAM_TIMEOUT_MS).toBe(15_000)
  })
})

describe('handleRoute error paths', () => {
  it('400s a request with no usable location', async () => {
    passthroughCaches()
    captureFetch()
    const response = await call(`${PVGIS_PATH}?outputformat=json`)
    expect(response.status).toBe(400)
    expect(await response.json()).toMatchObject({ error: expect.stringContaining('location') })
  })

  it('503s with a named cause when the NSRDB secret is unset, and does not call upstream', async () => {
    passthroughCaches()
    const spy = vi.fn(() => Promise.resolve(new Response('')))
    vi.stubGlobal('fetch', spy)
    const response = await call(`${NSRDB_PATH}?wkt=POINT(-71.06+42.37)&names=tmy`, {
      ...ENV,
      NSRDB_API_KEY: undefined,
    })
    expect(response.status).toBe(503)
    expect(await response.json()).toEqual({
      error: 'nsrdb is not configured: NSRDB_API_KEY secret is unset',
    })
    expect(spy).not.toHaveBeenCalled()
  })

  it('treats an empty secret as unset rather than sending api_key=', async () => {
    passthroughCaches()
    captureFetch()
    const response = await call(`${NSRDB_PATH}?wkt=POINT(-71.06+42.37)&names=tmy`, {
      ...ENV,
      NSRDB_API_KEY: '',
    })
    expect(response.status).toBe(503)
  })

  it('503s with a named cause when the NSRDB email is unset or empty, and does not call upstream', async () => {
    passthroughCaches()
    const spy = vi.fn(() => Promise.resolve(new Response('')))
    vi.stubGlobal('fetch', spy)
    for (const email of [undefined, '']) {
      const response = await call(`${NSRDB_PATH}?wkt=POINT(-71.06+42.37)&names=tmy`, {
        ...ENV,
        NSRDB_EMAIL: email,
      })
      expect(response.status).toBe(503)
      expect(await response.json()).toEqual({
        error: 'nsrdb is not configured: NSRDB_EMAIL secret is unset',
      })
    }
    expect(spy).not.toHaveBeenCalled()
  })

  /**
   * A 4xx keeps its own status and its own words. Collapsing every failure into `502 upstream
   * request failed` would make a bad parameter, a rejected key and a real outage look identical:
   * NSRDB answers 400 naming the parameter it wants, and the caller has to see that
   */
  it('forwards a 4xx upstream status and the reason it gave', async () => {
    passthroughCaches()
    captureFetch(
      new Response('{"errors":["The required \'email\' parameter must be valid"]}', {
        status: 400,
      }),
    )
    const response = await call(`${NSRDB_PATH}?wkt=POINT(-71.06+42.37)&names=tmy`)
    expect(response.status).toBe(400)
    expect(String((await response.json()).error)).toContain('email')
  })

  it('keeps a 5xx as a 502, so a caller is never told THIS service failed', async () => {
    passthroughCaches()
    captureFetch(new Response('upstream exploded', { status: 503 }))
    const response = await call(`${PVGIS_PATH}?lat=42.37&lon=-71.06`)
    expect(response.status).toBe(502)
  })

  it('never lets the key ride back out on an upstream error body', async () => {
    passthroughCaches()
    captureFetch(new Response(`bad request for api_key=${ENV.NSRDB_API_KEY}`, { status: 403 }))
    const response = await call(`${NSRDB_PATH}?wkt=POINT(-71.06+42.37)&names=tmy`)
    const body = String((await response.json()).error)
    expect(body).not.toContain(ENV.NSRDB_API_KEY)
    expect(body).toContain('[redacted]')
  })

  it('504s an upstream timeout', async () => {
    passthroughCaches()
    vi.stubGlobal('fetch', () => {
      const error = new Error('timed out')
      error.name = 'TimeoutError'
      return Promise.reject(error)
    })
    const response = await call(`${PVGIS_PATH}?lat=42.37&lon=-71.06`)
    expect(response.status).toBe(504)
    expect(await response.json()).toEqual({ error: 'upstream request timed out' })
  })

  it('502s a network failure', async () => {
    passthroughCaches()
    vi.stubGlobal('fetch', () => Promise.reject(new Error('ECONNREFUSED')))
    const response = await call(`${PVGIS_PATH}?lat=42.37&lon=-71.06`)
    expect(response.status).toBe(502)
  })
})

/**
 * The allowlist pins what can be asked, and nothing stopped one script asking it all day with the
 * NSRDB and EIA keys. The limit sits after the cache lookup and before the upstream call, so a
 * hit costs nobody anything and what is metered is exactly what spends a quota
 */
describe('the per-caller limit', () => {
  /** A stand-in for the ratelimit binding: a count per key, refusing past the window's limit */
  const fakeLimit = (
    limit: number,
  ): { readonly env: ProxyEnv; readonly keys: () => readonly string[] } => {
    const counts = new Map<string, number>()
    return {
      env: {
        ...ENV,
        PROXY_LIMIT: {
          limit: ({ key }) => {
            const count = (counts.get(key) ?? 0) + 1
            counts.set(key, count)
            return Promise.resolve({ success: count <= limit })
          },
        },
      },
      keys: () => [...counts.keys()],
    }
  }

  /** a fresh upstream body per call, since a Response body can be read once */
  const freshFetch = (): { calls: () => number } => {
    let calls = 0
    vi.stubGlobal('fetch', () => {
      calls += 1
      return Promise.resolve(new Response('upstream body'))
    })
    return { calls: () => calls }
  }

  const from = (address: string, env: ProxyEnv): Promise<Response> => {
    const url = `https://host${PVGIS_PATH}?lat=42.37&lon=-71.06`
    const route = matchRoute(new URL(url).pathname)
    if (route === null) throw new Error('no pvgis route')
    return handleRoute(route, {
      request: new Request(url, { headers: { 'CF-Connecting-IP': address } }),
      env,
      ctx,
    })
  }

  it('turns the 121st upstream call in a minute away, with a minute to wait', async () => {
    passthroughCaches()
    const fetched = freshFetch()
    const limited = fakeLimit(120)
    for (let i = 0; i < 120; i += 1) {
      expect((await from('203.0.113.7', limited.env)).status).toBe(200)
    }
    const refused = await from('203.0.113.7', limited.env)
    expect(refused.status).toBe(429)
    expect(refused.headers.get('Retry-After')).toBe('60')
    expect(await refused.json()).toEqual({
      error: 'too many requests from this address: try again in a minute',
    })
    expect(fetched.calls()).toBe(120)
    // keyed on the connecting address, so another caller is not turned away with the first
    expect(limited.keys()).toEqual(['203.0.113.7'])
    expect((await from('198.51.100.9', limited.env)).status).toBe(200)
  })

  it('does not count a cache hit', async () => {
    const cache = {
      match: () => Promise.resolve(new Response('cached')),
      put: () => Promise.resolve(),
    }
    vi.stubGlobal('caches', { default: cache, open: () => Promise.resolve(cache) })
    const fetched = freshFetch()
    const limited = fakeLimit(0)
    const response = await from('203.0.113.7', limited.env)
    expect(await response.text()).toBe('cached')
    expect(limited.keys()).toEqual([])
    expect(fetched.calls()).toBe(0)
  })

  it('runs with no limit at all where there is no binding, which is local dev', async () => {
    passthroughCaches()
    freshFetch()
    expect((await from('203.0.113.7', ENV)).status).toBe(200)
  })
})

describe('corsHeaders', () => {
  it('echoes an allowed origin and varies on it', () => {
    const headers = corsHeaders(ENV, 'https://garden.example.org')
    expect(headers.get('Access-Control-Allow-Origin')).toBe('https://garden.example.org')
    expect(headers.get('Vary')).toBe('Origin')
    expect(headers.get('Access-Control-Allow-Methods')).toBe('GET, OPTIONS')
  })

  it('tolerates whitespace around configured entries', () => {
    const env = { ...ENV, ALLOWED_ORIGINS: ' https://a.example ,  https://b.example ' }
    expect(corsHeaders(env, 'https://b.example').get('Access-Control-Allow-Origin')).toBe(
      'https://b.example',
    )
  })

  it('omits the header for an origin that is not listed', () => {
    for (const origin of [
      'https://evil.example',
      'https://garden.example.org.evil.example',
      'http://garden.example.org',
      null,
    ]) {
      expect(corsHeaders(ENV, origin).get('Access-Control-Allow-Origin')).toBeNull()
    }
  })

  it('allows nothing when ALLOWED_ORIGINS is empty, and has no wildcard escape', () => {
    for (const allowed of ['', ' ', '*']) {
      const headers = corsHeaders({ ...ENV, ALLOWED_ORIGINS: allowed }, 'https://evil.example')
      expect(headers.get('Access-Control-Allow-Origin')).toBeNull()
    }
  })
})

/**
 * The place-name lookup, which a browser could never have done politely.
 *
 * Three things this leg exists for, and each has a test below: it identifies the application in
 * the way the OSM usage policy asks and a browser is forbidden from doing; it shares one answer
 * between every visitor asking the same question, which is what "cache where possible" means
 * when the callers are thirty people in a room; and it keys on the words rather than on a point,
 * because a search is the question that produces a point and has none of its own
 */
describe('the geocoders, which have a policy rather than a rate limit', () => {
  it('routes the three paths src/data actually builds', () => {
    expect(matchRoute(SEARCH_PATH)?.upstream).toBe('nominatim')
    expect(matchRoute(REVERSE_PATH)?.upstream).toBe('nominatim')
    expect(matchRoute(PHOTON_PATH)?.upstream).toBe('photon')
    // and nothing else on those hosts: an allowlist, not a passthrough
    expect(matchRoute(`${PROXY_PREFIX}/nominatim/status.php`)).toBeNull()
    expect(matchRoute(`${PROXY_PREFIX}/nominatim/lookup`)).toBeNull()
  })

  it('tells the upstream who is asking, which is the whole reason it is proxied', async () => {
    passthroughCaches()
    let sent: HeadersInit | undefined
    vi.stubGlobal('fetch', (_url: string, init?: RequestInit) => {
      sent = init?.headers
      return Promise.resolve(new Response('[]'))
    })
    await call(`${SEARCH_PATH}?q=amherst`)
    const agent = (sent as Record<string, string> | undefined)?.['User-Agent'] ?? ''
    expect(agent).toContain('agrivoltaic-garden-designer')
    // and says where to find whoever runs it, taken from the origins this proxy serves
    expect(agent).toContain('https://garden.example.org')
  })

  it('falls back to the bare name when no origin is configured to point at', () => {
    expect(identifyingUserAgent({ ...ENV, ALLOWED_ORIGINS: '' })).toBe(
      'agrivoltaic-garden-designer',
    )
  })

  it('forwards the search verbatim to the upstream', async () => {
    passthroughCaches()
    const fetched = captureFetch(new Response('[]'))
    await call(`${SEARCH_PATH}?q=amherst+massachusetts&format=jsonv2&limit=8`)
    const url = new URL(fetched.url())
    expect(url.host).toBe('nominatim.openstreetmap.org')
    expect(url.pathname).toBe('/search')
    expect(url.searchParams.get('q')).toBe('amherst massachusetts')
    expect(url.searchParams.get('format')).toBe('jsonv2')
  })

  /**
   * One question, one cache entry. The upstream cannot tell these apart either, and a key that
   * could would mean the classroom case this proxy exists for still cost one request per person
   */
  it('treats the same question written three ways as one question', () => {
    const key = (query: string): string =>
      buildQueryCacheKey({ upstream: 'nominatim', query, dataset: 'search', schemaVersion: 1 })
    expect(key('Amherst, MA')).toBe(key(' amherst,  ma '))
    expect(key('AMHERST, MA')).toBe(key('Amherst, MA'))
    expect(normaliseQuery('  Two   Words ')).toBe('two words')
    // and two different questions are two entries, which is the half that is easy to break
    expect(key('amherst')).not.toBe(key('northampton'))
  })

  it('keys a search on the words and not on a location it does not have', () => {
    const key = buildQueryCacheKey({
      upstream: 'nominatim',
      query: 'amherst',
      dataset: 'search',
      schemaVersion: 1,
    })
    expect(key).toContain('/q/')
    expect(key).toContain('amherst')
    // encoded, because a cache key is a URL path and a place name can hold a slash or a space
    expect(
      buildQueryCacheKey({
        upstream: 'nominatim',
        query: 'a/b c',
        dataset: 'search',
        schemaVersion: 1,
      }),
    ).not.toContain('a/b')
  })

  /**
   * A biased search is a different question. The app sends the current place with the words
   * (Nominatim's `viewbox`, Photon's `lat` and `lon`), coarsened so a town shares one entry;
   * keyed on the words alone, "Amherst" asked from Virginia would be answered with the list a
   * visitor in Massachusetts had cached
   */
  it('keys a biased search apart from the same words asked from nowhere', () => {
    const plain = searchKeyQuery('amherst', new URLSearchParams('q=amherst'))
    const massachusetts = searchKeyQuery(
      'amherst',
      new URLSearchParams('q=amherst&viewbox=-75.5,39.4,-69.5,45.4'),
    )
    const virginia = searchKeyQuery(
      'amherst',
      new URLSearchParams('q=amherst&viewbox=-82.1,34.6,-76.1,40.6'),
    )
    expect(plain).toBe('amherst')
    expect(massachusetts).not.toBe(plain)
    expect(massachusetts).not.toBe(virginia)
    expect(
      searchKeyQuery('amherst', new URLSearchParams('q=amherst&lat=42.4&lon=-72.5')),
    ).toContain('lat=42.4')
  })

  it('refuses a search with nothing in it, rather than asking the upstream for nothing', async () => {
    passthroughCaches()
    captureFetch()
    for (const query of ['', '   ']) {
      const response = await call(`${SEARCH_PATH}?q=${encodeURIComponent(query)}`)
      expect(response.status).toBe(400)
      expect(await response.text()).toContain('query is required')
    }
    expect((await call(SEARCH_PATH)).status).toBe(400)
  })

  /**
   * The allowlist pins the host and the path, so this can never be a general relay; what it can
   * still be asked is anything a geocoder can be asked, and the risk that carries is our origin
   * being the one the upstream blocks
   */
  it('refuses a query long enough to be somebody else using this as their geocoder', async () => {
    passthroughCaches()
    captureFetch()
    const response = await call(`${SEARCH_PATH}?q=${'a'.repeat(QUERY_LIMIT + 1)}`)
    expect(response.status).toBe(400)
    expect(await response.text()).toContain('at most')
    // and the length that is a real place name is not refused
    expect((await call(`${SEARCH_PATH}?q=${'a'.repeat(QUERY_LIMIT)}`)).status).not.toBe(400)
  })

  /**
   * The other side of the same upstream: a reverse lookup IS about a point, so it keys like
   * everything else here and refuses without one
   */
  it('keys the reverse lookup on the point, and refuses without one', async () => {
    passthroughCaches()
    const fetched = captureFetch(new Response('{}'))
    await call(`${REVERSE_PATH}?lat=42.3736&lon=-72.5199&format=jsonv2`)
    expect(new URL(fetched.url()).pathname).toBe('/reverse')
    expect((await call(REVERSE_PATH)).status).toBe(400)
  })

  /**
   * A week, where a typical year is held for one. A closed fact cannot change; a place index
   * gains a street, and a grower typing an address added last month has to find it
   */
  it('holds a place name for a week rather than a year', () => {
    expect(matchRoute(SEARCH_PATH)?.ttlSeconds).toBe(TTL_GEOCODE_SECONDS)
    expect(TTL_GEOCODE_SECONDS).toBeLessThan(TTL_TMY_SECONDS)
  })
})

/**
 * The electricity price, which is the first route here that answers about a state rather than a
 * point, and the second that holds a credential a browser must never see
 */
describe('the retail electricity price', () => {
  it('injects the eia key server-side and never trusts a client-supplied one', async () => {
    passthroughCaches()
    const fetched = captureFetch(new Response('{}'))
    await call(`${EIA_PATH}?${EIA_QUERY}&api_key=attacker&apikey=attacker&api-key=attacker`)
    const url = new URL(fetched.url())
    expect(url.host).toBe('api.eia.gov')
    expect(url.pathname).toBe('/v2/electricity/retail-sales/data/')
    expect(url.searchParams.getAll('api_key')).toEqual(['eia-secret-key'])
    expect(url.searchParams.has('apikey')).toBe(false)
    expect(url.searchParams.has('api-key')).toBe(false)
    // and the query the client built arrives as the client built it
    expect(url.searchParams.get('facets[stateid][]')).toBe('MA')
    expect(url.searchParams.get('frequency')).toBe('annual')
  })

  /**
   * `api.eia.gov/v2` is a general query API over every series EIA publishes. One allowlisted
   * path is what keeps a free key of ours from becoming somebody else's data pipeline
   */
  it('refuses every other path on the same host', () => {
    expect(matchRoute(EIA_PATH)?.upstream).toBe('eia')
    expect(matchRoute(`${PROXY_PREFIX}/eia/v2/electricity/retail-sales`)).toBeNull()
    expect(matchRoute(`${PROXY_PREFIX}/eia/v2/electricity/rto/region-data/data/`)).toBeNull()
    expect(matchRoute(`${PROXY_PREFIX}/eia/v2/`)).toBeNull()
    expect(
      matchRoute(`${PROXY_PREFIX}/eia/v2/electricity/retail-sales/data/../../admin`),
    ).toBeNull()
  })

  it('503s with a named cause when the EIA secret is unset, and does not call upstream', async () => {
    passthroughCaches()
    const spy = vi.fn(() => Promise.resolve(new Response('')))
    vi.stubGlobal('fetch', spy)
    const response = await call(`${EIA_PATH}?${EIA_QUERY}`, { ...ENV, EIA_API_KEY: undefined })
    expect(response.status).toBe(503)
    expect(await response.json()).toEqual({
      error: 'eia is not configured: EIA_API_KEY secret is unset',
    })
    expect(spy).not.toHaveBeenCalled()
  })

  /**
   * A key-holding route with no parameters would ask the upstream for every series it has and
   * hold the answer for a month, so an empty question is refused the way an empty search is
   */
  it('refuses a request with nothing in it, and one long enough to be another query entirely', async () => {
    passthroughCaches()
    captureFetch(new Response('{}'))
    expect((await call(EIA_PATH)).status).toBe(400)
    expect((await call(`${EIA_PATH}?frequency=${'a'.repeat(QUERY_LIMIT)}`)).status).toBe(400)
  })

  it('keys two states apart, and holds a yearly figure for a month', () => {
    const keyFor = (state: string): string =>
      queryVariant(new URLSearchParams(EIA_QUERY.replace('%5B%5D=MA', `%5B%5D=${state}`)))
    expect(keyFor('MA')).not.toBe(keyFor('AZ'))
    // and the same question asked twice is one entry, which is what the cache is for
    expect(keyFor('MA')).toBe(keyFor('MA'))
    expect(matchRoute(EIA_PATH)?.ttlSeconds).toBe(TTL_RETAIL_PRICE_SECONDS)
    expect(TTL_RETAIL_PRICE_SECONDS).toBeLessThan(TTL_TMY_SECONDS)
    expect(TTL_RETAIL_PRICE_SECONDS).toBeGreaterThan(TTL_GEOCODE_SECONDS)
  })
})
