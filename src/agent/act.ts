import { buildAgenda } from '../recommend/agenda'
import { ruleJoinsPair } from '../recommend/compatibility'
import { geocode } from '../data/geocode'
import { dayOfYearAt } from '../state/sun'
import { waterBalanceView } from '../state/water'
import type { Agenda } from '../types/agenda'
import { polygonAreaM2, polygonOf, rectangleRing, vec2 } from '../state/geom'
import { makeBed, nextBedIndex, soilForSite } from '../state/defaults'
import { OBJECTIVE_PRESETS, plotSizeOf } from '../state/onboarding'
import type { AppState, OnboardingStep } from '../state/slices'
import type { CitationId } from '../types/citation-ids.generated'
import type { BedId, CropId } from '../types/ids'
import type { CandidateArchetype } from '../types/onboarding'
import { degrees, meters } from '../types/units'

/**
 * How far one asking moves the panels.
 *
 * The same steps `ArrayPanel`'s own controls use, so saying it and typing it move the garden by
 * the same amount, and so that asking twice is the obvious way to ask for more
 */
export const PANEL_STEP_M = 0.5
export const TILT_STEP_DEG = 5
import type { IntentId } from './intent'
import {
  reply,
  type AgentReply,
  type ArrayAssumptions,
  type BlockedNeed,
  type Capability,
  type Utterance,
} from './reply'
import type { Slots, Understanding } from './understand'

/**
 * The tool layer: what each intent does to the store.
 *
 * Everything here goes through the store's own actions and through nothing else, which is the
 * same rule `applyDesign` already follows. There is no second path that writes a bed, no
 * shortcut that skips a refusal, and no arithmetic performed on a figure. If the agent can do it,
 * a person could already have done it by pressing something, and it happens by the same code
 *
 * Kept apart from `lexical.ts` because understanding a sentence and acting on it fail
 * differently and are worth being wrong about separately: a misrouted sentence is a wrong answer,
 * and a mis-applied action is a changed garden
 */

export interface ActContext {
  /** Read fresh on every access: an action taken three lines ago has already changed the state */
  readonly state: () => AppState
  readonly signal?: AbortSignal | null
}

/**
 * Recording that this question now has an answer.
 *
 * It does not advance anything. Moving the conversation on is the caller's job, because what to
 * ask next depends on everything that has been answered: see `agent/conversation.ts`
 */
const noted = (step: OnboardingStep): Utterance => ({ kind: 'noted', step })

const blocked = (need: BlockedNeed, offer: readonly IntentId[] = []): AgentReply =>
  reply([{ kind: 'blocked', need }], { offer })

/**
 * What to say when the light bake has not produced what the question needs: start it.
 *
 * Asking for a design is no answer here: `applyDesign` clears `compliance` and nothing re-bakes it,
 * so a garden can be designed, applied and its beds filled, an electricity figure returned, and the
 * question of whether it is legal is STILL answered as though the sun had not been run. A dead end
 * worded as a next step is worse than a refusal, because it sends somebody round the loop again.
 *
 * So it starts the run, exactly the way `ask-energy` starts the annual one, and says so. Not
 * started twice: `progress` is non-null while a bake is in flight, and a second press of a
 * question should not queue a second year of light simulation
 */
const needsLight = (state: AppState): AgentReply => {
  const plot = state.plot
  /*
    A garden with no panels is still a garden. `no-array-control` is one of the five designs the
    search offers, it is the crop denominator of the land equivalent ratio, and a visitor can apply
    it like any other. Gating on `arrays.length` would tell somebody who had just chosen a layout
    that they had not computed any layouts yet, and offer them the search they had already run: the
    same permanent dead end the comment above `needsLight` describes, reached from the other side.

    It stayed hidden because which of the five wins turns on scores a hair apart, and the control
    had not been landing on top.
    What is needed here is a plot worth baking, and beds alone are enough: the open sky over them
    is a light answer, and it is the one the control exists to give
  */
  if (plot === null || (plot.arrays.length === 0 && plot.beds.length === 0))
    return blocked('designs', ['propose-designs'])
  /*
    The bake and the ranking are two different runs, and asking for the wrong one repeats work that
    already finished. A garden whose light was already computed, with nothing yet ranked from it,
    does not need the sun run again: it needs `recommend`, which reads `bedLight` without retracing
    it. Calling the bake regardless would restart a bake that had already landed, every time a
    question needed only the ranking that follows it
  */
  if (state.raster.status === 'ready' && state.sets.status !== 'ready') {
    // `sets` keeps the last ranking while the next one runs, so the flag is what says one is
    if (state.sets.status !== 'loading' && !state.ranking) void state.recommend()
    return blocked('ranking-running', ['list-crops', 'describe-garden'])
  }
  if (state.progress === null) void state.runFinal()
  return blocked('light-running', ['propose-designs', 'describe-garden'])
}

const cropNames = (state: AppState): readonly CropId[] =>
  state.catalog.status === 'ready' ? state.catalog.value.map((crop) => crop.id) : []

/**
 * Whether a sentence is asking about the shaded ground specifically, in the two ways growers say
 * it. `slots.subject` carries the sentence verbatim for any intent whose slot is `subject`, which
 * `list-crops` is
 */
const asksAboutShade = (subject: string | null): boolean => {
  const said = (subject ?? '').toLowerCase()
  return said.includes('under the panel') || said.includes('in the shade') || said.includes('shady')
}

/** The bed or beds this garden's own light measurement puts at the bottom, for "under the panels" */
const darkestBedIds = (state: AppState): readonly BedId[] => {
  if (state.bedLight.length === 0) return []
  const dimmest = Math.min(...state.bedLight.map((entry) => entry.annualMeanDliMolM2Day))
  return state.bedLight
    .filter((entry) => entry.annualMeanDliMolM2Day === dimmest)
    .map((entry) => entry.bedId)
}

