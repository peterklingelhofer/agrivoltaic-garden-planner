import type { ProxyEnv } from './env'
import { jsonError } from './routes'

/**
 * One route, one model call: the reading of a typed sentence, done on the edge.
 *
 * It exists because the two understanders in `src/agent` are both paid for by the visitor. The
 * phrase table is free and reads 61% of a held-out set correctly; the embedding reads 82% and
 * costs 45 MB of download on a surface most people never open. This third one costs the browser
 * nothing at all and reads the sentence with a language model, which is the only one of the three
 * that a phone on a metered connection can have.
 *
 * What travels is the sentence and a short summary of the garden. Nothing is written down here:
 * the answer is returned and the request is over, so there is no transcript on the edge and no
 * store to leak. The panel says so in as many words, and this file is what makes that sentence
 * true
 */
export const HELPER_PATH = '/api/proxy/helper'

/**
 * Llama 3.3 70B in its fp8 fast form, which is on Cloudflare's list of models that honour
 * `response_format`. `@cf/meta/llama-3.1-8b-instruct-fast` is the cheap alternative and is about
 * six times less Neurons a turn; `HELPER_MODEL` swaps between them without a code change, because
 * which one is affordable is a fact about the account
 */
export const DEFAULT_HELPER_MODEL = '@cf/meta/llama-3.3-70b-instruct-fp8-fast'

/** A reading is a few dozen tokens of JSON, and a cap is what stops a runaway turn costing more */
export const HELPER_MAX_TOKENS = 240

export const TEXT_LIMIT = 400
export const STEP_LIMIT = 40
export const SUMMARY_LIMIT = 600
export const CROP_LIMIT = 250
export const CROP_ID_LIMIT = 60

/**
 * Every intent the agent can carry out, with a line saying what each one means.
 *
 * The ids are the closed list in `src/agent/intent.ts` and the `means` lines are written from
 * that table and from what `act.ts` does with each one. They are duplicated here, not
 * imported, because `tsconfig.worker.json` includes only `workers`, so the edge and the browser
 * share no module: `src/agent/remote.test.ts` compares the two lists as sets and fails the moment
 * one grows an intent the other has not heard of, which is the drift this arrangement can have
 */
export const HELPER_INTENTS: readonly { readonly id: string; readonly means: string }[] = [
  { id: 'greeting', means: 'hello, thanks or goodbye, with nothing about the garden in it' },
  { id: 'help', means: 'they are stuck and want to know what they can say here' },
  { id: 'describe-garden', means: 'read back what is in the plot at the moment' },
  {
    id: 'explain',
    means: 'why a number or a planting is what it is; subject carries what was asked about',
  },
  {
    id: 'list-crops',
    means:
      'what to plant, what would grow, or what suits the beds or the ground under the panels, as a ranked list',
  },
  {
    id: 'out-of-scope',
    means: 'asks about something the app does not model; scope says which of the six',
  },
  { id: 'define', means: 'what agrivoltaics is, and what this app is for' },
  { id: 'ask-energy', means: 'how much electricity the panels will make' },
  { id: 'ask-calendar', means: 'sowing and harvest dates, for the crops named in crops' },
  { id: 'ask-agenda', means: 'what to do next, as a month by month list of tasks' },
  { id: 'ask-compliance', means: 'whether the design meets the state rules the app checks' },
  { id: 'ask-water', means: 'how much watering the garden will need' },
  { id: 'ask-companions', means: 'which crops grow well beside the ones named in crops' },
  { id: 'ask-sources', means: 'the papers and datasets the numbers come from' },
  { id: 'set-place', means: 'where the garden is; place carries the town or the address' },
  { id: 'set-space', means: 'how big the plot is; widthM and depthM carry the two sides' },
  { id: 'set-exposure', means: 'what already stands around the plot; exposure' },
  { id: 'set-ambition', means: 'the sort of thing they want to grow; ambition' },
  { id: 'set-natives', means: 'whether they want native planting; yesNo' },
  { id: 'set-pollinators', means: 'whether they want planting for pollinators; yesNo' },
  { id: 'set-objective', means: 'how to weigh food against electricity; objective' },
  { id: 'set-mounting', means: 'how the panels should sit over or beside the beds; mounting' },
  { id: 'set-height', means: 'a height limit for the panels, in metres; lengthM' },
  { id: 'set-water', means: 'whether the plot can be watered; yesNo' },
  { id: 'like-crop', means: 'they want these crops; crops' },
  { id: 'dislike-crop', means: 'they do not want these crops; crops' },
  { id: 'propose-designs', means: 'run the design search and offer some layouts' },
  { id: 'apply-design', means: 'commit one of the layouts already offered' },
  { id: 'plan-planting', means: 'fill every bed with crops' },
  { id: 'remove-planting', means: 'take the named crops out of the beds; crops' },
  { id: 'adjust-panels', means: 'move the panels; panels says which way' },
  { id: 'add-bed', means: 'add another bed to the plot' },
  { id: 'start-over', means: 'forget the whole design and begin again' },
  { id: 'undo', means: 'put back what the last change altered' },
  { id: 'show-the-form', means: 'stop the conversation and use the guided questions instead' },
]

