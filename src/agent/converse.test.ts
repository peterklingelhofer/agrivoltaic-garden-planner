import { beforeEach, describe, expect, it } from 'bun:test'
import { siteFixture } from '../recommend/testkit'
import { ready } from '../state/slices'
import { getAppState, resetAppStore, useAppStore } from '../state/store'
import { designScenarioFixture } from '../state/testkit'
import type { OnboardingStep } from '../state/slices'
import type { Crop } from '../types/crop'
import { converse, MAX_CLAUSES } from './converse'
import { isDestructive } from './intent'
import { createLexicalUnderstander } from './lexical'
import { EMPTY_SLOTS, type Understander } from './understand'

/**
 * The path a typed sentence actually takes, including the ones that ask for two things.
 *
 * Driven against the real store for the reason `act.test.ts` gives: two requests in one sentence
 * must go through the same actions two presses would, in the same order, and the only way to know
 * that is to let them
 */
const understander = createLexicalUnderstander()

let catalog: readonly Crop[] = []

const say = async (text: string, step: OnboardingStep | null = getAppState().onboarding.step) =>
  converse(text, { step, catalog }, understander, { state: getAppState })

beforeEach(async () => {
  localStorage.clear()
  resetAppStore()
  useAppStore.setState({ site: ready(siteFixture()), autoRun: false })
  await getAppState().loadCatalog()
  const held = getAppState().catalog
  catalog = held.status === 'ready' ? held.value : []
})

describe('a sentence that asks for one thing', () => {
  it('is answered exactly as it was before any of this', async () => {
    const { understood } = await say('i want to grow tomatoes')
    expect(understood.map((entry) => entry.intent)).toEqual(['like-crop'])
  })

  it('says it did not follow, rather than nothing, when it did not', async () => {
    // away from the question about the place, which takes any text at all as a possible place
    // name and is right to: that is what makes a bare "Amherst" work
    const { reply, understood } = await say('zzzz qqqq', null)
    expect(understood).toEqual([])
    expect(reply.utterances.map((entry) => entry.kind)).toEqual(['not-understood'])
  })
})

describe('a reading it will not choose between', () => {
  /**
   * The whole point of `alternatives`, in one test: nothing may change.
   *
   * A tie broken silently is a coin flip with consequences, and the consequences here are store
   * mutations. "Bin it and start again" reads `start-over` at 0.501 and `remove-planting` at
   * 0.456; one of those forgets the design. Offering both costs a tap and is always recoverable
   */
  const torn: Understander = {
    kind: 'embedding',
    ready: () => Promise.resolve(true),
    route: (text) =>
      Promise.resolve({
        intent: 'start-over',
        confidence: 0.5,
        slots: EMPTY_SLOTS,
        matched: text,
        spoken: 0.5,
        alternatives: ['start-over', 'remove-planting', 'undo'],
      }),
  }

  it('offers the readings instead of acting on one', async () => {
    const { reply } = await converse('bin it', { step: null, catalog }, torn, {
      state: getAppState,
    })
    expect(reply.utterances.map((entry) => entry.kind)).toEqual(['unsure'])
    expect(reply.offer).toEqual(['start-over', 'remove-planting', 'undo'])
  })

  it('changes nothing at all while it asks', async () => {
    await getAppState().applyDesign(designScenarioFixture('balanced'))
    const before = getAppState().plot?.beds.length ?? 0
    await converse('bin it', { step: null, catalog }, torn, { state: getAppState })
    expect(getAppState().plot?.beds.length).toBe(before)
  })
})

describe('a question, which is never an instruction', () => {
  /**
   * The worst thing this surface can do, and it did it twice in one played session.
   *
   * "When do i plant the tomatoes" and "what should i do this month" both reached
   * `plan-planting`, which shares its whole vocabulary with the questions people ask ABOUT
   * planting, and both were answered by replanting every bed. The reply that came back was the
   * planting report, so nothing on screen said the garden had just been rewritten
   */
  const ASKED = [
    'when do i plant the tomatoes',
    'what should i do this month',
    'when should i take the beans out',
    'what would happen if i started again',
    'how do i undo that',
  ]

  it('reaches no intent that changes the garden', async () => {
    for (const said of ASKED) {
      const { understood } = await say(said, null)
      const reached = understood.map((entry) => entry.intent)
      for (const intent of reached)
        expect(isDestructive(intent), `${said} -> ${intent}`).toBe(false)
    }
  })

  it('leaves the beds exactly as they were', async () => {
    await getAppState().applyDesign(designScenarioFixture('balanced'))
    const before = JSON.stringify(getAppState().plot?.beds ?? [])
    for (const said of ASKED) await say(said, null)
    expect(JSON.stringify(getAppState().plot?.beds ?? [])).toBe(before)
  })
})

describe('a sentence that asks for two', () => {
  /**
   * The shape that separates an agent from a search box. Answering the first half and silently
   * dropping the second is worse than understanding neither, because nothing on screen says so
   */
  it('carries out both, in the order they were said', async () => {
    const { understood } = await say('i want tomatoes then tell me what i have got')
    expect(understood.map((entry) => entry.intent)).toEqual(['like-crop', 'describe-garden'])
  })

  it('answers both, in one reply', async () => {
    const { reply } = await say('what have i got then what can i grow')
    expect(reply.utterances.length).toBeGreaterThan(1)
  })

  it('offers what follows from where the sentence ENDED', async () => {
    const { reply } = await say('what can i grow then what have i got')
    // the chips belong to the last thing asked, not the first
    expect(reply.offer).toContain('list-crops')
  })

  it('runs both through the store own actions', async () => {
    await getAppState().applyDesign(designScenarioFixture('balanced'))
    const before = getAppState().plot?.beds.length ?? 0
    await say('add a bed then add another bed')
    expect(getAppState().plot?.beds.length).toBe(before + 2)
  })
})

describe('what it refuses to split', () => {
  it('keeps a list of crops together, because a list is one request', async () => {
    const { understood } = await say('i want tomatoes and courgettes')
    expect(understood).toHaveLength(1)
    expect(understood[0]?.slots.crops.length).toBeGreaterThan(1)
  })

  it('never turns one press into more than a handful of changes', async () => {
    const { understood } = await say(
      'add a bed then add a bed then add a bed then add a bed then add a bed',
    )
    expect(understood.length).toBeLessThanOrEqual(MAX_CLAUSES)
  })

  /** The gates still apply per clause: splitting must not become a way around them */
  it('will not reach a destructive intent through a clause either', async () => {
    await getAppState().applyDesign(designScenarioFixture('balanced'))
    const { understood } = await say('what have i got then thanks')
    expect(understood.map((entry) => entry.intent)).not.toContain('undo')
  })
})
