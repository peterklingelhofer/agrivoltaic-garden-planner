/** The ratelimit binding's one method, in the shape both limits here are called with */
export interface RateLimit {
  limit(options: { key: string }): Promise<{ success: boolean }>
}

/**
 * The slice of a KV namespace the cache uses. Values are bytes, because NSRDB answers with an
 * octet stream, and the content type rides beside them as metadata so an answer is rebuilt as
 * what it was
 */
export interface KVStore {
  getWithMetadata(
    key: string,
    type: 'arrayBuffer',
  ): Promise<{ value: ArrayBuffer | null; metadata: unknown }>
  put(
    key: string,
    value: ArrayBuffer,
    options: { expirationTtl: number; metadata: unknown },
  ): Promise<void>
}

export interface ProxyEnv {
  /** secret binding, set with `wrangler secret put NSRDB_API_KEY`; absent in local dev */
  readonly NSRDB_API_KEY?: string
  /**
   * secret binding, set with `wrangler secret put NSRDB_EMAIL`; absent in local dev. NSRDB wants
   * a real address on every request and the client never sends one, so it is attached beside
   * the key and the route answers 503 without it
   */
  readonly NSRDB_EMAIL?: string
  /** secret binding, set with `wrangler secret put EIA_API_KEY`; absent in local dev */
  readonly EIA_API_KEY?: string
  readonly NSRDB_HOST: string
  readonly PVGIS_HOST: string
  readonly ALLOWED_ORIGINS: string
  /**
   * Workers AI, which reads a typed sentence for the conversational agent. Optional because its
   * absence is a supported state and not a fault: `wrangler dev` without a logged-in account has
   * no binding, the helper route then answers its readiness probe with a 404, and the panel goes
   * on reading sentences with the phrase table it ships with. See `helper.ts`
   */
  readonly AI?: { run(model: string, input: unknown): Promise<unknown> }
  /**
   * Which model the helper asks. Defaults to `DEFAULT_HELPER_MODEL`; the point of the var is that
   * the cheap model and the accurate one are swapped by config, since which is affordable is a
   * fact about the account
   */
  readonly HELPER_MODEL?: string
  /**
   * The rate limit that stops one caller spending the day's free Neurons in a minute. Optional
   * for the same reason `AI` is: local dev has no binding, and no limit is the right behaviour
   * there
   */
  readonly HELPER_LIMIT?: RateLimit
  /**
   * The same guard on every proxied route: 120 upstream calls a minute per address. `cache.ts`
   * asks it after both cache tiers have missed, so a hit costs nobody anything and what is
   * metered is exactly what spends an upstream's quota. Optional for the reason `HELPER_LIMIT` is
   */
  readonly PROXY_LIMIT?: RateLimit
  /**
   * The global cache tier: one KV namespace shared by every data centre, where the Cache API is
   * per data centre. Optional because the tests have no binding and the code has to run without
   * one, in which case the Cache API alone is used. `cache.ts` says what it holds and what it costs
   */
  readonly WEATHER_CACHE?: KVStore
}

export interface ExecutionContextLike {
  waitUntil(promise: Promise<unknown>): void
}
