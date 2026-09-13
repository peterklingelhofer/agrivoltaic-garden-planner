/**
 * Which implementation of the physics this module graph is running.
 *
 * Module state, which is normally a smell, and here it is the only design that works. The
 * simulation runs inside a Web Worker, and a `RustCore` is a set of closures over a
 * `WebAssembly.Instance`: it can't cross `postMessage`, so it can't be passed in as a parameter
 * from the page that decided to use it. Each module graph that wants one has to instantiate its
 * own and install it here.
 *
 * The default is null, and it's no longer a fallback. Until the core is installed there is no
 * implementation of the physics at all: `requirePhysicsCore` refuses rather than degrading, and
 * `src/main.tsx` awaits the install before the first render for that reason
 */

import type { RustCore } from './rust-core'

/**
 * Which implementation produced a number.
 *
 * `typescript` survives as a value even though no TypeScript physics remains, because a
 * `SimulationResult` persisted before the port carries it and refusing to parse a saved garden over
 * a label would be a worse trade than reading it. `physicsImplementation` returns it when no core
 * is installed
 */
export type PhysicsImplementation = 'typescript' | 'rust'

let installed: RustCore | null = null

/**
 * Install a core, or pass null to remove it.
 *
 * Idempotent and repeatable on purpose: tests install one, run a comparison and put it back, and
 * a test that threw halfway through must not leave the next one running against a core it didn't
 * ask for
 */
export const installPhysicsCore = (core: RustCore | null): void => {
  installed = core
}

export const physicsCore = (): RustCore | null => installed

/**
 * The core, or a refusal.
 *
 * Every numeric path in `src/sim` goes through this now, because the TypeScript implementations
 * they used to fall back to have been deleted. There's nothing to degrade to and pretending
 * otherwise is how a garden gets lit by the wrong sun: a second algorithm producing plausible
 * numbers is worse than no numbers, which is the same argument `src/data/http.ts` makes about
 * refusing a read rather than defaulting it.
 *
 * The message names the two things that actually cause this, because both are recoverable and
 * neither is obvious from a stack trace
 */
export const requirePhysicsCore = (): RustCore => {
  if (installed === null) {
    throw new Error(
      "the physics core isn't loaded: run `bun run rust:wasm` to build it, and make sure ensurePhysicsCore() has resolved before computing",
    )
  }
  return installed
}

export const physicsImplementation = (): PhysicsImplementation =>
  installed === null ? 'typescript' : 'rust'
