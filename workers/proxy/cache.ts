import type { ExecutionContextLike, KVStore } from './env'

/** Decimal places of latitude and longitude a key keeps, unless its route asks for more */
export const COORDINATE_DECIMALS = 2
export const TTL_TMY_SECONDS = 31_536_000
export const TTL_ERROR_SECONDS = 60
/**
 * A 5xx, which is an upstream down or one that outran `UPSTREAM_TIMEOUT_MS`, held for less than the
 * minute a 4xx gets. The client's own retries a quarter of a second apart still land on it, and so
 * does a room asking at once. Its scheduled retry a minute later gets a fresh attempt at the
 * upstream
 */
export const TTL_OUTAGE_SECONDS = 10

/**
 * A week, where a typical year is held for a year, and the difference is what the answer is about.
 *
 * A typical meteorological year is a closed fact: it can't change, so an answer is good for as
 * long as the cache will hold it. A place name is a live index that
 * gains a new street or a renamed village, and a grower typing an address that was added last
 * month has to be able to find it. A week is long enough that a classroom typing the same town
 * costs one upstream request, and short enough that the map catching up isn't a year away.
 *
 * Caching is also not this proxy's preference here: the OSM Nominatim usage policy asks callers
 * to cache results where possible, and it's the reason a browser shouldn't be talking to it
 * directly at all
 */
export const TTL_GEOCODE_SECONDS = 604_800

/**
 * A month, for the one answer here that is neither closed nor live.
 *
 * The annual retail price of electricity for a state gains exactly one new value a year, some
 * months into the year after it. A year would mean a garden could be shown a price a full
 * revision behind. A week would spend fifty-two upstream requests a year on a figure that moved
 * once. A month bounds the staleness at a twelfth of the cycle it is tracking
 */
export const TTL_RETAIL_PRICE_SECONDS = 2_592_000

/**
 * A year, for a map that doesn't change between releases.
 *
 * SoilGrids 2.0 is a published release, and the release is named in the path the route allows. An
 * answer for a pixel is as good a year on as the day it was read, so it stays until the cache lets
 * it go. A new release would come with a new path and a new entry, and the old answers would
 * never be read again
 */
export const TTL_SOIL_SECONDS = 31_536_000

/**
 * The upstreams whose answers this proxy holds.
 *
 * `pvgis`, `nsrdb` and `eia` are here because they need a credential or a policy exemption the
 * browser can't be given. `open-meteo` below is here for a different reason: it's free,
 * unauthenticated, per-IP rate limited, and every visit calls it. A classroom opening this at
 * once is thirty browsers asking the same question about the same town in the same minute, and a
 * measured session earned a 429 from open-meteo on a handful of reloads by one person. Cached at
 * the edge it is one upstream request per town per year.
 *
 * The two geocoders are here for a third reason again, and it's the one that can't be worked
 * around in a browser at all: the OSM Nominatim usage policy asks for a User-Agent that
 * identifies the application, and a browser isn't permitted to set one. Every request this app
 * made to Nominatim therefore arrived anonymous, at the rate of one per browser, uncached.
 *
 * `soilgrids` is here for `open-meteo`'s reason with two of its own: ISRIC publishes a fair-use
 * limit of 5 calls a minute for the API and calls it a beta with no uptime guarantee. A lookup
 * asks it up to five times, the point and then a ring of four that stops at the first reading, and
 * every page load made the lookup again. Cached at the edge, a place costs ISRIC its calls once a
 * year however many visitors ask about it, and a stall costs a visitor one `UPSTREAM_TIMEOUT_MS`,
 * because the 504 is held for the retries behind it
 */
export type CachedUpstream =
  | 'pvgis'
  | 'nsrdb'
  | 'open-meteo'
  | 'nominatim'
  | 'photon'
  | 'eia'
  | 'soilgrids'