/**
 * The crops the ranking currently puts at the top, for a bed or beds.
 *
 * Deliberately drawn from `sets`, as is. The ranking is the product's own answer to "what can I
 * grow here", it is already gated on this bed's measured light, and a second opinion assembled in
 * the agent layer would be a second answer to the one question the whole app exists to answer.
 * `bedIds` of `null` means every bed with a ranking, which is what a plain "what can I grow" asks;
 * an excluded verdict is left out everywhere, because a crop the ranking rules out is not a top
 * pick, and showing it beside the top picks reads as an arbitrary, truncated list
 */
const rankedCropsForBeds = (
  state: AppState,
  bedIds: readonly BedId[] | null,
  limit: number,
): readonly CropId[] => {
  if (state.sets.status !== 'ready') return []
  const sets =
    bedIds === null
      ? state.sets.value
      : state.sets.value.filter((set) => bedIds.includes(set.bedId))
  const seen = new Set<CropId>()
  for (const set of sets) {
    for (const entry of set.ranked) {
      if (entry.outcome.verdict === 'excluded') continue
      if (seen.size < limit) seen.add(entry.cropId)
    }
  }
  return [...seen]
}

/** What is already growing in a bed or beds, so a ranking and a planting can be read side by side */
const plantedIn = (state: AppState, bedIds: readonly BedId[] | null): readonly CropId[] => {
  const plot = state.plot
  if (plot === null) return []
  const beds = bedIds === null ? plot.beds : plot.beds.filter((bed) => bedIds.includes(bed.id))
  return [...new Set(beds.flatMap((bed) => bed.plantings.map((entry) => entry.cropId)))]
}

/** Of a list of crops, the ones the catalogue carries a cover-crop role for, not a main crop */
const coverCropIdsOf = (state: AppState, cropIds: readonly CropId[]): readonly CropId[] => {
  if (state.catalog.status !== 'ready') return []
  const roles = new Map(state.catalog.value.map((crop) => [crop.id, crop.role]))
  return cropIds.filter((id) => {
    const role = roles.get(id) ?? null
    return role !== null && role !== 'target-crop'
  })
}

/** The array's own headroom, spacing and tilt, read the way `panels-adjusted` already reads them */
const arrayAssumptions = (state: AppState): ArrayAssumptions | null => {
  const array = state.plot?.arrays[0]
  if (array === undefined) return null
  return {
    clearanceM: array.geometry.clearanceHeightM as number,
    pitchM: array.geometry.pitchM as number,
    tiltDeg: array.tracker.mode === 'fixed' ? (array.tracker.tiltDeg as number) : null,
  }
}

/**
 * What is worth asking about right now, read off the store.
 *
 * A session with no plot yet has nothing to grow, spend or plant, and offering those anyway would
 * have the `no-reason` fallback inventing answers of its own. `sources` is always there: the
 * reference shelf does not depend on anything this garden has done yet
 */
const capabilitiesNow = (state: AppState): readonly Capability[] => {
  const plot = state.plot
  const list: Capability[] = []
  if (plot !== null) list.push('grow')
  if (plot !== null && plot.arrays.length > 0) list.push('energy')
  if (plot !== null && plot.beds.length > 0) list.push('calendar', 'season')
  list.push('sources')
  return list
}

/** The year a reproduction has to match: the last season actually run, or the one configured */
const yearLabelOf = (state: AppState): string => {
  const last = state.simulation.reports[state.simulation.reports.length - 1]
  return last?.year.label ?? state.simulation.yearChoice
}

/** The raster's own methods, read off the run that actually produced it */
const rasterMethodsOf = (
  state: AppState,
): { skyModel: string; sunDirectionCount: number; cellSizeM: number; backend: string } | null =>
  state.raster.status === 'ready'
    ? {
        skyModel: state.raster.value.quality.subdivision,
        sunDirectionCount: state.raster.value.quality.sunDirectionCount,
        cellSizeM: state.raster.value.grid.cellSizeM as number,
        backend: state.options.backend,
      }
    : null

/** The USDA rating where the site carries one, else whichever the site does carry */
const usdaZoneLabel = (state: AppState): string | null => {
  if (state.site.status !== 'ready') return null
  const ratings = state.site.value.hardiness
  return (ratings.find((rating) => rating.scheme === 'usda-2023') ?? ratings[0])?.zoneLabel ?? null
}

/**
 * A subject with no crop named in it still names something, most of the time: this app's own
 * methods, or what it knows about the place. Tried before the crop-shaped explanations, because
 * none of these mention a crop and a "why" that does is routed to those instead
 */
