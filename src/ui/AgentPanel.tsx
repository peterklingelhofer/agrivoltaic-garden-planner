import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactElement } from 'react'
import { act } from '../agent/act'
import type { IntentId } from '../agent/intent'
import { createEmbeddingUnderstander } from '../agent/embedding'
import { converse } from '../agent/converse'
import { createRemoteUnderstander, HelperAllowanceError, summariseForHelper } from '../agent/remote'
import { attemptOr } from '../state/safe'
import {
  decodeTranscript,
  encodeTranscript,
  TRANSCRIPT_KEY,
  type StoredTurn,
} from '../agent/transcript'
import { connectionHint, looksUnmetered, MODEL_DOWNLOAD_MB } from '../agent/connection'
import { createLexicalUnderstander } from '../agent/lexical'
import type { AgentReply } from '../agent/reply'
import type { Understander } from '../agent/understand'
import { nextQuestion } from '../agent/conversation'
import { EMPTY_SLOTS, type Understanding } from '../agent/understand'
import type { OnboardingStep } from '../state/slices'
import { MODEL_CHOICE_KEY } from '../state/persist'
import { getAppState, useAppStore } from '../state/store'
import type { Crop } from '../types/crop'
import { askAgain, INTENT_LABEL, wordsFor, type Line } from './agent-words'
import { SourceLink } from './SourcesPanel'
import type { CitationId } from '../types/citation-ids.generated'
import { useScrollable } from './useScrollable'

/**
 * The conversational surface: a transcript, a box to type in, and something to tap when typing
 * did not work.
 *
 * The chips are not a convenience. This router has no generative model behind it, so its recovery
 * from "I did not follow that" is entirely the near misses it offers: two taps. That is the
 * difference between a novice carrying on and a novice
 * leaving. They are also the whole of the discoverability story, because nothing on screen tells
 * anybody what a garden agent understands
 *
 * Deliberately additive. Every answer it records goes through the store's own actions, so the
 * wizard, the panels and the agent are three ways into one design and none of them owns it: a
 * grower can say two things, tap Show me the questions, and find both answers already filled in
 */

interface Turn extends StoredTurn {
  readonly id: number
}

/**
 * Storage, if this browser has any, read and written through the same `attemptOr` guard the rest
 * of the app uses: a private window, a full quota and a blocked cookie jar all throw, and none of
 * them is a reason for the conversation to stop working
 */
const read = (key: string): string | null =>
  attemptOr<string | null>(
    () => globalThis.localStorage.getItem(key),
    () => null,
  )

const write = (key: string, value: string): void => {
  attemptOr<void>(
    () => globalThis.localStorage.setItem(key, value),
    () => undefined,
  )
}

/**
 * The router, starting as the one that needs nothing and upgrading to whichever better one this
 * visitor can have.
 *
 * All three answer the same interface, so nothing below this line can tell which replied. The
 * upgrade is attempted once, in the background, after the surface is already usable: the weights
 * are 23 MB, and a visitor who types before they land waits up to `ROUTER_WAIT_MS` for them, and
 * the lexical router answers if they don't arrive in time. Measured against a held-out set neither
 * has been tuned against, that is the difference between 61% and 82%, and between those two numbers
 * is a working conversation either way
 */
const lexical = createLexicalUnderstander()
/**
 * The best router this browser holds by itself, which is where a spent allowance falls back to.
 *
 * Held apart from `understander` because those are different questions. `understander` is who is
 * answering; this is who answers when the edge stops, and it must not be the phrase table on a
 * visitor who has already downloaded the model
 */
let local: Understander = lexical
let understander: Understander = lexical
let upgrading: Promise<void> | null = null

const upgrade = (): Promise<void> => {
  upgrading ??= (async () => {
    const embedding = createEmbeddingUnderstander()
    if (!(await embedding.ready())) return
    local = embedding
    // the edge answered first and reads better, so the weights land as the fallback and nothing
    // on screen changes
    if (understander.kind !== 'remote') understander = embedding
  })()
  return upgrading
}

/**
 * And the reader that costs the browser nothing, asked for alongside the weights.
 *
 * It wins where it answers, on two grounds. It reads a sentence with a language model, going beyond
 * cosine similarity over a hundred and sixty exemplars, and it is the only one of the three a phone
 * on a metered connection can have at all: the 45 MB the embedding costs is precisely the thing
 * most visitors are right to refuse. Nothing waits on the probe, so a deployment without the
 * binding -- a fresh clone, `wrangler dev` with no login, the e2e build that aborts every proxy
 * request -- is a surface that runs on the two in-browser routers alone
 */
