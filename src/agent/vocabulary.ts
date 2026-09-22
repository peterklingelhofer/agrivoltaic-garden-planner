import type { Crop } from '../types/crop'
import type { CropId } from '../types/ids'
import type { GrowingAmbition, MountingPreference, SiteExposure } from '../types/onboarding'
import type { ObjectivePresetId } from '../state/onboarding'
import { normalize, tokens } from './text'

export interface Candidate<T> {
  readonly value: T
  readonly phrases: readonly string[]
}

/**
 * How each answer option gets said out loud.
 *
 * These aren't the UI's strings and must not be replaced by them. `OBJECTIVE_PRESETS` labels one
 * option "A bit of both", which nobody types. What people type is "half and half", "some of each",
 * "I don't mind". A router matched against button labels only understands people who have already
 * read the buttons, which is exactly the population that doesn't need a router
 */
export const EXPOSURE: readonly Candidate<SiteExposure>[] = [
  {
    value: 'open',
    phrases: [
      'open',
      'nothing around it',
      'wide open',
      'no trees',
      'full sun all day',
      'nothing overhanging',
    ],
  },
  {
    value: 'partly-sheltered',
    phrases: [
      'partly sheltered',
      'a wall on one side',
      'a fence',
      'some trees',
      'a hedge',
      'shaded part of the day',
      'a building nearby',
      'north facing',
      'it faces north',
    ],
  },
  {
    value: 'overshadowed',
    phrases: [
      'overshadowed',
      'lots of trees',
      'very shady',
      'big trees over it',
      'shaded most of the day',
      'hemmed in',
    ],
  },
]

export const AMBITION: readonly Candidate<GrowingAmbition>[] = [
  {
    value: 'leafy-and-herbs',
    phrases: [
      'leaves and herbs',
      'salad',
      'lettuce and spinach',
      'greens',
      'herbs',
      'easy things',
      'just salad leaves',
    ],
  },
  {
    value: 'mixed-vegetables',
    phrases: [
      'a mix of vegetables',
      'a bit of everything',
      'normal vegetables',
      'mixed veg',
      'the usual things',
      'carrots and beans and that',
    ],
  },
  {
    value: 'fruiting-and-berries',
    phrases: [
      'fruit and berries',
      'tomatoes',
      'strawberries',
      'squash and pumpkins',
      'peppers',
      'things that fruit',
      'the hungry stuff',
    ],
  },
]

export const OBJECTIVE: readonly Candidate<ObjectivePresetId>[] = [
  {
    value: 'mostly-food',
    phrases: [
      'mostly food',
      'i care about growing',
      'food first',
      'the garden matters more',
      'as much food as possible',
      'i am not bothered about electricity',
      'the food matters more than the power',
    ],
  },
  {
    value: 'balanced',
    phrases: [
      'a bit of both',
      'half and half',
      'some of each',
      'i do not mind',
      'balance them',
      'equally',
      'split it evenly',
      'share it between the two',
    ],
  },
  {
    value: 'mostly-electricity',
    phrases: [
      'mostly electricity',
      'as much power as possible',
      'energy first',
      'the panels matter more',
      'i want the power',
      'i am not bothered about the food',
    ],
  },
]

export const MOUNTING: readonly Candidate<MountingPreference>[] = [
  {
    value: 'overhead-canopy',
    phrases: [
      'overhead',
      'a canopy',
      'panels above the beds',
      'over the top',
      'walk underneath',
      'like a roof',
    ],
  },
  {
    value: 'ground-rows',
    phrases: [
      'on the ground',
      'rows',
      'ground level',
      'beside the beds',
      'in rows between',
      'low down',
    ],
  },
  {
    value: 'vertical-bifacial',
    phrases: ['upright', 'vertical', 'standing up', 'like a fence', 'on their edge', 'sideways'],
  },
  {
    value: 'any',
    phrases: [
      'i do not mind',
      'whatever is best',
      'you choose',
      'any',
      'no preference',
      'surprise me',
    ],
  },
]

/**
 * What this application doesn't model, named so a refusal can be specific.
 *
 * Every one of these is something the design search's own caveats already say it didn't consider:
 * "Cost, planning permission, grid connection and mounting structure weren't considered at all".
 * The app is honest about its limits in the results panel, and this list lets the agent be honest
 * too: without it, "how much will it cost" reaches the energy report and "what about deer" reaches
 * the water balance. Answering a question about deer with an irrigation figure is worse than
 * answering nothing, because it looks like an answer
 */