const explainWithoutACrop = (state: AppState, subject: string): AgentReply | null => {
  const said = subject.toLowerCase()
  const asksMethod =
    said.includes('light model') ||
    said.includes('resolution') ||
    said.includes('sky model') ||
    said.includes('sun position') ||
    said.includes('sun direction') ||
    said.includes('cell size') ||
    said.includes('spatial') ||
    said.includes('temporal') ||
    said.includes('reproduce') ||
    said.includes('yield band') ||
    said.includes('which studies') ||
    said.includes('is the yield')
  if (asksMethod) {
    state.setSidebarStep('light')
    state.setSurface('edit')
    return reply([
      {
        kind: 'methods',
        raster: rasterMethodsOf(state),
        seed: state.simulation.seed,
        yearLabel: yearLabelOf(state),
      },
    ])
  }
  /*
    "Will this work in New Jersey" names no crop and asks nothing the ranking has an opinion
    about; it asks about the place itself. `work` alone is too common a word to gate on, so it is
    paired with a locative -- here, in, at, near -- the way somebody actually asks it
  */
  const asksPlace = /\bwork(s|ed|ing)?\b/.test(said) && /\b(here|in|at|near)\b/.test(said)
  if (asksPlace) {
    const curve = state.site.status === 'ready' ? state.site.value.frost[0] : undefined
    return reply([
      {
        kind: 'growing-here',
        locationLabel: state.locationLabel,
        hardinessZoneLabel: usdaZoneLabel(state),
        // no count where the record holds no frost at this setting: there is no season to count
        frostFreeDays:
          curve === undefined || curve.frostFree[state.frostPercentile]
            ? null
            : (curve.frostFreeDays[state.frostPercentile] as number),
      },
    ])
  }
  return null
}

const plantedCrops = (state: AppState): readonly CropId[] => {
  const plot = state.plot
  if (plot === null) return []
  return [...new Set(plot.beds.flatMap((bed) => bed.plantings.map((entry) => entry.cropId)))]
}

const summarise = (state: AppState): AgentReply => {
  const plot = state.plot
  if (plot === null) return blocked('plot')
  return reply(
    [
      {
        kind: 'garden',
        summary: {
          locationLabel: state.locationLabel,
          bedCount: plot.beds.length,
          arrayCount: plot.arrays.length,
          plantingCount: plot.beds.reduce((total, bed) => total + bed.plantings.length, 0),
          plotAreaM2: polygonAreaM2(plot.boundary),
        },
      },
    ],
    { offer: ['list-crops', 'propose-designs'] },
  )
}

/**
 * What the ranking made of these crops, one verdict each, best across every bed.
 *
 * Shared by `explain` and by filling the beds. A grower who says "I want tomatoes" and is handed a
 * garden of lingonberry has been answered, in a way, and still has to be told why: the one sentence
 * they need is the ranking's own reason
 */
const verdictsFor = (state: AppState, cropIds: readonly CropId[]): readonly Utterance[] =>
  cropIds.flatMap((cropId): readonly Utterance[] => {
    /*
      The kindest verdict across every bed, because a crop refused in the shaded bed and
      recommended in the bright one is not refused: answering with the first bed's opinion would
      tell somebody they cannot grow a thing that is already growing two metres away
    */
    const entries =
      state.sets.status === 'ready'
        ? state.sets.value.flatMap((set) => set.ranked.filter((e) => e.cropId === cropId))
        : []
    if (entries.length === 0) return []
    const best = entries.find((e) => e.outcome.verdict === 'recommended') ?? entries[0]
    if (best === undefined) return []
    return [
      {
        kind: 'verdict',
        cropId,
        limiting: best.outcome.verdict === 'recommended' ? null : best.outcome.limiting,
      },
    ]
  })

/** Whether the question is about light, however it was put */
const asksAboutLight = (subject: string | null): boolean =>
  /\b(sun|sunny|sunlight|light|shade|shady|dark|darker)\b/.test((subject ?? '').toLowerCase())

/** Whether it is about what the panels cost the harvest, which the seasons step can answer */
const asksPanelCost = (subject: string | null): boolean => {
  const said = (subject ?? '').toLowerCase()
  return (
    /\b(harvest|yield|crop|lose|losing|lost|cost|less)\b/.test(said) &&
    /\b(panel|panels|shade|array)\b/.test(said)
  )
}

/**
 * Everything the agent knows about why a crop is or is not somewhere, read in order of how
 * specific the answer is.
 *
 * A planting refusal first, because it is about THIS bed and this attempt. Then the ranking's own
 * verdict, which has an opinion about all 182 crops and carries a `LimitingFactor` with an
 * explanation for every one it would not recommend. Only if both are silent does it say so.
 *
 * The ranking is the more useful half. `planRefusals` is only written when the planner was ASKED to
 * plant something, so "why not tomatoes" against a garden that never tried any finds no refusal,
 * and replying "I did not follow that" would be untrue, the worst thing this surface can say to
 * somebody who asked a perfectly clear question.
 *
 * What it still will not do is answer from anywhere else. If the engine has recorded no opinion,
 * the agent says so. A plausible sentence about tomatoes and shade is indistinguishable from the
 * real thing and traces to nothing, and this is the single place a language model would most want
 * to help and the single place it must not
 */
