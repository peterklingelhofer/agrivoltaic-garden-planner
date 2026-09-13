import { beforeAll, describe, expect, it } from 'bun:test'
import { HAVE_MODEL, MODEL_DIR } from './model-presence'
import { loadCropCatalog } from '../data/crops'
import type { Crop } from '../types/crop'
import type { OnboardingStep } from '../state/slices'
import { createEmbeddingUnderstander } from './embedding'
import { reportHeldOut, scoreHeldOut, type Verdict } from './holdout-scoring'
import { routeLexically } from './lexical'
import type { Understander } from './understand'

/**
 * The embedding understander, measured against the same held-out set the lexical one is, and
 * measured with the REAL model rather than a stub.
 *
 * Skipped when the weights are absent, which is the state of a fresh clone: they are 23 MB and
 * gitignored, and `bun run fetch-agent-model` is what puts them in `public/models`. Skipping rather
 * than failing is deliberate -- the app ships without them too, and a test that demands a
 * download is a test that stops anybody running the suite
 */

const HOLDOUT: readonly (readonly [string, OnboardingStep | null, string])[] = [
  ['we are just outside Ithaca', 'location', 'set-place'],
  ['the back garden of a terrace in Leeds', 'location', 'set-place'],
  ['roughly twelve metres across and seven deep', 'space', 'set-space'],
  ['quite a long thin strip, 15 by 3', 'space', 'set-space'],
  ['the house blocks the morning sun', 'surroundings', 'set-exposure'],
  ['completely exposed, it is a field', 'surroundings', 'set-exposure'],
  ['things I can put in a stew', 'growing', 'set-ambition'],
  ['I would like to try peppers and aubergines', 'growing', 'set-ambition'],
  ['the food matters more than the power', 'objective', 'set-objective'],
  ['split it evenly', 'objective', 'set-objective'],
  ['I would rather they were above head height', 'mounting', 'set-mounting'],
  ['no higher than the fence', 'height', 'set-height'],
  ['there is an outside tap', 'water', 'set-water'],
  ['nothing out there, it is all rainfall', 'water', 'set-water'],
  ['what would the yield be', null, 'ask-energy'],
  ['roughly what output should I expect from the panels', null, 'ask-energy'],
  ['give me a month by month plan', null, 'ask-agenda'],
  ['what is due this week', null, 'ask-agenda'],
  ['sowing dates for the carrots', null, 'ask-calendar'],
  ['does this pass the state rules', null, 'ask-compliance'],
  ['will I be watering it all summer', null, 'ask-water'],
  ['good neighbours for beans', null, 'ask-companions'],
  ['what papers is this built on', null, 'ask-sources'],
  ['explain the whole idea to me', null, 'define'],
  ['I fancy some rhubarb', null, 'like-crop'],
  ['absolutely no brassicas', null, 'dislike-crop'],
  ['pull out the courgettes', null, 'remove-planting'],
  ['one more growing bed please', null, 'add-bed'],
  ['scrap the lot and begin again', null, 'start-over'],
  ['run the numbers', 'results', 'propose-designs'],
  ['what is the return on investment', null, 'out-of-scope'],
  ['will foxes be a problem', null, 'out-of-scope'],
  ['who wires it into the house', null, 'out-of-scope'],
  ['my ground is very chalky', null, 'out-of-scope'],
  ['summarise it for me', null, 'describe-garden'],
  ['I am lost', null, 'help'],
  ['why is that one missing', null, 'explain'],
  ['let me type it in myself', null, 'show-the-form'],
]

