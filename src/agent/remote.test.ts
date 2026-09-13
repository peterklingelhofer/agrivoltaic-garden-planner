import { beforeAll, describe, expect, it } from 'bun:test'
import {
  HELPER_INTENTS,
  HELPER_PATH as EDGE_PATH,
  SUMMARY_LIMIT as EDGE_SUMMARY_LIMIT,
} from '../../workers/proxy/helper'
import { loadCropCatalog } from '../data/crops'
import type { AppState } from '../state/slices'
import { getAppState, resetAppStore } from '../state/store'
import { seedRankedStore } from '../state/testkit'
import type { Crop } from '../types/crop'
import type { Planting } from '../types/garden'
import { type BedId, type CropId, plantingId } from '../types/ids'
import { dayOfYear } from '../types/units'
import { INTENTS } from './intent'
import {
  createRemoteUnderstander,
  type FetchLike,
  HELPER_PATH,
  HelperAllowanceError,
  SUMMARY_LIMIT,
  summariseForHelper,
} from './remote'
import type { RouteContext } from './understand'

/**
 * The browser half of the helper route, driven against a `fetch` that answers whatever a test
 * needs it to.
 *
 * The failures worth holding here are the ones where the route is reachable and wrong: a model
 * naming a crop this catalogue has never heard of, an intent the app cannot carry out, a 502
 * that must cost one sentence rather than the conversation. Every one of them ends with the
 * phrase table answering the turn, which is what makes an understander that talks to a server
 * safe to put behind a seam nothing else can see
 */

interface Sent {
  readonly path: string
  readonly init: RequestInit | undefined
}

interface Stub {
  readonly fetch: FetchLike
  readonly sent: readonly Sent[]
}

const json = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })

/** A `fetch` that records what it was asked and answers with what this test wants back */
const stub = (answer: (sent: Sent) => Promise<Response>): Stub => {
  const sent: Sent[] = []
  return {
    fetch: (input: RequestInfo | URL, init?: RequestInit) => {
      const call = { path: String(input), init }
      sent.push(call)
      return answer(call)
    },
    sent,
  }
}

const answering = (response: () => Response): Stub => stub(() => Promise.resolve(response()))

const bodyOf = (sent: Sent | undefined): Record<string, unknown> =>
  JSON.parse(String(sent?.init?.body)) as Record<string, unknown>

const ANSWER = {
  intent: 'set-space',
  confidence: 0.94,
  slots: {
    place: null,
    widthM: 6,
    depthM: 4,
    lengthM: null,
    exposure: null,
    ambition: null,
    objective: null,
    mounting: null,
    yesNo: null,
    crops: [],
    subject: null,
    scope: null,
    panels: null,
  },
}

/** One planting, since the summary reads the crop out of it and nothing else */
const planted = (index: number, cropId: CropId, bedId: BedId): Planting => ({
  id: plantingId(`planting-${String(index)}`),
  bedId,
  cropId,
  cultivarId: null,
  role: 'target-crop',
  tier: 'herb-ground',
  sowDay: dayOfYear(100),
  harvestStartDay: dayOfYear(200),
  harvestEndDay: dayOfYear(220),
  plantCount: 4,
})

let catalog: readonly Crop[] = []
let context: RouteContext = { step: 'space', catalog: [] }

beforeAll(async () => {
  catalog = await loadCropCatalog()
  context = { step: 'space', catalog }
})

