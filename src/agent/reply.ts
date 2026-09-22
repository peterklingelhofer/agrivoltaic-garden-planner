import type { PlanRefusal } from '../recommend/planting'
import type { AgendaItem } from '../types/agenda'
import type { ComplianceCheck } from '../types/compliance'
import type { PvEnergyReport } from '../types/energy'
import type { LimitingFactor } from '../types/recommend'
import type { BedWaterBalance } from '../types/water'
import type { OnboardingStep } from '../state/slices'
import type { CitationId } from '../types/citation-ids.generated'
import type { CropId } from '../types/ids'
import type { CandidateArchetype } from '../types/onboarding'
import type { Fraction } from '../types/units'
import type { IntentId } from './intent'
import type { PanelChange, ScopeTopic } from './vocabulary'

/**
 * What the agent says, as structure.
 *
 * This is the load-bearing decision in the whole feature: the
 * agent never writes prose. Every word a visitor reads is either a fixed string this app already
 * ships, such as `STEP_COPY`, the option help text and `NOT_A_DETERMINATION`, or a string the
 * ENGINE authored and this passes through untouched, such as a `PlanRefusal.reason`. Nothing is
 * composed here and nothing is paraphrased anywhere.
 *
 * The layering enforces it. The copy lives in `src/ui/onboarding.ts`
 * and `src/agent` may not import `src/ui`, so an utterance physically can't carry a sentence
 * this layer made up: it carries a step, a crop id, an archetype, a refusal, and the panel words
 * it from the same table the wizard words itself from. A caveat can't be dropped in translation
 * because there's no translation.
 *
 * That's also what makes this safe to put a language model behind later. A model that can only
 * emit one of these can be wrong about what somebody meant, which is recoverable, and can't be
 * wrong about a number, a citation or a compliance claim, which isn't
 */
