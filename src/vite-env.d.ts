/// <reference types="vite/client" />

/**
 * Whether this build carries the conversational agent, substituted as a literal by Vite.
 *
 * A `define`, because the value has to be statically FOLDABLE as well as correct. `AGENT_ENABLED =
 * agentEnabled(import.meta.env)` computes the right answer and is a function call, which no bundler
 * can see through: written that way, it ships a 23 kB `AgentPanel` chunk into a build with the
 * agent switched off, reachable by nothing and downloaded by nobody, which is exactly the thing the
 * flag exists to prevent.
 *
 * `agentEnabled` in `src/agent/flag.ts` is still the one statement of the rule; the config calls
 * it once, in node, and injects what it returns
 */
/*
  Inside `declare global` because tsconfig.app.json sets `moduleDetection: "force"`, which makes
  every file in src a module: a bare top-level `declare const` here would be local to this file
  and invisible to `flag.ts`
*/
declare global {
  const __AGENT_ENABLED__: boolean

  /**
   * Anything but `off`, including absent, builds an app that fetches `public/agv-sim.wasm` and runs
   * the Rust physics core. `off` builds one that cannot compute anything, because there is no
   * TypeScript physics to fall back to.
   *
   * Declared rather than `define`d, unlike the agent flag above. There is no chunk to shake out
   * here: the loader is a few dozen lines and it does not import the wasm, it fetches it, so a
   * build with the flag off carries the loader and never calls anything. The rule itself is stated
   * once, in `rustCoreEnabled`.
   */
  interface ImportMetaEnv {
    readonly VITE_RUST_CORE?: string
  }
}

export {}
