import { describe, expect, it } from 'bun:test'
import { HAVE_MODEL, MODEL_FILE, MODEL_REQUIRED } from './model-presence'

/**
 * The guard that turns a silent skip into a failure where it matters.
 *
 * Without it, a CI run with no `models/` reported 224 passed and 8 skipped, and the eight were
 * the entire evaluation of the embedding router: all three held-out sets and the understander's
 * own suite. A feature whose one claim is routing accuracy had, in CI, no coverage of the router
 * at all, and no assertion anywhere that it was any good. This is the first half of the fix and
 * the floors in the held-out sets are the second
 */
describe('the sentence-embedding weights', () => {
  it.skipIf(!MODEL_REQUIRED)('are present in CI, where their absence would skip the router', () => {
    expect(
      HAVE_MODEL,
      `${MODEL_FILE} is missing. CI must run \`bun run fetch-agent-model\` before the tests; see .github/workflows/ci.yml`,
    ).toBe(true)
  })

  it.skipIf(MODEL_REQUIRED)('may be absent on a fresh clone, which skips rather than fails', () => {
    // the local contract, asserted so that it is a decision rather than an accident
    expect(MODEL_REQUIRED).toBe(false)
  })
})