export type Utterance =
  /** Ask the question this step asks, worded by the panel from `STEP_COPY` */
  | { readonly kind: 'ask'; readonly step: OnboardingStep }
  /** What the agent can do, listed by the panel from `INTENTS` */
  | { readonly kind: 'help' }
  /**
   * The visitor asked for the editor's panels, and got them
   */
  | { readonly kind: 'handed-over' }
  | { readonly kind: 'not-understood'; readonly near: readonly IntentId[] }
  /**
   * It followed the sentence and can't choose between two readings of it, so it does neither.
   *
   * Distinct from `not-understood` for the same reason `no-reason` is: saying "I didn't follow
   * that" to something perfectly clear is a lie, and it teaches a novice to rephrase a sentence
   * that was never the problem. Here the problem is that "keep the fennel out of it" is a
   * reasonable way of saying two different things and the difference matters: record a dislike,
   * or dig one up. The person who typed it is the only one who knows which
   */
  | { readonly kind: 'unsure'; readonly near: readonly IntentId[] }
  /**
   * An answer was recorded, for this question.
   *
   * It deliberately does NOT say what to ask next. The next entry in the table is wrong the moment
   * somebody volunteers something out of order: a visitor who opens with "I want to grow
   * vegetables" would be asked about native planting next, before the agent knew where the garden
   * was. What to ask next is a question about the whole conversation and is answered by
   * `agent/conversation.ts`
   */
  | { readonly kind: 'noted'; readonly step: OnboardingStep }
  | {
      readonly kind: 'preference'
      readonly liked: readonly CropId[]
      readonly disliked: readonly CropId[]
    }
  | { readonly kind: 'place'; readonly label: string; readonly attribution: string }
  /** Something has to happen first, and this names which thing, without merely refusing blankly */
  | { readonly kind: 'blocked'; readonly need: BlockedNeed }
  | { readonly kind: 'garden'; readonly summary: GardenSummary }
  | {
      readonly kind: 'crops'
      readonly cropIds: readonly CropId[]
      readonly source: 'ranked' | 'planted'
      /** Which bed or beds this list is for, empty where the answer spans the whole garden */
      readonly bedLabels: readonly string[]
      /** Of `cropIds`, the ones already growing in these same beds, so the two lists can agree */
      readonly plantedHere: readonly CropId[]
      /** Of `cropIds`, the ones the catalog carries a cover-crop role for */
      readonly coverCropIds: readonly CropId[]
    }
  | {
      readonly kind: 'designs'
      readonly archetypes: readonly CandidateArchetype[]
      readonly recommended: CandidateArchetype
      /**
       * The search's own account of what it didn't look at, carried verbatim. It's the sentence
       * that keeps a five-geometry search from reading as an exhaustive one, and it's the first
       * thing a summarizer would throw away, so it travels as the engine's string
       */
      readonly notConsidered: readonly string[]
    }
  | { readonly kind: 'applied'; readonly archetype: CandidateArchetype }
  /**
   * What went in, by name.
   *
   * A count reads as "Planted. 1 different crops went in.", which is both ungrammatical and no
   * answer: a grower who asked for tomatoes wants to know what is in the ground, and a number
   * can't tell them it is lingonberry
   */
  | { readonly kind: 'planted'; readonly cropIds: readonly CropId[] }
  /** Engine-authored, passed through word for word: these are the reasons crops were left out */
  | { readonly kind: 'refusals'; readonly refusals: readonly PlanRefusal[] }
  /**
   * What the ranking made of a crop, which is the other half of "why not that one".
   *
   * The planner only records a `PlanRefusal` for a crop it was asked to PLANT, so asking why the
   * tomatoes are missing from a garden that never tried to plant any found nothing at all. The
   * ranking has an opinion about all 163 and carries a `LimitingFactor` for every crop it wouldn't
   * recommend, with an explanation the app already knows how to word
   */
  | {
      readonly kind: 'verdict'
      readonly cropId: CropId
      /** null when the ranking is happy with it, which is itself the answer to "why not" */
      readonly limiting: LimitingFactor | null
    }
  /**
   * The sentence was understood and there's nothing recorded to say.
   *
   * Distinct from `not-understood`, and the distinction is the whole honesty policy on this
   * surface. "Why not tomatoes" routed correctly, found nothing, and the agent replied "I didn't
   * follow that", which is false, and teaches a novice that the way to be understood is to
   * rephrase a question that was already perfectly clear
   */
  | {
      readonly kind: 'no-reason'
      readonly subject: string
      /** What is worth asking about right now, read off the store */
      readonly canAsk: readonly Capability[]
    }
  | { readonly kind: 'undone' }
  /*
    The six below carry things the app already computes. Each is the engine's own value, whole:
    the panel words it with the same helpers the corresponding panel uses, so asking out loud and
    opening the panel give one answer
  */
  | {
      readonly kind: 'energy'
      readonly report: PvEnergyReport
      /** The array's own geometry the report assumes, absent where a caller has no array to read */
      readonly assumptions?: ArrayAssumptions | null
    }
  /** The last season that ran, said when nothing has computed the fuller annual report yet */
  | {
      readonly kind: 'season-energy'
      readonly energyKwh: number
      readonly yearLabel: string
      readonly assumptions?: ArrayAssumptions | null
    }
  | {
      readonly kind: 'agenda'
      /** The next actions, soonest first, already filtered to a crop where one was named */
      readonly items: readonly AgendaItem[]
      /** Caveats every dated crop carries, stated once, and never dropped */
      readonly notes: readonly string[]
      /** What was asked: the whole list, or the dates for one crop */
      readonly about: 'everything' | 'crop'
    }
  | { readonly kind: 'compliance'; readonly checks: readonly ComplianceCheck[] }
  | { readonly kind: 'water'; readonly balances: readonly BedWaterBalance[] }
  | {
      readonly kind: 'companions'
      readonly cropId: CropId
      readonly withCropIds: readonly CropId[]
      /**
       * The works behind the rules that matched.
       *
       * This reply says "only the scored rules, which are the ones with a study behind them", so it
       * names the studies too. Naming none would make the caveat do the opposite of its job: claim
       * evidence and withhold it
       */
      readonly citations: readonly CitationId[]
    }
  /** The reference shelf, which the agent opens */
  | { readonly kind: 'sources' }
  | { readonly kind: 'removed'; readonly cropIds: readonly CropId[]; readonly count: number }
  | { readonly kind: 'bed-added'; readonly label: string }
  | { readonly kind: 'started-over' }
  /**
   * Hello, or thank you. Short, and it puts the pending question back, without trailing off.
   *
   * `sort` because they're not the same thing said twice: answering "thanks" with "Hello."
   * reads as an agent that heard a noise
   */
  | { readonly kind: 'greeting'; readonly sort: 'hello' | 'thanks' }
  /**
   * Asked about a crop that is not in any bed.
   *
   * Distinct from `no-reason`, which says the engine has no opinion. Here the engine has plenty
   * and the crop simply isn't planted, and "I have nothing recorded about that one" in answer to
   * "when do I sow the lettuce" is true, unhelpful, and reads as a failure
   */
  | { readonly kind: 'not-planted'; readonly cropIds: readonly CropId[] }
  | {
      readonly kind: 'panels-adjusted'
      readonly change: PanelChange
      readonly clearanceM: number
      readonly pitchM: number
      /** null when the array tracks the sun, which has no fixed tilt to report */
      readonly tiltDeg: number | null
    }
  /**
   * Asked about something this application doesn't model, and saying so by name.
   *
   * The design search already lists these in its own caveats. Declining specifically is the point:
   * "I don't model cost" is a fact a grower can act on, and "I didn't follow that" is a lie
   */
  | { readonly kind: 'out-of-scope'; readonly topic: ScopeTopic }
  /** The plot was reshaped as well as recorded, which only happens once one has been drawn */
  | { readonly kind: 'resized'; readonly widthM: number; readonly depthM: number }
  /** What this whole application is for, as a fixed definition */
  | { readonly kind: 'define' }
  /**
   * The light model's own facts, read off the raster that actually ran, plus what would let a
   * colleague reproduce a season exactly: the same seed and the same year
   */
  | {
      readonly kind: 'methods'
      /** Null wherever the light has never been run over this garden */
      readonly raster: {
        readonly skyModel: string
        readonly sunDirectionCount: number
        readonly cellSizeM: number
        readonly backend: string
      } | null
      readonly seed: number
      readonly yearLabel: string
    }
  /** What the resolved site says about growing here, and nothing invented beyond it */
  | {
      readonly kind: 'growing-here'
      readonly locationLabel: string
      /** Null before the site lookup has resolved */
      readonly hardinessZoneLabel: string | null
      readonly frostFreeDays: number | null
    }
  /**
   * What the panels cost the harvest, from the seasons step's own comparison: the same year run
   * again with every row pulled off the plot. Both figures are shares of full yield across the
   * same plantings, so the difference between them is the shade and nothing else
   */
  | {
      readonly kind: 'panel-cost'
      readonly withPanels: Fraction
      readonly withoutPanels: Fraction | null
      readonly yearLabel: string
    }
  /** The comparison hasn't been run, and the press that runs it is now on screen */
  | { readonly kind: 'panel-cost-run' }
  /** An upstream or the engine failed, carrying its own message */
  | { readonly kind: 'failed'; readonly message: string }

