import type { CropId } from '../types/ids'
import { INTENTS, isDestructive, isIrreversible, type Intent, type IntentId } from './intent'
import { bestMatch, containedPhrases, normalize, similarity, tokens } from './text'
import {
  AFFIRMATIVE,
  AMBITION,
  cropVocabulary,
  EXPOSURE,
  lengths,
  MOUNTING,
  NEGATIVE,
  cropsByHead,
  OBJECTIVE,
  PANEL_CHANGE,
  SCOPE,
  isSocial,
  socialSort,
  isWhQuestion,
  scopeSubjectIn,
  type ScopeTopic,
  singularize,
  slotVocabulary,
  type Candidate,
} from './vocabulary'
import {
  EMPTY_SLOTS,
  type RouteContext,
  type Slots,
  type Understander,
  type Understanding,
} from './understand'

/**
 * The understander that downloads nothing.
 *
 * It exists for two reasons and the second is the important one. It's the whole agent on a
 * phone that hasn't fetched, or can't fetch, the 23 MB of MiniLM. And it's the FALLBACK
 * underneath the one that has, because weights fail to load, browsers run out of memory and
 * people open this on airplanes. An agent whose only understander is the optional one is an
 * agent that is sometimes not there
 *
 * What it is: Dice similarity over character bigrams against `INTENTS`, biased by which question
 * is on screen, with slots filled by literal containment. What it isn't: anything that
 * generalizes. "I would prefer to cultivate leafy brassicas" scores near zero here and matches
 * cleanly under embeddings, and that difference is precisely what the 23 MB buys
 */

/**
 * How far the query has to score before an intent is claimed at all.
 *
 * Tuned to refuse rather than to guess. Below this the panel asks "did you mean one of these?"
 * with the top few as chips, which is a better failure than confidently answering the wrong
 * question, and is the failure a five year old recovers from without reading anything
 */
export const CONFIDENCE_FLOOR = 0.34

/**
 * What standing on a question is worth.
 *
 * Multiplicative rather than additive so it can never drag an intent that scored nothing up over
 * the floor: it sharpens a real contest between two plausible readings and doesn't manufacture
 * one. The number is the smallest that reliably separates "two meters" answering the height
 * question from the same words answering the plot-size question
 */
export const STEP_BIAS = 1.35

/*
  There's deliberately NO penalty for belonging to a different question.

  A penalty does active harm: a grower answering a question the agent hasn't got to yet is
  penalized for it. At 0.8, "6 by 4" said at the question about the PLACE scores an honest 0.36, is
  cut to 0.29, falls below the floor, and lands in the location fallback, which sends "6 by 4" to
  the geocoder and records whatever comes back as where the garden is.

  Volunteering an answer early is a thing people do constantly, and it must cost nothing.
  Removing it leaves both corpora at 98%, so the sharpening it was doing is now done elsewhere
*/

/** What the question on screen is willing to vouch for a bare "yes" or "no" at */
export const BARE_ANSWER_SCORE = 0.75

const NEGATORS: readonly string[] = [
  'not',
  'no',
  'dont',
  'do not',
  'never',
  'without',
  'hate',
  'cannot',
  'cant',
  'avoid',
  'leave out',
  'except',
]

/** Whether the sentence is a refusal, which is the difference between liking and disliking a crop */
export const isNegated = (text: string): boolean => {
  const padded = ` ${normalize(text)} `
  return NEGATORS.some((word) => padded.includes(` ${normalize(word)} `))
}

const yesNoOf = (text: string): boolean | null => {
  const affirmative = bestMatch(
    text,
    AFFIRMATIVE.map((phrase) => ({ value: true, phrases: [phrase] })),
    0.6,
  )
  const negative = bestMatch(
    text,
    NEGATIVE.map((phrase) => ({ value: false, phrases: [phrase] })),
    0.6,
  )
  if (affirmative === null && negative === null) return isNegated(text) ? false : null
  if (negative === null) return true
  if (affirmative === null) return false
  return affirmative.score >= negative.score
}

const pick = <T>(text: string, candidates: readonly Candidate<T>[]): T | null => {
  const contained = containedPhrases(text, candidates)
  const first = contained[0]
  if (first !== undefined) return first.value
  return bestMatch(text, candidates, CONFIDENCE_FLOOR)?.value ?? null
}