const remote = createRemoteUnderstander({ summary: () => summariseForHelper(getAppState()) })
let probing: Promise<void> | null = null

const askTheEdge = (): Promise<void> => {
  probing ??= (async () => {
    if (await remote.ready()) understander = remote
  })()
  return probing
}

/**
 * How long a typed sentence waits for the better router before being answered by the other one.
 *
 * The two routers are far apart: measured on held-out sentences the phrase table acts on everything
 * and is right 64% of the time, and the model acts on two thirds and is right 86-100%, asking about
 * the rest. So the first sentence -- the one that decides whether anybody types a second -- is
 * worth a few seconds. Bounded, because a slow connection must not turn into a surface that never
 * answers, and free after the first: `upgrade` memoises, so every later send races an already-kept
 * promise
 */
const ROUTER_WAIT_MS = 8000

const readyOrTimeout = async (): Promise<void> => {
  let timer: ReturnType<typeof setTimeout> | undefined
  await Promise.race([
    upgrade(),
    new Promise<void>((resolve) => {
      timer = setTimeout(resolve, ROUTER_WAIT_MS)
    }),
  ])
  // cleared here, so it is never left to fire: a pending eight-second timer outlives the turn that made it
  if (timer !== undefined) clearTimeout(timer)
}

/**
 * What the surface says about itself while the better router is on its way, and if it never comes.
 *
 * Not decoration and not an apology. The window between opening this surface and the weights
 * landing is the window in which the agent is at its worst, and it is also the window in which a
 * first impression is formed; saying nothing means a visitor whose first sentence was read
 * literally has no way to know that a better reading was thirty seconds away. `LITERAL_LINE` is the
 * state of a fresh clone with no `bun run fetch-agent-model`, and of anybody the download fails
 * for, and it stays on screen because it stays true
 */
const LOADING_LINE = `Still loading the part that understands paraphrase, ${String(MODEL_DOWNLOAD_MB)} MB of it. I'll read what you type literally until it lands.`
/**
 * The offer, where the browser has not said the connection is fast and unmetered.
 *
 * It names the size up front, because that is the whole point: this
 * surface works without the download, and 45 MB spent silently on a phone is somebody's data plan
 * gone on a feature they had not yet decided they wanted
 */
const OFFER_LINE = `I can read what you type more carefully if I download a ${String(MODEL_DOWNLOAD_MB)} MB language model. Until then I take things literally.`
const LITERAL_LINE =
  "Reading what you type literally: the part that understands paraphrase isn't available here."
/**
 * What is true of the remote reader, said where the other two say what they cost.
 *
 * It stays on screen the whole time that router is in use, because
 * this is the one state of this surface where something a visitor typed leaves their machine. The
 * second sentence is a claim about the edge and `workers/proxy/helper.ts` is what makes it true:
 * the route holds no store, writes nothing down and returns the reading, so there is no
 * transcript on the edge to leak. `agent/remote.ts`'s `summariseForHelper` is the whole of the
 * summary named here, and is the only place to change if this sentence should say something else
 */
const PRIVACY_LINE =
  "What you type here and a short summary of your garden go to this app's own server, where a language model reads them. Nothing else leaves the browser, and nothing is kept."

/**
 * What is on offer before anything has been said.
 *
 * A novice on a phone facing an empty text box and a blinking cursor is the population this
 * whole surface is for, and telling them what they COULD type is not the same as giving them
 * something to press. Each of these dispatches its intent with nothing filled in, which for the
 * ones that need something produces the question that asks for it: pressing "Where the garden
 * is" answers with "Tell me a town or an address", which is a conversation starting
 */
const OPENING: readonly IntentId[] = ['set-place', 'propose-designs', 'list-crops', 'help']

/**
 * The works a line rests on, as the same control the rest of the app uses for a citation.
 *
 * `SourceLink` and not a new idiom: it renders the work's short label, opens Sources on that
 * work's row and highlights it, and names itself to a screen reader as "Faiman 2008, show this
 * work in Sources". A second way of drawing a citation in one app would be worse than a slightly
 * denser line.
 *
 * Nothing at all where there is nothing to show, which is most lines and is deliberate: the
 * agenda's dates carry no citation because the corpus holds none for them, its caveat says so,
 * and a marker there would be the exact lie the rest of this is built to avoid
 */
const Sources = ({ ids }: { readonly ids?: readonly CitationId[] }): ReactElement | null =>
  ids === undefined || ids.length === 0 ? null : (
    <span className="agent-sources">
      {ids.map((id) => (
        <SourceLink key={id} id={id} short />
      ))}
    </span>
  )

