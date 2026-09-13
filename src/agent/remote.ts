import { cropName } from '../data/crops'
import { extentOf, extentSize } from '../state/geom'
import type { AppState } from '../state/slices'
import type { Crop } from '../types/crop'
import type { CropId } from '../types/ids'
import { INTENTS, type IntentId } from './intent'
import { routeLexically } from './lexical'
import { EMPTY_SLOTS, type Slots, type Understander, type Understanding } from './understand'
import {
  AMBITION,
  type Candidate,
  EXPOSURE,
  MOUNTING,
  OBJECTIVE,
  PANEL_CHANGE,
  SCOPE,
} from './vocabulary'

/**
 * The third understander: the sentence is read by a language model at this app's own edge.
 *
 * It exists because the other two are paid for by the visitor. The phrase table downloads nothing
 * and reads 61% of a held-out set correctly; the embedding reads 82% and costs 45 MB on a surface
 * most people never open, which is a download a phone on a metered connection should not be asked
 * for. This one costs the browser one request and reads the sentence with a model nobody has to
 * fetch, so it is the only one of the three that a cheap phone can have.
 *
 * Everything it can return is still one of the 35 intents and the same closed `Slots`, validated
 * here as well as on the edge. A model behind this seam gets to decide what a sentence MEANT and
 * never gets to invent a crop, a number or a reassurance, which is the property `intent.ts`
 * describes and the reason a language model is safe at this one seam and nowhere else in the app
 */

/**
 * The route the browser asks, restated rather than imported.
 *
 * `workers/proxy/helper.ts` holds the other copy. Importing it would pull the Worker's routing
 * helpers and its four kilobytes of system prompt into the browser bundle for the sake of one
 * string, and the two projects share no module by design: `tsconfig.worker.json` includes only
 * `workers`. `remote.test.ts` imports both copies and fails the moment they differ, which is the
 * one drift this arrangement can have
 */
export const HELPER_PATH = '/api/proxy/helper'

/** The edge refuses a longer summary outright, so this is the same 600 the Worker states */
export const SUMMARY_LIMIT = 600

/**
 * How long the readiness probe waits before the answer is taken to be no.
 *
 * Nothing waits on the probe, so all this bounds is how long the panel can go on saying it is
 * still determining which router it has. Four seconds covers an edge round trip on a slow phone,
 * and a request that is never answered at all stops holding the status line after it
 */
export const PROBE_TIMEOUT_MS = 4000

/**
 * The day's free Neurons are spent, which is a different day rather than a different sentence.
 *
 * Thrown rather than returned because it is not a reading: every other failure here falls back to
 * the phrase table and answers the turn, and this one has to reach the panel, which says the
 * sentence out loud and stops using the remote router for the rest of the session. Cloudflare
 * fails a request outright once the allowance is gone rather than billing for it
 */
export class HelperAllowanceError extends Error {
  constructor() {
    super(
      "The helper has answered as many questions as it's allowed today, so I'll read what you type literally until tomorrow.",
    )
    this.name = 'HelperAllowanceError'
  }
}

const INTENT_IDS: readonly IntentId[] = INTENTS.map((intent) => intent.id)

const asString = (value: unknown): string | null =>
  typeof value === 'string' && value.trim() !== '' ? value : null

const asNumber = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null

/**
 * One of the values the app can act on, or nothing.
 *
 * Read off `vocabulary.ts` rather than restated, because those tables already are the closed list
 * of what an exposure or a mounting preference may be, and a second list here would be a second
 * thing to update when one of them grows a value
 */
const asChoice = <T extends string>(value: unknown, among: readonly Candidate<T>[]): T | null =>
  among.find((candidate) => candidate.value === value)?.value ?? null

/**
 * The slots as the app can use them, whatever arrived.
 *
 * Validated a second time, on this side of the request. The edge validates the model and this
 * validates the edge, which is worth the few lines: the browser is where a wrong value would be
 * acted on, and a route that answers over the network is a route a proxy, a captive portal or a
 * stale deploy can put words into. A slot that fails becomes null rather than sinking the whole
 * reading, because the intent is the load-bearing half and a half-filled reading is the normal
 * case `Slots` was written for
 */
