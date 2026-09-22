import type { IntentId } from '../agent/intent'
import { approxKwh, approxPercent } from '../simulation/coach'
import type { BlockedNeed, Capability, Utterance } from '../agent/reply'
import type { CitationId } from '../types/citation-ids.generated'
import type { Tone } from '../agent/transcript'
import type { OnboardingStep } from '../state/slices'
import type { ScopeTopic } from '../agent/vocabulary'
import type { ComplianceCheck, ComplianceOutcome } from '../types/compliance'
import { ARCHETYPE_LABEL } from '../recommend/design'
import { cropName } from '../data/crops'
import { explainLimitingFactor } from './format'
import type { Crop } from '../types/crop'
import { actionLabel } from './agenda'
import { dayLabel } from './calendar'
import { criterionSummary, formatBandPercent, formatBandRange, OUTCOME_LABEL } from './format'
import { NOT_A_DETERMINATION, STEP_COPY } from './onboarding'
import { stageOf } from '../sim/pv/provenance'

/**
 * Where the agent's words come from, and the only place they come from.
 *
 * `src/agent` cannot import this file, by the architectural rule and by the lint rule that backs
 * it, so nothing upstream is able to compose a sentence. What crosses the boundary is a step, a
 * crop id, an archetype and an engine-authored refusal; this turns those into the same words the
 * wizard already uses for the same things. Ask the guided path and ask the agent, and they answer
 * out of one table.
 *
 * The `caveat` tone is not decoration. `Cited` values in this app carry a caveat and the doctrine
 * is that the only thing ever hidden is detail and a caveat is never detail. A conversational
 * surface is where that would go first, because a caveat reads as a hedge in a chat bubble, so it
 * is a tone the panel is obliged to render
 */
/**
 * One line of a reply, and how it is drawn.
 *
 * `Tone` comes from `agent/transcript.ts` alone, because the transcript
 * stores these and validates them on the way back: two copies of the list meant a new tone had to
 * be added twice, and forgetting the second silently threw away every restored turn using it.
 *
 * `provenance` is separate from `caveat` because they are separate things, and calling both a
 * caveat made one of them a lie. The energy answer carries the model chain: which cell-temperature
 * model ran, which inverter model did not and why, where the albedo numbers came from. Under
 * "What that answer does not cover", the entry saying the Sandia model is "available but not the
 * default" reads as a limitation of the figure, which it is not, and seven paragraphs behind a
 * warning rule are read exactly as carefully as no warning at all.
 *
 * Nothing is hidden by the split and nothing may be. What changes is the sentence above it: a
 * reader may skim how a thing was computed and may not skim what it does not cover, and that
 * sentence is what tells them apart
 */
export interface Line {
  readonly text: string
  readonly tone: Tone
  /**
   * The works this line rests on. Ids, resolved to a label and a control by the panel.
   *
   * `StoredLine` carries the same field for the same reason, and the transcript validates them
   * against the generated list on the way back in. See it for why the absence of one is
   * information too
   */
  readonly citations?: readonly CitationId[]
}

/**
 * What each intent is called when it is offered as something to tap.
 *
 * A total `Record` and not a lookup with a fallback, so an intent added to `IntentId` fails the
 * build here; it never appears in the interface as its own kebab-case identifier
 */