/**
 * The crops named in a sentence, by literal containment first and one fuzzy match after.
 *
 * Containment before fuzziness, because the catalog has 182 entries
 * and several of them are two bigrams apart: "swede" and "sweetcorn", "pea" and "pear". A literal
 * hit is certain and a fuzzy one is a guess, so every certainty is taken before any guess is
 * considered, and the guess is only allowed to run when the sentence produced no certainties at
 * all. That's what makes "tomatos" work without making "pea" mean pear
 */
interface CropsFound {
  readonly ids: readonly CropId[]
  readonly certain: boolean
  /**
   * The words of the sentence this consumed, as typed rather than as spelled in the catalog.
   *
   * Reported because the matcher is the only thing that knows: "courgetes" is claimed by
   * `courgette` through a near-spelling, and anything downstream comparing the sentence against
   * catalog names would see an unmatched word. `isOnlyCropNames` asks exactly that question
   */
  readonly words: ReadonlySet<string>
}

const cropsIn = (text: string, catalog: RouteContext['catalog']): CropsFound => {
  const vocabulary = cropVocabulary(catalog)
  // singularized first, because people type plurals and nothing in the catalog is plural
  const said = singularize(text)

  /*
    Three passes, and the UNION of them rather than the first that hits.

    Returning early on containment was the obvious shape and it silently halved a common
    sentence: "tomatos and courgetes" contains "tomato" exactly, so the search stopped there and
    the misspelled half was dropped without a word. A list of crops is a list, and the reader has
    to survive one of them being typed correctly
  */
  /*
    Each pass only sees the words the one before it didn't take, which is what keeps a precise
    name precise. "Runner beans" is an exact match on `runner bean`, and letting the head-noun
    pass then read the word "bean" again turned it into all five beans: a grower who named the
    one they wanted being handed the whole family
  */
  const hits = containedPhrases(said, vocabulary)
  const contained = hits.map((hit) => hit.value)
  const taken = new Set(hits.flatMap((hit) => tokens(singularize(hit.matched))))

  // the head noun, which is what makes the commonest garden words work at all: the catalog is
  // botanically precise and so has no "bean", "onion" or "pea". See `cropsByHead`
  const byHead = cropsByHead(catalog)
  const heads = tokens(said).flatMap((word) => (taken.has(word) ? [] : (byHead.get(word) ?? [])))
  for (const word of tokens(said)) if (byHead.has(word)) taken.add(word)

  // and word by word, at a near-spelling bar, which is what survives a phone keyboard
  const perWord = tokens(said).flatMap((word) => {
    if (word.length < 4 || taken.has(word)) return []
    const hit = bestMatch(word, vocabulary, PER_WORD_CROP)
    if (hit === null) return []
    taken.add(word)
    return [hit.value]
  })

  const certain = [...new Set([...contained, ...heads, ...perWord])]
  if (certain.length > 0) return { ids: certain, certain: true, words: taken }
  const fuzzy = bestMatch(said, vocabulary, 0.62)
  return fuzzy === null
    ? { ids: [], certain: false, words: new Set() }
    : { ids: [fuzzy.value], certain: false, words: new Set() }
}

/**
 * How close a single WORD has to be to a crop name before it's taken as one.
 *
 * Much higher than the whole-sentence bar, and it has to be: a lone word compared against nearly
 * five hundred catalog names will always find something, so the only safe version of this is one
 * that demands a near-spelling. "Tomatos" scores 0.92 against tomato and "courgetes" 0.93 against
 * courgette. Four letters is the floor because below that almost anything matches
 */
export const PER_WORD_CROP = 0.85

/**
 * The readings of a sentence that don't depend on which intent is being considered.
 *
 * Read once, outside the per-intent loop, because they would be the loop's whole cost: crop
 * matching alone sweeps ~480 catalog phrases, and inside the loop it would run once per candidate
 * intent for every typed sentence. The reading of a sentence is a property of the sentence
 */
