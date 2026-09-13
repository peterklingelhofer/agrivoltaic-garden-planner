import { describe, expect, it } from 'bun:test'
import { bestMatch, bigrams, containedPhrases, normalise, similarity, tokens } from './text'

describe('normalise', () => {
  it('folds case, accents and punctuation so a phone keyboard matches the catalogue', () => {
    expect(normalise('Mâche')).toBe('mache')
    expect(normalise('Piña!')).toBe('pina')
    expect(normalise("  Tomato's,  really ")).toBe('tomato s really')
  })

  it('is empty for a string with nothing matchable in it', () => {
    expect(normalise('!!! ???')).toBe('')
    expect(tokens('!!!')).toEqual([])
  })
})

describe('bigrams', () => {
  it('carries a one-character string whole rather than yielding nothing', () => {
    expect(bigrams('a')).toEqual(['a'])
    expect(bigrams('')).toEqual([])
  })

  it('slides one character at a time, spaces included', () => {
    expect(bigrams('ab c')).toEqual(['ab', 'b ', ' c'])
  })
})

describe('similarity', () => {
  it('is 1 for the same string and 0 for nothing in common', () => {
    expect(similarity('tomato', 'tomato')).toBe(1)
    expect(similarity('tomato', '')).toBe(0)
  })

  it('survives the typing errors it exists for', () => {
    expect(similarity('tomatos', 'tomato')).toBeGreaterThan(0.7)
    expect(similarity('corgette', 'courgette')).toBeGreaterThan(0.7)
    expect(similarity('brocolli', 'broccoli')).toBeGreaterThan(0.7)
  })

  it('does not punish a partial name for the words it is missing', () => {
    // Levenshtein would score this far lower; that is the reason for Dice
    expect(similarity('beans', 'runner bean')).toBeGreaterThan(0.4)
  })

  it('counts a repeated bigram once per occurrence rather than once per string', () => {
    // 'aa' appears twice on the left and once on the right, so exactly one can be shared
    expect(similarity('aaa', 'aa')).toBeCloseTo((2 * 1) / (2 + 1), 6)
  })
})

describe('bestMatch', () => {
  const candidates = [
    { value: 'a', phrases: ['mostly food', 'food first'] },
    { value: 'b', phrases: ['mostly electricity'] },
  ]

  it('scores a candidate as its best phrase, not its average', () => {
    const hit = bestMatch('food first', candidates, 0.3)
    expect(hit?.value).toBe('a')
    expect(hit?.matched).toBe('food first')
  })

  it('takes the longer phrase when two of a candidate own phrases both fit', () => {
    // a one-word phrase found inside a sentence scores full marks, so both of these hit 1.00, and
    // letting the shorter one win would leave the caller nothing to break a tie on
    const bees = [{ value: 'p', phrases: ['bees', 'i want to help the bees'] }]
    expect(bestMatch('i want to help the bees', bees, 0.3)?.matched).toBe('i want to help the bees')
  })

  it('returns null below the floor rather than the least bad answer', () => {
    expect(bestMatch('the weather in june', candidates, 0.6)).toBeNull()
  })
})

describe('containedPhrases', () => {
  const candidates = [
    { value: 'runner-bean', phrases: ['runner bean'] },
    { value: 'broad-bean', phrases: ['broad bean'] },
    { value: 'bean', phrases: ['bean'] },
    { value: 'tomato', phrases: ['tomato'] },
  ]

  it('finds every phrase in a sentence, not just the first', () => {
    const found = containedPhrases('i want tomato and broad bean', candidates)
    expect(found.map((hit) => hit.value).sort()).toEqual(['broad-bean', 'tomato'])
  })

  it('lets the longest phrase claim its span so a substring cannot steal it', () => {
    const found = containedPhrases('some runner bean please', candidates)
    expect(found.map((hit) => hit.value)).toEqual(['runner-bean'])
  })

  it('finds nothing in a sentence that names nothing', () => {
    expect(containedPhrases('what should i do', candidates)).toEqual([])
  })
})
