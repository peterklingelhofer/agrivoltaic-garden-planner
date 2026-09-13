import { normalise, tokens } from './text'

/**
 * One sentence, split into the things it actually asks for.
 *
 * The router reads a sentence and returns one intent, which is right for almost everything people
 * type and wrong for the shape that separates an agent from a search box: "take out the tomatoes
 * and give me something for the shade" is two requests, and answering the first while silently
 * dropping the second is worse than not understanding either, because it looks like it worked.
 *
 * Splitting is deliberately conservative. A conjunction is far more often part of ONE request
 * than a join between two -- "tomatoes and courgettes" is a list, "a bit of both" is an answer,
 * "salt and pepper" would be a crop if this catalogue had it -- so a bare "and" only splits when
 * both halves stand up as requests on their own. The strong separators do not need that test,
 * because nobody writes "then" in the middle of a noun phrase
 */

/** Joins that are a boundary wherever they appear: nobody writes these inside one request */
const STRONG = [' and then ', ' then ', ' after that ', ' also ', ' as well as that ']

/** And the weak one, which splits only when both halves are requests in their own right */
const WEAK = ' and '

/**
 * The shortest a clause may be, in words.
 *
 * Two, because a one-word half is almost always part of the phrase it was cut out of: splitting
 * "a bit of both" at its "and"-less seam is not possible, but "salt and pepper" would leave
 * "salt", and a single word on one side of a conjunction is the signature of a list rather than
 * of a second request
 */
export const MIN_CLAUSE_WORDS = 2

const trim = (part: string): string =>
  part
    .trim()
    .replace(/^[,;]+|[,;]+$/g, '')
    .trim()

const splitOn = (text: string, separator: string): readonly string[] => {
  const padded = ` ${text} `
  const at = padded.toLowerCase().indexOf(separator)
  if (at < 0) return [text]
  return [trim(padded.slice(0, at)), trim(padded.slice(at + separator.length))].filter(
    (part) => part !== '',
  )
}

/**
 * Split on the separators that always mean a boundary, recursively, so three requests come back
 * as three
 */
const strongClauses = (text: string): readonly string[] => {
  for (const separator of [...STRONG, '; ']) {
    const parts = splitOn(text, separator)
    if (parts.length > 1) return parts.flatMap(strongClauses)
  }
  return [text]
}

export interface ClauseOptions {
  /**
   * Whether a half stands up as a request on its own, which is what a bare "and" is tested
   * against. Injected because the only thing that knows is the router, and `src/agent/clauses.ts`
   * must not depend on it: the split has to be testable without a catalogue
   */
  readonly standsAlone: (part: string) => boolean
}

export const clausesOf = (text: string, options: ClauseOptions): readonly string[] => {
  const strong = strongClauses(normalise(text) === '' ? '' : text.trim()).filter(
    (part) => part !== '',
  )
  return strong.flatMap((part) => {
    const halves = splitOn(part, WEAK)
    if (halves.length < 2) return [part]
    const long = halves.every((half) => tokens(half).length >= MIN_CLAUSE_WORDS)
    // both halves have to be requests, or this was a list and cutting it destroys the meaning
    return long && halves.every(options.standsAlone) ? halves : [part]
  })
}
