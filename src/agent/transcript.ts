import { TRANSCRIPT_KEY } from '../state/persist'
import { attemptOr } from '../state/safe'

export { TRANSCRIPT_KEY }
import { CITATION_IDS, type CitationId } from '../types/citation-ids.generated'
import type { IntentId } from './intent'

/**
 * The conversation, kept across a reload.
 *
 * The answers already survive one: they go into the store through the same actions the wizard
 * uses and are persisted with the design. What did not survive was the TRANSCRIPT, so a visitor
 * who reloaded came back to a garden that had been described to them by nobody, with an agent
 * that greeted them as a stranger. The setup was intact and the conversation about it was gone,
 * which reads as the agent having forgotten rather than the page having reloaded.
 *
 * The key lives in `state/persist.ts` with the others, so that `removeDesign` can take it: a
 * garden cleared from the editor must not leave a conversation about it behind
 */

/**
 * How many turns are kept.
 *
 * Forty, which is a long conversation and a small string. The cap is the whole quota story: a
 * transcript grows without limit as long as somebody keeps typing, and it shares its quota with
 * the design, which is the thing that actually matters. Trimming the oldest is the right end to
 * lose, because the recent turns are what a returning visitor needs to pick the thread back up
 */
export const KEEP_TURNS = 40

/**
 * How a line is drawn, and the one definition of it.
 *
 * It lived here and again in `ui/agent-words.ts`, which meant a fourth tone had to be added twice
 * and the transcript's own guard silently discarded every restored turn that used it. The panel
 * imports this rather than restating it; `src/agent` cannot import `src/ui`, so this is the end
 * of the seam the shared word has to live at
 */
export const TONES = ['say', 'note', 'caveat', 'provenance'] as const

export type Tone = (typeof TONES)[number]

export interface StoredLine {
  readonly text: string
  readonly tone: Tone
  /**
   * The works this line rests on, where it rests on any.
   *
   * Ids and never prose, so the rule that `src/agent` cannot compose a sentence is untouched: the
   * panel resolves an id to a label and a control through `ui/useCitations.ts`, the same way every
   * other claim in this app does. Optional because most lines are not claims about the world at
   * all -- "Got it", the next question, what is in a bed -- and an empty array on every one of
   * them would be noise.
   *
   * Its ABSENCE is information too. The agenda's own caveat says the frost offsets and the
   * days-to-maturity figure come from Extension guidance with no entry in the verified corpus, so
   * those lines carry nothing, and a marker there would be exactly the lie the rest of this app
   * is built to avoid
   */
  readonly citations?: readonly CitationId[]
}

export interface StoredTurn {
  readonly from: 'them' | 'us'
  readonly lines: readonly StoredLine[]
  readonly offer: readonly IntentId[]
  /** The agent's first move, which is a turn like any other and is worth naming for a test */
  readonly opening?: boolean
}

const isLine = (value: unknown): value is StoredLine => {
  if (typeof value !== 'object' || value === null) return false
  const line = value as Record<string, unknown>
  const citations = line.citations
  return (
    typeof line.text === 'string' &&
    TONES.some((tone) => tone === line.tone) &&
    // validated against the generated list, like everything else read back from storage: what is
    // on the other side of `localStorage` is a string somebody could have written by hand
    (citations === undefined ||
      (Array.isArray(citations) &&
        citations.every((id) => CITATION_IDS.some((known: string) => known === id))))
  )
}

/**
 * Decoded rather than cast, like everything else this app reads back from storage.
 *
 * What is on the other side of `localStorage` is a string somebody could have written by hand,
 * and a transcript that trusts it renders whatever it is given. Anything that does not decode is
 * discarded whole: a half-restored conversation is worse than none
 */
export const decodeTranscript = (raw: string | null): readonly StoredTurn[] => {
  if (raw === null) return []
  return attemptOr<readonly StoredTurn[]>(
    () => {
      const parsed: unknown = JSON.parse(raw)
      if (!Array.isArray(parsed)) return []
      return parsed.flatMap((entry): readonly StoredTurn[] => {
        if (typeof entry !== 'object' || entry === null) return []
        const turn = entry as Record<string, unknown>
        if (turn.from !== 'them' && turn.from !== 'us') return []
        if (!Array.isArray(turn.lines) || !turn.lines.every(isLine)) return []
        const offer = Array.isArray(turn.offer)
          ? turn.offer.filter((id) => typeof id === 'string')
          : []
        return [
          {
            from: turn.from,
            lines: turn.lines,
            offer: offer as readonly IntentId[],
            ...(turn.opening === true ? { opening: true } : {}),
          },
        ]
      })
    },
    () => [],
  )
}

export const encodeTranscript = (turns: readonly StoredTurn[]): string =>
  JSON.stringify(turns.slice(-KEEP_TURNS))