export type ScopeTopic = 'cost' | 'permitting' | 'wildlife' | 'grid' | 'structure' | 'soil'

export const SCOPE: readonly Candidate<ScopeTopic>[] = [
  {
    value: 'cost',
    phrases: [
      'how much will it cost',
      'what does it cost',
      'will this save me money',
      'is it worth it',
      'the payback',
      'how much do i save',
      'the price',
      'my bills',
    ],
  },
  {
    value: 'permitting',
    phrases: [
      'do i need planning permission',
      'a permit',
      'do i need approval',
      'the council',
      'zoning',
      'building regulations',
    ],
  },
  {
    value: 'wildlife',
    phrases: [
      'what about deer',
      'rabbits',
      'pests',
      'slugs',
      'will animals eat it',
      'do i need a fence for animals',
      'netting',
      'birds',
    ],
  },
  {
    value: 'grid',
    phrases: [
      'connecting to the grid',
      'selling the electricity back',
      'export',
      'feed in tariff',
      'a battery',
      'an inverter',
    ],
  },
  {
    /*
      The one topic here the app partly models. A `SoilProfile` is editable per bed and it feeds the
      recommender, but nothing anywhere parses a DESCRIPTION of soil, so without this entry "my soil
      is clay" would reach the geocoder. Declining and naming the panel that does take it is the
      honest answer
    */
    value: 'soil',
    phrases: [
      'my soil is clay',
      'the soil is sandy',
      'i have heavy soil',
      'the ph of my soil',
      'my ground is chalky',
      'what about the soil',
    ],
  },
  {
    value: 'structure',
    phrases: [
      'the mounting',
      'the frame',
      'foundations',
      'how do i build it',
      'who installs it',
      'the racking',
    ],
  },
]

/**
 * How somebody asks for the panels to move, in relative terms.
 *
 * Relative, because that is how it's said: nobody asks for 2.9 meters of
 * headroom, they ask for the panels to be higher. The editor has the numbers for anybody who
 * wants them, and `ArrayPanel` is where a figure is typed
 */
export type PanelChange =
  | 'taller'
  | 'lower'
  | 'steeper'
  | 'flatter'
  | 'wider-spacing'
  | 'tighter-spacing'

export const PANEL_CHANGE: readonly Candidate<PanelChange>[] = [
  {
    value: 'taller',
    phrases: [
      'make the panels taller',
      'raise them',
      'higher off the ground',
      'more headroom',
      'i want to walk under them',
      'lift the panels',
    ],
  },
  {
    value: 'lower',
    phrases: [
      'make the panels lower',
      'bring them down',
      'closer to the ground',
      'less headroom',
      'drop the panels',
      'they are too high',
    ],
  },
  {
    value: 'steeper',
    phrases: ['tilt them more', 'steeper', 'more of an angle', 'stand them up a bit'],
  },
  {
    value: 'flatter',
    phrases: ['tilt them less', 'flatter', 'lay them down a bit', 'less of an angle'],
  },
  {
    value: 'wider-spacing',
    phrases: [
      'spread the rows out',
      'more space between the rows',
      'further apart',
      'let more light through',
    ],
  },
  {
    value: 'tighter-spacing',
    phrases: ['closer together', 'tighter rows', 'less space between the rows', 'pack them in'],
  },
]

/**
 * The SUBJECTS this application doesn't model, as nouns.
 *
 * A separate mechanism from `SCOPE`'s exemplar sentences, and it exists because enumerating ways
 * of asking is hopeless where enumerating what is asked ABOUT is easy. A held-out set produced
 * "how many years until it pays for itself", "do the neighbors have to agree to it", "what stops
 * squirrels getting at it", "who puts the whole thing up" and "is the earth here any good": five
 * sentences with nothing in common as sentences, every one of them about one of six topics this
 * app is already on record as not covering.
 *
 * So the topic is read off the noun. A question with `squirrel` in it is about animals whatever
 * shape the question takes, and the list of things not modeled is fixed and short, which is what
 * makes a noun list honest here and wouldn't make it honest anywhere else in the router
 */
