import { beforeAll, describe, expect, it } from 'bun:test'
import { HAVE_MODEL, MODEL_DIR, MODEL_REQUIRED } from './model-presence'
import { loadCropCatalog } from '../data/crops'
import type { Crop } from '../types/crop'
import type { OnboardingStep } from '../state/slices'
import { createEmbeddingUnderstander } from './embedding'
import {
  COLLAPSE_FLOOR,
  precisionOf,
  reportHeldOut,
  scoreHeldOut,
  solvedOf,
} from './holdout-scoring'
import { routeLexically } from './lexical'
import type { Understander } from './understand'

/**
 * The second held-out set, and the reason there had to be one.
 *
 * `holdout.test.ts` was written before the eight read intents existed and scored 61%. Everything
 * built afterward was checked against it, and it now reads 89%. The tuning copied none of its
 * sentences: it read which ones failed and broadened the vocabulary until they didn't. That's
 * fitting, however carefully it was done, and a number produced that way says nothing about
 * anybody it hasn't seen before.
 *
 * So: written in one sitting, after the tuning stopped, without opening `intent.ts`, and
 * deliberately in registers the first two sets didn't use. Terse, rambling, misspelled, rude,
 * and several that no reasonable router should answer at all. Scored once.
 *
 * It carries no floor, for the same reason the first one doesn't. If a line fails, the response
 * is to record the number. Adding the sentence to a phrase list turns the holdout into another
 * training set and there's no fourth chance
 */

const SET: readonly {
  readonly said: string
  readonly step: OnboardingStep | null
  readonly want: string
}[] = [
  // terse
  { said: 'Bristol', step: 'location', want: 'set-place' },
  { said: '4x4', step: 'space', want: 'set-space' },
  { said: 'shady', step: 'surroundings', want: 'set-exposure' },
  { said: 'herbs mostly', step: 'growing', want: 'set-ambition' },
  { said: 'nope', step: 'natives', want: 'set-natives' },
  { said: 'go', step: 'results', want: 'propose-designs' },
  // rambling
  {
    said: 'we bought a house last year and there is a strip down the side that gets sun until about two',
    step: 'surroundings',
    want: 'set-exposure',
  },
  {
    said: 'honestly I just want enough salad that I stop buying bags of it',
    step: 'growing',
    want: 'set-ambition',
  },
  {
    said: 'I would like to know roughly how many kilowatt hours a year this thing makes',
    step: null,
    want: 'ask-energy',
  },
  {
    said: 'could you tell me what jobs there are coming up in the garden',
    step: null,
    want: 'ask-agenda',
  },
  // misspelled, which is most of what a phone produces
  { said: 'tomatos and courgetes', step: null, want: 'like-crop' },
  { said: 'no brocolli please', step: null, want: 'dislike-crop' },
  { said: 'wher does the data come from', step: null, want: 'ask-sources' },
  { said: 'hw much waterin', step: null, want: 'ask-water' },
  // editing
  { said: 'lift the panels a bit', step: null, want: 'adjust-panels' },
  { said: 'the rows are too close together', step: null, want: 'adjust-panels' },
  { said: 'chuck out the beans', step: null, want: 'remove-planting' },
  { said: 'stick another bed in', step: null, want: 'add-bed' },
  { said: 'bin it and start from scratch', step: null, want: 'start-over' },
  { said: 'make the plot 12 by 9 instead', step: null, want: 'set-space' },
  // asking
  { said: 'which of these will actually grow', step: null, want: 'list-crops' },
  { said: 'how come the peppers are not in there', step: null, want: 'explain' },
  { said: 'anything that likes being next to carrots', step: null, want: 'ask-companions' },
  { said: 'when am I sowing the lettuce', step: null, want: 'ask-calendar' },
  { said: 'are there rules about this sort of thing', step: null, want: 'ask-compliance' },
  { said: 'so what is the idea behind all this', step: null, want: 'define' },
  { said: 'run me through what I have ended up with', step: null, want: 'describe-garden' },
  // out of scope
  { said: 'how many years until it pays for itself', step: null, want: 'out-of-scope' },
  { said: 'do the neighbors have to agree to it', step: null, want: 'out-of-scope' },
  { said: 'what stops squirrels getting at it', step: null, want: 'out-of-scope' },
  { said: 'who puts the whole thing up', step: null, want: 'out-of-scope' },
  { said: 'is the earth here any good', step: null, want: 'out-of-scope' },
  // getting out, and being stuck
  { said: 'take me to the normal form', step: null, want: 'show-the-form' },
  { said: 'that is not what I meant', step: null, want: 'undo' },
  { said: 'no idea what to say here', step: 'mounting', want: 'help' },
  { said: 'yeah go for it', step: 'results', want: 'apply-design' },
]

describe('the second held-out set', () => {
  let catalog: readonly Crop[] = []
  let understander: Understander | null = null

  beforeAll(async () => {
    catalog = await loadCropCatalog()
    if (!HAVE_MODEL) return
    const embedding = createEmbeddingUnderstander({ modelPath: MODEL_DIR })
    understander = (await embedding.ready()) ? embedding : null
  }, 300_000)

  it('is scored once, and never used to choose a phrase', async () => {
    const lexical = await scoreHeldOut(SET, (said, step) =>
      Promise.resolve(routeLexically(said, { step, catalog })),
    )
    console.log(reportHeldOut('HOLDOUT TWO lexical', lexical))
    expect(SET.length).toBeGreaterThan(30)
    /**
     * The router has to have RUN, in the one place where its absence could go unnoticed. CI has no
     * `models/` unless the workflow fetches it, and an early return here would report eight tests
     * skipped, with the embedding router evaluated nowhere
     */
    if (MODEL_REQUIRED) expect(understander, 'the weights are fetched in CI').not.toBeNull()
    if (understander === null) return
    const held = understander
    const embedded = await scoreHeldOut(SET, (said, step) => held.route(said, { step, catalog }))
    console.log(reportHeldOut('HOLDOUT TWO embedding', embedded))
    // see COLLAPSE_FLOOR: only an alarm for the router falling over
    expect(precisionOf(embedded)).toBeGreaterThan(COLLAPSE_FLOOR)
    expect(solvedOf(embedded)).toBeGreaterThan(COLLAPSE_FLOOR)
  }, 300_000)

  it("reaches no destructive intent it wasn't asked for", async () => {
    const destructive = new Set([
      'undo',
      'plan-planting',
      'apply-design',
      'start-over',
      'remove-planting',
    ])
    const reached: string[] = []
    for (const line of SET) {
      const got =
        understander === null
          ? (routeLexically(line.said, { step: line.step, catalog })?.intent ?? '')
          : ((await understander.route(line.said, { step: line.step, catalog }))?.intent ?? '')
      if (destructive.has(got) && got !== line.want) reached.push(`${line.said} -> ${got}`)
    }
    expect(reached).toEqual([])
  }, 300_000)
})
