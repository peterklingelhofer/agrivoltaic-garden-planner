import { afterEach, describe, expect, it } from 'bun:test'
import { vi } from '../../test/vi'
import { matchRoute, PROXY_PREFIX, ROUTES } from '../../workers/proxy/routes'
import {
  BROWSER_DIRECT,
  DEFAULT_FETCH_OPTIONS,
  fetchJson,
  plainUpstreamMessage,
  rateLimitWindow,
  REMEMBERED_CACHE,
  requestUrl,
  PROXIED_DEADLINE_MS,
  RESPONSE_DEADLINE_MS,
  UpstreamError,
  UpstreamTimeout,
  windowResetMs,
  WORKER_PROXIED,
} from './http'

/**
 * `fetch` has no timeout of its own, so without one here an upstream that takes the connection and
 * then says nothing holds the guided setup on "Working..." for as long as the browser will hold the
 * socket. SoilGrids did exactly that (measured: no status line and no bytes after 90 s). What
 * matters in these tests is the pair of properties that fixes it without breaking the large
 * downloads: the wait for the SERVER is bounded, and the wait for the BODY is not, because the
 * ten-year hourly archive is 4.8 MB and legitimately takes seconds to arrive
 */

const OPTIONS = { ...DEFAULT_FETCH_OPTIONS, deadlineMs: 60, retries: 2 }

const original = globalThis.fetch

afterEach(() => {
  globalThis.fetch = original
  vi.restoreAllMocks()
})

/** Answers headers at once, then takes `bodyMs` to produce the body, and honours the signal */
const slowBody = (bodyMs: number): typeof fetch =>
  vi.fn((_url: unknown, init?: { signal?: AbortSignal | null }) =>
    Promise.resolve({
      ok: true,
      status: 200,
      json: () =>
        new Promise((resolve, reject) => {
          const timer = setTimeout(() => {
            resolve({ value: 'arrived' })
          }, bodyMs)
          init?.signal?.addEventListener('abort', () => {
            clearTimeout(timer)
            reject(init.signal?.reason)
          })
        }),
    }),
  ) as unknown as typeof fetch

/** Never answers at all, and only settles when the caller aborts it */
const silent = (): typeof fetch =>
  vi.fn(
    (_url: unknown, init?: { signal?: AbortSignal | null }) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          reject(init.signal?.reason)
        })
      }),
  ) as unknown as typeof fetch

const call = (): Promise<unknown> =>
  fetchJson('open-meteo', '/v1/archive', new URLSearchParams({ q: '1' }), OPTIONS)

/** the one the browser reaches itself, so the caller's deadline is the whole of the wait */
const callDirect = (): Promise<unknown> =>
  fetchJson('nasa-power', '/api/temporal/hourly/point', new URLSearchParams({ q: '1' }), OPTIONS)