export const SCOPE_SUBJECTS: Readonly<Record<ScopeTopic, readonly string[]>> = {
  cost: [
    'cost',
    'costs',
    'price',
    'prices',
    'money',
    'payback',
    'pays',
    'pay',
    'afford',
    'cheap',
    'expensive',
    'budget',
    'investment',
    'roi',
    'savings',
    'bill',
    'bills',
    'tariff',
    'subsidy',
    'grant',
  ],
  permitting: [
    'permission',
    'permit',
    'permits',
    'planning',
    'council',
    'zoning',
    'bylaw',
    'byelaw',
    // NOT "neighbors": in a garden a neighbor is a physical fact about the surroundings, and
    // "my neighbor has a big oak" is an answer to the question about what is around the plot
    'approval',
    'approved',
    'legal',
    'lawyer',
    'deed',
    'covenant',
  ],
  wildlife: [
    'deer',
    'rabbit',
    'rabbits',
    'squirrel',
    'squirrels',
    'fox',
    'foxes',
    'birds',
    'pigeons',
    'slugs',
    'snails',
    'pests',
    'pest',
    'netting',
    'fencing',
    'badger',
    'badgers',
    'mice',
    'rats',
  ],
  grid: [
    'grid',
    'inverter',
    'battery',
    'batteries',
    'export',
    'wiring',
    'wires',
    'wire',
    'meter',
    'utility',
    'supplier',
    'blackout',
    'circuit',
  ],
  structure: [
    'foundations',
    'footings',
    'racking',
    'frame',
    'scaffolding',
    'installer',
    'installers',
    'contractor',
    'builder',
    'welding',
    'bolts',
  ],
  soil: ['clay', 'sandy', 'loam', 'chalky', 'peat', 'ph', 'topsoil', 'subsoil', 'earth', 'compost'],
}

/** The topic a sentence is about, when it names one of them, or null */
export const scopeSubjectIn = (text: string): ScopeTopic | null => {
  const said = tokens(text)
  // "meters" after a count is a length, which American spelling writes the same as the
  // electricity meter the grid topic means
  const isLength = (i: number): boolean => {
    const before = said[i - 1]
    return (
      before !== undefined &&
      (/^\d/.test(before) || before === 'a' || Object.hasOwn(WORD_NUMBER, before))
    )
  }
  const words = new Set(
    said.filter((word, i) => !(singular(word) === 'meter' && isLength(i))).map(singular),
  )
  for (const [topic, subjects] of Object.entries(SCOPE_SUBJECTS)) {
    // singularized on both sides, so "squirrels" finds "squirrel" and "bills" finds "bill"
    if (subjects.some((subject) => words.has(singular(subject)))) return topic as ScopeTopic
  }
  return null
}

/**
 * Greetings, thanks and the other things people say that aren't about the garden.
 *
 * They need naming because the question about the PLACE accepts anything as a possible place
 * name, which is right for "Amherst" and absurd for "hiya": it goes to the geocoder as a greeting,
 * and "ta" at the end is met with "I didn't follow that", which is a poor way to be thanked
 */
/**
 * The pleasantries that are gratitude.
 *
 * "Thanks" answered with "Hello." Both are pleasantries and both deserve better than the
 * geocoder, which is why they share an intent, but they're not the same thing said twice:
 * answering thanks with a greeting reads as an agent that heard a noise
 */
export const THANKS: readonly string[] = ['thanks', 'thank you', 'ta', 'cheers', 'nice one']

export const SOCIAL: readonly string[] = [
  'hi',
  'hiya',
  'hello',
  'hey',
  'yo',
  'morning',
  'afternoon',
  'evening',
  'thanks',
  'thank you',
  'ta',
  'cheers',
  'nice one',
  'lovely',
  'great',
  'cool',
  'brilliant',
  'perfect',
  'sorry',
  'bye',
  'goodbye',
  'good',
]

/** Whether the sentence is nothing but pleasantries */
export const isSocial = (text: string): boolean => {
  const words = tokens(text)
  if (words.length === 0 || words.length > 3) return false
  const said = words.join(' ')
  return SOCIAL.includes(said) || words.every((word) => SOCIAL.includes(word))
}

/** Which sort of pleasantry it was, for a reply that answers the one that was said */
export const socialSort = (text: string): 'hello' | 'thanks' => {
  const words = tokens(text)
  return THANKS.includes(words.join(' ')) || words.some((word) => THANKS.includes(word))
    ? 'thanks'
    : 'hello'
}

/**
 * Whether the sentence is a WH-question, which is a thing nobody asks in order to change
 * something.
 *
 * "How come there's no tomatoes" names a crop and contains a negator, so it reached
 * `dislike-crop` and the agent recorded that the grower would rather not have tomatoes. They had
 * asked why there were none. A question answered by recording the opposite preference is the
 * worst misroute this surface can produce, and it's not a vocabulary problem.
 *
 * Yes-or-no questions are deliberately NOT included: "can I have some strawberries" is a request
 * wearing a question mark, and it does mean plant them
 */
