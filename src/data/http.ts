import type { LatLon } from '../types/geo'

export type UpstreamId =
  | 'open-meteo'
  | 'nasa-power'
  | 'nominatim'
  | 'photon'
  | 'overpass'
  | 'open-elevation'
  | 'soilgrids'
  | 'pvgis'
  | 'nsrdb'
  | 'eia'

export const BROWSER_DIRECT: readonly UpstreamId[] = ['nasa-power', 'overpass', 'soilgrids']

/**
 * Through the Worker, and cached at its edge.
 *
 * `pvgis`, `nsrdb` and `eia` are here because they need a credential or a policy exemption a
 * browser cannot hold. `open-meteo` and `open-elevation` are here for load: both are free,
 * unauthenticated and rate limited per IP, both are called on every single site resolve, and a
 * measured session earned a 429 from open-meteo after a handful of reloads by one person. Thirty
 * browsers in a lecture hall asking about one town is the case that matters, and behind the edge
 * cache that is one upstream request rather than thirty. See `workers/proxy/cache.ts`.
 *
 * The two geocoders are here for a reason a browser cannot work around at all. The OSM Nominatim
 * usage policy asks for a User-Agent that identifies the application and `fetch` in a browser is
 * forbidden from setting one, so every search this app made arrived anonymous; the policy also
 * asks that results be cached, which a browser can only do for itself, and holds callers to one
 * request a second, which `MIN_INTERVAL_MS` below could only ever enforce per tab. All three are
 * things an edge in front of the upstream can actually do, and none of them are things a client
 * throttle was ever going to. `photon` follows it because a fallback that stayed browser-direct
 * would be the leg that runs precisely when the first one is refusing us
 */
export const WORKER_PROXIED: readonly UpstreamId[] = [
  'pvgis',
  'nsrdb',
  'eia',
  'open-meteo',
  'open-elevation',
  'nominatim',
  'photon',
]

export const USER_AGENT = 'agrivoltaic-garden-designer'

export const CACHE_SCHEMA_VERSION = 1

export const WORKER_PROXY_BASE = '/api/proxy'

export const COORDINATE_DECIMALS = 2

/**
 * How long an upstream has to START answering. It bounds the wait for response HEADERS only and
 * is cancelled the moment they arrive, so a slow BODY is never cut off: the ten-year hourly
 * archive is 4.8 MB and legitimately takes 7.7 s to stream on a fast link and far longer on a
 * slow one, while a host that has gone away sends nothing at all.
 *
 * `fetch` has no deadline of its own. When an upstream stops answering, as SoilGrids has (measured:
 * no status line and no bytes after 90 s), a request with no deadline holds the guided setup on
 * "Working..." for as long as the browser will hold the socket, then twice more for the retries.
 * `soilAt` falls back to DEFAULT_SOIL when the read fails, and this deadline is what lets it fail.
 * Every browser-direct upstream here is a third party that can do this at any time
 */
export const RESPONSE_DEADLINE_MS = 12_000

/**
 * Through the Worker the wait is bounded twice over: the proxy gives an upstream
 * `UPSTREAM_TIMEOUT_MS` (15 s, `workers/proxy/routes.ts`) and answers 504 past it, so a request
 * to it only has to outlast that to read whichever it was. At the 12 s above, a phone asking for
 * the ten-year archive of a new place gave up two seconds before the proxy received it and
 * cached it, then spent the fallbacks reaching the same answer the slow way
 */
export const PROXIED_DEADLINE_MS = 20_000

export interface FetchOptions {
  readonly signal: AbortSignal | null
  readonly minIntervalMs: number
  readonly retries: number
  readonly deadlineMs: number
  /**
   * Keep a good answer in this browser and serve it from there next time.
   *
   * For an answer that cannot change: a decade of measured weather ending in 2024, thirty years
   * of normals ending in 2020. Open-Meteo weighs a request by its days and its variables (one
   * call is two weeks of ten variables), so the two archive requests a site lookup makes weigh
   * about 600 calls together, against a free allowance of 600 a minute, 5,000 an hour and
   * 10,000 a day from one address. A reload was paying that again for the same town, and a
   * person walking through the app on the dev server, where nothing sits in front of the
   * upstream, was locked out of the weather for the rest of the hour after a handful of them
   */
  readonly remember: boolean
}

export const DEFAULT_FETCH_OPTIONS: FetchOptions = {
  signal: null,
  minIntervalMs: 0,
  retries: 2,
  deadlineMs: RESPONSE_DEADLINE_MS,
  remember: false,
}

/**
 * The Cache Storage the remembered answers live in. The number is a schema: a change to what is
 * stored under a URL, or to what a URL means, is a new name, and the old store is left to the
 * browser to evict
 */