const explain = (state: AppState, slots: Slots): AgentReply => {
  const wanted = new Set(slots.crops)
  const subject = slots.subject ?? ''
  /*
    The subject is read before the refusals are.

    A question about light must not fall through to the plan refusals. A named crop goes
    straight to them, and the first refusal standing against tomato is a rotation rule, so "will
    my tomatoes get enough sun" comes back as Verticillium wilt. The bed measurements answer the
    light question directly. A rotation rule is a true thing about that tomato and no answer at
    all to the question put
  */
  if (asksAboutLight(subject) && state.bedLight.length > 0) {
    const bedIds = asksAboutShade(subject) ? darkestBedIds(state) : null
    const ranked = rankedCropsForBeds(state, bedIds, 8)
    const plot = state.plot
    const bedLabels =
      bedIds === null
        ? (plot?.beds.map((bed) => bed.label) ?? [])
        : (plot?.beds.filter((bed) => bedIds.includes(bed.id)).map((bed) => bed.label) ?? [])
    const verdicts = wanted.size > 0 ? verdictsFor(state, [...wanted]) : []
    if (verdicts.length > 0 || ranked.length > 0) {
      return reply(
        [
          ...verdicts,
          ...(ranked.length === 0
            ? []
            : [
                {
                  kind: 'crops' as const,
                  cropIds: ranked,
                  source: 'ranked' as const,
                  bedLabels,
                  plantedHere: plantedIn(state, bedIds),
                  coverCropIds: coverCropIdsOf(state, ranked),
                },
              ]),
        ],
        { offer: ['list-crops', 'ask-calendar'] },
      )
    }
  }
  /**
   * And what the panels cost the harvest, which the seasons step computes by running the same year
   * again with every row pulled off the plot
   */
  if (asksPanelCost(subject)) {
    const compared = state.noPanels
    const latest = state.simulation.reports[state.simulation.reports.length - 1]
    if (compared.status === 'ready' && latest !== undefined && latest.harvestIndex !== null) {
      return reply([
        {
          kind: 'panel-cost',
          withPanels: latest.harvestIndex,
          withoutPanels: compared.value.harvestIndex,
          yearLabel: yearLabelOf(state),
        },
      ])
    }
    state.setSidebarStep('seasons')
    state.setSurface('edit')
    return reply([{ kind: 'panel-cost-run' }], { offer: ['ask-energy'] })
  }
  if (wanted.size === 0) {
    const answered = explainWithoutACrop(state, subject)
    if (answered !== null) return answered
  }
  const refusals = state.planRefusals.filter(
    (refusal) => wanted.size === 0 || wanted.has(refusal.cropId),
  )
  if (refusals.length > 0) return reply([{ kind: 'refusals', refusals }])
  if (state.sets.status === 'ready' && wanted.size > 0) {
    const verdicts = verdictsFor(state, [...wanted])
    if (verdicts.length > 0) return reply(verdicts, { offer: ['list-crops'] })
  }
  if (state.sets.status !== 'ready') return needsLight(state)
  return reply(
    [{ kind: 'no-reason', subject: slots.subject ?? '', canAsk: capabilitiesNow(state) }],
    { offer: ['list-crops', 'describe-garden'] },
  )
}

const setPlace = async (
  state: AppState,
  slots: Slots,
  signal: AbortSignal | null,
): Promise<AgentReply> => {
  const query = slots.place
  if (query === null) return blocked('location')
  try {
    const hits = await geocode(query, signal)
    const first = hits[0]
    if (first === undefined) return blocked('place-not-found', ['set-place'])
    state.setLocation(first.location, first.label)
    await state.resolveSite(first.location, first.label)
    return reply(
      [{ kind: 'place', label: first.label, attribution: first.attribution }, noted('location')],
      { did: [`location: ${first.label}`] },
    )
  } catch (error) {
    return reply([
      { kind: 'failed', message: error instanceof Error ? error.message : String(error) },
    ])
  }
}

/**
 * Wanting a crop, or not, as the SOFT pair.
 *
 * `PreferenceKind` offers both: `prefer`/`avoid` carry the grower's own strength and the ranking
 * may still overrule them, `require`/`exclude` are constraints it may not trade away. A router
 * that is sometimes wrong about which crop was named must not be able to write a constraint
 * nobody can see being enforced, and a soft signal is the recoverable direction to be wrong in.
 * It is also what the existing novice-facing control writes, so saying it out loud and ticking
 * the box do the same thing
 */
const setPreferences = (state: AppState, crops: readonly CropId[], liked: boolean): AgentReply => {
  const known = new Set(cropNames(state))
  const usable = crops.filter((id) => known.has(id))
  if (usable.length === 0) return blocked('catalog', ['list-crops'])
  for (const id of usable) state.setPreference(id, liked ? 'prefer' : 'avoid')
  return reply(
    [
      {
        kind: 'preference',
        liked: liked ? usable : [],
        disliked: liked ? [] : usable,
      },
    ],
    { did: usable.map((id) => `${liked ? 'like' : 'avoid'}: ${id}`), offer: ['list-crops'] },
  )
}

const propose = async (context: ActContext): Promise<AgentReply> => {
  const state = context.state()
  if (state.site.status !== 'ready') return blocked('location', ['set-place'])
  await state.suggestDesigns()
  // re-read: immer hands back a NEW state object per mutation, so `state` above is now the
  // design as it stood before the search and `state.onboarding.designs` would still be loading
  const after = context.state().onboarding.designs
  if (after.status === 'error') return reply([{ kind: 'failed', message: after.message }])
  if (after.status !== 'ready') return blocked('designs')
  const set = after.value
  return reply(
    [
      {
        kind: 'designs',
        archetypes: set.scenarios.map((entry) => entry.candidate.archetype),
        recommended: set.recommendedArchetype,
        notConsidered: set.notConsidered,
      },
    ],
    { offer: ['apply-design', 'explain'] },
  )
}

/**
 * Which of the five a sentence was pointing at.
 *
 * A named archetype wins; otherwise the recommendation does. Defaulting to the recommendation
 * here matters: "yes, do that" said after the agent has just described
 * what it suggests means the thing it suggested, and answering with a different design would be
 * the agent doing something nobody asked for while appearing to agree
 */
const chosenArchetype = (state: AppState, slots: Slots): CandidateArchetype | null => {
  const designs = state.onboarding.designs
  if (designs.status !== 'ready') return null
  const said = (slots.subject ?? '').toLowerCase()
  const named = designs.value.scenarios.find((entry) =>
    said.includes(entry.candidate.archetype.replace(/-/g, ' ')),
  )
  return named?.candidate.archetype ?? designs.value.recommendedArchetype
}