const WH: ReadonlySet<string> = new Set([
  'why',
  'how',
  'what',
  'whats',
  'when',
  'where',
  'which',
  'who',
  'whose',
])

export const isWhQuestion = (text: string): boolean => {
  const first = tokens(text)[0]
  return first !== undefined && WH.has(first)
}

export const AFFIRMATIVE: readonly string[] = [
  'yes',
  'yeah',
  'yep',
  'sure',
  'i do',
  'i can',
  'please',
  'definitely',
  'i would like that',
  'go on',
  'ok',
]

export const NEGATIVE: readonly string[] = [
  'no',
  'nope',
  'not really',
  'i do not',
  'i cannot',
  'never',
  'no thanks',
  'rather not',
  'none',
]

const WORD_NUMBER: Readonly<Record<string, number>> = {
  half: 0.5,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  fifteen: 15,
  twenty: 20,
  thirty: 30,
  forty: 40,
  fifty: 50,
}

/**
 * Every length in a sentence, in meters, in the order they were said.
 *
 * Words as well as digits, because "about two meters" is how a height limit gets described out
 * loud and refusing it sends someone back to a slider they were trying to avoid. Feet are read
 * and converted: the app is metric throughout and a grower who thinks in feet
 * isn't going to convert on our behalf
 */
export const lengths = (text: string): readonly number[] => {
  /*
    A lighter clean than `normalize`, which strips the decimal point as punctuation and so
    silently turned "2.5 meters" into the separate numbers 2 and 5, handing a plot of 2 by 5 to
    somebody who asked for a square of two and a half. A point or a comma BETWEEN two digits is
    a decimal separator and is kept as a point. Every other one is punctuation and goes
  */
  const cleaned = text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/(\d)[.,](\d)/g, '$1.$2')
    .replace(/[^a-z0-9. ]+/g, ' ')
    .replace(/\.(?!\d)/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  const found: { readonly at: number; readonly meters: number }[] = []
  const digits = /(\d+(?:\.\d+)?)\s*(m|metre|metres|meter|meters|ft|foot|feet|cm)?/g
  for (const hit of cleaned.matchAll(digits)) {
    const raw = Number(hit[1])
    if (!Number.isFinite(raw)) continue
    const unit = hit[2] ?? 'm'
    const meters =
      unit === 'cm'
        ? raw / 100
        : unit === 'ft' || unit === 'foot' || unit === 'feet'
          ? raw * 0.3048
          : raw
    found.push({ at: hit.index, meters })
  }
  for (const [word, value] of Object.entries(WORD_NUMBER)) {
    const at = cleaned.indexOf(` ${word} `)
    if (at >= 0) found.push({ at, meters: value })
  }
  return found.sort((a, b) => a.at - b.at).map((entry) => entry.meters)
}

/**
 * The answer vocabulary an intent's slot is drawn from, where it has one.
 *
 * Scoring an intent against these as well as against its own exemplars lets an answer's own words
 * count: "half and half" is a verbatim entry in `OBJECTIVE` and appears nowhere in
 * `set-objective`'s phrases. A sentence that fills an intent's slot is evidence FOR that intent.
 *
 * Three slots are deliberately absent.
 *
 * `crops` is left out because the crop vocabulary is six hundred and fifty proper nouns, and a
 * crop being named is ambiguous between wanting that crop and describing an ambition.
 * Letting it score would make every mention of a tomato outrank the question about what to grow,
 * which is the question a tomato is usually an answer to. The step is what separates those.
 *
 * `yes-no` is left out because `BARE_ANSWER_SCORE` already handles a plain affirmative, and
 * handles it better: it's scoped to the ONE question being asked, where this would raise all
 * three yes-or-no intents at once and let the table's order pick between them.
 *
 * `place`, `dimensions` and `length` have no vocabulary at all: a place name isn't drawn from a
 * list and a measurement is read by `lengths`
 */
export const slotVocabulary = (
  slot: 'exposure' | 'ambition' | 'objective' | 'mounting' | string,
): readonly Candidate<string>[] => {
  switch (slot) {
    case 'exposure':
      return EXPOSURE
    case 'ambition':
      return AMBITION
    case 'objective':
      return OBJECTIVE
    case 'mounting':
      return MOUNTING
    default:
      return []
  }
}

