import { beforeAll, describe, expect, it } from 'bun:test'
import { loadCropCatalog } from '../data/crops'
import type { Crop } from '../types/crop'
import type { IntentId } from './intent'
import { ANSWERING_SCORE, CONFIDENCE_FLOOR, isNegated, nearMisses, routeLexically } from './lexical'
import type { OnboardingStep } from '../state/slices'
import type { RouteContext } from './understand'
import { lengths } from './vocabulary'

let catalog: readonly Crop[] = []
beforeAll(async () => {
  catalog = await loadCropCatalog()
})

const at = (step: OnboardingStep | null = null): RouteContext => ({ step, catalog })

describe('lengths', () => {
  it('reads digits, words and both units a grower might use', () => {
    expect(lengths('about 2.5 meters')).toEqual([2.5])
    expect(lengths('nothing taller than two meters')).toEqual([2])
    expect(lengths('8 feet')[0]).toBeCloseTo(2.4384, 3)
    expect(lengths('80cm')).toEqual([0.8])
  })

  it('keeps two numbers in the order they were said, which is what width by depth needs', () => {
    expect(lengths('my plot is 6 by 4 meters')).toEqual([6, 4])
  })

  it('finds nothing in a sentence with no number in it', () => {
    expect(lengths('quite big really')).toEqual([])
  })
})

describe('isNegated', () => {
  it('separates wanting from refusing, which is the whole like/dislike distinction', () => {
    expect(isNegated('i want tomatoes')).toBe(false)
    expect(isNegated('i do not want tomatoes')).toBe(true)
    expect(isNegated('i hate parsnips')).toBe(true)
    expect(isNegated('anything without onions')).toBe(true)
  })

  it("doesn't read a negator out of a longer word", () => {
    expect(isNegated('i want nothing else')).toBe(false)
    expect(isNegated('cantaloupe')).toBe(false)
  })
})

describe('routing a sentence', () => {
  it('says nothing rather than guessing at an empty or meaningless one', () => {
    expect(routeLexically('', at())).toBeNull()
    expect(routeLexically('   ', at())).toBeNull()
    expect(routeLexically('asdfgh qwerty', at())).toBeNull()
  })

  it('never claims an intent below the floor', () => {
    const routed = routeLexically('the quick brown fox', at())
    expect(routed === null || routed.confidence >= CONFIDENCE_FLOOR).toBe(true)
  })

  it('reads crops out of a sentence and marks whether they were wanted', () => {
    const wanted = routeLexically('i want to grow tomatoes', at())
    expect(wanted?.intent).toBe('like-crop')
    expect(wanted?.slots.crops).toContain('tomato')

    const refused = routeLexically('i do not want to grow tomatoes', at())
    expect(refused?.intent).toBe('dislike-crop')
    expect(refused?.slots.crops).toContain('tomato')
  })

  it('survives a misspelled crop, which is the reason the matcher is fuzzy at all', () => {
    const routed = routeLexically('can i have some tomatos', at())
    expect(routed?.slots.crops).toContain('tomato')
  })

  it('refuses an intent whose slot came back empty rather than acting on nothing', () => {
    // "in" scores against "i live in" and against nothing else. Without the slot check this
    // resolves to set-place and asks the geocoder about an empty string
    const routed = routeLexically('in', at())
    expect(routed?.intent).not.toBe('set-place')
  })

  it('takes the place name as whatever follows the lead-in', () => {
    const routed = routeLexically('i live in Amherst, Massachusetts', at('location'))
    expect(routed?.intent).toBe('set-place')
    expect(routed?.slots.place).toBe('Amherst, Massachusetts')
  })

  it('reads a plot as width then depth', () => {
    const routed = routeLexically('my plot is 6 by 4 meters', at('space'))
    expect(routed?.intent).toBe('set-space')
    expect(routed?.slots.widthM).toBe(6)
    expect(routed?.slots.depthM).toBe(4)
  })

  it('maps how people describe their surroundings onto the three exposures', () => {
    expect(routeLexically('there are big trees over it', at('surroundings'))?.slots.exposure).toBe(
      'overshadowed',
    )
    expect(routeLexically('nothing around it', at('surroundings'))?.slots.exposure).toBe('open')
  })

  it('answers a yes-or-no question either way', () => {
    expect(routeLexically('yes please', at('water'))?.slots.yesNo).toBe(true)
    expect(routeLexically('no, it is rain only', at('water'))?.slots.yesNo).toBe(false)
  })
})

