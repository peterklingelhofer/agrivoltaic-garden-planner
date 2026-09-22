import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'bun:test'
import { loadCropCatalog } from '../data/crops'
import type { OnboardingStep } from '../state/slices'
import { type HeldOutLine, reportHeldOut, scoreHeldOut, solvedOf } from './holdout-scoring'
import { createRemoteUnderstander } from './remote'

/**
 * The helper route read against the held-out sets, by a person, against a real model.
 *
 * CI cannot run this: it spends the account's free Neurons and needs a Worker with the AI binding
 * listening. It runs only with `HELPER_URL` set, so `bun run test` skips it, and it is the scored
 * script needed before the panel goes on. A full pass over both sets is about 160 sentences,
 * which on the 70B is most of a day's allowance; `HELPER_SAMPLE` takes the first N of each set
 * instead.
 *
 *   HELPER_URL=http://127.0.0.1:8787 HELPER_SAMPLE=12 bun test src/agent/helper-holdout.live.test.ts
 *
 * The sets stay where they are, as module-private constants in the two held-out test files, so
 * they are read here as text, without being imported: importing a test file runs its suites
 */
const HELPER_URL = process.env.HELPER_URL ?? null
const SAMPLE = Number(process.env.HELPER_SAMPLE ?? '0')

const SETS = ['src/agent/holdout-two.test.ts', 'src/agent/holdout-three.test.ts']

const linesOf = (file: string): readonly HeldOutLine[] => {
  const text = readFileSync(file, 'utf8')
  const found: HeldOutLine[] = []
  const entry =
    /\{\s*said:\s*'((?:[^'\\]|\\.)*)',\s*step:\s*('([a-z-]+)'|null),\s*want:\s*'([a-z-]+)'/g
  for (let match = entry.exec(text); match !== null; match = entry.exec(text)) {
    found.push({
      said: (match[1] ?? '').replace(/\\'/g, "'"),
      step: (match[3] ?? null) as OnboardingStep | null,
      want: match[4] ?? '',
    })
  }
  return found
}

describe.skipIf(HELPER_URL === null)('the helper route, against the held-out sets', () => {
  it('reads at least as well as the embedding did', async () => {
    const catalog = await loadCropCatalog()
    const remote = createRemoteUnderstander({
      fetch: (input, init) => fetch(`${HELPER_URL ?? ''}${String(input)}`, init),
    })
    expect(await remote.ready(), 'the probe answered something other than 204').toBe(true)

    const reports: string[] = []
    for (const file of SETS) {
      const all = linesOf(file)
      const lines = SAMPLE > 0 ? all.slice(0, SAMPLE) : all
      const verdict = await scoreHeldOut(lines, (said, step) =>
        remote.route(said, { step, catalog }),
      )
      reports.push(reportHeldOut(file, verdict))
      // the embedding's measured figure on these sets is 82 to 86 percent of what it acted on;
      // a model that reads worse than the router it replaces is the one outcome to refuse
      expect(solvedOf(verdict), reportHeldOut(file, verdict)).toBeGreaterThanOrEqual(0.8)
    }
    process.stdout.write(`${reports.join('\n')}\n`)
  }, 600_000)
})