interface Reading {
  readonly meters: readonly number[]
  readonly crops: readonly CropId[]
  /**
   * Whether the crops were NAMED or merely resembled.
   *
   * The distinction decides a real contest. "Runner beans" scores 0.37 against the exemplar
   * "fruit and berries", on nothing but the bigrams that "beans" and "berries" happen to share,
   * and 0.37 clears the floor. A crop found by name in the catalog is a fact and a 0.37
   * resemblance is a coincidence, so the two must not be weighed on the same scale
   */
  readonly cropsAreCertain: boolean
  /**
   * The unmodeled topic this sentence NAMES, by noun, or null.
   *
   * Kept apart from `Slots.scope`, which may also be filled by a fuzzy match against the exemplar
   * sentences. Only the noun is strong enough to vouch for the intent on its own: letting a 0.34
   * resemblance do it took two other corpora from 100% to 90%, because "how come the peppers are
   * not in there" resembles "my ground is chalky" about as much as anything resembles anything
   */
  readonly scope: ScopeTopic | null
  /** The words the crop matcher consumed, as typed. See `CropsFound.words` */
  readonly cropWords: ReadonlySet<string>
}

const readingOf = (text: string, context: RouteContext): Reading => {
  const found = cropsIn(text, context.catalog)
  return {
    meters: lengths(text),
    crops: found.ids,
    cropsAreCertain: found.certain,
    scope: scopeSubjectIn(text),
    cropWords: found.words,
  }
}

/**
 * How well the intent's OWN phrases matched, above which a sentence counts as having answered a
 * yes-or-no question without containing a yes or a no.
 *
 * "I have a hose" is an unambiguous yes to "can you water it in a dry spell", and it holds
 * neither word. `set-water` matched it exactly, at 1.00, and was then dropped for having an
 * unfilled slot, so the sentence went to `describe-garden` at 0.57. The polarity comes from
 * `isNegated`, which is what already separates "I have a hose" from "no water out there"
 */
export const SPOKEN_ANSWER = 0.6

const fillSlots = (intent: Intent, text: string, reading: Reading, spoken: number): Slots => {
  const { meters, crops } = reading
  switch (intent.slot) {
    case 'place':
      return { ...EMPTY_SLOTS, place: placeIn(text) }
    case 'dimensions':
      return { ...EMPTY_SLOTS, widthM: meters[0] ?? null, depthM: meters[1] ?? null }
    case 'length':
      return { ...EMPTY_SLOTS, lengthM: meters[0] ?? null, yesNo: yesNoOf(text) }
    case 'exposure':
      return { ...EMPTY_SLOTS, exposure: pick(text, EXPOSURE) }
    case 'ambition':
      return { ...EMPTY_SLOTS, ambition: pick(text, AMBITION), crops }
    case 'objective':
      return { ...EMPTY_SLOTS, objective: pick(text, OBJECTIVE) }
    case 'mounting':
      return { ...EMPTY_SLOTS, mounting: pick(text, MOUNTING) }
    case 'yes-no':
      return {
        ...EMPTY_SLOTS,
        yesNo: yesNoOf(text) ?? (spoken >= SPOKEN_ANSWER ? !isNegated(text) : null),
      }
    case 'crops':
      return { ...EMPTY_SLOTS, crops }
    case 'subject':
      return { ...EMPTY_SLOTS, subject: text.trim(), crops }
    case 'scope':
      // the noun first, because what a question is ABOUT is far more reliable than its shape
      return {
        ...EMPTY_SLOTS,
        scope: scopeSubjectIn(text) ?? pick(text, SCOPE),
        subject: text.trim(),
      }
    case 'panels':
      return { ...EMPTY_SLOTS, panels: pick(text, PANEL_CHANGE), lengthM: meters[0] ?? null }
    case 'archetype':
      return { ...EMPTY_SLOTS, subject: text.trim() }
    case 'none':
      return EMPTY_SLOTS
  }
}

/**
 * The place name, as the words after whichever lead-in was used.
 *
 * Deliberately crude, and deliberately generous: whatever is left is handed to the geocoder,
 * which is the thing that actually knows what a place is and which already refuses politely.
 * Guessing harder here would only add a second opinion about place names to an app that has one
 */
const placeIn = (text: string): string | null => {
  const cleaned = text.trim()
  if (cleaned === '') return null
  const lead =
    /^(?:i (?:live|am) in|my garden is in|the site is at|set the location to|it is in)\s+/i
  const stripped = cleaned.replace(lead, '').trim()
  return stripped === '' ? null : stripped
}

