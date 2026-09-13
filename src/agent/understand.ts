import type { Crop } from '../types/crop'
import type { CropId } from '../types/ids'
import type { GrowingAmbition, MountingPreference, SiteExposure } from '../types/onboarding'
import type { ObjectivePresetId } from '../state/onboarding'
import type { PanelChange, ScopeTopic } from './vocabulary'
import type { OnboardingStep } from '../state/slices'
import type { IntentId } from './intent'

/**
 * What a sentence turned out to mean, filled in as far as it could be.
 *
 * Every field is separately optional because a half-understood sentence is the normal case and
 * is useful: "I want tomatoes" gives an intent and a crop but no quantity, and the right response
 * is to act on what is there and ask about the rest, not to refuse the whole utterance. A router
 * that only ever returns complete answers spends most of its life returning nothing
 */
export interface Slots {
  readonly place: string | null
  readonly widthM: number | null
  readonly depthM: number | null
  readonly lengthM: number | null
  readonly exposure: SiteExposure | null
  readonly ambition: GrowingAmbition | null
  readonly objective: ObjectivePresetId | null
  readonly mounting: MountingPreference | null
  readonly yesNo: boolean | null
  readonly crops: readonly CropId[]
  /** Free text the caller may need verbatim, such as what an `explain` was asked about */
  readonly subject: string | null
  /** Which thing the app does not model, when that is what was asked about */
  readonly scope: ScopeTopic | null
  /** Which way the panels should move, when that is what was asked for */
  readonly panels: PanelChange | null
}

export const EMPTY_SLOTS: Slots = {
  place: null,
  widthM: null,
  depthM: null,
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
}

export interface Understanding {
  readonly intent: IntentId
  /** 0..1. The caller decides what to do with a low one; this module never decides for it */
  readonly confidence: number
  readonly slots: Slots
  /** What the router thought it heard, so a reply can say so and be corrected */
  readonly matched: string
  /**
   * How well the sentence matched on its own words, before any bias for the question on screen.
   *
   * Separate from `confidence` because `confidence` is the number the router ACTED on and this is
   * the evidence underneath it. `STEP_BIAS` multiplies a match by 1.35 when it belongs to the
   * pending question, which is right for choosing between readings and misleading for anything
   * downstream that wants to know how good the reading really was: a 0.43 match on the place
   * intent arrives as 0.58 and looks strong. `embedding.ts` reads this to decide whether to
   * consult the model at all
   */
  readonly spoken: number
  /**
   * The readings that came close enough to the winner that choosing between them is a guess,
   * best first and including the winner itself. Empty whenever the reading was clear, which is
   * the ordinary case and the only one anything acts on.
   *
   * It exists because the failure that hurts most on this surface is a confident wrong move, such
   * as "keep the fennel out of it" routed to `show-the-form`, or "scratch that" read as a request
   * for an explanation. Both had a runner-up within a few hundredths, and a tie broken silently is
   * a coin flip with consequences. `converse` refuses to act on one of these and offers the
   * candidates instead, which turns a wrong action into one tap
   */
  readonly alternatives: readonly IntentId[]
}

export interface RouteContext {
  /**
   * The question on screen, or null away from the guided path. A bias and never a filter: see
   * `Intent.step` for why a grower is always allowed to answer a different question
   */
  readonly step: OnboardingStep | null
  readonly catalog: readonly Crop[]
}

/**
 * The seam the whole agent is built around, and the reason this file exists at all.
 *
 * There are three implementations. `lexical.ts` downloads nothing, runs everywhere including a
 * phone with no WebGPU, and is the fallback whenever anything better has not loaded or has failed.
 * `embedding.ts` is 23 MB of MiniLM and understands paraphrase. `remote.ts` has the sentence read
 * by a language model at this app's own edge. Everything above this line -- the tools, the reply
 * envelope, the panel -- is written against this interface and cannot tell which one answered
 *
 * `ready` is separate from `route` and returns a boolean rather than throwing, because the
 * interesting implementation is one that has to fetch weights and might not get them. A router
 * that cannot load is not an error state for the app: it is the lexical one doing the work
 */
export interface Understander {
  readonly kind: 'lexical' | 'embedding' | 'remote'
  /** Resolves false when this understander cannot serve, so a caller can fall back rather than fail */
  ready(): Promise<boolean>
  route(text: string, context: RouteContext): Promise<Understanding | null>
}