describe('the readiness probe', () => {
  it('is ready where the route answers 204, and asks with a GET that runs no model', async () => {
    const helper = answering(() => new Response(null, { status: 204 }))
    const understander = createRemoteUnderstander({ fetch: helper.fetch })
    expect(await understander.ready()).toBe(true)
    expect(helper.sent[0]?.path).toBe(HELPER_PATH)
    expect(helper.sent[0]?.init?.method).toBe('GET')
  })

  it('is not ready where the route is not configured, which is every build without the binding', async () => {
    const helper = answering(() => json(404, { error: 'the helper is not configured' }))
    expect(await createRemoteUnderstander({ fetch: helper.fetch }).ready()).toBe(false)
  })

  /*
    The e2e build aborts every `/api/proxy/**` request, and an offline visitor gets the same
    rejection. Neither is an error state: it is the local router doing the work
  */
  it('is not ready where the request is refused outright', async () => {
    const understander = createRemoteUnderstander({
      fetch: () => Promise.reject(new Error('net::ERR_FAILED')),
    })
    expect(await understander.ready()).toBe(false)
  })

  it('gives up on a request nothing ever answers, rather than holding the status line all session', async () => {
    const understander = createRemoteUnderstander({
      fetch: () => new Promise<Response>(() => undefined),
      timeoutMs: 5,
    })
    expect(await understander.ready()).toBe(false)
  })

  it('asks once however many times it is asked, since the answer is a fact about the deployment', async () => {
    const helper = answering(() => new Response(null, { status: 204 }))
    const understander = createRemoteUnderstander({ fetch: helper.fetch })
    expect(await Promise.all([understander.ready(), understander.ready()])).toEqual([true, true])
    expect(await understander.ready()).toBe(true)
    expect(helper.sent).toHaveLength(1)
  })
})

describe('a sentence sent to the edge', () => {
  it('goes with the question on screen, the catalogue and the summary, and nothing else', async () => {
    const helper = answering(() => json(200, ANSWER))
    const understander = createRemoteUnderstander({
      fetch: helper.fetch,
      summary: () => 'Place: Amherst.',
    })
    await understander.route('my plot is 6 by 4 metres', context)
    const body = bodyOf(helper.sent[0])
    expect(helper.sent[0]?.init?.method).toBe('POST')
    expect(body.text).toBe('my plot is 6 by 4 metres')
    expect(body.step).toBe('space')
    expect(body.summary).toBe('Place: Amherst.')
    expect(body.crops).toContain('tomato')
    expect(Object.keys(body).sort()).toEqual(['crops', 'step', 'summary', 'text'])
  })

  it('comes back as the intent, the confidence and the slots the app can act on', async () => {
    const helper = answering(() => json(200, ANSWER))
    const understander = createRemoteUnderstander({ fetch: helper.fetch })
    const reading = await understander.route('my plot is 6 by 4 metres', context)
    expect(reading).toMatchObject({
      intent: 'set-space',
      confidence: 0.94,
      spoken: 0.94,
      matched: 'my plot is 6 by 4 metres',
      alternatives: [],
    })
    expect(reading?.slots.widthM).toBe(6)
    expect(reading?.slots.depthM).toBe(4)
  })

  it('keeps only the crops this catalogue holds, so an invented name goes nowhere', async () => {
    const named = {
      ...ANSWER,
      intent: 'like-crop',
      slots: { ...ANSWER.slots, crops: ['tomato', 'dragonfruit'] },
    }
    const helper = answering(() => json(200, named))
    const understander = createRemoteUnderstander({ fetch: helper.fetch })
    const reading = await understander.route('i want tomatoes and dragonfruit', context)
    expect(reading?.slots.crops).toEqual(['tomato'])
  })

  it('drops a value the app has no such thing as, and keeps the reading around it', async () => {
    const named = {
      ...ANSWER,
      intent: 'set-exposure',
      slots: { ...ANSWER.slots, exposure: 'quite shady', place: 'Amherst' },
    }
    const helper = answering(() => json(200, named))
    const understander = createRemoteUnderstander({ fetch: helper.fetch })
    const reading = await understander.route('there are trees on one side', context)
    expect(reading?.intent).toBe('set-exposure')
    expect(reading?.slots.exposure).toBeNull()
    expect(reading?.slots.place).toBe('Amherst')
  })
})