/**
 * The array geometry an energy figure assumes, read the same way `panels-adjusted` reads it.
 *
 * Its own type because two different answers, the annual report and a season's own figure,
 * carry it, and a garden's headroom and row spacing don't change depending on which one is asked
 */
export interface ArrayAssumptions {
  readonly clearanceM: number
  readonly pitchM: number
  /** Null where the array tracks the sun, which has no fixed tilt to report */
  readonly tiltDeg: number | null
}

/**
 * What is worth asking about right now, named so the empty-answer fallback always has somewhere
 * to point. Closed, the same way `IntentId` is: a new one has to be
 * added here and worded in `agent-words.ts`, so the list on screen can never silently go stale
 */
export type Capability = 'grow' | 'energy' | 'calendar' | 'sources' | 'season'

/** What is missing, named so the reply can say what to do about it */
export type BlockedNeed =
  | 'location'
  /** The annual energy run is never done by default: there's no default figure to show */
  | 'energy'
  /**
   * A place WAS named and the geocoder didn't know it, which is a different thing from no place
   * having been given and needs different words. Telling somebody who just typed a town that you
   * need to know where the garden is reads as the agent not having heard them
   */
  | 'place-not-found'
  | 'plot'
  | 'beds'
  /**
   * The sun hasn't been run over this arrangement, and the agent has just started running it.
   *
   * Saying only "the sun has not been run" sends somebody who has already designed, applied and
   * planted a garden back round to design it again, because `applyDesign` clears the compliance
   * checks and nothing re-bakes them. A need that names a step which doesn't help is worse than
   * one that refuses
   */
  | 'light-running'
  /**
   * The light is computed and the ranking isn't, which is a cheaper, different run: it reads
   * `bedLight`, without retracing the sun. Reusing `light-running` here restarted a bake that
   * had already finished, every time a question needed only the ranking that follows it
   */
  | 'ranking-running'
  | 'designs'
  | 'catalog'

export interface GardenSummary {
  readonly locationLabel: string
  readonly bedCount: number
  readonly arrayCount: number
  readonly plantingCount: number
  readonly plotAreaM2: number
}

/**
 * One turn's worth of answer.
 *
 * `did` is separate from `utterances`: it's the record of what changed in the store, which is
 * what an undo and a transcript need and what a reply doesn't.
 * `offer` is the chips to put under the reply, and it carries intent ids for the same reason
 * everything else here does: the panel already knows how to word an intent
 */
export interface AgentReply {
  readonly utterances: readonly Utterance[]
  readonly did: readonly string[]
  readonly offer: readonly IntentId[]
}

export const reply = (
  utterances: readonly Utterance[],
  extra: { readonly did?: readonly string[]; readonly offer?: readonly IntentId[] } = {},
): AgentReply => ({
  utterances,
  did: extra.did ?? [],
  offer: extra.offer ?? [],
})
