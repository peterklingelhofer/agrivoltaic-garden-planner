import { INTENTS, isDestructive, type IntentId } from './intent'
import { CONFIDENT_MATCH, isNegated, routeLexically, understandingFor } from './lexical'
import { tokens } from './text'
import type { OnboardingStep } from '../state/slices'
import { EMPTY_SLOTS, type Understander, type Understanding } from './understand'

/**
 * The understander that knows what a sentence MEANS rather than what it looks like.
 *
 * 23 MB of `Xenova/all-MiniLM-L6-v2`, INT8, on the WASM backend. Paraphrase is the one thing this
 * fixes: a router that has forgotten which question it asked, or a question the app has no intent
 * for, is out of its reach, because no amount of language understanding invents a feature.
 *
 * Measured on a held-out set neither router has ever been tuned against:
 *
 * - lexical alone .................... 61%
 * - embedding alone .................. 71%
 * - lexical when confident, else embedding ... 68%
 * - **the split below ................ 82%**
 *
 * The third line is the interesting one. Deferring to the lexical router whenever IT is confident
 * loses six points against using the embedding for everything, because a bigram match can be
 * confidently wrong in a way cosine similarity isn't. Confidence isn't the axis to split on
 */

/** Above this cosine similarity the embedding's reading is taken. Chosen by measurement */
export const EMBEDDING_GATE = 0.4

/**
 * And the bar for an intent that destroys work, on this scale rather than the lexical one.
 *
 * `DESTRUCTIVE_FLOOR` is 0.75 of a Dice score over character bigrams, which is a different
 * quantity entirely: cosine similarities here run 0.4 to 0.7 for a firm reading and almost never
 * reach 0.75, so borrowing that number meant "pull out the courgettes" couldn't reach
 * `remove-planting` at all.
 *
 * Chosen from a measured gap rather than picked. Every sentence that must NOT destroy anything
 * scores at most 0.356 against the nearest destructive exemplar: "thanks" 0.270, "how much
 * will it cost" 0.158, "what about deer" 0.315, "ok" 0.356. Every sentence that should
 * scores at least 0.478: "pull out the courgettes" 0.478, "remove the tomatoes" 0.488, "scrap
 * the lot and begin again" 0.666, and the plain forms above 0.98. This sits in the middle of
 * that gap, with margin on both sides
 */
export const DESTRUCTIVE_EMBEDDING_GATE = 0.42

/**
 * How far the best reading must beat the runner-up before it's acted on rather than offered.
 *
 * Cosine similarity separates a firm reading from a wrong one by a wide margin: "dig up the
 * leeks" reads `remove-planting` at 0.614 against 0.323 for the next. It separates a genuine
 * ambiguity by almost nothing: "what is the thinking behind panels over crops" scored `ask-energy`
 * 0.652 and `define` 0.649, a gap of three thousandths, and the answer was decided by rounding.
 * Acting on that is a coin flip with consequences. There's nothing to be gained from hiding it.
 *
 * Swept over all three held-out sets at once. Every value from 0.05 to 0.12 beats acting on ties,
 * on all three, so what is being chosen is a point on a plateau rather than a peak: at 0.08 the
 * router is never confidently wrong on two of the three sets, and asks on roughly a third of what
 * is said. Below 0.05 the ties come back. Above 0.12 it only asks more often for no more accuracy
 */
export const AMBIGUOUS_MARGIN = 0.08

/** How many candidates an unsure reading offers. Three chips is what fits a 375px phone */
export const OFFERED = 3

/** Where the weights are served from, same-origin, so nothing is fetched from a third party */
export const MODEL_PATH = '/models'
export const MODEL_ID = 'Xenova/all-MiniLM-L6-v2'

/**
 * Where ONNX Runtime's own WASM binaries are served from.
 *
 * transformers.js resolves these from a jsDelivr URL unless told otherwise, which would put a
 * third-party request back into a page that deliberately has none and would break the agent for
 * anybody offline. `bun run fetch-agent-model` copies them here out of the runtime the package
 * itself resolves
 */
export const RUNTIME_PATH = '/models/ort/'

interface Vectors {
  readonly phrases: readonly { readonly id: IntentId; readonly vector: Float32Array }[]
  readonly embed: (text: string) => Promise<Float32Array>
}

const cosine = (a: Float32Array, b: Float32Array): number => {
  // both sides are already L2-normalized by the pipeline, so the dot product IS the cosine
  let total = 0
  for (let i = 0; i < a.length; i += 1) total += (a[i] ?? 0) * (b[i] ?? 0)
  return total
}

interface Ranked {
  readonly id: IntentId
  readonly score: number
}