describe('the question on screen', () => {
  /**
   * The bias exists for exactly this sentence. "About two meters" is a legitimate answer to the
   * height question and to the plot-size question, and the words alone can't separate them
   */
  it('reads an ambiguous number as an answer to the question being asked', () => {
    expect(routeLexically('about two meters', at('height'))?.intent).toBe('set-height')
    expect(routeLexically('about two meters', at('space'))?.intent).toBe('set-space')
  })

  it('lets a grower answer a different question from the one on screen', () => {
    const routed = routeLexically('actually i hate parsnips', at('height'))
    expect(routed?.intent).toBe('dislike-crop')
    expect(routed?.slots.crops).toContain('parsnip')
  })

  it("can't lift an intent that scored nothing over the floor", () => {
    expect(routeLexically('zzzz qqqq', at('height'))).toBeNull()
  })
})

describe('near misses', () => {
  it('offers something to tap when it understood nothing', () => {
    const offered = nearMisses('what about the shade', at())
    expect(offered.length).toBeGreaterThan(0)
    expect(offered.length).toBeLessThanOrEqual(3)
  })

  it('offers nothing at all for a sentence with no signal in it', () => {
    expect(nearMisses('zzzz', at())).toEqual([])
  })
})

describe('answering the question that was asked', () => {
  /**
   * The exchange the whole surface stands or falls on. The agent asks for a town, and a town isn't
   * a sentence about locating a garden: "Amherst, Massachusetts" scores 0.00 against every
   * exemplar in the table, and refusing the most likely first input anybody types is a dead end
   * on turn two
   */
  it('takes a bare place name as the answer to the question about the place', () => {
    const routed = routeLexically('Amherst, Massachusetts', at('location'))
    expect(routed?.intent).toBe('set-place')
    expect(routed?.slots.place).toBe('Amherst, Massachusetts')
  })

  it('takes the same words as nothing at all when nothing was asked', () => {
    expect(routeLexically('Amherst, Massachusetts', at(null))).toBeNull()
  })

  it('answers a bare fragment at the question it belongs to', () => {
    expect(routeLexically('salad', at('growing'))?.intent).toBe('set-ambition')
    expect(routeLexically('overhead', at('mounting'))?.intent).toBe('set-mounting')
    expect(routeLexically('trees on one side', at('surroundings'))?.intent).toBe('set-exposure')
  })

  /**
   * The narrowness that keeps this from being a catch-all: an intent whose slot this sentence
   * can't fill is dropped before the fallback ever sees it, so a question is never answered with
   * something that contains no answer
   */
  it('refuses a sentence with no answer in it, even standing on the question', () => {
    expect(routeLexically('zzzz qqqq', at('height'))).toBeNull()
    expect(routeLexically('zzzz qqqq', at('surroundings'))).toBeNull()
  })

  it('marks a fallback reading as the low-confidence one it is', () => {
    const routed = routeLexically('Amherst, Massachusetts', at('location'))
    expect(routed?.confidence).toBe(ANSWERING_SCORE)
    expect(routed?.confidence).toBeLessThan(CONFIDENCE_FLOOR)
  })

  it('still prefers a sentence that speaks for itself over the question on screen', () => {
    // said at the location step, and still a refusal of parsnips
    const routed = routeLexically('actually i hate parsnips', at('location'))
    expect(routed?.intent).toBe('dislike-crop')
  })
})

describe('the vocabulary an answer is drawn from', () => {
  /**
   * "half and half" is a verbatim entry in `OBJECTIVE` and appears nowhere in `set-objective`'s own
   * phrases, so on those phrases alone it scores 0.40 against `undo` and routes there, with the
   * evidence sitting unread in the table. Undo, of all the places to send somebody answering a
   * question about what they want from their garden
   */
  it('reads an answer that only the option list knows about', () => {
    expect(routeLexically('half and half', at('objective'))?.intent).toBe('set-objective')
    expect(routeLexically('half and half', at('objective'))?.slots.objective).toBe('balanced')
    expect(routeLexically('some of each', at('objective'))?.intent).toBe('set-objective')
  })

  /**
   * And only while that question is being asked. `AMBITION` legitimately contains crop names,
   * because "tomatoes" is how a fruiting ambition gets described. Counting that everywhere took
   * the corpus from 93% to 89%, by making every mention of a tomato outrank the intent to plant
   * one
   */
  it("doesn't let an option list speak for a question nobody asked", () => {
    expect(routeLexically('i want to grow tomatoes', at(null))?.intent).toBe('like-crop')
    expect(routeLexically('i want to grow tomatoes', at('water'))?.intent).toBe('like-crop')
  })

  it('still reads the same words as an ambition at the question about ambition', () => {
    expect(routeLexically('tomatoes', at('growing'))?.intent).toBe('set-ambition')
    expect(routeLexically('tomatoes', at('growing'))?.slots.ambition).toBe('fruiting-and-berries')
  })
})

