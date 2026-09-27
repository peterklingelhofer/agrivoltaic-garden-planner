import type { OnboardingStep } from '../state/slices'

/**
 * Everything the agent is able to understand, as a closed list.
 *
 * Closed is the whole design. The engine already decides what to plant and already words the
 * answer with its caveat attached, so nothing here has to generate a sentence or hold an opinion:
 * what is left is deciding which of a few dozen things a typed sentence meant, and that is a
 * classification over a fixed vocabulary. A router that can only
 * return one of these can be wrong, but it cannot invent a crop, a number or a reassurance
 *
 * The list is deliberately shorter than `AppState`'s 81 actions. Most of those are UI plumbing --
 * `setHovered`, `setDragging`, `pushDraftVertex` -- which no agent should be reaching for, and a
 * router's accuracy falls off a cliff as the label set grows. These are the things a gardener
 * says out loud
 */
export type IntentId =
  // the guided questions, in the order `ONBOARDING_STEPS` asks them
  | 'set-place'
  | 'set-space'
  | 'set-exposure'
  | 'set-ambition'
  | 'set-natives'
  | 'set-pollinators'
  | 'set-objective'
  | 'set-mounting'
  | 'set-height'
  | 'set-water'
  // what the grower wants in the beds, which is asked at any point
  | 'like-crop'
  | 'dislike-crop'
  // the engine
  | 'propose-designs'
  | 'apply-design'
  | 'plan-planting'
  // reading only
  | 'describe-garden'
  | 'explain'
  | 'list-crops'
  /**
   * The eight below reach things the app ALREADY computes. A measured corpus of forty unscripted
   * sentences failed twenty-nine times, and half of those failures were this: an energy report, a
   * planting calendar, an agenda, a compliance check, a water balance and the companion corpus all
   * exist, are all cited, and were all unreachable by talking. No amount of language understanding
   * invents a capability
   */
  | 'ask-energy'
  | 'ask-calendar'
  | 'ask-agenda'
  | 'ask-compliance'
  | 'ask-water'
  | 'ask-companions'
  | 'ask-sources'
  | 'define'
  // changing a garden that already exists
  | 'remove-planting'
  | 'add-bed'
  | 'adjust-panels'
  | 'start-over'
  // getting out, and getting back
  | 'undo'
  | 'show-the-form'
  | 'help'
  /** Hello, thanks, goodbye: not about the garden, and not nothing either */
  | 'greeting'
  /**
   * Declining, by name.
   *
   * The design search already says in its own caveats that cost, planning permission, grid
   * connection and mounting structure were not considered at all, and this intent lets the agent
   * say the same thing. Without it, "how much will it cost" reaches the energy report and "what
   * about deer" reaches the water balance. An irrigation figure in answer to a question about deer
   * is worse than no answer, because it looks like one
   */
  | 'out-of-scope'

/**
 * What an intent needs filled in before it can be carried out, named here so
 * the table stays readable. `none` is a real answer: `propose-designs` and `undo` take nothing
 */
export type SlotKind =
  | 'none'
  | 'place'
  | 'dimensions'
  | 'exposure'
  | 'ambition'
  | 'yes-no'
  | 'objective'
  | 'mounting'
  | 'length'
  | 'crops'
  | 'archetype'
  | 'subject'
  | 'scope'
  | 'panels'

export interface Intent {
  readonly id: IntentId
  readonly slot: SlotKind
  /**
   * The step this intent answers, or null when it is answerable at any moment.
   *
   * Used to bias the router. Standing on the question about panel height
   * makes "about two metres" overwhelmingly likely to be an answer to THAT, and a router with no
   * idea which question is on screen has to guess between height, plot width and row spacing on
   * the strength of the word "metres" alone. It is a bias and not a filter because a grower who
   * suddenly says "actually I hate parsnips" is allowed to, mid-question
   */
  readonly step: OnboardingStep | null
  /**
   * How the intent gets said. These feed BOTH understanders: the lexical one scores them with
   * Dice, and the embedding one turns the same strings into vectors. That is the single source of
   * truth that makes the 23 MB upgrade a swap of one file, with no second vocabulary to
   * maintain and drift
   */
  readonly phrases: readonly string[]
}

