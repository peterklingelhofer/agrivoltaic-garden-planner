import { beforeEach, describe, expect, it } from 'bun:test'
import { vi } from '../../test/vi'
import { siteFixture } from '../recommend/testkit'
import { polygonAreaM2 } from '../state/geom'
import { ready, type AppState } from '../state/slices'
import { getAppState, resetAppStore, useAppStore } from '../state/store'
import { designScenarioFixture, scenarioSetFixture, seedRankedStore } from '../state/testkit'
import type { CropId } from '../types/ids'
import { act, type ActContext } from './act'
import { EMPTY_SLOTS, type Slots, type Understanding } from './understand'
import type { IntentId } from './intent'
import type { Utterance } from './reply'

/**
 * Driven against the real store, the real catalog and the real design engine, for the reason
 * `garden-generation.test.ts` gives about itself: a second write path is exactly what this must
 * not become, and the only way to know it hasn't become one is to make it write through the
 * actions a person's presses go through
 */

const context: ActContext = { state: getAppState }

const said = (intent: IntentId, slots: Partial<Slots> = {}): Understanding => ({
  intent,
  confidence: 1,
  slots: { ...EMPTY_SLOTS, ...slots },
  matched: '',
  spoken: 1,
  alternatives: [],
})

const kinds = (utterances: readonly Utterance[]): readonly string[] =>
  utterances.map((entry) => entry.kind)

/**
 * The real actions, captured once before any test can stub one.
 *
 * `resetAppStore` writes `initialData()`, which is only the DATA half of the store,
 * so an action replaced by `useAppStore.setState({ applyDesign })` survives every reset after it
 * and is still in place for the next test file section. Without this capture, a later test that
 * calls the real `applyDesign` name gets a `vi.fn` left behind by an earlier one, and the garden it
 * asserts on is still the starting plot
 */
const REAL = {
  applyDesign: getAppState().applyDesign,
  suggestDesigns: getAppState().suggestDesigns,
}

beforeEach(() => {
  localStorage.clear()
  resetAppStore()
  useAppStore.setState({ site: ready(siteFixture()), autoRun: false, ...REAL })
})

describe('every intent answers', () => {
  /**
   * A conversational surface that sometimes says nothing is indistinguishable from one that has
   * crashed, so this walks the whole list on an empty garden. Most of these will refuse. The
   * point is that refusing is an answer and silence isn't
   */
  const ALL: readonly IntentId[] = [
    'help',
    'describe-garden',
    'explain',
    'list-crops',
    'set-place',
    'set-space',
    'set-exposure',
    'set-ambition',
    'set-natives',
    'set-pollinators',
    'set-objective',
    'set-mounting',
    'set-height',
    'set-water',
    'like-crop',
    'dislike-crop',
    'apply-design',
    'plan-planting',
    'undo',
    'show-the-form',
  ]

  it.each([...ALL])('%s produces at least one utterance rather than silence', async (intent) => {
    const answer = await act(said(intent), context)
    expect(answer.utterances.length, intent as string).toBeGreaterThan(0)
  })
})

describe('recording an answer', () => {
  /**
   * Recording is all this does. Advancing the step to whatever follows in the table is wrong the
   * moment somebody volunteers something: a visitor who opens with "I want to grow vegetables"
   * would then be asked about native planting, before the agent knew where the garden was. What to
   * ask next belongs to the conversation
   */
  it('writes the answer through the store and says which question it was for', async () => {
    const answer = await act(said('set-ambition', { ambition: 'leafy-and-herbs' }), context)
    expect(getAppState().answers.ambition).toBe('leafy-and-herbs')
    expect(answer.utterances[0]).toEqual({ kind: 'noted', step: 'growing' })
  })

  it('moves nothing on by itself', async () => {
    const before = getAppState().onboarding.step
    await act(said('set-ambition', { ambition: 'leafy-and-herbs' }), context)
    expect(getAppState().onboarding.step).toBe(before)
  })

  it('refuses an answer whose slot never got filled rather than writing a default', async () => {
    const before = getAppState().answers.exposure
    const answer = await act(said('set-exposure'), context)
    expect(kinds(answer.utterances)).toEqual(['blocked'])
    expect(getAppState().answers.exposure).toBe(before)
  })

  it('reads "there is no height limit" as an answer and not as a missing one', async () => {
    await act(said('set-height', { yesNo: false }), context)
    expect(getAppState().answers.maxHeightM).toBeNull()
    expect(kinds((await act(said('set-height', { yesNo: false }), context)).utterances)).toEqual([
      'noted',
    ])
  })

  it('puts the two wildlife answers on the wildlife slice, not into the wizard answers', async () => {
    await act(said('set-natives', { yesNo: true }), context)
    await act(said('set-pollinators', { yesNo: false }), context)
    expect(getAppState().wildlife).toEqual({ favorNative: true, favorPollinators: false })
  })

  it('turns an objective preset into weights that sum to one', async () => {
    await act(said('set-objective', { objective: 'mostly-food' }), context)
    const objective = getAppState().answers.objective
    const total = objective.food + objective.energy + objective.water + objective.simplicity
    expect(total).toBeCloseTo(1, 9)
    expect(objective.food).toBeGreaterThan(objective.energy)
  })
})