const INTENT_IDS: readonly string[] = HELPER_INTENTS.map((intent) => intent.id)

const EXPOSURE: readonly string[] = ['open', 'partly-sheltered', 'overshadowed']
const AMBITION: readonly string[] = ['leafy-and-herbs', 'mixed-vegetables', 'fruiting-and-berries']
const OBJECTIVE: readonly string[] = ['mostly-food', 'balanced', 'mostly-electricity']
const MOUNTING: readonly string[] = ['overhead-canopy', 'ground-rows', 'vertical-bifacial', 'any']
const SCOPE: readonly string[] = ['cost', 'permitting', 'wildlife', 'grid', 'structure', 'soil']
const PANELS: readonly string[] = [
  'taller',
  'lower',
  'steeper',
  'flatter',
  'wider-spacing',
  'tighter-spacing',
]

const nullableEnum = (values: readonly string[]): unknown => ({
  type: ['string', 'null'],
  enum: [...values, null],
})

const NULLABLE_STRING = { type: ['string', 'null'] }
const NULLABLE_NUMBER = { type: ['number', 'null'] }

const SLOT_NAMES: readonly string[] = [
  'place',
  'widthM',
  'depthM',
  'lengthM',
  'exposure',
  'ambition',
  'objective',
  'mounting',
  'yesNo',
  'crops',
  'subject',
  'scope',
  'panels',
]

/**
 * The shape the answer has to arrive in, handed to the model.
 *
 * JSON mode is what makes a language model usable at this seam at all. The agent's whole design
 * is a closed list of things a sentence can mean, and the failure it guards against is a model
 * inventing a crop, a number or a reassurance; a schema the decoder is constrained to means the
 * model chooses among the same 35 labels the phrase table does. It is still validated on arrival,
 * on both sides, because a constrained decoder is a promise from a service. A service can still
 * break its promise, so this checks anyway
 */
export const HELPER_SCHEMA = {
  type: 'object',
  properties: {
    intent: { type: 'string', enum: INTENT_IDS },
    confidence: { type: 'number', minimum: 0, maximum: 1 },
    slots: {
      type: 'object',
      properties: {
        place: NULLABLE_STRING,
        widthM: NULLABLE_NUMBER,
        depthM: NULLABLE_NUMBER,
        lengthM: NULLABLE_NUMBER,
        exposure: nullableEnum(EXPOSURE),
        ambition: nullableEnum(AMBITION),
        objective: nullableEnum(OBJECTIVE),
        mounting: nullableEnum(MOUNTING),
        yesNo: { type: ['boolean', 'null'] },
        crops: { type: 'array', items: { type: 'string' } },
        subject: NULLABLE_STRING,
        scope: nullableEnum(SCOPE),
        panels: nullableEnum(PANELS),
      },
      required: SLOT_NAMES,
      additionalProperties: false,
    },
  },
  required: ['intent', 'confidence', 'slots'],
  additionalProperties: false,
}

/**
 * What the model is told about the app before it is shown a sentence.
 *
 * Long, and deliberately so. Every misreading the two local routers ever made came from a missing
 * piece of context. The language understanding itself was fine each time: a sentence about clay soil was
 * geocoded because nothing said soil is out of scope, and "Amherst, Massachusetts" reached the
 * compliance check because nothing said a place name is a place name. Stating what the app does,
 * what each label means and what each slot holds is cheaper than tuning around any of that
 */