/**
 * Whether a slot came back filled, which is what stops an intent being claimed on the strength of
 * a stray preposition.
 *
 * "in" scores respectably against "i live in" and against nothing else in the table, so without
 * this a bare "in" resolves to `set-place` with an empty place and the agent asks the geocoder
 * about nothing. An intent that needs a slot and didn't get one isn't that intent
 */
const slotFilled = (intent: Intent, slots: Slots, spoken: number): boolean => {
  /*
    A sentence that unmistakably answers a question but carries no VALUE still belongs to that
    question. "Keep it low please" is a height limit with no number in it and "it's about the size
    of a parking space" is a plot size with no number in it. Both were dropped for an empty slot and
    fell through to the location catch-all, which would have handed them to the geocoder. Letting
    them stand means the agent replies "roughly how many meters?", which is the answer
  */
  const asked = spoken >= SPOKEN_ANSWER
  switch (intent.slot) {
    case 'none':
      return true
    case 'place':
      return slots.place !== null
    case 'dimensions':
      return slots.widthM !== null || asked
    case 'length':
      return slots.lengthM !== null || slots.yesNo === false || asked
    case 'exposure':
      return slots.exposure !== null
    case 'ambition':
      return slots.ambition !== null || slots.crops.length > 0
    case 'objective':
      return slots.objective !== null
    case 'mounting':
      return slots.mounting !== null
    case 'yes-no':
      return slots.yesNo !== null
    case 'crops':
      return slots.crops.length > 0
    case 'subject':
    case 'archetype':
      return slots.subject !== null
    case 'scope':
      // only when the sentence actually names something out of scope, so this can never become a
      // catch-all that declines everything it doesn't recognize
      return slots.scope !== null
    case 'panels':
      return slots.panels !== null
  }
}

/** Re-reports a reading at a different strength, leaving everything else about it alone */
const spoken = (scored: Scored | undefined, strength: number): Scored | undefined =>
  scored === undefined ? undefined : { ...scored, spoken: strength }

interface Scored {
  readonly intent: Intent
  readonly score: number
  readonly matched: string
  readonly slots: Slots
  /** How well the intent's OWN phrases matched, before any bias: what `slotFilled` reads */
  readonly spoken: number
}

/**
 * Every intent scored, destructive ones included.
 *
 * `scoreIntents` below drops those below `DESTRUCTIVE_FLOOR`. This doesn't, so that two things
 * can ask what was NEARLY meant: `suspectedDestructive`, and `nearMisses`, which offers them as
 * chips. Offering isn't acting, and a chip reading "Start over" is a clearer confirmation than
 * any dialog would be
 */