export const REMEMBERED_CACHE = 'upstream-archive-v1'

/**
 * Absent everywhere the platform has no Cache Storage: node, jsdom, and a page that is not a
 * secure context. Every read and write below treats that, and a store that refuses (private
 * mode, no room), as a miss, because the answer is then fetched as it always was
 */
const rememberedStore = async (): Promise<Cache | null> => {
  if (typeof caches === 'undefined') return null
  try {
    return await caches.open(REMEMBERED_CACHE)
  } catch {
    return null
  }
}

export const recall = async (url: string): Promise<Response | null> => {
  const store = await rememberedStore()
  if (store === null) return null
  try {
    return (await store.match(url)) ?? null
  } catch {
    return null
  }
}

const remember = async (url: string, response: Response): Promise<void> => {
  const store = await rememberedStore()
  if (store === null) return
  try {
    await store.put(url, response)
  } catch {
    // no room, or a store that will not take it: the next visit fetches again, as it would with no
    // cache
  }
}

const ORIGINS: Readonly<Record<UpstreamId, string>> = {
  'open-meteo': 'https://archive-api.open-meteo.com',
  'nasa-power': 'https://power.larc.nasa.gov',
  nominatim: 'https://nominatim.openstreetmap.org',
  photon: 'https://photon.komoot.io',
  overpass: 'https://overpass-api.de',
  'open-elevation': 'https://api.open-elevation.com',
  soilgrids: 'https://rest.isric.org',
  pvgis: 'https://re.jrc.ec.europa.eu',
  nsrdb: 'https://developer.nlr.gov',
  eia: 'https://api.eia.gov',
}

export const MIN_INTERVAL_MS: Readonly<Record<UpstreamId, number>> = {
  'open-meteo': 0,
  'nasa-power': 200,
  nominatim: 1000,
  photon: 200,
  overpass: 1000,
  'open-elevation': 200,
  soilgrids: 500,
  pvgis: 0,
  nsrdb: 0,
  eia: 0,
}

export const isProxied = (upstream: UpstreamId): boolean => WORKER_PROXIED.includes(upstream)

export const upstreamOrigin = (upstream: UpstreamId): string => ORIGINS[upstream]

export const roundCoordinate = (value: number): number =>
  Number(value.toFixed(COORDINATE_DECIMALS)) + 0

export const cacheKeyFor = (
  upstream: UpstreamId,
  location: LatLon,
  discriminator: string,
): string =>
  [
    `v${String(CACHE_SCHEMA_VERSION)}`,
    upstream,
    roundCoordinate(location.latitudeDeg).toFixed(COORDINATE_DECIMALS),
    roundCoordinate(location.longitudeDeg).toFixed(COORDINATE_DECIMALS),
    discriminator,
  ].join('/')

export const requestUrl = (upstream: UpstreamId, path: string, query: URLSearchParams): string => {
  const search = query.toString()
  const suffix = search.length > 0 ? `?${search}` : ''
  return isProxied(upstream)
    ? `${WORKER_PROXY_BASE}/${upstream}${path}${suffix}`
    : `${upstreamOrigin(upstream)}${path}${suffix}`
}

/**
 * What each upstream is, to somebody who came here to plan a garden.
 *
 * `open-meteo` is a hostname. A grower reading "open-meteo sent no response within 12000 ms" on
 * the step that will not open for them learns nothing they can act on, and reasonably concludes
 * they have broken something. These are the same services under names that say what they are for
 */
export const UPSTREAM_LABEL: Readonly<Record<UpstreamId, string>> = {
  'open-meteo': 'the weather service',
  'nasa-power': 'the weather service',
  nominatim: 'the place-name lookup',
  photon: 'the place-name lookup',
  overpass: 'the map lookup',
  'open-elevation': 'the elevation lookup',
  soilgrids: 'the soil database',
  pvgis: 'the solar radiation service',
  nsrdb: 'the solar radiation service',
  eia: 'the electricity price lookup',
}

/**
 * Which of an upstream's allowances a 429 ran out of, read off the body it sent.
 *
 * Open-Meteo keeps three counters per address and clears each on its own clock: the minute's every
 * minute, the hour's in the first minute after the hour, the day's in the first minute after
 * midnight UTC. Its 429 body says which one ("Hourly API request limit exceeded. Please try again
 * in the next hour."). Telling everybody to wait a minute would be wrong fifty-nine times out of
 * sixty for the hour's counter and wrong all day for the day's, while the automatic retries spent
 * themselves against it
 */
export type RateLimitWindow = 'minute' | 'hour' | 'day'