/**
 * Order is a real tie-break, because `bestMatch` resolves ties to the first entry. The reading
 * intents sit above the writing ones on purpose: when the router genuinely cannot separate
 * "what grows in the shade" from "put something in the shady bed", answering the question is a
 * recoverable mistake and rearranging somebody's garden is not
 */
export const INTENTS: readonly Intent[] = [
  {
    /*
      No phrases, deliberately, and it is the only entry in the table without any.

      A greeting is recognised by `isSocial`'s closed word list and by nothing else. Given
      exemplars, "good morning" matches "the house blocks the morning sun", which is a sentence
      about shade. Pleasantries are a fixed, tiny vocabulary and scoring them against a fuzzy
      matcher only lets them leak into sentences that happen to share a word
    */
    id: 'greeting',
    slot: 'none',
    step: null,
    phrases: [],
  },
  {
    id: 'help',
    slot: 'none',
    step: null,
    phrases: [
      'help',
      'what can you do',
      'i am stuck',
      'wait what',
      'not sure',
      'i do not know',
      'i do not understand',
      'how does this work',
    ],
  },
  {
    id: 'describe-garden',
    slot: 'none',
    step: null,
    phrases: [
      'what have i got',
      'describe my garden',
      'what is in the garden',
      'show me what i have',
      'what does my plot look like',
      'summarise the design',
      'summarise it for me',
      'tell me about my garden',
      'what is there at the moment',
    ],
  },
  {
    id: 'explain',
    slot: 'subject',
    step: null,
    phrases: [
      'why',
      'why not',
      'how come',
      'how come it is not there',
      'why can i not grow that',
      'why is that there',
      'explain that',
      'how do you know',
      'where does that number come from',
      'what does that mean',
    ],
  },
  {
    id: 'list-crops',
    slot: 'subject',
    step: null,
    phrases: [
      'what can i grow',
      'what grows here',
      'what would do well',
      'show me the crops',
      'what suits the shade',
      'what is on the list',
    ],
  },
  {
    /*
      Placed high, so that a question the app cannot answer is declined. It is never routed to
      whichever readout shares a word with it. Being unhelpful on purpose beats being confidently
      irrelevant, and the tie-break in `scoreIntents` reads this table's order
    */
    id: 'out-of-scope',
    slot: 'scope',
    step: null,
    /*
      One exemplar per topic in `SCOPE`, because the vocabulary alone cannot carry this intent:
      `slotVocabulary` is only consulted while the slot's own QUESTION is being asked, and being
      asked about cost is not a step. Without a soil exemplar here, "my soil is clay" reached the
      place intent and would have been geocoded
    */
    phrases: [
      'how much will it cost',
      'will this save me money',
      'do i need planning permission',
      'what about deer',
      'can i sell the electricity back',
      'how do i build it',
      'my soil is clay',
      'what is the return on investment',
      'who wires it into the house',
      'will animals be a problem',
    ],
  },
  {
    id: 'define',
    slot: 'none',
    step: null,
    phrases: [
      'what is agrivoltaics',
      'what is this for',
      'can i put solar panels over my vegetables',
      'how does this work',
      'what is the point of this',
      'why would i grow under panels',
      'explain the whole idea',
      'what is the concept here',
    ],
  },
  {
    id: 'ask-energy',
    slot: 'none',
    step: null,
    /**
     * Covers the words people use for electricity, on top of the words this app uses on its own.
     * "Yield" and "output" are how somebody who has read a solar brochure asks. "Yield" is also
     * ambiguous with crop yield, which is why it is anchored to the panels
     */
    phrases: [
      'how much electricity will i get',
      'how much power',
      'what will the panels generate',
      'how many kilowatt hours',
      'how much energy',
      'what do the panels produce',
      'what is the yield from the panels',
      'what output should i expect from the panels',
      'how much generation',
      'how many units will it make',
    ],
  },
  {
    id: 'ask-calendar',
    slot: 'crops',
    step: null,
    phrases: [
      'when should i plant',
      'when do i sow',
      'when is it ready',
      'what is the sowing date',
      'when do i harvest',
      'when does it go in',
      'sowing dates for it',
      'the planting dates',
      'what time of year',
    ],
  },
  {
    id: 'ask-agenda',
    slot: 'none',
    step: null,
    phrases: [
      'what do i do first',
      'what do i do now',
      'what is next',
      'what should i be doing',
      'what happens this month',
      'give me a to do list',
      'what is due this week',
      'what needs doing',
      'a month by month plan',
      'the schedule for the year',
    ],
  },
  {
    id: 'ask-compliance',
    slot: 'none',
    step: null,
    phrases: [
      'is this legal',
      'is this allowed',
      'does this meet the rules',
      'what about regulations',
      'is it compliant',
      'does this pass the state rules',
      // NOT "the fast track parameters", which is jargon nobody types and which scored 0.41 against
      // "Amherst, Massachusetts" on nothing but shared bigrams. A short, unusual noun phrase is the
      // shape that collides
      'does it meet the requirements',
      // NOT "the massachusetts rules", which would break the most important sentence in the
      // product: Amherst is in Massachusetts, so "Amherst, Massachusetts" would route to the
      // compliance check at 0.67. A place name in a phrase table is the same mistake as a crop name
      // in one, and it is worth stating twice
      'do i need permission for this',
    ],
  },
  {
    id: 'ask-water',
    slot: 'none',
    step: null,
    phrases: [
      'how much water does it need',
      'how much watering',
      'will i have to water it',
      'what about irrigation',
      'how thirsty is it',
      'does the shade save water',
      'will i be watering all summer',
      'how often do i water',
    ],
  },
  {
    id: 'ask-companions',
    slot: 'crops',
    step: null,
    phrases: [
      'what goes well with',
      'what should i plant next to',
      'good companions for',
      'what grows well beside',
      'what pairs with',
      'good neighbours for',
      'companion planting for',
      'what likes growing near',
    ],
  },
  {
    id: 'ask-sources',
    slot: 'none',
    step: null,
    phrases: [
      'show me the sources',
      'where does this come from',
      'what is this based on',
      'citations',
      'the evidence',
      'who says so',
      'what papers is this built on',
      'the references',
      'which studies',
      'the research behind this',
    ],
  },
  {
    id: 'set-place',
    slot: 'place',
    step: 'location',
    /*
      No bare "i am in" or "it is in". Two- and three-token fragments of pure function words match
      almost anything through the window sweep: "my soil is clay" reached this intent at better
      than the floor and would have been handed to the geocoder. A bare place name is recognised
      by `answerToTheQuestion` when the place is what was asked for, which is the honest way to
      catch one, and does not need the table to guess
    */
    phrases: [
      'i live in',
      // NOT "my garden is in", which is four words: function words and a noun everything shares. It
      // claims "my soil is clay" and "delete my garden", the second at 0.74 because `STEP_BIAS`
      // pushes it, so a request to delete a garden would be geocoded. A bare fragment has no place
      // in this particular intent, which has a catch-all of its own anyway
      'the site is at',
      'set the location to',
      'i have got a small yard behind my house in',
    ],
  },
  {
    id: 'set-space',
    slot: 'dimensions',
    step: 'space',
    phrases: [
      'my plot is 6 by 4 metres',
      'the space is about 10 by 8',
      'it is about the size of a parking space',
      'it is 6 metres wide',
      'the garden measures',
      'i have a plot of',
      // said after a garden exists, which is when a size stops being an answer and becomes an edit.
      // Without these, such an edit reaches the geocoder
      'actually make it 8 by 5',
      'change the size to 10 by 10',
      'maybe 20 foot square',
    ],
  },
  {
    id: 'set-exposure',
    slot: 'exposure',
    step: 'surroundings',
    phrases: [
      'it is open',
      'there are trees around it',
      'it is overshadowed',
      'there is a wall on one side',
      'it is sheltered',
      'nothing around it',
    ],
  },
  {
    id: 'set-ambition',
    slot: 'ambition',
    step: 'growing',
    /*
      Deliberately free of crop names, though describing an ambition with one is natural and
      common. "I want tomatoes and squash" as an exemplar here made every mention of a tomato
      look like an answer to the question about ambition even when that question was not being
      asked, and sent "runner beans" to it. The crop-flavoured readings live in `AMBITION` in
      `vocabulary.ts` instead, which is scored only while this question is the one on the table
    */
    phrases: [
      'mostly leaves and herbs',
      'a mix of vegetables',
      // NOT the bare "fruit and berries", which lives in `AMBITION` and is scored there only while
      // this question is being asked. Loose here it matched "throw it away and begin afresh" at
      // 0.52 and beat `start-over`'s 0.49, so a request to delete everything recorded an ambition
      'i would like to grow fruit and berries',
      'what i want to grow is',
      'the sort of thing i want to grow',
    ],
  },
  {
    id: 'set-natives',
    slot: 'yes-no',
    step: 'natives',
    phrases: ['native plants', 'plants from around here', 'i want natives', 'local species'],
  },
  {
    id: 'set-pollinators',
    slot: 'yes-no',
    step: 'pollinators',
    phrases: ['bees', 'pollinators', 'butterflies', 'i want to help the bees', 'flowers for bees'],
  },
  {
    id: 'set-objective',
    slot: 'objective',
    step: 'objective',
    phrases: [
      'mostly food',
      'mostly electricity',
      'a bit of both',
      'i care more about growing',
      'i care more about power',
      'balance the two',
    ],
  },
  {
    id: 'set-mounting',
    slot: 'mounting',
    step: 'mounting',
    phrases: [
      'panels overhead',
      'panels on the ground',
      'upright panels',
      'a canopy over the beds',
      'rows between the beds',
      'i do not mind how the panels sit',
    ],
  },
  {
    id: 'set-height',
    slot: 'length',
    step: 'height',
    phrases: [
      'nothing taller than',
      'a height limit of',
      'it cannot be higher than',
      'there is no height limit',
      'keep it under 2 metres',
      'keep it low please',
    ],
  },
  {
    id: 'set-water',
    slot: 'yes-no',
    step: 'water',
    phrases: [
      'i can water it',
      'there is a tap',
      'no water out there',
      'i have a hose',
      'it is rain only',
    ],
  },
  {
    id: 'like-crop',
    slot: 'crops',
    step: null,
    phrases: [
      'i want to grow',
      'i like',
      'can i have',
      'add',
      'i would love some',
      'put in some',
      'my favourite is',
    ],
  },
  {
    id: 'dislike-crop',
    slot: 'crops',
    step: null,
    phrases: [
      'i do not want',
      'i hate',
      'no',
      'leave out',
      // NOT "remove", which belongs to `remove-planting`: "remove the tomatoes" recorded a
      // PREFERENCE FOR tomatoes, which is the opposite of what was asked, and is the worst kind
      // of misroute because it looks like it worked
      'i cannot stand',
      'nothing with',
    ],
  },
  {
    id: 'propose-designs',
    slot: 'none',
    step: 'results',
    phrases: [
      'design it for me',
      'work out a layout',
      'show me some options',
      'what would you suggest',
      'go on then',
      'make me a garden',
    ],
  },
  {
    id: 'apply-design',
    slot: 'archetype',
    step: 'results',
    phrases: [
      'use that one',
      'i will take the first one',
      'go with the balanced one',
      'apply it',
      'yes do that',
    ],
  },
  {
    id: 'plan-planting',
    slot: 'none',
    step: 'planting',
    phrases: [
      'fill the beds',
      'plant it up',
      'what should go where',
      'sort out the planting',
      'put crops in the beds',
    ],
  },
  {
    id: 'remove-planting',
    slot: 'crops',
    step: null,
    phrases: [
      'remove the',
      'take out the',
      'get rid of the',
      'pull up the',
      'dig up the',
      'take them out',
    ],
  },
  {
    /*
      The last thing the unscripted corpus asked for that had no intent at all. Relative, because
      that is how it is said: "make the panels taller", not "set the clearance to 2.9 m". The
      editor still owns the numbers
    */
    id: 'adjust-panels',
    slot: 'panels',
    step: null,
    phrases: [
      'make the panels taller',
      'raise the panels',
      'tilt them more',
      'spread the rows out',
      'bring them closer together',
      'lower the panels',
    ],
  },
  {
    id: 'add-bed',
    slot: 'none',
    step: null,
    /**
     * Every exemplar carries the word "bed", and none of them is a bare "i want more beds". "Beds"
     * and "beans" are two bigrams apart, so that phrase matches "i want beans" at better than the
     * confident threshold, and a grower asking for beans is given a bed. It is the same trap as
     * crop names in the ambition exemplars and a place name in the compliance ones
     */
    phrases: [
      'add a bed',
      'add another bed',
      'add more beds',
      'another bed please',
      'can i have one more bed',
    ],
  },
  {
    id: 'start-over',
    slot: 'none',
    step: null,
    phrases: [
      'start over',
      'start again',
      'clear everything',
      'delete it all',
      'scrap this and begin again',
      'wipe it',
    ],
  },
  {
    id: 'undo',
    slot: 'none',
    step: null,
    phrases: ['undo', 'put it back', 'i did not mean that', 'cancel that', 'go back'],
  },
  {
    id: 'show-the-form',
    slot: 'none',
    step: null,
    phrases: [
      'show me the questions',
      'i would rather fill in the form',
      'let me do it myself',
      'open the panels',
      'stop talking to me',
    ],
  },
]

