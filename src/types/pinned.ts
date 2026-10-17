import type { CitationId } from './citation-ids.generated'

/**
 * Where a number the app reads came from. Held in one place so no constant can drift from the
 * paper it was read out of without a test failing: `rain.test.ts` and `pinned-figures.test.ts`
 * read `docs/CITATIONS.csl.json` and hold every `citation` and `quote` here against that entry's
 * own claim text
 */
export interface Provenance {
  /**
   * The citation whose `backsClaims` or `quotes` carry this number, from `docs/CITATIONS.csl.json`
   */
  readonly citation: CitationId
  /** Where in that source, spelled the way the citation's own claim spells it */
  readonly locator: string
  /** The words the citation uses for it, so a test can hold the two together */
  readonly quote: string
}

/** One number read from a source, with the source's own words for it */
export interface PinnedNumber extends Provenance {
  readonly value: number
  /**
   * How the source writes the value inside `quote`, where `String(value)` isn't how it appears:
   * `20%` for a ceiling of 0.2
   */
  readonly spelled?: string
}

/**
 * One number this app arrives at itself, with no source behind it. A separate shape from
 * `PinnedNumber` so a derived number can never be read as a sourced one
 */
export interface DerivedNumber {
  readonly value: number
  /** How this app arrives at the number, and what the sources leave open */
  readonly derivation: string
}