/**
 * The singular of one word, by the three rules that cover English well enough for a crop list.
 *
 * People type plurals. "Onions", "beans", "tomatoes", "berries". Nothing in the catalog is
 * plural, so without this every one of those would miss
 */
export const singular = (word: string): string => {
  if (word.length > 4 && word.endsWith('ies')) return `${word.slice(0, -3)}y`
  if (word.length > 3 && word.endsWith('es') && /(?:[sxzo]|ch|sh)$/.test(word.slice(0, -2))) {
    return word.slice(0, -2)
  }
  if (word.length > 3 && word.endsWith('s') && !word.endsWith('ss')) return word.slice(0, -1)
  return word
}

export const singularize = (text: string): string => tokens(text).map(singular).join(' ')

const heads = new WeakMap<readonly Crop[], ReadonlyMap<string, readonly CropId[]>>()

/**
 * Every crop indexed by the LAST word of each of its names.
 *
 * This closes the router's largest usability hole, and it's a hole made by the catalog being
 * right. There's no crop called "onion": there's `onion-bulb`, named "bulb onion", and
 * `scallion`. There's no "bean": there are bush, pole, runner, fava and mung. No "pea": garden,
 * cow, pigeon, field. Those are the commonest words a beginner types, and without this every one of
 * them would find nothing at all.
 *
 * It returns EVERY crop sharing the head noun, and that turns out to
 * be the right answer. "I do not want beans" means all five of them, and
 * "I want beans" means the ranking should pick whichever bean this bed's light can carry. That's
 * the decision this whole application exists to make, and the router shouldn't pre-empt it
 */
export const cropsByHead = (catalog: readonly Crop[]): ReadonlyMap<string, readonly CropId[]> => {
  const held = heads.get(catalog)
  if (held !== undefined) return held
  const made = new Map<string, CropId[]>()
  for (const crop of catalog) {
    for (const name of [...crop.taxonomy.commonNames, ...crop.taxonomy.synonyms]) {
      const words = tokens(name)
      const head = words[words.length - 1]
      // a one-word name is already reachable by exact match, and indexing it here would only
      // let a longer name's head silently outvote it
      if (head === undefined || words.length < 2) continue
      const list = made.get(head) ?? []
      if (!list.includes(crop.id)) list.push(crop.id)
      made.set(head, list)
    }
  }
  /*
    A head shared by exactly ONE crop is dropped, and that is the rule that makes this safe.

    A head noun is only meaningful as the name of a GROUP: "bean" covers five, "onion" two, "pea"
    four, and answering with all of them is right. A head belonging to a single crop is that crop's
    own name, and it's already reachable by typing it. Keeping those would turn a generic English
    word into a silent botanical claim: "salad" is the head of "corn salad", so a grower who typed
    the word salad would be told the agent had noted they would like mache. Nobody said mache
  */
  const grouped = new Map<string, readonly CropId[]>()
  for (const [head, ids] of made) if (ids.length > 1) grouped.set(head, ids)
  heads.set(catalog, grouped)
  return grouped
}

const built = new WeakMap<readonly Crop[], readonly Candidate<CropId>[]>()

/**
 * `cropVocabulary`, further down: the crops, as everything the catalog has ever called them.
 *
 * `commonNames` and `synonyms` are already curated per crop and already carry the regional
 * alternatives: courgette and zucchini, coriander and cilantro, aubergine and eggplant. So this
 * needs no vocabulary of its own and can't drift from the catalog it is matching against.
 * The accepted binomial goes in too, for the small number of growers who would type one
 */
export const cropVocabulary = (catalog: readonly Crop[]): readonly Candidate<CropId>[] => {
  /*
    Memoized on the catalog itself, because the catalog is loaded once and then never changes,
    and building this isn't free: 182 crops with two or three names each is about 480 phrases to
    normalize and sort. Rebuilt once per candidate intent for every sentence typed, it measured ~100
    ms a sentence in node. A WeakMap, so a test that loads a second catalog gets a second
    vocabulary of its own
  */
  const held = built.get(catalog)
  if (held !== undefined) return held
  const made = catalog.map((crop) => ({
    value: crop.id,
    phrases: [
      ...crop.taxonomy.commonNames,
      ...crop.taxonomy.synonyms,
      crop.taxonomy.acceptedName,
    ].filter((name) => normalize(name) !== ''),
  }))
  built.set(catalog, made)
  return made
}
