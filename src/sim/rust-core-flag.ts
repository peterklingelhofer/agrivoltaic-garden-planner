/**
 * Whether a build runs the Rust physics core, stated once.
 *
 * **This is on by default, and the flag only turns it off.** There is no TypeScript physics to
 * fall back to: two implementations and a switch is more to maintain than one implementation, and
 * a switch only earns its keep while there really are two.
 *
 * What `off` now means is a build that cannot compute anything, which is useful for exactly one
 * thing: proving that the failure is loud. See `src/sim/core.ts`.
 *
 * A leaf module with no imports, for the same reason `src/agent/flag.ts` is one: `vite.config.ts`
 * has to evaluate this rule in node at build time, and the loader that also needs it pulls in the
 * whole wasm binding. One statement, two readers, neither dragging the other along.
 */

export interface RustCoreEnv {
  readonly VITE_RUST_CORE?: string | undefined
}

/**
 * `off` and nothing else turns it off.
 *
 * Not falsiness: an empty or absent variable is the ordinary case and must mean on, while a typo
 * must not silently disable the physics. Only the exact string `off` does that.
 */
export const rustCoreEnabled = (env: RustCoreEnv): boolean => env.VITE_RUST_CORE !== 'off'
