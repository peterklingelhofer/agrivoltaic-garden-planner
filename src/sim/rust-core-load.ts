/**
 * Fetching and instantiating the compiled physics core, in a browser or a worker.
 *
 * On unless `VITE_RUST_CORE` is `off` (`rust-core-flag.ts`). Everything here resolves. It never
 * throws, and what a null means is the caller's decision:
 *
 * - The fetch does not happen at all when the flag is off, because a 404 writes a console error
 *   on every page load and several e2e specs assert there are none. `stubUpstreams` learned that
 *   lesson for the example garden; this is the same lesson.
 * - The wasm is fetched from a URL, so the app's module graph never depends
 *   on a Rust toolchain having run. `bun run rust:wasm` puts the file in `public/`, and `bun run
 *   build` runs it first.
 * - A failure of any kind resolves to null, and null is no physics at all: the TypeScript
 *   implementation is gone, so `requirePhysicsCore` in `core.ts` refuses every computation until
 *   a core is installed.
 *
 * The promise is cached, so a worker that runs twenty simulations instantiates once.
 */

import { installPhysicsCore } from './core'
import { rustCore, type RustCore } from './rust-core'
import { rustCoreEnabled, type RustCoreEnv } from './rust-core-flag'

export { rustCoreEnabled, type RustCoreEnv }

/** Where `bun run rust:wasm` leaves the build, relative to the served root */
export const RUST_CORE_URL = '/agv-sim.wasm'

let pending: Promise<RustCore | null> | null = null

const instantiate = async (url: string): Promise<RustCore | null> => {
  try {
    const response = await fetch(url)
    if (!response.ok) return null
    /*
      `instantiateStreaming` needs `application/wasm`, and a dev server or a static host that
      guesses the type wrongly makes it throw something that reads like a compile failure. The
      buffer route is a byte or two slower on a 57 kB file and never lies about why it failed
    */
    const module = await WebAssembly.compile(await response.arrayBuffer())
    return rustCore(await WebAssembly.instantiate(module, {}))
  } catch {
    return null
  }
}

/**
 * The core, or null. Never throws, never retries.
 *
 * Not retried because the two ways this returns null are a build without the wasm and a build
 * with a broken one, and neither improves on a second attempt within a session.
 */
export const loadRustCore = (
  env: RustCoreEnv,
  url: string = RUST_CORE_URL,
): Promise<RustCore | null> => {
  if (!rustCoreEnabled(env)) return Promise.resolve(null)
  pending ??= instantiate(url)
  return pending
}

/** For tests, which need each case to start from nothing */
export const forgetRustCore = (): void => {
  pending = null
}

/**
 * Load the core if this build asks for one, and install it for the rest of this module graph.
 *
 * Called from two places, because there are two module graphs: `src/main.tsx` for the page and
 * `runSimulation` for the worker the bake runs in. A worker gets its own instance of every module
 * this one imports, so an install on the page is invisible inside it.
 *
 * Installs only on success, so a core a test put in place by hand is never quietly replaced with
 * nothing by a later call.
 */
export const ensurePhysicsCore = async (
  env: RustCoreEnv,
  url: string = RUST_CORE_URL,
): Promise<void> => {
  const core = await loadRustCore(env, url)
  if (core !== null) installPhysicsCore(core)
}