export const SYSTEM = [
  'You label sentences for a garden design app. Answer only with JSON matching the schema.',
  '',
  'The app designs a garden for a plot that also carries rows of solar panels. It asks ten',
  'questions in a guided setup, one at a time: where the garden is, how big it is, what stands',
  'around it, what they want to grow, food against electricity, how the panels sit, a height',
  'limit, whether it can be watered, native planting, planting for pollinators. Then it proposes',
  'layouts, and a plants step ranks crops against the light each bed measures. Seasons can be run',
  'as whole years. The site, its weather and its elevation come from an address the visitor gives.',
  '',
  'Pick one intent from this list:',
  ...HELPER_INTENTS.map((intent) => `- ${intent.id}: ${intent.means}`),
  '',
  'Slot rules:',
  '- Every length is in metres. Convert feet before you answer.',
  '- "6 by 4" is widthM 6 and depthM 4. A single side goes in widthM.',
  '- lengthM is only ever a height limit for the panels.',
  '- yesNo answers the two wildlife questions and the water question.',
  '- crops may only hold ids from the list the request gives you. Leave it empty otherwise.',
  '- subject is the words they asked about, verbatim, for explain and define.',
  '- scope names the thing the app does not model: cost, permitting, wildlife, grid, structure,',
  '  soil.',
  '- panels says which way to move them, for adjust-panels.',
  '- A slot with nothing in the sentence to fill it is null.',
  '- Asking what to plant, what would grow or what to put somewhere is list-crops, wherever on',
  '  the plot they mean. explain is for why a figure, a date or a planting is what it is.',
  '',
  'The step is the question on screen. It makes an answer to that question more likely and it',
  'never rules anything out: somebody standing on the height question is still allowed to say',
  'they hate parsnips. A bare word of assent on the results step ("go", "ok", "do it", "run',
  'it") is propose-designs: the search is what that step is waiting on.',
  '',
  'Confidence is 0.9 or above when the reading is clear, and below 0.5 when you are guessing.',
].join('\n')

export interface HelperRequest {
  readonly text: string
  readonly step: string | null
  readonly crops: readonly string[]
  readonly summary: string
}

export interface HelperSlots {
  readonly place: string | null
  readonly widthM: number | null
  readonly depthM: number | null
  readonly lengthM: number | null
  readonly exposure: string | null
  readonly ambition: string | null
  readonly objective: string | null
  readonly mounting: string | null
  readonly yesNo: boolean | null
  readonly crops: readonly string[]
  readonly subject: string | null
  readonly scope: string | null
  readonly panels: string | null
}

const badRequest = (reason: string): Response =>
  new Response(JSON.stringify({ error: 'bad-request', reason }), {
    status: 400,
    headers: { 'Content-Type': 'application/json' },
  })

const isStringArray = (value: unknown, limit: number, each: number): value is readonly string[] =>
  Array.isArray(value) &&
  value.length <= limit &&
  value.every((entry) => typeof entry === 'string' && entry.length <= each)

/** The request as it was sent, or the refusal that names the one field that was wrong */
const readRequest = (body: unknown): HelperRequest | Response => {
  if (typeof body !== 'object' || body === null) return badRequest('a JSON object is required')
  const raw = body as Record<string, unknown>
  const text = typeof raw.text === 'string' ? raw.text.trim() : ''
  if (text === '') return badRequest('text is required')
  if (text.length > TEXT_LIMIT) {
    return badRequest(`text may be at most ${String(TEXT_LIMIT)} characters`)
  }
  const step = raw.step ?? null
  if (step !== null && (typeof step !== 'string' || step.length > STEP_LIMIT)) {
    return badRequest(`step must be a string of at most ${String(STEP_LIMIT)} characters, or null`)
  }
  if (!isStringArray(raw.crops, CROP_LIMIT, CROP_ID_LIMIT)) {
    return badRequest(`crops must be an array of at most ${String(CROP_LIMIT)} short strings`)
  }
  const summary = typeof raw.summary === 'string' ? raw.summary : ''
  if (summary.length > SUMMARY_LIMIT) {
    return badRequest(`summary may be at most ${String(SUMMARY_LIMIT)} characters`)
  }
  return { text, step, crops: raw.crops, summary }
}

const userMessage = (request: HelperRequest): string =>
  [
    `Question on screen: ${request.step ?? 'none'}`,
    `The garden so far: ${request.summary === '' ? 'nothing yet' : request.summary}`,
    `Crop ids you may use: ${request.crops.join(', ')}`,
    `Sentence: ${request.text}`,
  ].join('\n')

const asString = (value: unknown): string | null =>
  typeof value === 'string' && value.trim() !== '' ? value : null

const asNumber = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null

const asMember = (value: unknown, allowed: readonly string[]): string | null =>
  typeof value === 'string' && allowed.includes(value) ? value : null

/**
 * The model's slots, kept only where they are the type and the value the app can act on.
 *
 * A slot the model got wrong becomes null, and never sinks the whole reading, because the
 * intent is the load-bearing half and a half-filled reading is the normal, useful case that
 * `Slots` was written for. The crops are the exception worth stating: they are narrowed to the
 * ids this request actually sent, so a plausible invented crop name cannot reach the catalogue
 */
