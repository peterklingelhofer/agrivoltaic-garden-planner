import { describe, expect, it } from 'bun:test'
import type { ExecutionContextLike, ProxyEnv } from './env'
import { DEFAULT_HELPER_MODEL, HELPER_INTENTS, HELPER_PATH, TEXT_LIMIT } from './helper'
import handler from './index'
import { PROXY_PREFIX } from './routes'

/**
 * The helper route, driven through `dispatch`. Calling `handleHelper` directly would skip the
 * routing this file exists to test.
 *
 * The registration is half of what this file is holding. The proxy answers 405 to anything that
 * is not a GET, and the helper is the one route here that has to be POSTed to, so a route that
 * works and is wired in above the wrong check is a route nothing can reach
 */

const BASE: ProxyEnv = {
  NSRDB_HOST: 'developer.nlr.gov',
  PVGIS_HOST: 're.jrc.ec.europa.eu',
  ALLOWED_ORIGINS: '',
}

const ctx: ExecutionContextLike = { waitUntil: () => undefined }

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

interface Ran {
  readonly model: string
  readonly input: {
    readonly messages: readonly { readonly role: string; readonly content: string }[]
    readonly response_format: { readonly type: string; readonly json_schema: unknown }
    readonly max_tokens: number
  }
}

/** A stand-in for Workers AI that records what it was asked and answers with what it was given */
const fakeAi = (
  response: unknown,
): { readonly env: ProxyEnv; readonly calls: () => readonly Ran[] } => {
  const calls: Ran[] = []
  return {
    env: {
      ...BASE,
      AI: {
        run: (model, input) => {
          calls.push({ model, input: input as Ran['input'] })
          return Promise.resolve({ response })
        },
      },
    },
    calls: () => calls,
  }
}

const failingAi = (message: string): ProxyEnv => ({
  ...BASE,
  AI: { run: () => Promise.reject(new Error(message)) },
})

const get = (env: ProxyEnv, path = HELPER_PATH): Promise<Response> =>
  handler.fetch(new Request(`https://host${path}`), env, ctx)

