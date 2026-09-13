import type { ProxyOptions } from 'vite'

/**
 * The proxy table both dev servers need, kept in one place so it cannot fork.
 *
 * `vite.config.ts` resolves real sites in dev, and the game prototype's own dev server did too
 * while it existed. Any second server needs the exact same upstream routing for weather,
 * elevation and geocoding, and the rules are order-sensitive: vite matches proxy keys in the order they are
 * listed, and the catch-all `/api/proxy` rule is a prefix of every rule above it, so it has to
 * come last or it swallows them. A copy pasted into the second config would drift the first time
 * either config's rules changed, and silently, because there is no test for a dev proxy: the only
 * sign would be one of the two apps resolving a site against the wrong host
 */
export const DEV_PROXY = {
  /*
   * The weather and the elevation go straight to their upstreams under plain `bun run dev`.
   *
   * They moved behind the proxy for the edge cache, and PVGIS and NSRDB can afford to fall
   * back silently when no `wrangler dev` is listening because both have fallbacks. Weather
   * has none: it is what every simulation, ranking, calendar and water balance reads, so
   * routing it at 127.0.0.1:8787 would mean `bun run dev` alone could not resolve a site at
   * all. These two rules are listed FIRST because vite matches proxy keys in order, and the
   * `/api/proxy` rule below is a prefix of both.
   *
   * There is no cache on this leg, which is correct: one developer is not the load the cache
   * exists for, and `bun run dev:worker` exercises the real path when that is what is wanted
   */
  '/api/proxy/open-meteo': {
    target: 'https://archive-api.open-meteo.com',
    changeOrigin: true,
    rewrite: (path) => path.replace(/^\/api\/proxy\/open-meteo/, ''),
  },
  '/api/proxy/open-elevation': {
    target: 'https://api.open-elevation.com',
    changeOrigin: true,
    rewrite: (path) => path.replace(/^\/api\/proxy\/open-elevation/, ''),
  },
  /*
   * And the place-name lookup, for the same reason and with one caveat worth writing down.
   *
   * Without this, typing an address under plain `bun run dev` reaches 127.0.0.1:8787, which is
   * nothing, and the guided path's first question cannot be answered at all. What this leg
   * CANNOT do is what the proxy exists for: vite forwards the browser's own User-Agent, so a
   * dev session identifies itself as a browser rather than as this app. That is the deployed
   * path's job and `bun run dev:worker` is where it can be seen working
   */
  '/api/proxy/nominatim': {
    target: 'https://nominatim.openstreetmap.org',
    changeOrigin: true,
    rewrite: (path) => path.replace(/^\/api\/proxy\/nominatim/, ''),
  },
  '/api/proxy/photon': {
    target: 'https://photon.komoot.io',
    changeOrigin: true,
    rewrite: (path) => path.replace(/^\/api\/proxy\/photon/, ''),
  },
  '/api/proxy': {
    target: 'http://127.0.0.1:8787',
    changeOrigin: true,
  },
} satisfies Record<string, ProxyOptions>
