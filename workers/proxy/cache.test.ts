import { afterEach, describe, expect, it } from 'bun:test'
import { vi } from '../../test/vi'
import {
  buildCacheKey,
  cacheRequestUrl,
  KV_BODY_LIMIT_BYTES,
  quantiseCoordinate,
  TTL_ERROR_SECONDS,
  TTL_TMY_SECONDS,
  withCache,
} from './cache'
import type { ExecutionContextLike, KVStore } from './env'

const stubCaches = (): { store: Map<string, Response>; waited: Promise<unknown>[] } => {
  const store = new Map<string, Response>()
  const cache = {
    match: (request: Request) => Promise.resolve(store.get(request.url)?.clone()),
    put: (request: Request, response: Response) => {
      store.set(request.url, response)
      return Promise.resolve()
    },
  }
  vi.stubGlobal('caches', { default: cache, open: () => Promise.resolve(cache) })
  return { store, waited: [] }
}

const contextWith = (waited: Promise<unknown>[]): ExecutionContextLike => ({
  waitUntil: (promise) => {
    waited.push(promise)
  },
})

interface Stored {
  readonly value: ArrayBuffer
  readonly metadata: unknown
  readonly expirationTtl: number
}

/** A stand-in for the KV namespace that remembers what it was given and for how long */
const fakeStore = (): { store: KVStore; entries: Map<string, Stored> } => {
  const entries = new Map<string, Stored>()
  return {
    entries,
    store: {
      getWithMetadata: (key) => {
        const held = entries.get(key)
        return Promise.resolve(
          held === undefined
            ? { value: null, metadata: null }
            : { value: held.value, metadata: held.metadata },
        )
      },
      put: (key, value, options) => {
        entries.set(key, {
          value,
          metadata: options.metadata,
          expirationTtl: options.expirationTtl,
        })
        return Promise.resolve()
      },
    },
  }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('quantiseCoordinate', () => {
  it('collapses coordinates inside one 0.01 deg cell', () => {
    expect(quantiseCoordinate(42.3736).toFixed(2)).toBe('42.37')
    expect(quantiseCoordinate(42.3701).toFixed(2)).toBe('42.37')
  })

  it('keeps the sign of southern and western coordinates', () => {
    expect(quantiseCoordinate(-71.0589).toFixed(2)).toBe('-71.06')
    expect(quantiseCoordinate(-33.87).toFixed(2)).toBe('-33.87')
  })

  it('does not split the equator or prime meridian across a signed zero', () => {
    expect(quantiseCoordinate(-0.004).toFixed(2)).toBe(quantiseCoordinate(0.004).toFixed(2))
  })
})

describe('buildCacheKey', () => {
  const parts = {
    upstream: 'pvgis',
    latitudeDeg: 42.3736,
    longitudeDeg: -71.0589,
    dataset: 'tmy',
    variant: 'default',
    schemaVersion: 1,
  } as const

  it('renders the documented v{n}/{upstream}/{lat}/{lon}/{dataset}/{years} scheme', () => {
    expect(buildCacheKey(parts)).toBe('v1/pvgis/42.37/-71.06/tmy/default')
  })

  it('gives two points in the same 0.01 deg cell the same key', () => {
    expect(buildCacheKey({ ...parts, latitudeDeg: 42.3701 })).toBe(buildCacheKey(parts))
  })

  it('separates upstreams, datasets, year ranges and schema versions', () => {
    const keys = new Set([
      buildCacheKey(parts),
      buildCacheKey({ ...parts, upstream: 'nsrdb' }),
      buildCacheKey({ ...parts, dataset: 'psm3-tmy' }),
      buildCacheKey({ ...parts, variant: 'tmy' }),
      buildCacheKey({ ...parts, schemaVersion: 2 }),
    ])
    expect(keys.size).toBe(5)
  })

  it('materialises as a synthetic request url that cannot resolve on the network', () => {
    expect(cacheRequestUrl(buildCacheKey(parts))).toBe(
      'https://cache.invalid/v1/pvgis/42.37/-71.06/tmy/default',
    )
  })
})

describe('withCache', () => {
  it('calls the producer once and serves the second read from cache', async () => {
    const { waited } = stubCaches()
    const produce = vi.fn(() => Promise.resolve(new Response('body', { status: 200 })))

    const first = await withCache('k', TTL_TMY_SECONDS, contextWith(waited), produce)
    expect(await first.text()).toBe('body')
    await Promise.all(waited)

    const second = await withCache('k', TTL_TMY_SECONDS, contextWith(waited), produce)
    expect(await second.text()).toBe('body')
    expect(produce).toHaveBeenCalledTimes(1)
  })

  it('stores a successful response for the full ttl', async () => {
    const { waited } = stubCaches()
    const response = await withCache('ok', TTL_TMY_SECONDS, contextWith(waited), () =>
      Promise.resolve(new Response('body')),
    )
    expect(response.headers.get('Cache-Control')).toBe(`public, max-age=${String(TTL_TMY_SECONDS)}`)
    expect(TTL_TMY_SECONDS).toBe(31_536_000)
  })

  it('pins an upstream failure for 60 s, not a year', async () => {
    const { waited } = stubCaches()
    const response = await withCache('bad', TTL_TMY_SECONDS, contextWith(waited), () =>
      Promise.resolve(new Response('nope', { status: 502 })),
    )
    expect(response.status).toBe(502)
    expect(response.headers.get('Cache-Control')).toBe(
      `public, max-age=${String(TTL_ERROR_SECONDS)}`,
    )
    expect(TTL_ERROR_SECONDS).toBe(60)
  })

  it('strips upstream Set-Cookie, which both breaks cache.put and leaks onto our origin', async () => {
    const { waited } = stubCaches()
    const upstream = new Response('body', {
      headers: {
        'Content-Type': 'application/json',
        'Set-Cookie': 'jrc_cookie=secret; Secure',
        'Content-Security-Policy': "default-src 'self' https://europa.eu",
        'Strict-Transport-Security': 'max-age=31536000',
      },
    })
    const response = await withCache('cookies', TTL_TMY_SECONDS, contextWith(waited), () =>
      Promise.resolve(upstream),
    )
    expect(response.headers.get('Set-Cookie')).toBeNull()
    expect(response.headers.get('Content-Security-Policy')).toBeNull()
    expect(response.headers.get('Strict-Transport-Security')).toBeNull()
    expect(response.headers.get('Content-Type')).toBe('application/json')
    expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff')
  })

  it('defers the cache write to waitUntil rather than the response path', async () => {
    const { waited, store } = stubCaches()
    await withCache('deferred', TTL_TMY_SECONDS, contextWith(waited), () =>
      Promise.resolve(new Response('body')),
    )
    expect(waited).toHaveLength(1)
    await Promise.all(waited)
    expect(store.has(cacheRequestUrl('deferred'))).toBe(true)
  })
})

/**
 * The Cache API is per data centre. A visitor in Frankfurt and one in Sydney asking about the
 * same town were two upstream requests, and the open-meteo allowance is pooled behind this
 * Worker's egress, so the second was paid for by everybody. KV is one store for every data
 * centre, read on a local miss and written on an upstream answer
 */
describe('withCache, the global tier', () => {
  it('serves a local miss from the global tier, and warms the local cache from it', async () => {
    const { waited, store } = stubCaches()
    const global = fakeStore()
    global.entries.set('global', {
      value: await new Response('from kv').arrayBuffer(),
      metadata: { contentType: 'text/csv' },
      expirationTtl: TTL_TMY_SECONDS,
    })
    const produce = vi.fn(() => Promise.resolve(new Response('from upstream')))

    const response = await withCache('global', TTL_TMY_SECONDS, contextWith(waited), produce, {
      store: global.store,
    })
    expect(await response.text()).toBe('from kv')
    expect(response.headers.get('Content-Type')).toBe('text/csv')
    expect(response.headers.get('Cache-Control')).toBe(`public, max-age=${String(TTL_TMY_SECONDS)}`)
    expect(produce).not.toHaveBeenCalled()
    await Promise.all(waited)
    expect(store.has(cacheRequestUrl('global'))).toBe(true)
  })

  it('writes an upstream answer to both tiers, for the route ttl, with its content type', async () => {
    const { waited, store } = stubCaches()
    const global = fakeStore()
    await withCache(
      'both',
      TTL_TMY_SECONDS,
      contextWith(waited),
      () =>
        Promise.resolve(new Response('body', { headers: { 'Content-Type': 'application/json' } })),
      { store: global.store },
    )
    await Promise.all(waited)
    expect(store.has(cacheRequestUrl('both'))).toBe(true)
    const held = global.entries.get('both')
    expect(new TextDecoder().decode(held?.value)).toBe('body')
    expect(held?.metadata).toEqual({ contentType: 'application/json' })
    expect(held?.expirationTtl).toBe(TTL_TMY_SECONDS)
  })

  it('never writes an upstream failure to the global tier', async () => {
    const { waited, store } = stubCaches()
    const global = fakeStore()
    await withCache(
      'failed',
      TTL_TMY_SECONDS,
      contextWith(waited),
      () => Promise.resolve(new Response('nope', { status: 502 })),
      { store: global.store },
    )
    await Promise.all(waited)
    // the local 60 s pin still applies; the global tier is for answers
    expect(store.has(cacheRequestUrl('failed'))).toBe(true)
    expect(global.entries.size).toBe(0)
  })

  it('skips the global tier for a body it could not hold', async () => {
    const { waited } = stubCaches()
    const global = fakeStore()
    await withCache(
      'large',
      TTL_TMY_SECONDS,
      contextWith(waited),
      () => Promise.resolve(new Response(new Uint8Array(KV_BODY_LIMIT_BYTES + 1))),
      { store: global.store },
    )
    await Promise.all(waited)
    expect(global.entries.size).toBe(0)
    expect(KV_BODY_LIMIT_BYTES).toBe(20 * 1024 * 1024)
  })

  it('treats a failing global tier as a miss, and a rejected write as nothing', async () => {
    const { waited } = stubCaches()
    const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const broken: KVStore = {
      getWithMetadata: () => Promise.reject(new Error('KV GET failed')),
      put: () => Promise.reject(new Error('KV PUT failed: 429')),
    }
    const response = await withCache(
      'broken',
      TTL_TMY_SECONDS,
      contextWith(waited),
      () => Promise.resolve(new Response('body')),
      { store: broken },
    )
    expect(await response.text()).toBe('body')
    await Promise.all(waited)
    expect(logged).toHaveBeenCalledTimes(2)
    logged.mockRestore()
  })
})

/**
 * Where the per-caller limit sits: after every tier has missed and before the upstream is asked,
 * so a hit costs nobody anything and a refusal is cached nowhere
 */
describe('withCache, admission', () => {
  it('returns a refusal as it stands, asks no upstream and caches nothing', async () => {
    const { waited, store } = stubCaches()
    const produce = vi.fn(() => Promise.resolve(new Response('body')))
    const response = await withCache('refused', TTL_TMY_SECONDS, contextWith(waited), produce, {
      admit: () => Promise.resolve(new Response('slow down', { status: 429 })),
    })
    expect(response.status).toBe(429)
    expect(produce).not.toHaveBeenCalled()
    expect(waited).toHaveLength(0)
    expect(store.size).toBe(0)
  })

  it('is not asked on a hit in either tier', async () => {
    const { waited } = stubCaches()
    const admit = vi.fn(() => Promise.resolve(null))
    const global = fakeStore()
    global.entries.set('held', {
      value: await new Response('from kv').arrayBuffer(),
      metadata: { contentType: 'text/plain' },
      expirationTtl: TTL_TMY_SECONDS,
    })
    const produce = (): Promise<Response> => Promise.resolve(new Response('from upstream'))
    await withCache('held', TTL_TMY_SECONDS, contextWith(waited), produce, {
      store: global.store,
      admit,
    })
    await Promise.all(waited)
    // and by now it is in the local tier too
    await withCache('held', TTL_TMY_SECONDS, contextWith(waited), produce, { admit })
    expect(admit).not.toHaveBeenCalled()
  })

  it('lets an admitted caller through to the upstream', async () => {
    const { waited } = stubCaches()
    const response = await withCache(
      'admitted',
      TTL_TMY_SECONDS,
      contextWith(waited),
      () => Promise.resolve(new Response('body')),
      { admit: () => Promise.resolve(null) },
    )
    expect(await response.text()).toBe('body')
  })
})