describe('two readings that were both perfect', () => {
  /**
   * A one-word exemplar found inside a six-word sentence scores full marks, so "I want to help
   * the bees" matched `help` at 1.00 and `set-pollinators` at 1.00, and the table's order sent
   * somebody asking about bees to a page about what the agent can do. Only one of the two is an
   * account of the sentence
   */
  it('prefers the reading that explains more of what was said', () => {
    expect(routeLexically('i want to help the bees', at('pollinators'))?.intent).toBe(
      'set-pollinators',
    )
    expect(routeLexically('i want to help the bees', at(null))?.intent).toBe('set-pollinators')
  })

  it('still answers a bare cry for help with help', () => {
    expect(routeLexically('help', at(null))?.intent).toBe('help')
    expect(routeLexically('i am stuck', at(null))?.intent).toBe('help')
  })

  /**
   * "I have a hose" is an unambiguous yes to "can you water it in a dry spell" and contains
   * neither a yes nor a no. `set-water` matched it exactly and was then dropped for an unfilled
   * slot, so it went to `describe-garden`
   */
  it('reads an answer to a yes-or-no question that holds neither word', () => {
    const routed = routeLexically('i have a hose', at('water'))
    expect(routed?.intent).toBe('set-water')
    expect(routed?.slots.yesNo).toBe(true)
  })

  it('keeps the polarity when the same kind of sentence is a refusal', () => {
    const routed = routeLexically('no water out there', at('water'))
    expect(routed?.intent).toBe('set-water')
    expect(routed?.slots.yesNo).toBe(false)
  })

  it("doesn't turn every sentence at a yes-or-no question into a yes", () => {
    // nothing in this matches `set-water`'s own phrases, so there's no answer to take from it
    const routed = routeLexically('what have i got', at('water'))
    expect(routed?.intent).toBe('describe-garden')
  })
})

describe('the words a beginner actually types for a crop', () => {
  /**
   * The largest hole the router had, and one made by the catalog being RIGHT. There's no crop
   * called "onion": there's `onion-bulb`, named "bulb onion", and `scallion`. No "bean": bush,
   * pole, runner, fava and soy. No "pea": garden, cow, chick, field. Those are the commonest
   * words a beginner types and every one of them found nothing at all
   */
  it('finds every crop that answers to a word people use for a group of them', () => {
    const beans = routeLexically('i want beans', at(null))
    expect(beans?.intent).toBe('like-crop')
    expect(beans?.slots.crops.length).toBeGreaterThan(3)
    expect(beans?.slots.crops).toContain('bean-runner')

    const onions = routeLexically('i do not want onions', at(null))
    expect(onions?.intent).toBe('dislike-crop')
    expect(onions?.slots.crops).toContain('onion-bulb')
    expect(onions?.slots.crops).toContain('scallion')
  })

  it('reads plurals, which is how anybody would write them', () => {
    expect(routeLexically('potatoes', at(null))?.slots.crops).toContain('potato')
    expect(routeLexically('cabbages', at(null))?.slots.crops).toContain('cabbage')
    expect(routeLexically('i like tomatoes', at(null))?.slots.crops).toContain('tomato')
  })

  it('takes a bare crop name as a whole utterance, because on a phone it is one', () => {
    const routed = routeLexically('squash', at(null))
    expect(routed?.intent).toBe('like-crop')
    expect(routed?.slots.crops.length).toBeGreaterThan(1)
  })

  /**
   * Liking and disliking are one intent with a sign, and the sign is read off the sentence. It's
   * read both ways: "i want beans" scores fractionally better against `dislike-crop`'s "i do not
   * want" than against `like-crop`'s "i want to grow", and read one way only, the router would
   * record that the grower didn't want beans
   */
  it('never mistakes wanting a crop for refusing it', () => {
    for (const said of ['i want beans', 'can i have peas', 'i like tomatoes', 'add carrots']) {
      expect(routeLexically(said, at(null))?.intent, said).toBe('like-crop')
    }
    for (const said of ['i do not want beans', 'no peas', 'i hate parsnips']) {
      expect(routeLexically(said, at(null))?.intent, said).toBe('dislike-crop')
    }
  })

  /**
   * A crop found by name is a fact. A 0.37 phrase score is a coincidence. "Runner beans" reaches
   * exactly that against the exemplar "fruit and berries", on nothing but the bigrams "beans"
   * and "berries" share, and it cleared the floor
   */
  it('trusts a crop it can name over a phrase it merely resembles', () => {
    const routed = routeLexically('runner beans', at(null))
    expect(routed?.intent).toBe('like-crop')
    expect(routed?.slots.crops).toEqual(['bean-runner'])
  })
})