describe.skipIf(!HAVE_MODEL)('the embedding understander', () => {
  let catalog: readonly Crop[] = []
  let understander: Understander

  beforeAll(async () => {
    catalog = await loadCropCatalog()
    understander = createEmbeddingUnderstander({ modelPath: MODEL_DIR })
    const ok = await understander.ready()
    expect(ok, 'the weights are on disk but did not load').toBe(true)
  }, 300_000)

  /**
   * The whole justification for 23 MB, in one number. Both routers are measured against the same
   * held-out set, which neither has ever been tuned against
   */
  it('beats the lexical router on sentences neither has been tuned against', async () => {
    const lines = HOLDOUT.map(([said, step, want]) => ({ said, step, want }))
    const lexical = await scoreHeldOut(lines, (said, step) =>
      Promise.resolve(routeLexically(said, { step, catalog })),
    )
    const embedded = await scoreHeldOut(lines, (said, step) =>
      understander.route(said, { step, catalog }),
    )
    console.log(reportHeldOut('HOLDOUT lexical', lexical))
    console.log(reportHeldOut('HOLDOUT embedding', embedded))
    /*
      Solved rather than right, because the two routers no longer answer the same question. The
      lexical one always acts and so is only ever right or wrong; the embedding declines to act on
      a tie and offers instead, and a sentence that ends one tap from what was meant has not
      failed. A floor rather than an exact figure: what has to hold is that the download earns
      itself
    */
    const solved = (verdict: Verdict): number =>
      ((verdict.right + verdict.offered) / verdict.total) * 100
    expect(solved(embedded)).toBeGreaterThan(solved(lexical))
    expect(solved(embedded)).toBeGreaterThanOrEqual(78)
    // and it is never confidently wrong more often than the router it replaced
    expect(embedded.right / embedded.acted).toBeGreaterThanOrEqual(lexical.right / lexical.acted)
  }, 300_000)

  /**
   * The half the lexical router owns. A two-word fragment answering a question on screen carries
   * almost no semantics of its own -- its whole meaning is in the question behind it -- which is
   * exactly where an embedding is worst and a phrase table is exact
   */
  it('leaves a bare reply to a pending question to the lexical router', async () => {
    for (const [said, step, want] of [
      ['6 by 4', 'space', 'set-space'],
      ['yes', 'water', 'set-water'],
      ['overhead', 'mounting', 'set-mounting'],
      ['Amherst, Massachusetts', 'location', 'set-place'],
    ] as const) {
      const got = await understander.route(said, { step, catalog })
      expect(got?.intent, said).toBe(want)
    }
  }, 300_000)

  it('still refuses to reach a destructive intent on a loose match', async () => {
    for (const said of ['thanks', 'do I need planning permission', 'will this save me money']) {
      const got = await understander.route(said, { step: null, catalog })
      expect(['undo', 'plan-planting', 'apply-design', 'start-over'], said).not.toContain(
        got?.intent,
      )
    }
  }, 300_000)

  /**
   * The reading it declines to make, and the readings it must not decline to make.
   *
   * Two ties were measured and neither is decidable from the words: "what is the thinking behind
   * panels over crops" scored `ask-energy` 0.652 against `define` 0.649, and "scratch that" put
   * three intents inside five hundredths of each other
   */
  it('offers the candidates rather than picking one when nothing separates them', async () => {
    for (const said of ['what is the thinking behind panels over crops', 'scratch that']) {
      const got = await understander.route(said, { step: null, catalog })
      expect(got?.alternatives.length, said).toBeGreaterThan(1)
    }
  }, 300_000)

  /**
   * And the pair that always ties and must never be asked about.
   *
   * `like-crop` and `dislike-crop` are the same words with a negator in front, so they land
   * within a few hundredths of each other every time; scored separately they were each other's
   * runner-up and every crop request looked like an ambiguity. They are scored as one intent and
   * labelled by `isNegated`, which is what decides them in both routers anyway. Offering both
   * would be asking somebody whether they meant what they had just said
   */
  it('never offers the choice between wanting a crop and not wanting it', async () => {
    for (const [said, want] of [
      ['i want beans', 'like-crop'],
      ['no broccoli please', 'dislike-crop'],
    ] as const) {
      const got = await understander.route(said, { step: null, catalog })
      expect(got?.intent, said).toBe(want)
      const bothSigns = got?.alternatives.filter(
        (id) => id === 'like-crop' || id === 'dislike-crop',
      )
      expect(bothSigns?.length ?? 0, said).toBeLessThan(2)
    }
  }, 300_000)

  /**
   * The commonest thing anybody types here, and the reading that kept crowding it out.
   *
   * A list of crops IS an answer to "what do you want to grow", and `slotFilled` says so on
   * purpose, so away from that question the model put an ambition at 0.507 against a preference
   * at 0.451 and the gap between them was four hundredths. Both readings are fillable and the
   * margin cannot separate them; what separates them is that one of them answers a question
   * nobody is being asked
   */
  it('takes the crops it can name over a reading of a question nobody asked', async () => {
    for (const said of ['i want tomatoes', 'i want tomatoes and courgettes', 'i want beans']) {
      const got = await understander.route(said, { step: 'location', catalog })
      expect(got?.intent, said).toBe('like-crop')
      expect(got?.alternatives, said).toEqual([])
      expect(got?.slots.crops.length ?? 0, said).toBeGreaterThan(0)
    }
  }, 300_000)

  /**
   * And the same guard with the model in front of it, because the model reaches
   * `understandingFor` by a different road and a played session proved the road matters:
   * "when do i plant the tomatoes" was answered by replanting every bed
   */
  it('never reads a WH-question as an instruction to change the garden', async () => {
    for (const said of [
      'when do i plant the tomatoes',
      'what should i do this month',
      'how do i start over',
      'what happens if i take the beans out',
    ]) {
      const got = await understander.route(said, { step: null, catalog })
      expect(
        ['undo', 'plan-planting', 'apply-design', 'start-over', 'remove-planting'],
        said,
      ).not.toContain(got?.intent)
    }
  }, 300_000)

  it('fills slots through the same catalogue lookup, whichever router chose the intent', async () => {
    const got = await understander.route('pull out the courgettes', { step: null, catalog })
    expect(got?.intent).toBe('remove-planting')
    expect(got?.slots.crops.length).toBeGreaterThan(0)
  }, 300_000)
})

describe('without the weights', () => {
  it('falls back to the lexical router rather than failing', async () => {
    const catalog = await loadCropCatalog()
    const understander = createEmbeddingUnderstander({ loader: () => Promise.resolve(null) })
    expect(await understander.ready()).toBe(false)
    const got = await understander.route('i want to grow tomatoes', { step: null, catalog })
    expect(got?.intent).toBe('like-crop')
  })
})