describe('an upstream that never answers', () => {
  it('is refused once the deadline passes rather than waited on forever', async () => {
    globalThis.fetch = silent()
    await expect(callDirect()).rejects.toBeInstanceOf(UpstreamTimeout)
  })

  it('is asked exactly once, because a retry only buys another deadline of waiting', async () => {
    const stub = silent()
    globalThis.fetch = stub
    await expect(callDirect()).rejects.toBeInstanceOf(UpstreamTimeout)
    expect(stub).toHaveBeenCalledTimes(1)
  })

  it('names the upstream and reports no status, because there was no status line', async () => {
    globalThis.fetch = silent()
    const error = await callDirect().catch((reason: unknown) => reason)
    expect(error).toBeInstanceOf(UpstreamTimeout)
    expect((error as UpstreamTimeout).upstream).toBe('nasa-power')
    expect((error as UpstreamTimeout).status).toBe(0)
  })

  /**
   * The proxy bounds its own wait for an upstream and answers 504 past it, so a request through
   * it is given that long and a little more, whatever shorter deadline the caller carried: at
   * 12 s a phone gave up on a ten-year archive the proxy received and cached two seconds later
   */
  it("is waited on past the proxy's own timeout when it sits behind the Worker", async () => {
    vi.useFakeTimers()
    try {
      globalThis.fetch = silent()
      let settled = false
      const outcome = call()
        .catch((reason: unknown) => reason)
        .finally(() => {
          settled = true
        })
      // the deadline is set after an await, so it exists once the microtasks have drained
      await vi.advanceTimersByTimeAsync(0)
      await vi.advanceTimersByTimeAsync(PROXIED_DEADLINE_MS - 1)
      expect(settled).toBe(false)
      await vi.advanceTimersByTimeAsync(2)
      expect(await outcome).toBeInstanceOf(UpstreamTimeout)
      expect(PROXIED_DEADLINE_MS).toBeGreaterThan(RESPONSE_DEADLINE_MS)
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('an upstream whose body is slower than the deadline', () => {
  it('is read to the end, because the deadline is on the headers and nothing else', async () => {
    globalThis.fetch = slowBody(OPTIONS.deadlineMs * 3)
    await expect(callDirect()).resolves.toEqual({ value: 'arrived' })
  })
})

describe('an upstream that answers with an error status', () => {
  it('is still retried, which is what the retries were always for', async () => {
    const stub = vi.fn().mockResolvedValue({ ok: false, status: 503 })
    globalThis.fetch = stub as unknown as typeof fetch
    await expect(call()).rejects.toThrow(/having trouble at its end/)
    expect(stub).toHaveBeenCalledTimes(OPTIONS.retries + 1)
  })

  /**
   * A rate limit is the one error status that must NOT be ridden out. The backoff here is a
   * quarter of a second and these upstreams are free and unauthenticated, so a retry spends two
   * more of the very requests the limit is counting. Measured: a handful of reloads in a minute
   * earns a 429, and each reload was making three requests into it
   */
  it('gives up at once on a rate limit rather than spending two more requests on it', async () => {
    const stub = vi.fn().mockResolvedValue({ ok: false, status: 429 })
    globalThis.fetch = stub as unknown as typeof fetch
    await expect(call()).rejects.toThrow(/as many requests as it allows/)
    expect(stub).toHaveBeenCalledTimes(1)
  })

  /**
   * Which allowance ran out is in the body, and the sentence and the retry both come off it.
   * Open-Meteo clears its hourly counter in the first minute after the hour and its daily one in
   * the first minute after midnight UTC, so telling everybody to wait a minute would be wrong for
   * fifty-nine minutes of every hour
   */
  it('reads which allowance ran out and says when it comes back', async () => {
    const refused = (reason: string): typeof fetch =>
      vi.fn().mockResolvedValue({
        ok: false,
        status: 429,
        text: () => Promise.resolve(JSON.stringify({ error: true, reason })),
      }) as unknown as typeof fetch

    globalThis.fetch = refused(
      'Hourly API request limit exceeded. Please try again in the next hour.',
    )
    const hourly = (await call().catch((thrown: unknown) => thrown)) as UpstreamError
    expect(hourly.message).toMatch(/this hour/)
    expect(hourly.message).toMatch(/when the hour turns/)
    expect(hourly.retryAfterMs).toBeGreaterThan(60_000)
    expect(hourly.retryAfterMs).toBeLessThanOrEqual(3_660_000)

    globalThis.fetch = refused('Daily API request limit exceeded. Please try again tomorrow.')
    const daily = (await call().catch((thrown: unknown) => thrown)) as UpstreamError
    expect(daily.message).toMatch(/today/)
    expect(daily.message).toMatch(/midnight UTC/)
    expect(daily.retryAfterMs).toBeGreaterThan(60_000)
    expect(daily.retryAfterMs).toBeLessThanOrEqual(86_460_000)

    globalThis.fetch = refused(
      'Minutely API request limit exceeded. Please try again in one minute.',
    )
    const minutely = (await call().catch((thrown: unknown) => thrown)) as UpstreamError
    expect(minutely.message).toMatch(/in a minute/)
    expect(minutely.retryAfterMs).toBe(60_000)
    // the technical version keeps the upstream's own words, for whoever is debugging
    expect(minutely.detail).toContain('Minutely API request limit exceeded')
  })

  it('lands a retry a minute past the boundary the counter is cleared on', () => {
    // 10:20:00 UTC on 2026-09-06
    const now = Date.UTC(2026, 8, 6, 10, 20, 0)
    expect(windowResetMs('minute', now)).toBe(60_000)
    expect(windowResetMs('hour', now)).toBe(40 * 60_000 + 60_000)
    expect(windowResetMs('day', now)).toBe((13 * 60 + 40) * 60_000 + 60_000)
    expect(rateLimitWindow('Too many concurrent requests')).toBe('minute')
    expect(rateLimitWindow('')).toBe('minute')
  })

  /**
   * What reaches the screen is the sentence, and what reaches a debugger is the status. Both, and
   * in that order: `state/safe.ts` flattens a thrown error to its `message`, so the plain wording
   * has to BE the message or no panel will ever print it
   */
  it('says what went wrong in words, and keeps the technical version beside it', async () => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValue({ ok: false, status: 503 }) as unknown as typeof fetch
    const error = await call().catch((thrown: unknown) => thrown)
    expect(error).toBeInstanceOf(UpstreamError)
    const upstream = error as UpstreamError
    expect(upstream.message).toBe(plainUpstreamMessage('open-meteo', 503))
    expect(upstream.message).toContain('the weather service')
    expect(upstream.message).not.toContain('open-meteo')
    expect(upstream.detail).toBe('open-meteo responded 503')
    expect(upstream.status).toBe(503)
  })

  it('never names a hostname to a grower, whatever the failure was', () => {
    for (const status of [0, 404, 429, 500, 503, 403]) {
      expect(plainUpstreamMessage('open-meteo', status)).not.toMatch(/open-meteo|http|[0-9]{3}/)
    }
  })
})

describe('the default options every caller inherits', () => {
  it('carry a finite deadline, so no caller can ask for an unbounded wait by accident', () => {
    expect(DEFAULT_FETCH_OPTIONS.deadlineMs).toBe(RESPONSE_DEADLINE_MS)
    expect(Number.isFinite(RESPONSE_DEADLINE_MS)).toBe(true)
  })
})

/**
 * The two halves of one contract, checked against each other rather than against a copy.
 *
 * `src/data/http.ts` builds the URL and `ROUTES` decides what is reachable, and the tests here run
 * the real code of both. Hardcoded copies would go on passing while a path drifted on either side
 * and the deployed app 404ed: an allowlist that does not match the caller is an outage, and a
 * silent one, because nothing in the client can tell a blocked path from a dead upstream
 */
describe('the client and the allowlist agree on every proxied path', () => {
  const CLIENT_CALLS: readonly (readonly [(typeof WORKER_PROXIED)[number], string])[] = [
    ['pvgis', '/api/v5_3/tmy'],
    ['nsrdb', '/api/nsrdb/v2/solar/nsrdb-GOES-tmy-v4-0-0-download.csv'],
    ['nsrdb', '/api/nsrdb/v2/solar/nsrdb-GOES-aggregated-v4-0-0-download.csv'],
    ['open-meteo', '/v1/archive'],
    ['nominatim', '/search'],
    ['nominatim', '/reverse'],
    ['photon', '/api'],
    ['eia', '/v2/electricity/retail-sales/data/'],
  ]

  it('routes every URL the client builds for a proxied upstream', () => {
    for (const [upstream, path] of CLIENT_CALLS) {
      const url = requestUrl(upstream, path, new URLSearchParams({ lat: '1', lon: '2' }))
      const matched = matchRoute(new URL(url, 'https://host').pathname)
      expect(matched?.upstream, `${upstream}${path}`).toBe(upstream)
    }
  })

  it('leaves no route unreachable from the client', () => {
    const reachable = new Set(CLIENT_CALLS.map(([upstream, path]) => `${upstream}${path}`))
    for (const route of ROUTES) {
      expect(
        reachable.has(`${route.upstream}${route.path}`),
        `${route.upstream}${route.path}`,
      ).toBe(true)
    }
  })

  it('sends every proxied upstream through the worker and nothing else', () => {
    for (const upstream of WORKER_PROXIED) {
      expect(requestUrl(upstream, '/x', new URLSearchParams()), upstream).toContain(PROXY_PREFIX)
    }
    // the weather is the one nothing in the app can do without, so it is named rather than
    // left to a loop that would still pass if the list were emptied
    expect(WORKER_PROXIED).toContain('open-meteo')
    /**
     * And the place-name lookup, named here because a browser may not set a User-Agent: every
     * Nominatim search sent from the browser would arrive anonymous against a policy that asks
     * callers to identify themselves, and nothing in the client can fix that
     */
    expect(WORKER_PROXIED).toContain('nominatim')
    expect(WORKER_PROXIED).toContain('photon')
    expect(requestUrl('nominatim', '/search', new URLSearchParams())).toContain(PROXY_PREFIX)
    // what stays browser-direct stays browser-direct: these have no key, no policy and no
    // per-visit call, so putting them behind an edge would buy nothing and cost a hop
    for (const upstream of BROWSER_DIRECT) {
      expect(requestUrl(upstream, '/x', new URLSearchParams()), upstream).not.toContain(
        PROXY_PREFIX,
      )
    }
  })
})

/**
 * A decade of measured weather ending in 2024 cannot change, and a lookup that fetched it again on
 * every reload would pay about 600 of Open-Meteo's weighted calls each time, against an allowance
 * of 600 a minute and 5,000 an hour from one address. What is held is the response itself, in the
 * browser's own Cache Storage under the request URL; what is asserted is that the second ask never
 * reaches `fetch`, that the first is stored, and that nothing is stored for a request that did not
 * ask to be remembered
 */
describe('an answer asked to be remembered', () => {
  const held = new Map<string, Response>()
  const cache = {
    // a real Cache hands back a fresh body on every match; a Map would hand back a read one
    match: (url: string) => Promise.resolve(held.get(url)?.clone()),
    put: (url: string, response: Response) => {
      held.set(url, response)
      return Promise.resolve()
    },
  }

  afterEach(() => {
    held.clear()
    vi.unstubAllGlobals()
  })

  const answering = (): ReturnType<typeof vi.fn> =>
    vi.fn(() => Promise.resolve(new Response(JSON.stringify({ value: 'kept' }), { status: 200 })))

  it('is fetched once and served from this browser after that', async () => {
    const opened = vi.fn(() => Promise.resolve(cache))
    vi.stubGlobal('caches', { open: opened })
    const stub = answering()
    globalThis.fetch = stub as unknown as typeof fetch
    const options = { ...OPTIONS, remember: true }
    const query = new URLSearchParams({ start_date: '2015-01-01' })

    await expect(fetchJson('open-meteo', '/v1/archive', query, options)).resolves.toEqual({
      value: 'kept',
    })
    expect(stub).toHaveBeenCalledTimes(1)
    expect(opened).toHaveBeenCalledWith(REMEMBERED_CACHE)
    expect(held.size).toBe(1)

    await expect(fetchJson('open-meteo', '/v1/archive', query, options)).resolves.toEqual({
      value: 'kept',
    })
    expect(stub).toHaveBeenCalledTimes(1)
  })

  it('stores nothing for a request that did not ask, and a refusal is never stored', async () => {
    vi.stubGlobal('caches', { open: () => Promise.resolve(cache) })
    globalThis.fetch = answering() as unknown as typeof fetch
    await call()
    expect(held.size).toBe(0)

    globalThis.fetch = vi
      .fn()
      .mockResolvedValue({ ok: false, status: 429 }) as unknown as typeof fetch
    await expect(
      fetchJson('open-meteo', '/v1/archive', new URLSearchParams({ q: '2' }), {
        ...OPTIONS,
        remember: true,
      }),
    ).rejects.toBeInstanceOf(UpstreamError)
    expect(held.size).toBe(0)
  })

  it('fetches as it always did where the platform has no Cache Storage', async () => {
    vi.stubGlobal('caches', undefined)
    const stub = answering()
    globalThis.fetch = stub as unknown as typeof fetch
    const options = { ...OPTIONS, remember: true }
    await fetchJson('open-meteo', '/v1/archive', new URLSearchParams({ q: '3' }), options)
    await fetchJson('open-meteo', '/v1/archive', new URLSearchParams({ q: '3' }), options)
    expect(stub).toHaveBeenCalledTimes(2)
  })
})