const scoreAll = (text: string, context: RouteContext, reading: Reading): readonly Scored[] => {
  return (
    INTENTS.map((intent) => {
      const onThisQuestion = intent.step !== null && intent.step === context.step
      /*
      Scored against its own exemplars, and ALSO against the vocabulary its slot draws answers
      from, but only while that slot's own question is the one being asked.

      The narrowing is a measured correction. Scoring the vocabulary at every
      moment took the corpus from 93% to 89%, because `AMBITION` legitimately contains crop names:
      "tomatoes" and "strawberries" are how people describe a fruiting ambition. That made every
      mention of a tomato outrank the intent to plant one. The evidence is real and it's only
      evidence while the question it answers is on the table.

      See `slotVocabulary` for the three slots left out of this altogether
    */
      const vocabulary = onThisQuestion
        ? slotVocabulary(intent.slot).map((option) => ({
            value: intent.id,
            phrases: option.phrases,
          }))
        : []
      const hit = bestMatch(text, [{ value: intent.id, phrases: intent.phrases }, ...vocabulary], 0)
      const bias = onThisQuestion ? STEP_BIAS : 1
      const slots = fillSlots(intent, text, reading, hit?.score ?? 0)
      /*
      A bare "yes" carries no meaning of its own: all of its meaning is in the question it is
      answering, and the question is on screen. No phrase in the table can cover this, because
      the phrase that would cover it is the question rather than the answer, so the question
      being asked is allowed to vouch for a plain affirmative or refusal directly.

      A floor and not an override: something that scores higher on its own words still wins, which
      is what keeps "I do not want tomatoes" a refusal of tomatoes rather than a no to the tap
    */
      const answersTheQuestion =
        intent.step !== null && intent.step === context.step && intent.slot === 'yes-no'
      /*
        A sentence that NAMES something this app doesn't model is about that thing, whatever
        shape the question takes. `scopeSubjectIn` reads the noun, and a noun is far more reliable
        evidence than a sentence pattern for a category whose members have nothing in common as
        sentences: "how many years until it pays for itself", "what stops squirrels getting at
        it" and "is the earth here any good" share no structure and are all one topic each
      */
      const namesSomethingUnmodeled = intent.id === 'out-of-scope' && reading.scope !== null
      const floor =
        (answersTheQuestion && slots.yesNo !== null) || namesSomethingUnmodeled
          ? BARE_ANSWER_SCORE
          : 0
      return {
        intent,
        score: Math.max(floor, Math.min(1, (hit?.score ?? 0) * bias)),
        matched: hit?.matched ?? '',
        slots,
        spoken: hit?.score ?? 0,
      }
    })
      .filter((scored) => slotFilled(scored.intent, scored.slots, scored.spoken))
      /*
      A WH-question never changes the garden. "How come there's no tomatoes" names a crop and
      holds a negator, so it reached `dislike-crop` and the agent recorded that the grower would
      rather not have tomatoes, when they had asked why there were none. Recording the opposite
      of what somebody asked, silently, is the worst reading this router can produce.

      Every intent that changes something is off the table: "when do i plant the tomatoes" and "what
      should i do this month" would otherwise reach `plan-planting` and be answered by replanting
      every bed
    */
      .filter((scored) => !isWhQuestion(text) || !isDestructive(scored.intent.id))
      /*
      Ties break toward the reading that accounts for MORE of what was said.

      "I want to help the bees" matches `set-pollinators`' exemplar exactly, at 1.00, and also
      matches `help`'s single-word exemplar exactly, at 1.00, because a one-word phrase found
      inside a six-word sentence scores full marks. Both are perfect and only one of them is an
      account of the sentence. Falling back on the table's order sent somebody asking about bees
      to a page about what the agent can do.

      Length of the matched phrase, because what is being compared is how
      much each READING explains
    */
      .sort((a, b) => b.score - a.score || b.matched.length - a.matched.length)
  )
}

/**
 * `nearMisses`, further down: the intents the router nearly chose, for the panel to offer as chips
 * when it chose nothing.
 *
 * Offering the near misses is the entire recovery path for a router with no generative model
 * behind it. "Did you mean: what can I grow? / design it for me?" turns a failure into two taps,
 * and two taps is a better novice experience than a paragraph of apology
 */
/**
 * The readings worth acting on: everything, less any destructive intent that wasn't asked for
 * clearly.
 *
 * Dropped rather than demoted, so no fallback can reach one either: the question on screen must
 * not be able to vouch for `undo`, and neither must a crop name
 */
const scoreIntents = (text: string, context: RouteContext, reading: Reading): readonly Scored[] =>
  scoreAll(text, context, reading).filter(
    (scored) => !isDestructive(scored.intent.id) || scored.score >= floorFor(scored.intent.id),
  )

export const nearMisses = (text: string, context: RouteContext, count = 3): readonly IntentId[] =>
  // `scoreAll`, so that a suspected destructive request comes back as something to press
  scoreAll(text, context, readingOf(text, context))
    .filter((scored) => scored.score > 0.12)
    .slice(0, count)
    .map((scored) => scored.intent.id)

/**
 * The reading nothing scored well enough for, when the agent is standing on a question this
 * sentence could answer.
 *
 * This is slot filling, and it's what turns the surface from a demo into something usable. The
 * agent asks "tell me a town", the visitor types "Amherst, Massachusetts", and that scores 0.00
 * against every exemplar in the table because it resembles none of them: it's a place name.
 * Refusing it is absurd, and it's the most likely first thing anybody types.
 *
 * Narrow rather than a catch-all, in two ways. `ranked` has already dropped every intent whose
 * slot this sentence couldn't fill, so nothing is accepted that has no answer in it. Only
 * the intent belonging to the question actually being asked is eligible, so an unparseable
 * sentence at a moment when nothing was asked is still met with "I didn't follow that".
 *
 * The confidence it comes back with is deliberately low. It's a fallback reading and the panel
 * is entitled to know that, even though nothing acts on it today
 */
export const ANSWERING_SCORE = 0.3

