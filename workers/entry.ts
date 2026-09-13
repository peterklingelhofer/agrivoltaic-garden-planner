import type { ExecutionContextLike, ProxyEnv } from './proxy/env'
import proxy from './proxy/index'
import { PROXY_PREFIX } from './proxy/routes'

export interface SiteEnv extends ProxyEnv {
  readonly ASSETS: { fetch(request: Request): Promise<Response> }
}

/**
 * One Worker serves both the built SPA and the proxy, which is what keeps `/api/proxy/*`
 * same-origin with the app. `run_worker_first` in wrangler.jsonc means only proxy paths
 * reach this handler; the prefix test is the belt to that config's braces
 */
export default {
  fetch: (request: Request, env: SiteEnv, ctx: ExecutionContextLike): Promise<Response> =>
    new URL(request.url).pathname.startsWith(PROXY_PREFIX)
      ? proxy.fetch(request, env, ctx)
      : env.ASSETS.fetch(request),
}