/**
 * The intents that destroy work, and which therefore may not be reached by a guess.
 *
 * `undo` restores the plot from before the design was applied and drops the light with it.
 * `plan-planting` replaces the plantings in EVERY bed. `apply-design` overwrites the plot. None
 * of the three is recoverable by saying "no, sorry, I meant something else".
 *
 * The list exists because a measured corpus of forty unscripted sentences reached one of them
 * six times, and the sentences are not close calls: "thanks" reached `undo`. "Do I need planning
 * permission" reached `undo`. "Will this save me money" reached `plan-planting`. A router that
 * deletes a garden when thanked is not a router with a tuning problem
 */
export const DESTRUCTIVE: readonly IntentId[] = [
  'undo',
  'plan-planting',
  'apply-design',
  // forgets the stored design and returns the app to its starting state, which is the least
  // recoverable thing in the whole list
  'start-over',
  'remove-planting',
]

export const isDestructive = (id: IntentId): boolean => DESTRUCTIVE.includes(id)

/**
 * The intent that loses the most, which the router has to be more certain of. `IRREVERSIBLE_FLOOR`
 * in `lexical.ts` sets how much more.
 *
 * Destructiveness is a spectrum and the floor was flat. `undo` restores the plot from before one
 * generation and `start-over` forgets the design entirely, and a held-out sentence found the gap:
 * "scratch that", which any reader takes as undoing the last thing, reached `start-over`. The two
 * are close as sentences and nowhere near each other in what they cost.
 *
 * A multiplier, so the relationship stays visible: whatever bar the
 * others clear, this one clears more
 */
export const IRREVERSIBLE: readonly IntentId[] = ['start-over']

export const isIrreversible = (id: IntentId): boolean => IRREVERSIBLE.includes(id)