describe('crops the grower names', () => {
  beforeEach(async () => {
    await getAppState().loadCatalog()
  })

  it('writes a soft preference and never a hard constraint', async () => {
    await act(said('like-crop', { crops: ['tomato' as CropId] }), context)
    const held = getAppState().preferences.entries.find((entry) => entry.cropId === 'tomato')
    // a router that is sometimes wrong about which crop was named must not write a constraint
    expect(held?.kind).toBe('prefer')
  })

  it('records a refusal as avoid, on the same soft scale', async () => {
    await act(said('dislike-crop', { crops: ['parsnip' as CropId] }), context)
    expect(getAppState().preferences.entries.find((e) => e.cropId === 'parsnip')?.kind).toBe(
      'avoid',
    )
  })

  it('writes nothing at all for a crop this build has never heard of', async () => {
    const answer = await act(said('like-crop', { crops: ['unobtainium' as CropId] }), context)
    expect(kinds(answer.utterances)).toEqual(['blocked'])
    expect(getAppState().preferences.entries).toHaveLength(0)
  })
})

describe("the one thing the form can't do", () => {
  // the crop names are looked up in the catalog, so there has to be one
  beforeEach(async () => {
    await getAppState().loadCatalog()
  })

  /**
   * The growing step is a list of categories. "I want tomatoes and courgettes" typed while it's on
   * screen is an answer to it, and `slotFilled` says so, and recording only "vegetables" would drop
   * both names on the floor. The beds could then fill with lingonberry and never mention the
   * tomatoes, because by then nothing would know they had been asked for
   */
  it('records the crops a sentence names as well as the category it answers', async () => {
    const answer = await act(
      said('set-ambition', { ambition: 'mixed-vegetables', crops: ['tomato' as CropId] }),
      context,
    )
    expect(kinds(answer.utterances)).toContain('noted')
    expect(kinds(answer.utterances)).toContain('preference')
    expect(getAppState().preferences.entries.map((entry) => entry.cropId)).toContain('tomato')
    expect(getAppState().answers.ambition).toBe('mixed-vegetables')
  })

  it("records the crops even when there's no category to record", async () => {
    const answer = await act(said('set-ambition', { crops: ['tomato' as CropId] }), context)
    expect(kinds(answer.utterances)).toEqual(['preference'])
    expect(getAppState().preferences.entries.map((entry) => entry.cropId)).toContain('tomato')
  })
})

describe('what became of what they asked for', () => {
  /**
   * The loop this whole surface exists to close.
   *
   * Say "I want tomatoes and courgettes" and fill the beds: the garden that comes back can be
   * lingonberry, six lines about blueberries and coreopsis nobody mentioned, and no word
   * about the tomatoes. Asked afterward, the ranking answers instantly. The answer was there
   * the whole time and only the asking was left to somebody with no reason to think there was
   * anything to ask about
   */
  it("names a crop that was asked for and didn't go in, with the ranking own reason", async () => {
    // a real ranking over a real acid bed, which is what `plan-planting` needs before it will run
    await seedRankedStore()
    await act(said('like-crop', { crops: ['tomato' as CropId] }), context)
    const answer = await act(said('plan-planting'), context)
    const planted = answer.utterances.find((entry) => entry.kind === 'planted')
    expect(planted?.kind).toBe('planted')
    // it went in, or there is a reason it didn't, or it is named as absent. Silence is the one
    // outcome that is not allowed
    const wentIn = planted?.kind === 'planted' && planted.cropIds.includes('tomato' as CropId)
    const explained = answer.utterances.some(
      (entry) =>
        (entry.kind === 'verdict' && entry.cropId === ('tomato' as CropId)) ||
        (entry.kind === 'not-planted' && entry.cropIds.includes('tomato' as CropId)),
    )
    expect(wentIn || explained).toBe(true)
  })
})