export const rateLimitWindow = (body: string): RateLimitWindow =>
  /daily/i.test(body) ? 'day' : /hourly/i.test(body) ? 'hour' : 'minute'

const MINUTE_MS = 60_000
const HOUR_MS = 3_600_000
const DAY_MS = 86_400_000

/**
 * How long until that counter is cleared, from `now`. A minute past the boundary for the hour
 * and the day, because the upstream clears them from a job that runs once a minute, and a
 * retry that lands on the near side of it is one more request against a full counter
 */
export const windowResetMs = (window: RateLimitWindow, now: number): number => {
  if (window === 'minute') return MINUTE_MS
  const span = window === 'hour' ? HOUR_MS : DAY_MS
  return span - (now % span) + MINUTE_MS
}

const WINDOW_WORDS: Readonly<
  Record<RateLimitWindow, { readonly spent: string; readonly again: string }>
> = {
  minute: { spent: 'this minute', again: 'in a minute' },
  hour: { spent: 'this hour', again: 'when the hour turns' },
  day: { spent: 'today', again: 'after midnight UTC, when its day turns over' },
}

/**
 * The failure in a sentence a grower can act on, chosen by what actually went wrong.
 *
 * Deliberately says what to DO where there is something to do. A 429 in particular is not a
 * fault at all: these are free, unauthenticated services with an allowance per address, and the
 * honest thing to say is which allowance ran out and when it comes back, rather than a number
 */
export const plainUpstreamMessage = (
  upstream: UpstreamId,
  status: number,
  window: RateLimitWindow = 'minute',
): string => {
  const who = UPSTREAM_LABEL[upstream]
  if (status === 0) {
    return `${who} didn't answer in time. It may be down, or the connection may have dropped.`
  }
  if (status === 429) {
    const words = WINDOW_WORDS[window]
    return `${who} has answered as many requests as it allows from this connection ${words.spent}. It's free to use and limits how often it can be asked, so it will answer again ${words.again}.`
  }
  if (status >= 500)
    return `${who} is having trouble at its end. Trying again shortly usually works.`
  if (status === 404) return `${who} has nothing for this place.`
  return `${who} refused the request for this place.`
}

export class UpstreamError extends Error {
  readonly upstream: UpstreamId
  readonly status: number
  /**
   * The technical version, for whoever is debugging rather than gardening.
   *
   * `message` is what reaches the screen: `state/safe.ts` flattens a thrown error to its message
   * and every panel prints that, so the plain sentence has to BE the message rather than sit
   * beside it. Nothing is lost, it moves here
   */
  readonly detail: string
  /**
   * When the upstream will take the request again, as a wait from when it refused; null when
   * it gave no reason to expect a particular moment. The store schedules its retry on this
   * rather than on its own guess, so the countdown a reader watches is the upstream's clock
   */
  readonly retryAfterMs: number | null

  constructor(
    upstream: UpstreamId,
    status: number,
    detail: string,
    window: RateLimitWindow | null = null,
    now: number = Date.now(),
  ) {
    super(plainUpstreamMessage(upstream, status, window ?? 'minute'))
    this.name = 'UpstreamError'
    this.upstream = upstream
    this.status = status
    this.detail = detail
    this.retryAfterMs = window === null ? null : windowResetMs(window, now)
  }
}

/**
 * Carries status 0 because there was no status line: the distinction between "answered badly"
 * and "did not answer" is the whole point of the class
 */
export class UpstreamTimeout extends UpstreamError {
  constructor(upstream: UpstreamId, deadlineMs: number) {
    super(upstream, 0, `${upstream} sent no response within ${String(deadlineMs)} ms`)
    this.name = 'UpstreamTimeout'
  }
}

const lastRequestAt = new Map<UpstreamId, number>()
const tail = new Map<UpstreamId, Promise<unknown>>()

const delay = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms)
  })

const throttle = async (upstream: UpstreamId, minIntervalMs: number): Promise<void> => {
  const interval = Math.max(minIntervalMs, MIN_INTERVAL_MS[upstream])
  if (interval <= 0) return
  const wait = (lastRequestAt.get(upstream) ?? 0) + interval - Date.now()
  if (wait > 0) await delay(wait)
  lastRequestAt.set(upstream, Date.now())
}

const serialise = <T>(upstream: UpstreamId, work: () => Promise<T>): Promise<T> => {
  const next = (tail.get(upstream) ?? Promise.resolve()).catch(() => undefined).then(work)
  tail.set(
    upstream,
    next.catch(() => undefined),
  )
  return next
}

const headers = (accept: string): Record<string, string> => ({
  Accept: accept,
  'User-Agent': USER_AGENT,
})