const applyChosen = async (context: ActContext, slots: Slots): Promise<AgentReply> => {
  const state = context.state()
  const archetype = chosenArchetype(state, slots)
  if (archetype === null) return blocked('designs', ['propose-designs'])
  const designs = state.onboarding.designs
  if (designs.status !== 'ready') return blocked('designs', ['propose-designs'])
  const scenario = designs.value.scenarios.find((entry) => entry.candidate.archetype === archetype)
  if (scenario === undefined) return blocked('designs', ['propose-designs'])
  await state.applyDesign(scenario)
  const generated = context.state().generated
  return reply(
    [
      { kind: 'applied', archetype },
      ...(generated !== null && generated.plantRefusals.length > 0
        ? [{ kind: 'refusals' as const, refusals: generated.plantRefusals }]
        : []),
    ],
    { did: [`applied: ${archetype}`], offer: ['describe-garden', 'plan-planting', 'undo'] },
  )
}

const planPlanting = async (context: ActContext): Promise<AgentReply> => {
  const plot = context.state().plot
  if (plot === null || plot.beds.length === 0) return blocked('beds', ['propose-designs'])
  /*
    The same press the plants step offers, through the same store action, so the agent cannot plant
    a garden the button would not. It waits for the light and the ranking itself, which is why
    nothing here checks for either first
  */
  await context.state().plantEveryBed()
  const after = context.state()
  if (after.generated === null) return needsLight(after)
  const planted = plantedCrops(after)
  /*
    And what became of the crops they actually asked for.

    Say "I want tomatoes and courgettes" and fill the beds: the garden that comes back can be
    lingonberry, with six lines about blueberries and coreopsis that nobody mentioned, and no
    word about the tomatoes. The preference leans the ranking without fixing it, which is right
    and is said out loud when it is recorded; what was missing is the other end of that sentence.
    Asked afterwards, the ranking answers instantly -- "the soil here is not deep enough for its
    roots" -- so the answer was there all along and only the asking was left to a grower who had
    no reason to think there was anything to ask about
  */
  const wanted = after.preferences.entries
    .filter((entry) => entry.kind === 'prefer' || entry.kind === 'require')
    .map((entry) => entry.cropId)
  const missing = wanted.filter((cropId) => !planted.includes(cropId))
  /*
    Only the verdicts that explain an absence. A crop the ranking is HAPPY with and that still did
    not go in reads, straight after a planting report, as though it had gone in: "summer squash is
    one the ranking is happy with here" is true, and beside "Planted: lingonberry" it is a sentence
    that has to be read twice
  */
  const explained = verdictsFor(after, missing).filter(
    (utterance) => utterance.kind === 'verdict' && utterance.limiting !== null,
  )
  const named = new Set(
    explained.flatMap((utterance) => (utterance.kind === 'verdict' ? [utterance.cropId] : [])),
  )
  // and the rest are said plainly. Nothing is recorded about why they are not
  // there, and a grower who asked for them is owed the fact even where there is no reason to give
  const unexplained = missing.filter((cropId) => !named.has(cropId))
  return reply(
    [
      { kind: 'planted', cropIds: planted },
      // before the refusals, not after: what became of what THEY asked for is the answer, and the
      // planner's notes about crops nobody named are the footnote
      ...explained,
      ...(unexplained.length > 0 ? [{ kind: 'not-planted' as const, cropIds: unexplained }] : []),
      ...(after.planRefusals.length > 0
        ? [{ kind: 'refusals' as const, refusals: after.planRefusals }]
        : []),
    ],
    { did: ['planted the beds'], offer: ['describe-garden', 'undo'] },
  )
}

/**
 * The agenda, built from the store exactly as `AgendaPanel` builds it.
 *
 * Not recomputed and not approximated: `buildAgenda` is the one thing that knows what to do and
 * when, it already carries its own caveats, and a second opinion assembled here would be a second
 * set of dates for one garden
 */
const agendaOf = (state: AppState): Agenda | null => {
  const plot = state.plot
  if (plot === null || state.calendars.status !== 'ready' || state.catalog.status !== 'ready') {
    return null
  }
  return buildAgenda({
    beds: plot.beds,
    calendars: state.calendars.value,
    catalog: state.catalog.value,
    frostRiskPercentile: state.frostPercentile,
    today: dayOfYearAt(
      state.todayUtcMillis,
      state.site.status === 'ready' ? state.site.value : null,
    ),
  })
}

/**
 * The next few things to do, or the dates for one crop.
 *
 * One code path for two questions, because they are the same question with a filter on it:
 * "what do I do first" is the agenda, and "when should I plant the beans" is the agenda about
 * beans. Splitting them would mean two ways of reading one set of dates
 */
const agendaReply = (state: AppState, crops: readonly CropId[], limit: number): AgentReply => {
  const agenda = agendaOf(state)
  if (agenda === null) return blocked('beds', ['propose-designs'])
  const wanted = new Set(crops)
  const items = agenda.groups
    .flatMap((group) => group.items)
    .filter((item) => wanted.size === 0 || wanted.has(item.cropId))
  if (items.length === 0) {
    /*
      A crop with no dates is not the same as an empty garden. `blocked` reads as "the app cannot
      do this yet"; what is true here is that this particular crop is not planted, or that the
      calendar refused to date it and said why in `agenda.blocked`
    */
    const why = agenda.blocked.filter((entry) => wanted.size === 0 || wanted.has(entry.cropId))
    if (why.length > 0) {
      return reply(
        [
          {
            kind: 'refusals',
            // an `AgendaBlock` carries its reasons as notes and a `PlanRefusal` carries one
            // string; joining them is the only reshaping of an engine-authored sentence anywhere
            refusals: why.map((entry) => ({
              bedId: entry.bedId,
              cropId: entry.cropId,
              reason: entry.notes.join(' '),
            })),
          },
        ],
        { offer: ['list-crops'] },
      )
    }
    if (wanted.size > 0) {
      return reply([{ kind: 'not-planted', cropIds: [...wanted] }], {
        offer: ['list-crops', 'plan-planting'],
      })
    }
    return reply([{ kind: 'no-reason', subject: '', canAsk: capabilitiesNow(state) }], {
      offer: ['describe-garden', 'list-crops'],
    })
  }
  return reply(
    [
      {
        kind: 'agenda',
        items: items.slice(0, limit),
        notes: agenda.notes,
        about: wanted.size === 0 ? 'everything' : 'crop',
      },
    ],
    { offer: ['describe-garden', 'ask-agenda'] },
  )
}