describe('refusing rather than pretending', () => {
  it("says what is missing rather than only that it can't", async () => {
    /*
      The app always has a plot: `makePlot()` opens with three beds and a panel row. So the
      thing that is missing on a fresh store is a RANKING, and the sun is what produces one. It
      names that AND starts it, because telling somebody to go and do a thing the agent could
      have done is a refusal wearing the costume of a next step
    */
    const answer = await act(said('list-crops'), context)
    const first = answer.utterances[0]
    expect(first?.kind).toBe('blocked')
    if (first?.kind === 'blocked') expect(first.need).toBe('light-running')
    expect(answer.offer).toContain('propose-designs')
  })

  it('describes the garden the app opens on rather than refusing to', async () => {
    const answer = await act(said('describe-garden'), context)
    const first = answer.utterances[0]
    expect(first?.kind).toBe('garden')
    if (first?.kind === 'garden') expect(first.summary.bedCount).toBe(3)
  })

  it("won't propose a design without a resolved site", async () => {
    useAppStore.setState({ site: { status: 'idle' } })
    const answer = await act(said('propose-designs'), context)
    const first = answer.utterances[0]
    expect(first?.kind).toBe('blocked')
    if (first?.kind === 'blocked') expect(first.need).toBe('location')
    expect(answer.offer).toContain('set-place')
  })

  /**
   * The honesty policy, as a test. An agent with nothing recorded must produce nothing: a
   * plausible sentence about tomatoes and shade is indistinguishable from the real thing and
   * traces to nothing, and this is the single place a language model would most want to help
   */
  it('explains only from refusals the planner actually recorded', async () => {
    const answer = await act(said('explain', { subject: 'why not tomatoes' }), context)
    expect(kinds(answer.utterances)).not.toContain('refusals')
  })
})

describe('driving the engine', () => {
  it("carries the search own account of what it didn't look at, word for word", async () => {
    const set = scenarioSetFixture()
    const suggest = vi.fn(async () => {
      useAppStore.setState((s) => ({ onboarding: { ...s.onboarding, designs: ready(set) } }))
    })
    useAppStore.setState({ suggestDesigns: suggest })
    const answer = await act(said('propose-designs'), context)
    const first = answer.utterances[0]
    expect(first?.kind).toBe('designs')
    if (first?.kind !== 'designs') return
    // the sentence that keeps a five-geometry search from reading as an exhaustive one is the
    // first thing a summarizer would drop, so it travels as the engine's own string
    expect(first.notConsidered).toEqual(set.notConsidered)
    expect(first.recommended).toBe(set.recommendedArchetype)
  })

  it('takes "yes do that" to mean the design it recommended, not the first card', async () => {
    const set = scenarioSetFixture()
    useAppStore.setState((s) => ({ onboarding: { ...s.onboarding, designs: ready(set) } }))
    const applyDesign = vi.fn<AppState['applyDesign']>(async () => {})
    useAppStore.setState({ applyDesign })
    await act(said('apply-design', { subject: 'yes do that' }), context)
    expect(applyDesign).toHaveBeenCalledTimes(1)
    expect(applyDesign.mock.calls[0]?.[0]?.candidate.archetype).toBe(set.recommendedArchetype)
  })

  it('applies a design the grower named instead, when they named one', async () => {
    const set = scenarioSetFixture()
    useAppStore.setState((s) => ({ onboarding: { ...s.onboarding, designs: ready(set) } }))
    const applyDesign = vi.fn<AppState['applyDesign']>(async () => {})
    useAppStore.setState({ applyDesign })
    await act(said('apply-design', { subject: 'use the no array control' }), context)
    expect(applyDesign.mock.calls[0]?.[0]?.candidate.archetype).toBe('no-array-control')
  })

  it('writes a real garden through the store own actions and reports what it did', async () => {
    await getAppState().applyDesign(designScenarioFixture('balanced'))
    const answer = await act(said('describe-garden'), context)
    const first = answer.utterances[0]
    expect(first?.kind).toBe('garden')
    if (first?.kind !== 'garden') return
    expect(first.summary.bedCount).toBeGreaterThan(0)
    expect(first.summary.plantingCount).toBeGreaterThan(0)
    expect(first.summary.plotAreaM2).toBeGreaterThan(0)
  })

  /**
   * The staleness trap. immer hands back a NEW state object per mutation, so anything read from
   * the object captured before an action ran is the garden as it was
   */
  it('reads the garden back after it changed rather than before', async () => {
    await getAppState().applyDesign(designScenarioFixture('balanced'))
    const answer = await act(said('describe-garden'), context)
    const first = answer.utterances[0]
    if (first?.kind !== 'garden') throw new Error('expected a summary')
    const planted = getAppState().plot?.beds.reduce((n, bed) => n + bed.plantings.length, 0) ?? 0
    expect(first.summary.plantingCount).toBe(planted)
  })
})