describe('when the edge cannot answer', () => {
  /*
    One sentence read a little more literally than it might have been, and the visitor is told
    nothing: the phrase table is in the page and can perfectly well answer this
  */
  it('falls back to the phrase table on a model failure', async () => {
    const helper = answering(() => json(502, { error: 'model' }))
    const understander = createRemoteUnderstander({ fetch: helper.fetch })
    const reading = await understander.route('start over', context)
    expect(reading?.intent).toBe('start-over')
  })

  it('falls back to the phrase table on a body that is not a reading', async () => {
    const helper = answering(() => json(200, { intent: 'water-the-lawn', confidence: 0.9 }))
    const understander = createRemoteUnderstander({ fetch: helper.fetch })
    expect((await understander.route('start over', context))?.intent).toBe('start-over')
  })

  /*
    The one failure that reaches the panel. A spent allowance is every turn for the rest of the
    day rather than this one, so the panel says so and stops using this router
  */
  it('throws where the day is spent, which the panel answers differently', async () => {
    const helper = answering(() => json(503, { error: 'allowance' }))
    const understander = createRemoteUnderstander({ fetch: helper.fetch })
    await expect(understander.route('start over', context)).rejects.toBeInstanceOf(
      HelperAllowanceError,
    )
  })

  it('reads a 503 that says something else as an ordinary failure', async () => {
    const helper = answering(() => json(503, { error: 'unavailable' }))
    const understander = createRemoteUnderstander({ fetch: helper.fetch })
    expect((await understander.route('start over', context))?.intent).toBe('start-over')
  })
})

/**
 * The drift the arrangement can have, in one test.
 *
 * `workers/proxy/helper.ts` states the intents the model may choose from, and it states them
 * again rather than importing them, because `tsconfig.worker.json` includes only `workers` and
 * the edge and the browser share no module. A test file may read both, so this is where the two
 * copies are held level: an intent added to `intent.ts` and not to the edge is a label the model
 * is never offered, and one added to the edge alone is a label the browser throws away
 */
describe('the edge and the browser agree', () => {
  it('offers the model exactly the intents the app can carry out', () => {
    const edge = HELPER_INTENTS.map((intent) => intent.id)
    const app = INTENTS.map((intent) => intent.id)
    expect(edge).toHaveLength(app.length)
    expect(new Set(edge)).toEqual(new Set(app))
  })

  it('asks the route the edge serves, and caps the summary where the edge caps it', () => {
    expect(HELPER_PATH).toBe(EDGE_PATH)
    expect(SUMMARY_LIMIT).toBe(EDGE_SUMMARY_LIMIT)
  })
})

describe('what the model is told about the garden', () => {
  beforeAll(async () => {
    localStorage.clear()
    resetAppStore()
    await seedRankedStore()
  })

  it('names the place and stays inside what the edge accepts', () => {
    const summary = summariseForHelper(getAppState())
    expect(summary).toContain(getAppState().locationLabel)
    expect(summary.length).toBeLessThanOrEqual(SUMMARY_LIMIT)
    expect(summary).toMatch(/The plot is [\d.]+ m by [\d.]+ m\./)
    expect(summary).toContain('Beds: 1')
  })

  /*
    Sixty crops in one bed is not a garden anybody has, and it is the shape that matters: the
    names are the one part of this summary that grows without limit, and the edge refuses a
    summary over its cap outright rather than trimming it
  */
  it('drops crop names rather than sending a summary the edge refuses', () => {
    const state = getAppState()
    const plot = state.plot
    const bed = plot?.beds[0]
    expect(bed).toBeDefined()
    if (plot === null || bed === undefined) return
    const crowded: AppState = {
      ...state,
      plot: {
        ...plot,
        beds: [
          {
            ...bed,
            plantings: catalog.slice(0, 60).map((crop, at) => planted(at, crop.id, bed.id)),
          },
        ],
      },
    }
    const summary = summariseForHelper(crowded)
    expect(summary.length).toBeLessThanOrEqual(SUMMARY_LIMIT)
    expect(summary).toContain('planted with')
    expect(summary).toContain('Panel arrays:')
  })
})