/**
 * The one pair of intents cosine similarity can never separate, and doesn't have to.
 *
 * "I want beans" and "no beans please" mean opposite things out of almost identical words, so
 * they land within a hundredth of each other every time and always will. What separates them is
 * a negator, which `isNegated` finds. Scored as two intents they were each other's runner-up,
 * every crop request looked like a tie, and "i want beans" was answered with three chips and no
 * beans. Scored as one and labeled by the negator, they're what they always were
 */
const NEGATED_TWINS: readonly IntentId[] = ['like-crop', 'dislike-crop']

/** Every intent, scored by its single best exemplar, best first, the twins already settled */
const rankIntents = (
  query: Float32Array,
  vectors: Vectors,
  negated: boolean,
): readonly Ranked[] => {
  const byIntent = new Map<IntentId, number>()
  for (const phrase of vectors.phrases) {
    // the twins are scored as one and labeled by the negator, which is what actually decides them
    const id = NEGATED_TWINS.includes(phrase.id)
      ? negated
        ? 'dislike-crop'
        : 'like-crop'
      : phrase.id
    const score = cosine(query, phrase.vector)
    if (score > (byIntent.get(id) ?? -1)) byIntent.set(id, score)
  }
  return [...byIntent].map(([id, score]) => ({ id, score })).sort((a, b) => b.score - a.score)
}

/**
 * A reading it won't act on, carrying the candidates for somebody to choose between.
 *
 * `intent` is the head of the offer rather than a separate opinion, so that everything which
 * reads an `Understanding`, the transcript and the destructive checks in the held-out sets, sees
 * the same thing the visitor is shown. What makes this different from any other reading is that
 * `alternatives` isn't empty, and `converse` offers instead of acting.
 *
 * The lexical reading heads the list when there's one. It's frequently right about a fragment
 * the model can't place, such as a misspelling or a two-word answer, and putting it first costs
 * nothing when it's wrong, because the whole point here is that nothing is being done.
 *
 * An intent that destroys work is dropped from the offer unless it cleared the destructive gate
 * on its own. A chip IS the confirmation, so a strong reading of "scrap the lot" is fair to
 * offer. A 0.30 reading of it is a button that forgets the whole design, put there by a router
 * that has just admitted it doesn't know what was said
 */
const unsure = (
  text: string,
  ranked: readonly Ranked[],
  lexical: Understanding | null,
): Understanding | null => {
  const offered = ranked
    .filter((entry) => !isDestructive(entry.id) || entry.score >= DESTRUCTIVE_EMBEDDING_GATE)
    .slice(0, OFFERED)
    .map((entry) => entry.id)
  const alternatives = [
    ...(lexical === null ? [] : [lexical.intent]),
    ...offered.filter((id) => id !== lexical?.intent),
  ].slice(0, OFFERED)
  const first = alternatives[0]
  // nothing left worth offering, which is a blank look and already has an answer
  if (first === undefined) return lexical
  return {
    intent: first,
    confidence: ranked.find((entry) => entry.id === first)?.score ?? lexical?.confidence ?? 0,
    slots: lexical?.slots ?? EMPTY_SLOTS,
    matched: lexical?.matched ?? text,
    spoken: ranked.find((entry) => entry.id === first)?.score ?? lexical?.spoken ?? 0,
    alternatives,
  }
}

/** The intents whose whole content is a crop name, which is a closed list rather than a guess */
const CROP_PREFERENCE: readonly IntentId[] = ['like-crop', 'dislike-crop']

/** The question an intent belongs to, or null for the ones a grower may say at any time */
const stepOf = (id: IntentId): OnboardingStep | null =>
  INTENTS.find((intent) => intent.id === id)?.step ?? null

const namesCrops = (understanding: Understanding | null): boolean =>
  understanding !== null &&
  understanding.slots.crops.length > 0 &&
  CROP_PREFERENCE.includes(understanding.intent)

/**
 * Loads the model and embeds every exemplar in the table, once.
 *
 * The whole phrase table is about a hundred and sixty short strings and embedding them takes a
 * few milliseconds, so it's done at load and held: what a query then costs is one embedding plus
 * a hundred and sixty dot products of 384 floats, which is nothing.
 *
 * `allowRemoteModels` is false on purpose. The weights are served from this origin like every
 * other asset, so the agent works offline, adds no third-party request to a page that carefully
 * routes nine upstreams through its own proxy, and can't start depending on a CDN staying up
 */