export const INTENT_LABEL: Readonly<Record<IntentId, string>> = {
  help: 'What can you do?',
  'describe-garden': 'What have I got?',
  explain: 'Why?',
  'list-crops': 'What can I grow?',
  'set-place': 'Where the garden is',
  'set-space': 'How big it is',
  'set-exposure': 'What is around it',
  'set-ambition': 'What I want to grow',
  'set-natives': 'Native plants',
  'set-pollinators': 'Plants for bees',
  'set-objective': 'Food or electricity',
  'set-mounting': 'How the panels sit',
  'set-height': 'A height limit',
  'set-water': 'Whether I can water it',
  'like-crop': 'Something I want',
  'dislike-crop': "Something I don't want",
  'propose-designs': 'Design it for me',
  'apply-design': 'Use that one',
  'plan-planting': 'Fill the beds',
  undo: 'Undo that',
  'show-the-form': 'Show me the questions instead',
  define: 'What is this for?',
  'ask-energy': 'How much electricity?',
  'ask-calendar': 'When do I plant it?',
  'ask-agenda': 'What do I do now?',
  'ask-compliance': 'What about the rules?',
  'ask-water': 'How much watering?',
  'ask-companions': 'What goes well with it?',
  'ask-sources': 'Where does this come from?',
  'remove-planting': 'Take something out',
  'add-bed': 'Add another bed',
  'start-over': 'Start over',
  'out-of-scope': 'Something else',
  'adjust-panels': 'Move the panels',
  greeting: 'Hello',
}

/**
 * What this application does not model, said specifically.
 *
 * Each names the thing and then says what IS on offer, because a refusal that only refuses leaves
 * a novice with nowhere to go. These are UI words for a limit the engine already states in its
 * own caveats; nothing here is a claim about the garden
 */
export const OUT_OF_SCOPE: Readonly<Record<ScopeTopic, string>> = {
  cost: "I have nothing on cost or payback. This computes light, yield and electricity, and it never sees a price. I can tell you the kilowatt hours, and you'd need a tariff to turn that into money.",
  permitting:
    "I can't tell you what you need permission for. I do check a design against the Massachusetts fast-track parameters, which is a different thing and isn't a determination either.",
  wildlife:
    'Deer, rabbits, slugs and birds are not modelled here at all. Nothing I say about a bed accounts for anything eating it.',
  grid: 'Grid connection, export and storage are outside what this computes. It stops at the electricity the panels would make.',
  structure:
    "How the panels are mounted, founded and installed isn't something this covers. It computes where the shade falls. What holds the frame up is outside it.",
  soil: "I can't take a description of your soil in words. The bed panel in the editor has the real fields for it, and what you put there does reach the recommendations.",
}

/**
 * What is missing, and what to do about it. Never "I cannot do that" on its own.
 *
 * Total over `BlockedNeed` for the same reason `INTENT_LABEL` is total: a refusal with no words
 * is the worst thing this surface can produce, so a new way of being blocked has to fail the
 * build
 */
export const BLOCKED_TEXT: Readonly<Record<BlockedNeed, string>> = {
  location: 'I need to know where the garden is first. Tell me a town or an address.',
  'place-not-found': "I couldn't find that one. Try a town and its country, or a fuller address.",
  plot: "I didn't catch a size for that. Roughly how many metres across and how deep is it?",
  beds: 'There are no beds to plant yet. I can design a layout first if you like.',
  /*
    Worded for the sun, because this one need stands behind six different
    questions, some unrelated to ranking, like "is this legal". Framing it around a missing
    ranking would read as the agent answering a different question
  */
  'light-running':
    'I have started running the sun over this garden. I will answer as soon as it lands.',
  /*
    Distinct from `light-running` because it is a different, cheaper run: the sun is already
    computed, and only the ranking that reads it is missing. Saying "running the sun" here would
    describe work that already finished
  */
  'ranking-running':
    'The light is computed. I have started ranking crops against it. I will answer as soon as it lands.',
  designs: "I haven't computed any layouts yet. Ask me to design it and I will.",
  catalog: "I don't know that one. It may not be in the catalogue this build ships.",
  /**
   * "Ask me again in a moment" would ask somebody who cannot see a progress bar to guess how long a
   * year of light simulation takes. The panel watches for the run landing and finishes the sentence
   * itself, so both lines say so
   */
  energy:
    'Nothing has generated a figure yet, so I have started the annual run. I will answer as soon as it lands.',
}

/**
 * What is worth asking about right now, one line each. Said when nothing else was recorded to
 * say, so an empty answer still points at something a visitor can press
 */
