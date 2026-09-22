#!/usr/bin/env node
/**
 * Fetches the agent's sentence embedder into `models/` at the repo root.
 *
 * Self-hosted, for the same reason every upstream in
 * `src/data/http.ts` is either allowlisted or proxied: a page that carefully routes nine third
 * parties shouldn't quietly acquire a tenth, and an agent that stops working on a train isn't
 * an agent. It also keeps the weights out of git, which is what `scripts/fetch-static-layers.mjs`
 * does with the climate rasters and for the same reason: 23 MB of binary isn't a diff.
 *
 * NOT in `public/`, which is the obvious place and is wrong. Vite copies `public/` wholesale into
 * every build, so putting the weights there took `dist` from 4.6 MB to 52 MB in a build with the
 * agent switched OFF: 48 MB of a feature that build doesn't contain. The `agentModels` plugin in
 * `vite.config.ts` serves this directory in development and copies it into `dist` only when
 * `VITE_AGENT=on`, which is what makes the flag's promise true of the assets as well as the code.
 *
 * Without this the app still works. `src/agent/embedding.ts` fails soft to the lexical router,
 * which needs no download and reads 61% against the held-out set where this reads 82%
 */
import { copyFile, mkdir, readdir, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const OUT = join(HERE, '..', 'models', 'Xenova', 'all-MiniLM-L6-v2')
const BASE = 'https://huggingface.co/Xenova/all-MiniLM-L6-v2/resolve/main'

/** Everything transformers.js opens for a quantized feature-extraction pipeline, and nothing else */
const FILES = [
  'config.json',
  'tokenizer.json',
  'tokenizer_config.json',
  'onnx/model_quantized.onnx',
]

const get = async (name) => {
  const response = await fetch(`${BASE}/${name}`)
  if (!response.ok) throw new Error(`${name}: ${String(response.status)} ${response.statusText}`)
  return Buffer.from(await response.arrayBuffer())
}

/**
 * ONNX Runtime's WASM binaries, copied out of node_modules.
 *
 * transformers.js resolves these from a jsDelivr URL unless told otherwise, which would put a
 * third-party fetch back into a page that deliberately has none, and would break the agent for
 * anybody offline. `src/agent/embedding.ts` points `wasmPaths` at where this puts them.
 *
 * Two variants, because the BROWSER decides which one loads. When the one it asks for is missing,
 * the request 404s, the runtime fails silently, and the agent runs on the lexical router while
 * appearing to have upgraded. That's the worst way for this to break.
 *
 * `asyncify` is what the runtime chooses when threads are unavailable, which is every page that
 * is not cross-origin isolated, this one included, and deliberately, since COOP and COEP would
 * change how every other asset on it is fetched. The plain build covers the isolated case.
 *
 * `jsep` and `jspi` are left out on purpose. jsep is the WebGPU path and this pipeline runs on
 * WASM, and jspi is experimental. jsep is also 26.1 MB, which is within a rounding error of
 * Cloudflare's 25 MiB per-asset ceiling, so shipping it would put the deploy one release of
 * onnxruntime away from failing for a file nothing loads
 */
const ORT_DIR = join(HERE, '..', 'models', 'ort')

/*
  Resolved THROUGH transformers.js. Bun hoists, so `node_modules/onnxruntime-web` does happen to
  exist, but resolving from the package that actually loads the runtime finds exactly the copy it
  will use, with no second one this script would have to pin and keep in step. Depending on a
  hoisted path is depending on a layout the package manager is free to change
*/
const ortDist = () => {
  const fromHere = createRequire(import.meta.url)
  const fromTransformers = createRequire(fromHere.resolve('@huggingface/transformers'))
  /*
    Resolving the package.json is blocked by the package's own `exports` map, so the entry point
    is resolved instead and walked back to its directory: onnxruntime-web's main already lives in
    `dist`, which is what this needs
  */
  return dirname(fromTransformers.resolve('onnxruntime-web'))
}
const ORT_FILES = [
  'ort-wasm-simd-threaded.mjs',
  'ort-wasm-simd-threaded.wasm',
  'ort-wasm-simd-threaded.asyncify.mjs',
  'ort-wasm-simd-threaded.asyncify.wasm',
]

const copyRuntime = async () => {
  await mkdir(ORT_DIR, { recursive: true })
  const source = ortDist()
  const available = new Set(await readdir(source))
  for (const name of ORT_FILES) {
    if (!available.has(name)) {
      console.warn(`missing ${name} in onnxruntime-web/dist; the runtime layout may have changed`)
      continue
    }
    await copyFile(join(source, name), join(ORT_DIR, name))
    console.log(`ort/${name}`)
  }
}

const main = async () => {
  for (const name of FILES) {
    const target = join(OUT, name)
    await mkdir(dirname(target), { recursive: true })
    const body = await get(name)
    await writeFile(target, body)
    console.log(`${name}  ${(body.length / 1e6).toFixed(1)} MB`)
  }
  await copyRuntime()
  console.log(`\nwritten to models/`)
}

await main()