const linesOf = (answer: AgentReply, catalog: readonly Crop[]): readonly Line[] =>
  answer.utterances.flatMap((utterance) => wordsFor(utterance, catalog))

/** An intent dispatched by name, which is what a chip does */
const dispatched = (intent: IntentId, matched: string): Understanding => ({
  intent,
  confidence: 1,
  slots: EMPTY_SLOTS,
  matched,
  spoken: 1,
  alternatives: [],
})

/**
 * Whether this reply is the agent saying it has started something and will know shortly.
 *
 * Three of them: the sun bake, the ranking that reads it, and the annual electricity run. Ending
 * all three at "ask me again in a moment" would ask somebody who cannot see a progress bar to guess
 * how long a year of light simulation takes. The reply is worth waiting for on their behalf
 */
const startedARun = (answer: AgentReply): boolean =>
  answer.utterances.some(
    (utterance) =>
      utterance.kind === 'blocked' &&
      (utterance.need === 'light-running' ||
        utterance.need === 'ranking-running' ||
        utterance.need === 'energy'),
  )

interface Group {
  readonly tone: Line['tone']
  readonly lines: readonly Line[]
}

/**
 * The runs of lines that get a heading of their own, and what it says.
 *
 * Two, and the distinction is the point. A caveat qualifies the answer and may not be skimmed; a
 * provenance note says how the answer was computed and may. Rendering the energy model chain under
 * "What that answer doesn't cover" would say seven times over that a figure was more doubtful than
 * it is, and make the one entry that IS a real doubt indistinguishable from the six that are not.
 * Everything is on screen either way: what differs is the heading above it
 */
const BLOCK: Partial<Record<Line['tone'], string>> = {
  caveat: "What that answer doesn't cover",
  provenance: 'How this was computed',
}

/**
 * Consecutive lines of the same tone, as one group.
 *
 * It exists for the caveats. The design search reports five of them and every word is worth
 * keeping (what it did not sweep, that slope and buildings were not modelled) but five
 * full-width paragraphs each carrying its own warning rule is a wall, and a wall is read exactly
 * as carefully as no caveat at all.
 *
 * Grouped and NOT folded. `Cited` values in this app carry a caveat and the doctrine is that the
 * only thing ever hidden is detail and a caveat is never detail, so putting these behind a
 * disclosure would be the one shortcut this feature is not allowed to take. Every word stays on
 * screen; what changes is that they read as one qualification of one answer, which is what they
 * are, and never as six separate alarms
 */
const grouped = (lines: readonly Line[]): readonly Group[] => {
  const groups: Group[] = []
  for (const line of lines) {
    const last = groups[groups.length - 1]
    if (last !== undefined && last.tone === line.tone)
      groups[groups.length - 1] = { tone: last.tone, lines: [...last.lines, line] }
    else groups.push({ tone: line.tone, lines: [line] })
  }
  return groups
}

/**
 * The agent's opening move, which used to be that it did not have one.
 *
 * Saying what it is for and then waiting leaves a visitor who has never seen it not knowing that "6
 * by 4" is a thing they may type. Worse, waiting means the first sentence lands on whatever
 * question the wizard happens to be parked on, so "Amherst, Massachusetts" can be read as an answer
 * to a question about native planting.
 *
 * So it asks. One question, the first one that has no answer, with the chips still there for
 * anybody who would rather press something
 */
const OPENING_LINE =
  "Tell me about your garden in your own words, and I'll fill in the setup as you talk. You can switch to the questions whenever you like."