const CAPABILITY_LINE: Readonly<Record<Capability, string>> = {
  grow: 'What grows here, ranked for the light each bed gets.',
  energy: 'The electricity figure for the panels, for a year.',
  calendar: "Sowing and harvest dates for what's in the beds.",
  sources: 'The sources everything here is checked against.',
  season: 'Running a season, to see how a year plays out.',
}

/**
 * What this whole application is, and what it does with the idea, in words a beginner can repeat.
 *
 * `COLD_OPEN_TITLE` and `COLD_OPEN_CAVEAT`, the light legend's own narration about one example
 * bed's place in a range, would answer "what is agrivoltaics" with a sentence about where a bed
 * sits in a range, which defines nothing. These lines define it
 */
const DEFINE_LINES: readonly Line[] = [
  {
    text: 'Agrivoltaics grows crops and makes electricity on the same plot, panels set over or beside the beds.',
    tone: 'say',
  },
  {
    text: 'The panels cast shade, and the light that reaches a bed decides what will grow there.',
    tone: 'note',
  },
  {
    text: 'This app measures that light bed by bed, ranks crops against it, and runs seasons across a year.',
    tone: 'note',
  },
]

/**
 * How many programmes were checked and how they fell out, in one sentence.
 *
 * Counts only. The words for each outcome are lifted from `OUTCOME_LABEL` in lower case rather
 * than written again here, so the headline and the rows under it cannot drift apart, and so this
 * stays inside the language `compliance-language.test.ts` polices: nothing here may read as a
 * determination, and "meets", "would need" and "cannot be judged" are the three things it may say
 */
const complianceHeadline = (checks: readonly ComplianceCheck[]): string => {
  const count = (outcome: ComplianceOutcome): number =>
    checks.filter((check) => check.overall === outcome).length
  const parts = [
    [count('meets-expedited-parameters'), 'meet the expedited design parameters'] as const,
    [count('requires-exception-request'), 'would need an exception request'] as const,
    [count('indeterminate'), 'cannot be computed from the shapes alone'] as const,
  ]
    .filter(([n]) => n > 0)
    .map(([n, words]) => `${String(n)} ${words}`)
  const programmes = `${String(checks.length)} programme${checks.length === 1 ? '' : 's'}`
  return parts.length === 0
    ? `I looked at ${programmes} and have nothing to report on any of them.`
    : `I looked at ${programmes}: ${list(parts)}.`
}