export interface CacheKeyParts {
  readonly upstream: CachedUpstream
  readonly latitudeDeg: number
  readonly longitudeDeg: number
  /**
   * How many decimal places of latitude and longitude the key keeps. Two by default, which is a
   * square about 1.1 km across.
   *
   * A route asks for more when its upstream resolves finer than that. The upstream is asked for
   * the caller's exact point on a miss, so an entry holds the answer for whichever point asked
   * first, and a key coarser than the upstream's own cells hands that one point's answer to every
   * point in the square. SoilGrids has 250 m pixels, and at two decimals one garden's reading
   * would go to every garden within a kilometer
   */
  readonly coordinateDecimals?: number
  readonly dataset: string
  /**
   * What tells two answers from the same dataset apart.
   *
   * For PVGIS and NSRDB it is a year range, which is all they vary by. open-meteo serves the
   * climate normals and the hourly typical year from ONE path and tells them apart by query alone,
   * so a key that ignored the query would have served thirty years of daily means to a caller
   * asking for 8,760 hourly records, from a cache that thought it had the right answer
   */
  readonly variant: string
  readonly schemaVersion: number
}

export const quantizeCoordinate = (value: number, decimals = COORDINATE_DECIMALS): number => {
  const step = 10 ** -decimals
  return Math.round(value / step) * step
}

export const buildCacheKey = (parts: CacheKeyParts): string => {
  const decimals = parts.coordinateDecimals ?? COORDINATE_DECIMALS
  return [
    `v${parts.schemaVersion}`,
    parts.upstream,
    quantizeCoordinate(parts.latitudeDeg, decimals).toFixed(decimals),
    quantizeCoordinate(parts.longitudeDeg, decimals).toFixed(decimals),
    parts.dataset,
    parts.variant,
  ].join('/')
}

/**
 * The words somebody typed, as the thing a cached answer is about.
 *
 * A geocode search has no coordinates: it IS the question that produces them, so the location
 * half of the key above has nothing to put in it. Normalized first, because "Amherst, MA",
 * " amherst,  ma " and "AMHERST, MA" are one question and three cache entries otherwise, and the
 * upstream can't tell them apart either
 */
export const normalizeQuery = (query: string): string =>
  query.trim().toLowerCase().replace(/\s+/g, ' ')

export interface QueryCacheKeyParts {
  readonly upstream: CachedUpstream
  readonly query: string
  readonly dataset: string
  readonly schemaVersion: number
}

export const buildQueryCacheKey = (parts: QueryCacheKeyParts): string =>
  [
    `v${parts.schemaVersion}`,
    parts.upstream,
    'q',
    // encoded, because a cache key is a URL path and a query can hold a slash, a hash or a space
    encodeURIComponent(normalizeQuery(parts.query)),
    parts.dataset,
  ].join('/')

export const cacheRequestUrl = (key: string): string => `https://cache.invalid/${key}`

const openCache = async (): Promise<Cache> => {
  const store = caches as CacheStorage & { default?: Cache }
  return store.default ?? (await caches.open('proxy'))
}

/**
 * Everything the upstream sent is dropped except the content type. Two reasons, both
 * load-bearing: `cache.put` rejects any response carrying `Set-Cookie` (PVGIS sends two),
 * which silently emptied this whole cache, and `/api/proxy` is same-origin with the app,
 * so forwarding an upstream's cookies or CSP would apply them to our own origin
 */
export const forwardHeaders = (contentType: string | null, ttlSeconds: number): Headers => {
  const headers = new Headers()
  if (contentType !== null) headers.set('Content-Type', contentType)
  headers.set('Cache-Control', `public, max-age=${ttlSeconds}`)
  headers.set('X-Content-Type-Options', 'nosniff')
  return headers
}

/**
 * KV holds a value up to 25 MiB. Skipped well short of that, because past it the answer is a
 * rejected put and a wasted write, and the largest body here is a 1.3 MB PVGIS year
 */
export const KV_BODY_LIMIT_BYTES = 20 * 1024 * 1024

