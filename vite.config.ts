import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { access, cp, rm, stat } from 'node:fs/promises'
import { createReadStream } from 'node:fs'
import { join, normalize } from 'node:path'
import type { Plugin } from 'vite'
import { agentEnabled } from './src/agent/flag.ts'
import { rustCoreEnabled } from './src/sim/rust-core-flag.ts'
import { DEV_PROXY } from './dev-proxy.ts'

/**
 * The agent's model weights, served in development and shipped only when the agent is.
 *
 * They live in `models/` at the repo root rather than in `public/`, because `public/` is copied
 * into every build unconditionally: 48 MB of embedder and ONNX runtime went into a `dist` for a
 * build with `VITE_AGENT` unset, which is a build that contains none of the code that would load
 * them. A flag that removes the feature and ships its assets anyway isn't a flag.
 *
 * Absent by default. `bun run fetch-agent-model` puts them there, and without them
 * `src/agent/embedding.ts` falls back to the lexical router and the app is unchanged
 */
const MODEL_DIR = 'models'

const agentModels = (enabled: boolean): Plugin => ({
  name: 'agent-models',
  configureServer: (server) => {
    server.middlewares.use((request, response, next) => {
      const url = request.url ?? ''
      if (!url.startsWith('/models/')) return next()
      // normalized and re-rooted, so a `..` in the request can't walk out of the directory
      const within = normalize(url.split('?')[0] ?? '').replace(/^(\.\.[/\\])+/, '')
      const file = join(process.cwd(), within)
      if (!file.startsWith(join(process.cwd(), MODEL_DIR))) return next()
      stat(file)
        .then((info) => {
          if (!info.isFile()) return next()
          response.setHeader(
            'Content-Type',
            file.endsWith('.wasm')
              ? 'application/wasm'
              : file.endsWith('.mjs')
                ? 'text/javascript'
                : file.endsWith('.json')
                  ? 'application/json'
                  : 'application/octet-stream',
          )
          createReadStream(file).pipe(response)
        })
        .catch(() => next())
    })
  },
  /*
    And the copy the bundler makes of the same runtime, which nothing ever fetches.

    transformers.js resolves ONNX Runtime's WASM through `new URL(..., import.meta.url)`, so vite
    sees it, hashes it and emits it into `assets/`: 22.5 MiB of binary sitting beside the 22.5 MiB
    in `models/ort/`. It's never requested, because `embedding.ts` sets `wasmPaths` to
    `/models/ort/` precisely so that nothing on this page is fetched from a third party, and every
    URL the runtime builds starts from there.

    Dropped by name rather than by size, and only the runtime's own binaries. The e2e that watches
    for a failed request is what would catch this being wrong: a variant the browser asks for and
    doesn't get fails silently and leaves the agent on the phrase table, looking upgraded
  */
  generateBundle: (_options, bundle) => {
    for (const name of Object.keys(bundle)) {
      if (/(^|\/)ort-wasm[\w.-]*\.wasm$/.test(name)) delete bundle[name]
    }
  },
  /*
    Fails the build rather than warning, now that `bun run deploy` turns the agent on for itself.

    A build that carries the agent and ships no weights looks fine, 404s its own weights, silently
    falls back to the phrase table and reports itself as working. A build that can't ship what it
    claims to ship shouldn't produce a `dist`
  */
  closeBundle: async () => {
    if (!enabled) return
    await cp(MODEL_DIR, join('dist', MODEL_DIR), { recursive: true }).catch((cause: unknown) => {
      throw new Error(
        `[agent-models] this build carries the agent but there's no ${MODEL_DIR}/ to ship. Run \`bun run fetch-agent-model\` first, or build without VITE_AGENT=on`,
        { cause },
      )
    })
  },
})

/** The compiled file `bun run rust:wasm` writes, which is also what `bun run dev` serves */
const RUST_CORE_FILE = join('public', 'agv-sim.wasm')
const RUST_CORE_SHIPPED = join('dist', 'agv-sim.wasm')

/**
 * Unlike the weights above, the core lives in `public/`, because at ~100 kB it is not worth a
 * second dev middleware to keep out of a build.
 *
 * **This is no longer a feature flag, it's a required asset.** The TypeScript physics has been
 * deleted, so a build without this wasm is a build that can't compute a garden: it renders the
 * shell and every number refuses. `VITE_RUST_CORE=off` still removes it, which is useful for
 * exactly one thing, proving that the refusal is loud. Everything else builds with it, and a
 * missing file fails the build rather than shipping an app that opens and does nothing.
 *
 * The same two failures the agent plugin above exists to prevent, in the same order. A build with
 * the flag ON and no wasm would 404 its own core and refuse every number, and a build with the flag
 * OFF would ship a core that nothing fetches
 */
const rustCore = (enabled: boolean): Plugin => ({
  name: 'rust-core',
  apply: 'build',
  closeBundle: async () => {
    if (!enabled) {
      await rm(RUST_CORE_SHIPPED, { force: true })
      return
    }
    await access(RUST_CORE_FILE).catch((cause: unknown) => {
      throw new Error(
        `[rust-core] this build carries the Rust physics core but there's no ${RUST_CORE_FILE} to ship. Run \`bun run rust:wasm\` first, or build without VITE_RUST_CORE=on`,
        { cause },
      )
    })
  },
})

// https://vite.dev/config/
export default defineConfig(({ command }) => {
  const agent = agentEnabled({ VITE_AGENT: process.env.VITE_AGENT, DEV: command === 'serve' })
  const rust = rustCoreEnabled({ VITE_RUST_CORE: process.env.VITE_RUST_CORE })
  return {
    plugins: [react(), agentModels(agent), rustCore(rust)],
    /*
    The agent flag, computed here and injected as a literal so the bundler can fold it and drop
    the whole feature. `agentEnabled` is imported rather than reimplemented: the rule has one
    statement and one set of tests, and this is the only place it is evaluated for a build
  */
    define: {
      __AGENT_ENABLED__: JSON.stringify(agent),
    },
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
    server: {
      // WORKER_PROXY_BASE is a relative path, so without this PVGIS and NSRDB fall back
      // silently under plain `bun run dev` and only work under `bun run dev:worker`
      proxy: DEV_PROXY,
    },
    // the same proxies for `vite preview`, so a built app can be walked by hand or by the persona
    // driver against the real upstreams. The e2e suite is unaffected: it intercepts every
    // upstream in the browser before a request reaches this server
    preview: {
      proxy: DEV_PROXY,
    },
  }
})
