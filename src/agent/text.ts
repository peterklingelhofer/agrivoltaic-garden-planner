/**
 * The one string-matching algorithm the agent has, shared by everything that has to decide what
 * a typed sentence meant.
 *
 * There is deliberately only one. Intent matching, crop matching and answer-option matching are
 * the same problem at three scales -- score a phrase against a list of known phrases and take the
 * best -- and giving each its own heuristic is how a router acquires three different personalities
 * and three different bugs. What varies between them is the vocabulary and the threshold, both of
 * which are arguments
 */

/**
 * Lowercase, strip accents, drop everything that is not a letter, a digit or a space.
 *
 * The accent strip is not decoration: the catalogue's `commonNames` carry real ones (courgette
 * is fine, but `mâche` and `piña` are in there), and a grower typing on a phone keyboard will
 * not reproduce them. Normalising both sides means the match never depends on who has a
 * long-press keyboard
 */
export const normalise = (text: string): string =>
  text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

export const tokens = (text: string): readonly string[] => {
  const cleaned = normalise(text)
  return cleaned === '' ? [] : cleaned.split(' ')
}

/**
 * Character bigrams of a normalised string, spaces included.
 *
 * Bigrams rather than whole tokens because the errors this has to survive are typing errors:
 * "tomatos", "corgette", "brocolli". Whole-token equality scores all three as no match at all,
 * which is precisely the moment a novice decides the thing does not work. A short string yields
 * no bigrams at all, so it is carried as itself and compared whole
 */
export const bigrams = (text: string): readonly string[] => {
  const cleaned = normalise(text)
  if (cleaned.length < 2) return cleaned === '' ? [] : [cleaned]
  const pairs: string[] = []
  for (let i = 0; i < cleaned.length - 1; i += 1) pairs.push(cleaned.slice(i, i + 2))
  return pairs
}

/**
 * Sorensen-Dice over character bigrams, in 0..1.
 *
 * Dice and not Levenshtein for one practical reason: it is length-normalised, so "beans" against
 * "runner bean" scores on what the two share rather than being punished for the seven characters
 * one of them has spare. Length-punishing a partial name is wrong here, because a partial name is
 * what people actually type
 */
export const similarity = (a: string, b: string): number => {
  const left = bigrams(a)
  const right = bigrams(b)
  if (left.length === 0 || right.length === 0) return 0
  const pool = new Map<string, number>()
  for (const pair of left) pool.set(pair, (pool.get(pair) ?? 0) + 1)
  let shared = 0
  for (const pair of right) {
    const held = pool.get(pair) ?? 0
    if (held > 0) {
      shared += 1
      pool.set(pair, held - 1)
    }
  }
  return (2 * shared) / (left.length + right.length)
}

/**
 * The best score any part of `query` reaches against one phrase.
 *
 * Whole-sentence Dice is wrong in a way that only shows up on real sentences. "Can I have some
 * tomatos" against "tomato" scores 0.42, because the twenty characters of politeness around the
 * crop name count against it; the same comparison against just the word scores 0.92. A router built
 * on the whole-sentence number understands people who type single words and nobody else, which is
 * the opposite of the population it is for.
 *
 * So a phrase is scored against the best WINDOW of the query near its own length, as well as
 * against the whole thing. The window sweep is what lets a short phrase be found inside a long
 * sentence; keeping the whole-sentence score in the maximum is what stops a long phrase being
 * beaten by an accidental two-word overlap
 */
export const phraseScore = (query: string, phrase: string): number => {
  const words = tokens(query)
  const target = tokens(phrase)
  if (words.length === 0 || target.length === 0) return 0
  let best = similarity(query, phrase)
  const sizes = new Set([target.length - 1, target.length, target.length + 1])
  for (const size of sizes) {
    if (size < 1 || size > words.length) continue
    for (let start = 0; start + size <= words.length; start += 1) {
      const window = words.slice(start, start + size).join(' ')
      const score = similarity(window, phrase)
      if (score > best) best = score
    }
  }
  return best
}

export interface Match<T> {
  readonly value: T
  readonly score: number
  /** Which of the candidate's phrases won, so a caller can say what it thought was said */
  readonly matched: string
}

/**
 * The best of a set of candidates, each of which answers to several phrases, or null.
 *
 * A candidate scores as its BEST phrase rather than its average, because the phrases are
 * alternative ways of saying one thing and being unlike the other four is not evidence against
 * the one that fits. Ties resolve to the first candidate in the list, which makes the order of
 * `INTENTS` a real tie-break the table can be written to exploit rather than an accident
 */
export const bestMatch = <T>(
  query: string,
  candidates: readonly { readonly value: T; readonly phrases: readonly string[] }[],
  floor: number,
): Match<T> | null => {
  let best: Match<T> | null = null
  for (const candidate of candidates) {
    for (const phrase of candidate.phrases) {
      const score = phraseScore(query, phrase)
      /*
        Ties go to the LONGER phrase, which matters more than it looks. `set-pollinators` answers to
        both "bees" and "i want to help the bees", and a one-word phrase found inside a sentence
        scores full marks, so both hit 1.00. If the first one won, the intent would report that it
        had matched "bees" (four characters, exactly as many as `help`'s own exemplar), and the
        tie-break one level up, which prefers whichever reading explains more of what was said,
        would have nothing left to work with. The two rules are the same rule
      */
      const better =
        score > (best?.score ?? 0) ||
        (best !== null && score === best.score && phrase.length > best.matched.length)
      if (better) best = { value: candidate.value, score, matched: phrase }
    }
  }
  return best !== null && best.score >= floor ? best : null
}

/**
 * Every phrase in `candidates` that the query CONTAINS, longest first.
 *
 * This is the other half of matching and it is not the same job as `bestMatch`. "I want tomatoes
 * and beans" names two crops, and a single best match answers with one of them and silently
 * discards the other, which reads to the user as the agent ignoring half of what they said.
 * Longest first so that "runner bean" wins its span before "bean" can claim it, and so a span
 * already claimed is not offered twice
 */
export const containedPhrases = <T>(
  query: string,
  candidates: readonly { readonly value: T; readonly phrases: readonly string[] }[],
): readonly Match<T>[] => {
  const haystack = ` ${normalise(query)} `
  const found: Match<T>[] = []
  const entries = candidates
    .flatMap((candidate) => candidate.phrases.map((phrase) => ({ value: candidate.value, phrase })))
    .map((entry) => ({ ...entry, needle: ` ${normalise(entry.phrase)} ` }))
    .filter((entry) => entry.needle.trim() !== '')
    .sort((a, b) => b.needle.length - a.needle.length)
  const claimed: { readonly from: number; readonly to: number }[] = []
  const overlaps = (from: number, to: number): boolean =>
    claimed.some((span) => from < span.to && span.from < to)
  for (const entry of entries) {
    const index = haystack.indexOf(entry.needle)
    if (index < 0) continue
    const to = index + entry.needle.length
    if (overlaps(index, to)) continue
    claimed.push({ from: index, to })
    found.push({ value: entry.value, score: 1, matched: entry.phrase })
  }
  return found
}
