/**
 * Preloaded before every test file, by the `preload` key in `bunfig.toml`.
 *
 * This is the bun replacement for what `vitest.setup.ts` and the `define` block in
 * `vitest.config.ts` did between them: install the compiled physics core, and put the agent flag
 * in place. Bun runs a preload once per isolated test file, which is the same guarantee vitest's
 * `setupFiles` gave, so nothing here may assume it runs only once.
 *
 * Every numeric path in `src/sim` goes through the core now; the TypeScript implementations they
 * used to carry have been deleted, and `requirePhysicsCore` refuses rather than degrading. So a
 * suite without the wasm cannot test the physics at all, and this fails loudly rather than
 * letting three hundred tests report a missing core one confusing assertion at a time.
 *
 * Running the tests needs a Rust toolchain. `bun run rust:wasm` is the whole of it, it takes under
 * a second after the first build, and `bun run test` runs it first so nobody has to know.
 */
import { readFileSync } from 'node:fs'
import { mock } from 'bun:test'
import { agentEnabled } from '../src/agent/flag'
import { HAVE_MODEL } from '../src/agent/model-presence'
import { installPhysicsCore } from '../src/sim/core'
import { rustCore } from '../src/sim/rust-core'

/*
  Keeps the native ONNX runtime out of the test process when there is nothing for it to run.

  `src/agent/embedding.ts` does `await import('@huggingface/transformers')`. That package exports a
  `node` condition and a `default` one. Bun takes `node`, which `dlopen`s `onnxruntime-node` and
  `sharp`; Vite takes `default`, which is `transformers.web.js` on WASM, and the web build is what
  ships. So the native runtime was loaded only by the test process, and it is what crashed it: a
  test worker segfaulted at the same address in `agent-waiting.test.tsx` on two of seventeen full
  runs, taking every unfinished file with it, and bun's own crash report names a native addon.

  Without the weights there is no model to run either way, so the web build is a strictly better
  thing to load: it matches production and it opens no native library. With them the native build
  stays, because that is what `holdout-two` and `holdout-three` embed against.

  Note what this does NOT cover. Both builders have the weights: GitHub CI fetches them, and so
  does Cloudflare Workers Builds, because `build:deploy` runs `fetch-agent-model` before the suite
  and that script writes to `models/` at the repo root, which is the path `HAVE_MODEL` reads. So
  the redirect below is a local-clone convenience, and what actually protects the deploy gate is
  the other half of the fix: `agent-waiting.test.tsx` and `agent-composer.test.tsx` refusing the
  module outright, which holds whether the weights are there or not. The twenty clean runs that
  measured the fix were made on a machine that HAS the weights, so they speak to the builders'
  configuration directly.

  A resolver plugin was tried first and does not work: its `setup` runs and its `onResolve` is
  never called for a bare node_modules specifier. `mock.module` is what bun honours here
*/
if (!HAVE_MODEL) {
  /*
    Awaited here rather than inside the factory: a factory that returns a promise is not honoured,
    and the native build loads anyway. This one was measured, not assumed
  */
  const web = await import(
    `${process.cwd()}/node_modules/@huggingface/transformers/dist/transformers.web.js`
  )
  mock.module('@huggingface/transformers', () => web)
}
/*
  The same literal the app build injects, so a component test sees the flag the browser would.
  Vite substitutes `__AGENT_ENABLED__` textually; there is no bundler here, so it has to be a real
  global, which is what the bare identifier resolves to anyway. Unit tests of the RULE itself call
  `agentEnabled` directly and ignore this
*/
;(globalThis as { __AGENT_ENABLED__?: boolean }).__AGENT_ENABLED__ = agentEnabled({
  VITE_AGENT: process.env.VITE_AGENT,
  DEV: true,
})

/*
  React reports an error a boundary has ALREADY caught to `reportError`, so that a browser's error
  console still shows it. Bun treats an unhandled report as a failed test; vitest did not, and
  jsdom absorbs it into a window error event, which is why only the DOM-less scene run trips over
  this. `SceneBoundary` swallowing an IBL subtree that the fake WebGL context cannot draw is the
  behaviour `scene.test.tsx` exists to check, so the report is printed rather than thrown

  Unconditional, so both halves of the suite behave the same way. Bun ships a `reportError` that
  rethrows and jsdom ships one that does not, and which of the two a file got would otherwise
  depend on whether it ran under `test:dom` or `test:scene`
*/
globalThis.reportError = (error: unknown): void => {
  process.stderr.write(`caught by an error boundary: ${String(error)}\n`)
}

const WASM = 'crates/agv-sim/target/wasm32-unknown-unknown/release/agv_sim.wasm'

/*
  Top-level await rather than `beforeAll`, and the difference is not cosmetic. A preload is
  evaluated before the test module is imported, but `beforeAll` hooks run after that import.
  Several suites compute physics at module scope to build a fixture, so with a hook they failed on
  the import line with a missing core, before a single test had run.
*/
let bytes: Buffer
try {
  bytes = readFileSync(WASM)
} catch (cause) {
  throw new Error(
    `the physics core is not built: ${WASM} is missing. Run \`bun run rust:wasm\`. Since the TypeScript physics was deleted there is nothing for the suite to fall back to`,
    { cause },
  )
}
const compiled = await WebAssembly.compile(bytes)
installPhysicsCore(rustCore(await WebAssembly.instantiate(compiled, {})))