const list = (names: readonly string[]): string =>
  names.length <= 1
    ? (names[0] ?? '')
    : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1] ?? ''}`

const named = (catalog: readonly Crop[], ids: readonly string[]): string =>
  list(ids.map((id) => cropName(catalog, id as Parameters<typeof cropName>[1])))

/**
 * The same question a second time running, without the paragraph that explains it.
 *
 * Answering the height question while a different one (native planting, say) is on screen can get
 * back "Got it." followed by that question again, word for word, help text and all: heard
 * perfectly well, yet it reads as a loop. What is worth repeating is the question
 */
export const askAgain = (step: OnboardingStep): readonly Line[] => [
  { text: STEP_COPY[step].title, tone: 'say' },
]

/**
 * One utterance, as lines.
 *
 * Several utterances produce more than one line, and the split is always the same: what happened
 * on the first, and anything that qualifies it on its own line after. A caveat folded into the
 * end of a sentence is a caveat a reader skips
 */
export const wordsFor = (utterance: Utterance, catalog: readonly Crop[]): readonly Line[] => {
  switch (utterance.kind) {
    case 'ask':
      return [
        { text: STEP_COPY[utterance.step].title, tone: 'say' },
        { text: STEP_COPY[utterance.step].help, tone: 'note' },
      ]
    case 'help':
      return [
        { text: 'You can tell me things like this, in your own words:', tone: 'say' },
        {
          text: 'I live in Amherst. My plot is 6 by 4 metres. I want to grow tomatoes. Design it for me.',
          tone: 'note',
        },
      ]
    case 'handed-over':
      return [
        { text: 'Alright. The questions are on screen, and I will stay out of it.', tone: 'say' },
      ]
    case 'not-understood':
      return [
        { text: "I didn't follow that.", tone: 'say' },
        ...(utterance.near.length === 0
          ? [
              {
                text: 'Try telling me where the garden is, or what you want to grow.',
                tone: 'note' as const,
              },
            ]
          : [{ text: 'Did you mean one of these?', tone: 'note' as const }]),
      ]
    /*
      Not an apology, because nothing went wrong. The sentence was heard and it has two readings
      that would do different things to the garden, so the choice goes back to the person who
      knows which they meant. The chips under it are the readings
    */
    case 'unsure':
      return [
        { text: 'That could mean a couple of things.', tone: 'say' },
        { text: 'Which did you mean?', tone: 'note' },
      ]
    case 'noted':
      // just the acknowledgement: what to ask next is a separate utterance, decided by the
      // conversation
      return [{ text: 'Got it.', tone: 'say' }]
    case 'preference':
      return [
        {
          text:
            utterance.liked.length > 0
              ? `I have noted that you would like ${named(catalog, utterance.liked)}.`
              : `I have noted that you would rather not have ${named(catalog, utterance.disliked)}.`,
          tone: 'say',
        },
        {
          // said out loud because the alternative is a grower who thinks they have set a rule
          text: "That leans the ranking, and it fixes nothing. If the light won't carry it, it still won't.",
          tone: 'caveat',
        },
      ]
    case 'place':
      return [
        { text: `${utterance.label}. I will work from there.`, tone: 'say' },
        { text: utterance.attribution, tone: 'caveat' },
      ]
    case 'blocked':
      return [{ text: BLOCKED_TEXT[utterance.need], tone: 'say' }]
    case 'garden': {
      const s = utterance.summary
      return [
        {
          text: `${s.locationLabel}: ${String(s.bedCount)} bed${s.bedCount === 1 ? '' : 's'} and ${String(s.arrayCount)} panel row${s.arrayCount === 1 ? '' : 's'} over about ${s.plotAreaM2.toFixed(0)} square metres.`,
          tone: 'say',
        },
        {
          text:
            s.plantingCount === 0
              ? 'Nothing is planted in them yet.'
              : `${String(s.plantingCount)} plantings in the beds.`,
          tone: 'note',
        },
      ]
    }
    case 'crops': {
      /*
        Cover crops -- a role other than the main one, from `PlantingRole` -- go after the food
        crops, or stand in for them: a ranking whose top picks are all cover crops still deserves
        a first line, and calling nothing "the crops" while the real answer waits in a footnote is
        how a reply reads as truncated
      */
      const cover = new Set(utterance.coverCropIds)
      const foodIds = utterance.cropIds.filter((id) => !cover.has(id))
      const coverIds = utterance.cropIds.filter((id) => cover.has(id))
      const primary = foodIds.length > 0 ? foodIds : coverIds
      const secondary = foodIds.length > 0 ? coverIds : []
      // what the ranking says AND what is already growing there, together, is the fix for a
      // ranking that reads as unrelated to a garden that was just planted from it
      const already = primary.filter((id) => utterance.plantedHere.includes(id))
      const beds = utterance.bedLabels
      return [
        {
          text:
            utterance.source === 'planted'
              ? `You have these in the beds: ${named(catalog, primary)}.`
              : beds.length === 0
                ? `Ranked for the light these beds get: ${named(catalog, primary)}.`
                : `Ranked for the light ${list(beds)} ${beds.length === 1 ? 'gets' : 'get'}: ${named(catalog, primary)}.`,
          tone: 'say',
        },
        ...(secondary.length === 0
          ? []
          : [
              {
                text: `Cover crops, ranked the same way: ${named(catalog, secondary)}.`,
                tone: 'note' as const,
              },
            ]),
        ...(utterance.source === 'ranked' && already.length > 0
          ? [
              {
                text: `${named(catalog, already)} ${already.length === 1 ? 'is' : 'are'} already planted there.`,
                tone: 'note' as const,
              },
            ]
          : []),
      ]
    }
    case 'designs':
      return [
        {
          text: `I computed ${String(utterance.archetypes.length)} layouts. The one I would go with is ${ARCHETYPE_LABEL[utterance.recommended]}.`,
          tone: 'say',
        },
        // the search's own account of its limits, verbatim, because it is the sentence that keeps
        // five geometries from reading as every geometry
        ...utterance.notConsidered.map((text) => ({ text, tone: 'caveat' as const })),
      ]
    case 'applied':
      return [
        {
          text: `Done. That is ${ARCHETYPE_LABEL[utterance.archetype]} on the ground now.`,
          tone: 'say',
        },
      ]
    case 'planted':
      return [
        {
          text:
            utterance.cropIds.length === 0
              ? 'Nothing would go in, I am afraid.'
              : `Planted: ${named(catalog, utterance.cropIds)}.`,
          tone: 'say',
        },
      ]
    case 'refusals': {
      /*
        One line per crop, not one per crop per bed.

        The planner reports a refusal for every bed it tried, so three crops across two beds would
        come back as six lines that all say the beds are full, in the same words with a different
        bed name, burying the two-line answer about what the grower actually asked for.

        The reason itself is never rephrased -- a shorter version of a reason is a different
        reason -- so what is shown is the first one verbatim, bed name and all
      */
      const first = new Map<string, string>()
      for (const refusal of utterance.refusals) {
        if (!first.has(refusal.cropId)) first.set(refusal.cropId, refusal.reason)
      }
      return [
        { text: 'Some of it would not go in:', tone: 'say' },
        ...[...first].map(([cropId, reason]) => ({
          text: `${cropName(catalog, cropId as Parameters<typeof cropName>[1])}: ${reason}`,
          tone: 'note' as const,
        })),
      ]
    }
    case 'verdict':
      return [
        {
          text:
            utterance.limiting === null
              ? `${cropName(catalog, utterance.cropId)} is one the ranking is happy with here.`
              : `${cropName(catalog, utterance.cropId)}: ${explainLimitingFactor(utterance.limiting, 'novice', catalog)}`,
          tone: 'say',
        },
      ]
    case 'no-reason':
      return [
        {
          // said plainly, because the alternative is inventing one. "I did not follow that" would
          // be false: the question was understood perfectly
          text: 'I understood you, and I have nothing recorded about that one.',
          tone: 'say',
        },
        // what it CAN answer, read off the store. A blank reply
        // that never says what to ask next fails the one thing an empty answer owes the person
        // who just got it
        ...utterance.canAsk.map((capability) => ({
          text: CAPABILITY_LINE[capability],
          tone: 'note' as const,
        })),
      ]
    case 'define':
      return DEFINE_LINES
    case 'energy': {
      const report = utterance.report
      const assumptions = utterance.assumptions
      return [
        {
          text: `The panels make ${approxKwh(report.annualAcKwh)} a year, ${formatBandPercent(report.energyRatio)} of the electricity the same panels would make in an open field.`,
          tone: 'say' as const,
        },
        {
          text: `${report.specificYieldKwhPerKwp.toFixed(0)} kWh per kWp installed, over ${report.landAreaM2.toFixed(0)} square metres of ground.`,
          tone: 'note' as const,
        },
        // what the figure assumes about the array itself: the other half of "what does that
        // assume", the model chain below being the half the report's own provenance already says
        ...(assumptions
          ? [
              {
                text: `That runs on ${assumptions.clearanceM.toFixed(1)} m of headroom, rows ${assumptions.pitchM.toFixed(1)} m apart${assumptions.tiltDeg === null ? '' : `, tilted ${assumptions.tiltDeg.toFixed(0)} degrees`}.`,
                tone: 'note' as const,
              },
            ]
          : []),
        /*
          The model chain, each note under the step it belongs to, which is what `EnergyPanel`
          shows and in the same order.

          Kept alone, the note "Available but not the default, because a, b and dT are empirical per
          module construction" would stand on its own with no subject at all: a sentence about the
          Sandia cell-temperature model that never mentions it.

          The stage alone, so the equations stay in the panel where
          somebody went looking for them. `T_cell = T_air + G_poa / (u0 + u1 * v_wind)` between a
          grower and the sentence that qualifies their figure helps nobody, and an equation is
          detail in the sense this app's doctrine means it. The caveat is kept word for word.

          And a stage with no caveat is left out entirely, because it makes no qualification: all
          it had to say was its equation, and "DC power, PVWatts v5" on its own is a heading with
          nothing under it. Eight lines become six, and the six are the six that qualify the number
        */
        ...report.provenance.flatMap((cited) =>
          cited.caveat === null
            ? []
            : [
                {
                  text: `${stageOf(cited)}. ${cited.caveat}`,
                  tone: 'provenance' as const,
                  // the works are right here on the same `Cited` the caveat came off, so the source
                  // reaches the reader with the hedge
                  citations: cited.citations,
                },
              ],
        ),
      ].filter((line) => line.text !== '')
    }
    case 'panel-cost': {
      const with_ = utterance.withPanels
      const without = utterance.withoutPanels
      if (without === null) {
        return [
          {
            text: `With the panels, ${utterance.yearLabel} brought in ${approxPercent(with_)} of full yield. With no panels the same year grew nothing, so there is no difference to give you.`,
            tone: 'say',
          },
        ]
      }
      const gap = Math.round((without - with_) * 100)
      const cost =
        gap === 0
          ? 'the same as with them'
          : `${String(Math.abs(gap))} ${Math.abs(gap) === 1 ? 'point' : 'points'} ${gap > 0 ? 'more' : 'less'}`
      return [
        {
          text: `With the panels, ${utterance.yearLabel} brought in ${approxPercent(with_)} of full yield. The same year with no panels brought in ${approxPercent(without)}, ${cost}.`,
          tone: 'say',
        },
        {
          text: 'Both figures are the same plantings, the same weather year and the same seed, so the shade is the only thing that changed between them.',
          tone: 'note',
        },
      ]
    }
    case 'panel-cost-run':
      return [
        {
          text: "I can work that out by running the same year again with every panel row taken off the plot. I've opened the seasons step, press Compare with no panels there and I'll have both figures.",
          tone: 'say',
        },
      ]
    case 'season-energy': {
      const assumptions = utterance.assumptions
      return [
        {
          text: `The last season you ran, ${utterance.yearLabel}, made ${approxKwh(utterance.energyKwh)}.`,
          tone: 'say',
        },
        ...(assumptions
          ? [
              {
                text: `That runs on ${assumptions.clearanceM.toFixed(1)} m of headroom, rows ${assumptions.pitchM.toFixed(1)} m apart${assumptions.tiltDeg === null ? '' : `, tilted ${assumptions.tiltDeg.toFixed(0)} degrees`}.`,
                tone: 'note' as const,
              },
            ]
          : []),
      ]
    }
    case 'agenda':
      return [
        {
          text: utterance.about === 'crop' ? 'Here are its dates:' : 'The next few things to do:',
          tone: 'say',
        },
        /*
          One line per thing to do, not one per bed.

          The agenda is built per bed, so a garden with the same crop in two beds produced "1 Sep:
          First harvest lingonberry" twice over, one after the other, with nothing to tell them
          apart. On the panel each row sits under its bed and the repetition reads as structure;
          in a chat bubble it reads as a stammer, and the instruction for that day is the same
          instruction whichever bed it came from
        */
        ...[
          ...new Set(
            utterance.items.map(
              (item) =>
                `${dayLabel(item.day)}: ${actionLabel(item.action)} ${cropName(catalog, item.cropId)}${item.through === null ? '' : ` (through ${dayLabel(item.through)})`}`,
            ),
          ),
        ].map((text) => ({ text, tone: 'note' as const })),
        // stated once for the whole list, which is how `AgendaPanel` states them too
        ...utterance.notes.map((text) => ({ text, tone: 'caveat' as const })),
      ]
    case 'compliance':
      return [
        /*
          A plain first line, because fourteen lines of criteria are not an answer to "is this
          legal".

          Composed from counts and from `OUTCOME_LABEL`'s own words, so it makes no claim the
          checks do not already make: it says how many programmes were looked at and how they
          fell out, and the readout underneath says why each one fell where it did. The sentence
          that says none of this is a determination still closes the whole thing, as it must
        */
        { text: complianceHeadline(utterance.checks), tone: 'say' },
        ...utterance.checks.flatMap((check) => [
          {
            text: `${check.regime.label}: ${OUTCOME_LABEL[check.overall]}`,
            tone: 'say' as const,
            // the regulation itself, and whatever reading of it this app is working from
            citations: check.regime.citations,
          },
          ...check.results.map((result) => ({
            text: `${result.criterion.label}: ${criterionSummary(result)}`,
            tone: 'note' as const,
          })),
        ]),
        /*
          Never a determination, said in the app's own words. Every string above comes from the
          compliance model and `OUTCOME_LABEL`, both of which are already policed by
          `compliance-language.test.ts`; this is the sentence that says what the whole readout is
          and is not, and it is not optional
        */
        { text: NOT_A_DETERMINATION, tone: 'caveat' },
      ]
    case 'water': {
      const perBed = utterance.balances.map(
        (balance) =>
          `In the open ${formatBandRange(balance.irrigationOpenSkyMm, 'mm')}, under the panels ${formatBandRange(balance.irrigationUnderPanelsMm, 'mm')}.`,
      )
      /*
        Said once when every bed says the same thing: three identical beds would otherwise repeat
        the identical sentence three times over with nothing to tell them apart, reading as a
        stutter. Collapsed only when ALL of them agree, because
        deduplicating a list where two of three match would leave a count that is a lie
      */
      const identical = new Set(perBed).size === 1 && perBed.length > 1
      return [
        { text: 'What the beds would need over a year:', tone: 'say' },
        ...(identical
          ? [
              {
                text: `All ${String(perBed.length)} beds alike. ${perBed[0] ?? ''}`,
                tone: 'note' as const,
              },
            ]
          : perBed.map((text) => ({ text, tone: 'note' as const }))),
        ...[...new Set(utterance.balances.flatMap((balance) => balance.notes))].map((text) => ({
          text,
          tone: 'caveat' as const,
        })),
      ]
    }
    case 'companions':
      return [
        {
          text: `The corpus records something measured in favour of ${cropName(catalog, utterance.cropId)} beside ${named(catalog, utterance.withCropIds.slice(0, 8))}.`,
          tone: 'say',
        },
        {
          // the partition is the point: folklore and experimental rules live behind their own
          // headings in this app, and answering out of them here would launder the label
          text: 'Only the scored rules, which are the ones with a study behind them. The folklore panel holds the rest, labelled as folklore.',
          tone: 'caveat',
          /*
            And here they are. A sentence that claims a study and names none is a caveat doing the
            opposite of its job
          */
          citations: utterance.citations,
        },
      ]
    case 'sources':
      return [
        { text: 'I have opened the sources shelf for you, in the editor.', tone: 'say' },
        {
          text: 'Everything this app says traces to something on it.',
          tone: 'note',
        },
      ]
    case 'removed':
      return [
        {
          text: `Taken out. ${String(utterance.count)} planting${utterance.count === 1 ? '' : 's'} of ${named(catalog, utterance.cropIds)} gone.`,
          tone: 'say',
        },
      ]
    case 'bed-added':
      return [
        { text: `${utterance.label} added.`, tone: 'say' },
        {
          // said out loud because the design search is what decides where a bed belongs, and the
          // defaults placed this one, without the light going into it
          text: 'It sits where the defaults put it, and nothing about the light went into that. Ask me to design it again if you want it computed properly.',
          tone: 'caveat',
        },
      ]
    case 'out-of-scope':
      return [
        { text: OUT_OF_SCOPE[utterance.topic], tone: 'say' },
        {
          // the same sentence the results panel already carries, so the agent and the panel are
          // honest about the same limits in the same words
          text: 'Cost, planning permission, grid connection and mounting structure were not considered at all.',
          tone: 'caveat',
        },
      ]
    case 'panels-adjusted':
      return [
        {
          text: `Done. ${utterance.clearanceM.toFixed(1)} m of headroom, rows ${utterance.pitchM.toFixed(1)} m apart${utterance.tiltDeg === null ? '' : `, tilted ${utterance.tiltDeg.toFixed(0)} degrees`}.`,
          tone: 'say',
        },
        {
          text: 'The light was computed for where they were, so those figures are stale until it is run again.',
          tone: 'caveat',
        },
      ]
    case 'greeting':
      return [
        {
          text:
            utterance.sort === 'thanks'
              ? 'Any time. Where this had got to:'
              : 'Hello. Whenever you are ready:',
          tone: 'say',
        },
      ]
    case 'not-planted':
      /*
        One line, and only the fact. A second line, "ask me to fill the beds and I will put in what
        the light here will carry", is right after "when do I plant the tomatoes" and wrong
        immediately after filling the beds, which is the other place this appears. The thing to do
        next is a chip; the fact is the same wherever it is said
      */
      return [
        {
          text: `${named(catalog, utterance.cropIds)} is not in any of your beds.`,
          tone: 'say',
        },
      ]
    case 'started-over':
      return [{ text: 'Cleared. You can start from the beginning.', tone: 'say' }]
    case 'resized':
      return [
        {
          text: `The plot is ${String(utterance.widthM)} by ${String(utterance.depthM)} metres now.`,
          tone: 'say',
        },
        {
          text: 'The light was computed for the old shape, so those numbers are stale until it is run again.',
          tone: 'caveat',
        },
      ]
    case 'methods': {
      const rasterLine: Line =
        utterance.raster === null
          ? {
              text: "The light hasn't been computed for this garden yet, so there's no run to describe.",
              tone: 'say',
            }
          : {
              text: `The light model is ${utterance.raster.skyModel}, sampled at ${String(utterance.raster.sunDirectionCount)} sun positions over ${utterance.raster.cellSizeM.toFixed(2)} m squares of ground, computed by ${utterance.raster.backend}.`,
              tone: 'say',
            }
      return [
        rasterLine,
        {
          text: `Sun positions come from NREL's SPA algorithm. The same seed, ${String(utterance.seed)}, and the same year, ${utterance.yearLabel}, reproduce a season exactly.`,
          tone: 'note',
        },
        {
          text: `Yield bands and the studies behind them sit on the sources step, and on each crop's own "What this is based on" in the ranking.`,
          tone: 'note',
        },
      ]
    }
    case 'growing-here':
      return utterance.hardinessZoneLabel === null
        ? [
            {
              text: "The site hasn't been looked up yet, so there's nothing to say about growing there.",
              tone: 'say',
            },
          ]
        : [
            {
              text: `${utterance.locationLabel} is hardiness zone ${utterance.hardinessZoneLabel}${utterance.frostFreeDays === null ? '' : `, with about ${String(utterance.frostFreeDays)} frost-free days a year`}.`,
              tone: 'say',
            },
            {
              text: "This app computes light there and ranks crops for it, that's what it knows about growing here.",
              tone: 'note',
            },
          ]
    case 'undone':
      return [{ text: 'Put back the way it was.', tone: 'say' }]
    case 'failed':
      return [
        { text: "That didn't work.", tone: 'say' },
        { text: utterance.message, tone: 'note' },
      ]
  }
}