export const AgentPanel = (): ReactElement => {
  const catalog = useAppStore((s) => (s.catalog.status === 'ready' ? s.catalog.value : null))
  /**
   * The question the agent is waiting on an answer to.
   *
   * `App.tsx` only shows this surface when `onboarding.open` is FALSE, so a read gated on it, such
   * as `s.onboarding.open ? s.onboarding.step : null`, would always be null here, and the router's
   * whole notion of which question is being answered would never fire in the one surface that ships
   * it. The agent would ask a question and then not remember asking it, which dead-ends the most
   * likely first exchange there is: press "Where the garden is", get told to name a town, type
   * "Amherst", and be told it did not follow that.
   *
   * `onboarding.step` is the right thing to read, and reading it plainly is what makes the wizard
   * and the agent a single conversation: it starts at `location`, `act`'s `noted`
   * advances it through the same `setOnboardingStep` the Next control uses, and a grower can
   * answer two questions out loud, tap Show me the questions, and find the form standing exactly
   * where they left off.
   *
   * Measured on bare conversational replies, which is what people actually type once a question
   * has been asked: 62% routed correctly without this, 85% with it
   */
  const step = useAppStore((s) => s.onboarding.step)
  const loadCatalog = useAppStore((s) => s.loadCatalog)
  const setOnboardingStep = useAppStore((s) => s.setOnboardingStep)
  /**
   * Whether this surface is the one on screen, which is what gates the model download
   * (`MODEL_DOWNLOAD_MB`)
   */
  const showing = useAppStore((s) => s.surface === 'chat')
  /*
    Restored on mount, so a reload does not hand somebody a garden that was described to them by
    nobody. The answers survive a reload anyway: they are in the store, persisted with the design,
    and losing only the conversation about them would read as the agent having forgotten
  */
  const [restored] = useState<readonly Turn[]>(() =>
    decodeTranscript(read(TRANSCRIPT_KEY)).map((stored, at) => ({ id: at + 1, ...stored })),
  )
  const [turns, setTurns] = useState<readonly Turn[]>(restored)
  /**
   * Which questions this conversation has an answer for.
   *
   * Held here as its own fact, because the wizard's answers carry defaults for
   * everything from the moment the app loads: `DEFAULT_WIZARD_ANSWERS` has a plot size and a
   * mounting preference, so "has an answer" is not a thing the store can be asked. What is being
   * tracked is what was SAID, which is a fact about the conversation and belongs to it
   */
  const [answered, setAnswered] = useState<ReadonlySet<OnboardingStep>>(new Set())
  /**
   * Which router is answering, published on the element.
   *
   * Not decoration: the failure this guards against is the model loading, every request succeeding,
   * and the agent still answering from the phrase table because the two were wired together
   * wrongly, which looks exactly like working
   */
  /**
   * Whether it is fair to spend the download on this visitor without asking.
   *
   * Read once, in the initialiser, because it is a fact fixed for this browser, unrelated to
   * anything that changes while they type, and because deciding it inside the effect would be a setState
   * in an effect body, which is a rule and also the wrong shape. `accept` flips it, and the
   * effect below is what actually starts the fetch either way
   */
  const [invited, setInvited] = useState(
    () => read(MODEL_CHOICE_KEY) === 'yes' || looksUnmetered(connectionHint()),
  )
  /**
   * Which router is answering, or that the better one has been offered and not yet taken.
   *
   * Five states: waiting for the weights, they are not coming, they were offered, they are here,
   * and the edge is answering. Published on the element for the reason above
   */
  const [router, setRouter] = useState<Understander['kind'] | 'loading' | 'offered'>(
    invited ? 'loading' : 'offered',
  )
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  // seeded from what was restored, so a new key can never collide with a turn already on screen.
  // In the initialiser, which is a rule and also the only correct place
  const nextId = useRef(restored.length)
  /** The question the last reply ended on, so the next one is not re-explained from scratch */
  const asked = useRef<OnboardingStep | null>(null)
  /**
   * A question waiting on a run the agent started, which will be answered when the run lands.
   *
   * "Is this legal" starts the sun bake and says so. Stopping there would leave a visitor with no
   * progress bar and no idea how long a year of light simulation takes pressing send until
   * something changed. The agent started the work; finishing the sentence is its job
   */
  const [waiting, setWaiting] = useState<IntentId | null>(null)
  const log = useRef<HTMLDivElement | null>(null)
  const scroll = useScrollable(log, turns.length)
  const box = useRef<HTMLTextAreaElement | null>(null)

  // the crop vocabulary is the catalogue, so there is nothing to match against until it is here
  useEffect(() => {
    if (catalog === null) void loadCatalog()
  }, [catalog, loadCatalog])

  /*
    And the better router, but only once somebody is actually looking at this surface.

    The panel is mounted at every width and hidden by CSS, the same way `MobileTabs` is, so an
    unconditional upgrade here would fetch 23 MB of weights and 24 MB of runtime on EVERY page load,
    for a feature most visitors never open, and would load a browser that may be in the middle of
    timing a light bake
  */
  useEffect(() => {
    /*
      And even with somebody looking at it, 45 MB is somebody's data plan. See
      `agent/connection.ts`: the browser has to say the connection is fast and unmetered, or they
      have to have said yes once before. Everywhere else the offer stands and the phrase table
      answers, which it is perfectly able to do
    */
    if (!showing || !invited) return
    void upgrade().then(() => setRouter(understander.kind))
  }, [showing, invited])

  /*
    And the edge, asked at the same moment and on nobody's data plan.

    Deliberately not gated on `invited` and deliberately racing nothing: the probe is a GET that
    runs no model, the two upgrades never wait on each other, and whichever lands first is used
    until the other one does. It reports only when it WON, because the alternative reads as the
    offer of the download being withdrawn: a probe that came back with nothing would otherwise
    replace "I can read what you type more carefully" with "the part that understands paraphrase
    isn't available here", on every deployment that has no binding, which is most of them
  */
  useEffect(() => {
    if (!showing) return
    void askTheEdge().then(() => {
      if (understander.kind === 'remote') setRouter('remote')
    })
  }, [showing])

  /**
   * Yes, spend it. Remembered, so somebody is asked just once, ever.
   *
   * Focus moves to the box, because the control that had it is about to stop existing: a press
   * that leaves focus on nothing drops a keyboard or screen-reader user back at the top of the
   * document, and the box is where they were going anyway
   */
  const accept = useCallback((): void => {
    write(MODEL_CHOICE_KEY, 'yes')
    setRouter('loading')
    setInvited(true)
    box.current?.focus()
  }, [])

  const push = useCallback(
    (from: Turn['from'], lines: readonly Line[], offer: readonly IntentId[]) => {
      nextId.current += 1
      setTurns((held) => [...held, { id: nextId.current, from, lines, offer }])
    },
    [],
  )

  /**
   * One turn. `intent` short-circuits the router, which is what a chip press does.
   *
   * Sending a chip's own LABEL back through the router would be a real bug: "Where the garden is"
   * is a label that nobody says as a sentence, so it scores against `set-place`'s exemplars about
   * as well as any offhand phrase would. A control that names an intent should dispatch that
   * intent; re-deriving it from the words on the button is a guess about something already known
   */
  const say = useCallback(
    async (text: string, intent?: IntentId): Promise<void> => {
      const trimmed = text.trim()
      if (trimmed === '' || busy) return
      const known = catalog ?? []
      push('them', [{ text: trimmed, tone: 'say' }], [])
      setDraft('')
      setBusy(true)
      try {
        // the sentence waits briefly for the better router to answer, and is never raced against it
        await readyOrTimeout()
        const context = { step, catalog: known }
        /*
          One press, however many things were asked for. `converse` splits the sentence, routes
          each half and carries them out in order; a chip short-circuits the routing entirely,
          because a control that names an intent already knows which one it means
        */
        const spoken =
          intent === undefined
            ? await converse(trimmed, context, understander, { state: getAppState })
            : null
        const answer =
          spoken?.reply ??
          (await act(dispatched(intent ?? 'help', trimmed), { state: getAppState }))
        /*
          A question that had to start a run is remembered, so its answer can simply arrive, without
          being waited for. "Is this legal" starts the sun run and says so, and without this a
          visitor with no way of knowing how long a year of light simulation takes would be left
          pressing send again
        */
        const asking = intent ?? spoken?.understood[spoken.understood.length - 1]?.intent ?? null
        if (asking !== null && startedARun(answer)) setWaiting(asking)
        /*
          Whatever this reply recorded, plus the question to ask next. Asking for what is still
          MISSING and not for what follows in the table is what stops the agent enquiring about
          native planting before it knows where the garden is; see `agent/conversation.ts`
        */
        const recorded = answer.utterances.flatMap((u) => (u.kind === 'noted' ? [u.step] : []))
        const nowAnswered = new Set([...answered, ...recorded])
        if (recorded.length > 0) setAnswered(nowAnswered)
        const ask = recorded.length === 0 ? null : nextQuestion(nowAnswered)
        if (ask !== null) setOnboardingStep(ask)
        /*
          The same question twice running is asked short. Answering the height question while the
          one about native planting is on screen is normal and allowed, and it leaves that
          question still unanswered, so it comes round again; repeating its explanation word for
          word reads as a loop
        */
        const again = ask !== null && ask === asked.current
        if (ask !== null) asked.current = ask
        push(
          'us',
          [
            ...linesOf(answer, known),
            ...(ask === null
              ? []
              : again
                ? askAgain(ask)
                : wordsFor({ kind: 'ask', step: ask }, known)),
          ],
          ask === null && recorded.length > 0 ? ['propose-designs'] : answer.offer,
        )
      } catch (error) {
        /*
          A spent allowance is the one failure that outlives the turn it happened on.

          Cloudflare fails a request outright once the day's free Neurons are gone, and it will go
          on doing that until the allowance resets, so retrying the edge on every later sentence
          would spend the rest of the session on refusals nobody can see. The router goes back to
          whichever one this browser holds and the sentence says so plainly, because a surface that
          quietly gets worse at reading is a failure nobody notices
        */
        if (error instanceof HelperAllowanceError) {
          understander = local
          setRouter(local.kind)
          push('us', [{ text: error.message, tone: 'note' }], ['help'])
        } else {
          push(
            'us',
            wordsFor(
              { kind: 'failed', message: error instanceof Error ? error.message : String(error) },
              known,
            ),
            ['help'],
          )
        }
      } finally {
        setBusy(false)
      }
    },
    [answered, busy, catalog, push, setOnboardingStep, step],
  )

  /*
    Answered when the run lands. Nobody has to press send again.

    Fired on a TRANSITION and never on every store change: a bake writes progress many times a
    second, and `ask-energy` starts the annual run each time it is blocked, so retrying on every
    write would restart the very thing it is waiting for. What it watches for is a bake that has
    just finished, or an electricity figure that has just arrived
  */
  useEffect(() => {
    if (waiting === null) return
    let alive = true
    let running = false
    const attempt = async (): Promise<void> => {
      if (!alive || running) return
      running = true
      try {
        const answer = await act(dispatched(waiting, ''), { state: getAppState })
        if (!alive || startedARun(answer)) return
        alive = false
        setWaiting(null)
        push('us', linesOf(answer, catalog ?? []), answer.offer)
      } finally {
        running = false
      }
    }
    const unsubscribe = useAppStore.subscribe((state, previous) => {
      const bakeFinished = previous.progress !== null && state.progress === null
      // the flag, not the status: `sets` keeps the last ranking while the next one runs, so a
      // re-rank never moves it off `ready` and a transition read there never fires again
      const rankingLanded = previous.ranking && !state.ranking
      /*
        Ready OR error, not only ready. A figure that lands broken is still a figure that landed:
        `runEnergy` runs in place and can fail outright (no weather, a bad chain), and answering
        only the success transition would leave a failed run behind "I will answer as soon as it
        lands" for good, because nothing would be watching for the run to finish badly
      */
      const energySettled =
        previous.energy.status !== state.energy.status &&
        (state.energy.status === 'ready' || state.energy.status === 'error')
      if (bakeFinished || rankingLanded || energySettled) void attempt()
    })
    /*
      And once now, because a run can finish before this effect exists.

      The annual electricity run is fast enough to have landed by the time React commits the reply
      that says it started, so the transition can happen with nobody listening, and "how many kwh
      will it make" would say it had started and then sit there for good. One catch-up attempt costs
      nothing when the answer is not ready yet, because `act` returns the same blocked reply and
      this keeps waiting
    */
    void attempt()
    return () => {
      alive = false
      unsubscribe()
    }
  }, [waiting, catalog, push])

  /*
    The agent speaks first. Saying what it is for and then waiting would leave a visitor who has
    never seen it with no idea that "6 by 4" is a thing they may type, and would leave the first
    sentence to land on whatever question the wizard was parked on
  */
  useEffect(() => {
    if (turns.length > 0) return
    const first = nextQuestion(new Set())
    nextId.current += 1
    setTurns([
      {
        id: nextId.current,
        from: 'us',
        opening: true,
        lines: [
          { text: OPENING_LINE, tone: 'note' },
          ...(first === null ? [] : wordsFor({ kind: 'ask', step: first }, [])),
        ],
        offer: OPENING,
      },
    ])
  }, [turns.length])

  /*
    Forgetting the design forgets the conversation, on screen as well as in storage.

    `removeDesign` takes `TRANSCRIPT_KEY` with the design, and the storage panel says so in the
    sentence it makes somebody read before the second press. That alone would be half true: this
    panel holds the turns in React state, so the conversation would stay on screen and the next
    reply would write it straight back out. A disclosure that is true of the bytes and false of the
    screen is not a disclosure
  */
  useEffect(
    () =>
      useAppStore.subscribe((state, previous) => {
        if (state.storage.outcome !== 'cleared' || previous.storage.outcome === 'cleared') return
        setTurns([])
        setAnswered(new Set())
        asked.current = null
      }),
    [],
  )

  // written on every change, because unmount never runs on a closed tab
  useEffect(() => {
    if (turns.length === 0) return
    write(TRANSCRIPT_KEY, encodeTranscript(turns))
  }, [turns])

  /*
    The newest turn, not the bottom of the element: a long reply should be read from its start.

    On EVERY turn. The panel is mounted at every width and hidden by CSS, so a run on mount alone
    would happen before there was an opening turn to scroll to and while the log had no height to
    scroll in. Every reply after that would then land below the fold of a transcript already taller
    than the panel, which reads as an agent that did not answer. `showing` is a dependency for the
    same reason it is a guard: a hidden element scrolls nowhere, so the scroll has to be taken again
    when the surface opens.

    `turns` is a dependency and not a value read in the body, the same shape as `draft` below and
    `useScrollable`'s `watch`: re-running IS the effect of it changing, because re-running takes
    the scroll again. Writing it into the body to satisfy the rule would be a lie about why it is
    there, and removing it, which is what the rule asks for, is the bug this comment is under
  */
  // biome-ignore lint/correctness/useExhaustiveDependencies: `turns` re-scrolls, see above
  useEffect(() => {
    if (!showing) return
    const last = log.current?.lastElementChild
    if (last instanceof HTMLElement) last.scrollIntoView({ block: 'nearest' })
  }, [turns, showing])

  /*
    The caret starts in the box, on a machine with a keyboard to type into it.

    Left alone, opening the conversation leaves focus on the control that opened it, and the box can
    be 29 tab stops away: every offer ever made is a stop before it, and the transcript only grows,
    so the distance is unbounded in the length of the conversation. Nobody reaching this surface
    wants anything other than the box.

    Gated on the pointer and deliberately not on a width, which is the distinction
    `state/motion.ts` already draws: this is a question about the device and not about the
    layout. On a touch screen the same call throws the on-screen keyboard over the conversation
    that was just opened, which is the opposite of a favour
  */
  useEffect(() => {
    if (!showing || globalThis.matchMedia?.('(pointer: fine)').matches !== true) return
    box.current?.focus()
  }, [showing])

  /*
    The box grows to fit what was put in it, up to the height `.agent-input` stops at.

    One line shows 27% of a 137-character sentence, a fair length for a dictated one, and a dictated
    sentence has to be readable before it is worth sending, in case speech recognition misheard
    something. The cap lives in the stylesheet, so there is one number, and `scrollHeight` is read
    after the height is released or it can only ever grow.

    `draft` is not read in here and is not meant to be: it is the token that says the text
    changed, so the box is measured again. The same shape as `useScrollable`'s `watch`, and named
    here for the same reason -- the alternative is a `void draft` and a lie about why it is there
  */
  // biome-ignore lint/correctness/useExhaustiveDependencies: `draft` re-measures, see above
  useEffect(() => {
    const node = box.current
    if (node === null) return
    node.style.height = 'auto'
    /*
      A hidden box measures zero, and pinning that is the whole bug this guard exists for.

      The panel is mounted at every width and hidden by CSS, so this effect's first run happens on a
      `display: none` textarea, where `scrollHeight` is 0. A border-box element told `height: 0px`
      still draws its padding and its border, so the composer would open at 22px beside a 44px Send,
      half the height exactly, and stay there until the first keystroke re-measured it. `showing` is
      in the dependencies so the measurement is taken again the moment the surface opens, and `auto`
      is what the box is left at until then, which is the one line it is already sized for
    */
    if (node.scrollHeight === 0) return
    /*
      Plus the border, because the box sizes border-box and `scrollHeight` does not count one.
      Setting the height to a bare `scrollHeight` therefore asks for a box two pixels shorter than
      its own contents, and the last line of a five-line sentence comes out cut in half
    */
    const border = node.offsetHeight - node.clientHeight
    node.style.height = `${String(node.scrollHeight + border)}px`
  }, [draft, showing])

  const submit = (event: FormEvent): void => {
    event.preventDefault()
    void say(draft)
  }

  return (
    <section
      className="agent"
      data-testid="panel-agent"
      data-agent-router={router}
      aria-label="Ask about your garden"
    >
      {/*
        A tab stop for exactly as long as it scrolls, as `useScrollable` measures it. It usually
        holds chips for focus to land on, which is enough for axe, but a transcript can perfectly
        well be all prose -- restored from storage, or a run of answers that offered nothing to
        press -- and then the only way to read the top of a long conversation would be a pointer
      */}
      <div
        className="agent-log"
        data-testid="readout-agent-transcript"
        tabIndex={scroll.scrollable ? 0 : undefined}
        ref={log}
        // set to polite: a reply is worth hearing and never worth interrupting
        aria-live="polite"
        aria-atomic="false"
      >
        {turns.map((turn) => (
          <div
            key={turn.id}
            className={turn.from === 'them' ? 'agent-turn agent-them' : 'agent-turn agent-us'}
            data-testid={
              turn.opening === true ? 'readout-agent-opening' : `item-agent-turn-${turn.from}`
            }
          >
            {grouped(turn.lines).map((group, index) =>
              // a heading for a run of them, and none for one on its own: "What that answer does
              // not cover" is the design search's list of limits, and it reads as nonsense over a
              // single sentence saying a preference leans the ranking, without fixing it
              BLOCK[group.tone] !== undefined && group.lines.length > 1 ? (
                <div
                  // the groups of one turn are a fixed list in order, so the index IS the identity
                  key={`${String(turn.id)}-${String(index)}`}
                  className={`agent-block agent-${group.tone}s`}
                  data-testid={`readout-agent-${group.tone}s`}
                >
                  <p className="agent-block-head">{BLOCK[group.tone]}</p>
                  <ul>
                    {group.lines.map((line, at) => (
                      <li
                        key={`${String(turn.id)}-${String(index)}-${String(at)}`}
                        className={`agent-line agent-${group.tone}`}
                        data-tone={group.tone}
                      >
                        {line.text}
                        <Sources ids={line.citations} />
                      </li>
                    ))}
                  </ul>
                </div>
              ) : (
                group.lines.map((line, at) => (
                  <p
                    key={`${String(turn.id)}-${String(index)}-${String(at)}`}
                    className={`agent-line agent-${line.tone}`}
                    data-tone={line.tone}
                  >
                    {line.text}
                    <Sources ids={line.citations} />
                  </p>
                ))
              ),
            )}
            {turn.offer.length > 0 ? (
              <div className="agent-chips">
                {turn.offer.map((intent) => (
                  <button
                    key={intent}
                    type="button"
                    className="agent-chip"
                    data-testid={`action-agent-chip-${intent}`}
                    /*
                      Pressing a chip is what makes the panel busy, so `disabled` here would take
                      the focus of the person who had just pressed it and leave it on the document
                      body: a keyboard or screen-reader user would lose their place every time they
                      used one. `aria-disabled` says the same thing to the same reader without
                      removing the element they are standing on, and `say` refuses to run while busy
                      anyway, so the guard was never the browser's to enforce
                    */
                    aria-disabled={busy}
                    onClick={() => void say(INTENT_LABEL[intent], intent)}
                  >
                    {INTENT_LABEL[intent]}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        ))}
      </div>
      {router === 'embedding' ? null : (
        <div className="agent-status">
          {/*
            The button sits beside the live region as a SIBLING, outside it. A control inside a
            `role="status"` is announced again every time the region changes, and this region
            changes the moment the control is pressed
          */}
          {router === 'remote' ? (
            <p data-testid="readout-agent-privacy" role="status">
              {PRIVACY_LINE}
            </p>
          ) : (
            <p data-testid="readout-agent-router" role="status">
              {router === 'loading'
                ? LOADING_LINE
                : router === 'offered'
                  ? OFFER_LINE
                  : LITERAL_LINE}
            </p>
          )}
          {router === 'offered' ? (
            <button
              type="button"
              className="agent-chip agent-status-action"
              data-testid="action-agent-download-model"
              onClick={accept}
            >
              {`Download it (${String(MODEL_DOWNLOAD_MB)} MB)`}
            </button>
          ) : null}
        </div>
      )}
      <form className="agent-ask" onSubmit={submit}>
        <label className="visually-hidden" htmlFor="agent-input">
          Tell me about your garden
        </label>
        {/*
          A textarea and not a single line, because the sentences this surface is best at are the
          long ones and a dictated sentence is longer still. It starts one line high and grows,
          so it costs nothing to somebody typing "6 by 4"
        */}
        <textarea
          id="agent-input"
          className="agent-input"
          ref={box}
          data-testid="input-agent"
          rows={1}
          autoComplete="off"
          enterKeyHint="send"
          placeholder="Tell me about your garden"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            /*
              Enter sends and Shift+Enter breaks the line, which is the composer convention: a
              textarea left to itself swallows Enter as a newline, and the sentence never goes.
              `isComposing` is what keeps that away from an input method editor, where Enter is
              how a candidate is chosen and has nothing to do with sending anything
            */
            if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing) return
            event.preventDefault()
            void say(draft)
          }}
        />
        <button
          type="submit"
          className="agent-send"
          data-testid="action-agent-send"
          /*
            This uses `aria-disabled`, so the chips and this control share one choice, for the same
            reason: pressing send is what makes it busy, so a real `disabled` takes the focus of
            whoever just pressed it and drops it on the document body. `say` already refuses an
            empty draft and refuses to run while busy, so nothing here needs the browser to enforce
            it
          */
          aria-disabled={busy || draft.trim() === ''}
        >
          {busy ? 'Working' : 'Send'}
        </button>
      </form>
    </section>
  )
}