/**
 * The crops the corpus records a positive interaction with, for one named crop.
 *
 * Scored rules only. The catalogue also carries experimental and folklore rules and both are
 * shown elsewhere in the app under their own headings, which is the whole point of the
 * partition; an agent that answered "what goes well with tomatoes" out of the folklore shelf
 * would be laundering a claim the app is careful to label
 */
/**
 * What goes well with a crop, and the works that say so
 */
interface Companions {
  readonly cropIds: readonly CropId[]
  readonly citations: readonly CitationId[]
}

const companionsFor = (state: AppState, cropId: CropId): Companions => {
  const none = { cropIds: [], citations: [] }
  if (state.catalog.status !== 'ready' || state.companionRules.status !== 'ready') return none
  const catalog = state.catalog.value
  const subject = catalog.find((crop) => crop.id === cropId)
  if (subject === undefined) return none
  // valence is -1, 0 or 1; only a rule the corpus records as a BENEFIT answers "goes well with"
  const rules = state.companionRules.value.scoreable.filter((rule) => rule.valence === 1)
  const matched = catalog.flatMap((other) => {
    if (other.id === cropId) return []
    const joined = rules.filter((rule) => ruleJoinsPair(rule, subject, other))
    return joined.length === 0 ? [] : [{ id: other.id, rules: joined }]
  })
  return {
    cropIds: matched.map((entry) => entry.id),
    // deduplicated, because one work commonly backs several of these pairs and a reader wants the
    // set of works, without a separate marker per rule that happened to match
    citations: [
      ...new Set(matched.flatMap((entry) => entry.rules.flatMap((rule) => rule.citations))),
    ],
  }
}

/**
 * Carry out one understood sentence.
 *
 * Returns a reply for every input including the ones it refuses, because a conversational surface
 * that sometimes says nothing is indistinguishable from one that has crashed
 */