const post = (env: ProxyEnv, body: unknown, path = HELPER_PATH): Promise<Response> =>
  handler.fetch(
    new Request(`https://host${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': '203.0.113.7' },
      body: JSON.stringify(body),
    }),
    env,
    ctx,
  )

const ASKED = { text: 'my plot is 6 by 4 metres', step: 'space', crops: ['tomato'], summary: '' }

describe('the readiness probe', () => {
  it('answers 204 where the model is bound', async () => {
    expect((await get(fakeAi(ANSWER).env)).status).toBe(204)
  })

  it('answers 404 where it is not, which is a fresh clone and every local dev without a login', async () => {
    expect((await get(BASE)).status).toBe(404)
  })
})

describe('what the route refuses', () => {
  it('refuses a request with no sentence in it', async () => {
    const response = await post(fakeAi(ANSWER).env, { ...ASKED, text: '   ' })
    expect(response.status).toBe(400)
    expect(await response.json()).toMatchObject({ error: 'bad-request' })
  })

  it('refuses a sentence longer than the cap, which is somebody using this as their own model', async () => {
    const response = await post(fakeAi(ANSWER).env, { ...ASKED, text: 'x'.repeat(TEXT_LIMIT + 1) })
    expect(response.status).toBe(400)
  })

  it('refuses a crop list that is not a list', async () => {
    const response = await post(fakeAi(ANSWER).env, { ...ASKED, crops: 'tomato' })
    expect(response.status).toBe(400)
    expect(await response.json()).toMatchObject({ error: 'bad-request' })
  })

  it('leaves every other path answering 405 to a POST, which is what keeps this a read-only proxy', async () => {
    const response = await post(BASE, ASKED, `${PROXY_PREFIX}/nominatim/search`)
    expect(response.status).toBe(405)
  })
})

describe('a reading that came back', () => {
  it('is returned as the intent, the confidence and the slots', async () => {
    const response = await post(fakeAi(ANSWER).env, ASKED)
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({
      intent: 'set-space',
      confidence: 0.94,
      slots: { widthM: 6, depthM: 4 },
    })
  })

  it('arrives the same way when the model hands back a JSON string instead of an object', async () => {
    const response = await post(fakeAi(JSON.stringify(ANSWER)).env, ASKED)
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ intent: 'set-space' })
  })

  it('keeps only the crops this request said were allowed, so an invented name cannot reach the catalogue', async () => {
    const named = {
      ...ANSWER,
      intent: 'like-crop',
      slots: { ...ANSWER.slots, crops: ['tomato', 'dragonfruit'] },
    }
    const response = await post(fakeAi(named).env, { ...ASKED, crops: ['tomato', 'kale'] })
    expect(await response.json()).toMatchObject({ slots: { crops: ['tomato'] } })
  })

  it('is refused as unreadable when the intent is not one of the ones the app can carry out', async () => {
    const response = await post(fakeAi({ ...ANSWER, intent: 'water-the-lawn' }).env, ASKED)
    expect(response.status).toBe(502)
    expect(await response.json()).toEqual({ error: 'unreadable' })
  })
})

describe('what is sent to the model', () => {
  it('asks for JSON against the schema, and says what the app is first', async () => {
    const ai = fakeAi(ANSWER)
    await post(ai.env, ASKED)
    const ran = ai.calls()[0]
    expect(ran?.input.response_format.type).toBe('json_schema')
    expect(ran?.input.response_format.json_schema).toMatchObject({ type: 'object' })
    expect(ran?.input.messages[0]?.role).toBe('system')
    expect(ran?.input.messages[0]?.content).toContain('solar panels')
    expect(ran?.input.messages[1]?.content).toContain('my plot is 6 by 4 metres')
  })

  it('goes to the model the var names, and to the 70B by default', async () => {
    const cheap = fakeAi(ANSWER)
    await post({ ...cheap.env, HELPER_MODEL: '@cf/meta/llama-3.1-8b-instruct-fast' }, ASKED)
    expect(cheap.calls()[0]?.model).toBe('@cf/meta/llama-3.1-8b-instruct-fast')

    const standard = fakeAi(ANSWER)
    await post(standard.env, ASKED)
    expect(standard.calls()[0]?.model).toBe(DEFAULT_HELPER_MODEL)
  })
})

describe('when the model cannot answer', () => {
  it('says the allowance is spent, which is a different day rather than a different sentence', async () => {
    const response = await post(failingAi('Daily quota exceeded'), ASKED)
    expect(response.status).toBe(503)
    expect(await response.json()).toEqual({ error: 'allowance' })
  })

  it('says the model failed for anything else', async () => {
    const response = await post(failingAi('connection reset'), ASKED)
    expect(response.status).toBe(502)
    expect(await response.json()).toEqual({ error: 'model' })
  })
})

describe('the drain guard', () => {
  it('turns a refused caller away before any Neurons are spent', async () => {
    const ai = fakeAi(ANSWER)
    const response = await post(
      { ...ai.env, HELPER_LIMIT: { limit: () => Promise.resolve({ success: false }) } },
      ASKED,
    )
    expect(response.status).toBe(429)
    expect(await response.json()).toEqual({ error: 'busy' })
    expect(ai.calls()).toHaveLength(0)
  })

  it('keys on the connecting address, and lets an allowed caller through', async () => {
    const ai = fakeAi(ANSWER)
    let keyed = ''
    const response = await post(
      {
        ...ai.env,
        HELPER_LIMIT: {
          limit: ({ key }) => {
            keyed = key
            return Promise.resolve({ success: true })
          },
        },
      },
      ASKED,
    )
    expect(response.status).toBe(200)
    expect(keyed).toBe('203.0.113.7')
  })
})

describe('the intent list the model is given', () => {
  it('says what every one of them means, so a label is never guessed from its id alone', () => {
    expect(HELPER_INTENTS.every((intent) => intent.means.length > 10)).toBe(true)
    expect(new Set(HELPER_INTENTS.map((intent) => intent.id)).size).toBe(HELPER_INTENTS.length)
  })
})
