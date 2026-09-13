import { existsSync } from 'node:fs'

/**
 * Whether the sentence-embedding weights are on disk, in one place.
 *
 * Three test files read this, and each skips its embedding half when the answer is false. `models/`
 * is gitignored, so with no fetch in `.github/workflows/ci.yml` the router that the whole feature
 * rests on would be tested on a developer's laptop and nowhere else, with eight tests reported as
 * skipped in a run nobody reads. The workflow fetches the weights, against a cache, so in CI the
 * skip is a failure.
 *
 * Hence `MODEL_REQUIRED`. Locally, absent weights still skip, because a fresh clone should be
 * able to run the suite without a 58 MB download it didn't ask for. In CI the same absence is a
 * hard failure, asserted by `model-presence.test.ts`, because there the weights are fetched on
 * purpose and their absence means the fetch broke rather than that somebody is working offline.
 *
 * Node-only, and imported by tests alone. `boundary.test.ts` holds that. Nothing the browser
 * loads may reach this file, because `node:fs` doesn't exist there
 */
export const MODEL_DIR = 'models'

export const MODEL_FILE = `${MODEL_DIR}/Xenova/all-MiniLM-L6-v2/onnx/model_quantized.onnx`

export const HAVE_MODEL = existsSync(MODEL_FILE)

/**
 * Opt-in by its own variable, deliberately separate from `CI`.
 *
 * It read `Boolean(process.env.CI)` for about an hour, and that was a bug waiting on a second CI.
 * There's one: Cloudflare Workers Builds deploys this repo on every push to `main`, it runs `bun run test` as part of its build command, and it sets `CI` the
 * way every builder does.
 *
 * This said Workers Builds "has no `models/`" until 2026-09-09. It has them: `build:deploy` runs
 * `fetch-agent-model` before the suite, and that script writes to `models/` at the repo root,
 * which is the path `HAVE_MODEL` reads. Whether the claim was ever true isn't checkable from
 * here. Both builders fetch the weights today,
 * so the case that motivated this variable doesn't bite either of them.
 *
 * The rule stays regardless. "This builder fetches the weights" is still
 * not derivable from "this is a builder", and the next one to set `CI` without fetching would
 * fail on a file nobody asked it for. Only the workflow that actually fetches them sets this
 */
export const MODEL_REQUIRED = process.env.REQUIRE_AGENT_MODEL === '1'