/** The first few hundred characters of a refusal, or nothing when even that cannot be read */
const bodyOf = async (response: Response): Promise<string> => {
  try {
    return (await response.text()).slice(0, 300)
  } catch {
    return ''
  }
}

/**
 * One attempt, under its own headers deadline. The timer is cleared as soon as `fetch` settles,
 * which in the Fetch API is when the response HEADERS are in and before a byte of the body has
 * been read, so the deadline governs reaching the server and never the size of the answer
 */
const guard = async (
  upstream: UpstreamId,
  url: string,
  options: FetchOptions,
  accept: string,
): Promise<Response> => {
  const deadlineMs = isProxied(upstream)
    ? Math.max(options.deadlineMs, PROXIED_DEADLINE_MS)
    : options.deadlineMs
  const clock = new AbortController()
  const timer = setTimeout(() => {
    clock.abort(new UpstreamTimeout(upstream, deadlineMs))
  }, deadlineMs)
  try {
    const response = await fetch(url, {
      signal:
        options.signal === null ? clock.signal : AbortSignal.any([options.signal, clock.signal]),
      headers: headers(accept),
    })
    if (!response.ok) {
      // the body of a refusal is where the upstream says which allowance ran out, so it is
      // read for that one status and left unread for the rest
      const body = response.status === 429 ? await bodyOf(response) : ''
      throw new UpstreamError(
        upstream,
        response.status,
        `${upstream} responded ${String(response.status)}${body === '' ? '' : `: ${body}`}`,
        response.status === 429 ? rateLimitWindow(body) : null,
      )
    }
    return response
  } catch (error) {
    // what `fetch` rejects an aborted request with is not the same across engines, so the
    // reason is read off the signal rather than trusted to arrive in the rejection
    if (clock.signal.aborted && options.signal?.aborted !== true) throw clock.signal.reason
    throw error
  } finally {
    clearTimeout(timer)
  }
}

/**
 * A missed deadline is not retried, and that is deliberate. Retries are here to ride out a
 * transient error status or a dropped connection, which come back quickly; a host that took the
 * connection and then said nothing for twelve seconds has a different problem, and the only
 * thing another attempt reliably buys is another twelve seconds of the grower reading
 * "Working...". Failing once lets the caller degrade, which every caller here already knows how
 * to do
 */
const withRetry = async <T>(
  upstream: UpstreamId,
  options: FetchOptions,
  attemptFn: () => Promise<T>,
): Promise<T> => {
  let lastError: unknown = null
  for (let attempt = 0; attempt <= options.retries; attempt += 1) {
    await throttle(upstream, options.minIntervalMs)
    try {
      return await attemptFn()
    } catch (error) {
      /*
       * A rate limit is not a transient fault to ride out. These upstreams are free and
       * unauthenticated, the backoff here is a quarter of a second, and retrying into a 429 spends
       * two more of the requests the limit is counting. Measured: reloading this app a handful of
       * times in a minute is enough to earn one, and with retries each reload would make three
       * requests
       */
      if (
        options.signal?.aborted === true ||
        error instanceof UpstreamTimeout ||
        (error instanceof UpstreamError && error.status === 429)
      ) {
        throw error
      }
      lastError = error
      if (attempt < options.retries) await delay(250 * 2 ** attempt)
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new UpstreamError(upstream, 0, `${upstream} request failed`)
}

/**
 * The response for a URL: served from memory when the caller set `remember` and one is held,
 * fetched otherwise, and remembered on the way past when asked. The clone is taken before the body
 * is read, because a body is a stream and reads once
 */
const respond = async (
  upstream: UpstreamId,
  url: string,
  options: FetchOptions,
  accept: string,
): Promise<Response> => {
  const kept = options.remember ? await recall(url) : null
  if (kept !== null) return kept
  return withRetry(upstream, options, async () => {
    const response = await guard(upstream, url, options, accept)
    if (options.remember) void remember(url, response.clone())
    return response
  })
}

export const fetchJson = <T>(
  upstream: UpstreamId,
  path: string,
  query: URLSearchParams,
  options: FetchOptions,
): Promise<T> =>
  serialise(upstream, async () => {
    const response = await respond(
      upstream,
      requestUrl(upstream, path, query),
      options,
      'application/json',
    )
    return (await response.json()) as T
  })

export const fetchText = (
  upstream: UpstreamId,
  path: string,
  query: URLSearchParams,
  options: FetchOptions,
): Promise<string> =>
  serialise(upstream, async () => {
    const response = await respond(upstream, requestUrl(upstream, path, query), options, 'text/csv')
    return await response.text()
  })
