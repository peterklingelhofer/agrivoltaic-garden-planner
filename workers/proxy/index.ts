import type { ExecutionContextLike, ProxyEnv } from './env'
import { handleHelper, HELPER_PATH } from './helper'
import { corsHeaders, handleRoute, jsonError, matchRoute } from './routes'

export interface ProxyHandler {
  fetch(request: Request, env: ProxyEnv, ctx: ExecutionContextLike): Promise<Response>
}

/**
 * On every answer this Worker builds, and the same four `public/_headers` puts on the static
 * assets, which never reach this handler. No `script-src` or `style-src`: the app inlines styles
 * and loads wasm and workers, and a CSP wrong by one source is a blank page
 */
export const SECURITY_HEADERS: Readonly<Record<string, string>> = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'geolocation=(self), camera=(), microphone=()',
  'Content-Security-Policy': "frame-ancestors 'none'",
}

const dispatch = async (
  request: Request,
  env: ProxyEnv,
  ctx: ExecutionContextLike,
): Promise<Response> => {
  /*
    Ahead of the GET-only rule, because the helper is the one route here that is asked a question,
    not sent to fetch something: the sentence being read is a body. Everything else stays
    GET, which is what keeps this proxy a cache in front of nine read-only upstreams
  */
  const { pathname } = new URL(request.url)
  if (pathname === HELPER_PATH && (request.method === 'GET' || request.method === 'POST')) {
    return handleHelper(request, env)
  }
  if (request.method !== 'GET') return jsonError(405, 'method not allowed')
  const route = matchRoute(pathname)
  return route === null ? jsonError(404, 'not found') : handleRoute(route, { request, env, ctx })
}

const handler: ProxyHandler = {
  fetch: async (request, env, ctx) => {
    const cors = corsHeaders(env, request.headers.get('Origin'))

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors })
    }

    const response = await dispatch(request, env, ctx)
    const headers = new Headers(response.headers)
    for (const [name, value] of cors) headers.set(name, value)
    for (const [name, value] of Object.entries(SECURITY_HEADERS)) headers.set(name, value)
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    })
  },
}

export default handler
