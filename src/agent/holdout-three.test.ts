import { beforeAll, describe, expect, it } from 'bun:test'
import { HAVE_MODEL, MODEL_DIR, MODEL_REQUIRED } from './model-presence'
import { loadCropCatalog } from '../data/crops'
import type { Crop } from '../types/crop'
import type { OnboardingStep } from '../state/slices'
import { createEmbeddingUnderstander } from './embedding'
import { clausesOf } from './clauses'
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
 * The third held-out set, and the last one this repo gets for free.
 *
 * The first was written before the read intents existed and scored 61%. The second was written
 * after the tuning that followed, and scored 67% where the first read 89%. That twenty-two-point
 * gap was the measure of how much of the first number was fitting. This one was written after
 * everything above: composition, the noun-based scope reading, greetings,
 * questions-are-not-instructions. It was written without opening `intent.ts`, and is scored once.
 *
 * It's also the first to carry sentences that ask for TWO things, because nothing before it
 * could have answered one.
 *
 * No floor, like the others. If a line fails the response is to record the number. Adding the
 * sentence to a phrase list is what turned the first two into training sets
 */

const SET: readonly {
  readonly said: string
  readonly step: OnboardingStep | null
  readonly want: string
}[] = [
  { said: 'we are in Sheffield', step: 'location', want: 'set-place' },
  { said: 'call it five meters each way', step: 'space', want: 'set-space' },
  { said: 'there is a wall to the south of it', step: 'surroundings', want: 'set-exposure' },
  { said: 'root veg and some greens', step: 'growing', want: 'set-ambition' },
  { said: 'lean toward the wild stuff', step: 'natives', want: 'set-natives' },
  { said: 'power is the priority', step: 'objective', want: 'set-objective' },
  { said: 'standing upright would suit us', step: 'mounting', want: 'set-mounting' },
  { said: 'nothing above two and a half meters', step: 'height', want: 'set-height' },
  { said: 'we can water it easily', step: 'water', want: 'set-water' },
  { said: 'work something out', step: 'results', want: 'propose-designs' },

  { said: 'roughly how many kwh a year', step: null, want: 'ask-energy' },
  { said: 'what jobs are there this month', step: null, want: 'ask-agenda' },
  { said: 'when does the kale go in', step: null, want: 'ask-calendar' },
  { said: 'am I breaking any rules with this', step: null, want: 'ask-compliance' },
  { said: 'how thirsty will this garden be', step: null, want: 'ask-water' },
  { said: 'what likes growing near onions', step: null, want: 'ask-companions' },
  { said: 'point me at the literature', step: null, want: 'ask-sources' },
  { said: 'what is the thinking behind panels over crops', step: null, want: 'define' },
  { said: 'give me the current state of play', step: null, want: 'describe-garden' },
  { said: 'why has the squash been left out', step: null, want: 'explain' },
  { said: 'what would actually do well here', step: null, want: 'list-crops' },

  { said: 'i would love some raspberries', step: null, want: 'like-crop' },
  { said: 'keep the fennel out of it', step: null, want: 'dislike-crop' },
  { said: 'dig up the leeks', step: null, want: 'remove-planting' },
  { said: 'we could do with an extra bed', step: null, want: 'add-bed' },
  { said: 'throw it away and begin afresh', step: null, want: 'start-over' },
  { said: 'drop the panels down a bit', step: null, want: 'adjust-panels' },

  { said: 'is it going to be worth the outlay', step: null, want: 'out-of-scope' },
  { said: 'will the council mind', step: null, want: 'out-of-scope' },
  { said: 'what keeps the pigeons off', step: null, want: 'out-of-scope' },
  { said: 'who connects it to the meter', step: null, want: 'out-of-scope' },

  { said: 'evening', step: null, want: 'greeting' },
  { said: 'much appreciated', step: null, want: 'greeting' },
  { said: 'i would rather use the form', step: null, want: 'show-the-form' },
  { said: 'scratch that', step: null, want: 'undo' },
  { said: 'i am not following any of this', step: null, want: 'help' },
]

/** The first held-out sentences that ask for two things, because nothing before could answer one */
const PAIRS: readonly { readonly said: string; readonly want: readonly string[] }[] = [
  {
    said: 'i would love some raspberries then tell me what I have',
    want: ['like-crop', 'describe-garden'],
  },
  { said: 'work something out then fill the beds', want: ['propose-designs', 'plan-planting'] },
  {
    said: 'what can I grow then what jobs are there this month',
    want: ['list-crops', 'ask-agenda'],
  },
  { said: 'add a bed and then add another bed', want: ['add-bed', 'add-bed'] },
]

describe('the third held-out set', () => {
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
    console.log(reportHeldOut('HOLDOUT THREE lexical', lexical))
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
    console.log(reportHeldOut('HOLDOUT THREE embedding', embedded))
    // see COLLAPSE_FLOOR: only an alarm for the router falling over
    expect(precisionOf(embedded)).toBeGreaterThan(COLLAPSE_FLOOR)
    expect(solvedOf(embedded)).toBeGreaterThan(COLLAPSE_FLOOR)
  }, 300_000)

  it('splits the sentences that ask for two things, and only those', async () => {
    const misses: string[] = []
    let ok = 0
    for (const pair of PAIRS) {
      const clauses = clausesOf(pair.said, {
        standsAlone: (part) => routeLexically(part, { step: null, catalog }) !== null,
      })
      const got: string[] = []
      for (const clause of clauses) {
        const routed =
          understander === null
            ? routeLexically(clause, { step: null, catalog })
            : await understander.route(clause, { step: null, catalog })
        got.push(routed?.intent ?? 'NOTHING')
      }
      if (JSON.stringify(got) === JSON.stringify(pair.want)) ok += 1
      else misses.push(`  "${pair.said}" -> ${got.join(' + ')}, wanted ${pair.want.join(' + ')}`)
    }
    console.log(`HOLDOUT THREE pairs: ${String(ok)}/${String(PAIRS.length)}\n${misses.join('\n')}`)
    expect(PAIRS.length).toBeGreaterThan(3)
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
      const context = { step: line.step, catalog }
      const got =
        understander === null
          ? (routeLexically(line.said, context)?.intent ?? '')
          : ((await understander.route(line.said, context))?.intent ?? '')
      if (destructive.has(got) && got !== line.want) reached.push(`${line.said} -> ${got}`)
    }
    expect(reached).toEqual([])
  }, 300_000)
})