describe('the questions the app could already answer', () => {
  /**
   * Half of the twenty-nine unscripted failures were this: the app computes an energy report, a
   * planting calendar, an agenda, a compliance check, a water balance and a companion corpus, all
   * cited, and none of them could be reached by talking. No amount of language understanding
   * invents a capability
   */
  it.each([
    'ask-energy',
    'ask-calendar',
    'ask-agenda',
    'ask-compliance',
    'ask-water',
    'ask-companions',
    'ask-sources',
    'define',
  ] as const)('%s answers rather than falling through', async (intent) => {
    const answer = await act(said(intent), context)
    expect(answer.utterances.length, intent).toBeGreaterThan(0)
    // and "I didn't follow that" is never the reply
    expect(kinds(answer.utterances), intent).not.toContain('not-understood')
  })

  it('says what this is for without needing a garden first', async () => {
    const answer = await act(said('define'), context)
    expect(kinds(answer.utterances)).toEqual(['define'])
  })

  it('opens the sources shelf rather than summarizing it', async () => {
    await act(said('ask-sources'), context)
    expect(getAppState().sidebarStep).toBe('sources')
  })

  /**
   * The annual energy run is never done by default, because there's no default figure. Being
   * asked for one starts it and says so
   */
  it('starts the energy run when asked for a figure nobody has computed', async () => {
    const runEnergy = vi.fn()
    useAppStore.setState({ runEnergy })
    await act(said('ask-energy'), context)
    const answer = await act(said('ask-energy'), context)
    const first = answer.utterances[0]
    expect(first?.kind).toBe('blocked')
    if (first?.kind === 'blocked') expect(first.need).toBe('energy')
    expect(runEnergy).toHaveBeenCalled()
  })

  it('refuses a water balance rather than inventing one when nothing has been baked', async () => {
    const answer = await act(said('ask-water'), context)
    expect(kinds(answer.utterances)).toEqual(['blocked'])
  })

  /**
   * Only the scored rules. The catalog also carries experimental and folklore rules, both shown
   * elsewhere under their own headings, and answering "what goes well with" out of the folklore
   * shelf would launder a label this app is careful about
   */
  it('answers about companions from the scored corpus alone', async () => {
    await getAppState().loadCatalog()
    await getAppState().loadEvidence()
    const answer = await act(said('ask-companions', { crops: ['tomato' as CropId] }), context)
    const first = answer.utterances[0]
    expect(['companions', 'no-reason']).toContain(first?.kind)
    if (first?.kind === 'companions') {
      expect(first.withCropIds.length).toBeGreaterThan(0)
      expect(first.withCropIds).not.toContain('tomato')
    }
  })
})