export const act = async (
  understanding: Understanding,
  context: ActContext,
): Promise<AgentReply> => {
  const state = context.state()
  const { slots } = understanding
  switch (understanding.intent) {
    case 'help':
      return reply([{ kind: 'help' }], { offer: ['propose-designs', 'list-crops', 'set-place'] })
    case 'show-the-form':
      state.setSurface('edit')
      return reply([{ kind: 'handed-over' }])
    case 'describe-garden':
      return summarise(state)
    case 'explain':
      return explain(state, slots)
    case 'list-crops': {
      /*
        "What will still grow in the SHADE under the panels" is a different question from "what
        can I grow", and answering it from every bed at once is how a reply about a bright bed
        landed on somebody who had just planted the dim one. The per-bed light already sitting on
        `bedLight` is what "under the panels" means, measured
      */
      const shaded = asksAboutShade(slots.subject)
      const bedIds = shaded ? darkestBedIds(state) : null
      const ranked = rankedCropsForBeds(state, bedIds, 8)
      if (ranked.length > 0) {
        const plot = state.plot
        const bedLabels =
          bedIds === null
            ? (plot?.beds.map((bed) => bed.label) ?? [])
            : (plot?.beds.filter((bed) => bedIds.includes(bed.id)).map((bed) => bed.label) ?? [])
        // and somewhere to go from the list: planting it, or the dates for what is in the beds
        return reply(
          [
            {
              kind: 'crops',
              cropIds: ranked,
              source: 'ranked',
              bedLabels,
              plantedHere: plantedIn(state, bedIds),
              coverCropIds: coverCropIdsOf(state, ranked),
            },
          ],
          { offer: ['plan-planting', 'ask-calendar'] },
        )
      }
      const planted = plantedCrops(state)
      if (planted.length > 0) {
        return reply(
          [
            {
              kind: 'crops',
              cropIds: planted,
              source: 'planted',
              bedLabels: [],
              plantedHere: planted,
              coverCropIds: coverCropIdsOf(state, planted),
            },
          ],
          { offer: ['ask-calendar', 'propose-designs'] },
        )
      }
      return needsLight(state)
    }
    case 'set-place':
      return setPlace(state, slots, context.signal ?? null)
    case 'set-space': {
      if (slots.widthM === null) return blocked('plot')
      const widthM = slots.widthM
      // the boundary is the one source of the plot's size, so "make it 8 by 5" is a resize of
      // the plot on screen, and the search reads its size off that
      const depthM = slots.depthM ?? plotSizeOf(state.plot).depthM
      state.setBoundary(polygonOf(rectangleRing(vec2(0, 0), widthM, depthM)))
      return reply([{ kind: 'resized', widthM, depthM }, noted('space')], { did: ['plot size'] })
    }
    case 'set-exposure': {
      if (slots.exposure === null) return blocked('plot')
      state.answerOnboarding({ exposure: slots.exposure })
      return reply([noted('surroundings')], { did: [`surroundings: ${slots.exposure}`] })
    }
    case 'set-ambition': {
      /*
        The crops it named are recorded as well as the category, and this is the one thing on this
        surface the form cannot do at all.
      
        "I want tomatoes and courgettes" typed while the growing question is on screen is an answer
        to that question, and `slotFilled` rightly says so. Recording only "vegetables" would drop
        both names, and the beds could then fill with lingonberry and never mention the tomatoes.
        The wizard's growing step is a list of categories; naming a crop is precisely what somebody
        types a sentence in order to do
      */
      const known = new Set(cropNames(state))
      const usable = slots.crops.filter((id) => known.has(id))
      for (const id of usable) state.setPreference(id, 'prefer')
      const preference: readonly Utterance[] =
        usable.length === 0 ? [] : [{ kind: 'preference', liked: usable, disliked: [] }]
      if (slots.ambition === null) {
        // no category, but names: the question is not answered and the preference still is
        if (usable.length === 0) return blocked('catalog', ['list-crops'])
        return reply(preference, { did: usable.map((id) => `like: ${id}`) })
      }
      state.answerOnboarding({ ambition: slots.ambition })
      return reply([noted('growing'), ...preference], {
        did: [`growing: ${slots.ambition}`, ...usable.map((id) => `like: ${id}`)],
      })
    }
    case 'set-natives': {
      if (slots.yesNo === null) return blocked('catalog')
      state.setWildlife({ favourNative: slots.yesNo })
      return reply([noted('natives')], { did: [`natives: ${String(slots.yesNo)}`] })
    }
    case 'set-pollinators': {
      if (slots.yesNo === null) return blocked('catalog')
      state.setWildlife({ favourPollinators: slots.yesNo })
      return reply([noted('pollinators')], { did: [`pollinators: ${String(slots.yesNo)}`] })
    }
    case 'set-objective': {
      const preset = OBJECTIVE_PRESETS.find((entry) => entry.id === slots.objective)
      if (preset === undefined) return blocked('plot')
      state.answerOnboarding({ objective: preset.weights })
      return reply([noted('objective')], { did: [`objective: ${preset.id}`] })
    }
    case 'set-mounting': {
      if (slots.mounting === null) return blocked('plot')
      state.answerOnboarding({ mounting: slots.mounting })
      return reply([noted('mounting')], { did: [`mounting: ${slots.mounting}`] })
    }
    case 'set-height': {
      // "there is no height limit" is an answer, and it arrives as a refusal with no number in it
      const limit = slots.lengthM === null ? null : meters(slots.lengthM)
      state.answerOnboarding({ maxHeightM: slots.yesNo === false ? null : limit })
      return reply([noted('height')], { did: ['height limit'] })
    }
    case 'set-water': {
      if (slots.yesNo === null) return blocked('plot')
      state.answerOnboarding({ irrigationAvailable: slots.yesNo })
      return reply([noted('water')], { did: [`water: ${String(slots.yesNo)}`] })
    }
    case 'like-crop':
      return setPreferences(state, slots.crops, true)
    case 'dislike-crop':
      return setPreferences(state, slots.crops, false)
    case 'propose-designs':
      return propose(context)
    case 'apply-design':
      return applyChosen(context, slots)
    case 'plan-planting':
      return planPlanting(context)
    case 'undo':
      state.undoGeneration()
      return reply([{ kind: 'undone' }], { did: ['undone'], offer: ['describe-garden'] })
    case 'define':
      return reply([{ kind: 'define' }], { offer: ['propose-designs', 'list-crops'] })
    case 'greeting':
      /*
        Answered with the question that was already on the table, because a greeting is not a turn
        in the conversation and dropping the thread after one would leave the visitor looking at a
        cheerful sentence and no next step
      */
      return reply([
        { kind: 'greeting', sort: slots.subject === 'thanks' ? 'thanks' : 'hello' },
        { kind: 'ask', step: state.onboarding.step },
      ])
    case 'out-of-scope': {
      if (slots.scope === null) {
        return reply([
          { kind: 'no-reason', subject: slots.subject ?? '', canAsk: capabilitiesNow(state) },
        ])
      }
      return reply([{ kind: 'out-of-scope', topic: slots.scope }], {
        offer: ['ask-energy', 'list-crops', 'describe-garden'],
      })
    }
    case 'ask-energy': {
      if (state.energy.status === 'ready') {
        return reply(
          [{ kind: 'energy', report: state.energy.value, assumptions: arrayAssumptions(state) }],
          { offer: ['ask-compliance'] },
        )
      }
      /*
        A season already carries this year's own AC figure, computed the same way `runEnergy`
        computes it. The fuller report answers more fully, but the narrower one already sitting in
        `simulation.reports` is a real answer to give straight away
      */
      const lastSeason = [...state.simulation.reports].reverse().find((r) => r.energyKwh !== null)
      if (lastSeason !== undefined && lastSeason.energyKwh !== null) {
        return reply(
          [
            {
              kind: 'season-energy',
              energyKwh: lastSeason.energyKwh,
              yearLabel: lastSeason.year.label,
              assumptions: arrayAssumptions(state),
            },
          ],
          { offer: ['ask-compliance'] },
        )
      }
      const plot = state.plot
      if (plot === null || plot.arrays.length === 0) return blocked('designs', ['propose-designs'])
      /*
        `runEnergy` runs the PV chain in place, without scheduling it on a worker, so the result is
        already sitting in the store the instant it returns. It is read back at once, and a run that
        failed is reported as a failure
      */
      state.runEnergy()
      const after = context.state()
      if (after.energy.status === 'ready') {
        return reply(
          [{ kind: 'energy', report: after.energy.value, assumptions: arrayAssumptions(after) }],
          { offer: ['ask-compliance'] },
        )
      }
      if (after.energy.status === 'error') {
        return reply([{ kind: 'failed', message: after.energy.message }])
      }
      return blocked('energy', ['ask-energy'])
    }
    case 'ask-calendar':
      return agendaReply(state, slots.crops, 6)
    case 'ask-agenda':
      return agendaReply(state, [], 6)
    case 'ask-compliance': {
      if (state.compliance.length === 0) return needsLight(state)
      return reply([{ kind: 'compliance', checks: state.compliance }], { offer: ['ask-sources'] })
    }
    case 'ask-water': {
      const view = waterBalanceView(state)
      if (view.balances.length === 0) return needsLight(state)
      return reply([{ kind: 'water', balances: view.balances }], { offer: ['describe-garden'] })
    }
    case 'ask-companions': {
      const cropId = slots.crops[0]
      if (cropId === undefined) return blocked('catalog', ['list-crops'])
      const { cropIds: withCropIds, citations } = companionsFor(state, cropId)
      if (withCropIds.length === 0) {
        return reply([{ kind: 'no-reason', subject: '', canAsk: capabilitiesNow(state) }], {
          offer: ['list-crops'],
        })
      }
      return reply([{ kind: 'companions', cropId, withCropIds, citations }], {
        offer: ['ask-sources'],
      })
    }
    case 'remove-planting': {
      const plot = state.plot
      const wanted = new Set(slots.crops)
      if (plot === null || wanted.size === 0) return blocked('catalog', ['describe-garden'])
      let removed = 0
      for (const bed of plot.beds) {
        for (const planting of bed.plantings) {
          if (!wanted.has(planting.cropId)) continue
          state.removePlanting(bed.id, planting.id)
          removed += 1
        }
      }
      if (removed === 0) {
        // not "I have nothing recorded": the crop simply is not planted, and saying which is
        // the difference between a failure and an answer
        return reply([{ kind: 'not-planted', cropIds: [...wanted] }], {
          offer: ['describe-garden', 'plan-planting'],
        })
      }
      return reply([{ kind: 'removed', cropIds: [...wanted], count: removed }], {
        did: [`removed ${String(removed)} plantings`],
        offer: ['describe-garden', 'list-crops'],
      })
    }
    case 'add-bed': {
      const plot = state.plot
      if (plot === null) return blocked('plot')
      /*
        Placed by `makeBed`'s own geometry, with nothing computed here. Where a bed
        should go is a question about the light, which is the design search's job; what this does
        is give the grower one more bed to put something in, in the row the defaults lay out
      */
      const bed = makeBed(nextBedIndex(plot.beds), {
        soil: soilForSite(state.site.status === 'ready' ? state.site.value : null),
      })
      state.upsertBed(bed)
      return reply([{ kind: 'bed-added', label: bed.label }], {
        did: [`added ${bed.label}`],
        offer: ['plan-planting', 'describe-garden'],
      })
    }
    case 'adjust-panels': {
      const plot = state.plot
      const array = plot?.arrays[0]
      if (plot === null || array === undefined) return blocked('designs', ['propose-designs'])
      if (slots.panels === null) return blocked('plot')
      /*
        One step per asking, and the step sizes are the ones the editor's own controls step by.
        An absolute figure is taken when one is given -- "make them three metres tall" -- because
        somebody who names a number means it
      */
      const asked = slots.lengthM
      const geometry = array.geometry
      const clearance = geometry.clearanceHeightM as number
      const pitch = geometry.pitchM as number
      const next =
        slots.panels === 'taller'
          ? { clearanceHeightM: meters(asked ?? clearance + PANEL_STEP_M) }
          : slots.panels === 'lower'
            ? { clearanceHeightM: meters(Math.max(0, asked ?? clearance - PANEL_STEP_M)) }
            : slots.panels === 'wider-spacing'
              ? { pitchM: meters(asked ?? pitch + PANEL_STEP_M) }
              : slots.panels === 'tighter-spacing'
                ? {
                    // never below the collector width, which is the row overlapping itself
                    pitchM: meters(
                      Math.max(geometry.collectorWidthM as number, asked ?? pitch - PANEL_STEP_M),
                    ),
                  }
                : {}
      const tracker =
        array.tracker.mode !== 'fixed'
          ? array.tracker
          : slots.panels === 'steeper'
            ? {
                ...array.tracker,
                tiltDeg: degrees(Math.min(60, (array.tracker.tiltDeg as number) + TILT_STEP_DEG)),
              }
            : slots.panels === 'flatter'
              ? {
                  ...array.tracker,
                  tiltDeg: degrees(Math.max(0, (array.tracker.tiltDeg as number) - TILT_STEP_DEG)),
                }
              : array.tracker
      state.upsertArray({ ...array, geometry: { ...geometry, ...next }, tracker })
      const after = context.state().plot?.arrays[0]
      if (after === undefined) return blocked('designs')
      return reply(
        [
          {
            kind: 'panels-adjusted',
            change: slots.panels,
            clearanceM: after.geometry.clearanceHeightM as number,
            pitchM: after.geometry.pitchM as number,
            tiltDeg: after.tracker.mode === 'fixed' ? (after.tracker.tiltDeg as number) : null,
          },
        ],
        { did: [`panels: ${slots.panels}`], offer: ['ask-energy', 'ask-compliance'] },
      )
    }
    case 'start-over':
      state.clearDesign()
      return reply([{ kind: 'started-over' }], { did: ['cleared'], offer: ['set-place'] })
    case 'ask-sources':
      // opened directly: it is the reference shelf and it is already on a step
      state.setSidebarStep('sources')
      state.setSurface('edit')
      return reply([{ kind: 'sources' }])
  }
}