const readSlots = (value: unknown, allowed: readonly string[]): HelperSlots => {
  const raw = (typeof value === 'object' && value !== null ? value : {}) as Record<string, unknown>
  const crops = Array.isArray(raw.crops) ? raw.crops : []
  return {
    place: asString(raw.place),
    widthM: asNumber(raw.widthM),
    depthM: asNumber(raw.depthM),
    lengthM: asNumber(raw.lengthM),
    exposure: asMember(raw.exposure, EXPOSURE),
    ambition: asMember(raw.ambition, AMBITION),
    objective: asMember(raw.objective, OBJECTIVE),
    mounting: asMember(raw.mounting, MOUNTING),
    yesNo: typeof raw.yesNo === 'boolean' ? raw.yesNo : null,
    crops: crops
      .filter((entry): entry is string => typeof entry === 'string')
      .filter((entry) => allowed.includes(entry)),
    subject: asString(raw.subject),
    scope: asMember(raw.scope, SCOPE),
    panels: asMember(raw.panels, PANELS),
  }
}

/**
 * The object the model produced, whichever of the two ways it arrived.
 *
 * Workers AI returns `{ response: ... }`, and whether `response` holds the parsed object or the
 * JSON string that produced it depends on the model. Both are answered the same way, and a string
 * that will not parse is the same failure as no answer at all
 */
const readAnswer = (answer: unknown): Record<string, unknown> | null => {
  const held = (typeof answer === 'object' && answer !== null ? answer : {}) as {
    response?: unknown
  }
  const raw = held.response
  if (typeof raw === 'string') {
    try {
      const parsed: unknown = JSON.parse(raw)
      return typeof parsed === 'object' && parsed !== null
        ? (parsed as Record<string, unknown>)
        : null
    } catch {
      return null
    }
  }
  return typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : null
}

/**
 * The one failure that is not a fault: the day's Neurons are spent.
 *
 * Cloudflare fails a request outright once the free allowance is gone, and never bills for it,
 * so this arrives as a thrown error with the reason in its message. It is told apart from a
 * genuine model failure because the panel answers them differently: a model failure is one turn
 * read literally, and a spent allowance is every turn for the rest of the day
 */
const ALLOWANCE_SPENT = /quota|limit|allowance|exceeded|neurons/i

export const handleHelper = async (request: Request, env: ProxyEnv): Promise<Response> => {
  // the readiness probe, and the reason it calls no model: a browser has to find out whether this
  // route can serve before it sends anything, and finding out must not cost a turn
  if (env.AI === undefined) return jsonError(404, 'the helper is not configured')
  if (request.method === 'GET') return new Response(null, { status: 204 })

  /*
    The drain guard, ahead of the model and ahead of the body.

    The allowance is a day's worth of routing turns for everybody who visits, and one script can
    spend it in a minute. Keyed on the connecting address, which is the only thing a route with no
    accounts has to key on
  */
  if (env.HELPER_LIMIT !== undefined) {
    const key = request.headers.get('CF-Connecting-IP') ?? 'unknown'
    const { success } = await env.HELPER_LIMIT.limit({ key })
    if (!success) return jsonError(429, 'busy')
  }

  const body: unknown = await request.json().catch(() => null)
  const asked = readRequest(body)
  if (asked instanceof Response) return asked

  let answer: unknown
  try {
    answer = await env.AI.run(env.HELPER_MODEL ?? DEFAULT_HELPER_MODEL, {
      messages: [
        { role: 'system', content: SYSTEM },
        { role: 'user', content: userMessage(asked) },
      ],
      response_format: { type: 'json_schema', json_schema: HELPER_SCHEMA },
      max_tokens: HELPER_MAX_TOKENS,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return ALLOWANCE_SPENT.test(message) ? jsonError(503, 'allowance') : jsonError(502, 'model')
  }

  const read = readAnswer(answer)
  const intent = read === null ? null : asMember(read.intent, INTENT_IDS)
  const confidence = read === null ? null : asNumber(read.confidence)
  if (read === null || intent === null || confidence === null) {
    return jsonError(502, 'unreadable')
  }
  return new Response(
    JSON.stringify({
      intent,
      confidence: Math.min(1, Math.max(0, confidence)),
      slots: readSlots(read.slots, asked.crops),
    }),
    { headers: { 'Content-Type': 'application/json' } },
  )
}