describe('an answer given before it was asked for', () => {
  /**
   * People volunteer things constantly, and it must cost them nothing. With a penalty of 0.8 on an
   * intent belonging to some other question, "6 by 4" said at the question about the PLACE scores
   * an honest 0.36, is cut to 0.29, falls below the floor, and lands in the location fallback,
   * which sends "6 by 4" to the geocoder and records whatever comes back as where the garden is
   */
  it("costs nothing to answer a question the agent hasn't got to yet", () => {
    const routed = routeLexically('6 by 4', at('location'))
    expect(routed?.intent).toBe('set-space')
    expect(routed?.slots.widthM).toBe(6)
    expect(routed?.slots.depthM).toBe(4)
  })

  it('reads other questions answered early, from wherever the agent happens to be', () => {
    expect(routeLexically('wide open', at('location'))?.intent).toBe('set-exposure')
    expect(routeLexically('i have a hose', at('growing'))?.intent).toBe('set-water')
    expect(routeLexically('overhead', at('space'))?.intent).toBe('set-mounting')
  })

  /**
   * And the fallback still catches what it's for. A place name resembles no exemplar, so it can
   * only be recognized by the question standing behind it
   */
  it('still takes a bare place name when nothing else fits', () => {
    expect(routeLexically('Amherst, Massachusetts', at('location'))?.intent).toBe('set-place')
  })
})

describe('a crop nobody named', () => {
  /**
   * "Salad" matches nothing in the table. The fuzzy pass over 163 crops reached mache: corn
   * salad, a real and perfectly reasonable nearest neighbor. The agent replied that it had
   * noted the grower would like mache. Nobody said mache, and recording a preference for a plant
   * somebody has never heard of is worse than admitting the sentence wasn't understood
   */
  it('never turns a resemblance into a preference', () => {
    // nothing is understood, and saying so is the right answer: the agent offers chips and the
    // grower tries again, which is a far better turn than being told they asked for mache
    expect(routeLexically('salad', at('natives'))).toBeNull()
  })

  it('still reads it as an ambition at the question that asks about one', () => {
    expect(routeLexically('salad', at('growing'))?.intent).toBe('set-ambition')
  })

  it('keeps taking a crop it can actually name', () => {
    expect(routeLexically('cabbages', at(null))?.slots.crops).toContain('cabbage')
  })
})

describe("a question isn't an instruction", () => {
  /**
   * The worst misroute this router ever produced: "how come theres no tomatoes" names a crop and
   * holds a negator, so it reached `dislike-crop` and the agent recorded that the grower would
   * rather not have tomatoes. They had asked why there were none
   */
  it('never records a preference from a question about one', () => {
    const routed = routeLexically('how come theres no tomatoes', at(null))
    expect(routed?.intent).not.toBe('dislike-crop')
    expect(routed?.intent).not.toBe('like-crop')
  })

  it("leaves a request wearing a question mark alone, because it's still a request", () => {
    // yes-or-no questions aren't filtered: "can I have some strawberries" does mean plant them
    expect(routeLexically('can i have some strawberries', at(null))?.intent).toBe('like-crop')
  })

  it('takes pleasantries as pleasantries rather than as a place name', () => {
    for (const said of ['hiya', 'thanks', 'ta', 'hello', 'cheers']) {
      expect(routeLexically(said, at('location'))?.intent, said).toBe('greeting')
    }
  })

  it("doesn't read a greeting out of a sentence that merely contains one of its words", () => {
    // "good morning" as an exemplar matched "the house blocks the morning sun", a sentence
    // about shade. Pleasantries are a closed word list and are matched no other way
    expect(routeLexically('the house blocks the morning sun', at('surroundings'))?.intent).toBe(
      'set-exposure',
    )
  })
})

