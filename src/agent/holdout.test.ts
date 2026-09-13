import { beforeAll, describe, expect, it } from 'bun:test'
import { loadCropCatalog } from '../data/crops'
import type { Crop } from '../types/crop'
import type { OnboardingStep } from '../state/slices'
import { COLLAPSE_FLOOR } from './holdout-scoring'
import { routeLexically } from './lexical'

/**
 * The first held-out set, and a number that must never choose a phrase.
 *
 * `unscripted.test.ts` was written before the work it drove and reads 98%, and that figure is
 * worth much less than it looks: every fix was checked against those forty lines, so the table
 * has been fitted to them. Fitting a router to its own test set is precisely the mistake the
 * first two corpora made, and noticing it the second time is not the same as not making it.
 *
 * So this file was written afterwards, in one sitting, without looking at `INTENTS`, and is
 * scored once. Nothing here may be used to pick an exemplar. If a line fails, the honest response
 * is to record the number, not to add the sentence to a phrase list -- doing that turns the
 * holdout into another training set and there is no third chance at an unseen measurement
 */
const HOLDOUT: readonly {
  readonly said: string
  readonly step: OnboardingStep | null
  readonly want: string
}[] = [
  { said: 'we are just outside Ithaca', step: 'location', want: 'set-place' },
  { said: 'the back garden of a terrace in Leeds', step: 'location', want: 'set-place' },
  { said: 'roughly twelve metres across and seven deep', step: 'space', want: 'set-space' },
  { said: 'quite a long thin strip, 15 by 3', step: 'space', want: 'set-space' },
  { said: 'the house blocks the morning sun', step: 'surroundings', want: 'set-exposure' },
  { said: 'completely exposed, it is a field', step: 'surroundings', want: 'set-exposure' },
  { said: 'things I can put in a stew', step: 'growing', want: 'set-ambition' },
  { said: 'I would like to try peppers and aubergines', step: 'growing', want: 'set-ambition' },
  { said: 'the food matters more than the power', step: 'objective', want: 'set-objective' },
  { said: 'split it evenly', step: 'objective', want: 'set-objective' },
  { said: 'I would rather they were above head height', step: 'mounting', want: 'set-mounting' },
  { said: 'no higher than the fence', step: 'height', want: 'set-height' },
  { said: 'there is an outside tap', step: 'water', want: 'set-water' },
  { said: 'nothing out there, it is all rainfall', step: 'water', want: 'set-water' },

  { said: 'what would the yield be', step: null, want: 'ask-energy' },
  { said: 'roughly what output should I expect from the panels', step: null, want: 'ask-energy' },
  { said: 'give me a month by month plan', step: null, want: 'ask-agenda' },
  { said: 'what is due this week', step: null, want: 'ask-agenda' },
  { said: 'sowing dates for the carrots', step: null, want: 'ask-calendar' },
  { said: 'does this pass the state rules', step: null, want: 'ask-compliance' },
  { said: 'will I be watering it all summer', step: null, want: 'ask-water' },
  { said: 'good neighbours for beans', step: null, want: 'ask-companions' },
  { said: 'what papers is this built on', step: null, want: 'ask-sources' },
  { said: 'explain the whole idea to me', step: null, want: 'define' },

  { said: 'I fancy some rhubarb', step: null, want: 'like-crop' },
  { said: 'absolutely no brassicas', step: null, want: 'dislike-crop' },
  { said: 'pull out the courgettes', step: null, want: 'remove-planting' },
  { said: 'one more growing bed please', step: null, want: 'add-bed' },
  { said: 'scrap the lot and begin again', step: null, want: 'start-over' },
  { said: 'run the numbers', step: 'results', want: 'propose-designs' },

  { said: 'what is the return on investment', step: null, want: 'out-of-scope' },
  { said: 'will foxes be a problem', step: null, want: 'out-of-scope' },
  { said: 'who wires it into the house', step: null, want: 'out-of-scope' },
  { said: 'my ground is very chalky', step: null, want: 'out-of-scope' },

  { said: 'summarise it for me', step: null, want: 'describe-garden' },
  { said: 'I am lost', step: null, want: 'help' },
  { said: 'why is that one missing', step: null, want: 'explain' },
  { said: 'let me type it in myself', step: null, want: 'show-the-form' },
]

describe('the held-out set', () => {
  let catalog: readonly Crop[] = []
  beforeAll(async () => {
    catalog = await loadCropCatalog()
  })

  it('is scored once, and never used to choose a phrase', () => {
    const misses: string[] = []
    let ok = 0
    for (const line of HOLDOUT) {
      const got = routeLexically(line.said, { step: line.step, catalog })?.intent ?? 'NOTHING'
      if (got === line.want) ok += 1
      else misses.push(`  "${line.said}" -> ${got}, wanted ${line.want}`)
    }
    console.log(
      `HOLDOUT: ${((ok / HOLDOUT.length) * 100).toFixed(0)}% (${String(ok)}/${String(HOLDOUT.length)})\n${misses.join('\n')}`,
    )
    /*
      Reported rather than graded, which is the original note here and still right: a floor near
      the measured score would create the same pressure to tune against it that spent all three
      sets. What has been added is not a grade. `COLLAPSE_FLOOR` sits at 60% against a set that
      scores 87%, far enough below that no honest change approaches it, and it exists because
      until now this score was printed to a log and asserted nowhere: the router could route
      every sentence to one intent and this file would still pass
    */
    expect(HOLDOUT.length).toBeGreaterThan(30)
    expect(ok / HOLDOUT.length).toBeGreaterThan(COLLAPSE_FLOOR)
  })

  it('reaches no destructive intent it was not asked for', () => {
    const destructive = new Set([
      'undo',
      'plan-planting',
      'apply-design',
      'start-over',
      'remove-planting',
    ])
    const reached = HOLDOUT.flatMap((line) => {
      const got = routeLexically(line.said, { step: line.step, catalog })?.intent
      return got !== undefined && destructive.has(got) && got !== line.want ? [line.said] : []
    })
    expect(reached).toEqual([])
  })
})
