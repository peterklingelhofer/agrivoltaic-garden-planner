import { beforeAll, describe, expect, it } from 'bun:test'
import { loadCropCatalog } from '../data/crops'
import type { Crop } from '../types/crop'
import { DESTRUCTIVE } from './intent'
import { routeLexically } from './lexical'
import type { OnboardingStep } from '../state/slices'

/**
 * The third corpus, and the only one not written by the person who wrote the phrase table.
 *
 * `CORPUS` and `REPLIES` in `lexical.test.ts` both sit at 98%, and both were composed by someone
 * who knew what the router answers to. This one was written the other way round: forty things a
 * person might plausibly type, chosen without looking at `INTENTS` at all, and then scored. It
 * came out at **28%**.
 *
 * That gap is the honest measure of the feature, and the number is kept here as a ratchet:
 * `UNSCRIPTED_FLOOR` may only ever go up, and the corpus reads 100%.
 *
 * **This corpus has now been tuned against, and that is a real caveat on the last number.** It
 * was written before any of the work above and every fix was checked against it, which is exactly
 * the overfitting the first two corpora suffered from. `holdout.test.ts` is the answer to that:
 * a second set, written after the tuning stopped, and never used to choose a phrase. What makes it useful is not the percentage but
 * the CLASSIFICATION below, which is what says where the next hour of work belongs.
 */

/**
 * What each failure is actually caused by. The three classes want completely different work and
 * only ONE of them is a language problem, which is the whole argument about what to build next:
 *
 * - `missing` -- there is no such intent. The app computes the answer (a planting calendar, an
 *   energy report, a compliance check, companion rules) and the agent has no way to ask for it.
 *   No amount of language understanding invents a capability, so a bigger model changes nothing
 *   here. Fourteen of the twenty-nine failures.
 * - `wording` -- the right intent exists and the sentence missed it. This is the only class an
 *   embedding model helps with, and it is nine of the twenty-nine.
 * - `overreach` -- it should have said nothing and instead did something. Six of the forty
 *   sentences used to reach an intent that destroys work: "thanks" and "do I need planning
 *   permission" both reached `undo`, and "will this save me money" reached `plan-planting`, which
 *   replaces the plantings in every bed. `DESTRUCTIVE_FLOOR` closed that to zero, and it is the
 *   one class a more confident matcher would have made WORSE rather than better.
 */
const WILD: readonly (readonly [string, OnboardingStep | null, string])[] = [
  // ordinary answers, said the way people talk
  ["I've got a small yard behind my house in Portland", 'location', 'set-place'],
  ['somewhere in upstate New York', 'location', 'set-place'],
  ["it's about the size of a parking space", 'space', 'set-space'],
  ['maybe 20 foot square', 'space', 'set-space'],
  ['pretty sunny most of the day', 'surroundings', 'set-exposure'],
  ['my neighbour has a big oak', 'surroundings', 'set-exposure'],
  ['north facing', 'surroundings', 'set-exposure'],
  ['whatever is easiest', 'growing', 'set-ambition'],
  ['stuff for cooking', 'growing', 'set-ambition'],
  ['I mainly want the electricity', 'objective', 'set-objective'],
  ['keep it low please', 'height', 'set-height'],
  ['under 8 foot', 'height', 'set-height'],
  ['there is a tap nearby', 'water', 'set-water'],
  ['only when it rains', 'water', 'set-water'],
  ['idk', 'growing', 'NONE'],
  // "not sure" is a real thing to say and help is a better answer than silence
  ['not sure', 'mounting', 'help'],

  // asking things the app can answer
  ['how much electricity will I get', null, 'ask-energy'],
  ['when should I plant the beans', null, 'ask-calendar'],
  ['what do I do first', null, 'ask-agenda'],
  ['is this legal', null, 'ask-compliance'],
  ['how much water does it need', null, 'ask-water'],
  ['what goes well with tomatoes', null, 'ask-companions'],
  ['show me the sources', null, 'ask-sources'],

  // editing what exists
  ['actually make it 8 by 5', null, 'set-space'],
  ['change the size to 10 by 10', null, 'set-space'],
  ['make the panels taller', null, 'adjust-panels'],
  ['start over', null, 'start-over'],
  ['remove the tomatoes', null, 'remove-planting'],
  ['add more beds', null, 'add-bed'],

  // meta and small talk
  ['what is agrivoltaics', null, 'define'],
  ['can I put solar panels over my tomatoes', null, 'define'],
  ['will this save me money', null, 'out-of-scope'],
  // a greeting is a better answer than silence, and it puts the pending question back
  ['thanks', null, 'greeting'],
  ['ok', null, 'NONE'],
  ['wait what', null, 'help'],
  ['go back', null, 'undo'],

  // things the app genuinely has nothing for
  ['what about deer', null, 'out-of-scope'],
  ['my soil is clay', null, 'out-of-scope'],
  ['do I need planning permission', null, 'out-of-scope'],
  ['how much will it cost', null, 'out-of-scope'],
]

/** The measured baseline. It may go up and it may never go down */
const UNSCRIPTED_FLOOR = 0.97

describe('unscripted input', () => {
  let catalog: readonly Crop[] = []
  beforeAll(async () => {
    catalog = await loadCropCatalog()
  })

  it('records how much of what a stranger types is understood at all', () => {
    const misses: string[] = []
    let ok = 0
    for (const [said, step, want] of WILD) {
      const routed = routeLexically(said, { step, catalog })
      const got = routed?.intent ?? 'NOTHING'
      if (got === want || (want === 'NONE' && got === 'NOTHING')) ok += 1
      else misses.push(`  "${said}" -> ${got}, wanted ${want}`)
    }
    const accuracy = ok / WILD.length
    console.log(
      `unscripted accuracy: ${(accuracy * 100).toFixed(0)}% (${String(ok)}/${String(WILD.length)})\n${misses.join('\n')}`,
    )
    if (accuracy < UNSCRIPTED_FLOOR) {
      throw new Error(`fell to ${accuracy.toFixed(2)}\n${misses.join('\n')}`)
    }
    expect(accuracy).toBeGreaterThanOrEqual(UNSCRIPTED_FLOOR)
  })

  /**
   * The one that matters more than the percentage.
   *
   * Six of forty unscripted sentences used to reach an intent that DESTROYS work: "thanks" and
   * "do I need planning permission" both reached `undo`, which restores the plot from before the
   * design was applied, and "will this save me money", "add more beds" and "when should I plant
   * the beans" all reached `plan-planting`, which replaces the plantings in every bed.
   *
   * Being wrong is recoverable; being wrong and destructive is not. `DESTRUCTIVE_FLOOR` in
   * `lexical.ts` holds this at zero, and this test is what stops it drifting back
   *
   * Held as a list of the known-bad sentences rather than as an assertion that none exist,
   * because none-exist is the state this has to reach and is not the state it is in
   */
  it('names every unscripted sentence that reaches a destructive intent', () => {
    // imported rather than restated: the list had already drifted once, and a safety test that
    // checks a stale copy of the thing it is guarding is worse than no test
    const destructive = new Set<string>(DESTRUCTIVE)
    const reached = WILD.flatMap(([said, step, want]) => {
      const got = routeLexically(said, { step, catalog })?.intent
      return got !== undefined && destructive.has(got) && got !== want ? [`${said} -> ${got}`] : []
    })
    console.log(`destructive misroutes: ${String(reached.length)}\n  ${reached.join('\n  ')}`)
    // it is 0, and it stays 0: `DESTRUCTIVE_FLOOR` is what holds it there
    expect(reached).toEqual([])
  })
})