export interface CacheOptions {
  /**
   * The global tier, read when this data center's own cache misses and written when the upstream
   * answers. Absent in the tests and wherever the binding isn't configured, and the Cache API
   * alone is right there
   */
  readonly store?: KVStore
  /**
   * Asked once every tier has missed and before the upstream is, and a Response from it is the
   * refusal: returned as it stands and cached nowhere. Where the per-caller rate limit sits, so
   * a hit costs nobody anything and what is metered is exactly what spends an upstream's quota
   */
  readonly admit?: () => Promise<Response | null>
}

const contentTypeOf = (metadata: unknown): string | null => {
  const held = (typeof metadata === 'object' && metadata !== null ? metadata : {}) as {
    contentType?: unknown
  }
  return typeof held.contentType === 'string' ? held.contentType : null
}

/**
 * The global tier, read. A failure is logged and treated as a miss, because a KV outage or a
 * spent read allowance must cost one upstream call, and the request still gets its answer
 */
const fromStore = async (
  store: KVStore,
  key: string,
  ttlSeconds: number,
): Promise<Response | null> => {
  try {
    const { value, metadata } = await store.getWithMetadata(key, 'arrayBuffer')
    if (value === null) return null
    return new Response(value, { headers: forwardHeaders(contentTypeOf(metadata), ttlSeconds) })
  } catch (error) {
    console.error(`proxy kv read failed for ${key}: ${String(error)}`)
    return null
  }
}

/**
 * The global tier, written.
 *
 * The free tier is 1,000 writes a day, 100,000 reads a day and 25 MiB a value. A write happens
 * only when both tiers missed AND the upstream answered 2xx, so a day's writes is a day's new
 * places times what each one asks for, up to seven: two weather answers, and the soil at the point
 * and at a ring of four around it. A rate-limited upstream or a bad parameter costs no write at all
 */
const toStore = async (
  store: KVStore,
  key: string,
  response: Response,
  ttlSeconds: number,
): Promise<void> => {
  const body = await response.arrayBuffer()
  if (body.byteLength > KV_BODY_LIMIT_BYTES) return
  await store.put(key, body, {
    expirationTtl: ttlSeconds,
    metadata: { contentType: response.headers.get('Content-Type') },
  })
}

export const withCache: (
  key: string,
  ttlSeconds: number,
  ctx: ExecutionContextLike,
  produce: () => Promise<Response>,
  options?: CacheOptions,
) => Promise<Response> = async (key, ttlSeconds, ctx, produce, options = {}) => {
  const cache = await openCache()
  const request = new Request(cacheRequestUrl(key))
  const keep = (response: Response): void => {
    ctx.waitUntil(
      cache.put(request, response).catch((error: unknown) => {
        // a rejected put is invisible otherwise, and an empty cache is the failure this proxy exists to prevent
        console.error(`proxy cache put failed for ${key}: ${String(error)}`)
      }),
    )
  }

  const hit = await cache.match(request)
  if (hit) return hit

  const held = options.store === undefined ? null : await fromStore(options.store, key, ttlSeconds)
  if (held !== null) {
    // warmed into this data center, so the next visitor here spends no KV read either
    keep(held.clone())
    return held
  }

  const refusal = (await options.admit?.()) ?? null
  if (refusal !== null) return refusal

  const upstream = await produce()
  const response = new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: forwardHeaders(
      upstream.headers.get('Content-Type'),
      upstream.ok ? ttlSeconds : upstream.status >= 500 ? TTL_OUTAGE_SECONDS : TTL_ERROR_SECONDS,
    ),
  })
  keep(response.clone())
  const store = options.store
  if (upstream.ok && store !== undefined) {
    ctx.waitUntil(
      toStore(store, key, response.clone(), ttlSeconds).catch((error: unknown) => {
        console.error(`proxy kv put failed for ${key}: ${String(error)}`)
      }),
    )
  }
  return response
}
