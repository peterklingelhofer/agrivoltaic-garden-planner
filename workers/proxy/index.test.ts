import { afterEach, describe, expect, it } from 'bun:test'
import { vi } from '../../test/vi'
import type { ExecutionContextLike, ProxyEnv } from './env'
import handler, { SECURITY_HEADERS } from './index'
import { PROXY_PREFIX } from './routes'

const ENV: ProxyEnv = {
  NSRDB_API_KEY: 'secret-key',
  NSRDB_HOST: 'developer.nlr.gov',
  PVGIS_HOST: 're.jrc.ec.europa.eu',
  ALLOWED_ORIGINS: 'https://garden.example.org',
}

const ctx: ExecutionContextLike = { waitUntil: () => undefined }

const PVGIS_URL = `https://host${PROXY_PREFIX}/pvgis/api/v5_3/tmy?lat=42.37&lon=-71.06`

const stubEdge = (upstream = new Response('{"outputs":{}}')): void => {
  const cache = { match: () => Promise.resolve(undefined), put: () => Promise.resolve() }
  vi.stubGlobal('caches', { default: cache, open: () => Promise.resolve(cache) })
  vi.stubGlobal('fetch', () => Promise.resolve(upstream))
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('proxy handler', () => {
  it('answers a preflight with 204 and the cors headers', async () => {
    const request = new Request(PVGIS_URL, {
      method: 'OPTIONS',
      headers: { Origin: 'https://garden.example.org' },
    })
    const response = await handler.fetch(request, ENV, ctx)
    expect(response.status).toBe(204)
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('https://garden.example.org')
  })

  it('preflights from a disallowed origin carry no allow-origin header', async () => {
    const request = new Request(PVGIS_URL, {
      method: 'OPTIONS',
      headers: { Origin: 'https://evil.example' },
    })
    const response = await handler.fetch(request, ENV, ctx)
    expect(response.status).toBe(204)
    expect(response.headers.get('Access-Control-Allow-Origin')).toBeNull()
  })

  it('404s an unrouted path as json', async () => {
    const response = await handler.fetch(new Request('https://host/api/proxy/nope'), ENV, ctx)
    expect(response.status).toBe(404)
    expect(await response.json()).toEqual({ error: 'not found' })
  })

  it('405s a non-GET method rather than forwarding it', async () => {
    stubEdge()
    const response = await handler.fetch(new Request(PVGIS_URL, { method: 'POST' }), ENV, ctx)
    expect(response.status).toBe(405)
  })

  it('merges cors headers onto a proxied body without dropping it', async () => {
    stubEdge()
    const request = new Request(PVGIS_URL, { headers: { Origin: 'https://garden.example.org' } })
    const response = await handler.fetch(request, ENV, ctx)
    expect(response.status).toBe(200)
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('https://garden.example.org')
    expect(response.headers.get('Vary')).toBe('Origin')
    expect(await response.text()).toBe('{"outputs":{}}')
  })

  it('serves a same-origin request, which carries no Origin header, unimpeded', async () => {
    stubEdge()
    const response = await handler.fetch(new Request(PVGIS_URL), ENV, ctx)
    expect(response.status).toBe(200)
    expect(response.headers.get('Access-Control-Allow-Origin')).toBeNull()
  })

  it('keeps cors headers on error responses so the browser can read the status', async () => {
    stubEdge()
    const request = new Request(`https://host${PROXY_PREFIX}/pvgis/api/v5_3/tmy`, {
      headers: { Origin: 'https://garden.example.org' },
    })
    const response = await handler.fetch(request, ENV, ctx)
    expect(response.status).toBe(400)
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('https://garden.example.org')
  })

  /**
   * The static assets never reach this handler, so their headers come from `public/_headers`
   * and the proxy's from `SECURITY_HEADERS`. Read side by side here, so the two lists cannot
   * drift apart the way two copies of anything do
   */
  it('puts the same four security headers on every answer that the static assets get', async () => {
    stubEdge()
    const assets = await Bun.file(new URL('../../public/_headers', import.meta.url)).text()
    expect(assets.startsWith('/*\n')).toBe(true)
    expect(Object.keys(SECURITY_HEADERS)).toHaveLength(4)
    for (const response of [
      await handler.fetch(new Request(PVGIS_URL), ENV, ctx),
      await handler.fetch(new Request('https://host/api/proxy/nope'), ENV, ctx),
    ]) {
      for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
        expect(response.headers.get(name)).toBe(value)
        expect(assets).toContain(`\n  ${name}: ${value}\n`)
      }
    }
    // frame-ancestors only: a script-src or style-src wrong by one source is a blank page
    expect(SECURITY_HEADERS['Content-Security-Policy']).toBe("frame-ancestors 'none'")
  })
})