const answerToTheQuestion = (
  ranked: readonly Scored[],
  context: RouteContext,
): Scored | undefined => {
  if (context.step === null) return undefined
  const answering = ranked.find((scored) => scored.intent.step === context.step)
  return answering === undefined ? undefined : { ...answering, score: ANSWERING_SCORE }
}

/**
 * Whether the sentence looks like a request to destroy something, without looking like it enough
 * to act on.
 *
 * `DESTRUCTIVE_FLOOR` drops those readings entirely, which is right, and left a hole underneath:
 * "delete my garden" scored 0.60 against "delete it all", was dropped, and the question about the
 * place then claimed it at 0.74, `STEP_BIAS` on a 0.55 match against "my garden is in", so a
 * request to delete a garden was sent to the geocoder and came back with a town.
 *
 * When one is suspected, the catch-all stands down: a sentence that might be asking to delete
 * something must not be quietly read as a place name because a question about places happened to
 * be on screen. Every other reading still applies: refusing everything in the
 * band 0.5 to 0.75 took three corpora from 100% to 78%, because that band is wide and ordinary
 * sentences land in it all the time.
 *
 * The panel then offers the destructive intent as a chip, because `nearMisses` scores everything,
 * and one press is a clearer confirmation than any dialog: the visitor reads "Start over" and
 * decides
 */
const suspectedDestructive = (text: string, context: RouteContext, reading: Reading): boolean =>
  scoreAll(text, context, reading).some(
    (scored) =>
      isDestructive(scored.intent.id) &&
      // the uncertain BAND and nothing above it: a plain "undo" scores 1.00, isn't a
      // suspicion at all, and must still be carried out
      scored.score >= CONFIDENT_MATCH &&
      scored.score < floorFor(scored.intent.id),
  )

/**
 * Words that carry no meaning of their own in a list of crops.
 *
 * Small and closed on purpose. It exists to answer one question, whether this sentence is ONLY
 * crop names, and a longer list would start swallowing the words that make a sentence something
 * other than a list
 */
const LIST_FILLER: ReadonlySet<string> = new Set([
  'and',
  'or',
  'some',
  'a',
  'an',
  'the',
  'plus',
  'also',
  'with',
  'plenty',
  'of',
  'lots',
  'maybe',
  'please',
])

/**
 * Whether the sentence is nothing but crop names and the words that join them.
 *
 * "Tomatoes and courgettes" is a list, and a list of crops means the grower wants those crops
 * whatever else the sentence resembles. Without this it reaches the ambition question, because
 * "tomatoes and courgettes" and "fruit and berries" ARE similar: both are lists of produce,
 * and no amount of phrasing separates them. What separates them is that every content word here
 * is in the catalog
 */
const isOnlyCropNames = (text: string, reading: Reading): boolean => {
  if (reading.crops.length === 0 || !reading.cropsAreCertain) return false
  const content = tokens(singularize(text)).filter((word) => !LIST_FILLER.has(word))
  return content.length > 0 && content.every((word) => reading.cropWords.has(word))
}

/**
 * `cropNamedAlone`, further down: a sentence that names a crop and matches nothing else.
 *
 * "Potatoes". "Squash". "Cabbages". A bare crop name is a whole utterance on a phone, it holds no
 * verb for any exemplar to match, and being met with "I didn't follow that" after naming a
 * vegetable to a gardening application is the kind of answer that ends the conversation.
 *
 * Read second, after a confident phrase match and ahead of the floor and the question on screen,
 * and only where the crops were found by name. `routeLexically` then reads the sign off the
 * sentence as it does for any other crop utterance, so "no cabbages" still means no.
 *
 * Both places this is reached from require the crops to have been found BY NAME. A fuzzy match isn't
 * enough and the sentence that proves it is "salad": nothing in the table answers to it, and the
 * fuzzy pass reached mache, which is corn salad, a real and reasonable nearest neighbor. The
 * agent replied that it had noted the grower would like mache. Nobody said mache
 */
const cropNamedAlone = (ranked: readonly Scored[]): Scored | undefined => {
  const liking = ranked.find((scored) => scored.intent.id === 'like-crop')
  return liking === undefined || liking.slots.crops.length === 0
    ? undefined
    : { ...liking, score: ANSWERING_SCORE }
}