const readSlots = (value: unknown, catalog: readonly Crop[]): Slots => {
  const raw = (typeof value === 'object' && value !== null ? value : {}) as Record<string, unknown>
  const named: readonly unknown[] = Array.isArray(raw.crops) ? raw.crops : []
  return {
    ...EMPTY_SLOTS,
    place: asString(raw.place),
    widthM: asNumber(raw.widthM),
    depthM: asNumber(raw.depthM),
    lengthM: asNumber(raw.lengthM),
    exposure: asChoice(raw.exposure, EXPOSURE),
    ambition: asChoice(raw.ambition, AMBITION),
    objective: asChoice(raw.objective, OBJECTIVE),
    mounting: asChoice(raw.mounting, MOUNTING),
    yesNo: typeof raw.yesNo === 'boolean' ? raw.yesNo : null,
    // narrowed to the ids this catalogue actually holds, so a plausible invented name goes nowhere
    crops: named.filter((entry): entry is CropId =>
      catalog.some((crop) => (crop.id as string) === entry),
    ),
    subject: asString(raw.subject),
    scope: asChoice(raw.scope, SCOPE),
    panels: asChoice(raw.panels, PANEL_CHANGE),
  }
}

/** The answer as an `Understanding`, or null where it is not one the app can carry out */
const readAnswer = (
  body: unknown,
  text: string,
  catalog: readonly Crop[],
): Understanding | null => {
  const raw = (typeof body === 'object' && body !== null ? body : {}) as Record<string, unknown>
  const intent = INTENT_IDS.find((id) => id === raw.intent)
  const confidence = asNumber(raw.confidence)
  if (intent === undefined || confidence === null) return null
  const held = Math.min(1, Math.max(0, confidence))
  return {
    intent,
    confidence: held,
    slots: readSlots(raw.slots, catalog),
    matched: text,
    /*
      The same number as `confidence`, because there is no bias underneath it to strip. `spoken`
      is what a reading scored on the sentence's own words before `STEP_BIAS` lifted it, and the
      model is never given a bias to lift: the question on screen reaches it as one line of
      context that makes an answer to that question likelier and rules nothing out
    */
    spoken: held,
    /*
      Never a tie. The other two routers offer candidates when two readings are within a few
      hundredths of each other, because a cosine gap that thin is a coin flip with store
      mutations behind it. A model that has been asked for one label and a confidence has already
      done that choosing, and inventing an ambiguity from a middling confidence would offer chips
      for sentences it read perfectly well
    */
    alternatives: [],
  }
}

/**
 * What this module needs of `fetch`: the call, and nothing else.
 *
 * Narrower than `typeof fetch`, because Bun's `fetch` carries a `preconnect` method: with the test
 * runner typing the global, a stub handed in here would not assign to `typeof fetch`. Naming the
 * narrow shape is also the more honest declaration, since nothing below reads a property
 */
export type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>

export interface RemoteOptions {
  /** Injected so the whole path can be driven without a network, and so a test can hurry it */
  readonly fetch?: FetchLike
  /** What the garden looks like, read at the moment a sentence is sent. See `summariseForHelper` */
  readonly summary?: () => string
  readonly timeoutMs?: number
}

/**
 * The probe, which is a GET that runs no model.
 *
 * A browser has to find out whether this route can serve before it sends anything, and finding
 * out must not cost a turn of the day's allowance. It answers false for everything except a 204,
 * so a fresh clone, a local `wrangler dev` with no login, an offline visitor and the e2e build
 * that aborts every proxy request all land on the same answer and the same local router
 */
const probeHelper = async (call: FetchLike, timeoutMs: number): Promise<boolean> => {
  const control = new AbortController()
  let timer: ReturnType<typeof setTimeout> | undefined
  const deadline = new Promise<false>((resolve) => {
    timer = setTimeout(() => {
      control.abort()
      resolve(false)
    }, timeoutMs)
  })
  try {
    return await Promise.race([
      call(HELPER_PATH, { method: 'GET', signal: control.signal })
        .then((response) => response.status === 204)
        // caught here rather than below, so an abort that lands after the deadline has already
        // answered is not an unhandled rejection
        .catch(() => false),
      deadline,
    ])
  } catch {
    return false
  } finally {
    // cleared rather than left to fire: a pending four-second timer outlives the surface that
    // opened it, and this runs on every page where somebody opens the conversation
    clearTimeout(timer)
  }
}

