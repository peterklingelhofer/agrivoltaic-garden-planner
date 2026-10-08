import type { ProxyOptions } from 'vite'

/**
 * The proxy table both dev servers need, kept in one place so it can't fork.
 *
 * `vite.config.ts` resolves real sites with it under `bun run dev` and `vite preview`. Any other
 * server needs the exact same upstream routing for weather, soil and geocoding, and the rules are
 * order-sensitive: vite matches proxy keys in the order they are listed, and the catch-all
 * `/api/proxy` rule is a prefix of every rule above it, so it has to come last or it swallows them.
 * A copy pasted into the second config would drift the first time either config's rules changed,
 * and silently, because there's no test for a dev proxy: the only sign would be one of the two
 * apps resolving a site against the wrong host
 */
export const DEV_PROXY = {
  /*
   * The weather goes straight to its upstream under plain `bun run dev`.
   *
   * The app asks for it under `/api/proxy` so the deployed edge cache can hold it. PVGIS and NSRDB
   * can afford to fall back silently when no `wrangler dev` is listening, because both have
   * fallbacks. Weather has none: it's what every simulation, ranking, calendar and water balance
   * reads, so routing it at 127.0.0.1:8787 would mean `bun run dev` alone couldn't resolve a site
   * at all. This rule is listed FIRST because vite matches proxy keys in order, and the
   * `/api/proxy` rule below is a prefix of it.
   *
   * There's no cache on this leg, which is correct: one developer isn't the load the cache
   * exists for, and `bun run dev:worker` exercises the real path when that is what is wanted
   */
  '/api/proxy/open-meteo': {
    target: 'https://archive-api.open-meteo.com',
    changeOrigin: true,
    rewrite: (path) => path.replace(/^\/api\/proxy\/open-meteo/, ''),
  },
  /*
   * And the place-name lookup, for the same reason and with one caveat worth writing down.
   *
   * Without this, typing an address under plain `bun run dev` reaches 127.0.0.1:8787, which is
   * nothing, and the guided path's first question can't be answered at all. What this leg CANNOT
   * do is what the proxy exists for: vite forwards the browser's own User-Agent, so a dev session
   * identifies itself with whatever the browser sends. Sending the app's own User-Agent is the
   * deployed path's job, and `bun run dev:worker` is where it can be seen working
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
  /*
   * And the soil map, for the weather's reason.
   *
   * The app asks for it under `/api/proxy` so the deployed edge cache can hold it, and without this
   * rule that request reaches 127.0.0.1:8787, which is nothing. Every site resolved under plain
   * `bun run dev` would then say the soil map couldn't be reached and start each bed from an
   * assumed loam. The prefix is stripped and the path that follows is ISRIC's own, so the request
   * arrives as the Worker would send it.
   *
   * There's no cache on this leg either. ISRIC allows 5 calls a minute, and a lookup at a built-up
   * point asks up to five times, the point and then a ring of four that stops at the first
   * reading, so a developer reloading one town for a minute can run out. `bun run dev:worker` is
   * where the cached path can be seen
   */
  '/api/proxy/soilgrids': {
    target: 'https://rest.isric.org',
    changeOrigin: true,
    rewrite: (path) => path.replace(/^\/api\/proxy\/soilgrids/, ''),
  },
  '/api/proxy': {
    target: 'http://127.0.0.1:8787',
    changeOrigin: true,
  },
} satisfies Record<string, ProxyOptions>