/**
 * Above this, a phrase match is taken as a reading of the sentence rather than a resemblance to
 * one, and nothing is allowed to outrank it.
 *
 * Between this and `CONFIDENCE_FLOOR` sits the band where a crop found BY NAME in the catalog
 * is the better evidence. "Runner beans" reaches 0.37 against "fruit and berries" purely on the
 * bigrams "beans" and "berries" share, and 0.37 clears the floor, so a grower naming the single
 * commonest thing in an English vegetable garden was answered with a question about ambition
 */
export const CONFIDENT_MATCH = 0.5

/**
 * What an intent that destroys work has to score before it's acted on.
 *
 * Far above the ordinary floor, and deliberately so: the cost of being wrong isn't symmetric.
 * Misreading "what can I grow" as "what have I got" wastes a sentence. Misreading "thanks" as
 * `undo` throws away a garden somebody has just spent ten turns describing, and no apology
 * recovers it. So `undo`, `plan-planting` and `apply-design` are reachable only by something that
 * really does look like a request for them.
 *
 * A threshold, because a confirmation prompt on every one of these would train
 * the exact reflex it exists to prevent: three taps of "yes, do it" and the fourth is automatic.
 * What this does instead is refuse quietly and offer the intent as a chip, which is one press and
 * is unambiguous about what is being asked for
 */
export const DESTRUCTIVE_FLOOR = 0.75

/**
 * And what the irreversible one has to clear, which is very nearly a verbatim match.
 *
 * `start-over` forgets the design: nothing brings it back. "Scratch that" is a sentence any reader
 * takes as undoing the last thing and it reached this intent, because "scratch that" and "start
 * over" are close as sentences and nowhere near each other in what they cost. At this bar only
 * something that really does say start over gets there, and anything less becomes a chip
 */
export const IRREVERSIBLE_FLOOR = 0.92

export const floorFor = (id: IntentId): number =>
  isIrreversible(id) ? IRREVERSIBLE_FLOOR : DESTRUCTIVE_FLOOR

/**
 * An `Understanding` for an intent somebody else picked.
 *
 * The embedding understander decides WHICH intent a sentence meant and has no idea what is in it.
 * The slots are still read by the same code that reads them for the lexical path, so a crop named
 * in a sentence routed by cosine similarity is found by exactly the same catalog lookup. It
 * returns null when the chosen intent has no answer in the sentence at all, which is how a
 * confident but useless match is refused
 */
export const understandingFor = (
  id: IntentId,
  text: string,
  context: RouteContext,
  confidence: number,
  /**
   * The bar a destructive intent has to clear, on the CALLER's scale.
   *
   * Passed in rather than read from `DESTRUCTIVE_FLOOR`, because Dice over character bigrams and
   * cosine over sentence embeddings aren't the same scale and can't share a threshold. A Dice
   * of 0.48 is a coincidence. A cosine of 0.48 against "take out the" is a firm reading, and
   * holding the embedding to the lexical figure meant "pull out the courgettes" could never
   * reach `remove-planting` at all
   */
  destructiveFloor: number = DESTRUCTIVE_FLOOR,
): Understanding | null => {
  const intent = INTENTS.find((entry) => entry.id === id)
  if (intent === undefined) return null
  const reading = readingOf(text, context)
  const hit = bestMatch(text, [{ value: id, phrases: intent.phrases }], 0)
  const slots = fillSlots(intent, text, reading, hit?.score ?? 0)
  if (!slotFilled(intent, slots, hit?.score ?? 0)) return null
  /*
    A WH-question is never an instruction, and this is where both routers pass through.

    A played session asked "when do i plant the tomatoes" and "what should i do this month" and
    was answered, both times, by REPLANTING every bed: `plan-planting` shares its whole vocabulary
    with the questions people ask about planting, and the reply that came back was the planting
    report rather than a calendar. Nothing on screen said the garden had just been rewritten.

    Somebody who opens with "what" or "when" is asking, and every intent that changes the garden is
    off the table for the whole sentence
  */
  if (isWhQuestion(text) && isDestructive(id)) return null
  // the irreversible one keeps its own bar whatever scale the caller is working on, expressed as
  // the same ratio to the caller's floor that `IRREVERSIBLE_FLOOR` is to `DESTRUCTIVE_FLOOR`
  const bar = isIrreversible(id)
    ? destructiveFloor * (IRREVERSIBLE_FLOOR / DESTRUCTIVE_FLOOR)
    : destructiveFloor
  if (isDestructive(id) && confidence < bar) return null
  const negated = isNegated(text)
  const resolved: IntentId =
    id === 'like-crop' && negated
      ? 'dislike-crop'
      : id === 'dislike-crop' && !negated
        ? 'like-crop'
        : id
  return {
    intent: resolved,
    confidence,
    slots,
    matched: hit?.matched ?? '',
    spoken: confidence,
    // the phrase table has no runner-up to weigh: only the embedding can be unsure
    alternatives: [],
  }
}