export const createRemoteUnderstander = (options: RemoteOptions = {}): Understander => {
  /*
    Called through an arrow rather than captured, so a `fetch` replaced after this understander
    was made is still the one used. The panel builds it at module scope, which is before a test
    or a service worker has had any chance to put its own in place
  */
  const call: FetchLike = options.fetch ?? ((input, init) => globalThis.fetch(input, init))
  /** The probe's answer, kept as the promise, so two concurrent callers make one request */
  let probe: Promise<boolean> | null = null

  return {
    kind: 'remote',
    ready: () => (probe ??= probeHelper(call, options.timeoutMs ?? PROBE_TIMEOUT_MS)),
    route: async (text, context) => {
      try {
        const response = await call(HELPER_PATH, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            text,
            step: context.step,
            crops: context.catalog.map((crop) => crop.id),
            summary: options.summary?.() ?? '',
          }),
        })
        if (response.status === 503) {
          const said: unknown = await response.json().catch(() => null)
          const reason = (said as { readonly error?: unknown } | null)?.error
          if (reason === 'allowance') throw new HelperAllowanceError()
        }
        if (!response.ok) return routeLexically(text, context)
        const body: unknown = await response.json()
        return readAnswer(body, text, context.catalog) ?? routeLexically(text, context)
      } catch (error) {
        if (error instanceof HelperAllowanceError) throw error
        /*
          Every other failure is one turn read by the phrase table, and the visitor is told
          nothing. A dropped request, a 502 from a model that would not answer, a body that will
          not parse: all of them are recoverable by the router that ships in the page, and a
          sentence answered a little more literally than it might have been is a far better turn
          than an apology about infrastructure
        */
        return routeLexically(text, context)
      }
    },
  }
}

const plotSize = (state: AppState): string | null => {
  const plot = state.plot
  if (plot === null) return null
  const [widthM, depthM] = extentSize(extentOf([plot.boundary.exterior]))
  return `${widthM.toFixed(1)} m by ${depthM.toFixed(1)} m`
}

/**
 * What the model is told about the garden, and the whole of what it is told.
 *
 * The panel's privacy line says the sentence and a short summary of the garden are what leave the
 * browser, so this function is what makes that sentence true and is the only place to change if
 * it should say something else. No coordinates, no soil, no weather series, no transcript: what
 * is here is what a reading actually turns on, which is where the garden is, how big it is, what
 * is already in it and which question is on screen.
 *
 * Capped at the 600 characters the edge accepts, by dropping crop names from the end. A garden
 * with forty plantings would otherwise write a summary the route refuses outright, and the names
 * are the only part of this that grows without limit
 */
export const summariseForHelper = (state: AppState): string => {
  const plot = state.plot
  const catalog = state.catalog.status === 'ready' ? state.catalog.value : []
  const size = plotSize(state)
  const planted = [
    ...new Set(plot?.beds.flatMap((bed) => bed.plantings.map((entry) => entry.cropId)) ?? []),
  ].map((id) => cropName(catalog, id))

  const summarise = (names: readonly string[]): string =>
    [
      `Place: ${state.locationLabel}.`,
      state.site.status === 'ready'
        ? 'The site lookup has run.'
        : "The site lookup hasn't run yet.",
      size === null ? 'There is no plot yet.' : `The plot is ${size}.`,
      plot === null
        ? ''
        : `Beds: ${String(plot.beds.length)}${names.length === 0 ? ', nothing planted' : `, planted with ${names.join(', ')}`}.`,
      plot === null ? '' : `Panel arrays: ${String(plot.arrays.length)}.`,
      `The ${state.sidebarStep} step is open.`,
    ]
      .filter((part) => part !== '')
      .join(' ')

  let names = planted
  let summary = summarise(names)
  while (summary.length > SUMMARY_LIMIT && names.length > 0) {
    names = names.slice(0, -1)
    summary = summarise(names)
  }
  // and a hard stop for the rest of it, since a place name is somebody else's string
  return summary.slice(0, SUMMARY_LIMIT)
}