const load = async (modelPath: string): Promise<Vectors | null> => {
  try {
    const { env, pipeline } = await import('@huggingface/transformers')
    env.allowRemoteModels = false
    env.allowLocalModels = true
    env.localModelPath = modelPath
    // only in a browser: under node the runtime is native and has no wasm path to set
    const wasm = env.backends.onnx.wasm
    if (typeof window !== 'undefined' && wasm !== undefined) wasm.wasmPaths = RUNTIME_PATH
    const extract = await pipeline('feature-extraction', MODEL_ID, { dtype: 'q8' })
    const embed = async (text: string): Promise<Float32Array> => {
      const out = await extract([text], { pooling: 'mean', normalize: true })
      return Float32Array.from(out.data as ArrayLike<number>)
    }
    const entries = INTENTS.flatMap((intent) =>
      intent.phrases.map((phrase) => ({ id: intent.id, phrase })),
    )
    const out = await extract(
      entries.map((entry) => entry.phrase),
      { pooling: 'mean', normalize: true },
    )
    const width = out.dims[1] ?? 0
    const flat = out.data as ArrayLike<number>
    const phrases = entries.map((entry, index) => ({
      id: entry.id,
      vector: Float32Array.from({ length: width }, (_unused, at) => flat[index * width + at] ?? 0),
    }))
    return { phrases, embed }
  } catch {
    // a missing model is an ordinary state for the app: the lexical router does the work.
    // `bun run fetch-agent-model` is what puts the weights in `public/models`
    return null
  }
}

export interface EmbeddingOptions {
  /** Injected so the strategy can be measured without a model, and swapped in a test */
  readonly loader?: () => Promise<Vectors | null>
  /**
   * Where the weights live. `/models` in a browser, where it's a URL served from this origin.
   * A filesystem path under node, which is how the accuracy tests reach the real model
   */
  readonly modelPath?: string
}

/**
 * The split that measured best: a pending question belongs to the lexical router, and everything
 * said out of the blue belongs to the embedding.
 *
 * Not a confidence gate between two general-purpose routers, because they're not general purpose
 * in the same places. The lexical one is exact on bare fragments ANSWERING a question that is on
 * screen: "6 by 4", "yes", "overhead". It reads 100% there, and those are precisely the
 * sentences an embedding is worst at, because a two-word fragment carries almost no semantics of
 * its own and its whole meaning is in the question standing behind it. Away from that the
 * position reverses.
 *
 * The lexical router owns a sentence only when it ANSWERS the pending question: see `route` for why
 */
