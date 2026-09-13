/**
 * Asks the deployed site what it is actually serving.
 *
 * The reason this exists rather than a curl in a runbook: `wrangler.jsonc` sets
 * `not_found_handling: "single-page-application"`, so the Worker answers EVERY unmatched path
 * with `index.html` and a 200. A missing asset is therefore not a 404 and never will be. Checked
 * against the live site on 2026-08-31:
 *
 *     GET /models/Xenova/all-MiniLM-L6-v2/config.json  ->  200, content-type: text/html
 *     GET /definitely-not-a-real-path-xyz              ->  200, content-type: text/html
 *
 * The hollow-agent deploy is the failure mode this feature has hit twice, and a silent 404
 * was the symptom named for it. It is worse than that: there is no 404 to notice. So
 * this reads the BODY, not the status, and asks whether the bytes are the thing they claim to be.
 *
 *     bun run verify-deploy                 # the canonical workers.dev hostname
 *     bun run verify-deploy <url>           # somewhere else
 *     AGENT=on bun run verify-deploy        # expect a build that carries the agent
 *
 * The agent is NOT expected by default, because since 2026-09-03 `build:deploy` no longer turns
 * it on: the author tried the deployed chat and found it answered strangely and uselessly, so it
 * is off in production until it is worth someone's time. `AGENT=on` is for checking a deploy
 * somebody deliberately built with `VITE_AGENT=on`
 */

const DEFAULT_URL = 'https://agrivoltaic-garden-designer.peterklingelhofer.workers.dev'
const base = (process.argv[2] ?? DEFAULT_URL).replace(/\/$/, '')
const wantAgent = process.env.AGENT === 'on'

/** A marker the bundler cannot fold away while the agent is in the build: the toolbar's own id */
const AGENT_MARKER = 'action-toolbar-ask'
const MODEL_CONFIG = '/models/Xenova/all-MiniLM-L6-v2/config.json'

const failures = []
const notes = []

const get = async (path) => {
  const response = await fetch(`${base}${path}`)
  return {
    status: response.status,
    type: response.headers.get('content-type') ?? '',
    body: await response.text(),
  }
}

const index = await get('/')
if (index.status !== 200) failures.push(`the site answered ${String(index.status)}`)

// the hashed entry bundle, read out of the served HTML rather than guessed from dist
const entry = /assets\/index-[A-Za-z0-9_-]+\.js/.exec(index.body)?.[0]
if (entry === undefined) failures.push('no hashed entry bundle in the served index.html')
else {
  const script = await get(`/${entry}`)
  const carriesAgent = script.body.includes(AGENT_MARKER)
  notes.push(`entry bundle ${entry}, ${String(Math.round(script.body.length / 1024))} kB`)
  if (wantAgent && !carriesAgent) {
    failures.push(
      `the deployed bundle has no agent in it: "${AGENT_MARKER}" is absent, so this was built without VITE_AGENT=on`,
    )
  }
  if (!wantAgent && carriesAgent) {
    failures.push(
      'the deployed bundle carries the agent, and it is meant to be off in production: something set VITE_AGENT=on',
    )
  }
}

if (wantAgent) {
  /*
    JSON.parse and not a status check, for the reason at the top: the SPA fallback returns the
    index page with a 200 for a path that does not exist, so "did it parse as the JSON it claims
    to be" is the only question whose answer means anything here
  */
  const config = await get(MODEL_CONFIG)
  try {
    const parsed = JSON.parse(config.body)
    if (typeof parsed !== 'object' || parsed === null) throw new Error('not an object')
    notes.push(`model config parsed, model_type=${String(parsed.model_type ?? 'unknown')}`)
  } catch {
    failures.push(
      `${MODEL_CONFIG} is not JSON (content-type ${config.type}), so the weights were never deployed and the agent will fall back to the phrase table while reporting itself as working`,
    )
  }
}

for (const note of notes) console.log(`  ${note}`)

if (failures.length > 0) {
  console.error(`\n${base} is not serving what it should:`)
  for (const failure of failures) console.error(`  - ${failure}`)
  process.exit(1)
}

console.log(`\n${base} looks right (agent ${wantAgent ? 'present' : 'absent'}, as expected)`)