describe('a request that might be destructive', () => {
  /**
   * "Delete my garden" scored 0.60 against `start-over`, below the bar that would act on it, and
   * the question about the PLACE then claimed it at 0.74, so a request to delete a garden was
   * sent to the geocoder and came back with a town. The catch-all stands down when something
   * destructive was nearly meant
   */
  it('is never quietly read as an answer to the question on screen', () => {
    for (const said of ['delete my garden', 'wipe all of this', 'get rid of everything']) {
      expect(routeLexically(said, at('location'))?.intent, said).not.toBe('set-place')
    }
  })

  it('is still carried out when it was asked for plainly', () => {
    expect(routeLexically('start over', at('location'))?.intent).toBe('start-over')
    expect(routeLexically('undo', at('location'))?.intent).toBe('undo')
  })

  /**
   * And it is OFFERED, which is what makes refusing acceptable. `nearMisses` scores destructive
   * intents even though `routeLexically` won't act on them, so the panel can put "Start over"
   * on a chip and let the visitor read the words and decide. One press is a clearer confirmation
   * than any dialog
   */
  it('comes back as something to press rather than nothing at all', () => {
    expect(nearMisses('delete my garden', at('location'))).toContain('start-over')
  })
})

describe('destructiveness is a spectrum', () => {
  /**
   * The floor was flat, and a held-out sentence found the gap. `undo` restores the plot from
   * before one generation. `start-over` forgets the design entirely and nothing brings it back.
   * "Scratch that", which any reader takes as undoing the last thing, reached `start-over`: the
   * two are close as sentences and nowhere near each other in what they cost
   */
  it('never escalates undoing the last thing into forgetting everything', () => {
    for (const said of ['scratch that', 'cancel that', 'that is not what i meant']) {
      expect(routeLexically(said, at(null))?.intent, said).not.toBe('start-over')
    }
  })

  it('still starts over when that is plainly what was asked', () => {
    for (const said of ['start over', 'start again', 'clear everything']) {
      expect(routeLexically(said, at(null))?.intent, said).toBe('start-over')
    }
  })

  it('keeps the ordinary destructive bar where it was', () => {
    expect(routeLexically('undo', at(null))?.intent).toBe('undo')
  })
})

/**
 * The measured baseline, in two halves, and having only the first half was itself a defect.
 *
 * `CORPUS` below is sentences that speak for themselves: "nothing taller than 2 meters", "i have a
 * hose". It measures the easier half of the problem, because it's not what people type. Once an
 * agent has asked a question, people answer in FRAGMENTS ("Amherst", "salad", "yes", "half and
 * half"), and the structural failures show up only there: a router with no idea which question is
 * on screen, a bare place name scoring 0.00 against every exemplar, "half and half" routing to
 * `undo`.
 *
 * So `REPLIES` exists, and it's the one that matters. A corpus of the wrong distribution is
 * worse than no corpus, because it reports a number and the number is reassuring
 */