describe('changing a garden that already exists', () => {
  it('takes a crop out of every bed it is in', async () => {
    await getAppState().applyDesign(designScenarioFixture('balanced'))
    const planted = getAppState().plot?.beds.flatMap((bed) => bed.plantings) ?? []
    const victim = planted[0]?.cropId
    if (victim === undefined) throw new Error('nothing was planted to remove')
    const answer = await act(said('remove-planting', { crops: [victim] }), context)
    expect(kinds(answer.utterances)).toEqual(['removed'])
    const left = getAppState().plot?.beds.flatMap((bed) => bed.plantings) ?? []
    expect(left.some((entry) => entry.cropId === victim)).toBe(false)
    expect(left.length).toBeLessThan(planted.length)
  })

  it("names the crop that wasn't there, rather than saying it has nothing recorded", async () => {
    const answer = await act(said('remove-planting', { crops: ['tomato' as CropId] }), context)
    expect(kinds(answer.utterances)).toEqual(['not-planted'])
  })

  it('adds a bed and admits the defaults placed it, not the light', async () => {
    const before = getAppState().plot?.beds.length ?? 0
    const answer = await act(said('add-bed'), context)
    expect(getAppState().plot?.beds.length).toBe(before + 1)
    expect(kinds(answer.utterances)).toEqual(['bed-added'])
  })

  /**
   * The failure this pins is silent and destructive. `upsertBed` matches on id, and a `beds.length
   * + 1` rule hands back an id a surviving bed still holds once one in the middle has gone: the
   * agent says "added Bed 3" and has in fact overwritten Bed 3, plantings and all
   */
  it('adds a bed without overwriting one that outlived a gap in the numbering', async () => {
    const beds = getAppState().plot?.beds ?? []
    const middle = beds[1]?.id
    const last = beds[2]
    expect(middle).toBeDefined()
    expect(last).toBeDefined()
    getAppState().removeBed(middle as NonNullable<typeof middle>)

    const answer = await act(said('add-bed'), context)
    expect(kinds(answer.utterances)).toEqual(['bed-added'])
    const after = getAppState().plot?.beds ?? []
    expect(after.length).toBe(3)
    expect(new Set(after.map((bed) => bed.id)).size).toBe(3)
    // and the bed that was already there is still the one it was
    expect(after.some((bed) => bed.id === last?.id)).toBe(true)
  })

  it('starts over by forgetting the design, through the store own action', async () => {
    await getAppState().applyDesign(designScenarioFixture('balanced'))
    expect(getAppState().generated).not.toBeNull()
    await act(said('start-over'), context)
    expect(getAppState().generated).toBeNull()
  })

  /**
   * The plot boundary is the one source of the plot's size, so "make it 8 by 5" resizes the plot
   * on screen whether or not a layout has been applied, and the search reads its size off that
   */
  it('reshapes the plot, generated or not, rather than only recording the number', async () => {
    const answer = await act(said('set-space', { widthM: 8, depthM: 5 }), context)
    expect(kinds(answer.utterances)).toEqual(['resized', 'noted'])
    const plot = getAppState().plot
    expect(plot).not.toBeNull()
    if (plot === null) return
    expect(polygonAreaM2(plot.boundary)).toBeCloseTo(40, 6)

    await getAppState().applyDesign(designScenarioFixture('balanced'))
    await act(said('set-space', { widthM: 9, depthM: 4 }), context)
    expect(polygonAreaM2(getAppState().plot?.boundary ?? plot.boundary)).toBeCloseTo(36, 6)
  })

  it('keeps the depth the plot already has when only a width is said', async () => {
    await act(said('set-space', { widthM: 8, depthM: 5 }), context)
    await act(said('set-space', { widthM: 10 }), context)
    expect(polygonAreaM2(getAppState().plot?.boundary ?? { exterior: [], holes: [] })).toBeCloseTo(
      50,
      6,
    )
  })
})

describe('moving the panels', () => {
  it('raises them by one step and reports where they ended up', async () => {
    await getAppState().applyDesign(designScenarioFixture('balanced'))
    const before = getAppState().plot?.arrays[0]?.geometry.clearanceHeightM ?? 0
    const answer = await act(said('adjust-panels', { panels: 'taller' }), context)
    expect(kinds(answer.utterances)).toEqual(['panels-adjusted'])
    expect(getAppState().plot?.arrays[0]?.geometry.clearanceHeightM).toBeCloseTo(before + 0.5, 6)
  })

  it('takes an absolute figure when one is given, because somebody who names a number means it', async () => {
    await getAppState().applyDesign(designScenarioFixture('balanced'))
    await act(said('adjust-panels', { panels: 'taller', lengthM: 3 }), context)
    expect(getAppState().plot?.arrays[0]?.geometry.clearanceHeightM).toBeCloseTo(3, 6)
  })

  it('never closes the rows past the width of one, which is a row overlapping itself', async () => {
    await getAppState().applyDesign(designScenarioFixture('balanced'))
    for (let i = 0; i < 20; i += 1) {
      await act(said('adjust-panels', { panels: 'tighter-spacing' }), context)
    }
    const geometry = getAppState().plot?.arrays[0]?.geometry
    expect(geometry?.pitchM).toBeGreaterThanOrEqual(geometry?.collectorWidthM ?? 0)
  })

  it('refuses when there are no panels to move', async () => {
    useAppStore.setState((s) => ({ plot: s.plot === null ? null : { ...s.plot, arrays: [] } }))
    const answer = await act(said('adjust-panels', { panels: 'taller' }), context)
    expect(kinds(answer.utterances)).toEqual(['blocked'])
  })

  /** Saying it and typing it move the garden by the same amount, through the same action */
  it('leaves the light stale and says so rather than quietly reusing it', async () => {
    await getAppState().applyDesign(designScenarioFixture('balanced'))
    const geometry = getAppState().lightGeometry
    await act(said('adjust-panels', { panels: 'wider-spacing' }), context)
    expect(getAppState().lightGeometry).toBe(geometry)
  })
})

describe("the things people say that aren't about the garden", () => {
  /**
   * The question about the place accepts any text as a possible place name, so "hiya" reaches the
   * geocoder as a place guess, and "ta" at the end is told it hadn't been followed
   */
  it('answers a greeting with the question that was already on the table', async () => {
    const answer = await act(said('greeting'), context)
    expect(kinds(answer.utterances)).toEqual(['greeting', 'ask'])
  })
})