export const createEmbeddingUnderstander = (options: EmbeddingOptions = {}): Understander => {
  let vectors: Vectors | null = null
  let attempted = false
  const loader = options.loader ?? (() => load(options.modelPath ?? MODEL_PATH))

  return {
    kind: 'embedding',
    ready: async () => {
      if (!attempted) {
        attempted = true
        vectors = await loader()
      }
      return vectors !== null
    },
    route: async (text, context) => {
      const lexical = routeLexically(text, context)
      /*
        The lexical router keeps the sentence only when it ANSWERED the pending question, a
        stricter test than one merely being pending.

        Testing `context.step !== null` reads correctly and is useless: the panel takes the pending
        question from `onboarding.step`, which starts at `location` and is never null, so the
        embedding would never be consulted at all. The model would load, the weights would be
        served, every request would succeed, and the agent would silently run on the lexical router,
        which is the worst kind of failure, because everything looks like it worked. "Give me a
        month by month plan" would go to the geocoder and "summarize it for me" would start a
        five-bake design search
      */
      const answered =
        lexical !== null &&
        context.step !== null &&
        INTENTS.find((intent) => intent.id === lexical.intent)?.step === context.step
      /*
        And only when it MATCHED, rather than when it fell back.

        And only when the sentence is a bare fragment, or the lexical match is strong on its own
        words. `confidence` is the wrong test and was tried: `STEP_BIAS` lifts a 0.43 match on the
        place intent to 0.58, which beats a correct 0.50 on the agenda and reads as a strong
        answer, so "give me a month by month plan" was sent to the geocoder. `spoken` is that
        number before the bias, which is the evidence rather than the verdict.
        Fragment length alone was tried too and cost eight points: "things I can put in a stew" is
        six words and is still an answer to the question about what to grow
      */
      /*
        A near-verbatim phrase hit is never second-guessed. "Why not tomatoes" contains the
        `explain` exemplar "why not" outright and scores 1.00. The embedding read it as an
        ambition at 0.50, because it mentions tomatoes, and overrode a certainty with a guess.
        The bar is high on purpose: "summarize it for me" reaches 0.70 against "make me a
        garden" and that IS worth second-guessing, and is duly fixed by meaning
      */
      if ((lexical?.spoken ?? 0) >= LEXICAL_CERTAIN) return lexical
      if (answered && (isFragment(text) || (lexical?.spoken ?? 0) >= CONFIDENT_MATCH)) {
        return lexical
      }
      if (vectors === null) return lexical
      const query = await vectors.embed(text)
      /*
        The slots are still read by the lexical code. The embedding decides WHICH intent and has
        no idea what is inside the sentence, so a crop named in something routed by cosine
        similarity is found by exactly the same catalog lookup.

        `understandingFor` returns null for a reading this sentence can't fill, and that is a
        hard constraint rather than a low score: "i want tomatoes and courgettes" reads as an
        ambition at 0.458 and a crop preference at 0.363, but there's no ambition anywhere in it
        to record, so the ambition isn't a candidate at all. Filtering BEFORE the margin is taken
        rather than after is the whole of it -- taken after, every plain crop request looked like
        a tie against a reading that could never have been carried out
      */
      const ranked = rankIntents(query, vectors, isNegated(text))
      const best = ranked[0]
      const runnerUp = ranked[1]
      if (best === undefined) return lexical
      const reading = understandingFor(
        best.id,
        text,
        context,
        best.score,
        DESTRUCTIVE_EMBEDDING_GATE,
      )
      /*
        A crop named out of the catalog isn't an ambiguity, whatever the gap behind it says.

        "I want tomatoes and courgettes" reads as an ambition at 0.507 and a crop preference at
        0.451, and there's no ambition anywhere in the sentence to record. "i want beans" puts
        four hundredths between the two. Both are the commonest thing anybody types here and both
        were answered with three chips. An exact hit on one of a hundred and sixty-three names is
        evidence of a different kind from a cosine gap, as `LEXICAL_CERTAIN` already argues, so
        where the phrase table has crops by name and read them as a preference, and the model
        either agrees or has produced a reading this sentence can't fill, the names win.

        Or a reading that belongs to a question nobody is being asked. A list of crops IS an
        answer to "what do you want to grow", and `slotFilled` says so on purpose, so the model
        reading "i want tomatoes" as an ambition at 0.507 against a preference at 0.451 isn't
        wrong so much as answering a question that is not on screen. Away from that question the
        same words are a preference, which is what `Intent.step` has always meant
      */
      const belongsToAnotherQuestion = stepOf(best.id) !== null && stepOf(best.id) !== context.step
      if (
        namesCrops(lexical) &&
        (reading === null || best.id === lexical?.intent || belongsToAnotherQuestion)
      ) {
        return lexical
      }
      /*
        Two ways of not knowing, and both of them ask rather than settling for the phrase table.

        Falling back to `lexical` here is the wrong move for the same reason the confidence split
        was: the sentences the model has no opinion about are overwhelmingly the ones the phrase
        table gets wrong too, so the fallback mostly converts "no idea" into a confident mistake.
        Measured across all three held-out sets, asking instead took precision from 97/81/87% to
        100/86/100%.

        Agreement between the two routers was tried as a way of settling a thin margin, on the
        reasoning that two methods sharing no machinery are better evidence than one. It isn't:
        it cost a point on every set at once, because the sentences where a bigram match agrees
        with a torn model are the ones where both are reading the same misleading surface
      */
      if (best.score < EMBEDDING_GATE) return unsure(text, ranked, lexical)
      if (best.score - (runnerUp?.score ?? 0) < AMBIGUOUS_MARGIN) {
        return unsure(text, ranked, lexical)
      }
      // and a reading the sentence can't fill falls back, which is what the slot check is for
      return reading ?? lexical
    },
  }
}

/**
 * How long a sentence may be and still be a bare answer to the question on screen.
 *
 * The lexical router owns fragments because an embedding is worst on them: "6 by 4", "yes",
 * "overhead" carry almost no semantics of their own and all of their meaning is in the question
 * behind them. It stops owning them somewhere around here: "give me a month by month plan" is
 * seven words, is plainly not an answer to "where is the space", and was being handed to the
 * geocoder because `STEP_BIAS` lifted a 0.43 match on the place intent above a correct 0.50 on
 * the agenda. Four is where the held-out set stops improving
 */
export const FRAGMENT_WORDS = 4

/**
 * Above this the lexical reading is a certainty rather than a resemblance, and the model isn't
 * consulted at all.
 *
 * Effectively "the sentence contains one of the exemplars outright": Dice over character bigrams
 * only reaches this when almost every bigram is shared. Below it a strong-looking score is still
 * a guess and worth checking: 0.70 for "summarize it for me" against "make me a garden"
 */
export const LEXICAL_CERTAIN = 0.9

const isFragment = (text: string): boolean => tokens(text).length <= FRAGMENT_WORDS

/** Whether a lexical reading is strong enough that the embedding isn't consulted at all */
export const isConfidentLexical = (understanding: Understanding | null): boolean =>
  understanding !== null && understanding.confidence >= CONFIDENT_MATCH