const CORPUS: readonly {
  readonly said: string
  readonly step: OnboardingStep | null
  readonly want: IntentId
}[] = [
  { said: 'help', step: null, want: 'help' },
  { said: 'what can you do', step: null, want: 'help' },
  { said: 'what have i got', step: null, want: 'describe-garden' },
  { said: 'describe my garden', step: null, want: 'describe-garden' },
  { said: 'summarize the design', step: null, want: 'describe-garden' },
  { said: 'why not', step: null, want: 'explain' },
  { said: 'why is that there', step: null, want: 'explain' },
  { said: 'where does that number come from', step: null, want: 'explain' },
  { said: 'what can i grow', step: null, want: 'list-crops' },
  { said: 'what grows here', step: null, want: 'list-crops' },
  { said: 'show me the crops', step: null, want: 'list-crops' },
  { said: 'i live in Amherst', step: 'location', want: 'set-place' },
  { said: 'my garden is in Vermont', step: 'location', want: 'set-place' },
  { said: 'my plot is 6 by 4 meters', step: 'space', want: 'set-space' },
  { said: 'the space is 10 by 8', step: 'space', want: 'set-space' },
  { said: 'there are trees around it', step: 'surroundings', want: 'set-exposure' },
  { said: 'it is wide open', step: 'surroundings', want: 'set-exposure' },
  { said: 'a wall on one side', step: 'surroundings', want: 'set-exposure' },
  { said: 'i want to grow salad', step: 'growing', want: 'set-ambition' },
  { said: 'mostly leaves and herbs', step: 'growing', want: 'set-ambition' },
  { said: 'i want to help the bees', step: 'pollinators', want: 'set-pollinators' },
  { said: 'native plants please', step: 'natives', want: 'set-natives' },
  { said: 'mostly food', step: 'objective', want: 'set-objective' },
  { said: 'a bit of both', step: 'objective', want: 'set-objective' },
  { said: 'as much power as possible', step: 'objective', want: 'set-objective' },
  { said: 'panels overhead', step: 'mounting', want: 'set-mounting' },
  { said: 'upright like a fence', step: 'mounting', want: 'set-mounting' },
  { said: 'nothing taller than 2 meters', step: 'height', want: 'set-height' },
  { said: 'there is no height limit', step: 'height', want: 'set-height' },
  { said: 'i have a hose', step: 'water', want: 'set-water' },
  { said: 'no water out there', step: 'water', want: 'set-water' },
  { said: 'i want to grow tomatoes', step: null, want: 'like-crop' },
  { said: 'can i have some strawberries', step: null, want: 'like-crop' },
  { said: 'i do not want onions', step: null, want: 'dislike-crop' },
  { said: 'i hate parsnips', step: null, want: 'dislike-crop' },
  { said: 'design it for me', step: 'results', want: 'propose-designs' },
  { said: 'what would you suggest', step: 'results', want: 'propose-designs' },
  { said: 'make me a garden', step: 'results', want: 'propose-designs' },
  { said: 'use that one', step: 'results', want: 'apply-design' },
  { said: 'fill the beds', step: 'planting', want: 'plan-planting' },
  { said: 'what should go where', step: 'planting', want: 'plan-planting' },
  { said: 'undo', step: null, want: 'undo' },
  { said: 'i did not mean that', step: null, want: 'undo' },
  { said: 'show me the questions', step: null, want: 'show-the-form' },
  { said: 'let me do it myself', step: null, want: 'show-the-form' },
]

describe('measured accuracy on the corpus', () => {
  const outcome = (): { readonly hits: number; readonly misses: readonly string[] } => {
    const misses: string[] = []
    let hits = 0
    for (const line of CORPUS) {
      const routed = routeLexically(line.said, at(line.step))
      if (routed?.intent === line.want) hits += 1
      else misses.push(`"${line.said}" wanted ${line.want}, got ${routed?.intent ?? 'nothing'}`)
    }
    return { hits, misses }
  }

  it('routes most of what a grower would actually type', () => {
    const { hits, misses } = outcome()
    const accuracy = hits / CORPUS.length
    // recorded here, loosely: this is the number the embedding understander has
    // to beat, and it's printed on failure so a regression names the sentences it broke
    console.log(
      `lexical corpus accuracy: ${(accuracy * 100).toFixed(0)}% (${String(hits)}/${String(CORPUS.length)})`,
    )
    if (accuracy < 0.95) throw new Error(`accuracy ${accuracy.toFixed(2)}\n${misses.join('\n')}`)
    expect(accuracy).toBeGreaterThanOrEqual(0.95)
  })

  it("never routes a corpus line to a destructive intent it didn't ask for", () => {
    for (const line of CORPUS) {
      const routed = routeLexically(line.said, at(line.step))
      if (routed === null) continue
      if (line.want === 'undo') continue
      expect(routed.intent).not.toBe('undo')
    }
  })
})

/**
 * What somebody types once a question has been asked, which is fragments.
 *
 * Every line is paired with the step the agent would be standing on when it arrives, because that
 * is half of what makes a fragment meaningful: "2 meters" is an answer about height or about the
 * plot depending only on what was asked, and "yes" has no content of its own at all
 */