export const createLexicalUnderstander = (): Understander => ({
  kind: 'lexical',
  ready: () => Promise.resolve(true),
  route: (text, context) => Promise.resolve(routeLexically(text, context)),
})

export const routeLexically = (text: string, context: RouteContext): Understanding | null => {
  if (normalize(text) === '') return null
  /*
    Pleasantries first, before anything else can read them as an answer. The question about the
    place accepts any text as a possible place name, so a session that opened with "hiya" sent a
    greeting to the geocoder. A "ta" at the end of the same session was met with "I didn't follow
    that". Neither is about the garden and both deserve better than either
  */
  if (isSocial(text)) {
    return {
      intent: 'greeting',
      confidence: 1,
      // the pleasantry itself, so the reply can answer the one that was actually said
      slots: { ...EMPTY_SLOTS, subject: socialSort(text) },
      matched: normalize(text),
      spoken: 1,
      alternatives: [],
    }
  }
  const reading = readingOf(text, context)
  const ranked = scoreIntents(text, context, reading)
  const top = ranked[0]
  /*
    Read in order of how much each reading is actually worth, rather than by score alone:

      1. a phrase match confident enough to stand on its own
      2. a crop found BY NAME, which beats any merely marginal phrase match
      3. a phrase match that clears the floor
      4. the answer to the question the agent is standing on
  */
  const confident = top !== undefined && top.score >= CONFIDENT_MATCH
  /*
    A sentence that is nothing but crop names outranks everything, EXCEPT the question on screen.

    At the question about what to grow, a bare crop name is an answer to it: "tomatoes" means a
    fruiting ambition, and that reading has to survive. So the rule stands down whenever the
    pending question has a candidate at all, which is the precedence every other fallback here
    follows. See `isOnlyCropNames`
  */
  const pendingHasACandidate =
    context.step !== null && ranked.some((scored) => scored.intent.step === context.step)
  const listOfCrops = !pendingHasACandidate && isOnlyCropNames(text, reading)
  const chosen = listOfCrops
    ? /*
        Reported as a CERTAINTY rather than as the weak fallback `cropNamedAlone` normally is.
        Every content word in the sentence is a catalog name, which is about as sure as this
        router gets, and `embedding.ts` reads `spoken` to decide whether to second-guess a
        reading: without this the model overrode "tomatos and courgetes" with the ambition
        question, on the entirely reasonable ground that both are lists of produce
      */
      spoken(cropNamedAlone(ranked), 1)
    : confident
      ? top
      : ((reading.cropsAreCertain ? cropNamedAlone(ranked) : undefined) ??
        (top !== undefined && top.score >= CONFIDENCE_FLOOR ? top : undefined) ??
        (suspectedDestructive(text, context, reading)
          ? undefined
          : answerToTheQuestion(ranked, context)) ??
        (reading.cropsAreCertain ? cropNamedAlone(ranked) : undefined))
  if (chosen === undefined) return null
  /*
    Liking and disliking are one intent with a sign, so the SENTENCE decides the sign and the
    scores decide nothing about it, in both directions.

    "i want beans" can score fractionally better against `dislike-crop`'s "i do not want" than
    against `like-crop`'s "i want to grow". The phrase tables can't settle that reliably, because
    the two intents share their whole vocabulary: what separates them is a negator, which
    `isNegated` already finds
  */
  const negated = isNegated(text)
  const id: IntentId =
    chosen.intent.id === 'like-crop' && negated
      ? 'dislike-crop'
      : chosen.intent.id === 'dislike-crop' && !negated
        ? 'like-crop'
        : chosen.intent.id
  return {
    intent: id,
    confidence: chosen.score,
    slots: chosen.slots,
    matched: chosen.matched,
    spoken: chosen.spoken,
    alternatives: [],
  }
}

export { similarity }