const REPLIES: readonly {
  readonly said: string
  readonly step: OnboardingStep | null
  readonly want: IntentId
}[] = [
  { said: 'Amherst, Massachusetts', step: 'location', want: 'set-place' },
  { said: 'Amherst', step: 'location', want: 'set-place' },
  { said: 'Burlington, Vermont', step: 'location', want: 'set-place' },
  { said: 'London', step: 'location', want: 'set-place' },
  { said: '6 by 4', step: 'space', want: 'set-space' },
  { said: 'about 10 by 8 meters', step: 'space', want: 'set-space' },
  { said: '20 feet by 15', step: 'space', want: 'set-space' },
  { said: 'trees on one side', step: 'surroundings', want: 'set-exposure' },
  { said: 'nothing', step: 'surroundings', want: 'set-exposure' },
  { said: 'wide open', step: 'surroundings', want: 'set-exposure' },
  { said: 'very shady', step: 'surroundings', want: 'set-exposure' },
  { said: 'a fence on one side', step: 'surroundings', want: 'set-exposure' },
  { said: 'salad', step: 'growing', want: 'set-ambition' },
  { said: 'tomatoes', step: 'growing', want: 'set-ambition' },
  { said: 'a bit of everything', step: 'growing', want: 'set-ambition' },
  { said: 'herbs', step: 'growing', want: 'set-ambition' },
  { said: 'yes', step: 'natives', want: 'set-natives' },
  { said: 'no', step: 'natives', want: 'set-natives' },
  { said: 'not really', step: 'natives', want: 'set-natives' },
  { said: 'yes please', step: 'pollinators', want: 'set-pollinators' },
  { said: 'sure', step: 'pollinators', want: 'set-pollinators' },
  { said: 'half and half', step: 'objective', want: 'set-objective' },
  { said: 'mostly food', step: 'objective', want: 'set-objective' },
  { said: 'i do not mind', step: 'objective', want: 'set-objective' },
  { said: 'overhead', step: 'mounting', want: 'set-mounting' },
  { said: 'on the ground', step: 'mounting', want: 'set-mounting' },
  { said: 'upright', step: 'mounting', want: 'set-mounting' },
  { said: 'you choose', step: 'mounting', want: 'set-mounting' },
  { said: '2 meters', step: 'height', want: 'set-height' },
  { said: 'no limit', step: 'height', want: 'set-height' },
  { said: '8 feet', step: 'height', want: 'set-height' },
  { said: 'yes', step: 'water', want: 'set-water' },
  { said: 'i have a hose', step: 'water', want: 'set-water' },
  { said: 'no water out there', step: 'water', want: 'set-water' },
  { said: 'rain only', step: 'water', want: 'set-water' },
  { said: 'go on then', step: 'results', want: 'propose-designs' },
  // and the things said out of turn, which a guided path has to survive being interrupted by
  { said: 'i want beans', step: 'height', want: 'like-crop' },
  { said: 'no onions', step: 'water', want: 'dislike-crop' },
  { said: 'what have i got', step: 'growing', want: 'describe-garden' },
  { said: 'undo', step: 'mounting', want: 'undo' },
]

describe('measured accuracy on replies to a question', () => {
  it('routes what a person types once they have been asked something', () => {
    const misses: string[] = []
    let hits = 0
    for (const line of REPLIES) {
      const routed = routeLexically(line.said, at(line.step))
      if (routed?.intent === line.want) hits += 1
      else
        misses.push(
          `"${line.said}" (${line.step ?? 'no step'}) wanted ${line.want}, got ${routed?.intent ?? 'nothing'}`,
        )
    }
    const accuracy = hits / REPLIES.length
    console.log(
      `conversational accuracy: ${(accuracy * 100).toFixed(0)}% (${String(hits)}/${String(REPLIES.length)})`,
    )
    if (accuracy < 0.95) throw new Error(`accuracy ${accuracy.toFixed(2)}\n${misses.join('\n')}`)
    expect(accuracy).toBeGreaterThanOrEqual(0.95)
  })

  /**
   * Bare replies route markedly worse when the router isn't told which question is on screen, as
   * happens when a panel passes null for the step. Held here so that regressing it fails loudly
   */
  it("is markedly worse when it doesn't know what it asked, which is the point", () => {
    const score = (withStep: boolean): number => {
      let hits = 0
      for (const line of REPLIES) {
        const routed = routeLexically(line.said, at(withStep ? line.step : null))
        if (routed?.intent === line.want) hits += 1
      }
      return hits / REPLIES.length
    }
    const knowing = score(true)
    const blind = score(false)
    console.log(
      `  knowing the question: ${(knowing * 100).toFixed(0)}%, blind: ${(blind * 100).toFixed(0)}%`,
    )
    expect(knowing).toBeGreaterThan(blind + 0.15)
  })
})
